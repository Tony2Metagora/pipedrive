"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Globe, Loader2, RefreshCw, ShieldCheck, AlertTriangle, Check, X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DomainCheck {
  domain: string;
  spf: { found: boolean; record: string | null; valid: boolean; issue: string | null };
  dkim: { found: boolean; record: string | null; selector: string };
  dmarc: { found: boolean; record: string | null; policy: string | null; issue: string | null };
  mx: { found: boolean; records: string[] };
  score: number;
  recommendations: string[];
}

interface EmailAccount {
  id: number;
  from_email: string;
  is_smtp_success: boolean;
}

export default function DomainsPage() {
  const [domains, setDomains] = useState<Map<string, { accounts: string[]; check: DomainCheck | null; loading: boolean }>>(new Map());
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  // Load accounts → extract unique domains
  const fetchAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    try {
      const res = await fetch("/api/sequences/warmup");
      const json = await res.json();
      const accounts: EmailAccount[] = json.accounts || [];

      const domainMap = new Map<string, { accounts: string[]; check: DomainCheck | null; loading: boolean }>();
      for (const acc of accounts) {
        const domain = acc.from_email.split("@")[1];
        if (!domain) continue;
        const existing = domainMap.get(domain);
        if (existing) {
          existing.accounts.push(acc.from_email);
        } else {
          domainMap.set(domain, { accounts: [acc.from_email], check: null, loading: false });
        }
      }
      setDomains(domainMap);

      // Auto-check all domains
      for (const domain of domainMap.keys()) {
        checkDomain(domain, domainMap);
      }
    } catch (e) {
      console.error("Error loading accounts:", e);
    } finally {
      setLoadingAccounts(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const checkDomain = async (domain: string, currentMap?: Map<string, { accounts: string[]; check: DomainCheck | null; loading: boolean }>) => {
    const map = currentMap || domains;
    const entry = map.get(domain);
    if (!entry) return;

    setDomains((prev) => {
      const next = new Map(prev);
      const e = next.get(domain);
      if (e) next.set(domain, { ...e, loading: true });
      return next;
    });

    try {
      const res = await fetch("/api/sequences/domain-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      const json = await res.json();
      setDomains((prev) => {
        const next = new Map(prev);
        const e = next.get(domain);
        if (e) next.set(domain, { ...e, check: json.data || json, loading: false });
        return next;
      });
    } catch {
      setDomains((prev) => {
        const next = new Map(prev);
        const e = next.get(domain);
        if (e) next.set(domain, { ...e, loading: false });
        return next;
      });
    }
  };

  if (loadingAccounts) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const domainEntries = Array.from(domains.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
            <Globe className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Domaines</h1>
            <p className="text-sm text-gray-500">{domainEntries.length} domaine{domainEntries.length > 1 ? "s" : ""} • Vérification DNS automatique</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {domainEntries.map(([domain, entry]) => {
          const check = entry.check;
          const scoreColor = !check ? "text-gray-400" : check.score >= 90 ? "text-green-600" : check.score >= 70 ? "text-yellow-600" : "text-red-600";
          const scoreBg = !check ? "bg-gray-100" : check.score >= 90 ? "bg-green-50" : check.score >= 70 ? "bg-yellow-50" : "bg-red-50";

          return (
            <div key={domain} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <ShieldCheck className={cn("w-5 h-5", check ? scoreColor : "text-gray-400")} />
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">{domain}</h3>
                    <p className="text-xs text-gray-500">{entry.accounts.length} compte{entry.accounts.length > 1 ? "s" : ""} : {entry.accounts.join(", ")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {check && (
                    <span className={cn("text-sm font-bold px-2 py-1 rounded-lg", scoreBg, scoreColor)}>
                      {check.score}/100
                    </span>
                  )}
                  <button
                    onClick={() => checkDomain(domain)}
                    disabled={entry.loading}
                    className="p-2 text-gray-400 hover:text-indigo-600 cursor-pointer"
                    title="Revérifier"
                  >
                    {entry.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* DNS checks */}
              {check && (
                <div className="px-5 py-4">
                  <div className="grid grid-cols-4 gap-3 mb-4">
                    {[
                      { label: "SPF", ok: check.spf.found && check.spf.valid, found: check.spf.found, issue: check.spf.issue },
                      { label: "DKIM", ok: check.dkim.found, found: check.dkim.found, issue: null },
                      { label: "DMARC", ok: check.dmarc.found, found: check.dmarc.found, issue: check.dmarc.issue },
                      { label: "MX", ok: check.mx.found, found: check.mx.found, issue: null },
                    ].map((item) => (
                      <div key={item.label} className={cn("rounded-lg border p-3 text-center",
                        item.ok ? "bg-green-50 border-green-200" : item.found ? "bg-yellow-50 border-yellow-200" : "bg-red-50 border-red-200"
                      )}>
                        <div className="flex items-center justify-center gap-1 mb-1">
                          {item.ok ? <Check className="w-4 h-4 text-green-600" /> : item.found ? <AlertTriangle className="w-4 h-4 text-yellow-600" /> : <X className="w-4 h-4 text-red-600" />}
                          <span className={cn("text-xs font-bold", item.ok ? "text-green-700" : item.found ? "text-yellow-700" : "text-red-700")}>
                            {item.ok ? "OK" : item.found ? "Partiel" : "Absent"}
                          </span>
                        </div>
                        <span className="text-xs font-medium text-gray-700">{item.label}</span>
                        {item.issue && <p className="text-[9px] text-yellow-600 mt-1">{item.issue}</p>}
                      </div>
                    ))}
                  </div>

                  {/* Recommendations */}
                  {check.recommendations.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <p className="text-xs font-semibold text-amber-800 mb-1">Actions requises :</p>
                      <ul className="space-y-1">
                        {check.recommendations.map((rec, i) => (
                          <li key={i} className="text-xs text-amber-700 flex items-start gap-1.5">
                            <span className="shrink-0 mt-0.5">•</span>
                            <span>{rec}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Records detail */}
                  <div className="mt-3 space-y-2 text-[10px] text-gray-500">
                    {check.spf.record && <p><span className="font-medium text-gray-700">SPF:</span> {check.spf.record}</p>}
                    {check.dkim.record && <p><span className="font-medium text-gray-700">DKIM ({check.dkim.selector}):</span> {check.dkim.record.slice(0, 80)}...</p>}
                    {check.dmarc.record && <p><span className="font-medium text-gray-700">DMARC:</span> {check.dmarc.record}</p>}
                    {check.mx.records.length > 0 && <p><span className="font-medium text-gray-700">MX:</span> {check.mx.records.join(", ")}</p>}
                  </div>
                </div>
              )}

              {entry.loading && !check && (
                <div className="px-5 py-4 flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" /> Vérification DNS en cours...
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
