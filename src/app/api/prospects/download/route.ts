/**
 * API Route — Télécharger le CSV prospects
 */

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const CSV_PATH = path.join(process.cwd(), "data", "prospects.csv");

export async function GET() {
  try {
    if (!fs.existsSync(CSV_PATH)) {
      return NextResponse.json({ error: "Aucun fichier CSV. Lancez d'abord la synchronisation." }, { status: 404 });
    }

    const content = fs.readFileSync(CSV_PATH);

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
