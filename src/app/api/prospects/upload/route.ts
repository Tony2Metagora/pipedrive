/**
 * API Route — Upload CSV/Excel prospects
 * POST : reçoit un fichier CSV ou Excel (.xlsx/.xls), le parse, et le stocke dans Vercel Blob
 * Mapping flexible des colonnes vers le format Prospect
 */

import { NextResponse } from "next/server";
import { readBlob, writeBlob, withLock } from "@/lib/blob-store";
import * as XLSX from "xlsx";
import { requireAuth } from "@/lib/api-guard";
import {
  CANONICAL_PROSPECT_FIELDS,
  resolveCanonicalProspectField,
} from "@/lib/prospect-canonical";

interface ProspectRow {
  [key: string]: string | undefined;
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
  linkedin?: string;
  linkedin_entreprise?: string;
  naf_code?: string;
  effectifs?: string;
  ville?: string;
  duree_poste?: string;
  duree_entreprise?: string;
  resume_entreprise?: string;
  ai_score?: string;
  ai_comment?: string;
  extra_fields?: string;
}

interface ProspectList {
  [key: string]: string | number | string[] | undefined;
  id: string;
  name: string;
  company: string;
  created_at: string;
  count: number;
  extra_columns?: string[];
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

// Known prospect fields (top-level)
const KNOWN_FIELDS = new Set<string>(CANONICAL_PROSPECT_FIELDS);

/**
 * column_mapping JSON format (sent by client after parse-headers step):
 * [{ index: number, targetField: string | null, knownField?: string | null }]
 *
 * - index: column index in the CSV/Excel
 * - targetField: selected SaaS field for this source column, or null
 * - knownField: backward compatibility with previous client payload
 */
interface ColumnMapping {
  index: number;
  targetField?: string | null;
  knownField?: string | null;
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
    const columnMappingRaw = formData.get("column_mapping") as string | null;
    if (!file) {
      return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const { rawHeaders, dataRows } = parseFileToHeadersAndRows(file, buffer);

    // Use user-defined column mapping if provided, else fall back to auto-mapping
    let userMapping: ColumnMapping[] | null = null;
    if (columnMappingRaw) {
      try { userMapping = JSON.parse(columnMappingRaw); } catch { /* ignore */ }
    }

    // Build header mapping: for each column index, what SaaS field does it map to?
    const headerMapping: (keyof ProspectRow | null)[] = [];

    if (userMapping && Array.isArray(userMapping)) {
      for (let i = 0; i < rawHeaders.length; i++) {
        const colDef = userMapping.find((m) => m.index === i);
        const targetField = colDef?.targetField || colDef?.knownField || null;
        if (targetField && KNOWN_FIELDS.has(targetField)) {
          headerMapping.push(targetField as keyof ProspectRow);
        } else {
          headerMapping.push(null);
        }
      }
    } else {
      // Legacy auto-mapping
      for (const h of rawHeaders) {
        const clean = h.trim().toLowerCase().replace(/[\u201c\u201d]/g, "");
        const canonical = resolveCanonicalProspectField(clean);
        const fallback = COLUMN_MAP[clean] || null;
        const candidate = (canonical as keyof ProspectRow | null) || fallback;
        headerMapping.push(candidate && KNOWN_FIELDS.has(String(candidate)) ? candidate : null);
      }
    }

    const hasMapped = headerMapping.some((m) => m !== null);
    if (!hasMapped) {
      const detected = rawHeaders.slice(0, 5).join(", ");
      return NextResponse.json({
        error: `Aucune colonne sélectionnée. Détectées : ${detected}.`,
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
        id: "",
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
        linkedin: "",
        linkedin_entreprise: "",
        naf_code: "",
        effectifs: "",
        ville: "",
        duree_poste: "",
        duree_entreprise: "",
        resume_entreprise: "",
        ai_score: "",
        ai_comment: "",
      };

      for (let j = 0; j < rawHeaders.length; j++) {
        const val = values[j] ? String(values[j]).trim() : "";
        if (!val) continue;

        const field = headerMapping[j];
        if (field) {
          row[field] = val;
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

    // Append to existing prospects.
    // Option 2: dedup by list (not globally) when list_id is provided.
    // Fallback to global dedup when no list is targeted.
    let dupInFile = 0;
    let dupWithExisting = 0;
    const nameKey = (r: ProspectRow) => {
      const nom = (r.nom || "").toLowerCase().trim();
      const prenom = (r.prenom || "").toLowerCase().trim();
      const entreprise = (r.entreprise || "").toLowerCase().trim();
      return `${nom}||${prenom}||${entreprise}`;
    };
    await withLock("prospects.json", async () => {
      const existing = await readBlob<ProspectRow>("prospects.json");
      const existingEmails = new Set<string>();
      const existingNames = new Set<string>();
      for (const r of existing) {
        const sameListScope = finalListId ? r.list_id === finalListId : true;
        if (!sameListScope) continue;
        if (r.email) existingEmails.add(r.email.toLowerCase().trim());
        else {
          const nk = nameKey(r);
          if (nk !== "||||") existingNames.add(nk);
        }
      }
      const seenEmails = new Set<string>();
      const seenNames = new Set<string>();
      const deduped: ProspectRow[] = [];
      for (const r of newRows) {
        const email = r.email?.toLowerCase().trim();
        if (email) {
          if (existingEmails.has(email)) { dupWithExisting++; continue; }
          if (seenEmails.has(email)) { dupInFile++; continue; }
          seenEmails.add(email);
        } else {
          const nk = nameKey(r);
          if (nk !== "||||") {
            if (existingNames.has(nk)) { dupWithExisting++; continue; }
            if (seenNames.has(nk)) { dupInFile++; continue; }
            seenNames.add(nk);
          }
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
          const newList: ProspectList = {
            id: finalListId,
            name: listName.trim(),
            company: listCompany.trim(),
            created_at: new Date().toISOString(),
            count: newRows.length,
          };
          lists.push(newList);
        }
        await writeBlob("prospect-lists.json", lists);
      });
    }

    return NextResponse.json({
      success: true,
      count: newRows.length,
      skippedDuplicates: dupInFile + dupWithExisting,
      dupInFile,
      dupWithExisting,
      totalRows: newRows.length + dupInFile + dupWithExisting,
      list_id: finalListId || null,
      extraColumns: [],
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("POST /api/prospects/upload error:", msg);
    return NextResponse.json({ error: `Erreur import: ${msg}` }, { status: 500 });
  }
}
