"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Search,
  Users,
  Download,
  Loader2,
  Pencil,
  Check,
  X,
  Filter,
  Upload,
  Plus,
  Briefcase,
  ExternalLink,
  Archive,
  Star,
  Sparkles,
  Linkedin,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Prospect {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  poste: string;
  entreprise: string;
  statut: string;
  pipelines: string;
  notes: string;
  score_entreprise: string;
  score_job: string;
  linkedin: string;
  naf_code: string;
  effectifs: string;
  deal_id: number | null;
  deal_title: string | null;
  deal_status: string | null;
  deal_value: number | null;
  computed_statut: string;
}

type StatusKey = "en cours" | "perdu" | "archivé";

function ScoreStars({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return (
    <div className="flex items-center gap-px">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange?.(n === value ? 0 : n)}
          disabled={!onChange}
          className={cn(
            "p-0 cursor-pointer disabled:cursor-default transition-colors",
            n <= value ? "text-amber-400" : "text-gray-200",
            onChange && "hover:text-amber-500"
          )}
        >
          <Star className="w-3.5 h-3.5" fill={n <= value ? "currentColor" : "none"} />
        </button>
      ))}
    </div>
  );
}

function StatusBadge({ statut }: { statut: string }) {
  const cls =
    statut === "en cours"
      ? "bg-green-100 text-green-700"
      : statut === "archivé"
        ? "bg-gray-100 text-gray-500"
        : "bg-red-100 text-red-700";
  const label =
    statut === "en cours" ? "En cours" : statut === "archivé" ? "Archivé" : "Perdu";
  return (
    <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold whitespace-nowrap", cls)}>
      {label}
    </span>
  );
}

export default function ProspectsPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilters, setStatusFilters] = useState<Set<StatusKey>>(new Set(["en cours", "perdu"]));
  const [pipelineFilter, setPipelineFilter] = useState<string>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Prospect>>({});
  const [saving, setSaving] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [newDealTitle, setNewDealTitle] = useState("");
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [archiving, setArchiving] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchProspects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/prospects");
      const json = await res.json();
      if (json.data) setProspects(json.data);
    } catch (err) {
      console.error("Erreur chargement prospects:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProspects();
  }, [fetchProspects]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/prospects/upload", { method: "POST", body: formData });
      const json = await res.json();
      if (json.data) {
        fetchProspects();
      } else {
        alert("Erreur lors de l'import : " + (json.error || "inconnue"));
      }
    } catch (err) {
      console.error("Erreur upload:", err);
      alert("Erreur lors de l'import du fichier");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const startEdit = (p: Prospect) => {
    setEditingId(p.id);
    setEditData({
      nom: p.nom,
      prenom: p.prenom,
      email: p.email,
      telephone: p.telephone,
      poste: p.poste,
      entreprise: p.entreprise,
      score_entreprise: p.score_entreprise || "0",
      score_job: p.score_job || "0",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData({});
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/prospects", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, ...editData }),
      });
      const json = await res.json();
      if (json.data) {
        fetchProspects();
      }
      setEditingId(null);
      setEditData({});
    } catch (err) {
      console.error("Erreur sauvegarde:", err);
    } finally {
      setSaving(false);
    }
  };

  const archiveProspect = async (prospectId: string) => {
    try {
      const res = await fetch("/api/prospects", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: prospectId, statut: "archivé" }),
      });
      const json = await res.json();
      if (json.data) {
        fetchProspects();
        setActionMsg("Prospect archivé");
        setTimeout(() => setActionMsg(null), 2000);
      }
    } catch {
      setActionMsg("Erreur lors de l'archivage");
      setTimeout(() => setActionMsg(null), 3000);
    }
  };

  const bulkArchive = async () => {
    if (selected.size === 0) return;
    setArchiving(true);
    try {
      const res = await fetch("/api/prospects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected), statut: "archivé" }),
      });
      const json = await res.json();
      if (json.success) {
        setActionMsg(`${json.updated} prospect${json.updated > 1 ? "s" : ""} archivé${json.updated > 1 ? "s" : ""}`);
        setSelected(new Set());
        fetchProspects();
      } else {
        setActionMsg(`Erreur : ${json.error}`);
      }
    } catch {
      setActionMsg("Erreur lors de l'archivage groupé");
    }
    setTimeout(() => setActionMsg(null), 3000);
    setArchiving(false);
  };

  const enrichProspects = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Enrichir ${selected.size} contact${selected.size > 1 ? "s" : ""} via Dropcontact ?\nCela consommera des crédits API.`)) return;
    setEnriching(true);
    setActionMsg("Envoi à Dropcontact...");
    try {
      // Step 1: Submit batch
      const submitRes = await fetch("/api/prospects/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      const submitJson = await submitRes.json();

      if (!submitJson.submitted) {
        setActionMsg(`Erreur : ${submitJson.error}`);
        setTimeout(() => setActionMsg(null), 5000);
        setEnriching(false);
        return;
      }

      const { requestId, prospectIds } = submitJson;
      setActionMsg(`Dropcontact traite ${submitJson.count} contacts...`);

      // Step 2: Poll for results (every 5s, max 2 min)
      for (let attempt = 0; attempt < 24; attempt++) {
        await new Promise((r) => setTimeout(r, 5000));
        setActionMsg(`Enrichissement en cours... (${(attempt + 1) * 5}s)`);

        const pollRes = await fetch(
          `/api/prospects/enrich?requestId=${encodeURIComponent(requestId)}&ids=${prospectIds.join(",")}`
        );
        const pollJson = await pollRes.json();

        if (pollJson.done) {
          if (pollJson.error) {
            setActionMsg(`Erreur Dropcontact : ${pollJson.error}`);
          } else {
            const details = (pollJson.results || [])
              .filter((r: { status: string; fields?: string[] }) => r.status === "enriched")
              .map((r: { name: string; fields?: string[] }) => `${r.name}: ${(r.fields || []).join(", ")}`)
              .join(" | ");
            setActionMsg(`${pollJson.enriched}/${pollJson.total} enrichi${pollJson.enriched > 1 ? "s" : ""}${details ? ` — ${details}` : ""}`);
            setSelected(new Set());
            fetchProspects();
          }
          setTimeout(() => setActionMsg(null), 8000);
          setEnriching(false);
          return;
        }
      }

      // Timeout
      setActionMsg("Timeout — Dropcontact n'a pas répondu en 2 min");
      setTimeout(() => setActionMsg(null), 5000);
    } catch (err) {
      console.error("Enrichissement error:", err);
      setActionMsg("Erreur lors de l'enrichissement");
      setTimeout(() => setActionMsg(null), 5000);
    }
    setEnriching(false);
  };

  const createDealForProspect = async (prospectId: string) => {
    const title = newDealTitle.trim();
    if (!title) return;
    setActionMsg("Création de l'affaire...");
    try {
      const res = await fetch("/api/prospects/link-deal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectId, dealTitle: title }),
      });
      const json = await res.json();
      if (json.success) {
        setActionMsg(`Affaire "${json.deal.title}" créée`);
        setLinkingId(null);
        setNewDealTitle("");
        fetchProspects();
      } else {
        setActionMsg(`Erreur : ${json.error}`);
      }
    } catch {
      setActionMsg("Erreur lors de la création");
    }
    setTimeout(() => setActionMsg(null), 3000);
  };

  const downloadCsv = () => {
    window.open("/api/prospects/download", "_blank");
  };

  const toggleStatusFilter = (s: StatusKey) => {
    setStatusFilters((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Get unique pipelines for filter
  const pipelineOptions = useMemo(() => {
    const all = new Set<string>();
    for (const p of prospects) {
      if (p.pipelines) {
        p.pipelines.split(", ").forEach((pl) => all.add(pl));
      }
    }
    return Array.from(all).sort();
  }, [prospects]);

  // Filtered and searched prospects
  const filtered = useMemo(() => {
    return prospects.filter((p) => {
      const statut = p.computed_statut || p.statut;
      if (statusFilters.size > 0 && !statusFilters.has(statut as StatusKey)) return false;
      if (pipelineFilter !== "all" && !p.pipelines?.includes(pipelineFilter)) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          (p.nom || "").toLowerCase().includes(q) ||
          (p.prenom || "").toLowerCase().includes(q) ||
          (p.email || "").toLowerCase().includes(q) ||
          (p.entreprise || "").toLowerCase().includes(q) ||
          (p.poste || "").toLowerCase().includes(q) ||
          (p.telephone || "").includes(q) ||
          (p.deal_title || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [prospects, search, statusFilters, pipelineFilter]);

  const enCoursCount = prospects.filter((p) => (p.computed_statut || p.statut) === "en cours").length;
  const perduCount = prospects.filter((p) => (p.computed_statut || p.statut) === "perdu").length;
  const archivedCount = prospects.filter((p) => (p.computed_statut || p.statut) === "archivé").length;

  const allFilteredSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id));
  const someFilteredSelected = filtered.some((p) => selected.has(p.id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((p) => p.id)));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Users className="w-7 h-7 text-indigo-600" />
            Prospects
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {prospects.length} contacts — {enCoursCount} en cours, {perduCount} perdus, {archivedCount} archivés
          </p>
        </div>
        <div className="flex items-center gap-2">
          {actionMsg && (
            <span className="text-xs font-medium px-2 py-1 rounded bg-green-50 text-green-700">{actionMsg}</span>
          )}
          {selected.size > 0 && (
            <>
              <button
                onClick={enrichProspects}
                disabled={enriching}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 disabled:opacity-50 cursor-pointer"
              >
                {enriching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Enrichir ({selected.size})
              </button>
              <button
                onClick={bulkArchive}
                disabled={archiving}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 disabled:opacity-50 cursor-pointer"
              >
                {archiving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
                Archiver ({selected.size})
              </button>
            </>
          )}
          <button
            onClick={downloadCsv}
            disabled={prospects.length === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            CSV
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 cursor-pointer shadow-sm"
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            {uploading ? "Import..." : "Importer CSV"}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 bg-white rounded-lg border border-gray-200 p-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom, email, entreprise, affaire..."
            className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 outline-none"
          />
        </div>
        <div className="flex items-center gap-3">
          <Filter className="w-4 h-4 text-gray-400" />
          <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={statusFilters.has("en cours")}
              onChange={() => toggleStatusFilter("en cours")}
              className="rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer"
            />
            <span className="text-green-700 font-medium">En cours ({enCoursCount})</span>
          </label>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={statusFilters.has("perdu")}
              onChange={() => toggleStatusFilter("perdu")}
              className="rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer"
            />
            <span className="text-red-700 font-medium">Perdu ({perduCount})</span>
          </label>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={statusFilters.has("archivé")}
              onChange={() => toggleStatusFilter("archivé")}
              className="rounded border-gray-300 text-gray-500 focus:ring-gray-400 cursor-pointer"
            />
            <span className="text-gray-500 font-medium">Archivé ({archivedCount})</span>
          </label>
          <select
            value={pipelineFilter}
            onChange={(e) => setPipelineFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-400 outline-none"
          >
            <option value="all">Tous les pipelines</option>
            {pipelineOptions.map((pl) => (
              <option key={pl} value={pl}>{pl}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : prospects.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-lg border border-gray-200">
          <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p className="text-lg font-medium text-gray-600">Aucun prospect</p>
          <p className="text-sm text-gray-400 mt-1">Cliquez sur &quot;Importer CSV&quot; pour charger vos contacts.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-center pl-3 pr-0 py-2.5 w-[36px]">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      ref={(el) => { if (el) el.indeterminate = someFilteredSelected && !allFilteredSelected; }}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                  </th>
                  <th className="text-left px-1 py-2.5 font-semibold text-gray-600 text-[10px] uppercase tracking-wide w-[72px]">Prénom</th>
                  <th className="text-left px-1 py-2.5 font-semibold text-gray-600 text-[10px] uppercase tracking-wide w-[72px]">Nom</th>
                  <th className="text-left px-1 py-2.5 font-semibold text-gray-600 text-[10px] uppercase tracking-wide w-[160px]">Email</th>
                  <th className="text-left px-1 py-2.5 font-semibold text-gray-600 text-[10px] uppercase tracking-wide w-[90px]">Tél.</th>
                  <th className="text-left px-1 py-2.5 font-semibold text-gray-600 text-[10px] uppercase tracking-wide w-[90px]">Poste</th>
                  <th className="text-left px-1 py-2.5 font-semibold text-gray-600 text-[10px] uppercase tracking-wide w-[100px]">Entreprise</th>
                  <th className="text-left px-1 py-2.5 font-semibold text-gray-600 text-[10px] uppercase tracking-wide w-[62px]">Statut</th>
                  <th className="text-left px-1 py-2.5 font-semibold text-gray-600 text-[10px] uppercase tracking-wide w-[120px]">Affaire</th>
                  <th className="text-center px-1 py-2.5 font-semibold text-gray-600 text-[10px] uppercase tracking-wide w-[80px]">Score Ent.</th>
                  <th className="text-center px-1 py-2.5 font-semibold text-gray-600 text-[10px] uppercase tracking-wide w-[80px]">Score Job</th>
                  <th className="text-center px-1 py-2.5 font-semibold text-gray-600 text-[10px] uppercase tracking-wide w-[30px]" title="LinkedIn"><Linkedin className="w-3 h-3 mx-auto text-gray-500" /></th>
                  <th className="text-left px-1 py-2.5 font-semibold text-gray-600 text-[10px] uppercase tracking-wide w-[70px]">NAF</th>
                  <th className="text-left px-1 py-2.5 font-semibold text-gray-600 text-[10px] uppercase tracking-wide w-[55px]">Eff.</th>
                  <th className="text-center pr-3 pl-1 py-2.5 font-semibold text-gray-600 text-[10px] uppercase tracking-wide w-[60px]"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((p) => {
                  const isEditing = editingId === p.id;
                  const isLinking = linkingId === p.id;
                  const statut = p.computed_statut || p.statut;
                  const scoreEnt = parseInt(p.score_entreprise) || 0;
                  const scoreJob = parseInt(p.score_job) || 0;
                  const isSelected = selected.has(p.id);
                  const isArchived = statut === "archivé";
                  return (
                    <tr key={p.id} className={cn("group hover:bg-gray-50 transition-colors", isEditing && "bg-blue-50", isSelected && "bg-indigo-50/50", isArchived && "opacity-60")}>
                      <td className="text-center pl-3 pr-0 py-1.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(p.id)}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </td>
                      <td className="px-1 py-1.5 truncate">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editData.prenom || ""}
                            onChange={(e) => setEditData({ ...editData, prenom: e.target.value })}
                            className="w-full px-1 py-0.5 text-[11px] border border-gray-300 rounded focus:ring-1 focus:ring-indigo-400 outline-none"
                          />
                        ) : (
                          <span className="font-medium text-gray-900 text-[11px]">{p.prenom}</span>
                        )}
                      </td>
                      <td className="px-1 py-1.5 truncate">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editData.nom || ""}
                            onChange={(e) => setEditData({ ...editData, nom: e.target.value })}
                            className="w-full px-1 py-0.5 text-[11px] border border-gray-300 rounded focus:ring-1 focus:ring-indigo-400 outline-none"
                          />
                        ) : (
                          <span className="text-gray-700 text-[11px]">{p.nom}</span>
                        )}
                      </td>
                      <td className="px-1 py-1.5 truncate">
                        {isEditing ? (
                          <input
                            type="email"
                            value={editData.email || ""}
                            onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                            className="w-full px-1 py-0.5 text-[11px] border border-gray-300 rounded focus:ring-1 focus:ring-indigo-400 outline-none"
                          />
                        ) : (
                          <span className="text-gray-600 text-[10px]" title={p.email}>{p.email}</span>
                        )}
                      </td>
                      <td className="px-1 py-1.5 truncate">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editData.telephone || ""}
                            onChange={(e) => setEditData({ ...editData, telephone: e.target.value })}
                            className="w-full px-1 py-0.5 text-[11px] border border-gray-300 rounded focus:ring-1 focus:ring-indigo-400 outline-none"
                          />
                        ) : (
                          <span className="text-gray-600 text-[10px]">{p.telephone}</span>
                        )}
                      </td>
                      <td className="px-1 py-1.5 truncate">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editData.poste || ""}
                            onChange={(e) => setEditData({ ...editData, poste: e.target.value })}
                            className="w-full px-1 py-0.5 text-[11px] border border-gray-300 rounded focus:ring-1 focus:ring-indigo-400 outline-none"
                          />
                        ) : (
                          <span className="text-gray-600 text-[10px]" title={p.poste}>{p.poste}</span>
                        )}
                      </td>
                      <td className="px-1 py-1.5 truncate">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editData.entreprise || ""}
                            onChange={(e) => setEditData({ ...editData, entreprise: e.target.value })}
                            className="w-full px-1 py-0.5 text-[11px] border border-gray-300 rounded focus:ring-1 focus:ring-indigo-400 outline-none"
                          />
                        ) : (
                          <span className="text-gray-700 text-[10px] font-medium" title={p.entreprise}>{p.entreprise}</span>
                        )}
                      </td>
                      <td className="px-1 py-1.5">
                        <StatusBadge statut={statut} />
                      </td>
                      <td className="px-1 py-1.5">
                        {p.deal_id ? (
                          <Link
                            href={`/deal/${p.deal_id}`}
                            className="inline-flex items-center gap-0.5 text-[10px] text-indigo-600 hover:text-indigo-800 font-medium truncate max-w-full"
                            title={p.deal_title || ""}
                          >
                            <Briefcase className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{p.deal_title}</span>
                            <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                          </Link>
                        ) : isLinking ? (
                          <div className="flex items-center gap-0.5">
                            <input
                              type="text"
                              value={newDealTitle}
                              onChange={(e) => setNewDealTitle(e.target.value)}
                              placeholder="Nom affaire"
                              className="w-20 px-1 py-0.5 text-[10px] border border-gray-300 rounded focus:ring-1 focus:ring-indigo-400 outline-none"
                              autoFocus
                              onKeyDown={(e) => { if (e.key === "Enter") createDealForProspect(p.id); if (e.key === "Escape") { setLinkingId(null); setNewDealTitle(""); } }}
                            />
                            <button onClick={() => createDealForProspect(p.id)} disabled={!newDealTitle.trim()} className="p-0.5 text-green-600 hover:text-green-700 cursor-pointer disabled:opacity-40"><Check className="w-3 h-3" /></button>
                            <button onClick={() => { setLinkingId(null); setNewDealTitle(""); }} className="p-0.5 text-gray-400 hover:text-gray-600 cursor-pointer"><X className="w-3 h-3" /></button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setLinkingId(p.id); setNewDealTitle(p.entreprise || `${p.prenom} ${p.nom}`); }}
                            className="inline-flex items-center gap-0.5 text-[10px] text-gray-400 hover:text-indigo-600 cursor-pointer transition-colors"
                            title="Créer une affaire"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Créer</span>
                          </button>
                        )}
                      </td>
                      <td className="px-1 py-1.5 text-center">
                        {isEditing ? (
                          <ScoreStars
                            value={parseInt(editData.score_entreprise || "0") || 0}
                            onChange={(v) => setEditData({ ...editData, score_entreprise: String(v) })}
                          />
                        ) : (
                          <ScoreStars value={scoreEnt} />
                        )}
                      </td>
                      <td className="px-1 py-1.5 text-center">
                        {isEditing ? (
                          <ScoreStars
                            value={parseInt(editData.score_job || "0") || 0}
                            onChange={(v) => setEditData({ ...editData, score_job: String(v) })}
                          />
                        ) : (
                          <ScoreStars value={scoreJob} />
                        )}
                      </td>
                      <td className="px-1 py-1.5 text-center">
                        {p.linkedin ? (
                          <a href={p.linkedin} target="_blank" rel="noopener noreferrer" className="text-[#0077B5] hover:text-[#005885]" title={p.linkedin}>
                            <Linkedin className="w-3.5 h-3.5 mx-auto" />
                          </a>
                        ) : (
                          <span className="text-gray-200"><Linkedin className="w-3.5 h-3.5 mx-auto" /></span>
                        )}
                      </td>
                      <td className="px-1 py-1.5 truncate">
                        <span className="text-gray-600 text-[9px]" title={p.naf_code}>{p.naf_code}</span>
                      </td>
                      <td className="px-1 py-1.5 truncate">
                        <span className="text-gray-600 text-[9px]">{p.effectifs}</span>
                      </td>
                      <td className="pr-3 pl-1 py-1.5 text-center">
                        {isEditing ? (
                          <div className="flex items-center gap-0.5 justify-center">
                            <button onClick={saveEdit} disabled={saving} className="p-0.5 text-green-600 hover:text-green-700 cursor-pointer disabled:opacity-40">
                              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            </button>
                            <button onClick={cancelEdit} className="p-0.5 text-gray-400 hover:text-gray-600 cursor-pointer">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-0.5 justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => startEdit(p)}
                              className="p-0.5 text-gray-400 hover:text-indigo-600 cursor-pointer"
                              title="Modifier"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            {!isArchived && (
                              <button
                                onClick={() => archiveProspect(p.id)}
                                className="p-0.5 text-gray-400 hover:text-orange-500 cursor-pointer"
                                title="Archiver"
                              >
                                <Archive className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 bg-gray-50 border-t border-gray-200 text-[10px] text-gray-500 flex items-center justify-between">
            <span>{filtered.length} résultat{filtered.length !== 1 ? "s" : ""} sur {prospects.length} contacts</span>
            {selected.size > 0 && <span className="font-medium text-indigo-600">{selected.size} sélectionné{selected.size > 1 ? "s" : ""}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
