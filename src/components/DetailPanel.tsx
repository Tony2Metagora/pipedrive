"use client";

import { useEffect, useState, useMemo } from "react";
import {
  User,
  Building2,
  Briefcase,
  Mail,
  Phone,
  StickyNote,
  Clock,
  CheckCheck,
  Sparkles,
  Loader2,
  ExternalLink,
  TrendingUp,
  Plus,
  Check,
  Search,
  Linkedin,
  MessageSquare,
  DollarSign,
  X,
  Calendar,
  Trash2,
  CheckCircle,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { getPipelineName, getStageName } from "@/lib/config";
import MessagePanel from "@/components/MessagePanel";

interface PersonContext {
  person: {
    id: number;
    name: string;
    email: { value: string; primary: boolean }[];
    phone: { value: string; primary: boolean }[];
    org_id: number | null;
    job_title?: string;
  };
  organization: {
    id: number;
    name: string;
    address?: string;
  } | null;
  deals: {
    id: number;
    title: string;
    pipeline_id: number;
    stage_id: number;
    value: number;
    status: string;
    currency: string;
  }[];
  activities: {
    pending: { id: number; subject: string; due_date: string; type: string; done: boolean }[];
    done: { id: number; subject: string; due_date: string; type: string; done: boolean }[];
  };
  notes: { id: number; content: string }[];
  dealNotes: Record<number, { id: number; content: string }[]>;
}

export interface Participant {
  id: number;
  name: string;
  email: { value: string; primary: boolean }[];
  phone: { value: string; primary: boolean }[];
  job_title?: string;
  primary: boolean;
}

interface Props {
  personId: number;
  allParticipants?: Participant[];
  dealId?: number;
  orgId?: number | null;
  onActivityCreated?: () => void;
}

const SECTION_CONFIG: Record<string, { icon: string; bg: string; border: string; title: string; text: string }> = {
  "OPPORTUNITÉ COMMERCIALE": { icon: "💰", bg: "bg-amber-50", border: "border-amber-200", title: "text-amber-800", text: "text-amber-900" },
  "SCOPE & BESOIN": { icon: "🎯", bg: "bg-emerald-50", border: "border-emerald-200", title: "text-emerald-800", text: "text-emerald-900" },
  "NEXT STEPS & ACTIONS": { icon: "⚡", bg: "bg-sky-50", border: "border-sky-200", title: "text-sky-800", text: "text-sky-900" },
  "HISTORIQUE PIPEDRIVE": { icon: "📋", bg: "bg-violet-50", border: "border-violet-200", title: "text-violet-800", text: "text-violet-900" },
};

function SummaryCard({ text, color }: { text: string; color: "purple" | "blue" }) {
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
    return <p className={`text-xs leading-relaxed ${color === "purple" ? "text-purple-900" : "text-blue-900"}`}>{text}</p>;
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

export default function DetailPanel({ personId, allParticipants, dealId, orgId, onActivityCreated }: Props) {
  const [context, setContext] = useState<PersonContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const [emailCount, setEmailCount] = useState<number>(0);
  const [editingEmail, setEditingEmail] = useState(false);
  const [editingPhone, setEditingPhone] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichResult, setEnrichResult] = useState<{ email?: string; phone?: string; job_title?: string; linkedin?: string } | null>(null);
  const [linkedinUrl, setLinkedinUrl] = useState<string | null>(null);
  const [editingLinkedin, setEditingLinkedin] = useState(false);
  const [newLinkedin, setNewLinkedin] = useState("");
  const [showMessagePanel, setShowMessagePanel] = useState(false);

  useEffect(() => {
    const fetchContext = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/context/${personId}`);
        const json = await res.json();
        if (json.error) {
          setError(json.error);
        } else {
          setContext(json.data);
        }
      } catch {
        setError("Impossible de charger le contexte");
      } finally {
        setLoading(false);
      }
    };
    fetchContext();
  }, [personId]);

  const generateUnifiedSummary = async () => {
    if (!context) return;
    setLoadingSummary(true);
    setSummary(null);
    setNoteSaved(false);

    const pEmail = context.person.email?.[0]?.value || "aucun";
    const pPhone = context.person.phone?.[0]?.value || "aucun";

    let contextText = `Contact : ${context.person.name}\n`;
    contextText += `Poste : ${context.person.job_title || "inconnu"}\n`;
    contextText += `Email : ${pEmail}\n`;
    contextText += `Téléphone : ${pPhone}\n`;

    if (context.organization) {
      contextText += `Entreprise : ${context.organization.name}\n`;
    }

    if (context.deals.length > 0) {
      contextText += `\nDeals (${context.deals.length}) :\n`;
      for (const deal of context.deals) {
        contextText += `- ${deal.title} | Pipeline: ${getPipelineName(deal.pipeline_id)} | Étape: ${getStageName(deal.stage_id)} | Statut: ${deal.status} | Valeur: ${deal.value} ${deal.currency}\n`;
      }
    } else {
      contextText += `\nAucun deal associé.\n`;
    }

    if (context.activities.done.length > 0) {
      contextText += `\nActivités terminées (${context.activities.done.length}) :\n`;
      for (const a of context.activities.done.slice(0, 10)) {
        contextText += `- ${a.subject} (${a.due_date})\n`;
      }
    }

    if (context.activities.pending.length > 0) {
      contextText += `\nActivités en attente (${context.activities.pending.length}) :\n`;
      for (const a of context.activities.pending) {
        contextText += `- ${a.subject} (${a.due_date})\n`;
      }
    }

    const allNotes = [...context.notes];
    for (const notes of Object.values(context.dealNotes)) {
      allNotes.push(...notes);
    }
    if (allNotes.length > 0) {
      contextText += `\nNotes (${allNotes.length}) :\n`;
      for (const n of allNotes.slice(0, 10)) {
        const clean = n.content.replace(/<[^>]+>/g, "").substring(0, 300);
        contextText += `- ${clean}\n`;
      }
    } else {
      contextText += `\nAucune note.\n`;
    }

    try {
      const res = await fetch("/api/summary/unified", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pipedriveContext: contextText,
          contactEmail: pEmail !== "aucun" ? pEmail : null,
          contactName: context.person.name,
        }),
      });
      const json = await res.json();
      if (json.data?.summary) {
        setSummary(json.data.summary);
        setEmailCount(json.data.emailCount || 0);
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
    if (!summary || !context) return;
    setSavingNote(true);
    try {
      const today = new Date().toLocaleDateString("fr-FR");
      const noteContent = `<b>📊 Résumé IA du contact — ${today}</b><br><br>${summary.replace(/\n/g, "<br>")}`;
      await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: noteContent,
          person_id: personId,
          ...(dealId && { deal_id: dealId }),
        }),
      });
      setNoteSaved(true);
    } catch {
      alert("Erreur lors de la sauvegarde de la note.");
    } finally {
      setSavingNote(false);
    }
  };

  const primaryEmail = context?.person.email?.[0]?.value;
  const primaryPhone = context?.person.phone?.[0]?.value;
  const pipedrivePersonLink = `https://metagora.pipedrive.com/person/${personId}`;

  const enrichViaDropcontact = async () => {
    if (!context) return;
    setEnriching(true);
    setEnrichResult(null);
    try {
      const nameParts = context.person.name.split(" ");
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";
      const company = context.organization?.name || "";

      const res = await fetch(`/api/enrich/${personId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          full_name: context.person.name,
          company,
          email: primaryEmail || undefined,
        }),
      });
      const json = await res.json();
      if (json.data?.enriched) {
        const e = json.data.enriched;
        setEnrichResult(e);
        // Update local context with new data
        const updated = { ...context };
        if (e.email && !primaryEmail) {
          updated.person = { ...updated.person, email: [{ value: e.email, primary: true }] };
        }
        if (e.phone && !primaryPhone) {
          updated.person = { ...updated.person, phone: [{ value: e.phone, primary: true }] };
        }
        if (e.job_title) {
          updated.person = { ...updated.person, job_title: e.job_title };
        }
        if (e.linkedin) {
          setLinkedinUrl(e.linkedin);
        }
        setContext(updated);
      } else {
        setEnrichResult({});
      }
    } catch (err) {
      console.error("Erreur enrichissement:", err);
      setEnrichResult({});
    } finally {
      setEnriching(false);
    }
  };


  const saveField = async (field: "email" | "phone", value: string) => {
    if (!value.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/persons/${personId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value.trim() }),
      });
      if (res.ok && context) {
        const updated = { ...context };
        if (field === "email") {
          updated.person = { ...updated.person, email: [{ value: value.trim(), primary: true }] };
          setEditingEmail(false);
        } else {
          updated.person = { ...updated.person, phone: [{ value: value.trim(), primary: true }] };
          setEditingPhone(false);
        }
        setContext(updated);
      }
    } catch (err) {
      console.error(`Erreur mise à jour ${field}:`, err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 px-6 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        Chargement du contexte...
      </div>
    );
  }

  if (error) {
    return <div className="py-3 px-6 text-sm text-red-500">{error}</div>;
  }

  if (!context) return null;

  return (
    <div className="bg-gray-50 border-t border-gray-200 px-6 py-4 space-y-4">
      {/* Ligne 1 : Infos contact + Résumés IA */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Contact */}
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5" />
            Contact
            <a
              href={pipedrivePersonLink}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-gray-400 hover:text-indigo-500"
              title="Voir dans Pipedrive"
            >
              <ExternalLink className="w-3 h-3" />
            </a>
          </h4>
          <div className="space-y-1 text-xs text-gray-600">
            <div className="flex items-center gap-1.5">
              <User className="w-3 h-3 text-gray-400" />
              <span className="font-medium">{context.person.name}</span>
              {context.person.job_title && (
                <span className="text-gray-400">({context.person.job_title})</span>
              )}
            </div>
            {primaryEmail ? (
              <div className="flex items-center gap-1.5">
                <Mail className="w-3 h-3 text-gray-400" />
                <a href={`mailto:${primaryEmail}`} className="hover:text-indigo-600">{primaryEmail}</a>
              </div>
            ) : editingEmail ? (
              <div className="flex items-center gap-1">
                <Mail className="w-3 h-3 text-gray-400" />
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="email@exemple.com"
                  className="flex-1 px-2 py-0.5 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 outline-none"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") saveField("email", newEmail); if (e.key === "Escape") setEditingEmail(false); }}
                />
                <button onClick={() => saveField("email", newEmail)} disabled={saving || !newEmail.trim()} className="p-0.5 text-green-600 hover:text-green-700 disabled:opacity-40 cursor-pointer">
                  <Check className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button onClick={() => setEditingEmail(true)} className="flex items-center gap-1 text-indigo-500 hover:text-indigo-700 cursor-pointer">
                <Plus className="w-3 h-3" />
                <span>Ajouter email</span>
              </button>
            )}
            {primaryPhone ? (
              <div className="flex items-center gap-1.5">
                <Phone className="w-3 h-3 text-gray-400" />
                {primaryPhone}
              </div>
            ) : editingPhone ? (
              <div className="flex items-center gap-1">
                <Phone className="w-3 h-3 text-gray-400" />
                <input
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="+33 6 12 34 56 78"
                  className="flex-1 px-2 py-0.5 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 outline-none"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") saveField("phone", newPhone); if (e.key === "Escape") setEditingPhone(false); }}
                />
                <button onClick={() => saveField("phone", newPhone)} disabled={saving || !newPhone.trim()} className="p-0.5 text-green-600 hover:text-green-700 disabled:opacity-40 cursor-pointer">
                  <Check className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button onClick={() => setEditingPhone(true)} className="flex items-center gap-1 text-indigo-500 hover:text-indigo-700 cursor-pointer">
                <Plus className="w-3 h-3" />
                <span>Ajouter téléphone</span>
              </button>
            )}
            {context.organization && (
              <div className="flex items-center gap-1.5">
                <Building2 className="w-3 h-3 text-gray-400" />
                <span className="font-medium">{context.organization.name}</span>
              </div>
            )}
            {linkedinUrl ? (
              <div className="flex items-center gap-1.5">
                <Linkedin className="w-3 h-3 text-blue-500" />
                <a href={linkedinUrl.startsWith("http") ? linkedinUrl : `https://${linkedinUrl}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate">
                  {linkedinUrl.replace("https://www.linkedin.com/in/", "").replace("https://linkedin.com/in/", "").replace(/\/$/, "")}
                </a>
              </div>
            ) : editingLinkedin ? (
              <div className="flex items-center gap-1">
                <Linkedin className="w-3 h-3 text-blue-500" />
                <input
                  type="url"
                  value={newLinkedin}
                  onChange={(e) => setNewLinkedin(e.target.value)}
                  placeholder="https://linkedin.com/in/nom"
                  className="flex-1 px-2 py-0.5 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 outline-none"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newLinkedin.trim()) { setLinkedinUrl(newLinkedin.trim()); setEditingLinkedin(false); }
                    if (e.key === "Escape") setEditingLinkedin(false);
                  }}
                />
                <button
                  onClick={() => { if (newLinkedin.trim()) { setLinkedinUrl(newLinkedin.trim()); setEditingLinkedin(false); } }}
                  disabled={!newLinkedin.trim()}
                  className="p-0.5 text-green-600 hover:text-green-700 disabled:opacity-40 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button onClick={() => setEditingLinkedin(true)} className="flex items-center gap-1 text-blue-500 hover:text-blue-700 cursor-pointer">
                <Plus className="w-3 h-3" />
                <span>Ajouter LinkedIn</span>
              </button>
            )}
            {/* Boutons Enrichir */}
            <div className="pt-1 flex flex-wrap items-center gap-1.5">
              <button
                onClick={enrichViaDropcontact}
                disabled={enriching}
                className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
              >
                {enriching ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Search className="w-3 h-3" />
                )}
                {enriching ? "Recherche..." : "Dropcontact"}
              </button>
              <button
                onClick={() => setShowMessagePanel(!showMessagePanel)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-medium rounded-md cursor-pointer transition-colors",
                  showMessagePanel
                    ? "bg-indigo-700 text-white"
                    : "bg-indigo-600 text-white hover:bg-indigo-700"
                )}
              >
                <MessageSquare className="w-3 h-3" />
                Message
              </button>
            </div>
            {/* Résultats enrichissement Dropcontact */}
            {enrichResult && Object.keys(enrichResult).length === 0 && (
              <p className="text-[10px] text-gray-400 mt-1">Dropcontact : aucun résultat</p>
            )}
            {enrichResult && Object.keys(enrichResult).length > 0 && (
              <p className="text-[10px] text-green-600 mt-1">
                Enrichi : {[enrichResult.email && "email", enrichResult.phone && "tél", enrichResult.job_title && "poste", enrichResult.linkedin && "LinkedIn"].filter(Boolean).join(", ")}
              </p>
            )}
          </div>
        </div>

      </div>

      {/* Message Panel */}
      {showMessagePanel && (
        <MessagePanel
          personId={personId}
          contactName={context.person.name}
          contactCompany={context.organization?.name}
          contactPhone={primaryPhone}
          contactEmail={primaryEmail}
          allParticipants={allParticipants}
          dealId={dealId}
          orgId={orgId}
          onClose={() => setShowMessagePanel(false)}
          onActivityCreated={onActivityCreated}
        />
      )}
    </div>
  );
}
