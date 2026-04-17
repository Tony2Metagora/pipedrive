"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Users, Upload, Download, Search, Loader2, Sparkles, X, Trash2,
  Plus, Building2, List, ChevronDown, Check, Pencil, Save,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

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
  const [applying, setApplying] = useState(false);
  const [applyProgress, setApplyProgress] = useState("");
  const [excludedSegments, setExcludedSegments] = useState<ExcludedSegment[]>([]);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [editingCatIdx, setEditingCatIdx] = useState<number | null>(null);
  const [editCatReason, setEditCatReason] = useState("");
  const [showRefine, setShowRefine] = useState(false);
  const [refineFeedback, setRefineFeedback] = useState("");

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
    const seen = new Set<string>();
    return all.filter((c) => {
      const key = c.email?.trim().toLowerCase()
        || `${(c.prenom || "").toLowerCase()}|${(c.nom || "").toLowerCase()}|${(c.entreprise || "").toLowerCase()}`;
      if (!key || seen.has(key)) return false;
      seen.add(key);
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

  const discoverCategories = async () => {
    if (!offerContext.trim()) return;
    setDiscovering(true);
    setDiscoveredCategories([]);
    const list = lists.find((l) => l.id === selectedListId);
    try {
      const res = await fetch("/api/icp/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "discover",
          ids: selected.size > 0 ? Array.from(selected) : mergedContacts.map((c) => c.id),
          company: list?.company || "",
          offerContext,
        }),
      });
      const json = await res.json();
      setDiscoveredCategories(json.data?.categories || []);
      setExcludedSegments(json.data?.excluded_segments || []);
    } catch { setError("Erreur classification"); }
    setDiscovering(false);
  };

  const refineCategories = async () => {
    if (!refineFeedback.trim()) return;
    setDiscovering(true);
    const list = lists.find((l) => l.id === selectedListId);
    const currentSummary = discoveredCategories.map((c) => `- ${c.name}: ${c.description} (~${c.estimatedCount || "?"} contacts)`).join("\n");
    const excludedSummary = excludedSegments.map((s) => `- ${s.name} (exclu): ${s.reason}`).join("\n");
    const refinedContext = `${offerContext}

--- CLASSIFICATION PRÉCÉDENTE ---
${currentSummary}
${excludedSummary ? `\nSegments exclus:\n${excludedSummary}` : ""}

--- FEEDBACK UTILISATEUR ---
${refineFeedback}

IMPORTANT : Tiens compte du feedback ci-dessus pour ajuster les catégories ICP. Reclass tous les contacts en conséquence.`;

    try {
      const res = await fetch("/api/icp/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "discover",
          ids: selected.size > 0 ? Array.from(selected) : mergedContacts.map((c) => c.id),
          company: list?.company || "",
          offerContext: refinedContext,
        }),
      });
      const json = await res.json();
      setDiscoveredCategories(json.data?.categories || []);
      setExcludedSegments(json.data?.excluded_segments || []);
      setShowRefine(false);
      setRefineFeedback("");
    } catch { setError("Erreur re-classification"); }
    setDiscovering(false);
  };

  const applyClassification = async () => {
    if (discoveredCategories.length === 0) return;
    setApplying(true);
    setApplyProgress("Démarrage...");
    const list = lists.find((l) => l.id === selectedListId);
    try {
      const res = await fetch("/api/icp/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "apply",
          ids: selected.size > 0 ? Array.from(selected) : mergedContacts.map((c) => c.id),
          company: list?.company || "",
          categories: discoveredCategories,
          offerContext,
        }),
      });
      if (!res.body) throw new Error("No response body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        let eventType = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) { eventType = line.slice(7).trim(); continue; }
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (eventType === "progress") setApplyProgress(data.message || "");
              if (eventType === "done") {
                setApplyProgress("");
                setActionMsg(`${data.classified}/${data.total} contacts classifiés`);
                setTimeout(() => setActionMsg(null), 5000);
                setShowIcpFinder(false);
                setSelected(new Set());
                fetchContacts();
              }
            } catch { /* ignore */ }
          }
        }
      }
    } catch (e) { setError(String(e)); }
    setApplying(false);
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

  // ─── Export CSV ────────────────────────────────────────

  const exportCsv = async () => {
    if (!selectedListId) return;
    const list = lists.find((l) => l.id === selectedListId);
    const baseName = list?.name || "icp-export";
    const suffix = icpFilter ? ` - ICP ${icpFilter}` : "";
    const filename = `${baseName}${suffix}`;
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
    doc.text(`${list?.name || ""} • ${contacts.length} contacts • ${new Date().toLocaleDateString("fr-FR")}`, 14, y);
    doc.setTextColor(0);
    y += 10;

    // Each ICP category
    discoveredCategories.forEach((cat) => {
      const catContacts = cat.contactNumbers
        ? cat.contactNumbers.map((n) => contacts[n - 1]).filter(Boolean)
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

      // Approach key
      if (cat.approach_key) {
        doc.setFont("helvetica", "bolditalic");
        doc.setTextColor(5, 122, 85);
        const approachLines = doc.splitTextToSize(`Message cle: ${cat.approach_key}`, pageW - 32);
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
          ? seg.contactNumbers.map((n) => contacts[n - 1]).filter(Boolean)
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

      {/* ═══ ICP Finder Modal ═══ */}
      {showIcpFinder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 p-5 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-600" /> ICP Finder — {selectedList?.company || ""}
              </h3>
              <button onClick={() => setShowIcpFinder(false)} className="cursor-pointer"><X className="w-4 h-4 text-gray-400" /></button>
            </div>

            <p className="text-xs text-gray-500 mb-2">
              {selected.size > 0
                ? `${selected.size} contacts sélectionnés`
                : extraListIds.size > 0
                  ? `${mergedContacts.length} contacts uniques (${contacts.length + extraContacts.length} total, ${contacts.length + extraContacts.length - mergedContacts.length} doublons retirés)`
                  : `${contacts.length} contacts dans la liste`}
            </p>

            {/* Multi-list picker */}
            {sameCompanyLists.length > 0 && (
              <div className="mb-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5">Consolider avec d&apos;autres listes ({selectedList?.company})</p>
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
                      {l.name} <span className="text-[10px] text-gray-400">({l.count} contacts)</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <textarea value={offerContext} onChange={(e) => setOfferContext(e.target.value)}
              rows={12} placeholder="Décrivez votre offre, vos clients cibles et leurs besoins. Vous pouvez coller un fichier d'instructions complet décrivant vos segments, votre positionnement et vos messages d'approche."
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm resize-y mb-1" />
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] text-gray-400">{offerContext.length > 0 ? `${offerContext.length.toLocaleString()} caractères` : ""}</span>
              <label className="flex items-center gap-1 text-[10px] text-violet-600 hover:text-violet-800 cursor-pointer">
                <Upload className="w-3 h-3" /> Charger un fichier .txt
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

            <button onClick={discoverCategories} disabled={discovering || !offerContext.trim()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 cursor-pointer mb-4">
              {discovering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              {discovering ? "Analyse en cours..." : "Analyser et proposer les ICP"}
            </button>

            {/* Categories preview */}
            {discoveredCategories.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-gray-700 uppercase">Catégories ICP proposées</h4>
                {discoveredCategories.map((cat, idx) => (
                  <div key={cat.id} className="border border-gray-200 rounded-lg p-3">
                    {editingCatIdx === idx ? (
                      <div className="space-y-2">
                        <input value={cat.name} onChange={(e) => {
                          const next = [...discoveredCategories];
                          next[idx] = { ...next[idx], name: e.target.value };
                          setDiscoveredCategories(next);
                        }} className="w-full border border-gray-300 rounded px-2 py-1 text-sm font-medium" />
                        <textarea value={cat.description} onChange={(e) => {
                          const next = [...discoveredCategories];
                          next[idx] = { ...next[idx], description: e.target.value };
                          setDiscoveredCategories(next);
                        }} rows={2} className="w-full border border-gray-300 rounded px-2 py-1 text-xs" />
                        <input value={editCatReason} onChange={(e) => setEditCatReason(e.target.value)}
                          placeholder="Pourquoi cette modification ?" className="w-full border border-gray-200 rounded px-2 py-1 text-xs" />
                        <div className="flex gap-2">
                          <button onClick={async () => {
                            if (editCatReason.trim()) {
                              const list = lists.find((l) => l.id === selectedListId);
                              await fetch("/api/icp/memory", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ company: list?.company || "", old_category: cat.name, new_category: cat.name, reason: editCatReason }),
                              });
                            }
                            setEditingCatIdx(null);
                            setEditCatReason("");
                          }} className="flex items-center gap-1 px-2 py-1 text-xs text-green-700 bg-green-50 rounded cursor-pointer">
                            <Save className="w-3 h-3" /> OK
                          </button>
                          <button onClick={() => { setEditingCatIdx(null); setEditCatReason(""); }}
                            className="px-2 py-1 text-xs text-gray-500 cursor-pointer">Annuler</button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900">{cat.name}</p>
                            <p className="text-xs text-gray-500">{cat.description}</p>
                            {cat.approach_key && (
                              <p className="text-[10px] text-emerald-700 bg-emerald-50 rounded px-1.5 py-0.5 mt-1 inline-block">Approche : {cat.approach_key}</p>
                            )}
                          </div>
                          <button onClick={() => setEditingCatIdx(idx)}
                            className="p-1 text-gray-400 hover:text-violet-600 cursor-pointer shrink-0">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {cat.contactNumbers && cat.contactNumbers.length > 0 && (
                          <div className="mt-1.5">
                            <button onClick={() => {
                              const next = new Set(expandedCats);
                              next.has(cat.id) ? next.delete(cat.id) : next.add(cat.id);
                              setExpandedCats(next);
                            }} className="flex items-center gap-1 text-[10px] text-violet-600 font-medium cursor-pointer hover:text-violet-800">
                              <ChevronDown className={cn("w-3 h-3 transition-transform", expandedCats.has(cat.id) && "rotate-180")} />
                              {cat.contactNumbers.length} contacts
                            </button>
                            {expandedCats.has(cat.id) && (
                              <div className="mt-1 max-h-32 overflow-y-auto bg-gray-50 rounded p-1.5 space-y-0.5">
                                {cat.contactNumbers.map((num) => {
                                  const c = contacts[num - 1];
                                  return c ? (
                                    <p key={num} className="text-[10px] text-gray-600 truncate">
                                      {c.prenom} {c.nom} — <span className="text-gray-400">{c.poste} @ {c.entreprise}</span>
                                    </p>
                                  ) : null;
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {excludedSegments.length > 0 && (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 space-y-2">
                    <p className="text-[10px] font-semibold text-orange-700 uppercase">Segments exclus</p>
                    {excludedSegments.map((seg, i) => (
                      <div key={i}>
                        <p className="text-xs text-orange-600">
                          {seg.name} — <span className="text-orange-500">{seg.reason}</span>
                          {seg.estimatedCount !== undefined && (
                            <span className="ml-1 font-medium">({seg.estimatedCount} contacts)</span>
                          )}
                        </p>
                        {seg.contactNumbers && seg.contactNumbers.length > 0 && (
                          <div className="mt-1">
                            <button onClick={() => {
                              const key = `excl_${i}`;
                              const next = new Set(expandedCats);
                              next.has(key) ? next.delete(key) : next.add(key);
                              setExpandedCats(next);
                            }} className="flex items-center gap-1 text-[10px] text-orange-600 cursor-pointer hover:text-orange-800">
                              <ChevronDown className={cn("w-3 h-3 transition-transform", expandedCats.has(`excl_${i}`) && "rotate-180")} />
                              Voir les contacts
                            </button>
                            {expandedCats.has(`excl_${i}`) && (
                              <div className="mt-1 max-h-32 overflow-y-auto bg-orange-100/50 rounded p-1.5 space-y-0.5">
                                {seg.contactNumbers.map((num) => {
                                  const c = contacts[num - 1];
                                  return c ? (
                                    <p key={num} className="text-[10px] text-orange-700 truncate">
                                      {c.prenom} {c.nom} — <span className="text-orange-500">{c.poste} @ {c.entreprise}</span>
                                    </p>
                                  ) : null;
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Modifier le cadrage */}
                {showRefine ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                    <p className="text-[10px] font-semibold text-amber-700 uppercase">Modifier le cadrage</p>
                    <textarea value={refineFeedback} onChange={(e) => setRefineFeedback(e.target.value)}
                      rows={3} placeholder="Ex: Fusionner les 2 catégories Collectivités en une seule, séparer les bailleurs sociaux par type de poste, le segment X n'est pas pertinent..."
                      className="w-full border border-amber-300 rounded-lg px-3 py-2 text-xs resize-y" />
                    <div className="flex gap-2">
                      <button onClick={refineCategories} disabled={discovering || !refineFeedback.trim()}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50 cursor-pointer">
                        {discovering ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        {discovering ? "Re-analyse..." : "Re-analyser les ICP"}
                      </button>
                      <button onClick={() => { setShowRefine(false); setRefineFeedback(""); }}
                        className="px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-lg cursor-pointer">Annuler</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setShowRefine(true)}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-amber-700 border border-amber-300 rounded-lg hover:bg-amber-50 cursor-pointer">
                    <Pencil className="w-3 h-3" /> Modifier le cadrage
                  </button>
                )}

                <div className="flex gap-2">
                  <button onClick={applyClassification} disabled={applying}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 cursor-pointer">
                    {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {applying ? applyProgress || "Classification..." : "Appliquer la classification"}
                  </button>
                  <button onClick={exportIcpPdf}
                    className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-violet-700 border border-violet-300 rounded-lg hover:bg-violet-50 cursor-pointer"
                    title="Exporter l'analyse ICP en PDF">
                    <Download className="w-4 h-4" /> PDF
                  </button>
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
