/**
 * API Route — Import Excel/CSV
 * POST : parse un fichier Excel/CSV et crée les deals dans Pipedrive
 */

import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createOrganization, createPerson, createDeal, createNote } from "@/lib/pipedrive";

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

    // Lire le fichier Excel/CSV
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json<Record<string, string>>(sheet);

    // Mapper les colonnes (flexible)
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

    // Mode preview (dry run)
    const preview = formData.get("preview");
    if (preview === "true") {
      return NextResponse.json({ data: { rows, count: rows.length } });
    }

    // Créer les deals dans Pipedrive
    const results = [];
    for (const row of rows) {
      try {
        const fullName = [row.prenom, row.nom].filter(Boolean).join(" ") || row.entreprise || "Contact inconnu";

        // 1. Créer l'organisation
        let orgId: number | undefined;
        if (row.entreprise) {
          const org = await createOrganization(row.entreprise);
          orgId = org.id;
        }

        // 2. Créer la personne
        const person = await createPerson({
          name: fullName,
          email: row.email || undefined,
          phone: row.telephone || undefined,
          org_id: orgId,
          job_title: row.poste || undefined,
        });

        // 3. Créer le deal
        const deal = await createDeal({
          title: `Metagora – ${row.entreprise || fullName}`,
          person_id: person.id,
          org_id: orgId,
          pipeline_id: pipelineId,
          stage_id: stageId,
        });

        // 4. Ajouter une note si présente
        if (row.notes) {
          await createNote({
            content: row.notes,
            deal_id: deal.id,
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
