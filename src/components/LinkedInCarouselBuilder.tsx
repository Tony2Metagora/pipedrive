"use client";

import { useMemo, useState } from "react";
import { Layers, Loader2, Sparkles, Link as LinkIcon, FileDown } from "lucide-react";

type CarouselDraft = {
  title: string;
  slides: string[];
  cta: string;
};

function extractDesignId(url: string): string {
  const m = url.match(/\/design\/([^/]+)/i);
  return m?.[1] || "";
}

export default function LinkedInCarouselBuilder() {
  const [templateUrl, setTemplateUrl] = useState(
    "https://www.canva.com/design/DAHFiIPndss/LFhQTAZio6-xmpYni-d59w/edit"
  );
  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState(1);
  const [exportFormat, setExportFormat] = useState<"pdf" | "png">("pdf");
  const [drafts, setDrafts] = useState<CarouselDraft[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [building, setBuilding] = useState(false);
  const [results, setResults] = useState<
    Array<{
      index: number;
      title: string;
      ok: boolean;
      autofillId?: string | null;
      editUrl?: string | null;
      exportUrl?: string | null;
      error?: string;
    }>
  >([]);
  const [error, setError] = useState<string | null>(null);

  const designId = useMemo(() => extractDesignId(templateUrl), [templateUrl]);

  const generateDrafts = async () => {
    if (!prompt.trim()) return;
    setLoadingDrafts(true);
    setError(null);
    setResults([]);
    try {
      const res = await fetch("/api/linkedin/carousel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate-drafts", prompt, count }),
      });
      const json = await res.json();
      if (json.error) throw new Error(String(json.error));
      setDrafts(Array.isArray(json.data?.drafts) ? json.data.drafts : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingDrafts(false);
    }
  };

  const buildCanva = async () => {
    if (!designId || drafts.length === 0) return;
    setBuilding(true);
    setError(null);
    try {
      const res = await fetch("/api/linkedin/carousel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "build-canva",
          templateDesignId: designId,
          drafts,
          exportFormat,
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(String(json.error));
      setResults(Array.isArray(json.data?.results) ? json.data.results : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBuilding(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
          <Layers className="w-4 h-4 text-blue-600" />
          Carrousel Canva
        </h2>
        <p className="text-xs text-gray-500 mb-3">
          Génère des drafts IA puis crée automatiquement les designs via Canva API.
        </p>

        <label className="block text-xs font-medium text-gray-600 mb-1">Template Canva URL</label>
        <input
          value={templateUrl}
          onChange={(e) => setTemplateUrl(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg mb-2"
          placeholder="https://www.canva.com/design/.../edit"
        />
        <p className="text-[11px] text-gray-500 mb-3">Design ID détecté: {designId || "—"}</p>

        <label className="block text-xs font-medium text-gray-600 mb-1">Brief du carrousel</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg mb-3"
          placeholder="Ex: 7 erreurs à éviter quand on lance un agent IA en retail..."
        />

        <div className="grid grid-cols-2 gap-2 mb-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nombre de carrousels</label>
            <select
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Export</label>
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as "pdf" | "png")}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
            >
              <option value="pdf">PDF</option>
              <option value="png">PNG</option>
            </select>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={generateDrafts}
            disabled={loadingDrafts || !prompt.trim()}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg disabled:opacity-50 cursor-pointer"
          >
            {loadingDrafts ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Générer drafts IA
          </button>
          <button
            onClick={buildCanva}
            disabled={building || !designId || drafts.length === 0}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg disabled:opacity-50 cursor-pointer"
          >
            {building ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            Créer dans Canva
          </button>
        </div>

        {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
      </div>

      {drafts.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">Drafts générés</h3>
          {drafts.map((d, idx) => (
            <div key={`${d.title}-${idx}`} className="border border-gray-200 rounded-lg p-3">
              <p className="text-sm font-medium text-gray-900 mb-1">
                {idx + 1}. {d.title}
              </p>
              <ul className="text-xs text-gray-600 space-y-1">
                {d.slides.map((s, i) => (
                  <li key={i}>Slide {i + 1}: {s}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {results.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
          <h3 className="text-sm font-semibold text-gray-900">Résultats Canva</h3>
          {results.map((r) => (
            <div key={`${r.index}-${r.title}`} className="text-xs border border-gray-200 rounded-lg p-2">
              <p className={r.ok ? "text-green-700 font-medium" : "text-red-700 font-medium"}>
                {r.ok ? "OK" : "Erreur"} — {r.title}
              </p>
              <div className="flex flex-wrap gap-3 mt-1">
                {r.editUrl && (
                  <a className="text-blue-600 underline inline-flex items-center gap-1" href={r.editUrl} target="_blank" rel="noreferrer">
                    <LinkIcon className="w-3 h-3" /> Canva edit
                  </a>
                )}
                {r.exportUrl && (
                  <a className="text-violet-600 underline inline-flex items-center gap-1" href={r.exportUrl} target="_blank" rel="noreferrer">
                    <FileDown className="w-3 h-3" /> Download {exportFormat.toUpperCase()}
                  </a>
                )}
              </div>
              {!r.ok && r.error && <p className="text-red-600 mt-1">{r.error}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

