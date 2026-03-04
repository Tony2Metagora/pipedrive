/**
 * API Route — Prospects (Vercel Blob)
 * GET : lire les prospects depuis Blob, enrichis avec statut auto + affaire liée
 * PUT : mettre à jour une ligne et sauvegarder dans Blob
 */

import { NextResponse } from "next/server";
import { put, get } from "@vercel/blob";
import { getDeals, getPersons } from "@/lib/blob-store";

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
  score_entreprise: string;
  score_job: string;
}

interface EnrichedProspect extends ProspectRow {
  deal_id: number | null;
  deal_title: string | null;
  deal_status: string | null;
  deal_value: number | null;
  computed_statut: string; // "en cours" | "perdu" | "archivé"
}

async function readProspects(): Promise<ProspectRow[]> {
  try {
    const result = await get("prospects.json", { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) return [];
    const chunks: Uint8Array[] = [];
    const reader = result.stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const text = new TextDecoder().decode(
      chunks.reduce((acc, chunk) => {
        const merged = new Uint8Array(acc.length + chunk.length);
        merged.set(acc);
        merged.set(chunk, acc.length);
        return merged;
      }, new Uint8Array())
    );
    return JSON.parse(text);
  } catch {
    return [];
  }
}

async function writeProspects(rows: ProspectRow[]) {
  await put("prospects.json", JSON.stringify(rows), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export async function GET() {
  try {
    const [rows, deals, persons] = await Promise.all([
      readProspects(),
      getDeals(),
      getPersons(),
    ]);

    // Build email → person mapping
    const emailToPersonId = new Map<string, number>();
    for (const p of persons) {
      for (const e of p.email) {
        if (e.value) emailToPersonId.set(e.value.toLowerCase().trim(), p.id);
      }
    }

    // Build person_id → open deal mapping (take first open deal)
    const personIdToDeals = new Map<number, typeof deals[0][]>();
    for (const d of deals) {
      if (!d.person_id) continue;
      const existing = personIdToDeals.get(d.person_id) || [];
      existing.push(d);
      personIdToDeals.set(d.person_id, existing);
    }

    // Enrich each prospect
    const enriched: EnrichedProspect[] = rows.map((r) => {
      const email = r.email?.toLowerCase().trim();
      const personId = email ? emailToPersonId.get(email) : undefined;
      const personDeals = personId ? personIdToDeals.get(personId) : undefined;

      // Find open deal first, otherwise any deal
      const openDeal = personDeals?.find((d) => d.status === "open");
      const anyDeal = personDeals?.[0];
      const deal = openDeal || anyDeal || null;

      // If manually archived, keep that status
      const computed_statut = r.statut === "archivé" ? "archivé" : openDeal ? "en cours" : "perdu";

      return {
        ...r,
        deal_id: deal?.id ?? null,
        deal_title: deal?.title ?? null,
        deal_status: deal?.status ?? null,
        deal_value: deal?.value ?? null,
        computed_statut,
      };
    });

    return NextResponse.json({ data: enriched, count: enriched.length });
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

    const allowedKeys = ["nom", "prenom", "email", "telephone", "poste", "entreprise", "statut", "pipelines", "notes", "score_entreprise", "score_job"];
    for (const [key, value] of Object.entries(updates)) {
      if (allowedKeys.includes(key)) {
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
