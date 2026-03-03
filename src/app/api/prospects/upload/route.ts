/**
 * API Route — Upload CSV prospects
 * POST : reçoit un fichier CSV, le parse, et le stocke dans Vercel Blob
 * Mapping flexible des colonnes CSV vers le format Prospect
 */

import { NextResponse } from "next/server";
import { put } from "@vercel/blob";

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

// Mapping flexible : clé CSV (lowercase) → champ Prospect
const COLUMN_MAP: Record<string, keyof ProspectRow> = {
  // Français
  nom: "nom",
  "nom de famille": "nom",
  name: "nom",
  "last name": "nom",
  "last_name": "nom",
  lastname: "nom",
  prenom: "prenom",
  prénom: "prenom",
  "first name": "prenom",
  "first_name": "prenom",
  firstname: "prenom",
  email: "email",
  "e-mail": "email",
  "adresse email": "email",
  "adresse e-mail": "email",
  mail: "email",
  telephone: "telephone",
  téléphone: "telephone",
  tel: "telephone",
  tél: "telephone",
  phone: "telephone",
  "numéro de téléphone": "telephone",
  "phone number": "telephone",
  mobile: "telephone",
  poste: "poste",
  "job title": "poste",
  "job_title": "poste",
  titre: "poste",
  "titre du poste": "poste",
  fonction: "poste",
  position: "poste",
  entreprise: "entreprise",
  "nom de l'entreprise": "entreprise",
  organisation: "entreprise",
  organization: "entreprise",
  org: "entreprise",
  "org name": "entreprise",
  "org_name": "entreprise",
  "organization name": "entreprise",
  company: "entreprise",
  "company name": "entreprise",
  société: "entreprise",
  societe: "entreprise",
  statut: "statut",
  status: "statut",
  pipeline: "pipelines",
  pipelines: "pipelines",
  notes: "notes",
  note: "notes",
  commentaire: "notes",
  commentaires: "notes",
  // Pipedrive export specifics
  "person - name": "nom",
  "person - first name": "prenom",
  "person - last name": "nom",
  "person - email": "email",
  "person - phone": "telephone",
  "person - organization": "entreprise",
  "person - job title": "poste",
  // ID
  id: "id",
  "person id": "id",
  "person_id": "id",
};

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

function detectSeparator(headerLine: string): string {
  // If there are more semicolons than commas, use semicolon
  const commas = (headerLine.match(/,/g) || []).length;
  const semicolons = (headerLine.match(/;/g) || []).length;
  return semicolons > commas ? ";" : ",";
}

function parseLine(line: string, sep: string): string[] {
  if (sep === ",") return parseCsvLine(line);
  // Simple split for semicolon (with quote handling)
  return line.split(sep).map((f) => f.replace(/^"|"$/g, "").replace(/""/g, '"'));
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
    }

    let content = await file.text();
    // Remove BOM
    if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);

    const lines = content.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) {
      return NextResponse.json({ error: "Le fichier CSV est vide ou n'a pas d'en-têtes" }, { status: 400 });
    }

    // Detect separator
    const sep = detectSeparator(lines[0]);

    // Parse headers and map to prospect fields
    const rawHeaders = parseLine(lines[0], sep);
    const headerMapping: (keyof ProspectRow | null)[] = rawHeaders.map((h) => {
      const clean = h.trim().toLowerCase().replace(/[""]/g, "");
      return COLUMN_MAP[clean] || null;
    });

    // Check we have at least nom or prenom
    const hasMapped = headerMapping.some((m) => m !== null);
    if (!hasMapped) {
      const detected = rawHeaders.slice(0, 5).join(", ");
      return NextResponse.json({
        error: `Colonnes non reconnues. Détectées : ${detected}. Attendues : Nom, Prénom, Email, Téléphone, Poste, Entreprise, Statut, Notes`,
      }, { status: 400 });
    }

    // Parse rows
    // Handle name splitting: if we have "nom" mapped but not "prenom", try to split full name
    const hasPrenom = headerMapping.includes("prenom");
    const hasNom = headerMapping.includes("nom");

    const rows: ProspectRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseLine(lines[i], sep);
      const row: ProspectRow = {
        id: String(i),
        nom: "",
        prenom: "",
        email: "",
        telephone: "",
        poste: "",
        entreprise: "",
        statut: "en cours",
        pipelines: "",
        notes: "",
      };

      for (let j = 0; j < headerMapping.length; j++) {
        const field = headerMapping[j];
        if (field && values[j]) {
          row[field] = values[j].trim();
        }
      }

      // If we have nom but not prenom, split the full name
      if (hasNom && !hasPrenom && row.nom) {
        const parts = row.nom.trim().split(/\s+/);
        if (parts.length > 1) {
          row.prenom = parts[0];
          row.nom = parts.slice(1).join(" ");
        }
      }

      // Skip empty rows
      if (!row.nom && !row.prenom && !row.email) continue;

      rows.push(row);
    }

    // Store in Vercel Blob
    await put("prospects.json", JSON.stringify(rows), {
      access: "public",
      addRandomSuffix: false,
    });

    return NextResponse.json({
      success: true,
      count: rows.length,
      data: rows,
      mappedColumns: rawHeaders.map((h, i) => ({
        csv: h,
        mapped: headerMapping[i] || "(ignoré)",
      })),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("POST /api/prospects/upload error:", msg);
    return NextResponse.json({ error: `Erreur import: ${msg}` }, { status: 500 });
  }
}
