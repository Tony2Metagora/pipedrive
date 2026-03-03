/**
 * API Route — Deals (Blob Storage)
 * GET : liste/recherche des deals
 * POST : créer un deal
 */

import { NextResponse } from "next/server";
import { getDeals, createDeal, type Deal } from "@/lib/blob-store";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.toLowerCase();
    const status = searchParams.get("status");

    let deals = await getDeals();
    console.log(`[GET /api/deals] ${deals.length} deals loaded from Blob, status filter: ${status}`);

    if (status) {
      deals = deals.filter((d) => d.status === status);
      console.log(`[GET /api/deals] ${deals.length} deals after status filter`);
    }

    if (search) {
      deals = deals.filter((d) =>
        d.title?.toLowerCase().includes(search) ||
        d.person_name?.toLowerCase().includes(search) ||
        d.org_name?.toLowerCase().includes(search)
      );
    }

    return NextResponse.json({ data: deals });
  } catch (error) {
    console.error("GET /api/deals error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const deal = await createDeal(body as Omit<Deal, "id">);
    return NextResponse.json({ data: deal });
  } catch (error) {
    console.error("POST /api/deals error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
