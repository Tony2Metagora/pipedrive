/**
 * API Route — AI Scoring & Analysis for prospects
 * POST { ids: string[] }
 * Uses GPT to generate:
 *   - ai_score (1-5): pertinence du prospect pour Metagora
 *   - ai_comment: analyse courte du prospect
 *   - resume_entreprise: résumé de l'entreprise
 */

import { NextResponse } from "next/server";
import { readBlob, writeBlob, withLock } from "@/lib/blob-store";
import { requireAuth } from "@/lib/api-guard";
import { askAzureFast } from "@/lib/azure-ai";

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

  try {
    const body = await request.json();
    const { ids } = body as { ids: string[] };

    if (!ids?.length) {
      return NextResponse.json({ error: "ids[] requis" }, { status: 400 });
    }
    if (ids.length > 30) {
      return NextResponse.json({ error: "Maximum 30 contacts à la fois pour l'analyse IA" }, { status: 400 });
    }

    const rows = await readBlob<ProspectRow>("prospects.json");
    const idSet = new Set(ids.map(String));
    const toScore = rows.filter((r) => idSet.has(String(r.id)));

    if (toScore.length === 0) {
      return NextResponse.json({ error: "Aucun prospect trouvé" }, { status: 404 });
    }

    // Build compact prospect data for the AI
    const prospectData = toScore.map((p, i) => ({
      idx: i,
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

    // Process in batches of 10 to avoid token limits
    const BATCH_SIZE = 10;
    const allResults: { id: string; ai_score: string; ai_comment: string; resume_entreprise: string }[] = [];

    for (let batchStart = 0; batchStart < prospectData.length; batchStart += BATCH_SIZE) {
      const batch = prospectData.slice(batchStart, batchStart + BATCH_SIZE);

      const userContent = `Analyse ces ${batch.length} prospects et donne un score + commentaire + résumé entreprise pour chacun :

${JSON.stringify(batch, null, 1)}

Réponds en JSON : [{"id": "xxx", "ai_score": 3, "ai_comment": "...", "resume_entreprise": "..."}]
Pas de markdown, pas de backticks, juste le JSON array.`;

      const result = await askAzureFast([
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ], 3000);

      try {
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
      } catch (parseErr) {
        console.error("[AI Score] Parse error for batch:", parseErr, "Raw:", result.slice(0, 500));
      }
    }

    // Apply results to prospects
    let updated = 0;
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

    return NextResponse.json({
      success: true,
      total: ids.length,
      scored: updated,
      results: allResults,
    });
  } catch (error) {
    console.error("POST /api/prospects/ai-score error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
