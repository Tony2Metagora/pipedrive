import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import { listFollowupItemsByCampaign, updateFollowupItem } from "@/lib/followup-store";

export async function POST(request: Request) {
  const guard = await requireAuth("sequences", "POST");
  if (guard.denied) return guard.denied;
  try {
    const body = (await request.json().catch(() => ({}))) as { campaignId?: number };
    const campaignId = Number(body.campaignId);
    if (!Number.isFinite(campaignId)) {
      return NextResponse.json({ error: "campaignId requis" }, { status: 400 });
    }

    const items = await listFollowupItemsByCampaign(campaignId);
    const errorItems = items.filter((i) => i.status === "erreur" || i.status === "en_cours");
    let reset = 0;
    for (const item of errorItems) {
      await updateFollowupItem(item.id, {
        status: "a_envoyer",
        scheduledAt: new Date().toISOString(),
        lastError: undefined,
      });
      reset += 1;
    }

    return NextResponse.json({ data: { reset } });
  } catch (error) {
    console.error("POST /api/sequences/affaires/retry-errors error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
