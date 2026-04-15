/**
 * API Route — Export ICP contacts as CSV
 * GET ?list_id=xxx&icp_category=xxx&filename=xxx
 */

import { NextResponse } from "next/server";
import { readBlob } from "@/lib/blob-store";
import { requireAuth } from "@/lib/api-guard";
import type { IcpContact } from "../contacts/route";

function escapeCsv(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n") || val.includes(";")) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

const COLUMNS = [
  { key: "prenom", label: "Prénom" },
  { key: "nom", label: "Nom" },
  { key: "email", label: "Email" },
  { key: "telephone", label: "Téléphone" },
  { key: "poste", label: "Poste" },
  { key: "entreprise", label: "Entreprise" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "ville", label: "Ville" },
  { key: "icp_category", label: "ICP" },
  { key: "icp_reason", label: "Raison ICP" },
];

export async function GET(request: Request) {
  const guard = await requireAuth("prospects", "GET");
  if (guard.denied) return guard.denied;

  const { searchParams } = new URL(request.url);
  const listId = searchParams.get("list_id");
  const icpCategory = searchParams.get("icp_category");
  const filename = searchParams.get("filename") || "icp-export";

  let contacts = await readBlob<IcpContact>("icp-contacts");
  if (listId) contacts = contacts.filter((c) => c.list_id === listId);
  if (icpCategory) contacts = contacts.filter((c) => c.icp_category === icpCategory);

  const header = COLUMNS.map((c) => c.label).join(";");
  const rows = contacts.map((c) =>
    COLUMNS.map((col) => escapeCsv(String((c as Record<string, unknown>)[col.key] || ""))).join(";")
  );

  const csv = "\uFEFF" + [header, ...rows].join("\n");
  const cleanFilename = filename.replace(/[\\/:*?"<>|]/g, "").slice(0, 80);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${cleanFilename}.csv"`,
    },
  });
}
