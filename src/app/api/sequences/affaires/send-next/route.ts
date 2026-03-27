import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import { sendGmailMessage } from "@/lib/gmail-sender";
import {
  getCampaignStats,
  getFollowupCampaign,
  listFollowupItemsByCampaign,
  markLeadItemsAsReplied,
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

async function hasLeadRepliedSince(
  accessToken: string,
  threadId: string | undefined,
  leadEmail: string,
  sinceIso?: string
): Promise<boolean> {
  if (!threadId) return false;
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=metadata&metadataHeaders=From&metadataHeaders=Date`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return false;
  const json = (await res.json().catch(() => ({}))) as {
    messages?: Array<{ payload?: { headers?: Array<{ name: string; value: string }> } }>;
  };
  const sinceTs = sinceIso ? new Date(sinceIso).getTime() : 0;
  const lead = leadEmail.toLowerCase();
  for (const msg of json.messages || []) {
    const headers = msg.payload?.headers || [];
    const from = headers.find((h) => h.name.toLowerCase() === "from")?.value?.toLowerCase() || "";
    const dateRaw = headers.find((h) => h.name.toLowerCase() === "date")?.value;
    const dateTs = dateRaw ? new Date(dateRaw).getTime() : 0;
    if (from.includes(lead) && dateTs > sinceTs) return true;
  }
  return false;
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

    const allItems = await listFollowupItemsByCampaign(campaignId);
    const leadItems = allItems
      .filter((i) => i.leadEmail.toLowerCase() === item.leadEmail.toLowerCase())
      .sort((a, b) => (a.sequenceStep ?? 1) - (b.sequenceStep ?? 1));
    const prevSent = leadItems
      .filter((i) => i.status === "envoye" && (i.sequenceStep ?? 1) < (item.sequenceStep ?? 1))
      .sort((a, b) => new Date(b.sentAt || 0).getTime() - new Date(a.sentAt || 0).getTime())[0];
    if (prevSent?.gmailThreadId) {
      const replied = await hasLeadRepliedSince(
        auth.accessToken,
        prevSent.gmailThreadId,
        item.leadEmail,
        prevSent.sentAt
      );
      if (replied) {
        await markLeadItemsAsReplied(campaignId, item.leadEmail);
        await updateFollowupCampaign(campaignId, { lastRunAt: new Date().toISOString() });
        return NextResponse.json({
          data: {
            sent: false,
            reason: "Lead a repondu, sequence stoppee",
            leadEmail: item.leadEmail,
          },
        });
      }
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

      const sentAt = new Date();
      const currentStep = item.sequenceStep ?? 1;
      const nextStepItem = leadItems.find(
        (i) => (i.sequenceStep ?? 1) === currentStep + 1 && i.status === "draft"
      );
      if (nextStepItem) {
        const delayMin = Math.max(0, nextStepItem.delayAfterPreviousMinutes ?? campaign.cadenceMinutes ?? 10);
        await updateFollowupItem(nextStepItem.id, {
          status: "a_envoyer",
          scheduledAt: new Date(sentAt.getTime() + delayMin * 60 * 1000).toISOString(),
          lastError: undefined,
        });
      }
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

