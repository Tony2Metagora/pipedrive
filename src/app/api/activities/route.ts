/**
 * API Route — Activités (Blob Storage)
 * GET : liste des activités non faites
 * POST : créer une activité
 */

import { NextResponse } from "next/server";
import { getActivities, createActivity, type Activity } from "@/lib/blob-store";
import { requireAuth } from "@/lib/api-guard";

export async function GET() {
  const guard = await requireAuth("dashboard", "GET");
  if (guard.denied) return guard.denied;
  try {
    const all = await getActivities();
    // Filtre : non faites + liées à un deal, triées par date
    const activities = all
      .filter((a) => !a.done && a.deal_id)
      .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));
    return NextResponse.json({ data: activities });
  } catch (error) {
    console.error("GET /api/activities error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const guard = await requireAuth("dashboard", "POST");
  if (guard.denied) return guard.denied;
  try {
    const body = await request.json();
    const activity = await createActivity({
      ...body,
      type: body.type || "task",
      done: false,
      due_time: body.due_time || "",
    } as Omit<Activity, "id">);
    return NextResponse.json({ data: activity });
  } catch (error) {
    console.error("POST /api/activities error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
