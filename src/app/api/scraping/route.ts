/**
 * API Route — Scraping entreprises via API Recherche d'entreprises (gouv.fr)
 * POST /api/scraping : search companies with NAF codes, department, effectif filters
 * GET  /api/scraping : list all saved scraping lists
 */

import { NextResponse } from "next/server";
import { getScrapingIndex } from "@/lib/scraping-store";
import { requireAuth } from "@/lib/api-guard";
import { departementsForRegion } from "@/lib/scraping-regions";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SERVER_MAX_RESULTS = 50_000;
const PER_PAGE = 25;

// Tranche effectif codes → human labels
const TRANCHE_LABELS: Record<string, string> = {
  "NN": "Non renseigné",
  "00": "0 salarié",
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

// NAF code labels
const NAF_LABELS: Record<string, string> = {
  "47.71Z": "Habillement (détail)",
  "47.72A": "Chaussures (détail)",
  "47.72B": "Maroquinerie & articles de voyage",
  "47.75Z": "Parfumerie & cosmétiques",
  "47.77Z": "Horlogerie & bijouterie",
};

interface GouvResult {
  siren: string;
  nom_complet: string;
  nom_raison_sociale: string;
  sigle: string | null;
  activite_principale: string;
  etat_administratif: string;
  tranche_effectif_salarie: string;
  dirigeants: Array<{
    nom?: string;
    prenoms?: string;
    qualite?: string;
    type_dirigeant?: string;
    denomination?: string;
  }>;
  siege: {
    siret: string;
    adresse: string;
    code_postal: string | null;
    libelle_commune: string;
    departement: string | null;
    region: string | null;
    liste_enseignes: string[] | null;
    nom_commercial: string | null;
    etat_administratif: string;
    tranche_effectif_salarie: string | null;
    activite_principale: string;
  };
  matching_etablissements?: Array<{
    siret: string;
    adresse: string;
    code_postal: string | null;
    libelle_commune: string;
    departement: string | null;
    liste_enseignes: string[] | null;
    nom_commercial: string | null;
    etat_administratif: string;
    tranche_effectif_salarie: string | null;
    activite_principale: string;
  }>;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Paginate jusqu’à total_pages (plafond résultats global respecté). */
async function fetchGouvPagesForNafDept(
  naf: string,
  departement: string | undefined,
  codePostal: string | undefined,
  trancheEffectif: string[] | undefined,
  maxToCollect: number
): Promise<GouvResult[]> {
  const out: GouvResult[] = [];
  let page = 1;

  while (out.length < maxToCollect) {
    const params = new URLSearchParams({
      activite_principale: naf,
      etat_administratif: "A",
      per_page: String(PER_PAGE),
      page: String(page),
    });

    if (departement) params.set("departement", departement);
    if (codePostal?.trim()) params.set("code_postal", codePostal.trim());
    if (trancheEffectif?.length) {
      params.set("tranche_effectif_salarie", trancheEffectif.join(","));
    }

    const url = `https://recherche-entreprises.api.gouv.fr/search?${params}`;

    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Metagora-Prospection/1.0",
      },
    });

    if (res.status === 429) {
      await sleep(2000);
      continue;
    }

    if (!res.ok) {
      console.error(`API gouv error: ${res.status} for NAF ${naf} page ${page} dept=${departement || ""}`);
      break;
    }

    const data = (await res.json()) as {
      results: GouvResult[];
      total_results: number;
      total_pages: number;
    };

    if (!data.results?.length) break;

    const remaining = maxToCollect - out.length;
    out.push(...data.results.slice(0, remaining));

    const totalPages = typeof data.total_pages === "number" ? data.total_pages : page;
    if (page >= totalPages) break;

    page += 1;
    await sleep(200);
  }

  return out;
}

export async function GET() {
  const guard = await requireAuth("scrapping", "GET");
  if (guard.denied) return guard.denied;
  try {
    const index = await getScrapingIndex();
    return NextResponse.json({ data: index });
  } catch (error) {
    console.error("GET /api/scraping error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const guard = await requireAuth("scrapping", "POST");
  if (guard.denied) return guard.denied;
  try {
    const body = await request.json();
    const {
      nafCodes = ["47.71Z"],
      departement,
      region,
      codePostal,
      trancheEffectif,
      maxResults = 100,
    } = body as {
      nafCodes?: string[];
      departement?: string;
      region?: string;
      codePostal?: string;
      trancheEffectif?: string[];
      maxResults?: number;
    };

    const rawMax = Number(maxResults);
    const effectiveCap =
      !Number.isFinite(rawMax) || rawMax <= 0 || rawMax >= SERVER_MAX_RESULTS
        ? SERVER_MAX_RESULTS
        : Math.min(Math.floor(rawMax), SERVER_MAX_RESULTS);

    /** Une requête par département (ou une sans filtre département). */
    let departmentPasses: (string | undefined)[];

    if (codePostal?.trim()) {
      departmentPasses = [departement?.trim() || undefined];
    } else if (typeof region === "string" && region.trim()) {
      const depts = departementsForRegion(region.trim());
      if (depts.length === 0) {
        return NextResponse.json({ error: `Région inconnue : ${region.trim()}` }, { status: 400 });
      }
      departmentPasses = depts;
    } else if (departement?.trim()) {
      departmentPasses = [departement.trim()];
    } else {
      departmentPasses = [undefined];
    }

    const allResults: GouvResult[] = [];

    for (const naf of nafCodes) {
      if (allResults.length >= effectiveCap) break;

      for (const dept of departmentPasses) {
        if (allResults.length >= effectiveCap) break;

        const remainingBudget = effectiveCap - allResults.length;
        const batch = await fetchGouvPagesForNafDept(
          naf,
          dept,
          codePostal?.trim() ? codePostal : undefined,
          trancheEffectif,
          remainingBudget
        );
        allResults.push(...batch);
      }
    }

    const seen = new Set<string>();
    const unique = allResults.filter((r) => {
      if (seen.has(r.siren)) return false;
      seen.add(r.siren);
      return true;
    });

    const companies = unique.slice(0, effectiveCap).map((r) => {
      const allPP = (r.dirigeants || []).filter((d) => d.type_dirigeant === "personne physique");
      const seenDir = new Set<string>();
      const allDirigeants: Array<{ prenom: string; nom: string; role: string }> = [];
      const cacNames: string[] = [];
      for (const d of allPP) {
        const nom = (d.nom || "").trim();
        const prenom = (d.prenoms || "").trim();
        if (!nom && !prenom) continue;
        const role = (d.qualite || "").trim();
        const roleLower = role.toLowerCase();
        if (roleLower.includes("commissaire aux comptes") || roleLower === "autre") {
          if (roleLower.includes("commissaire aux comptes")) {
            cacNames.push(`${prenom} ${nom}`.trim());
          }
          continue;
        }
        const key = `${nom.toLowerCase()}|${prenom.toLowerCase()}`;
        if (seenDir.has(key)) continue;
        seenDir.add(key);
        allDirigeants.push({ prenom, nom, role });
      }
      const cacLabel = cacNames.length > 0 ? cacNames.join(", ") : "";
      const dirigeantPrenom = allDirigeants[0]?.prenom || "";
      const dirigeantNom = allDirigeants[0]?.nom || "";
      const dirigeantName =
        dirigeantPrenom || dirigeantNom ? `${dirigeantPrenom} ${dirigeantNom}`.trim() : "ND";
      const dirigeantRole = allDirigeants[0]?.role || "";

      const siege = r.siege;
      const enseigne = siege.liste_enseignes?.[0] || siege.nom_commercial || "";
      const trancheCode = r.tranche_effectif_salarie || siege.tranche_effectif_salarie || "NN";
      const nafCode = r.activite_principale?.replace(".", "") || siege.activite_principale?.replace(".", "") || "";
      const nafDot = nafCode.length === 5 ? `${nafCode.slice(0, 2)}.${nafCode.slice(2)}` : nafCode;

      return {
        raison_sociale: r.nom_raison_sociale || r.nom_complet,
        enseigne,
        siren: r.siren,
        siret: siege.siret,
        code_postal: siege.code_postal || "",
        commune: siege.libelle_commune || "",
        departement: siege.departement || "",
        adresse: siege.adresse || "",
        code_naf: nafDot,
        libelle_naf: NAF_LABELS[nafDot] || "",
        tranche_effectif: TRANCHE_LABELS[trancheCode] || trancheCode,
        tranche_code: trancheCode,
        dirigeant: dirigeantName,
        dirigeant_prenom: dirigeantPrenom,
        dirigeant_nom: dirigeantNom,
        dirigeant_role: dirigeantRole,
        all_dirigeants: allDirigeants,
        plusieurs_dirigeants: allDirigeants.length > 1 ? "OUI" : "NON",
        commissaire_aux_comptes: cacLabel,
        effectif_approx: estimateEffectif(trancheCode),
        statut: r.etat_administratif === "A" ? "Actif" : "Cessé",
      };
    });

    return NextResponse.json({
      data: companies,
      total: companies.length,
      nafCodes,
      filters: {
        departement,
        region: typeof region === "string" ? region.trim() : undefined,
        codePostal,
        trancheEffectif,
        effectiveCap,
        departmentPasses: departmentPasses.length,
      },
    });
  } catch (error) {
    console.error("POST /api/scraping error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

function estimateEffectif(code: string): string {
  const map: Record<string, string> = {
    NN: "?",
    "00": "0",
    "01": "~1",
    "02": "~4",
    "03": "~7",
    "11": "~15",
    "12": "~35",
    "21": "~75",
    "22": "~150",
    "31": "~225",
    "32": "~375",
    "41": "~750",
    "42": "~1500",
    "51": "~3500",
    "52": "~7500",
    "53": "10000+",
  };
  return map[code] || "?";
}
