/**
 * API Route — Single Import List
 * GET    : get contacts for a list
 * DELETE : delete a list
 */

import { NextResponse } from "next/server";
import { getImportContacts, deleteImportList } from "@/lib/import-store";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const contacts = await getImportContacts(id);
    return NextResponse.json({ data: contacts });
  } catch (error) {
    console.error("GET /api/imports/[id] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteImportList(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/imports/[id] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
