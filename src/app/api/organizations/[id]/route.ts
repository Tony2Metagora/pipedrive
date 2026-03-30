/**
 * API Route — Organisation par ID (Blob Storage)
 * GET : récupérer l'organisation
 * PUT : mettre à jour le nom
 */

import { NextResponse } from "next/server";
import { getOrganization, updateOrganization } from "@/lib/blob-store";
import { requireAuth } from "@/lib/api-guard";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAuth("dashboard", "GET");
  if (guard.denied) return guard.denied;
  try {
    const { id } = await params;
    const orgId = Number(id);
    if (!Number.isFinite(orgId)) {
      return NextResponse.json({ error: "org id invalide" }, { status: 400 });
    }
    const org = await getOrganization(orgId);
    if (!org) return NextResponse.json({ error: "Organisation non trouvée" }, { status: 404 });
    return NextResponse.json({ data: org });
  } catch (error) {
    console.error("GET /api/organizations/[id] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAuth("dashboard", "PUT");
  if (guard.denied) return guard.denied;
  try {
    const { id } = await params;
    const orgId = Number(id);
    if (!Number.isFinite(orgId)) {
      return NextResponse.json({ error: "org id invalide" }, { status: 400 });
    }
    const body = await request.json();
    const { name } = body as { name?: string };
    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "name requis" }, { status: 400 });
    }
    const org = await updateOrganization(orgId, { name: name.trim() });
    if (!org) return NextResponse.json({ error: "Organisation non trouvée" }, { status: 404 });
    return NextResponse.json({ data: org });
  } catch (error) {
    console.error("PUT /api/organizations/[id] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

