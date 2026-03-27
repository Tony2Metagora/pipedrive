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

interface LeadResult {
  email: string;
  name: string;
  company: string;
  dealId: number | null;
  subject: string;
  body: string;
  ok: true;
}

interface LeadError {
  email: string;
  error: string;
  ok: false;
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
        { error: "Token Gmail manquant — reconnectez-vous (deconnexion puis connexion) pour autoriser l'acces Gmail." },
        { status: 403 }
      );
    }

    const createdAt = Date.now();
    const results = await Promise.allSettled(
      leads.map(async (lead): Promise<LeadResult> => {
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
          email: lead.email,
          name: lead.name || "",
          company: lead.company || "",
          dealId: dealInfo.dealId,
          subject: draft.subject,
          body: draft.body,
          ok: true,
        };
      })
    );

    const successes: LeadResult[] = [];
    const errors: LeadError[] = [];
    results.forEach((r, idx) => {
      if (r.status === "fulfilled") {
        successes.push(r.value);
      } else {
        errors.push({
          email: leads[idx].email,
          error: String(r.reason).slice(0, 200),
          ok: false,
        });
        console.error(`Generate draft failed for ${leads[idx].email}:`, r.reason);
      }
    });

    if (successes.length === 0) {
      return NextResponse.json(
        { error: `Echec pour tous les leads: ${errors.map((e) => `${e.email}: ${e.error}`).join(" | ")}` },
        { status: 500 }
      );
    }

    const itemsToStore = successes.map((s, idx) => ({
      campaignId,
      dealId: s.dealId,
      leadEmail: s.email,
      leadName: s.name,
      company: s.company,
      subject: s.subject,
      body: s.body,
      status: "draft" as const,
      order: idx + 1,
      scheduledAt: new Date(createdAt + idx * 10 * 60 * 1000).toISOString(),
      lastEmailAt: undefined,
      sentAt: undefined,
      gmailMessageId: undefined,
      gmailThreadId: undefined,
      lastError: undefined,
    }));

    const items = await replaceFollowupItemsForCampaign(campaignId, itemsToStore);
    await updateFollowupCampaign(campaignId, { status: "draft" });

    return NextResponse.json({ data: { items, errors } });
  } catch (error) {
    console.error("POST /api/sequences/affaires/generate error:", error);
    return NextResponse.json(
      { error: `Erreur serveur: ${String(error).slice(0, 300)}` },
      { status: 500 }
    );
  }
}
