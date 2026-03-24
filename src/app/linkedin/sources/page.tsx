"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  FileUp, Trash2, Loader2, FileText, Calendar, X,
  Globe, Link2, Pencil, Check, MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";

const THEMES = [
  { key: "journal-ceo", emoji: "📓", name: "Journal d'un CEO" },
  { key: "ia-formation", emoji: "🧠", name: "L'IA dans la formation" },
  { key: "ia-operationnelle", emoji: "⚡", name: "L'IA opérationnelle" },
  { key: "evenement", emoji: "🎤", name: "Événement" },
];

interface SourceItem {
  id: string;
  name: string;
  size: number;
  textLength: number;
  preview: string;
  sourceType: "file" | "web";
  url?: string;
  theme?: string;
  comment?: string;
  createdAt: string;
}

export default function LinkedInSourcesPage() {
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Add web link form
  const [showWebForm, setShowWebForm] = useState(false);
  const [webUrl, setWebUrl] = useState("");
  const [webTheme, setWebTheme] = useState("");
  const [webComment, setWebComment] = useState("");
  const [webLoading, setWebLoading] = useState(false);

  // Add file form
  const [showFileForm, setShowFileForm] = useState(false);
  const [fileTheme, setFileTheme] = useState("");
  const [fileComment, setFileComment] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Inline editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTheme, setEditTheme] = useState("");
  const [editComment, setEditComment] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const loadSources = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/linkedin/files");
      const json = await res.json();
      setSources(json.data || []);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSources(); }, [loadSources]);

  // ── Add web link ──────────────────────────────────────

  const handleAddWebLink = async () => {
    if (!webUrl.trim()) return;
    setWebLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/linkedin/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: webUrl,
          theme: webTheme || undefined,
          comment: webComment || undefined,
        }),
      });
      const json = await res.json();
      if (json.error) { setError(json.error); return; }
      setWebUrl("");
      setWebTheme("");
      setWebComment("");
      setShowWebForm(false);
      await loadSources();
    } catch (err) { setError(String(err)); }
    finally { setWebLoading(false); }
  };

  // ── Upload file ───────────────────────────────────────

  const handleUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (fileTheme) formData.append("theme", fileTheme);
      if (fileComment) formData.append("comment", fileComment);
      const res = await fetch("/api/linkedin/files", { method: "POST", body: formData });
      const json = await res.json();
      if (json.error) { setError(json.error); return; }
      setFileTheme("");
      setFileComment("");
      setShowFileForm(false);
      await loadSources();
    } catch (err) { setError(String(err)); }
    finally { setUploading(false); }
  };

  // ── Update theme / comment ────────────────────────────

  const handleSaveEdit = async (id: string) => {
    setEditSaving(true);
    try {
      await fetch("/api/linkedin/files", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, theme: editTheme || "", comment: editComment || "" }),
      });
      setEditingId(null);
      await loadSources();
    } catch (err) { setError(String(err)); }
    finally { setEditSaving(false); }
  };

  // ── Delete ────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer cette source ?")) return;
    setDeletingId(id);
    try {
      await fetch("/api/linkedin/files", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      await loadSources();
    } catch (err) { setError(String(err)); }
    finally { setDeletingId(null); }
  };

  // ── Helpers ───────────────────────────────────────────

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch { return iso; }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getThemeLabel = (key?: string) => {
    if (!key) return null;
    const t = THEMES.find((t) => t.key === key);
    return t ? `${t.emoji} ${t.name}` : null;
  };

  // ── Theme dropdown component ──────────────────────────

  const ThemeSelect = ({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn("px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-violet-300 outline-none", className)}
    >
      <option value="">— Aucun thème —</option>
      {THEMES.map((t) => (
        <option key={t.key} value={t.key}>{t.emoji} {t.name}</option>
      ))}
    </select>
  );

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Sources LinkedIn</h1>
          <p className="text-sm text-gray-500 mt-0.5">Fichiers et liens web pour générer des idées de posts</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowWebForm(!showWebForm); setShowFileForm(false); }}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl cursor-pointer transition-colors shadow-sm",
              showWebForm ? "bg-blue-100 text-blue-700" : "bg-blue-600 text-white hover:bg-blue-700"
            )}
          >
            <Globe className="w-4 h-4" />
            Lien web
          </button>
          <button
            onClick={() => { setShowFileForm(!showFileForm); setShowWebForm(false); }}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl cursor-pointer transition-colors shadow-sm",
              showFileForm ? "bg-violet-100 text-violet-700" : "bg-violet-600 text-white hover:bg-violet-700"
            )}
          >
            <FileUp className="w-4 h-4" />
            Fichier
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 mb-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <X className="w-4 h-4 flex-shrink-0 cursor-pointer hover:text-red-900" onClick={() => setError(null)} />
          {error}
        </div>
      )}

      {/* ── Add web link form ──────────────────────────── */}
      {showWebForm && (
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-4 mb-4 space-y-3">
          <h3 className="text-sm font-semibold text-blue-800 flex items-center gap-2">
            <Link2 className="w-4 h-4" />
            Ajouter un lien web
          </h3>
          <input
            type="url"
            value={webUrl}
            onChange={(e) => setWebUrl(e.target.value)}
            placeholder="https://www.exemple.com/article..."
            className="w-full px-3 py-2 text-sm border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-300 outline-none bg-white"
            autoFocus
          />
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-blue-600 font-medium mb-1 block">Thème</label>
              <ThemeSelect value={webTheme} onChange={setWebTheme} />
            </div>
            <div className="flex-[2]">
              <label className="text-xs text-blue-600 font-medium mb-1 block">Commentaire</label>
              <input
                type="text"
                value={webComment}
                onChange={(e) => setWebComment(e.target.value)}
                placeholder="Notes, contexte, pourquoi cette source..."
                className="w-full px-3 py-1.5 text-sm border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-300 outline-none bg-white"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowWebForm(false)}
              className="px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
            >
              Annuler
            </button>
            <button
              onClick={handleAddWebLink}
              disabled={!webUrl.trim() || webLoading}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
            >
              {webLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
              {webLoading ? "Extraction en cours…" : "Ajouter la source"}
            </button>
          </div>
        </div>
      )}

      {/* ── Add file form ──────────────────────────────── */}
      {showFileForm && (
        <div className="bg-violet-50 rounded-xl border border-violet-200 p-4 mb-4 space-y-3">
          <h3 className="text-sm font-semibold text-violet-800 flex items-center gap-2">
            <FileUp className="w-4 h-4" />
            Uploader un fichier
          </h3>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-violet-600 font-medium mb-1 block">Thème</label>
              <ThemeSelect value={fileTheme} onChange={setFileTheme} />
            </div>
            <div className="flex-[2]">
              <label className="text-xs text-violet-600 font-medium mb-1 block">Commentaire</label>
              <input
                type="text"
                value={fileComment}
                onChange={(e) => setFileComment(e.target.value)}
                placeholder="Notes, contexte, pourquoi cette source..."
                className="w-full px-3 py-1.5 text-sm border border-violet-200 rounded-lg focus:ring-2 focus:ring-violet-300 outline-none bg-white"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowFileForm(false)}
              className="px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
            >
              Annuler
            </button>
            <label className={cn(
              "flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg cursor-pointer",
              uploading ? "bg-gray-200 text-gray-400" : "text-white bg-violet-600 hover:bg-violet-700"
            )}>
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
              {uploading ? "Upload en cours…" : "Choisir un fichier"}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.md,.markdown,.docx"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </div>
      )}

      {/* ── Sources list ──────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Chargement des sources…</span>
        </div>
      ) : sources.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-300">
          <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500 font-medium">Aucune source</p>
          <p className="text-xs text-gray-400 mt-1">Ajoute un lien web ou un fichier pour commencer</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sources.map((s) => (
            <div key={s.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-300 transition-colors group">
              <div className="flex items-start gap-3">
                {/* Icon */}
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
                  s.sourceType === "web" ? "bg-blue-50" : "bg-violet-50"
                )}>
                  {s.sourceType === "web"
                    ? <Globe className="w-5 h-5 text-blue-500" />
                    : <FileText className="w-5 h-5 text-violet-500" />
                  }
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-gray-800 truncate max-w-[300px]">{s.name}</h3>
                    <span className={cn(
                      "text-[10px] px-2 py-0.5 rounded-full font-medium",
                      s.sourceType === "web" ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-500"
                    )}>
                      {s.sourceType === "web" ? "🌐 Web" : formatSize(s.size)}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 font-medium">
                      {s.textLength.toLocaleString()} car.
                    </span>
                    {/* Theme badge */}
                    {getThemeLabel(s.theme) && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">
                        {getThemeLabel(s.theme)}
                      </span>
                    )}
                  </div>

                  {/* URL for web sources */}
                  {s.url && (
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-500 hover:underline truncate block mt-0.5 max-w-[400px]">
                      {s.url}
                    </a>
                  )}

                  <div className="flex items-center gap-1.5 mt-1 text-[10px] text-gray-400">
                    <Calendar className="w-3 h-3" />
                    {formatDate(s.createdAt)}
                  </div>

                  {/* Comment */}
                  {s.comment && editingId !== s.id && (
                    <div className="flex items-start gap-1.5 mt-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-2.5 py-1.5">
                      <MessageSquare className="w-3 h-3 mt-0.5 flex-shrink-0 text-gray-400" />
                      <span>{s.comment}</span>
                    </div>
                  )}

                  {/* Preview (if no comment shown) */}
                  {!s.comment && s.preview && editingId !== s.id && (
                    <p className="mt-2 text-xs text-gray-500 line-clamp-2 leading-relaxed">{s.preview}…</p>
                  )}

                  {/* Inline edit form */}
                  {editingId === s.id && (
                    <div className="mt-3 space-y-2 bg-gray-50 rounded-lg p-3">
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <label className="text-[10px] text-gray-500 font-medium mb-0.5 block">Thème</label>
                          <ThemeSelect value={editTheme} onChange={setEditTheme} className="w-full" />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500 font-medium mb-0.5 block">Commentaire</label>
                        <input
                          type="text"
                          value={editComment}
                          onChange={(e) => setEditComment(e.target.value)}
                          placeholder="Notes, contexte..."
                          className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-violet-300 outline-none"
                          autoFocus
                        />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setEditingId(null)} className="px-3 py-1 text-xs text-gray-500 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                          Annuler
                        </button>
                        <button
                          onClick={() => handleSaveEdit(s.id)}
                          disabled={editSaving}
                          className="flex items-center gap-1 px-3 py-1 text-xs font-semibold text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 cursor-pointer"
                        >
                          {editSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          Enregistrer
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all">
                  {editingId !== s.id && (
                    <button
                      onClick={() => {
                        setEditingId(s.id);
                        setEditTheme(s.theme || "");
                        setEditComment(s.comment || "");
                      }}
                      className="p-2 text-gray-300 hover:text-violet-500 cursor-pointer"
                      title="Modifier thème / commentaire"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(s.id)}
                    disabled={deletingId === s.id}
                    className="p-2 text-gray-300 hover:text-red-500 cursor-pointer disabled:opacity-50"
                    title="Supprimer"
                  >
                    {deletingId === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-gray-400 mt-6 text-center">
        Formats fichiers : PDF, TXT, MD, DOCX (max 5MB). Liens web : toute URL publique.
      </p>
    </div>
  );
}
