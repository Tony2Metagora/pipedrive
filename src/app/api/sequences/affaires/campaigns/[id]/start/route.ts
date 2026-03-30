import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAuth } from "@/lib/api-guard";
import {
  getCampaignStats,
  listFollowupItemsByCampaign,
  markCampaignFirstStepReady,
  pickNextReadyItem,
  updateFollowupCampaign,
  updateFollowupItem,
} from "@/lib/followup-store";
import { sendGmailMessage, type GmailAuthToken } from "@/lib/gmail-sender";

function addBusinessDays(date: Date, businessDays: number): Date {
  let remaining = Math.max(0, Math.floor(businessDays || 0));
  if (remaining === 0) return new Date(date.getTime());
  const d = new Date(date.getTime());
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return d;
}

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

    const senderAuth: GmailAuthToken = { accessToken, refreshToken, expiresAt };

    await markCampaignFirstStepReady(campaignId);
    const updated = await updateFollowupCampaign(campaignId, {
      status: "running",
      startedAt: new Date().toISOString(),
      senderAuth,
    });
    if (!updated) return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });

    // Send all ready step-1 mails immediately (token is fresh)
    let sentCount = 0;
    let latestToken: GmailAuthToken = senderAuth;
    for (let i = 0; i < 50; i++) {
      const item = await pickNextReadyItem(campaignId);
      if (!item) break;

      try {
        const prenomRaw = (item.leadName || "").trim().split(/\s+/).filter(Boolean)[0] || "";
        const prenom = prenomRaw ? prenomRaw.charAt(0).toUpperCase() + prenomRaw.slice(1) : "";
        const subject = (item.subject || "")
          .replace(/\{+\s*pr[ée]nom\s*\}+/gi, prenom)
          .replace(/\{+\s*email\s*\}+/gi, item.leadEmail || "")
          .replace(/\{+\s*entreprise\s*\}+/gi, item.company || "");
        const body = (item.body || "")
          .replace(/\{+\s*pr[ée]nom\s*\}+/gi, prenom)
          .replace(/\{+\s*email\s*\}+/gi, item.leadEmail || "")
          .replace(/\{+\s*entreprise\s*\}+/gi, item.company || "");

        const sent = await sendGmailMessage(latestToken, {
          to: item.leadEmail,
          subject,
          text: body,
        });
        latestToken = sent.token;

        await updateFollowupItem(item.id, {
          status: "envoye",
          sentAt: new Date().toISOString(),
          lastEmailAt: new Date().toISOString(),
          gmailMessageId: sent.id,
          gmailThreadId: sent.threadId,
          lastError: undefined,
        });

        // Schedule next step for this lead
        const allItems = await listFollowupItemsByCampaign(campaignId);
        const currentStep = item.sequenceStep ?? 1;
        const nextStepItem = allItems.find(
          (i) =>
            i.leadEmail.toLowerCase() === item.leadEmail.toLowerCase() &&
            (i.sequenceStep ?? 1) === currentStep + 1 &&
            i.status === "draft"
        );
        if (nextStepItem) {
          const delayBD =
            typeof nextStepItem.delayAfterPreviousBusinessDays === "number"
              ? Math.max(0, Number(nextStepItem.delayAfterPreviousBusinessDays) || 0)
              : Math.round(Math.max(0, nextStepItem.delayAfterPreviousMinutes ?? 0) / (24 * 60));
          await updateFollowupItem(nextStepItem.id, {
            status: "a_envoyer",
            scheduledAt: addBusinessDays(new Date(), delayBD).toISOString(),
            lastError: undefined,
          });
        }

        sentCount += 1;
      } catch (sendErr) {
        console.error(`[start] Envoi immediat echoue pour ${item.leadEmail}:`, sendErr);
        await updateFollowupItem(item.id, {
          status: "erreur",
          lastError: String(sendErr),
        });
      }
    }

    // Persist refreshed token
    if (latestToken !== senderAuth) {
      await updateFollowupCampaign(campaignId, { senderAuth: latestToken });
    }

    const stats = await getCampaignStats(campaignId);
    return NextResponse.json({
      data: { campaign: updated, stats, sentImmediately: sentCount },
    });
  } catch (error) {
    console.error("POST /api/sequences/affaires/campaigns/[id]/start error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

