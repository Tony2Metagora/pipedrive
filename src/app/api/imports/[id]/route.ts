/**
 * API Route — Single Import List
 * GET    : get contacts for a list
 * DELETE : delete a list
 */

import { NextResponse } from "next/server";
import { getImportContacts, deleteImportList, updateListMeta } from "@/lib/import-store";
import { requireAuth } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAuth("import", "GET");
  if (guard.denied) return guard.denied;
  try {
    const { id } = await params;
    const contacts = await getImportContacts(id);
    return NextResponse.json({ data: contacts });
  } catch (error) {
    console.error("GET /api/imports/[id] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAuth("import", "PATCH");
  if (guard.denied) return guard.denied;
  try {
    const { id } = await params;
    const body = await request.json();
    const updates: { name?: string; company_tag?: string; enriched_at?: string } = {};
    if (body.name !== undefined) updates.name = String(body.name).trim();
    if (body.company_tag !== undefined) updates.company_tag = String(body.company_tag).trim();
    if (body.enriched_at !== undefined) updates.enriched_at = body.enriched_at;

    const updated = await updateListMeta(id, updates);
    if (!updated) {
      return NextResponse.json({ error: "Liste introuvable" }, { status: 404 });
    }
    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("PATCH /api/imports/[id] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAuth("import", "DELETE");
  if (guard.denied) return guard.denied;
  try {
    const { id } = await params;
    await deleteImportList(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/imports/[id] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
