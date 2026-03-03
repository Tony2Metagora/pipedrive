/**
 * API Route — Participants d'un deal (Blob Storage)
 * GET : retourne tous les contacts liés à un deal
 */

import { NextResponse } from "next/server";
import { getDeal, getDealParticipants } from "@/lib/blob-store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const dealId = Number(id);
    if (isNaN(dealId)) {
      return NextResponse.json({ error: "ID invalide" }, { status: 400 });
    }

    const deal = await getDeal(dealId);
    if (!deal) {
      return NextResponse.json({ error: "Deal non trouvé" }, { status: 404 });
    }

    const participants = await getDealParticipants(dealId);

    const normalized = participants.map((p) => ({
      id: p.id,
      name: p.name || "",
      email: p.email || [],
      phone: p.phone || [],
      org_id: p.org_id || null,
      job_title: p.job_title || "",
      primary: p.id === deal.person_id,
    }));

    return NextResponse.json({ data: normalized });
  } catch (error) {
    console.error("GET /api/deals/[id]/participants error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
