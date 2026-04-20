"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Users, Upload, Download, Search, Loader2, Sparkles, X, Trash2,
  Building2, ChevronDown, Check, Pencil, Save,
  Mail, FileArchive,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import JSZip from "jszip";

// ─── Types ──────────────────────────────────────────────

interface IcpList {
  id: string;
  name: string;
  company: string;
  created_at: string;
  count: number;
}

interface IcpContact {
  id: string;
  list_id: string;
  nom?: string;
  prenom?: string;
  email?: string;
  telephone?: string;
  poste?: string;
  entreprise?: string;
  linkedin?: string;
  ville?: string;
  icp_category?: string;
  icp_reason?: string;
  icp_approach?: string;
  [key: string]: unknown;
}

interface ParsedColumn {
  index: number;
  original: string;
  suggestedLabel: string;
  knownField: string | null;
  autoSelected: boolean;
  samples: string[];
}

interface IcpCategory {
  id: string;
  name: string;
  description: string;
  criteria: string;
  approach_key?: string;
  estimatedCount?: number;
  contactNumbers?: number[];
}

interface ExcludedSegment {
  name: string;
  reason: string;
  estimatedCount?: number;
  contactNumbers?: number[];
}

interface QualifyGroup {
  id: string;
  label: string;
  description: string;
  contactNumbers: number[];
  count: number;
  suggestions: { type: "assign" | "new_icp" | "exclude"; targetIcp?: string; name?: string; description?: string; reason: string }[];
  recommended: string;
}

interface QualifyChoice {
  groupId: string;
  action: "assign" | "new_icp" | "exclude";
  targetIcp?: string;
  newIcpName?: string;
}

// ─── Component ──────────────────────────────────────────

export default function IcpCleanerPage() {
  // Lists
  const [lists, setLists] = useState<IcpList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);

  // Contacts
  const [contacts, setContacts] = useState<IcpContact[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [icpFilter, setIcpFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Upload
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [parsedColumns, setParsedColumns] = useState<ParsedColumn[]>([]);
  const [parsing, setParsing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadListName, setUploadListName] = useState("");
  const [uploadCompany, setUploadCompany] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ICP Finder
  const [showIcpFinder, setShowIcpFinder] = useState(false);
  const [offerContext, setOfferContext] = useState("");
  const [extraListIds, setExtraListIds] = useState<Set<string>>(new Set());
  const [extraContacts, setExtraContacts] = useState<IcpContact[]>([]);
  const [discoveredCategories, setDiscoveredCategories] = useState<IcpCategory[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [excludedSegments, setExcludedSegments] = useState<ExcludedSegment[]>([]);
  const [editingCatIdx, setEditingCatIdx] = useState<number | null>(null);
  const [showRefine, setShowRefine] = useState(false);
  const [refineFeedback, setRefineFeedback] = useState("");

  // Step 2: Batch classification
  const [classifying, setClassifying] = useState(false);
  const [classifyProgress, setClassifyProgress] = useState("");
  const [classified, setClassified] = useState(false); // true once batch-classify is done
  const [categoryContactMap, setCategoryContactMap] = useState<Record<string, string[]>>({}); // categoryName → contactIds

  // Step 3: Rebalance (split/merge)
  const [qualifyGroups, setQualifyGroups] = useState<QualifyGroup[]>([]);
  const [qualifyChoices, setQualifyChoices] = useState<Record<string, QualifyChoice>>({});
  const [qualifyLoading, setQualifyLoading] = useState(false);
  const [splitTarget, setSplitTarget] = useState<string | null>(null); // category being split
  const [mergeSelection, setMergeSelection] = useState<Set<string>>(new Set()); // categories to merge

  // Results expand/collapse
  const [expandedDescs, setExpandedDescs] = useState<Set<string>>(new Set());
  const [expandedContacts, setExpandedContacts] = useState<Set<string>>(new Set());

  // Download from ICP Finder
  const [emailOnly, setEmailOnly] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [approachMessages, setApproachMessages] = useState<Record<string, string>>({});

  // Memory popup
  const [showMemory, setShowMemory] = useState(false);
  const [memoryContact, setMemoryContact] = useState<IcpContact | null>(null);
  const [memoryNewCat, setMemoryNewCat] = useState("");
  const [memoryReason, setMemoryReason] = useState("");

  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ─── Data fetching ────────────────────────────────────

  const fetchLists = useCallback(async () => {
    const res = await fetch("/api/icp/lists");
    const json = await res.json();
    setLists(json.lists || []);
  }, []);

  const fetchContacts = useCallback(async () => {
    if (!selectedListId) { setContacts([]); return; }
    setLoading(true);
    const res = await fetch(`/api/icp/contacts?list_id=${selectedListId}`);
    const json = await res.json();
    setContacts(json.data || []);
    setLoading(false);
  }, [selectedListId]);

  useEffect(() => { fetchLists(); }, [fetchLists]);
  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  // Load extra list contacts when toggled
  useEffect(() => {
    if (extraListIds.size === 0) { setExtraContacts([]); return; }
    Promise.all(
      Array.from(extraListIds).map((id) =>
        fetch(`/api/icp/contacts?list_id=${id}`).then((r) => r.json()).then((j) => (j.data || []) as IcpContact[])
      )
    ).then((results) => setExtraContacts(results.flat()));
  }, [extraListIds]);

  // Merged contacts = current list + extra lists, deduplicated by email (or nom+prenom+entreprise)
  const mergedContacts = useMemo(() => {
    const all = [...contacts, ...extraContacts];
    const seenEmails = new Set<string>();
    const seenNames = new Set<string>();
    return all.filter((c) => {
      const emailKey = c.email?.trim().toLowerCase() || "";
      const nameKey = [c.prenom, c.nom, c.entreprise].some(Boolean)
        ? `${(c.prenom || "").toLowerCase()}|${(c.nom || "").toLowerCase()}|${(c.entreprise || "").toLowerCase()}`
        : "";
      if (emailKey && seenEmails.has(emailKey)) return false;
      if (nameKey && seenNames.has(nameKey)) return false;
      if (emailKey) seenEmails.add(emailKey);
      if (nameKey) seenNames.add(nameKey);
      return true;
    });
  }, [contacts, extraContacts]);

  // Same-company lists (for multi-list picker)
  const sameCompanyLists = useMemo(() => {
    const currentList = lists.find((l) => l.id === selectedListId);
    if (!currentList?.company) return [];
    return lists.filter((l) => l.id !== selectedListId && l.company === currentList.company);
  }, [lists, selectedListId]);

  // ─── Known companies (from ICP lists + Prospect lists) ─

  const [prospectCompanies, setProspectCompanies] = useState<string[]>([]);
  useEffect(() => {
    fetch("/api/prospects/lists").then((r) => r.json()).then((d) => {
      const companies = ((d.data || d.lists || []) as { company?: string }[]).map((l) => l.company || "").filter(Boolean);
      setProspectCompanies(companies);
    }).catch(() => {});
  }, []);

  const knownCompanies = useMemo(() => {
    const set = new Set([...lists.map((l) => l.company).filter(Boolean), ...prospectCompanies]);
    return Array.from(set).sort();
  }, [lists, prospectCompanies]);

  // ─── ICP categories from current contacts ─────────────

  const icpCategories = useMemo(() => {
    const set = new Set(contacts.map((c) => c.icp_category).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [contacts]);

  // ─── Filtered contacts ────────────────────────────────

  const filtered = useMemo(() => {
    let result = contacts;
    if (icpFilter) result = result.filter((c) => c.icp_category === icpFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) =>
        [c.nom, c.prenom, c.email, c.poste, c.entreprise, c.icp_category]
          .some((v) => (v || "").toLowerCase().includes(q))
      );
    }
    return result;
  }, [contacts, icpFilter, search]);

  // ─── Upload flow ──────────────────────────────────────

  const handleFileSelect = async (file: File) => {
    setUploadFile(file);
    setUploadListName(file.name.replace(/\.[^.]+$/, ""));
    setParsing(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/icp/parse-headers", { method: "POST", body: formData });
      const json = await res.json();
      setParsedColumns(json.columns || []);
    } catch { setError("Erreur parsing fichier"); }
    setParsing(false);
  };

  const handleUpload = async () => {
    if (!uploadFile || !uploadListName.trim()) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", uploadFile);
    formData.append("list_name", uploadListName);
    formData.append("list_company", uploadCompany);
    const mapping = parsedColumns.filter((c) => c.knownField).map((c) => ({ index: c.index, targetField: c.knownField }));
    formData.append("column_mapping", JSON.stringify(mapping));
    try {
      const res = await fetch("/api/icp/upload", { method: "POST", body: formData });
      const json = await res.json();
      if (json.success) {
        setActionMsg(`${json.count} contacts importés`);
        setTimeout(() => setActionMsg(null), 4000);
        setShowUpload(false);
        setUploadFile(null);
        setParsedColumns([]);
        setSelectedListId(json.list_id);
        fetchLists();
        fetchContacts();
      } else {
        setError(json.error);
      }
    } catch { setError("Erreur upload"); }
    setUploading(false);
  };

  // ─── Delete list ──────────────────────────────────────

  const deleteList = async (id: string) => {
    if (!confirm("Supprimer cette liste et ses contacts ?")) return;
    await fetch(`/api/icp/lists?id=${id}`, { method: "DELETE" });
    if (selectedListId === id) { setSelectedListId(null); setContacts([]); }
    fetchLists();
    setActionMsg("Liste supprimée");
    setTimeout(() => setActionMsg(null), 3000);
  };

  // ─── ICP Finder ───────────────────────────────────────

  const isAutresCat = (name: string) =>
    name === "Autres / à qualifier" || name === "Autres / a qualifier";

  // ─── Full analysis: discover → classify → auto-rebalance ─

  const runFullAnalysis = async (customOfferContext?: string) => {
    const ctx = customOfferContext || offerContext;
    if (!ctx.trim()) return;
    const list = lists.find((l) => l.id === selectedListId);
    const contactIds = selected.size > 0 ? Array.from(selected) : mergedContacts.map((c) => c.id);

    // Reset state
    setDiscoveredCategories([]);
    setExcludedSegments([]);
    setClassified(false);
    setCategoryContactMap({});
    setDiscovering(true);
    setClassifyProgress("");

    try {
      // ── Step 1: Discover taxonomy ──
      setClassifyProgress("Étape 1/3 — Analyse des profils...");
      const discoverRes = await fetch("/api/icp/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "discover", ids: contactIds, company: list?.company || "", offerContext: ctx }),
      });
      const discoverJson = await discoverRes.json();
      const categories: IcpCategory[] = discoverJson.data?.categories || [];
      const excluded: ExcludedSegment[] = discoverJson.data?.excluded_segments || [];
      setDiscoveredCategories(categories);
      setExcludedSegments(excluded);

      if (categories.length === 0) { setError("Aucune catégorie identifiée"); setDiscovering(false); return; }

      // ── Step 2: Batch classify ──
      setClassifyProgress("Étape 2/3 — Classification des contacts...");
      setClassifying(true);
      const classifyRes = await fetch("/api/icp/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "batch-classify", ids: contactIds, company: list?.company || "", categories, offerContext: ctx }),
      });
      if (!classifyRes.body) throw new Error("No response body");

      // Consume SSE
      let map: Record<string, string[]> = {};
      const reader = classifyRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let eventType = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("event: ")) { eventType = line.slice(7).trim(); continue; }
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (eventType === "progress") setClassifyProgress(`Étape 2/3 — ${data.message || ""}`);
              if (eventType === "done") {
                for (const r of (data.results || []) as { id: string; icp_category: string }[]) {
                  if (!map[r.icp_category]) map[r.icp_category] = [];
                  map[r.icp_category].push(r.id);
                }
              }
              eventType = "";
            } catch { /* partial data */ }
          }
        }
      }
      setClassifying(false);

      // ── Step 3: Auto-rebalance ──
      setClassifyProgress("Étape 3/3 — Équilibrage...");
      const MIN_SIZE = 25;
      const MAX_SIZE = 100;
      let updatedCats = [...categories];
      let rebalanced = false;

      // 3a. Collect contacts from small categories and re-classify them into large ones
      const smallCatNames = Object.entries(map)
        .filter(([, ids]) => ids.length > 0 && ids.length < MIN_SIZE)
        .map(([name]) => name);
      const largeCatNames = Object.entries(map)
        .filter(([, ids]) => ids.length >= MIN_SIZE)
        .map(([name]) => name);

      if (smallCatNames.length > 0 && largeCatNames.length > 0) {
        setClassifyProgress("Étape 3/3 — Redistribution des petits groupes...");
        const smallContactIds: string[] = [];
        for (const name of smallCatNames) {
          smallContactIds.push(...(map[name] || []));
          delete map[name];
          updatedCats = updatedCats.filter((c) => c.name !== name);
        }
        // Re-classify these contacts into the large categories only
        const largeCats = updatedCats.filter((c) => largeCatNames.includes(c.name));
        try {
          const rebalRes = await fetch("/api/icp/classify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "batch-classify", ids: smallContactIds, company: list?.company || "", categories: largeCats, offerContext: ctx }),
          });
          if (rebalRes.body) {
            const rr = rebalRes.body.getReader();
            const rd = new TextDecoder();
            let rb = "";
            let re = "";
            while (true) {
              const { done: rdone, value: rval } = await rr.read();
              if (rdone) break;
              rb += rd.decode(rval, { stream: true });
              const rlines = rb.split("\n");
              rb = rlines.pop() || "";
              for (const rl of rlines) {
                if (rl.startsWith("event: ")) { re = rl.slice(7).trim(); continue; }
                if (rl.startsWith("data: ") && re === "done") {
                  try {
                    const rd2 = JSON.parse(rl.slice(6));
                    for (const r of (rd2.results || []) as { id: string; icp_category: string }[]) {
                      const target = map[r.icp_category];
                      if (target) target.push(r.id);
                      else map[r.icp_category] = [r.id];
                    }
                  } catch { /* partial */ }
                  re = "";
                }
              }
            }
          }
          rebalanced = true;
        } catch { /* if re-classify fails, contacts are lost — add them to first large cat */
          if (largeCatNames[0]) map[largeCatNames[0]].push(...smallContactIds);
        }
      }

      // 3b. Split large categories via sub-classification
      const toSplit = Object.entries(map).filter(([, ids]) => ids.length > MAX_SIZE);
      for (const [catName, ids] of toSplit) {
        setClassifyProgress(`Étape 3/3 — Découpage de "${catName}" (${ids.length})...`);
        try {
          const subRes = await fetch("/api/icp/classify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "qualify",
              ids,
              company: list?.company || "",
              offerContext: ctx,
              existingCategories: updatedCats.filter((c) => c.name !== catName).map((c) => ({ name: c.name, description: c.description })),
            }),
          });
          const subJson = await subRes.json();
          const groups = subJson.data?.groups || [];
          if (groups.length >= 2) {
            delete map[catName];
            updatedCats = updatedCats.filter((c) => c.name !== catName);
            for (const g of groups) {
              const subIds = g.contactNumbers.map((n: number) => ids[n - 1]).filter(Boolean);
              const newIcp = g.suggestions?.find((s: { type: string }) => s.type === "new_icp");
              const subName = newIcp?.name || `${catName} — ${g.label}`;
              const subDesc = newIcp?.description || g.description || "";
              map[subName] = [...(map[subName] || []), ...subIds];
              if (!updatedCats.find((c) => c.name === subName)) {
                updatedCats.push({ id: `icp_sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, name: subName, description: subDesc, criteria: "" });
              }
            }
            rebalanced = true;
          }
        } catch { /* keep original */ }
      }

      // 3c. Sync updatedCats with map (add any categories the AI created that aren't in updatedCats)
      for (const name of Object.keys(map)) {
        if (!updatedCats.find((c) => c.name === name)) {
          updatedCats.push({ id: `icp_auto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, name, description: "", criteria: "" });
        }
      }

      setCategoryContactMap(map);
      setDiscoveredCategories(updatedCats);
      setClassified(true);
      setClassifyProgress("");
      const total = Object.values(map).reduce((s, ids) => s + ids.length, 0);
      setActionMsg(`${total} contacts répartis dans ${Object.keys(map).length} ICP${rebalanced ? " (équilibrage auto)" : ""}`);
      setTimeout(() => setActionMsg(null), 6000);
    } catch (e) { setError(String(e)); }
    setDiscovering(false);
    setClassifying(false);
  };

  const refineAndRerun = async () => {
    if (!refineFeedback.trim()) return;
    const currentSummary = discoveredCategories.map((c) => `- ${c.name}: ${c.description}`).join("\n");
    const excludedSummary = excludedSegments.map((s) => `- ${s.name} (exclu): ${s.reason}`).join("\n");
    const refinedContext = `${offerContext}

--- CATÉGORIES PRÉCÉDENTES ---
${currentSummary}
${excludedSummary ? `\nSegments exclus:\n${excludedSummary}` : ""}

--- FEEDBACK UTILISATEUR ---
${refineFeedback}

IMPORTANT : Tiens compte du feedback ci-dessus pour ajuster la taxonomie ICP.`;
    setShowRefine(false);
    setRefineFeedback("");
    await runFullAnalysis(refinedContext);
  };

  // Computed: contact count per category (after classification)
  const getCatCount = (catName: string) => (categoryContactMap[catName] || []).length;
  const totalClassified = Object.values(categoryContactMap).reduce((s, ids) => s + ids.length, 0);

  // Step 3: Rebalance — split large category
  const startSplit = async (catName: string) => {
    const contactIds = categoryContactMap[catName] || [];
    if (contactIds.length === 0) return;
    setSplitTarget(catName);
    setQualifyLoading(true);
    setQualifyGroups([]);
    setQualifyChoices({});
    const list = lists.find((l) => l.id === selectedListId);
    const otherCats = discoveredCategories
      .filter((c) => c.name !== catName && !isAutresCat(c.name))
      .map((c) => ({ name: c.name, description: c.description }));
    try {
      const res = await fetch("/api/icp/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "qualify",
          ids: contactIds,
          company: list?.company || "",
          offerContext,
          existingCategories: otherCats,
        }),
      });
      const json = await res.json();
      const groups: QualifyGroup[] = json.data?.groups || [];
      setQualifyGroups(groups);
      const defaults: Record<string, QualifyChoice> = {};
      for (const g of groups) {
        const rec = g.suggestions.find((s) => s.type === g.recommended) || g.suggestions[0];
        if (rec) {
          defaults[g.id] = {
            groupId: g.id,
            action: rec.type,
            targetIcp: rec.type === "assign" ? rec.targetIcp : undefined,
            newIcpName: rec.type === "new_icp" ? rec.name : undefined,
          };
        }
      }
      setQualifyChoices(defaults);
    } catch { setError("Erreur lors du sous-découpage"); }
    setQualifyLoading(false);
  };

  const applySplit = () => {
    if (!splitTarget) return;
    const sourceIds = categoryContactMap[splitTarget] || [];
    const newMap = { ...categoryContactMap };
    const remainingIds: string[] = [];
    const newCats = [...discoveredCategories];

    // Build a map from qualify group contactNumbers to actual contact IDs
    // contactNumbers in qualify groups are 1-indexed into the sourceIds array
    for (const g of qualifyGroups) {
      const choice = qualifyChoices[g.id];
      const groupIds = g.contactNumbers.map((n) => sourceIds[n - 1]).filter(Boolean);
      if (!choice) { remainingIds.push(...groupIds); continue; }
      if (choice.action === "assign" && choice.targetIcp) {
        newMap[choice.targetIcp] = [...(newMap[choice.targetIcp] || []), ...groupIds];
      } else if (choice.action === "new_icp" && choice.newIcpName) {
        newMap[choice.newIcpName] = [...(newMap[choice.newIcpName] || []), ...groupIds];
        if (!newCats.find((c) => c.name === choice.newIcpName)) {
          const suggestion = g.suggestions.find((s) => s.type === "new_icp");
          newCats.push({
            id: `icp_new_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: choice.newIcpName,
            description: suggestion?.description || "",
            criteria: suggestion?.description || "",
          });
        }
      } else if (choice.action === "exclude") {
        newMap["Hors cible"] = [...(newMap["Hors cible"] || []), ...groupIds];
      } else {
        remainingIds.push(...groupIds);
      }
    }

    // Update or remove the original category
    if (remainingIds.length > 0) {
      newMap[splitTarget] = remainingIds;
    } else {
      delete newMap[splitTarget];
      const idx = newCats.findIndex((c) => c.name === splitTarget);
      if (idx >= 0) newCats.splice(idx, 1);
    }

    setCategoryContactMap(newMap);
    setDiscoveredCategories(newCats);
    setSplitTarget(null);
    setQualifyGroups([]);
    setQualifyChoices({});
    setActionMsg("Catégorie sous-découpée");
    setTimeout(() => setActionMsg(null), 4000);
  };

  // Step 3: Rebalance — merge small categories
  const applyMerge = () => {
    if (mergeSelection.size < 2) return;
    const names = Array.from(mergeSelection);
    const mergedName = names.join(" + ");
    const newMap = { ...categoryContactMap };
    const mergedIds: string[] = [];
    for (const name of names) {
      mergedIds.push(...(newMap[name] || []));
      delete newMap[name];
    }
    newMap[mergedName] = mergedIds;

    const newCats = discoveredCategories.filter((c) => !mergeSelection.has(c.name));
    const firstCat = discoveredCategories.find((c) => mergeSelection.has(c.name));
    newCats.push({
      id: `icp_merged_${Date.now()}`,
      name: mergedName,
      description: names.map((n) => discoveredCategories.find((c) => c.name === n)?.description || "").join(" / "),
      criteria: firstCat?.criteria || "",
    });

    setCategoryContactMap(newMap);
    setDiscoveredCategories(newCats);
    setMergeSelection(new Set());
    setActionMsg(`${names.length} catégories fusionnées`);
    setTimeout(() => setActionMsg(null), 4000);
  };

  // ─── Generate approach messages + Download ZIP ────────

  const generateApproaches = async (): Promise<Record<string, string>> => {
    const list = lists.find((l) => l.id === selectedListId);
    const catsToProcess = discoveredCategories.filter((c) => !isAutresCat(c.name) && c.name !== "Hors cible");
    const messages: Record<string, string> = {};
    for (const cat of catsToProcess) {
      try {
        const res = await fetch("/api/icp/classify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "generate-approach",
            ids: [],
            company: list?.company || "",
            offerContext,
            categories: [cat],
          }),
        });
        const json = await res.json();
        if (json.message) messages[cat.name] = json.message;
      } catch { /* skip */ }
    }
    setApproachMessages(messages);
    return messages;
  };

  const escapeCsvField = (val: string) => {
    if (val.includes(",") || val.includes('"') || val.includes("\n") || val.includes(";")) {
      return '"' + val.replace(/"/g, '""') + '"';
    }
    return val;
  };

  const contactById = useMemo(() => {
    const map = new Map<string, IcpContact>();
    for (const c of mergedContacts) map.set(c.id, c);
    return map;
  }, [mergedContacts]);

  const downloadZip = async () => {
    if (!classified || Object.keys(categoryContactMap).length === 0) return;
    setDownloading(true);
    try {
      const messages = await generateApproaches();
      const zip = new JSZip();
      const csvHeader = "Prénom;Nom;Email;Téléphone;Poste;Entreprise;LinkedIn;Ville";

      for (const [catName, contactIds] of Object.entries(categoryContactMap)) {
        let catContacts = contactIds.map((id) => contactById.get(id)).filter(Boolean) as IcpContact[];
        if (emailOnly) catContacts = catContacts.filter((c) => c.email?.trim());
        if (catContacts.length === 0) continue;
        const rows = catContacts.map((c) =>
          [c.prenom, c.nom, c.email, c.telephone, c.poste, c.entreprise, c.linkedin, c.ville]
            .map((v) => escapeCsvField(String(v || ""))).join(";")
        );
        const csv = "\uFEFF" + [csvHeader, ...rows].join("\n");
        const safeName = catName.replace(/[\\/:*?"<>|]/g, "").slice(0, 60);
        zip.file(`${safeName}.csv`, csv);
      }

      if (Object.keys(messages).length > 0) {
        const approachHeader = "ICP;Titre;Message type";
        const approachRows = discoveredCategories
          .filter((c) => messages[c.name])
          .map((c) => [c.name, c.approach_key || "", messages[c.name] || ""].map((v) => escapeCsvField(String(v))).join(";"));
        const approachCsv = "\uFEFF" + [approachHeader, ...approachRows].join("\n");
        zip.file("Messages d'approche.csv", approachCsv);
      }

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const list = lists.find((l) => l.id === selectedListId);
      link.href = url;
      link.download = `ICP - ${list?.company || "export"}.zip`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) { setError(String(e)); }
    setDownloading(false);
  };

  // ─── Save ICP correction (memory) ─────────────────────

  const saveMemory = async () => {
    if (!memoryContact || !memoryNewCat.trim()) return;
    const list = lists.find((l) => l.id === selectedListId);
    await fetch("/api/icp/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company: list?.company || "",
        contact_id: memoryContact.id,
        poste: memoryContact.poste || "",
        entreprise: memoryContact.entreprise || "",
        old_category: memoryContact.icp_category || "",
        new_category: memoryNewCat,
        reason: memoryReason,
      }),
    });
    // Update contact locally
    await fetch("/api/icp/contacts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [memoryContact.id], updates: { icp_category: memoryNewCat } }),
    });
    setShowMemory(false);
    setMemoryContact(null);
    setMemoryNewCat("");
    setMemoryReason("");
    fetchContacts();
    setActionMsg("ICP mis à jour + mémoire sauvegardée");
    setTimeout(() => setActionMsg(null), 3000);
  };

  // ─── Export CSV (simple, from table) ────────────────────

  const exportCsv = async () => {
    if (!selectedListId) return;
    const list = lists.find((l) => l.id === selectedListId);
    const filename = list?.name || "icp-export";
    const params = new URLSearchParams({ list_id: selectedListId, filename });
    if (icpFilter) params.set("icp_category", icpFilter);
    const res = await fetch(`/api/icp/download?${params}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // ─── Export ICP PDF ────────────────────────────────────

  const exportIcpPdf = () => {
    const list = lists.find((l) => l.id === selectedListId);
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    let y = 15;

    // Title
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(`ICP Analysis — ${list?.company || ""}`, 14, y);
    y += 6;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120);
    doc.text(`${list?.name || ""} • ${mergedContacts.length} contacts • ${new Date().toLocaleDateString("fr-FR")}`, 14, y);
    doc.setTextColor(0);
    y += 10;

    // Each ICP category
    discoveredCategories.forEach((cat) => {
      const catContacts = cat.contactNumbers
        ? cat.contactNumbers.map((n) => mergedContacts[n - 1]).filter(Boolean)
        : [];

      // Check page space
      if (y > 260) { doc.addPage(); y = 15; }

      // Category header
      doc.setFillColor(124, 58, 237);
      doc.roundedRect(14, y, pageW - 28, 7, 1, 1, "F");
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255);
      doc.text(`${cat.name}  (${catContacts.length} contacts)`, 17, y + 5);
      doc.setTextColor(0);
      y += 10;

      // Description
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80);
      const descLines = doc.splitTextToSize(cat.description || "", pageW - 32);
      doc.text(descLines, 16, y);
      y += descLines.length * 3.5 + 2;

      // Approach message (full if available, fallback to approach_key)
      const fullMsg = approachMessages[cat.name];
      if (fullMsg || cat.approach_key) {
        doc.setFont("helvetica", "bolditalic");
        doc.setTextColor(5, 122, 85);
        const msgText = fullMsg ? `Message d'approche:\n${fullMsg}` : `Accroche: ${cat.approach_key}`;
        const approachLines = doc.splitTextToSize(msgText, pageW - 32);
        if (y + approachLines.length * 3.5 > 270) { doc.addPage(); y = 15; }
        doc.text(approachLines, 16, y);
        y += approachLines.length * 3.5 + 3;
      }
      doc.setTextColor(0);

      // Contact table
      if (catContacts.length > 0) {
        autoTable(doc, {
          startY: y,
          margin: { left: 14, right: 14 },
          head: [["Prenom", "Nom", "Poste", "Entreprise", "Email"]],
          body: catContacts.map((c) => [
            c.prenom || "", c.nom || "", c.poste || "", c.entreprise || "", c.email || "",
          ]),
          styles: { fontSize: 7, cellPadding: 1.5 },
          headStyles: { fillColor: [237, 233, 254], textColor: [88, 28, 135], fontStyle: "bold" },
          alternateRowStyles: { fillColor: [249, 250, 251] },
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      } else {
        y += 4;
      }
    });

    // Excluded segments
    if (excludedSegments.length > 0) {
      if (y > 250) { doc.addPage(); y = 15; }
      doc.setFillColor(251, 146, 60);
      doc.roundedRect(14, y, pageW - 28, 7, 1, 1, "F");
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255);
      doc.text("Segments exclus", 17, y + 5);
      doc.setTextColor(0);
      y += 10;

      excludedSegments.forEach((seg) => {
        if (y > 270) { doc.addPage(); y = 15; }
        const exclContacts = seg.contactNumbers
          ? seg.contactNumbers.map((n) => mergedContacts[n - 1]).filter(Boolean)
          : [];

        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(180, 83, 9);
        doc.text(`${seg.name} (${exclContacts.length} contacts) — ${seg.reason}`, 16, y);
        doc.setTextColor(0);
        y += 5;

        if (exclContacts.length > 0) {
          autoTable(doc, {
            startY: y,
            margin: { left: 14, right: 14 },
            head: [["Prenom", "Nom", "Poste", "Entreprise"]],
            body: exclContacts.map((c) => [c.prenom || "", c.nom || "", c.poste || "", c.entreprise || ""]),
            styles: { fontSize: 7, cellPadding: 1.5 },
            headStyles: { fillColor: [255, 237, 213], textColor: [154, 52, 18], fontStyle: "bold" },
          });
          y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
        }
      });
    }

    doc.save(`ICP-${list?.company || "export"}-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const exportApproachPdf = () => {
    const list = lists.find((l) => l.id === selectedListId);
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    let y = 15;

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(`Messages d'approche — ${list?.company || ""}`, 14, y);
    y += 6;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120);
    doc.text(`${list?.name || ""} • ${new Date().toLocaleDateString("fr-FR")}`, 14, y);
    doc.setTextColor(0);
    y += 10;

    const catsToShow = icpFilter ? [icpFilter] : icpCategories;
    catsToShow.forEach((cat) => {
      const approachMsg = contacts.find((c) => c.icp_category === cat && c.icp_approach)?.icp_approach;
      if (!approachMsg) return;
      const count = contacts.filter((c) => c.icp_category === cat).length;

      if (y > 240) { doc.addPage(); y = 15; }

      // ICP header
      doc.setFillColor(5, 122, 85);
      doc.roundedRect(14, y, pageW - 28, 7, 1, 1, "F");
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255);
      doc.text(`${cat}  (${count} contacts)`, 17, y + 5);
      doc.setTextColor(0);
      y += 12;

      // Message body
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      const msgLines = doc.splitTextToSize(approachMsg, pageW - 32);
      doc.text(msgLines, 16, y);
      y += msgLines.length * 4.5 + 8;
    });

    doc.save(`Messages-approche-${list?.company || "export"}-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  // ─── Select all / toggle ──────────────────────────────

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((c) => c.id)));
  };

  // ─── Render ───────────────────────────────────────────

  const selectedList = lists.find((l) => l.id === selectedListId);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center">
            <Users className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">ICP Cleaner</h1>
            <p className="text-sm text-gray-500">Classification de contacts par profil client</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedListId && (
            <>
              <button onClick={() => setShowIcpFinder(true)}
                disabled={contacts.length === 0}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-violet-600 border border-violet-300 rounded-lg hover:bg-violet-50 disabled:opacity-50 cursor-pointer">
                <Sparkles className="w-4 h-4" /> ICP Finder
              </button>
              <button onClick={exportCsv}
                disabled={filtered.length === 0}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-green-600 border border-green-300 rounded-lg hover:bg-green-50 disabled:opacity-50 cursor-pointer">
                <Download className="w-4 h-4" /> Export CSV
              </button>
            </>
          )}
          <button onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 cursor-pointer">
            <Upload className="w-4 h-4" /> Importer CSV
          </button>
        </div>
      </div>

      {/* Messages */}
      {actionMsg && (
        <div className="mb-4 bg-green-50 text-green-700 text-sm px-4 py-2 rounded-lg flex items-center gap-2">
          <Check className="w-4 h-4" /> {actionMsg}
        </div>
      )}
      {error && (
        <div className="mb-4 bg-red-50 text-red-700 text-sm px-4 py-2 rounded-lg flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)} className="cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="flex gap-4">
        {/* ── Left panel: Lists ── */}
        <div className="w-56 shrink-0">
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Fichiers ICP</h3>
            <div className="space-y-1">
              {lists.length === 0 && <p className="text-xs text-gray-400 py-2">Aucun fichier</p>}
              {lists.map((l) => (
                <div key={l.id} className={cn("group flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs cursor-pointer",
                  selectedListId === l.id ? "bg-violet-50 text-violet-700" : "text-gray-600 hover:bg-gray-50"
                )}>
                  <button onClick={() => { setSelectedListId(l.id); setIcpFilter(null); setSelected(new Set()); }}
                    className="flex-1 text-left min-w-0 cursor-pointer">
                    <p className="truncate font-medium">{l.name}</p>
                    <p className="text-[9px] text-gray-400 flex items-center gap-1">
                      <Building2 className="w-2.5 h-2.5" /> {l.company || "—"}
                    </p>
                  </button>
                  <span className="text-[9px] text-gray-400 shrink-0">{l.count}</span>
                  <button onClick={(e) => { e.stopPropagation(); deleteList(l.id); }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-300 hover:text-red-500 cursor-pointer">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* ICP filter */}
          {icpCategories.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-3 mt-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase">Filtre ICP</h3>
                <button onClick={async () => {
                  if (!confirm("Supprimer toutes les classifications ICP de cette liste ?")) return;
                  const ids = contacts.map((c) => c.id);
                  await fetch("/api/icp/contacts", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ids, updates: { icp_category: "", icp_reason: "", icp_approach: "" } }),
                  });
                  setIcpFilter(null);
                  fetchContacts();
                  setActionMsg("Classifications ICP supprimées");
                  setTimeout(() => setActionMsg(null), 3000);
                }} className="p-0.5 text-gray-300 hover:text-red-500 cursor-pointer" title="Supprimer toutes les classifications">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
              <button onClick={() => setIcpFilter(null)}
                className={cn("w-full text-left px-2 py-1 rounded text-xs cursor-pointer mb-1",
                  !icpFilter ? "bg-violet-50 text-violet-700 font-medium" : "text-gray-500 hover:bg-gray-50"
                )}>Tous ({contacts.length})</button>
              {icpCategories.map((cat) => {
                const count = contacts.filter((c) => c.icp_category === cat).length;
                return (
                  <div key={cat} className={cn("group flex items-center rounded text-xs",
                    icpFilter === cat ? "bg-violet-50" : "hover:bg-gray-50"
                  )}>
                    <button onClick={() => setIcpFilter(cat)}
                      className={cn("flex-1 text-left px-2 py-1 cursor-pointer",
                        icpFilter === cat ? "text-violet-700 font-medium" : "text-gray-500"
                      )}>{cat} ({count})</button>
                    {icpFilter === cat && (
                      <button onClick={(e) => { e.stopPropagation(); setIcpFilter(null); }}
                        className="p-0.5 mr-1 text-violet-400 hover:text-violet-700 cursor-pointer">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Center: Table ── */}
        <div className="flex-1 min-w-0">
          {!selectedListId ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p className="text-lg font-medium text-gray-600">Sélectionnez un fichier</p>
              <p className="text-sm text-gray-400">ou importez un CSV pour commencer</p>
            </div>
          ) : loading ? (
            <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-violet-400" /></div>
          ) : (
            <>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Toolbar */}
              <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50/50">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)}
                    placeholder="Rechercher..." className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg" />
                </div>
                <span className="text-xs text-gray-500">{filtered.length} contact{filtered.length > 1 ? "s" : ""}</span>
                {selected.size > 0 && (
                  <span className="text-xs text-violet-600 font-medium">{selected.size} sélectionné{selected.size > 1 ? "s" : ""}</span>
                )}
              </div>

              {/* Table — grouped by ICP when classified, flat otherwise */}
              <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
                {icpCategories.length > 0 && !icpFilter ? (
                  /* ── Grouped view ── */
                  <div className="divide-y divide-gray-100">
                    {icpCategories.map((cat) => {
                      const catContacts = filtered.filter((c) => c.icp_category === cat);
                      if (catContacts.length === 0) return null;
                      return (
                        <div key={cat} className="pb-2">
                          {/* ICP header */}
                          <div className="sticky top-0 z-10 bg-violet-50 border-b border-violet-200 px-3 py-2 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-violet-800">{cat}</span>
                              <span className="text-[10px] text-violet-500 font-medium">{catContacts.length} contact{catContacts.length > 1 ? "s" : ""}</span>
                            </div>
                          </div>
                          {/* Contact rows */}
                          <table className="w-full text-xs">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-2 py-1.5 text-left w-8">
                                  <input type="checkbox"
                                    checked={catContacts.every((c) => selected.has(c.id))}
                                    onChange={() => {
                                      const next = new Set(selected);
                                      const allSelected = catContacts.every((c) => next.has(c.id));
                                      catContacts.forEach((c) => allSelected ? next.delete(c.id) : next.add(c.id));
                                      setSelected(next);
                                    }}
                                    className="accent-violet-600 cursor-pointer" />
                                </th>
                                <th className="px-2 py-1.5 text-left text-gray-500 font-medium">Prénom</th>
                                <th className="px-2 py-1.5 text-left text-gray-500 font-medium">Nom</th>
                                <th className="px-2 py-1.5 text-left text-gray-500 font-medium">Email</th>
                                <th className="px-2 py-1.5 text-left text-gray-500 font-medium">Poste</th>
                                <th className="px-2 py-1.5 text-left text-gray-500 font-medium">Entreprise</th>
                              </tr>
                            </thead>
                            <tbody>
                              {catContacts.map((c) => (
                                <tr key={c.id} className={cn("border-b border-gray-50 hover:bg-gray-50/50",
                                  selected.has(c.id) && "bg-violet-50/30"
                                )}>
                                  <td className="px-2 py-1.5">
                                    <input type="checkbox" checked={selected.has(c.id)}
                                      onChange={(e) => {
                                        const next = new Set(selected);
                                        e.target.checked ? next.add(c.id) : next.delete(c.id);
                                        setSelected(next);
                                      }}
                                      className="accent-violet-600 cursor-pointer" />
                                  </td>
                                  <td className="px-2 py-1.5 text-gray-800">{c.prenom}</td>
                                  <td className="px-2 py-1.5 text-gray-800">{c.nom}</td>
                                  <td className="px-2 py-1.5 text-gray-600 truncate max-w-[200px]">{c.email}</td>
                                  <td className="px-2 py-1.5 text-gray-600 truncate max-w-[150px]">{c.poste}</td>
                                  <td className="px-2 py-1.5 text-gray-600 truncate max-w-[150px]">{c.entreprise}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    })}
                    {/* Unclassified contacts */}
                    {filtered.some((c) => !c.icp_category) && (
                      <div className="pb-2">
                        <div className="sticky top-0 z-10 bg-gray-100 border-b border-gray-200 px-3 py-2">
                          <span className="text-xs font-semibold text-gray-600">Non classés</span>
                          <span className="ml-2 text-[10px] text-gray-400">{filtered.filter((c) => !c.icp_category).length} contacts</span>
                        </div>
                        <table className="w-full text-xs">
                          <tbody>
                            {filtered.filter((c) => !c.icp_category).map((c) => (
                              <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                                <td className="px-2 py-1.5 w-8">
                                  <input type="checkbox" checked={selected.has(c.id)}
                                    onChange={(e) => {
                                      const next = new Set(selected);
                                      e.target.checked ? next.add(c.id) : next.delete(c.id);
                                      setSelected(next);
                                    }}
                                    className="accent-violet-600 cursor-pointer" />
                                </td>
                                <td className="px-2 py-1.5 text-gray-800">{c.prenom}</td>
                                <td className="px-2 py-1.5 text-gray-800">{c.nom}</td>
                                <td className="px-2 py-1.5 text-gray-600 truncate max-w-[200px]">{c.email}</td>
                                <td className="px-2 py-1.5 text-gray-600 truncate max-w-[150px]">{c.poste}</td>
                                <td className="px-2 py-1.5 text-gray-600 truncate max-w-[150px]">{c.entreprise}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ) : (
                  /* ── Flat view (no ICP yet, or filtered to one ICP) ── */
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0 z-10">
                      <tr>
                        <th className="px-2 py-2 text-left w-8">
                          <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0}
                            onChange={toggleAll} className="accent-violet-600 cursor-pointer" />
                        </th>
                        <th className="px-2 py-2 text-left text-gray-500 font-medium">Prénom</th>
                        <th className="px-2 py-2 text-left text-gray-500 font-medium">Nom</th>
                        <th className="px-2 py-2 text-left text-gray-500 font-medium">Email</th>
                        <th className="px-2 py-2 text-left text-gray-500 font-medium">Poste</th>
                        <th className="px-2 py-2 text-left text-gray-500 font-medium">Entreprise</th>
                        <th className="px-2 py-2 text-left text-gray-500 font-medium">ICP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((c) => (
                        <tr key={c.id} className={cn("border-b border-gray-50 hover:bg-gray-50/50",
                          selected.has(c.id) && "bg-violet-50/30"
                        )}>
                          <td className="px-2 py-1.5">
                            <input type="checkbox" checked={selected.has(c.id)}
                              onChange={(e) => {
                                const next = new Set(selected);
                                e.target.checked ? next.add(c.id) : next.delete(c.id);
                                setSelected(next);
                              }}
                              className="accent-violet-600 cursor-pointer" />
                          </td>
                          <td className="px-2 py-1.5 text-gray-800">{c.prenom}</td>
                          <td className="px-2 py-1.5 text-gray-800">{c.nom}</td>
                          <td className="px-2 py-1.5 text-gray-600 truncate max-w-[200px]">{c.email}</td>
                          <td className="px-2 py-1.5 text-gray-600 truncate max-w-[150px]">{c.poste}</td>
                          <td className="px-2 py-1.5 text-gray-600 truncate max-w-[150px]">{c.entreprise}</td>
                          <td className="px-2 py-1.5">
                            {c.icp_category ? (
                              <button onClick={() => { setMemoryContact(c); setMemoryNewCat(c.icp_category || ""); setMemoryReason(""); setShowMemory(true); }}
                                className="text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded text-[10px] font-medium hover:bg-violet-100 cursor-pointer"
                                title={c.icp_reason || ""}>
                                {c.icp_category}
                              </button>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}


              </div>
            </div>

            {/* ── Approach messages — separate block per ICP ── */}
            {icpCategories.length > 0 && contacts.some((c) => c.icp_approach) && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase">Messages d&apos;approche par ICP</p>
                  <button onClick={exportApproachPdf}
                    className="flex items-center gap-1 text-[10px] text-emerald-700 hover:text-emerald-900 cursor-pointer">
                    <Download className="w-3 h-3" /> Télécharger PDF
                  </button>
                </div>
                {(icpFilter ? [icpFilter] : icpCategories).map((cat) => {
                  const approachMsg = contacts.find((c) => c.icp_category === cat && c.icp_approach)?.icp_approach;
                  if (!approachMsg) return null;
                  return (
                    <div key={cat} className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                      <p className="text-[10px] font-semibold text-emerald-700 uppercase mb-1">Message d&apos;approche — {cat}</p>
                      <p className="text-xs text-emerald-800 whitespace-pre-line leading-relaxed">{approachMsg}</p>
                    </div>
                  );
                })}
              </div>
            )}
            </>
          )}
        </div>
      </div>

      {/* ═══ Upload Modal ═══ */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-5 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900">Importer un fichier CSV</h3>
              <button onClick={() => { setShowUpload(false); setUploadFile(null); setParsedColumns([]); }} className="cursor-pointer"><X className="w-4 h-4 text-gray-400" /></button>
            </div>

            <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }} />
            <button onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-violet-400 cursor-pointer mb-4">
              <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
              <p className="text-sm text-gray-600">{uploadFile ? uploadFile.name : "Cliquer pour sélectionner un fichier"}</p>
            </button>

            {parsing && <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Analyse du fichier...</div>}

            {parsedColumns.length > 0 && (
              <>
                <div className="mb-3">
                  <label className="text-xs font-medium text-gray-600">Nom de la liste</label>
                  <input value={uploadListName} onChange={(e) => setUploadListName(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1" />
                </div>
                <div className="mb-3">
                  <label className="text-xs font-medium text-gray-600">Entreprise</label>
                  <select value={uploadCompany} onChange={(e) => setUploadCompany(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1">
                    <option value="">Sélectionner...</option>
                    {knownCompanies.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <input value={uploadCompany} onChange={(e) => setUploadCompany(e.target.value)}
                    placeholder="ou saisir un nouveau nom" className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs mt-1" />
                </div>
                <div className="mb-3">
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Colonnes détectées</label>
                  <div className="text-[10px] text-gray-500 space-y-1 max-h-40 overflow-y-auto">
                    {parsedColumns.map((col) => (
                      <div key={col.index} className="flex items-center gap-2">
                        <span className={cn("w-4 h-4 rounded flex items-center justify-center", col.knownField ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400")}>
                          {col.knownField ? <Check className="w-3 h-3" /> : "?"}
                        </span>
                        <span className="font-medium text-gray-700">{col.original}</span>
                        <span className="text-gray-400">→ {col.knownField || "ignoré"}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <button onClick={handleUpload} disabled={uploading || !uploadListName.trim()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 cursor-pointer">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {uploading ? "Import..." : "Importer"}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══ ICP Finder — Inline flow ═══ */}
      {showIcpFinder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 p-5 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-600" /> ICP Finder — {selectedList?.company || ""}
              </h3>
              <button onClick={() => { setShowIcpFinder(false); setClassified(false); setDiscoveredCategories([]); }}
                className="cursor-pointer"><X className="w-4 h-4 text-gray-400" /></button>
            </div>

            {/* ── Setup: context + lists (visible when not yet analyzed) ── */}
            {!classified && !discovering && !classifying && (
              <>
                <p className="text-xs text-gray-500 mb-2">
                  {extraListIds.size > 0
                    ? `${mergedContacts.length} contacts uniques (doublons retirés)`
                    : `${contacts.length} contacts`}
                </p>

                {sameCompanyLists.length > 0 && (
                  <div className="mb-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                    <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5">Consolider avec d&apos;autres listes</p>
                    <div className="space-y-1">
                      {sameCompanyLists.map((l) => (
                        <label key={l.id} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer hover:text-violet-700">
                          <input type="checkbox" checked={extraListIds.has(l.id)}
                            onChange={(e) => {
                              const next = new Set(extraListIds);
                              e.target.checked ? next.add(l.id) : next.delete(l.id);
                              setExtraListIds(next);
                            }}
                            className="accent-violet-600 cursor-pointer" />
                          {l.name} <span className="text-[10px] text-gray-400">({l.count})</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <textarea value={offerContext} onChange={(e) => setOfferContext(e.target.value)}
                  rows={10} placeholder="Décrivez votre offre, vos clients cibles et leurs besoins..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm resize-y mb-1" />
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] text-gray-400">{offerContext.length > 0 ? `${offerContext.length.toLocaleString()} car.` : "Contexte offre obligatoire"}</span>
                  <label className="flex items-center gap-1 text-[10px] text-violet-600 hover:text-violet-800 cursor-pointer">
                    <Upload className="w-3 h-3" /> Charger .txt
                    <input type="file" accept=".txt,.md" className="hidden" onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        const reader = new FileReader();
                        reader.onload = () => setOfferContext(reader.result as string);
                        reader.readAsText(f, "utf-8");
                      }
                      e.target.value = "";
                    }} />
                  </label>
                </div>

                <button onClick={() => runFullAnalysis()} disabled={!offerContext.trim()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 cursor-pointer">
                  <Sparkles className="w-4 h-4" /> Lancer l&apos;analyse ({mergedContacts.length} contacts)
                </button>
              </>
            )}

            {/* ── Progress ── */}
            {(discovering || classifying) && (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
                <p className="text-sm font-medium text-gray-700">{classifyProgress || "Analyse en cours..."}</p>
                <p className="text-xs text-gray-400">Découverte des ICP → Classification → Équilibrage automatique</p>
              </div>
            )}

            {/* ── Results ── */}
            {classified && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-gray-700 uppercase">
                    Répartition — {totalClassified} contacts dans {Object.keys(categoryContactMap).length} ICP
                  </h4>
                </div>

                {discoveredCategories.map((cat) => {
                  const count = getCatCount(cat.name);
                  if (count === 0) return null;
                  const isTooLarge = count > 100;
                  const isTooSmall = count < 25;
                  const isDescExpanded = expandedDescs.has(cat.id);
                  const isContactsExpanded = expandedContacts.has(cat.id);
                  const catContactIds = categoryContactMap[cat.name] || [];
                  return (
                    <div key={cat.id} className={cn("border rounded-lg overflow-hidden",
                      isTooLarge ? "border-red-200 bg-red-50/30" : isTooSmall ? "border-amber-200 bg-amber-50/30" : "border-gray-200"
                    )}>
                      <div className="p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {isTooSmall && (
                              <input type="checkbox" checked={mergeSelection.has(cat.name)}
                                onChange={(e) => {
                                  const next = new Set(mergeSelection);
                                  e.target.checked ? next.add(cat.name) : next.delete(cat.name);
                                  setMergeSelection(next);
                                }}
                                className="accent-blue-600 cursor-pointer" title="Fusionner" />
                            )}
                            <button onClick={() => {
                              const next = new Set(expandedDescs);
                              isDescExpanded ? next.delete(cat.id) : next.add(cat.id);
                              setExpandedDescs(next);
                            }} className="flex-1 min-w-0 text-left cursor-pointer group">
                              <p className={cn("text-sm font-medium text-gray-900", !isDescExpanded && "truncate")}>{cat.name}</p>
                              <p className={cn("text-xs text-gray-500", !isDescExpanded && "truncate")}>{cat.description}</p>
                              {cat.approach_key && isDescExpanded && (
                                <p className="text-[10px] text-emerald-700 bg-emerald-50 rounded px-1.5 py-0.5 mt-1 inline-block">Approche : {cat.approach_key}</p>
                              )}
                              {cat.criteria && isDescExpanded && (
                                <p className="text-[10px] text-gray-400 mt-1">Critères : {cat.criteria}</p>
                              )}
                            </button>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            <button onClick={() => {
                              const next = new Set(expandedContacts);
                              isContactsExpanded ? next.delete(cat.id) : next.add(cat.id);
                              setExpandedContacts(next);
                            }} className={cn("text-xs font-semibold px-2 py-0.5 rounded-full cursor-pointer hover:ring-2 hover:ring-offset-1",
                              isTooLarge ? "text-red-700 bg-red-100 hover:ring-red-300" : isTooSmall ? "text-amber-700 bg-amber-100 hover:ring-amber-300" : "text-violet-700 bg-violet-100 hover:ring-violet-300"
                            )} title="Voir les contacts">{count}</button>
                            {isTooLarge && (
                              <button onClick={() => startSplit(cat.name)} disabled={qualifyLoading && splitTarget === cat.name}
                                className="text-[10px] font-medium text-red-600 hover:text-red-800 cursor-pointer">
                                {qualifyLoading && splitTarget === cat.name ? <Loader2 className="w-3 h-3 animate-spin" /> : "Découper"}
                              </button>
                            )}
                          </div>
                        </div>
                        {/* Expanded contacts list */}
                        {isContactsExpanded && catContactIds.length > 0 && (
                          <div className="mt-2 max-h-48 overflow-y-auto bg-gray-50 rounded-lg border border-gray-100">
                            <table className="w-full text-[10px]">
                              <thead className="bg-gray-100 sticky top-0">
                                <tr>
                                  <th className="px-2 py-1 text-left text-gray-500 font-medium">Prénom</th>
                                  <th className="px-2 py-1 text-left text-gray-500 font-medium">Nom</th>
                                  <th className="px-2 py-1 text-left text-gray-500 font-medium">Poste</th>
                                  <th className="px-2 py-1 text-left text-gray-500 font-medium">Entreprise</th>
                                  <th className="px-2 py-1 text-left text-gray-500 font-medium">Email</th>
                                </tr>
                              </thead>
                              <tbody>
                                {catContactIds.map((id) => {
                                  const c = contactById.get(id);
                                  if (!c) return null;
                                  return (
                                    <tr key={id} className="border-t border-gray-50 hover:bg-white">
                                      <td className="px-2 py-0.5 text-gray-800">{c.prenom}</td>
                                      <td className="px-2 py-0.5 text-gray-800">{c.nom}</td>
                                      <td className="px-2 py-0.5 text-gray-600 truncate max-w-[120px]">{c.poste}</td>
                                      <td className="px-2 py-0.5 text-gray-600 truncate max-w-[120px]">{c.entreprise}</td>
                                      <td className="px-2 py-0.5 text-gray-500 truncate max-w-[140px]">{c.email}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                      {/* Inline split */}
                      {splitTarget === cat.name && qualifyGroups.length > 0 && (
                        <div className="mt-3 border-t border-red-200 pt-3 space-y-2">
                          {qualifyGroups.map((g) => {
                            const choice = qualifyChoices[g.id];
                            return (
                              <div key={g.id} className="bg-white border border-gray-200 rounded p-2">
                                <p className="text-xs font-medium text-gray-800 mb-1">{g.label} <span className="text-gray-400">({g.count})</span></p>
                                <div className="space-y-1">
                                  {g.suggestions.map((s, si) => (
                                    <label key={si} className={cn("flex items-center gap-2 p-1 rounded text-[10px] cursor-pointer",
                                      choice?.action === s.type && (s.type !== "assign" || choice?.targetIcp === s.targetIcp) && (s.type !== "new_icp" || choice?.newIcpName === s.name)
                                        ? "bg-red-50 border border-red-200" : "hover:bg-gray-50"
                                    )}>
                                      <input type="radio" name={`split_${g.id}`}
                                        checked={choice?.action === s.type && (s.type !== "assign" || choice?.targetIcp === s.targetIcp) && (s.type !== "new_icp" || choice?.newIcpName === s.name)}
                                        onChange={() => setQualifyChoices((prev) => ({
                                          ...prev,
                                          [g.id]: { groupId: g.id, action: s.type, targetIcp: s.type === "assign" ? s.targetIcp : undefined, newIcpName: s.type === "new_icp" ? s.name : undefined },
                                        }))}
                                        className="accent-red-600" />
                                      {s.type === "assign" && <span>→ {s.targetIcp}</span>}
                                      {s.type === "new_icp" && <span className="text-emerald-700 font-medium">+ {s.name}</span>}
                                      {s.type === "exclude" && <span className="text-red-600">Exclure</span>}
                                    </label>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                          <div className="flex gap-2">
                            <button onClick={applySplit} className="flex-1 px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 cursor-pointer">Appliquer</button>
                            <button onClick={() => { setSplitTarget(null); setQualifyGroups([]); setQualifyChoices({}); }}
                              className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg cursor-pointer">Annuler</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Extra categories (Autres, Hors cible) */}
                {Object.entries(categoryContactMap).filter(([name]) => !discoveredCategories.find((c) => c.name === name)).map(([name, ids]) => (
                  ids.length > 0 && (
                    <div key={name} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-600">{name}</p>
                        <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">{ids.length}</span>
                      </div>
                    </div>
                  )
                ))}

                {/* Merge button */}
                {mergeSelection.size >= 2 && (
                  <button onClick={applyMerge}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-300 rounded-lg hover:bg-blue-100 cursor-pointer">
                    Fusionner les {mergeSelection.size} catégories sélectionnées
                  </button>
                )}

                {/* Refine */}
                {showRefine ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                    <textarea value={refineFeedback} onChange={(e) => setRefineFeedback(e.target.value)}
                      rows={2} placeholder="Ex: Trop de contacts dans X, séparer Y par type de poste..."
                      className="w-full border border-amber-300 rounded-lg px-3 py-2 text-xs resize-y" />
                    <div className="flex gap-2">
                      <button onClick={refineAndRerun} disabled={discovering || !refineFeedback.trim()}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50 cursor-pointer">
                        <Sparkles className="w-3 h-3" /> Relancer l&apos;analyse
                      </button>
                      <button onClick={() => { setShowRefine(false); setRefineFeedback(""); }}
                        className="px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-lg cursor-pointer">Annuler</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setShowRefine(true)}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-amber-700 border border-amber-300 rounded-lg hover:bg-amber-50 cursor-pointer">
                    <Pencil className="w-3 h-3" /> Modifier et relancer
                  </button>
                )}

                {/* Download */}
                <div className="space-y-2 pt-2 border-t border-gray-200">
                  <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                    <input type="checkbox" checked={emailOnly} onChange={(e) => setEmailOnly(e.target.checked)} className="accent-green-600" />
                    <Mail className="w-3.5 h-3.5" /> Uniquement avec email
                  </label>
                  <div className="flex gap-2">
                    <button onClick={downloadZip} disabled={downloading}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 cursor-pointer">
                      {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileArchive className="w-4 h-4" />}
                      {downloading ? "Génération..." : "Télécharger (ZIP)"}
                    </button>
                    <button onClick={exportIcpPdf}
                      className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-violet-700 border border-violet-300 rounded-lg hover:bg-violet-50 cursor-pointer">
                      <Download className="w-4 h-4" /> PDF
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ Memory correction modal ═══ */}
      {showMemory && memoryContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Modifier l&apos;ICP</h3>
            <p className="text-xs text-gray-500 mb-2">{memoryContact.prenom} {memoryContact.nom} — {memoryContact.poste} @ {memoryContact.entreprise}</p>
            <p className="text-xs text-gray-400 mb-3">ICP actuel : <span className="font-medium text-violet-600">{memoryContact.icp_category || "—"}</span></p>

            <label className="text-xs font-medium text-gray-600">Nouvelle catégorie ICP</label>
            <input value={memoryNewCat} onChange={(e) => setMemoryNewCat(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3" />

            <label className="text-xs font-medium text-gray-600">Pourquoi ce changement ?</label>
            <textarea value={memoryReason} onChange={(e) => setMemoryReason(e.target.value)}
              rows={2} placeholder="Ex: Ce contact est un bailleur pas un prestataire travaux"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs resize-y mb-3" />

            <div className="flex gap-2">
              <button onClick={() => setShowMemory(false)} className="flex-1 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg cursor-pointer">Annuler</button>
              <button onClick={saveMemory} disabled={!memoryNewCat.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 cursor-pointer">
                <Save className="w-4 h-4" /> Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
