"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle, Loader2, Play, Plus, Send, Trash2, X } from "lucide-react";
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
  subject: string;
  body: string;
  status: "draft" | "a_envoyer" | "en_cours" | "envoye" | "erreur" | "repondu";
  sequenceStep?: number;
  totalSteps?: number;
  lastEmailAt?: string;
  lastError?: string;
}

interface LeadStepDraft {
  step: number;
  enabled: boolean;
  delayDays: number;
  subject: string;
  body: string;
}

interface LeadSequenceDraft {
  email: string;
  name: string;
  company: string;
  dealId: number | null;
  steps: LeadStepDraft[];
}

function buildDefaultStep(step: number): LeadStepDraft {
  if (step === 1) {
    return {
      step,
      enabled: true,
      delayDays: 0,
      subject: "Suivi de notre echange",
      body: "Bonjour {{prenom}},\n\nJe me permets de revenir vers vous.\n\nTony",
    };
  }
  return {
    step,
    enabled: true,
    delayDays: 1,
    subject: `Relance ${step} - {{prenom}}`,
    body: "Bonjour {{prenom}},\n\nJe me permets de vous relancer.\n\nTony",
  };
}

export default function SequencesAffairesPanel() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [campaigns, setCampaigns] = useState<AffCampaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [newCampaignName, setNewCampaignName] = useState("");

  const [search, setSearch] = useState("");
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [selectedEmails, setSelectedEmails] = useState<Record<string, boolean>>({});
  const [bulkPipeline, setBulkPipeline] = useState<string>("all");
  const [bulkStages, setBulkStages] = useState<string[]>([]);

  const [items, setItems] = useState<FollowupItem[]>([]);

  // Step 2 (full-screen)
  const [showStep2, setShowStep2] = useState(false);
  const [seriesCount, setSeriesCount] = useState<number>(3);
  const [leadSequences, setLeadSequences] = useState<LeadSequenceDraft[]>([]);
  const [currentLeadIndex, setCurrentLeadIndex] = useState(0);
  const [isGeneratingV1, setIsGeneratingV1] = useState(false);
  const [generationDone, setGenerationDone] = useState(0);
  const [generationTotal, setGenerationTotal] = useState(0);
  const [generationContext, setGenerationContext] = useState("");

  function clearFeedback() {
    setError(null);
    setMsg(null);
  }

  async function loadCampaigns() {
    const res = await fetch("/api/sequences/affaires/campaigns");
    const json = (await res.json()) as { error?: string; data?: AffCampaign[] };
    if (!res.ok) throw new Error(json.error || "Erreur chargement campagnes");
    const data = json.data || [];
    setCampaigns(data);
    if (!selectedCampaignId && data.length > 0) setSelectedCampaignId(data[0].id);
  }

  async function loadLeads() {
    const res = await fetch(`/api/sequences/affaires/leads?search=${encodeURIComponent(search)}`);
    const json = (await res.json()) as { error?: string; data?: LeadRow[] };
    if (!res.ok) throw new Error(json.error || "Erreur chargement leads");
    setLeads(json.data || []);
  }

  async function loadCampaignDetail(campaignId: number) {
    const res = await fetch(`/api/sequences/affaires/campaigns/${campaignId}`);
    const json = (await res.json()) as { error?: string; data?: { items?: FollowupItem[] } };
    if (!res.ok) throw new Error(json.error || "Erreur chargement detail campagne");
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
    if (bulkPipeline === "all") return [] as Array<{ id: string; name: string }>;
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
    setSelectedEmails((prev) => {
      const next = { ...prev };
      for (const lead of leadsMatchingBulkFilter) next[lead.email] = true;
      return next;
    });
  }

  function unselectAllMatchingLeads() {
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
        body: JSON.stringify({
          name: newCampaignName.trim(),
          senderEmail: "tony@metagora.tech",
          cadenceMinutes: 10,
        }),
      });
      const json = (await res.json()) as { error?: string; data?: AffCampaign };
      if (!res.ok) throw new Error(json.error || "Creation impossible");
      setNewCampaignName("");
      await loadCampaigns();
      if (json.data?.id) setSelectedCampaignId(json.data.id);
      setMsg("Campagne creee");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function deleteDraftCampaign(campaignId: number) {
    clearFeedback();
    try {
      setBusy(true);
      const res = await fetch(`/api/sequences/affaires/campaigns/${campaignId}`, { method: "DELETE" });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Suppression impossible");
      await loadCampaigns();
      if (selectedCampaignId === campaignId) {
        setSelectedCampaignId(null);
        setItems([]);
      }
      setMsg("Campagne brouillon supprimee");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function adaptLeadSequenceSteps(steps: LeadStepDraft[], count: number): LeadStepDraft[] {
    const next: LeadStepDraft[] = [];
    for (let step = 1; step <= count; step += 1) {
      const found = steps.find((s) => s.step === step);
      if (found) {
        next.push({ ...found, enabled: true });
      } else {
        next.push(buildDefaultStep(step));
      }
    }
    return next;
  }

  async function generateV1AndOpenStep2() {
    if (!selectedCampaignId) {
      setError("Etape 1: creez ou selectionnez une campagne.");
      return;
    }
    if (selectedLeadRows.length === 0) {
      setError("Etape 1: selectionnez au moins un lead.");
      return;
    }
    clearFeedback();
    try {
      setBusy(true);
      setIsGeneratingV1(true);
      setGenerationDone(0);
      setGenerationTotal(selectedLeadRows.length * seriesCount);

      const nextLeadSequences: LeadSequenceDraft[] = [];
      for (let i = 0; i < selectedLeadRows.length; i += 1) {
        const lead = selectedLeadRows[i]!;
        setGenerationContext(`${lead.name || lead.email} (${i + 1}/${selectedLeadRows.length})`);
        const res = await fetch("/api/sequences/affaires/generate-series", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            campaignId: selectedCampaignId,
            sequenceCount: seriesCount,
            leads: [{
              email: lead.email,
              name: lead.name,
              company: lead.company,
              dealId: lead.dealId,
            }],
          }),
        });
        const json = (await res.json()) as {
          error?: string;
          data?: { leadSequences?: LeadSequenceDraft[] };
        };
        if (!res.ok) {
          throw new Error(`Erreur generation pour ${lead.email}: ${json.error || "inconnue"}`);
        }
        const generatedLead = json.data?.leadSequences?.[0];
        if (!generatedLead) {
          throw new Error(`Aucun contenu IA retourne pour ${lead.email}`);
        }
        const normalized = {
          ...generatedLead,
          steps: adaptLeadSequenceSteps(generatedLead.steps || [], seriesCount),
        };
        nextLeadSequences.push(normalized);
        // Progression demandee: 1/6, 2/6, ...
        for (let stepIdx = 0; stepIdx < normalized.steps.length; stepIdx += 1) {
          setGenerationDone((prev) => prev + 1);
        }
      }

      setLeadSequences(nextLeadSequences);
      setCurrentLeadIndex(0);
      setShowStep2(true);
      setMsg(`Etape 2 prete: ${nextLeadSequences.length} contact(s), ${seriesCount} mails IA par contact.`);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsGeneratingV1(false);
      setGenerationContext("");
      setBusy(false);
    }
  }

  function applySeriesCount(nextCount: number) {
    const safe = Math.max(1, Math.min(5, nextCount));
    setSeriesCount(safe);
    setLeadSequences((prev) => prev.map((lead) => ({ ...lead, steps: adaptLeadSequenceSteps(lead.steps, safe) })));
  }

  function updateLeadStep(leadEmail: string, step: number, patch: Partial<LeadStepDraft>) {
    setLeadSequences((prev) =>
      prev.map((lead) => {
        if (lead.email !== leadEmail) return lead;
        return {
          ...lead,
          steps: lead.steps.map((s) => (s.step === step ? { ...s, ...patch } : s)),
        };
      })
    );
  }

  async function sendSeriesNow() {
    if (!selectedCampaignId) {
      setError("Campagne introuvable.");
      return;
    }
    if (leadSequences.length === 0) {
      setError("Aucun lead a envoyer.");
      return;
    }
    clearFeedback();
    try {
      setBusy(true);
      const seriesRes = await fetch("/api/sequences/affaires/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: selectedCampaignId, leadSequences }),
      });
      const seriesJson = (await seriesRes.json()) as { error?: string; data?: { items?: FollowupItem[] } };
      if (!seriesRes.ok) throw new Error(seriesJson.error || "Validation serie impossible");

      const startRes = await fetch(`/api/sequences/affaires/campaigns/${selectedCampaignId}/start`, {
        method: "POST",
      });
      const startJson = (await startRes.json()) as { error?: string };
      if (!startRes.ok) throw new Error(startJson.error || "Lancement campagne impossible");

      setItems(seriesJson.data?.items || []);
      setShowStep2(false);
      await loadCampaigns();
      await loadCampaignDetail(selectedCampaignId);
      setMsg("Serie validee et campagne lancee. Envoi differe automatique actif.");
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
      const json = (await res.json()) as { error?: string; data?: { sent?: boolean } };
      if (!res.ok) throw new Error(json.error || "Envoi impossible");
      await loadCampaignDetail(selectedCampaignId);
      setMsg(json.data?.sent ? "Email envoye" : "Aucun email pret");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const noCampaign = !selectedCampaignId;
  const canGenerate = !busy && !noCampaign && selectedLeadRows.length > 0;

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-2">
        <input
          value={newCampaignName}
          onChange={(e) => setNewCampaignName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && createCampaign()}
          placeholder="Etape 1 - Nom de campagne..."
          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-violet-400"
        />
        <button
          onClick={createCampaign}
          disabled={busy || !newCampaignName.trim()}
          className="px-3 py-2 text-sm text-white bg-violet-600 rounded-lg cursor-pointer disabled:opacity-50"
        >
          <Plus className="w-4 h-4 inline mr-1" /> Creer
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
        <div className="bg-white rounded-lg border border-gray-200 p-3 space-y-2">
          <h3 className="text-sm font-semibold text-gray-900">Campagnes</h3>
          <div className="space-y-1 max-h-[220px] overflow-y-auto">
            {campaigns.map((c) => (
              <div key={c.id} className={cn("px-2 py-2 rounded-lg border", selectedCampaignId === c.id ? "border-violet-400 bg-violet-50" : "border-gray-200") }>
                <button onClick={() => setSelectedCampaignId(c.id)} className="w-full text-left cursor-pointer">
                  <p className="text-xs font-medium">{c.name}</p>
                  <p className="text-[10px] text-gray-500">{c.status}</p>
                </button>
                {c.status === "draft" && (
                  <button
                    onClick={() => deleteDraftCampaign(c.id)}
                    disabled={busy}
                    className="mt-1 text-[10px] text-red-600 hover:text-red-700 cursor-pointer flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> Supprimer brouillon
                  </button>
                )}
              </div>
            ))}
            {campaigns.length === 0 && <p className="text-xs text-gray-400">Aucune campagne.</p>}
          </div>
          <div className="pt-2 border-t border-gray-200">
            <button
              onClick={sendNextNow}
              disabled={busy || noCampaign}
              className="w-full px-3 py-2 text-xs font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-lg cursor-pointer disabled:opacity-40"
            >
              <Send className="w-3.5 h-3.5 inline mr-1" /> Envoyer 1 maintenant
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-3 space-y-2 lg:col-span-2">
          <h3 className="text-sm font-semibold text-gray-900">Etape 1 - Selection des contacts</h3>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher lead/deal..."
            className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg outline-none focus:border-violet-400"
          />
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
              {pipelineOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {bulkPipeline !== "all" && stageOptionsForPipeline.length > 0 && (
              <div className="max-h-24 overflow-y-auto grid grid-cols-2 gap-1">
                {stageOptionsForPipeline.map((s) => (
                  <label key={s.id} className="flex items-center gap-1 text-[10px]">
                    <input type="checkbox" checked={bulkStages.includes(s.id)} onChange={() => toggleBulkStage(s.id)} className="accent-violet-600" />
                    <span>{s.name}</span>
                  </label>
                ))}
              </div>
            )}
            <div className="flex gap-1.5">
              <button onClick={selectAllMatchingLeads} className="flex-1 px-2 py-1.5 text-[11px] rounded border border-violet-300 bg-white text-violet-700 cursor-pointer">
                Tout selectionner ({leadsMatchingBulkFilter.length})
              </button>
              <button onClick={unselectAllMatchingLeads} className="flex-1 px-2 py-1.5 text-[11px] rounded border border-gray-300 bg-white text-gray-700 cursor-pointer">
                Deselectionner ({matchingSelectedCount})
              </button>
            </div>
          </div>

          <div className="max-h-[280px] overflow-y-auto space-y-1 border border-gray-100 rounded-lg p-2">
            {leads.map((l) => (
              <label key={l.email} className={cn("flex items-start gap-2 p-2 rounded border text-xs cursor-pointer", selectedEmails[l.email] ? "border-violet-300 bg-violet-50" : "border-gray-100 hover:bg-gray-50")}>
                <input type="checkbox" checked={Boolean(selectedEmails[l.email])} onChange={(e) => setSelectedEmails((prev) => ({ ...prev, [l.email]: e.target.checked }))} className="mt-0.5 accent-violet-600" />
                <div className="min-w-0">
                  <p className="font-medium text-gray-800 truncate">{l.name || l.email}</p>
                  <p className="text-gray-500 truncate">{l.email}</p>
                  <p className="text-[10px] text-gray-400 truncate">{l.dealTitle || "Sans affaire"}</p>
                  {(l.pipelineName || l.stageName) && <p className="text-[10px] text-violet-500 truncate">{[l.pipelineName, l.stageName].filter(Boolean).join(" -> ")}</p>}
                </div>
              </label>
            ))}
          </div>

          <button
            onClick={generateV1AndOpenStep2}
            disabled={!canGenerate}
            className={cn("w-full px-3 py-2.5 text-xs font-medium rounded-lg", canGenerate ? "text-white bg-violet-600 hover:bg-violet-700 cursor-pointer" : "text-gray-400 bg-gray-100 border border-gray-200 cursor-not-allowed")}
          >
            {busy ? "Generation V1..." : `Generer V1 (${selectedLeadRows.length}) puis Etape 2`}
          </button>
          <div className="flex items-center justify-between text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-gray-50">
            <span className="text-gray-600">Nombre de mails a generer (etape 1)</span>
            <select
              value={seriesCount}
              onChange={(e) => applySeriesCount(Number(e.target.value))}
              className="px-2 py-1 text-xs border border-gray-300 rounded bg-white"
            >
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-3">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Campagne / Statuts</h3>
        <div className="max-h-[260px] overflow-y-auto space-y-2">
          {items.map((it) => (
            <div key={it.id} className="border border-gray-200 rounded-lg p-2 text-xs">
              <p className="font-medium">{it.leadName || it.leadEmail}</p>
              <p className="text-gray-500">Mail {it.sequenceStep || 1}/{it.totalSteps || 1} - {it.status}</p>
              {it.lastEmailAt && <p className="text-gray-400">Dernier envoi: {new Date(it.lastEmailAt).toLocaleString("fr-FR")}</p>}
              {it.lastError && <p className="text-red-600">{it.lastError}</p>}
            </div>
          ))}
          {items.length === 0 && <p className="text-xs text-gray-400">Aucun item.</p>}
        </div>
      </div>

      {showStep2 && (
        <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
          <div className="max-w-7xl mx-auto p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Etape 2 - V1 de chaque mail</h2>
                <p className="text-sm text-gray-500">UX plein ecran: edite les mails pour chaque lead, puis clique Envoyer la serie.</p>
              </div>
              <button onClick={() => setShowStep2(false)} className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 cursor-pointer">
                <X className="w-4 h-4 inline mr-1" /> Fermer
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Nombre de mails choisi en etape 1: {seriesCount}</span>
              <span className="text-xs text-gray-500">{leadSequences.length} leads</span>
            </div>

            {leadSequences.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setCurrentLeadIndex((i) => Math.max(0, i - 1))}
                    disabled={currentLeadIndex === 0}
                    className="px-3 py-1.5 text-xs rounded border border-gray-300 disabled:opacity-40 cursor-pointer"
                  >
                    Precedent
                  </button>
                  <span className="text-xs text-gray-500">
                    Contact {currentLeadIndex + 1} / {leadSequences.length}
                  </span>
                  <button
                    onClick={() => setCurrentLeadIndex((i) => Math.min(leadSequences.length - 1, i + 1))}
                    disabled={currentLeadIndex >= leadSequences.length - 1}
                    className="px-3 py-1.5 text-xs rounded border border-gray-300 disabled:opacity-40 cursor-pointer"
                  >
                    Suivant
                  </button>
                </div>
                {(() => {
                  const lead = leadSequences[currentLeadIndex]!;
                  return (
                    <div key={lead.email} className="rounded-lg border border-gray-200 p-3 space-y-2">
                      <p className="text-sm font-semibold text-gray-900">
                        {lead.name || lead.email} <span className="text-xs text-gray-500">({lead.email})</span>
                      </p>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {lead.steps.map((step) => (
                          <div key={`${lead.email}-${step.step}`} className="rounded-lg border border-gray-200 p-2 space-y-2 bg-gray-50">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-medium">Mail {step.step}</span>
                              <div className="flex items-center gap-1">
                                <span>Delai (jours):</span>
                                <input
                                  type="number"
                                  min={0}
                                  value={step.delayDays}
                                  onChange={(e) => updateLeadStep(lead.email, step.step, { delayDays: Math.max(0, Number(e.target.value) || 0) })}
                                  className="w-20 px-1 py-0.5 border border-gray-300 rounded"
                                />
                              </div>
                            </div>
                            <input
                              value={step.subject}
                              onChange={(e) => updateLeadStep(lead.email, step.step, { subject: e.target.value })}
                              className="w-full px-2 py-1 text-xs border border-gray-300 rounded bg-white"
                            />
                            <textarea
                              value={step.body}
                              onChange={(e) => updateLeadStep(lead.email, step.step, { body: e.target.value })}
                              rows={5}
                              className="w-full px-2 py-1 text-xs border border-gray-300 rounded bg-white"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-3">
              <button onClick={() => setShowStep2(false)} className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 cursor-pointer">Annuler</button>
              <button
                onClick={sendSeriesNow}
                disabled={busy || leadSequences.length === 0}
                className="px-4 py-2 text-sm rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 cursor-pointer"
              >
                {busy ? "Envoi..." : "Envoyer la serie"}
              </button>
            </div>
          </div>
        </div>
      )}
      {isGeneratingV1 && (
        <div className="fixed inset-0 z-[60] bg-black/35 flex items-center justify-center">
          <div className="bg-white rounded-xl border border-gray-200 shadow-xl p-5 w-full max-w-md">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-violet-600" />
              <div>
                <p className="text-sm font-semibold text-gray-900">Generation V1 IA en cours</p>
                <p className="text-xs text-gray-500">{generationContext || "Preparation..."}</p>
              </div>
            </div>
            <div className="mt-4">
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-violet-600 transition-all"
                  style={{ width: `${generationTotal > 0 ? Math.min(100, (generationDone / generationTotal) * 100) : 0}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-gray-600 text-right">
                {generationDone}/{generationTotal}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
