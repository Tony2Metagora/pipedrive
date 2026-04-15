/**
 * API Route — ICP Classification (SSE streaming)
 *
 * POST { action: "discover", ids, company, offerContext }
 *   → Discover ICP categories from contacts + offer context
 *
 * POST { action: "apply", ids, company, categories }
 *   → Classify each contact into a category (batch + streaming)
 */

import { readBlob, writeBlob, withLock } from "@/lib/blob-store";
import { requireAuth } from "@/lib/api-guard";
import { askAzureFast } from "@/lib/azure-ai";
import type { IcpContact } from "../contacts/route";

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
    action: "discover" | "apply";
    ids: string[];
    company: string;
    offerContext?: string;
    categories?: IcpCategory[];
  };

  if (!ids?.length) {
    return new Response(JSON.stringify({ error: "ids requis" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const allContacts = await readBlob<IcpContact>("icp-contacts");
  const idSet = new Set(ids);
  const contacts = allContacts.filter((c) => idSet.has(c.id));

  if (contacts.length === 0) {
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

  // ═══ DISCOVER: propose categories ═══
  if (action === "discover") {
    const sample = contacts.slice(0, 30).map((c) => ({
      poste: c.poste || "",
      entreprise: c.entreprise || "",
      ville: c.ville || "",
    }));

    const raw = await askAzureFast([
      {
        role: "system",
        content: `Tu es un expert en segmentation B2B. Tu analyses une liste de contacts et un contexte d'offre pour identifier les profils de clients idéaux (ICP).${memoryBlock}

Réponds UNIQUEMENT en JSON valide, sans markdown.`,
      },
      {
        role: "user",
        content: `Contexte offre de ${company || "l'entreprise"}:
${offerContext || "Non spécifié"}

Voici un échantillon de ${sample.length} contacts (sur ${contacts.length} au total):
${JSON.stringify(sample, null, 1)}

Identifie les catégories ICP pertinentes (3 à 8 catégories). Pour chaque catégorie, estime le nombre de contacts qui y correspondent.

Format JSON:
{
  "categories": [
    { "id": "icp_1", "name": "Bailleur social", "description": "Organismes de logement social", "criteria": "Poste lié à la gestion de patrimoine immobilier social", "estimatedCount": 45 },
    ...
  ]
}`,
      },
    ], 2000);

    try {
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      const parsed = JSON.parse(cleaned);
      return new Response(JSON.stringify({ data: parsed }), { headers: { "Content-Type": "application/json" } });
    } catch {
      return new Response(JSON.stringify({ data: { categories: [] }, raw }), { headers: { "Content-Type": "application/json" } });
    }
  }

  // ═══ APPLY: classify each contact (SSE) ═══
  if (action === "apply" && categories?.length) {
    const categoryList = categories.map((c) => `- "${c.name}": ${c.criteria}`).join("\n");

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
        const results: { id: string; icp_category: string; icp_reason: string }[] = [];

        const processBatch = async (batch: typeof batches[0]) => {
          const batchData = batch.data.map((c) => ({
            id: c.id,
            poste: c.poste || "",
            entreprise: c.entreprise || "",
            ville: c.ville || "",
          }));

          try {
            const raw = await askAzureFast([
              {
                role: "system",
                content: `Tu classes des contacts B2B dans les catégories ICP suivantes:
${categoryList}
${memoryBlock}

Réponds en JSON: [{"id":"xxx","icp_category":"nom catégorie","icp_reason":"explication courte"}]
Pas de markdown, juste le JSON.`,
              },
              { role: "user", content: JSON.stringify(batchData) },
            ], 2500);

            const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
              .replace(/,\s*([\]}])/g, "$1")
              .replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":');
            let parsed: unknown;
            try { parsed = JSON.parse(cleaned); } catch {
              parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim());
            }
            if (Array.isArray(parsed)) {
              for (const item of parsed) {
                results.push({ id: String(item.id), icp_category: String(item.icp_category || ""), icp_reason: String(item.icp_reason || "") });
              }
            }
          } catch (err) {
            console.error(`[ICP] Batch ${batch.idx} failed:`, err);
            errors++;
          }
          done++;
          send("progress", { current: done, total: batches.length, message: `Batch ${done}/${batches.length}${errors > 0 ? ` (${errors} erreurs)` : ""}` });
        };

        send("progress", { current: 0, total: batches.length, message: "Classification en cours..." });

        for (let i = 0; i < batches.length; i += PARALLEL) {
          await Promise.all(batches.slice(i, i + PARALLEL).map(processBatch));
        }

        // Save results
        await withLock("icp-contacts", async () => {
          const all = await readBlob<IcpContact>("icp-contacts");
          const resultMap = new Map(results.map((r) => [r.id, r]));
          for (const c of all) {
            const r = resultMap.get(c.id);
            if (r) {
              c.icp_category = r.icp_category;
              c.icp_reason = r.icp_reason;
            }
          }
          await writeBlob("icp-contacts", all);
        });

        send("done", { classified: results.length, errors, total: contacts.length });
        controller.close();
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  }

  return new Response(JSON.stringify({ error: "Action invalide" }), { status: 400, headers: { "Content-Type": "application/json" } });
}
