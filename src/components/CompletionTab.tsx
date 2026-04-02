"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Database, Loader2, RefreshCcw, Building2 } from "lucide-react";
import { GRANDES_REGIONS_ORDER, RETAIL_NAF_CODES } from "@/lib/retail-naf";

type CompletionRow = {
  label: string;
  count: number;
  pct: number;
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
  const [apiMatrix, setApiMatrix] = useState<Record<string, Record<string, number>> | null>(null);
  const [loadingGouv, setLoadingGouv] = useState(false);
  const [gouvMsg, setGouvMsg] = useState<string | null>(null);
  const [matrixNaf, setMatrixNaf] = useState<string>(RETAIL_NAF_CODES[0].code);
  const [matrixRegion, setMatrixRegion] = useState<string>(
    GRANDES_REGIONS_ORDER[0] ?? "Ile-de-France"
  );

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

  const retailMatrix = data?.retail?.matrix ?? [];
  const nafCodes = useMemo(() => RETAIL_NAF_CODES.map((x) => x.code), []);

  const fetchGouvCell = async () => {
    setLoadingGouv(true);
    setGouvMsg(null);
    try {
      const res = await fetch("/api/scraping/gouv-count", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "matrix",
          region: matrixRegion,
          naf: matrixNaf,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setGouvMsg(json.error || "Erreur API Gouv");
        return;
      }
      const patch = (json.matrix || {}) as Record<string, Record<string, number>>;
      setApiMatrix((prev) => {
        const next = { ...prev };
        for (const [r, byNaf] of Object.entries(patch)) {
          next[r] = { ...(next[r] || {}), ...byNaf };
        }
        return next;
      });
      setGouvMsg(
        json.note ||
          `Cellule chargée : ${matrixRegion} × ${matrixNaf}. Répétez pour d’autres couples (les totaux API se cumulent dans le tableau).`
      );
    } catch {
      setGouvMsg("Erreur réseau (API Gouv)");
    } finally {
      setLoadingGouv(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-indigo-600" />
          Completion — retail (NAF)
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Matrice exhaustive : une ligne par grande région, une colonne par code NAF retail. Côté scrapé, la valeur
          n’apparaît que lorsqu’au moins une entreprise est présente dans vos listes pour cette cellule.
        </p>
      </div>

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

          <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-[11px] text-gray-600 min-w-[100px]">
              <span className="font-medium text-gray-700">Code NAF</span>
              <select
                value={matrixNaf}
                onChange={(e) => setMatrixNaf(e.target.value)}
                className="border border-gray-300 rounded-md px-2 py-1.5 text-xs font-mono bg-white w-full max-w-[140px]"
              >
                {RETAIL_NAF_CODES.map((x) => (
                  <option key={x.code} value={x.code}>
                    {x.code}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-gray-600 min-w-[160px]">
              <span className="font-medium text-gray-700">Région</span>
              <select
                value={matrixRegion}
                onChange={(e) => setMatrixRegion(e.target.value)}
                className="border border-gray-300 rounded-md px-2 py-1.5 text-xs bg-white w-full max-w-[220px]"
              >
                {GRANDES_REGIONS_ORDER.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={fetchGouvCell}
              disabled={loadingGouv || loading}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 border border-emerald-800 rounded-lg hover:bg-emerald-800 disabled:opacity-50 cursor-pointer shadow-sm"
            >
              {loadingGouv ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Building2 className="w-3.5 h-3.5" />}
              API Gouv
            </button>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-700 bg-gray-100 border border-gray-200 rounded-lg hover:bg-gray-200 disabled:opacity-50 cursor-pointer"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5" />}
              Actualiser scrapping
            </button>
            <p className="text-[10px] text-gray-500 w-full basis-full sm:basis-auto sm:max-w-xl">
              Le bouton API Gouv remplit le total officiel pour le couple NAF + région choisis (somme par départements).
              Le tableau ci-dessous liste toutes les régions ; répétez l’opération pour d’autres cellules.
            </p>
          </div>

          {gouvMsg && (
            <div className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              {gouvMsg}
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-700">Régions × codes NAF (scrapé / API Gouv)</p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Scrapé : vide si aucune entreprise en base pour cette cellule. API : « ? » tant que vous n’avez pas
                chargé cette cellule avec le sélecteur + API Gouv.
              </p>
            </div>
            <div className="overflow-x-auto max-h-[min(70vh,640px)] overflow-y-auto">
              <table className="w-full text-[10px] min-w-[900px]">
                <thead className="bg-gray-50 text-gray-600 uppercase sticky top-0 z-[1]">
                  <tr>
                    <th className="px-2 py-2 text-left sticky left-0 bg-gray-50 z-[2] min-w-[140px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                      Région
                    </th>
                    {nafCodes.map((code) => {
                      const meta = RETAIL_NAF_CODES.find((x) => x.code === code);
                      return (
                        <th key={code} className="px-1 py-2 text-center font-mono text-[9px] align-bottom">
                          <div>{code}</div>
                          {meta && (
                            <div className="font-sans font-normal normal-case text-[8px] text-gray-500 leading-tight max-w-[100px] mx-auto">
                              {meta.label}
                            </div>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {retailMatrix.map((row) => (
                    <tr key={row.region}>
                      <td className="px-2 py-1.5 text-gray-800 font-medium sticky left-0 bg-white z-[1] border-r border-gray-100 max-w-[180px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]">
                        <span className="truncate block" title={row.region}>
                          {row.region}
                        </span>
                      </td>
                      {nafCodes.map((code) => {
                        const scraped = row.byNaf[code] ?? 0;
                        const api = apiMatrix?.[row.region]?.[code];
                        const scrapedStr = scraped > 0 ? numberFr(scraped) : "";
                        const apiStr = api != null ? numberFr(api) : "?";
                        return (
                          <td key={code} className="px-1 py-1.5 text-center tabular-nums text-gray-700 whitespace-nowrap align-middle">
                            <span className={scrapedStr ? "text-gray-900" : "text-gray-300"}>{scrapedStr || "\u00A0"}</span>
                            <span className="text-gray-400 mx-0.5">/</span>
                            <span className={api != null ? "text-emerald-900" : "text-gray-400"}>{apiStr}</span>
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
