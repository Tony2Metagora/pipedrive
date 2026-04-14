/**
 * Carousel data model — structured slide elements with absolute positions.
 * Each element is independently positionable, editable, and draggable.
 * Slides are 1200×1500px (4:5 LinkedIn ratio).
 */

// ─── Constants ──────────────────────────────────────────

export const SLIDE_W = 1200;
export const SLIDE_H = 1500;
export const BG_COLOR = "#f5f5f5";

// ─── Types ──────────────────────────────────────────────

export interface SlideElement {
  id: string;
  type: "text" | "image";
  x: number;
  y: number;
  width: number;
  content: string;          // text content or image URL/data
  fontSize: number;
  fontFamily: "serif" | "sans";
  fontWeight: "normal" | "bold";
  fontStyle: "normal" | "italic";
  color: string;
  textAlign: "left" | "center" | "right";
  locked?: boolean;         // cannot be dragged/deleted (footer)
}

export interface CarouselSlide {
  number: number;
  type: "cover" | "content" | "cta";
  elements: SlideElement[];
}

// ─── AI Draft (from API, before converting to positioned elements) ───

export interface AIDraftSlide {
  number: number;
  type: "cover" | "content" | "cta";
  title?: string;
  role?: string;
  logo?: string;
  bullets?: string[];
  warnings?: string[];
}

// ─── Logo library ───────────────────────────────────────

export const LOGO_LIBRARY: Record<string, { name: string; svg: string }> = {
  chatgpt: {
    name: "ChatGPT",
    svg: `<svg width="52" height="52" viewBox="0 0 24 24" fill="none"><path d="M22.28 9.37a5.99 5.99 0 0 0-.52-4.93 6.07 6.07 0 0 0-6.52-2.93A5.99 5.99 0 0 0 10.72 0a6.07 6.07 0 0 0-5.78 4.18 5.99 5.99 0 0 0-4 2.93 6.07 6.07 0 0 0 .74 7.12 5.99 5.99 0 0 0 .52 4.93 6.07 6.07 0 0 0 6.52 2.93A5.99 5.99 0 0 0 13.28 24a6.07 6.07 0 0 0 5.78-4.18 5.99 5.99 0 0 0 4-2.93 6.07 6.07 0 0 0-.74-7.12h-.04Z" fill="#10a37f"/></svg>`,
  },
  perplexity: {
    name: "Perplexity",
    svg: `<svg width="52" height="52" viewBox="0 0 24 24" fill="none"><path d="M12 1L4 5v6l8 4 8-4V5l-8-4Z" stroke="#1a7f7f" stroke-width="1.5"/><path d="M4 11v6l8 4 8-4v-6" stroke="#1a7f7f" stroke-width="1.5"/><path d="M12 9v12M4 5l8 4 8-4" stroke="#1a7f7f" stroke-width="1.5"/></svg>`,
  },
  claude: {
    name: "Claude",
    svg: `<svg width="52" height="52" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#d97706"/><path d="M8 12h8M12 8v8M9 9l6 6M15 9l-6 6" stroke="white" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  },
  gemini: {
    name: "Gemini",
    svg: `<svg width="52" height="52" viewBox="0 0 24 24" fill="none"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Z" fill="#4285f4"/><path d="M12 2c3.04 0 5.5 4.48 5.5 10s-2.46 10-5.5 10S6.5 17.52 6.5 12 8.96 2 12 2Z" fill="#ea4335"/></svg>`,
  },
  notebooklm: {
    name: "NotebookLM",
    svg: `<svg width="52" height="52" viewBox="0 0 24 24" fill="none"><rect x="4" y="2" width="16" height="20" rx="2" stroke="#1a1a1a" stroke-width="1.5"/><path d="M8 6h8M8 10h8M8 14h5" stroke="#1a1a1a" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  },
  midjourney: {
    name: "Midjourney",
    svg: `<svg width="52" height="52" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#1a1a1a" stroke-width="1.5"/><path d="M7 12c0-2.76 2.24-5 5-5s5 2.24 5 5-2.24 5-5 5" stroke="#1a1a1a" stroke-width="1.5"/></svg>`,
  },
  copilot: {
    name: "Copilot",
    svg: `<svg width="52" height="52" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7l10 5 10-5-10-5Z" fill="#0078d4"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="#0078d4" stroke-width="1.5"/></svg>`,
  },
  dalle: {
    name: "DALL-E",
    svg: `<svg width="52" height="52" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" stroke="#10a37f" stroke-width="1.5"/><circle cx="9" cy="9" r="2" fill="#10a37f"/><path d="M3 15l5-5 4 4 3-3 6 6" stroke="#10a37f" stroke-width="1.5"/></svg>`,
  },
  cursor: {
    name: "Cursor",
    svg: `<svg width="52" height="52" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" fill="#1a1a1a"/><path d="M8 8l4 8 1.5-3.5L17 11l-9-3Z" fill="white"/></svg>`,
  },
  generic: {
    name: "IA",
    svg: `<svg width="52" height="52" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#2563eb" stroke-width="1.5"/><path d="M8 12h8M12 8v8" stroke="#2563eb" stroke-width="2" stroke-linecap="round"/></svg>`,
  },
};

export const LOGO_KEYS = Object.keys(LOGO_LIBRARY);

// ─── Unique ID helper ───────────────────────────────────

let _idCounter = 0;
export function uid(): string {
  return `el_${Date.now()}_${++_idCounter}`;
}

// ─── Convert AI draft to positioned slide elements ──────

export function draftToSlide(draft: AIDraftSlide): CarouselSlide {
  if (draft.type === "cover") return buildCoverSlide(draft.title || "Titre du carrousel");
  if (draft.type === "cta") return buildCtaSlide(draft.number);
  return buildContentSlide(draft);
}

function buildCoverSlide(title: string): CarouselSlide {
  return {
    number: 1,
    type: "cover",
    elements: [
      { id: uid(), type: "text", x: 100, y: 520, width: 1000, content: title, fontSize: 76, fontFamily: "serif", fontWeight: "normal", fontStyle: "normal", color: "#1a1a1a", textAlign: "center" },
      ...footerElements(),
    ],
  };
}

function buildContentSlide(draft: AIDraftSlide): CarouselSlide {
  const logo = draft.logo && LOGO_LIBRARY[draft.logo] ? draft.logo : "generic";
  const logoName = LOGO_LIBRARY[logo]?.name || "IA";

  const bulletText = (draft.bullets || []).map((b) => `• ${b}`).join("\n");
  const warningText = (draft.warnings || []).length > 0
    ? `Attention :\n${(draft.warnings || []).map((w) => `• ${w}`).join("\n")}`
    : "";

  const elements: SlideElement[] = [
    // Logo image placeholder (SVG data URI)
    { id: uid(), type: "image", x: 540, y: 60, width: 80, content: `logo:${logo}`, fontSize: 0, fontFamily: "sans", fontWeight: "normal", fontStyle: "normal", color: "", textAlign: "center" },
    // Logo name
    { id: uid(), type: "text", x: 300, y: 130, width: 600, content: logoName, fontSize: 22, fontFamily: "sans", fontWeight: "normal", fontStyle: "normal", color: "#333", textAlign: "center" },
    // Role title
    { id: uid(), type: "text", x: 70, y: 180, width: 1060, content: draft.role || "Le titre pour", fontSize: 54, fontFamily: "serif", fontWeight: "normal", fontStyle: "italic", color: "#2563eb", textAlign: "left" },
    // Bullets
    { id: uid(), type: "text", x: 70, y: 310, width: 1060, content: bulletText, fontSize: 21, fontFamily: "sans", fontWeight: "normal", fontStyle: "normal", color: "#333", textAlign: "left" },
  ];

  if (warningText) {
    elements.push(
      { id: uid(), type: "text", x: 70, y: 900, width: 1060, content: warningText, fontSize: 19, fontFamily: "sans", fontWeight: "normal", fontStyle: "normal", color: "#555", textAlign: "left" }
    );
  }

  elements.push(...footerElements());
  return { number: draft.number, type: "content", elements };
}

function buildCtaSlide(number: number): CarouselSlide {
  return {
    number,
    type: "cta",
    elements: [
      { id: uid(), type: "image", x: 530, y: 400, width: 140, content: "photo:tony", fontSize: 0, fontFamily: "sans", fontWeight: "normal", fontStyle: "normal", color: "", textAlign: "center" },
      { id: uid(), type: "text", x: 300, y: 580, width: 600, content: "Tony Infantino", fontSize: 28, fontFamily: "sans", fontWeight: "bold", fontStyle: "normal", color: "#1a1a1a", textAlign: "center" },
      { id: uid(), type: "text", x: 250, y: 620, width: 700, content: "Mon aventure de CEO tech\nfraichement amoureux du retail", fontSize: 19, fontFamily: "sans", fontWeight: "normal", fontStyle: "normal", color: "#666", textAlign: "center" },
      { id: uid(), type: "text", x: 350, y: 740, width: 500, content: "Ce post vous a plu ?\nN'hésitez pas à liker, commenter\net sauvegarder", fontSize: 22, fontFamily: "sans", fontWeight: "normal", fontStyle: "normal", color: "#1a1a1a", textAlign: "center" },
      { id: uid(), type: "text", x: 420, y: 900, width: 360, content: "👍  💬  🔖", fontSize: 40, fontFamily: "sans", fontWeight: "normal", fontStyle: "normal", color: "#1a1a1a", textAlign: "center" },
      { id: uid(), type: "image", x: 1020, y: 1420, width: 130, content: "logo:metagora", fontSize: 0, fontFamily: "sans", fontWeight: "normal", fontStyle: "normal", color: "", textAlign: "center", locked: true },
    ],
  };
}

function footerElements(): SlideElement[] {
  return [
    { id: uid(), type: "image", x: 60, y: 1390, width: 60, content: "photo:tony-small", fontSize: 0, fontFamily: "sans", fontWeight: "normal", fontStyle: "normal", color: "", textAlign: "center", locked: true },
    { id: uid(), type: "text", x: 130, y: 1395, width: 400, content: "Tony Infantino\nIA et learning pour retailers", fontSize: 15, fontFamily: "sans", fontWeight: "normal", fontStyle: "normal", color: "#666", textAlign: "left", locked: true },
    { id: uid(), type: "image", x: 1020, y: 1400, width: 130, content: "logo:metagora", fontSize: 0, fontFamily: "sans", fontWeight: "normal", fontStyle: "normal", color: "", textAlign: "center", locked: true },
  ];
}

// ─── Render slide to static HTML (for PNG export) ───────

export function renderSlideToHTML(slide: CarouselSlide): string {
  const fontImport = `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400;1,700&family=Inter:wght@400;500;600;700&display=swap');`;
  const fontSerif = "'Playfair Display', Georgia, serif";
  const fontSans = "'Inter', -apple-system, sans-serif";

  const elementsHtml = slide.elements.map((el) => {
    const ff = el.fontFamily === "serif" ? fontSerif : fontSans;
    const baseStyle = `position:absolute;left:${el.x}px;top:${el.y}px;width:${el.width}px;`;

    if (el.type === "image") {
      const src = resolveImageSrc(el.content);
      if (el.content.startsWith("logo:") && el.content !== "logo:metagora") {
        const logoKey = el.content.replace("logo:", "");
        const logo = LOGO_LIBRARY[logoKey];
        if (logo) return `<div style="${baseStyle}text-align:center;">${logo.svg}</div>`;
      }
      return `<div style="${baseStyle}"><img src="${src}" style="max-width:${el.width}px;max-height:${el.width}px;${el.content === "photo:tony" ? "border-radius:50%;border:4px solid #2563eb;" : ""}object-fit:contain;" /></div>`;
    }

    const textStyle = `${baseStyle}font-family:${ff};font-size:${el.fontSize}px;font-weight:${el.fontWeight};font-style:${el.fontStyle};color:${el.color};text-align:${el.textAlign};line-height:1.5;white-space:pre-wrap;word-wrap:break-word;`;
    return `<div style="${textStyle}">${escapeHtml(el.content)}</div>`;
  }).join("\n");

  return `<div style="width:${SLIDE_W}px;height:${SLIDE_H}px;background:${BG_COLOR};position:relative;overflow:hidden;box-sizing:border-box;">
<style>${fontImport}</style>
${elementsHtml}
</div>`;
}

function resolveImageSrc(content: string): string {
  if (content === "photo:tony" || content === "photo:tony-small") return "/carousel/tony-photo.png";
  if (content === "logo:metagora") return "/carousel/metagora-logo.png";
  if (content.startsWith("logo:")) return "";
  if (content.startsWith("data:") || content.startsWith("http") || content.startsWith("/")) return content;
  return content;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
