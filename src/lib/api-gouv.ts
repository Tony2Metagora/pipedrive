/**
 * Service API Recherche d'entreprises (data.gouv.fr)
 * Gratuit, pas de clé API, 7 req/sec max
 * https://recherche-entreprises.api.gouv.fr/docs/
 */

const BASE_URL = "https://recherche-entreprises.api.gouv.fr/search";

/** Tranche effectif salarié → libellé humain */
const TRANCHE_EFFECTIF: Record<string, string> = {
  "NN": "Inconnu",
  "00": "0",
  "01": "1-2",
  "02": "3-5",
  "03": "6-9",
  "11": "10-19",
  "12": "20-49",
  "21": "50-99",
  "22": "100-199",
  "31": "200-249",
  "32": "250-499",
  "41": "500-999",
  "42": "1000-1999",
  "51": "2000-4999",
  "52": "5000-9999",
  "53": "10000+",
};

export interface GouvEnrichResult {
  siren: string;
  siret: string;
  nom_complet: string;
  naf_code: string;
  naf_libelle: string;
  effectifs: string;
  categorie_entreprise: string;
  adresse_siege: string;
  code_postal: string;
  ville: string;
  date_creation: string;
  chiffre_affaires: number | null;
  resultat_net: number | null;
  annee_ca: string | null;
  dirigeants: string;
  nature_juridique: string;
  etat_administratif: string;
}

/**
 * Search for a company by name and return enrichment data.
 * Returns null if no match found.
 */
export async function searchEntreprise(companyName: string): Promise<GouvEnrichResult | null> {
  if (!companyName?.trim()) return null;

  const url = `${BASE_URL}?q=${encodeURIComponent(companyName.trim())}&per_page=1&minimal=false`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Metagora-ProspectionTool/1.0" },
  });

  if (!res.ok) {
    console.error(`[API Gouv] Error ${res.status}: ${await res.text()}`);
    return null;
  }

  const json = await res.json();
  const results = json.results;

  if (!results || results.length === 0) return null;

  const r = results[0];
  const siege = r.siege || {};

  // Extract latest finances
  let chiffre_affaires: number | null = null;
  let resultat_net: number | null = null;
  let annee_ca: string | null = null;

  if (r.finances) {
    const years = Object.keys(r.finances).sort().reverse();
    if (years.length > 0) {
      const latest = r.finances[years[0]];
      chiffre_affaires = latest?.ca ?? null;
      resultat_net = latest?.resultat_net ?? null;
      annee_ca = years[0];
    }
  }

  // Extract dirigeants (top 3)
  const dirigeants = (r.dirigeants || [])
    .slice(0, 3)
    .map((d: { nom?: string; prenoms?: string; denomination?: string; qualite?: string }) =>
      d.denomination
        ? `${d.denomination} (${d.qualite || "?"})`
        : `${d.prenoms || ""} ${d.nom || ""} — ${d.qualite || "?"}`.trim()
    )
    .join(" | ");

  // NAF label from activite_principale
  const nafCode = r.activite_principale || "";

  // Effectifs
  const trancheCode = r.tranche_effectif_salarie || "";
  const effectifsLabel = TRANCHE_EFFECTIF[trancheCode] || trancheCode || "";

  return {
    siren: r.siren || "",
    siret: siege.siret || "",
    nom_complet: r.nom_complet || "",
    naf_code: nafCode,
    naf_libelle: "",
    effectifs: effectifsLabel,
    categorie_entreprise: r.categorie_entreprise || "",
    adresse_siege: siege.adresse || "",
    code_postal: siege.code_postal || "",
    ville: siege.libelle_commune || "",
    date_creation: r.date_creation || "",
    chiffre_affaires,
    resultat_net,
    annee_ca,
    dirigeants,
    nature_juridique: r.nature_juridique || "",
    etat_administratif: r.etat_administratif || "",
  };
}

/**
 * Batch search for multiple companies with rate limiting (7 req/sec).
 * Returns a Map<companyName, GouvEnrichResult | null>.
 */
export async function batchSearchEntreprises(
  companyNames: string[]
): Promise<Map<string, GouvEnrichResult | null>> {
  const results = new Map<string, GouvEnrichResult | null>();
  const unique = [...new Set(companyNames.map((n) => n.trim().toLowerCase()).filter(Boolean))];
  const nameMap = new Map(unique.map((u) => [u, companyNames.find((n) => n.trim().toLowerCase() === u) || u]));

  for (let i = 0; i < unique.length; i++) {
    const name = nameMap.get(unique[i]) || unique[i];
    try {
      const result = await searchEntreprise(name);
      results.set(name.toLowerCase().trim(), result);
    } catch (err) {
      console.error(`[API Gouv] Error for "${name}":`, err);
      results.set(name.toLowerCase().trim(), null);
    }
    // Rate limit: ~5 req/sec to stay safe under 7/sec
    if (i < unique.length - 1) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return results;
}
