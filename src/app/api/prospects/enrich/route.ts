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
import { resolveCanonicalProspectField } from "@/lib/prospect-canonical";

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
  linkedin_entreprise?: string;
  naf_code: string;
  effectifs: string;
  ville?: string;
  duree_poste?: string;
  duree_entreprise?: string;
  resume_entreprise?: string;
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

function getCanonicalDropValues(dcResult: DropcontactResult): Record<string, string> {
  const nafCode = cleanString(dcResult.naf5_code);
  const nafDes = cleanString(dcResult.naf5_des);
  return {
    email: pickBestEmail(dcResult),
    mobile_phone: cleanString(dcResult.mobile_phone),
    phone: cleanString(dcResult.phone),
    job: cleanString(dcResult.job),
    linkedin: ensureHttpsUrl(cleanString(dcResult.linkedin)),
    company_linkedin: ensureHttpsUrl(cleanString(dcResult.company_linkedin)),
    first_name: cleanString(dcResult.first_name),
    last_name: cleanString(dcResult.last_name),
    company: cleanString(dcResult.company),
    naf5_code: nafCode ? `${nafCode}${nafDes ? ` — ${nafDes}` : ""}` : "",
    nb_employees: cleanString(dcResult.nb_employees),
  };
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
      const canonicalDropValues = getCanonicalDropValues(dcResult);
      const mappedDropKeys = new Set<string>();
      for (const [sourceKey, value] of Object.entries(canonicalDropValues)) {
        if (!value) continue;
        const canonical = resolveCanonicalProspectField(sourceKey);
        if (!canonical) continue;
        mappedDropKeys.add(sourceKey);
        setIfEmpty(rows[idx], canonical as keyof ProspectRow, value, updatedTopLevel);
      }

      // Report non-mapped Dropcontact keys without persisting them to keep a strict schema.
      const dcRaw = dcResult as unknown as Record<string, unknown>;
      for (const [key, value] of Object.entries(dcRaw)) {
        if (mappedDropKeys.has(key)) continue;
        if (value === null || value === undefined || value === "") continue;
        addedExtraFields.push(key);
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
