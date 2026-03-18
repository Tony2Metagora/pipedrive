/**
 * API Route — AI Flagship Store Finder
 * POST: uses Azure OpenAI + Serper web search to find the flagship store
 *       name + address for a brand in a given city.
 *
 * Flow:
 *   1. First attempt: ask AI directly (works for well-known brands)
 *   2. If notFound or empty: web-search "<brand> boutique <city> adresse"
 *      via Serper, feed snippets to AI as context, retry
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";

const ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT!;
const API_KEY = process.env.AZURE_OPENAI_API_KEY!;
const API_VERSION = process.env.AZURE_OPENAI_API_VERSION || "2024-12-01-preview";
const DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-5.4-pro";
const SERPER_API_KEY = process.env.SERPER_API_KEY;

export const dynamic = "force-dynamic";

/* ── helpers ─────────────────────────────────────────── */

const SYSTEM_PROMPT = `Tu es un expert en retail de luxe, premium et marques de niche. On te demande de trouver la boutique principale ou flagship d'une marque dans une ville donnée.

RÈGLES :
- Réponds UNIQUEMENT en JSON valide, sans markdown, sans backticks, sans explication.
- Le JSON doit avoir exactement cette structure : {"storeName": "...", "storeAddress": "..."}
- storeName : le nom officiel complet de la boutique (ex: "Louis Vuitton Maison Champs-Elysees")
- storeAddress : l'adresse postale complète avec code postal et ville (ex: "101 avenue des Champs-Elysees, 75008 Paris, France")
- IMPORTANT : utilise uniquement des caractères ASCII dans ta réponse (pas d'accents). Remplace é→e, è→e, ê→e, à→a, ù→u, ô→o, etc.
- Si la marque n'a pas de boutique connue dans cette ville ET que tu n'as aucune info sur la marque, reponds : {"storeName": "", "storeAddress": "", "notFound": true}
- Privilegie la boutique flagship la plus emblematique dans la ville demandee. Si la marque est peu connue ou n'a pas de boutique dans cette ville, cherche sa boutique principale, son siege social ou showroom dans n'importe quelle ville.`;

interface StoreResult {
  storeName: string;
  storeAddress: string;
  notFound?: boolean;
  source?: string;
}

async function askAI(
  messages: { role: string; content: string }[]
): Promise<StoreResult> {
  const url = `${ENDPOINT}openai/deployments/${DEPLOYMENT}/chat/completions?api-version=${API_VERSION}`;

  const aiRes = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": API_KEY },
    body: JSON.stringify({ messages, max_completion_tokens: 800 }),
  });

  if (!aiRes.ok) {
    const errText = await aiRes.text();
    console.error("Azure OpenAI store-finder error:", aiRes.status, errText);
    throw new Error(`Erreur IA : ${aiRes.status}`);
  }

  const aiJson = await aiRes.json();
  const raw = aiJson.choices?.[0]?.message?.content?.trim() || "";

  if (!raw || raw === "{}") {
    return { storeName: "", storeAddress: "", notFound: true };
  }

  // Strip markdown fences if model wraps in ```json
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

  try {
    return JSON.parse(cleaned);
  } catch {
    console.error("Failed to parse AI response:", raw);
    return { storeName: "", storeAddress: "", notFound: true };
  }
}

async function webSearch(query: string): Promise<string> {
  if (!SERPER_API_KEY) return "";

  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": SERPER_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, num: 8 }),
    });

    if (!res.ok) return "";

    const json = await res.json();

    // Collect snippets from organic results + knowledge graph
    const parts: string[] = [];

    if (json.knowledgeGraph) {
      const kg = json.knowledgeGraph;
      if (kg.title) parts.push(`Knowledge Graph: ${kg.title}`);
      if (kg.description) parts.push(kg.description);
      if (kg.attributes) {
        for (const [k, v] of Object.entries(kg.attributes)) {
          parts.push(`${k}: ${v}`);
        }
      }
    }

    if (json.organic) {
      for (const r of json.organic.slice(0, 6)) {
        if (r.snippet) parts.push(`${r.title}: ${r.snippet}`);
      }
    }

    return parts.join("\n").substring(0, 3000);
  } catch (e) {
    console.error("Serper search error:", e);
    return "";
  }
}

function restoreAccents(text: string): string {
  // The AI returns ASCII-only; restore common French place names
  const replacements: [RegExp, string][] = [
    [/\bChamps-Elysees\b/gi, "Champs-Élysées"],
    [/\bElysees\b/gi, "Élysées"],
    [/\bOpera\b/gi, "Opéra"],
    [/\bRepublique\b/gi, "République"],
    [/\bSaint-Honore\b/gi, "Saint-Honoré"],
    [/\bSaint-Germain-des-Pres\b/gi, "Saint-Germain-des-Prés"],
    [/\bFaubourg\b/gi, "Faubourg"],
    [/\bMarche\b/gi, "Marché"],
    [/\bGeneve\b/gi, "Genève"],
  ];
  let result = text;
  for (const [pat, rep] of replacements) {
    result = result.replace(pat, rep);
  }
  return result;
}

/* ── main handler ────────────────────────────────────── */

export async function POST(request: Request) {
  const guard = await requireAuth("landing", "POST");
  if (guard.denied) return guard.denied;
  try {
    const { brandName, city } = await request.json();

    if (!brandName || !city) {
      return NextResponse.json(
        { error: "brandName et city requis" },
        { status: 400 }
      );
    }

    // ── Attempt 1: direct AI knowledge ──
    const userContent = `Trouve la boutique flagship ou principale de "${brandName}" a ${city}.`;
    let result = await askAI([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ]);

    if (!result.notFound && result.storeName && result.storeAddress) {
      result.storeName = restoreAccents(result.storeName);
      result.storeAddress = restoreAccents(result.storeAddress);
      result.source = "ai";
      return NextResponse.json({ data: result });
    }

    // ── Attempt 2: web search + AI ──
    const queries = [
      `"${brandName}" boutique magasin adresse ${city}`,
      `"${brandName}" store address ${city}`,
      `"${brandName}" flagship ${city}`,
    ];

    let searchContext = "";
    for (const q of queries) {
      searchContext = await webSearch(q);
      if (searchContext.length > 100) break;
    }

    if (searchContext) {
      const enrichedPrompt = `Voici des résultats de recherche web pour la marque "${brandName}" à ${city} :

${searchContext}

En te basant sur ces informations, trouve la boutique principale ou le magasin le plus emblématique de "${brandName}" à ${city}.
Si aucune boutique n'existe dans cette ville précise, donne la boutique la plus connue ou le siège de la marque trouvé dans les résultats, MÊME si c'est dans une autre ville.
N'invente rien, base-toi uniquement sur les résultats ci-dessus.`;

      result = await askAI([
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: enrichedPrompt },
      ]);

      if (!result.notFound && result.storeName && result.storeAddress) {
        result.storeName = restoreAccents(result.storeName);
        result.storeAddress = restoreAccents(result.storeAddress);
        result.source = "web+ai";
        return NextResponse.json({ data: result });
      }
    }

    // ── Attempt 3: search brand website + store locator ──
    const slug = brandName.toLowerCase().replace(/\s+/g, "");
    const siteQueries = [
      `"${brandName}" store locator boutiques nos magasins`,
      `site:${slug}.com OR site:${slug}.fr magasin boutique adresse`,
    ];
    let siteSearch = "";
    for (const sq of siteQueries) {
      siteSearch = await webSearch(sq);
      if (siteSearch.length > 100) break;
    }

    if (siteSearch) {
      const sitePrompt = `Voici des résultats web pour la marque "${brandName}" :

${siteSearch}

En te basant sur ces informations, trouve n'importe quelle boutique, magasin ou point de vente de "${brandName}".
Privilégie ${city} si possible. Sinon, donne la boutique principale ou le siège de la marque trouvé dans les résultats, même dans une autre ville.
N'invente rien, base-toi uniquement sur les résultats ci-dessus.`;

      result = await askAI([
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: sitePrompt },
      ]);

      if (!result.notFound && result.storeName && result.storeAddress) {
        result.storeName = restoreAccents(result.storeName);
        result.storeAddress = restoreAccents(result.storeAddress);
        result.source = "site+ai";
        return NextResponse.json({ data: result });
      }
    }

    // All attempts failed
    return NextResponse.json({
      data: { storeName: "", storeAddress: "", notFound: true },
    });
  } catch (error) {
    console.error("POST /api/landing/store-finder error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
