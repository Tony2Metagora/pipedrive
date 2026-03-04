/**
 * API Route — Debug Blob Storage
 * GET : liste tous les blobs et essaie de lire deals.json
 */

import { NextResponse } from "next/server";
import { getDeals, getActivities, getNotes } from "@/lib/blob-store";

export async function GET() {
  try {
    const deals = await getDeals();
    const activities = await getActivities();
    const notes = await getNotes();

    // Find "Macif" deal specifically
    const macifDeal = deals.find((d) => d.title.toLowerCase().includes("macif"));
    const macifActivities = macifDeal
      ? activities.filter((a) => a.deal_id === macifDeal.id)
      : [];

    // Sample deal_ids from activities to see what IDs they have
    const activityDealIds = [...new Set(activities.map((a) => a.deal_id))].slice(0, 20);
    const dealIds = deals.map((d) => d.id).slice(0, 20);

    return NextResponse.json({
      counts: { deals: deals.length, activities: activities.length, notes: notes.length },
      macifDeal: macifDeal ? { id: macifDeal.id, title: macifDeal.title } : null,
      macifActivitiesCount: macifActivities.length,
      sampleActivityDealIds: activityDealIds,
      sampleDealIds: dealIds,
      sampleActivities: activities.slice(0, 3).map((a) => ({ id: a.id, deal_id: a.deal_id, subject: a.subject, deal_title: a.deal_title })),
      sampleDeals: deals.slice(0, 3).map((d) => ({ id: d.id, title: d.title })),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
