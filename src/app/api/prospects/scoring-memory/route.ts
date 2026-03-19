/**
 * API Route — Scoring Memory (RAG learning for AI scoring)
 * 
 * Stores human corrections to AI scores, per brand/company.
 * Each correction records: job, company, old score, new score, reason.
 * This memory is injected into the AI scoring prompt to improve future results.
 * 
 * GET ?brand=metagora  → returns all corrections for that brand
 * POST { brand, prospect_id, poste, entreprise, old_score, new_score, reason }
 */

import { NextRequest, NextResponse } from "next/server";
import { readBlob, writeBlob, withLock } from "@/lib/blob-store";
import { requireAuth } from "@/lib/api-guard";

export interface ScoringCorrection {
  id: string;
  brand: string;
  prospect_id: string;
  poste: string;
  entreprise: string;
  old_score: number;
  new_score: number;
  reason: string;
  created_at: string;
}

const STORE_KEY = "scoring-memory.json";

export async function GET(request: NextRequest) {
  const guard = await requireAuth("prospects", "GET");
  if (guard.denied) return guard.denied;

  const brand = request.nextUrl.searchParams.get("brand") || "";
  const all = await readBlob<ScoringCorrection>(STORE_KEY);
  const filtered = brand ? all.filter((c) => c.brand.toLowerCase() === brand.toLowerCase()) : all;

  return NextResponse.json({ corrections: filtered, count: filtered.length });
}

export async function POST(request: Request) {
  const guard = await requireAuth("prospects", "POST");
  if (guard.denied) return guard.denied;

  const body = await request.json();
  const { brand, prospect_id, poste, entreprise, old_score, new_score, reason } = body as {
    brand: string;
    prospect_id: string;
    poste: string;
    entreprise: string;
    old_score: number;
    new_score: number;
    reason: string;
  };

  if (!brand || !prospect_id || new_score == null || !reason) {
    return NextResponse.json({ error: "brand, prospect_id, new_score, reason requis" }, { status: 400 });
  }

  const correction: ScoringCorrection = {
    id: `sc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    brand: brand.toLowerCase(),
    prospect_id,
    poste: poste || "",
    entreprise: entreprise || "",
    old_score: old_score || 0,
    new_score,
    reason,
    created_at: new Date().toISOString(),
  };

  await withLock(STORE_KEY, async () => {
    const all = await readBlob<ScoringCorrection>(STORE_KEY);
    all.push(correction);
    await writeBlob(STORE_KEY, all);
  });

  // Also update the prospect's ai_score
  await withLock("prospects.json", async () => {
    const rows = await readBlob<Record<string, unknown>>("prospects.json");
    const idx = rows.findIndex((r) => String(r.id) === String(prospect_id));
    if (idx !== -1) {
      rows[idx].ai_score = String(new_score);
      rows[idx].ai_comment = reason;
      await writeBlob("prospects.json", rows);
    }
  });

  console.log(`[Scoring Memory] +1 correction for "${brand}": ${entreprise}/${poste} ${old_score}→${new_score}`);

  return NextResponse.json({ success: true, correction });
}
