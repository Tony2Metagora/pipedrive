import { NextResponse } from "next/server";
import { getAgentStatus, fetchAgentOutput, PhantomProfile } from "@/lib/phantombuster";
import { getAllImportContacts } from "@/lib/import-store";

// ─── Deduplication helper ────────────────────────────────

function dedupeKey(firstName: string, lastName: string, company: string): string {
  return `${firstName.trim().toLowerCase()}|${lastName.trim().toLowerCase()}|${company.trim().toLowerCase()}`;
}

// ─── GET: poll agent status + results ────────────────────

export async function GET() {
  try {
    const status = await getAgentStatus();

    if (status.status === "running" || status.status === "starting") {
      return NextResponse.json({ status: "running" });
    }

    if (status.status === "error") {
      return NextResponse.json({ status: "error", error: "PhantomBuster: erreur lors de l'extraction" });
    }

    // Finished — fetch output
    const profiles = await fetchAgentOutput();

    if (profiles.length === 0) {
      return NextResponse.json({
        status: "finished",
        profiles: [],
        duplicates: [],
        total: 0,
        duplicateCount: 0,
      });
    }

    // Deduplicate against existing lists
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
    const results: (PhantomProfile & { isDuplicate: boolean; duplicateListName?: string })[] = [];

    for (const p of profiles) {
      const key = dedupeKey(p.firstName, p.lastName, p.companyName);

      // Skip within-batch dupes
      if (seenInBatch.has(key)) continue;
      seenInBatch.add(key);

      const existingList = existingKeys.get(key);
      results.push({
        ...p,
        isDuplicate: !!existingList,
        duplicateListName: existingList || undefined,
      });
    }

    const duplicateCount = results.filter((r) => r.isDuplicate).length;

    return NextResponse.json({
      status: "finished",
      profiles: results,
      total: results.length,
      duplicateCount,
    });
  } catch (err) {
    console.error("[search/status] Error:", err);
    const message = err instanceof Error ? err.message : "Erreur interne";
    return NextResponse.json({ status: "error", error: message }, { status: 500 });
  }
}
