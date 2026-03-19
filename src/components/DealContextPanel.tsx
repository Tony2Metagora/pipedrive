"use client";

import { useEffect, useState } from "react";
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
  CalendarDays,
  CheckCircle,
  Trash2,
  Pencil,
  X,
  Plus,
  Save,
  FileText,
  Quote,
  DollarSign,
  UserCheck,
  ArrowRight,
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
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editType, setEditType] = useState("");
  const [editDate, setEditDate] = useState("");
  const [savingTask, setSavingTask] = useState(false);
  const [personEmail, setPersonEmail] = useState<string | null>(null);
  const [manualNote, setManualNote] = useState("");
  const [savingManualNote, setSavingManualNote] = useState(false);

  // Calendar meetings
  const [calendarMeetings, setCalendarMeetings] = useState<{ past: { id: string; subject: string; date: string; type: string }[]; upcoming: { id: string; subject: string; date: string; type: string }[] } | null>(null);
  const [loadingCalendar, setLoadingCalendar] = useState(false);

  // Email analysis (structured notes)
  interface EmailAnalysis {
    summary: string;
    decisionnaire: { value: boolean; citation: string; detail: string };
    nextSteps: { value: string; citation: string };
    budget: { value: boolean; citation: string; detail: string };
    lastEmailDate: string;
    lastEmailSubject: string;
  }
  const [emailAnalysis, setEmailAnalysis] = useState<EmailAnalysis | null>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

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

  // Fetch calendar meetings when we have person email
  useEffect(() => {
    if (!personEmail) return;
    setLoadingCalendar(true);
    fetch(`/api/calendar/meetings?email=${encodeURIComponent(personEmail)}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.data) setCalendarMeetings(json.data);
      })
      .catch(() => {})
      .finally(() => setLoadingCalendar(false));
  }, [personEmail]);

  // Fetch email analysis
  const fetchEmailAnalysis = async () => {
    if (!personEmail) {
      setAnalysisError("Aucune adresse email disponible.");
      return;
    }
    setLoadingAnalysis(true);
    setAnalysisError(null);
    setEmailAnalysis(null);
    setNoteSaved(false);
    try {
      const res = await fetch(`/api/deals/${dealId}/email-analysis?email=${encodeURIComponent(personEmail)}`);
      const json = await res.json();
      if (json.data?.analysis) {
        setEmailAnalysis(json.data.analysis);
      } else {
        setAnalysisError(json.data?.reason || json.error || "Impossible d'analyser les emails.");
      }
    } catch {
      setAnalysisError("Erreur de connexion.");
    } finally {
      setLoadingAnalysis(false);
    }
  };

  // Save email analysis as a note
  const saveAnalysisAsNote = async () => {
    if (!emailAnalysis) return;
    setSavingNote(true);
    try {
      const today = new Date().toLocaleDateString("fr-FR");
      const parts: string[] = [];
      parts.push(`<b>📊 Analyse email — ${today}</b>`);
      if (emailAnalysis.lastEmailSubject) parts.push(`<br><b>📧 ${emailAnalysis.lastEmailSubject}</b> (${emailAnalysis.lastEmailDate || ""})`);
      if (emailAnalysis.summary) parts.push(`<br>${emailAnalysis.summary}`);
      const decLabel = emailAnalysis.decisionnaire?.value ? "OUI" : "NON";
      parts.push(`<br><b>👤 Décisionnaire : ${decLabel}</b>`);
      if (emailAnalysis.decisionnaire?.detail) parts.push(`${emailAnalysis.decisionnaire.detail}`);
      if (emailAnalysis.decisionnaire?.citation) parts.push(`<i>"${emailAnalysis.decisionnaire.citation}"</i>`);
      parts.push(`<br><b>➡️ Next steps</b>`);
      if (emailAnalysis.nextSteps?.value) parts.push(`${emailAnalysis.nextSteps.value}`);
      if (emailAnalysis.nextSteps?.citation) parts.push(`<i>"${emailAnalysis.nextSteps.citation}"</i>`);
      const budgetLabel = emailAnalysis.budget?.value ? "OUI" : "NON";
      parts.push(`<br><b>💰 Budget abordé : ${budgetLabel}</b>`);
      if (emailAnalysis.budget?.detail) parts.push(`${emailAnalysis.budget.detail}`);
      if (emailAnalysis.budget?.citation) parts.push(`<i>"${emailAnalysis.budget.citation}"</i>`);

      const noteContent = parts.join("<br>");
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: noteContent,
          deal_id: dealId,
          ...(personId && { person_id: personId }),
        }),
      });
      const json = await res.json();
      if (json.data) {
        setCtx((prev: DealContext | null) => {
          if (!prev) return prev;
          return { ...prev, notes: [json.data, ...prev.notes] };
        });
      }
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

  // Build unified timeline: calendar meetings (past=done, upcoming=pending) + activities
  const buildTimeline = () => {
    type TimelineItem = {
      id: string;
      subject: string;
      date: string;
      type: string;
      done: boolean;
      isCalendar?: boolean;
      isCurrentTask?: boolean;
    };
    const items: TimelineItem[] = [];

    // Add pending tasks
    for (const a of ctx!.activities.pending) {
      items.push({ id: String(a.id), subject: a.subject, date: a.due_date, type: a.type, done: false });
    }

    // Add done tasks
    for (const a of ctx!.activities.done) {
      items.push({ id: String(a.id), subject: a.subject, date: a.due_date, type: a.type, done: true });
    }

    // Add calendar meetings
    if (calendarMeetings) {
      for (const m of calendarMeetings.past) {
        // Avoid duplicates if already tracked as activity
        const isDuplicate = items.some((i) => i.subject.toLowerCase().includes(m.subject.toLowerCase().slice(0, 20)) && i.date === m.date);
        if (!isDuplicate) {
          items.push({ id: `cal-${m.id}`, subject: `📅 ${m.subject}`, date: m.date, type: "meeting", done: true, isCalendar: true });
        }
      }
      for (const m of calendarMeetings.upcoming) {
        const isDuplicate = items.some((i) => i.subject.toLowerCase().includes(m.subject.toLowerCase().slice(0, 20)) && i.date === m.date);
        if (!isDuplicate) {
          items.push({ id: `cal-${m.id}`, subject: `📅 ${m.subject}`, date: m.date, type: "meeting", done: false, isCalendar: true });
        }
      }
    }

    // Sort: pending first (by date asc), then done (by date desc)
    const pending = items.filter((i) => !i.done).sort((a, b) => a.date.localeCompare(b.date));
    const done = items.filter((i) => i.done).sort((a, b) => b.date.localeCompare(a.date));

    // Mark the earliest pending task as "current"
    if (pending.length > 0) {
      pending[0].isCurrentTask = true;
    }

    return { pending, done, all: [...pending, ...done] };
  };

  const timeline = ctx ? buildTimeline() : null;

  return (
    <div className="px-4 py-3 space-y-3 bg-gray-50 overflow-y-auto max-h-[600px]">
      {/* Ligne 1 : Timeline unifiée (Tâches + Historique + Calendar) */}
      <div className="bg-white rounded-lg border border-gray-200 p-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Timeline ({timeline ? timeline.all.length : 0})
            {loadingCalendar && <Loader2 className="w-3 h-3 animate-spin text-blue-400 ml-1" />}
          </h4>
          {calendarMeetings && (
            <span className="text-[9px] text-blue-400 flex items-center gap-1">
              <CalendarDays className="w-3 h-3" />
              {calendarMeetings.past.length + calendarMeetings.upcoming.length} meeting(s) Google Calendar
            </span>
          )}
        </div>

        <div className="space-y-1 max-h-72 overflow-y-auto">
          {/* Pending tasks (à faire) — with upcoming calendar meetings */}
          {timeline && timeline.pending.length > 0 && (
            <>
              <p className="text-[9px] font-semibold text-amber-600 uppercase tracking-wide mt-1 mb-0.5 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />
                À faire ({timeline.pending.length})
              </p>
              {timeline.pending.map((item) => {
                const TypeIcon = TYPE_ICONS[item.type] || CheckCircle;
                const activityId = item.isCalendar ? null : Number(item.id);

                if (activityId && editingTaskId === activityId) {
                  return (
                    <div key={item.id} className="p-2 rounded-lg bg-blue-50 border border-blue-200 space-y-1.5">
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
                  <div
                    key={item.id}
                    className={`flex items-center gap-1.5 text-[10px] p-2 rounded-lg group transition-colors ${
                      item.isCurrentTask
                        ? "bg-orange-100 border-2 border-orange-300 ring-1 ring-orange-200"
                        : item.isCalendar
                          ? "bg-blue-50 border border-blue-100"
                          : "bg-amber-50 border border-amber-100"
                    }`}
                  >
                    <TypeIcon className={`w-3 h-3 flex-shrink-0 ${item.isCurrentTask ? "text-orange-600" : item.isCalendar ? "text-blue-500" : "text-amber-600"}`} />
                    <span className={`flex-1 truncate font-medium ${item.isCurrentTask ? "text-orange-900" : "text-gray-700"}`}>
                      {item.subject}
                    </span>
                    {item.isCurrentTask && (
                      <span className="text-[8px] font-bold text-orange-600 bg-orange-200 px-1.5 py-0.5 rounded-full flex-shrink-0 uppercase">En cours</span>
                    )}
                    {item.isCalendar && (
                      <span className="text-[8px] text-blue-500 bg-blue-100 px-1 py-0.5 rounded-full flex-shrink-0">Calendar</span>
                    )}
                    <span className="text-gray-400 flex-shrink-0 text-[9px]">{formatDate(item.date)}</span>
                    {!item.isCalendar && activityId && (
                      <>
                        <button
                          onClick={() => { const a = ctx!.activities.pending.find((t) => t.id === activityId); if (a) startEdit(a); }}
                          className="p-0.5 text-blue-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          title="Modifier"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => markDone(activityId)}
                          className="p-0.5 text-green-500 hover:text-green-700 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          title="Marquer comme effectué"
                        >
                          <CheckCheck className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => deleteTask(activityId)}
                          className="p-0.5 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          title="Supprimer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {/* Done tasks (historique) — with past calendar meetings */}
          {timeline && timeline.done.length > 0 && (
            <>
              <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide mt-2 mb-0.5 flex items-center gap-1">
                <CheckCheck className="w-3 h-3" />
                Historique ({timeline.done.length})
              </p>
              {timeline.done.map((item) => {
                const TypeIcon = TYPE_ICONS[item.type] || CheckCheck;
                return (
                  <div key={item.id} className={`flex items-center gap-1.5 text-[10px] p-1.5 rounded border text-gray-500 ${
                    item.isCalendar ? "bg-blue-50/50 border-blue-100/50" : "bg-gray-50 border-gray-100"
                  }`}>
                    <TypeIcon className={`w-2.5 h-2.5 flex-shrink-0 ${item.isCalendar ? "text-blue-300" : "text-green-400"}`} />
                    <span className="flex-1 truncate">{item.subject}</span>
                    {item.isCalendar && (
                      <span className="text-[8px] text-blue-400 bg-blue-50 px-1 py-0.5 rounded-full flex-shrink-0">Cal</span>
                    )}
                    <span className="flex-shrink-0 text-gray-400">{formatDate(item.date)}</span>
                  </div>
                );
              })}
            </>
          )}

          {timeline && timeline.all.length === 0 && !loadingCalendar && (
            <p className="text-[10px] text-gray-400">Aucune activité ni meeting</p>
          )}
        </div>
      </div>

      {/* Ligne 2 : Notes manuelles */}
      <div className="bg-purple-50 rounded-lg border border-purple-200 p-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-purple-700 uppercase tracking-wide flex items-center gap-1.5">
            <StickyNote className="w-3.5 h-3.5" />
            Notes
          </h4>
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
          <div className="space-y-1">
            <div
              className="p-2 bg-yellow-50 border border-yellow-100 rounded text-[10px] text-gray-700 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: ctx.notes[0].content }}
            />
            {ctx.notes.slice(1, 4).map((note: Note) => (
              <div
                key={note.id}
                className="px-2 py-1 bg-yellow-50/50 border border-yellow-100/50 rounded text-[9px] text-gray-400 truncate"
                dangerouslySetInnerHTML={{ __html: note.content }}
              />
            ))}
          </div>
        )}
        {ctx.notes.length === 0 && (
          <p className="text-[10px] text-purple-400">Aucune note</p>
        )}
      </div>

      {/* Ligne 3 : Analyse email structurée (Décisionnaire / Next steps / Budget) */}
      <div className="bg-white rounded-lg border border-gray-200 p-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            Analyse dernier email
          </h4>
          <div className="flex items-center gap-1.5">
            {emailAnalysis && (
              <button
                onClick={saveAnalysisAsNote}
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
                {savingNote ? "Envoi..." : noteSaved ? "Note ajoutée" : "Ajouter en note"}
              </button>
            )}
            <button
              onClick={fetchEmailAnalysis}
              disabled={loadingAnalysis || !personEmail}
              className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
            >
              {loadingAnalysis ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3" />
              )}
              {loadingAnalysis ? "Analyse..." : emailAnalysis ? "Réanalyser" : "Analyser"}
            </button>
          </div>
        </div>

        {analysisError && (
          <p className="text-[10px] text-red-500 mb-2">{analysisError}</p>
        )}

        {!emailAnalysis && !loadingAnalysis && !analysisError && (
          <p className="text-[10px] text-gray-400">
            Cliquer sur Analyser pour extraire les infos clés du dernier email.
          </p>
        )}

        {emailAnalysis && (
          <div className="space-y-2">
            {/* Summary line */}
            {emailAnalysis.lastEmailSubject && (
              <div className="text-[10px] text-gray-500 flex items-center gap-1.5">
                <Mail className="w-3 h-3 flex-shrink-0" />
                <span className="font-medium">{emailAnalysis.lastEmailSubject}</span>
                {emailAnalysis.lastEmailDate && <span className="text-gray-400 ml-auto">{emailAnalysis.lastEmailDate}</span>}
              </div>
            )}
            {emailAnalysis.summary && (
              <p className="text-[10px] text-gray-600 leading-relaxed bg-gray-50 rounded p-2 border border-gray-100">{emailAnalysis.summary}</p>
            )}

            {/* Décisionnaire */}
            <div className={`rounded-lg p-2.5 border ${emailAnalysis.decisionnaire?.value ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200"}`}>
              <div className="flex items-center gap-1.5 mb-1">
                <UserCheck className={`w-3.5 h-3.5 ${emailAnalysis.decisionnaire?.value ? "text-green-600" : "text-gray-400"}`} />
                <span className={`text-[10px] font-bold uppercase tracking-wide ${emailAnalysis.decisionnaire?.value ? "text-green-700" : "text-gray-500"}`}>
                  Personne décisionnaire : {emailAnalysis.decisionnaire?.value ? "OUI" : "NON"}
                </span>
              </div>
              {emailAnalysis.decisionnaire?.detail && (
                <p className="text-[10px] text-gray-600 mb-1">{emailAnalysis.decisionnaire.detail}</p>
              )}
              {emailAnalysis.decisionnaire?.citation && (
                <div className="flex items-start gap-1 mt-1">
                  <Quote className="w-3 h-3 text-gray-300 flex-shrink-0 mt-0.5" />
                  <p className="text-[9px] italic text-gray-500 leading-relaxed">&ldquo;{emailAnalysis.decisionnaire.citation}&rdquo;</p>
                </div>
              )}
            </div>

            {/* Next Steps */}
            <div className="rounded-lg p-2.5 border bg-blue-50 border-blue-200">
              <div className="flex items-center gap-1.5 mb-1">
                <ArrowRight className="w-3.5 h-3.5 text-blue-600" />
                <span className="text-[10px] font-bold uppercase tracking-wide text-blue-700">
                  Next steps
                </span>
              </div>
              {emailAnalysis.nextSteps?.value && (
                <p className="text-[10px] text-blue-800 font-medium mb-1">{emailAnalysis.nextSteps.value}</p>
              )}
              {emailAnalysis.nextSteps?.citation && (
                <div className="flex items-start gap-1 mt-1">
                  <Quote className="w-3 h-3 text-blue-300 flex-shrink-0 mt-0.5" />
                  <p className="text-[9px] italic text-blue-600 leading-relaxed">&ldquo;{emailAnalysis.nextSteps.citation}&rdquo;</p>
                </div>
              )}
              {!emailAnalysis.nextSteps?.value && (
                <p className="text-[10px] text-blue-400">Aucune prochaine étape identifiée</p>
              )}
            </div>

            {/* Budget */}
            <div className={`rounded-lg p-2.5 border ${emailAnalysis.budget?.value ? "bg-emerald-50 border-emerald-200" : "bg-gray-50 border-gray-200"}`}>
              <div className="flex items-center gap-1.5 mb-1">
                <DollarSign className={`w-3.5 h-3.5 ${emailAnalysis.budget?.value ? "text-emerald-600" : "text-gray-400"}`} />
                <span className={`text-[10px] font-bold uppercase tracking-wide ${emailAnalysis.budget?.value ? "text-emerald-700" : "text-gray-500"}`}>
                  Budget abordé : {emailAnalysis.budget?.value ? "OUI" : "NON"}
                </span>
              </div>
              {emailAnalysis.budget?.detail && (
                <p className="text-[10px] text-gray-600 mb-1">{emailAnalysis.budget.detail}</p>
              )}
              {emailAnalysis.budget?.citation && (
                <div className="flex items-start gap-1 mt-1">
                  <Quote className="w-3 h-3 text-gray-300 flex-shrink-0 mt-0.5" />
                  <p className="text-[9px] italic text-gray-500 leading-relaxed">&ldquo;{emailAnalysis.budget.citation}&rdquo;</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
