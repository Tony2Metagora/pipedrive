"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Sparkles, Loader2, Copy, Check, RefreshCw, Send,
  ImageIcon, Search, Download, ChevronRight,
  CheckCircle2, Calendar, Clock,
  MessageSquare, FileUp, X, Pencil, Save,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ── tiny elapsed-seconds hook ─────────────────────────── */
function useElapsedTimer(active: boolean) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!active) { setElapsed(0); return; }
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 500);
    return () => clearInterval(id);
  }, [active]);
  return elapsed;
}

/* ── theme list ────────────────────────────────────────── */
const THEMES = [
  { key: "journal-ceo", emoji: "📓", name: "Journal d'un CEO", description: "Rencontres, bonnes pratiques, anecdotes business" },
  { key: "ia-formation", emoji: "🧠", name: "L'IA dans la formation", description: "IA & formation retail/luxe, Simsell, upskilling" },
  { key: "ia-operationnelle", emoji: "⚡", name: "L'IA opérationnelle", description: "IA concrète sur le terrain, ROI, cas d'usage" },
  { key: "evenement", emoji: "🎤", name: "Événement", description: "Salons, conférences, rencontres terrain" },
];

type FileItem = { id: string; name: string; size: number; textLength: number; createdAt: string };

export default function LinkedInGenerator({ onPostValidated }: { onPostValidated?: () => void }) {
  // Step 1: Mode
  type Mode = "chatgpt" | "file";
  const [mode, setMode] = useState<Mode>("chatgpt");
  const [promptInput, setPromptInput] = useState("");
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [fileAdditionalPrompt, setFileAdditionalPrompt] = useState("");
  const [uploading, setUploading] = useState(false);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2: Ideas
  const [ideas, setIdeas] = useState<string[]>([]);
  const [ideasLoading, setIdeasLoading] = useState(false);
  const [selectedIdeaIdx, setSelectedIdeaIdx] = useState<number | null>(null);

  // Idea edit popup
  const [editingIdeaIdx, setEditingIdeaIdx] = useState<number | null>(null);
  const [ideaEditPrompt, setIdeaEditPrompt] = useState("");
  const [ideaEditReason, setIdeaEditReason] = useState("");
  const [ideaEditLoading, setIdeaEditLoading] = useState(false);

  // Step 3: Theme selection (after idea is chosen)
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);

  // Post generation
  const [generatedPost, setGeneratedPost] = useState("");
  const [generateLoading, setGenerateLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [imagePrompt, setImagePrompt] = useState("");

  // Post manual edit mode
  const [editMode, setEditMode] = useState(false);
  const [editedPost, setEditedPost] = useState("");

  // Save post popup (learning)
  const [showSavePopup, setShowSavePopup] = useState(false);
  const [saveReason, setSaveReason] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);

  // Refine
  const [refineInstructions, setRefineInstructions] = useState("");
  const [refineLoading, setRefineLoading] = useState(false);

  // Image search
  const [imageQuery, setImageQuery] = useState("");
  const [imageResults, setImageResults] = useState<{ url: string; thumb: string; alt: string; photographer: string; link: string }[]>([]);
  const [imageLoading, setImageLoading] = useState(false);

  // Validate / schedule
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [scheduleLoading, setScheduleLoading] = useState(false);

  // Error
  const [error, setError] = useState<string | null>(null);

  // ─── Progress helpers ──────────────────────────────────

  const getGeneratePhase = (elapsed: number) => {
    if (elapsed < 3) return "Préparation du prompt…";
    if (elapsed < 8) return "Rédaction du post…";
    if (elapsed < 15) return "Structuration & finalisation…";
    return "Finalisation…";
  };

  const getIdeasPhase = (elapsed: number) => {
    if (elapsed < 3) return "Analyse du contenu…";
    if (elapsed < 8) return "Extraction des insights…";
    if (elapsed < 15) return "Création des idées…";
    return "Finalisation…";
  };

  const generateElapsed = useElapsedTimer(generateLoading);
  const ideasElapsed = useElapsedTimer(ideasLoading);
  const refineElapsed = useElapsedTimer(refineLoading);

  // ─── Load files when file mode activated ───────────────

  const loadFiles = useCallback(async () => {
    setFilesLoading(true);
    try {
      const res = await fetch("/api/linkedin/files");
      const json = await res.json();
      setFiles(json.data || []);
    } catch { /* ignore */ }
    finally { setFilesLoading(false); }
  }, []);

  useEffect(() => {
    if (mode === "file") loadFiles();
  }, [mode, loadFiles]);

  // ─── File upload handler ───────────────────────────────

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/linkedin/files", { method: "POST", body: form });
      const json = await res.json();
      if (json.error) { setError(json.error); return; }
      await loadFiles();
      setSelectedFileId(json.data?.id || null);
    } catch (err) { setError(String(err)); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  };

  // ─── Generate ideas ────────────────────────────────────

  const handleGenerateIdeas = async () => {
    setIdeasLoading(true);
    setIdeas([]);
    setSelectedIdeaIdx(null);
    setGeneratedPost("");
    setError(null);

    try {
      let res: Response;
      if (mode === "chatgpt") {
        if (!promptInput.trim()) { setError("Entre un prompt"); setIdeasLoading(false); return; }
        res = await fetch("/api/linkedin/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "prompt-ideas", prompt: promptInput }),
        });
      } else {
        if (!selectedFileId) { setError("Sélectionne un fichier"); setIdeasLoading(false); return; }
        res = await fetch("/api/linkedin/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "file-ideas", fileId: selectedFileId, additionalPrompt: fileAdditionalPrompt || undefined }),
        });
      }
      const json = await res.json();
      if (json.error) { setError(json.error); return; }
      setIdeas(json.data?.ideas || []);
    } catch (err) { setError(String(err)); }
    finally { setIdeasLoading(false); }
  };

  // ─── Edit idea via AI ──────────────────────────────────

  const handleEditIdea = async () => {
    if (editingIdeaIdx === null || !ideaEditPrompt.trim()) return;
    setIdeaEditLoading(true);
    setError(null);
    try {
      // 1. Ask AI to refine the idea
      const res = await fetch("/api/linkedin/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "refine-idea",
          idea: ideas[editingIdeaIdx],
          instructions: ideaEditPrompt,
        }),
      });
      const json = await res.json();
      if (json.error) { setError(json.error); return; }

      const newIdea = json.data?.idea || ideas[editingIdeaIdx];

      // 2. Save learning if reason provided
      if (ideaEditReason.trim()) {
        await fetch("/api/linkedin/learnings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "idea-edit",
            before: ideas[editingIdeaIdx],
            after: newIdea,
            reason: ideaEditReason,
          }),
        });
      }

      // 3. Update idea in list
      setIdeas(prev => prev.map((idea, i) => i === editingIdeaIdx ? newIdea : idea));
      setEditingIdeaIdx(null);
      setIdeaEditPrompt("");
      setIdeaEditReason("");
    } catch (err) { setError(String(err)); }
    finally { setIdeaEditLoading(false); }
  };

  // ─── Generate post directly (skip ideas + theme) ───────

  const handleGenerateDirect = async () => {
    const prompt = mode === "chatgpt" ? promptInput.trim() : fileAdditionalPrompt.trim();
    if (!prompt && mode === "chatgpt") { setError("Entre un prompt"); return; }
    if (!selectedFileId && mode === "file") { setError("Sélectionne un fichier"); return; }
    setGenerateLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/linkedin/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate-direct",
          prompt: mode === "chatgpt" ? prompt : undefined,
          fileId: mode === "file" ? selectedFileId : undefined,
          additionalPrompt: mode === "file" ? prompt : undefined,
        }),
      });
      const json = await res.json();
      if (json.error) { setError(json.error); return; }
      setGeneratedPost(json.data?.post || "");
      const imgPrompt = json.data?.imagePrompt || "";
      setImagePrompt(imgPrompt);
      setEditMode(false);
      setEditedPost("");
      // Skip ideas/theme steps
      setIdeas(["(post généré directement)"]);
      setSelectedIdeaIdx(0);
      setSelectedTheme("journal-ceo");
      if (imgPrompt) {
        setImageQuery(imgPrompt);
        handleImageSearch(imgPrompt);
      }
    } catch (err) { setError(String(err)); }
    finally { setGenerateLoading(false); }
  };

  // ─── Generate post ─────────────────────────────────────

  const handleGeneratePost = async () => {
    if (selectedIdeaIdx === null || !selectedTheme) return;
    setGenerateLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/linkedin/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", theme: selectedTheme, subject: ideas[selectedIdeaIdx] }),
      });
      const json = await res.json();
      if (json.error) { setError(json.error); return; }
      setGeneratedPost(json.data?.post || "");
      const imgPrompt = json.data?.imagePrompt || "";
      setImagePrompt(imgPrompt);
      setEditMode(false);
      setEditedPost("");
      // Auto-search images with the generated prompt
      if (imgPrompt) {
        setImageQuery(imgPrompt);
        handleImageSearch(imgPrompt);
      }
    } catch (err) { setError(String(err)); }
    finally { setGenerateLoading(false); }
  };

  // ─── Refine post via AI prompt ─────────────────────────

  const handleRefine = async () => {
    if (!generatedPost || !refineInstructions.trim()) return;
    setRefineLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/linkedin/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refine", currentPost: generatedPost, instructions: refineInstructions }),
      });
      const json = await res.json();
      if (json.error) { setError(json.error); return; }
      setGeneratedPost(json.data?.post || generatedPost);
      setRefineInstructions("");
    } catch (err) { setError(String(err)); }
    finally { setRefineLoading(false); }
  };

  // ─── Save post edit with learning ──────────────────────

  const handleSaveEdit = async () => {
    if (!editedPost.trim()) return;
    setSaveLoading(true);
    try {
      // Save learning if reason provided
      if (saveReason.trim()) {
        await fetch("/api/linkedin/learnings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "post-edit",
            before: generatedPost,
            after: editedPost,
            reason: saveReason,
          }),
        });
      }
      setGeneratedPost(editedPost);
      setEditMode(false);
      setEditedPost("");
      setShowSavePopup(false);
      setSaveReason("");
    } catch (err) { setError(String(err)); }
    finally { setSaveLoading(false); }
  };

  // ─── Copy to clipboard ────────────────────────────────

  const handleCopy = async () => {
    await navigator.clipboard.writeText(generatedPost);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ─── Image search ──────────────────────────────────────

  const handleImageSearch = async (query?: string) => {
    const q = query || imageQuery || imagePrompt;
    if (!q.trim()) return;
    setImageLoading(true);
    try {
      const res = await fetch(`/api/linkedin/images?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      setImageResults(json.data || []);
    } catch { /* ignore */ }
    finally { setImageLoading(false); }
  };

  // ─── Schedule / validate ───────────────────────────────

  const handleSchedule = async () => {
    if (!generatedPost) return;
    setScheduleLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/linkedin/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: ideas[selectedIdeaIdx ?? 0]?.slice(0, 80) || "Post LinkedIn",
          content: generatedPost,
          theme: selectedTheme || "journal-ceo",
          hook: generatedPost.split("\n")[0],
          publishDate: scheduleDate,
          publishTime: scheduleTime,
          imagePrompt,
        }),
      });
      const json = await res.json();
      if (json.error) { setError(json.error); return; }
      setShowSchedule(false);
      onPostValidated?.();
    } catch (err) { setError(String(err)); }
    finally { setScheduleLoading(false); }
  };

  // ─── Step indicators ───────────────────────────────────

  const currentStep = !ideas.length ? 1 : selectedIdeaIdx === null ? 2 : !generatedPost ? 3 : 4;

  const steps = [
    { n: 1, label: "Source & Prompt" },
    { n: 2, label: "Idées" },
    { n: 3, label: "Thème & Génération" },
    { n: 4, label: "Post final" },
  ];

  // ─── Render ────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* ── Step indicator ─────────────────────────────── */}
      <div className="flex items-center gap-1 text-xs overflow-x-auto pb-1">
        {steps.map((s, i) => (
          <div key={s.n} className="flex items-center gap-1 flex-shrink-0">
            <div className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium transition-all",
              currentStep >= s.n ? "bg-violet-100 text-violet-700" : "bg-gray-100 text-gray-400"
            )}>
              {currentStep > s.n ? <CheckCircle2 className="w-3.5 h-3.5" /> : <span className="w-4 text-center">{s.n}</span>}
              {s.label}
            </div>
            {i < steps.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />}
          </div>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-2 rounded-lg flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-600 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* ════════════════════════════════════════════════ */}
      {/* ── Step 1: Mode selection ─────────────────────── */}
      {/* ════════════════════════════════════════════════ */}

      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Étape 1 — Source</h2>

        {/* Mode toggle */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setMode("chatgpt")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer",
              mode === "chatgpt" ? "bg-blue-50 text-blue-700 ring-2 ring-blue-300" : "bg-gray-50 text-gray-500 hover:bg-gray-100"
            )}
          >
            <MessageSquare className="w-4 h-4" />
            Prompt libre
          </button>
          <button
            onClick={() => setMode("file")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer",
              mode === "file" ? "bg-violet-50 text-violet-700 ring-2 ring-violet-300" : "bg-gray-50 text-gray-500 hover:bg-gray-100"
            )}
          >
            <FileUp className="w-4 h-4" />
            Fichier source
          </button>
        </div>

        {/* ChatGPT mode: prompt input */}
        {mode === "chatgpt" && (
          <div>
            <textarea
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              placeholder={ideas.length > 0
                ? "Modifie ou précise ton prompt pour regénérer les idées…"
                : "Ex: Je veux parler de l'impact de l'IA sur la formation retail, de mon expérience au salon NRF, ou de comment les dupes changent le luxe..."}
              rows={ideas.length > 0 ? 3 : 4}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-300 outline-none resize-y mb-3"
            />
            <div className="flex gap-2">
              <button
                onClick={handleGenerateIdeas}
                disabled={!promptInput.trim() || ideasLoading || generateLoading}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer shadow-sm"
              >
                {ideasLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {ideasLoading ? "Génération…" : ideas.length > 0 ? "Regénérer les idées" : "Générer 6 idées"}
              </button>
              <button
                onClick={handleGenerateDirect}
                disabled={!promptInput.trim() || ideasLoading || generateLoading}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-violet-600 rounded-xl hover:bg-violet-700 disabled:opacity-50 transition-colors cursor-pointer shadow-sm"
              >
                {generateLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {generateLoading ? "Rédaction…" : "Générer le post"}
              </button>
            </div>
          </div>
        )}

        {/* File mode: upload + select */}
        {mode === "file" && (
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.md,.docx"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-violet-400 hover:text-violet-600 transition-colors cursor-pointer mb-3"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
              {uploading ? "Upload en cours…" : "Importer un fichier"}
            </button>

            {/* File list */}
            {filesLoading ? (
              <div className="flex items-center gap-2 text-xs text-gray-400 py-2 mb-3"><Loader2 className="w-3 h-3 animate-spin" /> Chargement…</div>
            ) : files.length > 0 ? (
              <div className="space-y-1 mb-3 max-h-40 overflow-y-auto">
                {files.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setSelectedFileId(selectedFileId === f.id ? null : f.id)}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-all cursor-pointer",
                      selectedFileId === f.id ? "bg-violet-50 ring-2 ring-violet-300" : "bg-gray-50 hover:bg-gray-100"
                    )}
                  >
                    <FileUp className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-700 truncate">{f.name}</p>
                      <p className="text-[10px] text-gray-400">{(f.size / 1024).toFixed(0)}KB — {f.textLength.toLocaleString()} caractères extraits</p>
                    </div>
                    {selectedFileId === f.id && <Check className="w-4 h-4 text-violet-600 flex-shrink-0" />}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 py-2 mb-3">Aucun fichier uploadé. Commence par en importer un.</p>
            )}

            {/* Additional prompt for file mode — always visible once a file is selected */}
            {selectedFileId && (
              <textarea
                value={fileAdditionalPrompt}
                onChange={(e) => setFileAdditionalPrompt(e.target.value)}
                placeholder={ideas.length > 0
                  ? "Donne un nouveau contexte ou angle pour regénérer les idées…"
                  : "Indication supplémentaire (optionnel) : angle, focus, public cible..."}
                rows={ideas.length > 0 ? 3 : 2}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-violet-300 outline-none resize-y mb-3"
              />
            )}

            <div className="flex gap-2">
              <button
                onClick={handleGenerateIdeas}
                disabled={!selectedFileId || ideasLoading || generateLoading}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-violet-600 rounded-xl hover:bg-violet-700 disabled:opacity-50 transition-colors cursor-pointer shadow-sm"
              >
                {ideasLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {ideasLoading ? "Analyse…" : ideas.length > 0 ? "Regénérer les idées" : "Générer 6 idées"}
              </button>
              <button
                onClick={handleGenerateDirect}
                disabled={!selectedFileId || ideasLoading || generateLoading}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer shadow-sm"
              >
                {generateLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {generateLoading ? "Rédaction…" : "Générer le post"}
              </button>
            </div>
          </div>
        )}

        {/* Ideas loading progress */}
        {ideasLoading && (
          <div className="mt-3 space-y-1">
            <div className="flex items-center gap-2 text-xs text-blue-600">
              <span className="font-medium">{getIdeasPhase(ideasElapsed)}</span>
              <span className="ml-auto tabular-nums text-blue-400">{ideasElapsed}s</span>
            </div>
            <div className="h-1 bg-blue-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full animate-pulse" style={{ width: `${Math.min(90, ideasElapsed * 5)}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════ */}
      {/* ── Step 2: Ideas list ─────────────────────────── */}
      {/* ════════════════════════════════════════════════ */}

      {ideas.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">Étape 2 — Choisis une idée</h2>
            <button
              onClick={handleGenerateIdeas}
              disabled={ideasLoading}
              className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", ideasLoading && "animate-spin")} />
              Regénérer
            </button>
          </div>

          <div className="space-y-2">
            {ideas.map((idea, i) => (
              <div key={i} className={cn(
                "relative group rounded-lg border transition-all",
                selectedIdeaIdx === i
                  ? "bg-blue-50 border-blue-300 ring-2 ring-blue-200"
                  : "bg-gray-50 border-gray-200 hover:border-gray-300"
              )}>
                <button
                  onClick={() => setSelectedIdeaIdx(selectedIdeaIdx === i ? null : i)}
                  className="w-full px-3 py-2.5 text-left cursor-pointer"
                >
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-bold text-gray-400 mt-0.5 flex-shrink-0">{i + 1}</span>
                    <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{idea}</p>
                  </div>
                </button>

                {/* Edit idea button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingIdeaIdx(i);
                    setIdeaEditPrompt("");
                    setIdeaEditReason("");
                  }}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 rounded bg-white border border-gray-200 text-gray-400 hover:text-violet-600 hover:border-violet-300 transition-all cursor-pointer"
                  title="Modifier cette idée"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Idea edit popup ──────────────────────────────── */}
      {editingIdeaIdx !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">Modifier l&apos;idée {editingIdeaIdx + 1}</h3>
              <button onClick={() => setEditingIdeaIdx(null)} className="text-gray-400 hover:text-gray-600 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>

            <div className="bg-gray-50 rounded-lg p-3 mb-3 text-sm text-gray-600 whitespace-pre-line max-h-32 overflow-y-auto">
              {ideas[editingIdeaIdx]}
            </div>

            <label className="block text-xs font-medium text-gray-500 mb-1">Comment modifier cette idée ?</label>
            <textarea
              value={ideaEditPrompt}
              onChange={(e) => setIdeaEditPrompt(e.target.value)}
              placeholder="Ex: Rends-la plus personnelle, ajoute un chiffre concret, change l'angle vers..."
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-violet-300 outline-none resize-y mb-3"
              autoFocus
            />

            <label className="block text-xs font-medium text-gray-500 mb-1">Pourquoi ? <span className="text-gray-400">(pour que l&apos;IA apprenne ton style)</span></label>
            <input
              type="text"
              value={ideaEditReason}
              onChange={(e) => setIdeaEditReason(e.target.value)}
              placeholder="Ex: Je préfère les angles concrets avec des exemples terrain..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-violet-300 outline-none mb-4"
            />

            <div className="flex gap-2">
              <button
                onClick={() => setEditingIdeaIdx(null)}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={handleEditIdea}
                disabled={!ideaEditPrompt.trim() || ideaEditLoading}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {ideaEditLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {ideaEditLoading ? "Modification…" : "Modifier l'idée"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════ */}
      {/* ── Step 3: Theme + Generate ───────────────────── */}
      {/* ════════════════════════════════════════════════ */}

      {selectedIdeaIdx !== null && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Étape 3 — Thème & Génération</h2>

          <div className="grid grid-cols-2 gap-2 mb-4">
            {THEMES.map((t) => (
              <button
                key={t.key}
                onClick={() => setSelectedTheme(t.key)}
                className={cn(
                  "px-3 py-2 rounded-lg text-sm text-left transition-all cursor-pointer",
                  selectedTheme === t.key
                    ? "bg-violet-50 ring-2 ring-violet-300 text-violet-700"
                    : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                )}
              >
                <span className="font-medium">{t.emoji} {t.name}</span>
                <p className="text-[10px] text-gray-400 mt-0.5">{t.description}</p>
              </button>
            ))}
          </div>

          <button
            onClick={handleGeneratePost}
            disabled={!selectedTheme || generateLoading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-600 rounded-xl hover:from-violet-700 hover:to-blue-700 disabled:opacity-50 transition-colors cursor-pointer shadow-sm"
          >
            {generateLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {generateLoading ? "Rédaction en cours…" : "Générer le post"}
          </button>

          {generateLoading && (
            <div className="mt-3 space-y-1">
              <div className="flex items-center gap-2 text-xs text-violet-600">
                <span className="font-medium">{getGeneratePhase(generateElapsed)}</span>
                <span className="ml-auto tabular-nums text-violet-400">{generateElapsed}s</span>
              </div>
              <div className="h-1 bg-violet-100 rounded-full overflow-hidden">
                <div className="h-full bg-violet-500 rounded-full animate-pulse" style={{ width: `${Math.min(90, generateElapsed * 4)}%` }} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════ */}
      {/* ── Step 4: Post final ─────────────────────────── */}
      {/* ════════════════════════════════════════════════ */}

      {generatedPost && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">Étape 4 — Post final</h2>
            <div className="flex items-center gap-2">
              {!editMode && (
                <button
                  onClick={() => { setEditMode(true); setEditedPost(generatedPost); }}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-violet-600 font-medium cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Modifier
                </button>
              )}
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 font-medium cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copié !" : "Copier"}
              </button>
            </div>
          </div>

          {/* Post display or edit */}
          {editMode ? (
            <div className="space-y-3">
              <textarea
                value={editedPost}
                onChange={(e) => setEditedPost(e.target.value)}
                rows={12}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-violet-300 outline-none resize-y font-mono leading-relaxed"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setEditMode(false); setEditedPost(""); }}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  onClick={() => setShowSavePopup(true)}
                  disabled={editedPost === generatedPost}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  Enregistrer
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 whitespace-pre-line leading-relaxed max-h-96 overflow-y-auto">
              {generatedPost}
            </div>
          )}

          {/* AI refine */}
          {!editMode && (
            <div className="mt-4 pt-3 border-t border-gray-100">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={refineInstructions}
                  onChange={(e) => setRefineInstructions(e.target.value)}
                  placeholder="Reprompter : raccourcis, change le ton, ajoute un chiffre..."
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-300 outline-none"
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleRefine(); } }}
                />
                <button
                  onClick={handleRefine}
                  disabled={!refineInstructions.trim() || refineLoading}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {refineLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Reprompter
                </button>
              </div>

              {refineLoading && (
                <div className="mt-2 flex items-center gap-2 text-xs text-blue-600">
                  <span className="font-medium">Réécriture…</span>
                  <span className="ml-auto tabular-nums text-blue-400">{refineElapsed}s</span>
                </div>
              )}
            </div>
          )}

          {/* Image search */}
          <div className="mt-4 pt-3 border-t border-gray-100">
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={imageQuery}
                onChange={(e) => setImageQuery(e.target.value)}
                placeholder={imagePrompt || "Rechercher une image…"}
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-300 outline-none"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleImageSearch(); } }}
              />
              <button
                onClick={() => handleImageSearch()}
                disabled={imageLoading}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {imageLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                <ImageIcon className="w-3.5 h-3.5" />
              </button>
            </div>

            {imageResults.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {imageResults.map((img, i) => (
                  <a key={i} href={img.url} target="_blank" rel="noopener noreferrer" className="group relative rounded-lg overflow-hidden">
                    <img src={img.thumb} alt={img.alt} className="w-full h-24 object-cover" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
                      <Download className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <p className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] px-1 py-0.5 truncate">{img.photographer}</p>
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Save post */}
          <div className="mt-4 pt-3 border-t border-gray-100">
            <button
              onClick={handleSchedule}
              disabled={scheduleLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-green-600 rounded-xl hover:bg-green-700 disabled:opacity-50 transition-colors cursor-pointer shadow-sm"
            >
              {scheduleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {scheduleLoading ? "Enregistrement…" : "Enregistrer le post"}
            </button>
          </div>
        </div>
      )}

      {/* ── Save edit popup (learning) ───────────────────── */}
      {showSavePopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">Enregistrer les modifications</h3>
              <button onClick={() => { setShowSavePopup(false); setSaveReason(""); }} className="text-gray-400 hover:text-gray-600 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>

            <p className="text-xs text-gray-500 mb-3">
              Explique pourquoi tu as modifié ce post. L&apos;IA utilisera cette info pour mieux écrire tes prochains posts.
            </p>

            <textarea
              value={saveReason}
              onChange={(e) => setSaveReason(e.target.value)}
              placeholder="Ex: Le ton était trop formel, je préfère des phrases plus courtes et punchy. J'ai retiré la partie sur X car pas pertinent..."
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-300 outline-none resize-y mb-4"
              autoFocus
            />

            <div className="flex gap-2">
              <button
                onClick={() => {
                  // Save without reason
                  setGeneratedPost(editedPost);
                  setEditMode(false);
                  setEditedPost("");
                  setShowSavePopup(false);
                  setSaveReason("");
                }}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer"
              >
                Enregistrer sans motif
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={!saveReason.trim() || saveLoading}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {saveLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saveLoading ? "Enregistrement…" : "Enregistrer & apprendre"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
