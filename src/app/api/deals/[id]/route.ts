/**
 * API Route — Deal par ID (Blob Storage)
 * GET : récupérer un deal + contacts + activités + notes
 * PUT : mettre à jour un deal
 */

import { NextResponse } from "next/server";
import {
  getDeal,
  updateDeal,
  getPerson,
  getActivitiesForDeal,
  getNotesForDeal,
} from "@/lib/blob-store";
import { requireAuth } from "@/lib/api-guard";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth("deal", "GET");
  if (guard.denied) return guard.denied;
  try {
    const { id } = await params;
    const dealId = Number(id);

    const deal = await getDeal(dealId);
    if (!deal) {
      return NextResponse.json({ error: "Deal non trouvé" }, { status: 404 });
    }

    let person = null;
    if (deal.person_id) {
      person = await getPerson(deal.person_id);
    }

    const [activities, notes] = await Promise.all([
      getActivitiesForDeal(dealId),
      getNotesForDeal(dealId),
    ]);

    return NextResponse.json({
      data: { deal, person, activities, notes },
    });
  } catch (error) {
    console.error("GET /api/deals/[id] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth("dashboard", "PUT");
  if (guard.denied) return guard.denied;
  try {
    const { id } = await params;
    const dealId = Number(id);
    const body = await request.json();

    console.log(`[PUT /api/deals/${dealId}] body:`, JSON.stringify(body));
    const deal = await updateDeal(dealId, body);
    console.log(`[PUT /api/deals/${dealId}] result:`, deal ? `updated (pipeline=${deal.pipeline_id}, stage=${deal.stage_id}, status=${deal.status})` : "null (not found)");
    if (!deal) {
      return NextResponse.json({ error: "Deal non trouvé" }, { status: 404 });
    }
    return NextResponse.json({ data: deal });
  } catch (error) {
    console.error("PUT /api/deals/[id] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
