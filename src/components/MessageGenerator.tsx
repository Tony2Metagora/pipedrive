"use client";

import { useState } from "react";
import { X, Sparkles, Copy, Check, ExternalLink, Send, Loader2 } from "lucide-react";
import { getTemplatesByType, type MessageTemplate } from "@/lib/templates";

interface Contact {
  name: string;
  company?: string;
  jobTitle?: string;
  email?: string;
  phone?: string;
  stage?: string;
  pipeline?: string;
}

interface Props {
  type: "email" | "sms";
  dealId: number;
  contact: Contact;
  onClose: () => void;
}

export default function MessageGenerator({ type, dealId, contact, onClose }: Props) {
  const templates = getTemplatesByType(type);
  const [selectedTemplate, setSelectedTemplate] = useState<MessageTemplate | null>(
    templates[0] || null
  );
  const [content, setContent] = useState(selectedTemplate?.content || "");
  const [userPrompt, setUserPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [markingSent, setMarkingSent] = useState(false);
  const [sent, setSent] = useState(false);

  const handleTemplateChange = (templateId: string) => {
    const t = templates.find((t) => t.id === templateId);
    if (t) {
      setSelectedTemplate(t);
      setContent(t.content);
    }
  };

  const handleGenerate = async () => {
    if (!selectedTemplate) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          template: content,
          contact: {
            name: contact.name,
            company: contact.company,
            jobTitle: contact.jobTitle,
            stage: contact.stage,
            pipeline: contact.pipeline,
          },
          userPrompt: userPrompt || undefined,
        }),
      });
      const json = await res.json();
      if (json.data?.text) {
        setContent(json.data.text);
      } else if (json.error) {
        alert("Erreur IA : " + json.error);
      }
    } catch (err) {
      console.error("Erreur génération:", err);
      alert("Erreur de connexion à l'IA");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement("textarea");
      textarea.value = content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleMarkSent = async () => {
    setMarkingSent(true);
    try {
      const subjectPrefix = type === "email" ? "Email envoyé" : "SMS envoyé";
      const preview = content.substring(0, 80).replace(/\n/g, " ");

      await fetch("/api/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: `${subjectPrefix} – ${preview}...`,
          type: "task",
          due_date: new Date().toISOString().split("T")[0],
          deal_id: dealId,
          note: content,
          done: true,
        }),
      });

      setSent(true);
    } catch (err) {
      console.error("Erreur marquage envoi:", err);
    } finally {
      setMarkingSent(false);
    }
  };

  const openDealPage = () => {
    handleCopy();
    window.open(`/deal/${dealId}`, "_blank");
  };

  const isEmail = type === "email";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className={`flex items-center justify-between p-5 border-b ${
          isEmail ? "bg-indigo-50 border-indigo-100" : "bg-emerald-50 border-emerald-100"
        }`}>
          <h2 className={`text-lg font-semibold ${
            isEmail ? "text-indigo-900" : "text-emerald-900"
          }`}>
            {isEmail ? "Générer un email" : "Générer un SMS / WhatsApp"}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-white/60 hover:text-gray-600 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contact info bar */}
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 text-sm text-gray-600">
          <span className="font-medium">{contact.name}</span>
          {contact.company && <span> · {contact.company}</span>}
          {contact.jobTitle && <span> · {contact.jobTitle}</span>}
        </div>

        <div className="p-5 space-y-4">
          {/* Sélection template */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Template
            </label>
            <select
              value={selectedTemplate?.id || ""}
              onChange={(e) => handleTemplateChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {selectedTemplate?.context && (
              <p className="text-xs text-gray-400 mt-1">
                {selectedTemplate.context}
              </p>
            )}
          </div>

          {/* Zone de texte du message */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contenu du message
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={10}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-y font-mono"
            />
          </div>

          {/* Prompt IA */}
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
            <label className="block text-sm font-medium text-purple-800 mb-2 flex items-center gap-1">
              <Sparkles className="w-4 h-4" />
              Prompt IA (optionnel)
            </label>
            <input
              type="text"
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              placeholder="Ex : passe en vouvoiement, raccourcis le message, oriente sur le ROI..."
              className="w-full px-3 py-2 border border-purple-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 outline-none bg-white"
            />
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="mt-3 flex items-center gap-2 px-4 py-2 text-sm text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 cursor-pointer"
            >
              {generating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {generating ? "Génération en cours..." : "Générer avec l'IA"}
            </button>
          </div>

          {/* Actions */}
          {!sent ? (
            <div className="flex items-center gap-2 pt-2">
              {/* Copier */}
              <button
                onClick={handleCopy}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
                {copied ? "Copié !" : "Copier"}
              </button>

              {/* Copier + ouvrir fiche */}
              {isEmail && (
                <button
                  onClick={openDealPage}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 cursor-pointer"
                >
                  <ExternalLink className="w-4 h-4" />
                  Copier & ouvrir fiche
                </button>
              )}

              {/* Marquer comme envoyé */}
              <button
                onClick={handleMarkSent}
                disabled={markingSent}
                className={`flex items-center gap-2 px-4 py-2 text-sm text-white rounded-lg cursor-pointer disabled:opacity-50 ${
                  isEmail
                    ? "bg-green-600 hover:bg-green-700"
                    : "bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                {markingSent ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {isEmail ? "Email envoyé" : "SMS envoyé"}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700">
              <Check className="w-5 h-5" />
              <span className="text-sm font-medium">
                {isEmail ? "Email" : "SMS"} marqué comme envoyé — activité créée dans Pipedrive
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
