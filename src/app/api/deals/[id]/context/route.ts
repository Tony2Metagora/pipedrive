/**
 * API Route — Contexte d'une affaire (deal)
 * GET : récupère activités (pending/done) + notes du deal
 */

import { NextResponse } from "next/server";
import { getActivitiesForDeal, getNotesForDeal } from "@/lib/pipedrive";

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

    const [activities, notes] = await Promise.all([
      getActivitiesForDeal(dealId),
      getNotesForDeal(dealId),
    ]);

    const pending = activities.filter((a) => !a.done);
    const done = activities.filter((a) => a.done);

    return NextResponse.json({
      data: {
        activities: { pending, done },
        notes,
      },
    });
  } catch (error) {
    console.error("GET /api/deals/[id]/context error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
