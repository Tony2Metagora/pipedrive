/**
 * Scraping Store — blob storage for scraping result lists.
 *
 * Each scraping list is stored as scraping/{id}.json
 * An index file scraping-index.json tracks all lists.
 */

import { readBlob, writeBlob, withLock } from "@/lib/blob-store";

// ─── Types ───────────────────────────────────────────────

export interface ScrapingCompany {
  id: string;
  raison_sociale: string;
  enseigne: string;
  siren: string;
  siret: string;
  code_postal: string;
  commune: string;
  departement: string;
  adresse: string;
  code_naf: string;
  libelle_naf: string;
  tranche_effectif: string;
  tranche_code: string;
  dirigeant: string;
  dirigeant_role: string;
  effectif_approx: string;
  statut: string;
}

export interface ScrapingList {
  id: string;
  name: string;
  created_at: string;
  count: number;
  sirens: string[];
  filters: {
    nafCodes: string[];
    departement?: string;
    codePostal?: string;
    trancheEffectif?: string[];
  };
}

// ─── Index operations ────────────────────────────────────

const INDEX_FILE = "scraping-index.json";

export async function getScrapingIndex(): Promise<ScrapingList[]> {
  return readBlob<ScrapingList>(INDEX_FILE);
}

export async function addToScrapingIndex(entry: ScrapingList): Promise<void> {
  await withLock(INDEX_FILE, async () => {
    const index = await readBlob<ScrapingList>(INDEX_FILE);
    index.push(entry);
    await writeBlob(INDEX_FILE, index);
  });
}

export async function removeFromScrapingIndex(id: string): Promise<void> {
  await withLock(INDEX_FILE, async () => {
    const index = await readBlob<ScrapingList>(INDEX_FILE);
    const filtered = index.filter((e) => e.id !== id);
    await writeBlob(INDEX_FILE, filtered);
  });
}

export async function updateScrapingListMeta(
  id: string,
  updates: { name?: string }
): Promise<ScrapingList | null> {
  return withLock(INDEX_FILE, async () => {
    const index = await readBlob<ScrapingList>(INDEX_FILE);
    const entry = index.find((e) => e.id === id);
    if (!entry) return null;
    if (updates.name !== undefined) entry.name = updates.name;
    await writeBlob(INDEX_FILE, index);
    return entry;
  });
}

// ─── List data operations ────────────────────────────────

function listFile(id: string) {
  return `scraping/${id}.json`;
}

export async function getScrapingCompanies(listId: string): Promise<ScrapingCompany[]> {
  return readBlob<ScrapingCompany>(listFile(listId));
}

export async function writeScrapingCompanies(listId: string, companies: ScrapingCompany[]): Promise<void> {
  await writeBlob(listFile(listId), companies);
}

export async function createScrapingList(
  name: string,
  companies: ScrapingCompany[],
  filters: ScrapingList["filters"]
): Promise<ScrapingList> {
  const id = `scr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const entry: ScrapingList = {
    id,
    name,
    created_at: new Date().toISOString(),
    count: companies.length,
    sirens: companies.map((c) => c.siren).filter(Boolean),
    filters,
  };
  await writeScrapingCompanies(id, companies);
  await addToScrapingIndex(entry);
  return entry;
}
