/**
 * API Route — Contexte complet d'un contact Pipedrive
 * GET : récupère personne, organisation, deals, notes, historique activités
 */

import { NextResponse } from "next/server";
import {
  getPerson,
  getOrganization,
  getPersonDeals,
  getPersonActivities,
  getPersonNotes,
  getNotesForDeal,
} from "@/lib/pipedrive";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ personId: string }> }
) {
  try {
    const { personId } = await params;
    const pid = Number(personId);

    if (!pid || isNaN(pid)) {
      return NextResponse.json({ error: "personId invalide" }, { status: 400 });
    }

    // Récupérer le contact
    const person = await getPerson(pid);
    if (!person) {
      return NextResponse.json({ error: "Contact non trouvé" }, { status: 404 });
    }

    // Récupérer org, deals, activités, notes en parallèle
    const [org, deals, activities, personNotes] = await Promise.all([
      person.org_id ? getOrganization(person.org_id) : null,
      getPersonDeals(pid),
      getPersonActivities(pid),
      getPersonNotes(pid),
    ]);

    // Récupérer les notes de chaque deal aussi
    const dealNotes: Record<number, { id: number; content: string }[]> = {};
    if (deals.length > 0) {
      const notePromises = deals.slice(0, 10).map(async (deal) => {
        const notes = await getNotesForDeal(deal.id);
        return { dealId: deal.id, notes };
      });
      const results = await Promise.all(notePromises);
      for (const r of results) {
        dealNotes[r.dealId] = r.notes;
      }
    }

    // Séparer activités faites / non faites
    const doneActivities = activities.filter((a) => a.done);
    const pendingActivities = activities.filter((a) => !a.done);

    return NextResponse.json({
      data: {
        person,
        organization: org,
        deals,
        activities: {
          pending: pendingActivities,
          done: doneActivities,
        },
        notes: personNotes,
        dealNotes,
      },
    });
  } catch (error) {
    console.error("GET /api/context/[personId] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
