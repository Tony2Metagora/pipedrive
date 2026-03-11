import { NextResponse } from "next/server";
import { list, get } from "@vercel/blob";

export async function GET() {
  try {
    // List ALL blobs in the store
    const allBlobs: { pathname: string; size: number; uploadedAt: string }[] = [];
    let hasMore = true;
    let cursor: string | undefined;
    while (hasMore) {
      const result = await list({ cursor });
      for (const blob of result.blobs) {
        allBlobs.push({
          pathname: blob.pathname,
          size: blob.size,
          uploadedAt: blob.uploadedAt.toISOString(),
        });
      }
      hasMore = result.hasMore;
      cursor = result.cursor;
    }

    // Check deals.json content
    let dealsContent: unknown[] = [];
    try {
      const result = await get("deals.json", { access: "private" });
      if (result && result.statusCode === 200 && result.stream) {
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
        dealsContent = JSON.parse(text);
      }
    } catch {
      // no deals.json
    }

    // Check deals-index.json
    let indexContent: unknown[] = [];
    try {
      const result = await get("deals-index.json", { access: "private" });
      if (result && result.statusCode === 200 && result.stream) {
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
        indexContent = JSON.parse(text);
      }
    } catch {
      // no index
    }

    // List individual deal files
    const dealFiles = allBlobs.filter((b) => b.pathname.startsWith("deals/d-"));

    return NextResponse.json({
      totalBlobs: allBlobs.length,
      allPathnames: allBlobs.map((b) => `${b.pathname} (${b.size}b, ${b.uploadedAt})`),
      dealsJson: {
        count: Array.isArray(dealsContent) ? dealsContent.length : "not-array",
        ids: Array.isArray(dealsContent) ? (dealsContent as { id: number; title: string }[]).map((d) => `${d.id}: ${d.title}`) : [],
      },
      dealsIndex: {
        count: Array.isArray(indexContent) ? indexContent.length : "not-array",
        ids: Array.isArray(indexContent) ? (indexContent as { id: number; title: string }[]).map((d) => `${d.id}: ${d.title}`) : [],
      },
      individualDealFiles: dealFiles,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
