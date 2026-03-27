import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAuth } from "@/lib/api-guard";
import { getFollowupCampaign } from "@/lib/followup-store";
import {
  generateFollowupSequenceDrafts,
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
      sequenceCount?: number;
    };

    const campaignId = Number(body.campaignId);
    if (!Number.isFinite(campaignId)) {
      return NextResponse.json({ error: "campaignId requis" }, { status: 400 });
    }
    const sequenceCount = Math.max(1, Math.min(5, Number(body.sequenceCount) || 1));
    const leads = body.leads || [];
    if (!leads.length) return NextResponse.json({ error: "leads[] requis" }, { status: 400 });

    const campaign = await getFollowupCampaign(campaignId);
    if (!campaign) return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });

    const session = await auth();
    const accessToken = (session as unknown as Record<string, unknown>).accessToken as string | undefined;
    if (!accessToken) {
      return NextResponse.json(
        { error: "Token Gmail manquant — reconnectez-vous pour generer la sequence." },
        { status: 403 }
      );
    }

    const leadSequences = await Promise.all(
      leads.map(async (lead) => {
        const threadContext = await loadThreadContextForLead(accessToken, lead.email);
        const dealInfo = await loadDealContextForLead(lead.email, lead.dealId);
        const steps = await generateFollowupSequenceDrafts({
          leadName: lead.name,
          leadEmail: lead.email,
          company: lead.company,
          threadContext,
          dealContext: dealInfo.context,
          sequenceCount,
        });
        return {
          email: lead.email,
          name: lead.name || "",
          company: lead.company || "",
          dealId: dealInfo.dealId,
          steps: steps.map((s) => ({
            step: s.step,
            enabled: true,
            delayDays: s.delayDays,
            subject: s.subject,
            body: s.body,
          })),
        };
      })
    );

    return NextResponse.json({ data: { leadSequences } });
  } catch (error) {
    console.error("POST /api/sequences/affaires/generate-series error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

