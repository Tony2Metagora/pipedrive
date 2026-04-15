/**
 * API Route — Parse CSV/Excel headers for ICP Cleaner
 * Reuses the same logic as prospects/parse-headers
 */

import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireAuth } from "@/lib/api-guard";
import { resolveCanonicalProspectField } from "@/lib/prospect-canonical";

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ",") { fields.push(current); current = ""; }
      else { current += ch; }
    }
  }
  fields.push(current);
  return fields;
}

function detectSeparator(headerLine: string): string {
  return (headerLine.match(/;/g) || []).length > (headerLine.match(/,/g) || []).length ? ";" : ",";
}

function parseLine(line: string, sep: string): string[] {
  if (sep === ",") return parseCsvLine(line);
  return line.split(sep).map((f) => f.replace(/^"|"$/g, "").replace(/""/g, '"'));
}

const LABEL_SUGGESTIONS: Record<string, string> = {
  firstname: "Prénom", first_name: "Prénom", "first name": "Prénom", prénom: "Prénom", prenom: "Prénom",
  lastname: "Nom", last_name: "Nom", "last name": "Nom", nom: "Nom",
  email: "Email", "e-mail": "Email", mail: "Email",
  phone: "Téléphone", telephone: "Téléphone", téléphone: "Téléphone", tel: "Téléphone", mobile: "Téléphone", "phone number": "Téléphone",
  title: "Poste", "job title": "Poste", job_title: "Poste", poste: "Poste", fonction: "Poste", position: "Poste",
  company: "Entreprise", companyname: "Entreprise", company_name: "Entreprise", "company name": "Entreprise", entreprise: "Entreprise", société: "Entreprise", societe: "Entreprise",
  linkedin: "LinkedIn", "lien linkedin": "LinkedIn", linkedinprofileurl: "LinkedIn", defaultprofileurl: "LinkedIn",
  company_linkedin: "LinkedIn entreprise", "linkedin entreprise": "LinkedIn entreprise",
  ville: "Ville", city: "Ville", location: "Localisation",
  naf: "Code NAF", naf_code: "Code NAF", "code naf": "Code NAF",
  effectifs: "Effectifs",
  siren: "SIREN", siret: "SIRET",
  durationinrole: "Durée dans le poste", duree_poste: "Durée dans le poste", "durée dans le poste": "Durée dans le poste",
  durationincompany: "Durée dans l'entreprise", duree_entreprise: "Durée dans l'entreprise", "durée dans l'entreprise": "Durée dans l'entreprise",
  "résumé entreprise": "Résumé entreprise", resume_entreprise: "Résumé entreprise",
};

export async function POST(request: Request) {
  const guard = await requireAuth("prospects", "POST");
  if (guard.denied) return guard.denied;
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Fichier requis" }, { status: 400 });

    const buffer = await file.arrayBuffer();
    const name = file.name.toLowerCase();
    const isExcel = name.endsWith(".xlsx") || name.endsWith(".xls");

    let rawHeaders: string[] = [];
    let sampleRows: string[][] = [];
    let totalRows = 0;

    if (isExcel) {
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      if (json.length < 2) throw new Error("Fichier vide");
      rawHeaders = json[0].map((h) => String(h));
      const dataRows = json.slice(1).filter((row) => row.some((c) => String(c ?? "").trim()));
      totalRows = dataRows.length;
      sampleRows = dataRows.slice(0, 4).map((row) => row.map((c) => String(c ?? "").slice(0, 100)));
    } else {
      let content = new TextDecoder("utf-8").decode(buffer);
      if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
      const lines = content.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) throw new Error("Fichier vide");
      const sep = detectSeparator(lines[0]);
      rawHeaders = parseLine(lines[0], sep);
      totalRows = lines.length - 1;
      sampleRows = lines.slice(1, 5).map((l) => parseLine(l, sep).map((v) => v.trim().slice(0, 100)));
    }

    const columns = rawHeaders.map((h, idx) => {
      const clean = h.trim().toLowerCase().replace(/[\u201c\u201d]/g, "");
      const suggestedLabel = LABEL_SUGGESTIONS[clean] || LABEL_SUGGESTIONS[clean.replace(/[\s_-]/g, "")] || h.trim();
      const knownField = resolveCanonicalProspectField(h.trim()) || null;
      return { index: idx, original: h.trim(), suggestedLabel, knownField, autoSelected: !!knownField, samples: sampleRows.map((row) => row[idx] || "").filter(Boolean) };
    });

    return NextResponse.json({ success: true, totalRows, columns, fileName: file.name });
  } catch (error: unknown) {
    return NextResponse.json({ error: `Erreur: ${error instanceof Error ? error.message : String(error)}` }, { status: 500 });
  }
}
