/**
 * API Route — Télécharger le CSV prospects depuis KV Store
 * Supports query params:
 *   ?ids=1,2,3     → export only specific IDs
 *   ?list_id=xxx   → export only prospects from a specific list
 *   (none)         → export all prospects
 */

import { NextResponse } from "next/server";
import { readBlob } from "@/lib/blob-store";
import { requireAuth } from "@/lib/api-guard";

interface ProspectRow {
  id: string;
  list_id?: string;
  [key: string]: unknown;
}

function escapeCsv(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

const EXPORT_COLUMNS = [
  { key: "prenom", label: "Prénom" },
  { key: "nom", label: "Nom" },
  { key: "email", label: "Email" },
  { key: "telephone", label: "Téléphone" },
  { key: "poste", label: "Poste" },
  { key: "entreprise", label: "Entreprise" },
  { key: "statut", label: "Statut" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "naf_code", label: "Code NAF" },
  { key: "effectifs", label: "Effectifs" },
  { key: "ville", label: "Ville" },
  { key: "siren", label: "SIREN" },
  { key: "siret", label: "SIRET" },
  { key: "categorie_entreprise", label: "Catégorie" },
  { key: "chiffre_affaires", label: "Chiffre d'affaires" },
  { key: "resultat_net", label: "Résultat net" },
  { key: "date_creation_entreprise", label: "Date création" },
  { key: "dirigeants", label: "Dirigeants" },
  { key: "adresse_siege", label: "Adresse siège" },
  { key: "ai_score", label: "Score IA" },
  { key: "ai_comment", label: "Analyse IA" },
  { key: "resume_entreprise", label: "Résumé entreprise" },
  { key: "notes", label: "Notes" },
];

export async function GET(request: Request) {
  const guard = await requireAuth("prospects", "GET");
  if (guard.denied) return guard.denied;
  try {
    const { searchParams } = new URL(request.url);
    const idsParam = searchParams.get("ids");
    const listId = searchParams.get("list_id");
    const filenameParam = searchParams.get("filename");

    let rows = await readBlob<ProspectRow>("prospects.json");

    if (rows.length === 0) {
      return NextResponse.json({ error: "Aucun fichier. Importez d'abord un CSV/Excel." }, { status: 404 });
    }

    // Filter by IDs if provided
    if (idsParam) {
      const idSet = new Set(idsParam.split(",").map((s) => s.trim()));
      rows = rows.filter((r) => idSet.has(String(r.id)));
    }

    // Filter by list if provided
    if (listId) {
      rows = rows.filter((r) => r.list_id === listId);
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: "Aucun prospect à exporter" }, { status: 404 });
    }

    const headerLabels = EXPORT_COLUMNS.map((c) => c.label);
    const csvLines = [
      headerLabels.map(escapeCsv).join(";"),
      ...rows.map((r) =>
        EXPORT_COLUMNS.map((c) => escapeCsv(String((r as Record<string, unknown>)[c.key] ?? ""))).join(";")
      ),
    ];
    const csvContent = "\uFEFF" + csvLines.join("\n");

    const safeCustomName = (filenameParam || "")
      .trim()
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 80);
    const fallbackName = listId ? `prospects-liste-${listId}` : idsParam ? "prospects-selection" : "prospects";
    const filename = `${safeCustomName || fallbackName}.csv`;

    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("GET /api/prospects/download error:", error);
    return NextResponse.json({ error: "Erreur téléchargement" }, { status: 500 });
  }
}
