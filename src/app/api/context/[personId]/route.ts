/**
 * API Route — Contexte complet d'un contact (Blob Storage)
 * GET : récupère personne, organisation, deals, notes, historique activités
 */

import { NextResponse } from "next/server";
import {
  getPerson,
  getOrganization,
  getDeals,
  getActivitiesForPerson,
  getNotesForPerson,
  getNotesForDeal,
} from "@/lib/blob-store";

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

    const person = await getPerson(pid);
    if (!person) {
      return NextResponse.json({ error: "Contact non trouvé" }, { status: 404 });
    }

    // Fetch org
    const org = person.org_id ? await getOrganization(person.org_id) : null;

    // Fetch deals for this person
    const allDeals = await getDeals();
    const deals = allDeals.filter(
      (d) => d.person_id === pid || (d.participants && d.participants.includes(pid))
    );

    // Fetch activities and notes for this person
    const [activities, personNotes] = await Promise.all([
      getActivitiesForPerson(pid),
      getNotesForPerson(pid),
    ]);

    // Get notes for each deal
    const dealNotes: Record<number, { id: number; content: string }[]> = {};
    for (const deal of deals.slice(0, 10)) {
      const notes = await getNotesForDeal(deal.id);
      dealNotes[deal.id] = notes;
    }

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
