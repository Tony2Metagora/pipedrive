/**
 * API Route — Deduplicate prospects
 * POST : remove duplicate prospects (keeps first occurrence)
 * 
 * Dedup rules (in order):
 * 1. Same email (case-insensitive) → duplicate
 * 2. No email → same nom + prenom + entreprise (case-insensitive) → duplicate
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
  [key: string]: unknown;
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

    await withLock("prospects.json", async () => {
      const rows = await readBlob<ProspectRow>("prospects.json");
      beforeCount = rows.length;

      const seenEmails = new Set<string>();
      const seenNames = new Set<string>();
      const deduped: ProspectRow[] = [];

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
