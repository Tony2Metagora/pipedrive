/**
 * API Route — Migration one-shot Pipedrive → Blob Storage
 * POST : exporte tous les deals ouverts + activités + notes + participants + orgs depuis Pipedrive
 *        et les stocke dans Vercel Blob. À n'utiliser qu'une seule fois.
 */

import { NextResponse } from "next/server";
import {
  getDeals as getPipedriveDeals,
  getActivities as getPipedriveActivities,
  getDealPersons,
  getNotesForDeal,
  getPerson,
  getOrganization,
} from "@/lib/pipedrive";
import {
  bulkWriteDeals,
  bulkWritePersons,
  bulkWriteOrganizations,
  bulkWriteActivities,
  bulkWriteNotes,
  type Deal,
  type Person,
  type Organization,
  type Activity,
  type Note,
} from "@/lib/blob-store";

export const maxDuration = 60;

export async function POST() {
  try {
    // 1. Fetch all open deals from Pipedrive
    const rawDeals = await getPipedriveDeals({ status: "open" });
    console.log(`[Migration] ${rawDeals.length} deals ouverts trouvés`);

    // 2. Fetch all undone activities from Pipedrive
    const rawActivities = await getPipedriveActivities({ done: "0", limit: "500", sort: "due_date ASC" });
    // Also fetch done activities (recent ones)
    const rawDoneActivities = await getPipedriveActivities({ done: "1", limit: "500", sort: "due_date DESC" });
    console.log(`[Migration] ${rawActivities.length} activités en cours, ${rawDoneActivities.length} terminées`);

    // 3. Collect all unique person IDs and org IDs
    const personIds = new Set<number>();
    const orgIds = new Set<number>();
    const dealIds = new Set<number>();

    for (const d of rawDeals) {
      dealIds.add(d.id);
      const pid = typeof d.person_id === "object" && d.person_id !== null
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? (d.person_id as any).value
        : d.person_id;
      const oid = typeof d.org_id === "object" && d.org_id !== null
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? (d.org_id as any).value
        : d.org_id;
      if (pid) personIds.add(pid);
      if (oid) orgIds.add(oid);
    }

    // 4. Fetch participants for each deal (to get secondary contacts)
    const dealParticipantsMap: Record<number, number[]> = {};
    for (const d of rawDeals) {
      try {
        const participants = await getDealPersons(d.id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pids = participants.map((p: any) => {
          const person = p.person || p;
          const id = person.id || p.id;
          if (id) personIds.add(id);
          return id;
        }).filter(Boolean);
        dealParticipantsMap[d.id] = pids;
      } catch {
        const pid = typeof d.person_id === "object" && d.person_id !== null
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ? (d.person_id as any).value
          : d.person_id;
        dealParticipantsMap[d.id] = pid ? [pid] : [];
      }
    }

    // 5. Fetch all persons
    const personsMap: Record<number, Person> = {};
    for (const pid of personIds) {
      try {
        const p = await getPerson(pid);
        if (p) {
          personsMap[pid] = {
            id: p.id,
            name: p.name,
            email: p.email || [],
            phone: p.phone || [],
            org_id: typeof p.org_id === "object" && p.org_id !== null
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ? (p.org_id as any).value
              : p.org_id,
            job_title: p.job_title || undefined,
          };
          if (personsMap[pid].org_id) orgIds.add(personsMap[pid].org_id as number);
        }
      } catch {
        // skip
      }
    }
    console.log(`[Migration] ${Object.keys(personsMap).length} personnes récupérées`);

    // 6. Fetch all orgs
    const orgsMap: Record<number, Organization> = {};
    for (const oid of orgIds) {
      try {
        const o = await getOrganization(oid);
        if (o) {
          orgsMap[oid] = { id: o.id, name: o.name };
        }
      } catch {
        // skip
      }
    }
    console.log(`[Migration] ${Object.keys(orgsMap).length} organisations récupérées`);

    // 7. Fetch notes for each deal
    const allNotes: Note[] = [];
    let noteIdCounter = 1;
    for (const d of rawDeals) {
      try {
        const dealNotes = await getNotesForDeal(d.id);
        for (const n of dealNotes) {
          allNotes.push({
            id: noteIdCounter++,
            content: n.content,
            deal_id: d.id,
            person_id: n.person_id || null,
            org_id: n.org_id || null,
          });
        }
      } catch {
        // skip
      }
    }
    console.log(`[Migration] ${allNotes.length} notes récupérées`);

    // 8. Build deals array
    const deals: Deal[] = rawDeals.map((d) => {
      const pid = typeof d.person_id === "object" && d.person_id !== null
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? (d.person_id as any).value
        : d.person_id;
      const oid = typeof d.org_id === "object" && d.org_id !== null
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? (d.org_id as any).value
        : d.org_id;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = d as any;
      const personName = raw.person_name || (typeof raw.person_id === "object" && raw.person_id?.name) || personsMap[pid]?.name || undefined;
      const orgName = raw.org_name || (typeof raw.org_id === "object" && raw.org_id?.name) || orgsMap[oid]?.name || undefined;

      return {
        id: d.id,
        title: d.title,
        person_id: pid || null,
        org_id: oid || null,
        pipeline_id: d.pipeline_id,
        stage_id: d.stage_id,
        value: d.value || 0,
        currency: d.currency || "EUR",
        status: d.status || "open",
        person_name: personName,
        org_name: orgName,
        next_activity_date: raw.next_activity_date || undefined,
        next_activity_subject: raw.next_activity_subject || undefined,
        participants: dealParticipantsMap[d.id] || (pid ? [pid] : []),
      };
    });

    // 9. Build activities array — only those linked to our deals
    const allActivities: Activity[] = [];
    for (const a of [...rawActivities, ...rawDoneActivities]) {
      // Only include activities linked to our deals, or to our persons
      if (a.deal_id && dealIds.has(a.deal_id)) {
        allActivities.push({
          id: a.id,
          subject: a.subject,
          type: a.type || "task",
          due_date: a.due_date || "",
          due_time: a.due_time || "",
          done: a.done,
          deal_id: a.deal_id,
          person_id: a.person_id || null,
          org_id: a.org_id || null,
          deal_title: a.deal_title || deals.find((d) => d.id === a.deal_id)?.title || undefined,
          person_name: a.person_name || (a.person_id ? personsMap[a.person_id]?.name : undefined),
          org_name: a.org_name || (a.org_id ? orgsMap[a.org_id]?.name : undefined),
        });
      }
    }
    // Deduplicate by id
    const uniqueActivities = Array.from(new Map(allActivities.map((a) => [a.id, a])).values());
    console.log(`[Migration] ${uniqueActivities.length} activités liées aux deals`);

    // 10. Write everything to Blob
    await bulkWriteDeals(deals);
    await bulkWritePersons(Object.values(personsMap));
    await bulkWriteOrganizations(Object.values(orgsMap));
    await bulkWriteActivities(uniqueActivities);
    await bulkWriteNotes(allNotes);

    return NextResponse.json({
      success: true,
      counts: {
        deals: deals.length,
        persons: Object.keys(personsMap).length,
        organizations: Object.keys(orgsMap).length,
        activities: uniqueActivities.length,
        notes: allNotes.length,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[Migration] Error:", msg);
    return NextResponse.json({ error: `Erreur migration: ${msg}` }, { status: 500 });
  }
}
