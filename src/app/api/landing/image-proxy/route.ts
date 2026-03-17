/**
 * API Route — Image proxy
 * GET: proxies an external image URL to bypass CORS, returns as blob.
 *      On any failure, returns a 1x1 transparent PNG so <img> tags
 *      degrade gracefully instead of showing broken icons.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

// 1x1 transparent PNG (67 bytes)
const TRANSPARENT_PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAB" +
    "Nl7BcQAAAABJRU5ErkJggg==",
  "base64"
);

function pixelResponse() {
  return new NextResponse(TRANSPARENT_PIXEL, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=60",
    },
  });
}

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
];

export async function GET(request: Request) {
  const guard = await requireAuth("landing", "GET");
  if (guard.denied) return guard.denied;
  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get("url");

  if (!imageUrl) {
    return pixelResponse();
  }

  // Try multiple User-Agent strategies
  for (const ua of USER_AGENTS) {
    try {
      const res = await fetch(imageUrl, {
        headers: {
          "User-Agent": ua,
          "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          "Referer": new URL(imageUrl).origin + "/",
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) continue;

      const contentType = res.headers.get("content-type") || "";

      // Reject non-image responses (e.g. HTML login pages, 403 pages)
      if (!contentType.startsWith("image/")) {
        continue;
      }

      const buffer = await res.arrayBuffer();

      // Reject tiny responses that are probably error pages
      if (buffer.byteLength < 100) continue;

      return new NextResponse(buffer, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=3600",
        },
      });
    } catch {
      // Try next UA
    }
  }

  // All attempts failed — return transparent pixel
  return pixelResponse();
}
