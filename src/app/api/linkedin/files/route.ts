/**
 * API Route — LinkedIn Sources (files + web links)
 * POST   : upload a file (PDF/TXT/MD/DOCX) or add a web link → extract text → store
 * GET    : list all sources (without full text for performance)
 * PATCH  : update theme / comment on a source
 * DELETE : remove a source by id
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import { getFiles, createFile, updateFile, deleteFile } from "@/lib/linkedin-store";

export const dynamic = "force-dynamic";

/* ── PDF text extraction (pure JS, no native deps) ────── */

function extractTextFromPdfBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);

  const parts: string[] = [];

  // Strategy 1: Extract text between BT...ET blocks (PDF text objects)
  const btEtRegex = /BT\s([\s\S]*?)ET/g;
  let match: RegExpExecArray | null;
  while ((match = btEtRegex.exec(text)) !== null) {
    const block = match[1];
    // Extract strings within parentheses (PDF literal strings)
    const strRegex = /\(([^)]*)\)/g;
    let strMatch: RegExpExecArray | null;
    while ((strMatch = strRegex.exec(block)) !== null) {
      const decoded = strMatch[1]
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\\(/g, "(")
        .replace(/\\\)/g, ")")
        .replace(/\\\\/g, "\\");
      if (decoded.trim()) parts.push(decoded);
    }
    // Extract hex strings within angle brackets
    const hexRegex = /<([0-9A-Fa-f\s]+)>/g;
    let hexMatch: RegExpExecArray | null;
    while ((hexMatch = hexRegex.exec(block)) !== null) {
      const hex = hexMatch[1].replace(/\s/g, "");
      if (hex.length >= 4) {
        let decoded = "";
        // Try UTF-16BE first (common in PDF)
        for (let i = 0; i < hex.length - 3; i += 4) {
          const code = parseInt(hex.substring(i, i + 4), 16);
          if (code > 31 && code < 65535) decoded += String.fromCharCode(code);
        }
        if (decoded.trim()) parts.push(decoded);
      }
    }
  }

  // Strategy 2: If BT/ET yielded very little, try extracting all parenthesized strings
  if (parts.join("").length < 100) {
    const allStrRegex = /\(([^)]{2,})\)/g;
    let m: RegExpExecArray | null;
    while ((m = allStrRegex.exec(text)) !== null) {
      const s = m[1].replace(/\\[nrt]/g, " ").replace(/\\(.)/g, "$1").trim();
      if (s.length > 2 && /[a-zA-ZÀ-ÿ]/.test(s)) parts.push(s);
    }
  }

  // Deduplicate consecutive identical strings and join
  const deduped: string[] = [];
  for (const p of parts) {
    if (deduped[deduped.length - 1] !== p) deduped.push(p);
  }

  return deduped.join(" ").replace(/\s+/g, " ").trim();
}

/* ── Web page text extraction ─────────────────────────────── */

async function extractTextFromUrl(url: string): Promise<{ text: string; title: string }> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; MetagoraBot/1.0)" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} — impossible de charger la page`);
  const html = await res.text();

  // Extract <title>
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch?.[1]?.trim() || new URL(url).hostname;

  // Strip scripts, styles, tags → plain text
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

  return { text: cleaned, title };
}

/* ── POST: upload file or add web link ─────────────────────── */

export async function POST(request: Request) {
  const guard = await requireAuth("linkedin", "POST");
  if (guard.denied) return guard.denied;

  try {
    const contentType = request.headers.get("content-type") || "";

    // ── Web link source (JSON body) ──
    if (contentType.includes("application/json")) {
      const body = await request.json();
      const { url, theme, comment } = body as { url?: string; theme?: string; comment?: string };

      if (!url || !url.startsWith("http")) {
        return NextResponse.json({ error: "URL valide requise (https://...)" }, { status: 400 });
      }

      const { text, title } = await extractTextFromUrl(url);
      if (!text || text.length < 50) {
        return NextResponse.json({ error: "Impossible d'extraire du texte de cette page." }, { status: 400 });
      }

      // Truncate
      const MAX_TEXT_LENGTH = 100_000;
      const extractedText = text.length > MAX_TEXT_LENGTH
        ? text.slice(0, MAX_TEXT_LENGTH) + "\n\n[... texte tronqué]"
        : text;

      const stored = await createFile({
        name: title,
        size: new TextEncoder().encode(extractedText).length,
        mimeType: "text/html",
        sourceType: "web",
        url,
        theme: theme || undefined,
        comment: comment || undefined,
        extractedText,
      });

      return NextResponse.json({
        data: {
          id: stored.id,
          name: stored.name,
          size: stored.size,
          sourceType: stored.sourceType,
          url: stored.url,
          theme: stored.theme,
          comment: stored.comment,
          textLength: extractedText.length,
          createdAt: stored.createdAt,
        },
      });
    }

    // ── File upload source (FormData body) ──
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const theme = (formData.get("theme") as string) || undefined;
    const comment = (formData.get("comment") as string) || undefined;

    if (!file) {
      return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
    }

    // Validate size (50 pages ≈ ~5MB max)
    const MAX_SIZE = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "Fichier trop volumineux (max 5MB)" }, { status: 400 });
    }

    // Extract text based on file type
    let extractedText = "";
    const name = file.name.toLowerCase();
    const buffer = await file.arrayBuffer();

    if (name.endsWith(".pdf")) {
      extractedText = extractTextFromPdfBuffer(buffer);
      if (!extractedText || extractedText.length < 20) {
        return NextResponse.json(
          { error: "Impossible d'extraire le texte du PDF. Le fichier est peut-être scanné (image) ou protégé." },
          { status: 400 }
        );
      }
    } else if (name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".markdown")) {
      extractedText = new TextDecoder("utf-8").decode(buffer);
    } else if (name.endsWith(".docx")) {
      // DOCX = ZIP containing XML. Extract text from word/document.xml
      const text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
      // Extract text content from <w:t> tags
      const wtRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
      const parts: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = wtRegex.exec(text)) !== null) {
        if (m[1].trim()) parts.push(m[1]);
      }
      extractedText = parts.join(" ");
      if (!extractedText || extractedText.length < 20) {
        return NextResponse.json(
          { error: "Impossible d'extraire le texte du DOCX." },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { error: "Format non supporté. Utilisez PDF, TXT, MD ou DOCX." },
        { status: 400 }
      );
    }

    // Truncate very long texts (keep ~100KB of text = ~50 pages)
    const MAX_TEXT_LENGTH = 100_000;
    if (extractedText.length > MAX_TEXT_LENGTH) {
      extractedText = extractedText.slice(0, MAX_TEXT_LENGTH) + "\n\n[... texte tronqué à 100 000 caractères]";
    }

    const stored = await createFile({
      name: file.name,
      size: file.size,
      mimeType: file.type || "application/octet-stream",
      sourceType: "file",
      theme,
      comment,
      extractedText,
    });

    return NextResponse.json({
      data: {
        id: stored.id,
        name: stored.name,
        size: stored.size,
        sourceType: stored.sourceType,
        theme: stored.theme,
        comment: stored.comment,
        mimeType: stored.mimeType,
        textLength: extractedText.length,
        createdAt: stored.createdAt,
      },
    });
  } catch (error) {
    console.error("POST /api/linkedin/files error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

/* ── GET: list sources (without full text) ────────────────── */

export async function GET() {
  const guard = await requireAuth("linkedin", "GET");
  if (guard.denied) return guard.denied;

  try {
    const files = await getFiles();
    // Return without extractedText for performance
    const data = files.map((f) => ({
      id: f.id,
      name: f.name,
      size: f.size,
      mimeType: f.mimeType,
      sourceType: f.sourceType || "file",
      url: f.url,
      theme: f.theme,
      comment: f.comment,
      textLength: f.extractedText.length,
      preview: f.extractedText.slice(0, 200),
      createdAt: f.createdAt,
    }));
    return NextResponse.json({ data });
  } catch (error) {
    console.error("GET /api/linkedin/files error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

/* ── PATCH: update theme / comment on a source ────────────── */

export async function PATCH(request: Request) {
  const guard = await requireAuth("linkedin", "PATCH");
  if (guard.denied) return guard.denied;

  try {
    const body = await request.json();
    const { id, theme, comment } = body as { id: string; theme?: string; comment?: string };
    if (!id) return NextResponse.json({ error: "ID requis" }, { status: 400 });

    const updated = await updateFile(id, {
      ...(theme !== undefined ? { theme } : {}),
      ...(comment !== undefined ? { comment } : {}),
    });

    if (!updated) return NextResponse.json({ error: "Source introuvable" }, { status: 404 });
    return NextResponse.json({ data: { id: updated.id, theme: updated.theme, comment: updated.comment } });
  } catch (error) {
    console.error("PATCH /api/linkedin/files error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

/* ── DELETE: remove a source ──────────────────────────────── */

export async function DELETE(request: Request) {
  const guard = await requireAuth("linkedin", "DELETE");
  if (guard.denied) return guard.denied;

  try {
    const body = await request.json();
    const { id } = body as { id: string };
    if (!id) return NextResponse.json({ error: "ID requis" }, { status: 400 });
    await deleteFile(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/linkedin/files error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
