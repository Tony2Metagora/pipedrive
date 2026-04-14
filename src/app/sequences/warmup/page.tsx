"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Flame, Loader2, Plus, X, Check, AlertTriangle, ShieldCheck,
  TrendingUp, Activity, BarChart3, Info, Shield, Square, Mail,
  Eye, EyeOff, Globe, Lock, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateParis } from "@/lib/date-paris";
import { type WarmupAccountData, getAccountProfile } from "@/lib/warmup-capacity";

// ─── Domain health check types ──────────────────────────

interface DomainCheck {
  domain: string;
  spf: { found: boolean; record: string | null; valid: boolean; issue: string | null };
  dkim: { found: boolean; record: string | null; selector: string };
  dmarc: { found: boolean; record: string | null; policy: string | null; issue: string | null };
  mx: { found: boolean; records: string[] };
  score: number;
  recommendations: string[];
}

// ─── Presets for providers ──────────────────────────────

const PROVIDER_PRESETS: Record<string, { smtp_host: string; smtp_port: number; imap_host: string; imap_port: number; type: string }> = {
  google: { smtp_host: "smtp.gmail.com", smtp_port: 587, imap_host: "imap.gmail.com", imap_port: 993, type: "GMAIL" },
  outlook: { smtp_host: "smtp.office365.com", smtp_port: 587, imap_host: "outlook.office365.com", imap_port: 993, type: "OUTLOOK" },
  hostinger: { smtp_host: "smtp.hostinger.com", smtp_port: 465, imap_host: "imap.hostinger.com", imap_port: 993, type: "SMTP" },
  custom: { smtp_host: "", smtp_port: 587, imap_host: "", imap_port: 993, type: "SMTP" },
};

// ─── Main component ─────────────────────────────────────

export default function WarmupPage() {
  const [accounts, setAccounts] = useState<WarmupAccountData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState<number | null>(null);

  // Add account form
  const [showAdd, setShowAdd] = useState(false);
  const [addProvider, setAddProvider] = useState("hostinger");
  const [addForm, setAddForm] = useState({
    from_name: "",
    from_email: "",
    user_name: "",
    password: "",
    smtp_host: "smtp.hostinger.com",
    smtp_port: 465,
    imap_host: "imap.hostinger.com",
    imap_port: 993,
    type: "SMTP",
    max_email_per_day: 10,
    warmup_enabled: true,
    total_warmup_per_day: 10,
    daily_rampup: 5,
  });
  const [addSaving, setAddSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Domain health check
  const [domainChecks, setDomainChecks] = useState<Record<string, DomainCheck>>({});
  const [domainLoading, setDomainLoading] = useState<string | null>(null);

  const flash = (msg: string) => { setActionMsg(msg); setTimeout(() => setActionMsg(null), 3500); };

  const checkDomain = async (domain: string) => {
    if (domainChecks[domain] && !domainLoading) return; // already checked
    setDomainLoading(domain);
    try {
      const res = await fetch(`/api/sequences/domain-check?domain=${encodeURIComponent(domain)}`);
      const d = await res.json();
      if (!d.error) setDomainChecks((prev) => ({ ...prev, [domain]: d }));
    } catch { /* ignore */ }
    setDomainLoading(null);
  };

  const refreshDomain = async (domain: string) => {
    setDomainLoading(domain);
    try {
      const res = await fetch(`/api/sequences/domain-check?domain=${encodeURIComponent(domain)}`);
      const d = await res.json();
      if (!d.error) setDomainChecks((prev) => ({ ...prev, [domain]: d }));
    } catch { /* ignore */ }
    setDomainLoading(null);
  };

  // Auto-check domains when accounts load
  useEffect(() => {
    if (accounts.length === 0) return;
    const domains = [...new Set(accounts.map((a) => a.from_email.split("@")[1]).filter(Boolean))];
    domains.forEach((d) => { if (!domainChecks[d]) checkDomain(d); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts]);

  // Auto-detect provider from email input
  const onEmailChange = (email: string) => {
    setAddForm((prev) => ({ ...prev, from_email: email }));
    const domain = email.split("@")[1]?.toLowerCase();
    if (!domain) return;
    if (domain.includes("gmail.com") || domain === "metagora.tech") applyPreset("google");
    else if (domain.includes("outlook") || domain.includes("hotmail") || domain.includes("office365")) applyPreset("outlook");
    else if (domain === "metagora-tech.fr" || domain.includes("hostinger")) applyPreset("hostinger");
  };

  const fetchAccounts = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/sequences/warmup");
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setAccounts(d.accounts || []);
    } catch (e) { setError(String(e)); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const updateWarmup = async (accountId: number, settings: Record<string, unknown>) => {
    setSaving(accountId); setError(null);
    try {
      const res = await fetch("/api/sequences/warmup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_account_id: accountId, settings }),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      flash("Warmup mis à jour");
      // Optimistic update: reflect warmup status change immediately in local state
      // (Smartlead API may not reflect the change instantly on next GET)
      const newStatus = settings.warmup_enabled === false ? "DISABLED" : "ENABLED";
      setAccounts((prev) => prev.map((a) =>
        a.id === accountId
          ? { ...a, warmup_details: { ...(a.warmup_details || { warmup_reputation: "0", total_sent_count: 0, total_spam_count: 0 }), status: newStatus } }
          : a
      ));
    } catch (e) { setError(String(e)); }
    setSaving(null);
  };

  const applyPreset = (key: string) => {
    const p = PROVIDER_PRESETS[key];
    setAddProvider(key);
    setAddForm((prev) => ({ ...prev, ...p }));
  };

  const submitNewAccount = async () => {
    if (!addForm.from_email || !addForm.smtp_host || !addForm.password) {
      setError("Email, mot de passe et SMTP host requis");
      return;
    }
    setAddSaving(true); setError(null);
    try {
      const res = await fetch("/api/sequences/warmup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-account",
          payload: {
            ...addForm,
            user_name: addForm.user_name || addForm.from_email,
          },
        }),
      });
      const d = await res.json();
      if (d.error) {
        const errMsg = String(d.error);
        // Detect Google App Password error and show helpful message
        if (errMsg.includes("Application-specific password required") || errMsg.includes("InvalidSecondFactor")) {
          throw new Error(
            "Google bloque la connexion car la 2FA est activée. Vous devez utiliser un Mot de passe d'application :\n" +
            "1. Allez sur myaccount.google.com/apppasswords\n" +
            "2. Créez un mot de passe pour 'Mail' / 'Autre (Smartlead)'\n" +
            "3. Utilisez ce mot de passe de 16 caractères au lieu de votre mot de passe Google"
          );
        }
        if (errMsg.includes("ACCOUNT_VERIFICATION_FAILED")) {
          throw new Error("Échec de vérification du compte. Vérifiez l'email, le mot de passe, et les paramètres SMTP/IMAP. " + errMsg.replace(/.*message":"/, "").replace(/".*/, ""));
        }
        throw new Error(errMsg);
      }
      flash("Compte email ajouté !");
      setShowAdd(false);
      setAddForm({
        from_name: "", from_email: "", user_name: "", password: "",
        smtp_host: "smtp.hostinger.com", smtp_port: 465,
        imap_host: "imap.hostinger.com", imap_port: 993,
        type: "SMTP", max_email_per_day: 10, warmup_enabled: true,
        total_warmup_per_day: 10, daily_rampup: 5,
      });
      await fetchAccounts();
    } catch (e) { setError(String(e)); }
    setAddSaving(false);
  };

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
            <Flame className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Warmup</h1>
            <p className="text-sm text-gray-500">{accounts.length} compte{accounts.length !== 1 ? "s" : ""} email • Réputation et progression</p>
          </div>
        </div>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 cursor-pointer">
          <Plus className="w-4 h-4" /> Nouveau compte
        </button>
      </div>

      {/* Banners */}
      {actionMsg && (
        <div className="mb-3 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700 flex items-center gap-2">
          <Check className="w-3.5 h-3.5" /> {actionMsg}
        </div>
      )}
      {error && (
        <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <div className="flex-1 whitespace-pre-line">{error}</div>
            <button onClick={() => setError(null)} className="ml-auto shrink-0 cursor-pointer"><X className="w-3 h-3" /></button>
          </div>
        </div>
      )}

      {/* Best practices */}
      <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-4">
        <h3 className="text-xs font-semibold text-amber-800 flex items-center gap-1.5 mb-2">
          <Info className="w-3.5 h-3.5" /> Bonnes pratiques warmup
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] text-amber-700">
          <div className="space-y-1">
            <p><b>Rampe progressive :</b> Commencez à 5-10/jour, augmentez de 5/jour chaque semaine</p>
            <p><b>Ratio spam :</b> Rester sous 2% (idéal &lt;1%). Au-dessus de 5% = action urgente</p>
            <p><b>Taux de réponse warmup :</b> Viser 25-30% pour bâtir la réputation</p>
          </div>
          <div className="space-y-1">
            <p><b>Google Workspace :</b> Limite technique 2000/jour, max recommandé 80/jour en cold email</p>
            <p><b>Hostinger :</b> Plus risqué, plafonner à 40-50/jour max, surveiller le spam de près</p>
            <p><b>Intervalle :</b> Minimum 3-5 min entre chaque envoi (Smartlead gère automatiquement)</p>
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-orange-400" /></div>
      ) : accounts.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Mail className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p className="text-lg font-medium text-gray-600">Aucun compte email</p>
          <p className="text-sm text-gray-400 mt-1">Ajoutez votre premier compte pour commencer le warmup.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {accounts.map((acc) => {
            const p = getAccountProfile(acc);
            const ds = acc.warmup_stats?.daily_stats || [];
            const maxSent = Math.max(...ds.map((d) => d.sent), 1);
            const todaySent = acc.daily_sent_count || 0;

            return (
              <div key={acc.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                {/* Header row */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                  <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0", p.healthBg)}>
                    <ShieldCheck className={cn("w-5 h-5", p.healthColor)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-900">{acc.from_email}</p>
                      <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", p.healthBg, p.healthColor)}>{p.health}/100 — {p.healthLabel}</span>
                      <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{p.isGoogle ? "Google Workspace" : p.isHostinger ? "Hostinger" : acc.type}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                      <span className="text-[10px] text-gray-400">{acc.from_name}</span>
                      <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", acc.is_smtp_success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700")}>
                        SMTP {acc.is_smtp_success ? "OK" : "KO"}
                      </span>
                      <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded",
                        acc.warmup_details?.status === "ACTIVE" || acc.warmup_details?.status === "ENABLED"
                          ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
                      )}>
                        Warmup {acc.warmup_details?.status === "ACTIVE" || acc.warmup_details?.status === "ENABLED" ? "actif" : "inactif"}
                      </span>
                      {/* Reputation badge */}
                      {(() => {
                        const rep = acc.warmup_details?.warmup_reputation;
                        const repNum = rep ? parseFloat(rep) : NaN;
                        const warmupActive = acc.warmup_details?.status === "ACTIVE" || acc.warmup_details?.status === "ENABLED";
                        if (!warmupActive && isNaN(repNum)) return <span className="text-[10px] text-gray-400">Réputation: —</span>;
                        if (isNaN(repNum)) return <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">Réputation: en attente</span>;
                        const repColor = repNum >= 80 ? "bg-green-50 text-green-700" : repNum >= 50 ? "bg-yellow-50 text-yellow-700" : "bg-red-50 text-red-700";
                        return <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", repColor)}>Réputation: {rep}%</span>;
                      })()}
                      <span className="text-[10px] text-gray-400">
                        Ancienneté: {p.emailAgeDays === null ? "—" : `${p.emailAgeDays}j`}
                      </span>
                    </div>
                    {/* DNS alert if SMTP broken */}
                    {!acc.is_smtp_success && (
                      <div className="flex items-center gap-1 mt-1 text-[10px] text-red-600">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        <span>SMTP non connecté — vérifiez la configuration DNS (SPF, DKIM, DMARC) et les identifiants</span>
                      </div>
                    )}
                  </div>

                  {/* Daily / Weekly progress */}
                  <div className="text-right shrink-0 space-y-0.5">
                    <div className="flex items-center gap-1.5 justify-end">
                      <span className="text-[10px] text-gray-400">Aujourd'hui</span>
                      <span className={cn("text-xs font-bold", todaySent >= p.dailyTarget ? "text-green-600" : "text-blue-600")}>
                        {todaySent}/{p.dailyTarget}
                      </span>
                    </div>
                    <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={cn("h-full rounded-full", todaySent >= p.dailyTarget ? "bg-green-500" : "bg-blue-500")} style={{ width: `${Math.min((todaySent / p.dailyTarget) * 100, 100)}%` }} />
                    </div>
                    <div className="flex items-center gap-1.5 justify-end">
                      <span className="text-[10px] text-gray-400">Semaine</span>
                      <span className={cn("text-xs font-bold", p.weeklySent >= p.weeklyTarget ? "text-green-600" : "text-indigo-600")}>
                        {p.weeklySent}/{p.weeklyTarget}
                      </span>
                    </div>
                    <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={cn("h-full rounded-full", p.weeklySent >= p.weeklyTarget ? "bg-green-500" : "bg-indigo-500")} style={{ width: `${Math.min((p.weeklySent / p.weeklyTarget) * 100, 100)}%` }} />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 lg:divide-x divide-gray-100">
                  {/* Stats summary */}
                  <div className="p-4">
                    <h4 className="text-[10px] font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1">
                      <BarChart3 className="w-3 h-3" /> Statistiques
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-blue-50 rounded-lg p-2 text-center">
                        <p className="text-lg font-bold text-blue-700">{p.totalSent}</p>
                        <p className="text-[9px] text-blue-500">Total envoyés</p>
                      </div>
                      <div className="bg-violet-50 rounded-lg p-2 text-center">
                        <p className="text-lg font-bold text-violet-700">{p.historyWeeklySent}</p>
                        <p className="text-[9px] text-violet-500">Envoyés 7j observés</p>
                      </div>
                      <div className={cn("rounded-lg p-2 text-center", p.spamRate > 2 ? "bg-red-50" : "bg-green-50")}>
                        <p className={cn("text-lg font-bold", p.spamRate > 2 ? "text-red-700" : "text-green-700")}>{p.spamRate.toFixed(1)}%</p>
                        <p className={cn("text-[9px]", p.spamRate > 2 ? "text-red-500" : "text-green-500")}>Taux spam</p>
                      </div>
                      <div className="bg-indigo-50 rounded-lg p-2 text-center">
                        <p className="text-lg font-bold text-indigo-700">{p.rep || "—"}</p>
                        <p className="text-[9px] text-indigo-500">Réputation</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-2 text-center">
                        <p className="text-sm font-bold text-gray-700">{p.maturity === "new" ? "Nouveau" : p.maturity === "warming" ? "En warmup" : p.maturity === "warm" ? "Chaud" : "Mature"}</p>
                        <p className="text-[9px] text-gray-500">Maturité</p>
                      </div>
                    </div>
                  </div>

                  {/* 7-day chart */}
                  <div className="p-4">
                    <h4 className="text-[10px] font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1">
                      <Activity className="w-3 h-3" /> 7 derniers jours
                    </h4>
                    {ds.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-6">Pas de données warmup</p>
                    ) : (
                      <div className="space-y-1">
                        {ds.map((d) => (
                          <div key={d.date} className="flex items-center gap-2 text-[10px]">
                            <span className="text-gray-400 w-16 shrink-0">{new Date(d.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</span>
                            <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden flex">
                              <div className="h-full bg-blue-400 rounded-l-full" style={{ width: `${(d.delivered / maxSent) * 100}%` }} title={`${d.delivered} livrés`} />
                              {d.spam > 0 && <div className="h-full bg-red-400" style={{ width: `${(d.spam / maxSent) * 100}%` }} title={`${d.spam} spam`} />}
                            </div>
                            <span className="text-gray-600 w-8 text-right font-medium">{d.sent}</span>
                            {d.spam > 0 && <span className="text-red-500 text-[9px]">({d.spam} spam)</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Ramp + actions */}
                  <div className="p-4">
                    <h4 className="text-[10px] font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" /> Rampe recommandée
                    </h4>
                    <div className="space-y-1">
                      <p className="text-[10px] text-gray-500 mb-1">
                        Recommandation hebdo: <span className="font-semibold text-gray-700">{p.weeklyTarget}/sem</span>{" "}
                        <span className="text-gray-400">(confiance {p.estimationConfidence})</span>
                      </p>
                      {p.rampTable.map((r) => (
                        <div key={r.week} className={cn("flex items-center justify-between text-xs", r.week === p.currentWeek ? "font-bold text-orange-700" : "text-gray-500")}>
                          <span>Semaine {r.week} {r.week === p.currentWeek ? "←" : ""}</span>
                          <span>{r.daily}/jour • {r.daily * 7}/sem</span>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
                      <button
                        onClick={() => updateWarmup(acc.id, {
                          warmup_enabled: true,
                          total_warmup_per_day: p.dailyTarget,
                          daily_rampup: 5,
                          reply_rate_percentage: 30,
                          auto_adjust_warmup: true,
                          is_rampup_enabled: true,
                        })}
                        disabled={saving === acc.id}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-[10px] font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 disabled:opacity-50 cursor-pointer"
                      >
                        {saving === acc.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Flame className="w-3 h-3" />}
                        Activer warmup ({p.dailyTarget}/jour + rampe auto)
                      </button>
                      {(acc.warmup_details?.status === "ENABLED" || acc.warmup_details?.status === "ACTIVE") && (
                        <button
                          onClick={() => updateWarmup(acc.id, { warmup_enabled: false })}
                          disabled={saving === acc.id}
                          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-[10px] font-medium text-gray-500 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-50 cursor-pointer"
                        >
                          <Square className="w-3 h-3" /> Désactiver warmup
                        </button>
                      )}
                    </div>

                    {/* Alerts */}
                    {p.spamRate > 2 && (
                      <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg text-[10px] text-red-700 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>Taux spam élevé ({p.spamRate.toFixed(1)}%) — réduisez le volume, vérifiez SPF/DKIM/DMARC</span>
                      </div>
                    )}
                    {todaySent > p.dailyTarget * 1.5 && (
                      <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-lg text-[10px] text-yellow-700 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>Volume ({todaySent}/jour) dépasse la recommandation ({p.dailyTarget}/jour)</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Global recommendations */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
              <Shield className="w-4 h-4 text-blue-500" /> Recommandations
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-gray-600">
              {accounts.filter((a) => a.from_email.endsWith("@metagora.tech")).length > 0 && (
                <div className="bg-blue-50 rounded-lg p-3">
                  <p className="font-semibold text-blue-800 mb-1">Google Workspace (@metagora.tech)</p>
                  <ul className="space-y-0.5 text-blue-700">
                    <li>• tony@metagora.tech (2 ans) : peut monter à 50-80/jour</li>
                    <li>• anna.i@metagora.tech (nouveau) : commencer à 10/jour</li>
                    <li>• Activez le warmup Smartlead sur tous les comptes neufs</li>
                  </ul>
                </div>
              )}
              {accounts.filter((a) => a.from_email.endsWith("@metagora-tech.fr")).length > 0 && (
                <div className="bg-orange-50 rounded-lg p-3">
                  <p className="font-semibold text-orange-800 mb-1">Hostinger (@metagora-tech.fr)</p>
                  <ul className="space-y-0.5 text-orange-700">
                    <li>• Réputation plus fragile — soyez conservateur</li>
                    <li>• Nouveaux comptes : 5/jour semaine 1, max 35-40/jour à terme</li>
                    <li>• Vérifiez SPF, DKIM et DMARC sur Hostinger</li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Domain Health Check ─────────────────────────── */}
      {!loading && accounts.length > 0 && (() => {
        const domains = [...new Set(accounts.map((a) => a.from_email.split("@")[1]).filter(Boolean))];
        return (
          <div className="mt-4 bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
              <Globe className="w-4 h-4 text-indigo-500" /> Santé des domaines (SPF / DKIM / DMARC)
            </h3>
            <div className="space-y-3">
              {domains.map((domain) => {
                const dc = domainChecks[domain];
                const isLoading = domainLoading === domain;
                return (
                  <div key={domain} className="border border-gray-100 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Lock className="w-3.5 h-3.5 text-gray-400" />
                        <span className="text-xs font-semibold text-gray-800">{domain}</span>
                        {dc && (
                          <span className={cn(
                            "text-[10px] font-bold px-1.5 py-0.5 rounded",
                            dc.score >= 80 ? "bg-green-100 text-green-700" : dc.score >= 50 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"
                          )}>
                            {dc.score}/100
                          </span>
                        )}
                      </div>
                      <button onClick={() => refreshDomain(domain)} disabled={isLoading}
                        className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600 cursor-pointer disabled:opacity-50">
                        <RefreshCw className={cn("w-3 h-3", isLoading && "animate-spin")} /> {isLoading ? "Vérification..." : "Revérifier"}
                      </button>
                    </div>
                    {!dc && !isLoading && (
                      <p className="text-[10px] text-gray-400">Cliquez sur Revérifier pour analyser le domaine</p>
                    )}
                    {isLoading && !dc && (
                      <div className="flex items-center gap-2 text-[10px] text-gray-400"><Loader2 className="w-3 h-3 animate-spin" /> Analyse DNS en cours...</div>
                    )}
                    {dc && (
                      <div className="space-y-1.5">
                        <div className="grid grid-cols-4 gap-2">
                          <div className={cn("rounded-lg p-2 text-center text-[10px]", dc.spf.found ? (dc.spf.valid ? "bg-green-50" : "bg-yellow-50") : "bg-red-50")}>
                            <p className={cn("font-bold", dc.spf.found ? (dc.spf.valid ? "text-green-700" : "text-yellow-700") : "text-red-700")}>
                              {dc.spf.found ? (dc.spf.valid ? "✅ OK" : "⚠️ Partiel") : "❌ Absent"}
                            </p>
                            <p className="text-gray-500">SPF</p>
                          </div>
                          <div className={cn("rounded-lg p-2 text-center text-[10px]", dc.dkim.found ? "bg-green-50" : "bg-red-50")}>
                            <p className={cn("font-bold", dc.dkim.found ? "text-green-700" : "text-red-700")}>
                              {dc.dkim.found ? "✅ OK" : "❌ Absent"}
                            </p>
                            <p className="text-gray-500">DKIM</p>
                          </div>
                          <div className={cn("rounded-lg p-2 text-center text-[10px]", dc.dmarc.found ? (dc.dmarc.policy !== "none" ? "bg-green-50" : "bg-yellow-50") : "bg-red-50")}>
                            <p className={cn("font-bold", dc.dmarc.found ? (dc.dmarc.policy !== "none" ? "text-green-700" : "text-yellow-700") : "text-red-700")}>
                              {dc.dmarc.found ? (dc.dmarc.policy !== "none" ? "✅ OK" : "⚠️ none") : "❌ Absent"}
                            </p>
                            <p className="text-gray-500">DMARC</p>
                          </div>
                          <div className={cn("rounded-lg p-2 text-center text-[10px]", dc.mx.found ? "bg-green-50" : "bg-red-50")}>
                            <p className={cn("font-bold", dc.mx.found ? "text-green-700" : "text-red-700")}>
                              {dc.mx.found ? "✅ OK" : "❌ Absent"}
                            </p>
                            <p className="text-gray-500">MX</p>
                          </div>
                        </div>
                        {dc.recommendations.length > 0 && (
                          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                            <p className="text-[10px] font-semibold text-red-700 mb-1">Actions requises :</p>
                            {dc.recommendations.map((r, i) => (
                              <p key={i} className="text-[10px] text-red-600">• {r}</p>
                            ))}
                          </div>
                        )}
                        {dc.spf.issue && (
                          <p className="text-[10px] text-yellow-600">SPF : {dc.spf.issue}</p>
                        )}
                        {dc.dmarc.issue && (
                          <p className="text-[10px] text-yellow-600">DMARC : {dc.dmarc.issue}</p>
                        )}
                        {dc.dkim.found && (
                          <p className="text-[10px] text-gray-400">DKIM sélecteur : {dc.dkim.selector}</p>
                        )}

                        {/* DNS Config Guide — shown when something is missing */}
                        {(!dc.spf.found || !dc.dkim.found || !dc.dmarc.found) && (
                          <div className="mt-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                            <p className="text-[11px] font-semibold text-indigo-800 mb-2">📋 Guide de configuration DNS — {domain}</p>
                            <p className="text-[10px] text-indigo-600 mb-2">
                              Connectez-vous à <b>Hostinger → hPanel → DNS Zone</b> (ou votre registrar DNS) et ajoutez ces enregistrements TXT :
                            </p>
                            <div className="space-y-2">
                              {!dc.spf.found && (
                                <div className="bg-white rounded p-2 border border-indigo-100">
                                  <p className="text-[10px] font-bold text-indigo-800">1. SPF (empêche l&apos;usurpation d&apos;identité)</p>
                                  <div className="mt-1 grid grid-cols-[80px_1fr] gap-1 text-[10px]">
                                    <span className="text-gray-500">Type :</span><span className="font-mono text-gray-800">TXT</span>
                                    <span className="text-gray-500">Nom :</span><span className="font-mono text-gray-800">@</span>
                                    <span className="text-gray-500">Valeur :</span>
                                    <span className="font-mono text-gray-800 bg-gray-50 px-1 rounded select-all break-all">v=spf1 include:_spf.google.com include:spf.hostinger.com ~all</span>
                                    <span className="text-gray-500">TTL :</span><span className="font-mono text-gray-800">3600</span>
                                  </div>
                                </div>
                              )}
                              {!dc.dkim.found && (
                                <div className="bg-white rounded p-2 border border-indigo-100">
                                  <p className="text-[10px] font-bold text-indigo-800">2. DKIM (signe vos emails cryptographiquement)</p>
                                  <div className="mt-1 text-[10px] text-gray-600 space-y-1">
                                    <p><b>Hostinger :</b> hPanel → Emails → Gérer → DKIM → Copier la clé publique, puis :</p>
                                    <div className="grid grid-cols-[80px_1fr] gap-1">
                                      <span className="text-gray-500">Type :</span><span className="font-mono text-gray-800">TXT</span>
                                      <span className="text-gray-500">Nom :</span><span className="font-mono text-gray-800 select-all">default._domainkey</span>
                                      <span className="text-gray-500">Valeur :</span><span className="font-mono text-gray-800 bg-gray-50 px-1 rounded break-all">v=DKIM1; k=rsa; p=VOTRE_CLE_PUBLIQUE_ICI</span>
                                    </div>
                                    <p className="text-indigo-500"><b>Google Workspace :</b> Admin Console → Apps → Gmail → Authentification → Générer DKIM → Copier l&apos;enregistrement TXT</p>
                                  </div>
                                </div>
                              )}
                              {!dc.dmarc.found && (
                                <div className="bg-white rounded p-2 border border-indigo-100">
                                  <p className="text-[10px] font-bold text-indigo-800">3. DMARC (indique aux serveurs quoi faire si SPF/DKIM échouent)</p>
                                  <div className="mt-1 grid grid-cols-[80px_1fr] gap-1 text-[10px]">
                                    <span className="text-gray-500">Type :</span><span className="font-mono text-gray-800">TXT</span>
                                    <span className="text-gray-500">Nom :</span><span className="font-mono text-gray-800 select-all">_dmarc</span>
                                    <span className="text-gray-500">Valeur :</span>
                                    <span className="font-mono text-gray-800 bg-gray-50 px-1 rounded select-all break-all">v=DMARC1; p=quarantine; rua=mailto:dmarc@{domain}; pct=100</span>
                                    <span className="text-gray-500">TTL :</span><span className="font-mono text-gray-800">3600</span>
                                  </div>
                                </div>
                              )}
                            </div>
                            <p className="text-[9px] text-indigo-400 mt-2">⏱ Après modification, les DNS prennent 1-24h pour se propager. Revenez cliquer &quot;Revérifier&quot; demain.</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ─── Add account modal ──────────────────────────── */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Nouveau compte email</h3>
              <button onClick={() => setShowAdd(false)} className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>

            {/* Provider presets */}
            <div>
              <label className="text-[10px] font-semibold text-gray-500 uppercase">Provider</label>
              <div className="flex gap-2 mt-1">
                {[
                  { key: "google", label: "Google Workspace" },
                  { key: "outlook", label: "Outlook/O365" },
                  { key: "hostinger", label: "Hostinger" },
                  { key: "custom", label: "Autre SMTP" },
                ].map((p) => (
                  <button
                    key={p.key}
                    onClick={() => applyPreset(p.key)}
                    className={cn(
                      "px-3 py-1.5 text-[10px] font-medium rounded-lg border cursor-pointer",
                      addProvider === p.key
                        ? "bg-orange-50 border-orange-300 text-orange-700"
                        : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Form fields */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-semibold text-gray-500">Nom affiché</label>
                <input value={addForm.from_name} onChange={(e) => setAddForm({ ...addForm, from_name: e.target.value })}
                  placeholder="Anna Islum" className="w-full mt-1 px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-400 outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-500">Email</label>
                <input value={addForm.from_email} onChange={(e) => onEmailChange(e.target.value)}
                  placeholder="anna@metagora-tech.fr" className="w-full mt-1 px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-400 outline-none" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-semibold text-gray-500">Identifiant SMTP <span className="text-gray-400">(souvent = email)</span></label>
                <input value={addForm.user_name} onChange={(e) => setAddForm({ ...addForm, user_name: e.target.value })}
                  placeholder={addForm.from_email || "email@exemple.com"} className="w-full mt-1 px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-400 outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-500">
                  {addProvider === "google" ? "Mot de passe d'application Google" : "Mot de passe"}
                </label>
                <div className="relative mt-1">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={addForm.password}
                    onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                    placeholder={addProvider === "google" ? "abcdefghijklmnop (16 car.)" : "Mot de passe SMTP"}
                    className="w-full px-3 py-1.5 pr-8 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-400 outline-none"
                  />
                  <button onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 cursor-pointer">
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                {addProvider === "google" && (
                  <p className="text-[9px] text-blue-600 mt-1">
                    ⚠️ Google exige un <b>Mot de passe d&apos;application</b> (pas votre mot de passe Google).
                    Créez-le sur <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="underline font-medium">myaccount.google.com/apppasswords</a>
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-semibold text-gray-500">SMTP Host</label>
                <input value={addForm.smtp_host} onChange={(e) => setAddForm({ ...addForm, smtp_host: e.target.value })}
                  className="w-full mt-1 px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-400 outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-500">SMTP Port</label>
                <input type="number" value={addForm.smtp_port} onChange={(e) => setAddForm({ ...addForm, smtp_port: Number(e.target.value) })}
                  className="w-full mt-1 px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-400 outline-none" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-semibold text-gray-500">IMAP Host <span className="text-gray-400">(pour recevoir les réponses)</span></label>
                <input value={addForm.imap_host} onChange={(e) => setAddForm({ ...addForm, imap_host: e.target.value })}
                  className="w-full mt-1 px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-400 outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-500">IMAP Port</label>
                <input type="number" value={addForm.imap_port} onChange={(e) => setAddForm({ ...addForm, imap_port: Number(e.target.value) })}
                  className="w-full mt-1 px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-400 outline-none" />
              </div>
            </div>

            <div className="h-px bg-gray-100" />

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-semibold text-gray-500">Max mails/jour</label>
                <input type="number" value={addForm.max_email_per_day} onChange={(e) => setAddForm({ ...addForm, max_email_per_day: Number(e.target.value) })}
                  className="w-full mt-1 px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-400 outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-500">Warmup/jour</label>
                <input type="number" value={addForm.total_warmup_per_day} onChange={(e) => setAddForm({ ...addForm, total_warmup_per_day: Number(e.target.value) })}
                  className="w-full mt-1 px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-400 outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-500">Rampe/jour</label>
                <input type="number" value={addForm.daily_rampup} onChange={(e) => setAddForm({ ...addForm, daily_rampup: Number(e.target.value) })}
                  className="w-full mt-1 px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-400 outline-none" />
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
              <input type="checkbox" checked={addForm.warmup_enabled} onChange={(e) => setAddForm({ ...addForm, warmup_enabled: e.target.checked })} className="rounded" />
              Activer le warmup dès la création
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg cursor-pointer">Annuler</button>
              <button onClick={submitNewAccount} disabled={addSaving || !addForm.from_email || !addForm.password}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-50 cursor-pointer">
                {addSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Ajouter le compte
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
