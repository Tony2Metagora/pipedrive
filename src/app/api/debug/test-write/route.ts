/**
 * Test write-then-read to diagnose if blob writes actually persist.
 * GET — reads deals.json, modifies first deal's title, writes back, reads again, reports both.
 * This is non-destructive: it writes a test field then removes it.
 */
import { NextResponse } from "next/server";
import { list, put } from "@vercel/blob";

// Find blob URL by scanning all blobs (no prefix filter issues)
async function findBlobUrl(filename: string): Promise<string | null> {
  let hasMore = true;
  let cursor: string | undefined;
  while (hasMore) {
    const result = await list({ cursor });
    for (const blob of result.blobs) {
      if (blob.pathname === filename) return blob.downloadUrl;
    }
    hasMore = result.hasMore;
    cursor = result.cursor;
  }
  return null;
}

async function readDealsRaw(urlOverride?: string): Promise<{ deals: unknown[]; raw: string; url: string }> {
  const url = urlOverride || await findBlobUrl("deals.json");
  if (!url) return { deals: [], raw: "no-url-found", url: "" };
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return { deals: [], raw: `fetch-failed-${res.status}`, url };
  const text = await res.text();
  return { deals: JSON.parse(text), raw: text.slice(0, 200), url };
}

export async function GET() {
  try {
    // READ-ONLY: just check if we can find and read deals.json
    const url = await findBlobUrl("deals.json");
    if (!url) {
      return NextResponse.json({ error: "deals.json not found via list()", allBlobs: await listAll() });
    }
    const data = await readDealsRaw(url);
    return NextResponse.json({
      url,
      count: data.deals.length,
      raw: data.raw,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

async function listAll() {
  const names: string[] = [];
  let hasMore = true;
  let cursor: string | undefined;
  while (hasMore) {
    const result = await list({ cursor });
    for (const b of result.blobs) names.push(b.pathname);
    hasMore = result.hasMore;
    cursor = result.cursor;
  }
  return names;
}
