/**
 * API Route — Migrate activités depuis Pipedrive → Blob
 * POST { offset?: number, limit?: number }
 * Récupère TOUTES les activités (done + undone) de Pipedrive en bulk,
 * puis les associe aux deals existants dans Blob par titre.
 */

import { NextResponse } from "next/server";
import {
  getAllDeals as getAllPipedriveDeals,
} from "@/lib/pipedrive";
import {
  getDeals,
  getActivities,
  bulkWriteActivities,
  type Activity,
} from "@/lib/blob-store";

const PD_TOKEN = process.env.PIPEDRIVE_API_TOKEN!;
const PD_BASE = "https://api.pipedrive.com/v1";

export const maxDuration = 60;

// Fetch all activities from Pipedrive (paginated, done or undone)
async function fetchAllPipedriveActivities(done: number): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  let start = 0;
  const limit = 500;
  while (true) {
    try {
      const url = `${PD_BASE}/activities?api_token=${PD_TOKEN}&done=${done}&limit=${limit}&start=${start}&sort=due_date+ASC`;
      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json();
      if (!json.data || json.data.length === 0) break;
      all.push(...json.data);
      if (!json.additional_data?.pagination?.more_items_in_collection) break;
      start += limit;
    } catch {
      break;
    }
  }
  return all;
}

export async function POST() {
  try {
    // 1. Fetch ALL Pipedrive activities (done + undone)
    console.log("[MigrateActivities] Fetching undone activities...");
    const undone = await fetchAllPipedriveActivities(0);
    console.log(`[MigrateActivities] ${undone.length} undone activities`);

    console.log("[MigrateActivities] Fetching done activities...");
    const done = await fetchAllPipedriveActivities(1);
    console.log(`[MigrateActivities] ${done.length} done activities`);

    const allPdActivities = [...undone, ...done];

    // 2. Get Pipedrive deals to map deal_id → title
    const pipedriveDeals = await getAllPipedriveDeals();
    const pdDealIdToTitle = new Map<number, string>();
    for (const d of pipedriveDeals) {
      pdDealIdToTitle.set(d.id, d.title?.toLowerCase().trim() || "");
    }

    // 3. Get blob deals to map title → blob deal
    const blobDeals = await getDeals();
    const titleToBlobDeal = new Map<string, typeof blobDeals[0]>();
    for (const d of blobDeals) {
      titleToBlobDeal.set(d.title.toLowerCase().trim(), d);
    }

    // 4. Match Pipedrive activities to blob deals
    const newActivities: Activity[] = [];
    let nextId = 1;
    let matched = 0;
    let skipped = 0;

    for (const a of allPdActivities) {
      const pdDealId = a.deal_id as number | null;
      if (!pdDealId) { skipped++; continue; }

      // Find the Pipedrive deal title
      const pdTitle = pdDealIdToTitle.get(pdDealId);
      if (!pdTitle) { skipped++; continue; }

      // Find the matching blob deal
      const blobDeal = titleToBlobDeal.get(pdTitle);
      if (!blobDeal) { skipped++; continue; }

      matched++;
      newActivities.push({
        id: nextId++,
        subject: (a.subject as string) || "",
        type: (a.type as string) || "task",
        due_date: (a.due_date as string) || "",
        due_time: (a.due_time as string) || "",
        done: !!(a.done),
        deal_id: blobDeal.id,
        person_id: blobDeal.person_id,
        org_id: blobDeal.org_id,
        deal_title: blobDeal.title,
        person_name: blobDeal.person_name,
        org_name: blobDeal.org_name,
        note: (a.note as string) || undefined,
      });
    }

    console.log(`[MigrateActivities] ${matched} matched, ${skipped} skipped`);

    // 5. Replace all activities in blob (full overwrite)
    await bulkWriteActivities(newActivities);

    const doneCount = newActivities.filter((a) => a.done).length;
    const undoneCount = newActivities.filter((a) => !a.done).length;

    return NextResponse.json({
      success: true,
      counts: {
        total: newActivities.length,
        done: doneCount,
        undone: undoneCount,
        skipped,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[MigrateActivities] Error:", msg);
    return NextResponse.json({ error: `Erreur: ${msg}` }, { status: 500 });
  }
}
