/**
 * API Route — Notes Pipedrive
 * POST : créer une note
 */

import { NextResponse } from "next/server";
import { createNote } from "@/lib/pipedrive";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const note = await createNote(body);
    return NextResponse.json({ data: note });
  } catch (error) {
    console.error("POST /api/notes error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
