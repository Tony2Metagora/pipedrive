/**
 * API Route — Enrichissement prospects via API Recherche d'entreprises (data.gouv.fr)
 * POST { ids: string[] } → enrichit les prospects sélectionnés avec données SIREN/SIRET
 * Gratuit, pas de clé API.
 */

import { NextResponse } from "next/server";
import { readBlob, writeBlob, withLock } from "@/lib/blob-store";
import { requireAuth } from "@/lib/api-guard";
import { searchEntreprise, type GouvEnrichResult } from "@/lib/api-gouv";

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
  list_id?: string;
  ai_score?: string;
  ai_comment?: string;
  resume_entreprise?: string;
  siren?: string;
  siret?: string;
  adresse_siege?: string;
  categorie_entreprise?: string;
  chiffre_affaires?: string;
  resultat_net?: string;
  date_creation_entreprise?: string;
  dirigeants?: string;
  ville?: string;
  [key: string]: unknown;
}

export async function POST(request: Request) {
  const guard = await requireAuth("prospects", "POST");
  if (guard.denied) return guard.denied;

  try {
    const body = await request.json();
    const { ids } = body as { ids: string[] };

    if (!ids?.length) {
      return NextResponse.json({ error: "ids[] requis" }, { status: 400 });
    }

    // Read prospects
    const rows = await readBlob<ProspectRow>("prospects.json");
    const idSet = new Set(ids.map(String));
    const toEnrich = rows.filter((r) => idSet.has(String(r.id)));

    if (toEnrich.length === 0) {
      return NextResponse.json({ error: "Aucun prospect trouvé" }, { status: 404 });
    }

    // Collect unique company names to avoid duplicate API calls
    const companyNames = [...new Set(toEnrich.map((r) => r.entreprise?.trim()).filter(Boolean))];
    console.log(`[API Gouv] Enriching ${companyNames.length} unique companies for ${toEnrich.length} prospects`);

    // Search each company (with rate limiting)
    const companyResults = new Map<string, GouvEnrichResult | null>();
    for (let i = 0; i < companyNames.length; i++) {
      const name = companyNames[i];
      try {
        const result = await searchEntreprise(name);
        companyResults.set(name.toLowerCase(), result);
      } catch (err) {
        console.error(`[API Gouv] Error for "${name}":`, err);
        companyResults.set(name.toLowerCase(), null);
      }
      // Rate limit: 200ms between requests (~5 req/sec)
      if (i < companyNames.length - 1) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    // Apply results to prospects
    const enrichResults: { id: string; name: string; company: string; status: string; fields: string[] }[] = [];

    await withLock("prospects.json", async () => {
      const allRows = await readBlob<ProspectRow>("prospects.json");

      for (const id of ids) {
        const idx = allRows.findIndex((r) => String(r.id) === String(id));
        if (idx === -1) {
          enrichResults.push({ id, name: "?", company: "?", status: "not_found", fields: [] });
          continue;
        }

        const row = allRows[idx];
        const companyKey = row.entreprise?.trim().toLowerCase() || "";
        const result = companyResults.get(companyKey);

        if (!result) {
          enrichResults.push({
            id,
            name: `${row.prenom} ${row.nom}`,
            company: row.entreprise || "",
            status: "no_match",
            fields: [],
          });
          continue;
        }

        const updatedFields: string[] = [];

        // SIREN / SIRET — always overwrite
        if (result.siren) { allRows[idx].siren = result.siren; updatedFields.push("siren"); }
        if (result.siret) { allRows[idx].siret = result.siret; updatedFields.push("siret"); }

        // NAF — overwrite if empty or if more precise
        if (result.naf_code && !allRows[idx].naf_code) {
          allRows[idx].naf_code = result.naf_code;
          updatedFields.push("naf_code");
        }

        // Effectifs — overwrite if empty
        if (result.effectifs && !allRows[idx].effectifs) {
          allRows[idx].effectifs = result.effectifs;
          updatedFields.push("effectifs");
        }

        // Adresse siège
        if (result.adresse_siege) {
          allRows[idx].adresse_siege = result.adresse_siege;
          updatedFields.push("adresse_siege");
        }

        // Ville
        if (result.ville) {
          allRows[idx].ville = result.ville;
          updatedFields.push("ville");
        }

        // Catégorie entreprise (PME, ETI, GE)
        if (result.categorie_entreprise) {
          allRows[idx].categorie_entreprise = result.categorie_entreprise;
          updatedFields.push("categorie_entreprise");
        }

        // Chiffre d'affaires
        if (result.chiffre_affaires !== null) {
          allRows[idx].chiffre_affaires = `${result.chiffre_affaires}`;
          updatedFields.push("chiffre_affaires");
        }

        // Résultat net
        if (result.resultat_net !== null) {
          allRows[idx].resultat_net = `${result.resultat_net}`;
          updatedFields.push("resultat_net");
        }

        // Date création
        if (result.date_creation) {
          allRows[idx].date_creation_entreprise = result.date_creation;
          updatedFields.push("date_creation_entreprise");
        }

        // Dirigeants
        if (result.dirigeants) {
          allRows[idx].dirigeants = result.dirigeants;
          updatedFields.push("dirigeants");
        }

        enrichResults.push({
          id,
          name: `${row.prenom} ${row.nom}`,
          company: row.entreprise || "",
          status: updatedFields.length > 0 ? "enriched" : "no_new_data",
          fields: updatedFields,
        });
      }

      await writeBlob("prospects.json", allRows);
    });

    const enriched = enrichResults.filter((r) => r.status === "enriched").length;
    const noMatch = enrichResults.filter((r) => r.status === "no_match").length;

    return NextResponse.json({
      success: true,
      total: ids.length,
      enriched,
      noMatch,
      companiesSearched: companyNames.length,
      results: enrichResults,
    });
  } catch (error) {
    console.error("POST /api/prospects/enrich-gouv error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
