/**
 * API Route — Image proxy
 * GET: proxies an external image URL to bypass CORS, returns as blob
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = await requireAuth("landing", "GET");
  if (guard.denied) return guard.denied;
  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get("url");

  if (!imageUrl) {
    return NextResponse.json({ error: "url param required" }, { status: 400 });
  }

  try {
    const res = await fetch(imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Referer": new URL(imageUrl).origin + "/",
      },
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Failed: ${res.status}` }, { status: res.status });
    }

    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") || "image/jpeg";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
