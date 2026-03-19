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
  Sparkles,
  Linkedin,
  Link2,
  Eye,
  EyeOff,
  ChevronDown,
  List,
  Trash2,
  FolderOpen,
  Building2,
  Bot,
  MessageSquareText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import NewProspectModal from "@/components/NewProspectModal";
import { useResizableColumns } from "@/hooks/useResizableColumns";

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
  list_id?: string;
  ai_score?: string;
  ai_comment?: string;
  resume_entreprise?: string;
  siren?: string;
  siret?: string;
  adresse_siege?: string;
  categorie_entreprise?: string;
  chiffre_affaires?: string;
  resultat_net?: string;
  date_creation_entreprise?: string;
  dirigeants?: string;
  ville?: string;
  deal_id: number | null;
  deal_title: string | null;
  deal_status: string | null;
  deal_value: number | null;
  computed_statut: string;
}

interface ProspectList {
  id: string;
  name: string;
  company: string;
  created_at: string;
  count: number;
}

type StatusKey = "en cours" | "perdu" | "archivé";

// Column definitions for visibility toggle + resizable widths
const PROSPECT_COLUMNS = [
  { key: "prenom", label: "Prénom", defaultVisible: true, defaultWidth: 90, minWidth: 50 },
  { key: "nom", label: "Nom", defaultVisible: true, defaultWidth: 90, minWidth: 50 },
  { key: "email", label: "Email", defaultVisible: true, defaultWidth: 180, minWidth: 80 },
  { key: "telephone", label: "Tél.", defaultVisible: true, defaultWidth: 100, minWidth: 50 },
  { key: "poste", label: "Poste", defaultVisible: true, defaultWidth: 110, minWidth: 50 },
  { key: "entreprise", label: "Entreprise", defaultVisible: true, defaultWidth: 120, minWidth: 60 },
  { key: "statut", label: "Statut", defaultVisible: true, defaultWidth: 70, minWidth: 50 },
  { key: "affaire", label: "Affaire", defaultVisible: true, defaultWidth: 130, minWidth: 60 },
  { key: "score_entreprise", label: "Score Ent.", defaultVisible: true, defaultWidth: 65, minWidth: 45 },
  { key: "score_job", label: "Score Job", defaultVisible: true, defaultWidth: 65, minWidth: 45 },
  { key: "linkedin", label: "LinkedIn", defaultVisible: true, defaultWidth: 36, minWidth: 30 },
  { key: "naf_code", label: "NAF", defaultVisible: true, defaultWidth: 65, minWidth: 35 },
  { key: "effectifs", label: "Eff.", defaultVisible: true, defaultWidth: 55, minWidth: 35 },
  { key: "ville", label: "Ville", defaultVisible: false, defaultWidth: 90, minWidth: 50 },
  { key: "siren", label: "SIREN", defaultVisible: false, defaultWidth: 85, minWidth: 60 },
  { key: "categorie_entreprise", label: "Cat.", defaultVisible: false, defaultWidth: 55, minWidth: 40 },
  { key: "chiffre_affaires", label: "CA", defaultVisible: false, defaultWidth: 80, minWidth: 50 },
  { key: "resultat_net", label: "Résultat", defaultVisible: false, defaultWidth: 80, minWidth: 50 },
  { key: "dirigeants", label: "Dirigeants", defaultVisible: false, defaultWidth: 160, minWidth: 80 },
  { key: "date_creation_entreprise", label: "Création", defaultVisible: false, defaultWidth: 80, minWidth: 50 },
  { key: "resume_entreprise", label: "Résumé Ent.", defaultVisible: false, defaultWidth: 160, minWidth: 80 },
  { key: "ai_score", label: "Score IA", defaultVisible: false, defaultWidth: 60, minWidth: 45 },
  { key: "ai_comment", label: "Analyse IA", defaultVisible: false, defaultWidth: 180, minWidth: 80 },
] as const;

function ScoreNumber({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  const colors = [
    "bg-gray-100 text-gray-400",   // 0
    "bg-red-100 text-red-700",     // 1
    "bg-orange-100 text-orange-700", // 2
    "bg-yellow-100 text-yellow-700", // 3
    "bg-lime-100 text-lime-700",   // 4
    "bg-green-100 text-green-700", // 5
  ];
  if (!onChange) {
    return (
      <span className={cn("inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold", colors[value] || colors[0])}>
        {value || "-"}
      </span>
    );
  }
  return (
    <input
      type="number"
      min={0}
      max={5}
      value={value}
      onChange={(e) => {
        const v = Math.max(0, Math.min(5, parseInt(e.target.value) || 0));
        onChange(v);
      }}
      className="w-10 px-1 py-0.5 text-[11px] text-center border border-gray-300 rounded focus:ring-1 focus:ring-indigo-400 outline-none"
    />
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Prospect>>({});
  const [saving, setSaving] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [newDealTitle, setNewDealTitle] = useState("");
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [archiving, setArchiving] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichingGouv, setEnrichingGouv] = useState(false);
  const [scoringAI, setScoringAI] = useState(false);
  const [showLinkDeal, setShowLinkDeal] = useState(false);
  const [allDeals, setAllDeals] = useState<{ id: number; title: string; person_name?: string; org_name?: string }[]>([]);
  const [dealSearch, setDealSearch] = useState("");
  const [showNewProspect, setShowNewProspect] = useState(false);
  const [linking, setLinking] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Lists panel
  const [lists, setLists] = useState<ProspectList[]>([]);
  const [loadingLists, setLoadingLists] = useState(true);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadListName, setUploadListName] = useState("");
  const [uploadListCompany, setUploadListCompany] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [showListPanel, setShowListPanel] = useState(true);
  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    new Set(PROSPECT_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key))
  );
  const [showColPicker, setShowColPicker] = useState(false);
  const colVisible = (key: string) => visibleCols.has(key);
  const { widths: colWidths, onMouseDown: onColResize } = useResizableColumns(
    PROSPECT_COLUMNS.map((c) => ({ key: c.key, minWidth: c.minWidth, defaultWidth: c.defaultWidth }))
  );

  const fetchProspects = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/prospects");
      const json = await res.json();
      if (json.data) setProspects(json.data);
    } catch (err) {
      console.error("Erreur chargement prospects:", err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const syncProspects = useCallback(() => fetchProspects(true), [fetchProspects]);

  const fetchLists = useCallback(async () => {
    try {
      const res = await fetch("/api/prospects/lists");
      const json = await res.json();
      if (json.data) setLists(json.data);
    } catch (err) {
      console.error("Erreur chargement listes:", err);
    } finally {
      setLoadingLists(false);
    }
  }, []);

  useEffect(() => {
    fetchProspects();
    fetchLists();
  }, [fetchProspects, fetchLists]);

  const handleUploadWithList = async () => {
    if (!uploadFile || !uploadListName.trim() || !uploadListCompany.trim()) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("list_name", uploadListName.trim());
      formData.append("list_company", uploadListCompany.trim());
      const res = await fetch("/api/prospects/upload", { method: "POST", body: formData });
      const json = await res.json();
      if (json.success) {
        const dupMsg = json.skippedDuplicates ? ` (${json.skippedDuplicates} doublons ignorés)` : "";
        setActionMsg(`${json.count} contacts importés dans "${uploadListName.trim()}"${dupMsg}`);
        setTimeout(() => setActionMsg(null), 5000);
        setShowUploadModal(false);
        setUploadFile(null);
        setUploadListName("");
        setUploadListCompany("");
        syncProspects();
        fetchLists();
        if (json.list_id) setSelectedListId(json.list_id);
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

  const deleteList = async (listId: string) => {
    if (!confirm("Supprimer cette liste et tous ses contacts ?")) return;
    try {
      await fetch(`/api/prospects/lists?id=${listId}`, { method: "DELETE" });
      if (selectedListId === listId) setSelectedListId(null);
      fetchLists();
      syncProspects();
      setActionMsg("Liste supprimée");
      setTimeout(() => setActionMsg(null), 3000);
    } catch {
      alert("Erreur lors de la suppression");
    }
  };

  const dedupProspects = async () => {
    if (!confirm("Supprimer les doublons (même email) ? Les premiers occurrences sont conservées.")) return;
    setActionMsg("Dédoublonnage en cours...");
    try {
      const res = await fetch("/api/prospects/dedup", { method: "POST" });
      const json = await res.json();
      if (json.success) {
        setActionMsg(`${json.removed} doublons supprimés (${json.after} contacts restants)`);
        syncProspects();
      } else {
        setActionMsg("Erreur: " + (json.error || "inconnue"));
      }
    } catch { setActionMsg("Erreur réseau"); }
    setTimeout(() => setActionMsg(null), 5000);
  };

  // Unique companies from lists for dropdown
  const knownCompanies = useMemo(() => {
    const set = new Set(lists.map((l) => l.company).filter(Boolean));
    return Array.from(set).sort();
  }, [lists]);

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
    // Optimistic: update local state immediately
    setProspects((prev) => prev.map((p) => p.id === editingId ? { ...p, ...editData } : p));
    const savedId = editingId;
    setEditingId(null);
    setEditData({});
    try {
      await fetch("/api/prospects", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: savedId, ...editData }),
      });
      syncProspects();
    } catch (err) {
      console.error("Erreur sauvegarde:", err);
      syncProspects();
    } finally {
      setSaving(false);
    }
  };

  const archiveProspect = async (prospectId: string) => {
    // Optimistic: update local state immediately
    setProspects((prev) => prev.map((p) => p.id === prospectId ? { ...p, statut: "archivé", computed_statut: "archivé" } : p));
    setActionMsg("Prospect archivé");
    setTimeout(() => setActionMsg(null), 2000);
    try {
      await fetch("/api/prospects", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: prospectId, statut: "archivé" }),
      });
      syncProspects();
    } catch {
      setActionMsg("Erreur lors de l'archivage");
      setTimeout(() => setActionMsg(null), 3000);
      syncProspects();
    }
  };

  const bulkArchive = async () => {
    if (selected.size === 0) return;
    setArchiving(true);
    const count = selected.size;
    // Optimistic: update local state immediately
    setProspects((prev) => prev.map((p) => selected.has(p.id) ? { ...p, statut: "archivé", computed_statut: "archivé" } : p));
    setActionMsg(`${count} prospect${count > 1 ? "s" : ""} archivé${count > 1 ? "s" : ""}`);
    setSelected(new Set());
    try {
      const res = await fetch("/api/prospects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected), statut: "archivé" }),
      });
      const json = await res.json();
      if (json.success) {
        syncProspects();
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
            console.log("[Enrichissement] Résultats complets:", JSON.stringify(pollJson.results, null, 2));
            const details = (pollJson.results || [])
              .filter((r: { status: string; fields?: string[] }) => r.status === "enriched")
              .map((r: { name: string; fields?: string[] }) => `${r.name}: ${(r.fields || []).join(", ")}`)
              .join(" | ");
            setActionMsg(`${pollJson.enriched}/${pollJson.total} enrichi${pollJson.enriched > 1 ? "s" : ""}${details ? ` — ${details}` : ""}`);
            setSelected(new Set());
            syncProspects();
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

  const aiScoreProspects = async () => {
    if (selected.size === 0) return;
    if (selected.size > 30) { setActionMsg("Maximum 30 contacts pour l'analyse IA"); setTimeout(() => setActionMsg(null), 3000); return; }
    setScoringAI(true);
    setActionMsg("Analyse IA en cours...");
    try {
      const res = await fetch("/api/prospects/ai-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      const json = await res.json();
      if (json.success) {
        setActionMsg(`${json.scored}/${json.total} prospects analysés par l'IA`);
        setSelected(new Set());
        syncProspects();
      } else {
        setActionMsg(`Erreur : ${json.error}`);
      }
    } catch (err) {
      console.error("AI Score error:", err);
      setActionMsg("Erreur lors de l'analyse IA");
    }
    setTimeout(() => setActionMsg(null), 6000);
    setScoringAI(false);
  };

  const enrichGouvProspects = async () => {
    if (selected.size === 0) return;
    setEnrichingGouv(true);
    setActionMsg("Recherche entreprises (API Gouv)...");
    try {
      const res = await fetch("/api/prospects/enrich-gouv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      const json = await res.json();
      if (json.success) {
        const details = (json.results || [])
          .filter((r: { status: string }) => r.status === "enriched")
          .map((r: { company: string; fields: string[] }) => `${r.company}: ${r.fields.join(", ")}`)
          .slice(0, 5)
          .join(" | ");
        setActionMsg(`${json.enriched}/${json.total} enrichi${json.enriched > 1 ? "s" : ""} (${json.companiesSearched} entreprises)${details ? ` — ${details}` : ""}`);
        setSelected(new Set());
        syncProspects();
      } else {
        setActionMsg(`Erreur : ${json.error}`);
      }
    } catch (err) {
      console.error("Enrichissement Gouv error:", err);
      setActionMsg("Erreur lors de l'enrichissement API Gouv");
    }
    setTimeout(() => setActionMsg(null), 8000);
    setEnrichingGouv(false);
  };

  const openLinkDeal = async () => {
    setShowLinkDeal(true);
    setDealSearch("");
    // Fetch deals if not already loaded
    if (allDeals.length === 0) {
      try {
        const res = await fetch("/api/deals?status=open");
        const json = await res.json();
        if (json.data) setAllDeals(json.data);
      } catch (err) {
        console.error("Erreur chargement affaires:", err);
      }
    }
  };

  const linkSelectedToDeal = async (dealId: number, dealTitle: string) => {
    const selectedIds = new Set(selected);
    // Optimistic: update local state immediately
    setProspects((prev) => prev.map((p) =>
      selectedIds.has(p.id) ? { ...p, deal_id: dealId, deal_title: dealTitle, computed_statut: "en cours" } : p
    ));
    setActionMsg(`${selectedIds.size} contact${selectedIds.size > 1 ? "s" : ""} lié${selectedIds.size > 1 ? "s" : ""} à "${dealTitle}"`);
    setSelected(new Set());
    setShowLinkDeal(false);
    setLinking(true);
    try {
      for (const prospectId of selectedIds) {
        await fetch("/api/prospects/link-deal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prospectId, dealId }),
        });
      }
    } catch {
      setActionMsg("Erreur lors de la liaison");
    }
    setLinking(false);
    setTimeout(() => setActionMsg(null), 4000);
    setTimeout(syncProspects, 2000);
  };

  const filteredDeals = useMemo(() => {
    if (!dealSearch) return allDeals.slice(0, 20);
    const q = dealSearch.toLowerCase();
    return allDeals.filter(
      (d) => d.title?.toLowerCase().includes(q) || d.person_name?.toLowerCase().includes(q) || d.org_name?.toLowerCase().includes(q)
    ).slice(0, 20);
  }, [allDeals, dealSearch]);

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
        syncProspects();
      } else {
        setActionMsg(`Erreur : ${json.error}`);
      }
    } catch {
      setActionMsg("Erreur lors de la création");
    }
    setTimeout(() => setActionMsg(null), 3000);
  };

  const downloadCsv = () => {
    const params = new URLSearchParams();
    if (selected.size > 0) {
      params.set("ids", Array.from(selected).join(","));
    } else if (selectedListId) {
      params.set("list_id", selectedListId);
    }
    const qs = params.toString();
    window.open(`/api/prospects/download${qs ? `?${qs}` : ""}`, "_blank");
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


  // Filtered and searched prospects
  const filtered = useMemo(() => {
    return prospects.filter((p) => {
      // Filter by selected list
      if (selectedListId && p.list_id !== selectedListId) return false;
      const statut = p.computed_statut || p.statut;
      if (statusFilters.size > 0 && !statusFilters.has(statut as StatusKey)) return false;
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
  }, [prospects, search, statusFilters, selectedListId]);

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
              <div className="relative">
                <button
                  onClick={openLinkDeal}
                  disabled={linking}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 disabled:opacity-50 cursor-pointer"
                >
                  {linking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                  Lier ({selected.size})
                </button>
                {showLinkDeal && (
                  <div className="absolute right-0 top-full mt-1 w-80 bg-white rounded-lg border border-gray-200 shadow-xl z-50 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-gray-700">Lier à une affaire existante</p>
                      <button onClick={() => setShowLinkDeal(false)} className="p-0.5 text-gray-400 hover:text-gray-600 cursor-pointer"><X className="w-3.5 h-3.5" /></button>
                    </div>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <input
                        type="text"
                        value={dealSearch}
                        onChange={(e) => setDealSearch(e.target.value)}
                        placeholder="Rechercher une affaire..."
                        className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-md focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 outline-none"
                        autoFocus
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-0.5">
                      {filteredDeals.length === 0 ? (
                        <p className="text-[10px] text-gray-400 py-2 text-center">Aucune affaire trouvée</p>
                      ) : (
                        filteredDeals.map((d) => (
                          <button
                            key={d.id}
                            onClick={() => linkSelectedToDeal(d.id, d.title)}
                            disabled={linking}
                            className="w-full text-left px-2 py-1.5 rounded-md hover:bg-indigo-50 text-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2"
                          >
                            <Briefcase className="w-3 h-3 text-indigo-500 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-800 truncate">{d.title}</p>
                              {(d.person_name || d.org_name) && (
                                <p className="text-[9px] text-gray-400 truncate">{[d.person_name, d.org_name].filter(Boolean).join(" · ")}</p>
                              )}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
              <button
                onClick={enrichProspects}
                disabled={enriching}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 disabled:opacity-50 cursor-pointer"
                title="Enrichir via Dropcontact (email, LinkedIn, tél, poste)"
              >
                {enriching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                Dropcontact ({selected.size})
              </button>
              <button
                onClick={enrichGouvProspects}
                disabled={enrichingGouv}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-50 cursor-pointer"
                title="Enrichir via API Gouv (SIREN, CA, effectifs, dirigeants — gratuit)"
              >
                {enrichingGouv ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Building2 className="w-3.5 h-3.5" />}
                API Gouv ({selected.size})
              </button>
              <button
                onClick={aiScoreProspects}
                disabled={scoringAI}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-lg hover:bg-violet-100 disabled:opacity-50 cursor-pointer"
                title="Analyse IA : score de pertinence + commentaire + résumé entreprise"
              >
                {scoringAI ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5" />}
                Score IA ({selected.size})
              </button>
              <button
                onClick={bulkArchive}
                disabled={archiving}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 disabled:opacity-50 cursor-pointer"
              >
                {archiving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />}
                Archiver ({selected.size})
              </button>
            </>
          )}
          <button
            onClick={dedupProspects}
            disabled={prospects.length === 0}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
            title="Supprimer les doublons (même email)"
          >
            <Filter className="w-3.5 h-3.5" />
            Dédoublonner
          </button>
          <button
            onClick={downloadCsv}
            disabled={prospects.length === 0}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
            title={selected.size > 0 ? `Exporter ${selected.size} sélectionné(s)` : selectedListId ? "Exporter la liste" : "Exporter tous les contacts"}
          >
            <Download className="w-3.5 h-3.5" />
            {selected.size > 0 ? `Export (${selected.size})` : "Export CSV"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) { setUploadFile(f); setShowUploadModal(true); }
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
            className="hidden"
          />
          <button
            onClick={() => setShowNewProspect(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 cursor-pointer shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            Ajouter
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 cursor-pointer shadow-sm"
          >
            {uploading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            {uploading ? "Import..." : "Importer"}
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
          <div className="ml-2 border-l border-gray-200 pl-2 relative">
            <button
              onClick={() => setShowColPicker(!showColPicker)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
            >
              {showColPicker ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              Colonnes
              <ChevronDown className="w-3 h-3" />
            </button>
            {showColPicker && (
              <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-lg border border-gray-200 shadow-xl z-50 p-2 space-y-0.5 max-h-80 overflow-y-auto">
                {PROSPECT_COLUMNS.map((col) => (
                  <label key={col.key} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={visibleCols.has(col.key)}
                      onChange={() => {
                        setVisibleCols((prev) => {
                          const next = new Set(prev);
                          if (next.has(col.key)) next.delete(col.key);
                          else next.add(col.key);
                          return next;
                        });
                      }}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-gray-700">{col.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lists panel + Table */}
      <div className="flex gap-4">
        {/* Lists sidebar */}
        {showListPanel && (
          <div className="w-56 flex-shrink-0 bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-3 py-2.5 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                <FolderOpen className="w-3.5 h-3.5 text-indigo-500" />
                Listes
              </h3>
              <button onClick={() => setShowListPanel(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer"><X className="w-3.5 h-3.5" /></button>
            </div>
            <div className="p-2 space-y-0.5 max-h-[500px] overflow-y-auto">
              {/* All contacts */}
              <button
                onClick={() => setSelectedListId(null)}
                className={cn(
                  "w-full text-left px-2.5 py-2 rounded-md text-xs transition-colors cursor-pointer flex items-center gap-2",
                  !selectedListId ? "bg-indigo-50 text-indigo-700 font-semibold" : "hover:bg-gray-50 text-gray-600"
                )}
              >
                <Users className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="flex-1 truncate">Tous les contacts</span>
                <span className="text-[9px] text-gray-400">{prospects.length}</span>
              </button>

              {loadingLists ? (
                <div className="flex items-center justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-gray-300" /></div>
              ) : lists.length === 0 ? (
                <p className="text-[10px] text-gray-400 px-2.5 py-3 text-center">Aucune liste. Importez un CSV.</p>
              ) : (
                lists.map((l) => (
                  <div key={l.id} className={cn(
                    "group flex items-center gap-1.5 px-2.5 py-2 rounded-md text-xs transition-colors cursor-pointer",
                    selectedListId === l.id ? "bg-indigo-50 text-indigo-700 font-semibold" : "hover:bg-gray-50 text-gray-600"
                  )}>
                    <button onClick={() => setSelectedListId(l.id)} className="flex-1 text-left flex items-center gap-2 min-w-0 cursor-pointer">
                      <List className="w-3.5 h-3.5 flex-shrink-0 text-indigo-400" />
                      <div className="flex-1 min-w-0">
                        <p className="truncate">{l.name}</p>
                        <p className="text-[9px] text-gray-400 flex items-center gap-1 truncate">
                          <Building2 className="w-2.5 h-2.5 flex-shrink-0" />
                          {l.company}
                        </p>
                      </div>
                      <span className="text-[9px] text-gray-400 flex-shrink-0">{l.count}</span>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteList(l.id); }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-300 hover:text-red-500 cursor-pointer transition-all"
                      title="Supprimer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 min-w-0">
      {!showListPanel && (
        <button
          onClick={() => setShowListPanel(true)}
          className="mb-3 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          Listes
        </button>
      )}

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
            <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
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
                  {PROSPECT_COLUMNS.filter((c) => colVisible(c.key)).map((col) => (
                    <th
                      key={col.key}
                      className={cn(
                        "relative px-1 py-2.5 font-semibold text-gray-600 text-[10px] uppercase tracking-wide select-none",
                        ["score_entreprise", "score_job", "linkedin"].includes(col.key) ? "text-center" : "text-left"
                      )}
                      style={{ width: colWidths[col.key], minWidth: col.minWidth, maxWidth: colWidths[col.key] }}
                    >
                      {col.key === "linkedin" ? <Linkedin className="w-3 h-3 mx-auto text-gray-500" /> : col.label}
                      <span
                        onMouseDown={(e) => onColResize(col.key, e)}
                        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-indigo-400/40 transition-colors"
                      />
                    </th>
                  ))}
                  <th className="text-center pr-3 pl-1 py-2.5 font-semibold text-gray-600 text-[10px] uppercase tracking-wide" style={{ width: 50, minWidth: 50 }}></th>
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
                      {colVisible("prenom") && <td className="px-1 py-1.5 truncate overflow-hidden" style={{ width: colWidths["prenom"], maxWidth: colWidths["prenom"] }}>
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
                      </td>}
                      {colVisible("nom") && <td className="px-1 py-1.5 truncate overflow-hidden" style={{ width: colWidths["nom"], maxWidth: colWidths["nom"] }}>
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
                      </td>}
                      {colVisible("email") && <td className="px-1 py-1.5 truncate overflow-hidden" style={{ width: colWidths["email"], maxWidth: colWidths["email"] }}>
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
                      </td>}
                      {colVisible("telephone") && <td className="px-1 py-1.5 truncate overflow-hidden" style={{ width: colWidths["telephone"], maxWidth: colWidths["telephone"] }}>
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
                      </td>}
                      {colVisible("poste") && <td className="px-1 py-1.5 truncate overflow-hidden" style={{ width: colWidths["poste"], maxWidth: colWidths["poste"] }}>
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
                      </td>}
                      {colVisible("entreprise") && <td className="px-1 py-1.5 truncate overflow-hidden" style={{ width: colWidths["entreprise"], maxWidth: colWidths["entreprise"] }}>
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
                      </td>}
                      {colVisible("statut") && <td className="px-1 py-1.5" style={{ width: colWidths["statut"], maxWidth: colWidths["statut"] }}>
                        <StatusBadge statut={statut} />
                      </td>}
                      {colVisible("affaire") && <td className="px-1 py-1.5 overflow-hidden" style={{ width: colWidths["affaire"], maxWidth: colWidths["affaire"] }}>
                        {p.deal_id ? (
                          <Link
                            href={`/dashboard?deal=${p.deal_id}`}
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
                            onClick={() => { setLinkingId(p.id); setNewDealTitle(p.entreprise ? `${p.entreprise} - ${p.prenom} ${p.nom}`.trim() : `${p.prenom} ${p.nom}`.trim()); }}
                            className="inline-flex items-center gap-0.5 text-[10px] text-gray-400 hover:text-indigo-600 cursor-pointer transition-colors"
                            title="Créer une affaire"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Créer</span>
                          </button>
                        )}
                      </td>}
                      {colVisible("score_entreprise") && <td className="px-1 py-1.5 text-center" style={{ width: colWidths["score_entreprise"], maxWidth: colWidths["score_entreprise"] }}>
                        {isEditing ? (
                          <ScoreNumber
                            value={parseInt(editData.score_entreprise || "0") || 0}
                            onChange={(v) => setEditData({ ...editData, score_entreprise: String(v) })}
                          />
                        ) : (
                          <ScoreNumber value={scoreEnt} />
                        )}
                      </td>}
                      {colVisible("score_job") && <td className="px-1 py-1.5 text-center" style={{ width: colWidths["score_job"], maxWidth: colWidths["score_job"] }}>
                        {isEditing ? (
                          <ScoreNumber
                            value={parseInt(editData.score_job || "0") || 0}
                            onChange={(v) => setEditData({ ...editData, score_job: String(v) })}
                          />
                        ) : (
                          <ScoreNumber value={scoreJob} />
                        )}
                      </td>}
                      {colVisible("linkedin") && <td className="px-1 py-1.5 text-center" style={{ width: colWidths["linkedin"], maxWidth: colWidths["linkedin"] }}>
                        {p.linkedin ? (
                          <a href={p.linkedin.startsWith("http") ? p.linkedin : `https://${p.linkedin}`} target="_blank" rel="noopener noreferrer" className="text-[#0077B5] hover:text-[#005885]" title={p.linkedin}>
                            <Linkedin className="w-3.5 h-3.5 mx-auto" />
                          </a>
                        ) : (
                          <span className="text-gray-200"><Linkedin className="w-3.5 h-3.5 mx-auto" /></span>
                        )}
                      </td>}
                      {colVisible("naf_code") && <td className="px-1 py-1.5 truncate overflow-hidden" style={{ width: colWidths["naf_code"], maxWidth: colWidths["naf_code"] }}>
                        <span className="text-gray-600 text-[9px]" title={p.naf_code}>{p.naf_code}</span>
                      </td>}
                      {colVisible("effectifs") && <td className="px-1 py-1.5 truncate overflow-hidden" style={{ width: colWidths["effectifs"], maxWidth: colWidths["effectifs"] }}>
                        <span className="text-gray-600 text-[9px]">{p.effectifs}</span>
                      </td>}
                      {colVisible("ville") && <td className="px-1 py-1.5 truncate overflow-hidden" style={{ width: colWidths["ville"], maxWidth: colWidths["ville"] }}>
                        <span className="text-gray-600 text-[9px]" title={p.ville || ""}>{p.ville || <span className="text-gray-300">—</span>}</span>
                      </td>}
                      {colVisible("siren") && <td className="px-1 py-1.5 truncate overflow-hidden" style={{ width: colWidths["siren"], maxWidth: colWidths["siren"] }}>
                        <span className="text-gray-600 text-[9px] font-mono">{p.siren || <span className="text-gray-300">—</span>}</span>
                      </td>}
                      {colVisible("categorie_entreprise") && <td className="px-1 py-1.5 text-center" style={{ width: colWidths["categorie_entreprise"], maxWidth: colWidths["categorie_entreprise"] }}>
                        {p.categorie_entreprise ? (
                          <span className={cn("inline-flex items-center px-1 py-0.5 rounded text-[8px] font-bold",
                            p.categorie_entreprise === "GE" ? "bg-purple-100 text-purple-700" :
                            p.categorie_entreprise === "ETI" ? "bg-blue-100 text-blue-700" :
                            "bg-green-100 text-green-700"
                          )}>{p.categorie_entreprise}</span>
                        ) : <span className="text-gray-300 text-[9px]">—</span>}
                      </td>}
                      {colVisible("chiffre_affaires") && <td className="px-1 py-1.5 truncate overflow-hidden text-right" style={{ width: colWidths["chiffre_affaires"], maxWidth: colWidths["chiffre_affaires"] }}>
                        {p.chiffre_affaires ? (
                          <span className="text-gray-700 text-[9px] font-medium" title={`${Number(p.chiffre_affaires).toLocaleString("fr-FR")} €`}>
                            {Number(p.chiffre_affaires) >= 1_000_000
                              ? `${(Number(p.chiffre_affaires) / 1_000_000).toFixed(1)}M€`
                              : `${(Number(p.chiffre_affaires) / 1_000).toFixed(0)}k€`}
                          </span>
                        ) : <span className="text-gray-300 text-[9px]">—</span>}
                      </td>}
                      {colVisible("resultat_net") && <td className="px-1 py-1.5 truncate overflow-hidden text-right" style={{ width: colWidths["resultat_net"], maxWidth: colWidths["resultat_net"] }}>
                        {p.resultat_net ? (
                          <span className={cn("text-[9px] font-medium", Number(p.resultat_net) >= 0 ? "text-green-700" : "text-red-600")} title={`${Number(p.resultat_net).toLocaleString("fr-FR")} €`}>
                            {Number(p.resultat_net) >= 1_000_000 || Number(p.resultat_net) <= -1_000_000
                              ? `${(Number(p.resultat_net) / 1_000_000).toFixed(1)}M€`
                              : `${(Number(p.resultat_net) / 1_000).toFixed(0)}k€`}
                          </span>
                        ) : <span className="text-gray-300 text-[9px]">—</span>}
                      </td>}
                      {colVisible("dirigeants") && <td className="px-1 py-1.5 truncate overflow-hidden" style={{ width: colWidths["dirigeants"], maxWidth: colWidths["dirigeants"] }}>
                        <span className="text-gray-500 text-[9px]" title={p.dirigeants || ""}>{p.dirigeants || <span className="text-gray-300">—</span>}</span>
                      </td>}
                      {colVisible("date_creation_entreprise") && <td className="px-1 py-1.5 truncate overflow-hidden" style={{ width: colWidths["date_creation_entreprise"], maxWidth: colWidths["date_creation_entreprise"] }}>
                        <span className="text-gray-600 text-[9px]">{p.date_creation_entreprise || <span className="text-gray-300">—</span>}</span>
                      </td>}
                      {colVisible("resume_entreprise") && <td className="px-1 py-1.5 truncate overflow-hidden" style={{ width: colWidths["resume_entreprise"], maxWidth: colWidths["resume_entreprise"] }}>
                        <span className="text-gray-500 text-[9px]" title={p.resume_entreprise || ""}>{p.resume_entreprise || <span className="text-gray-300">—</span>}</span>
                      </td>}
                      {colVisible("ai_score") && <td className="px-1 py-1.5 text-center" style={{ width: colWidths["ai_score"], maxWidth: colWidths["ai_score"] }}>
                        <ScoreNumber value={parseInt(p.ai_score || "0") || 0} />
                      </td>}
                      {colVisible("ai_comment") && <td className="px-1 py-1.5 truncate overflow-hidden" style={{ width: colWidths["ai_comment"], maxWidth: colWidths["ai_comment"] }}>
                        <span className="text-gray-500 text-[9px]" title={p.ai_comment || ""}>{p.ai_comment || <span className="text-gray-300">—</span>}</span>
                      </td>}
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

        </div>{/* end flex-1 min-w-0 (main content) */}
      </div>{/* end flex gap-4 (lists + table) */}

      {/* Modal nouveau contact */}
      {showNewProspect && (
        <NewProspectModal
          onClose={() => setShowNewProspect(false)}
          onCreated={(prospect) => {
            setProspects((prev) => [...prev, {
              ...prospect,
              statut: "en cours",
              pipelines: "",
              notes: "",
              score_entreprise: "",
              score_job: "",
              linkedin: "",
              naf_code: "",
              effectifs: "",
              deal_id: null,
              deal_title: null,
              deal_status: null,
              deal_value: null,
              computed_statut: "en cours",
            } as Prospect]);
            setTimeout(() => syncProspects(), 2000);
          }}
        />
      )}

      {/* Modal import CSV avec liste */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Upload className="w-5 h-5 text-indigo-600" />
                Importer un fichier
              </h3>
              <button onClick={() => { setShowUploadModal(false); setUploadFile(null); setUploadListName(""); setUploadListCompany(""); }} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {uploadFile && (
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
                <FolderOpen className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-700 truncate">{uploadFile.name}</span>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nom de la liste *</label>
                <input
                  type="text"
                  value={uploadListName}
                  onChange={(e) => setUploadListName(e.target.value)}
                  placeholder="Ex: Contacts Salon 2026"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Entreprise associée *</label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={uploadListCompany}
                    onChange={(e) => setUploadListCompany(e.target.value)}
                    placeholder="Ex: Metagora"
                    list="known-companies"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 outline-none"
                  />
                  <datalist id="known-companies">
                    {knownCompanies.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
                {knownCompanies.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {knownCompanies.map((c) => (
                      <button
                        key={c}
                        onClick={() => setUploadListCompany(c)}
                        className={cn(
                          "px-2 py-0.5 text-[10px] font-medium rounded-full border cursor-pointer transition-colors",
                          uploadListCompany === c
                            ? "bg-indigo-100 text-indigo-700 border-indigo-300"
                            : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
                        )}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => { setShowUploadModal(false); setUploadFile(null); setUploadListName(""); setUploadListCompany(""); }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={handleUploadWithList}
                disabled={uploading || !uploadListName.trim() || !uploadListCompany.trim()}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploading ? "Import en cours..." : "Importer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
