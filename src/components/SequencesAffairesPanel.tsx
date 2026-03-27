"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Play, Plus, Save, Send } from "lucide-react";
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
}

interface FollowupItem {
  id: number;
  leadEmail: string;
  leadName?: string;
  company?: string;
  subject: string;
  body: string;
  status: "draft" | "a_envoyer" | "en_cours" | "envoye" | "erreur";
  scheduledAt: string;
  lastEmailAt?: string;
  lastError?: string;
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
  }, []);

  useEffect(() => {
    if (!selectedCampaignId) return;
    loadCampaignDetail(selectedCampaignId).catch((e) => setError(String(e)));
  }, [selectedCampaignId]);

  useEffect(() => {
    const t = setTimeout(() => {
      loadLeads().catch((e) => setError(String(e)));
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const selectedLeadRows = useMemo(
    () => leads.filter((l) => selectedEmails[l.email]),
    [leads, selectedEmails]
  );

  async function createCampaign() {
    if (!newCampaignName.trim()) return;
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
    if (!selectedCampaignId || selectedLeadRows.length === 0) return;
    try {
      setBusy(true);
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
      setItems(json.data.items || []);
      setMsg(`${selectedLeadRows.length} drafts generes`);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function patchItem(id: number, patch: Partial<FollowupItem>) {
    const res = await fetch(`/api/sequences/affaires/items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Maj item impossible");
    setItems((prev) => prev.map((it) => (it.id === id ? json.data : it)));
  }

  async function startCampaign() {
    if (!selectedCampaignId) return;
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

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-2">
        <input
          value={newCampaignName}
          onChange={(e) => setNewCampaignName(e.target.value)}
          placeholder="Nom de campagne affaires..."
          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none"
        />
        <button onClick={createCampaign} disabled={busy || !newCampaignName.trim()} className="px-3 py-2 text-sm text-white bg-violet-600 rounded-lg cursor-pointer disabled:opacity-50 flex items-center gap-1">
          <Plus className="w-4 h-4" /> Creer
        </button>
      </div>

      {(msg || error) && (
        <div className={cn("text-xs rounded-lg px-3 py-2 border", error ? "bg-red-50 text-red-700 border-red-200" : "bg-green-50 text-green-700 border-green-200")}>
          {error || msg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-3 space-y-2">
          <h3 className="text-sm font-semibold text-gray-900">Campagnes Affaires</h3>
          <div className="space-y-1">
            {campaigns.map((c) => (
              <button key={c.id} onClick={() => setSelectedCampaignId(c.id)} className={cn("w-full text-left px-2 py-2 rounded-lg border cursor-pointer", selectedCampaignId === c.id ? "border-violet-400 bg-violet-50" : "border-gray-200")}>
                <p className="text-xs font-medium">{c.name}</p>
                <p className="text-[10px] text-gray-500">{c.status}</p>
              </button>
            ))}
          </div>
          <div className="pt-2 border-t border-gray-200 space-y-2">
            <button onClick={startCampaign} disabled={busy || !selectedCampaignId || items.length === 0} className="w-full px-3 py-2 text-xs font-medium text-white bg-green-600 rounded-lg cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1">
              <Play className="w-3.5 h-3.5" /> Lancer campagne
            </button>
            <button onClick={sendNextNow} disabled={busy || !selectedCampaignId} className="w-full px-3 py-2 text-xs font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-lg cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1">
              <Send className="w-3.5 h-3.5" /> Envoyer 1 maintenant
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-3 space-y-2">
          <h3 className="text-sm font-semibold text-gray-900">Selection leads</h3>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher lead/deal..." className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg outline-none" />
          <div className="max-h-[320px] overflow-y-auto space-y-1">
            {leads.map((l) => (
              <label key={l.email} className="flex items-start gap-2 p-2 rounded border border-gray-100 text-xs">
                <input
                  type="checkbox"
                  checked={Boolean(selectedEmails[l.email])}
                  onChange={(e) => setSelectedEmails((prev) => ({ ...prev, [l.email]: e.target.checked }))}
                />
                <div>
                  <p className="font-medium text-gray-800">{l.name || l.email}</p>
                  <p className="text-gray-500">{l.email}</p>
                  <p className="text-[10px] text-gray-400">{l.dealTitle || "Sans affaire"}</p>
                </div>
              </label>
            ))}
          </div>
          <button onClick={generateDrafts} disabled={busy || !selectedCampaignId || selectedLeadRows.length === 0} className="w-full px-3 py-2 text-xs font-medium text-white bg-violet-600 rounded-lg cursor-pointer disabled:opacity-50">
            {busy ? "Generation..." : `Generer V1 (${selectedLeadRows.length})`}
          </button>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-3 space-y-2">
          <h3 className="text-sm font-semibold text-gray-900">Campagne / Statuts</h3>
          <div className="max-h-[380px] overflow-y-auto space-y-2 pr-1">
            {items.map((it) => (
              <div key={it.id} className="border border-gray-200 rounded-lg p-2 space-y-1">
                <p className="text-[11px] font-medium text-gray-800">{it.leadName || it.leadEmail}</p>
                <p className="text-[10px] text-gray-500">{it.leadEmail}</p>
                <p className="text-[10px] text-gray-500">Statut: {it.status} {it.lastEmailAt ? `- dernier: ${new Date(it.lastEmailAt).toLocaleString("fr-FR")}` : ""}</p>
                <input
                  value={it.subject}
                  onChange={(e) => setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, subject: e.target.value } : x)))}
                  className="w-full px-2 py-1 text-[11px] border border-gray-300 rounded"
                />
                <textarea
                  value={it.body}
                  onChange={(e) => setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, body: e.target.value } : x)))}
                  rows={4}
                  className="w-full px-2 py-1 text-[11px] border border-gray-300 rounded"
                />
                <button onClick={() => patchItem(it.id, { subject: it.subject, body: it.body })} className="px-2 py-1 text-[10px] rounded bg-gray-100 hover:bg-gray-200 cursor-pointer flex items-center gap-1">
                  <Save className="w-3 h-3" /> Sauver
                </button>
                {it.lastError && <p className="text-[10px] text-red-600">{it.lastError}</p>}
              </div>
            ))}
            {items.length === 0 && <p className="text-xs text-gray-400">Aucun draft pour cette campagne.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

