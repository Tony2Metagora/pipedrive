/**
 * API Route — Deduplicate prospects
 * POST : remove duplicate prospects (keeps first occurrence)
 * 
 * Dedup rules (in order):
 * 1. Same email (case-insensitive) → duplicate
 * 2. No email → same nom + prenom + entreprise (case-insensitive) → duplicate
 * 
 * Also recalculates list counts in prospect-lists.json
 */

import { NextResponse } from "next/server";
import { readBlob, writeBlob, withLock } from "@/lib/blob-store";
import { requireAuth } from "@/lib/api-guard";

interface ProspectRow {
  id: string;
  email: string;
  nom: string;
  prenom: string;
  entreprise: string;
  list_id?: string;
  [key: string]: unknown;
}

interface ProspectList {
  id: string;
  name: string;
  company: string;
  created_at: string;
  count: number;
}

function nameKey(r: ProspectRow): string {
  const nom = (r.nom || "").toLowerCase().trim();
  const prenom = (r.prenom || "").toLowerCase().trim();
  const entreprise = (r.entreprise || "").toLowerCase().trim();
  return `${nom}||${prenom}||${entreprise}`;
}

export async function POST() {
  const guard = await requireAuth("prospects", "POST");
  if (guard.denied) return guard.denied;

  try {
    let beforeCount = 0;
    let afterCount = 0;
    let deduped: ProspectRow[] = [];

    await withLock("prospects.json", async () => {
      const rows = await readBlob<ProspectRow>("prospects.json");
      beforeCount = rows.length;

      const seenEmails = new Set<string>();
      const seenNames = new Set<string>();
      deduped = [];

      for (const r of rows) {
        const email = r.email?.toLowerCase().trim();
        if (email) {
          if (seenEmails.has(email)) continue;
          seenEmails.add(email);
        } else {
          const nk = nameKey(r);
          if (nk !== "||||" && seenNames.has(nk)) continue;
          if (nk !== "||||") seenNames.add(nk);
        }
        deduped.push(r);
      }

      afterCount = deduped.length;
      await writeBlob("prospects.json", deduped);
    });

    // Recalculate list counts based on actual remaining prospects
    await withLock("prospect-lists.json", async () => {
      const lists = await readBlob<ProspectList>("prospect-lists.json");
      if (lists.length > 0) {
        const countByList = new Map<string, number>();
        for (const r of deduped) {
          if (r.list_id) countByList.set(r.list_id, (countByList.get(r.list_id) || 0) + 1);
        }
        for (const list of lists) {
          list.count = countByList.get(list.id) || 0;
        }
        await writeBlob("prospect-lists.json", lists);
      }
    });

    return NextResponse.json({
      success: true,
      before: beforeCount,
      after: afterCount,
      removed: beforeCount - afterCount,
    });
  } catch (error) {
    console.error("POST /api/prospects/dedup error:", error);
    return NextResponse.json({ error: "Erreur déduplication" }, { status: 500 });
  }
}
