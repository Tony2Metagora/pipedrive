import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import {
  deleteFollowupCampaign,
  deleteFollowupItemsForCampaign,
  getCampaignStats,
  getFollowupCampaign,
  listFollowupItemsByCampaign,
} from "@/lib/followup-store";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth("sequences", "GET");
  if (guard.denied) return guard.denied;
  try {
    const { id } = await params;
    const campaignId = Number(id);
    if (!Number.isFinite(campaignId)) {
      return NextResponse.json({ error: "ID campagne invalide" }, { status: 400 });
    }
    const [campaign, items, stats] = await Promise.all([
      getFollowupCampaign(campaignId),
      listFollowupItemsByCampaign(campaignId),
      getCampaignStats(campaignId),
    ]);
    if (!campaign) return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });
    const nextSendAt = items
      .filter((item) => item.status === "a_envoyer" || item.status === "en_cours")
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0]
      ?.scheduledAt || null;
    return NextResponse.json({ data: { campaign: { ...campaign, nextSendAt }, items, stats } });
  } catch (error) {
    console.error("GET /api/sequences/affaires/campaigns/[id] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth("sequences", "DELETE");
  if (guard.denied) return guard.denied;
  try {
    const { id } = await params;
    const campaignId = Number(id);
    if (!Number.isFinite(campaignId)) {
      return NextResponse.json({ error: "ID campagne invalide" }, { status: 400 });
    }
    const campaign = await getFollowupCampaign(campaignId);
    if (!campaign) return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });
    await deleteFollowupItemsForCampaign(campaignId);
    await deleteFollowupCampaign(campaignId);
    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    console.error("DELETE /api/sequences/affaires/campaigns/[id] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

