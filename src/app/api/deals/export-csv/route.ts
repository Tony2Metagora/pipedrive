/**
 * API Route — Export CSV des leads d'affaires
 * GET ?ids=1,2,3 → exporte uniquement les deals sélectionnés
 * GET            → exporte tous les deals ouverts
 * Colonnes : Prénom, Nom, Email, Téléphone, Poste, Entreprise
 */

import { NextResponse } from "next/server";
import { getDeals, getPerson, getOrganization } from "@/lib/blob-store";
import { requireAuth } from "@/lib/api-guard";

function escapeCsv(val: string): string {
  if (val.includes(";") || val.includes(",") || val.includes('"') || val.includes("\n")) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = (fullName || "").trim().split(/\s+/);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export async function GET(request: Request) {
  const guard = await requireAuth("dashboard", "GET");
  if (guard.denied) return guard.denied;
  try {
    const { searchParams } = new URL(request.url);
    const idsParam = searchParams.get("ids");
    const statusParam = searchParams.get("status") || "open";

    let deals = await getDeals();
    deals = deals.filter((d) => d.status === statusParam);

    if (idsParam) {
      const idSet = new Set(idsParam.split(",").map((s) => Number(s.trim())).filter(Boolean));
      deals = deals.filter((d) => idSet.has(d.id));
    }

    if (deals.length === 0) {
      return NextResponse.json({ error: "Aucune affaire à exporter" }, { status: 404 });
    }

    const orgCache = new Map<number, string>();
    const rows: string[][] = [];

    for (const deal of deals) {
      let firstName = "";
      let lastName = "";
      let email = "";
      let phone = "";
      let jobTitle = "";
      let company = "";

      if (deal.person_id) {
        const person = await getPerson(deal.person_id);
        if (person) {
          ({ firstName, lastName } = splitName(person.name));
          email = person.email?.find((e) => e.primary)?.value || person.email?.[0]?.value || "";
          phone = person.phone?.find((p) => p.primary)?.value || person.phone?.[0]?.value || "";
          jobTitle = person.job_title || "";
        }
      }

      if (deal.org_id) {
        if (orgCache.has(deal.org_id)) {
          company = orgCache.get(deal.org_id) || "";
        } else {
          const org = await getOrganization(deal.org_id);
          company = org?.name || "";
          orgCache.set(deal.org_id, company);
        }
      } else if (deal.org_name) {
        company = deal.org_name;
      }

      rows.push([firstName, lastName, email, phone, jobTitle, company]);
    }

    const headers = ["Prénom", "Nom", "Email", "Téléphone", "Poste", "Entreprise"];
    const csvLines = [
      headers.map(escapeCsv).join(";"),
      ...rows.map((r) => r.map((v) => escapeCsv(v || "")).join(";")),
    ];
    const csvContent = "\uFEFF" + csvLines.join("\n");

    const filename = idsParam ? "leads-selection.csv" : "leads-affaires.csv";

    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("GET /api/deals/export-csv error:", error);
    return NextResponse.json({ error: "Erreur export CSV" }, { status: 500 });
  }
}
