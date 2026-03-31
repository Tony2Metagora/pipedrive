import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import { createFollowupCampaign, listFollowupCampaigns, listFollowupItemsByCampaign } from "@/lib/followup-store";

export async function GET() {
  const guard = await requireAuth("sequences", "GET");
  if (guard.denied) return guard.denied;
  try {
    const campaigns = await listFollowupCampaigns();
    const campaignsWithNextSend = await Promise.all(
      campaigns.map(async (campaign) => {
        const items = await listFollowupItemsByCampaign(campaign.id);
        const nextScheduled = items
          .filter((item) => item.status === "a_envoyer" || item.status === "en_cours")
          .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0];
        return {
          ...campaign,
          nextSendAt: nextScheduled?.scheduledAt || null,
        };
      })
    );
    return NextResponse.json({ data: campaignsWithNextSend });
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

