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
    const allContacts = contacts.map((c) => ({
      poste: c.poste || "",
      entreprise: c.entreprise || "",
      ville: c.ville || "",
    }));

    // Format compact: "poste | entreprise (ville)" pour réduire les tokens
    const contactLines = allContacts.map((c, i) => `${i + 1}. ${c.poste} | ${c.entreprise}${c.ville ? ` (${c.ville})` : ""}`).join("\n");

    // >300 contacts: skip contactNumbers in Discover to avoid timeout (Apply will do the real classification)
    const withNumbers = allContacts.length <= 300;
    const contactNumbersInstruction = withNumbers
      ? `- Pour chaque catégorie ET chaque segment exclu, liste les numéros des contacts correspondants dans "contactNumbers".`
      : `- NE PAS lister les contactNumbers (trop de contacts). Fournir uniquement estimatedCount.`;
    const contactNumbersExample = withNumbers
      ? `, "contactNumbers": [1, 5, 12, 18, ...]`
      : ``;
    const excludedExample = withNumbers
      ? `{ "name": "Agences de communication", "reason": "Pas de prospection pour l'instant", "estimatedCount": 3, "contactNumbers": [7, 44, 98] }`
      : `{ "name": "Agences de communication", "reason": "Pas de prospection pour l'instant", "estimatedCount": 3 }`;
    const outputTokens = withNumbers ? Math.min(16000, 4000 + allContacts.length * 20) : 4000;

    const raw = await askAzureFast([
      {
        role: "system",
        content: `Tu es un expert en segmentation B2B. Tu analyses une liste COMPLÈTE de contacts et un contexte d'offre pour identifier les profils de clients idéaux (ICP).

INSTRUCTIONS IMPORTANTES :
- Tu reçois la TOTALITÉ des ${allContacts.length} contacts numérotés. Chaque contact DOIT être classé dans exactement une catégorie (ICP, exclu, ou "Autres / à qualifier"). La somme de TOUS les estimatedCount (catégories + excluded_segments) DOIT être égale à ${allContacts.length}.
- Si le contexte fourni contient des segments/ICP déjà définis, EXTRAIS-LES fidèlement (noms exacts, descriptions, critères). Ne les réinvente pas.
- Croise la **typologie de poste** (ex: DG, directeur technique, responsable patrimoine, élu...) et la **typologie d'entreprise** (ex: bailleur social, collectivité, opérateur EnR...) pour créer des ICP fins.
- Identifie les segments explicitement exclus dans le contexte. Compte aussi les contacts qui y correspondent.
- Pour chaque ICP, génère une "approach_key" : l'angle d'accroche principal à utiliser pour ce segment.
${contactNumbersInstruction}
- Ajoute une catégorie "Autres / à qualifier" pour les contacts qui ne correspondent clairement à aucun segment.
- Propose entre 3 et 12 catégories ICP (la catégorie "Autres" incluse).
${memoryBlock}

Réponds UNIQUEMENT en JSON valide, sans markdown.`,
      },
      {
        role: "user",
        content: `Contexte offre de ${company || "l'entreprise"}:
${offerContext || "Non spécifié"}

Voici la liste COMPLÈTE des ${allContacts.length} contacts à segmenter:
${contactLines}

Classe CHAQUE contact dans une catégorie. La somme des estimatedCount doit faire ${allContacts.length}.

Format JSON:
{
  "categories": [
    { "id": "icp_1", "name": "Directeur Patrimoine - Bailleur social", "description": "...", "criteria": "...", "approach_key": "...", "estimatedCount": 25${contactNumbersExample} },
    ...
  ],
  "excluded_segments": [
    ${excludedExample}
  ]
}`,
      },
    ], outputTokens);

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
            const offerBlock = offerContext ? `\n\n--- CONTEXTE DÉTAILLÉ DE L'OFFRE ---\n${offerContext}` : "";
            const raw = await askAzureFast([
              {
                role: "system",
                content: `Tu classes des contacts B2B dans les catégories ICP suivantes:
${categoryList}
${offerBlock}
${memoryBlock}

Pour chaque contact, détermine la catégorie ICP la plus pertinente en croisant le poste du contact et le type d'entreprise.
Si un contact ne correspond à aucun segment pertinent, classe-le comme "Hors cible".
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

        // Save classification results
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

        // Generate approach messages per ICP category
        const uniqueCategories = [...new Set(results.map((r) => r.icp_category).filter(Boolean))];
        if (uniqueCategories.length > 0 && offerContext) {
          send("progress", { current: done, total: batches.length, message: "Génération des messages d'approche..." });

          const approachMap = new Map<string, string>();
          const catDetails = categories || [];

          for (const catName of uniqueCategories) {
            if (catName === "Hors cible") continue;
            const catInfo = catDetails.find((c) => c.name === catName);
            try {
              const approachRaw = await askAzureFast([
                {
                  role: "system",
                  content: `Tu es un expert en prospection commerciale B2B pour ${company || "l'entreprise"}.
À partir du contexte ci-dessous, rédige un message d'approche court et percutant (3-5 phrases max) pour le segment "${catName}".
Le message doit être personnalisable avec {{prenom}} et {{entreprise}}.
Commence directement par le message, sans introduction ni explication.
Le ton doit être professionnel, direct et orienté valeur.`,
                },
                {
                  role: "user",
                  content: `Contexte de l'offre:\n${offerContext}\n\nSegment ciblé: ${catName}${catInfo ? `\nDescription: ${catInfo.description}\nCritères: ${catInfo.criteria}` : ""}`,
                },
              ], 500);
              approachMap.set(catName, approachRaw.trim());
            } catch (err) {
              console.error(`[ICP] Approach generation failed for "${catName}":`, err);
            }
          }

          // Save approach messages to contacts
          if (approachMap.size > 0) {
            await withLock("icp-contacts", async () => {
              const all = await readBlob<IcpContact>("icp-contacts");
              const idSet = new Set(results.map((r) => r.id));
              for (const c of all) {
                if (idSet.has(c.id) && c.icp_category && approachMap.has(c.icp_category)) {
                  c.icp_approach = approachMap.get(c.icp_category);
                }
              }
              await writeBlob("icp-contacts", all);
            });
          }

          send("approaches", Object.fromEntries(approachMap));
        }

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
