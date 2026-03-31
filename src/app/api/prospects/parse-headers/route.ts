/**
 * API Route — Parse CSV/Excel headers + sample rows (no import)
 * POST : reçoit un fichier, retourne les colonnes détectées + 3 lignes d'exemple
 */

import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireAuth } from "@/lib/api-guard";

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
  const commas = (headerLine.match(/,/g) || []).length;
  const semicolons = (headerLine.match(/;/g) || []).length;
  return semicolons > commas ? ";" : ",";
}

function parseLine(line: string, sep: string): string[] {
  if (sep === ",") return parseCsvLine(line);
  return line.split(sep).map((f) => f.replace(/^"|"$/g, "").replace(/""/g, '"'));
}

// Known column name → suggested French label
const LABEL_SUGGESTIONS: Record<string, string> = {
  firstname: "Prénom",
  first_name: "Prénom",
  "first name": "Prénom",
  prénom: "Prénom",
  prenom: "Prénom",
  lastname: "Nom",
  last_name: "Nom",
  "last name": "Nom",
  nom: "Nom",
  "nom de famille": "Nom",
  name: "Nom complet",
  fullname: "Nom complet",
  email: "Email",
  "e-mail": "Email",
  mail: "Email",
  phone: "Téléphone",
  telephone: "Téléphone",
  téléphone: "Téléphone",
  tel: "Téléphone",
  mobile: "Téléphone",
  "phone number": "Téléphone",
  title: "Poste",
  "job title": "Poste",
  job_title: "Poste",
  poste: "Poste",
  fonction: "Poste",
  position: "Poste",
  company: "Entreprise",
  companyname: "Entreprise",
  company_name: "Entreprise",
  "company name": "Entreprise",
  entreprise: "Entreprise",
  société: "Entreprise",
  societe: "Entreprise",
  organisation: "Entreprise",
  organization: "Entreprise",
  "org name": "Entreprise",
  location: "Localisation",
  ville: "Ville",
  city: "Ville",
  industry: "Industrie",
  linkedin: "LinkedIn",
  linkedinprofileurl: "LinkedIn",
  profileurl: "Profil URL",
  defaultprofileurl: "Profil LinkedIn",
  summary: "Résumé",
  titledescription: "Description poste",
  companylocation: "Localisation entreprise",
  companyurl: "URL Entreprise",
  regularcompanyurl: "URL Entreprise",
  companyid: "ID Entreprise",
  connectiondegree: "Degré connexion",
  sharedconnectionscount: "Connexions communes",
  profileimageurl: "Photo profil",
  durationinrole: "Durée dans le poste",
  durationincompany: "Durée dans l'entreprise",
  pastexperiencecompanyname: "Exp. précédente - Entreprise",
  pastexperiencecompanytitle: "Exp. précédente - Poste",
  pastexperiencedate: "Exp. précédente - Date",
  pastexperienceduration: "Exp. précédente - Durée",
  pastexperiencecompanyurl: "Exp. précédente - URL",
  vmid: "VM ID",
  query: "Requête recherche",
  timestamp: "Date extraction",
  ispremium: "Premium",
  isopenlink: "Open Link",
  searchaccountprofileid: "ID compte recherche",
  searchaccountprofilename: "Nom compte recherche",
  statut: "Statut",
  status: "Statut",
  notes: "Notes",
  note: "Notes",
  commentaire: "Notes",
  siren: "SIREN",
  siret: "SIRET",
  naf: "Code NAF",
  naf_code: "Code NAF",
  effectifs: "Effectifs",
  "chiffre d'affaires": "Chiffre d'affaires",
  ca: "Chiffre d'affaires",
};

// Known column → known prospect field mapping
const KNOWN_FIELD_MAP: Record<string, string> = {
  firstname: "prenom",
  first_name: "prenom",
  "first name": "prenom",
  prénom: "prenom",
  prenom: "prenom",
  lastname: "nom",
  last_name: "nom",
  "last name": "nom",
  nom: "nom",
  "nom de famille": "nom",
  email: "email",
  "e-mail": "email",
  mail: "email",
  phone: "telephone",
  telephone: "telephone",
  téléphone: "telephone",
  tel: "telephone",
  mobile: "telephone",
  "phone number": "telephone",
  title: "poste",
  "job title": "poste",
  job_title: "poste",
  poste: "poste",
  fonction: "poste",
  position: "poste",
  company: "entreprise",
  companyname: "entreprise",
  company_name: "entreprise",
  "company name": "entreprise",
  entreprise: "entreprise",
  société: "entreprise",
  societe: "entreprise",
  organisation: "entreprise",
  organization: "entreprise",
  "org name": "entreprise",
  linkedin: "linkedin",
  linkedinprofileurl: "linkedin",
  defaultprofileurl: "linkedin",
  location: "ville",
  ville: "ville",
  city: "ville",
  statut: "statut",
  status: "statut",
  notes: "notes",
  note: "notes",
  commentaire: "notes",
  siren: "siren",
  siret: "siret",
  naf: "naf_code",
  naf_code: "naf_code",
  effectifs: "effectifs",
};

export async function POST(request: Request) {
  const guard = await requireAuth("prospects", "POST");
  if (guard.denied) return guard.denied;
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const name = file.name.toLowerCase();
    const isExcel = name.endsWith(".xlsx") || name.endsWith(".xls");

    let rawHeaders: string[] = [];
    let sampleRows: string[][] = [];
    let totalRows = 0;

    if (isExcel) {
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const json: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      if (json.length < 2) throw new Error("Le fichier est vide ou n'a pas d'en-têtes");
      rawHeaders = json[0].map((h) => String(h));
      const dataRows = json.slice(1).filter((row) =>
        row.some((cell) => String(cell ?? "").trim() !== "")
      );
      totalRows = dataRows.length;
      sampleRows = dataRows.slice(0, 4).map((row) => row.map((cell) => {
        const s = String(cell ?? "");
        return s.length > 100 ? s.slice(0, 100) + "…" : s;
      }));
    } else {
      let content = new TextDecoder("utf-8").decode(buffer);
      if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
      const lines = content.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) throw new Error("Le fichier est vide ou n'a pas d'en-têtes");
      const sep = detectSeparator(lines[0]);
      rawHeaders = parseLine(lines[0], sep);
      totalRows = lines.length - 1;
      sampleRows = lines.slice(1, 5).map((line) =>
        parseLine(line, sep).map((v) => {
          const s = v.trim();
          return s.length > 100 ? s.slice(0, 100) + "…" : s;
        })
      );
    }

    // Build column info with suggested labels and auto-mapping
    const columns = rawHeaders.map((h, idx) => {
      const clean = h.trim().toLowerCase().replace(/[\u201c\u201d]/g, "");
      const cleanNoSpace = clean.replace(/[\s_-]/g, "");
      const suggestedLabel = LABEL_SUGGESTIONS[clean] || LABEL_SUGGESTIONS[cleanNoSpace] || h.trim();
      const knownField = KNOWN_FIELD_MAP[clean] || KNOWN_FIELD_MAP[cleanNoSpace] || null;
      // Auto-select if it maps to a known field
      const autoSelected = !!knownField;
      // Sample values for this column
      const samples = sampleRows.map((row) => row[idx] || "").filter(Boolean);
      return {
        index: idx,
        original: h.trim(),
        suggestedLabel,
        knownField,
        autoSelected,
        samples,
      };
    });

    return NextResponse.json({
      success: true,
      totalRows,
      columns,
      fileName: file.name,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("POST /api/prospects/parse-headers error:", msg);
    return NextResponse.json({ error: `Erreur parsing: ${msg}` }, { status: 500 });
  }
}
