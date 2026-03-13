"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Loader2,
  Save,
  Trash2,
  Download,
  AlertCircle,
  Building2,
  MapPin,
  Users,
  Filter,
  ChevronDown,
  ChevronUp,
  Edit3,
  Check,
  X,
  Database,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────

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
  dirigeant_role: string;
  effectif_approx: string;
  statut: string;
}

interface ScrapingList {
  id: string;
  name: string;
  created_at: string;
  count: number;
  filters: {
    nafCodes: string[];
    departement?: string;
    codePostal?: string;
    trancheEffectif?: string[];
  };
}

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

// ─── Component ───────────────────────────────────────────

export default function ScrappingPage() {
  // Filter state
  const [selectedNaf, setSelectedNaf] = useState<Set<string>>(new Set(["47.71Z"]));
  const [departement, setDepartement] = useState("");
  const [codePostal, setCodePostal] = useState("");
  const [selectedTranches, setSelectedTranches] = useState<Set<string>>(new Set(["01", "02", "03", "11"]));
  const [maxResults, setMaxResults] = useState(100);
  const [showFilters, setShowFilters] = useState(true);

  // Results state
  const [results, setResults] = useState<ScrapingCompany[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchDone, setSearchDone] = useState(false);

  // Save state
  const [listName, setListName] = useState("");
  const [saving, setSaving] = useState(false);

  // Saved lists state
  const [lists, setLists] = useState<ScrapingList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [listCompanies, setListCompanies] = useState<ScrapingCompany[]>([]);
  const [loadingLists, setLoadingLists] = useState(true);
  const [loadingCompanies, setLoadingCompanies] = useState(false);

  // Edit state
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  // Table search
  const [tableSearch, setTableSearch] = useState("");

  // ── Fetch saved lists ──
  const fetchLists = useCallback(async () => {
    try {
      const res = await fetch("/api/scraping");
      const json = await res.json();
      if (json.data) setLists(json.data);
    } catch (err) {
      console.error("Erreur chargement listes:", err);
    } finally {
      setLoadingLists(false);
    }
  }, []);

  useEffect(() => {
    fetchLists();
  }, [fetchLists]);

  // ── Fetch companies for selected list ──
  const fetchCompanies = useCallback(async (listId: string) => {
    setLoadingCompanies(true);
    try {
      const res = await fetch(`/api/scraping/${listId}?t=${Date.now()}`);
      const json = await res.json();
      if (json.data) setListCompanies(json.data);
    } catch (err) {
      console.error("Erreur chargement entreprises:", err);
    } finally {
      setLoadingCompanies(false);
    }
  }, []);

  useEffect(() => {
    if (selectedListId) fetchCompanies(selectedListId);
    else setListCompanies([]);
  }, [selectedListId, fetchCompanies]);

  // ── Search ──
  const handleSearch = async () => {
    if (selectedNaf.size === 0) {
      setError("Sélectionnez au moins un code NAF");
      return;
    }
    setSearching(true);
    setError(null);
    setSearchDone(false);
    setResults([]);
    setSelectedListId(null);

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
      if (json.error) {
        setError(json.error);
      } else {
        setResults(json.data || []);
        setSearchDone(true);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setSearching(false);
    }
  };

  // ── Save results ──
  const handleSave = async () => {
    if (!listName.trim() || results.length === 0) return;
    setSaving(true);
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
      if (json.error) {
        setError(json.error);
      } else {
        setListName("");
        await fetchLists();
        setSelectedListId(json.data.id);
        setResults([]);
        setSearchDone(false);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  // ── Delete list ──
  const deleteList = async (id: string) => {
    if (!confirm("Supprimer cette liste ?")) return;
    try {
      await fetch(`/api/scraping/${id}`, { method: "DELETE" });
      if (selectedListId === id) {
        setSelectedListId(null);
        setListCompanies([]);
      }
      await fetchLists();
    } catch {
      alert("Erreur lors de la suppression");
    }
  };

  // ── Rename list ──
  const startEditing = (l: ScrapingList) => {
    setEditingListId(l.id);
    setEditName(l.name);
  };

  const saveEdit = async () => {
    if (!editingListId) return;
    try {
      const res = await fetch(`/api/scraping/${editingListId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });
      const json = await res.json();
      if (json.data) {
        setLists((prev) => prev.map((l) => (l.id === editingListId ? { ...l, ...json.data } : l)));
      }
    } catch {
      alert("Erreur lors de la sauvegarde");
    }
    setEditingListId(null);
  };

  // ── Export CSV ──
  const exportCsv = (companies: ScrapingCompany[], filename: string) => {
    const headers = [
      "Raison sociale", "Enseigne", "SIREN", "SIRET", "Code postal", "Commune",
      "Département", "Adresse", "Code NAF", "Libellé NAF", "Tranche effectif",
      "Dirigeant", "Rôle dirigeant", "Effectif approx.", "Statut",
    ];
    const rows = companies.map((c) => [
      c.raison_sociale, c.enseigne, c.siren, c.siret, c.code_postal, c.commune,
      c.departement, c.adresse, c.code_naf, c.libelle_naf, c.tranche_effectif,
      c.dirigeant, c.dirigeant_role, c.effectif_approx, c.statut,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${(v || "").replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${filename}.csv`;
    a.click();
  };

  // ── Toggle helpers ──
  const toggleNaf = (code: string) => {
    setSelectedNaf((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const toggleTranche = (code: string) => {
    setSelectedTranches((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  // ── Displayed companies ──
  const displayedCompanies = selectedListId ? listCompanies : results;
  const filteredCompanies = tableSearch
    ? displayedCompanies.filter((c) => {
        const q = tableSearch.toLowerCase();
        return (
          c.raison_sociale?.toLowerCase().includes(q) ||
          c.enseigne?.toLowerCase().includes(q) ||
          c.commune?.toLowerCase().includes(q) ||
          c.code_postal?.includes(q) ||
          c.dirigeant?.toLowerCase().includes(q) ||
          c.siren?.includes(q)
        );
      })
    : displayedCompanies;

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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Filters + Results */}
        <div className="lg:col-span-2 space-y-4">
          {/* Filters */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="w-full flex items-center justify-between px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Filter className="w-4 h-4" />
                Filtres de recherche
              </span>
              {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showFilters && (
              <div className="px-5 pb-5 space-y-4 border-t border-gray-100 pt-4">
                {/* NAF codes */}
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-2 block">Codes NAF (activité)</label>
                  <div className="flex flex-wrap gap-2">
                    {NAF_OPTIONS.map((naf) => (
                      <button
                        key={naf.code}
                        onClick={() => toggleNaf(naf.code)}
                        className={cn(
                          "px-3 py-1.5 text-xs rounded-lg border transition-colors cursor-pointer",
                          selectedNaf.has(naf.code)
                            ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-medium"
                            : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                        )}
                      >
                        {naf.code} — {naf.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Department + Code postal */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">Département</label>
                    <select
                      value={departement}
                      onChange={(e) => setDepartement(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 outline-none"
                    >
                      {DEPARTEMENTS.map((d) => (
                        <option key={d.code} value={d.code}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">Code postal (optionnel)</label>
                    <input
                      type="text"
                      value={codePostal}
                      onChange={(e) => setCodePostal(e.target.value)}
                      placeholder="ex: 75008"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 outline-none"
                    />
                  </div>
                </div>

                {/* Tranches effectif */}
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-2 block">Tranche d&apos;effectif</label>
                  <div className="flex flex-wrap gap-2">
                    {TRANCHE_OPTIONS.map((t) => (
                      <button
                        key={t.code}
                        onClick={() => toggleTranche(t.code)}
                        className={cn(
                          "px-3 py-1.5 text-xs rounded-lg border transition-colors cursor-pointer",
                          selectedTranches.has(t.code)
                            ? "bg-emerald-50 border-emerald-300 text-emerald-700 font-medium"
                            : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                        )}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Max results + Search button */}
                <div className="flex items-end gap-3">
                  <div className="w-32">
                    <label className="text-xs font-medium text-gray-500 mb-1 block">Max résultats</label>
                    <select
                      value={maxResults}
                      onChange={(e) => setMaxResults(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 outline-none"
                    >
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={200}>200</option>
                      <option value={300}>300</option>
                      <option value={500}>500</option>
                    </select>
                  </div>
                  <button
                    onClick={handleSearch}
                    disabled={searching || selectedNaf.size === 0}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors cursor-pointer"
                  >
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
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* Save bar (only when results from search) */}
          {searchDone && results.length > 0 && !selectedListId && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
              <span className="text-sm font-medium text-gray-600 whitespace-nowrap">
                {results.length} entreprises trouvées
              </span>
              <input
                type="text"
                value={listName}
                onChange={(e) => setListName(e.target.value)}
                placeholder="Nom de la liste (ex: Boutiques mode Paris)"
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 outline-none"
              />
              <button
                onClick={handleSave}
                disabled={saving || !listName.trim()}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Sauvegarder
              </button>
              <button
                onClick={() => exportCsv(results, "scraping_results")}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                CSV
              </button>
            </div>
          )}

          {/* Results table */}
          {(filteredCompanies.length > 0 || loadingCompanies) && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Table header bar */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <span className="text-sm font-medium text-gray-700">
                  {selectedListId
                    ? `${listCompanies.length} entreprises`
                    : `${results.length} résultats`}
                  {tableSearch && ` (${filteredCompanies.length} filtrées)`}
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={tableSearch}
                    onChange={(e) => setTableSearch(e.target.value)}
                    placeholder="Filtrer…"
                    className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg w-48 focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 outline-none"
                  />
                  {selectedListId && (
                    <button
                      onClick={() => exportCsv(listCompanies, lists.find((l) => l.id === selectedListId)?.name || "export")}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 cursor-pointer"
                    >
                      <Download className="w-3 h-3" />
                      CSV
                    </button>
                  )}
                </div>
              </div>

              {loadingCompanies ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0 z-10">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap">Raison sociale</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap">Enseigne</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap">SIREN</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap">SIRET</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap">CP</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap">Commune</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap">NAF</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap">Effectif</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap">Dirigeant</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap">Statut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredCompanies.map((c, i) => (
                        <tr key={c.siret || i} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium text-gray-900 max-w-[200px] truncate">{c.raison_sociale}</td>
                          <td className="px-3 py-2 text-gray-600 max-w-[140px] truncate">{c.enseigne || "—"}</td>
                          <td className="px-3 py-2 text-gray-500 font-mono">{c.siren}</td>
                          <td className="px-3 py-2 text-gray-500 font-mono text-[10px]">{c.siret}</td>
                          <td className="px-3 py-2 text-gray-600">{c.code_postal}</td>
                          <td className="px-3 py-2 text-gray-600 max-w-[120px] truncate">{c.commune}</td>
                          <td className="px-3 py-2">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-medium">
                              {c.code_naf}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-medium">
                              {c.tranche_effectif}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-600 max-w-[150px] truncate" title={c.dirigeant_role}>
                            {c.dirigeant}
                          </td>
                          <td className="px-3 py-2">
                            <span className={cn(
                              "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium",
                              c.statut === "Actif" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                            )}>
                              {c.statut}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Empty state */}
          {!searching && !searchDone && !selectedListId && results.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">Configurez vos filtres et lancez une recherche</p>
              <p className="text-xs text-gray-400 mt-1">
                Données open data : API Recherche d&apos;entreprises (gouv.fr)
              </p>
            </div>
          )}

          {searchDone && results.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <Search className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">Aucun résultat pour ces critères</p>
              <p className="text-xs text-gray-400 mt-1">Essayez d&apos;élargir vos filtres</p>
            </div>
          )}
        </div>

        {/* Right: Saved lists */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Database className="w-4 h-4" />
                Listes sauvegardées
                {lists.length > 0 && (
                  <span className="text-xs text-gray-400 font-normal">({lists.length})</span>
                )}
              </h2>
            </div>

            {loadingLists ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
              </div>
            ) : lists.length === 0 ? (
              <div className="p-6 text-center">
                <Database className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-xs text-gray-400">Aucune liste sauvegardée</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
                {[...lists].reverse().map((l) => (
                  <div
                    key={l.id}
                    className={cn(
                      "px-4 py-3 cursor-pointer transition-colors",
                      selectedListId === l.id ? "bg-indigo-50" : "hover:bg-gray-50"
                    )}
                    onClick={() => {
                      setSelectedListId(l.id === selectedListId ? null : l.id);
                      setResults([]);
                      setSearchDone(false);
                    }}
                  >
                    {editingListId === l.id ? (
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-indigo-400 outline-none"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit();
                            if (e.key === "Escape") setEditingListId(null);
                          }}
                        />
                        <button onClick={saveEdit} className="text-green-600 hover:text-green-700 cursor-pointer">
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setEditingListId(null)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-800 truncate">{l.name}</span>
                          <div className="flex items-center gap-1 ml-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => startEditing(l)}
                              className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => deleteList(l.id)}
                              className="p-1 text-gray-400 hover:text-red-500 cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-400">
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {l.count} entreprises
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {l.filters.departement || "France"}
                          </span>
                          <span>{new Date(l.created_at).toLocaleDateString("fr-FR")}</span>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {l.filters.nafCodes?.map((naf) => (
                            <span key={naf} className="px-1.5 py-0.5 text-[9px] rounded bg-indigo-50 text-indigo-600">
                              {naf}
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
