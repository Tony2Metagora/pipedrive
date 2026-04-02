"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Database, Loader2, RefreshCcw } from "lucide-react";

type CompletionRow = {
  label: string;
  count: number;
  pct: number;
};

type CompletionPayload = {
  meta: {
    listsCount: number;
    rawCompaniesCount: number;
    uniqueCompaniesCount: number;
  };
  byRegion: CompletionRow[];
  byNaf: CompletionRow[];
};

function numberFr(n: number) {
  return new Intl.NumberFormat("fr-FR").format(n || 0);
}

export default function CompletionTab() {
  const [data, setData] = useState<CompletionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const topRegion = useMemo(() => data?.byRegion?.[0] || null, [data]);
  const topNaf = useMemo(() => data?.byNaf?.[0] || null, [data]);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-indigo-600" />
            Completion
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Volume d&apos;entreprises scrapées par région et par code NAF (sur les listes API Gouv sauvegardées).
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 border border-gray-200 rounded-lg hover:bg-gray-200 disabled:opacity-50 cursor-pointer"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5" />}
          Actualiser
        </button>
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 p-3">
              <p className="text-[11px] text-gray-500">Listes scrapping</p>
              <p className="text-lg font-semibold text-gray-900">{numberFr(data?.meta?.listsCount || 0)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-3">
              <p className="text-[11px] text-gray-500">Entreprises uniques</p>
              <p className="text-lg font-semibold text-gray-900">{numberFr(data?.meta?.uniqueCompaniesCount || 0)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-3">
              <p className="text-[11px] text-gray-500">Région #1</p>
              <p className="text-sm font-semibold text-gray-900 truncate">{topRegion?.label || "—"}</p>
              <p className="text-[11px] text-gray-500">{topRegion ? `${numberFr(topRegion.count)} (${topRegion.pct}%)` : "—"}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-3">
              <p className="text-[11px] text-gray-500">Code NAF #1</p>
              <p className="text-sm font-semibold text-gray-900 truncate">{topNaf?.label || "—"}</p>
              <p className="text-[11px] text-gray-500">{topNaf ? `${numberFr(topNaf.count)} (${topNaf.pct}%)` : "—"}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-700">Par région</p>
              </div>
              <div className="max-h-[520px] overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left">Région</th>
                      <th className="px-3 py-2 text-right">Entreprises</th>
                      <th className="px-3 py-2 text-right">% du total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(data?.byRegion || []).map((row) => (
                      <tr key={row.label}>
                        <td className="px-3 py-2 text-gray-700">{row.label}</td>
                        <td className="px-3 py-2 text-right font-medium text-gray-900">{numberFr(row.count)}</td>
                        <td className="px-3 py-2 text-right text-gray-500">{row.pct}%</td>
                      </tr>
                    ))}
                    {(data?.byRegion?.length || 0) === 0 && (
                      <tr>
                        <td colSpan={3} className="px-3 py-6 text-center text-gray-400">
                          Aucune donnée
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-700">Par code NAF</p>
              </div>
              <div className="max-h-[520px] overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left">Code NAF</th>
                      <th className="px-3 py-2 text-right">Entreprises</th>
                      <th className="px-3 py-2 text-right">% du total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(data?.byNaf || []).map((row) => (
                      <tr key={row.label}>
                        <td className="px-3 py-2 text-gray-700">
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">
                            {row.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-gray-900">{numberFr(row.count)}</td>
                        <td className="px-3 py-2 text-right text-gray-500">{row.pct}%</td>
                      </tr>
                    ))}
                    {(data?.byNaf?.length || 0) === 0 && (
                      <tr>
                        <td colSpan={3} className="px-3 py-6 text-center text-gray-400">
                          Aucune donnée
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-gray-500 flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5" />
            Total brut scanné: {numberFr(data?.meta?.rawCompaniesCount || 0)} (avant dédoublonnage SIREN/SIRET).
          </div>
        </>
      )}
    </div>
  );
}
