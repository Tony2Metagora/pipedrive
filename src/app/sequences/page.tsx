"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Mail, Plus, Loader2, Send, Pause, Square, Users,
  ChevronRight, Eye, Upload, Play, X, Check, FileUp,
  ArrowLeft, Clock, MousePointerClick, Reply, AlertTriangle,
  Settings2, CheckSquare, SquareIcon, Zap, Shield, MessageSquare, Sparkles, Save,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────

interface Campaign {
  id: number;
  name: string;
  status: string;
  created_at: string;
  max_leads_per_day?: number;
  stop_lead_settings?: string;
  track_settings?: string[];
  enable_ai_esp_matching?: boolean;
  scheduler_cron_value?: { tz: string; days: number[]; endHour: string; startHour: string };
}

interface EmailAccount {
  id: number;
  from_name: string;
  from_email: string;
  type: string;
  is_smtp_success: boolean;
  message_per_day?: number;
  daily_sent_count?: number;
  warmup_details?: { status: string; warmup_reputation: string; total_sent_count: number; total_spam_count: number };
}

interface CampaignStats {
  sent_count: number;
  open_count: number;
  click_count: number;
  reply_count: number;
  bounce_count: number;
  unsubscribe_count?: number;
  total_leads: number;
}

interface SequenceStep {
  seq_number: number;
  seq_delay_details: { delay_in_days: number };
  subject: string;
  email_body: string;
}

interface LeadEntry {
  campaign_lead_map_id: number;
  status: string;
  lead: {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    company_name: string | null;
    is_unsubscribed: boolean;
  };
}

interface LeadsResponse {
  total_leads: string;
  data: LeadEntry[];
}

interface LeadMessage {
  type: string;
  time: string;
  email_body?: string;
  subject?: string;
  from_email?: string;
}

type View = "list" | "detail";
type DetailTab = "overview" | "leads" | "sequences" | "settings";

// ─── Helpers ────────────────────────────────────────────

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  DRAFTED: { label: "Brouillon", color: "bg-gray-100 text-gray-600" },
  STARTED: { label: "Active", color: "bg-green-100 text-green-700" },
  ACTIVE: { label: "Active", color: "bg-green-100 text-green-700" },
  PAUSED: { label: "En pause", color: "bg-yellow-100 text-yellow-700" },
  STOPPED: { label: "Arrêtée", color: "bg-red-100 text-red-700" },
  COMPLETED: { label: "Terminée", color: "bg-blue-100 text-blue-700" },
};

const LEAD_STATUS_MAP: Record<string, { label: string; color: string }> = {
  STARTED: { label: "Démarré", color: "text-blue-600" },
  INPROGRESS: { label: "En cours", color: "text-indigo-600" },
  COMPLETED: { label: "Terminé", color: "text-green-600" },
  PAUSED: { label: "Pause", color: "text-yellow-600" },
  STOPPED: { label: "Stoppé", color: "text-red-600" },
};

function statusBadge(s: string) {
  const st = STATUS_MAP[s] || { label: s, color: "bg-gray-100 text-gray-600" };
  return <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium", st.color)}>{st.label}</span>;
}

function parseCSVLeads(text: string) {
  const lines = text.trim().split("\n").filter(Boolean);
  if (!lines.length) return [];

  // Detect separator: use whichever of ;,\t appears most in first line
  const first = lines[0];
  const counts = { ";": (first.match(/;/g) || []).length, ",": (first.match(/,/g) || []).length, "\t": (first.match(/\t/g) || []).length };
  const sep = counts[";"] >= counts[","] && counts[";"] >= counts["\t"] ? ";" : counts["\t"] >= counts[","] ? "\t" : ",";

  const splitLine = (line: string) => {
    // Handle quoted fields (CSV standard)
    const parts: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === sep && !inQuotes) { parts.push(current.trim()); current = ""; continue; }
      current += ch;
    }
    parts.push(current.trim());
    return parts;
  };

  // Check if first line is a header row
  const headerCells = splitLine(first).map((s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
  const hasHeader = headerCells.some((h) => ["email", "e-mail", "mail", "courriel"].includes(h));

  if (hasHeader) {
    // Map column names to indices
    const colMap: Record<string, number> = {};
    headerCells.forEach((h, i) => {
      if (["email", "e-mail", "mail", "courriel"].includes(h)) colMap.email = i;
      else if (["prenom", "first_name", "firstname", "first name", "prénom"].includes(h)) colMap.first_name = i;
      else if (["nom", "last_name", "lastname", "last name", "name"].includes(h)) colMap.last_name = i;
      else if (["entreprise", "company", "company_name", "societe", "société", "organization"].includes(h)) colMap.company = i;
      else if (["telephone", "phone", "tel", "phone_number", "téléphone"].includes(h)) colMap.phone = i;
      else if (["poste", "title", "job_title", "fonction", "job title", "position"].includes(h)) colMap.title = i;
      else if (["linkedin", "linkedin_profile", "linkedin_url"].includes(h)) colMap.linkedin = i;
      else if (["ville", "city", "location"].includes(h)) colMap.location = i;
    });

    return lines.slice(1).map((line) => {
      const parts = splitLine(line);
      return {
        email: parts[colMap.email ?? -1] || "",
        first_name: parts[colMap.first_name ?? -1] || "",
        last_name: parts[colMap.last_name ?? -1] || "",
        company_name: parts[colMap.company ?? -1] || "",
        phone_number: parts[colMap.phone ?? -1] || undefined,
        location: parts[colMap.location ?? -1] || undefined,
        linkedin_profile: parts[colMap.linkedin ?? -1] || undefined,
        custom_fields: colMap.title !== undefined ? { title: parts[colMap.title] || "" } : undefined,
      };
    }).filter((l) => l.email.includes("@"));
  }

  // No header: assume email, first_name, last_name, company_name
  return lines.map((line) => {
    const parts = splitLine(line);
    // Find which column has the email
    const emailIdx = parts.findIndex((p) => p.includes("@"));
    if (emailIdx < 0) return null;
    const remaining = parts.filter((_, i) => i !== emailIdx);
    return {
      email: parts[emailIdx],
      first_name: remaining[0] || "",
      last_name: remaining[1] || "",
      company_name: remaining[2] || "",
    };
  }).filter((l): l is NonNullable<typeof l> => l !== null && l.email.includes("@"));
}

// ─── Main Component ─────────────────────────────────────

export default function SequencesPage() {
  const [view, setView] = useState<View>("list");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [allAccounts, setAllAccounts] = useState<EmailAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Create
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  // Detail
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const [detailLoading, setDetailLoading] = useState(false);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [stats, setStats] = useState<CampaignStats | null>(null);
  const [sequences, setSequences] = useState<SequenceStep[]>([]);
  const [leadsResp, setLeadsResp] = useState<LeadsResponse | null>(null);
  const [campaignAccounts, setCampaignAccounts] = useState<EmailAccount[]>([]);

  // Lead filters
  const [leadFilter, setLeadFilter] = useState<string>("");

  // Lead message history
  const [msgLeadId, setMsgLeadId] = useState<number | null>(null);
  const [messages, setMessages] = useState<LeadMessage[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);

  // Import
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importPreview, setImportPreview] = useState<{ email: string; first_name: string; last_name: string; company_name: string; phone_number?: string; location?: string; linkedin_profile?: string; custom_fields?: Record<string, string> }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // Settings edit
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    stop_lead_settings: "REPLY_TO_AN_EMAIL",
    max_leads_per_day: 10,
    enable_ai_esp_matching: true,
    track_open: true,
    track_click: true,
  });

  // AI email generation
  const [showAiGen, setShowAiGen] = useState(false);
  const [aiGenLoading, setAiGenLoading] = useState(false);
  const [aiContext, setAiContext] = useState({ leadOrigin: "", leadProfile: "", campaignGoal: "", tone: "professionnel mais chaleureux, tutoiement" });
  const [aiEmails, setAiEmails] = useState<{ seq_number: number; delay_days: number; subject: string; body: string }[]>([]);

  // ─── Data fetching ──────────────────────────────────────

  const flash = (msg: string) => { setActionMsg(msg); setTimeout(() => setActionMsg(null), 3500); };

  const fetchCampaigns = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/sequences");
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setCampaigns(d.campaigns || []);
      setAllAccounts(d.emailAccounts || []);
    } catch (e) { setError(String(e)); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  const openDetail = useCallback(async (id: number, filter?: string) => {
    setSelectedId(id); setView("detail"); setDetailLoading(true); setError(null);
    try {
      const qs = new URLSearchParams();
      if (filter) qs.set("emailStatus", filter);
      const res = await fetch(`/api/sequences/${id}?${qs.toString()}`);
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setCampaign(d.campaign);
      setStats(d.stats);
      setSequences(d.sequences || []);
      setLeadsResp(d.leads || { total_leads: "0", data: [] });
      setCampaignAccounts(d.campaignAccounts || []);
      // Init settings form from campaign
      if (d.campaign) {
        const c = d.campaign as Campaign;
        const ts = c.track_settings || [];
        setSettingsForm({
          stop_lead_settings: c.stop_lead_settings || "REPLY_TO_AN_EMAIL",
          max_leads_per_day: c.max_leads_per_day || 10,
          enable_ai_esp_matching: c.enable_ai_esp_matching !== false,
          track_open: !ts.includes("DONT_EMAIL_OPEN"),
          track_click: !ts.includes("DONT_LINK_CLICK"),
        });
      }
    } catch (e) { setError(String(e)); }
    setDetailLoading(false);
  }, []);

  const doAction = async (action: string, body: Record<string, unknown> = {}) => {
    if (!selectedId) return;
    setActionLoading(true); setError(null);
    try {
      const res = await fetch(`/api/sequences/${selectedId}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      flash("Action effectuée");
      await openDetail(selectedId, leadFilter);
    } catch (e) { setError(String(e)); }
    setActionLoading(false);
  };

  // ─── Lead message history ───────────────────────────────

  const openMessages = async (leadId: number) => {
    if (!selectedId) return;
    setMsgLeadId(leadId); setMsgLoading(true); setMessages([]);
    try {
      const res = await fetch(`/api/sequences/${selectedId}?leadId=${leadId}`);
      const d = await res.json();
      setMessages(d.messages || []);
    } catch (e) { setError(String(e)); }
    setMsgLoading(false);
  };

  // ─── Import helpers ─────────────────────────────────────

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setImportText(text);
      setImportPreview(parseCSVLeads(text));
    };
    reader.readAsText(file);
  };

  useEffect(() => {
    if (importText.trim()) setImportPreview(parseCSVLeads(importText));
    else setImportPreview([]);
  }, [importText]);

  const submitImport = async () => {
    if (!importPreview.length) { setError("Aucun email valide"); return; }
    await doAction("add-leads", { leads: importPreview });
    setShowImport(false); setImportText(""); setImportPreview([]);
  };

  // ─── AI email generation ────────────────────────────────

  const generateAiEmails = async () => {
    if (!aiContext.campaignGoal.trim()) { setError("Décrivez le but de la campagne"); return; }
    setAiGenLoading(true); setError(null);
    try {
      const res = await fetch("/api/sequences/generate-emails", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignName: campaign?.name || "",
          leadOrigin: aiContext.leadOrigin,
          leadProfile: aiContext.leadProfile,
          campaignGoal: aiContext.campaignGoal,
          tone: aiContext.tone,
          senderName: "Tony",
        }),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setAiEmails(d.emails || []);
    } catch (e) { setError(String(e)); }
    setAiGenLoading(false);
  };

  const saveAiEmails = async () => {
    if (!aiEmails.length || !selectedId) return;
    const formatted = aiEmails.map((e) => ({
      subject: e.subject,
      email_body: e.body,
      seq_number: e.seq_number,
      seq_delay_details: { delay_in_days: e.delay_days },
    }));
    await doAction("save-sequences", { sequences: formatted });
    setAiEmails([]);
    setShowAiGen(false);
    flash("Séquence IA sauvegardée !");
    if (selectedId) openDetail(selectedId);
  };

  // ─── Create campaign ───────────────────────────────────

  const createCampaign = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/sequences", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setShowCreate(false); setNewName("");
      await fetchCampaigns(); flash("Campagne créée");
    } catch (e) { setError(String(e)); }
    setCreating(false);
  };

  // ─── Email account toggle ──────────────────────────────

  const isAccountAssigned = (accId: number) => campaignAccounts.some((a) => a.id === accId);

  const toggleAccount = async (accId: number) => {
    if (isAccountAssigned(accId)) {
      await doAction("remove-email-accounts", { email_account_ids: [accId] });
    } else {
      await doAction("add-email-accounts", { email_account_ids: [accId] });
    }
  };

  // ─── Save settings ─────────────────────────────────────

  const saveSettings = async () => {
    const track: string[] = [];
    if (!settingsForm.track_open) track.push("DONT_EMAIL_OPEN");
    if (!settingsForm.track_click) track.push("DONT_LINK_CLICK");
    await doAction("update-settings", {
      settings: {
        track_settings: track,
        stop_lead_settings: settingsForm.stop_lead_settings,
        max_leads_per_day: settingsForm.max_leads_per_day,
        enable_ai_esp_matching: settingsForm.enable_ai_esp_matching,
      },
    });
    setSettingsOpen(false);
  };

  // ─── Shared UI ────────────────────────────────────────

  const MsgBanner = () => (
    <>
      {actionMsg && (
        <div className="mb-3 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700 flex items-center gap-2">
          <Check className="w-3.5 h-3.5" /> {actionMsg}
        </div>
      )}
      {error && (
        <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5" /> {error}
          <button onClick={() => setError(null)} className="ml-auto cursor-pointer"><X className="w-3 h-3" /></button>
        </div>
      )}
    </>
  );

  // ═══════════════════════════════════════════════════════
  // LIST VIEW
  // ═══════════════════════════════════════════════════════
  if (view === "list") {
    return (
      <>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center">
              <Mail className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Séquence Mail</h1>
              <p className="text-sm text-gray-500">{campaigns.length} campagne{campaigns.length !== 1 ? "s" : ""} Smartlead</p>
            </div>
          </div>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 cursor-pointer">
            <Plus className="w-4 h-4" /> Nouvelle campagne
          </button>
        </div>

        <MsgBanner />

        {allAccounts.length > 0 && (
          <div className="mb-4 flex items-center gap-2 text-xs text-gray-500">
            <Mail className="w-3.5 h-3.5" />
            {allAccounts.filter((a) => a.is_smtp_success).length} compte(s) email connecté(s) : {allAccounts.filter((a) => a.is_smtp_success).map((a) => a.from_email).join(", ")}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-violet-400" /></div>
        ) : campaigns.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <Mail className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p className="text-lg font-medium text-gray-600">Aucune campagne</p>
            <p className="text-sm text-gray-400 mt-1">Créez votre première campagne.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {campaigns.map((c) => (
              <button key={c.id} onClick={() => { setDetailTab("overview"); openDetail(c.id); }}
                className="w-full flex items-center gap-4 bg-white rounded-lg border border-gray-200 px-4 py-3 hover:border-violet-300 hover:shadow-sm transition-all cursor-pointer text-left">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">ID {c.id} • {new Date(c.created_at).toLocaleDateString("fr-FR")}</p>
                </div>
                {statusBadge(c.status)}
                <ChevronRight className="w-4 h-4 text-gray-300" />
              </button>
            ))}
          </div>
        )}

        {/* Create modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowCreate(false)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-sm font-semibold text-gray-900">Nouvelle campagne</h3>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nom de la campagne..."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-400 outline-none" autoFocus
                onKeyDown={(e) => e.key === "Enter" && createCampaign()} />
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg cursor-pointer">Annuler</button>
                <button onClick={createCampaign} disabled={creating || !newName.trim()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-violet-600 rounded-lg disabled:opacity-50 cursor-pointer">
                  {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Créer
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // ═══════════════════════════════════════════════════════
  // DETAIL VIEW
  // ═══════════════════════════════════════════════════════
  const leads = leadsResp?.data || [];
  const totalLeads = Number(leadsResp?.total_leads || 0);
  const assignedIds = new Set(campaignAccounts.map((a) => a.id));

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => { setView("list"); setCampaign(null); fetchCampaigns(); }} className="p-1.5 text-gray-400 hover:text-gray-600 cursor-pointer">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-gray-900 truncate">{campaign?.name || "Campagne"}</h1>
            {campaign && statusBadge(campaign.status)}
          </div>
          <p className="text-xs text-gray-400">ID {selectedId} • {campaignAccounts.length} compte(s) email</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => doAction("set-status", { status: "START" })} disabled={actionLoading}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 cursor-pointer">
            <Play className="w-3.5 h-3.5" /> Lancer
          </button>
          <button onClick={() => doAction("set-status", { status: "PAUSE" })} disabled={actionLoading}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-yellow-700 bg-yellow-100 rounded-lg hover:bg-yellow-200 disabled:opacity-50 cursor-pointer">
            <Pause className="w-3.5 h-3.5" /> Pause
          </button>
          <button onClick={() => doAction("set-status", { status: "STOP" })} disabled={actionLoading}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-100 rounded-lg hover:bg-red-200 disabled:opacity-50 cursor-pointer">
            <Square className="w-3.5 h-3.5" /> Stop
          </button>
        </div>
      </div>

      <MsgBanner />

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-4">
        {([
          { key: "overview", label: "Vue d'ensemble", icon: Eye },
          { key: "leads", label: `Leads (${totalLeads})`, icon: Users },
          { key: "sequences", label: `Séquences (${sequences.length})`, icon: Clock },
          { key: "settings", label: "Paramètres", icon: Settings2 },
        ] as { key: DetailTab; label: string; icon: typeof Eye }[]).map((t) => (
          <button key={t.key} onClick={() => setDetailTab(t.key)}
            className={cn("flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer",
              detailTab === t.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700")}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {detailLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-violet-400" /></div>
      ) : (
        <>
          {/* ═══ OVERVIEW TAB ═══ */}
          {detailTab === "overview" && (
            <div className="space-y-4">
              {/* Stats cards */}
              {stats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                  {[
                    { label: "Leads", value: stats.total_leads, icon: Users, color: "text-gray-700" },
                    { label: "Envoyés", value: stats.sent_count, icon: Send, color: "text-blue-600" },
                    { label: "Ouverts", value: stats.open_count, icon: Eye, color: "text-indigo-600" },
                    { label: "Clics", value: stats.click_count, icon: MousePointerClick, color: "text-violet-600" },
                    { label: "Réponses", value: stats.reply_count, icon: Reply, color: "text-green-600" },
                    { label: "Bounces", value: stats.bounce_count, icon: AlertTriangle, color: "text-orange-600" },
                    { label: "Désinscr.", value: stats.unsubscribe_count || 0, icon: X, color: "text-red-600" },
                  ].map((s) => (
                    <div key={s.label} className="bg-white rounded-lg border border-gray-200 px-3 py-2.5 text-center">
                      <s.icon className={cn("w-4 h-4 mx-auto mb-1", s.color)} />
                      <p className="text-lg font-bold text-gray-900">{s.value}</p>
                      <p className="text-[10px] text-gray-400">{s.label}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Email accounts — multi-select */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
                  <Mail className="w-4 h-4 text-violet-500" />
                  Comptes email assignés ({campaignAccounts.length})
                  <span className="text-[10px] text-gray-400 font-normal ml-1">Cliquez pour assigner/retirer</span>
                </h3>
                <div className="flex flex-wrap gap-2">
                  {allAccounts.map((a) => {
                    const assigned = assignedIds.has(a.id);
                    const ok = a.is_smtp_success;
                    return (
                      <button key={a.id} onClick={() => toggleAccount(a.id)} disabled={actionLoading || !ok}
                        className={cn("flex items-center gap-2 px-3 py-2 rounded-lg text-xs border transition-all cursor-pointer",
                          assigned ? "border-violet-400 bg-violet-50 text-violet-700 ring-1 ring-violet-300" :
                          ok ? "border-gray-200 bg-white text-gray-600 hover:border-violet-300" :
                          "border-gray-200 bg-gray-50 text-gray-400 opacity-50 cursor-not-allowed")}>
                        {assigned ? <CheckSquare className="w-3.5 h-3.5" /> : <SquareIcon className="w-3.5 h-3.5" />}
                        <div className="text-left">
                          <p className="font-medium">{a.from_email}</p>
                          <p className="text-[9px] text-gray-400">{a.from_name} • {a.message_per_day || "?"}/jour • {a.warmup_details?.warmup_reputation || "N/A"}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {campaignAccounts.length >= 2 && (
                  <p className="mt-2 text-[10px] text-gray-400 flex items-center gap-1">
                    <Zap className="w-3 h-3 text-violet-400" />
                    {campaignAccounts.length} comptes en rotation — chaque contact reçoit toujours du même expéditeur
                  </p>
                )}
              </div>

              {/* Quick sequences preview */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-violet-500" /> Séquences ({sequences.length})
                  </h3>
                  {sequences.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">Aucune séquence — <button onClick={() => setDetailTab("sequences")} className="text-violet-600 underline cursor-pointer">configurer</button></p>
                  ) : sequences.slice(0, 3).map((seq) => (
                    <div key={seq.seq_number} className="border border-gray-100 rounded-lg p-2.5 mb-1.5">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-bold text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded">Email {seq.seq_number}</span>
                        <span className="text-[10px] text-gray-400">{seq.seq_delay_details?.delay_in_days ? `+${seq.seq_delay_details.delay_in_days}j` : "J0"}</span>
                      </div>
                      <p className="text-xs font-medium text-gray-800 truncate">{seq.subject || "(pas de sujet)"}</p>
                    </div>
                  ))}
                  {sequences.length > 3 && <button onClick={() => setDetailTab("sequences")} className="text-[10px] text-violet-600 cursor-pointer">+{sequences.length - 3} de plus →</button>}
                </div>

                {/* Quick info */}
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-2">
                    <Shield className="w-4 h-4 text-gray-500" /> Config campagne
                  </h3>
                  <div className="space-y-1.5 text-xs text-gray-600">
                    <p>🛑 Stop lead : <span className="font-medium">{campaign?.stop_lead_settings === "REPLY_TO_AN_EMAIL" ? "Quand il répond" : campaign?.stop_lead_settings || "Non défini"}</span></p>
                    <p>📧 Max leads/jour : <span className="font-medium">{campaign?.max_leads_per_day || "Non défini"}</span></p>
                    <p>🤖 AI ESP Matching : <span className="font-medium">{campaign?.enable_ai_esp_matching !== false ? "Activé" : "Désactivé"}</span></p>
                    <p>📊 Tracking : <span className="font-medium">
                      {!campaign?.track_settings?.length ? "Opens + Clics" :
                       campaign.track_settings.includes("DONT_EMAIL_OPEN") && campaign.track_settings.includes("DONT_LINK_CLICK") ? "Désactivé" :
                       campaign.track_settings.includes("DONT_EMAIL_OPEN") ? "Clics uniquement" : "Opens uniquement"}
                    </span></p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══ LEADS TAB ═══ */}
          {detailTab === "leads" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {["", "is_replied", "is_opened", "is_clicked", "is_bounced", "is_unsubscribed", "not_replied"].map((f) => {
                    const labels: Record<string, string> = { "": "Tous", is_replied: "Répondu", is_opened: "Ouvert", is_clicked: "Cliqué", is_bounced: "Bounce", is_unsubscribed: "Désinscrit", not_replied: "Pas répondu" };
                    return (
                      <button key={f} onClick={() => { setLeadFilter(f); if (selectedId) openDetail(selectedId, f); }}
                        className={cn("px-2 py-1 text-[10px] font-medium rounded-lg cursor-pointer transition-colors",
                          leadFilter === f ? "bg-violet-100 text-violet-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200")}>
                        {labels[f]}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setShowImport(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-violet-700 bg-violet-50 rounded-lg hover:bg-violet-100 cursor-pointer">
                    <Upload className="w-3.5 h-3.5" /> Importer
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Email</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Nom</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Entreprise</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Statut</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-500">Messages</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.length === 0 ? (
                      <tr><td colSpan={5} className="text-center py-8 text-gray-400">Aucun lead{leadFilter ? " avec ce filtre" : ""}</td></tr>
                    ) : leads.map((entry) => {
                      const l = entry.lead;
                      const ls = LEAD_STATUS_MAP[entry.status] || { label: entry.status, color: "text-gray-500" };
                      return (
                        <tr key={entry.campaign_lead_map_id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="px-3 py-2 font-mono text-gray-700">{l.email}</td>
                          <td className="px-3 py-2 text-gray-700">{l.first_name} {l.last_name}</td>
                          <td className="px-3 py-2 text-gray-500">{l.company_name || "—"}</td>
                          <td className="px-3 py-2">
                            <span className={cn("font-medium", ls.color)}>{ls.label}</span>
                            {l.is_unsubscribed && <span className="ml-1 text-[9px] text-red-500">(désinscrit)</span>}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button onClick={() => openMessages(l.id)} className="p-1 text-gray-400 hover:text-violet-600 cursor-pointer" title="Historique messages">
                              <MessageSquare className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="px-3 py-2 bg-gray-50 text-[10px] text-gray-400 flex justify-between">
                  <span>{totalLeads} lead(s) total</span>
                  <span>Affichés : {leads.length}</span>
                </div>
              </div>
            </div>
          )}

          {/* ═══ SEQUENCES TAB ═══ */}
          {detailTab === "sequences" && (
            <div className="space-y-3">
              {/* AI Generation button */}
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-violet-500" /> Séquences ({sequences.length})
                </h3>
                <button onClick={() => setShowAiGen(!showAiGen)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-lg hover:bg-violet-100 cursor-pointer">
                  <Sparkles className="w-3.5 h-3.5" /> Générer avec l&apos;IA
                </button>
              </div>

              {/* AI Generation form */}
              {showAiGen && (
                <div className="bg-gradient-to-br from-violet-50 to-indigo-50 rounded-lg border border-violet-200 p-4 space-y-3">
                  <h4 className="text-xs font-semibold text-violet-800 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> Génération IA — Décrivez votre campagne
                  </h4>
                  <p className="text-[10px] text-violet-600">L&apos;IA analysera les séquences de vos autres campagnes et appliquera les bonnes pratiques du cold emailing pour générer 3 emails optimisés.</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-semibold text-gray-600">Origine des leads</label>
                      <input value={aiContext.leadOrigin} onChange={(e) => setAiContext({ ...aiContext, leadOrigin: e.target.value })}
                        placeholder="Ex: Salon Learning Days, scraping LinkedIn, base Dropcontact..."
                        className="w-full mt-1 px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-400 outline-none" />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-gray-600">Profil des leads (qui sont-ils ?)</label>
                      <input value={aiContext.leadProfile} onChange={(e) => setAiContext({ ...aiContext, leadProfile: e.target.value })}
                        placeholder="Ex: Responsables formation dans le retail/luxe, 500+ salariés"
                        className="w-full mt-1 px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-400 outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-600">But de la campagne *</label>
                    <textarea value={aiContext.campaignGoal} onChange={(e) => setAiContext({ ...aiContext, campaignGoal: e.target.value })} rows={2}
                      placeholder="Ex: Obtenir un RDV de démo pour présenter Simsell (formation immersive IA) aux responsables formation retail"
                      className="w-full mt-1 px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-400 outline-none resize-none" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-600">Ton</label>
                    <input value={aiContext.tone} onChange={(e) => setAiContext({ ...aiContext, tone: e.target.value })}
                      className="w-full mt-1 px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-400 outline-none" />
                  </div>
                  <button onClick={generateAiEmails} disabled={aiGenLoading || !aiContext.campaignGoal.trim()}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 cursor-pointer">
                    {aiGenLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    {aiGenLoading ? "Génération en cours (10-15s)..." : "Générer 3 emails"}
                  </button>

                  {/* AI Generated preview */}
                  {aiEmails.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-violet-200">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-semibold text-violet-700">Aperçu des emails générés</p>
                        <button onClick={saveAiEmails} disabled={actionLoading}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 cursor-pointer">
                          {actionLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                          Sauvegarder dans Smartlead
                        </button>
                      </div>
                      {aiEmails.map((e) => (
                        <div key={e.seq_number} className="bg-white rounded-lg border border-violet-100 p-3">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-[10px] font-bold text-violet-600 bg-violet-50 px-2 py-0.5 rounded">Email {e.seq_number}</span>
                            <span className="text-[10px] text-gray-400">{e.delay_days === 0 ? "Premier email (J0)" : `+${e.delay_days} jour(s)`}</span>
                          </div>
                          <p className="text-xs font-semibold text-gray-800 mb-1">Sujet : {e.subject}</p>
                          <div className="bg-gray-50 rounded p-2 text-[11px] text-gray-700 whitespace-pre-line">{e.body}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Existing sequences */}
              {sequences.length === 0 && !showAiGen ? (
                <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                  <Sparkles className="w-10 h-10 mx-auto mb-3 text-violet-300" />
                  <p className="text-sm font-medium text-gray-600">Aucune séquence email</p>
                  <p className="text-xs text-gray-400 mt-1">Utilisez l&apos;IA pour générer vos emails ou configurez-les dans Smartlead.</p>
                  <button onClick={() => setShowAiGen(true)} className="mt-3 flex items-center gap-1.5 mx-auto px-4 py-2 text-xs font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-lg hover:bg-violet-100 cursor-pointer">
                    <Sparkles className="w-3.5 h-3.5" /> Générer avec l&apos;IA
                  </button>
                </div>
              ) : sequences.map((seq) => (
                <div key={seq.seq_number} className="bg-white rounded-lg border border-gray-200 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold text-violet-600 bg-violet-50 px-2 py-1 rounded">Email {seq.seq_number}</span>
                    <span className="text-xs text-gray-400">{seq.seq_delay_details?.delay_in_days ? `Envoyé +${seq.seq_delay_details.delay_in_days} jour(s) après le précédent` : "Premier email (J0)"}</span>
                  </div>
                  <p className="text-sm font-semibold text-gray-800 mb-2">Sujet : {seq.subject || "(pas de sujet)"}</p>
                  <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-700 max-h-40 overflow-y-auto" dangerouslySetInnerHTML={{ __html: seq.email_body || "<em>Pas de contenu</em>" }} />
                </div>
              ))}
            </div>
          )}

          {/* ═══ SETTINGS TAB ═══ */}
          {detailTab === "settings" && (
            <div className="space-y-4">
              {/* Email accounts full detail */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
                  <Mail className="w-4 h-4 text-violet-500" />
                  Comptes email ({allAccounts.length} disponibles, {campaignAccounts.length} assignés)
                </h3>
                <div className="space-y-2">
                  {allAccounts.map((a) => {
                    const assigned = assignedIds.has(a.id);
                    const ok = a.is_smtp_success;
                    return (
                      <div key={a.id} className={cn("flex items-center gap-3 p-3 rounded-lg border transition-all",
                        assigned ? "border-violet-300 bg-violet-50" : "border-gray-200 bg-gray-50")}>
                        <button onClick={() => toggleAccount(a.id)} disabled={actionLoading || !ok}
                          className="cursor-pointer disabled:cursor-not-allowed">
                          {assigned ? <CheckSquare className="w-4 h-4 text-violet-600" /> : <SquareIcon className="w-4 h-4 text-gray-400" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-800">{a.from_email} <span className="text-gray-400">({a.from_name})</span></p>
                          <div className="flex items-center gap-3 mt-0.5 text-[10px] text-gray-400">
                            <span>{a.type}</span>
                            <span>SMTP: {ok ? "✅" : "❌"}</span>
                            <span>{a.message_per_day || "?"} mails/jour</span>
                            <span>Envoyés auj: {a.daily_sent_count || 0}</span>
                            {a.warmup_details && <span>Warmup: {a.warmup_details.status} ({a.warmup_details.warmup_reputation})</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Campaign settings */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <Settings2 className="w-4 h-4 text-gray-500" /> Paramètres campagne
                  </h3>
                  {!settingsOpen ? (
                    <button onClick={() => setSettingsOpen(true)} className="text-xs text-violet-600 cursor-pointer">Modifier</button>
                  ) : (
                    <div className="flex gap-2">
                      <button onClick={() => setSettingsOpen(false)} className="text-xs text-gray-500 cursor-pointer">Annuler</button>
                      <button onClick={saveSettings} disabled={actionLoading} className="flex items-center gap-1 text-xs text-white bg-violet-600 px-3 py-1 rounded-lg disabled:opacity-50 cursor-pointer">
                        {actionLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Enregistrer
                      </button>
                    </div>
                  )}
                </div>

                {settingsOpen ? (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-gray-700">Arrêter le lead quand :</label>
                      <select value={settingsForm.stop_lead_settings} onChange={(e) => setSettingsForm((p) => ({ ...p, stop_lead_settings: e.target.value }))}
                        className="mt-1 w-full px-3 py-1.5 text-xs border border-gray-300 rounded-lg outline-none">
                        <option value="REPLY_TO_AN_EMAIL">Il répond à un email</option>
                        <option value="OPENED_EMAIL">Il ouvre un email</option>
                        <option value="CLICKED_LINK">Il clique un lien</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700">Max leads/jour :</label>
                      <input type="number" value={settingsForm.max_leads_per_day} onChange={(e) => setSettingsForm((p) => ({ ...p, max_leads_per_day: Number(e.target.value) }))}
                        className="mt-1 w-full px-3 py-1.5 text-xs border border-gray-300 rounded-lg outline-none" min={1} />
                    </div>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input type="checkbox" checked={settingsForm.enable_ai_esp_matching} onChange={(e) => setSettingsForm((p) => ({ ...p, enable_ai_esp_matching: e.target.checked }))} />
                      AI ESP Matching (optimise la délivrabilité)
                    </label>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input type="checkbox" checked={settingsForm.track_open} onChange={(e) => setSettingsForm((p) => ({ ...p, track_open: e.target.checked }))} />
                      Tracker les ouvertures
                    </label>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input type="checkbox" checked={settingsForm.track_click} onChange={(e) => setSettingsForm((p) => ({ ...p, track_click: e.target.checked }))} />
                      Tracker les clics
                    </label>
                  </div>
                ) : (
                  <div className="space-y-1.5 text-xs text-gray-600">
                    <p>🛑 Stop lead : <span className="font-medium">{settingsForm.stop_lead_settings === "REPLY_TO_AN_EMAIL" ? "À la réponse" : settingsForm.stop_lead_settings === "OPENED_EMAIL" ? "À l'ouverture" : "Au clic"}</span></p>
                    <p>📧 Max leads/jour : <span className="font-medium">{settingsForm.max_leads_per_day}</span></p>
                    <p>🤖 AI ESP Matching : <span className="font-medium">{settingsForm.enable_ai_esp_matching ? "Activé" : "Désactivé"}</span></p>
                    <p>👁️ Track opens : <span className="font-medium">{settingsForm.track_open ? "Oui" : "Non"}</span></p>
                    <p>🔗 Track clics : <span className="font-medium">{settingsForm.track_click ? "Oui" : "Non"}</span></p>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══ IMPORT MODAL ═══ */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowImport(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-5 space-y-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-900">Importer des leads</h3>

            {/* File upload */}
            <div className="flex items-center gap-3">
              <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-lg hover:bg-violet-100 cursor-pointer">
                <FileUp className="w-4 h-4" /> Charger un fichier CSV
              </button>
              <input ref={fileRef} type="file" accept=".csv,.txt,.tsv" onChange={handleFileUpload} className="hidden" />
              <span className="text-[10px] text-gray-400">ou collez directement ci-dessous</span>
            </div>

            <p className="text-[10px] text-gray-500">Format : CSV avec en-têtes (Email, Prénom, Nom, Entreprise, Téléphone, Poste...) séparés par virgule, tab ou point-virgule. La colonne Email est détectée automatiquement.</p>
            <textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={6}
              placeholder={"Prénom;Nom;Email;Téléphone;Poste;Entreprise\nJohn;Doe;john@acme.com;0601020304;CEO;Acme Corp\nJane;Smith;jane@corp.com;;CTO;Corp Inc"}
              className="w-full px-3 py-2 text-xs font-mono border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-400 outline-none resize-none" />

            {/* Preview table */}
            {importPreview.length > 0 && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-3 py-1.5 bg-gray-50 text-[10px] font-medium text-gray-500">Aperçu : {importPreview.length} lead(s) valide(s)</div>
                <table className="w-full text-[10px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-2 py-1">Email</th>
                      <th className="text-left px-2 py-1">Prénom</th>
                      <th className="text-left px-2 py-1">Nom</th>
                      <th className="text-left px-2 py-1">Entreprise</th>
                      <th className="text-left px-2 py-1">Poste</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.slice(0, 10).map((l, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="px-2 py-1 font-mono">{l.email}</td>
                        <td className="px-2 py-1">{l.first_name}</td>
                        <td className="px-2 py-1">{l.last_name}</td>
                        <td className="px-2 py-1">{l.company_name}</td>
                        <td className="px-2 py-1 text-gray-400">{l.custom_fields?.title || ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {importPreview.length > 10 && <div className="px-2 py-1 text-[9px] text-gray-400">+{importPreview.length - 10} de plus...</div>}
              </div>
            )}

            <div className="flex justify-between items-center">
              <span className="text-[10px] text-gray-400">{importPreview.length} email(s) valide(s)</span>
              <div className="flex gap-2">
                <button onClick={() => { setShowImport(false); setImportText(""); setImportPreview([]); }} className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg cursor-pointer">Annuler</button>
                <button onClick={submitImport} disabled={actionLoading || !importPreview.length}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-violet-600 rounded-lg disabled:opacity-50 cursor-pointer">
                  {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  Importer {importPreview.length} lead(s)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MESSAGE HISTORY MODAL ═══ */}
      {msgLeadId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setMsgLeadId(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl p-5 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900">Historique messages (Lead #{msgLeadId})</h3>
              <button onClick={() => setMsgLeadId(null)} className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            {msgLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-violet-400" /></div>
            ) : messages.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-8">Aucun message échangé</p>
            ) : (
              <div className="space-y-3">
                {messages.map((m, i) => (
                  <div key={i} className={cn("rounded-lg p-3 text-xs", m.type === "REPLY" ? "bg-green-50 border border-green-200" : "bg-gray-50 border border-gray-200")}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", m.type === "REPLY" ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600")}>{m.type}</span>
                      <span className="text-[10px] text-gray-400">{new Date(m.time).toLocaleString("fr-FR")}</span>
                      {m.from_email && <span className="text-[10px] text-gray-400">de {m.from_email}</span>}
                    </div>
                    {m.subject && <p className="font-medium text-gray-800 mb-1">Sujet : {m.subject}</p>}
                    {m.email_body && <div className="text-gray-700 max-h-32 overflow-y-auto" dangerouslySetInnerHTML={{ __html: m.email_body }} />}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
