/**
 * API Route — Individual scraping list operations
 * GET    /api/scraping/:id — get companies for a list
 * DELETE /api/scraping/:id — delete a list
 * PATCH  /api/scraping/:id — rename a list
 */

import { NextResponse } from "next/server";
import {
  getScrapingCompanies,
  removeFromScrapingIndex,
  updateScrapingListMeta,
} from "@/lib/scraping-store";
import { requireAuth } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAuth("scrapping", "GET");
  if (guard.denied) return guard.denied;
  try {
    const { id } = await params;
    const companies = await getScrapingCompanies(id);
    return NextResponse.json({ data: companies });
  } catch (error) {
    console.error("GET /api/scraping/[id] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAuth("scrapping", "DELETE");
  if (guard.denied) return guard.denied;
  try {
    const { id } = await params;
    await removeFromScrapingIndex(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/scraping/[id] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAuth("scrapping", "PATCH");
  if (guard.denied) return guard.denied;
  try {
    const { id } = await params;
    const body = await request.json();
    const updated = await updateScrapingListMeta(id, { name: body.name });
    if (!updated) {
      return NextResponse.json({ error: "Liste non trouvée" }, { status: 404 });
    }
    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("PATCH /api/scraping/[id] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
