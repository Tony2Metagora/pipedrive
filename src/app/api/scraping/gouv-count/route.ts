import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import { RETAIL_NAF_CODES, IDF_DEPARTEMENTS } from "@/lib/retail-naf";
import { departementsForRegion } from "@/lib/scraping-regions";

export const dynamic = "force-dynamic";

const GOUV_SEARCH = "https://recherche-entreprises.api.gouv.fr/search";

async function fetchTotalResults(naf: string, departement?: string): Promise<number> {
  const params = new URLSearchParams({
    activite_principale: naf,
    etat_administratif: "A",
    per_page: "1",
    page: "1",
  });
  if (departement) params.set("departement", departement);

  const res = await fetch(`${GOUV_SEARCH}?${params}`, {
    headers: { Accept: "application/json", "User-Agent": "Metagora-Prospection/1.0" },
  });
  if (!res.ok) {
    console.error(`gouv-count ${res.status} naf=${naf} dept=${departement || ""}`);
    return -1;
  }
  const data = (await res.json()) as { total_results?: number };
  return typeof data.total_results === "number" ? data.total_results : 0;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * POST body:
 * - mode omitted or "summary": { nafs? } → france + idf par NAF
 * - mode "matrix": exactement 1 région + 1 NAF — champs `region` + `naf` (ou un seul élément dans regions[] / nafs[])
 */
export async function POST(request: Request) {
  const guard = await requireAuth("scrapping", "POST");
  if (guard.denied) return guard.denied;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      mode?: "summary" | "matrix";
      nafs?: string[];
      regions?: string[];
      naf?: string;
      region?: string;
    };

    const nafs = (body.nafs?.length ? body.nafs : RETAIL_NAF_CODES.map((x) => x.code)).map((c) => String(c).trim().toUpperCase());

    if (body.mode === "matrix") {
      const regionRaw =
        typeof body.region === "string" && body.region.trim()
          ? body.region.trim()
          : Array.isArray(body.regions) && body.regions.length
            ? String(body.regions[0]).trim()
            : "";
      const nafRaw =
        typeof body.naf === "string" && body.naf.trim()
          ? body.naf.trim().toUpperCase()
          : Array.isArray(body.nafs) && body.nafs?.length
            ? String(body.nafs[0]).trim().toUpperCase()
            : "";

      if (!regionRaw || !nafRaw) {
        return NextResponse.json(
          {
            error:
              "Matrice : indiquer exactement une région et un code NAF (champs region et naf, ou tableaux d’un seul élément).",
          },
          { status: 400 }
        );
      }

      const depts = departementsForRegion(regionRaw);
      if (depts.length === 0) {
        return NextResponse.json({ error: `Région inconnue ou sans département : ${regionRaw}` }, { status: 400 });
      }

      let sum = 0;
      for (const dept of depts) {
        const t = await fetchTotalResults(nafRaw, dept);
        if (t >= 0) sum += t;
        await sleep(120);
      }

      const matrix: Record<string, Record<string, number>> = {
        [regionRaw]: { [nafRaw]: sum },
      };

      return NextResponse.json({
        success: true,
        matrix,
        region: regionRaw,
        naf: nafRaw,
        note: "Un seul couple région × NAF : somme des total_results API par département de la région.",
      });
    }

    const france: Record<string, number> = {};
    const idf: Record<string, number> = {};

    for (const naf of nafs) {
      france[naf] = await fetchTotalResults(naf);
      await sleep(150);
    }

    for (const naf of nafs) {
      let sum = 0;
      for (const dept of IDF_DEPARTEMENTS) {
        const t = await fetchTotalResults(naf, dept);
        if (t >= 0) sum += t;
        await sleep(150);
      }
      idf[naf] = sum;
    }

    return NextResponse.json({
      success: true,
      france,
      idf,
      note:
        "Total IDF = somme des total_results par département (75,77,78,91,92,93,94,95). Peut différer légèrement d'un filtre régional unique selon l'API.",
    });
  } catch (e) {
    console.error("POST /api/scraping/gouv-count", e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
