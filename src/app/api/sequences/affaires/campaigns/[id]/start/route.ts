import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAuth } from "@/lib/api-guard";
import {
  getCampaignStats,
  markCampaignItemsReady,
  updateFollowupCampaign,
} from "@/lib/followup-store";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth("sequences", "POST");
  if (guard.denied) return guard.denied;
  try {
    const { id } = await params;
    const campaignId = Number(id);
    if (!Number.isFinite(campaignId)) {
      return NextResponse.json({ error: "ID campagne invalide" }, { status: 400 });
    }

    const session = await auth();
    const record = session as unknown as Record<string, unknown>;
    const accessToken = record.accessToken as string | undefined;
    const refreshToken = record.refreshToken as string | undefined;
    const expiresAt = record.expiresAt as number | undefined;
    if (!accessToken) {
      return NextResponse.json(
        { error: "Token Google manquant. Reconnectez-vous avant de lancer la campagne." },
        { status: 403 }
      );
    }

    await markCampaignItemsReady(campaignId);
    const updated = await updateFollowupCampaign(campaignId, {
      status: "running",
      startedAt: new Date().toISOString(),
      senderAuth: {
        accessToken,
        refreshToken,
        expiresAt,
      },
    });
    if (!updated) return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });

    const stats = await getCampaignStats(campaignId);
    return NextResponse.json({ data: { campaign: updated, stats } });
  } catch (error) {
    console.error("POST /api/sequences/affaires/campaigns/[id]/start error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

