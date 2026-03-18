/**
 * API Route — Refine followup email with AI
 * POST /api/summary/refine
 * Body: { currentEmail: string, currentSubject: string, prompt: string, contactName: string }
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-guard";
import { askAzureAI } from "@/lib/azure-ai";

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.denied) return guard.denied;
  try {
    const body = await request.json();
    const { currentEmail, currentSubject, prompt, contactName } = body;

    if (!currentEmail || !prompt) {
      return NextResponse.json({ error: "Email et prompt requis" }, { status: 400 });
    }

    const systemPrompt = `Tu es l'assistant commercial de Tony chez Metagora (formation immersive IA pour le retail/luxe).
Tu reçois un email de followup déjà rédigé et une instruction de modification de Tony.
Applique la modification demandée tout en gardant le ton professionnel mais naturel.
Le contact s'appelle "${contactName || "inconnu"}".
Réponds UNIQUEMENT avec le nouvel email modifié (pas de commentaire). Signe toujours "Tony" à la fin.
Sépare bien les paragraphes par des lignes vides pour aérer le texte.
Si Tony demande de changer l'objet, fournis aussi le nouvel objet au format : Objet: [nouvel objet]
suivi d'une ligne vide puis le corps du mail.`;

    const userContent = `Email actuel :
Objet: ${currentSubject}

${currentEmail}

Instruction de modification : ${prompt}`;

    const raw = (await askAzureAI([
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ], 800)).replace(/[*#]/g, "");

    // Extract subject if present
    let refinedSubject = currentSubject;
    let refinedEmail = raw;
    const subjectMatch = raw.match(/^Objet\s*:\s*(.+)/im);
    if (subjectMatch) {
      refinedSubject = subjectMatch[1].trim();
      refinedEmail = raw.replace(/^Objet\s*:.+\n?/im, "").trim();
    }

    return NextResponse.json({
      data: { followupEmail: refinedEmail, followupSubject: refinedSubject },
    });
  } catch (error) {
    console.error("POST /api/summary/refine error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
