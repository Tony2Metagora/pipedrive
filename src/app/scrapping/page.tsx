"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Search, Loader2, Save, Trash2, Download, AlertCircle, Building2,
  MapPin, Filter, ChevronDown, ChevronUp, Edit3, Check, X,
  Database, Columns3, ShieldCheck, Users2, GripVertical,
  ArrowUp, ArrowDown, ArrowUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────

interface Dirigeant { prenom: string; nom: string; role: string }

interface ScrapingCompany {
  id?: string;
  raison_sociale: string;
  enseigne: string;
  siren: string;
  siret: string;
  code_postal: string;
  commune: string;
  departement: string;
  adresse: string;
  code_naf: string;
  libelle_naf: string;
  tranche_effectif: string;
  tranche_code: string;
  dirigeant: string;
  dirigeant_prenom: string;
  dirigeant_nom: string;
  dirigeant_role: string;
  all_dirigeants?: Dirigeant[];
  plusieurs_dirigeants?: string;
  commissaire_aux_comptes?: string;
  effectif_approx: string;
  statut: string;
}

interface ScrapingList {
  id: string;
  name: string;
  created_at: string;
  count: number;
  sirens?: string[];
  filters: {
    nafCodes: string[];
    departement?: string;
    codePostal?: string;
    trancheEffectif?: string[];
  };
}

// ─── Column config ──────────────────────────────────────

interface ColDef {
  key: keyof ScrapingCompany;
  label: string;
  defaultOn: boolean;
  minW: number;
  defaultW: number;
}

const DEFAULT_COLUMNS: ColDef[] = [
  { key: "raison_sociale", label: "Raison sociale", defaultOn: true, minW: 100, defaultW: 200 },
  { key: "enseigne", label: "Enseigne", defaultOn: true, minW: 80, defaultW: 160 },
  { key: "dirigeant_nom", label: "Nom dirigeant", defaultOn: true, minW: 80, defaultW: 140 },
  { key: "dirigeant_prenom", label: "Prénom dirigeant", defaultOn: true, minW: 80, defaultW: 130 },
  { key: "code_postal", label: "CP", defaultOn: true, minW: 50, defaultW: 65 },
  { key: "tranche_effectif", label: "Effectif", defaultOn: true, minW: 60, defaultW: 80 },
  { key: "siren", label: "SIREN", defaultOn: true, minW: 80, defaultW: 100 },
  { key: "plusieurs_dirigeants", label: "Plusieurs dirigeants", defaultOn: true, minW: 50, defaultW: 80 },
  { key: "commissaire_aux_comptes", label: "Commissaire aux comptes", defaultOn: true, minW: 80, defaultW: 160 },
  { key: "siret", label: "SIRET", defaultOn: false, minW: 100, defaultW: 140 },
  { key: "commune", label: "Commune", defaultOn: false, minW: 80, defaultW: 130 },
  { key: "departement", label: "Département", defaultOn: false, minW: 40, defaultW: 60 },
  { key: "adresse", label: "Adresse", defaultOn: false, minW: 120, defaultW: 200 },
  { key: "code_naf", label: "Code NAF", defaultOn: false, minW: 60, defaultW: 75 },
  { key: "libelle_naf", label: "Libellé NAF", defaultOn: false, minW: 100, defaultW: 160 },
  { key: "effectif_approx", label: "Eff. approx.", defaultOn: false, minW: 50, defaultW: 70 },
  { key: "dirigeant", label: "Dirigeant (complet)", defaultOn: false, minW: 100, defaultW: 170 },
  { key: "dirigeant_role", label: "Rôle dirigeant", defaultOn: false, minW: 80, defaultW: 130 },
  { key: "statut", label: "Statut", defaultOn: false, minW: 50, defaultW: 65 },
];

// ─── Constants ───────────────────────────────────────────

const NAF_OPTIONS = [
  { code: "47.71Z", label: "Habillement (détail)" },
  { code: "47.72A", label: "Chaussures (détail)" },
  { code: "47.72B", label: "Maroquinerie & articles de voyage" },
  { code: "47.75Z", label: "Parfumerie & cosmétiques" },
  { code: "47.77Z", label: "Horlogerie & bijouterie" },
];

const TRANCHE_OPTIONS = [
  { code: "00", label: "0 salarié" },
  { code: "01", label: "1-2 salariés" },
  { code: "02", label: "3-5 salariés" },
  { code: "03", label: "6-9 salariés" },
  { code: "11", label: "10-19 salariés" },
  { code: "12", label: "20-49 salariés" },
  { code: "21", label: "50-99 salariés" },
];

const DEPARTEMENTS = [
  { code: "", label: "Tous" },
  { code: "75", label: "75 — Paris" },
  { code: "92", label: "92 — Hauts-de-Seine" },
  { code: "93", label: "93 — Seine-Saint-Denis" },
  { code: "94", label: "94 — Val-de-Marne" },
  { code: "69", label: "69 — Rhône" },
  { code: "13", label: "13 — Bouches-du-Rhône" },
  { code: "33", label: "33 — Gironde" },
  { code: "31", label: "31 — Haute-Garonne" },
  { code: "59", label: "59 — Nord" },
  { code: "67", label: "67 — Bas-Rhin" },
  { code: "44", label: "44 — Loire-Atlantique" },
  { code: "06", label: "06 — Alpes-Maritimes" },
  { code: "34", label: "34 — Hérault" },
  { code: "35", label: "35 — Ille-et-Vilaine" },
];

// ─── Cell renderer ──────────────────────────────────────

function CellValue({ col, company }: { col: ColDef; company: ScrapingCompany }) {
  const v = String(company[col.key] ?? "");
  switch (col.key) {
    case "code_naf":
      return <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-medium">{v}</span>;
    case "tranche_effectif":
      return <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-medium">{v}</span>;
    case "statut":
      return <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium", v === "Actif" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700")}>{v}</span>;
    case "plusieurs_dirigeants":
      return <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium", v === "OUI" ? "bg-amber-50 text-amber-700" : "bg-gray-50 text-gray-500")}>{v || "NON"}</span>;
    case "commissaire_aux_comptes":
      return v ? <span className="text-purple-700 text-[10px] font-medium">{v}</span> : <span className="text-gray-300">—</span>;
    case "siret":
      return <span className="font-mono text-[10px]">{v}</span>;
    case "siren":
      return <span className="font-mono">{v}</span>;
    case "raison_sociale":
      return <span className="font-medium text-gray-900">{v}</span>;
    case "enseigne":
      return <span className="font-semibold text-gray-900">{v || "—"}</span>;
    case "dirigeant_nom":
      return <span className="font-semibold text-gray-900 uppercase">{v || "—"}</span>;
    case "dirigeant_prenom":
      return <span className="text-gray-800 capitalize">{v || "—"}</span>;
    default:
      return <span className="text-gray-600">{v || "—"}</span>;
  }
}

// ─── Main Component ─────────────────────────────────────

export default function ScrappingPage() {
  // Filters
  const [selectedNaf, setSelectedNaf] = useState<Set<string>>(new Set(["47.71Z"]));
  const [departement, setDepartement] = useState("");
  const [codePostal, setCodePostal] = useState("");
  const [selectedTranches, setSelectedTranches] = useState<Set<string>>(new Set(["01", "02", "03", "11"]));
  const [maxResults, setMaxResults] = useState(100);
  const [showFilters, setShowFilters] = useState(true);

  // Results
  const [results, setResults] = useState<ScrapingCompany[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchDone, setSearchDone] = useState(false);
  const [excludedCount, setExcludedCount] = useState(0);

  // Save
  const [listName, setListName] = useState("");
  const [saving, setSaving] = useState(false);

  // Lists
  const [lists, setLists] = useState<ScrapingList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [listCompanies, setListCompanies] = useState<ScrapingCompany[]>([]);
  const [loadingLists, setLoadingLists] = useState(true);
  const [loadingCompanies, setLoadingCompanies] = useState(false);

  // Edit
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  // Table columns — orderable
  const [columnOrder, setColumnOrder] = useState<(keyof ScrapingCompany)[]>(DEFAULT_COLUMNS.map((c) => c.key));
  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    new Set(DEFAULT_COLUMNS.filter((c) => c.defaultOn).map((c) => c.key))
  );
  const [showColPicker, setShowColPicker] = useState(false);
  const colPickerRef = useRef<HTMLDivElement>(null);
  const [tableSearch, setTableSearch] = useState("");

  // Column widths (resizable)
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    const w: Record<string, number> = {};
    DEFAULT_COLUMNS.forEach((c) => { w[c.key] = c.defaultW; });
    return w;
  });

  // Resize
  const resizingRef = useRef<{ key: string; startX: number; startW: number } | null>(null);
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const { key, startX, startW } = resizingRef.current;
      const col = DEFAULT_COLUMNS.find((c) => c.key === key);
      const newW = Math.max(col?.minW ?? 50, startW + (e.clientX - startX));
      setColWidths((prev) => ({ ...prev, [key]: newW }));
    };
    const onMouseUp = () => { resizingRef.current = null; document.body.style.cursor = ""; };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => { document.removeEventListener("mousemove", onMouseMove); document.removeEventListener("mouseup", onMouseUp); };
  }, []);
  const startResize = (key: string, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    resizingRef.current = { key, startX: e.clientX, startW: colWidths[key] ?? 100 };
    document.body.style.cursor = "col-resize";
  };

  // Drag & drop columns
  const dragColRef = useRef<keyof ScrapingCompany | null>(null);
  const handleDragStart = (key: keyof ScrapingCompany) => { dragColRef.current = key; };
  const handleDragOver = (e: React.DragEvent, targetKey: keyof ScrapingCompany) => {
    e.preventDefault();
    if (!dragColRef.current || dragColRef.current === targetKey) return;
    setColumnOrder((prev) => {
      const from = prev.indexOf(dragColRef.current!);
      const to = prev.indexOf(targetKey);
      if (from === -1 || to === -1) return prev;
      const next = [...prev];
      next.splice(from, 1);
      next.splice(to, 0, dragColRef.current!);
      return next;
    });
  };
  const handleDragEnd = () => { dragColRef.current = null; };

  // Close col picker on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target as Node)) setShowColPicker(false);
    };
    if (showColPicker) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showColPicker]);

  // Sorting
  const [sortKey, setSortKey] = useState<keyof ScrapingCompany | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const handleSort = (key: keyof ScrapingCompany) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  // Split dirigeants modal
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitChecked, setSplitChecked] = useState<Set<string>>(new Set());

  // Saved SIRENs
  const savedSirens = new Set(lists.flatMap((l) => l.sirens || []));

  // ── Fetch lists ──
  const fetchLists = useCallback(async () => {
    try {
      const res = await fetch("/api/scraping");
      const json = await res.json();
      if (json.data) setLists(json.data);
    } catch (err) { console.error("Erreur chargement listes:", err); }
    finally { setLoadingLists(false); }
  }, []);
  useEffect(() => { fetchLists(); }, [fetchLists]);

  // ── Fetch companies ──
  const fetchCompanies = useCallback(async (listId: string) => {
    setLoadingCompanies(true);
    try {
      const res = await fetch(`/api/scraping/${listId}?t=${Date.now()}`);
      const json = await res.json();
      if (json.data) setListCompanies(json.data);
    } catch (err) { console.error("Erreur chargement entreprises:", err); }
    finally { setLoadingCompanies(false); }
  }, []);
  useEffect(() => {
    if (selectedListId) fetchCompanies(selectedListId);
    else setListCompanies([]);
  }, [selectedListId, fetchCompanies]);

  // ── Search ──
  const handleSearch = async () => {
    if (selectedNaf.size === 0) { setError("Sélectionnez au moins un code NAF"); return; }
    setSearching(true); setError(null); setSearchDone(false); setResults([]); setSelectedListId(null); setExcludedCount(0);
    try {
      const res = await fetch("/api/scraping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nafCodes: [...selectedNaf],
          departement: departement || undefined,
          codePostal: codePostal || undefined,
          trancheEffectif: selectedTranches.size > 0 ? [...selectedTranches] : undefined,
          maxResults,
        }),
      });
      const json = await res.json();
      if (json.error) { setError(json.error); }
      else {
        const all: ScrapingCompany[] = json.data || [];
        const deduped = all.filter((c) => !savedSirens.has(c.siren));
        setExcludedCount(all.length - deduped.length);
        setResults(deduped);
        setSearchDone(true);
      }
    } catch (err) { setError(String(err)); }
    finally { setSearching(false); }
  };

  // ── Save ──
  const handleSave = async () => {
    if (!listName.trim() || results.length === 0) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/scraping/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: listName.trim(),
          companies: results,
          filters: {
            nafCodes: [...selectedNaf],
            departement: departement || undefined,
            codePostal: codePostal || undefined,
            trancheEffectif: selectedTranches.size > 0 ? [...selectedTranches] : undefined,
          },
        }),
      });
      const json = await res.json();
      if (json.error) { setError(json.error); }
      else {
        setListName("");
        await fetchLists();
        setSelectedListId(json.data.id);
        setResults([]); setSearchDone(false);
      }
    } catch (err) { setError(String(err)); }
    finally { setSaving(false); }
  };

  // ── Delete ──
  const deleteList = async (id: string) => {
    if (!confirm("Supprimer cette liste ?")) return;
    try {
      await fetch(`/api/scraping/${id}`, { method: "DELETE" });
      if (selectedListId === id) { setSelectedListId(null); setListCompanies([]); }
      await fetchLists();
    } catch { alert("Erreur lors de la suppression"); }
  };

  // ── Edit ──
  const startEditing = (l: ScrapingList) => { setEditingListId(l.id); setEditName(l.name); };
  const saveEdit = async () => {
    if (!editingListId) return;
    try {
      const res = await fetch(`/api/scraping/${editingListId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });
      const json = await res.json();
      if (json.data) setLists((prev) => prev.map((l) => (l.id === editingListId ? { ...l, ...json.data } : l)));
    } catch { alert("Erreur lors de la sauvegarde"); }
    setEditingListId(null);
  };

  // ── CSV export ──
  const exportCsv = (companies: ScrapingCompany[], filename: string) => {
    const cols = orderedActiveCols;
    const headers = cols.map((c) => c.label);
    const rows = companies.map((c) => cols.map((col) => String(c[col.key] ?? "")));
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${(v || "").replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${filename}.csv`; a.click();
  };

  // ── Toggles ──
  const toggle = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, code: string) => {
    setter((prev) => { const n = new Set(prev); if (n.has(code)) n.delete(code); else n.add(code); return n; });
  };

  // ── Split dirigeants ──
  const openSplitModal = () => {
    const companies = selectedListId ? listCompanies : results;
    const checked = new Set<string>();
    companies.forEach((c) => {
      if ((c.all_dirigeants?.length ?? 0) > 1) {
        checked.add(c.siren);
      }
    });
    setSplitChecked(checked);
    setShowSplitModal(true);
  };

  const applySplit = () => {
    const source = selectedListId ? listCompanies : results;
    const expanded: ScrapingCompany[] = [];
    for (const c of source) {
      if (splitChecked.has(c.siren) && c.all_dirigeants && c.all_dirigeants.length > 1) {
        for (const d of c.all_dirigeants) {
          expanded.push({
            ...c,
            dirigeant: `${d.prenom} ${d.nom}`.trim() || "ND",
            dirigeant_prenom: d.prenom,
            dirigeant_nom: d.nom,
            dirigeant_role: d.role,
            all_dirigeants: [d],
            plusieurs_dirigeants: "NON",
          });
        }
      } else {
        expanded.push(c);
      }
    }
    if (selectedListId) {
      setListCompanies(expanded);
    } else {
      setResults(expanded);
    }
    setShowSplitModal(false);
  };

  // ── Displayed data ──
  const displayedCompanies = selectedListId ? listCompanies : results;
  const filteredBase = tableSearch
    ? displayedCompanies.filter((c) => {
        const q = tableSearch.toLowerCase();
        return c.raison_sociale?.toLowerCase().includes(q) || c.enseigne?.toLowerCase().includes(q) ||
          c.commune?.toLowerCase().includes(q) || c.code_postal?.includes(q) ||
          c.dirigeant?.toLowerCase().includes(q) || c.dirigeant_nom?.toLowerCase().includes(q) ||
          c.dirigeant_prenom?.toLowerCase().includes(q) || c.siren?.includes(q);
      })
    : displayedCompanies;

  // Apply sorting
  const filteredCompanies = sortKey
    ? [...filteredBase].sort((a, b) => {
        const aVal = String(a[sortKey] ?? "").toLowerCase();
        const bVal = String(b[sortKey] ?? "").toLowerCase();
        // Empty values always last
        if (!aVal && bVal) return 1;
        if (aVal && !bVal) return -1;
        if (!aVal && !bVal) return 0;
        const cmp = aVal.localeCompare(bVal, "fr");
        return sortDir === "asc" ? cmp : -cmp;
      })
    : filteredBase;

  // Ordered active columns (respecting drag order)
  const colMap = new Map(DEFAULT_COLUMNS.map((c) => [c.key, c]));
  const orderedActiveCols = columnOrder
    .filter((k) => visibleCols.has(k))
    .map((k) => colMap.get(k)!)
    .filter(Boolean);

  // Multi-dirigeant count
  const multiDirCount = displayedCompanies.filter((c) => (c.all_dirigeants?.length ?? 0) > 1).length;

  // ─── JSX ──────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Database className="w-5 h-5 text-indigo-600" />
            Scrapping — Boutiques Mode Open Data
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Recherche d&apos;entreprises actives via l&apos;API gouv.fr (codes NAF mode)
          </p>
        </div>
        {savedSirens.size > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg">
            <ShieldCheck className="w-3.5 h-3.5" />
            {savedSirens.size} SIREN exclus (anti-doublon)
          </div>
        )}
      </div>

      {/* Saved lists bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-3">
        <div className="flex items-center gap-2 mb-2">
          <Database className="w-4 h-4 text-gray-400" />
          <span className="text-xs font-semibold text-gray-600">Listes sauvegardées{lists.length > 0 && ` (${lists.length})`}</span>
        </div>
        {loadingLists ? (
          <div className="flex items-center gap-2 text-xs text-gray-400"><Loader2 className="w-3 h-3 animate-spin" /> Chargement…</div>
        ) : lists.length === 0 ? (
          <p className="text-xs text-gray-400">Aucune liste sauvegardée</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {[...lists].reverse().map((l) => (
              <div key={l.id}
                className={cn("relative group flex items-center gap-2 px-3 py-2 rounded-lg border text-xs cursor-pointer transition-colors",
                  selectedListId === l.id ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "bg-gray-50 border-gray-200 text-gray-700 hover:border-gray-300")}
                onClick={() => { setSelectedListId(l.id === selectedListId ? null : l.id); setResults([]); setSearchDone(false); }}>
                {editingListId === l.id ? (
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                      className="px-2 py-0.5 text-xs border border-gray-300 rounded w-36 focus:ring-1 focus:ring-indigo-400 outline-none"
                      autoFocus onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditingListId(null); }} />
                    <button onClick={saveEdit} className="text-green-600 cursor-pointer"><Check className="w-3 h-3" /></button>
                    <button onClick={() => setEditingListId(null)} className="text-gray-400 cursor-pointer"><X className="w-3 h-3" /></button>
                  </div>
                ) : (
                  <>
                    <span className="font-medium truncate max-w-[150px]">{l.name}</span>
                    <span className="text-gray-400">({l.count})</span>
                    <span className="text-gray-400 flex items-center gap-0.5"><MapPin className="w-3 h-3" />{l.filters.departement || "FR"}</span>
                    <div className="hidden group-hover:flex items-center gap-0.5 ml-1" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => startEditing(l)} className="p-0.5 text-gray-400 hover:text-gray-600 cursor-pointer"><Edit3 className="w-3 h-3" /></button>
                      <button onClick={() => deleteList(l.id)} className="p-0.5 text-gray-400 hover:text-red-500 cursor-pointer"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <button onClick={() => setShowFilters(!showFilters)}
          className="w-full flex items-center justify-between px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer">
          <span className="flex items-center gap-2"><Filter className="w-4 h-4" />Filtres de recherche</span>
          {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showFilters && (
          <div className="px-5 pb-5 space-y-4 border-t border-gray-100 pt-4">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-2 block">Codes NAF (activité)</label>
              <div className="flex flex-wrap gap-2">
                {NAF_OPTIONS.map((naf) => (
                  <button key={naf.code} onClick={() => toggle(setSelectedNaf, naf.code)}
                    className={cn("px-3 py-1.5 text-xs rounded-lg border transition-colors cursor-pointer",
                      selectedNaf.has(naf.code) ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-medium" : "bg-white border-gray-200 text-gray-600 hover:border-gray-300")}>
                    {naf.code} — {naf.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Département</label>
                <select value={departement} onChange={(e) => setDepartement(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 outline-none">
                  {DEPARTEMENTS.map((d) => <option key={d.code} value={d.code}>{d.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Code postal (optionnel)</label>
                <input type="text" value={codePostal} onChange={(e) => setCodePostal(e.target.value)} placeholder="ex: 75008"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 outline-none" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-2 block">Tranche d&apos;effectif</label>
              <div className="flex flex-wrap gap-2">
                {TRANCHE_OPTIONS.map((t) => (
                  <button key={t.code} onClick={() => toggle(setSelectedTranches, t.code)}
                    className={cn("px-3 py-1.5 text-xs rounded-lg border transition-colors cursor-pointer",
                      selectedTranches.has(t.code) ? "bg-emerald-50 border-emerald-300 text-emerald-700 font-medium" : "bg-white border-gray-200 text-gray-600 hover:border-gray-300")}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-end gap-3">
              <div className="w-32">
                <label className="text-xs font-medium text-gray-500 mb-1 block">Max résultats</label>
                <select value={maxResults} onChange={(e) => setMaxResults(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 outline-none">
                  {[50, 100, 200, 300, 500].map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <button onClick={handleSearch} disabled={searching || selectedNaf.size === 0}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors cursor-pointer">
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                {searching ? "Recherche en cours…" : "Lancer la recherche"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />{error}
        </div>
      )}

      {/* Excluded info */}
      {excludedCount > 0 && searchDone && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 flex-shrink-0" />
          {excludedCount} doublon{excludedCount > 1 ? "s" : ""} exclu{excludedCount > 1 ? "s" : ""} (SIREN déjà dans une liste sauvegardée)
        </div>
      )}

      {/* Save bar */}
      {searchDone && results.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
          <span className="text-sm font-medium text-gray-600 whitespace-nowrap">{results.length} entreprises trouvées</span>
          <input type="text" value={listName} onChange={(e) => setListName(e.target.value)} placeholder="Nom de la liste (ex: Boutiques mode Paris)"
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 outline-none" />
          <button onClick={handleSave} disabled={saving || !listName.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 cursor-pointer">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Sauvegarder
          </button>
          <button onClick={() => exportCsv(results, "scraping_results")}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 cursor-pointer">
            <Download className="w-4 h-4" />CSV
          </button>
        </div>
      )}

      {/* Results table */}
      {(filteredCompanies.length > 0 || loadingCompanies) && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-medium text-gray-700">
              {selectedListId ? `${listCompanies.length} entreprises` : `${results.length} résultats`}
              {tableSearch && ` (${filteredCompanies.length} filtrées)`}
            </span>
            <div className="flex items-center gap-2">
              <input type="text" value={tableSearch} onChange={(e) => setTableSearch(e.target.value)} placeholder="Filtrer…"
                className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg w-48 focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 outline-none" />
              {/* Split dirigeants button */}
              {multiDirCount > 0 && (
                <button onClick={openSplitModal}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 cursor-pointer">
                  <Users2 className="w-3 h-3" />Séparer dirigeants ({multiDirCount})
                </button>
              )}
              {/* Column picker */}
              <div className="relative" ref={colPickerRef}>
                <button onClick={() => setShowColPicker(!showColPicker)}
                  className={cn("flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border cursor-pointer transition-colors",
                    showColPicker ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300")}>
                  <Columns3 className="w-3 h-3" />Colonnes
                </button>
                {showColPicker && (
                  <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50 max-h-80 overflow-y-auto">
                    {DEFAULT_COLUMNS.map((col) => (
                      <label key={col.key} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-xs text-gray-700">
                        <input type="checkbox" checked={visibleCols.has(col.key)} onChange={() => toggle(setVisibleCols, col.key)}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                        {col.label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
              {selectedListId && (
                <button onClick={() => exportCsv(listCompanies, lists.find((l) => l.id === selectedListId)?.name || "export")}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 cursor-pointer">
                  <Download className="w-3 h-3" />CSV
                </button>
              )}
            </div>
          </div>

          {loadingCompanies ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-indigo-500" /></div>
          ) : (
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="text-xs border-collapse" style={{ minWidth: orderedActiveCols.reduce((s, c) => s + (colWidths[c.key] ?? c.defaultW), 0) }}>
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    {orderedActiveCols.map((col) => (
                      <th key={col.key}
                        className="text-left font-medium text-gray-500 whitespace-nowrap relative select-none group"
                        style={{ width: colWidths[col.key] ?? col.defaultW, minWidth: col.minW }}
                        draggable
                        onDragStart={() => handleDragStart(col.key)}
                        onDragOver={(e) => handleDragOver(e, col.key)}
                        onDragEnd={handleDragEnd}>
                        <div className="px-3 py-2 flex items-center gap-1 cursor-grab active:cursor-grabbing"
                          onClick={(e) => { if (!resizingRef.current) { e.stopPropagation(); handleSort(col.key); } }}>
                          <GripVertical className="w-3 h-3 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                          {col.label}
                          {sortKey === col.key ? (
                            sortDir === "asc" ? <ArrowUp className="w-3 h-3 text-indigo-500 flex-shrink-0" /> : <ArrowDown className="w-3 h-3 text-indigo-500 flex-shrink-0" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                          )}
                        </div>
                        <div className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-indigo-300 group-hover:bg-gray-300 transition-colors"
                          onMouseDown={(e) => startResize(col.key, e)}
                          draggable={false}
                          onDragStart={(e) => e.stopPropagation()} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredCompanies.map((c, i) => {
                    const isMultiDir = (c.all_dirigeants?.length ?? 0) > 1;
                    const boldCols = new Set<string>(["enseigne", "raison_sociale"]);
                    return (
                      <tr key={`${c.siren}-${i}`} className={cn("hover:bg-gray-50", isMultiDir && "bg-amber-50/40")}>
                        {orderedActiveCols.map((col) => (
                          <td key={col.key} className={cn("px-3 py-2 overflow-hidden text-ellipsis whitespace-nowrap", isMultiDir && boldCols.has(col.key) && "font-bold")}
                            style={{ maxWidth: colWidths[col.key] ?? col.defaultW }}>
                            <CellValue col={col} company={c} />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Empty states */}
      {!searching && !searchDone && !selectedListId && results.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Configurez vos filtres et lancez une recherche</p>
          <p className="text-xs text-gray-400 mt-1">Données open data : API Recherche d&apos;entreprises (gouv.fr)</p>
        </div>
      )}
      {searchDone && results.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Search className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Aucun résultat pour ces critères</p>
          <p className="text-xs text-gray-400 mt-1">Essayez d&apos;élargir vos filtres</p>
        </div>
      )}

      {/* ── Split dirigeants modal ── */}
      {showSplitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                  <Users2 className="w-4 h-4 text-amber-600" />
                  Séparer les dirigeants
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Les entreprises avec plusieurs dirigeants seront dupliquées (1 ligne par dirigeant).
                  Les lignes en gras ont plusieurs dirigeants et sont pré-cochées.
                </p>
              </div>
              <button onClick={() => setShowSplitModal(false)} className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-3">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-2 py-2 text-left w-8">
                      <input type="checkbox"
                        checked={splitChecked.size === displayedCompanies.filter((c) => (c.all_dirigeants?.length ?? 0) > 1).length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            const all = new Set<string>();
                            displayedCompanies.forEach((c) => { if ((c.all_dirigeants?.length ?? 0) > 1) all.add(c.siren); });
                            setSplitChecked(all);
                          } else {
                            setSplitChecked(new Set());
                          }
                        }}
                        className="rounded border-gray-300 text-amber-600 focus:ring-amber-500" />
                    </th>
                    <th className="px-2 py-2 text-left font-medium text-gray-500">Enseigne</th>
                    <th className="px-2 py-2 text-left font-medium text-gray-500">Dirigeants</th>
                    <th className="px-2 py-2 text-left font-medium text-gray-500 w-12">Nb</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {displayedCompanies.filter((c) => (c.all_dirigeants?.length ?? 0) > 1).map((c) => (
                    <tr key={c.siren} className="hover:bg-gray-50">
                      <td className="px-2 py-2">
                        <input type="checkbox"
                          checked={splitChecked.has(c.siren)}
                          onChange={() => {
                            setSplitChecked((prev) => {
                              const n = new Set(prev);
                              if (n.has(c.siren)) n.delete(c.siren); else n.add(c.siren);
                              return n;
                            });
                          }}
                          className="rounded border-gray-300 text-amber-600 focus:ring-amber-500" />
                      </td>
                      <td className="px-2 py-2 font-semibold text-gray-900">{c.enseigne || c.raison_sociale}</td>
                      <td className="px-2 py-2">
                        {c.all_dirigeants?.map((d, j) => (
                          <div key={j} className="text-gray-700">
                            <span className="font-medium uppercase">{d.nom}</span>{" "}
                            <span className="capitalize">{d.prenom}</span>
                            {d.role && <span className="text-gray-400 ml-1">({d.role})</span>}
                          </div>
                        ))}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">
                          {c.all_dirigeants?.length}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {displayedCompanies.filter((c) => (c.all_dirigeants?.length ?? 0) > 1).length === 0 && (
                <p className="text-center text-sm text-gray-400 py-8">Aucune entreprise avec plusieurs dirigeants</p>
              )}
            </div>
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
              <span className="text-xs text-gray-500">{splitChecked.size} entreprise{splitChecked.size > 1 ? "s" : ""} à séparer</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowSplitModal(false)}
                  className="px-4 py-2 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 cursor-pointer">Annuler</button>
                <button onClick={applySplit} disabled={splitChecked.size === 0}
                  className="px-4 py-2 text-xs font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50 cursor-pointer">
                  Séparer ({splitChecked.size})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
