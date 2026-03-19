/**
 * API Route — Enrichissement prospects via API Recherche d'entreprises (data.gouv.fr)
 * POST { ids: string[] } → SSE stream avec progression
 * Gratuit, pas de clé API.
 */

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

  const body = await request.json();
  const { ids } = body as { ids: string[] };

  if (!ids?.length) {
    return new Response(JSON.stringify({ error: "ids[] requis" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const rows = await readBlob<ProspectRow>("prospects.json");
  const idSet = new Set(ids.map(String));
  const toEnrich = rows.filter((r) => idSet.has(String(r.id)));

  if (toEnrich.length === 0) {
    return new Response(JSON.stringify({ error: "Aucun prospect trouvé" }), { status: 404, headers: { "Content-Type": "application/json" } });
  }

  const companyNames = [...new Set(toEnrich.map((r) => r.entreprise?.trim()).filter(Boolean))];

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      send("progress", { current: 0, total: companyNames.length, message: `Recherche de ${companyNames.length} entreprises...` });

      // Search each company (with rate limiting)
      const companyResults = new Map<string, GouvEnrichResult | null>();
      for (let i = 0; i < companyNames.length; i++) {
        const name = companyNames[i];

        send("progress", { current: i, total: companyNames.length, message: `${i + 1}/${companyNames.length} — ${name}` });

        try {
          const result = await searchEntreprise(name);
          companyResults.set(name.toLowerCase(), result);
        } catch (err) {
          console.error(`[API Gouv] Error for "${name}":`, err);
          companyResults.set(name.toLowerCase(), null);
        }
        if (i < companyNames.length - 1) {
          await new Promise((r) => setTimeout(r, 200));
        }
      }

      // Apply results
      send("progress", { current: companyNames.length, total: companyNames.length, message: "Sauvegarde des résultats..." });

      let enrichedCount = 0;
      let noMatchCount = 0;

      try {
        await withLock("prospects.json", async () => {
          const allRows = await readBlob<ProspectRow>("prospects.json");

          for (const id of ids) {
            const idx = allRows.findIndex((r) => String(r.id) === String(id));
            if (idx === -1) continue;

            const row = allRows[idx];
            const companyKey = row.entreprise?.trim().toLowerCase() || "";
            const result = companyResults.get(companyKey);

            if (!result) { noMatchCount++; continue; }

            let hasUpdate = false;
            if (result.siren) { allRows[idx].siren = result.siren; hasUpdate = true; }
            if (result.siret) { allRows[idx].siret = result.siret; hasUpdate = true; }
            if (result.naf_code && !allRows[idx].naf_code) { allRows[idx].naf_code = result.naf_code; hasUpdate = true; }
            if (result.effectifs && !allRows[idx].effectifs) { allRows[idx].effectifs = result.effectifs; hasUpdate = true; }
            if (result.adresse_siege) { allRows[idx].adresse_siege = result.adresse_siege; hasUpdate = true; }
            if (result.ville) { allRows[idx].ville = result.ville; hasUpdate = true; }
            if (result.categorie_entreprise) { allRows[idx].categorie_entreprise = result.categorie_entreprise; hasUpdate = true; }
            if (result.chiffre_affaires !== null) { allRows[idx].chiffre_affaires = `${result.chiffre_affaires}`; hasUpdate = true; }
            if (result.resultat_net !== null) { allRows[idx].resultat_net = `${result.resultat_net}`; hasUpdate = true; }
            if (result.date_creation) { allRows[idx].date_creation_entreprise = result.date_creation; hasUpdate = true; }
            if (result.dirigeants) { allRows[idx].dirigeants = result.dirigeants; hasUpdate = true; }

            if (hasUpdate) enrichedCount++;
          }

          await writeBlob("prospects.json", allRows);
        });
      } catch (err) {
        console.error("[API Gouv] Save error:", err);
      }

      send("done", { success: true, total: ids.length, enriched: enrichedCount, noMatch: noMatchCount, companiesSearched: companyNames.length });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
