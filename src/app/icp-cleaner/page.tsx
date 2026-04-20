"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Users, Upload, Download, Search, Loader2, Sparkles, X, Trash2,
  Building2, Check, Pencil, Save, Mail, FileArchive,
} from "lucide-react";
import { cn } from "@/lib/utils";
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

interface UserIcpDef {
  name: string;
  postes: string;
  entreprises: string;
  antiPostes: string;
  antiEntreprises: string;
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
  const [extraListIds, setExtraListIds] = useState<Set<string>>(new Set());
  const [extraContacts, setExtraContacts] = useState<IcpContact[]>([]);

  // User-defined ICPs
  const [icpDefs, setIcpDefs] = useState<UserIcpDef[]>([{ name: "", postes: "", entreprises: "", antiPostes: "", antiEntreprises: "" }]);

  // Classification
  const [classifying, setClassifying] = useState(false);
  const [classifyProgress, setClassifyProgress] = useState("");
  const [classified, setClassified] = useState(false);
  const [categoryContactMap, setCategoryContactMap] = useState<Record<string, string[]>>({});

  // Results expand/collapse
  const [expandedContacts, setExpandedContacts] = useState<Set<string>>(new Set());

  // Download from ICP Finder
  const [emailOnly, setEmailOnly] = useState(false);
  const [downloading, setDownloading] = useState(false);

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

  // ─── ICP Classification ───────────────────────────────

  const updateIcpDef = (idx: number, field: keyof UserIcpDef, value: string) => {
    const next = [...icpDefs];
    next[idx] = { ...next[idx], [field]: value };
    setIcpDefs(next);
  };

  const setIcpCount = (count: number) => {
    const next: UserIcpDef[] = [];
    for (let i = 0; i < count; i++) {
      next.push(icpDefs[i] || { name: "", postes: "", entreprises: "", antiPostes: "", antiEntreprises: "" });
    }
    setIcpDefs(next);
  };

  const canLaunch = icpDefs.length > 0 && icpDefs.every((d) => d.name.trim() && d.postes.trim());

  // ─── Classify contacts into user-defined ICPs ─────────

  const consumeSSE = async (res: Response, onProgress: (msg: string) => void): Promise<Record<string, string[]>> => {
    if (!res.body) throw new Error("No response body");
    const map: Record<string, string[]> = {};
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "", eventType = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n"); buffer = lines.pop() || "";
      for (const line of lines) {
        if (line.startsWith("event: ")) { eventType = line.slice(7).trim(); continue; }
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            if (eventType === "progress") onProgress(data.message || "");
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
    return map;
  };

  const runClassification = async () => {
    if (!canLaunch) return;
    const list = lists.find((l) => l.id === selectedListId);
    const contactIds = mergedContacts.map((c) => c.id);

    // Build categories from user definitions
    const categories: IcpCategory[] = icpDefs.map((d, i) => ({
      id: `icp_${i + 1}`,
      name: d.name,
      description: `Postes : ${d.postes}. Entreprises : ${d.entreprises}`,
      criteria: `Postes ciblés : ${d.postes}. Types d'entreprises : ${d.entreprises}.${d.antiPostes ? ` Exclure postes : ${d.antiPostes}.` : ""}${d.antiEntreprises ? ` Exclure entreprises : ${d.antiEntreprises}.` : ""}`,
    }));

    setClassified(false);
    setCategoryContactMap({});
    setClassifying(true);
    setClassifyProgress("Classification en cours...");

    try {
      const res = await fetch("/api/icp/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "batch-classify", ids: contactIds, company: list?.company || "", categories }),
      });
      const map = await consumeSSE(res, (msg) => setClassifyProgress(msg));
      setCategoryContactMap(map);
      setClassified(true);
      setClassifyProgress("");
      const total = Object.values(map).reduce((s, ids) => s + ids.length, 0);
      setActionMsg(`${total} contacts répartis dans ${Object.keys(map).length} catégories`);
      setTimeout(() => setActionMsg(null), 5000);
    } catch (e) { setError(String(e)); }
    setClassifying(false);
  };

  // Computed
  const totalClassified = Object.values(categoryContactMap).reduce((s, ids) => s + ids.length, 0);

  // ─── Generate approach messages + Download ZIP ────────

  const generateApproaches = async (): Promise<Record<string, string>> => {
    const list = lists.find((l) => l.id === selectedListId);
    const messages: Record<string, string> = {};
    for (const def of icpDefs) {
      if (!def.name.trim()) continue;
      try {
        const res = await fetch("/api/icp/classify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "generate-approach",
            ids: [],
            company: list?.company || "",
            categories: [{ name: def.name, description: `Postes : ${def.postes}. Entreprises : ${def.entreprises}`, criteria: def.postes }],
          }),
        });
        const json = await res.json();
        if (json.message) messages[def.name] = json.message;
      } catch { /* skip */ }
    }
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

      for (const [catName, catIds] of Object.entries(categoryContactMap)) {
        let catContacts = catIds.map((id) => contactById.get(id)).filter(Boolean) as IcpContact[];
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
        const approachHeader = "ICP;Message type";
        const approachRows = icpDefs
          .filter((d) => messages[d.name])
          .map((d) => [d.name, messages[d.name] || ""].map((v) => escapeCsvField(String(v))).join(";"));
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

        {/* ── Center: Table or ICP Finder ── */}
        {showIcpFinder ? null : (
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

            </>
          )}
        </div>
        )}

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

      {/* ═══ ICP Finder — Inline in center panel ═══ */}
      {showIcpFinder && (
        <div className="flex-1 min-w-0">
          <div className="bg-white rounded-xl border border-gray-200 p-5 overflow-y-auto" style={{ maxHeight: "calc(100vh - 140px)" }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-600" /> ICP Finder — {selectedList?.company || ""}
              </h3>
              <button onClick={() => { setShowIcpFinder(false); setClassified(false); setCategoryContactMap({}); }}
                className="text-xs text-gray-500 hover:text-gray-700 cursor-pointer flex items-center gap-1">
                <X className="w-3.5 h-3.5" /> Retour aux contacts
              </button>
            </div>

            {/* ── Setup: define ICPs ── */}
            {!classified && !classifying && (
              <>
                <p className="text-xs text-gray-500 mb-3">
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
                            onChange={(e) => { const next = new Set(extraListIds); e.target.checked ? next.add(l.id) : next.delete(l.id); setExtraListIds(next); }}
                            className="accent-violet-600 cursor-pointer" />
                          {l.name} <span className="text-[10px] text-gray-400">({l.count})</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Number of ICPs */}
                <div className="flex items-center gap-3 mb-4">
                  <label className="text-xs font-medium text-gray-700">Nombre d&apos;ICP :</label>
                  <select value={icpDefs.length} onChange={(e) => setIcpCount(Number(e.target.value))}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
                    {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>

                {/* ICP definitions */}
                <div className="space-y-4 mb-4">
                  {icpDefs.map((def, idx) => (
                    <div key={idx} className="border border-violet-200 rounded-lg p-3 bg-violet-50/30">
                      <p className="text-[10px] font-semibold text-violet-600 uppercase mb-2">ICP {idx + 1}</p>
                      <input value={def.name} onChange={(e) => updateIcpDef(idx, "name", e.target.value)}
                        placeholder="Nom de l'ICP (ex: Directeurs Patrimoine - Bailleurs sociaux)"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2" />
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <div>
                          <label className="text-[10px] font-medium text-gray-500">Postes ciblés</label>
                          <textarea value={def.postes} onChange={(e) => updateIcpDef(idx, "postes", e.target.value)}
                            rows={2} placeholder="Directeur patrimoine, responsable maintenance, DG..."
                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs resize-y" />
                        </div>
                        <div>
                          <label className="text-[10px] font-medium text-gray-500">Types d&apos;entreprises</label>
                          <textarea value={def.entreprises} onChange={(e) => updateIcpDef(idx, "entreprises", e.target.value)}
                            rows={2} placeholder="Bailleurs sociaux, OPH, SA d'HLM..."
                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs resize-y" />
                        </div>
                      </div>
                      <details className="text-[10px] text-gray-400">
                        <summary className="cursor-pointer hover:text-gray-600">Exclusions (optionnel)</summary>
                        <div className="grid grid-cols-2 gap-2 mt-1">
                          <input value={def.antiPostes} onChange={(e) => updateIcpDef(idx, "antiPostes", e.target.value)}
                            placeholder="Postes à exclure..." className="border border-gray-200 rounded px-2 py-1 text-xs" />
                          <input value={def.antiEntreprises} onChange={(e) => updateIcpDef(idx, "antiEntreprises", e.target.value)}
                            placeholder="Entreprises à exclure..." className="border border-gray-200 rounded px-2 py-1 text-xs" />
                        </div>
                      </details>
                    </div>
                  ))}
                </div>

                <button onClick={runClassification} disabled={!canLaunch}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 cursor-pointer">
                  <Sparkles className="w-4 h-4" /> Classer les {mergedContacts.length} contacts
                </button>
              </>
            )}

            {/* ── Progress ── */}
            {classifying && (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
                <p className="text-sm font-medium text-gray-700">{classifyProgress || "Classification en cours..."}</p>
              </div>
            )}

            {/* ── Results ── */}
            {classified && (
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-gray-700 uppercase">
                  Répartition — {totalClassified} contacts dans {Object.keys(categoryContactMap).length} catégories
                </h4>

                {Object.entries(categoryContactMap).sort(([, a], [, b]) => b.length - a.length).map(([catName, catIds]) => {
                  if (catIds.length === 0) return null;
                  const isExpanded = expandedContacts.has(catName);
                  return (
                    <div key={catName} className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-900 flex-1">{catName}</p>
                          <button onClick={() => {
                            const next = new Set(expandedContacts);
                            isExpanded ? next.delete(catName) : next.add(catName);
                            setExpandedContacts(next);
                          }} className="text-xs font-semibold text-violet-700 bg-violet-100 px-2 py-0.5 rounded-full cursor-pointer hover:ring-2 hover:ring-violet-300 hover:ring-offset-1"
                            title="Voir les contacts">{catIds.length}</button>
                        </div>
                        {isExpanded && (
                          <div className="mt-2 max-h-48 overflow-y-auto bg-gray-50 rounded-lg border border-gray-100">
                            <table className="w-full text-[10px]">
                              <thead className="bg-gray-100 sticky top-0">
                                <tr>
                                  <th className="px-2 py-1 text-left text-gray-500 font-medium w-[15%]">Prénom</th>
                                  <th className="px-2 py-1 text-left text-gray-500 font-medium w-[15%]">Nom</th>
                                  <th className="px-2 py-1 text-left text-gray-500 font-medium w-[35%]">Poste</th>
                                  <th className="px-2 py-1 text-left text-gray-500 font-medium w-[35%]">Entreprise</th>
                                </tr>
                              </thead>
                              <tbody>
                                {catIds.map((id) => {
                                  const c = contactById.get(id);
                                  if (!c) return null;
                                  return (
                                    <tr key={id} className="border-t border-gray-50 hover:bg-white">
                                      <td className="px-2 py-0.5 text-gray-800">{c.prenom}</td>
                                      <td className="px-2 py-0.5 text-gray-800">{c.nom}</td>
                                      <td className="px-2 py-0.5 text-gray-600 truncate max-w-[250px]">{c.poste}</td>
                                      <td className="px-2 py-0.5 text-gray-600 truncate max-w-[250px]">{c.entreprise}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Reclassify */}
                <button onClick={() => { setClassified(false); setCategoryContactMap({}); }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-amber-700 border border-amber-300 rounded-lg hover:bg-amber-50 cursor-pointer">
                  <Pencil className="w-3 h-3" /> Modifier les ICP et relancer
                </button>

                {/* Download */}
                <div className="space-y-2 pt-2 border-t border-gray-200">
                  <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                    <input type="checkbox" checked={emailOnly} onChange={(e) => setEmailOnly(e.target.checked)} className="accent-green-600" />
                    <Mail className="w-3.5 h-3.5" /> Uniquement avec email
                  </label>
                  <button onClick={downloadZip} disabled={downloading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 cursor-pointer">
                    {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileArchive className="w-4 h-4" />}
                    {downloading ? "Génération..." : "Télécharger (ZIP)"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      </div>

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
