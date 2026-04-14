/**
 * Carousel template — generates HTML slides matching Tony's LinkedIn carousel design.
 * Slides are 1200×1500px (4:5 ratio), exported to PNG via html-to-image client-side.
 * Design reverse-engineered from existing Canva template slides.
 */

// ─── Types ──────────────────────────────────────────────

export interface CarouselSlide {
  number: number;
  type: "cover" | "content" | "cta";
  title?: string;
  role?: string;
  logo?: string;
  bullets?: string[];
  warnings?: string[];
}

export interface CarouselDraft {
  title: string;
  slides: CarouselSlide[];
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

// ─── Constants ──────────────────────────────────────────

export const SLIDE_W = 1200;
export const SLIDE_H = 1500;
const BG = "#f5f5f5";
const BLUE = "#2563eb";

// Font stacks — using web-safe + Google Fonts loaded via @import in the HTML
const FONTS_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400;1,700&family=Inter:wght@400;500;600;700&display=swap');`;
const FONT_SERIF = "'Playfair Display', Georgia, 'Times New Roman', serif";
const FONT_SANS = "'Inter', -apple-system, Helvetica, Arial, sans-serif";

// ─── Footer (shared across all slides) ──────────────────

function footerHTML(): string {
  return `<div style="position:absolute;bottom:50px;left:60px;right:60px;display:flex;align-items:center;justify-content:space-between;">
    <div style="display:flex;align-items:center;gap:14px;">
      <img src="/carousel/tony-photo.png" style="width:60px;height:60px;border-radius:50%;object-fit:cover;" />
      <div>
        <div style="font-family:${FONT_SANS};font-size:17px;font-weight:600;color:#1a1a1a;line-height:1.3;">Tony Infantino</div>
        <div style="font-family:${FONT_SANS};font-size:14px;color:#888;line-height:1.3;">IA et learning pour retailers</div>
      </div>
    </div>
    <img src="/carousel/metagora-logo.png" style="height:28px;" />
  </div>`;
}

// ─── Slide renderers ────────────────────────────────────

function wrapSlide(inner: string): string {
  return `<div style="width:${SLIDE_W}px;height:${SLIDE_H}px;background:${BG};position:relative;overflow:hidden;box-sizing:border-box;">
    <style>${FONTS_IMPORT}</style>
    ${inner}
  </div>`;
}

export function renderCoverSlide(title: string): string {
  return wrapSlide(`
    <div style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100%;padding:100px 80px 180px;">
      <h1 style="font-family:${FONT_SERIF};font-size:76px;font-weight:400;font-style:italic;color:#1a1a1a;text-align:center;line-height:1.2;margin:0;">
        ${escapeHtml(title)}
      </h1>
    </div>
    ${footerHTML()}
  `);
}

export function renderContentSlide(slide: CarouselSlide): string {
  const logo = slide.logo && LOGO_LIBRARY[slide.logo] ? LOGO_LIBRARY[slide.logo] : null;
  const logoName = logo?.name || slide.logo || "";

  const logoBlock = logo
    ? `<div style="text-align:center;padding-top:70px;margin-bottom:8px;">
        ${logo.svg}
        <div style="font-family:${FONT_SANS};font-size:22px;font-weight:500;color:#333;margin-top:8px;">${escapeHtml(logoName)}</div>
      </div>`
    : `<div style="height:70px;"></div>`;

  const roleBlock = slide.role
    ? `<h2 style="font-family:${FONT_SERIF};font-size:54px;font-weight:400;font-style:italic;color:${BLUE};margin:20px 0 30px;line-height:1.15;padding:0 70px;">
        ${escapeHtml(slide.role)}
      </h2>`
    : "";

  const bulletsBlock = (slide.bullets || []).length > 0
    ? `<ul style="list-style:disc;padding:0 70px 0 95px;margin:0 0 24px;">
        ${(slide.bullets || []).map((b) =>
          `<li style="font-family:${FONT_SANS};font-size:21px;color:#333;margin-bottom:12px;line-height:1.5;">${escapeHtml(b)}</li>`
        ).join("")}
      </ul>`
    : "";

  const warningsBlock = (slide.warnings || []).length > 0
    ? `<div style="padding:0 70px;margin-top:20px;">
        <div style="font-family:${FONT_SANS};font-size:20px;font-weight:600;color:#333;margin-bottom:10px;">Attention :</div>
        <ul style="list-style:disc;padding-left:25px;margin:0;">
          ${(slide.warnings || []).map((w) =>
            `<li style="font-family:${FONT_SANS};font-size:19px;color:#555;margin-bottom:10px;line-height:1.45;">${escapeHtml(w)}</li>`
          ).join("")}
        </ul>
      </div>`
    : "";

  return wrapSlide(`
    ${logoBlock}
    ${roleBlock}
    ${bulletsBlock}
    ${warningsBlock}
    ${footerHTML()}
  `);
}

export function renderCtaSlide(): string {
  return wrapSlide(`
    <div style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100%;padding:80px;">
      <div style="width:140px;height:140px;border-radius:50%;border:4px solid ${BLUE};overflow:hidden;margin-bottom:24px;">
        <img src="/carousel/tony-photo.png" style="width:100%;height:100%;object-fit:cover;" />
      </div>
      <div style="font-family:${FONT_SANS};font-size:28px;font-weight:700;color:#1a1a1a;margin-bottom:8px;">Tony Infantino</div>
      <div style="font-family:${FONT_SANS};font-size:19px;color:#666;text-align:center;line-height:1.5;margin-bottom:50px;">Mon aventure de CEO tech<br/>fraichement amoureux du retail</div>
      <div style="background:white;border-radius:24px;padding:28px 44px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,0.07);">
        <div style="font-family:${FONT_SANS};font-size:24px;font-weight:600;color:#1a1a1a;margin-bottom:6px;">Ce post vous a plu ?</div>
        <div style="font-family:${FONT_SANS};font-size:16px;color:#888;margin-bottom:20px;">N'hésitez pas à liker, commenter et sauvegarder</div>
        <div style="display:flex;gap:28px;justify-content:center;">
          <span style="font-size:32px;">👍</span>
          <span style="font-size:32px;">💬</span>
          <span style="font-size:32px;">🔖</span>
        </div>
      </div>
    </div>
    <div style="position:absolute;bottom:50px;right:60px;">
      <img src="/carousel/metagora-logo.png" style="height:28px;" />
    </div>
  `);
}

export function renderSlideHTML(slide: CarouselSlide): string {
  switch (slide.type) {
    case "cover":
      return renderCoverSlide(slide.title || "");
    case "cta":
      return renderCtaSlide();
    case "content":
    default:
      return renderContentSlide(slide);
  }
}

// ─── Helpers ────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
