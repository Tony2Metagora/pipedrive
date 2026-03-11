/**
 * Test write-then-read to diagnose if blob writes actually persist.
 * GET — reads deals.json, modifies first deal's title, writes back, reads again, reports both.
 * This is non-destructive: it writes a test field then removes it.
 */
import { NextResponse } from "next/server";
import { get, put } from "@vercel/blob";

async function readDealsRaw(): Promise<{ deals: unknown[]; raw: string }> {
  const result = await get("deals.json", { access: "private" });
  if (!result || result.statusCode !== 200 || !result.stream) {
    return { deals: [], raw: "" };
  }
  const chunks: Uint8Array[] = [];
  const reader = result.stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const text = new TextDecoder().decode(
    chunks.reduce((acc, chunk) => {
      const merged = new Uint8Array(acc.length + chunk.length);
      merged.set(acc);
      merged.set(chunk, acc.length);
      return merged;
    }, new Uint8Array())
  );
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
