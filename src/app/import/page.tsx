"use client";

import { useState } from "react";
import { Upload, FileSpreadsheet, Check, AlertCircle, Loader2 } from "lucide-react";
import { PIPELINES } from "@/lib/config";

interface PreviewRow {
  nom?: string;
  prenom?: string;
  entreprise?: string;
  email?: string;
  telephone?: string;
  poste?: string;
  notes?: string;
}

interface ImportResult {
  success: boolean;
  name: string;
  dealId?: number;
  error?: string;
}

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [pipelineId, setPipelineId] = useState<number>(PIPELINES[0].id);
  const [stageId, setStageId] = useState<number>(PIPELINES[0].stages[0].id);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ImportResult[] | null>(null);

  const selectedPipeline = PIPELINES.find((p) => p.id === pipelineId);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setResults(null);
    setPreview(null);

    // Prévisualisation
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", f);
      formData.append("preview", "true");
      formData.append("pipeline_id", String(pipelineId));
      formData.append("stage_id", String(stageId));

      const res = await fetch("/api/import", { method: "POST", body: formData });
      const json = await res.json();
      setPreview(json.data?.rows || []);
    } catch (err) {
      console.error("Erreur preview:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    setResults(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("pipeline_id", String(pipelineId));
      formData.append("stage_id", String(stageId));

      const res = await fetch("/api/import", { method: "POST", body: formData });
      const json = await res.json();
      setResults(json.data?.results || []);
    } catch (err) {
      console.error("Erreur import:", err);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Import de contacts</h1>

      {/* Config pipeline/stage */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">
          Pipeline & étape cible
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Pipeline</label>
            <select
              value={pipelineId}
              onChange={(e) => {
                const pid = Number(e.target.value);
                setPipelineId(pid);
                const p = PIPELINES.find((p) => p.id === pid);
                if (p) setStageId(p.stages[0].id);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              {PIPELINES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Étape</label>
            <select
              value={stageId}
              onChange={(e) => setStageId(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              {selectedPipeline?.stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Zone d'upload */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors">
          <div className="flex flex-col items-center gap-2 text-gray-500">
            {file ? (
              <>
                <FileSpreadsheet className="w-8 h-8 text-indigo-500" />
                <span className="text-sm font-medium text-gray-700">
                  {file.name}
                </span>
                <span className="text-xs text-gray-400">
                  Cliquer pour changer de fichier
                </span>
              </>
            ) : (
              <>
                <Upload className="w-8 h-8" />
                <span className="text-sm font-medium">
                  Glisser un fichier Excel/CSV ou cliquer ici
                </span>
                <span className="text-xs text-gray-400">
                  .xlsx, .xls, .csv
                </span>
              </>
            )}
          </div>
          <input
            type="file"
            className="hidden"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileChange}
          />
        </label>
      </div>

      {/* Chargement */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
          <span className="ml-2 text-sm text-gray-500">
            Lecture du fichier...
          </span>
        </div>
      )}

      {/* Prévisualisation */}
      {preview && preview.length > 0 && !results && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">
              Prévisualisation – {preview.length} contact
              {preview.length > 1 ? "s" : ""} détecté
              {preview.length > 1 ? "s" : ""}
            </h2>
            <button
              onClick={handleImport}
              disabled={importing}
              className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
            >
              {importing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              {importing ? "Import en cours..." : "Valider l'import"}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Prénom</th>
                  <th className="px-4 py-3 text-left">Nom</th>
                  <th className="px-4 py-3 text-left">Entreprise</th>
                  <th className="px-4 py-3 text-left">Email</th>
                  <th className="px-4 py-3 text-left">Téléphone</th>
                  <th className="px-4 py-3 text-left">Poste</th>
                  <th className="px-4 py-3 text-left">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {preview.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3">{row.prenom || "—"}</td>
                    <td className="px-4 py-3">{row.nom || "—"}</td>
                    <td className="px-4 py-3 font-medium">
                      {row.entreprise || "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {row.email || "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {row.telephone || "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {row.poste || "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-400 max-w-[200px] truncate">
                      {row.notes || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Résultats d'import */}
      {results && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">
              Résultat de l&apos;import
            </h2>
            <div className="flex gap-4 mt-2 text-sm">
              <span className="text-green-600">
                ✓ {results.filter((r) => r.success).length} réussi
                {results.filter((r) => r.success).length > 1 ? "s" : ""}
              </span>
              {results.filter((r) => !r.success).length > 0 && (
                <span className="text-red-600">
                  ✗ {results.filter((r) => !r.success).length} erreur
                  {results.filter((r) => !r.success).length > 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>

          <div className="divide-y divide-gray-100">
            {results.map((r, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-4 py-3 text-sm"
              >
                {r.success ? (
                  <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                )}
                <span className="font-medium">{r.name}</span>
                {r.success && r.dealId && (
                  <a
                    href={`/deal/${r.dealId}`}
                    className="text-indigo-600 hover:underline text-xs"
                  >
                    Voir la fiche
                  </a>
                )}
                {r.error && (
                  <span className="text-red-500 text-xs">{r.error}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
