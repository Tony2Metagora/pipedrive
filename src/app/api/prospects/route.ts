/**
 * API Route — Prospects CSV
 * GET : lire le CSV prospects
 * PUT : mettre à jour une ligne du CSV
 */

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const CSV_PATH = path.join(process.cwd(), "data", "prospects.csv");

interface ProspectRow {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  poste: string;
  entreprise: string;
  statut: string;
  pipelines: string;
  notes: string;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

function escapeCsv(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

function readCsv(): ProspectRow[] {
  if (!fs.existsSync(CSV_PATH)) return [];
  let content = fs.readFileSync(CSV_PATH, "utf-8");
  // Remove BOM
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
  const lines = content.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = values[i] || "";
    });
    return row as unknown as ProspectRow;
  });
}

function writeCsv(rows: ProspectRow[]) {
  const headers = ["id", "nom", "prenom", "email", "telephone", "poste", "entreprise", "statut", "pipelines", "notes"];
  const csvLines = [
    headers.join(","),
    ...rows.map((r) =>
      headers.map((h) => escapeCsv(String((r as unknown as Record<string, string>)[h] || ""))).join(",")
    ),
  ];
  const dataDir = path.dirname(CSV_PATH);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(CSV_PATH, "\uFEFF" + csvLines.join("\n"), "utf-8");
}

export async function GET() {
  try {
    const rows = readCsv();
    return NextResponse.json({ data: rows, count: rows.length });
  } catch (error) {
    console.error("GET /api/prospects error:", error);
    return NextResponse.json({ error: "Erreur lecture CSV" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

    const rows = readCsv();
    const idx = rows.findIndex((r) => String(r.id) === String(id));
    if (idx === -1) return NextResponse.json({ error: "Contact non trouvé" }, { status: 404 });

    // Update fields
    for (const [key, value] of Object.entries(updates)) {
      if (key in rows[idx]) {
        (rows[idx] as unknown as Record<string, string>)[key] = String(value);
      }
    }

    writeCsv(rows);
    return NextResponse.json({ data: rows[idx] });
  } catch (error) {
    console.error("PUT /api/prospects error:", error);
    return NextResponse.json({ error: "Erreur mise à jour" }, { status: 500 });
  }
}
