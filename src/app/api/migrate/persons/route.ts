/**
 * API Route — Migrate persons (contacts) depuis Pipedrive → Blob
 * POST : récupère tous les contacts Pipedrive avec emails/téléphones
 * et met à jour persons.json dans le Blob en matchant par nom.
 */

import { NextResponse } from "next/server";
import { getAllPersons as getAllPipedrivePersons } from "@/lib/pipedrive";
import {
  getPersons,
  getDeals,
  bulkWritePersons,
  type Person,
} from "@/lib/blob-store";

export const maxDuration = 60;

export async function POST() {
  try {
    // 1. Fetch all persons from Pipedrive
    console.log("[MigratePersons] Fetching all Pipedrive persons...");
    const pdPersons = await getAllPipedrivePersons();
    console.log(`[MigratePersons] ${pdPersons.length} persons from Pipedrive`);

    // 2. Get current blob data
    const blobPersons = await getPersons();
    const blobDeals = await getDeals();
    console.log(`[MigratePersons] ${blobPersons.length} persons in Blob, ${blobDeals.length} deals in Blob`);

    // 3. Build a map of Pipedrive persons by name (lowercase)
    const pdByName = new Map<string, typeof pdPersons[0]>();
    for (const p of pdPersons) {
      if (p.name) pdByName.set(p.name.toLowerCase().trim(), p);
    }

    // 4. Also collect all unique person names from deals that aren't in persons yet
    const existingPersonIds = new Set(blobPersons.map((p) => p.id));
    const newPersons: Person[] = [];
    let maxId = blobPersons.reduce((max, p) => Math.max(max, p.id), 0);

    // 5. Update existing blob persons with Pipedrive email/phone data
    let updated = 0;
    const updatedPersons = blobPersons.map((bp) => {
      const pdMatch = pdByName.get(bp.name.toLowerCase().trim());
      if (pdMatch) {
        updated++;
        return {
          ...bp,
          email: pdMatch.email && pdMatch.email.length > 0 ? pdMatch.email : bp.email,
          phone: pdMatch.phone && pdMatch.phone.length > 0 ? pdMatch.phone : bp.phone,
          job_title: pdMatch.job_title || bp.job_title,
        };
      }
      return bp;
    });

    // 6. Find persons referenced in deals but not in persons.json
    let added = 0;
    for (const deal of blobDeals) {
      if (!deal.person_id || existingPersonIds.has(deal.person_id)) continue;
      // Try to find by person_name in deal
      const personName = deal.person_name;
      if (!personName) continue;
      
      const pdMatch = pdByName.get(personName.toLowerCase().trim());
      if (pdMatch) {
        added++;
        const newId = deal.person_id; // keep the same ID as referenced in the deal
        existingPersonIds.add(newId);
        newPersons.push({
          id: newId,
          name: pdMatch.name,
          email: pdMatch.email || [],
          phone: pdMatch.phone || [],
          org_id: null,
          job_title: pdMatch.job_title || undefined,
        });
      } else {
        // Create a placeholder with just the name
        added++;
        existingPersonIds.add(deal.person_id);
        newPersons.push({
          id: deal.person_id,
          name: personName,
          email: [],
          phone: [],
          org_id: deal.org_id,
        });
      }
    }

    // 7. Also add persons from Pipedrive that are linked to deals but missing
    // Check all Pipedrive persons and add any that match deal person_names
    for (const deal of blobDeals) {
      if (!deal.person_name) continue;
      const alreadyExists = [...updatedPersons, ...newPersons].some(
        (p) => p.name.toLowerCase().trim() === deal.person_name!.toLowerCase().trim()
      );
      if (alreadyExists) continue;

      const pdMatch = pdByName.get(deal.person_name.toLowerCase().trim());
      if (pdMatch) {
        added++;
        maxId++;
        newPersons.push({
          id: maxId,
          name: pdMatch.name,
          email: pdMatch.email || [],
          phone: pdMatch.phone || [],
          org_id: null,
          job_title: pdMatch.job_title || undefined,
        });
      }
    }

    // 8. Write merged data
    const allPersons = [...updatedPersons, ...newPersons];
    await bulkWritePersons(allPersons);

    return NextResponse.json({
      success: true,
      counts: {
        pipedrivePersons: pdPersons.length,
        previousBlobPersons: blobPersons.length,
        updated,
        added,
        totalNow: allPersons.length,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[MigratePersons] Error:", msg);
    return NextResponse.json({ error: `Erreur: ${msg}` }, { status: 500 });
  }
}
