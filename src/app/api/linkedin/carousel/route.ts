/**
 * API Route — LinkedIn Carousel Generator (v2)
 * POST actions:
 *   - "generate-drafts" : AI generates structured carousel slides from a pitch
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import { askAzureFast } from "@/lib/azure-ai";
import { LOGO_KEYS } from "@/lib/carousel-template";
import type { CarouselSlide } from "@/lib/carousel-template";

function parseJsonSafe<T>(raw: string, fallback: T): T {
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

async function generateStructuredDrafts(prompt: string): Promise<{ title: string; slides: CarouselSlide[] }> {
  const logoList = LOGO_KEYS.filter((k) => k !== "generic").join(", ");

  const raw = await askAzureFast(
    [
      {
        role: "system",
        content: `Tu es un copywriter LinkedIn expert en carrousels éducatifs/informatifs. Tu crées des carrousels pour Tony, CEO de Metagora (formation retail/luxe par IA).

Réponds UNIQUEMENT en JSON valide, sans markdown, sans backticks.`,
      },
      {
        role: "user",
        content: `Crée un carrousel LinkedIn à partir de ce pitch :
"${prompt}"

INSTRUCTIONS :
1. Choisis le nombre optimal de slides (entre 5 et 10, adapté au contenu)
2. Slide 1 = couverture avec un titre accrocheur (type: "cover")
3. Slides intermédiaires = 1 idée par slide (type: "content")
   - Chaque slide a un "role" (titre court en 3-5 mots, ex: "L'assistant pour", "Le créatif pour")
   - 2-3 bullet points concrets (15-25 mots par bullet)
   - 1-2 mises en garde optionnelles (section "Attention")
   - Un logo d'outil si pertinent (choix parmi: ${logoList}). Mettre "generic" si aucun outil spécifique.
4. Dernière slide = CTA (type: "cta")
5. Ton : direct, simple, actionnable. Pas de jargon.

FORMAT JSON :
{
  "title": "titre du carrousel",
  "slides": [
    { "number": 1, "type": "cover", "title": "Le titre accrocheur" },
    { "number": 2, "type": "content", "role": "L'assistant pour", "logo": "chatgpt", "bullets": ["bullet 1", "bullet 2"], "warnings": ["attention 1"] },
    { "number": 3, "type": "content", "role": "Le chercheur pour", "logo": "perplexity", "bullets": ["bullet 1", "bullet 2", "bullet 3"], "warnings": [] },
    { "number": N, "type": "cta" }
  ]
}`,
      },
    ],
    3000
  );

  const parsed = parseJsonSafe<{ title?: string; slides?: CarouselSlide[] }>(raw, {});
  const title = parsed.title || "Carrousel LinkedIn";
  const slides = Array.isArray(parsed.slides) ? parsed.slides : [];

  // Validate and clean slides
  const cleaned: CarouselSlide[] = slides.map((s, i) => ({
    number: s.number || i + 1,
    type: s.type || "content",
    title: s.title,
    role: s.role,
    logo: s.logo && LOGO_KEYS.includes(s.logo) ? s.logo : s.logo ? "generic" : undefined,
    bullets: Array.isArray(s.bullets) ? s.bullets.map(String) : undefined,
    warnings: Array.isArray(s.warnings) ? s.warnings.filter(Boolean).map(String) : undefined,
  }));

  // Ensure cover and CTA exist
  if (cleaned.length === 0 || cleaned[0].type !== "cover") {
    cleaned.unshift({ number: 1, type: "cover", title });
  }
  if (cleaned[cleaned.length - 1].type !== "cta") {
    cleaned.push({ number: cleaned.length + 1, type: "cta" });
  }

  // Renumber
  cleaned.forEach((s, i) => { s.number = i + 1; });

  return { title, slides: cleaned };
}

export async function POST(request: Request) {
  const guard = await requireAuth("linkedin", "POST");
  if (guard.denied) return guard.denied;

  try {
    const body = (await request.json()) as {
      action?: string;
      prompt?: string;
    };

    if (body.action === "generate-drafts") {
      if (!body.prompt?.trim()) {
        return NextResponse.json({ error: "Prompt requis" }, { status: 400 });
      }
      const draft = await generateStructuredDrafts(body.prompt);
      return NextResponse.json({ data: draft });
    }

    return NextResponse.json({ error: "Action invalide" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/linkedin/carousel error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
