/**
 * API Route — ICP Classification (SSE streaming)
 *
 * POST { action: "discover", ids, company, offerContext }
 *   → Discover ICP categories from contacts + offer context
 *
 * POST { action: "apply", ids, company, categories }
 *   → Classify each contact into a category (batch + streaming)
 */

import { readBlob } from "@/lib/blob-store";
import { requireAuth } from "@/lib/api-guard";
import { askAzureFast } from "@/lib/azure-ai";
import type { IcpContact } from "../contacts/route";

export const maxDuration = 120;

interface IcpMemoryEntry {
  id: string;
  company: string;
  contact_id: string;
  poste: string;
  entreprise: string;
  old_category: string;
  new_category: string;
  reason: string;
  created_at: string;
}

interface IcpCategory {
  id: string;
  name: string;
  description: string;
  criteria: string;
}

function normKey(v: string): string {
  return (v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export async function POST(request: Request) {
  const guard = await requireAuth("prospects", "POST");
  if (guard.denied) return guard.denied;

  const body = await request.json();
  const { action, ids, company, offerContext, categories } = body as {
    action: "batch-classify" | "generate-approach";
    ids: string[];
    company: string;
    offerContext?: string;
    categories?: IcpCategory[];
  };

  if (!ids?.length && action !== "generate-approach") {
    return new Response(JSON.stringify({ error: "ids requis" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const allContacts = await readBlob<IcpContact>("icp-contacts");
  const idSet = new Set(ids);
  const contacts = allContacts.filter((c) => idSet.has(c.id));

  if (contacts.length === 0 && action !== "generate-approach") {
    return new Response(JSON.stringify({ error: "Aucun contact trouvé" }), { status: 404, headers: { "Content-Type": "application/json" } });
  }

  // Load memory for RAG
  const companyKey = normKey(company || "");
  let memory: IcpMemoryEntry[] = [];
  try {
    const all = await readBlob<IcpMemoryEntry>("icp-memory");
    memory = all.filter((m) => normKey(m.company) === companyKey);
  } catch { /* no memory yet */ }

  const memoryBlock = memory.length > 0
    ? `\n\n--- CORRECTIONS HUMAINES PRÉCÉDENTES ---\n${memory.slice(-30).map((m) => `- "${m.poste}" chez "${m.entreprise}": ${m.old_category} → ${m.new_category}. Raison: ${m.reason}`).join("\n")}\nApplique ces corrections systématiquement.`
    : "";

  // ═══ BATCH-CLASSIFY: assign each contact to a category (SSE) ═══
  if (action === "batch-classify" && categories?.length) {
    const categoryList = categories.map((c) => `- "${c.name}": ${c.criteria}`).join("\n");
    const categoryNames = categories.map((c) => c.name);
    // Normalize AI response to exact user-defined category names
    const normalizeCatName = (aiName: string): string => {
      const lower = aiName.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      for (const name of categoryNames) {
        if (name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === lower) return name;
      }
      // Fuzzy: check if AI name contains or is contained by a category name
      for (const name of categoryNames) {
        const normName = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (lower.includes(normName) || normName.includes(lower)) return name;
      }
      return aiName.trim();
    };

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          try { controller.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch { /* closed */ }
        };

        const BATCH_SIZE = 20;
        const PARALLEL = 2;
        const batches: { idx: number; data: IcpContact[] }[] = [];
        for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
          batches.push({ idx: batches.length + 1, data: contacts.slice(i, i + BATCH_SIZE) });
        }

        let done = 0;
        let errors = 0;
        const results: { id: string; icp_category: string }[] = [];

        const processBatch = async (batch: typeof batches[0]) => {
          const batchData = batch.data.map((c) => ({
            id: c.id,
            poste: c.poste || "",
            entreprise: c.entreprise || "",
            ville: c.ville || "",
          }));

          try {
            const offerBlock = offerContext ? `\n\n--- CONTEXTE OFFRE ---\n${offerContext}` : "";
            const raw = await askAzureFast([
              {
                role: "system",
                content: `Tu classes des contacts B2B dans EXACTEMENT UNE des catégories ICP suivantes :
${categoryList}
${offerBlock}
${memoryBlock}

Pour chaque contact, détermine la catégorie ICP la plus pertinente en croisant le poste et le type d'entreprise.
Si aucune catégorie ne correspond, utilise "Autres / à qualifier".
Chaque contact doit être dans UNE SEULE catégorie.
Réponds en JSON : [{"id":"xxx","icp_category":"nom exact de la catégorie"}]
Pas de markdown.`,
              },
              { role: "user", content: JSON.stringify(batchData) },
            ], 2000);

            const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
              .replace(/,\s*([\]}])/g, "$1")
              .replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":');
            let parsed: unknown;
            try { parsed = JSON.parse(cleaned); } catch {
              parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim());
            }
            if (Array.isArray(parsed)) {
              for (const item of parsed) {
                results.push({ id: String(item.id), icp_category: normalizeCatName(String(item.icp_category || "Autres / à qualifier")) });
              }
            }
          } catch (err) {
            console.error(`[ICP] Batch ${batch.idx} failed:`, err);
            errors++;
            // Fallback: assign all batch contacts to "Autres"
            for (const c of batch.data) {
              results.push({ id: c.id, icp_category: "Autres / à qualifier" });
            }
          }
          done++;
          send("progress", { current: done, total: batches.length, message: `Classification ${done}/${batches.length}${errors > 0 ? ` (${errors} erreurs)` : ""}` });
        };

        send("progress", { current: 0, total: batches.length, message: "Classification en cours..." });

        for (let i = 0; i < batches.length; i += PARALLEL) {
          await Promise.all(batches.slice(i, i + PARALLEL).map(processBatch));
        }

        // Dedup: each contact ID appears once (first result wins)
        const seen = new Set<string>();
        const dedupedResults = results.filter((r) => {
          if (seen.has(r.id)) return false;
          seen.add(r.id);
          return true;
        });

        send("done", { results: dedupedResults, classified: dedupedResults.length, errors, total: contacts.length });
        controller.close();
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  }

  // ═══ GENERATE-APPROACH: generate approach message for a single ICP ═══
  if (action === "generate-approach" && categories?.length) {
    const cat = categories[0];
    try {
      const raw = await askAzureFast([
        {
          role: "system",
          content: `Tu es un expert en prospection commerciale B2B pour ${company || "l'entreprise"}.
À partir du contexte ci-dessous, rédige un message d'approche court et percutant (3-5 phrases max) pour le segment "${cat.name}".
Le message doit être personnalisable avec {{prenom}} et {{entreprise}}.
Commence directement par le message, sans introduction ni explication.
Le ton doit être professionnel, direct et orienté valeur.`,
        },
        {
          role: "user",
          content: `Contexte de l'offre:\n${offerContext || "Non spécifié"}\n\nSegment ciblé: ${cat.name}${cat.description ? `\nDescription: ${cat.description}` : ""}${cat.criteria ? `\nCritères: ${cat.criteria}` : ""}`,
        },
      ], 500);
      return new Response(JSON.stringify({ message: raw.trim() }), { headers: { "Content-Type": "application/json" } });
    } catch {
      return new Response(JSON.stringify({ message: "" }), { headers: { "Content-Type": "application/json" } });
    }
  }

  return new Response(JSON.stringify({ error: "Action invalide" }), { status: 400, headers: { "Content-Type": "application/json" } });
}
