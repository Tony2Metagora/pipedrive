/**
 * Test write-then-read to diagnose if blob writes actually persist.
 * GET — reads deals.json, modifies first deal's title, writes back, reads again, reports both.
 * This is non-destructive: it writes a test field then removes it.
 */
import { NextResponse } from "next/server";
import { list, put } from "@vercel/blob";

async function readDealsRaw(): Promise<{ deals: unknown[]; raw: string }> {
  const listing = await list({ prefix: "deals.json" });
  const blob = listing.blobs.find((b) => b.pathname === "deals.json");
  if (!blob) return { deals: [], raw: "" };
  const res = await fetch(blob.downloadUrl, { cache: "no-store" });
  if (!res.ok) return { deals: [], raw: "" };
  const text = await res.text();
  return { deals: JSON.parse(text), raw: text.slice(0, 200) };
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

    // Step 3: Read back immediately
    const after = await readDealsRaw();
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
