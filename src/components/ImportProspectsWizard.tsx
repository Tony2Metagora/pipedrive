"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  X, ChevronLeft, ChevronRight, Users, Mail, Loader2,
  AlertTriangle, Check, Play, FileText, Sparkles, Shield,
  Upload, Search, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type WarmupAccountData,
  type AccountProfile,
  getAccountProfile,
  addBusinessDays,
} from "@/lib/warmup-capacity";

// ─── Types ──────────────────────────────────────────────

interface ProspectRow {
  id: string;
  email: string;
  prenom: string;
  nom: string;
  entreprise: string;
  poste?: string;
  ai_score?: string;
  list_id?: string;
  [key: string]: unknown;
}

interface ProspectList {
  id: string;
  name: string;
  company: string;
  count: number;
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

interface SequenceStep {
  seq_number: number;
  seq_delay_details: { delay_in_days: number };
  subject: string;
  email_body: string;
}

interface Campaign {
  id: number;
  name: string;
  status: string;
}

interface CampaignResult {
  campaignId: number;
  campaignName: string;
  accountId: number;
  leadCount: number;
  status: "success" | "error";
  error?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
  allAccounts: EmailAccount[];
}

type WizardStep = 1 | 2 | 3 | 4 | 5;
type ScoreFilter = "all" | "4+" | "5";
type SeqMode = "copy" | "ai";

// ─── Component ──────────────────────────────────────────

export default function ImportProspectsWizard({ open, onClose, onComplete, allAccounts }: Props) {
  const [step, setStep] = useState<WizardStep>(1);

  // Step 1 — Source
  const [lists, setLists] = useState<ProspectList[]>([]);
  const [selectedListId, setSelectedListId] = useState("");
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>("4+");
  const [allProspects, setAllProspects] = useState<ProspectRow[]>([]);
  const [loadingProspects, setLoadingProspects] = useState(false);

  // Step 2 — Config
  const [campaignPrefix, setCampaignPrefix] = useState("");
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<number>>(new Set());
  const [maxPerDayOverrides, setMaxPerDayOverrides] = useState<Record<number, number>>({});
  const [warmupData, setWarmupData] = useState<WarmupAccountData[]>([]);
  const [loadingWarmup, setLoadingWarmup] = useState(false);

  // Step 3 — Preview (computed)

  // Step 4 — Sequence
  const [seqMode, setSeqMode] = useState<SeqMode>("copy");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [sequences, setSequences] = useState<SequenceStep[]>([]);
  const [loadingSeq, setLoadingSeq] = useState(false);
  // AI generation
  const [aiContext, setAiContext] = useState({ leadOrigin: "", leadProfile: "", campaignGoal: "", tone: "professionnel" });
  const [aiEmailCount, setAiEmailCount] = useState(3);
  const [generatingAi, setGeneratingAi] = useState(false);

  // Step 5 — Launch
  const [launching, setLaunching] = useState(false);
  const [autoStart, setAutoStart] = useState(false);
  const [launchResults, setLaunchResults] = useState<CampaignResult[] | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);

  // ─── Data loading ─────────────────────────────────────

  // Load prospect lists
  useEffect(() => {
    if (!open) return;
    fetch("/api/prospects/lists").then((r) => r.json()).then((d) => setLists(d.lists || []));
  }, [open]);

  // Load prospects when list is selected
  useEffect(() => {
    if (!selectedListId) { setAllProspects([]); return; }
    setLoadingProspects(true);
    fetch("/api/prospects")
      .then((r) => r.json())
      .then((d) => {
        const rows = (d.data || []) as ProspectRow[];
        setAllProspects(rows.filter((p) => p.list_id === selectedListId));
      })
      .finally(() => setLoadingProspects(false));
  }, [selectedListId]);

  // Auto-set campaign prefix from list name
  useEffect(() => {
    if (selectedListId && !campaignPrefix) {
      const list = lists.find((l) => l.id === selectedListId);
      if (list) setCampaignPrefix(list.name);
    }
  }, [selectedListId, lists, campaignPrefix]);

  // Load warmup data when entering step 2
  const loadWarmup = useCallback(() => {
    setLoadingWarmup(true);
    fetch("/api/sequences/warmup")
      .then((r) => r.json())
      .then((d) => setWarmupData(d.accounts || []))
      .finally(() => setLoadingWarmup(false));
  }, []);

  useEffect(() => {
    if (step === 2 && warmupData.length === 0) loadWarmup();
  }, [step, warmupData.length, loadWarmup]);

  // Load campaigns list when entering step 4
  useEffect(() => {
    if (step === 4 && campaigns.length === 0) {
      fetch("/api/sequences").then((r) => r.json()).then((d) => setCampaigns(d.campaigns || []));
    }
  }, [step, campaigns.length]);

  // ─── Computed values ──────────────────────────────────

  const filteredProspects = useMemo(() => {
    return allProspects.filter((p) => {
      if (!p.email?.trim()) return false;
      if (scoreFilter === "all") return true;
      const score = parseInt(p.ai_score || "0");
      if (scoreFilter === "4+") return score >= 4;
      return score === 5;
    });
  }, [allProspects, scoreFilter]);

  const accountProfiles = useMemo(() => {
    const map = new Map<number, AccountProfile>();
    for (const acc of warmupData) {
      map.set(acc.id, getAccountProfile(acc));
    }
    return map;
  }, [warmupData]);

  const selectedAccounts = useMemo(() => {
    return allAccounts.filter((a) => selectedAccountIds.has(a.id));
  }, [allAccounts, selectedAccountIds]);

  const getMaxPerDay = (accountId: number) => {
    if (maxPerDayOverrides[accountId] !== undefined) return maxPerDayOverrides[accountId];
    const profile = accountProfiles.get(accountId);
    return profile?.dailyTarget || 10;
  };

  const totalDailyCapacity = useMemo(() => {
    return selectedAccounts.reduce((sum, a) => sum + getMaxPerDay(a.id), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccounts, maxPerDayOverrides, accountProfiles]);

  const daysToComplete = totalDailyCapacity > 0 ? Math.ceil(filteredProspects.length / totalDailyCapacity) : 0;

  const estimatedEndDate = useMemo(() => {
    if (daysToComplete <= 0) return null;
    return addBusinessDays(new Date(), daysToComplete);
  }, [daysToComplete]);

  // Split preview
  const splitPreview = useMemo(() => {
    const accounts = [...selectedAccounts];
    if (accounts.length === 0) return [];
    const perAccount = Math.floor(filteredProspects.length / accounts.length);
    const remainder = filteredProspects.length % accounts.length;
    return accounts.map((acc, i) => ({
      account: acc,
      leadCount: perAccount + (i < remainder ? 1 : 0),
      sampleLeads: filteredProspects.slice(
        i * perAccount + Math.min(i, remainder),
        i * perAccount + Math.min(i, remainder) + Math.min(3, perAccount + (i < remainder ? 1 : 0))
      ),
    }));
  }, [selectedAccounts, filteredProspects]);

  // ─── Actions ──────────────────────────────────────────

  const loadSequencesFromCampaign = async (campaignId: number) => {
    setLoadingSeq(true);
    setSelectedCampaignId(campaignId);
    try {
      const res = await fetch(`/api/sequences/${campaignId}`);
      const data = await res.json();
      setSequences(data.sequences || []);
    } finally {
      setLoadingSeq(false);
    }
  };

  const generateWithAi = async () => {
    setGeneratingAi(true);
    try {
      const res = await fetch("/api/sequences/generate-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignName: campaignPrefix,
          leadOrigin: aiContext.leadOrigin,
          leadProfile: aiContext.leadProfile,
          campaignGoal: aiContext.campaignGoal,
          tone: aiContext.tone,
          emailCount: aiEmailCount,
          senderName: "Tony",
          language: "fr",
        }),
      });
      const data = await res.json();
      if (data.emails) {
        setSequences(data.emails.map((e: { seq_number: number; delay_days: number; subject: string; body: string }) => ({
          seq_number: e.seq_number,
          seq_delay_details: { delay_in_days: e.delay_days },
          subject: e.subject,
          email_body: e.body,
        })));
      }
    } finally {
      setGeneratingAi(false);
    }
  };

  const launchBulkImport = async () => {
    setLaunching(true);
    setLaunchError(null);
    try {
      const maxPerDayMap: Record<number, number> = {};
      selectedAccounts.forEach((a) => { maxPerDayMap[a.id] = getMaxPerDay(a.id); });

      const res = await fetch("/api/sequences/bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignPrefix,
          prospectIds: filteredProspects.map((p) => p.id),
          emailAccountIds: selectedAccounts.map((a) => a.id),
          maxLeadsPerDayPerAccount: maxPerDayMap,
          sequences: sequences.map((s) => ({
            seq_number: s.seq_number,
            seq_delay_details: s.seq_delay_details,
            subject: s.subject,
            email_body: s.email_body,
          })),
          schedule: {
            timezone: "Europe/Paris",
            days_of_the_week: [1, 2, 3, 4, 5],
            start_hour: "09:00",
            end_hour: "18:00",
          },
          stopLeadSettings: "REPLY_TO_AN_EMAIL",
          autoStart,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur serveur");
      setLaunchResults(data.results || []);
    } catch (err) {
      setLaunchError(String(err));
    } finally {
      setLaunching(false);
    }
  };

  // ─── Step readiness ───────────────────────────────────

  const step1Ready = filteredProspects.length > 0;
  const step2Ready = selectedAccounts.length > 0 && campaignPrefix.trim().length > 0;
  const step3Ready = step2Ready && filteredProspects.length > 0;
  const step4Ready = sequences.length > 0;

  // ─── Reset on close ───────────────────────────────────

  const handleClose = () => {
    setStep(1);
    setSelectedListId("");
    setScoreFilter("4+");
    setAllProspects([]);
    setCampaignPrefix("");
    setSelectedAccountIds(new Set());
    setMaxPerDayOverrides({});
    setSequences([]);
    setLaunchResults(null);
    setLaunchError(null);
    onClose();
  };

  if (!open) return null;

  // ─── Render ───────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-violet-100 rounded-lg flex items-center justify-center">
              <Upload className="w-4 h-4 text-violet-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Import Prospects → Smartlead</h2>
              <p className="text-xs text-gray-500">Étape {step}/5</p>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 text-gray-400 hover:text-gray-600 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-6 pt-4 pb-2">
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((s) => (
              <div key={s} className={cn("h-1 flex-1 rounded-full", s <= step ? "bg-violet-500" : "bg-gray-200")} />
            ))}
          </div>
          <div className="flex justify-between mt-1">
            {["Source", "Config", "Preview", "Séquence", "Lancer"].map((label, i) => (
              <span key={label} className={cn("text-[10px]", i + 1 <= step ? "text-violet-600 font-medium" : "text-gray-400")}>{label}</span>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* ═══ STEP 1 — Source ═══ */}
          {step === 1 && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Liste de prospects</label>
                <select
                  value={selectedListId}
                  onChange={(e) => { setSelectedListId(e.target.value); setCampaignPrefix(""); }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                >
                  <option value="">Sélectionner une liste...</option>
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>{l.name} ({l.count} contacts)</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Filtrer par score IA</label>
                <div className="flex gap-2">
                  {([["all", "Tous"], ["4+", "Score >= 4"], ["5", "Score = 5"]] as const).map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => setScoreFilter(val)}
                      className={cn(
                        "px-3 py-1.5 text-xs font-medium rounded-lg border cursor-pointer",
                        scoreFilter === val
                          ? "bg-violet-50 border-violet-300 text-violet-700"
                          : "border-gray-200 text-gray-600 hover:bg-gray-50"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {loadingProspects && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" /> Chargement...
                </div>
              )}

              {selectedListId && !loadingProspects && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Users className="w-4 h-4 text-violet-600" />
                    <span className="text-sm font-medium text-gray-900">
                      {filteredProspects.length} prospect{filteredProspects.length !== 1 ? "s" : ""} sélectionné{filteredProspects.length !== 1 ? "s" : ""}
                    </span>
                    <span className="text-xs text-gray-500">sur {allProspects.length} dans la liste</span>
                  </div>
                  {filteredProspects.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="text-left py-1 pr-3 text-gray-500 font-medium">Prénom</th>
                            <th className="text-left py-1 pr-3 text-gray-500 font-medium">Nom</th>
                            <th className="text-left py-1 pr-3 text-gray-500 font-medium">Entreprise</th>
                            <th className="text-left py-1 pr-3 text-gray-500 font-medium">Poste</th>
                            <th className="text-left py-1 text-gray-500 font-medium">Score</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredProspects.slice(0, 10).map((p) => (
                            <tr key={p.id} className="border-b border-gray-100">
                              <td className="py-1 pr-3 text-gray-800">{p.prenom}</td>
                              <td className="py-1 pr-3 text-gray-800">{p.nom}</td>
                              <td className="py-1 pr-3 text-gray-600">{p.entreprise}</td>
                              <td className="py-1 pr-3 text-gray-600">{p.poste}</td>
                              <td className="py-1">
                                <span className={cn("font-medium", parseInt(p.ai_score || "0") >= 4 ? "text-green-600" : "text-gray-400")}>
                                  {p.ai_score || "—"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {filteredProspects.length > 10 && (
                        <p className="text-xs text-gray-400 mt-2">...et {filteredProspects.length - 10} autres</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ═══ STEP 2 — Configuration & Capacité ═══ */}
          {step === 2 && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom de campagne</label>
                <input
                  type="text"
                  value={campaignPrefix}
                  onChange={(e) => setCampaignPrefix(e.target.value)}
                  placeholder="ex: Gestion Urbaine - Promevil"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                />
                {selectedAccounts.length > 1 && (
                  <p className="text-xs text-gray-400 mt-1">Les campagnes seront nommées &quot;{campaignPrefix || "..."} #1&quot;, &quot;#2&quot;, etc.</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Comptes email</label>
                {loadingWarmup ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" /> Chargement warmup...
                  </div>
                ) : (
                  <div className="space-y-2">
                    {allAccounts.filter((a) => a.is_smtp_success).map((acc) => {
                      const profile = accountProfiles.get(acc.id);
                      const selected = selectedAccountIds.has(acc.id);
                      const maxPerDay = getMaxPerDay(acc.id);
                      const recommended = profile?.dailyTarget || 10;
                      const providerCap = profile?.providerCapDaily || 80;
                      const overRecommended = maxPerDay > recommended;
                      const overProvider = maxPerDay > providerCap;

                      return (
                        <div
                          key={acc.id}
                          className={cn(
                            "border rounded-lg p-3 transition-colors",
                            selected ? "border-violet-300 bg-violet-50/50" : "border-gray-200 hover:border-gray-300"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={(e) => {
                                const next = new Set(selectedAccountIds);
                                if (e.target.checked) next.add(acc.id);
                                else next.delete(acc.id);
                                setSelectedAccountIds(next);
                              }}
                              className="accent-violet-600 cursor-pointer"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{acc.from_email}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                {profile && (
                                  <>
                                    <span className={cn("text-xs font-medium px-1.5 py-0.5 rounded", profile.healthBg, profile.healthColor)}>
                                      {profile.healthLabel} ({profile.health}%)
                                    </span>
                                    <span className="text-xs text-gray-400 capitalize">{profile.maturity}</span>
                                    <span className="text-xs text-gray-400">•</span>
                                    <span className="text-xs text-gray-500">Recommandé : {recommended}/jour</span>
                                  </>
                                )}
                              </div>
                            </div>
                            {selected && (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="number"
                                  min={1}
                                  max={200}
                                  value={maxPerDay}
                                  onChange={(e) => setMaxPerDayOverrides((prev) => ({ ...prev, [acc.id]: Math.max(1, parseInt(e.target.value) || 1) }))}
                                  className={cn(
                                    "w-16 border rounded px-2 py-1 text-sm text-center",
                                    overProvider ? "border-red-300 bg-red-50" : overRecommended ? "border-yellow-300 bg-yellow-50" : "border-gray-300"
                                  )}
                                />
                                <span className="text-xs text-gray-500">/jour</span>
                              </div>
                            )}
                          </div>
                          {selected && overProvider && (
                            <p className="text-xs text-red-600 mt-1 ml-7 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Dépasse la limite fournisseur ({providerCap}/jour)
                            </p>
                          )}
                          {selected && overRecommended && !overProvider && (
                            <p className="text-xs text-yellow-600 mt-1 ml-7 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Supérieur au recommandé warmup ({recommended}/jour)
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Capacity calculator */}
              {selectedAccounts.length > 0 && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-indigo-900 mb-2 flex items-center gap-2">
                    <Zap className="w-4 h-4" /> Capacité d&apos;envoi
                  </h4>
                  <div className="space-y-1 text-sm">
                    <p className="text-indigo-800">
                      {selectedAccounts.length} compte{selectedAccounts.length > 1 ? "s" : ""} × {totalDailyCapacity > 0 ? Math.round(totalDailyCapacity / selectedAccounts.length) : 0} moy./jour = <strong>{totalDailyCapacity} leads/jour</strong>
                    </p>
                    <p className="text-indigo-700">
                      {filteredProspects.length} leads ÷ {totalDailyCapacity}/jour = <strong>~{daysToComplete} jours ouvrés</strong>
                    </p>
                    {estimatedEndDate && (
                      <p className="text-indigo-600">
                        Fin estimée : <strong>{estimatedEndDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</strong>
                      </p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ═══ STEP 3 — Preview Split ═══ */}
          {step === 3 && (
            <>
              <p className="text-sm text-gray-600 mb-3">
                Les <strong>{filteredProspects.length}</strong> leads seront répartis sur <strong>{selectedAccounts.length}</strong> sous-campagnes :
              </p>
              <div className="space-y-3">
                {splitPreview.map((sp, i) => {
                  const profile = accountProfiles.get(sp.account.id);
                  return (
                    <div key={sp.account.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 bg-violet-100 rounded-full flex items-center justify-center">
                            <span className="text-xs font-bold text-violet-700">#{i + 1}</span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{sp.account.from_email}</p>
                            {profile && (
                              <span className={cn("text-xs font-medium", profile.healthColor)}>
                                Santé : {profile.health}% • {getMaxPerDay(sp.account.id)}/jour
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-sm font-semibold text-gray-900">{sp.leadCount} leads</span>
                      </div>
                      {profile && profile.health < 40 && (
                        <div className="flex items-center gap-1 text-xs text-red-600 mb-2">
                          <AlertTriangle className="w-3 h-3" />
                          Compte en santé critique — considérer retirer de la campagne
                        </div>
                      )}
                      {sp.sampleLeads.length > 0 && (
                        <div className="text-xs text-gray-500">
                          Aperçu : {sp.sampleLeads.map((l) => `${l.prenom} ${l.nom}`).join(", ")}
                          {sp.leadCount > 3 && "..."}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ═══ STEP 4 — Séquence ═══ */}
          {step === 4 && (
            <>
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-4">
                <button
                  onClick={() => setSeqMode("copy")}
                  className={cn("flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-lg cursor-pointer",
                    seqMode === "copy" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  <FileText className="w-3.5 h-3.5" /> Copier depuis campagne
                </button>
                <button
                  onClick={() => setSeqMode("ai")}
                  className={cn("flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-lg cursor-pointer",
                    seqMode === "ai" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  <Sparkles className="w-3.5 h-3.5" /> Générer avec IA
                </button>
              </div>

              {seqMode === "copy" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Campagne source</label>
                  <select
                    value={selectedCampaignId || ""}
                    onChange={(e) => { const id = Number(e.target.value); if (id) loadSequencesFromCampaign(id); }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">Sélectionner une campagne...</option>
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  {loadingSeq && (
                    <div className="flex items-center gap-2 text-sm text-gray-500 mt-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Chargement séquences...
                    </div>
                  )}
                </div>
              )}

              {seqMode === "ai" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Origine des leads</label>
                    <input type="text" value={aiContext.leadOrigin} onChange={(e) => setAiContext((p) => ({ ...p, leadOrigin: e.target.value }))}
                      placeholder="ex: Scraping API Gouv, secteur gestion urbaine"
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Profil des leads</label>
                    <input type="text" value={aiContext.leadProfile} onChange={(e) => setAiContext((p) => ({ ...p, leadProfile: e.target.value }))}
                      placeholder="ex: DRH, Directeur Formation, retail/luxe"
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Objectif campagne</label>
                    <input type="text" value={aiContext.campaignGoal} onChange={(e) => setAiContext((p) => ({ ...p, campaignGoal: e.target.value }))}
                      placeholder="ex: Obtenir un RDV démo"
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-xs font-medium text-gray-600">Nombre d&apos;emails :</label>
                    <select value={aiEmailCount} onChange={(e) => setAiEmailCount(Number(e.target.value))}
                      className="border border-gray-300 rounded px-2 py-1 text-sm">
                      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <button
                    onClick={generateWithAi}
                    disabled={generatingAi || !aiContext.campaignGoal}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 cursor-pointer"
                  >
                    {generatingAi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    {generatingAi ? "Génération..." : `Générer ${aiEmailCount} email${aiEmailCount > 1 ? "s" : ""}`}
                  </button>
                </div>
              )}

              {/* Sequence preview / editor */}
              {sequences.length > 0 && (
                <div className="mt-4 space-y-3">
                  <h4 className="text-sm font-semibold text-gray-900">{sequences.length} email{sequences.length > 1 ? "s" : ""} dans la séquence</h4>
                  {sequences.map((seq, i) => (
                    <div key={i} className="border border-gray-200 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-bold text-violet-600 bg-violet-100 px-1.5 py-0.5 rounded">Email {seq.seq_number}</span>
                        <span className="text-xs text-gray-400">J+{seq.seq_delay_details.delay_in_days}</span>
                      </div>
                      <input
                        type="text"
                        value={seq.subject}
                        onChange={(e) => {
                          const updated = [...sequences];
                          updated[i] = { ...updated[i], subject: e.target.value };
                          setSequences(updated);
                        }}
                        className="w-full border border-gray-200 rounded px-2 py-1 text-sm mb-1 font-medium"
                        placeholder="Sujet"
                      />
                      <textarea
                        value={seq.email_body}
                        onChange={(e) => {
                          const updated = [...sequences];
                          updated[i] = { ...updated[i], email_body: e.target.value };
                          setSequences(updated);
                        }}
                        rows={4}
                        className="w-full border border-gray-200 rounded px-2 py-1 text-xs text-gray-700 resize-y"
                      />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ═══ STEP 5 — Lancement ═══ */}
          {step === 5 && !launchResults && (
            <>
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <h4 className="text-sm font-semibold text-gray-900">Récapitulatif</h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <span className="text-gray-500">Source :</span>
                  <span className="text-gray-900">{lists.find((l) => l.id === selectedListId)?.name || "—"}</span>
                  <span className="text-gray-500">Leads :</span>
                  <span className="text-gray-900">{filteredProspects.length} (score {scoreFilter === "all" ? "tous" : scoreFilter})</span>
                  <span className="text-gray-500">Sous-campagnes :</span>
                  <span className="text-gray-900">{selectedAccounts.length}</span>
                  <span className="text-gray-500">Séquence :</span>
                  <span className="text-gray-900">{sequences.length} email{sequences.length > 1 ? "s" : ""}</span>
                  <span className="text-gray-500">Capacité :</span>
                  <span className="text-gray-900">{totalDailyCapacity} leads/jour → ~{daysToComplete} jours</span>
                  <span className="text-gray-500">Planning :</span>
                  <span className="text-gray-900">Lun-Ven, 9h-18h (Europe/Paris)</span>
                </div>
              </div>

              <div className="flex items-center gap-3 py-2">
                <input
                  type="checkbox"
                  id="autoStart"
                  checked={autoStart}
                  onChange={(e) => setAutoStart(e.target.checked)}
                  className="accent-violet-600 cursor-pointer"
                />
                <label htmlFor="autoStart" className="text-sm text-gray-700 cursor-pointer">
                  Démarrer immédiatement après création
                </label>
              </div>

              {!autoStart && (
                <p className="text-xs text-gray-500 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
                  Les campagnes seront créées en brouillon. Tu pourras les démarrer manuellement depuis Smartlead.
                </p>
              )}

              {launchError && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" /> {launchError}
                </div>
              )}
            </>
          )}

          {/* Launch results */}
          {step === 5 && launchResults && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600" /> Import terminé
              </h4>
              {launchResults.map((r, i) => (
                <div key={i} className={cn("border rounded-lg p-3 flex items-center justify-between",
                  r.status === "success" ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
                )}>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{r.campaignName}</p>
                    <p className="text-xs text-gray-500">{r.leadCount} leads</p>
                  </div>
                  {r.status === "success" ? (
                    <Check className="w-5 h-5 text-green-600" />
                  ) : (
                    <span className="text-xs text-red-600">{r.error}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
          <button
            onClick={() => step > 1 && !launchResults ? setStep((step - 1) as WizardStep) : handleClose()}
            className="flex items-center gap-1 px-4 py-2 text-sm text-gray-600 hover:text-gray-800 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            {step === 1 || launchResults ? "Fermer" : "Précédent"}
          </button>

          {launchResults ? (
            <button
              onClick={() => { handleClose(); onComplete(); }}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 cursor-pointer"
            >
              <Check className="w-4 h-4" /> Terminé
            </button>
          ) : step === 5 ? (
            <button
              onClick={launchBulkImport}
              disabled={launching}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 cursor-pointer"
            >
              {launching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {launching ? "Création en cours..." : "Lancer l'import"}
            </button>
          ) : (
            <button
              onClick={() => setStep((step + 1) as WizardStep)}
              disabled={
                (step === 1 && !step1Ready) ||
                (step === 2 && !step2Ready) ||
                (step === 3 && !step3Ready) ||
                (step === 4 && !step4Ready)
              }
              className="flex items-center gap-1 px-5 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 cursor-pointer"
            >
              Suivant <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
