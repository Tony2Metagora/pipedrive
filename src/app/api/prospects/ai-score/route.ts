/**
 * API Route — AI Scoring & Analysis for prospects (SSE streaming)
 * POST { ids: string[] }
 * Uses gpt-5.4-pro (askAzureAI) to generate:
 *   - ai_score (1-5): pertinence du prospect pour Metagora
 *   - ai_comment: analyse courte du prospect
 *   - resume_entreprise: résumé de l'entreprise
 * Returns SSE stream with progress events.
 */

import { readBlob, writeBlob, withLock } from "@/lib/blob-store";
import { requireAuth } from "@/lib/api-guard";
import { askAzureAI } from "@/lib/azure-ai";

interface ProspectRow {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  poste: string;
  entreprise: string;
  statut: string;
  naf_code: string;
  effectifs: string;
  categorie_entreprise?: string;
  chiffre_affaires?: string;
  dirigeants?: string;
  ville?: string;
  ai_score?: string;
  ai_comment?: string;
  resume_entreprise?: string;
  [key: string]: unknown;
}

const SYSTEM_PROMPT = `Tu es un expert en qualification de prospects B2B pour Metagora.

METAGORA : startup IA spécialisée dans la formation retail & luxe par simulation IA.
- Produit phare : Simsell — simulateur de vente IA pour vendeurs retail/luxe
- Cibles idéales : grands groupes retail, luxe, cosmétique, mode, vin & spiritueux, grande distribution
- Décideurs ciblés : DRH, Directeur Formation, L&D Manager, Directeur Retail, DG
- Taille idéale : ETI et GE (>200 employés), mais PME retail/luxe aussi pertinentes

Pour chaque prospect, tu dois évaluer :
1. **ai_score** (1-5) : pertinence du prospect pour Metagora
   - 5 = Prospect parfait (secteur retail/luxe, décideur formation/RH, grande entreprise)
   - 4 = Très pertinent (bon secteur OU bon poste, entreprise significative)
   - 3 = Intéressant (potentiel indirect, secteur adjacent, poste pertinent)
   - 2 = Peu pertinent (secteur éloigné, poste non-décideur)
   - 1 = Non pertinent (hors cible)
2. **ai_comment** : analyse en 1-2 phrases (pourquoi ce score, quel angle d'approche)
3. **resume_entreprise** : résumé de l'entreprise en 1 phrase (secteur, taille, activité principale)

Réponds en JSON array.`;

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
  const toScore = rows.filter((r) => idSet.has(String(r.id)));

  if (toScore.length === 0) {
    return new Response(JSON.stringify({ error: "Aucun prospect trouvé" }), { status: 404, headers: { "Content-Type": "application/json" } });
  }

  const prospectData = toScore.map((p) => ({
    id: p.id,
    nom: `${p.prenom} ${p.nom}`.trim(),
    poste: p.poste || "",
    entreprise: p.entreprise || "",
    naf: p.naf_code || "",
    effectifs: p.effectifs || "",
    categorie: p.categorie_entreprise || "",
    ca: p.chiffre_affaires || "",
    ville: p.ville || "",
  }));

  const BATCH_SIZE = 10;
  const totalBatches = Math.ceil(prospectData.length / BATCH_SIZE);

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      send("progress", { current: 0, total: toScore.length, batches: totalBatches, message: "Démarrage analyse IA..." });

      const allResults: { id: string; ai_score: string; ai_comment: string; resume_entreprise: string }[] = [];

      for (let batchStart = 0; batchStart < prospectData.length; batchStart += BATCH_SIZE) {
        const batchIdx = Math.floor(batchStart / BATCH_SIZE) + 1;
        const batch = prospectData.slice(batchStart, batchStart + BATCH_SIZE);

        send("progress", {
          current: batchStart,
          total: toScore.length,
          batches: totalBatches,
          batch: batchIdx,
          message: `Analyse batch ${batchIdx}/${totalBatches} (${batch.length} prospects)...`,
        });

        try {
          const userContent = `Analyse ces ${batch.length} prospects et donne un score + commentaire + résumé entreprise pour chacun :

${JSON.stringify(batch, null, 1)}

Réponds en JSON : [{"id": "xxx", "ai_score": 3, "ai_comment": "...", "resume_entreprise": "..."}]
Pas de markdown, pas de backticks, juste le JSON array.`;

          const result = await askAzureAI([
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userContent },
          ], 4000);

          const cleaned = result.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
          const parsed = JSON.parse(cleaned);
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              allResults.push({
                id: String(item.id),
                ai_score: String(item.ai_score || "0"),
                ai_comment: String(item.ai_comment || ""),
                resume_entreprise: String(item.resume_entreprise || ""),
              });
            }
          }
        } catch (err) {
          console.error(`[AI Score] Batch ${batchIdx} error:`, err);
          send("progress", { current: batchStart + batch.length, total: toScore.length, message: `Erreur batch ${batchIdx}, continue...` });
        }
      }

      // Save results
      send("progress", { current: toScore.length, total: toScore.length, message: "Sauvegarde des résultats..." });

      let updated = 0;
      try {
        await withLock("prospects.json", async () => {
          const allRows = await readBlob<ProspectRow>("prospects.json");
          const resultMap = new Map(allResults.map((r) => [r.id, r]));

          for (const row of allRows) {
            const aiResult = resultMap.get(String(row.id));
            if (aiResult) {
              row.ai_score = aiResult.ai_score;
              row.ai_comment = aiResult.ai_comment;
              row.resume_entreprise = aiResult.resume_entreprise;
              updated++;
            }
          }

          await writeBlob("prospects.json", allRows);
        });
      } catch (err) {
        console.error("[AI Score] Save error:", err);
      }

      send("done", { success: true, total: ids.length, scored: updated });
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
