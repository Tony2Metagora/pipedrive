/**
 * API Route — Upscale image via Replicate Real-ESRGAN (direct API call)
 * POST: downloads image → uploads to Replicate → polls prediction → downloads result → recompresses JPEG < 3MB
 */

import { NextResponse } from "next/server";
import sharp from "sharp";
import { requireAuth } from "@/lib/api-guard";

const REPLICATE_VERSION = "f121d640bd286e1fdc67f9799164c1d5be36ff74576ee11c803ae5b665dd46aa";
const POLL_INTERVAL = 3000;
const MAX_POLLS = 40; // ~2 min max
const MAX_OUTPUT_BYTES = 3 * 1024 * 1024; // 3 MB

export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function downloadImage(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept": "image/*,*/*",
      "Referer": new URL(url).origin + "/",
    },
  });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function uploadToReplicate(buffer: Buffer, token: string): Promise<string> {
  const formData = new FormData();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  formData.append("content", new Blob([buffer as any], { type: "image/jpeg" }), "input.jpg");

  const res = await fetch("https://api.replicate.com/v1/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) throw new Error(`Replicate upload failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { urls?: { get?: string } };
  if (!data.urls?.get) throw new Error("No URL from Replicate file upload");
  return data.urls.get;
}

async function compressToJpeg(buffer: Buffer, maxBytes: number): Promise<Buffer> {
  let quality = 85;
  let result = await sharp(buffer).jpeg({ quality }).toBuffer();
  while (result.length > maxBytes && quality > 30) {
    quality -= 10;
    result = await sharp(buffer).jpeg({ quality }).toBuffer();
  }
  // If still too big, resize down
  if (result.length > maxBytes) {
    const meta = await sharp(buffer).metadata();
    const scale = Math.sqrt(maxBytes / result.length) * 0.9;
    const newW = Math.round((meta.width || 1600) * scale);
    result = await sharp(buffer).resize(newW).jpeg({ quality: 80 }).toBuffer();
  }
  return result;
}

export async function POST(request: Request) {
  const guard = await requireAuth("landing", "POST");
  if (guard.denied) return guard.denied;
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "REPLICATE_API_TOKEN manquant" }, { status: 500 });
  }

  try {
    const { imageUrl, imageBase64, scale } = await request.json();

    // Step 1: Get the source image buffer
    let srcBuffer: Buffer;
    if (imageBase64) {
      srcBuffer = Buffer.from(imageBase64, "base64");
    } else if (imageUrl) {
      srcBuffer = await downloadImage(imageUrl);
    } else {
      return NextResponse.json({ error: "imageUrl ou imageBase64 requis" }, { status: 400 });
    }

    // Step 2: Upload to Replicate file storage
    const replicateFileUrl = await uploadToReplicate(srcBuffer, token);

    // Step 3: Create prediction
    const createRes = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version: REPLICATE_VERSION,
        input: { image: replicateFileUrl, scale: scale || 2, face_enhance: false },
      }),
    });

    if (!createRes.ok) {
      return NextResponse.json({ error: `Replicate create error: ${createRes.status} ${await createRes.text()}` }, { status: 502 });
    }

    const prediction = (await createRes.json()) as { id: string };

    // Step 4: Poll until done
    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL));

      const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!pollRes.ok) continue;

      const poll = (await pollRes.json()) as { status: string; output?: string; error?: string };

      if (poll.status === "failed") {
        return NextResponse.json({ error: poll.error || "Upscaling failed" }, { status: 500 });
      }

      if (poll.status === "succeeded" && poll.output) {
        // Step 5: Download the upscaled image
        const upscaledRes = await fetch(poll.output);
        const upscaledBuffer = Buffer.from(await upscaledRes.arrayBuffer());

        // Step 6: Recompress to JPEG < 3MB
        const compressed = await compressToJpeg(upscaledBuffer, MAX_OUTPUT_BYTES);
        const base64 = compressed.toString("base64");
        const dataUrl = `data:image/jpeg;base64,${base64}`;

        return NextResponse.json({
          success: true,
          image: dataUrl,
          originalSize: upscaledBuffer.length,
          compressedSize: compressed.length,
        });
      }
    }

    return NextResponse.json({ error: "Timeout: upscaling took too long" }, { status: 504 });
  } catch (error) {
    console.error("POST /api/landing/upscale error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
