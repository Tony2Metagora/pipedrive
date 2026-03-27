"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Play, Plus, Save, Send, AlertCircle, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface AffCampaign {
  id: number;
  name: string;
  status: "draft" | "running" | "paused" | "completed";
  createdAt: string;
}

interface LeadRow {
  personId: number;
  email: string;
  name: string;
  company: string;
  dealId: number | null;
  dealTitle: string;
  pipelineId?: number | null;
  pipelineName?: string;
  stageId?: number | null;
  stageName?: string;
}

interface FollowupItem {
  id: number;
  leadEmail: string;
  leadName?: string;
  company?: string;
  subject: string;
  body: string;
  status: "draft" | "a_envoyer" | "en_cours" | "envoye" | "erreur" | "repondu";
  scheduledAt: string;
  lastEmailAt?: string;
  lastError?: string;
  sequenceStep?: number;
  totalSteps?: number;
  delayAfterPreviousMinutes?: number;
}

interface GeneratedLeadDraft {
  email: string;
  name: string;
  company: string;
  dealId: number | null;
  step1Subject: string;
  step1Body: string;
}

interface SequenceTemplate {
  step: number;
  enabled: boolean;
  delayMinutes: number;
  subject: string;
  body: string;
}

export default function SequencesAffairesPanel() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<AffCampaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [items, setItems] = useState<FollowupItem[]>([]);
  const [search, setSearch] = useState("");
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [selectedEmails, setSelectedEmails] = useState<Record<string, boolean>>({});
  const [newCampaignName, setNewCampaignName] = useState("");
  const [showSeriesBuilder, setShowSeriesBuilder] = useState(false);
  const [seriesTemplates, setSeriesTemplates] = useState<SequenceTemplate[]>([]);
  const [generatedLeadDrafts, setGeneratedLeadDrafts] = useState<GeneratedLeadDraft[]>([]);
  const [bulkPipeline, setBulkPipeline] = useState<string>("all");
  const [bulkStages, setBulkStages] = useState<string[]>([]);

  function clearFeedback() {
    setError(null);
    setMsg(null);
  }

  async function loadCampaigns() {
    const res = await fetch("/api/sequences/affaires/campaigns");
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Erreur chargement campagnes");
    setCampaigns(json.data || []);
    if (!selectedCampaignId && json.data?.length) setSelectedCampaignId(json.data[0].id);
  }

  async function loadLeads() {
    const res = await fetch(`/api/sequences/affaires/leads?search=${encodeURIComponent(search)}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Erreur chargement leads");
    setLeads(json.data || []);
  }

  async function loadCampaignDetail(campaignId: number) {
    const res = await fetch(`/api/sequences/affaires/campaigns/${campaignId}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Erreur chargement detail");
    setItems(json.data?.items || []);
  }

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await Promise.all([loadCampaigns(), loadLeads()]);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedCampaignId) return;
    loadCampaignDetail(selectedCampaignId).catch((e) => setError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCampaignId]);

  useEffect(() => {
    const t = setTimeout(() => {
      loadLeads().catch((e) => setError(String(e)));
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const selectedLeadRows = useMemo(
    () => leads.filter((l) => selectedEmails[l.email]),
    [leads, selectedEmails]
  );

  const pipelineOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const lead of leads) {
      if (!lead.pipelineId || !lead.pipelineName) continue;
      map.set(String(lead.pipelineId), lead.pipelineName);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [leads]);

  const stageOptionsForPipeline = useMemo(() => {
    if (bulkPipeline === "all") return [];
    const map = new Map<string, string>();
    for (const lead of leads) {
      if (String(lead.pipelineId || "") !== bulkPipeline) continue;
      if (!lead.stageId || !lead.stageName) continue;
      map.set(String(lead.stageId), lead.stageName);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [leads, bulkPipeline]);

  const leadsMatchingBulkFilter = useMemo(() => {
    return leads.filter((lead) => {
      if (bulkPipeline !== "all" && String(lead.pipelineId || "") !== bulkPipeline) return false;
      if (bulkStages.length > 0 && !bulkStages.includes(String(lead.stageId || ""))) return false;
      return true;
    });
  }, [leads, bulkPipeline, bulkStages]);

  const matchingSelectedCount = useMemo(
    () => leadsMatchingBulkFilter.filter((l) => selectedEmails[l.email]).length,
    [leadsMatchingBulkFilter, selectedEmails]
  );

  function toggleBulkStage(stageId: string) {
    setBulkStages((prev) =>
      prev.includes(stageId) ? prev.filter((id) => id !== stageId) : [...prev, stageId]
    );
  }

  function selectAllMatchingLeads() {
    if (leadsMatchingBulkFilter.length === 0) return;
    setSelectedEmails((prev) => {
      const next = { ...prev };
      for (const lead of leadsMatchingBulkFilter) next[lead.email] = true;
      return next;
    });
  }

  function unselectAllMatchingLeads() {
    if (leadsMatchingBulkFilter.length === 0) return;
    setSelectedEmails((prev) => {
      const next = { ...prev };
      for (const lead of leadsMatchingBulkFilter) delete next[lead.email];
      return next;
    });
  }

  async function createCampaign() {
    if (!newCampaignName.trim()) return;
    clearFeedback();
    try {
      setBusy(true);
      const res = await fetch("/api/sequences/affaires/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCampaignName.trim(), senderEmail: "tony@metagora.tech", cadenceMinutes: 10 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Creation impossible");
      setNewCampaignName("");
      await loadCampaigns();
      setSelectedCampaignId(json.data.id);
      setMsg("Campagne affaires creee");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function generateDrafts() {
    if (!selectedCampaignId) {
      setError("Creez d'abord une campagne (colonne de gauche) avant de generer les drafts.");
      return;
    }
    if (selectedLeadRows.length === 0) {
      setError("Selectionnez au moins un lead avant de generer.");
      return;
    }
    clearFeedback();
    try {
      setBusy(true);
      setMsg(`Generation de ${selectedLeadRows.length} drafts en cours... (Gmail + IA, peut prendre 15-30s)`);
      const res = await fetch("/api/sequences/affaires/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: selectedCampaignId,
          leads: selectedLeadRows.map((l) => ({
            email: l.email,
            name: l.name,
            company: l.company,
            dealId: l.dealId,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Generation impossible");
      const generated = json.data?.items || [];
      const errors = json.data?.errors || [];
      setItems(generated);
      const draftByEmail = new Map<string, { subject: string; body: string }>(
        generated.map((it: FollowupItem) => [it.leadEmail.toLowerCase(), { subject: it.subject, body: it.body }])
      );
      const leadDrafts: GeneratedLeadDraft[] = selectedLeadRows.map((lead) => {
        const draft = draftByEmail.get(lead.email.toLowerCase());
        return {
          email: lead.email,
          name: lead.name || "",
          company: lead.company || "",
          dealId: lead.dealId ?? null,
          step1Subject: draft?.subject || `Suivi - ${lead.company || lead.name || lead.email}`,
          step1Body: draft?.body || "Bonjour,\n\nJe me permets de revenir vers vous.\n\nTony",
        };
      });
      setGeneratedLeadDrafts(leadDrafts);
      const first = leadDrafts[0];
      setSeriesTemplates([
        { step: 1, enabled: true, delayMinutes: 0, subject: first?.step1Subject || "Suivi de notre echange", body: first?.step1Body || "Bonjour,\n\nJe me permets de revenir vers vous.\n\nTony" },
        { step: 2, enabled: true, delayMinutes: 1440, subject: "Relance {{prenom}}", body: "Bonjour {{prenom}},\n\nJe me permets de vous relancer concernant notre echange.\n\nTony" },
        { step: 3, enabled: false, delayMinutes: 2880, subject: "Suite a ma relance", body: "Bonjour {{prenom}},\n\nJe reviens vers vous une derniere fois.\n\nTony" },
        { step: 4, enabled: false, delayMinutes: 4320, subject: "Dernier message", body: "Bonjour {{prenom}},\n\nJe reste disponible si besoin.\n\nTony" },
        { step: 5, enabled: false, delayMinutes: 5760, subject: "Cloture de suivi", body: "Bonjour {{prenom}},\n\nSans retour de votre part, je cloture ce suivi.\n\nTony" },
      ]);
      setShowSeriesBuilder(true);
      if (errors.length > 0 && generated.length > 0) {
        setMsg(`${generated.length} drafts generes. ${errors.length} erreur(s): ${errors.map((e: { email: string }) => e.email).join(", ")}`);
      } else if (errors.length > 0 && generated.length === 0) {
        setError(`Echec pour tous les leads: ${errors.map((e: { error: string }) => e.error).join("; ")}`);
      } else {
        setMsg(`${generated.length} drafts generes avec succes !`);
      }
    } catch (e) {
      setError(`Erreur generation: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function validateSeries() {
    if (!selectedCampaignId) {
      setError("Selectionnez une campagne avant de valider la serie.");
      return;
    }
    if (!generatedLeadDrafts.length) {
      setError("Aucun lead genere pour construire la serie.");
      return;
    }
    const enabledCount = seriesTemplates.filter((t) => t.enabled).length;
    if (enabledCount === 0) {
      setError("Activez au moins un mail dans la serie.");
      return;
    }
    clearFeedback();
    try {
      setBusy(true);
      const res = await fetch("/api/sequences/affaires/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: selectedCampaignId,
          leads: generatedLeadDrafts,
          templates: seriesTemplates,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Validation serie impossible");
      setItems(json.data?.items || []);
      setShowSeriesBuilder(false);
      setMsg(`Serie validee: ${enabledCount} mail(s) pour ${generatedLeadDrafts.length} lead(s).`);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function patchItem(id: number, patch: Partial<FollowupItem>) {
    clearFeedback();
    try {
      const res = await fetch(`/api/sequences/affaires/items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Maj item impossible");
      setItems((prev) => prev.map((it) => (it.id === id ? json.data : it)));
      setMsg("Email sauvegarde");
    } catch (e) {
      setError(String(e));
    }
  }

  async function startCampaign() {
    if (!selectedCampaignId) return;
    clearFeedback();
    try {
      setBusy(true);
      const res = await fetch(`/api/sequences/affaires/campaigns/${selectedCampaignId}/start`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Start impossible");
      await loadCampaigns();
      await loadCampaignDetail(selectedCampaignId);
      setMsg("Campagne lancee: 1 envoi toutes les 10 min");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function sendNextNow() {
    if (!selectedCampaignId) return;
    clearFeedback();
    try {
      setBusy(true);
      const res = await fetch("/api/sequences/affaires/send-next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: selectedCampaignId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Envoi impossible");
      await loadCampaignDetail(selectedCampaignId);
      setMsg(json.data?.sent ? "Email envoye" : "Aucun email pret");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-violet-500" /></div>;
  }

  const noCampaign = !selectedCampaignId;
  const canGenerate = !noCampaign && selectedLeadRows.length > 0 && !busy;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-2">
        <input
          value={newCampaignName}
          onChange={(e) => setNewCampaignName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && createCampaign()}
          placeholder="Nom de campagne affaires..."
          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-violet-400"
        />
        <button onClick={createCampaign} disabled={busy || !newCampaignName.trim()} className="px-3 py-2 text-sm text-white bg-violet-600 rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 hover:bg-violet-700">
          <Plus className="w-4 h-4" /> Creer
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-xs rounded-lg px-3 py-2 border bg-red-50 text-red-700 border-red-200">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600 cursor-pointer">&times;</button>
        </div>
      )}
      {msg && !error && (
        <div className="flex items-start gap-2 text-xs rounded-lg px-3 py-2 border bg-green-50 text-green-700 border-green-200">
          <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{msg}</span>
          <button onClick={() => setMsg(null)} className="ml-auto text-green-400 hover:text-green-600 cursor-pointer">&times;</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEFT: Campaigns */}
        <div className="bg-white rounded-lg border border-gray-200 p-3 space-y-2">
          <h3 className="text-sm font-semibold text-gray-900">Campagnes Affaires</h3>
          {campaigns.length === 0 && (
            <p className="text-xs text-gray-400 italic py-2">Aucune campagne. Creez-en une ci-dessus.</p>
          )}
          <div className="space-y-1 max-h-[200px] overflow-y-auto">
            {campaigns.map((c) => (
              <button key={c.id} onClick={() => setSelectedCampaignId(c.id)} className={cn("w-full text-left px-2 py-2 rounded-lg border cursor-pointer transition-colors", selectedCampaignId === c.id ? "border-violet-400 bg-violet-50" : "border-gray-200 hover:bg-gray-50")}>
                <p className="text-xs font-medium">{c.name}</p>
                <p className={cn("text-[10px]", c.status === "running" ? "text-green-600 font-medium" : c.status === "completed" ? "text-blue-600" : "text-gray-500")}>{c.status === "draft" ? "Brouillon" : c.status === "running" ? "En cours" : c.status === "paused" ? "Pause" : "Termine"}</p>
              </button>
            ))}
          </div>
          <div className="pt-2 border-t border-gray-200 space-y-2">
            <button onClick={startCampaign} disabled={busy || noCampaign || items.length === 0} className="w-full px-3 py-2 text-xs font-medium text-white bg-green-600 rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1 hover:bg-green-700">
              <Play className="w-3.5 h-3.5" /> Lancer campagne
            </button>
            <button onClick={sendNextNow} disabled={busy || noCampaign} className="w-full px-3 py-2 text-xs font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1 hover:bg-violet-100">
              <Send className="w-3.5 h-3.5" /> Envoyer 1 maintenant
            </button>
          </div>
        </div>

        {/* MIDDLE: Lead selection */}
        <div className="bg-white rounded-lg border border-gray-200 p-3 space-y-2">
          <h3 className="text-sm font-semibold text-gray-900">Selection leads</h3>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher lead/deal..." className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg outline-none focus:border-violet-400" />
          <div className="rounded-lg border border-violet-100 bg-violet-50/50 p-2 space-y-2">
            <p className="text-[11px] font-medium text-violet-800">Selection en masse</p>
            <select
              value={bulkPipeline}
              onChange={(e) => {
                setBulkPipeline(e.target.value);
                setBulkStages([]);
              }}
              className="w-full px-2 py-1.5 text-xs border border-violet-200 rounded-lg outline-none bg-white"
            >
              <option value="all">Tous les pipelines</option>
              {pipelineOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {bulkPipeline !== "all" && stageOptionsForPipeline.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] text-violet-700 font-medium">Etapes (multi-selection)</p>
                <div className="max-h-20 overflow-y-auto space-y-1">
                  {stageOptionsForPipeline.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-[10px] text-gray-700">
                      <input
                        type="checkbox"
                        checked={bulkStages.includes(s.id)}
                        onChange={() => toggleBulkStage(s.id)}
                        className="accent-violet-600"
                      />
                      <span>{s.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-1.5">
              <button
                onClick={selectAllMatchingLeads}
                type="button"
                className="flex-1 px-2 py-1.5 text-[11px] font-medium rounded-lg border border-violet-300 bg-white text-violet-700 hover:bg-violet-100 cursor-pointer"
              >
                Tout selectionner ({leadsMatchingBulkFilter.length})
              </button>
              <button
                onClick={unselectAllMatchingLeads}
                type="button"
                className="flex-1 px-2 py-1.5 text-[11px] font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 cursor-pointer"
              >
                Deselectionner ({matchingSelectedCount})
              </button>
            </div>
          </div>
          <div className="max-h-[280px] overflow-y-auto space-y-1">
            {leads.map((l) => (
              <label key={l.email} className={cn("flex items-start gap-2 p-2 rounded border text-xs cursor-pointer transition-colors", selectedEmails[l.email] ? "border-violet-300 bg-violet-50" : "border-gray-100 hover:bg-gray-50")}>
                <input
                  type="checkbox"
                  checked={Boolean(selectedEmails[l.email])}
                  onChange={(e) => setSelectedEmails((prev) => ({ ...prev, [l.email]: e.target.checked }))}
                  className="mt-0.5 accent-violet-600"
                />
                <div className="min-w-0">
                  <p className="font-medium text-gray-800 truncate">{l.name || l.email}</p>
                  <p className="text-gray-500 truncate">{l.email}</p>
                  <p className="text-[10px] text-gray-400 truncate">{l.dealTitle || "Sans affaire"}</p>
                  {(l.pipelineName || l.stageName) && (
                    <p className="text-[10px] text-violet-500 truncate">
                      {[l.pipelineName, l.stageName].filter(Boolean).join(" -> ")}
                    </p>
                  )}
                </div>
              </label>
            ))}
            {leads.length === 0 && <p className="text-xs text-gray-400 italic py-2">Aucun lead trouve.</p>}
          </div>
          {noCampaign && selectedLeadRows.length > 0 && (
            <p className="text-[10px] text-amber-600 font-medium">Creez ou selectionnez une campagne avant de generer.</p>
          )}
          <button
            onClick={generateDrafts}
            disabled={!canGenerate}
            className={cn(
              "w-full px-3 py-2.5 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition-colors",
              canGenerate
                ? "text-white bg-violet-600 hover:bg-violet-700 cursor-pointer"
                : "text-gray-400 bg-gray-100 border border-gray-200 cursor-not-allowed"
            )}
          >
            {busy ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Generation en cours...
              </>
            ) : (
              `Generer V1 (${selectedLeadRows.length})`
            )}
          </button>
        </div>

        {/* RIGHT: Campaign items / status */}
        <div className="bg-white rounded-lg border border-gray-200 p-3 space-y-2">
          <h3 className="text-sm font-semibold text-gray-900">Campagne / Statuts</h3>
          <div className="max-h-[380px] overflow-y-auto space-y-2 pr-1">
            {items.map((it) => (
              <div key={it.id} className="border border-gray-200 rounded-lg p-2 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-medium text-gray-800">{it.leadName || it.leadEmail}</p>
                  <span className={cn("text-[9px] font-medium px-1.5 py-0.5 rounded-full", it.status === "envoye" ? "bg-green-100 text-green-700" : it.status === "erreur" ? "bg-red-100 text-red-700" : it.status === "repondu" ? "bg-indigo-100 text-indigo-700" : it.status === "en_cours" ? "bg-blue-100 text-blue-700" : it.status === "a_envoyer" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600")}>
                    {it.status === "draft" ? "Brouillon" : it.status === "a_envoyer" ? "A envoyer" : it.status === "en_cours" ? "En cours" : it.status === "envoye" ? "Envoye" : it.status === "repondu" ? "Repondu (stop)" : "Erreur"}
                  </span>
                </div>
                <p className="text-[10px] text-gray-500">{it.leadEmail}</p>
                <p className="text-[10px] text-violet-500">Mail {it.sequenceStep || 1}/{it.totalSteps || 1}</p>
                {it.lastEmailAt && <p className="text-[10px] text-gray-400">Dernier envoi: {new Date(it.lastEmailAt).toLocaleString("fr-FR")}</p>}
                <input
                  value={it.subject}
                  onChange={(e) => setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, subject: e.target.value } : x)))}
                  className="w-full px-2 py-1 text-[11px] border border-gray-300 rounded focus:border-violet-400 outline-none"
                  placeholder="Sujet..."
                />
                <textarea
                  value={it.body}
                  onChange={(e) => setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, body: e.target.value } : x)))}
                  rows={4}
                  className="w-full px-2 py-1 text-[11px] border border-gray-300 rounded focus:border-violet-400 outline-none resize-y"
                  placeholder="Corps du mail..."
                />
                <button onClick={() => patchItem(it.id, { subject: it.subject, body: it.body })} className="px-2 py-1 text-[10px] rounded bg-gray-100 hover:bg-gray-200 cursor-pointer flex items-center gap-1 transition-colors">
                  <Save className="w-3 h-3" /> Sauver
                </button>
                {it.lastError && <p className="text-[10px] text-red-600 bg-red-50 px-1.5 py-0.5 rounded">{it.lastError}</p>}
              </div>
            ))}
            {items.length === 0 && <p className="text-xs text-gray-400 italic py-4 text-center">Aucun draft pour cette campagne.</p>}
          </div>
        </div>
      </div>
      {showSeriesBuilder && (
        <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
          <div className="max-w-6xl mx-auto p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Etape 2 - Construire la serie de mails</h2>
                <p className="text-sm text-gray-500">
                  {generatedLeadDrafts.length} lead(s) selectionne(s). La sequence s'arrete automatiquement si le lead repond.
                </p>
              </div>
              <button
                onClick={() => setShowSeriesBuilder(false)}
                className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 cursor-pointer"
              >
                Fermer
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {seriesTemplates.map((tpl, idx) => (
                <div key={tpl.step} className="rounded-lg border border-gray-200 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
                      <input
                        type="checkbox"
                        checked={tpl.enabled}
                        onChange={(e) =>
                          setSeriesTemplates((prev) => prev.map((t, i) => (i === idx ? { ...t, enabled: e.target.checked } : t)))
                        }
                        className="accent-violet-600"
                      />
                      Mail {tpl.step}
                    </label>
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <span>Delai (min):</span>
                      <input
                        type="number"
                        min={0}
                        value={tpl.delayMinutes}
                        onChange={(e) =>
                          setSeriesTemplates((prev) =>
                            prev.map((t, i) => (i === idx ? { ...t, delayMinutes: Math.max(0, Number(e.target.value) || 0) } : t))
                          )
                        }
                        className="w-20 px-2 py-1 border border-gray-300 rounded"
                      />
                    </div>
                  </div>
                  <input
                    value={tpl.subject}
                    onChange={(e) =>
                      setSeriesTemplates((prev) => prev.map((t, i) => (i === idx ? { ...t, subject: e.target.value } : t)))
                    }
                    className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded"
                    placeholder={`Sujet mail ${tpl.step}`}
                  />
                  <textarea
                    value={tpl.body}
                    onChange={(e) =>
                      setSeriesTemplates((prev) => prev.map((t, i) => (i === idx ? { ...t, body: e.target.value } : t)))
                    }
                    rows={6}
                    className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded"
                    placeholder={`Contenu mail ${tpl.step}`}
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500">
              Variables dispo: {"{{prenom}}"}, {"{{entreprise}}"}, {"{{email}}"}
            </p>
            <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-3">
              <button
                onClick={() => setShowSeriesBuilder(false)}
                className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={validateSeries}
                disabled={busy}
                className="px-4 py-2 text-sm rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 cursor-pointer"
              >
                {busy ? "Validation..." : "Valider la serie"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
