"use client";

import { useState, useEffect, useCallback } from "react";
import { FileUp, Trash2, Loader2, FileText, Calendar, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileItem {
  id: string;
  name: string;
  size: number;
  textLength: number;
  preview: string;
  createdAt: string;
}

export default function LinkedInSourcesPage() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/linkedin/files");
      const json = await res.json();
      setFiles(json.data || []);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/linkedin/files", { method: "POST", body: formData });
      const json = await res.json();
      if (json.error) { setError(json.error); return; }
      await loadFiles();
    } catch (err) { setError(String(err)); }
    finally { setUploading(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer ce fichier ?")) return;
    setDeletingId(id);
    try {
      await fetch("/api/linkedin/files", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      await loadFiles();
    } catch (err) { setError(String(err)); }
    finally { setDeletingId(null); }
  };

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

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Sources LinkedIn</h1>
          <p className="text-sm text-gray-500 mt-0.5">Fichiers uploadés pour générer des idées de posts</p>
        </div>
        <label className={cn(
          "flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl cursor-pointer transition-colors shadow-sm",
          uploading ? "bg-gray-100 text-gray-400" : "bg-violet-600 text-white hover:bg-violet-700"
        )}>
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
          {uploading ? "Upload en cours…" : "Uploader un fichier"}
          <input
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

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 mb-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <X className="w-4 h-4 flex-shrink-0 cursor-pointer hover:text-red-900" onClick={() => setError(null)} />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Chargement des fichiers…</span>
        </div>
      ) : files.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-300">
          <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500 font-medium">Aucun fichier source</p>
          <p className="text-xs text-gray-400 mt-1">Uploade un PDF, TXT, MD ou DOCX pour commencer</p>
        </div>
      ) : (
        <div className="space-y-3">
          {files.map((f) => (
            <div key={f.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-300 transition-colors group">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-violet-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-gray-800 truncate">{f.name}</h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
                      {formatSize(f.size)}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 font-medium">
                      {f.textLength.toLocaleString()} car.
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 text-[10px] text-gray-400">
                    <Calendar className="w-3 h-3" />
                    {formatDate(f.createdAt)}
                  </div>
                  {f.preview && (
                    <p className="mt-2 text-xs text-gray-500 line-clamp-2 leading-relaxed">{f.preview}…</p>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(f.id)}
                  disabled={deletingId === f.id}
                  className="flex-shrink-0 p-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all cursor-pointer disabled:opacity-50"
                  title="Supprimer"
                >
                  {deletingId === f.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-gray-400 mt-6 text-center">
        Formats supportés : PDF, TXT, MD, DOCX — Max 5MB (~50 pages). Les fichiers sont stockés avec leur texte extrait pour l&apos;analyse IA.
      </p>
    </div>
  );
}
