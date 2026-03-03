/**
 * API Route — Activité Pipedrive par ID
 * PUT : marquer comme fait, archiver (deal → lost), ou mettre à jour
 */

import { NextResponse } from "next/server";
import { markActivityDone, updateActivity, updateDeal, deleteActivity } from "@/lib/pipedrive";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();

    let activity;

    if (body.archive) {
      // Archiver : marquer activité done + passer le deal en "lost" si deal existe
      activity = await markActivityDone(Number(id));
      if (body.deal_id) {
        await updateDeal(body.deal_id, { status: "lost", lost_reason: body.lost_reason || "Archivé – pas de potentiel" });
      }
      return NextResponse.json({ data: activity, archived: true });
    } else if (body.done === 1) {
      activity = await markActivityDone(Number(id));
    } else {
      activity = await updateActivity(Number(id), body);
    }

    return NextResponse.json({ data: activity });
  } catch (error) {
    console.error("PUT /api/activities/[id] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await deleteActivity(Number(id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/activities/[id] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
