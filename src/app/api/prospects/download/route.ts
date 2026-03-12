/**
 * API Route — Télécharger le CSV prospects depuis KV Store
 */

import { NextResponse } from "next/server";
import { readBlob } from "@/lib/blob-store";

function escapeCsv(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

export async function GET() {
  try {
    const rows = await readBlob<Record<string, string>>("prospects.json");
    if (rows.length === 0) {
      return NextResponse.json({ error: "Aucun fichier. Importez d'abord un CSV/Excel." }, { status: 404 });
    }

    const headers = ["id", "nom", "prenom", "email", "telephone", "poste", "entreprise", "statut", "pipelines", "notes"];
    const csvLines = [
      headers.join(","),
      ...rows.map((r) => headers.map((h) => escapeCsv(String(r[h] || ""))).join(",")),
    ];
    const csvContent = "\uFEFF" + csvLines.join("\n");

    return new NextResponse(csvContent, {
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
