/**
 * API Route — AI Flagship Store Finder
 * POST: uses Azure OpenAI to find the flagship store name + address for a brand in a given city
 */

import { NextResponse } from "next/server";

const ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT!;
const API_KEY = process.env.AZURE_OPENAI_API_KEY!;
const API_VERSION = process.env.AZURE_OPENAI_API_VERSION || "2024-12-01-preview";
const DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-5.2-chat-2";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { brandName, city } = await request.json();

    if (!brandName || !city) {
      return NextResponse.json({ error: "brandName et city requis" }, { status: 400 });
    }

    const systemPrompt = `Tu es un expert en retail de luxe et premium. On te demande de trouver la boutique flagship emblématique d'une marque dans une ville donnée.

RÈGLES :
- Réponds UNIQUEMENT en JSON valide, sans markdown, sans backticks, sans explication.
- Le JSON doit avoir exactement cette structure : {"storeName": "...", "storeAddress": "..."}
- storeName : le nom officiel complet de la boutique (ex: "Louis Vuitton Maison Champs-Élysées")
- storeAddress : l'adresse postale complète avec code postal et ville (ex: "101 avenue des Champs-Élysées, 75008 Paris, France")
- Si la marque n'a pas de boutique flagship connue dans cette ville, invente PAS. Réponds : {"storeName": "", "storeAddress": "", "notFound": true}
- Privilégie toujours la boutique flagship la plus emblématique et prestigieuse de la marque dans cette ville.`;

    const userContent = `Trouve la boutique flagship emblématique de "${brandName}" à ${city}.`;

    const url = `${ENDPOINT}openai/deployments/${DEPLOYMENT}/chat/completions?api-version=${API_VERSION}`;

    const aiRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": API_KEY,
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        max_completion_tokens: 200,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("Azure OpenAI store-finder error:", aiRes.status, errText);
      return NextResponse.json({ error: "Erreur IA : " + aiRes.status }, { status: 500 });
    }

    const aiJson = await aiRes.json();
    const raw = aiJson.choices?.[0]?.message?.content?.trim() || "{}";

    // Parse JSON response
    let result;
    try {
      result = JSON.parse(raw);
    } catch {
      console.error("Failed to parse AI response:", raw);
      return NextResponse.json({ error: "Réponse IA invalide" }, { status: 500 });
    }

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("POST /api/landing/store-finder error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
