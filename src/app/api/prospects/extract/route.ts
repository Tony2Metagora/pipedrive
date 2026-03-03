/**
 * API Route — Extraction complète des contacts Pipedrive
 * POST : récupère tous les contacts + deals + notes + activités → JSON
 * Règle statut : au moins 1 deal "open" → "en cours", sinon → "perdu"
 * Colonne notes : dernière note + 3 dernières tâches validées
 */

import { NextResponse } from "next/server";
import {
  getAllPersons,
  getAllDeals,
  getAllOrganizations,
  getPersonNotes,
  getPersonActivities,
} from "@/lib/pipedrive";
import { getPipelineName } from "@/lib/config";
import fs from "fs";
import path from "path";

export const maxDuration = 60;

interface ProspectRow {
  id: number;
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

function splitName(fullName: string): { nom: string; prenom: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return { prenom: parts[0] || "", nom: "" };
  const prenom = parts[0];
  const nom = parts.slice(1).join(" ");
  return { prenom, nom };
}

function cleanHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\n+/g, " ").trim();
}

function escapeCsv(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

export async function POST() {
  try {
    // 1. Fetch everything in parallel
    const [persons, deals, orgs] = await Promise.all([
      getAllPersons(),
      getAllDeals(),
      getAllOrganizations(),
    ]);

    // Build lookup maps
    const orgMap = new Map<number, string>();
    for (const org of orgs) {
      orgMap.set(org.id, org.name);
    }

    // Map deals by person_id
    const dealsByPerson = new Map<number, typeof deals>();
    for (const deal of deals) {
      if (deal.person_id) {
        const existing = dealsByPerson.get(deal.person_id) || [];
        existing.push(deal);
        dealsByPerson.set(deal.person_id, existing);
      }
    }

    // 2. For each person, fetch notes + activities (batched with concurrency limit)
    const rows: ProspectRow[] = [];
    const batchSize = 10;

    for (let i = 0; i < persons.length; i += batchSize) {
      const batch = persons.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async (person) => {
          const [notes, activities] = await Promise.all([
            getPersonNotes(person.id),
            getPersonActivities(person.id),
          ]);

          // Statut: au moins 1 deal open → en cours, sinon → perdu
          const personDeals = dealsByPerson.get(person.id) || [];
          const hasOpenDeal = personDeals.some((d) => d.status === "open");
          const statut = hasOpenDeal ? "en cours" : "perdu";

          // Pipelines associés
          const pipelineIds = [...new Set(personDeals.map((d) => d.pipeline_id))];
          const pipelinesStr = pipelineIds.map((pid) => getPipelineName(pid)).join(", ");

          // Notes column: dernière note + 3 dernières tâches validées
          const lastNote = notes.length > 0 ? cleanHtml(notes[0].content) : "";
          const doneActivities = activities
            .filter((a) => a.done)
            .sort((a, b) => (b.due_date || "").localeCompare(a.due_date || ""))
            .slice(0, 3)
            .map((a) => `[${a.due_date}] ${a.subject}`)
            .join(" | ");

          const noteColumn = [lastNote, doneActivities].filter(Boolean).join(" /// ");

          const { nom, prenom } = splitName(person.name);
          const primaryEmail = person.email?.find((e) => e.primary)?.value || person.email?.[0]?.value || "";
          const primaryPhone = person.phone?.find((p) => p.primary)?.value || person.phone?.[0]?.value || "";
          const orgName = person.org_id ? (orgMap.get(person.org_id) || "") : "";

          return {
            id: person.id,
            nom,
            prenom,
            email: primaryEmail,
            telephone: primaryPhone,
            poste: person.job_title || "",
            entreprise: orgName,
            statut,
            pipelines: pipelinesStr,
            notes: noteColumn,
          };
        })
      );
      rows.push(...results);
    }

    // 3. Save CSV
    const headers = ["id", "nom", "prenom", "email", "telephone", "poste", "entreprise", "statut", "pipelines", "notes"];
    const csvLines = [
      headers.join(","),
      ...rows.map((r) =>
        headers.map((h) => escapeCsv(String(r[h as keyof ProspectRow] || ""))).join(",")
      ),
    ];
    const csvContent = csvLines.join("\n");

    const dataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const csvPath = path.join(dataDir, "prospects.csv");
    fs.writeFileSync(csvPath, "\uFEFF" + csvContent, "utf-8"); // BOM for Excel

    return NextResponse.json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    console.error("POST /api/prospects/extract error:", error);
    return NextResponse.json({ error: "Erreur extraction" }, { status: 500 });
  }
}
