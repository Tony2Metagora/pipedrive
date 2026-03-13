/**
 * API Route — Notes (Blob Storage)
 * POST : créer une note
 */

import { NextResponse } from "next/server";
import { createNote } from "@/lib/blob-store";
import { requireAuth } from "@/lib/api-guard";

export async function POST(request: Request) {
  const guard = await requireAuth("dashboard", "POST");
  if (guard.denied) return guard.denied;
  try {
    const body = await request.json();
    const note = await createNote({
      content: body.content || "",
      deal_id: body.deal_id || null,
      person_id: body.person_id || null,
      org_id: body.org_id || null,
    });
    return NextResponse.json({ data: note });
  } catch (error) {
    console.error("POST /api/notes error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
