/**
 * API Route — Activités Pipedrive
 * GET : liste des activités non faites
 * POST : créer une activité
 */

import { NextResponse } from "next/server";
import { getActivities, createActivity } from "@/lib/pipedrive";

export async function GET() {
  try {
    // Récupère les activités non faites, triées par date d'échéance
    // Filtre : uniquement celles liées à un deal (affaire)
    const all = await getActivities({ done: "0", limit: "500", sort: "due_date ASC" });
    const activities = all.filter((a: { deal_id?: number | null }) => a.deal_id);
    return NextResponse.json({ data: activities });
  } catch (error) {
    console.error("GET /api/activities error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const activity = await createActivity(body);
    return NextResponse.json({ data: activity });
  } catch (error) {
    console.error("POST /api/activities error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
