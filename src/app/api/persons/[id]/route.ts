/**
 * API Route — Contact par ID (Blob Storage)
 * GET : récupérer un contact
 * PUT : mettre à jour email, téléphone, poste, nom
 */

import { NextResponse } from "next/server";
import { getPerson, updatePerson } from "@/lib/blob-store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const person = await getPerson(Number(id));
    if (!person) {
      return NextResponse.json({ error: "Contact non trouvé" }, { status: 404 });
    }
    return NextResponse.json({ data: person });
  } catch (error) {
    console.error("GET /api/persons/[id] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

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
