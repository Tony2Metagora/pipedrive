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
  Plus,
  Save,
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

// Section styling by keyword
const SECTION_STYLES: { match: string; icon: string; bg: string; border: string; title: string; text: string }[] = [
  { match: "DERNIER EMAIL", icon: "📧", bg: "bg-amber-50", border: "border-amber-200", title: "text-amber-800", text: "text-amber-900" },
  { match: "FOLLOWUP EMAIL", icon: "✉️", bg: "bg-green-50", border: "border-green-200", title: "text-green-800", text: "text-green-900" },
];

function SummaryCard({
  text,
  followupEmail,
  followupSubject,
  onFollowupEmailChange,
  onFollowupSubjectChange,
  onSendFollowup,
  onRefineFollowup,
  onCreateTask,
  creatingTask,
  refining,
}: {
  text: string;
  followupEmail?: string;
  followupSubject?: string;
  onFollowupEmailChange?: (val: string) => void;
  onFollowupSubjectChange?: (val: string) => void;
  onSendFollowup?: () => void;
  onRefineFollowup?: (prompt: string) => void;
  onCreateTask?: (subject: string, date: string) => void;
  creatingTask?: boolean;
  refining?: boolean;
}) {
  const [refinePrompt, setRefinePrompt] = useState("");
  const [showTaskPrompt, setShowTaskPrompt] = useState(false);
  const [taskSubject, setTaskSubject] = useState("");
  const [taskDate, setTaskDate] = useState("");

  const sections = useMemo(() => {
    const parts: { title: string; content: string; objet: string; styleIdx: number }[] = [];
    const positions: { idx: number; title: string; styleIdx: number; endOfTitle: number }[] = [];
    for (let si = 0; si < SECTION_STYLES.length; si++) {
      const keyword = SECTION_STYLES[si].match;
      const idx = text.indexOf(keyword);
      if (idx === -1) continue;
      const lineEnd = text.indexOf("\n", idx);
      const endOfTitle = lineEnd > -1 ? lineEnd : text.length;
      const fullTitle = text.slice(idx, endOfTitle).trim();
      positions.push({ idx, title: fullTitle, styleIdx: si, endOfTitle });
    }
    positions.sort((a, b) => a.idx - b.idx);
    for (let i = 0; i < positions.length; i++) {
      const start = positions[i].endOfTitle;
      const end = i + 1 < positions.length ? positions[i + 1].idx : text.length;
      const rawContent = text.slice(start, end).trim();
      // Extract "Objet:" line for followup
      let objet = "";
      let content = rawContent;
      const objetMatch = rawContent.match(/^Objet\s*:\s*(.+)/im);
      if (objetMatch) {
        objet = objetMatch[1].trim();
        content = rawContent.replace(/^Objet\s*:.+\n?/im, "").trim();
      }
      parts.push({ title: positions[i].title, content, objet, styleIdx: positions[i].styleIdx });
    }
    return parts.length > 0 ? parts : null;
  }, [text]);

  if (!sections) {
    return <p className="text-xs leading-relaxed text-purple-900">{text}</p>;
  }

  return (
    <div className="space-y-3">
      {sections.map((s) => {
        const cfg = SECTION_STYLES[s.styleIdx];
        const isFollowup = cfg.match === "FOLLOWUP EMAIL";
        return (
          <div key={s.title} className={`rounded-lg ${cfg.bg} border ${cfg.border} px-3 py-2.5`}>
            <div className="flex items-center justify-between mb-1.5">
              <p className={`text-[10px] font-bold uppercase tracking-wide ${cfg.title}`}>
                {cfg.icon} {s.title}
              </p>
              {isFollowup && onSendFollowup && (
                <div className="flex items-center gap-1.5">
                  {!showTaskPrompt && (
                    <button
                      onClick={() => {
                        onSendFollowup();
                        setTaskSubject(followupSubject || "Followup");
                        setTaskDate(new Date().toISOString().slice(0, 10));
                        setShowTaskPrompt(true);
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold text-white bg-green-600 rounded-md hover:bg-green-700 cursor-pointer transition-colors"
                    >
                      <Mail className="w-3 h-3" />
                      Envoyer
                    </button>
                  )}
                  {showTaskPrompt && (
                    <span className="text-[9px] text-green-600 font-medium">✓ Gmail ouvert</span>
                  )}
                </div>
              )}
            </div>
            {isFollowup && onFollowupSubjectChange && followupSubject !== undefined ? (
              <>
                <div className="mb-2">
                  <label className="text-[9px] font-semibold text-green-700 uppercase tracking-wide">Objet</label>
                  <input
                    type="text"
                    value={followupSubject}
                    onChange={(e) => onFollowupSubjectChange(e.target.value)}
                    className="w-full mt-0.5 px-2 py-1 text-xs border border-green-200 rounded bg-white focus:ring-1 focus:ring-green-400 outline-none"
                  />
                </div>
                <div className="mb-2">
                  <label className="text-[9px] font-semibold text-green-700 uppercase tracking-wide">Corps du mail</label>
                  <textarea
                    value={followupEmail || ""}
                    onChange={(e) => onFollowupEmailChange?.(e.target.value)}
                    rows={8}
                    className="w-full mt-0.5 px-2 py-1.5 text-xs leading-relaxed border border-green-200 rounded bg-white focus:ring-1 focus:ring-green-400 outline-none resize-y"
                  />
                </div>
                {showTaskPrompt && onCreateTask && (
                  <div className="mt-2 p-2 rounded-lg bg-blue-50 border border-blue-200">
                    <p className="text-[10px] font-semibold text-blue-700 mb-1.5 flex items-center gap-1">
                      <Plus className="w-3 h-3" />
                      Ajouter une tâche de suivi ?
                    </p>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={taskSubject}
                        onChange={(e) => setTaskSubject(e.target.value)}
                        className="flex-1 px-2 py-1 text-[11px] border border-blue-200 rounded bg-white focus:ring-1 focus:ring-blue-400 outline-none"
                        placeholder="Objet de la tâche"
                      />
                      <input
                        type="date"
                        value={taskDate}
                        onChange={(e) => setTaskDate(e.target.value)}
                        className="px-1.5 py-1 text-[11px] border border-blue-200 rounded bg-white focus:ring-1 focus:ring-blue-400 outline-none"
                      />
                      <button
                        onClick={() => {
                          if (taskSubject.trim()) {
                            onCreateTask(taskSubject.trim(), taskDate);
                            setShowTaskPrompt(false);
                          }
                        }}
                        disabled={creatingTask || !taskSubject.trim()}
                        className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 cursor-pointer transition-colors"
                      >
                        {creatingTask ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                        Créer
                      </button>
                      <button
                        onClick={() => setShowTaskPrompt(false)}
                        className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}
                {onRefineFollowup && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <input
                      type="text"
                      value={refinePrompt}
                      onChange={(e) => setRefinePrompt(e.target.value)}
                      placeholder="Ex: rends le mail plus court, ajoute une ref au salon..."
                      className="flex-1 px-2 py-1 text-[11px] border border-green-200 rounded bg-white focus:ring-1 focus:ring-green-400 outline-none"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && refinePrompt.trim()) {
                          onRefineFollowup(refinePrompt.trim());
                          setRefinePrompt("");
                        }
                      }}
                    />
                    <button
                      onClick={() => {
                        if (refinePrompt.trim()) {
                          onRefineFollowup(refinePrompt.trim());
                          setRefinePrompt("");
                        }
                      }}
                      disabled={refining || !refinePrompt.trim()}
                      className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-white bg-purple-600 rounded hover:bg-purple-700 disabled:opacity-50 cursor-pointer transition-colors"
                    >
                      {refining ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      Modifier
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                {isFollowup && s.objet && (
                  <p className={`text-xs font-semibold ${cfg.text} mb-2`}>Objet : {s.objet}</p>
                )}
                <p className={`text-xs leading-relaxed ${cfg.text} whitespace-pre-line`}>{s.content}</p>
              </>
            )}
            {!isFollowup && (
              <p className={`text-xs leading-relaxed ${cfg.text} whitespace-pre-line`}>{s.content}</p>
            )}
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onActivityChanged?: (newActivity?: any) => void;
  onMarkDone?: (activityId: number) => void;
  refreshKey?: number;
  parentPendingIds?: number[];
}

export default function DealContextPanel({ dealId, personId, orgId, personName, orgName, deals, onActivityChanged, onMarkDone, refreshKey, parentPendingIds }: Props) {
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
  const [followupEmail, setFollowupEmail] = useState<string>("");
  const [followupSubject, setFollowupSubject] = useState<string>("");
  const [refining, setRefining] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const [manualNote, setManualNote] = useState("");
  const [savingManualNote, setSavingManualNote] = useState(false);

  // Sync pending activities with parent state (handles Done/Delete from preview buttons)
  useEffect(() => {
    if (!ctx || !parentPendingIds) return;
    const parentSet = new Set(parentPendingIds);
    const currentPending = ctx.activities.pending;
    // Find activities that were removed by the parent
    const removed = currentPending.filter((a) => !parentSet.has(a.id));
    if (removed.length > 0) {
      setCtx((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          activities: {
            pending: prev.activities.pending.filter((a) => parentSet.has(a.id)),
            done: [...removed.map((a) => ({ ...a, done: true })), ...prev.activities.done],
          },
        };
      });
    }
  }, [parentPendingIds, ctx]);

  useEffect(() => {
    // Only show loading spinner on initial load, not on refreshKey updates
    const isInitial = !ctx;
    if (isInitial) setLoading(true);
    const doFetch = () => {
      fetch(`/api/deals/${dealId}/context?t=${Date.now()}`)
        .then((r) => r.json())
        .then((json) => {
          if (json.data) setCtx(json.data);
        })
        .catch((err) => console.error("Erreur chargement contexte deal:", err))
        .finally(() => { if (isInitial) setLoading(false); });
    };
    // On refresh (not initial), delay slightly to let blob writes propagate
    if (!isInitial && refreshKey) {
      const timer = setTimeout(doFetch, 800);
      return () => clearTimeout(timer);
    }
    doFetch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId, refreshKey]);

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
        if (json.data.followupEmail) setFollowupEmail(json.data.followupEmail);
        if (json.data.followupSubject) setFollowupSubject(json.data.followupSubject);
      } else {
        setSummary("Erreur : " + (json.error || "Impossible de générer le résumé"));
      }
    } catch {
      setSummary("Erreur de connexion à l'IA");
    } finally {
      setLoadingSummary(false);
    }
  };

  const refineFollowup = async (prompt: string) => {
    if (!followupEmail) return;
    setRefining(true);
    try {
      const res = await fetch("/api/summary/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentEmail: followupEmail,
          currentSubject: followupSubject,
          prompt,
          contactName: personName || "inconnu",
        }),
      });
      const json = await res.json();
      if (json.data?.followupEmail) setFollowupEmail(json.data.followupEmail);
      if (json.data?.followupSubject) setFollowupSubject(json.data.followupSubject);
    } catch {
      console.error("Erreur refinement IA");
    } finally {
      setRefining(false);
    }
  };

  const createTaskAfterSend = async (subject: string, date: string) => {
    setCreatingTask(true);
    try {
      const res = await fetch("/api/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          type: "email",
          due_date: date,
          deal_id: dealId,
          person_id: personId || null,
        }),
      });
      const json = await res.json();
      if (json.data) {
        // Optimistic: add to local task list
        setCtx((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            activities: {
              ...prev.activities,
              pending: [...prev.activities.pending, json.data],
            },
          };
        });
        onActivityChanged?.({
          ...json.data,
          deal_id: dealId,
          deal_title: "",
          person_name: personName || "",
          org_name: orgName || "",
          person_id: personId || null,
          org_id: orgId || null,
        });
      }
    } catch (err) {
      console.error("Erreur création tâche:", err);
    } finally {
      setCreatingTask(false);
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

  const saveManualNote = async () => {
    if (!manualNote.trim()) return;
    setSavingManualNote(true);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: manualNote.trim().replace(/\n/g, "<br>"),
          deal_id: dealId,
          ...(personId && { person_id: personId }),
        }),
      });
      const json = await res.json();
      if (json.data) {
        setCtx((prev) => {
          if (!prev) return prev;
          return { ...prev, notes: [json.data, ...prev.notes] };
        });
        setManualNote("");
      }
    } catch {
      alert("Erreur lors de la sauvegarde de la note.");
    } finally {
      setSavingManualNote(false);
    }
  };

  const markDone = async (activityId: number) => {
    // Optimistic local update: move from pending to done
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
    // Notify parent to remove activity from dashboard state (updates pink header bar)
    if (onMarkDone) {
      onMarkDone(activityId);
    } else {
      // Fallback: call API directly if no parent handler
      try {
        await fetch(`/api/activities/${activityId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ done: 1 }),
        });
        onActivityChanged?.();
      } catch (err) {
        console.error("Erreur marquer done:", err);
      }
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
        {/* Ajouter une note manuellement */}
        <div className="flex gap-1.5 mb-2">
          <textarea
            value={manualNote}
            onChange={(e) => setManualNote(e.target.value)}
            placeholder="Écrire une note..."
            rows={2}
            className="flex-1 px-2 py-1.5 text-xs border border-purple-200 rounded bg-white focus:ring-1 focus:ring-purple-400 outline-none resize-y"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                saveManualNote();
              }
            }}
          />
          <button
            onClick={saveManualNote}
            disabled={savingManualNote || !manualNote.trim()}
            className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700 disabled:opacity-50 cursor-pointer self-end"
          >
            {savingManualNote ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
            Ajouter
          </button>
        </div>
        {/* Dernières notes */}
        {ctx.notes.length > 0 && (
          <div className="space-y-1 mb-2">
            {/* Dernière note : affichée complètement */}
            <div
              className="p-2 bg-yellow-50 border border-yellow-100 rounded text-[10px] text-gray-700 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: ctx.notes[0].content }}
            />
            {/* Notes suivantes : aperçu 1 ligne */}
            {ctx.notes.slice(1, 4).map((note) => (
              <div
                key={note.id}
                className="px-2 py-1 bg-yellow-50/50 border border-yellow-100/50 rounded text-[9px] text-gray-400 truncate"
                dangerouslySetInnerHTML={{ __html: note.content }}
              />
            ))}
          </div>
        )}
        {/* Résumé IA généré */}
        {summary ? (
          <SummaryCard
            text={summary}
            followupEmail={followupEmail}
            followupSubject={followupSubject}
            onFollowupEmailChange={setFollowupEmail}
            onFollowupSubjectChange={setFollowupSubject}
            onRefineFollowup={refineFollowup}
            refining={refining}
            onCreateTask={createTaskAfterSend}
            creatingTask={creatingTask}
            onSendFollowup={followupEmail && personEmail ? () => {
              const to = encodeURIComponent(personEmail);
              const subject = encodeURIComponent(followupSubject || "Metagora");
              const body = encodeURIComponent(followupEmail);
              window.open(`https://mail.google.com/mail/?view=cm&to=${to}&su=${subject}&body=${body}`, "_blank");
            } : undefined}
          />
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
            {[...ctx.activities.pending].sort((a, b) => b.due_date.localeCompare(a.due_date)).map((a) => {
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

        {/* Historique */}
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Historique ({ctx.activities.done.length})
          </h4>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {[...ctx.activities.done].sort((a, b) => b.due_date.localeCompare(a.due_date)).map((a) => {
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
