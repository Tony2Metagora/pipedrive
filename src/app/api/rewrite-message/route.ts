/**
 * API Route — Réécriture IA d'un message
 * POST { message, prompt, contactName, contactCompany }
 * Utilise Azure OpenAI pour réécrire le message selon le prompt
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-guard";
import { askAzureAI } from "@/lib/azure-ai";

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.denied) return guard.denied;
  try {
    const { message, prompt, contactName, contactCompany } = await request.json();

    if (!message || !prompt) {
      return NextResponse.json({ error: "message et prompt requis" }, { status: 400 });
    }

    const systemMessage = `Tu es l'assistant commercial de Tony chez Metagora (formation immersive IA pour le retail/luxe).
Tu dois réécrire un message commercial en suivant les instructions de Tony.

REGLES :
- Garde le ton professionnel mais chaleureux du message original
- Adapte le message au contact : ${contactName || "le contact"}${contactCompany ? ` chez ${contactCompany}` : ""}
- Applique exactement les modifications demandées par Tony
- Ne rajoute pas de formatage markdown
- Retourne UNIQUEMENT le message réécrit, rien d'autre (pas de "Voici le message réécrit :" etc.)
- Signe "Tony" si le message original est signé`;

    const rewritten = await askAzureAI([
      { role: "system", content: systemMessage },
      { role: "user", content: `Message actuel :\n---\n${message}\n---\n\nInstruction de modification :\n${prompt}` },
    ], 1500) || message;

    return NextResponse.json({ data: { message: rewritten } });
  } catch (error) {
    console.error("POST /api/rewrite-message error:", error);
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
