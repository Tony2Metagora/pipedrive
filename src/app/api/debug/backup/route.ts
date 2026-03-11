/**
 * Backup endpoint — copies deals.json to deals-backup-{timestamp}.json
 * GET — creates backup and returns confirmation
 */
import { NextResponse } from "next/server";
import { readBlob, writeBlob } from "@/lib/blob-store";
import type { Deal } from "@/lib/blob-store";

export async function GET() {
  try {
    const deals = await readBlob<Deal>("deals.json");
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const backupName = `deals-backup-${ts}.json`;
    await writeBlob(backupName, deals);
    return NextResponse.json({
      success: true,
      backup: backupName,
      dealCount: deals.length,
      deals: deals.map((d) => `${d.id}: ${d.title} (${d.status})`),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
