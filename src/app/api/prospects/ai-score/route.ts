/**
 * API Route — AI Scoring & Analysis for prospects (SSE streaming)
 * POST { ids: string[] }
 * Uses gpt-5.2-chat (askAzureFast) — fast Chat Completions API (~3-5s/batch)
 * Generates: ai_score (1-5), ai_comment, resume_entreprise
 * Runs 4 batches of 20 in parallel → ~15s for 120 contacts
 */

import { readBlob, writeBlob, withLock } from "@/lib/blob-store";
import { requireAuth } from "@/lib/api-guard";
import { askAzureFast } from "@/lib/azure-ai";
import type { ScoringCorrection } from "@/app/api/prospects/scoring-memory/route";
import type { ScoringCard } from "@/app/api/scoring-cards/route";

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

const METAGORA_FALLBACK_PROMPT = `Tu es un expert en qualification de prospects B2B pour Metagora.

METAGORA : startup IA spécialisée dans la formation retail & luxe par simulation IA.
- Produit phare : Simsell — simulateur de vente IA pour vendeurs retail/luxe
- Cibles idéales : grands groupes retail, luxe, cosmétique, mode, vin & spiritueux, grande distribution
- Décideurs ciblés : DRH, Directeur Formation, L&D Manager, Directeur Retail, DG
- Taille idéale : ETI et GE (>200 employés), mais PME retail/luxe aussi pertinentes`;

function normalizeBrandKey(value: string): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Build dynamic system prompt from scoring card or fallback to hardcoded Metagora */
function buildBasePrompt(card: ScoringCard | null, companyName: string): string {
  let companyContext: string;

  if (card && card.product) {
    // Dynamic prompt from scoring card
    const clientTypes = card.ideal_client_types.filter(Boolean).map((t) => `  - ${t}`).join("\n");
    const goodExamples = card.good_leads.slice(0, 10).map((l) =>
      `  - BON (${l.rating}/5) : "${l.poste}" chez "${l.entreprise}"${l.reason ? ` → ${l.reason}` : ""}`
    ).join("\n");
    const badExamples = card.bad_leads.slice(0, 10).map((l) =>
      `  - MAUVAIS (${l.rating}/5) : "${l.poste}" chez "${l.entreprise}"${l.reason ? ` → ${l.reason}` : ""}`
    ).join("\n");

    companyContext = `Tu es un expert en qualification de prospects B2B pour ${companyName}.

${companyName.toUpperCase()} :
- Produit : ${card.product}
- Valeur ajoutée : ${card.value_proposition}
- Types de clients idéaux :
${clientTypes}
- Taille d'entreprise : idéale ${card.company_size_ideal}, min ${card.company_size_min}, max ${card.company_size_max}
${goodExamples ? `
--- EXEMPLES DE BONS LEADS (à privilégier) ---
${goodExamples}` : ""}
${badExamples ? `
--- EXEMPLES DE MAUVAIS LEADS (à éviter) ---
${badExamples}` : ""}`;
  } else {
    companyContext = METAGORA_FALLBACK_PROMPT;
  }

  return `${companyContext}

Pour chaque prospect, tu dois évaluer :
1. **ai_score** (1-5) : pertinence du prospect pour ${companyName}
   - 5 = Prospect parfait (profil et secteur idéaux, décideur clé)
   - 4 = Très pertinent (bon secteur OU bon poste, entreprise significative)
   - 3 = Intéressant (potentiel indirect, secteur adjacent, poste pertinent)
   - 2 = Peu pertinent (secteur éloigné, poste non-décideur)
   - 1 = Non pertinent (hors cible)
2. **ai_comment** : analyse en 1-2 phrases (pourquoi ce score, quel angle d'approche)
3. **resume_entreprise** : résumé de l'entreprise en 1 phrase (secteur, taille, activité principale)

Réponds UNIQUEMENT en JSON array, sans markdown, sans backticks.`;
}

/** Build system prompt with RAG scoring memory injected */
function buildSystemPrompt(card: ScoringCard | null, companyName: string, corrections: ScoringCorrection[]): string {
  const base = buildBasePrompt(card, companyName);
  if (corrections.length === 0) return base;

  // Take last 50 corrections max to avoid token overflow
  const recent = corrections.slice(-50);
  const examples = recent.map((c) =>
    `- "${c.poste}" chez "${c.entreprise}" : score corrigé de ${c.old_score} → ${c.new_score}. Raison : ${c.reason}`
  ).join("\n");

  return `${base}

--- APPRENTISSAGE (corrections humaines précédentes) ---
Voici des corrections faites par l'humain sur des scorings précédents. Utilise ces exemples pour calibrer tes scores. Ces corrections sont PRIORITAIRES sur tes propres estimations quand un profil similaire apparaît :

${examples}

Applique ces apprentissages systématiquement.`;
}

type AIResult = { id: string; ai_score: string; ai_comment: string; resume_entreprise: string };

export async function POST(request: Request) {
  const guard = await requireAuth("prospects", "POST");
  if (guard.denied) return guard.denied;

  const body = await request.json();
  const { ids, brand } = body as { ids: string[]; brand?: string };

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

  const BATCH_SIZE = 20;
  const PARALLEL = 2;
  const batches: { idx: number; data: typeof prospectData }[] = [];
  for (let i = 0; i < prospectData.length; i += BATCH_SIZE) {
    batches.push({ idx: batches.length + 1, data: prospectData.slice(i, i + BATCH_SIZE) });
  }
  const totalBatches = batches.length;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch { /* stream closed */ }
      };

      // Load scoring card + memory for RAG
      const brandKey = normalizeBrandKey(brand || "metagora");
      const companyName = brand || "Metagora";
      let scoringCard: ScoringCard | null = null;
      try {
        const cards = await readBlob<ScoringCard>("scoring-cards.json");
        scoringCard = cards.find((c) => normalizeBrandKey(c.company) === brandKey) || null;
        if (scoringCard) console.log(`[AI Score] Using scoring card for "${companyName}" (${scoringCard.good_leads.length} good, ${scoringCard.bad_leads.length} bad leads)`);
      } catch { /* no cards yet */ }
      let corrections: ScoringCorrection[] = [];
      try {
        const all = await readBlob<ScoringCorrection>("scoring-memory.json");
        corrections = all.filter((c) => normalizeBrandKey(c.brand) === brandKey);
        console.log(`[AI Score] Loaded ${corrections.length} scoring corrections for "${brandKey}"`);
      } catch { /* no corrections yet */ }
      const systemPrompt = buildSystemPrompt(scoringCard, companyName, corrections);

      console.log(`[AI Score] Starting: ${toScore.length} prospects, ${totalBatches} batches, ×${PARALLEL} parallel`);
      send("progress", { current: 0, total: totalBatches, message: `Analyse IA — ${totalBatches} batches (×${PARALLEL} en parallèle)...` });

      const allResults: AIResult[] = [];
      let completedBatches = 0;
      let errorCount = 0;

      const processBatch = async (batch: typeof batches[0]): Promise<void> => {
        const t0 = Date.now();
        const userContent = `Analyse ces ${batch.data.length} prospects et donne un score + commentaire + résumé entreprise pour chacun :

${JSON.stringify(batch.data, null, 1)}

Réponds en JSON : [{"id": "xxx", "ai_score": 3, "ai_comment": "...", "resume_entreprise": "..."}]
Pas de markdown, pas de backticks, juste le JSON array.`;

        try {
          const result = await askAzureFast([
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ], 3000);

          console.log(`[AI Score] Batch ${batch.idx} OK in ${Date.now() - t0}ms, response length: ${result.length}`);

          const cleaned = result.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
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
          } else {
            console.error(`[AI Score] Batch ${batch.idx}: response is not an array`);
            errorCount++;
          }
        } catch (err) {
          console.error(`[AI Score] Batch ${batch.idx} FAILED after ${Date.now() - t0}ms:`, err);
          errorCount++;
        }
        completedBatches++;
        send("progress", {
          current: completedBatches,
          total: totalBatches,
          message: `Batch ${completedBatches}/${totalBatches} terminé${errorCount > 0 ? ` (${errorCount} erreur${errorCount > 1 ? "s" : ""})` : ""}`,
        });
      };

      // Run batches in parallel windows
      for (let i = 0; i < batches.length; i += PARALLEL) {
        const window = batches.slice(i, i + PARALLEL);
        send("progress", {
          current: completedBatches,
          total: totalBatches,
          message: `Batches ${completedBatches + 1}–${Math.min(completedBatches + window.length, totalBatches)}/${totalBatches} en cours...`,
        });
        await Promise.all(window.map(processBatch));
      }

      // Save results
      console.log(`[AI Score] All batches done. ${allResults.length} results, ${errorCount} errors. Saving...`);
      send("progress", { current: totalBatches, total: totalBatches, message: `Sauvegarde de ${allResults.length} résultats...` });

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
        console.log(`[AI Score] Saved ${updated} prospects`);
      } catch (err) {
        console.error("[AI Score] Save error:", err);
      }

      send("done", { success: true, total: ids.length, scored: updated, errors: errorCount });
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
