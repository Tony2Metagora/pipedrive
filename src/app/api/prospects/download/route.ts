/**
 * API Route — Télécharger le CSV prospects depuis Vercel Blob
 */

import { NextResponse } from "next/server";
import { list } from "@vercel/blob";

export async function GET() {
  try {
    const { blobs } = await list({ prefix: "prospects.csv" });
    const blob = blobs.find((b) => b.pathname === "prospects.csv");
    if (!blob) {
      return NextResponse.json({ error: "Aucun fichier CSV. Lancez d'abord la synchronisation." }, { status: 404 });
    }

    const res = await fetch(blob.url, { cache: "no-store" });
    const content = await res.arrayBuffer();

    return new NextResponse(content, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="prospects.csv"',
      },
    });
  } catch (error) {
    console.error("GET /api/prospects/download error:", error);
    return NextResponse.json({ error: "Erreur téléchargement" }, { status: 500 });
  }
}
