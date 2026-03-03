/**
 * API Route — Prospects (Vercel Blob)
 * GET : lire les prospects depuis Blob
 * PUT : mettre à jour une ligne et sauvegarder dans Blob
 */

import { NextResponse } from "next/server";
import { put, list } from "@vercel/blob";

interface ProspectRow {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  poste: string;
  entreprise: string;
  statut: string;
  pipelines: string;
  notes: string;
}

async function readProspects(): Promise<ProspectRow[]> {
  try {
    const { blobs } = await list({ prefix: "prospects.json" });
    const blob = blobs.find((b) => b.pathname === "prospects.json");
    if (!blob) return [];
    const res = await fetch(blob.url, { cache: "no-store" });
    return await res.json();
  } catch {
    return [];
  }
}

async function writeProspects(rows: ProspectRow[]) {
  await put("prospects.json", JSON.stringify(rows), {
    access: "public",
    addRandomSuffix: false,
  });
}

export async function GET() {
  try {
    const rows = await readProspects();
    return NextResponse.json({ data: rows, count: rows.length });
  } catch (error) {
    console.error("GET /api/prospects error:", error);
    return NextResponse.json({ error: "Erreur lecture" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

    const rows = await readProspects();
    const idx = rows.findIndex((r) => String(r.id) === String(id));
    if (idx === -1) return NextResponse.json({ error: "Contact non trouvé" }, { status: 404 });

    for (const [key, value] of Object.entries(updates)) {
      if (key in rows[idx]) {
        (rows[idx] as unknown as Record<string, string>)[key] = String(value);
      }
    }

    await writeProspects(rows);
    return NextResponse.json({ data: rows[idx] });
  } catch (error) {
    console.error("PUT /api/prospects error:", error);
    return NextResponse.json({ error: "Erreur mise à jour" }, { status: 500 });
  }
}
