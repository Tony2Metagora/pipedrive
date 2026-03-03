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
} from "@/lib/pipedrive";
import { getPipelineName } from "@/lib/config";
import { put } from "@vercel/blob";

export const maxDuration = 60;

const API_TOKEN = process.env.PIPEDRIVE_API_TOKEN!;
const BASE_URL = "https://api.pipedrive.com/v1";

async function getAllActivities() {
  const all: { id: number; subject: string; type: string; due_date: string; done: boolean; person_id: number | null }[] = [];
  let start = 0;
  const limit = 500;
  while (true) {
    const url = new URL(`${BASE_URL}/activities`);
    url.searchParams.set("api_token", API_TOKEN);
    url.searchParams.set("start", String(start));
    url.searchParams.set("limit", String(limit));
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) break;
    const json = await res.json();
    const data = json.data;
    if (!data || !Array.isArray(data) || data.length === 0) break;
    all.push(...data);
    if (!json.additional_data?.pagination?.more_items_in_collection) break;
    start += limit;
  }
  return all;
}

async function getAllNotes() {
  const all: { id: number; content: string; person_id: number | null; add_time: string }[] = [];
  let start = 0;
  const limit = 500;
  while (true) {
    const url = new URL(`${BASE_URL}/notes`);
    url.searchParams.set("api_token", API_TOKEN);
    url.searchParams.set("start", String(start));
    url.searchParams.set("limit", String(limit));
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) break;
    const json = await res.json();
    const data = json.data;
    if (!data || !Array.isArray(data) || data.length === 0) break;
    all.push(...data);
    if (!json.additional_data?.pagination?.more_items_in_collection) break;
    start += limit;
  }
  return all;
}

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

    // 2. Fetch ALL notes and activities in bulk (avoid N*2 API calls per person)
    const [allActivities, allNotes] = await Promise.all([
      getAllActivities(),
      getAllNotes(),
    ]);

    // Index by person_id
    const notesByPerson = new Map<number, typeof allNotes>();
    for (const note of allNotes) {
      if (note.person_id) {
        const arr = notesByPerson.get(note.person_id) || [];
        arr.push(note);
        notesByPerson.set(note.person_id, arr);
      }
    }
    const activitiesByPerson = new Map<number, typeof allActivities>();
    for (const act of allActivities) {
      if (act.person_id) {
        const arr = activitiesByPerson.get(act.person_id) || [];
        arr.push(act);
        activitiesByPerson.set(act.person_id, arr);
      }
    }

    // 3. Build rows
    const rows: ProspectRow[] = persons.map((person) => {
      const notes = notesByPerson.get(person.id) || [];
      const activities = activitiesByPerson.get(person.id) || [];

      const personDeals = dealsByPerson.get(person.id) || [];
      const hasOpenDeal = personDeals.some((d) => d.status === "open");
      const statut = hasOpenDeal ? "en cours" : "perdu";

      const pipelineIds = [...new Set(personDeals.map((d) => d.pipeline_id))];
      const pipelinesStr = pipelineIds.map((pid) => getPipelineName(pid)).join(", ");

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
    });

    // 3. Save to Vercel Blob (JSON for API + CSV for download)
    await put("prospects.json", JSON.stringify(rows), {
      access: "public",
      addRandomSuffix: false,
    });

    const headers = ["id", "nom", "prenom", "email", "telephone", "poste", "entreprise", "statut", "pipelines", "notes"];
    const csvLines = [
      headers.join(","),
      ...rows.map((r) =>
        headers.map((h) => escapeCsv(String(r[h as keyof ProspectRow] || ""))).join(",")
      ),
    ];
    const csvContent = "\uFEFF" + csvLines.join("\n");

    await put("prospects.csv", csvContent, {
      access: "public",
      addRandomSuffix: false,
      contentType: "text/csv; charset=utf-8",
    });

    return NextResponse.json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("POST /api/prospects/extract error:", msg);
    return NextResponse.json({ error: `Erreur extraction: ${msg}` }, { status: 500 });
  }
}
