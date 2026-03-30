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
  ClipboardList,
  Save,
  ThumbsUp,
  ThumbsDown,
  Star,
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
  extra_fields?: string;
}

interface ColumnInfo {
  index: number;
  original: string;
  suggestedLabel: string;
  knownField: string | null;
  autoSelected: boolean;
  samples: string[];
}

interface ColMapping {
  index: number;
  selected: boolean;
  label: string;
  knownField: string | null;
}

interface ProspectList {
  id: string;
  name: string;
  company: string;
  created_at: string;
  count: number;
}

interface ScoringLeadExample {
  prospect_id: string;
  name: string;
  poste: string;
  entreprise: string;
  rating: number;
  reason: string;
}

interface ScoringCard {
  id: string;
  company: string;
  product: string;
  value_proposition: string;
  ideal_client_types: string[];
  company_size_ideal: string;
  company_size_min: string;
  company_size_max: string;
  good_leads: ScoringLeadExample[];
  bad_leads: ScoringLeadExample[];
  created_at: string;
  updated_at: string;
  validated: boolean;
}

type StatusKey = "en cours" | "perdu" | "archivé";

// Column definitions for visibility toggle + resizable widths
const PROSPECT_COLUMNS = [
  { key: "prenom", label: "Prénom", defaultVisible: true, defaultWidth: 90, minWidth: 50 },
  { key: "nom", label: "Nom", defaultVisible: true, defaultWidth: 90, minWidth: 50 },
  { key: "email", label: "Email", defaultVisible: true, defaultWidth: 180, minWidth: 80 },
  { key: "telephone", label: "Tél.", defaultVisible: false, defaultWidth: 100, minWidth: 50 },
  { key: "poste", label: "Poste", defaultVisible: true, defaultWidth: 110, minWidth: 50 },
  { key: "entreprise", label: "Entreprise", defaultVisible: true, defaultWidth: 120, minWidth: 60 },
  { key: "statut", label: "Statut", defaultVisible: false, defaultWidth: 70, minWidth: 50 },
  { key: "affaire", label: "Affaire", defaultVisible: false, defaultWidth: 130, minWidth: 60 },
  { key: "linkedin", label: "LinkedIn", defaultVisible: false, defaultWidth: 36, minWidth: 30 },
  { key: "naf_code", label: "NAF", defaultVisible: false, defaultWidth: 65, minWidth: 35 },
  { key: "effectifs", label: "Eff.", defaultVisible: false, defaultWidth: 55, minWidth: 35 },
  { key: "ville", label: "Ville", defaultVisible: false, defaultWidth: 90, minWidth: 50 },
  { key: "siren", label: "SIREN", defaultVisible: false, defaultWidth: 85, minWidth: 60 },
  { key: "categorie_entreprise", label: "Cat.", defaultVisible: false, defaultWidth: 55, minWidth: 40 },
  { key: "chiffre_affaires", label: "CA", defaultVisible: false, defaultWidth: 80, minWidth: 50 },
  { key: "resultat_net", label: "Résultat", defaultVisible: false, defaultWidth: 80, minWidth: 50 },
  { key: "dirigeants", label: "Dirigeants", defaultVisible: false, defaultWidth: 160, minWidth: 80 },
  { key: "date_creation_entreprise", label: "Création", defaultVisible: false, defaultWidth: 80, minWidth: 50 },
  { key: "resume_entreprise", label: "Résumé Ent.", defaultVisible: true, defaultWidth: 160, minWidth: 80 },
  { key: "ai_score", label: "Score IA", defaultVisible: true, defaultWidth: 60, minWidth: 45 },
  { key: "ai_comment", label: "Analyse IA", defaultVisible: true, defaultWidth: 180, minWidth: 80 },
] as { key: string; label: string; defaultVisible: boolean; defaultWidth: number; minWidth: number }[];

const SCORING_TEXT_MAX_WORDS = 200;

function splitWords(text: string): string[] {
  return (text || "").trim().split(/\s+/).filter(Boolean);
}

function countWords(text: string): number {
  return splitWords(text).length;
}

function trimToMaxWords(text: string, maxWords: number): string {
  const words = splitWords(text);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(" ");
}

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
  const [scoreFilters, setScoreFilters] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Prospect>>({});
  const [saving, setSaving] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [newDealTitle, setNewDealTitle] = useState("");
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [archiving, setArchiving] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [processing, setProcessing] = useState<{ label: string; message: string; current: number; total: number } | null>(null);
  const [showLinkDeal, setShowLinkDeal] = useState(false);
  const [allDeals, setAllDeals] = useState<{ id: number; title: string; person_name?: string; org_name?: string }[]>([]);
  const [dealSearch, setDealSearch] = useState("");
  const [showNewProspect, setShowNewProspect] = useState(false);
  const [linking, setLinking] = useState(false);
  const [scoreEditTarget, setScoreEditTarget] = useState<Prospect | null>(null);
  const [scoreEditValue, setScoreEditValue] = useState(0);
  const [scoreEditReason, setScoreEditReason] = useState("");
  const [scoreEditResume, setScoreEditResume] = useState("");
  const [scoreEditSaving, setScoreEditSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Lists panel
  const [lists, setLists] = useState<ProspectList[]>([]);
  const [loadingLists, setLoadingLists] = useState(true);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadListName, setUploadListName] = useState("");
  const [uploadListCompany, setUploadListCompany] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  // Column mapping wizard
  const [uploadStep, setUploadStep] = useState<1 | 2>(1); // 1=column mapping, 2=list info
  const [parsingHeaders, setParsingHeaders] = useState(false);
  const [parsedColumns, setParsedColumns] = useState<ColumnInfo[]>([]);
  const [parsedTotalRows, setParsedTotalRows] = useState(0);
  const [colMapping, setColMapping] = useState<ColMapping[]>([]);
  const [showListPanel, setShowListPanel] = useState(true);
  // Scoring cards
  const [showScoringCards, setShowScoringCards] = useState(false);
  const [scoringCards, setScoringCards] = useState<ScoringCard[]>([]);
  const [loadingScoringCards, setLoadingScoringCards] = useState(false);
  const [editingScoringCard, setEditingScoringCard] = useState<ScoringCard | null>(null);
  const [scoringCardForm, setScoringCardForm] = useState({
    product: "",
    value_proposition: "",
    ideal_client_types: ["", "", ""],
    company_size_ideal: "",
    company_size_min: "",
    company_size_max: "",
  });
  const [scoringGoodLeads, setScoringGoodLeads] = useState<ScoringLeadExample[]>([]);
  const [scoringBadLeads, setScoringBadLeads] = useState<ScoringLeadExample[]>([]);
  const [scoringCardSaving, setScoringCardSaving] = useState(false);
  const [scoringLeadPickerType, setScoringLeadPickerType] = useState<"good" | "bad" | null>(null);
  const [scoringLeadSearch, setScoringLeadSearch] = useState("");
  const [scoringLeadSelectedIds, setScoringLeadSelectedIds] = useState<Set<string>>(new Set());
  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    new Set(PROSPECT_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key))
  );
  const [showColPicker, setShowColPicker] = useState(false);
  const colVisible = (key: string) => visibleCols.has(key);

  // Detect extra_fields columns from loaded prospects
  const extraColumns = useMemo(() => {
    const keys = new Set<string>();
    for (const p of prospects) {
      if (p.extra_fields) {
        try {
          const extra = JSON.parse(p.extra_fields) as Record<string, string>;
          for (const k of Object.keys(extra)) keys.add(k);
        } catch { /* ignore */ }
      }
    }
    return Array.from(keys).map((k) => ({
      key: `extra:${k}`,
      label: k,
      defaultVisible: true,
      defaultWidth: 120,
      minWidth: 50,
    }));
  }, [prospects]);

  // Merged columns: base + extra
  const allColumns = useMemo(() => [...PROSPECT_COLUMNS, ...extraColumns], [extraColumns]);

  // Auto-show new extra columns when they appear
  const prevExtraKeysRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const newKeys = extraColumns.map((c) => c.key).filter((k) => !prevExtraKeysRef.current.has(k));
    if (newKeys.length > 0) {
      setVisibleCols((prev) => {
        const next = new Set(prev);
        for (const k of newKeys) next.add(k);
        return next;
      });
    }
    prevExtraKeysRef.current = new Set(extraColumns.map((c) => c.key));
  }, [extraColumns]);

  const { widths: colWidths, onMouseDown: onColResize } = useResizableColumns(
    allColumns.map((c) => ({ key: c.key, minWidth: c.minWidth, defaultWidth: c.defaultWidth }))
  );

  // Helper to get extra field value from a prospect
  const getExtraField = useCallback((p: Prospect, key: string): string => {
    if (!p.extra_fields) return "";
    try {
      const extra = JSON.parse(p.extra_fields) as Record<string, string>;
      return extra[key] || "";
    } catch { return ""; }
  }, []);

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
    fetchScoringCards();
  }, [fetchProspects, fetchLists]);

  const resetUploadModal = () => {
    setShowUploadModal(false);
    setUploadFile(null);
    setUploadListName("");
    setUploadListCompany("");
    setParsedColumns([]);
    setParsedTotalRows(0);
    setColMapping([]);
    setUploadStep(1);
  };

  const handleUploadWithList = async () => {
    if (!uploadFile || !uploadListName.trim() || !uploadListCompany.trim()) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("list_name", uploadListName.trim());
      formData.append("list_company", uploadListCompany.trim());
      // Send column mapping
      const selectedMapping = colMapping.filter((m) => m.selected);
      if (selectedMapping.length > 0) {
        formData.append("column_mapping", JSON.stringify(colMapping));
      }
      const res = await fetch("/api/prospects/upload", { method: "POST", body: formData });
      const json = await res.json();
      if (json.success) {
        const dupMsg = json.skippedDuplicates ? ` (${json.skippedDuplicates} doublons ignorés)` : "";
        const extraMsg = json.extraColumns?.length ? ` + ${json.extraColumns.length} colonnes supplémentaires` : "";
        setActionMsg(`${json.count} contacts importés dans "${uploadListName.trim()}"${dupMsg}${extraMsg}`);
        setTimeout(() => setActionMsg(null), 5000);
        resetUploadModal();
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

  /** Shared SSE handler for streaming API routes (API Gouv, AI Score) */
  const runStreamingAction = async (url: string, label: string, doneMsg: (data: Record<string, unknown>) => string, extraBody?: Record<string, unknown>) => {
    if (selected.size === 0) return;
    setProcessing({ label, message: "Démarrage...", current: 0, total: 1 });
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected), ...extraBody }),
      });
      if (!res.ok || !res.body) {
        const err = await res.text();
        setProcessing(null);
        setActionMsg(`Erreur : ${err}`);
        setTimeout(() => setActionMsg(null), 5000);
        return;
      }
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
              if (eventType === "progress") {
                setProcessing({ label, message: data.message || "", current: data.current ?? 0, total: data.total ?? 1 });
              } else if (eventType === "done") {
                setProcessing(null);
                setActionMsg(doneMsg(data));
                setSelected(new Set());
                syncProspects();
                setTimeout(() => setActionMsg(null), 6000);
              }
            } catch { /* ignore parse errors */ }
          }
        }
      }
    } catch (err) {
      console.error(`${label} error:`, err);
      setActionMsg(`Erreur ${label}`);
      setTimeout(() => setActionMsg(null), 5000);
    }
    setProcessing(null);
  };

  const aiScoreProspects = () => {
    // Detect company from selected list to pass as brand for dynamic scoring card
    const selectedList = selectedListId ? lists.find((l) => l.id === selectedListId) : null;
    const brand = selectedList?.company || "Metagora";
    return runStreamingAction("/api/prospects/ai-score", "Score IA", (d) =>
      `${d.scored}/${d.total} prospects analysés par l'IA (${brand})`
    , { brand });
  };

  const enrichGouvProspects = () =>
    runStreamingAction("/api/prospects/enrich-gouv", "API Gouv", (d) =>
      `${d.enriched}/${d.total} enrichi${Number(d.enriched) > 1 ? "s" : ""} (${d.companiesSearched} entreprises)`
    );

  const openScoreEdit = (p: Prospect) => {
    setScoreEditTarget(p);
    setScoreEditValue(parseInt(p.ai_score || "0") || 0);
    setScoreEditReason(p.ai_comment || "");
    setScoreEditResume(p.resume_entreprise || "");
  };

  /** Save only resume_entreprise — no scoring memory impact */
  const saveResumeOnly = async () => {
    if (!scoreEditTarget) return;
    setScoreEditSaving(true);
    try {
      await fetch("/api/prospects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: scoreEditTarget.id, updates: { resume_entreprise: scoreEditResume.trim() } }),
      });
      setProspects((prev) => prev.map((p) =>
        p.id === scoreEditTarget.id ? { ...p, resume_entreprise: scoreEditResume.trim() } : p
      ));
      setActionMsg("Résumé entreprise mis à jour");
      setTimeout(() => setActionMsg(null), 3000);
    } catch (err) {
      console.error("Resume save error:", err);
      setActionMsg("Erreur lors de la sauvegarde du résumé");
      setTimeout(() => setActionMsg(null), 5000);
    }
    setScoreEditSaving(false);
    setScoreEditTarget(null);
  };

  /** Save score correction → scoring memory (RAG learning) + update prospect */
  const submitScoreCorrection = async () => {
    if (!scoreEditTarget || !scoreEditReason.trim()) return;
    setScoreEditSaving(true);
    try {
      const res = await fetch("/api/prospects/scoring-memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand: (() => {
            const pList = lists.find((l) => l.id === scoreEditTarget.list_id);
            return pList?.company?.toLowerCase() || "metagora";
          })(),
          prospect_id: scoreEditTarget.id,
          poste: scoreEditTarget.poste || "",
          entreprise: scoreEditTarget.entreprise || "",
          old_score: parseInt(scoreEditTarget.ai_score || "0") || 0,
          new_score: scoreEditValue,
          reason: scoreEditReason.trim(),
        }),
      });
      const json = await res.json();
      if (json.success) {
        // Also save resume if changed
        const resumeChanged = scoreEditResume.trim() !== (scoreEditTarget.resume_entreprise || "");
        if (resumeChanged) {
          await fetch("/api/prospects", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: scoreEditTarget.id, updates: { resume_entreprise: scoreEditResume.trim() } }),
          });
        }
        setProspects((prev) => prev.map((p) =>
          p.id === scoreEditTarget.id ? {
            ...p,
            ai_score: String(scoreEditValue),
            ai_comment: scoreEditReason.trim(),
            ...(resumeChanged ? { resume_entreprise: scoreEditResume.trim() } : {}),
          } : p
        ));
        setActionMsg("Score IA corrigé + mémorisé pour apprentissage");
        setTimeout(() => setActionMsg(null), 4000);
      } else {
        setActionMsg(`Erreur : ${json.error}`);
        setTimeout(() => setActionMsg(null), 5000);
      }
    } catch (err) {
      console.error("Score correction error:", err);
      setActionMsg("Erreur lors de la correction");
      setTimeout(() => setActionMsg(null), 5000);
    }
    setScoreEditSaving(false);
    setScoreEditTarget(null);
  };

  // ─── Scoring Cards ───────────────────────────────────
  const fetchScoringCards = async () => {
    setLoadingScoringCards(true);
    try {
      const res = await fetch("/api/scoring-cards");
      const json = await res.json();
      if (json.cards) setScoringCards(json.cards);
    } catch (err) {
      console.error("Fetch scoring cards error:", err);
    }
    setLoadingScoringCards(false);
  };

  const openScoringCard = (company: string) => {
    const existing = scoringCards.find((c) => c.company.toLowerCase() === company.toLowerCase());
    if (existing) {
      setEditingScoringCard(existing);
      setScoringCardForm({
        product: trimToMaxWords(existing.product || "", SCORING_TEXT_MAX_WORDS),
        value_proposition: trimToMaxWords(existing.value_proposition || "", SCORING_TEXT_MAX_WORDS),
        ideal_client_types: existing.ideal_client_types.length >= 3
          ? existing.ideal_client_types.slice(0, 3)
          : [...existing.ideal_client_types, ...Array(3 - existing.ideal_client_types.length).fill("")],
        company_size_ideal: existing.company_size_ideal,
        company_size_min: existing.company_size_min,
        company_size_max: existing.company_size_max,
      });
      setScoringGoodLeads(existing.good_leads || []);
      setScoringBadLeads(existing.bad_leads || []);
    } else {
      // Auto-fill Metagora if applicable
      const isMetagora = company.toLowerCase().includes("metagora");
      setEditingScoringCard({
        id: "", company,
        product: isMetagora ? "Simsell — simulateur de vente IA pour vendeurs retail/luxe" : "",
        value_proposition: isMetagora ? "Formation commerciale immersive par IA : +30% de performance commerciale, 100% de taux de complétion, déploiement en 1 jour" : "",
        ideal_client_types: isMetagora ? ["Grands groupes luxe & cosmétique (Hermès, LVMH, Guerlain)", "Enseignes retail & mode (> 200 employés)", "Maisons vin & spiritueux / hospitality"] : ["", "", ""],
        company_size_ideal: isMetagora ? "ETI / GE (500-10 000 employés)" : "",
        company_size_min: isMetagora ? "50 employés" : "",
        company_size_max: isMetagora ? "100 000+ employés" : "",
        good_leads: [], bad_leads: [],
        created_at: "", updated_at: "", validated: false,
      });
      setScoringCardForm({
        product: isMetagora ? "Simsell — simulateur de vente IA pour vendeurs retail/luxe" : "",
        value_proposition: isMetagora ? "Formation commerciale immersive par IA : +30% de performance commerciale, 100% de taux de complétion, déploiement en 1 jour" : "",
        ideal_client_types: isMetagora ? ["Grands groupes luxe & cosmétique (Hermès, LVMH, Guerlain)", "Enseignes retail & mode (> 200 employés)", "Maisons vin & spiritueux / hospitality"] : ["", "", ""],
        company_size_ideal: isMetagora ? "ETI / GE (500-10 000 employés)" : "",
        company_size_min: isMetagora ? "50 employés" : "",
        company_size_max: isMetagora ? "100 000+ employés" : "",
      });
      // Auto-pick good/bad leads from prospects with ai_score
      const companyProspects = prospects.filter((p) => {
        const pList = lists.find((l) => l.id === p.list_id);
        return pList && pList.company.toLowerCase() === company.toLowerCase();
      });
      const scored = companyProspects.filter((p) => p.ai_score && parseInt(p.ai_score) > 0);
      const good = scored
        .filter((p) => parseInt(p.ai_score || "0") >= 4)
        .sort((a, b) => parseInt(b.ai_score || "0") - parseInt(a.ai_score || "0"))
        .slice(0, 10)
        .map((p) => ({
          prospect_id: p.id,
          name: `${p.prenom} ${p.nom}`.trim(),
          poste: p.poste || "",
          entreprise: p.entreprise || "",
          rating: parseInt(p.ai_score || "0"),
          reason: p.ai_comment || "",
        }));
      const bad = scored
        .filter((p) => parseInt(p.ai_score || "0") <= 2)
        .sort((a, b) => parseInt(a.ai_score || "0") - parseInt(b.ai_score || "0"))
        .slice(0, 10)
        .map((p) => ({
          prospect_id: p.id,
          name: `${p.prenom} ${p.nom}`.trim(),
          poste: p.poste || "",
          entreprise: p.entreprise || "",
          rating: parseInt(p.ai_score || "0"),
          reason: p.ai_comment || "",
        }));
      setScoringGoodLeads(good);
      setScoringBadLeads(bad);
    }
    setScoringLeadPickerType(null);
    setScoringLeadSearch("");
    setScoringLeadSelectedIds(new Set());
  };

  const saveScoringCard = async () => {
    if (!editingScoringCard) return;
    setScoringCardSaving(true);
    try {
      const res = await fetch("/api/scoring-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: editingScoringCard.company,
          product: trimToMaxWords(scoringCardForm.product, SCORING_TEXT_MAX_WORDS),
          value_proposition: trimToMaxWords(scoringCardForm.value_proposition, SCORING_TEXT_MAX_WORDS),
          ideal_client_types: scoringCardForm.ideal_client_types.filter(Boolean),
          company_size_ideal: scoringCardForm.company_size_ideal,
          company_size_min: scoringCardForm.company_size_min,
          company_size_max: scoringCardForm.company_size_max,
          good_leads: scoringGoodLeads,
          bad_leads: scoringBadLeads,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setActionMsg("Fiche scoring sauvegardée");
        setTimeout(() => setActionMsg(null), 3000);
        await fetchScoringCards();
        setEditingScoringCard(null);
      } else {
        setActionMsg(`Erreur : ${json.error}`);
        setTimeout(() => setActionMsg(null), 5000);
      }
    } catch (err) {
      console.error("Save scoring card error:", err);
      setActionMsg("Erreur lors de la sauvegarde");
      setTimeout(() => setActionMsg(null), 5000);
    }
    setScoringCardSaving(false);
  };

  const buildScoringLeadEntry = (prospect: Prospect, type: "good" | "bad"): ScoringLeadExample => ({
      prospect_id: prospect.id,
      name: `${prospect.prenom} ${prospect.nom}`.trim(),
      poste: prospect.poste || "",
      entreprise: prospect.entreprise || "",
      rating: type === "good" ? 5 : 1,
      reason: "",
    });

  const addScoringLead = (prospect: Prospect, type: "good" | "bad") => {
    const entry = buildScoringLeadEntry(prospect, type);
    if (type === "good") {
      if (scoringGoodLeads.length >= 10) return;
      if (scoringGoodLeads.some((l) => l.prospect_id === prospect.id)) return;
      setScoringGoodLeads((prev) => [...prev, entry]);
    } else {
      if (scoringBadLeads.length >= 10) return;
      if (scoringBadLeads.some((l) => l.prospect_id === prospect.id)) return;
      setScoringBadLeads((prev) => [...prev, entry]);
    }
    setScoringLeadSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(prospect.id);
      return next;
    });
  };

  const addSelectedScoringLeads = (type: "good" | "bad", available: Prospect[]) => {
    const selectedProspects = available.filter((p) => scoringLeadSelectedIds.has(p.id));
    if (selectedProspects.length === 0) return;
    if (type === "good") {
      const remaining = Math.max(0, 10 - scoringGoodLeads.length);
      if (remaining <= 0) return;
      const toAdd = selectedProspects
        .filter((p) => !scoringGoodLeads.some((l) => l.prospect_id === p.id))
        .slice(0, remaining)
        .map((p) => buildScoringLeadEntry(p, type));
      if (toAdd.length > 0) setScoringGoodLeads((prev) => [...prev, ...toAdd]);
    } else {
      const remaining = Math.max(0, 10 - scoringBadLeads.length);
      if (remaining <= 0) return;
      const toAdd = selectedProspects
        .filter((p) => !scoringBadLeads.some((l) => l.prospect_id === p.id))
        .slice(0, remaining)
        .map((p) => buildScoringLeadEntry(p, type));
      if (toAdd.length > 0) setScoringBadLeads((prev) => [...prev, ...toAdd]);
    }
    setScoringLeadSelectedIds(new Set());
  };

  const toggleScoringLeadPicker = (type: "good" | "bad") => {
    setScoringLeadPickerType((prev) => (prev === type ? null : type));
    setScoringLeadSearch("");
    setScoringLeadSelectedIds(new Set());
  };

  const toggleScoringLeadSelect = (prospectId: string) => {
    setScoringLeadSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(prospectId)) next.delete(prospectId);
      else next.add(prospectId);
      return next;
    });
  };

  const removeScoringLead = (prospectId: string, type: "good" | "bad") => {
    if (type === "good") {
      setScoringGoodLeads((prev) => prev.filter((l) => l.prospect_id !== prospectId));
    } else {
      setScoringBadLeads((prev) => prev.filter((l) => l.prospect_id !== prospectId));
    }
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
    } else {
      // Always export the filtered view (respects all active filters: status, score, search, list)
      const filteredIds = filtered.map((p) => p.id);
      if (filteredIds.length > 0) {
        params.set("ids", filteredIds.join(","));
      }
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

  const toggleScoreFilter = (s: number) => {
    setScoreFilters((prev) => {
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
      if (scoreFilters.size > 0) {
        const score = parseInt(p.ai_score || "0") || 0;
        if (!scoreFilters.has(score)) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const baseMatch = (
          (p.nom || "").toLowerCase().includes(q) ||
          (p.prenom || "").toLowerCase().includes(q) ||
          (p.email || "").toLowerCase().includes(q) ||
          (p.entreprise || "").toLowerCase().includes(q) ||
          (p.poste || "").toLowerCase().includes(q) ||
          (p.telephone || "").includes(q) ||
          (p.deal_title || "").toLowerCase().includes(q)
        );
        if (baseMatch) return true;
        // Also search in extra_fields
        if (p.extra_fields) {
          try {
            const extra = JSON.parse(p.extra_fields) as Record<string, string>;
            return Object.values(extra).some((v) => v.toLowerCase().includes(q));
          } catch { /* ignore */ }
        }
        return false;
      }
      return true;
    });
  }, [prospects, search, statusFilters, scoreFilters, selectedListId]);

  const enCoursCount = prospects.filter((p) => (p.computed_statut || p.statut) === "en cours").length;
  const perduCount = prospects.filter((p) => (p.computed_statut || p.statut) === "perdu").length;
  const archivedCount = prospects.filter((p) => (p.computed_statut || p.statut) === "archivé").length;

  const allFilteredSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id));
  const someFilteredSelected = filtered.some((p) => selected.has(p.id));
  const productWordCount = countWords(scoringCardForm.product);
  const valuePropWordCount = countWords(scoringCardForm.value_proposition);

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
          {actionMsg && !processing && (
            <span className="text-xs font-medium px-2 py-1 rounded bg-green-50 text-green-700">{actionMsg}</span>
          )}
          {processing ? (
            <div className="flex items-center gap-3 px-3 py-1.5 bg-white border border-gray-200 rounded-lg min-w-[320px]">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-semibold text-indigo-700">{processing.label}</span>
                  <span className="text-[10px] text-gray-500">
                    {processing.total > 0 ? `${Math.min(processing.current, processing.total)}/${processing.total}` : ""}
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                    style={{ width: `${processing.total > 0 ? Math.min((processing.current / processing.total) * 100, 100) : 0}%` }}
                  />
                </div>
                <p className="text-[9px] text-gray-500 mt-0.5 truncate">{processing.message}</p>
              </div>
            </div>
          ) : selected.size > 0 && (
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
                disabled={!!processing}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-50 cursor-pointer"
                title="Enrichir via API Gouv (SIREN, CA, effectifs, dirigeants — gratuit)"
              >
                <Building2 className="w-3.5 h-3.5" />
                API Gouv ({selected.size})
              </button>
              <button
                onClick={aiScoreProspects}
                disabled={!!processing}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-lg hover:bg-violet-100 disabled:opacity-50 cursor-pointer"
                title="Analyse IA : score de pertinence + commentaire + résumé entreprise"
              >
                <Bot className="w-3.5 h-3.5" />
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
            onClick={() => { setShowScoringCards(true); fetchScoringCards(); }}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-lg hover:bg-violet-100 cursor-pointer"
            title="Fiches de scoring IA par entreprise"
          >
            <ClipboardList className="w-3.5 h-3.5" />
            Fiches entreprises
          </button>
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
            title={selected.size > 0 ? `Exporter ${selected.size} sélectionné(s)` : `Exporter ${filtered.length} prospect(s) filtrés`}
          >
            <Download className="w-3.5 h-3.5" />
            {selected.size > 0 ? `Export (${selected.size})` : filtered.length < prospects.length ? `Export (${filtered.length})` : "Export CSV"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setUploadFile(f);
              setParsingHeaders(true);
              setShowUploadModal(true);
              setUploadStep(1);
              try {
                const fd = new FormData();
                fd.append("file", f);
                const res = await fetch("/api/prospects/parse-headers", { method: "POST", body: fd });
                const json = await res.json();
                if (json.success && json.columns) {
                  setParsedColumns(json.columns);
                  setParsedTotalRows(json.totalRows || 0);
                  setColMapping(json.columns.map((c: ColumnInfo) => ({
                    index: c.index,
                    selected: c.autoSelected,
                    label: c.suggestedLabel,
                    knownField: c.knownField,
                  })));
                } else {
                  alert("Erreur parsing: " + (json.error || "inconnue"));
                  setShowUploadModal(false);
                }
              } catch (err) {
                console.error("Parse headers error:", err);
                alert("Erreur lors de l'analyse du fichier");
                setShowUploadModal(false);
              }
              setParsingHeaders(false);
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
          <div className="ml-1 border-l border-gray-200 pl-2 flex items-center gap-1">
            <Bot className="w-3.5 h-3.5 text-violet-400" />
            {[1, 2, 3, 4, 5].map((s) => {
              const colors = [
                "", "bg-red-100 text-red-700 border-red-300", "bg-orange-100 text-orange-700 border-orange-300",
                "bg-yellow-100 text-yellow-700 border-yellow-300", "bg-lime-100 text-lime-700 border-lime-300",
                "bg-green-100 text-green-700 border-green-300",
              ];
              const active = scoreFilters.has(s);
              return (
                <button
                  key={s}
                  onClick={() => toggleScoreFilter(s)}
                  className={cn(
                    "w-5 h-5 rounded text-[10px] font-bold border transition-all cursor-pointer",
                    active ? `${colors[s]} ring-1 ring-offset-0.5 ring-violet-400` : "bg-white text-gray-300 border-gray-200 hover:border-gray-300"
                  )}
                >
                  {s}
                </button>
              );
            })}
            {scoreFilters.size > 0 && (
              <button
                onClick={() => setScoreFilters(new Set())}
                className="text-[9px] text-gray-400 hover:text-gray-600 ml-0.5 cursor-pointer"
                title="Effacer filtre score"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
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
                {allColumns.map((col) => (
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
                  {allColumns.filter((c) => colVisible(c.key)).map((col) => (
                    <th
                      key={col.key}
                      className={cn(
                        "relative px-1 py-2.5 font-semibold text-gray-600 text-[10px] uppercase tracking-wide select-none",
                        ["linkedin", "ai_score"].includes(col.key) ? "text-center" : "text-left"
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
                      {colVisible("resume_entreprise") && <td className="px-1 py-1.5 truncate overflow-hidden cursor-pointer hover:bg-violet-50/50 transition-colors" style={{ width: colWidths["resume_entreprise"], maxWidth: colWidths["resume_entreprise"] }} onClick={() => openScoreEdit(p)} title="Cliquer pour modifier">
                        <span className="text-gray-500 text-[9px]">{p.resume_entreprise || <span className="text-gray-300">—</span>}</span>
                      </td>}
                      {colVisible("ai_score") && <td className="px-1 py-1.5 text-center cursor-pointer hover:bg-violet-50/50 transition-colors" style={{ width: colWidths["ai_score"], maxWidth: colWidths["ai_score"] }} onClick={() => openScoreEdit(p)} title="Cliquer pour modifier">
                        <ScoreNumber value={parseInt(p.ai_score || "0") || 0} />
                      </td>}
                      {colVisible("ai_comment") && <td className="px-1 py-1.5 truncate overflow-hidden cursor-pointer hover:bg-violet-50/50 transition-colors" style={{ width: colWidths["ai_comment"], maxWidth: colWidths["ai_comment"] }} onClick={() => openScoreEdit(p)} title="Cliquer pour modifier">
                        <span className="text-gray-500 text-[9px]">{p.ai_comment || <span className="text-gray-300">—</span>}</span>
                      </td>}
                      {/* Dynamic extra columns */}
                      {extraColumns.filter((ec) => colVisible(ec.key)).map((ec) => {
                        const extraKey = ec.key.replace(/^extra:/, "");
                        const val = getExtraField(p, extraKey);
                        return (
                          <td key={ec.key} className="px-1 py-1.5 truncate overflow-hidden" style={{ width: colWidths[ec.key], maxWidth: colWidths[ec.key] }}>
                            <span className="text-gray-600 text-[9px]" title={val}>{val || <span className="text-gray-300">—</span>}</span>
                          </td>
                        );
                      })}
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

      {/* Modal import CSV — Column Mapping Wizard */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Upload className="w-5 h-5 text-indigo-600" />
                  Importer un fichier
                </h3>
                {uploadFile && (
                  <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">
                    <FolderOpen className="w-3.5 h-3.5" />
                    {uploadFile.name} — {parsedTotalRows} lignes détectées
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                  <span className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold", uploadStep === 1 ? "bg-indigo-600 text-white" : "bg-indigo-100 text-indigo-600")}>1</span>
                  <span className={uploadStep === 1 ? "text-indigo-700 font-medium" : "text-gray-400"}>Colonnes</span>
                  <ChevronDown className="w-3 h-3 -rotate-90" />
                  <span className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold", uploadStep === 2 ? "bg-indigo-600 text-white" : "bg-gray-200 text-gray-500")}>2</span>
                  <span className={uploadStep === 2 ? "text-indigo-700 font-medium" : "text-gray-400"}>Liste</span>
                </div>
                <button onClick={resetUploadModal} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {parsingHeaders ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                  <span className="ml-3 text-sm text-gray-500">Analyse du fichier...</span>
                </div>
              ) : uploadStep === 1 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-600">
                      <strong>{parsedColumns.length}</strong> colonnes détectées — cochez celles à importer et renommez si besoin.
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setColMapping((prev) => prev.map((m) => ({ ...m, selected: true })))}
                        className="text-[10px] text-indigo-600 hover:text-indigo-800 font-medium cursor-pointer"
                      >Tout cocher</button>
                      <button
                        onClick={() => setColMapping((prev) => prev.map((m) => ({ ...m, selected: false })))}
                        className="text-[10px] text-gray-500 hover:text-gray-700 font-medium cursor-pointer"
                      >Tout décocher</button>
                    </div>
                  </div>
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="w-8 px-2 py-2 text-center"></th>
                          <th className="px-2 py-2 text-left text-gray-600 font-semibold">Colonne fichier</th>
                          <th className="px-2 py-2 text-left text-gray-600 font-semibold">Titre affiché</th>
                          <th className="px-2 py-2 text-left text-gray-600 font-semibold">Champ connu</th>
                          <th className="px-2 py-2 text-left text-gray-600 font-semibold">Exemple</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {parsedColumns.map((col) => {
                          const mapping = colMapping.find((m) => m.index === col.index);
                          if (!mapping) return null;
                          return (
                            <tr key={col.index} className={cn("transition-colors", mapping.selected ? "bg-indigo-50/40" : "opacity-60")}>
                              <td className="px-2 py-1.5 text-center">
                                <input
                                  type="checkbox"
                                  checked={mapping.selected}
                                  onChange={() => setColMapping((prev) => prev.map((m) => m.index === col.index ? { ...m, selected: !m.selected } : m))}
                                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <span className="font-mono text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{col.original}</span>
                              </td>
                              <td className="px-2 py-1.5">
                                <input
                                  type="text"
                                  value={mapping.label}
                                  onChange={(e) => setColMapping((prev) => prev.map((m) => m.index === col.index ? { ...m, label: e.target.value } : m))}
                                  disabled={!mapping.selected}
                                  className="w-full px-1.5 py-0.5 text-[11px] border border-gray-200 rounded focus:ring-1 focus:ring-indigo-400 outline-none disabled:bg-gray-50 disabled:text-gray-400"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                {col.knownField ? (
                                  <span className="text-[10px] font-medium text-green-700 bg-green-50 px-1.5 py-0.5 rounded">{col.knownField}</span>
                                ) : (
                                  <span className="text-[10px] text-gray-400">extra</span>
                                )}
                              </td>
                              <td className="px-2 py-1.5 max-w-[200px]">
                                <span className="text-[10px] text-gray-500 truncate block">{col.samples[0] || "—"}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[10px] text-gray-400">
                    Les colonnes avec un &quot;champ connu&quot; seront mappées aux champs standard (Prénom, Nom, Email...).
                    Les autres seront importées en colonnes supplémentaires.
                    <strong className="text-indigo-600"> Score IA</strong> et <strong className="text-indigo-600">Analyse IA</strong> seront toujours ajoutés.
                  </p>
                </div>
              ) : (
                <div className="space-y-4 max-w-md mx-auto py-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Nom de la liste *</label>
                    <input
                      type="text"
                      value={uploadListName}
                      onChange={(e) => setUploadListName(e.target.value)}
                      placeholder="Ex: Gestion urbaine - IDF - 440"
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
                  <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-xs text-indigo-700">
                    <strong>{colMapping.filter((m) => m.selected).length}</strong> colonnes sélectionnées sur {parsedColumns.length} — <strong>{parsedTotalRows}</strong> lignes à importer
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-between items-center px-6 py-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={uploadStep === 1 ? resetUploadModal : () => setUploadStep(1)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
              >
                {uploadStep === 1 ? "Annuler" : "Retour"}
              </button>
              {uploadStep === 1 ? (
                <button
                  onClick={() => setUploadStep(2)}
                  disabled={colMapping.filter((m) => m.selected).length === 0}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
                >
                  Suivant <ChevronDown className="w-4 h-4 -rotate-90" />
                </button>
              ) : (
                <button
                  onClick={handleUploadWithList}
                  disabled={uploading || !uploadListName.trim() || !uploadListCompany.trim()}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
                >
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {uploading ? "Import en cours..." : `Importer ${parsedTotalRows} contacts`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal correction Score IA */}
      {scoreEditTarget && (() => {
        const origScore = parseInt(scoreEditTarget.ai_score || "0") || 0;
        const scoreChanged = scoreEditValue !== origScore;
        const reasonChanged = scoreEditReason.trim() !== (scoreEditTarget.ai_comment || "");
        const resumeChanged = scoreEditResume.trim() !== (scoreEditTarget.resume_entreprise || "");
        const hasScoreEdit = scoreChanged || reasonChanged;
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setScoreEditTarget(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Bot className="w-4 h-4 text-violet-600" />
                Fiche IA — {scoreEditTarget.prenom} {scoreEditTarget.nom}
              </h3>
              <button onClick={() => setScoreEditTarget(null)} className="p-0.5 text-gray-400 hover:text-gray-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-gray-50 rounded-lg p-3 space-y-0.5">
              <p className="text-[11px] font-medium text-gray-800">{scoreEditTarget.poste || "Poste inconnu"}</p>
              <p className="text-[10px] text-gray-500">{scoreEditTarget.entreprise || "Entreprise inconnue"}</p>
            </div>

            {/* Résumé entreprise — editable, no learning impact */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Résumé entreprise</label>
              <textarea
                value={scoreEditResume}
                onChange={(e) => setScoreEditResume(e.target.value)}
                rows={2}
                placeholder="Résumé de l'entreprise (secteur, taille, activité)..."
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-300 focus:border-gray-400 outline-none resize-none"
              />
            </div>

            {/* Score IA */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">Score IA</label>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((v) => {
                  const colors = [
                    "", "bg-red-100 text-red-700 border-red-300", "bg-orange-100 text-orange-700 border-orange-300",
                    "bg-yellow-100 text-yellow-700 border-yellow-300", "bg-lime-100 text-lime-700 border-lime-300",
                    "bg-green-100 text-green-700 border-green-300",
                  ];
                  const active = scoreEditValue === v;
                  return (
                    <button
                      key={v}
                      onClick={() => setScoreEditValue(v)}
                      className={cn(
                        "w-9 h-9 rounded-lg text-sm font-bold border-2 transition-all cursor-pointer",
                        active ? `${colors[v]} ring-2 ring-offset-1 ring-indigo-400 scale-110` : "bg-gray-50 text-gray-400 border-gray-200 hover:border-gray-300"
                      )}
                    >
                      {v}
                    </button>
                  );
                })}
                {scoreChanged && (
                  <span className="ml-2 text-[10px] text-violet-500 font-medium">
                    {origScore} → {scoreEditValue}
                  </span>
                )}
              </div>
            </div>

            {/* Analyse IA / Raison */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Analyse IA
                {hasScoreEdit && <span className="ml-1 text-violet-500">(sera mémorisée pour l&apos;apprentissage)</span>}
              </label>
              <textarea
                value={scoreEditReason}
                onChange={(e) => setScoreEditReason(e.target.value)}
                rows={3}
                placeholder="Raison du score / commentaire IA..."
                className={cn(
                  "w-full px-3 py-2 text-xs border rounded-lg outline-none resize-none",
                  hasScoreEdit
                    ? "border-violet-300 focus:ring-2 focus:ring-violet-400 focus:border-violet-400"
                    : "border-gray-300 focus:ring-2 focus:ring-gray-300 focus:border-gray-400"
                )}
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-1">
              <div className="text-[9px] text-gray-400">
                {hasScoreEdit ? "💡 Score modifié → sauvegarde dans la mémoire IA" : resumeChanged ? "📝 Résumé modifié (pas d'impact apprentissage)" : "Cliquez sur un score ou modifiez les champs"}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setScoreEditTarget(null)}
                  className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
                >
                  Annuler
                </button>
                {hasScoreEdit ? (
                  <button
                    onClick={submitScoreCorrection}
                    disabled={scoreEditSaving || !scoreEditReason.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 cursor-pointer"
                  >
                    {scoreEditSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Corriger &amp; mémoriser
                  </button>
                ) : resumeChanged ? (
                  <button
                    onClick={saveResumeOnly}
                    disabled={scoreEditSaving}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-gray-700 rounded-lg hover:bg-gray-800 disabled:opacity-50 cursor-pointer"
                  >
                    {scoreEditSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Enregistrer résumé
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Modal — Fiches entreprises (list) */}
      {showScoringCards && !editingScoringCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowScoringCards(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-violet-600" />
                Fiches scoring IA
              </h3>
              <button onClick={() => setShowScoringCards(false)} className="p-0.5 text-gray-400 hover:text-gray-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-gray-500">Cliquez sur une entreprise pour voir/modifier sa fiche de scoring IA.</p>
            {loadingScoringCards ? (
              <div className="flex items-center justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-violet-500" /></div>
            ) : (
              <div className="space-y-1.5">
                {knownCompanies.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">Aucune entreprise trouvée. Importez d&apos;abord un fichier CSV.</p>
                ) : (
                  knownCompanies.map((company) => {
                    const card = scoringCards.find((c) => c.company.toLowerCase() === company.toLowerCase());
                    return (
                      <button
                        key={company}
                        onClick={() => openScoringCard(company)}
                        className="w-full text-left px-3 py-2.5 rounded-lg border border-gray-200 hover:border-violet-300 hover:bg-violet-50 transition-colors cursor-pointer flex items-center gap-3"
                      >
                        <Building2 className="w-4 h-4 text-violet-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-900">{company}</p>
                          {card ? (
                            <p className="text-[10px] text-gray-500 truncate">
                              {card.validated ? <span className="text-green-600 font-medium">Validée</span> : <span className="text-orange-500">En cours</span>}
                              {" — "}{card.good_leads.length} bons / {card.bad_leads.length} mauvais leads
                            </p>
                          ) : (
                            <p className="text-[10px] text-gray-400">Pas encore configurée</p>
                          )}
                        </div>
                        <Star className={cn("w-3.5 h-3.5 flex-shrink-0", card?.validated ? "text-green-500" : "text-gray-300")} />
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal — Fiche scoring IA (edit) */}
      {editingScoringCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setEditingScoringCard(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-xl z-10">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-violet-600" />
                Fiche scoring — {editingScoringCard.company}
              </h3>
              <button onClick={() => setEditingScoringCard(null)} className="p-0.5 text-gray-400 hover:text-gray-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-4 space-y-5">
              {/* Product */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Quel produit vendez-vous ?</label>
                <textarea
                  value={scoringCardForm.product}
                  onChange={(e) =>
                    setScoringCardForm((f) => ({
                      ...f,
                      product: trimToMaxWords(e.target.value, SCORING_TEXT_MAX_WORDS),
                    }))
                  }
                  rows={5}
                  placeholder="Ex: Simsell — simulateur de vente IA"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-400 focus:border-violet-400 outline-none resize-y"
                />
                <p className={cn("mt-1 text-[10px]", productWordCount >= SCORING_TEXT_MAX_WORDS ? "text-red-600" : "text-gray-500")}>
                  {productWordCount}/{SCORING_TEXT_MAX_WORDS} mots ({Math.max(0, SCORING_TEXT_MAX_WORDS - productWordCount)} restants)
                </p>
              </div>

              {/* Value proposition */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Quelle est la valeur ajoutée pour le client ?</label>
                <textarea
                  value={scoringCardForm.value_proposition}
                  onChange={(e) =>
                    setScoringCardForm((f) => ({
                      ...f,
                      value_proposition: trimToMaxWords(e.target.value, SCORING_TEXT_MAX_WORDS),
                    }))
                  }
                  rows={7}
                  placeholder="Ex: +30% de performance commerciale, déploiement en 1 jour..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-400 focus:border-violet-400 outline-none resize-y"
                />
                <p className={cn("mt-1 text-[10px]", valuePropWordCount >= SCORING_TEXT_MAX_WORDS ? "text-red-600" : "text-gray-500")}>
                  {valuePropWordCount}/{SCORING_TEXT_MAX_WORDS} mots ({Math.max(0, SCORING_TEXT_MAX_WORDS - valuePropWordCount)} restants)
                </p>
              </div>

              {/* 3 best client types */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Quels sont vos 3 meilleurs types de clients ?</label>
                <div className="space-y-1.5">
                  {scoringCardForm.ideal_client_types.map((t, i) => (
                    <input
                      key={i}
                      type="text"
                      value={t}
                      onChange={(e) => {
                        const arr = [...scoringCardForm.ideal_client_types];
                        arr[i] = e.target.value;
                        setScoringCardForm((f) => ({ ...f, ideal_client_types: arr }));
                      }}
                      placeholder={`Type de client ${i + 1}`}
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-400 focus:border-violet-400 outline-none"
                    />
                  ))}
                </div>
              </div>

              {/* Company size */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Taille d&apos;entreprise</label>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-0.5">Idéale</label>
                    <input
                      type="text"
                      value={scoringCardForm.company_size_ideal}
                      onChange={(e) => setScoringCardForm((f) => ({ ...f, company_size_ideal: e.target.value }))}
                      placeholder="Ex: 500-10k"
                      className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-400 focus:border-violet-400 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-0.5">Minimale</label>
                    <input
                      type="text"
                      value={scoringCardForm.company_size_min}
                      onChange={(e) => setScoringCardForm((f) => ({ ...f, company_size_min: e.target.value }))}
                      placeholder="Ex: 50"
                      className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-400 focus:border-violet-400 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-0.5">Maximale</label>
                    <input
                      type="text"
                      value={scoringCardForm.company_size_max}
                      onChange={(e) => setScoringCardForm((f) => ({ ...f, company_size_max: e.target.value }))}
                      placeholder="Ex: 100k+"
                      className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-400 focus:border-violet-400 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Good leads */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                    <ThumbsUp className="w-3.5 h-3.5 text-green-600" />
                    Bons leads ({scoringGoodLeads.length}/10)
                  </label>
                  {scoringGoodLeads.length < 10 && (
                    <button
                      onClick={() => toggleScoringLeadPicker("good")}
                      className="text-[10px] text-violet-600 hover:underline cursor-pointer font-medium"
                    >
                      + Ajouter
                    </button>
                  )}
                </div>
                {scoringGoodLeads.length === 0 ? (
                  <p className="text-[10px] text-gray-400 italic">Aucun bon lead sélectionné</p>
                ) : (
                  <div className="space-y-1">
                    {scoringGoodLeads.map((lead) => (
                      <div key={lead.prospect_id} className="flex items-center gap-2 px-2 py-1.5 bg-green-50 border border-green-200 rounded-lg text-xs">
                        <ThumbsUp className="w-3 h-3 text-green-600 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-gray-800">{lead.name}</span>
                          <span className="text-gray-500 ml-1">— {lead.poste || "?"} @ {lead.entreprise || "?"}</span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <select
                            value={lead.rating}
                            onChange={(e) => setScoringGoodLeads((prev) => prev.map((l) => l.prospect_id === lead.prospect_id ? { ...l, rating: Number(e.target.value) } : l))}
                            className="text-[10px] border border-green-300 rounded px-1 py-0.5 bg-white outline-none cursor-pointer"
                          >
                            {[5, 4, 3].map((v) => <option key={v} value={v}>{v}/5</option>)}
                          </select>
                          <button onClick={() => removeScoringLead(lead.prospect_id, "good")} className="text-gray-400 hover:text-red-500 cursor-pointer"><X className="w-3 h-3" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {/* Inline reason for each good lead */}
                {scoringGoodLeads.length > 0 && (
                  <div className="mt-1.5 space-y-1">
                    {scoringGoodLeads.filter((l) => !l.reason).length > 0 && (
                      <p className="text-[9px] text-orange-500 italic">Justifiez pourquoi chaque lead est bon :</p>
                    )}
                    {scoringGoodLeads.map((lead) => (
                      <input
                        key={lead.prospect_id}
                        type="text"
                        value={lead.reason}
                        onChange={(e) => setScoringGoodLeads((prev) => prev.map((l) => l.prospect_id === lead.prospect_id ? { ...l, reason: e.target.value } : l))}
                        placeholder={`Pourquoi ${lead.name} est un bon lead ?`}
                        className="w-full px-2 py-1 text-[10px] border border-gray-200 rounded-md focus:ring-1 focus:ring-green-300 outline-none"
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Bad leads */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                    <ThumbsDown className="w-3.5 h-3.5 text-red-500" />
                    Mauvais leads ({scoringBadLeads.length}/10)
                  </label>
                  {scoringBadLeads.length < 10 && (
                    <button
                      onClick={() => toggleScoringLeadPicker("bad")}
                      className="text-[10px] text-violet-600 hover:underline cursor-pointer font-medium"
                    >
                      + Ajouter
                    </button>
                  )}
                </div>
                {scoringBadLeads.length === 0 ? (
                  <p className="text-[10px] text-gray-400 italic">Aucun mauvais lead sélectionné</p>
                ) : (
                  <div className="space-y-1">
                    {scoringBadLeads.map((lead) => (
                      <div key={lead.prospect_id} className="flex items-center gap-2 px-2 py-1.5 bg-red-50 border border-red-200 rounded-lg text-xs">
                        <ThumbsDown className="w-3 h-3 text-red-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-gray-800">{lead.name}</span>
                          <span className="text-gray-500 ml-1">— {lead.poste || "?"} @ {lead.entreprise || "?"}</span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <select
                            value={lead.rating}
                            onChange={(e) => setScoringBadLeads((prev) => prev.map((l) => l.prospect_id === lead.prospect_id ? { ...l, rating: Number(e.target.value) } : l))}
                            className="text-[10px] border border-red-300 rounded px-1 py-0.5 bg-white outline-none cursor-pointer"
                          >
                            {[1, 2, 3].map((v) => <option key={v} value={v}>{v}/5</option>)}
                          </select>
                          <button onClick={() => removeScoringLead(lead.prospect_id, "bad")} className="text-gray-400 hover:text-red-500 cursor-pointer"><X className="w-3 h-3" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {scoringBadLeads.length > 0 && (
                  <div className="mt-1.5 space-y-1">
                    {scoringBadLeads.filter((l) => !l.reason).length > 0 && (
                      <p className="text-[9px] text-orange-500 italic">Justifiez pourquoi chaque lead est mauvais :</p>
                    )}
                    {scoringBadLeads.map((lead) => (
                      <input
                        key={lead.prospect_id}
                        type="text"
                        value={lead.reason}
                        onChange={(e) => setScoringBadLeads((prev) => prev.map((l) => l.prospect_id === lead.prospect_id ? { ...l, reason: e.target.value } : l))}
                        placeholder={`Pourquoi ${lead.name} est un mauvais lead ?`}
                        className="w-full px-2 py-1 text-[10px] border border-gray-200 rounded-md focus:ring-1 focus:ring-red-300 outline-none"
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Lead picker dropdown */}
              {scoringLeadPickerType && (
                <div className="border border-violet-200 rounded-lg p-3 bg-violet-50 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-violet-800">
                      Sélectionner un {scoringLeadPickerType === "good" ? "bon" : "mauvais"} lead
                    </p>
                    <button onClick={() => setScoringLeadPickerType(null)} className="text-gray-400 hover:text-gray-600 cursor-pointer"><X className="w-3.5 h-3.5" /></button>
                  </div>
                  <input
                    value={scoringLeadSearch}
                    onChange={(e) => setScoringLeadSearch(e.target.value)}
                    placeholder="Rechercher par prénom ou nom..."
                    className="w-full px-2 py-1.5 text-xs border border-violet-200 bg-white rounded-lg outline-none focus:border-violet-400"
                  />
                  <div className="max-h-40 overflow-y-auto space-y-0.5">
                    {(() => {
                      const companyProspects = prospects.filter((p) => {
                        const pList = lists.find((l) => l.id === p.list_id);
                        return pList && pList.company.toLowerCase() === editingScoringCard.company.toLowerCase();
                      });
                      const usedIds = new Set([...scoringGoodLeads.map((l) => l.prospect_id), ...scoringBadLeads.map((l) => l.prospect_id)]);
                      const available = companyProspects.filter((p) => !usedIds.has(p.id));
                      const q = scoringLeadSearch.trim().toLowerCase();
                      const searched = q
                        ? available.filter((p) =>
                            (p.prenom || "").toLowerCase().includes(q) ||
                            (p.nom || "").toLowerCase().includes(q) ||
                            `${p.prenom || ""} ${p.nom || ""}`.toLowerCase().includes(q)
                          )
                        : available;
                      const remaining = scoringLeadPickerType === "good"
                        ? Math.max(0, 10 - scoringGoodLeads.length)
                        : Math.max(0, 10 - scoringBadLeads.length);
                      const selectedCount = searched.filter((p) => scoringLeadSelectedIds.has(p.id)).length;

                      if (searched.length === 0) {
                        return <p className="text-[10px] text-gray-400 text-center py-2">Aucun prospect disponible pour cette entreprise</p>;
                      }

                      return (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between px-1 py-1">
                            <p className="text-[10px] text-violet-700">
                              {searched.length} résultat(s) — {remaining} place(s) restante(s)
                            </p>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => addSelectedScoringLeads(scoringLeadPickerType, searched)}
                                disabled={selectedCount === 0 || remaining === 0}
                                className="text-[10px] px-2 py-1 rounded bg-violet-600 text-white disabled:opacity-40 cursor-pointer"
                              >
                                Ajouter sélection ({selectedCount})
                              </button>
                              <button
                                onClick={() => setScoringLeadSelectedIds(new Set())}
                                className="text-[10px] text-gray-500 hover:text-gray-700 cursor-pointer"
                              >
                                Vider
                              </button>
                            </div>
                          </div>

                          {searched.slice(0, 120).map((p) => (
                            <div
                              key={p.id}
                              className="w-full px-2 py-1.5 rounded-md hover:bg-white text-xs transition-colors flex items-center gap-2"
                            >
                              <input
                                type="checkbox"
                                checked={scoringLeadSelectedIds.has(p.id)}
                                onChange={() => toggleScoringLeadSelect(p.id)}
                                className="accent-violet-600 cursor-pointer"
                              />
                              <Users className="w-3 h-3 text-violet-500 flex-shrink-0" />
                              <span className="font-medium text-gray-800">{p.prenom} {p.nom}</span>
                              <span className="text-gray-500 truncate">— {p.poste || "?"} @ {p.entreprise || "?"}</span>
                              {p.ai_score && <span className="ml-auto text-[10px] font-bold text-gray-500">{p.ai_score}/5</span>}
                              <button
                                onClick={() => addScoringLead(p, scoringLeadPickerType)}
                                className="ml-2 text-[10px] px-1.5 py-0.5 rounded border border-violet-300 text-violet-700 cursor-pointer"
                              >
                                +1
                              </button>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Validation status */}
              <div className={cn(
                "rounded-lg p-3 text-xs flex items-center gap-2",
                scoringGoodLeads.length >= 10 && scoringBadLeads.length >= 10
                  ? "bg-green-50 border border-green-200 text-green-700"
                  : "bg-orange-50 border border-orange-200 text-orange-700"
              )}>
                {scoringGoodLeads.length >= 10 && scoringBadLeads.length >= 10 ? (
                  <><Check className="w-4 h-4" /> Fiche validée — 10+ bons et 10+ mauvais leads renseignés</>
                ) : (
                  <><Star className="w-4 h-4" /> Encore {Math.max(0, 10 - scoringGoodLeads.length)} bon(s) et {Math.max(0, 10 - scoringBadLeads.length)} mauvais lead(s) requis pour valider</>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-3 flex justify-between items-center rounded-b-xl">
              <button
                onClick={() => setEditingScoringCard(null)}
                className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={saveScoringCard}
                disabled={scoringCardSaving || !scoringCardForm.product.trim()}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 cursor-pointer"
              >
                {scoringCardSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Sauvegarder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
