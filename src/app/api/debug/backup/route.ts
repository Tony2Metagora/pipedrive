/**
 * Full backup endpoint — copies ALL blob store collections to timestamped backup files.
 * GET — creates backups of deals, activities, notes, persons, orgs, prospects
 */
import { NextResponse } from "next/server";
import { readBlob, writeBlob } from "@/lib/blob-store";

const COLLECTIONS = [
  "deals.json",
  "activities.json",
  "notes.json",
  "persons.json",
  "orgs.json",
  "prospects.json",
];

export async function GET() {
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const results: Record<string, { backup: string; count: number }> = {};

    for (const filename of COLLECTIONS) {
      const data = await readBlob<unknown>(filename);
      const backupName = `backup-${ts}/${filename}`;
      await writeBlob(backupName, data);
      results[filename] = { backup: backupName, count: data.length };
    }

    return NextResponse.json({
      success: true,
      timestamp: ts,
      collections: results,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
