/**
 * API Route — LinkedIn Post Generator
 * POST: uses Azure OpenAI to generate LinkedIn posts based on editorial line,
 *       selected theme, and writing style examples.
 *
 * Actions:
 *   - "suggest": suggest 5 post subjects for a given theme
 *   - "generate": generate a full LinkedIn post draft
 *   - "refine": refine/modify an existing post based on user instructions
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";

const ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT!;
const API_KEY = process.env.AZURE_OPENAI_API_KEY!;
const API_VERSION = process.env.AZURE_OPENAI_API_VERSION || "2024-12-01-preview";
const DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-5.2-chat-2";

export const dynamic = "force-dynamic";

/* ── Editorial line & style reference ────────────────────── */

const EDITORIAL_LINE = `Tony est CEO de Metagora, startup IA spécialisée dans la formation retail & luxe par simulation IA (clients virtuels).
Ton LinkedIn : "Journal d'un geek fraîchement passionné de retail" — il sort de sa grotte de codeur pour partager son aventure.

3 THÈMES ÉDITORIAUX :
1️⃣ Journal d'un CEO : Rencontres retail/luxe, bonnes pratiques partagées au détour de rencontres de personnes et marques inspirantes.
2️⃣ IA dans la formation : 15 ans d'expertise learning. Le e-learning cède la place à l'interactif boosté IA – visions & connaissances.
3️⃣ IA Opérationnelle : Vulgarisation IA (agentique, LLM, etc.) jusqu'à l'exploitation réelle chez Metagora (emails, projets, tâches).

CONTEXTE : Metagora propose Simsell, un simulateur IA de vente pour les vendeurs retail/luxe. Clients virtuels IA, scoring, feedback personnalisé.
Programmes : AWS Startup, Microsoft for Startups, Eleven Labs, NVIDIA Inception.`;

const STYLE_EXAMPLES = `STYLE D'ÉCRITURE DE TONY (à reproduire fidèlement) :
- Ton direct, authentique, jamais corporate. Comme s'il parlait à un ami.
- Phrases courtes. Rythme punchy. Sauts de ligne fréquents.
- Utilise des emojis comme marqueurs visuels (🎯📉💡🔹➤👉💬🚀) mais pas en excès.
- Commence souvent par un fait choc, une anecdote ou une question rhétorique.
- Storytelling : il raconte une situation concrète avant d'en tirer une leçon.
- Mélange données chiffrées + expérience perso + opinion tranchée.
- Termine par une question ouverte pour engager les lecteurs.
- Utilise des tirets longs "—" et "→" pour structurer.
- Tags des personnes quand pertinent.
- Hashtags en fin de post : #RetailTech #IA #Formation #Retail #Luxe
- Longueur : 150-300 mots (ni trop court ni pavé).
- JAMAIS de jargon corporate vide ("synergie", "disruption", "innovation paradigmatique").
- Ton humble mais affirmé : il partage ce qu'il apprend, pas ce qu'il sait déjà.

EXEMPLES DE POSTS QUI ONT BIEN MARCHÉ :
--- Post 1 (1500 impressions, 39 likes) ---
"Et si Maison Nicolas devenait un nouveau modèle de retail ? 🍷
Le 11 décembre, j'ai eu la chance d'être invité à l'événement Retail Tech...
Un moment riche, avec une intervention marquante de Cathy Collart Geiger, DG de Maison Nicolas.
🥂 Anecdote étonnante : C'est grâce à son fondateur (en 1822) qu'on doit… la mise en bouteille du vin.
Aujourd'hui, les usages ont changé. 📉 La consommation annuelle de vin est passée de 100L en 1975 à 35L aujourd'hui...
La vision de Cathy est claire : ne pas résister au changement, mais le piloter avec audace.
💬 L'événement a aussi été l'occasion d'échanger avec Carrefour et Intermarché sur notre futur lancement."

--- Post 2 (2350 impressions, 5 likes, 1 republication) ---
"49 % des GenZ achètent volontairement des dupes.
Ce n'est plus une exception. C'est une norme...
On croyait que la valeur était dans la marque. Elle est désormais dans la validation sociale.
💰 Le marketing d'influence est passé de 500M à 32,5 milliards $ entre 2015 et 2025.
La marque n'est plus le centre. C'est le contenu qui décide...
🔁 Et toi, tu penses que les dupes affaiblissent les marques… ou qu'ils révèlent une perte de lien ?"

--- Post 3 (723 impressions, 7 likes) ---
"Tu ne feras jamais carrière dans la vente."
C'est ce qu'on a dit à l'homme qui allait bâtir la plus grande entreprise de retail au monde.
En 1940, Sam Walton décroche son premier job. Vendeur textile chez J.C. Penney...
Quelques années plus tard, il ouvre son premier magasin. Puis un deuxième. Puis 10. Puis 1 000.
Aujourd'hui, Walmart c'est : 🏬 10 500 magasins, 👥 2,1M d'employés, 💰 648 milliards $"

POST QUI N'A PAS MARCHÉ (190 impressions, 3 likes) — trop formaté, trop "listicle", pas assez storytelling :
"🧠Le QCM mesure ce qu'on sait. Mais le QBM mesure ce qu'on sait faire quand ça dérape..."
→ Éviter ce format trop structuré/didactique. Préférer le storytelling et l'anecdote.`;

const THEMES = {
  "journal-ceo": {
    name: "Journal d'un CEO",
    description: "Rencontres retail/luxe, bonnes pratiques, personnes et marques inspirantes",
    emoji: "1️⃣",
  },
  "ia-formation": {
    name: "IA dans la formation",
    description: "15 ans d'expertise learning, e-learning → interactif IA, visions & connaissances",
    emoji: "2️⃣",
  },
  "ia-operationnelle": {
    name: "IA Opérationnelle",
    description: "Vulgarisation IA (agentique, LLM), exploitation réelle chez Metagora",
    emoji: "3️⃣",
  },
};

/* ── AI helper ───────────────────────────────────────────── */

async function askAI(
  messages: { role: string; content: string }[],
  maxTokens = 1500
): Promise<string> {
  const url = `${ENDPOINT}openai/deployments/${DEPLOYMENT}/chat/completions?api-version=${API_VERSION}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": API_KEY },
    body: JSON.stringify({ messages, max_completion_tokens: maxTokens }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Azure OpenAI error:", res.status, err);
    throw new Error(`Azure OpenAI ${res.status}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

/* ── POST handler ────────────────────────────────────────── */

export async function POST(request: Request) {
  const guard = await requireAuth("linkedin", "POST");
  if (guard.denied) return guard.denied;

  try {
    const body = await request.json();
    const { action, theme, subject, currentPost, instructions } = body;

    if (action === "suggest") {
      // Suggest 5 post subjects for a given theme
      const themeInfo = THEMES[theme as keyof typeof THEMES];
      if (!themeInfo) {
        return NextResponse.json({ error: "Thème invalide" }, { status: 400 });
      }

      const result = await askAI([
        {
          role: "system",
          content: `Tu es un expert LinkedIn et content strategist pour Tony, CEO de Metagora (startup IA retail/luxe).

${EDITORIAL_LINE}

${STYLE_EXAMPLES}`,
        },
        {
          role: "user",
          content: `Suggère exactement 5 sujets de posts LinkedIn pour le thème "${themeInfo.emoji} ${themeInfo.name}" (${themeInfo.description}).

Chaque sujet doit :
- Être concret et spécifique (pas vague)
- Avoir un angle storytelling ou data fort
- Correspondre au style de Tony (direct, authentique, anecdotes)
- Être formulé comme un titre accrocheur de 10-20 mots

Réponds en JSON : {"subjects": ["sujet 1", "sujet 2", "sujet 3", "sujet 4", "sujet 5"]}
Pas de markdown, pas de backticks, juste le JSON.`,
        },
      ], 800);

      try {
        const cleaned = result.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
        const parsed = JSON.parse(cleaned);
        return NextResponse.json({ data: parsed });
      } catch {
        return NextResponse.json({ data: { subjects: result.split("\n").filter(Boolean).slice(0, 5) } });
      }
    }

    if (action === "generate") {
      // Generate a full LinkedIn post
      const themeInfo = THEMES[theme as keyof typeof THEMES];
      if (!themeInfo || !subject) {
        return NextResponse.json({ error: "Thème et sujet requis" }, { status: 400 });
      }

      const post = await askAI([
        {
          role: "system",
          content: `Tu es le ghostwriter LinkedIn de Tony, CEO de Metagora. Tu dois rédiger un post LinkedIn en son nom.

${EDITORIAL_LINE}

${STYLE_EXAMPLES}

CONSIGNES IMPÉRATIVES :
- Reproduis fidèlement le STYLE de Tony (ton direct, phrases courtes, emojis visuels, storytelling).
- Le post doit faire entre 150 et 300 mots.
- Commence par une accroche forte (fait choc, question rhétorique, ou anecdote).
- Termine par une question ouverte pour l'engagement.
- Ajoute des hashtags pertinents à la fin.
- N'utilise JAMAIS de jargon corporate vide.
- Écris en FRANÇAIS.`,
        },
        {
          role: "user",
          content: `Rédige un post LinkedIn sur le thème "${themeInfo.emoji} ${themeInfo.name}" avec le sujet suivant :
"${subject}"

Écris le post complet, prêt à copier-coller sur LinkedIn.`,
        },
      ], 2000);

      return NextResponse.json({ data: { post } });
    }

    if (action === "refine") {
      // Refine an existing post
      if (!currentPost || !instructions) {
        return NextResponse.json({ error: "Post actuel et instructions requis" }, { status: 400 });
      }

      const refined = await askAI([
        {
          role: "system",
          content: `Tu es le ghostwriter LinkedIn de Tony, CEO de Metagora. Tu dois modifier un post LinkedIn existant selon les instructions de Tony.

${STYLE_EXAMPLES}

CONSIGNES :
- Garde le même style et ton que le post original.
- Applique les modifications demandées par Tony.
- Garde entre 150 et 300 mots.
- Retourne UNIQUEMENT le post modifié, rien d'autre.`,
        },
        {
          role: "user",
          content: `Voici mon post actuel :
---
${currentPost}
---

Modifications demandées : ${instructions}

Réécris le post modifié.`,
        },
      ], 2000);

      return NextResponse.json({ data: { post: refined } });
    }

    return NextResponse.json({ error: "Action invalide" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/linkedin/generate error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
