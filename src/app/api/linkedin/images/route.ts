/**
 * API Route — LinkedIn Image Search
 * POST: searches Pexels for free stock photos to illustrate LinkedIn posts.
 *       Pexels images are free to use with attribution.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";

const PEXELS_API_KEY = process.env.PEXELS_API_KEY;

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const guard = await requireAuth("linkedin", "POST");
  if (guard.denied) return guard.denied;

  try {
    if (!PEXELS_API_KEY) {
      return NextResponse.json(
        { error: "Pexels non configuré. Ajoutez PEXELS_API_KEY dans .env.local" },
        { status: 500 }
      );
    }

    const { query } = await request.json();

    if (!query) {
      return NextResponse.json({ error: "query requis" }, { status: 400 });
    }

    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=9&orientation=landscape`,
      {
        headers: { Authorization: PEXELS_API_KEY },
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error("Pexels error:", res.status, errText);
      return NextResponse.json(
        { error: `Erreur Pexels: ${res.status}` },
        { status: 500 }
      );
    }

    const json = await res.json();

    const images = (json.photos || []).map(
      (photo: {
        src: { original: string; large: string; medium: string };
        alt: string;
        photographer: string;
        photographer_url: string;
        url: string;
      }) => ({
        url: photo.src.original,
        thumb: photo.src.medium,
        alt: photo.alt || "",
        photographer: photo.photographer,
        link: photo.url,
      })
    );

    return NextResponse.json({ data: images });
  } catch (error) {
    console.error("POST /api/linkedin/images error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
