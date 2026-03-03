/**
 * API Route — Import Excel/CSV (Blob Storage)
 * POST : parse un fichier Excel/CSV et crée les deals dans Blob
 */

import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import {
  createOrganization,
  createPerson,
  createDeal,
  createNote,
} from "@/lib/blob-store";

interface ImportRow {
  nom?: string;
  prenom?: string;
  entreprise?: string;
  email?: string;
  telephone?: string;
  poste?: string;
  notes?: string;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const pipelineId = Number(formData.get("pipeline_id"));
    const stageId = Number(formData.get("stage_id"));

    if (!file) {
      return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json<Record<string, string>>(sheet);

    const rows: ImportRow[] = rawData.map((row) => {
      const keys = Object.keys(row);
      const find = (patterns: string[]) =>
        keys.find((k) => patterns.some((p) => k.toLowerCase().includes(p)));

      return {
        nom: row[find(["nom", "last", "family"]) ?? ""] || "",
        prenom: row[find(["prénom", "prenom", "first"]) ?? ""] || "",
        entreprise: row[find(["entreprise", "société", "societe", "company", "org"]) ?? ""] || "",
        email: row[find(["email", "mail", "courriel"]) ?? ""] || "",
        telephone: row[find(["téléphone", "telephone", "tel", "phone", "mobile"]) ?? ""] || "",
        poste: row[find(["poste", "fonction", "titre", "job", "title", "role"]) ?? ""] || "",
        notes: row[find(["note", "résumé", "resume", "commentaire", "comment"]) ?? ""] || "",
      };
    });

    const preview = formData.get("preview");
    if (preview === "true") {
      return NextResponse.json({ data: { rows, count: rows.length } });
    }

    const results = [];
    for (const row of rows) {
      try {
        const fullName = [row.prenom, row.nom].filter(Boolean).join(" ") || row.entreprise || "Contact inconnu";

        let orgId: number | undefined;
        if (row.entreprise) {
          const org = await createOrganization(row.entreprise);
          orgId = org.id;
        }

        const person = await createPerson({
          name: fullName,
          email: row.email ? [{ value: row.email, primary: true }] : [],
          phone: row.telephone ? [{ value: row.telephone, primary: true }] : [],
          org_id: orgId || null,
          job_title: row.poste || undefined,
        });

        const deal = await createDeal({
          title: `Metagora – ${row.entreprise || fullName}`,
          person_id: person.id,
          org_id: orgId || null,
          pipeline_id: pipelineId,
          stage_id: stageId,
          value: 0,
          currency: "EUR",
          status: "open",
          person_name: fullName,
          org_name: row.entreprise || undefined,
          participants: [person.id],
        });

        if (row.notes) {
          await createNote({
            content: row.notes,
            deal_id: deal.id,
            person_id: person.id,
            org_id: orgId || null,
          });
        }

        results.push({ success: true, name: fullName, dealId: deal.id });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Erreur inconnue";
        results.push({
          success: false,
          name: [row.prenom, row.nom].filter(Boolean).join(" "),
          error: errorMsg,
        });
      }
    }

    return NextResponse.json({
      data: {
        total: rows.length,
        success: results.filter((r) => r.success).length,
        errors: results.filter((r) => !r.success).length,
        results,
      },
    });
  } catch (error) {
    console.error("POST /api/import error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
