/**
 * API Route — Lier un prospect à une affaire ou créer une nouvelle affaire
 * POST { prospectId, dealId? }
 *   - Si dealId fourni : ajoute le prospect comme participant du deal
 *   - Sinon : crée un nouveau deal avec le prospect comme contact principal
 */

import { NextResponse } from "next/server";
import {
  getDeals,
  getPersons,
  createDeal,
  createPerson,
  updateDeal,
  type Person,
} from "@/lib/blob-store";
import { get } from "@vercel/blob";

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
  try {
    const result = await get("prospects.json", { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) return [];
    const chunks: Uint8Array[] = [];
    const reader = result.stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const text = new TextDecoder().decode(
      chunks.reduce((acc, chunk) => {
        const merged = new Uint8Array(acc.length + chunk.length);
        merged.set(acc);
        merged.set(chunk, acc.length);
        return merged;
      }, new Uint8Array())
    );
    return JSON.parse(text);
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
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
      // Link prospect to existing deal
      const deals = await getDeals();
      const deal = deals.find((d) => d.id === Number(dealId));
      if (!deal) {
        return NextResponse.json({ error: "Affaire non trouvée" }, { status: 404 });
      }

      // Update deal to reference this person if not already
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
