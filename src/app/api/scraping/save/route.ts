/**
 * API Route — Save scraping results as a named list
 * POST /api/scraping/save
 */

import { NextResponse } from "next/server";
import {
  createScrapingList,
  type ScrapingCompany,
  type ScrapingList,
} from "@/lib/scraping-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, companies, filters } = body as {
      name: string;
      companies: Array<Omit<ScrapingCompany, "id">>;
      filters: ScrapingList["filters"];
    };

    if (!name?.trim()) {
      return NextResponse.json({ error: "Nom de liste requis" }, { status: 400 });
    }
    if (!companies?.length) {
      return NextResponse.json({ error: "Aucune entreprise à sauvegarder" }, { status: 400 });
    }

    // Add IDs to companies
    const withIds: ScrapingCompany[] = companies.map((c, i) => ({
      ...c,
      id: `sc_${Date.now()}_${i}`,
    }));

    const list = await createScrapingList(name.trim(), withIds, filters);
    return NextResponse.json({ data: list });
  } catch (error) {
    console.error("POST /api/scraping/save error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
