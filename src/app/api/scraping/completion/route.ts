import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import { getScrapingCompanies, getScrapingIndex, type ScrapingCompany } from "@/lib/scraping-store";
import {
  RETAIL_NAF_CODES,
  RETAIL_NAF_CODE_SET,
  GRANDES_REGIONS_ORDER,
  isIdfDepartement,
} from "@/lib/retail-naf";
import { REGION_BY_DEPARTMENT } from "@/lib/scraping-regions";

export const dynamic = "force-dynamic";

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

function isCompanyIdf(c: ScrapingCompany): boolean {
  const d1 = normalizeDept(c.departement);
  if (d1 && isIdfDepartement(d1)) return true;
  const d2 = normalizeDept(c.code_postal);
  return isIdfDepartement(d2);
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

    const retailByNafIdf = new Map<string, number>();
    const retailByNafFrance = new Map<string, number>();
    const retailRegionNaf = new Map<string, Map<string, number>>();
    for (const { code } of RETAIL_NAF_CODES) {
      retailByNafIdf.set(code, 0);
      retailByNafFrance.set(code, 0);
    }

    for (const company of unique) {
      const nafRaw = String(company.code_naf || "").trim().toUpperCase();
      if (!RETAIL_NAF_CODE_SET.has(nafRaw)) continue;
      const region = resolveRegion(company);
      retailByNafFrance.set(nafRaw, (retailByNafFrance.get(nafRaw) || 0) + 1);
      if (isCompanyIdf(company)) {
        retailByNafIdf.set(nafRaw, (retailByNafIdf.get(nafRaw) || 0) + 1);
      }
      if (!retailRegionNaf.has(region)) retailRegionNaf.set(region, new Map());
      const rm = retailRegionNaf.get(region)!;
      rm.set(nafRaw, (rm.get(nafRaw) || 0) + 1);
    }

    const retailRows = RETAIL_NAF_CODES.map(({ code, label }) => ({
      code,
      label,
      scrapedIdf: retailByNafIdf.get(code) ?? 0,
      scrapedFrance: retailByNafFrance.get(code) ?? 0,
    }));

    const seenRetailRegions = new Set(retailRegionNaf.keys());
    const matrixRegions = [
      ...GRANDES_REGIONS_ORDER.filter((r) => seenRetailRegions.has(r)),
      ...[...seenRetailRegions]
        .filter((r) => !GRANDES_REGIONS_ORDER.includes(r))
        .sort((a, b) => a.localeCompare(b, "fr")),
    ];

    const retailMatrix = matrixRegions.map((region) => {
      const m = retailRegionNaf.get(region) || new Map<string, number>();
      const byNaf: Record<string, number> = {};
      for (const { code } of RETAIL_NAF_CODES) {
        byNaf[code] = m.get(code) ?? 0;
      }
      return { region, byNaf };
    });

    return NextResponse.json({
      meta: {
        listsCount: lists.length,
        rawCompaniesCount: flattened.length,
        uniqueCompaniesCount: unique.length,
      },
      byRegion: toSortedRows(byRegion, unique.length),
      byNaf: toSortedRows(byNaf, unique.length),
      retail: {
        rows: retailRows,
        matrix: retailMatrix,
      },
    });
  } catch (error) {
    console.error("GET /api/scraping/completion error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
