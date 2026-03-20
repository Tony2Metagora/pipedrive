"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Mail, Plus, Loader2, Send, Pause, Square, Users,
  BarChart3, ChevronRight, Eye, Upload, Play, X, Check,
  ArrowLeft, Clock, MousePointerClick, Reply, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Campaign {
  id: number;
  name: string;
  status: string;
  created_at: string;
}

interface EmailAccount {
  id: number;
  from_name: string;
  from_email: string;
  type: string;
  is_smtp_success: boolean;
}

interface CampaignStats {
  sent_count: number;
  open_count: number;
  click_count: number;
  reply_count: number;
  bounce_count: number;
  unsubscribe_count: number;
  total_leads: number;
}

interface SequenceStep {
  seq_number: number;
  seq_delay_details: { delay_in_days: number };
  subject: string;
  email_body: string;
}

type View = "list" | "detail";

export default function SequencesPage() {
  const [view, setView] = useState<View>("list");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [emailAccounts, setEmailAccounts] = useState<EmailAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create campaign
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  // Detail view
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<{
    campaign: Campaign | null;
    stats: CampaignStats | null;
    sequences: SequenceStep[];
    leads: unknown[];
  } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Actions
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Import leads modal
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sequences");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setCampaigns(data.campaigns || []);
      setEmailAccounts(data.emailAccounts || []);
    } catch (err) {
      setError(String(err));
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  const createCampaign = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/sequences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setShowCreate(false);
      setNewName("");
      await fetchCampaigns();
      setActionMsg("Campagne créée");
      setTimeout(() => setActionMsg(null), 3000);
    } catch (err) {
      setError(String(err));
    }
    setCreating(false);
  };

  const openDetail = async (id: number) => {
    setSelectedId(id);
    setView("detail");
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/sequences/${id}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setDetail(data);
    } catch (err) {
      setError(String(err));
    }
    setDetailLoading(false);
  };

  const campaignAction = async (action: string, body: Record<string, unknown> = {}) => {
    if (!selectedId) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/sequences/${selectedId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setActionMsg("Action effectuée");
      setTimeout(() => setActionMsg(null), 3000);
      await openDetail(selectedId);
    } catch (err) {
      setError(String(err));
    }
    setActionLoading(false);
  };

  const importLeads = async () => {
    const lines = importText.trim().split("\n").filter(Boolean);
    const leads = lines.map((line) => {
      const parts = line.split(/[,;\t]/).map((s) => s.trim());
      return {
        email: parts[0] || "",
        first_name: parts[1] || "",
        last_name: parts[2] || "",
        company_name: parts[3] || "",
      };
    }).filter((l) => l.email.includes("@"));

    if (!leads.length) {
      setError("Aucun email valide trouvé");
      return;
    }

    await campaignAction("add-leads", { leads });
    setShowImport(false);
    setImportText("");
  };

  const statusLabel = (s: string) => {
    const map: Record<string, { label: string; color: string }> = {
      DRAFTED: { label: "Brouillon", color: "bg-gray-100 text-gray-600" },
      STARTED: { label: "Active", color: "bg-green-100 text-green-700" },
      PAUSED: { label: "En pause", color: "bg-yellow-100 text-yellow-700" },
      STOPPED: { label: "Arrêtée", color: "bg-red-100 text-red-700" },
      COMPLETED: { label: "Terminée", color: "bg-blue-100 text-blue-700" },
    };
    return map[s] || { label: s, color: "bg-gray-100 text-gray-600" };
  };

  // ─── LIST VIEW ──────────────────────────────────────────
  if (view === "list") {
    return (
      <>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center">
              <Mail className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Séquence Mail</h1>
              <p className="text-sm text-gray-500">Campagnes Smartlead — {campaigns.length} campagne{campaigns.length > 1 ? "s" : ""}</p>
            </div>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Nouvelle campagne
          </button>
        </div>

        {/* Messages */}
        {actionMsg && (
          <div className="mb-4 px-4 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center gap-2">
            <Check className="w-4 h-4" /> {actionMsg}
          </div>
        )}
        {error && (
          <div className="mb-4 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> {error}
            <button onClick={() => setError(null)} className="ml-auto cursor-pointer"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {/* Email accounts summary */}
        {emailAccounts.length > 0 && (
          <div className="mb-4 flex items-center gap-2 text-xs text-gray-500">
            <Mail className="w-3.5 h-3.5" />
            Comptes email : {emailAccounts.filter((a) => a.is_smtp_success).map((a) => a.from_email).join(", ") || "aucun connecté"}
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <Mail className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p className="text-lg font-medium text-gray-600">Aucune campagne</p>
            <p className="text-sm text-gray-400 mt-1">Créez votre première campagne email.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {campaigns.map((c) => {
              const st = statusLabel(c.status);
              return (
                <button
                  key={c.id}
                  onClick={() => openDetail(c.id)}
                  className="w-full flex items-center gap-4 bg-white rounded-lg border border-gray-200 px-4 py-3 hover:border-violet-300 hover:shadow-sm transition-all cursor-pointer text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      ID {c.id} • Créée le {new Date(c.created_at).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                  <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium", st.color)}>
                    {st.label}
                  </span>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                </button>
              );
            })}
          </div>
        )}

        {/* Create campaign modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowCreate(false)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-sm font-semibold text-gray-900">Nouvelle campagne</h3>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nom de la campagne..."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-400 outline-none"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && createCampaign()}
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg cursor-pointer">Annuler</button>
                <button onClick={createCampaign} disabled={creating || !newName.trim()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-violet-600 rounded-lg disabled:opacity-50 cursor-pointer">
                  {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Créer
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // ─── DETAIL VIEW ────────────────────────────────────────
  const campaign = detail?.campaign;
  const stats = detail?.stats;
  const sequences = detail?.sequences || [];
  const leads = detail?.leads || [];
  const st = campaign ? statusLabel(campaign.status) : null;

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => { setView("list"); setDetail(null); }} className="p-1.5 text-gray-400 hover:text-gray-600 cursor-pointer">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-gray-900 truncate">{campaign?.name || "Campagne"}</h1>
            {st && <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium", st.color)}>{st.label}</span>}
          </div>
          <p className="text-xs text-gray-400">ID {selectedId}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => campaignAction("set-status", { status: "START" })}
            disabled={actionLoading}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" /> Lancer
          </button>
          <button
            onClick={() => campaignAction("set-status", { status: "PAUSE" })}
            disabled={actionLoading}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-yellow-700 bg-yellow-100 rounded-lg hover:bg-yellow-200 disabled:opacity-50 cursor-pointer"
          >
            <Pause className="w-3.5 h-3.5" /> Pause
          </button>
          <button
            onClick={() => campaignAction("set-status", { status: "STOP" })}
            disabled={actionLoading}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-100 rounded-lg hover:bg-red-200 disabled:opacity-50 cursor-pointer"
          >
            <Square className="w-3.5 h-3.5" /> Stop
          </button>
        </div>
      </div>

      {/* Messages */}
      {actionMsg && (
        <div className="mb-4 px-4 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center gap-2">
          <Check className="w-4 h-4" /> {actionMsg}
        </div>
      )}
      {error && (
        <div className="mb-4 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {error}
          <button onClick={() => setError(null)} className="ml-auto cursor-pointer"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {detailLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
        </div>
      ) : (
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
                { label: "Désinscr.", value: stats.unsubscribe_count, icon: X, color: "text-red-600" },
              ].map((s) => (
                <div key={s.label} className="bg-white rounded-lg border border-gray-200 px-3 py-2.5 text-center">
                  <s.icon className={cn("w-4 h-4 mx-auto mb-1", s.color)} />
                  <p className="text-lg font-bold text-gray-900">{s.value}</p>
                  <p className="text-[10px] text-gray-400">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Sequences */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-violet-500" />
                  Séquences ({sequences.length})
                </h3>
              </div>
              {sequences.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">Aucune séquence configurée</p>
              ) : (
                <div className="space-y-2">
                  {sequences.map((seq) => (
                    <div key={seq.seq_number} className="border border-gray-100 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded">Email {seq.seq_number}</span>
                        <span className="text-[10px] text-gray-400">
                          {seq.seq_delay_details?.delay_in_days ? `+${seq.seq_delay_details.delay_in_days}j` : "J0"}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-gray-800 truncate">{seq.subject || "(pas de sujet)"}</p>
                      <p className="text-[10px] text-gray-400 truncate mt-0.5">{seq.email_body?.replace(/<[^>]+>/g, "").slice(0, 80) || "..."}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Leads + Import */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-500" />
                  Leads ({Array.isArray(leads) ? leads.length : 0})
                </h3>
                <button
                  onClick={() => setShowImport(true)}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-violet-700 bg-violet-50 rounded-lg hover:bg-violet-100 cursor-pointer"
                >
                  <Upload className="w-3 h-3" />
                  Importer
                </button>
              </div>
              {!Array.isArray(leads) || leads.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">Aucun lead dans cette campagne</p>
              ) : (
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {(leads as { email?: string; first_name?: string; last_name?: string; lead_status?: string }[]).slice(0, 50).map((l, i) => (
                    <div key={i} className="flex items-center justify-between text-xs px-2 py-1.5 rounded hover:bg-gray-50">
                      <span className="text-gray-700 truncate">{l.first_name} {l.last_name} — {l.email}</span>
                      <span className="text-[9px] text-gray-400 shrink-0 ml-2">{l.lead_status || ""}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Email accounts */}
          {emailAccounts.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
                <Mail className="w-4 h-4 text-gray-500" />
                Comptes email
              </h3>
              <div className="flex flex-wrap gap-2">
                {emailAccounts.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => campaignAction("set-email-accounts", { email_account_ids: [a.id] })}
                    disabled={actionLoading}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border transition-colors cursor-pointer",
                      a.is_smtp_success
                        ? "border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
                        : "border-gray-200 bg-gray-50 text-gray-400"
                    )}
                  >
                    <Mail className="w-3 h-3" />
                    {a.from_email}
                    <span className="text-[9px] text-gray-400">({a.from_name})</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Import leads modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowImport(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-900">Importer des leads</h3>
            <p className="text-[10px] text-gray-500">Un lead par ligne : email, prénom, nom, entreprise (séparés par virgule ou tab)</p>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={8}
              placeholder={"john@acme.com, John, Doe, Acme Corp\njane@corp.com, Jane, Smith, Corp Inc"}
              className="w-full px-3 py-2 text-xs font-mono border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-400 outline-none resize-none"
              autoFocus
            />
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-gray-400">{importText.trim().split("\n").filter(Boolean).length} ligne(s)</span>
              <div className="flex gap-2">
                <button onClick={() => setShowImport(false)} className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg cursor-pointer">Annuler</button>
                <button
                  onClick={importLeads}
                  disabled={actionLoading || !importText.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-violet-600 rounded-lg disabled:opacity-50 cursor-pointer"
                >
                  {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  Importer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
