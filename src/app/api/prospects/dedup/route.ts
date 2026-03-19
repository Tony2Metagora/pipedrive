/**
 * API Route — Deduplicate prospects
 * POST : remove duplicate prospects by email (keeps first occurrence)
 */

import { NextResponse } from "next/server";
import { readBlob, writeBlob, withLock } from "@/lib/blob-store";
import { requireAuth } from "@/lib/api-guard";

interface ProspectRow {
  id: string;
  email: string;
  [key: string]: unknown;
}

export async function POST() {
  const guard = await requireAuth("prospects", "POST");
  if (guard.denied) return guard.denied;

  try {
    let beforeCount = 0;
    let afterCount = 0;

    await withLock("prospects.json", async () => {
      const rows = await readBlob<ProspectRow>("prospects.json");
      beforeCount = rows.length;

      const seen = new Set<string>();
      const deduped: ProspectRow[] = [];

      for (const r of rows) {
        const email = r.email?.toLowerCase().trim();
        if (email && seen.has(email)) continue;
        if (email) seen.add(email);
        deduped.push(r);
      }

      afterCount = deduped.length;
      await writeBlob("prospects.json", deduped);
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
