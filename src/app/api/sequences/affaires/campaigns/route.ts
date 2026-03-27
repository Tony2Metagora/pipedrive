import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import { createFollowupCampaign, listFollowupCampaigns } from "@/lib/followup-store";

export async function GET() {
  const guard = await requireAuth("sequences", "GET");
  if (guard.denied) return guard.denied;
  try {
    const campaigns = await listFollowupCampaigns();
    return NextResponse.json({ data: campaigns });
  } catch (error) {
    console.error("GET /api/sequences/affaires/campaigns error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const guard = await requireAuth("sequences", "POST");
  if (guard.denied) return guard.denied;
  try {
    const body = (await request.json()) as {
      name?: string;
      senderEmail?: string;
      cadenceMinutes?: number;
    };

    const name = body.name?.trim();
    if (!name) return NextResponse.json({ error: "Nom requis" }, { status: 400 });

    const senderEmail = body.senderEmail?.trim() || "tony@metagora.tech";
    const campaign = await createFollowupCampaign({
      name,
      createdBy: guard.email,
      senderEmail,
      cadenceMinutes: body.cadenceMinutes || 10,
    });

    return NextResponse.json({ data: campaign });
  } catch (error) {
    console.error("POST /api/sequences/affaires/campaigns error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

