/**
 * Persistance des totaux API Gouv (matrice région × NAF) pour l’onglet Completion.
 * Stocké comme un tableau d’un seul élément (contrainte readBlob/writeBlob).
 */

import { readBlob, writeBlob, withLock } from "@/lib/blob-store";

const CACHE_FILE = "scraping-gouv-completion-cache.json";

export type GouvCompletionCache = {
  matrix: Record<string, Record<string, number>>;
  updatedAt: string;
};

const EMPTY: GouvCompletionCache = {
  matrix: {},
  updatedAt: "",
};

export async function getGouvCompletionCache(): Promise<GouvCompletionCache> {
  const rows = await readBlob<GouvCompletionCache>(CACHE_FILE);
  if (!rows?.length) return { ...EMPTY, updatedAt: new Date().toISOString() };
  const row = rows[0];
  if (!row?.matrix || typeof row.matrix !== "object") return { ...EMPTY, updatedAt: new Date().toISOString() };
  return {
    matrix: row.matrix,
    updatedAt: row.updatedAt || new Date().toISOString(),
  };
}

/**
 * Fusionne un patch région → { naf → total } dans le cache et persiste.
 */
export async function mergeGouvCompletionMatrix(
  patch: Record<string, Record<string, number>>
): Promise<GouvCompletionCache> {
  return withLock(CACHE_FILE, async () => {
    const rows = await readBlob<GouvCompletionCache>(CACHE_FILE);
    const base = rows?.[0];
    const matrix: Record<string, Record<string, number>> = base?.matrix ? { ...base.matrix } : {};
    for (const [region, byNaf] of Object.entries(patch)) {
      matrix[region] = { ...(matrix[region] || {}), ...byNaf };
    }
    const next: GouvCompletionCache = {
      matrix,
      updatedAt: new Date().toISOString(),
    };
    await writeBlob(CACHE_FILE, [next]);
    return next;
  });
}
