/**
 * API Route — Migration deals depuis un fichier Excel → Blob Storage
 * POST : reçoit un fichier Excel exporté de Pipedrive, parse et stocke dans Blob
 */

import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import {
  bulkWriteDeals,
  bulkWritePersons,
  bulkWriteOrganizations,
  getDeals,
  getPersons,
  getOrganizations,
  type Deal,
  type Person,
  type Organization,
} from "@/lib/blob-store";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData = XLSX.utils.sheet_to_json<Record<string, string>>(sheet);

    if (rawData.length === 0) {
      return NextResponse.json({ error: "Fichier vide" }, { status: 400 });
    }

    // Load existing data to avoid duplicates and compute next IDs
    const existingDeals = await getDeals();
    const existingPersons = await getPersons();
    const existingOrgs = await getOrganizations();

    let nextDealId = existingDeals.reduce((max, d) => Math.max(max, d.id), 0) + 1;
    let nextPersonId = existingPersons.reduce((max, p) => Math.max(max, p.id), 0) + 1;
    let nextOrgId = existingOrgs.reduce((max, o) => Math.max(max, o.id), 0) + 1;

    // Maps to reuse orgs and persons
    const orgMap = new Map<string, number>();
    for (const o of existingOrgs) orgMap.set(o.name.toLowerCase(), o.id);
    const personMap = new Map<string, number>();
    for (const p of existingPersons) personMap.set(p.name.toLowerCase(), p.id);

    const newDeals: Deal[] = [];
    const newPersons: Person[] = [];
    const newOrgs: Organization[] = [];

    // Column mapping for Pipedrive French export
    const colMap: Record<string, string> = {};
    const headers = Object.keys(rawData[0]);
    for (const h of headers) {
      const lc = h.toLowerCase();
      if (lc.includes("titre")) colMap.title = h;
      else if (lc.includes("organisation")) colMap.org = h;
      else if (lc.includes("personne")) colMap.person = h;
      else if (lc.includes("prochaine activité") || lc.includes("next activity")) colMap.nextActivity = h;
      else if (lc.includes("étiquette") || lc.includes("label")) colMap.label = h;
      else if (lc.includes("propriétaire") || lc.includes("owner")) colMap.owner = h;
      else if (lc.includes("valeur") || lc.includes("value")) colMap.value = h;
      else if (lc.includes("pipeline")) colMap.pipeline = h;
      else if (lc.includes("étape") || lc.includes("stage")) colMap.stage = h;
    }

    for (const row of rawData) {
      const title = row[colMap.title] || "Deal sans titre";
      const orgName = (row[colMap.org] || "").trim();
      const personName = (row[colMap.person] || "").trim();
      const nextActivityDate = (row[colMap.nextActivity] || "").trim();
      const value = colMap.value ? Number(row[colMap.value]) || 0 : 0;

      // Skip duplicates by title
      if (existingDeals.some((d) => d.title === title) || newDeals.some((d) => d.title === title)) {
        continue;
      }

      // Create or find org
      let orgId: number | null = null;
      if (orgName) {
        const existingOrgId = orgMap.get(orgName.toLowerCase());
        if (existingOrgId) {
          orgId = existingOrgId;
        } else {
          orgId = nextOrgId++;
          const org: Organization = { id: orgId, name: orgName };
          newOrgs.push(org);
          orgMap.set(orgName.toLowerCase(), orgId);
        }
      }

      // Create or find person
      let personId: number | null = null;
      if (personName) {
        const existingPersonId = personMap.get(personName.toLowerCase());
        if (existingPersonId) {
          personId = existingPersonId;
        } else {
          personId = nextPersonId++;
          const person: Person = {
            id: personId,
            name: personName,
            email: [],
            phone: [],
            org_id: orgId,
          };
          newPersons.push(person);
          personMap.set(personName.toLowerCase(), personId);
        }
      }

      // Default pipeline/stage = Hot leads 3-6 mois / cold leads
      const deal: Deal = {
        id: nextDealId++,
        title,
        person_id: personId,
        org_id: orgId,
        pipeline_id: 1,
        stage_id: 2,
        value,
        currency: "EUR",
        status: "open",
        person_name: personName || undefined,
        org_name: orgName || undefined,
        next_activity_date: nextActivityDate || undefined,
        participants: personId ? [personId] : [],
      };
      newDeals.push(deal);
    }

    // Merge and write
    await bulkWriteDeals([...existingDeals, ...newDeals]);
    await bulkWritePersons([...existingPersons, ...newPersons]);
    await bulkWriteOrganizations([...existingOrgs, ...newOrgs]);

    return NextResponse.json({
      success: true,
      counts: {
        deals: newDeals.length,
        persons: newPersons.length,
        organizations: newOrgs.length,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[Migration] Error:", msg);
    return NextResponse.json({ error: `Erreur migration: ${msg}` }, { status: 500 });
  }
}
