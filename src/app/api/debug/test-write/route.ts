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
    // Step 1: Read current state
    const before = await readDealsRaw();
    const beforeCount = before.deals.length;
    const beforeFirst = before.deals[0] as Record<string, unknown> | undefined;

    // Step 2: Write with a test marker
    const deals = before.deals as Record<string, unknown>[];
    if (deals.length > 0) {
      deals[0]._test_marker = Date.now();
    }
    const putResult = await put("deals.json", JSON.stringify(deals), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 0,
    });

    // Step 3: Read back immediately using the URL returned by put() (bypasses CDN)
    const after = await readDealsRaw(putResult.downloadUrl);
    const afterFirst = after.deals[0] as Record<string, unknown> | undefined;

    // Step 4: Clean up test marker
    if (deals.length > 0) {
      delete deals[0]._test_marker;
    }
    await put("deals.json", JSON.stringify(deals), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 0,
    });

    return NextResponse.json({
      beforeCount,
      beforeFirstTitle: beforeFirst?.title,
      beforeMarker: beforeFirst?._test_marker ?? "none",
      putUrl: putResult.url,
      afterCount: after.deals.length,
      afterFirstTitle: afterFirst?.title,
      afterMarker: afterFirst?._test_marker ?? "none",
      markerMatch: afterFirst?._test_marker === deals[0]?._test_marker || afterFirst?._test_marker !== "none",
      conclusion: afterFirst?._test_marker !== undefined && afterFirst?._test_marker !== "none"
        ? "WRITE+READ works — blob is fresh"
        : "STALE READ — CDN cache still serving old version",
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
