/**
 * Blob Store — couche de persistance JSON dans Vercel Blob Storage.
 * Remplace toutes les interactions avec l'API Pipedrive.
 *
 * Données stockées :
 * - deals.json      : tableau de Deal
 * - activities.json  : tableau d'Activity
 * - notes.json       : tableau de Note
 * - persons.json     : tableau de Person (contacts liés aux deals)
 * - orgs.json        : tableau d'Organization
 * - prospects.json   : tableau de Prospect (déjà existant)
 */

import { put, list, getDownloadUrl } from "@vercel/blob";

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

// ─── Generic Blob helpers ────────────────────────────────

async function readBlob<T>(filename: string): Promise<T[]> {
  try {
    const { blobs } = await list({ prefix: filename });
    const blob = blobs.find((b) => b.pathname === filename);
    if (!blob) return [];
    const downloadUrl = await getDownloadUrl(blob.url);
    const res = await fetch(downloadUrl, { cache: "no-store" });
    return await res.json();
  } catch {
    return [];
  }
}

async function writeBlob<T>(filename: string, data: T[]): Promise<void> {
  await put(filename, JSON.stringify(data), {
    access: "private",
    addRandomSuffix: false,
  });
}

// ─── Deals ───────────────────────────────────────────────

export async function getDeals(): Promise<Deal[]> {
  return readBlob<Deal>("deals.json");
}

export async function getDeal(id: number): Promise<Deal | null> {
  const deals = await getDeals();
  return deals.find((d) => d.id === id) ?? null;
}

export async function createDeal(data: Omit<Deal, "id">): Promise<Deal> {
  const deals = await getDeals();
  const maxId = deals.reduce((max, d) => Math.max(max, d.id), 0);
  const deal: Deal = { ...data, id: maxId + 1 };
  deals.push(deal);
  await writeBlob("deals.json", deals);
  return deal;
}

export async function updateDeal(id: number, data: Partial<Deal>): Promise<Deal | null> {
  const deals = await getDeals();
  const idx = deals.findIndex((d) => d.id === id);
  if (idx === -1) return null;
  deals[idx] = { ...deals[idx], ...data, id }; // never override id
  await writeBlob("deals.json", deals);
  return deals[idx];
}

export async function deleteDeal(id: number): Promise<void> {
  const deals = await getDeals();
  await writeBlob("deals.json", deals.filter((d) => d.id !== id));
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
  const persons = await getPersons();
  const maxId = persons.reduce((max, p) => Math.max(max, p.id), 0);
  const person: Person = { ...data, id: maxId + 1 };
  persons.push(person);
  await writeBlob("persons.json", persons);
  return person;
}

export async function updatePerson(id: number, data: Partial<Person>): Promise<Person | null> {
  const persons = await getPersons();
  const idx = persons.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  // Handle email/phone as special fields (string → array)
  const update = { ...data };
  if (typeof update.email === "string") {
    (update as Person).email = [{ value: update.email as unknown as string, primary: true }];
  }
  if (typeof update.phone === "string") {
    (update as Person).phone = [{ value: update.phone as unknown as string, primary: true }];
  }
  persons[idx] = { ...persons[idx], ...update, id };
  await writeBlob("persons.json", persons);
  return persons[idx];
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
  const orgs = await getOrganizations();
  const maxId = orgs.reduce((max, o) => Math.max(max, o.id), 0);
  const org: Organization = { id: maxId + 1, name };
  orgs.push(org);
  await writeBlob("orgs.json", orgs);
  return org;
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
  const activities = await getActivities();
  const maxId = activities.reduce((max, a) => Math.max(max, a.id), 0);
  const activity: Activity = { ...data, id: maxId + 1 };
  activities.push(activity);
  await writeBlob("activities.json", activities);
  return activity;
}

export async function updateActivity(id: number, data: Partial<Activity>): Promise<Activity | null> {
  const activities = await getActivities();
  const idx = activities.findIndex((a) => a.id === id);
  if (idx === -1) return null;
  activities[idx] = { ...activities[idx], ...data, id };
  await writeBlob("activities.json", activities);
  return activities[idx];
}

export async function deleteActivity(id: number): Promise<void> {
  const activities = await getActivities();
  await writeBlob("activities.json", activities.filter((a) => a.id !== id));
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
  const notes = await getNotes();
  const maxId = notes.reduce((max, n) => Math.max(max, n.id), 0);
  const note: Note = { ...data, id: maxId + 1 };
  notes.push(note);
  await writeBlob("notes.json", notes);
  return note;
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

// ─── Bulk write (for migration) ──────────────────────────

export async function bulkWriteDeals(deals: Deal[]): Promise<void> {
  await writeBlob("deals.json", deals);
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
