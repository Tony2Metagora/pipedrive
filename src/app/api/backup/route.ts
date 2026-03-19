/**
 * API Route — Full backup of all Redis KV data
 * GET → returns JSON with all collections
 */

import { NextResponse } from "next/server";
import { readBlob } from "@/lib/blob-store";
import { requireAuth } from "@/lib/api-guard";

export async function GET(request: Request) {
  const guard = await requireAuth(null, "GET");
  if (guard.denied) return guard.denied;

  // Suppress unused warning
  void request;

  try {
    const [prospects, deals, persons, orgs, activities, notes] = await Promise.all([
      readBlob("prospects.json"),
      readBlob("deals.json"),
      readBlob("persons.json"),
      readBlob("orgs.json"),
      readBlob("activities.json"),
      readBlob("notes.json"),
    ]);

    const backup = {
      timestamp: new Date().toISOString(),
      counts: {
        prospects: prospects.length,
        deals: deals.length,
        persons: persons.length,
        orgs: orgs.length,
        activities: activities.length,
        notes: notes.length,
      },
      data: { prospects, deals, persons, orgs, activities, notes },
    };

    return new NextResponse(JSON.stringify(backup, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="backup-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (error) {
    console.error("Backup error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
