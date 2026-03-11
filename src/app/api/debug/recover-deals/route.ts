/**
 * Emergency deal recovery endpoint.
 * GET  — preview what deals would be reconstructed from activities + notes + persons
 * POST — actually write reconstructed deals to deals.json (preserving any existing deals)
 */

import { NextResponse } from "next/server";
import { readBlob, writeBlob } from "@/lib/blob-store";
import type { Deal, Activity, Person, Organization, Note } from "@/lib/blob-store";
// Now reads/writes from KV (new blob-store)

interface ReconstructedDeal {
  id: number;
  title: string;
  person_id: number | null;
  org_id: number | null;
  pipeline_id: number;
  stage_id: number;
  value: number;
  currency: string;
  status: string;
  person_name?: string;
  org_name?: string;
  next_activity_date?: string;
  next_activity_subject?: string;
  _source: string; // for debugging: where the data came from
}

export async function GET() {
  try {
    const [activities, persons, orgs, notes, existingDeals] = await Promise.all([
      readBlob<Activity>("activities.json"),
      readBlob<Person>("persons.json"),
      readBlob<Organization>("orgs.json"),
      readBlob<Note>("notes.json"),
      readBlob<Deal>("deals.json"),
    ]);

    // Collect unique deal_ids from activities and notes
    const dealMap = new Map<number, ReconstructedDeal>();

    // From activities: extract deal info
    for (const a of activities) {
      if (!a.deal_id) continue;
      const existing = dealMap.get(a.deal_id);
      if (!existing) {
        dealMap.set(a.deal_id, {
          id: a.deal_id,
          title: a.deal_title || `Deal #${a.deal_id}`,
          person_id: a.person_id,
          org_id: a.org_id,
          pipeline_id: 1, // default — will need manual correction
          stage_id: 2,    // default — will need manual correction
          value: 0,
          currency: "EUR",
          status: "open",
          person_name: a.person_name || undefined,
          org_name: a.org_name || undefined,
          next_activity_date: !a.done ? a.due_date : undefined,
          next_activity_subject: !a.done ? a.subject : undefined,
          _source: "activity",
        });
      } else {
        // Enrich with more info
        if (!existing.person_id && a.person_id) existing.person_id = a.person_id;
        if (!existing.org_id && a.org_id) existing.org_id = a.org_id;
        if (!existing.person_name && a.person_name) existing.person_name = a.person_name;
        if (!existing.org_name && a.org_name) existing.org_name = a.org_name;
        if (a.deal_title && existing.title === `Deal #${a.deal_id}`) existing.title = a.deal_title;
        // Track next pending activity
        if (!a.done && a.due_date) {
          if (!existing.next_activity_date || a.due_date < existing.next_activity_date) {
            existing.next_activity_date = a.due_date;
            existing.next_activity_subject = a.subject;
          }
        }
      }
    }

    // From notes: extract deal IDs we might have missed
    for (const n of notes) {
      if (!n.deal_id) continue;
      if (!dealMap.has(n.deal_id)) {
        dealMap.set(n.deal_id, {
          id: n.deal_id,
          title: `Deal #${n.deal_id}`,
          person_id: n.person_id || null,
          org_id: null,
          pipeline_id: 1,
          stage_id: 2,
          value: 0,
          currency: "EUR",
          status: "open",
          _source: "note",
        });
      }
    }

    // Enrich person_name and org_name from persons/orgs data
    const personMap = new Map(persons.map((p) => [p.id, p]));
    const orgMap = new Map(orgs.map((o) => [o.id, o]));

    for (const deal of dealMap.values()) {
      if (deal.person_id && !deal.person_name) {
        const person = personMap.get(deal.person_id);
        if (person) deal.person_name = person.name;
      }
      if (deal.org_id && !deal.org_name) {
        const org = orgMap.get(deal.org_id);
        if (org) deal.org_name = org.name;
      }
    }

    // Remove deals that already exist in deals.json
    const existingIds = new Set(existingDeals.map((d) => d.id));
    const newDeals = Array.from(dealMap.values()).filter((d) => !existingIds.has(d.id));

    return NextResponse.json({
      existingDeals: existingDeals.length,
      existingDealIds: existingDeals.map((d) => `${d.id}: ${d.title}`),
      recoveredDeals: newDeals.length,
      recoveredDealsList: newDeals.map((d) => ({
        id: d.id,
        title: d.title,
        person_name: d.person_name,
        org_name: d.org_name,
        status: d.status,
        source: d._source,
      })),
      totalAfterRecovery: existingDeals.length + newDeals.length,
      warning: "Call POST to this endpoint to actually write these deals. pipeline_id and stage_id will default to 1/2 and need manual correction.",
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST() {
  try {
    const [activities, persons, orgs, notes, existingDeals] = await Promise.all([
      readBlob<Activity>("activities.json"),
      readBlob<Person>("persons.json"),
      readBlob<Organization>("orgs.json"),
      readBlob<Note>("notes.json"),
      readBlob<Deal>("deals.json"),
    ]);

    const dealMap = new Map<number, Deal>();

    for (const a of activities) {
      if (!a.deal_id) continue;
      const existing = dealMap.get(a.deal_id);
      if (!existing) {
        dealMap.set(a.deal_id, {
          id: a.deal_id,
          title: a.deal_title || `Deal #${a.deal_id}`,
          person_id: a.person_id,
          org_id: a.org_id,
          pipeline_id: 1,
          stage_id: 2,
          value: 0,
          currency: "EUR",
          status: "open",
          person_name: a.person_name || undefined,
          org_name: a.org_name || undefined,
          next_activity_date: !a.done ? a.due_date : undefined,
          next_activity_subject: !a.done ? a.subject : undefined,
        });
      } else {
        if (!existing.person_id && a.person_id) existing.person_id = a.person_id;
        if (!existing.org_id && a.org_id) existing.org_id = a.org_id;
        if (!existing.person_name && a.person_name) existing.person_name = a.person_name;
        if (!existing.org_name && a.org_name) existing.org_name = a.org_name;
        if (a.deal_title && existing.title === `Deal #${a.deal_id}`) existing.title = a.deal_title;
        if (!a.done && a.due_date) {
          if (!existing.next_activity_date || a.due_date < existing.next_activity_date) {
            existing.next_activity_date = a.due_date;
            existing.next_activity_subject = a.subject;
          }
        }
      }
    }

    for (const n of notes) {
      if (!n.deal_id) continue;
      if (!dealMap.has(n.deal_id)) {
        dealMap.set(n.deal_id, {
          id: n.deal_id,
          title: `Deal #${n.deal_id}`,
          person_id: n.person_id || null,
          org_id: null,
          pipeline_id: 1,
          stage_id: 2,
          value: 0,
          currency: "EUR",
          status: "open",
        });
      }
    }

    const personMap = new Map(persons.map((p) => [p.id, p]));
    const orgMap = new Map(orgs.map((o) => [o.id, o]));

    for (const deal of dealMap.values()) {
      if (deal.person_id && !deal.person_name) {
        const person = personMap.get(deal.person_id);
        if (person) deal.person_name = person.name;
      }
      if (deal.org_id && !deal.org_name) {
        const org = orgMap.get(deal.org_id);
        if (org) deal.org_name = org.name;
      }
    }

    // Merge: keep existing deals, add recovered ones
    const existingIds = new Set(existingDeals.map((d) => d.id));
    const newDeals = Array.from(dealMap.values()).filter((d) => !existingIds.has(d.id));
    const allDeals = [...existingDeals, ...newDeals];

    await writeBlob("deals.json", allDeals);

    return NextResponse.json({
      success: true,
      existingKept: existingDeals.length,
      recovered: newDeals.length,
      totalDeals: allDeals.length,
      deals: allDeals.map((d) => `${d.id}: ${d.title} (${d.status})`),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
