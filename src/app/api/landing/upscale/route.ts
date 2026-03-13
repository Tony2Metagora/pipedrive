/**
 * API Route — Upscale image via Cloudflare Worker (Replicate Real-ESRGAN)
 * POST: send image data URL → create prediction → poll → return upscaled image
 */

import { NextResponse } from "next/server";

const WORKER_URL = "https://upscale-worker.metagoraup.workers.dev";
const POLL_INTERVAL = 2000; // 2 seconds
const MAX_POLLS = 60; // 2 min max

export const dynamic = "force-dynamic";
export const maxDuration = 120; // allow up to 2 min for upscaling

export async function POST(request: Request) {
  try {
    const { imageDataUrl, scale } = await request.json();

    if (!imageDataUrl || !imageDataUrl.startsWith("data:image/")) {
      return NextResponse.json({ error: "imageDataUrl requis (data URL)" }, { status: 400 });
    }

    // Step 1: Create prediction
    const createRes = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: imageDataUrl, scale: scale || 2 }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      return NextResponse.json({ error: `Worker error (${createRes.status}): ${errText}` }, { status: 502 });
    }

    const { id, status: initialStatus } = await createRes.json();
    if (!id) {
      return NextResponse.json({ error: "No prediction ID returned" }, { status: 502 });
    }

    // Step 2: Poll until done
    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL));

      const pollRes = await fetch(`${WORKER_URL}/status?id=${id}`);
      if (!pollRes.ok) continue;

      const poll = await pollRes.json();

      if (poll.status === "succeeded" && poll.image) {
        return NextResponse.json({ success: true, image: poll.image });
      }

      if (poll.status === "failed") {
        return NextResponse.json({ error: poll.error || "Upscaling failed" }, { status: 500 });
      }
      // else: starting/processing — keep polling
    }

    return NextResponse.json({ error: "Timeout: upscaling took too long" }, { status: 504 });
  } catch (error) {
    console.error("POST /api/landing/upscale error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
