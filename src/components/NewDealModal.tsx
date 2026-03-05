"use client";

import { useState } from "react";
import { X, Loader2, Briefcase } from "lucide-react";
import { PIPELINES } from "@/lib/config";

interface NewDealModalProps {
  onClose: () => void;
  onCreated: (deal: { id: number; title: string; person_id: number | null; org_id: number | null; pipeline_id: number; stage_id: number; value: number; currency: string; status: string; person_name?: string; org_name?: string }) => void;
}

export default function NewDealModal({ onClose, onCreated }: NewDealModalProps) {
  const [email, setEmail] = useState("");
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [entreprise, setEntreprise] = useState("");
  const [poste, setPoste] = useState("");
  const [telephone, setTelephone] = useState("");
  const [dealTitle, setDealTitle] = useState("");
  const [value, setValue] = useState("");
  const [pipelineId, setPipelineId] = useState<number>(PIPELINES[0].id);
  const [stageId, setStageId] = useState<number>(PIPELINES[0].stages[0].id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPipeline = PIPELINES.find((p) => p.id === pipelineId);
  const stages = selectedPipeline?.stages ?? [];

  const isValid = email.trim() && nom.trim() && prenom.trim() && entreprise.trim() && poste.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/deals/create-with-contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          nom: nom.trim(),
          prenom: prenom.trim(),
          entreprise: entreprise.trim(),
          poste: poste.trim(),
          telephone: telephone.trim(),
          dealTitle: dealTitle.trim() || undefined,
          value: value ? Number(value) : 0,
          pipeline_id: pipelineId,
          stage_id: stageId,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Erreur lors de la création");
        return;
      }
      onCreated(json.data.deal);
      onClose();
    } catch {
      setError("Erreur réseau");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-gray-900">Nouvelle affaire</h2>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">{error}</div>
          )}

          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Contact *</h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Prénom *</label>
              <input
                type="text"
                value={prenom}
                onChange={(e) => setPrenom(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Nom *</label>
              <input
                type="text"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Email *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Entreprise *</label>
              <input
                type="text"
                value={entreprise}
                onChange={(e) => setEntreprise(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Poste *</label>
              <input
                type="text"
                value={poste}
                onChange={(e) => setPoste(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Téléphone</label>
            <input
              type="tel"
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none"
            />
          </div>

          <hr className="border-gray-100" />

          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Affaire</h3>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Nom de l&apos;affaire</label>
            <input
              type="text"
              value={dealTitle}
              onChange={(e) => setDealTitle(e.target.value)}
              placeholder={entreprise ? `${entreprise} - ${prenom} ${nom}` : "Auto-généré"}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Pipeline</label>
              <select
                value={pipelineId}
                onChange={(e) => {
                  const pid = Number(e.target.value);
                  setPipelineId(pid);
                  const pipeline = PIPELINES.find((p) => p.id === pid);
                  if (pipeline) setStageId(pipeline.stages[0].id);
                }}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none bg-white"
              >
                {PIPELINES.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Étape</label>
              <select
                value={stageId}
                onChange={(e) => setStageId(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none bg-white"
              >
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Valeur (€)</label>
            <input
              type="number"
              min={0}
              step={100}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={!isValid || saving}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 cursor-pointer shadow-sm"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Créer l&apos;affaire
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
