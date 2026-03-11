"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Upload,
  FileSpreadsheet,
  Loader2,
  Sparkles,
  Download,
  Trash2,
  AlertCircle,
  Linkedin,
  Eye,
  EyeOff,
  ChevronDown,
  Users,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────

interface ImportList {
  id: string;
  name: string;
  created_at: string;
  count: number;
}

interface ImportContact {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  company: string;
  job: string;
  phone: string;
  linkedin: string;
  mobile_phone?: string;
  website?: string;
  company_linkedin?: string;
  company_domain?: string;
  siren?: string;
  siret?: string;
  naf_code?: string;
  naf_label?: string;
  nb_employees?: string;
  company_address?: string;
  company_city?: string;
  company_postal_code?: string;
  company_country?: string;
  email_qualification?: string;
  enriched?: boolean;
}

// ─── Column definitions ──────────────────────────────────

interface ColumnDef {
  key: keyof ImportContact;
  label: string;
  defaultVisible: boolean;
  enrichedOnly?: boolean;
}

const ALL_COLUMNS: ColumnDef[] = [
  { key: "first_name", label: "Prénom", defaultVisible: true },
  { key: "last_name", label: "Nom", defaultVisible: true },
  { key: "email", label: "Email", defaultVisible: true },
  { key: "company", label: "Entreprise", defaultVisible: true },
  { key: "job", label: "Poste", defaultVisible: true },
  { key: "phone", label: "Téléphone", defaultVisible: true },
  { key: "linkedin", label: "LinkedIn", defaultVisible: true },
  { key: "mobile_phone", label: "Mobile", defaultVisible: false, enrichedOnly: true },
  { key: "website", label: "Site web", defaultVisible: false, enrichedOnly: true },
  { key: "naf_code", label: "NAF", defaultVisible: false, enrichedOnly: true },
  { key: "naf_label", label: "Libellé NAF", defaultVisible: false, enrichedOnly: true },
  { key: "nb_employees", label: "Effectifs", defaultVisible: false, enrichedOnly: true },
  { key: "siren", label: "SIREN", defaultVisible: false, enrichedOnly: true },
  { key: "siret", label: "SIRET", defaultVisible: false, enrichedOnly: true },
  { key: "email_qualification", label: "Qualité email", defaultVisible: false, enrichedOnly: true },
  { key: "enriched", label: "Enrichi", defaultVisible: true },
];

const EXPECTED_CSV_COLUMNS = ["first_name", "last_name", "email", "company", "job", "phone", "linkedin"];

// ─── CSV parser (;-separated) ────────────────────────────

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = lines[0].split(";").map((h) => h.trim().replace(/^["']|["']$/g, ""));
  const rows = lines.slice(1).map((line) => {
    const values = line.split(";").map((v) => v.trim().replace(/^["']|["']$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = values[i] || "";
    });
    return row;
  });

  return { headers, rows };
}

// ─── Main Component ──────────────────────────────────────

export default function ImportPage() {
  // Lists state
  const [lists, setLists] = useState<ImportList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<ImportContact[]>([]);
  const [loadingLists, setLoadingLists] = useState(true);
  const [loadingContacts, setLoadingContacts] = useState(false);

  // Upload state
  const [csvError, setCsvError] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<Record<string, string>[] | null>(null);
  const [listName, setListName] = useState("");
  const [creating, setCreating] = useState(false);

  // Column visibility
  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    new Set(ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key))
  );
  const [showColPicker, setShowColPicker] = useState(false);

  // Enrichment
  const [enriching, setEnriching] = useState(false);
  const [enrichMsg, setEnrichMsg] = useState<string | null>(null);

  // Search
  const [search, setSearch] = useState("");

  // ── Fetch lists ──
  const fetchLists = useCallback(async () => {
    try {
      const res = await fetch("/api/imports");
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

  // ── Fetch contacts for selected list ──
  const fetchContacts = useCallback(async (listId: string) => {
    setLoadingContacts(true);
    try {
      const res = await fetch(`/api/imports/${listId}?t=${Date.now()}`);
      const json = await res.json();
      if (json.data) setContacts(json.data);
    } catch (err) {
      console.error("Erreur chargement contacts:", err);
    } finally {
      setLoadingContacts(false);
    }
  }, []);

  useEffect(() => {
    if (selectedListId) fetchContacts(selectedListId);
    else setContacts([]);
  }, [selectedListId, fetchContacts]);

  // ── CSV file handler ──
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setCsvError(null);
    setParsedRows(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { headers, rows } = parseCsv(text);

      // Validate headers
      const missing = EXPECTED_CSV_COLUMNS.filter((c) => !headers.includes(c));
      const extra = headers.filter((h) => !EXPECTED_CSV_COLUMNS.includes(h));

      if (missing.length > 0) {
        setCsvError(`Colonnes manquantes : ${missing.join(", ")}. Colonnes attendues : ${EXPECTED_CSV_COLUMNS.join(", ")}`);
        return;
      }
      if (extra.length > 0) {
        setCsvError(`Colonnes non reconnues : ${extra.join(", ")}. Colonnes attendues : ${EXPECTED_CSV_COLUMNS.join(", ")}`);
        return;
      }
      if (rows.length === 0) {
        setCsvError("Le fichier ne contient aucune ligne de données.");
        return;
      }
      if (rows.length > 100) {
        setCsvError(`Le fichier contient ${rows.length} lignes. Maximum autorisé : 100.`);
        return;
      }

      setParsedRows(rows);
      // Auto-generate list name from filename
      const baseName = f.name.replace(/\.(csv|xlsx?)$/i, "").replace(/[_-]/g, " ");
      setListName(baseName);
    };
    reader.readAsText(f, "UTF-8");
  };

  // ── Create list ──
  const createList = async () => {
    if (!parsedRows || !listName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: listName.trim(), rows: parsedRows }),
      });
      const json = await res.json();
      if (json.data) {
        setParsedRows(null);
        setCsvError(null);
        setListName("");
        await fetchLists();
        setSelectedListId(json.data.id);
      } else {
        setCsvError(json.error || "Erreur lors de la création");
      }
    } catch {
      setCsvError("Erreur réseau lors de la création");
    } finally {
      setCreating(false);
    }
  };

  // ── Delete list ──
  const deleteList = async (id: string) => {
    if (!confirm("Supprimer cette liste d'import ?")) return;
    try {
      await fetch(`/api/imports/${id}`, { method: "DELETE" });
      if (selectedListId === id) {
        setSelectedListId(null);
        setContacts([]);
      }
      await fetchLists();
    } catch {
      alert("Erreur lors de la suppression");
    }
  };

  // ── Enrich via Dropcontact ──
  const enrichList = async () => {
    if (!selectedListId) return;
    const toEnrichCount = contacts.filter((c) => (!c.email || !c.phone || !c.linkedin) && !c.enriched).length;
    if (toEnrichCount === 0) {
      setEnrichMsg("Tous les contacts ont déjà email + téléphone + linkedin (ou sont déjà enrichis)");
      setTimeout(() => setEnrichMsg(null), 5000);
      return;
    }
    if (!confirm(`Enrichir ${toEnrichCount} contact${toEnrichCount > 1 ? "s" : ""} via Dropcontact ?\nCela consommera des crédits API.`)) return;

    setEnriching(true);
    setEnrichMsg("Envoi à Dropcontact...");

    try {
      // Step 1: Submit
      const submitRes = await fetch(`/api/imports/${selectedListId}/enrich`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const submitJson = await submitRes.json();

      if (!submitJson.submitted) {
        setEnrichMsg(`Erreur : ${submitJson.error}`);
        setTimeout(() => setEnrichMsg(null), 5000);
        setEnriching(false);
        return;
      }

      const { requestId, contactIds } = submitJson;
      setEnrichMsg(`Dropcontact traite ${submitJson.count} contacts...`);

      // Step 2: Poll (every 5s, max 2 min)
      for (let attempt = 0; attempt < 24; attempt++) {
        await new Promise((r) => setTimeout(r, 5000));
        setEnrichMsg(`Enrichissement en cours... (${(attempt + 1) * 5}s)`);

        const pollRes = await fetch(
          `/api/imports/${selectedListId}/enrich?requestId=${encodeURIComponent(requestId)}&ids=${contactIds.join(",")}`
        );
        const pollJson = await pollRes.json();

        if (pollJson.done) {
          if (pollJson.error) {
            setEnrichMsg(`Erreur Dropcontact : ${pollJson.error}`);
          } else {
            setEnrichMsg(`${pollJson.enriched}/${pollJson.total} enrichi${pollJson.enriched > 1 ? "s" : ""}`);
            await fetchContacts(selectedListId);
          }
          setTimeout(() => setEnrichMsg(null), 8000);
          setEnriching(false);
          return;
        }
      }

      setEnrichMsg("Timeout — Dropcontact n'a pas répondu en 2 min");
      setTimeout(() => setEnrichMsg(null), 5000);
    } catch (err) {
      console.error("Enrichissement error:", err);
      setEnrichMsg("Erreur lors de l'enrichissement");
      setTimeout(() => setEnrichMsg(null), 5000);
    }
    setEnriching(false);
  };

  // ── Download CSV ──
  const downloadCsv = () => {
    if (!selectedListId) return;
    window.open(`/api/imports/${selectedListId}/download`, "_blank");
  };

  // ── Column toggle ──
  const toggleCol = (key: string) => {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ── Filtered contacts ──
  const filtered = useMemo(() => {
    if (!search) return contacts;
    const q = search.toLowerCase();
    return contacts.filter((c) =>
      c.first_name?.toLowerCase().includes(q) ||
      c.last_name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.company?.toLowerCase().includes(q) ||
      c.job?.toLowerCase().includes(q) ||
      c.phone?.includes(q)
    );
  }, [contacts, search]);

  const visibleColumns = ALL_COLUMNS.filter((c) => visibleCols.has(c.key));
  const selectedList = lists.find((l) => l.id === selectedListId);
  const enrichableCount = contacts.filter((c) => (!c.email || !c.phone || !c.linkedin) && !c.enriched).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Upload className="w-7 h-7 text-indigo-600" />
            Import CSV
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Importez une liste de contacts, enrichissez avec Dropcontact, exportez le CSV enrichi.
          </p>
        </div>
      </div>

      {/* Upload zone + list selector */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Upload */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Nouvelle liste
          </h2>
          <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors">
            <div className="flex flex-col items-center gap-1.5 text-gray-500">
              {parsedRows ? (
                <>
                  <FileSpreadsheet className="w-6 h-6 text-indigo-500" />
                  <span className="text-sm font-medium text-gray-700">{parsedRows.length} contacts détectés</span>
                  <span className="text-xs text-gray-400">Cliquer pour changer de fichier</span>
                </>
              ) : (
                <>
                  <Upload className="w-6 h-6" />
                  <span className="text-sm font-medium">Glisser un fichier CSV ou cliquer ici</span>
                  <span className="text-[10px] text-gray-400">
                    Colonnes : {EXPECTED_CSV_COLUMNS.join(" ; ")}
                  </span>
                </>
              )}
            </div>
            <input type="file" className="hidden" accept=".csv" onChange={handleFileChange} />
          </label>

          {csvError && (
            <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {csvError}
            </div>
          )}

          {parsedRows && (
            <div className="mt-3 flex items-center gap-2">
              <input
                type="text"
                value={listName}
                onChange={(e) => setListName(e.target.value)}
                placeholder="Nom de la liste (ex: Salon VivaTech 2026)"
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 outline-none"
              />
              <button
                onClick={createList}
                disabled={creating || !listName.trim()}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Importer
              </button>
            </div>
          )}
        </div>

        {/* List selector */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Users className="w-4 h-4" />
            Listes ({lists.length})
          </h2>
          {loadingLists ? (
            <div className="flex items-center gap-2 text-xs text-gray-400 py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Chargement...
            </div>
          ) : lists.length === 0 ? (
            <p className="text-xs text-gray-400 py-4">Aucune liste importée</p>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {lists.sort((a, b) => b.created_at.localeCompare(a.created_at)).map((l) => (
                <div
                  key={l.id}
                  className={cn(
                    "flex items-center justify-between px-3 py-2 rounded-lg text-xs cursor-pointer transition-colors group",
                    selectedListId === l.id ? "bg-indigo-50 border border-indigo-200" : "hover:bg-gray-50 border border-transparent"
                  )}
                  onClick={() => setSelectedListId(l.id)}
                >
                  <div className="min-w-0">
                    <p className={cn("font-medium truncate", selectedListId === l.id ? "text-indigo-700" : "text-gray-700")}>{l.name}</p>
                    <p className="text-gray-400 text-[10px]">
                      {l.count} contacts · {new Date(l.created_at).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteList(l.id); }}
                    className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Selected list content */}
      {selectedListId && selectedList && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Toolbar */}
          <div className="p-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-semibold text-gray-700 truncate">{selectedList.name}</h2>
              <p className="text-xs text-gray-400">{contacts.length} contacts{enrichableCount > 0 ? ` · ${enrichableCount} à enrichir` : ""}</p>
            </div>

            {/* Search */}
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher..."
              className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-1 focus:ring-indigo-400 outline-none w-48"
            />

            {enrichMsg && (
              <span className="text-xs font-medium px-2 py-1 rounded bg-green-50 text-green-700">{enrichMsg}</span>
            )}

            {/* Column picker */}
            <div className="relative">
              <button
                onClick={() => setShowColPicker(!showColPicker)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
              >
                {showColPicker ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                Colonnes
                <ChevronDown className="w-3 h-3" />
              </button>
              {showColPicker && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-lg border border-gray-200 shadow-xl z-50 p-2 space-y-0.5 max-h-80 overflow-y-auto">
                  {ALL_COLUMNS.map((col) => (
                    <label key={col.key} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={visibleCols.has(col.key)}
                        onChange={() => toggleCol(col.key)}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className={cn(col.enrichedOnly ? "text-purple-600" : "text-gray-700")}>
                        {col.label}
                        {col.enrichedOnly && <span className="text-[9px] ml-1 text-purple-400">(enrichi)</span>}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Enrich button */}
            <button
              onClick={enrichList}
              disabled={enriching || enrichableCount === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 cursor-pointer"
            >
              {enriching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Enrichir ({enrichableCount})
            </button>

            {/* Download button */}
            <button
              onClick={downloadCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Exporter CSV
            </button>
          </div>

          {/* Table */}
          {loadingContacts ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500 text-[10px] uppercase sticky top-0">
                  <tr>
                    {visibleColumns.map((col) => (
                      <th key={col.key} className="px-3 py-2.5 text-left whitespace-nowrap font-semibold">
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50/50">
                      {visibleColumns.map((col) => {
                        const val = c[col.key];
                        // Special rendering for some columns
                        if (col.key === "linkedin" && val) {
                          return (
                            <td key={col.key} className="px-3 py-2">
                              <a href={String(val)} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800">
                                <Linkedin className="w-3.5 h-3.5" />
                              </a>
                            </td>
                          );
                        }
                        if (col.key === "enriched") {
                          return (
                            <td key={col.key} className="px-3 py-2">
                              {val ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-green-100 text-green-700">Oui</span>
                              ) : (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-gray-100 text-gray-500">Non</span>
                              )}
                            </td>
                          );
                        }
                        if (col.key === "email" && val) {
                          return (
                            <td key={col.key} className="px-3 py-2 text-gray-600 max-w-[200px] truncate">
                              {String(val)}
                            </td>
                          );
                        }
                        return (
                          <td key={col.key} className="px-3 py-2 text-gray-700 max-w-[180px] truncate">
                            {val ? String(val) : <span className="text-gray-300">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={visibleColumns.length} className="px-4 py-8 text-center text-gray-400 text-sm">
                        {search ? "Aucun résultat" : "Aucun contact dans cette liste"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Preview table for CSV before import */}
      {parsedRows && parsedRows.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">
              Prévisualisation — {parsedRows.length} contact{parsedRows.length > 1 ? "s" : ""}
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500 text-[10px] uppercase">
                <tr>
                  {EXPECTED_CSV_COLUMNS.map((col) => (
                    <th key={col} className="px-3 py-2.5 text-left">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {parsedRows.slice(0, 20).map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    {EXPECTED_CSV_COLUMNS.map((col) => (
                      <td key={col} className="px-3 py-2 text-gray-700 max-w-[180px] truncate">
                        {row[col] || <span className="text-gray-300">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
                {parsedRows.length > 20 && (
                  <tr>
                    <td colSpan={EXPECTED_CSV_COLUMNS.length} className="px-4 py-2 text-center text-gray-400 text-[10px]">
                      ... et {parsedRows.length - 20} de plus
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
