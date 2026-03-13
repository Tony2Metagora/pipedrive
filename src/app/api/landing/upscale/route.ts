/**
 * API Route — Upscale image via Cloudflare Worker (Replicate Real-ESRGAN)
 * POST: accepts imageUrl OR imageDataUrl → downloads if needed → sends to CF worker → polls → returns upscaled image
 */

import { NextResponse } from "next/server";

const WORKER_URL = "https://upscale-worker.metagoraup.workers.dev";
const POLL_INTERVAL = 2000; // 2 seconds
const MAX_POLLS = 60; // 2 min max

export const dynamic = "force-dynamic";
export const maxDuration = 120; // allow up to 2 min for upscaling

async function downloadAsDataUrl(url: string): Promise<string> {
  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "image/*,*/*",
    "Referer": new URL(url).origin + "/",
  };
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const mime = res.headers.get("content-type") || "image/jpeg";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

export async function POST(request: Request) {
  try {
    const { imageUrl, imageDataUrl, scale } = await request.json();

    // Get data URL: prefer provided, otherwise download from URL
    let dataUrl = imageDataUrl;
    if (!dataUrl || !dataUrl.startsWith("data:image/")) {
      if (!imageUrl) {
        return NextResponse.json({ error: "imageUrl ou imageDataUrl requis" }, { status: 400 });
      }
      dataUrl = await downloadAsDataUrl(imageUrl);
    }

    // Step 1: Create prediction via CF worker
    const createRes = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: dataUrl, scale: scale || 2 }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      return NextResponse.json({ error: `Worker error (${createRes.status}): ${errText}` }, { status: 502 });
    }

    const { id } = (await createRes.json()) as { id?: string };
    if (!id) {
      return NextResponse.json({ error: "No prediction ID returned" }, { status: 502 });
    }

    // Step 2: Poll until done
    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL));

      const pollRes = await fetch(`${WORKER_URL}/status?id=${id}`);
      if (!pollRes.ok) continue;

      const poll = (await pollRes.json()) as { status: string; image?: string; error?: string };

      if (poll.status === "succeeded" && poll.image) {
        return NextResponse.json({ success: true, image: poll.image });
      }

      if (poll.status === "failed") {
        return NextResponse.json({ error: poll.error || "Upscaling failed" }, { status: 500 });
      }
    }

    return NextResponse.json({ error: "Timeout: upscaling took too long" }, { status: 504 });
  } catch (error) {
    console.error("POST /api/landing/upscale error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
