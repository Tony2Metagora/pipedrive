"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Sparkles, Loader2, Copy, Check, RefreshCw, Send,
  ImageIcon, Search, Download, ChevronRight,
  CheckCircle2, Calendar, Clock,
  MessageSquare, FileUp, X,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────

interface FileItem {
  id: string;
  name: string;
  size: number;
  textLength: number;
  preview: string;
  createdAt: string;
}

const THEMES = [
  { key: "journal-ceo", emoji: "1️⃣", name: "Journal d'un CEO", desc: "Rencontres retail/luxe, bonnes pratiques, personnes et marques inspirantes", color: "amber" },
  { key: "ia-formation", emoji: "2️⃣", name: "IA dans la formation", desc: "E-learning (SCORM/LMS) = réalité de 90% des entreprises. L'IA l'enrichit, pas le remplace. Constat + solutions.", color: "blue" },
  { key: "ia-operationnelle", emoji: "3️⃣", name: "IA Opérationnelle", desc: "Vulgarisation IA (agentique, LLM) → exploitation réelle chez Metagora", color: "emerald" },
  { key: "evenement", emoji: "🎯", name: "Événement", desc: "Salons, conférences, webinars, meetups — avant/pendant/après", color: "purple" },
];

// ─── Reusable elapsed timer hook ─────────────────────────
function useElapsedTimer(active: boolean) {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (active) {
      setElapsed(0);
      intervalRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [active]);
  return elapsed;
}

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

  // Step 3: Theme selection (after idea is chosen)
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);

  // Post generation
  const [generatedPost, setGeneratedPost] = useState("");
  const [generateLoading, setGenerateLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [imagePrompt, setImagePrompt] = useState("");

  // Hooks
  const [hooks, setHooks] = useState<string[]>([]);
  const [hooksLoading, setHooksLoading] = useState(false);
  const [selectedHook, setSelectedHook] = useState<string | null>(null);
  const [hookRefineInput, setHookRefineInput] = useState("");
  const [hookRefineLoading, setHookRefineLoading] = useState(false);

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

  const getHookRefinePhase = (elapsed: number) => {
    if (elapsed < 2) return "Analyse de l'accroche…";
    if (elapsed < 5) return "Réécriture en cours…";
    return "Finalisation…";
  };

  const getIdeasPhase = (elapsed: number) => {
    if (elapsed < 3) return "Analyse du prompt…";
    if (elapsed < 6) return "Génération des idées…";
    if (elapsed < 10) return "Structuration…";
    return "Finalisation…";
  };

  // Elapsed timers
  const ideasElapsed = useElapsedTimer(ideasLoading);
  const generateElapsed = useElapsedTimer(generateLoading);
  const hookRefineElapsed = useElapsedTimer(hookRefineLoading);
  const refineElapsed = useElapsedTimer(refineLoading);

  // ─── Load files ──────────────────────────────────────

  const loadFiles = useCallback(async () => {
    setFilesLoading(true);
    try {
      const res = await fetch("/api/linkedin/files");
      const json = await res.json();
      setFiles(json.data || []);
    } catch (err) {
      console.error("Error loading files:", err);
    } finally {
      setFilesLoading(false);
    }
  }, []);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  // ─── Actions ──────────────────────────────────────────

  const resetFlow = () => {
    setIdeas([]);
    setSelectedIdeaIdx(null);
    setSelectedTheme(null);
    setGeneratedPost("");
    setHooks([]);
    setSelectedHook(null);
    setImagePrompt("");
    setError(null);
  };

  const handleModeSwitch = (newMode: Mode) => {
    setMode(newMode);
    resetFlow();
    setPromptInput("");
    setSelectedFileId(null);
    setFileAdditionalPrompt("");
  };

  const handleUploadFile = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/linkedin/files", { method: "POST", body: formData });
      const json = await res.json();
      if (json.error) { setError(json.error); return; }
      await loadFiles();
      setSelectedFileId(json.data.id);
    } catch (err) { setError(String(err)); }
    finally { setUploading(false); }
  };

  const handleGenerateIdeas = async () => {
    setIdeasLoading(true);
    setIdeas([]);
    setSelectedIdeaIdx(null);
    setGeneratedPost("");
    setHooks([]);
    setSelectedHook(null);
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

  const handleSelectIdea = (idx: number) => {
    setSelectedIdeaIdx(idx);
    setGeneratedPost("");
    setHooks([]);
    setSelectedHook(null);
  };

  const handleGenerate = async () => {
    if (selectedIdeaIdx === null || !selectedTheme) return;
    const subject = ideas[selectedIdeaIdx];
    if (!subject) return;

    setGenerateLoading(true);
    setError(null);
    setGeneratedPost("");
    setHooks([]);
    setSelectedHook(null);
    setImagePrompt("");

    try {
      const res = await fetch("/api/linkedin/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", theme: selectedTheme, subject }),
      });
      const json = await res.json();
      if (json.error) { setError(json.error); return; }
      setGeneratedPost(json.data?.post || "");
      const ip = json.data?.imagePrompt || "";
      setImagePrompt(ip);
      setImageQuery(ip);

      // Auto-generate hooks
      if (json.data?.post) {
        setHooksLoading(true);
        try {
          const hRes = await fetch("/api/linkedin/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "hooks", post: json.data.post }),
          });
          const hJson = await hRes.json();
          setHooks(hJson.data?.hooks || []);
        } catch { /* ignore */ }
        setHooksLoading(false);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setGenerateLoading(false);
    }
  };

  const handleRefine = async () => {
    if (!generatedPost || !refineInstructions) return;
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

  const handleRefineHook = async (hook: string) => {
    if (!hookRefineInput) return;
    setHookRefineLoading(true);
    try {
      const res = await fetch("/api/linkedin/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refine-hook", hook, instructions: hookRefineInput }),
      });
      const json = await res.json();
      if (json.data?.hook) {
        setSelectedHook(json.data.hook);
        setHookRefineInput("");
      }
    } catch { /* ignore */ }
    finally { setHookRefineLoading(false); }
  };

  const handleCopy = () => {
    const hookLine = selectedHook ? selectedHook + "\n\n" : "";
    const fullPost = hookLine + generatedPost;
    navigator.clipboard.writeText(fullPost);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleImageSearch = async () => {
    if (!imageQuery.trim()) return;
    setImageLoading(true);
    setImageResults([]);
    try {
      const res = await fetch("/api/linkedin/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: imageQuery }),
      });
      const json = await res.json();
      setImageResults(json.data || []);
    } catch (err) { setError(String(err)); }
    finally { setImageLoading(false); }
  };

  const handleSchedulePost = async () => {
    if (!generatedPost || !scheduleDate || !scheduleTime) return;
    setScheduleLoading(true);
    try {
      const title = selectedIdeaIdx !== null ? ideas[selectedIdeaIdx]?.slice(0, 80) || "Post LinkedIn" : "Post LinkedIn";
      const hookText = selectedHook || "";
      const content = hookText ? hookText + "\n\n" + generatedPost : generatedPost;

      await fetch("/api/linkedin/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content,
          theme: selectedTheme || "journal-ceo",
          hook: hookText,
          publishDate: scheduleDate,
          publishTime: scheduleTime,
          imagePrompt,
        }),
      });
      setShowSchedule(false);
      if (onPostValidated) onPostValidated();
    } catch (err) { setError(String(err)); }
    finally { setScheduleLoading(false); }
  };

  // ─── Render ───────────────────────────────────────────

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <X className="w-4 h-4 flex-shrink-0 cursor-pointer hover:text-red-900" onClick={() => setError(null)} />
          {error}
        </div>
      )}

      {/* ─── Step 1: Mode Selection + Input ─────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-gray-800 mb-1">Étape 1 — Choisis ton mode</h2>
        <p className="text-xs text-gray-400 mb-4">Décris ton idée ou importe un document pour générer des idées de posts</p>

        {/* Mode toggle */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => handleModeSwitch("chatgpt")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all cursor-pointer border",
              mode === "chatgpt"
                ? "bg-blue-50 border-blue-300 text-blue-700 shadow-sm"
                : "bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300"
            )}
          >
            <MessageSquare className="w-4 h-4" />
            Prompt libre
          </button>
          <button
            onClick={() => handleModeSwitch("file")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all cursor-pointer border",
              mode === "file"
                ? "bg-violet-50 border-violet-300 text-violet-700 shadow-sm"
                : "bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300"
            )}
          >
            <FileUp className="w-4 h-4" />
            Importer un fichier
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
            <button
              onClick={handleGenerateIdeas}
              disabled={!promptInput.trim() || ideasLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer shadow-sm"
            >
              {ideasLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {ideasLoading ? "Génération en cours…" : ideas.length > 0 ? "Regénérer les idées" : "Générer 6 idées de posts"}
            </button>
          </div>
        )}

        {/* File mode: upload + select */}
        {mode === "file" && (
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.md,.markdown,.docx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUploadFile(f);
                e.target.value = "";
              }}
            />

            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-lg hover:bg-violet-100 cursor-pointer disabled:opacity-50 transition-colors"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
                {uploading ? "Upload en cours…" : "Uploader un fichier"}
              </button>
              <span className="text-[10px] text-gray-400">PDF, TXT, MD, DOCX — max 5MB (~50 pages)</span>
            </div>

            {/* File list */}
            {filesLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-400 py-2"><Loader2 className="w-4 h-4 animate-spin" /> Chargement…</div>
            ) : files.length > 0 ? (
              <div className="space-y-1.5 mb-3 max-h-48 overflow-y-auto">
                {files.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setSelectedFileId(f.id)}
                    className={cn(
                      "w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg border transition-all cursor-pointer",
                      selectedFileId === f.id
                        ? "border-violet-400 bg-violet-50"
                        : "border-gray-200 bg-gray-50 hover:border-violet-300"
                    )}
                  >
                    <FileUp className={cn("w-4 h-4 flex-shrink-0", selectedFileId === f.id ? "text-violet-600" : "text-gray-400")} />
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm truncate", selectedFileId === f.id ? "text-violet-800" : "text-gray-700")}>{f.name}</p>
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

            <button
              onClick={handleGenerateIdeas}
              disabled={!selectedFileId || ideasLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-violet-600 rounded-xl hover:bg-violet-700 disabled:opacity-50 transition-colors cursor-pointer shadow-sm"
            >
              {ideasLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {ideasLoading ? "Analyse en cours…" : ideas.length > 0 ? "Regénérer avec ce contexte" : "Analyser et générer 6 idées"}
            </button>
          </div>
        )}

        {/* Ideas loading progress */}
        {ideasLoading && (
          <div className="mt-3 space-y-1">
            <div className="flex items-center gap-2 text-xs text-blue-600">
              <span className="font-medium">{getIdeasPhase(ideasElapsed)}</span>
              <span className="ml-auto tabular-nums text-blue-400">{ideasElapsed}s</span>
            </div>
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-blue-400 rounded-full transition-all duration-1000" style={{ width: `${Math.min(95, Math.round((ideasElapsed / 12) * 100))}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* ─── Step 2: Ideas ─────────────────────────────── */}
      {ideas.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">Étape 2 — Choisis une idée</h2>
              <p className="text-xs text-gray-400">{ideas.length} idées proposées — clique sur celle qui t&apos;inspire</p>
            </div>
            <button
              onClick={handleGenerateIdeas}
              disabled={ideasLoading}
              className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", ideasLoading && "animate-spin")} />
              Regénérer
            </button>
          </div>

          <div className="space-y-2 mb-4">
            {ideas.map((idea, i) => (
              <button
                key={i}
                onClick={() => handleSelectIdea(i)}
                className={cn(
                  "w-full text-left rounded-lg border transition-all cursor-pointer p-3",
                  selectedIdeaIdx === i
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50/50"
                )}
              >
                <div className="flex items-start gap-2">
                  <ChevronRight className={cn("w-4 h-4 flex-shrink-0 mt-0.5 transition-transform", selectedIdeaIdx === i && "text-blue-500 rotate-90")} />
                  <div className="min-w-0 flex-1">
                    <span className={cn(
                      "text-[10px] font-semibold px-1.5 py-0.5 rounded-full mr-2",
                      selectedIdeaIdx === i ? "bg-blue-200 text-blue-800" : "bg-gray-200 text-gray-600"
                    )}>
                      {i + 1}
                    </span>
                    <span className={cn("text-sm leading-relaxed whitespace-pre-line", selectedIdeaIdx === i ? "text-blue-800" : "text-gray-700")}>
                      {idea}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ─── Step 3: Theme + Generate ──────────────────── */}
      {selectedIdeaIdx !== null && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-1">Étape 3 — Thème & Génération</h2>
          <p className="text-xs text-gray-400 mb-3">Choisis le thème éditorial puis génère le post</p>

          <div className="grid grid-cols-2 gap-2 mb-4">
            {THEMES.map((t) => (
              <button
                key={t.key}
                onClick={() => setSelectedTheme(t.key)}
                className={cn(
                  "flex items-start gap-2 px-3 py-2.5 rounded-lg border text-left transition-all cursor-pointer",
                  selectedTheme === t.key
                    ? t.color === "amber" ? "border-amber-400 bg-amber-50" :
                      t.color === "blue" ? "border-blue-400 bg-blue-50" :
                      t.color === "emerald" ? "border-emerald-400 bg-emerald-50" :
                      "border-purple-400 bg-purple-50"
                    : "border-gray-200 bg-gray-50 hover:border-gray-300"
                )}
              >
                <span className="text-base flex-shrink-0">{t.emoji}</span>
                <div className="min-w-0">
                  <p className={cn("text-xs font-semibold", selectedTheme === t.key ? "text-gray-800" : "text-gray-600")}>{t.name}</p>
                  <p className="text-[10px] text-gray-400 line-clamp-2">{t.desc}</p>
                </div>
              </button>
            ))}
          </div>

          <button
            onClick={handleGenerate}
            disabled={!selectedTheme || generateLoading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer shadow-sm"
          >
            {generateLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {generateLoading ? "Rédaction en cours…" : "Générer le post"}
          </button>
          {generateLoading && (
            <div className="mt-2 space-y-1">
              <div className="flex items-center gap-2 text-xs text-blue-600">
                <span className="font-medium">{getGeneratePhase(generateElapsed)}</span>
                <span className="ml-auto tabular-nums text-blue-400">{generateElapsed}s</span>
              </div>
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-blue-400 rounded-full transition-all duration-1000" style={{ width: `${Math.min(95, Math.round((generateElapsed / 15) * 100))}%` }} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Step 4: Hooks ───────────────────────────── */}
      {generatedPost && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-1">Étape 4 — Choisis une accroche</h2>
          <p className="text-xs text-gray-400 mb-3">Les 2-3 premières lignes visibles avant &quot;…voir plus&quot;</p>

          {hooksLoading ? (
            <div className="flex items-center gap-2 text-sm text-blue-600 py-3"><Loader2 className="w-4 h-4 animate-spin" /> Génération des accroches…</div>
          ) : hooks.length > 0 ? (
            <div className="space-y-2 mb-3">
              {hooks.map((h, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedHook(h)}
                  className={cn(
                    "w-full text-left px-3 py-2.5 rounded-lg border transition-all cursor-pointer text-sm",
                    selectedHook === h
                      ? "border-blue-500 bg-blue-50 text-blue-800"
                      : "border-gray-200 bg-gray-50 text-gray-700 hover:border-blue-300"
                  )}
                >
                  {h}
                </button>
              ))}
            </div>
          ) : null}

          {/* Refine hook */}
          {selectedHook && (
            <div className="flex flex-col gap-2 mt-2">
              <textarea
                value={hookRefineInput}
                onChange={(e) => setHookRefineInput(e.target.value)}
                placeholder="Colle ta nouvelle accroche ici, ou décris comment modifier l'accroche sélectionnée..."
                rows={5}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-300 outline-none resize-y leading-relaxed"
              />
              <div className="flex items-center gap-3 self-end">
                {hookRefineLoading && (
                  <span className="text-[10px] text-amber-500 tabular-nums">{getHookRefinePhase(hookRefineElapsed)} — {hookRefineElapsed}s</span>
                )}
                <button
                  onClick={() => handleRefineHook(selectedHook)}
                  disabled={!hookRefineInput || hookRefineLoading}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50 cursor-pointer"
                >
                  {hookRefineLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Appliquer
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Step 5: Post ────────────────────────────── */}
      {generatedPost && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="text-sm font-semibold text-gray-800">Étape 5 — Ton post LinkedIn</h2>
            <div className="flex items-center gap-2">
              <button onClick={handleCopy} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 cursor-pointer">
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copié !" : "Copier"}
              </button>
              <button onClick={handleGenerate} disabled={generateLoading} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 cursor-pointer">
                <RefreshCw className={cn("w-3.5 h-3.5", generateLoading && "animate-spin")} />
                Regénérer
              </button>
            </div>
          </div>

          {selectedHook && (
            <div className="mb-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-[10px] text-blue-500 font-medium mb-1">ACCROCHE SÉLECTIONNÉE</p>
              <p className="text-sm text-blue-800">{selectedHook}</p>
            </div>
          )}

          <textarea
            value={generatedPost}
            onChange={(e) => setGeneratedPost(e.target.value)}
            rows={14}
            className="w-full px-3 py-3 text-sm text-gray-800 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-300 outline-none resize-y leading-relaxed"
          />

          <p className="text-[10px] text-gray-400 mt-1">
            {generatedPost.split(/\s+/).filter(Boolean).length} mots — Tu peux modifier le texte directement
          </p>

          {/* Refine */}
          <div className="mt-4 border-t border-gray-100 pt-4">
            <label className="block text-xs font-medium text-gray-600 mb-2">Demander une modification à l&apos;IA</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={refineInstructions}
                onChange={(e) => setRefineInstructions(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleRefine(); } }}
                placeholder="Ex: Rends-le plus punchy, ajoute une anecdote perso..."
                className="flex-1 px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-300 outline-none"
              />
              <button
                onClick={handleRefine}
                disabled={!refineInstructions || refineLoading}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50 cursor-pointer"
              >
                {refineLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Modifier
              </button>
            </div>
            {refineLoading && (
              <div className="mt-2 flex items-center gap-2 text-xs text-amber-600">
                <span className="font-medium">{getGeneratePhase(refineElapsed)}</span>
                <span className="ml-auto tabular-nums text-amber-400">{refineElapsed}s</span>
              </div>
            )}
          </div>

          {/* Validate / Schedule */}
          <div className="mt-4 border-t border-gray-100 pt-4">
            {!showSchedule ? (
              <button
                onClick={() => setShowSchedule(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 cursor-pointer shadow-sm"
              >
                <CheckCircle2 className="w-4 h-4" />
                Valider et planifier
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700">Planifier la publication</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="flex items-center gap-2 flex-1">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <input
                      type="date"
                      value={scheduleDate}
                      onChange={(e) => setScheduleDate(e.target.value)}
                      className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-300"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <input
                      type="time"
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                      className="px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-300"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSchedulePost}
                    disabled={scheduleLoading}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                  >
                    {scheduleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Confirmer
                  </button>
                  <button onClick={() => setShowSchedule(false)} className="px-4 py-2.5 text-sm text-gray-500 bg-gray-100 rounded-lg hover:bg-gray-200 cursor-pointer">
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Image search ────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-1">
          <ImageIcon className="w-4 h-4 text-gray-600" />
          <h2 className="text-sm font-semibold text-gray-800">Image d&apos;illustration</h2>
        </div>
        <p className="text-xs text-gray-400 mb-4">Recherche une image libre de droits (Pexels)</p>

        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <input
            type="text"
            value={imageQuery}
            onChange={(e) => setImageQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleImageSearch(); } }}
            placeholder="Ex: retail store luxury, team meeting..."
            className="flex-1 px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-300 outline-none"
          />
          <button
            onClick={handleImageSearch}
            disabled={!imageQuery.trim() || imageLoading}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-gray-800 rounded-lg hover:bg-gray-900 disabled:opacity-50 cursor-pointer"
          >
            {imageLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Rechercher
          </button>
        </div>

        {imageResults.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
            {imageResults.map((img, i) => (
              <div key={i} className="group relative rounded-lg overflow-hidden border border-gray-200">
                <img src={img.thumb} alt={img.alt || "Image"} className="w-full aspect-video object-cover" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                  <a href={img.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                    <Download className="w-3 h-3" />HD
                  </a>
                </div>
                <div className="px-2 py-1.5 bg-gray-50">
                  <p className="text-[10px] text-gray-400 truncate">
                    📸 {img.photographer} — <a href={img.link} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Pexels</a>
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
