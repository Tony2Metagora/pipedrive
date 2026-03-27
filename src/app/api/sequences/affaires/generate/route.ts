import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAuth } from "@/lib/api-guard";
import {
  getFollowupCampaign,
  replaceFollowupItemsForCampaign,
  updateFollowupCampaign,
} from "@/lib/followup-store";
import {
  generateFollowupDraft,
  loadDealContextForLead,
  loadThreadContextForLead,
} from "@/lib/followup-ai";

interface GenerateLeadInput {
  email: string;
  name?: string;
  company?: string;
  dealId?: number | null;
}

export async function POST(request: Request) {
  const guard = await requireAuth("sequences", "POST");
  if (guard.denied) return guard.denied;
  try {
    const body = (await request.json()) as {
      campaignId?: number;
      leads?: GenerateLeadInput[];
    };
    const campaignId = Number(body.campaignId);
    if (!Number.isFinite(campaignId)) {
      return NextResponse.json({ error: "campaignId requis" }, { status: 400 });
    }
    const leads = body.leads || [];
    if (!leads.length) return NextResponse.json({ error: "leads[] requis" }, { status: 400 });

    const campaign = await getFollowupCampaign(campaignId);
    if (!campaign) return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });

    const session = await auth();
    const accessToken = (session as unknown as Record<string, unknown>).accessToken as string | undefined;
    if (!accessToken) {
      return NextResponse.json(
        { error: "Token Gmail manquant. Reconnectez-vous pour generer les follow-up." },
        { status: 403 }
      );
    }

    const createdAt = Date.now();
    const generated = await Promise.all(
      leads.map(async (lead, idx) => {
        const threadContext = await loadThreadContextForLead(accessToken, lead.email);
        const dealInfo = await loadDealContextForLead(lead.email, lead.dealId);
        const draft = await generateFollowupDraft({
          leadName: lead.name,
          leadEmail: lead.email,
          company: lead.company,
          threadContext,
          dealContext: dealInfo.context,
        });
        return {
          campaignId,
          dealId: dealInfo.dealId,
          leadEmail: lead.email,
          leadName: lead.name || "",
          company: lead.company || "",
          subject: draft.subject,
          body: draft.body,
          status: "draft" as const,
          order: idx + 1,
          scheduledAt: new Date(createdAt + idx * 10 * 60 * 1000).toISOString(),
          lastEmailAt: undefined,
          sentAt: undefined,
          gmailMessageId: undefined,
          gmailThreadId: undefined,
          lastError: undefined,
        };
      })
    );

    const items = await replaceFollowupItemsForCampaign(campaignId, generated);
    await updateFollowupCampaign(campaignId, { status: "draft" });

    return NextResponse.json({ data: { items } });
  } catch (error) {
    console.error("POST /api/sequences/affaires/generate error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

