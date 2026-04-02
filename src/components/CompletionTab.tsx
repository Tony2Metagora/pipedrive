"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Database, Loader2, RefreshCcw, Building2 } from "lucide-react";
import { RETAIL_NAF_CODES } from "@/lib/retail-naf";

type CompletionRow = {
  label: string;
  count: number;
  pct: number;
};

type RetailRow = {
  code: string;
  label: string;
  scrapedIdf: number;
  scrapedFrance: number;
};

type RetailMatrixRow = {
  region: string;
  byNaf: Record<string, number>;
};

type CompletionPayload = {
  meta: {
    listsCount: number;
    rawCompaniesCount: number;
    uniqueCompaniesCount: number;
  };
  byRegion?: CompletionRow[];
  byNaf?: CompletionRow[];
  retail?: {
    rows: RetailRow[];
    matrix: RetailMatrixRow[];
  };
};

function numberFr(n: number) {
  return new Intl.NumberFormat("fr-FR").format(n || 0);
}

export default function CompletionTab() {
  const [data, setData] = useState<CompletionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiFrance, setApiFrance] = useState<Record<string, number> | null>(null);
  const [apiIdf, setApiIdf] = useState<Record<string, number> | null>(null);
  const [apiMatrix, setApiMatrix] = useState<Record<string, Record<string, number>> | null>(null);
  const [loadingGouvSummary, setLoadingGouvSummary] = useState(false);
  const [loadingGouvMatrix, setLoadingGouvMatrix] = useState(false);
  const [gouvMsg, setGouvMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/scraping/completion?t=" + Date.now());
      const json = await res.json();
      if (!res.ok || json.error) {
        setError(json.error || "Erreur lors du chargement des stats");
        setData(null);
      } else {
        setData(json);
      }
    } catch {
      setError("Erreur réseau lors du chargement des stats");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const retailRows = data?.retail?.rows ?? [];
  const retailMatrix = data?.retail?.matrix ?? [];
  const nafCodes = useMemo(() => RETAIL_NAF_CODES.map((x) => x.code), []);

  const fetchGouvSummary = async () => {
    setLoadingGouvSummary(true);
    setGouvMsg(null);
    try {
      const res = await fetch("/api/scraping/gouv-count", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setGouvMsg(json.error || "Erreur API Gouv");
        return;
      }
      setApiFrance(json.france || {});
      setApiIdf(json.idf || {});
      setGouvMsg(json.note || "Totaux France + IDF chargés.");
    } catch {
      setGouvMsg("Erreur réseau vers l’API Gouv");
    } finally {
      setLoadingGouvSummary(false);
    }
  };

  const fetchGouvMatrix = async () => {
    if (!retailMatrix.length) return;
    setLoadingGouvMatrix(true);
    setGouvMsg(null);
    try {
      const regions = retailMatrix.map((r) => r.region);
      const res = await fetch("/api/scraping/gouv-count", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "matrix",
          regions,
          nafs: nafCodes,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setGouvMsg(json.error || "Erreur API matrice");
        return;
      }
      setApiMatrix(json.matrix || {});
      setGouvMsg(json.note || "Matrice API régions × NAF chargée (peut prendre du temps).");
    } catch {
      setGouvMsg("Erreur réseau (matrice API)");
    } finally {
      setLoadingGouvMatrix(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-indigo-600" />
            Completion — retail (NAF)
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Uniquement les codes NAF mode détail retail listés ci-dessous. Comptages issus des listes scrapping sauvegardées, comparables aux totaux API Recherche d&apos;entreprises (gouv.fr).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={fetchGouvSummary}
            disabled={loadingGouvSummary || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-700 border border-emerald-800 rounded-lg hover:bg-emerald-800 disabled:opacity-50 cursor-pointer"
          >
            {loadingGouvSummary ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Building2 className="w-3.5 h-3.5" />}
            API Gouv : France + IDF
          </button>
          <button
            type="button"
            onClick={fetchGouvMatrix}
            disabled={loadingGouvMatrix || loading || !retailMatrix.length}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-900 bg-emerald-100 border border-emerald-300 rounded-lg hover:bg-emerald-200 disabled:opacity-50 cursor-pointer"
          >
            {loadingGouvMatrix ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Building2 className="w-3.5 h-3.5" />}
            API Gouv : matrice régions × NAF
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 border border-gray-200 rounded-lg hover:bg-gray-200 disabled:opacity-50 cursor-pointer"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5" />}
            Actualiser scrapping
          </button>
        </div>
      </div>

      {gouvMsg && (
        <div className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          {gouvMsg}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 p-3">
              <p className="text-[11px] text-gray-500">Listes scrapping</p>
              <p className="text-lg font-semibold text-gray-900">{numberFr(data?.meta?.listsCount || 0)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-3">
              <p className="text-[11px] text-gray-500">Entreprises uniques (tous NAF)</p>
              <p className="text-lg font-semibold text-gray-900">{numberFr(data?.meta?.uniqueCompaniesCount || 0)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-3">
              <p className="text-[11px] text-gray-500">Lignes brutes</p>
              <p className="text-lg font-semibold text-gray-900">{numberFr(data?.meta?.rawCompaniesCount || 0)}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-700">Codes NAF retail (ciblage)</p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Pour chaque code : volume scrapé en Île-de-France et en France, puis totaux API (après clic sur le bouton vert).
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[720px]">
                <thead className="bg-gray-50 text-gray-600 text-[10px] uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left">Code NAF</th>
                    <th className="px-3 py-2 text-right">IDF (scrapé / API)</th>
                    <th className="px-3 py-2 text-right">France (scrapé / API)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {retailRows.map((row) => (
                    <tr key={row.code}>
                      <td className="px-3 py-2 text-gray-800">
                        <span className="font-mono font-medium text-indigo-800">{row.code}</span>
                        <span className="text-gray-600"> — {row.label}</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {numberFr(row.scrapedIdf)} / {apiIdf?.[row.code] != null ? numberFr(apiIdf[row.code]) : "?"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {numberFr(row.scrapedFrance)} / {apiFrance?.[row.code] != null ? numberFr(apiFrance[row.code]) : "?"}
                      </td>
                    </tr>
                  ))}
                  {retailRows.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-3 py-6 text-center text-gray-400">
                        Aucune entreprise avec ces codes NAF dans les listes scrapping.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-700">Détail par grande région × code NAF</p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Première valeur = entreprises scrapées dans votre base ; seconde = total API (somme par départements de la région) après chargement.
              </p>
            </div>
            <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
              <table className="w-full text-[10px] min-w-[900px]">
                <thead className="bg-gray-50 text-gray-600 uppercase sticky top-0 z-[1]">
                  <tr>
                    <th className="px-2 py-2 text-left sticky left-0 bg-gray-50 min-w-[140px]">Région</th>
                    {nafCodes.map((code) => (
                      <th key={code} className="px-1 py-2 text-center font-mono text-[9px]">
                        {code}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {retailMatrix.map((row) => (
                    <tr key={row.region}>
                      <td className="px-2 py-1.5 text-gray-800 font-medium sticky left-0 bg-white border-r border-gray-100 max-w-[160px] truncate" title={row.region}>
                        {row.region}
                      </td>
                      {nafCodes.map((code) => {
                        const scraped = row.byNaf[code] ?? 0;
                        const api = apiMatrix?.[row.region]?.[code];
                        return (
                          <td key={code} className="px-1 py-1.5 text-center tabular-nums text-gray-700 whitespace-nowrap">
                            {numberFr(scraped)} / {api != null ? numberFr(api) : "?"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {retailMatrix.length === 0 && (
                    <tr>
                      <td colSpan={1 + nafCodes.length} className="px-3 py-6 text-center text-gray-400">
                        Aucune donnée région × NAF.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <details className="bg-gray-50 rounded-lg border border-gray-200 p-3 text-[11px] text-gray-600">
            <summary className="cursor-pointer font-medium text-gray-700">Vue globale (tous NAF / toutes régions)</summary>
            <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-semibold text-gray-500 mb-1">Par région (tous secteurs)</p>
                <div className="max-h-48 overflow-auto border border-gray-200 rounded bg-white">
                  <table className="w-full text-[10px]">
                    <tbody>
                      {(data?.byRegion || []).slice(0, 40).map((r) => (
                        <tr key={r.label} className="border-b border-gray-50">
                          <td className="px-2 py-1">{r.label}</td>
                          <td className="px-2 py-1 text-right">{numberFr(r.count)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-gray-500 mb-1">Par NAF (tous secteurs)</p>
                <div className="max-h-48 overflow-auto border border-gray-200 rounded bg-white">
                  <table className="w-full text-[10px]">
                    <tbody>
                      {(data?.byNaf || []).slice(0, 40).map((r) => (
                        <tr key={r.label} className="border-b border-gray-50">
                          <td className="px-2 py-1">{r.label}</td>
                          <td className="px-2 py-1 text-right">{numberFr(r.count)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </details>

          <div className="text-[11px] text-gray-500 flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5" />
            Total brut scanné (tous NAF) : {numberFr(data?.meta?.rawCompaniesCount || 0)} (avant dédoublonnage SIREN/SIRET).
          </div>
        </>
      )}
    </div>
  );
}
