/**
 * Blob Store — couche de persistance JSON dans Vercel Blob Storage.
 *
 * Données stockées :
 * - deals.json      : tableau de Deal
 * - activities.json  : tableau d'Activity
 * - notes.json       : tableau de Note
 * - persons.json     : tableau de Person (contacts liés aux deals)
 * - orgs.json        : tableau d'Organization
 * - prospects.json   : tableau de Prospect (déjà existant)
 */

import { put, get, list, del } from "@vercel/blob";

// ─── Types ───────────────────────────────────────────────

export interface Deal {
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
  lost_reason?: string;
  participants?: number[]; // person IDs
}

export interface Person {
  id: number;
  name: string;
  email: { value: string; primary: boolean }[];
  phone: { value: string; primary: boolean }[];
  org_id: number | null;
  job_title?: string;
}

export interface Activity {
  id: number;
  subject: string;
  type: string;
  due_date: string;
  due_time: string;
  done: boolean;
  deal_id: number | null;
  person_id: number | null;
  org_id: number | null;
  deal_title?: string;
  person_name?: string;
  org_name?: string;
  note?: string;
}

export interface Organization {
  id: number;
  name: string;
}

export interface Note {
  id: number;
  content: string;
  deal_id: number | null;
  person_id: number | null;
  org_id: number | null;
}

// ─── Per-file mutex to prevent read-modify-write race conditions ────

const locks = new Map<string, Promise<void>>();

export function withLock<T>(filename: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(filename) ?? Promise.resolve();
  const next = prev.then(fn, fn); // run fn after previous completes (even if it failed)
  locks.set(filename, next.then(() => {}, () => {})); // swallow result, keep chain
  return next;
}

// ─── Generic Blob helpers ────────────────────────────────

async function readBlobStrict<T>(filename: string): Promise<T[]> {
  const result = await get(filename, { access: "private" });
  if (result === null) return [];
  if (result.statusCode !== 200 || !result.stream) {
    throw new Error(`Blob read failed for ${filename}: status=${result.statusCode}`);
  }
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
}

export async function readBlob<T>(filename: string): Promise<T[]> {
  try {
    return await readBlobStrict<T>(filename);
  } catch (err) {
    console.warn(`[readBlob] Error reading ${filename}, returning []:`, err);
    return [];
  }
}

export async function writeBlob<T>(filename: string, data: T[]): Promise<void> {
  await put(filename, JSON.stringify(data), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

async function mutateBlob<T>(filename: string, mutator: (data: T[]) => T[] | Promise<T[]>): Promise<T[]> {
  return withLock(filename, async () => {
    const data = await readBlobStrict<T>(filename);
    const updated = await mutator(data);
    if (updated.length === 0 && data.length > 3) {
      console.error(`[mutateBlob] BLOCKED: ${filename} would wipe ${data.length} items → refusing write`);
      return data;
    }
    await writeBlob(filename, updated);
    return updated;
  });
}

// ─── Single-object blob helpers (for per-deal storage) ───

async function readSingleBlob<T>(filename: string): Promise<T | null> {
  try {
    const result = await get(filename, { access: "private" });
    if (result === null) return null;
    if (result.statusCode !== 200 || !result.stream) return null;
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
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function writeSingleBlob<T>(filename: string, data: T): Promise<void> {
  await put(filename, JSON.stringify(data), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

async function deleteSingleBlob(filename: string): Promise<void> {
  await del(filename);
}

/** List all blob pathnames matching a prefix */
async function listBlobPathnames(prefix: string): Promise<string[]> {
  const pathnames: string[] = [];
  let hasMore = true;
  let cursor: string | undefined;
  while (hasMore) {
    const result = await list({ prefix, cursor });
    for (const blob of result.blobs) {
      pathnames.push(blob.pathname);
    }
    hasMore = result.hasMore;
    cursor = result.cursor;
  }
  return pathnames;
}

// ─── Deals (per-deal blob: deals/d-{id}.json) ───────────

const DEAL_PREFIX = "deals/d-";
function dealPath(id: number) { return `${DEAL_PREFIX}${id}.json`; }

/** One-time migration: if old deals.json exists, split into individual files and delete it */
let migrationDone = false;
async function ensureDealsMigrated(): Promise<void> {
  if (migrationDone) return;
  migrationDone = true;
  try {
    const oldDeals = await readBlobStrict<Deal>("deals.json");
    if (oldDeals.length === 0) return; // no old data
    console.log(`[deals migration] Migrating ${oldDeals.length} deals from deals.json to individual blobs...`);
    await Promise.all(oldDeals.map((deal) => writeSingleBlob(dealPath(deal.id), deal)));
    await del("deals.json");
    console.log(`[deals migration] Done. Deleted deals.json.`);
  } catch {
    // deals.json doesn't exist or is empty — nothing to migrate
  }
}

export async function getDeals(): Promise<Deal[]> {
  await ensureDealsMigrated();
  const pathnames = await listBlobPathnames(DEAL_PREFIX);
  if (pathnames.length === 0) return [];
  const deals = await Promise.all(
    pathnames.map((p) => readSingleBlob<Deal>(p))
  );
  return deals.filter((d): d is Deal => d !== null);
}

export async function getDeal(id: number): Promise<Deal | null> {
  await ensureDealsMigrated();
  return readSingleBlob<Deal>(dealPath(id));
}

export async function createDeal(data: Omit<Deal, "id">): Promise<Deal> {
  await ensureDealsMigrated();
  // Get next ID by scanning existing deal files
  const pathnames = await listBlobPathnames(DEAL_PREFIX);
  let maxId = 0;
  for (const p of pathnames) {
    const match = p.match(/d-(\d+)\.json$/);
    if (match) maxId = Math.max(maxId, Number(match[1]));
  }
  const created = { ...data, id: maxId + 1 } as Deal;
  await writeSingleBlob(dealPath(created.id), created);
  return created;
}

export async function updateDeal(id: number, data: Partial<Deal>): Promise<Deal | null> {
  await ensureDealsMigrated();
  const path = dealPath(id);
  console.log(`[updateDeal] Reading ${path}...`);
  const deal = await readSingleBlob<Deal>(path);
  if (!deal) {
    console.warn(`[updateDeal] Deal ${id} not found at ${path}`);
    return null;
  }
  const updated = { ...deal, ...data, id };
  console.log(`[updateDeal] Writing ${path}, changes:`, JSON.stringify(data));
  await writeSingleBlob(path, updated);
  // Verify write succeeded
  const verify = await readSingleBlob<Deal>(path);
  console.log(`[updateDeal] Verify ${path}:`, verify ? `pipeline=${verify.pipeline_id}, stage=${verify.stage_id}, status=${verify.status}` : "null!");
  return updated;
}

export async function deleteDeal(id: number): Promise<void> {
  await ensureDealsMigrated();
  await deleteSingleBlob(dealPath(id));
}

// ─── Persons ─────────────────────────────────────────────

export async function getPersons(): Promise<Person[]> {
  return readBlob<Person>("persons.json");
}

export async function getPerson(id: number): Promise<Person | null> {
  const persons = await getPersons();
  return persons.find((p) => p.id === id) ?? null;
}

export async function createPerson(data: Omit<Person, "id">): Promise<Person> {
  let created!: Person;
  await mutateBlob<Person>("persons.json", (persons) => {
    const maxId = persons.reduce((max, p) => Math.max(max, p.id), 0);
    created = { ...data, id: maxId + 1 } as Person;
    return [...persons, created];
  });
  return created;
}

export async function updatePerson(id: number, data: Partial<Person>): Promise<Person | null> {
  let result: Person | null = null;
  await mutateBlob<Person>("persons.json", (persons) => {
    const idx = persons.findIndex((p) => p.id === id);
    if (idx === -1) return persons;
    // Handle email/phone as special fields (string → array)
    const update = { ...data };
    if (typeof update.email === "string") {
      (update as Person).email = [{ value: update.email as unknown as string, primary: true }];
    }
    if (typeof update.phone === "string") {
      (update as Person).phone = [{ value: update.phone as unknown as string, primary: true }];
    }
    persons[idx] = { ...persons[idx], ...update, id };
    result = persons[idx];
    return persons;
  });
  return result;
}

// ─── Organizations ───────────────────────────────────────

export async function getOrganizations(): Promise<Organization[]> {
  return readBlob<Organization>("orgs.json");
}

export async function getOrganization(id: number): Promise<Organization | null> {
  const orgs = await getOrganizations();
  return orgs.find((o) => o.id === id) ?? null;
}

export async function createOrganization(name: string): Promise<Organization> {
  let created!: Organization;
  await mutateBlob<Organization>("orgs.json", (orgs) => {
    const maxId = orgs.reduce((max, o) => Math.max(max, o.id), 0);
    created = { id: maxId + 1, name };
    return [...orgs, created];
  });
  return created;
}

// ─── Activities ──────────────────────────────────────────

export async function getActivities(): Promise<Activity[]> {
  return readBlob<Activity>("activities.json");
}

export async function getActivity(id: number): Promise<Activity | null> {
  const activities = await getActivities();
  return activities.find((a) => a.id === id) ?? null;
}

export async function createActivity(data: Omit<Activity, "id">): Promise<Activity> {
  let created!: Activity;
  await mutateBlob<Activity>("activities.json", (activities) => {
    const maxId = activities.reduce((max, a) => Math.max(max, a.id), 0);
    created = { ...data, id: maxId + 1 } as Activity;
    return [...activities, created];
  });
  return created;
}

export async function updateActivity(id: number, data: Partial<Activity>): Promise<Activity | null> {
  let result: Activity | null = null;
  await mutateBlob<Activity>("activities.json", (activities) => {
    const idx = activities.findIndex((a) => a.id === id);
    if (idx === -1) return activities;
    activities[idx] = { ...activities[idx], ...data, id };
    result = activities[idx];
    return activities;
  });
  return result;
}

export async function deleteActivity(id: number): Promise<void> {
  await mutateBlob<Activity>("activities.json", (activities) => activities.filter((a) => a.id !== id));
}

export async function getActivitiesForDeal(dealId: number): Promise<Activity[]> {
  const activities = await getActivities();
  return activities.filter((a) => a.deal_id === dealId);
}

export async function getActivitiesForPerson(personId: number): Promise<Activity[]> {
  const activities = await getActivities();
  return activities.filter((a) => a.person_id === personId);
}

// ─── Notes ───────────────────────────────────────────────

export async function getNotes(): Promise<Note[]> {
  return readBlob<Note>("notes.json");
}

export async function createNote(data: Omit<Note, "id">): Promise<Note> {
  let created!: Note;
  await mutateBlob<Note>("notes.json", (notes) => {
    const maxId = notes.reduce((max, n) => Math.max(max, n.id), 0);
    created = { ...data, id: maxId + 1 } as Note;
    return [...notes, created];
  });
  return created;
}

export async function getNotesForDeal(dealId: number): Promise<Note[]> {
  const notes = await getNotes();
  return notes.filter((n) => n.deal_id === dealId);
}

export async function getNotesForPerson(personId: number): Promise<Note[]> {
  const notes = await getNotes();
  return notes.filter((n) => n.person_id === personId);
}

// ─── Participants (deal ↔ person links) ──────────────────

export async function getDealParticipants(dealId: number): Promise<Person[]> {
  const deal = await getDeal(dealId);
  if (!deal) return [];
  const personIds = deal.participants || (deal.person_id ? [deal.person_id] : []);
  const persons = await getPersons();
  return personIds
    .map((pid) => persons.find((p) => p.id === pid))
    .filter((p): p is Person => p !== undefined);
}

export async function addDealParticipant(dealId: number, personId: number): Promise<void> {
  await ensureDealsMigrated();
  const deal = await readSingleBlob<Deal>(dealPath(dealId));
  if (!deal) throw new Error("Deal not found");
  const current = deal.participants || (deal.person_id ? [deal.person_id] : []);
  if (current.includes(personId)) return;
  await writeSingleBlob(dealPath(dealId), { ...deal, participants: [...current, personId] });
}

// ─── Bulk write (for migration) ──────────────────────────

export async function bulkWriteDeals(deals: Deal[]): Promise<void> {
  // Write each deal individually + clean up old deals.json if present
  await Promise.all(deals.map((deal) => writeSingleBlob(dealPath(deal.id), deal)));
  try { await del("deals.json"); } catch { /* already gone */ }
  migrationDone = true;
}

export async function bulkWritePersons(persons: Person[]): Promise<void> {
  await writeBlob("persons.json", persons);
}

export async function bulkWriteOrganizations(orgs: Organization[]): Promise<void> {
  await writeBlob("orgs.json", orgs);
}

export async function bulkWriteActivities(activities: Activity[]): Promise<void> {
  await writeBlob("activities.json", activities);
}

export async function bulkWriteNotes(notes: Note[]): Promise<void> {
  await writeBlob("notes.json", notes);
}
