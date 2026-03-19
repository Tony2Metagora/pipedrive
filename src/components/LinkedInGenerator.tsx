"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Sparkles, Loader2, Copy, Check, RefreshCw, Send,
  ImageIcon, Search, Download, AlertCircle, ChevronRight,
  Globe, Plus, Trash2, ExternalLink, CheckCircle2, Edit3,
  Calendar, Clock, BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────

interface Source {
  id: string;
  name: string;
  url: string;
  themes: string[];
  type: "site" | "youtube";
}

interface StatItem {
  text: string;
  source: string;
  url: string;
}

interface SubjectItem {
  title: string;
  angle: string;
  source?: string;
  url?: string;
  stats?: StatItem[];
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
  // Sources
  const [sources, setSources] = useState<Source[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(new Set());
  const [showAddSource, setShowAddSource] = useState(false);
  const [newSourceName, setNewSourceName] = useState("");
  const [newSourceUrl, setNewSourceUrl] = useState("");
  const [newSourceThemes, setNewSourceThemes] = useState<Set<string>>(new Set());
  const [newSourceType, setNewSourceType] = useState<"site" | "youtube">("site");
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);

  // Mode: create or import
  type Mode = "create" | "import";
  type ImportType = "event" | "inspiration";
  const [mode, setMode] = useState<Mode>("create");
  const [importType, setImportType] = useState<ImportType>("event");
  const [importPost, setImportPost] = useState("");
  const [importContext, setImportContext] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importStats, setImportStats] = useState<StatItem[]>([]);
  const [importStatsLoading, setImportStatsLoading] = useState(false);
  const [importStatsDetail, setImportStatsDetail] = useState("");

  // Theme & subject
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [customSubject, setCustomSubject] = useState("");
  const [statsLoadingIdx, setStatsLoadingIdx] = useState<number | null>(null);
  const [statsSearchDetail, setStatsSearchDetail] = useState("");
  const [selectedStats, setSelectedStats] = useState<Set<string>>(new Set());

  // Decomposed loading state
  interface LoadingStep {
    label: string;
    status: "pending" | "loading" | "done" | "error";
    detail?: string;
  }
  const [loadingSteps, setLoadingSteps] = useState<LoadingStep[]>([]);

  // Post
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
  // Analysis phases for Option C (simulated steps)
  const getAnalysisPhase = (elapsed: number, model: "fast" | "realtime") => {
    if (model === "fast") {
      if (elapsed < 3) return "Connexion aux sources…";
      if (elapsed < 6) return "Analyse du contenu…";
      if (elapsed < 10) return "Extraction des sujets…";
      return "Finalisation…";
    }
    // realtime (gpt-5.4 + web)
    if (elapsed < 5) return "Connexion aux sources…";
    if (elapsed < 15) return "Recherche web en cours…";
    if (elapsed < 25) return "Analyse des résultats…";
    if (elapsed < 40) return "Extraction des sujets…";
    return "Finalisation…";
  };

  // Stats search phases for Option A (timer + phases)
  const getStatsPhase = (elapsed: number) => {
    if (elapsed < 5) return "🔍 Lancement recherche web…";
    if (elapsed < 15) return "📡 Analyse des résultats…";
    if (elapsed < 25) return "📊 Extraction des statistiques…";
    return "⏳ Vérification des sources…";
  };

  // Generate post phases
  const getGeneratePhase = (elapsed: number) => {
    if (elapsed < 3) return "Préparation du prompt…";
    if (elapsed < 8) return "Rédaction du post…";
    if (elapsed < 15) return "Structuration & hashtags…";
    return "Finalisation…";
  };

  // Hook refine phases
  const getHookRefinePhase = (elapsed: number) => {
    if (elapsed < 2) return "Analyse de l'accroche…";
    if (elapsed < 5) return "Réécriture en cours…";
    return "Finalisation…";
  };

  // Elapsed timers for each operation
  const suggestElapsed = useElapsedTimer(suggestLoading);
  const statsElapsed = useElapsedTimer(statsLoadingIdx !== null);
  const importStatsElapsed = useElapsedTimer(importStatsLoading);
  const generateElapsed = useElapsedTimer(generateLoading);
  const hookRefineElapsed = useElapsedTimer(hookRefineLoading);
  const importElapsed = useElapsedTimer(importLoading);
  const refineElapsed = useElapsedTimer(refineLoading);

  // ─── Load sources ─────────────────────────────────────

  const loadSources = useCallback(async () => {
    setSourcesLoading(true);
    try {
      const res = await fetch("/api/linkedin/sources");
      const json = await res.json();
      let data = json.data || [];
      if (data.length === 0) {
        // Seed initial sources
        await fetch("/api/linkedin/sources/seed", { method: "POST" });
        const res2 = await fetch("/api/linkedin/sources");
        const json2 = await res2.json();
        data = json2.data || [];
      }
      setSources(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setSourcesLoading(false);
    }
  }, []);

  useEffect(() => { loadSources(); }, [loadSources]);

  // ─── Filtered sources for selected theme ──────────────

  const themeSources = sources.filter((s) => selectedTheme && s.themes.includes(selectedTheme));

  // ─── Actions ──────────────────────────────────────────

  const handleSelectTheme = (themeKey: string) => {
    setSelectedTheme(themeKey);
    setSelectedSubject(null);
    setSubjects([]);
    setCustomSubject("");
    setGeneratedPost("");
    setHooks([]);
    setSelectedHook(null);
    setImagePrompt("");
    setError(null);
    setSelectedSourceIds(new Set());
    setImportPost("");
    setImportContext("");
  };

  const handleModeSwitch = (newMode: Mode) => {
    setMode(newMode);
    setSelectedTheme(null);
    setSelectedSubject(null);
    setSubjects([]);
    setCustomSubject("");
    setGeneratedPost("");
    setHooks([]);
    setSelectedHook(null);
    setImagePrompt("");
    setError(null);
    setSelectedSourceIds(new Set());
    setImportPost("");
    setImportContext("");
  };

  const handleImportGenerate = async () => {
    if (!importPost.trim()) return;
    if (importType === "inspiration" && !selectedTheme) { setError("Choisis un thème pour l'inspiration"); return; }

    setImportLoading(true);
    setGeneratedPost("");
    setHooks([]);
    setSelectedHook(null);
    setError(null);

    try {
      const action = importType === "event" ? "import-event" : "import-inspiration";
      const res = await fetch("/api/linkedin/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          originalPost: importPost,
          theme: selectedTheme || undefined,
          context: importContext || undefined,
        }),
      });
      const json = await res.json();
      if (json.error) { setError(json.error); return; }
      const post = json.data?.post || "";
      const imgPrompt = json.data?.imagePrompt || "";
      setGeneratedPost(post);
      setImagePrompt(imgPrompt);
      // Auto-generate hooks
      if (post) {
        setHooksLoading(true);
        try {
          const hRes = await fetch("/api/linkedin/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "hooks", post }),
          });
          const hJson = await hRes.json();
          const hooksList = hJson.data?.hooks || [];
          setHooks(hooksList);
          if (hooksList.length > 0) setSelectedHook(hooksList[0]);
        } catch { /* ignore */ }
        finally { setHooksLoading(false); }
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setImportLoading(false);
    }
  };

  const handleImportSearchStats = async () => {
    if (!generatedPost) return;
    setImportStatsLoading(true);
    setImportStatsDetail("🌐 Recherche web via gpt-5.4…");
    setImportStats([]);
    setSelectedStats(new Set());
    try {
      // Use the first 80 chars of the post as subject for stats search
      const subject = generatedPost.split("\n").filter(Boolean).slice(0, 2).join(" ").slice(0, 120);
      const res = await fetch("/api/linkedin/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "search-stats", theme: selectedTheme || "ia-formation", subject }),
      });
      const json = await res.json();
      const stats = json.data?.stats || [];
      const src = json.data?.statsSource || "web";
      if (stats.length > 0) {
        setImportStatsDetail(src === "web" ? `✅ ${stats.length} stats trouvées via web` : `🧠 ${stats.length} stats (base IA)`);
      } else {
        setImportStatsDetail("⚠️ Aucune stat trouvée");
      }
      setImportStats(stats);
    } catch (err) {
      setImportStatsDetail("❌ Erreur de recherche");
      setError(String(err));
    } finally {
      setImportStatsLoading(false);
    }
  };

  const handleImportIntegrateStats = () => {
    if (selectedStats.size === 0 || !generatedPost) return;
    const statsBlock = Array.from(selectedStats).map((s) => `📊 ${s}`).join("\n");
    const lines = generatedPost.split("\n");
    const lastNonEmpty = lines.length - 1;
    lines.splice(Math.max(lastNonEmpty - 1, 1), 0, "\n" + statsBlock + "\n");
    setGeneratedPost(lines.join("\n"));
    setSelectedStats(new Set());
  };

  const updateStep = (idx: number, updates: Partial<LoadingStep>) => {
    setLoadingSteps((prev) => prev.map((s, i) => i === idx ? { ...s, ...updates } : s));
  };

  const handleScrapeAndSuggest = async () => {
    if (!selectedTheme) return;
    const selectedUrls = themeSources.filter((s) => selectedSourceIds.has(s.id)).map((s) => s.url);
    const sourceCount = selectedUrls.length;

    setSuggestLoading(true);
    setSubjects([]);
    setError(null);

    try {
      if (sourceCount > 0) {
        // Decomposed parallel loading: 2 separate API calls
        setLoadingSteps([
          { label: `🧠 Base IA (gpt-5.2) — ${sourceCount} source(s)`, status: "loading" },
          { label: `🌐 Temps réel (gpt-5.4 + web) — ${sourceCount} source(s)`, status: "loading" },
        ]);

        const allSubjects: SubjectItem[] = [];
        const payload = { theme: selectedTheme, sourceUrls: selectedUrls };

        // Launch both in parallel
        const [fastRes, realtimeRes] = await Promise.allSettled([
          // Fast: gpt-5.2-chat (~5s)
          (async () => {
            const res = await fetch("/api/linkedin/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...payload, action: "suggest-fast" }),
            });
            const json = await res.json();
            const items: SubjectItem[] = (json.data?.subjects || []).map((s: SubjectItem | string) =>
              typeof s === "string" ? { title: s, angle: "", source: "🧠 Base IA" } : s
            );
            const ms = json.data?.durationMs || 0;
            updateStep(0, { status: "done", detail: `${items.length} sujets en ${(ms / 1000).toFixed(1)}s` });
            return items;
          })(),

          // Real-time: gpt-5.4-pro + web_search (~30-50s)
          (async () => {
            const res = await fetch("/api/linkedin/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...payload, action: "suggest-realtime" }),
            });
            const json = await res.json();
            const items: SubjectItem[] = (json.data?.subjects || []).map((s: SubjectItem | string) =>
              typeof s === "string" ? { title: s, angle: "", source: "🌐 Temps réel" } : s
            );
            const ms = json.data?.durationMs || 0;
            if (items.length > 0) {
              updateStep(1, { status: "done", detail: `${items.length} sujets en ${(ms / 1000).toFixed(1)}s` });
            } else {
              updateStep(1, { status: "error", detail: json.error || `Aucun résultat (${(ms / 1000).toFixed(1)}s)` });
            }
            return items;
          })(),
        ]);

        // Collect results — fast first (appears sooner)
        if (fastRes.status === "fulfilled") allSubjects.push(...fastRes.value);
        else updateStep(0, { status: "error", detail: "Erreur réseau" });

        if (realtimeRes.status === "fulfilled") allSubjects.push(...realtimeRes.value);
        else updateStep(1, { status: "error", detail: "Timeout ou erreur réseau" });

        // Progressively add fast subjects as soon as they arrive
        setSubjects(allSubjects);
      } else {
        // No sources selected — simple suggest via gpt-5.2-chat
        setLoadingSteps([{ label: "🧠 Génération de sujets (gpt-5.2)", status: "loading" }]);
        const res = await fetch("/api/linkedin/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "suggest", theme: selectedTheme }),
        });
        const json = await res.json();
        if (json.error) { setError(json.error); updateStep(0, { status: "error", detail: json.error }); return; }
        const items = json.data?.subjects || [];
        setSubjects(items.map((s: string) => ({ title: s, angle: "" })));
        updateStep(0, { status: "done", detail: `${items.length} sujets` });
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setSuggestLoading(false);
    }
  };

  const handleGenerate = async () => {
    const subject = selectedSubject || customSubject;
    if (!selectedTheme || !subject) return;

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
      if (json.error) { setError(json.error); } else {
        setGeneratedPost(json.data?.post || generatedPost);
        setRefineInstructions("");
      }
    } catch (err) { setError(String(err)); }
    finally { setRefineLoading(false); }
  };

  const handleSearchStats = async (subjectIdx: number) => {
    if (!selectedTheme) return;
    const subject = subjects[subjectIdx];
    if (!subject) return;
    setStatsLoadingIdx(subjectIdx);
    setStatsSearchDetail("🌐 Recherche web via gpt-5.4…");
    setSelectedStats(new Set());
    setError(null);
    try {
      const res = await fetch("/api/linkedin/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "search-stats", theme: selectedTheme, subject: subject.title }),
      });
      const json = await res.json();
      const stats = json.data?.stats || [];
      const src = json.data?.statsSource || "web";
      if (stats.length > 0) {
        setStatsSearchDetail(src === "web" ? `✅ ${stats.length} stats trouvées via web` : `🧠 ${stats.length} stats (base IA, web indisponible)`);
      } else {
        setStatsSearchDetail("⚠️ Aucune stat trouvée");
      }
      if (json.error) setError(json.error);
      setSubjects((prev) => prev.map((s, i) => i === subjectIdx ? { ...s, stats } : s));
    } catch (err) {
      setStatsSearchDetail("❌ Erreur de recherche");
      setError(String(err));
    } finally {
      setStatsLoadingIdx(null);
    }
  };

  const toggleStat = (statText: string) => {
    setSelectedStats((prev) => {
      const next = new Set(prev);
      if (next.has(statText)) next.delete(statText); else next.add(statText);
      return next;
    });
  };

  const handleIntegrateStats = () => {
    if (selectedStats.size === 0 || !generatedPost) return;
    const statsBlock = Array.from(selectedStats).map((s) => `📊 ${s}`).join("\n");
    // Insert stats before the last paragraph (usually the question + hashtags)
    const lines = generatedPost.split("\n");
    const lastNonEmpty = lines.length - 1;
    lines.splice(Math.max(lastNonEmpty - 1, 1), 0, "\n" + statsBlock + "\n");
    setGeneratedPost(lines.join("\n"));
    setSelectedStats(new Set());
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
    const finalPost = selectedHook
      ? selectedHook + "\n\n" + generatedPost.split("\n").slice(2).join("\n")
      : generatedPost;
    navigator.clipboard.writeText(finalPost);
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

  const handleAddSource = async () => {
    if (!newSourceName || !newSourceUrl || newSourceThemes.size === 0) return;
    try {
      await fetch("/api/linkedin/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newSourceName, url: newSourceUrl, themes: [...newSourceThemes], type: newSourceType }),
      });
      setNewSourceName("");
      setNewSourceUrl("");
      setNewSourceThemes(new Set());
      setShowAddSource(false);
      loadSources();
    } catch (err) { setError(String(err)); }
  };

  const handleDeleteSource = async (id: string) => {
    try {
      await fetch("/api/linkedin/sources", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      loadSources();
    } catch (err) { setError(String(err)); }
  };

  const handleToggleSourceTheme = async (sourceId: string, themeKey: string) => {
    const source = sources.find((s) => s.id === sourceId);
    if (!source) return;
    const hasTheme = source.themes.includes(themeKey);
    // Must keep at least 1 theme
    if (hasTheme && source.themes.length <= 1) return;
    const newThemes = hasTheme ? source.themes.filter((t) => t !== themeKey) : [...source.themes, themeKey];
    try {
      await fetch("/api/linkedin/sources", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sourceId, themes: newThemes }),
      });
      setSources((prev) => prev.map((s) => s.id === sourceId ? { ...s, themes: newThemes } : s));
    } catch (err) { setError(String(err)); }
  };

  const handleSelectAllSources = () => {
    if (selectedSourceIds.size === themeSources.length) {
      setSelectedSourceIds(new Set());
    } else {
      setSelectedSourceIds(new Set(themeSources.map((s) => s.id)));
    }
  };

  const handleSchedulePost = async () => {
    if (!generatedPost || !scheduleDate || !scheduleTime) return;
    setScheduleLoading(true);
    try {
      const subject = selectedSubject || customSubject || "Post LinkedIn";
      const finalPost = selectedHook
        ? selectedHook + "\n\n" + generatedPost.split("\n").slice(2).join("\n")
        : generatedPost;
      await fetch("/api/linkedin/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: subject.slice(0, 80),
          content: finalPost,
          theme: selectedTheme,
          hook: selectedHook || "",
          publishDate: scheduleDate,
          publishTime: scheduleTime,
          imagePrompt,
        }),
      });
      setShowSchedule(false);
      onPostValidated?.();
    } catch (err) { setError(String(err)); }
    finally { setScheduleLoading(false); }
  };

  const activeSubject = selectedSubject || customSubject;

  // ─── Render ───────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 sm:p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-800">Erreur</p>
            <p className="text-xs text-red-600 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* ─── Step 1: Mode + Theme ─────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-gray-800 mb-1">Étape 1 — Mode</h2>
        <p className="text-xs text-gray-400 mb-3">Crée un post original ou importe une inspiration</p>

        {/* Mode toggle */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => handleModeSwitch("create")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all cursor-pointer",
              mode === "create"
                ? "border-blue-500 bg-blue-50 text-blue-800 ring-2 ring-blue-200"
                : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
            )}
          >
            <Sparkles className="w-4 h-4" />
            Créer un post
          </button>
          <button
            onClick={() => handleModeSwitch("import")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all cursor-pointer",
              mode === "import"
                ? "border-purple-500 bg-purple-50 text-purple-800 ring-2 ring-purple-200"
                : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
            )}
          >
            <Download className="w-4 h-4" />
            Importer une inspiration
          </button>
        </div>

        {/* Theme selection — shown for both modes (for create always, for import only in inspiration) */}
        {(mode === "create" || (mode === "import" && importType === "inspiration")) && (
          <>
            <p className="text-[10px] text-gray-400 uppercase font-semibold mb-2">
              {mode === "create" ? "Choisis un thème éditorial" : "Thème pour adapter l'inspiration"}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {THEMES.map((t) => (
                <button
                  key={t.key}
                  onClick={() => handleSelectTheme(t.key)}
                  className={cn(
                    "text-left p-3 sm:p-4 rounded-xl border-2 transition-all cursor-pointer",
                    selectedTheme === t.key
                      ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200"
                      : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                  )}
                >
                  <span className="text-lg">{t.emoji}</span>
                  <h3 className="text-sm font-semibold text-gray-800 mt-1">{t.name}</h3>
                  <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">{t.desc}</p>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ─── Import mode: paste post + options ────────── */}
      {mode === "import" && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-1">Étape 2 — Importer un post</h2>
          <p className="text-xs text-gray-400 mb-3">Copie-colle un post LinkedIn existant</p>

          {/* Import type selector */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => { setImportType("event"); setSelectedTheme(null); }}
              className={cn(
                "flex-1 text-left p-3 rounded-xl border-2 transition-all cursor-pointer",
                importType === "event"
                  ? "border-amber-500 bg-amber-50 ring-1 ring-amber-200"
                  : "border-gray-200 bg-white hover:border-gray-300"
              )}
            >
              <span className="text-lg">🎤</span>
              <h3 className="text-sm font-semibold text-gray-800 mt-1">Événement</h3>
              <p className="text-[10px] text-gray-500 mt-1">Post d&apos;un event où Metagora était présent → le transformer en discours Metagora</p>
            </button>
            <button
              onClick={() => setImportType("inspiration")}
              className={cn(
                "flex-1 text-left p-3 rounded-xl border-2 transition-all cursor-pointer",
                importType === "inspiration"
                  ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-200"
                  : "border-gray-200 bg-white hover:border-gray-300"
              )}
            >
              <span className="text-lg">💡</span>
              <h3 className="text-sm font-semibold text-gray-800 mt-1">Inspiration</h3>
              <p className="text-[10px] text-gray-500 mt-1">Post inspirant → l&apos;adapter au style Tony / Metagora sur un thème choisi</p>
            </button>
          </div>

          {/* Paste area */}
          <textarea
            value={importPost}
            onChange={(e) => setImportPost(e.target.value)}
            placeholder="Colle le post LinkedIn ici..."
            rows={6}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-300 outline-none resize-y mb-3"
          />

          {/* Optional context */}
          <input
            type="text"
            value={importContext}
            onChange={(e) => setImportContext(e.target.value)}
            placeholder={importType === "event" ? "Contexte : ton rôle à l'event, avec qui tu étais, ce que tu as retenu..." : "Angle souhaité, point de vue perso, ce qui t'a marqué..."}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-300 outline-none mb-4"
          />

          <button
            onClick={handleImportGenerate}
            disabled={!importPost.trim() || importLoading || (importType === "inspiration" && !selectedTheme)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-purple-600 rounded-xl hover:bg-purple-700 disabled:opacity-50 transition-colors cursor-pointer shadow-sm"
          >
            {importLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {importLoading ? "Transformation en cours…" : importType === "event" ? "Transformer en post Metagora" : "Adapter à mon style"}
          </button>
          {importLoading && (
            <div className="mt-2 space-y-1">
              <div className="flex items-center gap-2 text-xs text-purple-600">
                <span className="font-medium">{getGeneratePhase(importElapsed)}</span>
                <span className="ml-auto tabular-nums text-purple-400">{importElapsed}s</span>
              </div>
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-purple-400 rounded-full transition-all duration-1000" style={{ width: `${Math.min(95, Math.round((importElapsed / 15) * 100))}%` }} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Step 2 (create mode): Sources ─────────────── */}
      {mode === "create" && selectedTheme && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">Étape 2 — Sources</h2>
              <p className="text-xs text-gray-400">Coche les sources à analyser (optionnel)</p>
            </div>
            <div className="flex items-center gap-3">
              {themeSources.length > 0 && (
                <button
                  onClick={handleSelectAllSources}
                  className="text-xs font-medium text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  {selectedSourceIds.size === themeSources.length ? "Tout décocher" : "Tout cocher"}
                </button>
              )}
              <button
                onClick={() => setShowAddSource(!showAddSource)}
                className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Ajouter
              </button>
            </div>
          </div>

          {/* Add source form */}
          {showAddSource && (
            <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-2">
              <input
                type="text"
                value={newSourceName}
                onChange={(e) => setNewSourceName(e.target.value)}
                placeholder="Nom du site"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-300"
              />
              <input
                type="url"
                value={newSourceUrl}
                onChange={(e) => setNewSourceUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-300"
              />
              <div className="flex flex-wrap gap-2">
                {THEMES.map((t) => (
                  <label key={t.key} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newSourceThemes.has(t.key)}
                      onChange={() => {
                        const next = new Set(newSourceThemes);
                        next.has(t.key) ? next.delete(t.key) : next.add(t.key);
                        setNewSourceThemes(next);
                      }}
                      className="rounded"
                    />
                    {t.emoji} {t.name}
                  </label>
                ))}
                <label className="flex items-center gap-1.5 text-xs cursor-pointer ml-3">
                  <input type="checkbox" checked={newSourceType === "youtube"} onChange={() => setNewSourceType(newSourceType === "youtube" ? "site" : "youtube")} className="rounded" />
                  YouTube
                </label>
              </div>
              <button onClick={handleAddSource} className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 cursor-pointer">
                Ajouter
              </button>
            </div>
          )}

          {/* Sources list */}
          {sourcesLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-3"><Loader2 className="w-4 h-4 animate-spin" /> Chargement…</div>
          ) : themeSources.length === 0 ? (
            <p className="text-xs text-gray-400 py-3">Aucune source pour ce thème. Ajoute-en une !</p>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {themeSources.map((s) => (
                <div key={s.id} className="group">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedSourceIds.has(s.id)}
                      onChange={() => {
                        const next = new Set(selectedSourceIds);
                        next.has(s.id) ? next.delete(s.id) : next.add(s.id);
                        setSelectedSourceIds(next);
                      }}
                      className="rounded flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm text-gray-700 truncate">{s.name}</span>
                      {s.themes.map((tk) => {
                        const t = THEMES.find((th) => th.key === tk);
                        return t ? (
                          <span key={tk} className={cn(
                            "text-[9px] font-semibold px-1.5 py-0.5 rounded-full",
                            tk === "journal-ceo" ? "bg-amber-100 text-amber-700" :
                            tk === "ia-formation" ? "bg-blue-100 text-blue-700" :
                            tk === "evenement" ? "bg-purple-100 text-purple-700" :
                            "bg-emerald-100 text-emerald-700"
                          )}>{t.emoji}</span>
                        ) : null;
                      })}
                    </div>
                    <button onClick={() => setEditingSourceId(editingSourceId === s.id ? null : s.id)} className="text-gray-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 flex-shrink-0 cursor-pointer" title="Modifier les thèmes">
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-blue-500 flex-shrink-0">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button onClick={() => handleDeleteSource(s.id)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 flex-shrink-0 cursor-pointer">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {/* Inline theme editing */}
                  {editingSourceId === s.id && (
                    <div className="ml-6 mt-1 flex flex-wrap gap-1.5 pb-1">
                      {THEMES.map((t) => (
                        <button
                          key={t.key}
                          onClick={() => handleToggleSourceTheme(s.id, t.key)}
                          className={cn(
                            "text-[10px] font-medium px-2 py-0.5 rounded-full border transition-colors cursor-pointer",
                            s.themes.includes(t.key)
                              ? t.key === "journal-ceo" ? "bg-amber-100 text-amber-700 border-amber-300" :
                                t.key === "ia-formation" ? "bg-blue-100 text-blue-700 border-blue-300" :
                                t.key === "evenement" ? "bg-purple-100 text-purple-700 border-purple-300" :
                                "bg-emerald-100 text-emerald-700 border-emerald-300"
                              : "bg-gray-50 text-gray-400 border-gray-200 hover:border-gray-300"
                          )}
                        >
                          {t.emoji} {t.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Generate subjects button */}
          <button
            onClick={handleScrapeAndSuggest}
            disabled={suggestLoading}
            className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer shadow-sm"
          >
            {suggestLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {suggestLoading ? "Analyse en cours…" : selectedSourceIds.size > 0 ? `Analyser ${selectedSourceIds.size} source(s) → 5 sujets` : "Suggérer des sujets (sans sources)"}
          </button>

          {/* Decomposed loading progress with phases + timer + % */}
          {suggestLoading && loadingSteps.length > 0 && (
            <div className="mt-3 space-y-3 bg-gray-50 rounded-lg p-3 border border-gray-200">
              <p className="text-[10px] text-gray-400 uppercase font-semibold mb-1">Progression de l&apos;analyse — {suggestElapsed}s</p>
              {loadingSteps.map((step, i) => {
                const model = i === 0 ? "fast" as const : "realtime" as const;
                const estTotal = model === "fast" ? 12 : 45;
                const pct = step.status === "done" ? 100 : step.status === "error" ? 100 : Math.min(95, Math.round((suggestElapsed / estTotal) * 100));
                return (
                  <div key={i}>
                    <div className="flex items-center gap-2 text-xs">
                      {step.status === "loading" && <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin flex-shrink-0" />}
                      {step.status === "done" && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />}
                      {step.status === "error" && <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
                      {step.status === "pending" && <Clock className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />}
                      <span className={cn(
                        "font-medium",
                        step.status === "loading" ? "text-blue-700" :
                        step.status === "done" ? "text-green-700" :
                        step.status === "error" ? "text-red-500" :
                        "text-gray-400"
                      )}>{step.label}</span>
                      <span className={cn(
                        "text-[10px] ml-auto tabular-nums",
                        step.status === "done" ? "text-green-500" : step.status === "error" ? "text-red-400" : "text-blue-400"
                      )}>
                        {step.detail || (step.status === "loading" ? `${pct}%` : "")}
                      </span>
                    </div>
                    {step.status === "loading" && (
                      <>
                        <div className="ml-6 mt-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-400 rounded-full transition-all duration-1000" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="ml-6 mt-0.5 text-[10px] text-gray-400 italic">{getAnalysisPhase(suggestElapsed, model)}</p>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── Step 3: Subjects ────────────────────────── */}
      {subjects.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-1">Étape 3 — Choisis un sujet</h2>
          <p className="text-xs text-gray-400 mb-3">{subjects.length} sujets proposés</p>

          <div className="space-y-2 mb-4 max-h-[28rem] overflow-y-auto">
            {subjects.map((s, i) => (
              <div key={i} className={cn(
                "w-full text-left rounded-lg border transition-all",
                selectedSubject === s.title
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50/50"
              )}>
                <button
                  onClick={() => {
                    setSelectedSubject(s.title);
                    setCustomSubject("");
                    // Auto-select all stats for this subject
                    if (s.stats && s.stats.length > 0) {
                      setSelectedStats(new Set(s.stats.map((st) => st.text)));
                    }
                  }}
                  className="w-full text-left flex items-start gap-3 px-3 py-2.5 cursor-pointer"
                >
                  <ChevronRight className={cn("w-4 h-4 flex-shrink-0 mt-0.5 transition-transform", selectedSubject === s.title && "text-blue-500 rotate-90")} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn("text-sm", selectedSubject === s.title ? "text-blue-800" : "text-gray-700")}>{s.title}</span>
                      {s.source && (
                        <span className={cn(
                          "text-[9px] px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0",
                          s.source.includes("Temps") ? "bg-green-100 text-green-700" : "bg-purple-100 text-purple-700"
                        )}>{s.source}</span>
                      )}
                    </div>
                    {s.angle && <span className="text-[10px] text-gray-400 block mt-0.5">{s.angle}</span>}
                    {s.url && (
                      <a href={s.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-[10px] text-blue-500 hover:text-blue-700 mt-0.5">
                        <ExternalLink className="w-3 h-3" />{s.url.length > 60 ? s.url.slice(0, 60) + "…" : s.url}
                      </a>
                    )}
                  </div>
                </button>

                {/* Enrichir button + stats display */}
                <div className="px-3 pb-2.5 pl-10">
                  {!s.stats && statsLoadingIdx !== i && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleSearchStats(i); }}
                      disabled={statsLoadingIdx !== null}
                      className="inline-flex items-center gap-1.5 text-[10px] font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md px-2 py-1 cursor-pointer disabled:opacity-50 transition-colors"
                    >
                      <BarChart3 className="w-3 h-3" />
                      🔍 Enrichir avec stats
                    </button>
                  )}
                  {statsLoadingIdx === i && (
                    <div className="py-1 space-y-1">
                      <div className="flex items-center gap-2 text-[10px] text-blue-600">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span className="font-medium">{getStatsPhase(statsElapsed)}</span>
                        <span className="ml-auto tabular-nums text-blue-400">{statsElapsed}s</span>
                      </div>
                      <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-400 rounded-full transition-all duration-1000" style={{ width: `${Math.min(95, Math.round((statsElapsed / 35) * 100))}%` }} />
                      </div>
                    </div>
                  )}
                  {s.stats && s.stats.length > 0 && (
                    <div className="mt-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-semibold text-amber-700 uppercase">{statsSearchDetail || `${s.stats.length} stats trouvées`}</span>
                        {generatedPost && selectedStats.size > 0 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleIntegrateStats(); }}
                            className="text-[9px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded px-2 py-0.5 cursor-pointer transition-colors"
                          >
                            ✚ Intégrer {selectedStats.size} stat(s) au post
                          </button>
                        )}
                      </div>
                      {s.stats.map((st, j) => (
                        <button
                          key={j}
                          onClick={(e) => { e.stopPropagation(); toggleStat(st.text); }}
                          className={cn(
                            "w-full text-left flex items-start gap-1.5 text-[10px] rounded px-2 py-1.5 border transition-all cursor-pointer",
                            selectedStats.has(st.text)
                              ? "bg-blue-50 border-blue-300 text-blue-800"
                              : "bg-white border-gray-100 text-gray-600 hover:border-blue-200"
                          )}
                        >
                          <div className={cn(
                            "w-3.5 h-3.5 rounded border flex-shrink-0 mt-0.5 flex items-center justify-center",
                            selectedStats.has(st.text) ? "bg-blue-600 border-blue-600" : "border-gray-300"
                          )}>
                            {selectedStats.has(st.text) && <Check className="w-2.5 h-2.5 text-white" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <span>{st.text}</span>
                            {(st.url || st.source) && (
                              <span className="ml-1 text-[9px]">
                                {st.url ? (
                                  <a href={st.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-0.5 text-blue-500 hover:text-blue-700">
                                    <ExternalLink className="w-2.5 h-2.5" />{st.source || "source"}
                                  </a>
                                ) : (
                                  <span className="text-gray-400">{st.source}</span>
                                )}
                              </span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {s.stats && s.stats.length === 0 && (
                    <div className="flex items-center gap-1.5 text-[10px] text-gray-400 italic py-1">
                      <AlertCircle className="w-3 h-3" />
                      <span>{statsSearchDetail || "Aucune stat trouvée pour ce sujet"}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-[10px] text-gray-400 uppercase font-medium">ou écris ton sujet</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <input
            type="text"
            value={customSubject}
            onChange={(e) => { setCustomSubject(e.target.value); setSelectedSubject(null); }}
            placeholder="Ex: Comment j'ai découvert que 49% des GenZ achètent des dupes..."
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-300 outline-none"
          />

          <div className="flex items-center gap-3 mt-3">
            <button onClick={handleScrapeAndSuggest} disabled={suggestLoading} className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium cursor-pointer">
              <RefreshCw className={cn("w-3.5 h-3.5", suggestLoading && "animate-spin")} />
              Autres sujets
            </button>
          </div>

          <button
            onClick={handleGenerate}
            disabled={!activeSubject || generateLoading}
            className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer shadow-sm"
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

      {/* ─── Import mode: Stats enrichment ──────────────── */}
      {mode === "import" && generatedPost && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-1">Étape 3 — Enrichir avec des stats</h2>
          <p className="text-xs text-gray-400 mb-3">Recherche de statistiques sourcées pour renforcer ton post (optionnel)</p>

          {importStats.length === 0 && !importStatsLoading && (
            <button
              onClick={handleImportSearchStats}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg cursor-pointer transition-colors"
            >
              <BarChart3 className="w-4 h-4" />
              🔍 Rechercher des stats
            </button>
          )}

          {importStatsLoading && (
            <div className="py-2 space-y-1.5">
              <div className="flex items-center gap-2 text-sm text-blue-600">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="font-medium">{getStatsPhase(importStatsElapsed)}</span>
                <span className="ml-auto tabular-nums text-xs text-blue-400">{importStatsElapsed}s</span>
              </div>
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-blue-400 rounded-full transition-all duration-1000" style={{ width: `${Math.min(95, Math.round((importStatsElapsed / 35) * 100))}%` }} />
              </div>
            </div>
          )}

          {!importStatsLoading && importStatsDetail && (
            <p className="text-xs text-gray-500 mb-2">{importStatsDetail}</p>
          )}

          {importStats.length > 0 && (
            <div className="space-y-1.5 mt-2">
              {selectedStats.size > 0 && (
                <button
                  onClick={handleImportIntegrateStats}
                  className="mb-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded px-3 py-1.5 cursor-pointer transition-colors"
                >
                  ✚ Intégrer {selectedStats.size} stat(s) au post
                </button>
              )}
              {importStats.map((st, j) => (
                <button
                  key={j}
                  onClick={() => toggleStat(st.text)}
                  className={cn(
                    "w-full text-left flex items-start gap-2 text-xs rounded-lg px-3 py-2 border transition-all cursor-pointer",
                    selectedStats.has(st.text)
                      ? "bg-blue-50 border-blue-300 text-blue-800"
                      : "bg-white border-gray-100 text-gray-600 hover:border-blue-200"
                  )}
                >
                  <div className={cn(
                    "w-4 h-4 rounded border flex-shrink-0 mt-0.5 flex items-center justify-center",
                    selectedStats.has(st.text) ? "bg-blue-600 border-blue-600" : "border-gray-300"
                  )}>
                    {selectedStats.has(st.text) && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span>{st.text}</span>
                    {(st.url || st.source) && (
                      <span className="ml-1 text-[9px]">
                        {st.url ? (
                          <a href={st.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-0.5 text-blue-500 hover:text-blue-700">
                            <ExternalLink className="w-2.5 h-2.5" />{st.source || "source"}
                          </a>
                        ) : (
                          <span className="text-gray-400">{st.source}</span>
                        )}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Step 4: Hooks ───────────────────────────── */}
      {generatedPost && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-1">{mode === "import" ? "Étape 4" : "Étape 4"} — Choisis une accroche</h2>
          <p className="text-xs text-gray-400 mb-3">Les 2-3 premières lignes visibles avant "…voir plus"</p>

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
