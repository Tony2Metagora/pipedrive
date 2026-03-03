/**
 * API Route — Mise à jour d'un contact (Blob Storage)
 * PUT : mettre à jour email, téléphone, poste, nom
 */

import { NextResponse } from "next/server";
import { updatePerson } from "@/lib/blob-store";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const person = await updatePerson(Number(id), body);
    if (!person) {
      return NextResponse.json({ error: "Contact non trouvé" }, { status: 404 });
    }
    return NextResponse.json({ data: person });
  } catch (error) {
    console.error("PUT /api/persons/[id] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
