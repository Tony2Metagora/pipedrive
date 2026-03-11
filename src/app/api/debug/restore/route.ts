/**
 * Restore deals from backup file.
 * GET — lists available backups
 * POST { backup: "deals-backup-xxx.json" } — restores from that backup
 */
import { NextResponse } from "next/server";
import { list, put } from "@vercel/blob";

async function findBlob(filename: string) {
  let hasMore = true;
  let cursor: string | undefined;
  while (hasMore) {
    const result = await list({ cursor });
    for (const blob of result.blobs) {
      if (blob.pathname === filename) return blob;
    }
    hasMore = result.hasMore;
    cursor = result.cursor;
  }
  return null;
}

export async function GET() {
  try {
    const backups: { pathname: string; size: number; uploadedAt: string }[] = [];
    let hasMore = true;
    let cursor: string | undefined;
    while (hasMore) {
      const result = await list({ cursor });
      for (const blob of result.blobs) {
        if (blob.pathname.startsWith("deals-backup-")) {
          backups.push({ pathname: blob.pathname, size: blob.size, uploadedAt: blob.uploadedAt.toISOString() });
        }
      }
      hasMore = result.hasMore;
      cursor = result.cursor;
    }
    return NextResponse.json({ backups });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { backup } = await request.json();
    if (!backup || typeof backup !== "string") {
      return NextResponse.json({ error: "Provide { backup: 'deals-backup-xxx.json' }" }, { status: 400 });
    }

    // Find and read the backup blob
    const blob = await findBlob(backup);
    if (!blob) {
      return NextResponse.json({ error: `Backup ${backup} not found` }, { status: 404 });
    }

    const res = await fetch(blob.downloadUrl, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({ error: `Failed to read backup: ${res.status}` }, { status: 500 });
    }
    const deals = JSON.parse(await res.text());

    if (!Array.isArray(deals) || deals.length === 0) {
      return NextResponse.json({ error: "Backup is empty or invalid" }, { status: 400 });
    }

    // Write to deals.json
    await put("deals.json", JSON.stringify(deals), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 0,
    });

    return NextResponse.json({
      success: true,
      restoredFrom: backup,
      dealCount: deals.length,
      deals: deals.map((d: { id: number; title: string; status: string }) => `${d.id}: ${d.title} (${d.status})`),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
