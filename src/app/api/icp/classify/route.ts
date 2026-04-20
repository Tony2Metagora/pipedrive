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
  const { action, ids, company, offerContext, categories, existingCategories, qualifyChoices, groupContacts } = body as {
    action: "discover" | "apply" | "batch-classify" | "qualify" | "apply-qualify" | "generate-approach";
    ids: string[];
    company: string;
    offerContext?: string;
    categories?: IcpCategory[];
    existingCategories?: { name: string; description: string }[];
    qualifyChoices?: { groupId: string; action: "assign" | "new_icp" | "exclude"; targetIcp?: string; newIcpName?: string }[];
    groupContacts?: Record<string, string[]>;
  };

  if (!ids?.length && action !== "generate-approach") {
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

  // ═══ DISCOVER: propose category taxonomy (NO contact assignment) ═══
  if (action === "discover") {
    const contactData = contacts.map((c) => ({
      poste: c.poste || "",
      entreprise: c.entreprise || "",
      ville: c.ville || "",
    }));
    const contactLines = contactData.map((c, i) => `${i + 1}. ${c.poste} | ${c.entreprise}${c.ville ? ` (${c.ville})` : ""}`).join("\n");

    const N = contactData.length;
    const minCats = Math.max(5, Math.ceil(N / 80));
    const maxCats = Math.min(25, Math.ceil(N / 20));

    const raw = await askAzureFast([
      {
        role: "system",
        content: `Tu es un expert en segmentation B2B. Tu analyses une liste de contacts et un contexte d'offre pour proposer des catégories ICP (profils de clients idéaux).

INSTRUCTIONS :
- Propose entre ${minCats} et ${maxCats} catégories ICP pertinentes.
- Chaque catégorie doit cibler environ 20 à 80 contacts sur les ${N} au total. Évite les catégories fourre-tout trop larges.
- Si le contexte contient des segments déjà définis, extrais-les fidèlement.
- Croise la **typologie de poste** (DG, directeur technique, élu...) et la **typologie d'entreprise** (bailleur social, collectivité...) pour des ICP fins.
- Pour chaque ICP, génère une "approach_key" : l'angle d'accroche principal.
- Identifie les segments à exclure.
- Ajoute une catégorie "Autres / à qualifier" pour les profils flous.
- NE LISTE PAS les contacts individuels. Propose UNIQUEMENT la taxonomie.
${memoryBlock}

Réponds UNIQUEMENT en JSON valide, sans markdown :
{
  "categories": [
    { "id": "icp_1", "name": "Nom", "description": "Description du profil", "criteria": "Critères d'appartenance (poste ET type d'entreprise)", "approach_key": "Angle d'accroche" },
    ...
  ],
  "excluded_segments": [
    { "name": "Nom du segment exclu", "reason": "Pourquoi" }
  ]
}`,
      },
      {
        role: "user",
        content: `Contexte offre de ${company || "l'entreprise"}:
${offerContext || "Non spécifié"}

Voici les ${N} contacts à segmenter (pour comprendre la répartition des profils) :
${contactLines}

Propose une taxonomie ICP adaptée. Entre ${minCats} et ${maxCats} catégories, chacune ciblant 20-80 contacts.`,
      },
    ], 4000);

    try {
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      const parsed = JSON.parse(cleaned);
      return new Response(JSON.stringify({ data: parsed }), { headers: { "Content-Type": "application/json" } });
    } catch {
      return new Response(JSON.stringify({ data: { categories: [] }, raw }), { headers: { "Content-Type": "application/json" } });
    }
  }

  // ═══ BATCH-CLASSIFY: assign each contact to a category (SSE) ═══
  if (action === "batch-classify" && categories?.length) {
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
                results.push({ id: String(item.id), icp_category: String(item.icp_category || "Autres / à qualifier") });
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

  // ═══ QUALIFY: cluster "Autres" contacts and propose questions ═══
  if (action === "qualify") {
    const existingIcpList = (existingCategories || []).map((c) => `- ${c.name}: ${c.description}`).join("\n");

    const contactLines = contacts.map((c, i) => `${i + 1}. ${c.poste || "?"} | ${c.entreprise || "?"}${c.ville ? ` (${c.ville})` : ""}`).join("\n");

    const raw = await askAzureFast([
      {
        role: "system",
        content: `Tu es un expert en segmentation B2B. On te donne des contacts qui n'ont pas pu être classés lors d'une première analyse ICP.

Ton travail : regrouper ces contacts en **sous-groupes homogènes** (3 à 8 groupes max) et pour chaque groupe proposer des options de classement.

ICP existants :
${existingIcpList}

${memoryBlock}

Pour chaque groupe, propose :
1. Un rattachement à un ICP existant (si pertinent)
2. La création d'un nouvel ICP (avec nom et description)
3. L'exclusion (hors cible)

Réponds UNIQUEMENT en JSON valide, sans markdown :
{
  "groups": [
    {
      "id": "g1",
      "label": "Nom court du groupe",
      "description": "Description du profil commun",
      "contactNumbers": [1, 5, 12],
      "count": 3,
      "suggestions": [
        { "type": "assign", "targetIcp": "Nom ICP existant", "reason": "Pourquoi ce rattachement" },
        { "type": "new_icp", "name": "Nom du nouvel ICP", "description": "Description", "reason": "Pourquoi un nouvel ICP" },
        { "type": "exclude", "reason": "Pourquoi exclure" }
      ],
      "recommended": "assign"
    }
  ]
}

IMPORTANT : Chaque contact doit apparaître dans exactement un groupe. La somme de tous les count doit faire ${contacts.length}.`,
      },
      {
        role: "user",
        content: `Contexte offre de ${company || "l'entreprise"}:
${offerContext || "Non spécifié"}

Voici les ${contacts.length} contacts non classés à analyser :
${contactLines}`,
      },
    ], Math.min(12000, 3000 + contacts.length * 15));

    try {
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      const parsed = JSON.parse(cleaned);
      return new Response(JSON.stringify({ data: parsed }), { headers: { "Content-Type": "application/json" } });
    } catch {
      return new Response(JSON.stringify({ data: { groups: [] }, raw }), { headers: { "Content-Type": "application/json" } });
    }
  }

  // ═══ APPLY-QUALIFY: reclassify based on user choices ═══
  if (action === "apply-qualify" && qualifyChoices?.length) {
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          try { controller.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch { /* closed */ }
        };

        send("progress", { message: "Application des choix de qualification..." });

        // Build mapping: contactId -> new category
        const updates: { id: string; icp_category: string; icp_reason: string }[] = [];
        for (const choice of qualifyChoices) {
          const contactIds = groupContacts?.[choice.groupId] || [];
          for (const contactId of contactIds) {
            if (choice.action === "assign" && choice.targetIcp) {
              updates.push({ id: contactId, icp_category: choice.targetIcp, icp_reason: "Qualifié manuellement" });
            } else if (choice.action === "new_icp" && choice.newIcpName) {
              updates.push({ id: contactId, icp_category: choice.newIcpName, icp_reason: "Nouveau segment identifié" });
            } else if (choice.action === "exclude") {
              updates.push({ id: contactId, icp_category: "Hors cible", icp_reason: "Exclu lors de la qualification" });
            }
          }
        }

        // Save updates
        if (updates.length > 0) {
          await withLock("icp-contacts", async () => {
            const all = await readBlob<IcpContact>("icp-contacts");
            const updateMap = new Map(updates.map((u) => [u.id, u]));
            for (const c of all) {
              const u = updateMap.get(c.id);
              if (u) {
                c.icp_category = u.icp_category;
                c.icp_reason = u.icp_reason;
              }
            }
            await writeBlob("icp-contacts", all);
          });
        }

        send("done", { qualified: updates.length, total: contacts.length });
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
