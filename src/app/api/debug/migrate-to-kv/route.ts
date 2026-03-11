/**
 * Migration endpoint: reads all data from Vercel Blob and writes to Upstash Redis (KV).
 * GET  — preview: shows what would be migrated (read-only)
 * POST — execute: copies Blob data into KV keys
 * 
 * SAFETY: This does NOT delete anything from Blob. Blob data remains intact.
 */
import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const COLLECTIONS = [
  { blob: "deals.json", kv: "deals" },
  { blob: "activities.json", kv: "activities" },
  { blob: "notes.json", kv: "notes" },
  { blob: "persons.json", kv: "persons" },
  { blob: "orgs.json", kv: "orgs" },
  { blob: "prospects.json", kv: "prospects" },
];

async function readBlobRaw(filename: string): Promise<unknown[]> {
  try {
    const result = await get(filename, { access: "private" });
    if (result === null) return [];
    if (result.statusCode !== 200 || !result.stream) return [];
    const chunks: Uint8Array[] = [];
    const reader = result.stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const text = new TextDecoder().decode(
      chunks.reduce((acc, chunk) => {
        const merged = new Uint8Array(acc.length + chunk.length);
        merged.set(acc);
        merged.set(chunk, acc.length);
        return merged;
      }, new Uint8Array())
    );
    return JSON.parse(text);
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    const preview: Record<string, { blobCount: number; kvCount: number }> = {};

    for (const { blob, kv } of COLLECTIONS) {
      const blobData = await readBlobRaw(blob);
      const kvData = await redis.get<unknown[]>(kv);
      preview[kv] = {
        blobCount: blobData.length,
        kvCount: kvData?.length ?? 0,
      };
    }

    return NextResponse.json({ preview, action: "Use POST to execute migration" });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST() {
  try {
    const results: Record<string, { blobCount: number; written: boolean }> = {};

    for (const { blob, kv } of COLLECTIONS) {
      const blobData = await readBlobRaw(blob);

      if (blobData.length === 0) {
        results[kv] = { blobCount: 0, written: false };
        continue;
      }

      await redis.set(kv, blobData);

      // Verify write
      const verify = await redis.get<unknown[]>(kv);
      if (!verify || verify.length !== blobData.length) {
        return NextResponse.json({
          error: `Verification failed for ${kv}: wrote ${blobData.length}, read back ${verify?.length ?? 0}`,
          partialResults: results,
        }, { status: 500 });
      }

      results[kv] = { blobCount: blobData.length, written: true };
    }

    return NextResponse.json({ success: true, results });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
