/**
 * API Route — LinkedIn Image Search
 * POST: searches Pexels for free stock photos to illustrate LinkedIn posts.
 *       Pexels images are free to use with attribution.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";

const PEXELS_API_KEY = process.env.PEXELS_API_KEY;

export const dynamic = "force-dynamic";

async function searchPexels(query: string) {
  if (!PEXELS_API_KEY) {
    return { error: "Pexels non configuré. Ajoutez PEXELS_API_KEY dans .env.local" };
  }
  if (!query) {
    return { error: "query requis" };
  }

  const res = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=9&orientation=landscape`,
    { headers: { Authorization: PEXELS_API_KEY } }
  );

  if (!res.ok) {
    const errText = await res.text();
    console.error("Pexels error:", res.status, errText);
    return { error: `Erreur Pexels: ${res.status}` };
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

  return { data: images };
}

export async function GET(request: Request) {
  const guard = await requireAuth("linkedin", "GET");
  if (guard.denied) return guard.denied;

  try {
    const url = new URL(request.url);
    const query = url.searchParams.get("q") || "";
    const result = await searchPexels(query);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ data: result.data });
  } catch (error) {
    console.error("GET /api/linkedin/images error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const guard = await requireAuth("linkedin", "POST");
  if (guard.denied) return guard.denied;

  try {
    const { query } = await request.json();
    const result = await searchPexels(query);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ data: result.data });
  } catch (error) {
    console.error("POST /api/linkedin/images error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
