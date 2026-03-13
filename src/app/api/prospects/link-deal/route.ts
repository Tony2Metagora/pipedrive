/**
 * API Route — Lier un prospect à une affaire ou créer une nouvelle affaire
 * POST { prospectId, dealId? }
 *   - Si dealId fourni : ajoute le prospect comme participant du deal
 *   - Sinon : crée un nouveau deal avec le prospect comme contact principal
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import {
  getDeals,
  getPersons,
  createDeal,
  createPerson,
  updateDeal,
  addDealParticipant,
  readBlob,
  type Person,
} from "@/lib/blob-store";

interface ProspectRow {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  poste: string;
  entreprise: string;
  statut: string;
  pipelines: string;
  notes: string;
}

async function readProspects(): Promise<ProspectRow[]> {
  return readBlob<ProspectRow>("prospects.json");
}

export async function POST(request: Request) {
  const guard = await requireAuth("prospects", "POST");
  if (guard.denied) return guard.denied;
  try {
    const body = await request.json();
    const { prospectId, dealId, dealTitle } = body;

    if (!prospectId) {
      return NextResponse.json({ error: "prospectId requis" }, { status: 400 });
    }

    // Find the prospect
    const prospects = await readProspects();
    const prospect = prospects.find((p) => String(p.id) === String(prospectId));
    if (!prospect) {
      return NextResponse.json({ error: "Prospect non trouvé" }, { status: 404 });
    }

    // Find or create a person for this prospect
    const persons = await getPersons();
    let person: Person | undefined;

    if (prospect.email) {
      person = persons.find((p) =>
        p.email.some((e) => e.value.toLowerCase().trim() === prospect.email.toLowerCase().trim())
      );
    }

    if (!person) {
      // Create a new person
      person = await createPerson({
        name: `${prospect.prenom} ${prospect.nom}`.trim(),
        email: prospect.email ? [{ value: prospect.email, primary: true }] : [],
        phone: prospect.telephone ? [{ value: prospect.telephone, primary: true }] : [],
        org_id: null,
        job_title: prospect.poste || undefined,
      });
    }

    if (dealId) {
      // Link prospect to existing deal as participant (secondary contact)
      const deals = await getDeals();
      const deal = deals.find((d) => d.id === Number(dealId));
      if (!deal) {
        return NextResponse.json({ error: "Affaire non trouvée" }, { status: 404 });
      }

      // Add as participant (secondary contact)
      await addDealParticipant(deal.id, person.id);

      // If deal has no primary contact, set this person as primary
      if (!deal.person_id) {
        await updateDeal(deal.id, {
          person_id: person.id,
          person_name: person.name,
        });
      }

      return NextResponse.json({
        success: true,
        action: "linked",
        deal: { id: deal.id, title: deal.title },
        person: { id: person.id, name: person.name },
      });
    } else {
      // Create a new deal
      const title = dealTitle || `${prospect.entreprise || prospect.prenom + " " + prospect.nom}`;
      const newDeal = await createDeal({
        title,
        person_id: person.id,
        org_id: null,
        pipeline_id: 1,
        stage_id: 1,
        value: 0,
        currency: "EUR",
        status: "open",
        person_name: person.name,
        org_name: prospect.entreprise || "",
      });

      return NextResponse.json({
        success: true,
        action: "created",
        deal: { id: newDeal.id, title: newDeal.title },
        person: { id: person.id, name: person.name },
      });
    }
  } catch (error) {
    console.error("POST /api/prospects/link-deal error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
