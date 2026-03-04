/**
 * API Route — Contexte d'une affaire (deal) (Blob Storage)
 * GET : récupère activités (pending/done) + notes du deal
 */

import { NextResponse } from "next/server";
import { getActivities, getActivitiesForDeal, getNotesForDeal } from "@/lib/blob-store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const dealId = Number(id);

    if (!dealId || isNaN(dealId)) {
      return NextResponse.json({ error: "dealId invalide" }, { status: 400 });
    }

    const [activities, allActivities, notes] = await Promise.all([
      getActivitiesForDeal(dealId),
      getActivities(),
      getNotesForDeal(dealId),
    ]);

    const pending = activities.filter((a) => !a.done);
    const done = activities.filter((a) => a.done);

    // Debug: log what we find
    const sampleDealIds = [...new Set(allActivities.map((a) => a.deal_id))].slice(0, 10);
    console.log(`[Context] dealId=${dealId}, totalActivities=${allActivities.length}, matchingActivities=${activities.length}, sampleDealIds=${JSON.stringify(sampleDealIds)}`);

    return NextResponse.json({
      data: {
        activities: { pending, done },
        notes,
      },
      debug: {
        requestedDealId: dealId,
        totalActivitiesInBlob: allActivities.length,
        matchingActivities: activities.length,
        matchingNotes: notes.length,
        sampleActivityDealIds: sampleDealIds,
      },
    });
  } catch (error) {
    console.error("GET /api/deals/[id]/context error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
