/**
 * API Route — LinkedIn Sourcing Sites CRUD
 * GET:    list all sources
 * POST:   create a source
 * PUT:    update a source (body.id required)
 * DELETE: delete a source (body.id required)
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import { getSources, createSource, updateSource, deleteSource } from "@/lib/linkedin-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireAuth("linkedin", "GET");
  if (guard.denied) return guard.denied;

  const sources = await getSources();
  return NextResponse.json({ data: sources });
}

export async function POST(request: Request) {
  const guard = await requireAuth("linkedin", "POST");
  if (guard.denied) return guard.denied;

  try {
    const body = await request.json();
    const { name, url, themes, type } = body;
    if (!name || !url || !themes?.length) {
      return NextResponse.json({ error: "Champs requis: name, url, themes" }, { status: 400 });
    }
    const source = await createSource({ name, url, themes, type: type || "site", });
    return NextResponse.json({ data: source });
  } catch (error) {
    console.error("POST /api/linkedin/sources error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const guard = await requireAuth("linkedin", "PUT");
  if (guard.denied) return guard.denied;

  try {
    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
    const updated = await updateSource(id, updates);
    if (!updated) return NextResponse.json({ error: "Source introuvable" }, { status: 404 });
    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("PUT /api/linkedin/sources error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const guard = await requireAuth("linkedin", "DELETE");
  if (guard.denied) return guard.denied;

  try {
    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: "id requis" }, { status: 400 });
    await deleteSource(body.id);
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    console.error("DELETE /api/linkedin/sources error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
