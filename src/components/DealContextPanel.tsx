"use client";

import { useEffect, useState, useMemo } from "react";
import {
  StickyNote,
  Clock,
  CheckCheck,
  Sparkles,
  Loader2,
  Check,
  Phone,
  Mail,
  MessageSquare,
  Calendar,
  CheckCircle,
  Trash2,
  Pencil,
  X,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

interface Activity {
  id: number;
  subject: string;
  due_date: string;
  type: string;
  done: boolean;
}

interface Note {
  id: number;
  content: string;
}

interface DealContext {
  activities: { pending: Activity[]; done: Activity[] };
  notes: Note[];
}

const SECTION_CONFIG: Record<string, { icon: string; bg: string; border: string; title: string; text: string }> = {
  "DERNIER EMAIL": { icon: "�", bg: "bg-amber-50", border: "border-amber-200", title: "text-amber-800", text: "text-amber-900" },
  "EMAIL PRÉCÉDENT": { icon: "📨", bg: "bg-emerald-50", border: "border-emerald-200", title: "text-emerald-800", text: "text-emerald-900" },
  "NEXT STEPS & ACTIONS": { icon: "⚡", bg: "bg-sky-50", border: "border-sky-200", title: "text-sky-800", text: "text-sky-900" },
};

function SummaryCard({ text }: { text: string }) {
  const sections = useMemo(() => {
    const keys = Object.keys(SECTION_CONFIG);
    const parts: { title: string; content: string }[] = [];
    let remaining = text;
    keys.forEach((key, i) => {
      const idx = remaining.indexOf(key);
      if (idx === -1) return;
      const after = remaining.slice(idx + key.length).trim();
      const nextKey = keys[i + 1];
      const nextIdx = nextKey ? after.indexOf(nextKey) : -1;
      const content = nextIdx > -1 ? after.slice(0, nextIdx).trim() : after.trim();
      parts.push({ title: key, content });
      if (nextIdx > -1) remaining = after.slice(nextIdx);
    });
    return parts.length > 0 ? parts : null;
  }, [text]);

  if (!sections) {
    return <p className="text-xs leading-relaxed text-purple-900">{text}</p>;
  }

  return (
    <div className="space-y-2">
      {sections.map((s) => {
        const cfg = SECTION_CONFIG[s.title];
        if (!cfg) return null;
        return (
          <div key={s.title} className={`rounded-lg ${cfg.bg} border ${cfg.border} px-3 py-2`}>
            <p className={`text-[10px] font-bold uppercase tracking-wide ${cfg.title} mb-1`}>
              {cfg.icon} {s.title}
            </p>
            <p className={`text-xs leading-relaxed ${cfg.text}`}>{s.content}</p>
          </div>
        );
      })}
    </div>
  );
}

const TYPE_ICONS: Record<string, typeof Phone> = {
  call: Phone,
  email: Mail,
  sms: MessageSquare,
  meeting: Calendar,
  task: CheckCircle,
};

interface Props {
  dealId: number;
  personId?: number;
  orgId?: number | null;
  personName?: string;
  orgName?: string;
  deals?: { id: number; title: string; pipeline_id: number; stage_id: number; value: number; status: string; currency: string }[];
  onActivityChanged?: () => void;
}

export default function DealContextPanel({ dealId, personId, orgId, personName, orgName, deals, onActivityChanged }: Props) {
  const [ctx, setCtx] = useState<DealContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editType, setEditType] = useState("");
  const [editDate, setEditDate] = useState("");
  const [savingTask, setSavingTask] = useState(false);
  const [personEmail, setPersonEmail] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/deals/${dealId}/context`)
      .then((r) => r.json())
      .then((json) => {
        if (json.data) setCtx(json.data);
      })
      .catch((err) => console.error("Erreur chargement contexte deal:", err))
      .finally(() => setLoading(false));
  }, [dealId]);

  // Fetch person email for Gmail integration
  useEffect(() => {
    if (!personId) return;
    fetch(`/api/persons/${personId}`)
      .then((r) => r.json())
      .then((json) => {
        const email = json.data?.email?.[0]?.value;
        if (email) setPersonEmail(email);
      })
      .catch(() => {});
  }, [personId]);

  const generateSummary = async () => {
    if (!personEmail) {
      setSummary("Aucune adresse email disponible pour ce contact.");
      return;
    }
    setLoadingSummary(true);
    setSummary(null);
    setNoteSaved(false);

    try {
      const res = await fetch("/api/summary/unified", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactEmail: personEmail,
          contactName: personName || "inconnu",
        }),
      });
      const json = await res.json();
      if (json.data?.summary) {
        setSummary(json.data.summary);
      } else {
        setSummary("Erreur : " + (json.error || "Impossible de générer le résumé"));
      }
    } catch {
      setSummary("Erreur de connexion à l'IA");
    } finally {
      setLoadingSummary(false);
    }
  };

  const saveAsNote = async () => {
    if (!summary) return;
    setSavingNote(true);
    try {
      const today = new Date().toLocaleDateString("fr-FR");
      const noteContent = `<b>📊 Résumé IA du contact — ${today}</b><br><br>${summary.replace(/\n/g, "<br>")}`;
      await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: noteContent,
          deal_id: dealId,
          ...(personId && { person_id: personId }),
        }),
      });
      setNoteSaved(true);
    } catch {
      alert("Erreur lors de la sauvegarde de la note.");
    } finally {
      setSavingNote(false);
    }
  };

  const markDone = async (activityId: number) => {
    try {
      await fetch(`/api/activities/${activityId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: 1 }),
      });
      setCtx((prev) => {
        if (!prev) return prev;
        const task = prev.activities.pending.find((t) => t.id === activityId);
        return {
          ...prev,
          activities: {
            pending: prev.activities.pending.filter((t) => t.id !== activityId),
            done: task ? [{ ...task, done: true }, ...prev.activities.done] : prev.activities.done,
          },
        };
      });
      onActivityChanged?.();
    } catch (err) {
      console.error("Erreur marquer done:", err);
    }
  };

  const deleteTask = async (activityId: number) => {
    if (!confirm("Supprimer cette tâche ?")) return;
    try {
      await fetch(`/api/activities/${activityId}`, { method: "DELETE" });
      setCtx((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          activities: {
            ...prev.activities,
            pending: prev.activities.pending.filter((t) => t.id !== activityId),
          },
        };
      });
      onActivityChanged?.();
    } catch (err) {
      console.error("Erreur suppression:", err);
    }
  };

  const startEdit = (a: Activity) => {
    setEditingTaskId(a.id);
    setEditSubject(a.subject);
    setEditType(a.type);
    setEditDate(a.due_date);
  };

  const cancelEdit = () => {
    setEditingTaskId(null);
  };

  const saveEdit = async () => {
    if (!editingTaskId || !editSubject.trim()) return;
    setSavingTask(true);
    try {
      await fetch(`/api/activities/${editingTaskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: editSubject.trim(),
          type: editType,
          due_date: editDate,
        }),
      });
      setCtx((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          activities: {
            ...prev.activities,
            pending: prev.activities.pending.map((t) =>
              t.id === editingTaskId ? { ...t, subject: editSubject.trim(), type: editType, due_date: editDate } : t
            ),
          },
        };
      });
      setEditingTaskId(null);
      onActivityChanged?.();
    } catch (err) {
      console.error("Erreur mise à jour tâche:", err);
    } finally {
      setSavingTask(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 px-6 text-xs text-gray-400">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Chargement...
      </div>
    );
  }

  if (!ctx) return null;

  return (
    <div className="px-6 py-4 space-y-3 bg-gray-50 border-t border-gray-200">
      {/* Ligne 1 : Notes + Générer IA */}
      <div className="bg-purple-50 rounded-lg border border-purple-200 p-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-purple-700 uppercase tracking-wide flex items-center gap-1.5">
            <StickyNote className="w-3.5 h-3.5" />
            Notes
          </h4>
          <div className="flex items-center gap-1.5">
            {summary && (
              <button
                onClick={saveAsNote}
                disabled={savingNote || noteSaved}
                className={`flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium rounded-md cursor-pointer transition-colors ${
                  noteSaved
                    ? "bg-green-100 text-green-700 border border-green-300"
                    : "bg-amber-500 text-white hover:bg-amber-600"
                } disabled:opacity-60`}
              >
                {savingNote ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : noteSaved ? (
                  <Check className="w-3 h-3" />
                ) : (
                  <StickyNote className="w-3 h-3" />
                )}
                {savingNote ? "Envoi..." : noteSaved ? "Note ajoutée" : "Mettre en note"}
              </button>
            )}
            <button
              onClick={generateSummary}
              disabled={loadingSummary}
              className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700 disabled:opacity-50 cursor-pointer"
            >
              {loadingSummary ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3" />
              )}
              {loadingSummary ? "Analyse..." : summary ? "Regénérer" : "Générer"}
            </button>
          </div>
        </div>
        {/* Dernières notes */}
        {ctx.notes.length > 0 && (
          <div className="space-y-1.5 mb-2">
            {ctx.notes.slice(0, 2).map((note) => (
              <div
                key={note.id}
                className="p-2 bg-yellow-50 border border-yellow-100 rounded text-[10px] text-gray-700 leading-relaxed line-clamp-3"
                dangerouslySetInnerHTML={{ __html: note.content }}
              />
            ))}
          </div>
        )}
        {/* Résumé IA généré */}
        {summary ? (
          <SummaryCard text={summary} />
        ) : (
          <p className="text-[10px] text-purple-400">
            Cliquer sur Générer pour un résumé IA complet.
          </p>
        )}
      </div>

      {/* Ligne 2 : Tâches + Historique */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Tâches à faire */}
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5" />
            Tâches ({ctx.activities.pending.length})
          </h4>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {ctx.activities.pending.length === 0 && (
              <p className="text-[10px] text-gray-400">Aucune tâche en attente</p>
            )}
            {ctx.activities.pending.map((a) => {
              const TypeIcon = TYPE_ICONS[a.type] || CheckCircle;

              if (editingTaskId === a.id) {
                return (
                  <div key={a.id} className="p-2 rounded-lg bg-blue-50 border border-blue-200 space-y-1.5">
                    <input
                      type="text"
                      value={editSubject}
                      onChange={(e) => setEditSubject(e.target.value)}
                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-indigo-400 outline-none"
                      autoFocus
                      onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
                    />
                    <div className="flex items-center gap-1.5">
                      <select
                        value={editType}
                        onChange={(e) => setEditType(e.target.value)}
                        className="px-1.5 py-0.5 text-[10px] border border-gray-300 rounded bg-white focus:ring-1 focus:ring-indigo-400 outline-none"
                      >
                        <option value="call">Appel</option>
                        <option value="email">Email</option>
                        <option value="meeting">RDV</option>
                        <option value="task">Tâche</option>
                        <option value="sms">SMS</option>
                      </select>
                      <input
                        type="date"
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)}
                        className="px-1.5 py-0.5 text-[10px] border border-gray-300 rounded bg-white focus:ring-1 focus:ring-indigo-400 outline-none"
                      />
                      <button
                        onClick={saveEdit}
                        disabled={savingTask || !editSubject.trim()}
                        className="p-0.5 text-green-600 hover:text-green-700 disabled:opacity-40 cursor-pointer"
                      >
                        {savingTask ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={cancelEdit} className="p-0.5 text-gray-400 hover:text-gray-600 cursor-pointer">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div key={a.id} className="flex items-center gap-1.5 text-[10px] p-2 rounded-lg bg-amber-50 border border-amber-100 group">
                  <TypeIcon className="w-3 h-3 text-amber-600 flex-shrink-0" />
                  <span className="flex-1 truncate font-medium text-gray-700">{a.subject}</span>
                  <span className="text-gray-400 flex-shrink-0 text-[9px]">{formatDate(a.due_date)}</span>
                  <button
                    onClick={() => startEdit(a)}
                    className="p-0.5 text-blue-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    title="Modifier"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => markDone(a.id)}
                    className="p-0.5 text-green-500 hover:text-green-700 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    title="Marquer comme effectué"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => deleteTask(a.id)}
                    className="p-0.5 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    title="Supprimer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Historique — 3 derniers */}
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Historique ({ctx.activities.done.length})
          </h4>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {ctx.activities.done.slice(0, 3).map((a) => {
              const TypeIcon = TYPE_ICONS[a.type] || CheckCheck;
              return (
                <div key={a.id} className="flex items-center gap-1.5 text-[10px] p-1.5 rounded bg-gray-50 border border-gray-100 text-gray-500">
                  <TypeIcon className="w-2.5 h-2.5 text-green-400 flex-shrink-0" />
                  <span className="flex-1 truncate">{a.subject}</span>
                  <span className="flex-shrink-0 text-gray-400">{formatDate(a.due_date)}</span>
                </div>
              );
            })}
            {ctx.activities.done.length === 0 && (
              <p className="text-[10px] text-gray-400">Aucune activité</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
