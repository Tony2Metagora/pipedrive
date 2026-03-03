/**
 * API Route — Télécharger le CSV prospects depuis Vercel Blob
 */

import { NextResponse } from "next/server";
import { list, getDownloadUrl } from "@vercel/blob";

function escapeCsv(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

export async function GET() {
  try {
    const { blobs } = await list({ prefix: "prospects.json" });
    const blob = blobs.find((b) => b.pathname === "prospects.json");
    if (!blob) {
      return NextResponse.json({ error: "Aucun fichier. Importez d'abord un CSV/Excel." }, { status: 404 });
    }

    const downloadUrl = await getDownloadUrl(blob.url);
    const res = await fetch(downloadUrl, { cache: "no-store" });
    const rows: Record<string, string>[] = await res.json();

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
