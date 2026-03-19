/**
 * API Route — Upload CSV/Excel prospects
 * POST : reçoit un fichier CSV ou Excel (.xlsx/.xls), le parse, et le stocke dans Vercel Blob
 * Mapping flexible des colonnes vers le format Prospect
 */

import { NextResponse } from "next/server";
import { readBlob, writeBlob, withLock } from "@/lib/blob-store";
import * as XLSX from "xlsx";
import { requireAuth } from "@/lib/api-guard";

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
  list_id?: string;
  score_entreprise?: string;
  score_job?: string;
  linkedin?: string;
  naf_code?: string;
  effectifs?: string;
  ai_score?: string;
  ai_comment?: string;
  resume_entreprise?: string;
}

interface ProspectList {
  id: string;
  name: string;
  company: string;
  created_at: string;
  count: number;
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
  // CRM export EN
  "person - name": "nom",
  "person - first name": "prenom",
  "person - last name": "nom",
  "person - email": "email",
  "person - phone": "telephone",
  "person - organization": "entreprise",
  "person - job title": "poste",
  // CRM export FR
  "personne - nom": "nom",
  "personne - prénom": "prenom",
  "personne - organisation": "entreprise",
  "personne - e-mail": "email",
  "personne - e-mail - travail": "email",
  "personne - e-mail - domicile": "email",
  "personne - e-mail - autre": "email",
  "personne - téléphone": "telephone",
  "personne - téléphone - travail": "telephone",
  "personne - téléphone - domicile": "telephone",
  "personne - téléphone - mobile": "telephone",
  "personne - téléphone - autre": "telephone",
  "personne - poste": "poste",
  "personne - titre du poste": "poste",
  "personne - étiquettes": "pipelines",
  "personne - note": "notes",
  "personne - notes": "notes",
  // ID
  id: "id",
  "person id": "id",
  "person_id": "id",
  "personne - id": "id",
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

function parseFileToHeadersAndRows(file: File, buffer: ArrayBuffer): { rawHeaders: string[]; dataRows: string[][] } {
  const name = file.name.toLowerCase();
  const isExcel = name.endsWith(".xlsx") || name.endsWith(".xls");

  if (isExcel) {
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const json: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    if (json.length < 2) throw new Error("Le fichier Excel est vide ou n'a pas d'en-têtes");
    const rawHeaders = json[0].map((h) => String(h));
    const dataRows = json.slice(1).map((row) => row.map((cell) => String(cell ?? "")));
    return { rawHeaders, dataRows };
  }

  // CSV
  let content = new TextDecoder("utf-8").decode(buffer);
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error("Le fichier CSV est vide ou n'a pas d'en-têtes");
  const sep = detectSeparator(lines[0]);
  const rawHeaders = parseLine(lines[0], sep);
  const dataRows = lines.slice(1).map((line) => parseLine(line, sep));
  return { rawHeaders, dataRows };
}

export async function POST(request: Request) {
  const guard = await requireAuth("prospects", "POST");
  if (guard.denied) return guard.denied;
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const listId = formData.get("list_id") as string | null;
    const listName = formData.get("list_name") as string | null;
    const listCompany = formData.get("list_company") as string | null;
    if (!file) {
      return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const { rawHeaders, dataRows } = parseFileToHeadersAndRows(file, buffer);

    // Map headers to prospect fields
    const headerMapping: (keyof ProspectRow | null)[] = rawHeaders.map((h) => {
      const clean = h.trim().toLowerCase().replace(/[\u201c\u201d]/g, "");
      return COLUMN_MAP[clean] || null;
    });

    const hasMapped = headerMapping.some((m) => m !== null);
    if (!hasMapped) {
      const detected = rawHeaders.slice(0, 5).join(", ");
      return NextResponse.json({
        error: `Colonnes non reconnues. Détectées : ${detected}. Attendues : Nom, Prénom, Email, Téléphone, Poste, Entreprise, Statut, Notes`,
      }, { status: 400 });
    }

    const hasPrenom = headerMapping.includes("prenom");
    const hasNom = headerMapping.includes("nom");

    // Determine or create list
    let finalListId = listId || "";
    if (!finalListId && listName && listCompany) {
      finalListId = `lst_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    const newRows: ProspectRow[] = [];
    for (let i = 0; i < dataRows.length; i++) {
      const values = dataRows[i];
      const row: ProspectRow = {
        id: "", // will be set below
        nom: "",
        prenom: "",
        email: "",
        telephone: "",
        poste: "",
        entreprise: "",
        statut: "en cours",
        pipelines: "",
        notes: "",
        list_id: finalListId || undefined,
        score_entreprise: "",
        score_job: "",
        linkedin: "",
        naf_code: "",
        effectifs: "",
        ai_score: "",
        ai_comment: "",
        resume_entreprise: "",
      };

      for (let j = 0; j < headerMapping.length; j++) {
        const field = headerMapping[j];
        if (field && values[j]) {
          row[field] = String(values[j]).trim();
        }
      }

      if (hasNom && !hasPrenom && row.nom) {
        const parts = row.nom.trim().split(/\s+/);
        if (parts.length > 1) {
          row.prenom = parts[0];
          row.nom = parts.slice(1).join(" ");
        }
      }

      if (!row.nom && !row.prenom && !row.email) continue;

      newRows.push(row);
    }

    // Append to existing prospects, dedup by email OR nom+prenom+entreprise (locked)
    let skippedDuplicates = 0;
    const nameKey = (r: ProspectRow) => {
      const nom = (r.nom || "").toLowerCase().trim();
      const prenom = (r.prenom || "").toLowerCase().trim();
      const entreprise = (r.entreprise || "").toLowerCase().trim();
      return `${nom}||${prenom}||${entreprise}`;
    };
    await withLock("prospects.json", async () => {
      const existing = await readBlob<ProspectRow>("prospects.json");
      // Build sets of existing keys for fast lookup
      const existingEmails = new Set<string>();
      const existingNames = new Set<string>();
      for (const r of existing) {
        if (r.email) existingEmails.add(r.email.toLowerCase().trim());
        else {
          const nk = nameKey(r);
          if (nk !== "||||") existingNames.add(nk);
        }
      }
      // Also dedup within the new rows themselves
      const seenEmails = new Set<string>();
      const seenNames = new Set<string>();
      const deduped: ProspectRow[] = [];
      for (const r of newRows) {
        const email = r.email?.toLowerCase().trim();
        if (email) {
          if (existingEmails.has(email) || seenEmails.has(email)) { skippedDuplicates++; continue; }
          seenEmails.add(email);
        } else {
          const nk = nameKey(r);
          if (nk !== "||||" && (existingNames.has(nk) || seenNames.has(nk))) { skippedDuplicates++; continue; }
          if (nk !== "||||") seenNames.add(nk);
        }
        deduped.push(r);
      }
      const maxId = existing.reduce((max, r) => Math.max(max, Number(r.id) || 0), 0);
      deduped.forEach((r, i) => { r.id = String(maxId + i + 1); });
      newRows.length = 0;
      newRows.push(...deduped);
      await writeBlob("prospects.json", [...existing, ...deduped]);
    });

    // Create or update list metadata
    if (finalListId) {
      await withLock("prospect-lists.json", async () => {
        const lists = await readBlob<ProspectList>("prospect-lists.json");
        const existing = lists.find((l) => l.id === finalListId);
        if (existing) {
          existing.count += newRows.length;
        } else if (listName && listCompany) {
          lists.push({
            id: finalListId,
            name: listName.trim(),
            company: listCompany.trim(),
            created_at: new Date().toISOString(),
            count: newRows.length,
          });
        }
        await writeBlob("prospect-lists.json", lists);
      });
    }

    return NextResponse.json({
      success: true,
      count: newRows.length,
      skippedDuplicates,
      list_id: finalListId || null,
      data: newRows,
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
