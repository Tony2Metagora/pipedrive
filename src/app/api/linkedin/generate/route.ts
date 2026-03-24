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
import { askAzureAI, askAzureFast } from "@/lib/azure-ai";
import { getFile, getLearnings } from "@/lib/linkedin-store";

export const dynamic = "force-dynamic";

/* ── Editorial line & style reference ────────────────────── */

const EDITORIAL_LINE = `Tony est CEO de Metagora, startup IA spécialisée dans la formation retail & luxe par simulation IA (clients virtuels).
Ton LinkedIn : "Journal d'un geek fraîchement passionné de retail" — il sort de sa grotte de codeur pour partager son aventure.

3 THÈMES ÉDITORIAUX :
1️⃣ Journal d'un CEO : Rencontres retail/luxe, bonnes pratiques partagées au détour de rencontres de personnes et marques inspirantes.
2️⃣ IA dans la formation : 15 ans d'expertise learning. Le e-learning (SCORM, LMS) reste la réalité de 90% des entreprises — l'IA vient l'enrichir, pas le remplacer. Constat terrain + solutions concrètes.
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
- JAMAIS de hashtags (#). Pas de #RetailTech, #IA, etc. Les hashtags nuisent à la portée organique LinkedIn.
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
    description: "15 ans d'expertise learning. Le e-learning (SCORM/LMS) est la réalité de 90% des entreprises — l'IA l'enrichit et le complète. Constat terrain + solutions concrètes, jamais de critique du e-learning existant.",
    emoji: "2️⃣",
  },
  "ia-operationnelle": {
    name: "IA Opérationnelle",
    description: "Vulgarisation IA (agentique, LLM), exploitation réelle chez Metagora",
    emoji: "3️⃣",
  },
  "evenement": {
    name: "Événement",
    description: "Salons, conférences, webinars, meetups — avant/pendant/après. Retour d'expérience terrain, rencontres clés, insights.",
    emoji: "🎯",
  },
};

/* ── Base de connaissance Metagora (contexte IA) ─────────── */

const METAGORA_KNOWLEDGE = `BASE DE CONNAISSANCE METAGORA (utilise ces infos comme contexte) :

■ METAGORA — Qui sommes-nous ?
Startup IA fondée par Tony, spécialisée dans la formation retail & luxe par simulation IA.
Produit phare : Simsell — simulateur de vente IA pour vendeurs retail/luxe.
- Clients virtuels IA (LLM) qui simulent différents profils clients
- Scoring automatique de la performance du vendeur
- Feedback personnalisé et axes d'amélioration
- Fonctionne sur tous devices, déployable à grande échelle

■ PROGRAMMES & PARTENAIRES
- AWS Startup Program
- Microsoft for Startups (Founders Hub)
- Eleven Labs (voix IA)
- NVIDIA Inception Program
- Cibles : grands groupes retail/luxe (LVMH, Carrefour, etc.)

■ EXPERTISE TONY
- 15 ans dans le digital learning / e-learning
- Expert SCORM, LMS, parcours de formation
- Background technique (développeur) + business (CEO)
- Vision : l'IA ne remplace pas le e-learning, elle l'enrichit

■ SIMULATIONS IA — Comment ça marche ?
- Le vendeur interagit en texte/voix avec un client virtuel IA
- Scénarios paramétrables : produit, profil client, objections, niveau de difficulté
- L'IA analyse : écoute active, argumentation, gestion objections, closing
- Score sur 100 + feedback détaillé + axes d'amélioration
- Intégration LMS possible (xAPI, SCORM)

■ VALEUR AJOUTÉE
- Formation scalable : 1 formateur IA = 1000 sessions simultanées
- Disponible 24/7, pas de logistique
- Personnalisée au secteur du client (luxe, cosmtique, mode, vin...)
- ROI mesurable : amélioration du taux de conversion, NPS, panier moyen`;

const SERPER_API_KEY = process.env.SERPER_API_KEY;

/* ── Google Search helper via Serper API ─────────────────── */

async function searchSource(url: string, theme: string): Promise<string> {
  if (!SERPER_API_KEY) return "";
  try {
    // Extract domain for site: search
    const domain = new URL(url).hostname.replace("www.", "");
    const query = `site:${domain} ${theme} 2026`;
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": SERPER_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, num: 5 }),
    });
    if (!res.ok) return "";
    const json = await res.json();
    const parts: string[] = [];
    if (json.organic) {
      for (const r of json.organic.slice(0, 5)) {
        if (r.title && r.snippet) parts.push(`• ${r.title}\n  ${r.snippet}`);
      }
    }
    return parts.length > 0 ? `── ${domain} ──\n${parts.join("\n")}` : "";
  } catch {
    return "";
  }
}

/* ── Build learnings context block for AI prompts ─────────── */

function formatLearningsBlock(learnings: { type: string; before: string; after: string; reason: string }[]): string {
  if (learnings.length === 0) return "";
  const items = learnings.slice(-20).map((l, i) => {
    const label = l.type === "idea-edit" ? "Correction d'idée" : l.type === "post-edit" ? "Correction de post" : "Feedback style";
    return `${i + 1}. [${label}] Raison : "${l.reason}"${l.before ? `\n   Avant : "${l.before.slice(0, 150)}…"` : ""}${l.after ? `\n   Après : "${l.after.slice(0, 150)}…"` : ""}`;
  }).join("\n");
  return `\nMÉMOIRE DES CORRECTIONS DE TONY (respecte ces apprentissages pour coller à son style) :\n${items}\n`;
}

/* ── POST handler ────────────────────────────────────────── */

export async function POST(request: Request) {
  const guard = await requireAuth("linkedin", "POST");
  if (guard.denied) return guard.denied;

  try {
    const body = await request.json();
    const { action } = body;

    // Load learnings once for all actions that need them
    const learnings = await getLearnings();
    const learningsBlock = formatLearningsBlock(learnings);

    // ── suggest: 5 subjects without sources ──────────────
    if (action === "suggest") {
      const { theme } = body;
      const themeInfo = THEMES[theme as string];
      if (!themeInfo) return NextResponse.json({ error: "Thème invalide" }, { status: 400 });

      const result = await askAzureFast([
        {
          role: "system",
          content: `Tu es un expert LinkedIn et content strategist pour Tony, CEO de Metagora.\n\n${EDITORIAL_LINE}\n\n${METAGORA_KNOWLEDGE}\n\n${STYLE_EXAMPLES}`,
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

    // ── suggest-fast: 3 sujets via gpt-5.2-chat (Base IA, ~5s) ──
    if (action === "suggest-fast") {
      const { theme, sourceUrls } = body;
      const themeInfo = THEMES[theme as string];
      if (!themeInfo) return NextResponse.json({ error: "Thème invalide" }, { status: 400 });
      if (!sourceUrls?.length) return NextResponse.json({ error: "Aucune source sélectionnée" }, { status: 400 });

      const sourceNames = (sourceUrls as string[]).map((u: string) => {
        try { return new URL(u).hostname.replace("www.", ""); } catch { return u; }
      }).join(", ");

      const sysPrompt = `Tu es un expert LinkedIn pour Tony, CEO de Metagora (startup IA retail/luxe). Style : ton direct, storytelling, données chiffrées, emojis modérés, 150-300 mots, jamais corporate.`;
      const jsonFormat = `Réponds en JSON : {"subjects": [{"title": "...", "angle": "..."}, ...]}\nPas de markdown, juste le JSON.`;

      const t0 = Date.now();
      const raw = await askAzureFast([
        { role: "system", content: sysPrompt },
        {
          role: "user",
          content: `Je suis les sources suivantes : ${sourceNames}.\nThème : "${themeInfo.emoji} ${themeInfo.name}" (${themeInfo.description}).\n\nSuggère exactement 3 sujets de posts LinkedIn inspirés de ces sources et de l'actualité de ce thème.\nChaque sujet : titre accrocheur 10-20 mots + bref angle.\n\n${jsonFormat}`,
        },
      ], 1000);
      const durationMs = Date.now() - t0;

      type Subject = { title: string; angle: string; source?: string };
      const subjects: Subject[] = [];
      try {
        const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
        const parsed = JSON.parse(cleaned);
        const items = parsed.subjects || parsed;
        for (const s of (Array.isArray(items) ? items : []).slice(0, 3)) {
          subjects.push({ title: s.title || s, angle: s.angle || "", source: "🧠 Base IA" });
        }
      } catch (e) { console.error("suggest-fast parse error:", e, raw?.slice(0, 300)); }

      return NextResponse.json({
        data: { subjects, model: "gpt-5.2-chat", durationMs, sourceCount: (sourceUrls as string[]).length },
      });
    }

    // ── suggest-realtime: 2 sujets via gpt-5.4-pro + web_search (~30-50s) ──
    if (action === "suggest-realtime") {
      const { theme, sourceUrls } = body;
      const themeInfo = THEMES[theme as string];
      if (!themeInfo) return NextResponse.json({ error: "Thème invalide" }, { status: 400 });
      if (!sourceUrls?.length) return NextResponse.json({ error: "Aucune source sélectionnée" }, { status: 400 });

      const sourceNames = (sourceUrls as string[]).map((u: string) => {
        try { return new URL(u).hostname.replace("www.", ""); } catch { return u; }
      }).join(", ");

      const sysPrompt = `Tu es un expert LinkedIn pour Tony, CEO de Metagora (startup IA retail/luxe). Style : ton direct, storytelling, données chiffrées, emojis modérés, 150-300 mots, jamais corporate.`;
      const jsonFormat = `Réponds en JSON : {"subjects": [{"title": "...", "angle": "...", "url": "https://..."}, ...]}\nChaque sujet DOIT inclure l'URL exacte de l'article source trouvé.\nPas de markdown, juste le JSON.`;

      const t0 = Date.now();
      try {
        const raw = await askAzureAI([
          { role: "system", content: sysPrompt },
          {
            role: "user",
            content: `Recherche sur le web des articles récents des sources suivantes : ${sourceNames}.\nThème : "${themeInfo.emoji} ${themeInfo.name}" (${themeInfo.description}).\n\nTrouve exactement 2 sujets de posts LinkedIn inspirés d'articles RÉELS et RÉCENTS de ces sources.\nChaque sujet DOIT contenir : titre accrocheur 10-20 mots + bref angle + l'URL EXACTE de l'article trouvé.\n\n${jsonFormat}`,
          },
        ], 1000, [{ type: "web_search_preview" }]);
        const durationMs = Date.now() - t0;

        type Subject = { title: string; angle: string; source?: string; url?: string };
        const subjects: Subject[] = [];
        try {
          const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
          const parsed = JSON.parse(cleaned);
          const items = parsed.subjects || parsed;
          for (const s of (Array.isArray(items) ? items : []).slice(0, 2)) {
            subjects.push({ title: s.title || s, angle: s.angle || "", source: "🌐 Temps réel", url: s.url || "" });
          }
        } catch (e) { console.error("suggest-realtime parse error:", e, raw?.slice(0, 300)); }

        return NextResponse.json({
          data: { subjects, model: "gpt-5.4-pro", durationMs, sourceCount: (sourceUrls as string[]).length },
        });
      } catch (error) {
        const durationMs = Date.now() - t0;
        console.error("suggest-realtime FAILED:", error);
        return NextResponse.json({
          data: { subjects: [], model: "gpt-5.4-pro", durationMs, sourceCount: (sourceUrls as string[]).length },
          error: `Recherche temps réel échouée (${Math.round(durationMs / 1000)}s)`,
        });
      }
    }

    // ── import-event: transform a pasted post into Metagora event discourse ──
    if (action === "import-event") {
      const { originalPost, context } = body;
      if (!originalPost) return NextResponse.json({ error: "Post original requis" }, { status: 400 });

      const result = await askAzureFast([
        {
          role: "system",
          content: `Tu es le ghostwriter LinkedIn de Tony, CEO de Metagora.

${EDITORIAL_LINE}

${METAGORA_KNOWLEDGE}

${STYLE_EXAMPLES}

MISSION : Tony a assisté ou est intervenu à un événement (en ligne ou en présentiel). Quelqu'un a publié un post LinkedIn sur cet événement (qui peut ou non taguer Tony/Metagora). Tu dois transformer ce post d'inspiration en un post LinkedIn de Tony qui :
1. Raconte SON expérience à cet événement (point de vue personnel, première personne)
2. Met en valeur les rencontres, insights et moments marquants
3. Fait le lien avec Metagora / Simsell quand c'est pertinent (sans forcer)
4. Respecte fidèlement le style de Tony (ton direct, storytelling, emojis visuels)
5. Garde les données/chiffres intéressants du post original
6. Entre 150 et 300 mots
7. Termine par une question ouverte pour l'engagement
8. PAS de hashtags (#) — jamais
- IMPORTANT pour le thème "IA dans la formation" : le e-learning (SCORM, LMS) n'est PAS obsolète. Ton constructif : constat terrain + solution IA.`,
        },
        {
          role: "user",
          content: `Voici le post LinkedIn d'inspiration sur l'événement :
---
${originalPost}
---
${context ? `\nContexte supplémentaire de Tony : ${context}` : ""}

Transforme-le en post LinkedIn de Tony (point de vue Metagora).
Réponds en JSON : {"post": "le post complet", "imagePrompt": "prompt image en anglais pour Pexels/Unsplash"}
Pas de markdown, juste le JSON.`,
        },
      ], 2500);

      try {
        const cleaned = result.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
        const parsed = JSON.parse(cleaned);
        return NextResponse.json({ data: parsed });
      } catch {
        return NextResponse.json({ data: { post: result, imagePrompt: "" } });
      }
    }

    // ── import-inspiration: adapt a pasted post to Tony/Metagora style ──
    if (action === "import-inspiration") {
      const { originalPost, theme, context } = body;
      const themeInfo = THEMES[theme as string];
      if (!originalPost) return NextResponse.json({ error: "Post original requis" }, { status: 400 });
      if (!themeInfo) return NextResponse.json({ error: "Thème requis" }, { status: 400 });

      const result = await askAzureFast([
        {
          role: "system",
          content: `Tu es le ghostwriter LinkedIn de Tony, CEO de Metagora.

${EDITORIAL_LINE}

${METAGORA_KNOWLEDGE}

${STYLE_EXAMPLES}

MISSION : Tony a trouvé un post LinkedIn inspirant et veut s'en inspirer pour écrire son propre post sur le thème "${themeInfo.emoji} ${themeInfo.name}". Tu dois :
1. Extraire les idées clés, données, insights du post original
2. Réécrire un post ORIGINAL pour Tony (pas un copier-coller, une vraie réécriture avec son angle et sa voix)
3. Adapter au thème "${themeInfo.name}" : ${themeInfo.description}
4. Ajouter la perspective Metagora / Simsell quand c'est pertinent
5. Respecter fidèlement le style de Tony (ton direct, storytelling, emojis visuels)
6. Entre 150 et 300 mots
7. Commence par une accroche forte
8. Termine par une question ouverte
9. PAS de hashtags (#) — jamais
- IMPORTANT pour le thème "IA dans la formation" : le e-learning (SCORM, LMS) n'est PAS obsolète. Ton constructif : constat terrain + solution IA.`,
        },
        {
          role: "user",
          content: `Post d'inspiration :
---
${originalPost}
---
Thème à traiter : ${themeInfo.emoji} ${themeInfo.name}
${context ? `\nContexte / angle souhaité par Tony : ${context}` : ""}

Réécris en post LinkedIn de Tony.
Réponds en JSON : {"post": "le post complet", "imagePrompt": "prompt image en anglais pour Pexels/Unsplash"}
Pas de markdown, juste le JSON.`,
        },
      ], 2500);

      try {
        const cleaned = result.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
        const parsed = JSON.parse(cleaned);
        return NextResponse.json({ data: parsed });
      } catch {
        return NextResponse.json({ data: { post: result, imagePrompt: "" } });
      }
    }

    // ── generate: full post + image prompt ───────────────
    if (action === "generate") {
      const { theme, subject } = body;
      const themeInfo = THEMES[theme as string];
      if (!themeInfo || !subject) return NextResponse.json({ error: "Thème et sujet requis" }, { status: 400 });

      const result = await askAzureFast([
        {
          role: "system",
          content: `Tu es le ghostwriter LinkedIn de Tony, CEO de Metagora.

${EDITORIAL_LINE}

${METAGORA_KNOWLEDGE}

${STYLE_EXAMPLES}${learningsBlock}

CONSIGNES IMPÉRATIVES :
- Reproduis fidèlement le STYLE de Tony (ton direct, phrases courtes, emojis visuels, storytelling).
- Le post doit faire entre 150 et 300 mots.
- Commence par une accroche forte (fait choc, question rhétorique, ou anecdote).
- Termine par une question ouverte pour l'engagement.
- PAS de hashtags (#) — jamais. Les hashtags nuisent à la portée organique LinkedIn.
- N'utilise JAMAIS de jargon corporate vide.
- Écris en FRANÇAIS.
- IMPORTANT pour le thème "IA dans la formation" : le e-learning (SCORM, LMS) n'est PAS obsolète ni à critiquer. 90% des entreprises utilisent encore ce modèle. Le ton doit être constructif : constat terrain (les entreprises sont coincées avec SCORM) + solution (l'IA vient enrichir et compléter le e-learning existant, pas le remplacer). Le e-learning sert à ancrer les connaissances. Pas de discours "le e-learning est mort" mais plutôt "comment l'IA transforme le e-learning".

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

      const result = await askAzureFast([
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

      // Detect if user pasted a full replacement hook vs gave modification instructions
      const isDirectReplacement = instructions.length > 60 && !instructions.toLowerCase().includes("modifie") && !instructions.toLowerCase().includes("change") && !instructions.toLowerCase().includes("remplace") && !instructions.toLowerCase().includes("rends") && !instructions.toLowerCase().includes("ajoute");

      let refined: string;
      if (isDirectReplacement) {
        // User pasted the new hook directly — use it as-is
        refined = instructions;
      } else {
        refined = await askAzureFast([
          {
            role: "system",
            content: `Tu es un expert copywriting LinkedIn. Modifie l'accroche selon les instructions de Tony.\n\n${HOOKS_BEST_PRACTICES}`,
          },
          {
            role: "user",
            content: `Accroche actuelle :\n"${hook}"\n\nModification demandée : ${instructions}\n\nRetourne UNIQUEMENT l'accroche modifiée, rien d'autre.`,
          },
        ], 500);
      }

      return NextResponse.json({ data: { hook: refined } });
    }

    // ── refine: modify existing post ─────────────────────
    if (action === "refine") {
      const { currentPost, instructions } = body;
      if (!currentPost || !instructions) return NextResponse.json({ error: "Post actuel et instructions requis" }, { status: 400 });

      const refined = await askAzureFast([
        {
          role: "system",
          content: `Tu es le ghostwriter LinkedIn de Tony, CEO de Metagora. Tu dois modifier un post LinkedIn existant selon les instructions de Tony.

${STYLE_EXAMPLES}

CONSIGNES :
- Garde le même style et ton que le post original.
- Applique les modifications demandées par Tony.
- Garde entre 150 et 300 mots.
- Retourne UNIQUEMENT le post modifié, rien d'autre.${learningsBlock}`,
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

    // ── search-stats: enrich a subject with stats + sources ──
    // Strategy: try gpt-5.4-pro web_search first, fallback to gpt-5.2-chat knowledge base
    if (action === "search-stats") {
      const { theme, subject } = body;
      const themeInfo = THEMES[theme as string];
      if (!themeInfo || !subject) return NextResponse.json({ error: "Thème et sujet requis" }, { status: 400 });

      const statsJsonFormat = `Réponds en JSON : {"stats": [{"text": "chiffre + contexte en 1 phrase", "source": "nom de la source", "url": "https://..."}]}\nPas de markdown, juste le JSON.`;
      const statsPrompt = `Trouve 3 à 5 statistiques, chiffres clés ou données récentes en lien avec ce sujet de post LinkedIn.
Sujet : "${subject}"
Thème : ${themeInfo.name} (${themeInfo.description})
Domaine : IA, retail, luxe, formation, e-learning, digital learning, upskilling.

ORIENTATION OBLIGATOIRE DES STATS :
- Privilégie les stats qui montrent l'impact de l'IA dans la formation / l'upskilling
- Gains opérationnels concrets : productivité, temps de formation réduit, performance des vendeurs
- Économies de coûts : ROI de la formation IA, réduction des coûts de formation, scalabilité
- Chiffres qui prouvent que l'IA transforme positivement la formation (pas qu'elle la remplace)
- Exemples : "X% de réduction du temps de formation", "ROI de X€ pour 1€ investi en IA learning", "X% d'amélioration de la rétention"

Cherche des études, rapports, articles de presse avec des pourcentages, montants, tendances chiffrées.
${statsJsonFormat}`;

      type Stat = { text: string; source: string; url: string };
      let stats: Stat[] = [];
      let statsSource: "web" | "knowledge" = "web";

      // 1) Try gpt-5.4-pro + web_search
      try {
        const raw = await askAzureAI([
          { role: "system", content: `Tu es un data analyst expert. Tu cherches des statistiques sourcées pour enrichir des posts LinkedIn.` },
          { role: "user", content: statsPrompt },
        ], 1000, [{ type: "web_search_preview" }]);

        if (raw) {
          try {
            const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
            const parsed = JSON.parse(cleaned);
            stats = parsed.stats || [];
          } catch (e) {
            console.error("Stats web parse error:", e, raw?.slice(0, 300));
          }
        }
      } catch (error) {
        console.error("search-stats web_search failed:", error);
      }

      // 2) Fallback: gpt-5.2-chat knowledge base if web returned nothing
      if (stats.length === 0) {
        statsSource = "knowledge";
        try {
          const raw = await askAzureFast([
            { role: "system", content: `Tu es un data analyst expert avec une vaste base de connaissances sur l'IA, le retail, le luxe, la formation et le e-learning. Tu cites toujours tes sources (nom du rapport/étude, année).` },
            { role: "user", content: `${statsPrompt}\nIMPORTANT : si tu n'as pas l'URL exacte, mets le nom du rapport/étude et l'année dans le champ "source" et laisse "url" vide.` },
          ], 1000);

          if (raw) {
            try {
              const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
              const parsed = JSON.parse(cleaned);
              stats = (parsed.stats || []).map((s: Stat) => ({ ...s, source: s.source ? `${s.source} 🧠` : "🧠 Base IA" }));
            } catch (e) {
              console.error("Stats knowledge parse error:", e, raw?.slice(0, 300));
            }
          }
        } catch (error) {
          console.error("search-stats knowledge fallback failed:", error);
        }
      }

      return NextResponse.json({ data: { stats, statsSource } });
    }

    // ── transcript-ideas: extract 10 post ideas from a pasted transcript ──
    if (action === "transcript-ideas") {
      const { transcript, context } = body;
      if (!transcript) return NextResponse.json({ error: "Transcript requis" }, { status: 400 });

      const result = await askAzureFast([
        {
          role: "system",
          content: `Tu es un expert LinkedIn et content strategist pour Tony, CEO de Metagora.

${EDITORIAL_LINE}

${METAGORA_KNOWLEDGE}

MISSION : À partir d'un transcript de discussion (notes, échanges, idées brutes), extrais exactement 10 idées de posts LinkedIn.
Chaque idée doit :
- Être formulée comme un titre accrocheur de 10-20 mots
- Avoir un angle storytelling, data, ou opinion forte
- Correspondre à l'un des 4 thèmes éditoriaux de Tony
- Être directement exploitable pour rédiger un post`,
        },
        {
          role: "user",
          content: `Voici le transcript d'une discussion :
---
${transcript}
---
${context ? `\nContexte supplémentaire : ${context}` : ""}

Extrais exactement 10 idées de posts LinkedIn à partir de ce transcript.
Réponds en JSON : {"ideas": ["idée 1", "idée 2", ..., "idée 10"]}
Pas de markdown, pas de backticks, juste le JSON.`,
        },
      ], 1200);

      try {
        const cleaned = result.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
        const parsed = JSON.parse(cleaned);
        return NextResponse.json({ data: parsed });
      } catch {
        const lines = result.split("\n").filter(Boolean).slice(0, 10);
        return NextResponse.json({ data: { ideas: lines } });
      }
    }

    // ── prompt-ideas: generate 6 post ideas from a free prompt ──
    if (action === "prompt-ideas") {
      const { prompt } = body;
      if (!prompt) return NextResponse.json({ error: "Prompt requis" }, { status: 400 });

      const result = await askAzureFast([
        {
          role: "system",
          content: `Tu es un expert LinkedIn et content strategist pour Tony, CEO de Metagora.

${EDITORIAL_LINE}

${METAGORA_KNOWLEDGE}

${STYLE_EXAMPLES}

MISSION : À partir du prompt de Tony, propose exactement 6 idées de posts LinkedIn.
Chaque idée doit être un MINI-POST structuré de 3-4 lignes selon les bonnes pratiques LinkedIn :
- Ligne 1 : Accroche forte (fait choc, question, anecdote)
- Ligne 2-3 : Développement (angle, argument, donnée)
- Ligne 4 : Conclusion/question ouverte ou CTA

Format : chaque idée fait 3-4 lignes, lisible, structurée. PAS juste un titre.
JAMAIS de hashtags (#). Pas de lignes qui ne contiennent que des hashtags.
Ton direct, authentique, emojis modérés, style Tony.${learningsBlock}`,
        },
        {
          role: "user",
          content: `Prompt de Tony : "${prompt}"

Propose exactement 6 idées de posts LinkedIn (3-4 lignes chacune).
Réponds en JSON : {"ideas": ["idée 1 (3-4 lignes)", "idée 2 (3-4 lignes)", ...]}
Chaque idée = un mini-post structuré de 3-4 lignes avec sauts de ligne (\\n).
Pas de markdown, pas de backticks, juste le JSON.`,
        },
      ], 2500);

      try {
        const cleaned = result.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
        const parsed = JSON.parse(cleaned);
        return NextResponse.json({ data: parsed });
      } catch {
        const lines = result.split("\n\n").filter(Boolean).slice(0, 6);
        return NextResponse.json({ data: { ideas: lines } });
      }
    }

    // ── file-ideas: analyze an uploaded file and suggest 6 post ideas ──
    if (action === "file-ideas") {
      const { fileId, additionalPrompt } = body;
      if (!fileId) return NextResponse.json({ error: "fileId requis" }, { status: 400 });

      const file = await getFile(fileId);
      if (!file) return NextResponse.json({ error: "Fichier introuvable" }, { status: 404 });

      // Truncate text to fit in context window (~30K chars max for the file content)
      const maxChars = 30000;
      const fileText = file.extractedText.length > maxChars
        ? file.extractedText.slice(0, maxChars) + "\n[... tronqué]"
        : file.extractedText;

      const result = await askAzureFast([
        {
          role: "system",
          content: `Tu es un expert LinkedIn et content strategist pour Tony, CEO de Metagora.

${EDITORIAL_LINE}

${METAGORA_KNOWLEDGE}

${STYLE_EXAMPLES}

MISSION : Analyse le document fourni par Tony et propose exactement 6 idées de posts LinkedIn inspirées du contenu.
Chaque idée doit être un MINI-POST structuré de 3-4 lignes selon les bonnes pratiques LinkedIn :
- Ligne 1 : Accroche forte (fait choc, question, anecdote tirée du document)
- Ligne 2-3 : Développement (angle, argument, donnée du document)
- Ligne 4 : Conclusion/question ouverte ou CTA

Format : chaque idée fait 3-4 lignes, lisible, structurée. PAS juste un titre.
Extrais les insights les plus intéressants, les données chiffrées, les anecdotes, les tendances.
JAMAIS de hashtags (#). Pas de lignes qui ne contiennent que des hashtags.
Ton direct, authentique, emojis modérés, style Tony.${learningsBlock}`,
        },
        {
          role: "user",
          content: `Document : "${file.name}"
---
${fileText}
---
${additionalPrompt ? `\nIndication supplémentaire de Tony : ${additionalPrompt}` : ""}

Analyse ce document et propose exactement 6 idées de posts LinkedIn (3-4 lignes chacune).
Réponds en JSON : {"ideas": ["idée 1 (3-4 lignes)", "idée 2 (3-4 lignes)", ...]}
Chaque idée = un mini-post structuré de 3-4 lignes avec sauts de ligne (\\n).
Pas de markdown, pas de backticks, juste le JSON.`,
        },
      ], 2500);

      try {
        const cleaned = result.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
        const parsed = JSON.parse(cleaned);
        return NextResponse.json({ data: parsed });
      } catch {
        const ideas = result.split("\n\n").filter(Boolean).slice(0, 6);
        return NextResponse.json({ data: { ideas } });
      }
    }

    // ── refine-idea: modify a single idea based on user prompt ──
    if (action === "refine-idea") {
      const { idea, instructions } = body;
      if (!idea || !instructions) return NextResponse.json({ error: "Idée et instructions requises" }, { status: 400 });

      const result = await askAzureFast([
        {
          role: "system",
          content: `Tu es un expert LinkedIn et content strategist pour Tony, CEO de Metagora.

${EDITORIAL_LINE}

${STYLE_EXAMPLES}${learningsBlock}

MISSION : Tony a une idée de post LinkedIn qu'il veut modifier selon ses instructions.
Réécris l'idée en gardant le format mini-post de 3-4 lignes.
JAMAIS de hashtags (#).`,
        },
        {
          role: "user",
          content: `Idée actuelle :
"${idea}"

Instructions de modification : ${instructions}

Réécris l'idée modifiée (3-4 lignes, même format mini-post).
Réponds en JSON : {"idea": "l'idée modifiée (3-4 lignes avec \\n)"}
Pas de markdown, juste le JSON.`,
        },
      ], 1000);

      try {
        const cleaned = result.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
        const parsed = JSON.parse(cleaned);
        return NextResponse.json({ data: parsed });
      } catch {
        return NextResponse.json({ data: { idea: result.trim() } });
      }
    }

    return NextResponse.json({ error: "Action invalide" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/linkedin/generate error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
