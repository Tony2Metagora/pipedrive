import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import { getScrapingCompanies, getScrapingIndex, type ScrapingCompany } from "@/lib/scraping-store";

export const dynamic = "force-dynamic";

const REGION_BY_DEPARTMENT: Record<string, string> = {
  "01": "Auvergne-Rhone-Alpes",
  "02": "Hauts-de-France",
  "03": "Auvergne-Rhone-Alpes",
  "04": "Provence-Alpes-Cote d'Azur",
  "05": "Provence-Alpes-Cote d'Azur",
  "06": "Provence-Alpes-Cote d'Azur",
  "07": "Auvergne-Rhone-Alpes",
  "08": "Grand Est",
  "09": "Occitanie",
  "10": "Grand Est",
  "11": "Occitanie",
  "12": "Occitanie",
  "13": "Provence-Alpes-Cote d'Azur",
  "14": "Normandie",
  "15": "Auvergne-Rhone-Alpes",
  "16": "Nouvelle-Aquitaine",
  "17": "Nouvelle-Aquitaine",
  "18": "Centre-Val de Loire",
  "19": "Nouvelle-Aquitaine",
  "2A": "Corse",
  "2B": "Corse",
  "20": "Corse",
  "21": "Bourgogne-Franche-Comte",
  "22": "Bretagne",
  "23": "Nouvelle-Aquitaine",
  "24": "Nouvelle-Aquitaine",
  "25": "Bourgogne-Franche-Comte",
  "26": "Auvergne-Rhone-Alpes",
  "27": "Normandie",
  "28": "Centre-Val de Loire",
  "29": "Bretagne",
  "30": "Occitanie",
  "31": "Occitanie",
  "32": "Occitanie",
  "33": "Nouvelle-Aquitaine",
  "34": "Occitanie",
  "35": "Bretagne",
  "36": "Centre-Val de Loire",
  "37": "Centre-Val de Loire",
  "38": "Auvergne-Rhone-Alpes",
  "39": "Bourgogne-Franche-Comte",
  "40": "Nouvelle-Aquitaine",
  "41": "Centre-Val de Loire",
  "42": "Auvergne-Rhone-Alpes",
  "43": "Auvergne-Rhone-Alpes",
  "44": "Pays de la Loire",
  "45": "Centre-Val de Loire",
  "46": "Occitanie",
  "47": "Nouvelle-Aquitaine",
  "48": "Occitanie",
  "49": "Pays de la Loire",
  "50": "Normandie",
  "51": "Grand Est",
  "52": "Grand Est",
  "53": "Pays de la Loire",
  "54": "Grand Est",
  "55": "Grand Est",
  "56": "Bretagne",
  "57": "Grand Est",
  "58": "Bourgogne-Franche-Comte",
  "59": "Hauts-de-France",
  "60": "Hauts-de-France",
  "61": "Normandie",
  "62": "Hauts-de-France",
  "63": "Auvergne-Rhone-Alpes",
  "64": "Nouvelle-Aquitaine",
  "65": "Occitanie",
  "66": "Occitanie",
  "67": "Grand Est",
  "68": "Grand Est",
  "69": "Auvergne-Rhone-Alpes",
  "70": "Bourgogne-Franche-Comte",
  "71": "Bourgogne-Franche-Comte",
  "72": "Pays de la Loire",
  "73": "Auvergne-Rhone-Alpes",
  "74": "Auvergne-Rhone-Alpes",
  "75": "Ile-de-France",
  "76": "Normandie",
  "77": "Ile-de-France",
  "78": "Ile-de-France",
  "79": "Nouvelle-Aquitaine",
  "80": "Hauts-de-France",
  "81": "Occitanie",
  "82": "Occitanie",
  "83": "Provence-Alpes-Cote d'Azur",
  "84": "Provence-Alpes-Cote d'Azur",
  "85": "Pays de la Loire",
  "86": "Nouvelle-Aquitaine",
  "87": "Nouvelle-Aquitaine",
  "88": "Grand Est",
  "89": "Bourgogne-Franche-Comte",
  "90": "Bourgogne-Franche-Comte",
  "91": "Ile-de-France",
  "92": "Ile-de-France",
  "93": "Ile-de-France",
  "94": "Ile-de-France",
  "95": "Ile-de-France",
  "971": "Guadeloupe",
  "972": "Martinique",
  "973": "Guyane",
  "974": "La Reunion",
  "975": "Saint-Pierre-et-Miquelon",
  "976": "Mayotte",
  "977": "Saint-Barthelemy",
  "978": "Saint-Martin",
  "986": "Wallis-et-Futuna",
  "987": "Polynesie francaise",
  "988": "Nouvelle-Caledonie",
};

function normalizeDept(value: string | null | undefined): string {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";
  if (raw === "2A" || raw === "2B") return raw;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length >= 3 && (digits.startsWith("97") || digits.startsWith("98"))) return digits.slice(0, 3);
  return digits.slice(0, 2);
}

function normalizeNaf(value: string | null | undefined): string {
  const raw = String(value || "").trim().toUpperCase();
  return raw || "Non renseigne";
}

function resolveRegion(company: ScrapingCompany): string {
  const dept = normalizeDept(company.departement);
  if (dept && REGION_BY_DEPARTMENT[dept]) return REGION_BY_DEPARTMENT[dept];
  const cp = String(company.code_postal || "").trim();
  const cpDept = normalizeDept(cp);
  if (cpDept && REGION_BY_DEPARTMENT[cpDept]) return REGION_BY_DEPARTMENT[cpDept];
  return "Inconnue";
}

function uniqueCompanyKey(company: ScrapingCompany): string {
  const siren = String(company.siren || "").trim();
  if (siren) return `siren:${siren}`;
  const siret = String(company.siret || "").trim();
  if (siret) return `siret:${siret}`;
  return `fallback:${String(company.raison_sociale || "").trim().toLowerCase()}|${String(company.code_postal || "").trim()}|${normalizeNaf(company.code_naf)}`;
}

function toSortedRows(map: Map<string, number>, total: number) {
  return [...map.entries()]
    .map(([label, count]) => ({
      label,
      count,
      pct: total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "fr"));
}

export async function GET() {
  const guard = await requireAuth("scrapping", "GET");
  if (guard.denied) return guard.denied;

  try {
    const lists = await getScrapingIndex();
    const allCompanies = await Promise.all(lists.map((l) => getScrapingCompanies(l.id)));
    const flattened = allCompanies.flat();

    const seen = new Set<string>();
    const unique: ScrapingCompany[] = [];
    for (const company of flattened) {
      const key = uniqueCompanyKey(company);
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(company);
    }

    const byRegion = new Map<string, number>();
    const byNaf = new Map<string, number>();

    for (const company of unique) {
      const region = resolveRegion(company);
      const naf = normalizeNaf(company.code_naf);
      byRegion.set(region, (byRegion.get(region) || 0) + 1);
      byNaf.set(naf, (byNaf.get(naf) || 0) + 1);
    }

    return NextResponse.json({
      meta: {
        listsCount: lists.length,
        rawCompaniesCount: flattened.length,
        uniqueCompaniesCount: unique.length,
      },
      byRegion: toSortedRows(byRegion, unique.length),
      byNaf: toSortedRows(byNaf, unique.length),
    });
  } catch (error) {
    console.error("GET /api/scraping/completion error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
