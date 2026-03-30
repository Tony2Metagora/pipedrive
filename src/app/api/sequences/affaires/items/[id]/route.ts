import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import { updateFollowupItem } from "@/lib/followup-store";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth("sequences", "PATCH");
  if (guard.denied) return guard.denied;
  try {
    const { id } = await params;
    const itemId = Number(id);
    if (!Number.isFinite(itemId)) {
      return NextResponse.json({ error: "ID item invalide" }, { status: 400 });
    }
    const body = (await request.json()) as {
      subject?: string;
      body?: string;
      status?: "draft" | "a_envoyer" | "en_cours" | "envoye" | "erreur";
      scheduledAt?: string;
    };

    const patch: Record<string, unknown> = {};
    if (typeof body.subject === "string") patch.subject = body.subject;
    if (typeof body.body === "string") patch.body = body.body;
    if (typeof body.status === "string") patch.status = body.status;
    if (typeof body.scheduledAt === "string") patch.scheduledAt = body.scheduledAt;

    const item = await updateFollowupItem(itemId, patch);
    if (!item) return NextResponse.json({ error: "Item introuvable" }, { status: 404 });
    return NextResponse.json({ data: item });
  } catch (error) {
    console.error("PATCH /api/sequences/affaires/items/[id] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

