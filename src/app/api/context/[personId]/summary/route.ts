/**
 * API Route — Résumé IA du contexte d'un contact
 * POST : génère un résumé intelligent via Azure OpenAI
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-guard";
import { askAzureFast } from "@/lib/azure-ai";

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.denied) return guard.denied;
  try {
    const { context } = await request.json();

    const systemMessage = `Tu es l'assistant commercial de Tony chez Metagora (formation immersive IA pour le retail/luxe).
Tu reçois le contexte complet d'un contact.

Réponds EXACTEMENT dans ce format avec ces 3 sections. Chaque section fait 2-3 lignes max :

OPPORTUNITÉ COMMERCIALE
[Budget évoqué (montant si possible), niveau d'intérêt (chaud/tiède/froid), signaux d'achat, fraîcheur du contact (date dernier échange), type de relation (client/partenaire/prospect).]

SCOPE & BESOIN
[Besoin identifié dans les notes/deals : type de formation, produits, personas cibles, vertical métier, nombre d'accès, langues, etc.]

NEXT STEPS & ACTIONS
[Prochaines étapes : tâches en cours, relances à faire, documents à envoyer, RDV à planifier. Recommandation claire : relancer / archiver / attendre.]

RÈGLES : Texte brut sans formatage markdown. Pas de *, #, -. Phrases courtes et factuelles. Si une info n'est pas disponible, écris "Non mentionné".`;

    const summary = await askAzureFast([
      { role: "system", content: systemMessage },
      { role: "user", content: `Voici le contexte du contact :\n\n${context}` },
    ], 800) || "Impossible de générer un résumé.";

    return NextResponse.json({ data: { summary } });
  } catch (error) {
    console.error("POST /api/context/[personId]/summary error:", error);
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
