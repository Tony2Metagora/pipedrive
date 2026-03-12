/**
 * API Route — Image search for store photos
 * POST: uses Serper.dev Google Images API to find store images
 */

import { NextResponse } from "next/server";

const SERPER_API_KEY = process.env.SERPER_API_KEY;

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (!SERPER_API_KEY) {
      return NextResponse.json(
        { error: "Serper.dev non configuré. Ajoutez SERPER_API_KEY dans .env.local" },
        { status: 500 }
      );
    }

    const { query } = await request.json();

    if (!query) {
      return NextResponse.json({ error: "query requis" }, { status: 400 });
    }

    const res = await fetch("https://google.serper.dev/images", {
      method: "POST",
      headers: {
        "X-API-KEY": SERPER_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: query,
        num: 9,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Serper error:", res.status, errText);
      return NextResponse.json({ error: `Erreur Serper: ${res.status}` }, { status: 500 });
    }

    const json = await res.json();
    const images: string[] = (json.images || []).map((img: { imageUrl: string }) => img.imageUrl);

    return NextResponse.json({ data: images });
  } catch (error) {
    console.error("POST /api/landing/image-search error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
