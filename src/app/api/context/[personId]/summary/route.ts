/**
 * API Route — Résumé IA du contexte d'un contact
 * POST : génère un résumé intelligent via Azure OpenAI
 */

import { NextResponse } from "next/server";

const ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT!;
const API_KEY = process.env.AZURE_OPENAI_API_KEY!;
const API_VERSION = process.env.AZURE_OPENAI_API_VERSION || "2024-12-01-preview";
const DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-5.2-chat-2";

export async function POST(request: Request) {
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

    const url = `${ENDPOINT}openai/deployments/${DEPLOYMENT}/chat/completions?api-version=${API_VERSION}`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": API_KEY,
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content: `Voici le contexte du contact :\n\n${context}` },
        ],
        max_completion_tokens: 800,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Azure OpenAI error: ${res.status} ${text}`);
    }

    const json = await res.json();
    const summary = json.choices?.[0]?.message?.content?.trim() ?? "Impossible de générer un résumé.";

    return NextResponse.json({ data: { summary } });
  } catch (error) {
    console.error("POST /api/context/[personId]/summary error:", error);
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
