import { NextResponse } from "next/server";
import { readBlob, writeBlob, withLock } from "@/lib/blob-store";
import { requireAuth } from "@/lib/api-guard";
import { resolveCanonicalProspectField } from "@/lib/prospect-canonical";

interface ProspectRow {
  id: string;
  list_id?: string;
  statut?: string;
  nom?: string;
  prenom?: string;
  email?: string;
  telephone?: string;
  poste?: string;
  entreprise?: string;
  linkedin?: string;
  linkedin_entreprise?: string;
  naf_code?: string;
  effectifs?: string;
  ville?: string;
  duree_poste?: string;
  duree_entreprise?: string;
  resume_entreprise?: string;
  ai_score?: string;
  ai_comment?: string;
  extra_fields?: string;
  [key: string]: string | undefined;
}

const TARGET_FIELDS = [
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
  "ai_score",
  "ai_comment",
] as const;

const TARGET_FIELD_SET = new Set<string>(TARGET_FIELDS);
const META_FIELD_SET = new Set<string>(["id", "list_id", "statut"]);
const DEBUG_ENDPOINT = "http://127.0.0.1:7720/ingest/16cbdbe8-2060-402e-a2b2-0978bf515ae3";
const DEBUG_SESSION_ID = "d3538e";

function clean(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function ensureHttpsUrl(v: string): string {
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  return `https://${v}`;
}

function normalizeEmail(v: string): string {
  return v.trim().toLowerCase();
}

function normalizeLinkedin(v: string): string {
  const raw = ensureHttpsUrl(v).toLowerCase();
  return raw.replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");
}

function parseExtra(row: ProspectRow): Record<string, string> {
  if (!row.extra_fields) return {};
  try {
    const parsed = JSON.parse(row.extra_fields) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed || {})) {
      const value = clean(v);
      if (value) out[k] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function scoreCompleteness(row: ProspectRow): number {
  let score = 0;
  for (const key of TARGET_FIELDS) {
    if (clean(row[key])) score += 1;
  }
  return score;
}

function setCanonicalIfEmpty(
  row: ProspectRow,
  canonical: (typeof TARGET_FIELDS)[number],
  rawValue: string,
  stats: { copiedFields: number; copiedByField: Record<string, number> }
) {
  let value = clean(rawValue);
  if (!value) return;
  if (canonical === "linkedin" || canonical === "linkedin_entreprise") {
    value = ensureHttpsUrl(value);
  } else if (canonical === "email") {
    value = normalizeEmail(value);
  }
  if (!clean(row[canonical])) {
    row[canonical] = value;
    stats.copiedFields += 1;
    stats.copiedByField[canonical] = (stats.copiedByField[canonical] || 0) + 1;
  }
}

function mergeFillEmpty(target: ProspectRow, donor: ProspectRow) {
  for (const key of TARGET_FIELDS) {
    if (!clean(target[key]) && clean(donor[key])) {
      target[key] = donor[key];
    }
  }
  if (!target.list_id && donor.list_id) target.list_id = donor.list_id;
}

function pruneToTargetSchema(row: ProspectRow): ProspectRow {
  return {
    id: clean(row.id),
    list_id: clean(row.list_id) || undefined,
    statut: clean(row.statut) || "en cours",
    nom: clean(row.nom),
    prenom: clean(row.prenom),
    email: normalizeEmail(clean(row.email)),
    telephone: clean(row.telephone),
    linkedin: ensureHttpsUrl(clean(row.linkedin)),
    poste: clean(row.poste),
    entreprise: clean(row.entreprise),
    naf_code: clean(row.naf_code),
    effectifs: clean(row.effectifs),
    ville: clean(row.ville),
    duree_poste: clean(row.duree_poste),
    duree_entreprise: clean(row.duree_entreprise),
    linkedin_entreprise: ensureHttpsUrl(clean(row.linkedin_entreprise)),
    resume_entreprise: clean(row.resume_entreprise),
    ai_score: clean(row.ai_score),
    ai_comment: clean(row.ai_comment),
  };
}

function dedupeByEmailOrLinkedin(rows: ProspectRow[]) {
  const survivors: ProspectRow[] = [];
  const dead = new Set<ProspectRow>();
  const emailToRow = new Map<string, ProspectRow>();
  const linkedinToRow = new Map<string, ProspectRow>();

  for (const source of rows) {
    const row = { ...source };
    const emailKey = clean(row.email) ? normalizeEmail(clean(row.email)) : "";
    const linkedinKey = clean(row.linkedin) ? normalizeLinkedin(clean(row.linkedin)) : "";

    const matched = new Set<ProspectRow>();
    if (emailKey && emailToRow.has(emailKey)) matched.add(emailToRow.get(emailKey)!);
    if (linkedinKey && linkedinToRow.has(linkedinKey)) matched.add(linkedinToRow.get(linkedinKey)!);

    if (matched.size === 0) {
      survivors.push(row);
      if (emailKey) emailToRow.set(emailKey, row);
      if (linkedinKey) linkedinToRow.set(linkedinKey, row);
      continue;
    }

    const candidates = [...matched, row];
    let winner = candidates[0];
    for (const candidate of candidates) {
      if (scoreCompleteness(candidate) > scoreCompleteness(winner)) winner = candidate;
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

  return survivors.filter((row) => !dead.has(row));
}

export async function POST(request: Request) {
  const guard = await requireAuth("prospects", "PATCH");
  if (guard.denied) return guard.denied;

  try {
    // #region agent log
    fetch(DEBUG_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": DEBUG_SESSION_ID },
      body: JSON.stringify({
        sessionId: DEBUG_SESSION_ID,
        runId: "pre-fix",
        hypothesisId: "H1",
        location: "src/app/api/prospects/normalize/route.ts:196",
        message: "normalize-target-fields-snapshot",
        data: { targetFields: [...TARGET_FIELDS] },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    const body = (await request.json().catch(() => ({}))) as { dryRun?: boolean; dedupe?: boolean };
    const dryRun = Boolean(body.dryRun);
    const shouldDedupe = body.dedupe !== false;

    const stats = {
      totalProspects: 0,
      touchedProspects: 0,
      copiedFields: 0,
      copiedByField: {} as Record<string, number>,
      prunedFields: 0,
      dedupRemoved: 0,
    };

    await withLock("prospects.json", async () => {
      const rows = await readBlob<ProspectRow>("prospects.json");
      stats.totalProspects = rows.length;

      const normalizedRows: ProspectRow[] = [];
      for (const sourceRow of rows) {
        const row: ProspectRow = { ...sourceRow };
        const beforeKeys = Object.keys(row).length;
        const extra = parseExtra(row);

        // 1) Try to copy canonical values from extra_fields.
        for (const [extraKey, rawValue] of Object.entries(extra)) {
          const canonical = resolveCanonicalProspectField(extraKey);
          if (canonical && !TARGET_FIELD_SET.has(canonical)) {
            // #region agent log
            fetch(DEBUG_ENDPOINT, {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-Debug-Session-Id": DEBUG_SESSION_ID },
              body: JSON.stringify({
                sessionId: DEBUG_SESSION_ID,
                runId: "pre-fix",
                hypothesisId: "H2",
                location: "src/app/api/prospects/normalize/route.ts:230",
                message: "canonical-rejected-by-target-set",
                data: { extraKey, canonical },
                timestamp: Date.now(),
              }),
            }).catch(() => {});
            // #endregion
          }
          if (!canonical || !TARGET_FIELD_SET.has(canonical)) continue;
          // #region agent log
          fetch(DEBUG_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Debug-Session-Id": DEBUG_SESSION_ID },
            body: JSON.stringify({
              sessionId: DEBUG_SESSION_ID,
              runId: "pre-fix",
              hypothesisId: "H3",
              location: "src/app/api/prospects/normalize/route.ts:246",
              message: "canonical-accepted-before-copy",
              data: { extraKey, canonical },
              timestamp: Date.now(),
            }),
          }).catch(() => {});
          // #endregion
          setCanonicalIfEmpty(row, canonical, rawValue, stats);
        }

        // 2) Try to copy canonical values from any non-target top-level key.
        for (const [key, rawValue] of Object.entries(row)) {
          if (META_FIELD_SET.has(key) || TARGET_FIELD_SET.has(key) || key === "extra_fields") continue;
          const canonical = resolveCanonicalProspectField(key);
          if (!canonical || !TARGET_FIELD_SET.has(canonical)) continue;
          setCanonicalIfEmpty(row, canonical, String(rawValue || ""), stats);
        }

        // 3) Prune to strict target schema + minimal metadata.
        const pruned = pruneToTargetSchema(row);
        stats.prunedFields += Math.max(0, beforeKeys - Object.keys(pruned).length);

        const after = JSON.stringify(pruned);
        if (after !== JSON.stringify(sourceRow)) stats.touchedProspects += 1;
        normalizedRows.push(pruned);
      }

      const finalRows = shouldDedupe ? dedupeByEmailOrLinkedin(normalizedRows) : normalizedRows;
      stats.dedupRemoved = normalizedRows.length - finalRows.length;

      if (!dryRun) {
        await writeBlob("prospects.json", finalRows);
      }
    });

    return NextResponse.json({
      success: true,
      dryRun,
      stats,
    });
  } catch (error) {
    console.error("POST /api/prospects/normalize error:", error);
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
