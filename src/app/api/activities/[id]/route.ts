/**
 * API Route — Activité par ID (Blob Storage)
 * PUT : marquer comme fait, archiver (deal → lost), ou mettre à jour
 * DELETE : supprimer une activité
 */

import { NextResponse } from "next/server";
import { updateActivity, updateDeal, deleteActivity } from "@/lib/blob-store";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const activityId = Number(id);

    if (body.archive) {
      const activity = await updateActivity(activityId, { done: true });
      if (body.deal_id) {
        await updateDeal(body.deal_id, { status: "lost", lost_reason: body.lost_reason || "Archivé – pas de potentiel" });
      }
      return NextResponse.json({ data: activity, archived: true });
    } else if (body.done === 1) {
      const activity = await updateActivity(activityId, { done: true });
      return NextResponse.json({ data: activity });
    } else {
      const activity = await updateActivity(activityId, body);
      return NextResponse.json({ data: activity });
    }
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
