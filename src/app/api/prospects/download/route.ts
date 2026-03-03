/**
 * API Route — Télécharger le CSV prospects depuis Vercel Blob
 */

import { NextResponse } from "next/server";
import { get } from "@vercel/blob";

function escapeCsv(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

export async function GET() {
  try {
    const result = await get("prospects.json", { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return NextResponse.json({ error: "Aucun fichier. Importez d'abord un CSV/Excel." }, { status: 404 });
    }

    const chunks: Uint8Array[] = [];
    const reader = result.stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const text = new TextDecoder().decode(
      chunks.reduce((acc, chunk) => {
        const merged = new Uint8Array(acc.length + chunk.length);
        merged.set(acc);
        merged.set(chunk, acc.length);
        return merged;
      }, new Uint8Array())
    );
    const rows: Record<string, string>[] = JSON.parse(text);

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
