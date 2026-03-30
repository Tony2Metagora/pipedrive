"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  Building2,
  User,
  Mail,
  Phone,
  Briefcase,
  StickyNote,
  Check,
  Plus,
  ExternalLink,
  Loader2,
  MessageSquare,
  Copy,
  CheckCheck,
} from "lucide-react";
import { PIPELINES } from "@/lib/config";
import { cn, formatDate } from "@/lib/utils";
import NewActivityModal from "@/components/NewActivityModal";
import MessageGenerator from "@/components/MessageGenerator";

interface Deal {
  id: number;
  title: string;
  person_id: number | null;
  org_id: number | null;
  pipeline_id: number;
  stage_id: number;
  value: number;
  status: string;
  org_name?: string;
}

interface Person {
  id: number;
  name: string;
  email: { value: string; primary: boolean }[];
  phone: { value: string; primary: boolean }[];
  job_title?: string;
}

interface Activity {
  id: number;
  subject: string;
  type: string;
  due_date: string;
  done: boolean;
}

interface Note {
  id: number;
  content: string;
}

export default function DealPage() {
  const params = useParams();
  const dealId = Number(params.id);

  const [deal, setDeal] = useState<Deal | null>(null);
  const [person, setPerson] = useState<Person | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  // États édition deal
  const [editTitle, setEditTitle] = useState("");
  const [editPipeline, setEditPipeline] = useState(0);
  const [editStage, setEditStage] = useState(0);
  const [editValue, setEditValue] = useState(0);
  const [savingDeal, setSavingDeal] = useState(false);

  // États édition contact (nom/prénom -> Person.name, poste -> Person.job_title, email/téléphone -> Person.email/phone, entreprise -> Deal.org_name)
  const [editingContact, setEditingContact] = useState(false);
  const [editContactName, setEditContactName] = useState("");
  const [editContactJobTitle, setEditContactJobTitle] = useState("");
  const [editContactEmail, setEditContactEmail] = useState("");
  const [editContactPhone, setEditContactPhone] = useState("");
  const [editOrgName, setEditOrgName] = useState("");
  const [savingContact, setSavingContact] = useState(false);

  // Notes
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  // Modals
  const [showNewActivity, setShowNewActivity] = useState(false);
  const [showMessageGen, setShowMessageGen] = useState<"email" | "sms" | null>(null);

  const fetchDeal = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/deals/${dealId}`);
      const json = await res.json();
      const { deal: d, person: p, activities: a, notes: n } = json.data;
      setDeal(d);
      setPerson(p);
      setActivities(a || []);
      setNotes(n || []);
      setEditTitle(d.title);
      setEditPipeline(d.pipeline_id);
      setEditStage(d.stage_id);
      setEditValue(d.value || 0);

      if (p) {
        setEditContactName(p.name || "");
        setEditContactJobTitle(p.job_title || "");
        const email = p.email?.find((e) => e.primary)?.value || p.email?.[0]?.value || "";
        const phone = p.phone?.find((ph) => ph.primary)?.value || p.phone?.[0]?.value || "";
        setEditContactEmail(email);
        setEditContactPhone(phone);
      }
      setEditOrgName(d.org_name || "");
    } catch (err) {
      console.error("Erreur chargement deal:", err);
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    fetchDeal();
  }, [fetchDeal]);

  const saveDeal = async () => {
    setSavingDeal(true);
    try {
      await fetch(`/api/deals/${dealId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle,
          pipeline_id: editPipeline,
          stage_id: editStage,
          value: editValue,
        }),
      });
      fetchDeal();
    } catch (err) {
      console.error("Erreur sauvegarde deal:", err);
    } finally {
      setSavingDeal(false);
    }
  };

  const saveContact = async () => {
    if (!person) return;
    setSavingContact(true);
    try {
      const personId = person.id;
      const payloadPerson: Record<string, unknown> = {
        name: editContactName.trim(),
      };
      if (editContactJobTitle.trim()) payloadPerson.job_title = editContactJobTitle.trim();
      if (editContactEmail.trim()) payloadPerson.email = editContactEmail.trim();
      if (editContactPhone.trim()) payloadPerson.phone = editContactPhone.trim();

      await fetch(`/api/persons/${personId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadPerson),
      });

      // Entreprise est portée par le deal (org_name)
      await fetch(`/api/deals/${dealId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_name: editOrgName.trim(),
        }),
      });

      setEditingContact(false);
      fetchDeal();
    } catch (err) {
      console.error("Erreur sauvegarde contact:", err);
    } finally {
      setSavingContact(false);
    }
  };

  const markActivityDone = async (id: number) => {
    // Optimistic: move task from pending to done immediately
    setActivities((prev) =>
      prev.map((a) => (a.id === id ? { ...a, done: true } : a))
    );
    try {
      await fetch(`/api/activities/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: 1 }),
      });
    } catch (err) {
      console.error("Erreur marquage done:", err);
      fetchDeal(); // revert on error
    }
  };

  const saveNote = async () => {
    if (!newNote.trim()) return;
    setSavingNote(true);
    try {
      await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newNote, deal_id: dealId }),
      });
      setNewNote("");
      fetchDeal();
    } catch (err) {
      console.error("Erreur ajout note:", err);
    } finally {
      setSavingNote(false);
    }
  };

  const selectedPipeline = PIPELINES.find((p) => p.id === editPipeline);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!deal) {
    return (
      <div className="text-center py-20 text-gray-500">
        Affaire non trouvée
      </div>
    );
  }

  const primaryEmail = person?.email?.find((e) => e.primary)?.value || person?.email?.[0]?.value;
  const primaryPhone = person?.phone?.find((p) => p.primary)?.value || person?.phone?.[0]?.value;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{deal.title}</h1>
          {deal.org_name && (
            <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
              <Building2 className="w-4 h-4" />
              {deal.org_name}
            </p>
          )}
        </div>
        <a
          href="/dashboard"
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          Retour
        </a>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Colonne gauche — Infos deal + Contact */}
        <div className="space-y-6">
          {/* Infos deal */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">
              Informations
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Nom de l&apos;affaire
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Pipeline
                </label>
                <select
                  value={editPipeline}
                  onChange={(e) => {
                    const pid = Number(e.target.value);
                    setEditPipeline(pid);
                    const p = PIPELINES.find((p) => p.id === pid);
                    if (p) setEditStage(p.stages[0].id);
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
                <label className="block text-xs text-gray-500 mb-1">
                  Étape
                </label>
                <select
                  value={editStage}
                  onChange={(e) => setEditStage(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  {selectedPipeline?.stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Valeur (€)
                </label>
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={editValue}
                  onChange={(e) => setEditValue(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  placeholder="0"
                />
              </div>
              <button
                onClick={saveDeal}
                disabled={savingDeal}
                className="w-full px-3 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
              >
                {savingDeal ? "Sauvegarde..." : "Enregistrer"}
              </button>
            </div>
          </div>

          {/* Contact */}
          {person && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">
                Contact principal
              </h2>

              {!editingContact ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <User className="w-4 h-4 text-gray-400" />
                    <span className="font-medium">{person.name}</span>
                  </div>
                  {person.job_title && (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Briefcase className="w-4 h-4 text-gray-400" />
                      {person.job_title}
                    </div>
                  )}
                  {primaryEmail && (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Mail className="w-4 h-4 text-gray-400" />
                      <a href={`mailto:${primaryEmail}`} className="hover:text-indigo-600">
                        {primaryEmail}
                      </a>
                    </div>
                  )}
                  {primaryPhone && (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Phone className="w-4 h-4 text-gray-400" />
                      {primaryPhone}
                    </div>
                  )}
                  {deal.org_name && (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Building2 className="w-4 h-4 text-gray-400" />
                      {deal.org_name}
                    </div>
                  )}

                  <div className="pt-3">
                    <button
                      onClick={() => setEditingContact(true)}
                      disabled={savingContact}
                      className="w-full px-3 py-2 text-sm text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 disabled:opacity-40 cursor-pointer"
                    >
                      Modifier
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Nom complet</label>
                    <input
                      value={editContactName}
                      onChange={(e) => setEditContactName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Poste</label>
                    <input
                      value={editContactJobTitle}
                      onChange={(e) => setEditContactJobTitle(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Entreprise</label>
                    <input
                      value={editOrgName}
                      onChange={(e) => setEditOrgName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Email</label>
                    <input
                      value={editContactEmail}
                      onChange={(e) => setEditContactEmail(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Téléphone</label>
                    <input
                      value={editContactPhone}
                      onChange={(e) => setEditContactPhone(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500"
                    />
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => setEditingContact(false)}
                      disabled={savingContact}
                      className="flex-1 px-3 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 cursor-pointer"
                    >
                      Annuler
                    </button>
                    <button
                      onClick={saveContact}
                      disabled={savingContact || !editContactName.trim()}
                      className="flex-1 px-3 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-40 cursor-pointer"
                    >
                      {savingContact ? "Enregistrement..." : "Enregistrer"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Boutons Email / SMS */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">
              Communication
            </h2>
            <div className="flex gap-2">
              <button
                onClick={() => setShowMessageGen("email")}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors cursor-pointer"
              >
                <Mail className="w-4 h-4" />
                Email
              </button>
              <button
                onClick={() => setShowMessageGen("sms")}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors cursor-pointer"
              >
                <MessageSquare className="w-4 h-4" />
                SMS / WhatsApp
              </button>
            </div>
          </div>
        </div>

        {/* Colonne centre — Notes */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <StickyNote className="w-4 h-4" />
              Notes
            </h2>

            {/* Ajouter une note */}
            <div className="mb-4">
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Ajouter une note..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
              />
              <button
                onClick={saveNote}
                disabled={savingNote || !newNote.trim()}
                className="mt-2 px-3 py-1.5 text-xs text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
              >
                {savingNote ? "Enregistrement..." : "Ajouter la note"}
              </button>
            </div>

            {/* Notes existantes */}
            <div className="space-y-3">
              {notes.length === 0 ? (
                <p className="text-sm text-gray-400">Aucune note</p>
              ) : (
                notes.map((note) => (
                  <div
                    key={note.id}
                    className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-gray-700"
                    dangerouslySetInnerHTML={{ __html: note.content }}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Colonne droite — Activités */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700">
                Activités
              </h2>
              <button
                onClick={() => setShowNewActivity(true)}
                className="flex items-center gap-1 px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                Ajouter
              </button>
            </div>

            <div className="space-y-2">
              {activities.length === 0 ? (
                <p className="text-sm text-gray-400">Aucune activité</p>
              ) : (
                <>
                  {/* Non faites — plus récentes en premier */}
                  {activities
                    .filter((a) => !a.done)
                    .sort((a, b) => b.due_date.localeCompare(a.due_date))
                    .map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg"
                      >
                        <button
                          onClick={() => markActivityDone(a.id)}
                          className="flex-shrink-0 w-5 h-5 border-2 border-gray-300 rounded hover:border-green-500 hover:bg-green-50 cursor-pointer transition-colors"
                          title="Marquer comme fait"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {a.subject}
                          </p>
                          <p className="text-xs text-gray-500">
                            {formatDate(a.due_date)}
                          </p>
                        </div>
                      </div>
                    ))}

                  {/* Faites */}
                  {activities.filter((a) => a.done).length > 0 && (
                    <div className="mt-4">
                      <p className="text-xs text-gray-400 mb-2">Terminées</p>
                      {activities
                        .filter((a) => a.done)
                        .sort((a, b) => b.due_date.localeCompare(a.due_date))
                        .map((a) => (
                          <div
                            key={a.id}
                            className="flex items-center gap-3 p-3 border border-gray-100 rounded-lg opacity-60"
                          >
                            <CheckCheck className="w-4 h-4 text-green-500 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm line-through truncate">
                                {a.subject}
                              </p>
                              <p className="text-xs text-gray-400">
                                {formatDate(a.due_date)}
                              </p>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal nouvelle activité */}
      {showNewActivity && (
        <NewActivityModal
          onClose={() => setShowNewActivity(false)}
          onCreated={() => {
            setShowNewActivity(false);
            fetchDeal();
          }}
          defaultDealId={dealId}
          defaultPersonId={person?.id}
          defaultOrgId={deal.org_id ?? undefined}
        />
      )}

      {/* Modal génération email/SMS */}
      {showMessageGen && (
        <MessageGenerator
          type={showMessageGen}
          dealId={dealId}
          contact={{
            name: person?.name || "",
            company: deal.org_name,
            jobTitle: person?.job_title,
            email: primaryEmail,
            phone: primaryPhone,
            stage: PIPELINES.find((p) => p.id === deal.pipeline_id)
              ?.stages.find((s) => s.id === deal.stage_id)?.name,
            pipeline: PIPELINES.find((p) => p.id === deal.pipeline_id)?.name,
          }}
          onClose={() => setShowMessageGen(null)}
        />
      )}
    </div>
  );
}
