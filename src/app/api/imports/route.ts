/**
 * API Route — Import Lists
 * GET  : list all import lists
 * POST : create a new import list from CSV data
 */

import { NextResponse } from "next/server";
import {
  getImportIndex,
  createImportList,
  type ImportContact,
} from "@/lib/import-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const index = await getImportIndex();
    return NextResponse.json({ data: index });
  } catch (error) {
    console.error("GET /api/imports error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, rows } = body as { name: string; rows: Record<string, string>[] };

    if (!name?.trim()) {
      return NextResponse.json({ error: "Nom de liste requis" }, { status: 400 });
    }
    if (!rows?.length) {
      return NextResponse.json({ error: "Aucune ligne de données" }, { status: 400 });
    }
    if (rows.length > 500) {
      return NextResponse.json({ error: "Maximum 500 contacts par import" }, { status: 400 });
    }

    // Build contacts
    const contacts: ImportContact[] = rows.map((row, i) => ({
      id: `c_${Date.now()}_${i}`,
      first_name: row.first_name || "",
      last_name: row.last_name || "",
      email: row.email || "",
      company: row.company || "",
      job: row.job || "",
      phone: row.phone || "",
      linkedin: row.linkedin || "",
      location: row.location || "",
      company_location: row.company_location || "",
    }));

    const list = await createImportList(name.trim(), contacts);

    return NextResponse.json({ data: list });
  } catch (error) {
    console.error("POST /api/imports error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
