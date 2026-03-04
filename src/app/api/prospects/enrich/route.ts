/**
 * API Route — Enrichissement de prospects via Dropcontact
 * POST { ids: string[] }
 * Pour chaque prospect sélectionné, envoie nom + prénom + entreprise + email à Dropcontact
 * et met à jour prospects.json avec les résultats
 */

import { NextResponse } from "next/server";
import { put, get } from "@vercel/blob";
import { enrichContact } from "@/lib/dropcontact";

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

interface EnrichResultItem {
  id: string;
  name: string;
  status: "enriched" | "no_result" | "error";
  fields?: string[];
  error?: string;
}

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

    const results: EnrichResultItem[] = [];

    for (const prospect of toEnrich) {
      try {
        console.log(`[Prospect Enrich] Processing ${prospect.prenom} ${prospect.nom}...`);

        const dcResult = await enrichContact({
          first_name: prospect.prenom || undefined,
          last_name: prospect.nom || undefined,
          full_name: `${prospect.prenom} ${prospect.nom}`.trim() || undefined,
          company: prospect.entreprise || undefined,
          email: prospect.email || undefined,
        });

        if (!dcResult) {
          results.push({ id: prospect.id, name: `${prospect.prenom} ${prospect.nom}`, status: "no_result" });
          continue;
        }

        const updatedFields: string[] = [];
        const idx = rows.findIndex((r) => String(r.id) === String(prospect.id));
        if (idx === -1) continue;

        // Email — prefer professional
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

        // Job / Poste
        if (dcResult.job && !rows[idx].poste) {
          rows[idx].poste = dcResult.job;
          updatedFields.push("poste");
        }

        // LinkedIn
        if (dcResult.linkedin) {
          rows[idx].linkedin = dcResult.linkedin;
          updatedFields.push("linkedin");
        }

        // Nom / Prénom (fill if empty)
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

        // Code NAF
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

        results.push({
          id: prospect.id,
          name: `${rows[idx].prenom} ${rows[idx].nom}`,
          status: updatedFields.length > 0 ? "enriched" : "no_result",
          fields: updatedFields,
        });

      } catch (err) {
        console.error(`[Prospect Enrich] Error for ${prospect.id}:`, err);
        results.push({
          id: prospect.id,
          name: `${prospect.prenom} ${prospect.nom}`,
          status: "error",
          error: err instanceof Error ? err.message : "Erreur inconnue",
        });
      }
    }

    // Save updated prospects
    await writeProspects(rows);

    const enrichedCount = results.filter((r) => r.status === "enriched").length;
    return NextResponse.json({
      success: true,
      enriched: enrichedCount,
      total: results.length,
      results,
    });
  } catch (error) {
    console.error("POST /api/prospects/enrich error:", error);
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
