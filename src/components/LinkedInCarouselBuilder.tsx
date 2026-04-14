"use client";

import { useState, useRef, useCallback } from "react";
import {
  Layers, Loader2, Sparkles, Download, Plus, Trash2,
  ChevronLeft, ChevronRight, X, Pencil, ArrowUp, ArrowDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type CarouselSlide,
  LOGO_LIBRARY,
  LOGO_KEYS,
  renderSlideHTML,
} from "@/lib/carousel-template";

type Step = 1 | 2 | 3;

export default function LinkedInCarouselBuilder() {
  // Step 1 — Pitch
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);

  // Step 2 — Edit & Preview
  const [title, setTitle] = useState("");
  const [slides, setSlides] = useState<CarouselSlide[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  // Step 3 — Export
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState("");

  const [error, setError] = useState<string | null>(null);
  const slideRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const step: Step = slides.length === 0 ? 1 : editingIdx !== null ? 2 : exporting ? 3 : 2;

  // ─── Generate slides from pitch ───────────────────────

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/linkedin/carousel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate-drafts", prompt }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setTitle(json.data?.title || "Carrousel");
      setSlides(json.data?.slides || []);
      setEditingIdx(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  };

  // ─── Slide mutations ──────────────────────────────────

  const updateSlide = (idx: number, updates: Partial<CarouselSlide>) => {
    setSlides((prev) => prev.map((s, i) => (i === idx ? { ...s, ...updates } : s)));
  };

  const removeSlide = (idx: number) => {
    setSlides((prev) => {
      const next = prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, number: i + 1 }));
      return next;
    });
    setEditingIdx(null);
  };

  const addSlide = (afterIdx: number) => {
    setSlides((prev) => {
      const newSlide: CarouselSlide = {
        number: afterIdx + 2,
        type: "content",
        role: "Le titre pour",
        logo: "generic",
        bullets: ["Point 1"],
        warnings: [],
      };
      const next = [...prev.slice(0, afterIdx + 1), newSlide, ...prev.slice(afterIdx + 1)];
      return next.map((s, i) => ({ ...s, number: i + 1 }));
    });
    setEditingIdx(afterIdx + 1);
  };

  const moveSlide = (idx: number, direction: -1 | 1) => {
    const target = idx + direction;
    if (target < 0 || target >= slides.length) return;
    setSlides((prev) => {
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next.map((s, i) => ({ ...s, number: i + 1 }));
    });
    setEditingIdx(target);
  };

  // ─── Export to PNG ────────────────────────────────────

  const handleExport = useCallback(async () => {
    setExporting(true);
    setExportProgress("Préparation...");
    try {
      const { toPng } = await import("html-to-image");

      for (let i = 0; i < slides.length; i++) {
        setExportProgress(`Export slide ${i + 1}/${slides.length}...`);
        const node = slideRefs.current.get(i);
        if (!node) continue;

        const dataUrl = await toPng(node, {
          width: 1080,
          height: 1350,
          pixelRatio: 1,
          cacheBust: true,
        });

        const link = document.createElement("a");
        link.download = `carousel-${title || "slide"}-${i + 1}.png`;
        link.href = dataUrl;
        link.click();

        // Small delay between downloads
        await new Promise((r) => setTimeout(r, 300));
      }
      setExportProgress("Export terminé !");
      setTimeout(() => setExportProgress(""), 3000);
    } catch (e) {
      setError(`Export: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting(false);
    }
  }, [slides, title]);

  // ─── Render ───────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Error */}
      {error && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-2 rounded-lg flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-600 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* ═══ Step 1 — Pitch ═══ */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
          <Layers className="w-4 h-4 text-violet-600" />
          Carrousel LinkedIn
        </h2>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-violet-300 outline-none resize-y mb-3"
          placeholder="Ex: Les 5 outils IA indispensables pour un retailer en 2026..."
        />

        <button
          onClick={handleGenerate}
          disabled={!prompt.trim() || generating}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-violet-600 rounded-xl hover:bg-violet-700 disabled:opacity-50 transition-colors cursor-pointer shadow-sm"
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {generating ? "Génération en cours..." : slides.length > 0 ? "Regénérer les slides" : "Générer les slides"}
        </button>
      </div>

      {/* ═══ Step 2 — Preview Grid + Editor ═══ */}
      {slides.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">{title} — {slides.length} slides</h3>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 cursor-pointer"
            >
              {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              {exporting ? exportProgress : "Télécharger PNG"}
            </button>
          </div>

          {/* Slide grid */}
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-4">
            {slides.map((slide, idx) => (
              <div key={idx} className="relative group">
                <button
                  onClick={() => setEditingIdx(editingIdx === idx ? null : idx)}
                  className={cn(
                    "w-full aspect-[4/5] rounded-lg border-2 overflow-hidden cursor-pointer transition-all",
                    editingIdx === idx ? "border-violet-500 ring-2 ring-violet-200" : "border-gray-200 hover:border-gray-400"
                  )}
                >
                  {/* Slide preview (scaled down) */}
                  <div
                    ref={(el) => { if (el) slideRefs.current.set(idx, el); }}
                    style={{ width: 1080, height: 1350, transform: "scale(0.15)", transformOrigin: "top left" }}
                    dangerouslySetInnerHTML={{ __html: renderSlideHTML(slide) }}
                  />
                </button>
                <div className="absolute top-1 left-1 bg-black/60 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                  {idx + 1}
                </div>
                <button
                  onClick={() => setEditingIdx(idx)}
                  className="absolute top-1 right-1 bg-white/90 text-gray-600 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              </div>
            ))}
            {/* Add slide button */}
            <button
              onClick={() => addSlide(slides.length - 2)}
              className="aspect-[4/5] rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 text-gray-400 hover:text-violet-600 hover:border-violet-300 transition-colors cursor-pointer"
            >
              <Plus className="w-5 h-5" />
              <span className="text-[10px] font-medium">Ajouter</span>
            </button>
          </div>

          {/* ═══ Slide Editor (inline) ═══ */}
          {editingIdx !== null && slides[editingIdx] && (
            <div className="border border-violet-200 bg-violet-50/50 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-violet-800">
                  Slide {editingIdx + 1} — {slides[editingIdx].type}
                </h4>
                <div className="flex items-center gap-1">
                  <button onClick={() => moveSlide(editingIdx, -1)} disabled={editingIdx === 0} className="p-1 text-gray-500 hover:text-violet-700 disabled:opacity-30 cursor-pointer"><ArrowUp className="w-4 h-4" /></button>
                  <button onClick={() => moveSlide(editingIdx, 1)} disabled={editingIdx === slides.length - 1} className="p-1 text-gray-500 hover:text-violet-700 disabled:opacity-30 cursor-pointer"><ArrowDown className="w-4 h-4" /></button>
                  <button onClick={() => removeSlide(editingIdx)} className="p-1 text-red-400 hover:text-red-600 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                  <button onClick={() => setEditingIdx(null)} className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"><X className="w-4 h-4" /></button>
                </div>
              </div>

              {/* Cover slide */}
              {slides[editingIdx].type === "cover" && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Titre</label>
                  <input
                    type="text"
                    value={slides[editingIdx].title || ""}
                    onChange={(e) => updateSlide(editingIdx, { title: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              )}

              {/* Content slide */}
              {slides[editingIdx].type === "content" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Titre de la slide</label>
                      <input
                        type="text"
                        value={slides[editingIdx].role || ""}
                        onChange={(e) => updateSlide(editingIdx, { role: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        placeholder="Le [rôle] pour"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Logo</label>
                      <select
                        value={slides[editingIdx].logo || "generic"}
                        onChange={(e) => updateSlide(editingIdx, { logo: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      >
                        {LOGO_KEYS.map((key) => (
                          <option key={key} value={key}>{LOGO_LIBRARY[key].name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Bullets */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Points clés</label>
                    {(slides[editingIdx].bullets || []).map((bullet, bi) => (
                      <div key={bi} className="flex gap-1 mb-1">
                        <input
                          type="text"
                          value={bullet}
                          onChange={(e) => {
                            const newBullets = [...(slides[editingIdx].bullets || [])];
                            newBullets[bi] = e.target.value;
                            updateSlide(editingIdx, { bullets: newBullets });
                          }}
                          className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs"
                        />
                        <button
                          onClick={() => {
                            const newBullets = (slides[editingIdx].bullets || []).filter((_, i) => i !== bi);
                            updateSlide(editingIdx, { bullets: newBullets });
                          }}
                          className="p-1 text-red-400 hover:text-red-600 cursor-pointer"
                        ><X className="w-3 h-3" /></button>
                      </div>
                    ))}
                    <button
                      onClick={() => updateSlide(editingIdx, { bullets: [...(slides[editingIdx].bullets || []), ""] })}
                      className="text-xs text-violet-600 hover:text-violet-800 font-medium cursor-pointer mt-1"
                    >+ Ajouter un point</button>
                  </div>

                  {/* Warnings */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Attention (optionnel)</label>
                    {(slides[editingIdx].warnings || []).map((w, wi) => (
                      <div key={wi} className="flex gap-1 mb-1">
                        <input
                          type="text"
                          value={w}
                          onChange={(e) => {
                            const newWarnings = [...(slides[editingIdx].warnings || [])];
                            newWarnings[wi] = e.target.value;
                            updateSlide(editingIdx, { warnings: newWarnings });
                          }}
                          className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs"
                        />
                        <button
                          onClick={() => {
                            const newWarnings = (slides[editingIdx].warnings || []).filter((_, i) => i !== wi);
                            updateSlide(editingIdx, { warnings: newWarnings });
                          }}
                          className="p-1 text-red-400 hover:text-red-600 cursor-pointer"
                        ><X className="w-3 h-3" /></button>
                      </div>
                    ))}
                    <button
                      onClick={() => updateSlide(editingIdx, { warnings: [...(slides[editingIdx].warnings || []), ""] })}
                      className="text-xs text-amber-600 hover:text-amber-800 font-medium cursor-pointer mt-1"
                    >+ Ajouter une mise en garde</button>
                  </div>
                </>
              )}

              {/* CTA slide — no editing needed */}
              {slides[editingIdx].type === "cta" && (
                <p className="text-xs text-gray-500">Slide CTA générée automatiquement (photo + appel à l&apos;action).</p>
              )}

              {/* Navigation */}
              <div className="flex items-center justify-between pt-2 border-t border-violet-200">
                <button
                  onClick={() => setEditingIdx(Math.max(0, editingIdx - 1))}
                  disabled={editingIdx === 0}
                  className="flex items-center gap-1 text-xs text-gray-600 hover:text-violet-700 disabled:opacity-30 cursor-pointer"
                >
                  <ChevronLeft className="w-3 h-3" /> Précédent
                </button>
                <span className="text-xs text-gray-400">{editingIdx + 1} / {slides.length}</span>
                <button
                  onClick={() => setEditingIdx(Math.min(slides.length - 1, editingIdx + 1))}
                  disabled={editingIdx === slides.length - 1}
                  className="flex items-center gap-1 text-xs text-gray-600 hover:text-violet-700 disabled:opacity-30 cursor-pointer"
                >
                  Suivant <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
