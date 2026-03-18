"use client";

import { useState } from "react";
import {
  Linkedin,
  Sparkles,
  Loader2,
  Copy,
  Check,
  RefreshCw,
  Send,
  ImageIcon,
  Search,
  Download,
  AlertCircle,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Navbar from "@/components/Navbar";

// ─── Theme definitions ───────────────────────────────────

const THEMES = [
  {
    key: "journal-ceo",
    emoji: "1️⃣",
    name: "Journal d'un CEO",
    desc: "Rencontres retail/luxe, bonnes pratiques, personnes et marques inspirantes",
    color: "amber",
  },
  {
    key: "ia-formation",
    emoji: "2️⃣",
    name: "IA dans la formation",
    desc: "15 ans d'expertise learning → interactif boosté IA, visions & connaissances",
    color: "blue",
  },
  {
    key: "ia-operationnelle",
    emoji: "3️⃣",
    name: "IA Opérationnelle",
    desc: "Vulgarisation IA (agentique, LLM) → exploitation réelle chez Metagora",
    color: "emerald",
  },
];

// ─── Component ───────────────────────────────────────────

export default function LinkedInPage() {
  // Theme & subject selection
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [suggestedSubjects, setSuggestedSubjects] = useState<string[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [customSubject, setCustomSubject] = useState("");

  // Post generation
  const [generatedPost, setGeneratedPost] = useState("");
  const [generateLoading, setGenerateLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Refinement
  const [refineInstructions, setRefineInstructions] = useState("");
  const [refineLoading, setRefineLoading] = useState(false);

  // Image search
  const [imageQuery, setImageQuery] = useState("");
  const [imageResults, setImageResults] = useState<{ url: string; thumb: string; alt: string; photographer: string; link: string }[]>([]);
  const [imageLoading, setImageLoading] = useState(false);

  // Error
  const [error, setError] = useState<string | null>(null);

  // ─── Actions ──────────────────────────────────────────

  const handleSelectTheme = async (themeKey: string) => {
    setSelectedTheme(themeKey);
    setSelectedSubject(null);
    setSuggestedSubjects([]);
    setCustomSubject("");
    setGeneratedPost("");
    setError(null);

    // Auto-suggest subjects
    setSuggestLoading(true);
    try {
      const res = await fetch("/api/linkedin/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "suggest", theme: themeKey }),
      });
      const json = await res.json();
      if (json.error) {
        setError(json.error);
      } else {
        setSuggestedSubjects(json.data?.subjects || []);
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
    try {
      const res = await fetch("/api/linkedin/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", theme: selectedTheme, subject }),
      });
      const json = await res.json();
      if (json.error) {
        setError(json.error);
      } else {
        setGeneratedPost(json.data?.post || "");
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
        body: JSON.stringify({
          action: "refine",
          currentPost: generatedPost,
          instructions: refineInstructions,
        }),
      });
      const json = await res.json();
      if (json.error) {
        setError(json.error);
      } else {
        setGeneratedPost(json.data?.post || generatedPost);
        setRefineInstructions("");
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setRefineLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedPost);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleImageSearch = async () => {
    if (!imageQuery.trim()) return;
    setImageLoading(true);
    setImageResults([]);
    setError(null);
    try {
      const res = await fetch("/api/linkedin/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: imageQuery }),
      });
      const json = await res.json();
      if (json.error) {
        setError(json.error);
      } else {
        setImageResults(json.data || []);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setImageLoading(false);
    }
  };

  const activeSubject = selectedSubject || customSubject;

  return (
    <>
      <Navbar />
      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6 sm:mb-8">
          <div className="w-9 h-9 sm:w-10 sm:h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Linkedin className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-gray-900">LinkedIn Post Generator</h1>
            <p className="text-xs sm:text-sm text-gray-500">Génère des posts LinkedIn à partir de ta ligne éditoriale</p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-800">Erreur</p>
              <p className="text-xs text-red-600 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* ─── Step 1: Choose theme ─────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-1">Étape 1 — Choisis un thème</h2>
          <p className="text-xs text-gray-400 mb-4">Basé sur ta ligne éditoriale</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {THEMES.map((t) => (
              <button
                key={t.key}
                onClick={() => handleSelectTheme(t.key)}
                className={cn(
                  "text-left p-4 rounded-xl border-2 transition-all cursor-pointer",
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
        </div>

        {/* ─── Step 2: Choose or write a subject ────────── */}
        {selectedTheme && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
            <h2 className="text-sm font-semibold text-gray-800 mb-1">Étape 2 — Choisis un sujet</h2>
            <p className="text-xs text-gray-400 mb-4">Suggestions IA ou écris ton propre sujet</p>

            {suggestLoading ? (
              <div className="flex items-center gap-2 text-sm text-blue-600 py-4">
                <Loader2 className="w-4 h-4 animate-spin" />
                L&apos;IA réfléchit à des sujets...
              </div>
            ) : (
              <>
                {suggestedSubjects.length > 0 && (
                  <div className="space-y-2 mb-4">
                    {suggestedSubjects.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => { setSelectedSubject(s); setCustomSubject(""); }}
                        className={cn(
                          "w-full text-left flex items-center gap-3 px-4 py-3 rounded-lg border transition-all cursor-pointer",
                          selectedSubject === s
                            ? "border-blue-500 bg-blue-50 text-blue-800"
                            : "border-gray-200 bg-gray-50 text-gray-700 hover:border-blue-300 hover:bg-blue-50/50"
                        )}
                      >
                        <ChevronRight className={cn("w-4 h-4 flex-shrink-0 transition-transform", selectedSubject === s && "text-blue-500 rotate-90")} />
                        <span className="text-sm">{s}</span>
                      </button>
                    ))}
                  </div>
                )}

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
                  className="w-full px-4 py-3 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
                />

                {/* Refresh suggestions */}
                <button
                  onClick={() => handleSelectTheme(selectedTheme)}
                  disabled={suggestLoading}
                  className="mt-3 flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Nouvelles suggestions
                </button>
              </>
            )}

            {/* Generate button */}
            <button
              onClick={handleGenerate}
              disabled={!activeSubject || generateLoading}
              className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer shadow-sm"
            >
              {generateLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {generateLoading ? "Rédaction en cours..." : "Générer le post"}
            </button>
          </div>
        )}

        {/* ─── Step 3: Generated post ───────────────────── */}
        {generatedPost && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-800">Étape 3 — Ton post LinkedIn</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copié !" : "Copier"}
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={generateLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  <RefreshCw className={cn("w-3.5 h-3.5", generateLoading && "animate-spin")} />
                  Regénérer
                </button>
              </div>
            </div>

            {/* Editable post */}
            <textarea
              value={generatedPost}
              onChange={(e) => setGeneratedPost(e.target.value)}
              rows={16}
              className="w-full px-4 py-3 text-sm text-gray-800 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none resize-y leading-relaxed font-[system-ui]"
            />

            <p className="text-[10px] text-gray-400 mt-1">
              {generatedPost.split(/\s+/).filter(Boolean).length} mots — Tu peux modifier le texte directement ci-dessus
            </p>

            {/* Refine with AI */}
            <div className="mt-4 border-t border-gray-100 pt-4">
              <label className="block text-xs font-medium text-gray-600 mb-2">
                Demander une modification à l&apos;IA
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={refineInstructions}
                  onChange={(e) => setRefineInstructions(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleRefine(); } }}
                  placeholder="Ex: Rends-le plus punchy, ajoute une anecdote perso..."
                  className="flex-1 px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
                />
                <button
                  onClick={handleRefine}
                  disabled={!refineInstructions || refineLoading}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {refineLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Modifier
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Image search section ─────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
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
              className="flex-1 px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
            />
            <button
              onClick={handleImageSearch}
              disabled={!imageQuery.trim() || imageLoading}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-gray-800 rounded-lg hover:bg-gray-900 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {imageLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Rechercher
            </button>
          </div>

          {imageResults.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
              {imageResults.map((img, i) => (
                <div key={i} className="group relative rounded-lg overflow-hidden border border-gray-200">
                  <img
                    src={img.thumb}
                    alt={img.alt || "Image"}
                    className="w-full aspect-video object-cover"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                    <a
                      href={img.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Download className="w-3 h-3" />
                      HD
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
    </>
  );
}
