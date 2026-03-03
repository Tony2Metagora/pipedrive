/**
 * API Route — Deals Pipedrive
 * GET : liste/recherche des deals
 * POST : créer un deal
 */

import { NextResponse } from "next/server";
import { getDeals, createDeal, searchDeals } from "@/lib/pipedrive";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const status = searchParams.get("status");

    if (search) {
      const deals = await searchDeals(search);
      return NextResponse.json({ data: deals });
    }

    const params: Record<string, string> = {};
    if (status) params.status = status;

    const rawDeals = await getDeals(params);
    // Pipedrive renvoie person_id/org_id comme objet {value:N} ou number — normaliser
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deals = rawDeals.map((d) => {
      const raw = d as any;
      const personId = typeof raw.person_id === "object" && raw.person_id !== null
        ? raw.person_id.value
        : raw.person_id;
      const orgId = typeof raw.org_id === "object" && raw.org_id !== null
        ? raw.org_id.value
        : raw.org_id;
      const personName = raw.person_name || (typeof raw.person_id === "object" && raw.person_id !== null ? raw.person_id.name : undefined);
      const orgName = raw.org_name || (typeof raw.org_id === "object" && raw.org_id !== null ? raw.org_id.name : undefined);
      return { ...d, person_id: personId ?? null, org_id: orgId ?? null, person_name: personName, org_name: orgName };
    });
    return NextResponse.json({ data: deals });
  } catch (error) {
    console.error("GET /api/deals error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const deal = await createDeal(body);
    return NextResponse.json({ data: deal });
  } catch (error) {
    console.error("POST /api/deals error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
