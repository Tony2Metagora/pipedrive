/**
 * API Route — Deduplicate prospects
 * POST : merge/remove duplicate prospects with rule R2
 *
 * Dedup rule:
 * - duplicate if same email OR same LinkedIn
 * - keep the most complete row
 * - merge fill-empty values from other duplicates
 *
 * Also recalculates list counts in prospect-lists.json.
 */

import { NextResponse } from "next/server";
import { readBlob, writeBlob, withLock } from "@/lib/blob-store";
import { requireAuth } from "@/lib/api-guard";

interface ProspectRow {
  id: string;
  email?: string;
  linkedin?: string;
  list_id?: string;
  [key: string]: string | undefined;
}

interface ProspectList {
  id: string;
  name: string;
  company: string;
  created_at: string;
  count: number;
}

const FILL_KEYS = [
  "nom",
  "prenom",
  "email",
  "telephone",
  "linkedin",
  "poste",
  "entreprise",
  "naf_code",
  "effectifs",
  "ville",
  "duree_poste",
  "duree_entreprise",
  "linkedin_entreprise",
  "resume_entreprise",
] as const;

function clean(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeEmail(v: string): string {
  return v.trim().toLowerCase();
}

function normalizeLinkedin(v: string): string {
  const normalized = v.trim().toLowerCase();
  const withProtocol = /^https?:\/\//.test(normalized) ? normalized : `https://${normalized}`;
  return withProtocol.replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");
}

function completenessScore(row: ProspectRow): number {
  let score = 0;
  for (const key of FILL_KEYS) {
    if (clean(row[key])) score += 1;
  }
  return score;
}

function mergeFillEmpty(target: ProspectRow, donor: ProspectRow) {
  for (const key of FILL_KEYS) {
    if (!clean(target[key]) && clean(donor[key])) target[key] = donor[key];
  }
  if (!clean(target.list_id) && clean(donor.list_id)) target.list_id = donor.list_id;
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

      const survivors: ProspectRow[] = [];
      const dead = new Set<ProspectRow>();
      const emailToRow = new Map<string, ProspectRow>();
      const linkedinToRow = new Map<string, ProspectRow>();

      for (const src of rows) {
        const current: ProspectRow = { ...src };
        const emailKey = clean(current.email) ? normalizeEmail(clean(current.email)) : "";
        const linkedinKey = clean(current.linkedin) ? normalizeLinkedin(clean(current.linkedin)) : "";

        const matched = new Set<ProspectRow>();
        if (emailKey && emailToRow.has(emailKey)) matched.add(emailToRow.get(emailKey)!);
        if (linkedinKey && linkedinToRow.has(linkedinKey)) matched.add(linkedinToRow.get(linkedinKey)!);

        if (matched.size === 0) {
          survivors.push(current);
          if (emailKey) emailToRow.set(emailKey, current);
          if (linkedinKey) linkedinToRow.set(linkedinKey, current);
          continue;
        }

        const candidates = [...matched, current];
        let winner = candidates[0];
        for (const candidate of candidates) {
          if (completenessScore(candidate) > completenessScore(winner)) winner = candidate;
        }

        if (!survivors.includes(winner)) survivors.push(winner);
        for (const candidate of candidates) {
          if (candidate === winner) continue;
          mergeFillEmpty(winner, candidate);
          if (survivors.includes(candidate)) dead.add(candidate);
        }

        for (const candidate of candidates) {
          const e = clean(candidate.email) ? normalizeEmail(clean(candidate.email)) : "";
          const li = clean(candidate.linkedin) ? normalizeLinkedin(clean(candidate.linkedin)) : "";
          if (e) emailToRow.set(e, winner);
          if (li) linkedinToRow.set(li, winner);
        }
      }

      deduped = survivors.filter((r) => !dead.has(r));
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
