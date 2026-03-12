/**
 * API Route — Download enriched CSV for an import list
 * GET /api/imports/[id]/download
 */

import { NextResponse } from "next/server";
import { getImportContacts } from "@/lib/import-store";

export const dynamic = "force-dynamic";

const CSV_HEADERS = [
  { key: "first_name", label: "first_name" },
  { key: "last_name", label: "last_name" },
  { key: "email", label: "email" },
  { key: "company", label: "company" },
  { key: "job", label: "job" },
  { key: "phone", label: "phone" },
  { key: "mobile_phone", label: "mobile_phone" },
  { key: "linkedin", label: "linkedin" },
  { key: "location", label: "location" },
  { key: "company_location", label: "company_location" },
  { key: "website", label: "website" },
  { key: "company_linkedin", label: "company_linkedin" },
  { key: "company_domain", label: "company_domain" },
  { key: "siren", label: "siren" },
  { key: "siret", label: "siret" },
  { key: "naf_code", label: "naf_code" },
  { key: "naf_label", label: "naf_label" },
  { key: "nb_employees", label: "nb_employees" },
  { key: "company_address", label: "company_address" },
  { key: "company_city", label: "company_city" },
  { key: "company_postal_code", label: "company_postal_code" },
  { key: "company_country", label: "company_country" },
  { key: "company_turnover", label: "company_turnover" },
  { key: "email_qualification", label: "email_qualification" },
  { key: "enriched", label: "enriched" },
];

function escapeCsvField(val: string): string {
  if (!val) return "";
  if (val.includes(";") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const contacts = await getImportContacts(id);

    // Build CSV with ";" separator
    const headerLine = CSV_HEADERS.map((h) => h.label).join(";");
    const dataLines = contacts.map((c) =>
      CSV_HEADERS.map((h) => {
        const val = (c as unknown as Record<string, unknown>)[h.key];
        return escapeCsvField(String(val ?? ""));
      }).join(";")
    );

    const csv = [headerLine, ...dataLines].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="import_${id}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("GET /api/imports/[id]/download error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
