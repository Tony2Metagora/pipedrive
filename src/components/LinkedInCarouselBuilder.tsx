"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Layers, Loader2, Sparkles, Download, Plus, Trash2, X,
  ChevronLeft, ChevronRight, Type, ImageIcon, Upload,
  Bold, Italic, AlignLeft, AlignCenter, AlignRight,
  Palette, ArrowRight, Save, Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type CarouselSlide, type SlideElement, type AIDraftSlide,
  LOGO_LIBRARY, LOGO_KEYS, SLIDE_W, SLIDE_H, BG_COLOR,
  draftToSlide, renderSlideToHTML, uid,
} from "@/lib/carousel-template";

// ─── Step type ──────────────────────────────────────────

type BuilderStep = "draft" | "editor";

// ─── Fonts ──────────────────────────────────────────────

const FONT_SERIF = "'Playfair Display', Georgia, serif";
const FONT_SANS = "'Inter', -apple-system, sans-serif";
const FONT_SIZES = [14, 16, 18, 19, 20, 21, 22, 24, 28, 32, 40, 48, 54, 64, 76];
const COLORS = ["#1a1a1a", "#2563eb", "#333", "#555", "#666", "#888", "#10a37f", "#d97706", "#dc2626", "#ffffff"];

// ─── Main component ────────────────────────────────────

export default function LinkedInCarouselBuilder() {
  const [step, setStep] = useState<BuilderStep>("draft");

  // Draft step
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [drafts, setDrafts] = useState<AIDraftSlide[]>([]);

  // Editor step
  const [slides, setSlides] = useState<CarouselSlide[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [selectedElId, setSelectedElId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<{ elId: string; startX: number; startY: number; elStartX: number; elStartY: number } | null>(null);
  const [editingElId, setEditingElId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Export
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState("");
  const exportRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Learning popup
  const [showLearning, setShowLearning] = useState(false);
  const [learningText, setLearningText] = useState("");
  const [savingLearning, setSavingLearning] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");

  const scale = 0.5;

  // ─── Generate drafts ──────────────────────────────────

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
      setDrafts(json.data?.slides || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  };

  // ─── Draft mutations ──────────────────────────────────

  const updateDraft = (idx: number, updates: Partial<AIDraftSlide>) => {
    setDrafts((prev) => prev.map((d, i) => (i === idx ? { ...d, ...updates } : d)));
  };

  const addDraftAfter = (idx: number) => {
    setDrafts((prev) => {
      const newDraft: AIDraftSlide = { number: idx + 2, type: "content", role: "Le titre pour", logo: "generic", bullets: ["Point clé"], warnings: [] };
      const next = [...prev.slice(0, idx + 1), newDraft, ...prev.slice(idx + 1)];
      return next.map((d, i) => ({ ...d, number: i + 1 }));
    });
  };

  const removeDraft = (idx: number) => {
    setDrafts((prev) => prev.filter((_, i) => i !== idx).map((d, i) => ({ ...d, number: i + 1 })));
  };

  // ─── Convert drafts → slides and go to editor ─────────

  const handleValidateDrafts = () => {
    setShowLearning(true);
  };

  const handleConfirmAndEdit = async () => {
    if (learningText.trim()) {
      setSavingLearning(true);
      try {
        await fetch("/api/linkedin/learnings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "carousel-edit", before: prompt, after: JSON.stringify(drafts.map((d) => d.role || d.title)), reason: learningText }),
        });
      } catch { /* ignore */ }
      setSavingLearning(false);
    }
    setShowLearning(false);
    setLearningText("");

    const converted = drafts.map(draftToSlide);
    setSlides(converted);
    setActiveIdx(0);
    setSelectedElId(null);
    setStep("editor");
  };

  // ─── Slide element mutations ──────────────────────────

  const activeSlide = slides[activeIdx] || null;
  const selectedEl = activeSlide?.elements.find((e) => e.id === selectedElId) || null;

  const updateElement = (elId: string, updates: Partial<SlideElement>) => {
    setSlides((prev) => prev.map((s, si) =>
      si === activeIdx
        ? { ...s, elements: s.elements.map((e) => (e.id === elId ? { ...e, ...updates } : e)) }
        : s
    ));
  };

  const deleteElement = (elId: string) => {
    const el = activeSlide?.elements.find((e) => e.id === elId);
    if (el?.locked) return;
    setSlides((prev) => prev.map((s, si) =>
      si === activeIdx ? { ...s, elements: s.elements.filter((e) => e.id !== elId) } : s
    ));
    setSelectedElId(null);
  };

  const addTextElement = () => {
    const newEl: SlideElement = {
      id: uid(), type: "text", x: 200, y: 400, width: 800,
      content: "Nouveau texte", fontSize: 24, fontFamily: "sans",
      fontWeight: "normal", fontStyle: "normal", color: "#1a1a1a", textAlign: "left",
    };
    setSlides((prev) => prev.map((s, si) =>
      si === activeIdx ? { ...s, elements: [...s.elements, newEl] } : s
    ));
    setSelectedElId(newEl.id);
  };

  // ─── Image upload for element ─────────────────────────

  const handleImageUpload = (elId: string) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        updateElement(elId, { content: reader.result as string });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  // ─── Drag logic ───────────────────────────────────────

  const handleCanvasMouseDown = (e: React.MouseEvent, elId: string) => {
    const el = activeSlide?.elements.find((el) => el.id === elId);
    if (!el || el.locked) return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedElId(elId);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    setDragState({
      elId,
      startX: e.clientX,
      startY: e.clientY,
      elStartX: el.x,
      elStartY: el.y,
    });
  };

  useEffect(() => {
    if (!dragState) return;
    const handleMove = (e: MouseEvent) => {
      const dx = (e.clientX - dragState.startX) / scale;
      const dy = (e.clientY - dragState.startY) / scale;
      updateElement(dragState.elId, {
        x: Math.max(0, Math.min(SLIDE_W - 50, dragState.elStartX + dx)),
        y: Math.max(0, Math.min(SLIDE_H - 30, dragState.elStartY + dy)),
      });
    };
    const handleUp = () => setDragState(null);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragState, scale]);

  // ─── Export PNG ────────────────────────────────────────

  const handleExport = useCallback(async () => {
    setExporting(true);
    setExportProgress("Préparation...");
    try {
      const { toPng } = await import("html-to-image");
      for (let i = 0; i < slides.length; i++) {
        setExportProgress(`Slide ${i + 1}/${slides.length}...`);
        const node = exportRefs.current.get(i);
        if (!node) continue;
        const dataUrl = await toPng(node, { width: SLIDE_W, height: SLIDE_H, pixelRatio: 1, cacheBust: true });
        const link = document.createElement("a");
        link.download = `${title || "carousel"}-${i + 1}.png`;
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

  // ─── Render element on canvas ─────────────────────────

  const renderElement = (el: SlideElement, isExport: boolean) => {
    const ff = el.fontFamily === "serif" ? FONT_SERIF : FONT_SANS;
    const isSelected = !isExport && selectedElId === el.id;
    const isEditing = !isExport && editingElId === el.id;

    const baseStyle: React.CSSProperties = {
      position: "absolute",
      left: el.x,
      top: el.y,
      width: el.width,
      cursor: el.locked ? "default" : (dragState?.elId === el.id ? "grabbing" : "grab"),
      outline: isSelected ? "2px solid #7c3aed" : "none",
      outlineOffset: 2,
      userSelect: isEditing ? "text" : "none",
    };

    if (el.type === "image") {
      let src = "";
      let inner: React.ReactNode = null;

      if (el.content.startsWith("logo:") && el.content !== "logo:metagora") {
        const logoKey = el.content.replace("logo:", "");
        const logo = LOGO_LIBRARY[logoKey];
        inner = logo ? <div dangerouslySetInnerHTML={{ __html: logo.svg }} /> : <div style={{ width: 52, height: 52, background: "#ddd", borderRadius: 8 }} />;
      } else if (el.content === "photo:tony" || el.content === "photo:tony-small") {
        src = "/carousel/tony-photo.png";
      } else if (el.content === "logo:metagora") {
        src = "/carousel/metagora-logo.png";
      } else if (el.content.startsWith("data:") || el.content.startsWith("http") || el.content.startsWith("/")) {
        src = el.content;
      }

      return (
        <div
          key={el.id}
          style={baseStyle}
          onMouseDown={(e) => !isExport && handleCanvasMouseDown(e, el.id)}
          onClick={(e) => { if (!isExport) { e.stopPropagation(); setSelectedElId(el.id); setEditingElId(null); } }}
          onDoubleClick={(e) => { if (!isExport && !el.locked) { e.stopPropagation(); handleImageUpload(el.id); } }}
        >
          {inner || (
            <img
              src={src}
              alt=""
              style={{
                maxWidth: el.width,
                maxHeight: el.width,
                objectFit: "contain",
                ...(el.content === "photo:tony" ? { borderRadius: "50%", border: "4px solid #2563eb" } : {}),
                ...(el.content === "photo:tony-small" ? { borderRadius: "50%", width: 60, height: 60 } : {}),
              }}
              draggable={false}
            />
          )}
          {!isExport && isSelected && !el.locked && (
            <div
              style={{ position: "absolute", top: -20, right: -20, background: "white", borderRadius: 4, boxShadow: "0 1px 4px rgba(0,0,0,0.15)", padding: 2, cursor: "pointer" }}
              onClick={(e) => { e.stopPropagation(); handleImageUpload(el.id); }}
            >
              <Upload style={{ width: 14, height: 14, color: "#7c3aed" }} />
            </div>
          )}
        </div>
      );
    }

    // Text element
    return (
      <div
        key={el.id}
        style={{
          ...baseStyle,
          fontFamily: ff,
          fontSize: el.fontSize,
          fontWeight: el.fontWeight,
          fontStyle: el.fontStyle,
          color: el.color,
          textAlign: el.textAlign,
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
          wordWrap: "break-word",
        }}
        onMouseDown={(e) => !isExport && !isEditing && handleCanvasMouseDown(e, el.id)}
        onClick={(e) => { if (!isExport) { e.stopPropagation(); setSelectedElId(el.id); } }}
        onDoubleClick={(e) => { if (!isExport && !el.locked) { e.stopPropagation(); setEditingElId(el.id); } }}
      >
        {isEditing ? (
          <textarea
            autoFocus
            value={el.content}
            onChange={(e) => updateElement(el.id, { content: e.target.value })}
            onBlur={() => setEditingElId(null)}
            onKeyDown={(e) => { if (e.key === "Escape") setEditingElId(null); }}
            style={{
              width: "100%",
              minHeight: el.fontSize * 2,
              fontFamily: ff,
              fontSize: el.fontSize,
              fontWeight: el.fontWeight,
              fontStyle: el.fontStyle,
              color: el.color,
              textAlign: el.textAlign,
              lineHeight: 1.5,
              background: "rgba(124,58,237,0.05)",
              border: "1px solid #7c3aed",
              borderRadius: 4,
              outline: "none",
              resize: "vertical",
              padding: 4,
            }}
          />
        ) : (
          el.content
        )}
      </div>
    );
  };

  // ─── Render ───────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Google Fonts preload */}
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400;1,700&family=Inter:wght@400;500;600;700&display=swap" />

      {error && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-2 rounded-lg flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)} className="cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* ═══ STEP: DRAFT (text editing) ═══ */}
      {step === "draft" && (
        <>
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
              <Layers className="w-4 h-4 text-violet-600" /> Carrousel LinkedIn
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
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-violet-600 rounded-xl hover:bg-violet-700 disabled:opacity-50 cursor-pointer shadow-sm"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {generating ? "Génération..." : "Générer les slides"}
            </button>
          </div>

          {/* Draft cards */}
          {drafts.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900">{title} — {drafts.length} slides</h3>

              {drafts.map((draft, idx) => (
                <div key={idx} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-violet-600 bg-violet-100 px-2 py-0.5 rounded">
                      Slide {idx + 1} — {draft.type === "cover" ? "Couverture" : draft.type === "cta" ? "CTA" : "Contenu"}
                    </span>
                    <div className="flex items-center gap-1">
                      {draft.type === "content" && (
                        <button onClick={() => removeDraft(idx)} className="p-1 text-red-400 hover:text-red-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                      )}
                    </div>
                  </div>

                  {draft.type === "cover" && (
                    <input
                      type="text" value={draft.title || ""} onChange={(e) => updateDraft(idx, { title: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium"
                      placeholder="Titre du carrousel"
                    />
                  )}

                  {draft.type === "content" && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-gray-500 uppercase">Logo</label>
                          <select value={draft.logo || "generic"} onChange={(e) => updateDraft(idx, { logo: e.target.value })}
                            className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm">
                            {LOGO_KEYS.map((k) => <option key={k} value={k}>{LOGO_LIBRARY[k].name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-500 uppercase">Titre</label>
                          <input type="text" value={draft.role || ""} onChange={(e) => updateDraft(idx, { role: e.target.value })}
                            className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm" placeholder="Le [rôle] pour" />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500 uppercase">Points clés (un par ligne)</label>
                        <textarea
                          value={(draft.bullets || []).join("\n")}
                          onChange={(e) => updateDraft(idx, { bullets: e.target.value.split("\n") })}
                          rows={3} className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs resize-y"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500 uppercase">Attention (un par ligne, optionnel)</label>
                        <textarea
                          value={(draft.warnings || []).join("\n")}
                          onChange={(e) => updateDraft(idx, { warnings: e.target.value.split("\n").filter(Boolean) })}
                          rows={2} className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs resize-y"
                        />
                      </div>
                    </div>
                  )}

                  {draft.type === "cta" && (
                    <p className="text-xs text-gray-500">Slide CTA auto-générée.</p>
                  )}
                </div>
              ))}

              <button onClick={() => addDraftAfter(Math.max(0, drafts.length - 2))}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-violet-600 border border-dashed border-violet-300 rounded-lg hover:bg-violet-50 cursor-pointer">
                <Plus className="w-3.5 h-3.5" /> Ajouter une slide
              </button>

              <button onClick={handleValidateDrafts}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-white bg-violet-600 rounded-xl hover:bg-violet-700 cursor-pointer shadow-sm">
                <ArrowRight className="w-4 h-4" /> Valider et passer à l&apos;éditeur visuel
              </button>
            </div>
          )}
        </>
      )}

      {/* ═══ STEP: VISUAL EDITOR ═══ */}
      {step === "editor" && slides.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50/80 flex-wrap gap-2">
            <div className="flex items-center gap-1">
              <button onClick={() => { setStep("draft"); setSlides([]); }}
                className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-violet-700 cursor-pointer">
                <Pencil className="w-3 h-3" /> Texte
              </button>
              <div className="w-px h-5 bg-gray-200 mx-1" />
              <button onClick={addTextElement} className="p-1.5 text-gray-500 hover:text-violet-700 cursor-pointer rounded hover:bg-violet-50" title="Ajouter texte">
                <Type className="w-4 h-4" />
              </button>
            </div>

            {/* Element-specific toolbar */}
            {selectedEl && selectedEl.type === "text" && !selectedEl.locked && (
              <div className="flex items-center gap-1 flex-wrap">
                <select value={selectedEl.fontSize} onChange={(e) => updateElement(selectedEl.id, { fontSize: Number(e.target.value) })}
                  className="border border-gray-200 rounded px-1 py-0.5 text-xs w-14">
                  {FONT_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={selectedEl.fontFamily} onChange={(e) => updateElement(selectedEl.id, { fontFamily: e.target.value as "serif" | "sans" })}
                  className="border border-gray-200 rounded px-1 py-0.5 text-xs w-16">
                  <option value="serif">Serif</option>
                  <option value="sans">Sans</option>
                </select>
                <button onClick={() => updateElement(selectedEl.id, { fontWeight: selectedEl.fontWeight === "bold" ? "normal" : "bold" })}
                  className={cn("p-1 rounded cursor-pointer", selectedEl.fontWeight === "bold" ? "bg-violet-100 text-violet-700" : "text-gray-500 hover:bg-gray-100")}>
                  <Bold className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => updateElement(selectedEl.id, { fontStyle: selectedEl.fontStyle === "italic" ? "normal" : "italic" })}
                  className={cn("p-1 rounded cursor-pointer", selectedEl.fontStyle === "italic" ? "bg-violet-100 text-violet-700" : "text-gray-500 hover:bg-gray-100")}>
                  <Italic className="w-3.5 h-3.5" />
                </button>
                <div className="w-px h-4 bg-gray-200 mx-0.5" />
                <button onClick={() => updateElement(selectedEl.id, { textAlign: "left" })}
                  className={cn("p-1 rounded cursor-pointer", selectedEl.textAlign === "left" ? "bg-violet-100 text-violet-700" : "text-gray-500 hover:bg-gray-100")}>
                  <AlignLeft className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => updateElement(selectedEl.id, { textAlign: "center" })}
                  className={cn("p-1 rounded cursor-pointer", selectedEl.textAlign === "center" ? "bg-violet-100 text-violet-700" : "text-gray-500 hover:bg-gray-100")}>
                  <AlignCenter className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => updateElement(selectedEl.id, { textAlign: "right" })}
                  className={cn("p-1 rounded cursor-pointer", selectedEl.textAlign === "right" ? "bg-violet-100 text-violet-700" : "text-gray-500 hover:bg-gray-100")}>
                  <AlignRight className="w-3.5 h-3.5" />
                </button>
                <div className="w-px h-4 bg-gray-200 mx-0.5" />
                <div className="flex gap-0.5">
                  {COLORS.map((c) => (
                    <button key={c} onClick={() => updateElement(selectedEl.id, { color: c })}
                      className={cn("w-5 h-5 rounded border cursor-pointer", selectedEl.color === c ? "ring-2 ring-violet-400" : "border-gray-200")}
                      style={{ background: c }} />
                  ))}
                </div>
                <div className="w-px h-4 bg-gray-200 mx-0.5" />
                <button onClick={() => deleteElement(selectedEl.id)}
                  className="p-1 text-red-400 hover:text-red-600 cursor-pointer rounded hover:bg-red-50">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <button onClick={handleExport} disabled={exporting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 cursor-pointer">
              {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              {exportProgress || "Télécharger PNG"}
            </button>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-center gap-3 py-2 bg-gray-50/30 border-b border-gray-100">
            <button onClick={() => { setActiveIdx(Math.max(0, activeIdx - 1)); setSelectedElId(null); setEditingElId(null); }}
              disabled={activeIdx === 0}
              className="p-1.5 rounded bg-white border border-gray-200 disabled:opacity-30 cursor-pointer">
              <ChevronLeft className="w-4 h-4 text-gray-500" />
            </button>
            <span className="text-xs font-medium text-gray-600">Slide {activeIdx + 1} / {slides.length}</span>
            <button onClick={() => { setActiveIdx(Math.min(slides.length - 1, activeIdx + 1)); setSelectedElId(null); setEditingElId(null); }}
              disabled={activeIdx === slides.length - 1}
              className="p-1.5 rounded bg-white border border-gray-200 disabled:opacity-30 cursor-pointer">
              <ChevronRight className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          {/* Canvas area */}
          <div className="flex justify-center py-6 bg-gray-100/50" onClick={() => { setSelectedElId(null); setEditingElId(null); }}>
            <div
              ref={canvasRef}
              className="rounded-lg shadow-xl overflow-hidden"
              style={{ width: SLIDE_W * scale, height: SLIDE_H * scale, position: "relative" }}
            >
              <div style={{ width: SLIDE_W, height: SLIDE_H, transform: `scale(${scale})`, transformOrigin: "top left", background: BG_COLOR, position: "relative" }}>
                {activeSlide?.elements.map((el) => renderElement(el, false))}
              </div>
            </div>
          </div>

          {/* Slide strip */}
          <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-100 overflow-x-auto bg-white">
            {slides.map((slide, idx) => (
              <button key={idx} onClick={() => { setActiveIdx(idx); setSelectedElId(null); setEditingElId(null); }}
                className={cn("flex-shrink-0 rounded border-2 overflow-hidden cursor-pointer",
                  activeIdx === idx ? "border-violet-500" : "border-gray-200 hover:border-gray-400"
                )}
                style={{ width: 72, height: 90 }}
              >
                <div style={{ width: SLIDE_W, height: SLIDE_H, transform: `scale(${72 / SLIDE_W})`, transformOrigin: "top left", background: BG_COLOR, position: "relative" }}>
                  {slide.elements.map((el) => renderElement(el, true))}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Hidden full-size slides for export */}
      <div style={{ position: "absolute", left: -9999, top: -9999, pointerEvents: "none" }}>
        {slides.map((slide, idx) => (
          <div key={idx} ref={(el) => { if (el) exportRefs.current.set(idx, el); }}
            style={{ width: SLIDE_W, height: SLIDE_H }}
            dangerouslySetInnerHTML={{ __html: renderSlideToHTML(slide) }}
          />
        ))}
      </div>

      {/* Learning popup */}
      {showLearning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Modifications apportées</h3>
            <p className="text-xs text-gray-500 mb-3">
              Explique ce que tu as modifié et pourquoi. L&apos;IA utilisera ça pour mieux générer les prochains carrousels.
            </p>
            <textarea
              value={learningText}
              onChange={(e) => setLearningText(e.target.value)}
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-y mb-3"
              placeholder="Ex: J'ai changé le titre pour être plus accrocheur, retiré le warning car pas pertinent..."
            />
            <div className="flex gap-2">
              <button onClick={() => { setShowLearning(false); handleConfirmAndEdit(); }}
                className="flex-1 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                Passer
              </button>
              <button onClick={handleConfirmAndEdit} disabled={savingLearning}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 cursor-pointer">
                {savingLearning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Valider
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
