/**
 * API Route — Debug Blob Storage
 * GET : liste tous les blobs et essaie de lire deals.json
 */

import { NextResponse } from "next/server";
import { list, get } from "@vercel/blob";

export async function GET() {
  try {
    // 1. List all blobs
    const { blobs } = await list();
    const blobInfo = blobs.map((b) => ({
      pathname: b.pathname,
      size: b.size,
      url: b.url.substring(0, 80),
      uploadedAt: b.uploadedAt,
    }));

    // 2. Try to read deals.json via get()
    let dealsGetResult = "not attempted";
    try {
      const result = await get("deals.json", { access: "private" });
      if (!result) {
        dealsGetResult = "get() returned null";
      } else {
        dealsGetResult = `statusCode=${result.statusCode}, hasStream=${!!result.stream}, pathname=${result.blob?.pathname}`;
        if (result.statusCode === 200 && result.stream) {
          const reader = result.stream.getReader();
          const { value } = await reader.read();
          reader.releaseLock();
          const preview = value ? new TextDecoder().decode(value).substring(0, 200) : "empty";
          dealsGetResult += `, preview=${preview}`;
        }
      }
    } catch (err) {
      dealsGetResult = `error: ${err instanceof Error ? err.message : String(err)}`;
    }

    return NextResponse.json({
      totalBlobs: blobs.length,
      blobs: blobInfo,
      dealsGetResult,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
