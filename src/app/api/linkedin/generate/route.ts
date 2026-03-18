/**
 * API Route — LinkedIn Post Generator (v2)
 * POST actions:
 *   - "suggest"         : suggest 5 post subjects for a theme (no sources)
 *   - "scrape-suggest"  : scrape selected source URLs + suggest 10 subjects
 *   - "generate"        : generate full post + image prompt from subject
 *   - "hooks"           : generate 5 hook variants for a post
 *   - "refine-hook"     : refine a hook via user instructions
 *   - "refine"          : refine/modify an existing post
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";

const ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT!;
const API_KEY = process.env.AZURE_OPENAI_API_KEY!;
const API_VERSION = process.env.AZURE_OPENAI_API_VERSION || "2024-12-01-preview";
const DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-5.4-pro";

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

const HOOKS_BEST_PRACTICES = `BONNES PRATIQUES ACCROCHES LINKEDIN :
- L'accroche = les 2-3 premières lignes visibles avant "…voir plus"
- Doit créer curiosité, tension, émotion ou surprise
- Techniques efficaces :
  • Fait choc / statistique inattendue ("49% des GenZ achètent des dupes")
  • Citation provocante ("Tu ne feras jamais carrière dans la vente")
  • Question rhétorique percutante ("Et si le retail de demain se formait sans formateur ?")
  • Anecdote accrocheuse ("Le 11 décembre, j'ai découvert un truc dingue…")
  • Contre-intuition ("L'IA ne remplace pas les vendeurs. Elle les rend meilleurs.")
- Éviter : les accroches génériques, les listes, le jargon, les emojis dès le 1er mot
- Max 2-3 lignes, phrases courtes et impactantes`;

const THEMES: Record<string, { name: string; description: string; emoji: string }> = {
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

/* ── Scrape helper — fetch page text content ─────────────── */

async function scrapeUrl(url: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return `[Erreur ${res.status} pour ${url}]`;
    const html = await res.text();
    // Strip HTML tags, scripts, styles — keep text
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    // Limit to ~2000 chars to stay within token budget
    return text.slice(0, 2000);
  } catch (e) {
    return `[Impossible de lire ${url}: ${String(e)}]`;
  }
}

/* ── POST handler ────────────────────────────────────────── */

export async function POST(request: Request) {
  const guard = await requireAuth("linkedin", "POST");
  if (guard.denied) return guard.denied;

  try {
    const body = await request.json();
    const { action } = body;

    // ── suggest: 5 subjects without sources ──────────────
    if (action === "suggest") {
      const { theme } = body;
      const themeInfo = THEMES[theme as string];
      if (!themeInfo) return NextResponse.json({ error: "Thème invalide" }, { status: 400 });

      const result = await askAI([
        {
          role: "system",
          content: `Tu es un expert LinkedIn et content strategist pour Tony, CEO de Metagora.\n\n${EDITORIAL_LINE}\n\n${STYLE_EXAMPLES}`,
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

    // ── scrape-suggest: scrape sources + suggest 10 subjects ──
    if (action === "scrape-suggest") {
      const { theme, sourceUrls } = body;
      const themeInfo = THEMES[theme as string];
      if (!themeInfo) return NextResponse.json({ error: "Thème invalide" }, { status: 400 });
      if (!sourceUrls?.length) return NextResponse.json({ error: "Aucune source sélectionnée" }, { status: 400 });

      // Scrape all sources in parallel
      const scrapedContents = await Promise.all(
        (sourceUrls as string[]).slice(0, 5).map(async (url: string) => {
          const text = await scrapeUrl(url);
          return `── Source: ${url} ──\n${text}`;
        })
      );

      const allContent = scrapedContents.join("\n\n");

      const result = await askAI([
        {
          role: "system",
          content: `Tu es un expert LinkedIn et content strategist pour Tony, CEO de Metagora.\n\n${EDITORIAL_LINE}\n\n${STYLE_EXAMPLES}`,
        },
        {
          role: "user",
          content: `J'ai scrappé ces sources web pour le thème "${themeInfo.emoji} ${themeInfo.name}" :

${allContent}

À partir de ces contenus, suggère exactement 10 sujets de posts LinkedIn pertinents.

Chaque sujet doit :
- Être inspiré d'un fait, chiffre ou tendance trouvé dans les sources
- Avoir un angle storytelling ou data fort
- Correspondre au style de Tony
- Être formulé comme un titre accrocheur de 10-20 mots
- Indiquer brièvement l'angle/source d'inspiration

Réponds en JSON : {"subjects": [{"title": "...", "angle": "bref résumé de l'angle/source"}, ...]}
Pas de markdown, pas de backticks, juste le JSON.`,
        },
      ], 2000);

      try {
        const cleaned = result.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
        const parsed = JSON.parse(cleaned);
        return NextResponse.json({ data: parsed });
      } catch {
        return NextResponse.json({ data: { subjects: [] }, raw: result });
      }
    }

    // ── generate: full post + image prompt ───────────────
    if (action === "generate") {
      const { theme, subject } = body;
      const themeInfo = THEMES[theme as string];
      if (!themeInfo || !subject) return NextResponse.json({ error: "Thème et sujet requis" }, { status: 400 });

      const result = await askAI([
        {
          role: "system",
          content: `Tu es le ghostwriter LinkedIn de Tony, CEO de Metagora.

${EDITORIAL_LINE}

${STYLE_EXAMPLES}

CONSIGNES IMPÉRATIVES :
- Reproduis fidèlement le STYLE de Tony (ton direct, phrases courtes, emojis visuels, storytelling).
- Le post doit faire entre 150 et 300 mots.
- Commence par une accroche forte (fait choc, question rhétorique, ou anecdote).
- Termine par une question ouverte pour l'engagement.
- Ajoute des hashtags pertinents à la fin.
- N'utilise JAMAIS de jargon corporate vide.
- Écris en FRANÇAIS.

En plus du post, propose un prompt d'image d'illustration en anglais (1 phrase, descriptif visuel pour Pexels/Unsplash).`,
        },
        {
          role: "user",
          content: `Rédige un post LinkedIn sur le thème "${themeInfo.emoji} ${themeInfo.name}" avec le sujet :
"${subject}"

Réponds en JSON : {"post": "le post complet", "imagePrompt": "prompt image en anglais"}
Pas de markdown, pas de backticks, juste le JSON.`,
        },
      ], 2500);

      try {
        const cleaned = result.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
        const parsed = JSON.parse(cleaned);
        return NextResponse.json({ data: parsed });
      } catch {
        // Fallback: return as plain post
        return NextResponse.json({ data: { post: result, imagePrompt: "" } });
      }
    }

    // ── hooks: generate 5 hook variants ──────────────────
    if (action === "hooks") {
      const { post } = body;
      if (!post) return NextResponse.json({ error: "Post requis" }, { status: 400 });

      const result = await askAI([
        {
          role: "system",
          content: `Tu es un expert en copywriting LinkedIn.

${HOOKS_BEST_PRACTICES}

${STYLE_EXAMPLES}`,
        },
        {
          role: "user",
          content: `Voici un post LinkedIn :
---
${post}
---

Génère exactement 5 accroches alternatives (les 2-3 premières lignes du post, avant "…voir plus").
Chaque accroche doit utiliser une technique différente et être percutante.

Réponds en JSON : {"hooks": ["accroche 1", "accroche 2", "accroche 3", "accroche 4", "accroche 5"]}
Pas de markdown, pas de backticks, juste le JSON.`,
        },
      ], 1000);

      try {
        const cleaned = result.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
        const parsed = JSON.parse(cleaned);
        return NextResponse.json({ data: parsed });
      } catch {
        return NextResponse.json({ data: { hooks: result.split("\n").filter(Boolean).slice(0, 5) } });
      }
    }

    // ── refine-hook: modify a hook via prompt ────────────
    if (action === "refine-hook") {
      const { hook, instructions } = body;
      if (!hook || !instructions) return NextResponse.json({ error: "Hook et instructions requis" }, { status: 400 });

      const refined = await askAI([
        {
          role: "system",
          content: `Tu es un expert copywriting LinkedIn. Modifie l'accroche selon les instructions.\n\n${HOOKS_BEST_PRACTICES}`,
        },
        {
          role: "user",
          content: `Accroche actuelle :\n"${hook}"\n\nModification demandée : ${instructions}\n\nRetourne UNIQUEMENT l'accroche modifiée, rien d'autre.`,
        },
      ], 500);

      return NextResponse.json({ data: { hook: refined } });
    }

    // ── refine: modify existing post ─────────────────────
    if (action === "refine") {
      const { currentPost, instructions } = body;
      if (!currentPost || !instructions) return NextResponse.json({ error: "Post actuel et instructions requis" }, { status: 400 });

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
