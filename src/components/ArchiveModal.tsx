"use client";

import { useState } from "react";
import { X, Archive, Loader2 } from "lucide-react";

const MOTIFS_PREDÉFINIS = [
  "Niveau prospect",
  "Pas de potentiel business",
  "Concurrent choisi / déjà équipé",
  "Contact plus en poste",
  "Recontacter plus tard",
  "Pas de budget",
];

interface Props {
  activityId?: number | null;
  dealId: number | null;
  contactName: string;
  onClose: () => void;
  onArchived: () => void;
}

export default function ArchiveModal({
  activityId,
  dealId,
  contactName,
  onClose,
  onArchived,
}: Props) {
  const [reason, setReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [saving, setSaving] = useState(false);

  const finalReason = reason === "__custom" ? customReason : reason;

  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!finalReason.trim()) return;

    setSaving(true);
    setError(null);
    try {
      let res: Response;
      if (activityId) {
        res = await fetch(`/api/activities/${activityId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            archive: true,
            deal_id: dealId,
            lost_reason: finalReason.trim(),
          }),
        });
      } else if (dealId) {
        res = await fetch(`/api/deals/${dealId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "lost",
            lost_reason: finalReason.trim(),
          }),
        });
      } else {
        return;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("Archivage failed:", res.status, text);
        setError(`Erreur serveur (${res.status}). Réessayez.`);
        setSaving(false);
        return;
      }
      onArchived();
    } catch (err) {
      console.error("Erreur archivage:", err);
      setError("Erreur réseau. Vérifiez votre connexion et réessayez.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-orange-100 bg-orange-50 rounded-t-2xl">
          <div className="flex items-center gap-2">
            <Archive className="w-5 h-5 text-orange-600" />
            <h2 className="text-lg font-semibold text-orange-900">Archiver</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-white/60 hover:text-gray-600 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <p className="text-sm text-gray-600">
            Archiver <span className="font-semibold text-gray-900">{contactName}</span> ?
            <br />
            <span className="text-xs text-gray-400">
              L'affaire sera marquée comme perdue avec le motif choisi.
            </span>
          </p>

          {/* Motifs prédéfinis */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">
              Motif
            </label>
            {MOTIFS_PREDÉFINIS.map((motif) => (
              <label
                key={motif}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors text-sm ${
                  reason === motif
                    ? "bg-orange-50 border-orange-300 text-orange-800"
                    : "border-gray-200 hover:bg-gray-50 text-gray-700"
                }`}
              >
                <input
                  type="radio"
                  name="reason"
                  value={motif}
                  checked={reason === motif}
                  onChange={() => setReason(motif)}
                  className="accent-orange-600"
                />
                {motif}
              </label>
            ))}

            {/* Option custom */}
            <label
              className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors text-sm ${
                reason === "__custom"
                  ? "bg-orange-50 border-orange-300 text-orange-800"
                  : "border-gray-200 hover:bg-gray-50 text-gray-700"
              }`}
            >
              <input
                type="radio"
                name="reason"
                value="__custom"
                checked={reason === "__custom"}
                onChange={() => setReason("__custom")}
                className="accent-orange-600"
              />
              Autre motif...
            </label>

            {reason === "__custom" && (
              <input
                type="text"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Ex : plus de produit à vendre, restructuration interne..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400 outline-none mt-1"
                autoFocus
              />
            )}
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {error}
            </div>
          )}

          {/* Actions */}
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
              disabled={saving || !finalReason.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-50 cursor-pointer"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Archive className="w-4 h-4" />
              )}
              {saving ? "Archivage..." : "Archiver"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
