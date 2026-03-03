/**
 * API Route — Migrate notes + activités depuis Pipedrive → Blob
 * POST { offset?: number, limit?: number }
 * Récupère les notes et activités Pipedrive pour les deals existants dans Blob.
 * Fait le matching par titre de deal. Traite `limit` deals à partir de `offset`.
 */

import { NextResponse } from "next/server";
import {
  getAllDeals as getAllPipedriveDeals,
  getActivitiesForDeal as getPipedriveActivitiesForDeal,
  getNotesForDeal as getPipedriveNotesForDeal,
} from "@/lib/pipedrive";
import {
  getDeals,
  getActivities,
  getNotes,
  bulkWriteActivities,
  bulkWriteNotes,
  type Activity,
  type Note,
} from "@/lib/blob-store";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const offset = Number(body.offset) || 0;
    const limit = Number(body.limit) || 10;

    // 1. Get all blob deals
    const blobDeals = await getDeals();
    const batch = blobDeals.slice(offset, offset + limit);

    if (batch.length === 0) {
      return NextResponse.json({ success: true, done: true, message: "Tous les deals ont été traités" });
    }

    // 2. Fetch all Pipedrive deals once (to match by title)
    const pipedriveDeals = await getAllPipedriveDeals();
    console.log(`[MigrateNotes] ${pipedriveDeals.length} deals Pipedrive, processing blob deals ${offset}-${offset + batch.length}`);

    // Build a map: title (lowercase) → pipedrive deal id
    const titleToId = new Map<string, number>();
    for (const d of pipedriveDeals) {
      if (d.title) titleToId.set(d.title.toLowerCase().trim(), d.id);
    }

    // 3. Load existing blob data
    const existingActivities = await getActivities();
    const existingNotes = await getNotes();

    let maxActivityId = existingActivities.reduce((max, a) => Math.max(max, a.id), 0);
    let maxNoteId = existingNotes.reduce((max, n) => Math.max(max, n.id), 0);

    const newActivities: Activity[] = [];
    const newNotes: Note[] = [];
    let matched = 0;
    let notFound = 0;

    for (const blobDeal of batch) {
      // Find matching Pipedrive deal by title
      const pdDealId = titleToId.get(blobDeal.title.toLowerCase().trim());
      if (!pdDealId) {
        notFound++;
        continue;
      }
      matched++;

      // Check if we already imported notes/activities for this blob deal
      const alreadyHasNotes = existingNotes.some((n) => n.deal_id === blobDeal.id);
      const alreadyHasActivities = existingActivities.some((a) => a.deal_id === blobDeal.id);
      if (alreadyHasNotes && alreadyHasActivities) continue;

      try {
        // Fetch activities from Pipedrive
        if (!alreadyHasActivities) {
          const pdActivities = await getPipedriveActivitiesForDeal(pdDealId);
          for (const a of pdActivities) {
            newActivities.push({
              id: ++maxActivityId,
              subject: a.subject || "",
              type: a.type || "task",
              due_date: a.due_date || "",
              due_time: a.due_time || "",
              done: !!a.done,
              deal_id: blobDeal.id, // link to blob deal id
              person_id: blobDeal.person_id,
              org_id: blobDeal.org_id,
              deal_title: blobDeal.title,
              person_name: blobDeal.person_name,
              org_name: blobDeal.org_name,
            });
          }
        }

        // Fetch notes from Pipedrive
        if (!alreadyHasNotes) {
          const pdNotes = await getPipedriveNotesForDeal(pdDealId);
          for (const n of pdNotes) {
            newNotes.push({
              id: ++maxNoteId,
              content: n.content || "",
              deal_id: blobDeal.id,
              person_id: n.person_id || blobDeal.person_id,
              org_id: n.org_id || blobDeal.org_id,
            });
          }
        }
      } catch (err) {
        console.error(`[MigrateNotes] Error for deal "${blobDeal.title}":`, err);
      }
    }

    // 4. Merge and write
    if (newActivities.length > 0) {
      await bulkWriteActivities([...existingActivities, ...newActivities]);
    }
    if (newNotes.length > 0) {
      await bulkWriteNotes([...existingNotes, ...newNotes]);
    }

    const hasMore = offset + limit < blobDeals.length;

    return NextResponse.json({
      success: true,
      done: !hasMore,
      batch: { offset, limit, processed: batch.length },
      matched,
      notFound,
      imported: { activities: newActivities.length, notes: newNotes.length },
      nextOffset: hasMore ? offset + limit : null,
      totalDeals: blobDeals.length,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[MigrateNotes] Error:", msg);
    return NextResponse.json({ error: `Erreur: ${msg}` }, { status: 500 });
  }
}
