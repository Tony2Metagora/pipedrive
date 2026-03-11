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

export async function createImportList(name: string, contacts: ImportContact[]): Promise<ImportList> {
  const id = `imp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const entry: ImportList = {
    id,
    name,
    created_at: new Date().toISOString(),
    count: contacts.length,
  };
  await writeImportContacts(id, contacts);
  await addToIndex(entry);
  return entry;
}

export async function deleteImportList(id: string): Promise<void> {
  await writeBlob(listFile(id), []);
  await removeFromIndex(id);
}
