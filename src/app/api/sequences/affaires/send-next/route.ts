import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import { sendGmailMessage } from "@/lib/gmail-sender";
import {
  getCampaignStats,
  getFollowupCampaign,
  pickNextReadyItem,
  updateFollowupCampaign,
  updateFollowupItem,
} from "@/lib/followup-store";

function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("x-cron-secret");
  return header === secret;
}

export async function POST(request: Request) {
  const cronCall = isCronAuthorized(request);
  if (!cronCall) {
    const guard = await requireAuth("sequences", "POST");
    if (guard.denied) return guard.denied;
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { campaignId?: number };
    const campaignId = Number(body.campaignId);
    if (!Number.isFinite(campaignId)) {
      return NextResponse.json({ error: "campaignId requis" }, { status: 400 });
    }

    const campaign = await getFollowupCampaign(campaignId);
    if (!campaign) return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });
    if (campaign.status !== "running") {
      return NextResponse.json({ error: "Campagne non active" }, { status: 400 });
    }

    const item = await pickNextReadyItem(campaignId);
    if (!item) {
      const stats = await getCampaignStats(campaignId);
      if (stats.a_envoyer === 0 && stats.en_cours === 0) {
        await updateFollowupCampaign(campaignId, { status: "completed" });
      }
      return NextResponse.json({ data: { sent: false, reason: "Aucun item pret" } });
    }

    const auth = campaign.senderAuth;
    if (!auth?.accessToken) {
      await updateFollowupItem(item.id, { status: "erreur", lastError: "Token sender manquant" });
      return NextResponse.json({ error: "Token sender manquant" }, { status: 400 });
    }

    try {
      const sent = await sendGmailMessage(auth, {
        to: item.leadEmail,
        subject: item.subject,
        text: item.body,
      });

      await updateFollowupItem(item.id, {
        status: "envoye",
        sentAt: new Date().toISOString(),
        lastEmailAt: new Date().toISOString(),
        gmailMessageId: sent.id,
        gmailThreadId: sent.threadId,
        lastError: undefined,
      });
      await updateFollowupCampaign(campaignId, {
        senderAuth: sent.token,
        lastRunAt: new Date().toISOString(),
      });

      return NextResponse.json({ data: { sent: true, itemId: item.id } });
    } catch (error) {
      await updateFollowupItem(item.id, {
        status: "erreur",
        lastError: String(error),
      });
      return NextResponse.json({ error: "Echec envoi", details: String(error) }, { status: 500 });
    }
  } catch (error) {
    console.error("POST /api/sequences/affaires/send-next error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

