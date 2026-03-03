"use client";

import { useState, useEffect } from "react";
import {
  MessageSquare,
  Send,
  Sparkles,
  Loader2,
  ChevronDown,
  Mail,
  Phone,
  X,
  Users,
  CheckCircle2,
  Clock,
} from "lucide-react";

interface Template {
  id: number;
  poste: string;
  entreprise: string;
  niveau_lead: string;
  type: string;
  etape: string;
  message: string;
}

interface Participant {
  id: number;
  name: string;
  email: { value: string; primary: boolean }[];
  phone: { value: string; primary: boolean }[];
  job_title?: string;
  primary: boolean;
}

interface MessagePanelProps {
  personId: number;
  contactName: string;
  contactCompany?: string;
  contactPhone?: string;
  contactEmail?: string;
  allParticipants?: Participant[];
  dealId?: number;
  orgId?: number | null;
  onClose: () => void;
  onActivityCreated?: () => void;
}

type Step = "draft" | "sent" | "validated";

export default function MessagePanel({
  personId,
  contactName,
  contactCompany,
  contactPhone,
  contactEmail,
  allParticipants,
  dealId,
  orgId,
  onClose,
  onActivityCreated,
}: MessagePanelProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [rewriting, setRewriting] = useState(false);
  const [channel, setChannel] = useState<"whatsapp" | "email">("whatsapp");
  const [step, setStep] = useState<Step>("draft");
  const [validating, setValidating] = useState(false);

  // Derive main contact first name and CC emails from participants
  const mainFirstName = contactName.split(" ")[0] || "";
  const otherParticipants = allParticipants?.filter((p) => p.id !== personId) || [];
  const ccEmails = otherParticipants
    .map((p) => p.email?.[0]?.value)
    .filter(Boolean) as string[];

  // Fetch templates on mount
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const res = await fetch("/api/templates");
        const json = await res.json();
        setTemplates(json.data || []);
      } catch (err) {
        console.error("Erreur chargement templates:", err);
      } finally {
        setLoadingTemplates(false);
      }
    };
    fetchTemplates();
  }, []);

  // Auto-filter templates based on selected channel
  const filteredTemplates = templates.filter((t) =>
    channel === "whatsapp" ? t.type === "sms" : t.type === "mail"
  );

  const selectTemplate = (t: Template) => {
    setSelectedTemplate(t);
    setChannel(t.type === "sms" ? "whatsapp" : "email");
    let msg = t.message;
    msg = msg.replace(/\{\{prénom\}\}/g, mainFirstName || "");
    msg = msg.replace(/\{\{entreprise\}\}/g, contactCompany || "");
    setMessageText(msg);
    setShowTemplateDropdown(false);
  };

  const rewriteWithAI = async () => {
    if (!aiPrompt.trim() || !messageText.trim()) return;
    setRewriting(true);
    try {
      const res = await fetch("/api/rewrite-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: messageText,
          prompt: aiPrompt,
          contactName,
          contactCompany,
        }),
      });
      const json = await res.json();
      if (json.data?.message) {
        setMessageText(json.data.message);
        setAiPrompt("");
      }
    } catch (err) {
      console.error("Erreur réécriture IA:", err);
    } finally {
      setRewriting(false);
    }
  };

  // Step 1: Open Gmail/WhatsApp with the message → move to "sent" step
  const openMessage = () => {
    if (!messageText.trim()) return;

    if (channel === "whatsapp") {
      // Copy message to clipboard for WhatsApp
      navigator.clipboard.writeText(messageText);
    } else {
      if (!contactEmail) {
        alert("Aucune adresse email disponible pour ce contact");
        return;
      }
      const to = encodeURIComponent(contactEmail);
      const cc = ccEmails.length > 0 ? `&cc=${encodeURIComponent(ccEmails.join(","))}` : "";
      const subject = encodeURIComponent(selectedTemplate?.etape || "Metagora");
      const body = encodeURIComponent(messageText);
      window.open(`https://mail.google.com/mail/?view=cm&to=${to}${cc}&su=${subject}&body=${body}`, "_blank");
    }

    setStep("sent");
  };

  // Step 2: Validate activity in Pipedrive (create + mark done)
  const validateActivity = async () => {
    setValidating(true);
    try {
      const activitySubject = channel === "whatsapp"
        ? `WhatsApp envoyé à ${contactName}${selectedTemplate ? ` — ${selectedTemplate.etape}` : ""}`
        : `Email envoyé à ${contactName}${selectedTemplate ? ` — ${selectedTemplate.etape}` : ""}`;
      const createRes = await fetch("/api/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: activitySubject,
          type: channel === "whatsapp" ? "sms" : "email",
          due_date: new Date().toISOString().split("T")[0],
          deal_id: dealId || undefined,
          person_id: personId,
          org_id: orgId || undefined,
          note: messageText.slice(0, 500),
        }),
      });
      const createJson = await createRes.json();
      const activityId = createJson.data?.id;
      if (activityId) {
        await fetch(`/api/activities/${activityId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ done: 1 }),
        });
      }
      setStep("validated");
      onActivityCreated?.();
    } catch (err) {
      console.error("Erreur création activité:", err);
      alert("Erreur lors de la création de l'activité Pipedrive");
    } finally {
      setValidating(false);
    }
  };

  // Reset to draft for another message
  const resetDraft = () => {
    setStep("draft");
    setMessageText("");
    setSelectedTemplate(null);
  };

  return (
    <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-indigo-800 flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Message à {mainFirstName}
          </h3>
          {otherParticipants.length > 0 && (
            <p className="text-[10px] text-indigo-500 mt-0.5 flex items-center gap-1">
              <Users className="w-3 h-3" />
              CC : {otherParticipants.map((p) => p.name).join(", ")}
            </p>
          )}
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ─── STEP: VALIDATED ─── */}
      {step === "validated" && (
        <div className="space-y-3">
          <div className="rounded-lg bg-green-50 border border-green-200 p-4 flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-800">Activité validée dans Pipedrive</p>
              <p className="text-xs text-green-600 mt-0.5">
                {channel === "whatsapp" ? "WhatsApp" : "Email"} envoyé à {contactName}
                {selectedTemplate ? ` — ${selectedTemplate.etape}` : ""} — {new Date().toLocaleDateString("fr-FR")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={resetDraft}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-100 rounded-lg hover:bg-indigo-200 transition-colors cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Nouveau message
            </button>
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer"
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* ─── STEP: SENT (waiting for validation) ─── */}
      {step === "sent" && (
        <div className="space-y-3">
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-amber-600" />
              <p className="text-sm font-semibold text-amber-800">
                {channel === "whatsapp" ? "Message copié — colle-le dans WhatsApp" : "Email ouvert dans Gmail"}
              </p>
            </div>
            <p className="text-xs text-amber-700">
              {channel === "whatsapp"
                ? "Ouvre WhatsApp, colle le message (Ctrl+V) et envoie-le. Puis valide ci-dessous."
                : "Une fois le message envoyé dans Gmail, clique ci-dessous pour enregistrer l'activité dans Pipedrive."}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={validateActivity}
              disabled={validating}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors cursor-pointer shadow-sm"
            >
              {validating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              {validating ? "Validation..." : `Valider : ${channel === "whatsapp" ? "WhatsApp" : "Email"} envoyé`}
            </button>
            <button
              onClick={() => setStep("draft")}
              className="px-3 py-2.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer"
            >
              Retour
            </button>
          </div>

          <button
            onClick={openMessage}
            className="w-full text-center text-[10px] text-indigo-500 hover:text-indigo-700 cursor-pointer py-1"
          >
            {channel === "whatsapp" ? "Recopier le message" : "Rouvrir Gmail avec le message"}
          </button>
        </div>
      )}

      {/* ─── STEP: DRAFT (editing) ─── */}
      {step === "draft" && (
        <>
          {/* Channel selector */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setChannel("whatsapp")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                channel === "whatsapp"
                  ? "bg-green-600 text-white"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
              }`}
            >
              <Phone className="w-3.5 h-3.5" />
              WhatsApp
            </button>
            <button
              onClick={() => setChannel("email")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                channel === "email"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              Email (Gmail)
            </button>
          </div>

          {/* Template selector */}
          <div className="relative">
            <button
              onClick={() => setShowTemplateDropdown(!showTemplateDropdown)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <span className="text-gray-700">
                {selectedTemplate
                  ? `${selectedTemplate.etape} — ${selectedTemplate.entreprise} (${selectedTemplate.type})`
                  : "Choisir un template..."}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            </button>

            {showTemplateDropdown && (
              <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                {loadingTemplates ? (
                  <div className="p-4 flex items-center justify-center">
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                  </div>
                ) : filteredTemplates.length === 0 ? (
                  <p className="p-3 text-xs text-gray-400">Aucun template</p>
                ) : (
                  filteredTemplates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => selectTemplate(t)}
                      className="w-full text-left px-3 py-2 hover:bg-indigo-50 transition-colors cursor-pointer border-b border-gray-50 last:border-b-0"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${
                            t.type === "mail"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-green-100 text-green-700"
                          }`}
                        >
                          {t.type === "mail" ? "EMAIL" : "SMS"}
                        </span>
                        <span className="text-xs font-medium text-gray-800">{t.etape}</span>
                      </div>
                      <p className="text-[10px] text-gray-500 mt-0.5 truncate">
                        {t.entreprise} — {t.poste}
                      </p>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Message editor */}
          <textarea
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder="Sélectionnez un template ou rédigez votre message..."
            rows={8}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-y focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
          />

          {/* AI rewrite */}
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <input
                type="text"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    rewriteWithAI();
                  }
                }}
                placeholder="Ex: Raccourcis le message, tutoie, mentionne la démo de mardi..."
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-300 pr-8"
                disabled={rewriting || !messageText.trim()}
              />
              <Sparkles className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-purple-400" />
            </div>
            <button
              onClick={rewriteWithAI}
              disabled={rewriting || !aiPrompt.trim() || !messageText.trim()}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
            >
              {rewriting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              {rewriting ? "Réécriture..." : "Modifier avec IA"}
            </button>
          </div>

          {/* Send buttons */}
          <div className="flex items-center justify-between pt-2 border-t border-indigo-100">
            <p className="text-[10px] text-gray-500">
              {channel === "whatsapp"
                ? `Copie le message dans le presse-papier`
                : `Ouvre Gmail avec l'email pré-rempli${ccEmails.length > 0 ? ` + ${ccEmails.length} CC` : ""}`}
            </p>
            <button
              onClick={openMessage}
              disabled={!messageText.trim()}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors cursor-pointer disabled:opacity-50 shadow-sm ${
                channel === "whatsapp"
                  ? "bg-green-600 hover:bg-green-700"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              <Send className="w-4 h-4" />
              {channel === "whatsapp" ? "Copier le message" : "Ouvrir Gmail"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
