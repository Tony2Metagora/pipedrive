/**
 * API Route — Enrichissement de prospects via Dropcontact (2 étapes)
 *
 * POST { ids: string[] }
 *   → Soumet le batch à Dropcontact, retourne { requestId, prospectIds }
 *
 * GET ?requestId=xxx&ids=id1,id2,...
 *   → Poll le résultat Dropcontact. Si prêt, met à jour prospects.json et retourne les résultats.
 *     Si pas prêt, retourne { done: false }
 *
 * Cela évite le timeout Vercel (10s) en faisant le polling côté client.
 */

import { NextResponse } from "next/server";
import { readBlob, writeBlob, withLock } from "@/lib/blob-store";
import { requireAuth } from "@/lib/api-guard";
import { submitBatchEnrich, pollBatchEnrich, type DropcontactResult } from "@/lib/dropcontact";

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
  linkedin: string;
  naf_code: string;
  effectifs: string;
  siren?: string;
  siret?: string;
  adresse_siege?: string;
  extra_fields?: string;
}

async function readProspects(): Promise<ProspectRow[]> {
  return readBlob<ProspectRow>("prospects.json");
}

async function writeProspects(rows: ProspectRow[]) {
  await writeBlob("prospects.json", rows);
}

/**
 * POST — Submit batch to Dropcontact, return requestId immediately
 */
export async function POST(request: Request) {
  const guard = await requireAuth("prospects", "POST");
  if (guard.denied) return guard.denied;
  try {
    const body = await request.json();
    const { ids } = body as { ids: string[] };

    if (!ids?.length) {
      return NextResponse.json({ error: "ids[] requis" }, { status: 400 });
    }

    const rows = await readProspects();
    const idSet = new Set(ids.map(String));
    const toEnrich = rows.filter((r) => idSet.has(String(r.id)));

    if (toEnrich.length === 0) {
      return NextResponse.json({ error: "Aucun prospect trouvé" }, { status: 404 });
    }

    // Build Dropcontact input batch
    const inputs = toEnrich.map((p) => ({
      first_name: p.prenom || undefined,
      last_name: p.nom || undefined,
      full_name: `${p.prenom} ${p.nom}`.trim() || undefined,
      company: p.entreprise || undefined,
      email: p.email || undefined,
    }));

    console.log(`[Prospect Enrich] Submitting ${inputs.length} contacts to Dropcontact...`);
    const requestId = await submitBatchEnrich(inputs);

    return NextResponse.json({
      submitted: true,
      requestId,
      count: toEnrich.length,
      prospectIds: toEnrich.map((p) => p.id),
    });
  } catch (error) {
    console.error("POST /api/prospects/enrich error:", error);
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Apply Dropcontact results to prospect rows
 */
interface EnrichApplyResult {
  id: string;
  name: string;
  status: string;
  fields: string[];
  topLevelFields: string[];
  extraFields: string[];
  debug?: string;
  raw?: Record<string, unknown>;
}

const TOP_LEVEL_DROP_KEYS = new Set([
  "email",
  "mobile_phone",
  "phone",
  "job",
  "linkedin",
  "first_name",
  "last_name",
  "company",
  "naf5_code",
  "naf5_des",
  "nb_employees",
  "siren",
  "siret",
  "siret_address",
]);

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function ensureHttpsUrl(value: string): string {
  const v = value.trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  return `https://${v}`;
}

function pickBestEmail(dcResult: DropcontactResult): string {
  const list = Array.isArray(dcResult.email) ? dcResult.email : [];
  const professional = list.find((e) => cleanString(e?.qualification).toLowerCase() === "professional");
  return cleanString(professional?.email || list[0]?.email || "");
}

function readExtraFields(row: ProspectRow): Record<string, string> {
  if (!row.extra_fields) return {};
  try {
    const parsed = JSON.parse(row.extra_fields) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed || {})) {
      const val = typeof v === "string" ? v.trim() : "";
      if (val) out[k] = val;
    }
    return out;
  } catch {
    return {};
  }
}

function serializeExtraValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value) || (value && typeof value === "object")) {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return "";
}

function setIfEmpty(row: ProspectRow, field: keyof ProspectRow, nextValue: string, updated: string[]) {
  const value = nextValue.trim();
  if (!value) return;
  const current = cleanString(row[field]);
  if (!current) {
    row[field] = value;
    updated.push(String(field));
  }
}

function applyResults(rows: ProspectRow[], prospectIds: string[], dcResults: DropcontactResult[]) {
  const results: EnrichApplyResult[] = [];

  console.log(`[applyResults] prospectIds=${JSON.stringify(prospectIds)}, dcResults count=${dcResults.length}`);

  for (let i = 0; i < prospectIds.length; i++) {
    const pid = prospectIds[i];
    const dcResult = dcResults[i];
    const idx = rows.findIndex((r) => String(r.id) === String(pid));

    console.log(`[applyResults] i=${i} pid=${pid} idx=${idx} dcResult=${JSON.stringify(dcResult).slice(0, 300)}`);

    if (idx === -1) {
      results.push({
        id: pid,
        name: "?",
        status: "no_result",
        fields: [],
        topLevelFields: [],
        extraFields: [],
        debug: "prospect not found in rows",
      });
      continue;
    }

    const updatedTopLevel: string[] = [];
    const addedExtraFields: string[] = [];

    if (dcResult) {
      // Top-level mapping (strict fill-empty-only)
      setIfEmpty(rows[idx], "email", pickBestEmail(dcResult), updatedTopLevel);
      setIfEmpty(rows[idx], "telephone", cleanString(dcResult.mobile_phone || dcResult.phone), updatedTopLevel);
      setIfEmpty(rows[idx], "poste", cleanString(dcResult.job), updatedTopLevel);
      setIfEmpty(rows[idx], "linkedin", ensureHttpsUrl(cleanString(dcResult.linkedin)), updatedTopLevel);
      setIfEmpty(rows[idx], "prenom", cleanString(dcResult.first_name), updatedTopLevel);
      setIfEmpty(rows[idx], "nom", cleanString(dcResult.last_name), updatedTopLevel);
      setIfEmpty(rows[idx], "entreprise", cleanString(dcResult.company), updatedTopLevel);
      setIfEmpty(
        rows[idx],
        "naf_code",
        cleanString(dcResult.naf5_code)
          ? `${cleanString(dcResult.naf5_code)}${cleanString(dcResult.naf5_des) ? ` — ${cleanString(dcResult.naf5_des)}` : ""}`
          : "",
        updatedTopLevel
      );
      setIfEmpty(rows[idx], "effectifs", cleanString(dcResult.nb_employees), updatedTopLevel);
      setIfEmpty(rows[idx], "siren", cleanString(dcResult.siren), updatedTopLevel);
      setIfEmpty(rows[idx], "siret", cleanString(dcResult.siret), updatedTopLevel);
      setIfEmpty(rows[idx], "adresse_siege", cleanString(dcResult.siret_address), updatedTopLevel);

      // Persist any non-mapped Dropcontact keys in extra_fields (non-destructive merge)
      const dcRaw = dcResult as unknown as Record<string, unknown>;
      const extra = readExtraFields(rows[idx]);
      for (const [key, value] of Object.entries(dcRaw)) {
        if (TOP_LEVEL_DROP_KEYS.has(key)) continue;
        const serialized = serializeExtraValue(value);
        if (!serialized) continue;
        if (!extra[key]) {
          extra[key] = serialized;
          addedExtraFields.push(key);
        }
      }
      if (Object.keys(extra).length > 0) {
        rows[idx].extra_fields = JSON.stringify(extra);
      }
    } else {
      console.log(`[applyResults] No dcResult for index ${i}`);
    }

    results.push({
      id: pid,
      name: `${rows[idx].prenom} ${rows[idx].nom}`,
      status: updatedTopLevel.length > 0 || addedExtraFields.length > 0 ? "enriched" : "no_result",
      fields: [...updatedTopLevel, ...addedExtraFields.map((k) => `extra:${k}`)],
      topLevelFields: updatedTopLevel,
      extraFields: addedExtraFields,
      raw: dcResult ? (dcResult as unknown as Record<string, unknown>) : undefined,
    });
  }

  return results;
}

/**
 * GET — Poll Dropcontact for results, apply if ready
 */
export async function GET(request: Request) {
  const guard = await requireAuth("prospects", "GET");
  if (guard.denied) return guard.denied;
  try {
    const { searchParams } = new URL(request.url);
    const requestId = searchParams.get("requestId");
    const idsParam = searchParams.get("ids");

    if (!requestId || !idsParam) {
      return NextResponse.json({ error: "requestId et ids requis" }, { status: 400 });
    }

    const prospectIds = idsParam.split(",");

    // Poll Dropcontact
    const pollResult = await pollBatchEnrich(requestId);

    if (!pollResult.done) {
      return NextResponse.json({ done: false });
    }

    if (pollResult.error) {
      return NextResponse.json({ done: true, error: pollResult.error });
    }

    console.log(`[GET enrich] Dropcontact returned ${pollResult.data?.length ?? 0} results`);
    console.log(`[GET enrich] Raw DC data: ${JSON.stringify(pollResult.data).slice(0, 1500)}`);

    // Apply results to prospects (locked to prevent race conditions)
    let results: EnrichApplyResult[] = [];
    await withLock("prospects.json", async () => {
      const rows = await readProspects();
      console.log(`[GET enrich] Read ${rows.length} prospects from blob`);
      results = applyResults(rows, prospectIds, pollResult.data || []);
      await writeProspects(rows);
      console.log(`[GET enrich] Wrote ${rows.length} prospects back to blob`);
    });

    const enrichedCount = results.filter((r) => r.status === "enriched").length;

    return NextResponse.json({
      done: true,
      success: true,
      enriched: enrichedCount,
      total: results.length,
      results,
      _debug_dc_count: pollResult.data?.length ?? 0,
    });
  } catch (error) {
    console.error("GET /api/prospects/enrich error:", error);
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return NextResponse.json({ done: true, error: message }, { status: 500 });
  }
}
