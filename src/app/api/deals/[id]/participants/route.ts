/**
 * API Route — Participants d'un deal Pipedrive
 * GET : retourne tous les contacts liés à un deal
 */

import { NextResponse } from "next/server";
import { getDealPersons } from "@/lib/pipedrive";

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

    const participants = await getDealPersons(dealId);

    // Normalize participants data (Pipedrive may wrap person data differently)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const normalized = participants.map((p: any) => {
      // Pipedrive participants API returns { person: {...}, active_flag: true, primary_flag: true/false }
      const person = p.person || p;
      const personId = person.id || p.id;
      return {
        id: personId,
        name: person.name || p.name || "",
        email: person.email || p.email || [],
        phone: person.phone || p.phone || [],
        org_id: person.org_id || p.org_id || null,
        job_title: person.job_title || p.job_title || "",
        primary: p.primary_flag ?? (p.primary !== undefined ? p.primary : true),
      };
    });

    return NextResponse.json({ data: normalized });
  } catch (error) {
    console.error("GET /api/deals/[id]/participants error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
