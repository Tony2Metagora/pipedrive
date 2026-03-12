/**
 * Import Store — blob storage for CSV import lists.
 *
 * Each import list is stored as imports/{id}.json
 * An index file imports-index.json tracks all lists.
 */

import { readBlob, writeBlob, withLock } from "@/lib/blob-store";

// ─── Types ───────────────────────────────────────────────

export interface ImportContact {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  company: string;
  job: string;
  phone: string;
  linkedin: string;
  location?: string;
  company_location?: string;
  // Dropcontact enriched fields
  mobile_phone?: string;
  website?: string;
  company_linkedin?: string;
  company_domain?: string;
  siren?: string;
  siret?: string;
  naf_code?: string;
  naf_label?: string;
  nb_employees?: string;
  company_address?: string;
  company_city?: string;
  company_postal_code?: string;
  company_country?: string;
  company_turnover?: string;
  email_qualification?: string;
  enriched?: boolean;
}

export interface ImportList {
  id: string;
  name: string;
  created_at: string;
  count: number;
  companies: string[];
  source: "csv" | "search";
  company_tag?: string;
  enriched_at?: string;
}

// ─── CSV column names (mandatory header names) ──────────

export const CSV_COLUMNS = [
  "first_name",
  "last_name",
  "email",
  "company",
  "job",
  "phone",
  "linkedin",
] as const;

export type CsvColumnName = (typeof CSV_COLUMNS)[number];

// ─── Index operations ────────────────────────────────────

const INDEX_FILE = "imports-index.json";

export async function getImportIndex(): Promise<ImportList[]> {
  return readBlob<ImportList>(INDEX_FILE);
}

export async function addToIndex(entry: ImportList): Promise<void> {
  await withLock(INDEX_FILE, async () => {
    const index = await readBlob<ImportList>(INDEX_FILE);
    index.push(entry);
    await writeBlob(INDEX_FILE, index);
  });
}

export async function removeFromIndex(id: string): Promise<void> {
  await withLock(INDEX_FILE, async () => {
    const index = await readBlob<ImportList>(INDEX_FILE);
    const filtered = index.filter((e) => e.id !== id);
    await writeBlob(INDEX_FILE, filtered);
  });
}

export async function updateIndexCount(id: string, count: number): Promise<void> {
  await withLock(INDEX_FILE, async () => {
    const index = await readBlob<ImportList>(INDEX_FILE);
    const entry = index.find((e) => e.id === id);
    if (entry) {
      entry.count = count;
      await writeBlob(INDEX_FILE, index);
    }
  });
}

export async function updateListMeta(
  id: string,
  updates: { name?: string; company_tag?: string; enriched_at?: string }
): Promise<ImportList | null> {
  return withLock(INDEX_FILE, async () => {
    const index = await readBlob<ImportList>(INDEX_FILE);
    const entry = index.find((e) => e.id === id);
    if (!entry) return null;
    if (updates.name !== undefined) entry.name = updates.name;
    if (updates.company_tag !== undefined) entry.company_tag = updates.company_tag;
    if (updates.enriched_at !== undefined) entry.enriched_at = updates.enriched_at;
    await writeBlob(INDEX_FILE, index);
    return entry;
  });
}

// ─── List data operations ────────────────────────────────

function listFile(id: string) {
  return `imports/${id}.json`;
}

export async function getImportContacts(listId: string): Promise<ImportContact[]> {
  return readBlob<ImportContact>(listFile(listId));
}

export async function writeImportContacts(listId: string, contacts: ImportContact[]): Promise<void> {
  await writeBlob(listFile(listId), contacts);
}

export async function createImportList(
  name: string,
  contacts: ImportContact[],
  source: "csv" | "search" = "csv"
): Promise<ImportList> {
  const id = `imp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const companies = [...new Set(
    contacts.map((c) => c.company?.trim().toLowerCase()).filter(Boolean)
  )].sort();
  const entry: ImportList = {
    id,
    name,
    created_at: new Date().toISOString(),
    count: contacts.length,
    companies,
    source,
  };
  await writeImportContacts(id, contacts);
  await addToIndex(entry);
  return entry;
}

/**
 * Load all contacts from all import lists (for cross-list deduplication).
 */
export async function getAllImportContacts(): Promise<{ listId: string; listName: string; contact: ImportContact }[]> {
  const index = await getImportIndex();
  const all: { listId: string; listName: string; contact: ImportContact }[] = [];
  for (const list of index) {
    const contacts = await getImportContacts(list.id);
    for (const c of contacts) {
      all.push({ listId: list.id, listName: list.name, contact: c });
    }
  }
  return all;
}

export async function deleteImportList(id: string): Promise<void> {
  await writeBlob(listFile(id), []);
  await removeFromIndex(id);
}

export async function mergeImportLists(
  listIds: string[],
  newName: string,
  companyTag?: string
): Promise<ImportList> {
  // Collect all contacts from source lists, dedup by first+last+company
  const seen = new Set<string>();
  const allContacts: ImportContact[] = [];
  for (const lid of listIds) {
    const contacts = await getImportContacts(lid);
    for (const c of contacts) {
      const key = `${(c.first_name || "").trim().toLowerCase()}|${(c.last_name || "").trim().toLowerCase()}|${(c.company || "").trim().toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        allContacts.push({ ...c, id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 10)}` });
      }
    }
  }

  const id = `imp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const companies = [...new Set(
    allContacts.map((c) => c.company?.trim().toLowerCase()).filter(Boolean)
  )].sort();
  const entry: ImportList = {
    id,
    name: newName,
    created_at: new Date().toISOString(),
    count: allContacts.length,
    companies,
    source: "csv",
    company_tag: companyTag,
    enriched_at: new Date().toISOString(),
  };
  await writeImportContacts(id, allContacts);
  await addToIndex(entry);
  return entry;
}
