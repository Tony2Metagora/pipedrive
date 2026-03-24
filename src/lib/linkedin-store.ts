/**
 * LinkedIn Store — persistence for calendar posts, sourcing sites & uploaded files.
 *
 * Keys:
 *   linkedin-posts    → LinkedInPost[]
 *   linkedin-sources  → LinkedInSource[]
 *   linkedin-files    → LinkedInFile[]
 */

import { readBlob, writeBlob, withLock } from "@/lib/blob-store";

// ─── Types ───────────────────────────────────────────────

export interface LinkedInPost {
  id: string;
  title: string;
  content: string;
  theme: string;          // "journal-ceo" | "ia-formation" | "ia-operationnelle" | "evenement"
  hook: string;           // chosen hook (first lines)
  publishDate: string;    // ISO date "2026-03-18"
  publishTime: string;    // "09:00"
  createdAt: string;      // ISO
  imagePrompt?: string;
}

export interface LinkedInSource {
  id: string;
  name: string;
  url: string;
  themes: string[];       // ["journal-ceo", "ia-formation", ...]
  type: "site" | "youtube";
  createdAt: string;
}

// ─── Posts ───────────────────────────────────────────────

const POSTS_KEY = "linkedin-posts.json";

export async function getPosts(): Promise<LinkedInPost[]> {
  return readBlob<LinkedInPost>(POSTS_KEY);
}

export async function createPost(post: Omit<LinkedInPost, "id" | "createdAt">): Promise<LinkedInPost> {
  const entry: LinkedInPost = {
    ...post,
    id: `lp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  await withLock(POSTS_KEY, async () => {
    const posts = await readBlob<LinkedInPost>(POSTS_KEY);
    posts.push(entry);
    await writeBlob(POSTS_KEY, posts);
  });
  return entry;
}

export async function updatePost(id: string, data: Partial<LinkedInPost>): Promise<LinkedInPost | null> {
  let result: LinkedInPost | null = null;
  await withLock(POSTS_KEY, async () => {
    const posts = await readBlob<LinkedInPost>(POSTS_KEY);
    const idx = posts.findIndex((p) => p.id === id);
    if (idx === -1) return;
    posts[idx] = { ...posts[idx], ...data, id };
    result = posts[idx];
    await writeBlob(POSTS_KEY, posts);
  });
  return result;
}

export async function deletePost(id: string): Promise<void> {
  await withLock(POSTS_KEY, async () => {
    const posts = await readBlob<LinkedInPost>(POSTS_KEY);
    await writeBlob(POSTS_KEY, posts.filter((p) => p.id !== id));
  });
}

// ─── Sources ─────────────────────────────────────────────

const SOURCES_KEY = "linkedin-sources.json";

export async function getSources(): Promise<LinkedInSource[]> {
  return readBlob<LinkedInSource>(SOURCES_KEY);
}

export async function createSource(source: Omit<LinkedInSource, "id" | "createdAt">): Promise<LinkedInSource> {
  const entry: LinkedInSource = {
    ...source,
    id: `ls_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  await withLock(SOURCES_KEY, async () => {
    const sources = await readBlob<LinkedInSource>(SOURCES_KEY);
    sources.push(entry);
    await writeBlob(SOURCES_KEY, sources);
  });
  return entry;
}

export async function updateSource(id: string, data: Partial<LinkedInSource>): Promise<LinkedInSource | null> {
  let result: LinkedInSource | null = null;
  await withLock(SOURCES_KEY, async () => {
    const sources = await readBlob<LinkedInSource>(SOURCES_KEY);
    const idx = sources.findIndex((s) => s.id === id);
    if (idx === -1) return;
    sources[idx] = { ...sources[idx], ...data, id };
    result = sources[idx];
    await writeBlob(SOURCES_KEY, sources);
  });
  return result;
}

export async function deleteSource(id: string): Promise<void> {
  await withLock(SOURCES_KEY, async () => {
    const sources = await readBlob<LinkedInSource>(SOURCES_KEY);
    await writeBlob(SOURCES_KEY, sources.filter((s) => s.id !== id));
  });
}

// ─── Files (uploaded document sources) ──────────────────

export interface LinkedInFile {
  id: string;
  name: string;           // original filename
  size: number;           // bytes
  mimeType: string;       // "application/pdf", "text/plain", etc.
  extractedText: string;  // full extracted text content
  createdAt: string;      // ISO
}

const FILES_KEY = "linkedin-files.json";

export async function getFiles(): Promise<LinkedInFile[]> {
  return readBlob<LinkedInFile>(FILES_KEY);
}

export async function getFile(id: string): Promise<LinkedInFile | null> {
  const files = await getFiles();
  return files.find((f) => f.id === id) ?? null;
}

export async function createFile(file: Omit<LinkedInFile, "id" | "createdAt">): Promise<LinkedInFile> {
  const entry: LinkedInFile = {
    ...file,
    id: `lf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  await withLock(FILES_KEY, async () => {
    const files = await readBlob<LinkedInFile>(FILES_KEY);
    files.push(entry);
    await writeBlob(FILES_KEY, files);
  });
  return entry;
}

export async function deleteFile(id: string): Promise<void> {
  await withLock(FILES_KEY, async () => {
    const files = await readBlob<LinkedInFile>(FILES_KEY);
    await writeBlob(FILES_KEY, files.filter((f) => f.id !== id));
  });
}
