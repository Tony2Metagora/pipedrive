/**
 * API Route — Image search for store photos
 * POST: uses Google Custom Search API to find store images
 */

import { NextResponse } from "next/server";

const CSE_API_KEY = process.env.GOOGLE_CSE_API_KEY;
const CSE_ID = process.env.GOOGLE_CSE_ID;

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (!CSE_API_KEY || !CSE_ID) {
      return NextResponse.json(
        { error: "Google Custom Search non configuré. Ajoutez GOOGLE_CSE_API_KEY et GOOGLE_CSE_ID dans .env.local" },
        { status: 500 }
      );
    }

    const { query } = await request.json();

    if (!query) {
      return NextResponse.json({ error: "query requis" }, { status: 400 });
    }

    const url = new URL("https://www.googleapis.com/customsearch/v1");
    url.searchParams.set("key", CSE_API_KEY);
    url.searchParams.set("cx", CSE_ID);
    url.searchParams.set("q", query);
    url.searchParams.set("searchType", "image");
    url.searchParams.set("num", "9");
    url.searchParams.set("imgSize", "large");
    url.searchParams.set("imgType", "photo");
    url.searchParams.set("safe", "active");

    const res = await fetch(url.toString());

    if (!res.ok) {
      const errText = await res.text();
      console.error("Google CSE error:", res.status, errText);
      return NextResponse.json({ error: `Erreur Google Search: ${res.status}` }, { status: 500 });
    }

    const json = await res.json();
    const images: string[] = (json.items || []).map((item: { link: string }) => item.link);

    return NextResponse.json({ data: images });
  } catch (error) {
    console.error("POST /api/landing/image-search error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
