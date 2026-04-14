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
  SLIDE_W,
  SLIDE_H,
  renderSlideHTML,
} from "@/lib/carousel-template";

export default function LinkedInCarouselBuilder() {
  // Step 1 — Pitch
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);

  // Slides state
  const [title, setTitle] = useState("");
  const [slides, setSlides] = useState<CarouselSlide[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);

  // Export
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState("");

  const [error, setError] = useState<string | null>(null);
  const slideRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // ─── Generate slides ──────────────────────────────────

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
      setActiveIdx(0);
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
    setActiveIdx((prev) => Math.min(prev, slides.length - 2));
  };

  const addSlideAfter = (afterIdx: number) => {
    setSlides((prev) => {
      const newSlide: CarouselSlide = {
        number: afterIdx + 2,
        type: "content",
        role: "Le titre pour",
        logo: "generic",
        bullets: ["Point clé 1"],
        warnings: [],
      };
      const next = [...prev.slice(0, afterIdx + 1), newSlide, ...prev.slice(afterIdx + 1)];
      return next.map((s, i) => ({ ...s, number: i + 1 }));
    });
    setActiveIdx(afterIdx + 1);
  };

  const moveSlide = (idx: number, direction: -1 | 1) => {
    const target = idx + direction;
    if (target < 0 || target >= slides.length) return;
    setSlides((prev) => {
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next.map((s, i) => ({ ...s, number: i + 1 }));
    });
    setActiveIdx(target);
  };

  // ─── Export PNG ────────────────────────────────────────

  const handleExport = useCallback(async () => {
    setExporting(true);
    setExportProgress("Préparation...");
    try {
      const { toPng } = await import("html-to-image");
      for (let i = 0; i < slides.length; i++) {
        setExportProgress(`Slide ${i + 1}/${slides.length}...`);
        const node = slideRefs.current.get(i);
        if (!node) continue;
        const dataUrl = await toPng(node, { width: SLIDE_W, height: SLIDE_H, pixelRatio: 1, cacheBust: true });
        const link = document.createElement("a");
        link.download = `${title || "carousel"}-slide-${i + 1}.png`;
        link.href = dataUrl;
        link.click();
        await new Promise((r) => setTimeout(r, 400));
      }
      setExportProgress("Terminé !");
      setTimeout(() => setExportProgress(""), 3000);
    } catch (e) {
      setError(`Export: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting(false);
    }
  }, [slides, title]);

  // ─── Active slide ─────────────────────────────────────

  const active = slides[activeIdx] || null;
  const scale = 0.48; // scale factor for the main preview

  // ─── Render ───────────────────────────────────────────

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-2 rounded-lg flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)} className="ml-2 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* ═══ Pitch input ═══ */}
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
          {generating ? "Génération..." : slides.length > 0 ? "Regénérer" : "Générer les slides"}
        </button>
      </div>

      {/* ═══ Editor — Canva-like layout ═══ */}
      {slides.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Top bar */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-gray-900">{title}</span>
              <span className="text-xs text-gray-400">{slides.length} slides</span>
            </div>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 cursor-pointer"
            >
              {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              {exportProgress || "Télécharger PNG"}
            </button>
          </div>

          <div className="flex">
            {/* ── Left: Slide thumbnails ── */}
            <div className="w-28 sm:w-32 border-r border-gray-100 bg-gray-50/30 p-2 space-y-2 max-h-[680px] overflow-y-auto flex-shrink-0">
              {slides.map((slide, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveIdx(idx)}
                  className={cn(
                    "w-full rounded-lg border-2 overflow-hidden cursor-pointer transition-all relative",
                    activeIdx === idx ? "border-violet-500 ring-1 ring-violet-300" : "border-transparent hover:border-gray-300"
                  )}
                >
                  <div
                    style={{
                      width: SLIDE_W,
                      height: SLIDE_H,
                      transform: `scale(${96 / SLIDE_W})`,
                      transformOrigin: "top left",
                    }}
                    dangerouslySetInnerHTML={{ __html: renderSlideHTML(slide) }}
                  />
                  <div style={{ height: `${96 * (SLIDE_H / SLIDE_W)}px` }} />
                  <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] font-bold px-1 rounded">
                    {idx + 1}
                  </div>
                </button>
              ))}
              {/* Add slide */}
              <button
                onClick={() => addSlideAfter(Math.max(0, slides.length - 2))}
                className="w-full aspect-[4/5] rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:text-violet-600 hover:border-violet-300 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* ── Center: Main slide preview ── */}
            <div className="flex-1 flex flex-col items-center justify-start p-4 bg-gray-100/50 min-h-[500px]">
              {/* Navigation */}
              <div className="flex items-center gap-3 mb-3">
                <button
                  onClick={() => setActiveIdx(Math.max(0, activeIdx - 1))}
                  disabled={activeIdx === 0}
                  className="p-1.5 rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-violet-700 disabled:opacity-30 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-medium text-gray-600">Slide {activeIdx + 1} / {slides.length}</span>
                <button
                  onClick={() => setActiveIdx(Math.min(slides.length - 1, activeIdx + 1))}
                  disabled={activeIdx === slides.length - 1}
                  className="p-1.5 rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-violet-700 disabled:opacity-30 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Slide at readable scale */}
              <div
                className="rounded-xl shadow-lg overflow-hidden border border-gray-200"
                style={{ width: SLIDE_W * scale, height: SLIDE_H * scale }}
              >
                <div
                  ref={(el) => { if (el) slideRefs.current.set(activeIdx, el); }}
                  style={{
                    width: SLIDE_W,
                    height: SLIDE_H,
                    transform: `scale(${scale})`,
                    transformOrigin: "top left",
                  }}
                  dangerouslySetInnerHTML={{ __html: active ? renderSlideHTML(active) : "" }}
                />
              </div>

              {/* Slide actions */}
              <div className="flex items-center gap-2 mt-3">
                <button onClick={() => moveSlide(activeIdx, -1)} disabled={activeIdx === 0}
                  className="p-1.5 rounded bg-white border border-gray-200 text-gray-500 hover:text-violet-700 disabled:opacity-30 cursor-pointer" title="Monter">
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => moveSlide(activeIdx, 1)} disabled={activeIdx === slides.length - 1}
                  className="p-1.5 rounded bg-white border border-gray-200 text-gray-500 hover:text-violet-700 disabled:opacity-30 cursor-pointer" title="Descendre">
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => addSlideAfter(activeIdx)}
                  className="p-1.5 rounded bg-white border border-gray-200 text-gray-500 hover:text-green-600 cursor-pointer" title="Ajouter après">
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => { if (slides.length > 1) removeSlide(activeIdx); }}
                  disabled={slides.length <= 1}
                  className="p-1.5 rounded bg-white border border-gray-200 text-gray-500 hover:text-red-600 disabled:opacity-30 cursor-pointer" title="Supprimer">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* ── Right: Properties panel ── */}
            {active && (
              <div className="w-64 border-l border-gray-100 p-4 space-y-4 max-h-[680px] overflow-y-auto flex-shrink-0 bg-white">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Slide {activeIdx + 1} — {active.type === "cover" ? "Couverture" : active.type === "cta" ? "CTA" : "Contenu"}
                </h4>

                {/* Cover */}
                {active.type === "cover" && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Titre</label>
                    <textarea
                      value={active.title || ""}
                      onChange={(e) => updateSlide(activeIdx, { title: e.target.value })}
                      rows={3}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-y"
                    />
                  </div>
                )}

                {/* Content */}
                {active.type === "content" && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Logo</label>
                      <select
                        value={active.logo || "generic"}
                        onChange={(e) => updateSlide(activeIdx, { logo: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      >
                        {LOGO_KEYS.map((key) => (
                          <option key={key} value={key}>{LOGO_LIBRARY[key].name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Titre</label>
                      <input
                        type="text"
                        value={active.role || ""}
                        onChange={(e) => updateSlide(activeIdx, { role: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        placeholder="Le [rôle] pour"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Points clés</label>
                      {(active.bullets || []).map((bullet, bi) => (
                        <div key={bi} className="flex gap-1 mb-1.5">
                          <textarea
                            value={bullet}
                            onChange={(e) => {
                              const newBullets = [...(active.bullets || [])];
                              newBullets[bi] = e.target.value;
                              updateSlide(activeIdx, { bullets: newBullets });
                            }}
                            rows={2}
                            className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs resize-y"
                          />
                          <button
                            onClick={() => updateSlide(activeIdx, { bullets: (active.bullets || []).filter((_, i) => i !== bi) })}
                            className="p-1 text-red-400 hover:text-red-600 cursor-pointer self-start"
                          ><X className="w-3 h-3" /></button>
                        </div>
                      ))}
                      <button
                        onClick={() => updateSlide(activeIdx, { bullets: [...(active.bullets || []), ""] })}
                        className="text-xs text-violet-600 hover:text-violet-800 font-medium cursor-pointer"
                      >+ Ajouter</button>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Attention</label>
                      {(active.warnings || []).map((w, wi) => (
                        <div key={wi} className="flex gap-1 mb-1.5">
                          <textarea
                            value={w}
                            onChange={(e) => {
                              const newW = [...(active.warnings || [])];
                              newW[wi] = e.target.value;
                              updateSlide(activeIdx, { warnings: newW });
                            }}
                            rows={2}
                            className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs resize-y"
                          />
                          <button
                            onClick={() => updateSlide(activeIdx, { warnings: (active.warnings || []).filter((_, i) => i !== wi) })}
                            className="p-1 text-red-400 hover:text-red-600 cursor-pointer self-start"
                          ><X className="w-3 h-3" /></button>
                        </div>
                      ))}
                      <button
                        onClick={() => updateSlide(activeIdx, { warnings: [...(active.warnings || []), ""] })}
                        className="text-xs text-amber-600 hover:text-amber-800 font-medium cursor-pointer"
                      >+ Ajouter</button>
                    </div>
                  </>
                )}

                {/* CTA */}
                {active.type === "cta" && (
                  <p className="text-xs text-gray-500">Slide CTA auto-générée avec photo et appel à l&apos;action.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hidden full-size slides for export (off-screen) */}
      {slides.length > 0 && (
        <div style={{ position: "absolute", left: "-9999px", top: "-9999px" }}>
          {slides.map((slide, idx) => (
            <div
              key={idx}
              ref={(el) => { if (el) slideRefs.current.set(idx, el); }}
              style={{ width: SLIDE_W, height: SLIDE_H }}
              dangerouslySetInnerHTML={{ __html: renderSlideHTML(slide) }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
