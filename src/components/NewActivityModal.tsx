"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { ACTIVITY_TYPES, PIPELINES } from "@/lib/config";

interface Props {
  onClose: () => void;
  onCreated: () => void;
  defaultDealId?: number;
  defaultPersonId?: number;
  defaultOrgId?: number;
}

export default function NewActivityModal({
  onClose,
  onCreated,
  defaultDealId,
  defaultPersonId,
  defaultOrgId,
}: Props) {
  const [subject, setSubject] = useState("");
  const [type, setType] = useState("task");
  const [dueDate, setDueDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [dueTime, setDueTime] = useState("");
  const [dealSearch, setDealSearch] = useState("");
  const [dealId, setDealId] = useState<number | undefined>(defaultDealId);
  const [dealResults, setDealResults] = useState<
    { id: number; title: string }[]
  >([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // Pipeline/stage update optionnel
  const [updateStage, setUpdateStage] = useState(false);
  const [pipelineId, setPipelineId] = useState<number>(PIPELINES[0].id);
  const [stageId, setStageId] = useState<number>(PIPELINES[0].stages[0].id);

  const selectedPipeline = PIPELINES.find((p) => p.id === pipelineId);

  const searchDeals = async (term: string) => {
    setDealSearch(term);
    if (term.length < 2) {
      setDealResults([]);
      return;
    }
    try {
      const res = await fetch(`/api/deals?search=${encodeURIComponent(term)}`);
      const json = await res.json();
      setDealResults(
        (json.data || []).map((d: { id: number; title: string }) => ({
          id: d.id,
          title: d.title,
        }))
      );
    } catch {
      setDealResults([]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) return;

    setSaving(true);
    try {
      // Créer l'activité
      await fetch("/api/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim(),
          type,
          due_date: dueDate,
          due_time: dueTime || undefined,
          deal_id: dealId,
          person_id: defaultPersonId,
          org_id: defaultOrgId,
          note: note || undefined,
        }),
      });

      // Mettre à jour le stage du deal si demandé
      if (updateStage && dealId) {
        await fetch(`/api/deals/${dealId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pipeline_id: pipelineId,
            stage_id: stageId,
          }),
        });
      }

      onCreated();
    } catch (err) {
      console.error("Erreur création activité:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            Nouvelle activité
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Titre */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Titre *
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Ex : Email – Relance démo J+3"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              required
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Type
            </label>
            <div className="flex gap-2 flex-wrap">
              {ACTIVITY_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-colors cursor-pointer ${
                    type === t.value
                      ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date & Heure */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date *
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Heure
              </label>
              <input
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>
          </div>

          {/* Deal associé */}
          {!defaultDealId && (
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Affaire associée
              </label>
              <input
                type="text"
                value={dealSearch}
                onChange={(e) => searchDeals(e.target.value)}
                placeholder="Rechercher une affaire..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
              {dealId && (
                <span className="text-xs text-indigo-600 mt-1 block">
                  Deal #{dealId} sélectionné
                </span>
              )}
              {dealResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                  {dealResults.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => {
                        setDealId(d.id);
                        setDealSearch(d.title);
                        setDealResults([]);
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer"
                    >
                      {d.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
              placeholder="Notes optionnelles..."
            />
          </div>

          {/* Mise à jour pipeline/stage */}
          {dealId && (
            <div>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={updateStage}
                  onChange={(e) => setUpdateStage(e.target.checked)}
                  className="rounded"
                />
                Modifier le pipeline/stage du deal
              </label>
              {updateStage && (
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <select
                    value={pipelineId}
                    onChange={(e) => {
                      const pid = Number(e.target.value);
                      setPipelineId(pid);
                      const p = PIPELINES.find((p) => p.id === pid);
                      if (p) setStageId(p.stages[0].id);
                    }}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    {PIPELINES.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={stageId}
                    onChange={(e) => setStageId(Number(e.target.value))}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    {selectedPipeline?.stages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Submit */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving || !subject.trim()}
              className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
            >
              {saving ? "Création..." : "Créer l'activité"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
