import { NextResponse } from "next/server";
import { getAllImportContacts } from "@/lib/import-store";

// ─── Deduplication helper ────────────────────────────────

function dedupeKey(firstName: string, lastName: string, company: string): string {
  return `${firstName.trim().toLowerCase()}|${lastName.trim().toLowerCase()}|${company.trim().toLowerCase()}`;
}

// ─── POST: check profiles for duplicates against existing lists ──

export async function POST(request: Request) {
  try {
    const { profiles } = await request.json();

    if (!Array.isArray(profiles) || profiles.length === 0) {
      return NextResponse.json({ profiles: [], total: 0, duplicateCount: 0 });
    }

    // Load all existing contacts for cross-list dedup
    const allExisting = await getAllImportContacts();
    const existingKeys = new Map<string, string>(); // key → listName
    for (const { listName, contact } of allExisting) {
      const key = dedupeKey(contact.first_name, contact.last_name, contact.company);
      if (!existingKeys.has(key)) {
        existingKeys.set(key, listName);
      }
    }

    // Also deduplicate within the batch itself
    const seenInBatch = new Set<string>();
    const results: {
      firstName: string;
      lastName: string;
      title: string;
      companyName: string;
      linkedinUrl: string;
      location?: string;
      isDuplicate: boolean;
      duplicateListName?: string;
    }[] = [];

    for (const p of profiles) {
      const key = dedupeKey(p.firstName || "", p.lastName || "", p.companyName || "");

      // Skip within-batch dupes
      if (seenInBatch.has(key)) continue;
      seenInBatch.add(key);

      const existingList = existingKeys.get(key);
      results.push({
        firstName: p.firstName || "",
        lastName: p.lastName || "",
        title: p.title || "",
        companyName: p.companyName || "",
        linkedinUrl: p.linkedinUrl || "",
        location: p.location || "",
        isDuplicate: !!existingList,
        duplicateListName: existingList || undefined,
      });
    }

    const duplicateCount = results.filter((r) => r.isDuplicate).length;

    return NextResponse.json({
      profiles: results,
      total: results.length,
      duplicateCount,
    });
  } catch (err) {
    console.error("[search/dedupe] Error:", err);
    const message = err instanceof Error ? err.message : "Erreur interne";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
