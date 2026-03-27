import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import { getFollowupCampaign, replaceFollowupItemsForCampaign, updateFollowupCampaign } from "@/lib/followup-store";

interface SeriesLeadInput {
  email: string;
  name?: string;
  company?: string;
  dealId?: number | null;
  step1Subject?: string;
  step1Body?: string;
}

interface SeriesTemplateInput {
  step: number;
  enabled: boolean;
  delayMinutes: number;
  subject: string;
  body: string;
}

function sanitizeTemplateText(raw: string, lead: SeriesLeadInput): string {
  return (raw || "")
    .replace(/\{\{\s*prenom\s*\}\}/gi, lead.name || "")
    .replace(/\{\{\s*email\s*\}\}/gi, lead.email || "")
    .replace(/\{\{\s*entreprise\s*\}\}/gi, lead.company || "");
}

export async function POST(request: Request) {
  const guard = await requireAuth("sequences", "POST");
  if (guard.denied) return guard.denied;
  try {
    const body = (await request.json()) as {
      campaignId?: number;
      leads?: SeriesLeadInput[];
      templates?: SeriesTemplateInput[];
    };
    const campaignId = Number(body.campaignId);
    if (!Number.isFinite(campaignId)) {
      return NextResponse.json({ error: "campaignId requis" }, { status: 400 });
    }
    const leads = body.leads || [];
    if (!leads.length) return NextResponse.json({ error: "leads[] requis" }, { status: 400 });
    const templates = (body.templates || [])
      .filter((t) => t.enabled)
      .sort((a, b) => a.step - b.step);
    if (!templates.length) {
      return NextResponse.json({ error: "Aucun mail actif dans la serie" }, { status: 400 });
    }

    const campaign = await getFollowupCampaign(campaignId);
    if (!campaign) return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });

    const totalSteps = templates.length;
    let order = 1;
    const now = Date.now();
    const items = leads.flatMap((lead, leadIdx) => {
      let cumulativeDelay = 0;
      return templates.map((tpl) => {
        cumulativeDelay += Math.max(0, Number(tpl.delayMinutes) || 0);
        const isStep1 = tpl.step === 1;
        const subject = isStep1 && lead.step1Subject
          ? lead.step1Subject
          : sanitizeTemplateText(tpl.subject, lead);
        const body = isStep1 && lead.step1Body
          ? lead.step1Body
          : sanitizeTemplateText(tpl.body, lead);
        return {
          campaignId,
          dealId: lead.dealId ?? null,
          leadEmail: lead.email,
          leadName: lead.name || "",
          company: lead.company || "",
          sequenceStep: tpl.step,
          totalSteps,
          delayAfterPreviousMinutes: Math.max(0, Number(tpl.delayMinutes) || 0),
          subject: subject || `Suivi ${tpl.step} - ${lead.company || lead.name || lead.email}`,
          body: body || "Bonjour,\n\nJe me permets de revenir vers vous.\n\nTony",
          status: "draft" as const,
          order: order++,
          scheduledAt: new Date(now + (leadIdx * 10 + cumulativeDelay) * 60 * 1000).toISOString(),
          lastEmailAt: undefined,
          sentAt: undefined,
          gmailMessageId: undefined,
          gmailThreadId: undefined,
          lastError: undefined,
        };
      });
    });

    const stored = await replaceFollowupItemsForCampaign(campaignId, items);
    await updateFollowupCampaign(campaignId, { status: "draft" });
    return NextResponse.json({ data: { items: stored, totalSteps, totalLeads: leads.length } });
  } catch (error) {
    console.error("POST /api/sequences/affaires/series error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

