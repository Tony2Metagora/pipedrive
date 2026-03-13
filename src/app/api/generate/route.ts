/**
 * API Route — Génération de texte via Azure OpenAI
 * POST : générer un email ou SMS avec ChatGPT
 */

import { NextResponse } from "next/server";
import { generateText } from "@/lib/openai";
import { requireAdmin } from "@/lib/api-guard";

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.denied) return guard.denied;
  try {
    const body = await request.json();
    const { type, template, contact, dealNotes, userPrompt } = body;

    if (!type || !template) {
      return NextResponse.json(
        { error: "Type et template requis" },
        { status: 400 }
      );
    }

    const text = await generateText({
      type,
      template,
      contact: contact || {},
      dealNotes,
      userPrompt,
    });

    return NextResponse.json({ data: { text } });
  } catch (error) {
    console.error("POST /api/generate error:", error);
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
