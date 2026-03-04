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
import { put, get } from "@vercel/blob";
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

/**
 * POST — Submit batch to Dropcontact, return requestId immediately
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { ids } = body as { ids: string[] };

    if (!ids?.length) {
      return NextResponse.json({ error: "ids[] requis" }, { status: 400 });
    }
    if (ids.length > 50) {
      return NextResponse.json({ error: "Maximum 50 contacts à la fois" }, { status: 400 });
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
function applyResults(rows: ProspectRow[], prospectIds: string[], dcResults: DropcontactResult[]) {
  const results: { id: string; name: string; status: string; fields: string[] }[] = [];

  for (let i = 0; i < prospectIds.length; i++) {
    const pid = prospectIds[i];
    const dcResult = dcResults[i];
    const idx = rows.findIndex((r) => String(r.id) === String(pid));
    if (idx === -1) continue;

    const updatedFields: string[] = [];

    if (dcResult) {
      // Email
      const bestEmail = dcResult.email?.find((e) => e.qualification === "professional")?.email
        || dcResult.email?.[0]?.email;
      if (bestEmail && !rows[idx].email) {
        rows[idx].email = bestEmail;
        updatedFields.push("email");
      }

      // Phone
      const phone = dcResult.mobile_phone || dcResult.phone;
      if (phone && !rows[idx].telephone) {
        rows[idx].telephone = phone;
        updatedFields.push("telephone");
      }

      // Job
      if (dcResult.job && !rows[idx].poste) {
        rows[idx].poste = dcResult.job;
        updatedFields.push("poste");
      }

      // LinkedIn
      if (dcResult.linkedin) {
        rows[idx].linkedin = dcResult.linkedin;
        updatedFields.push("linkedin");
      }

      // Name fill
      if (dcResult.first_name && !rows[idx].prenom) {
        rows[idx].prenom = dcResult.first_name;
        updatedFields.push("prenom");
      }
      if (dcResult.last_name && !rows[idx].nom) {
        rows[idx].nom = dcResult.last_name;
        updatedFields.push("nom");
      }

      // Entreprise
      if (dcResult.company && !rows[idx].entreprise) {
        rows[idx].entreprise = dcResult.company;
        updatedFields.push("entreprise");
      }

      // NAF
      if (dcResult.naf5_code) {
        const nafLabel = dcResult.naf5_des ? `${dcResult.naf5_code} — ${dcResult.naf5_des}` : dcResult.naf5_code;
        rows[idx].naf_code = nafLabel;
        updatedFields.push("naf_code");
      }

      // Effectifs
      if (dcResult.nb_employees) {
        rows[idx].effectifs = dcResult.nb_employees;
        updatedFields.push("effectifs");
      }
    }

    results.push({
      id: pid,
      name: `${rows[idx].prenom} ${rows[idx].nom}`,
      status: updatedFields.length > 0 ? "enriched" : "no_result",
      fields: updatedFields,
    });
  }

  return results;
}

/**
 * GET — Poll Dropcontact for results, apply if ready
 */
export async function GET(request: Request) {
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

    // Apply results to prospects
    const rows = await readProspects();
    const results = applyResults(rows, prospectIds, pollResult.data || []);
    await writeProspects(rows);

    const enrichedCount = results.filter((r) => r.status === "enriched").length;

    return NextResponse.json({
      done: true,
      success: true,
      enriched: enrichedCount,
      total: results.length,
      results,
    });
  } catch (error) {
    console.error("GET /api/prospects/enrich error:", error);
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return NextResponse.json({ done: true, error: message }, { status: 500 });
  }
}
