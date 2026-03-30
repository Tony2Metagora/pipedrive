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
  delayMinutes?: number;
  delayDays?: number;
  subject: string;
  body: string;
}

interface LeadStepInput {
  step: number;
  enabled: boolean;
  delayMinutes?: number;
  delayDays?: number;
  subject: string;
  body: string;
}

interface LeadSequenceInput {
  email: string;
  name?: string;
  company?: string;
  dealId?: number | null;
  steps: LeadStepInput[];
}

function sanitizeTemplateText(raw: string, lead: { name?: string; email?: string; company?: string }): string {
  const prenomRaw = (lead.name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)[0] || "";
  const prenom = prenomRaw ? prenomRaw.charAt(0).toUpperCase() + prenomRaw.slice(1) : "";
  return (raw || "")
    .replace(/\{+\s*pr[ée]nom\s*\}+/gi, prenom)
    .replace(/\{+\s*email\s*\}+/gi, lead.email || "")
    .replace(/\{+\s*entreprise\s*\}+/gi, lead.company || "");
}

function toDelayMinutes(input: { delayMinutes?: number; delayDays?: number }): number {
  if (typeof input.delayDays === "number") {
    return Math.max(0, Number(input.delayDays) || 0) * 24 * 60;
  }
  return Math.max(0, Number(input.delayMinutes) || 0);
}

function addBusinessDays(date: Date, businessDays: number): Date {
  let remaining = Math.max(0, Math.floor(businessDays || 0));
  if (remaining === 0) return new Date(date.getTime());

  const d = new Date(date.getTime());
  // Work in UTC to avoid DST surprises.
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay(); // 0=Sun, 6=Sat
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return d;
}

export async function POST(request: Request) {
  const guard = await requireAuth("sequences", "POST");
  if (guard.denied) return guard.denied;
  try {
    const body = (await request.json()) as {
      campaignId?: number;
      leads?: SeriesLeadInput[];
      templates?: SeriesTemplateInput[];
      leadSequences?: LeadSequenceInput[];
    };
    const campaignId = Number(body.campaignId);
    if (!Number.isFinite(campaignId)) {
      return NextResponse.json({ error: "campaignId requis" }, { status: 400 });
    }
    const leadSequences = body.leadSequences || [];
    const usePerLead = leadSequences.length > 0;
    const leads = body.leads || [];
    if (!usePerLead && !leads.length) return NextResponse.json({ error: "leads[] requis" }, { status: 400 });
    const templates = (body.templates || []).filter((t) => t.enabled).sort((a, b) => a.step - b.step);
    if (!usePerLead && !templates.length) {
      return NextResponse.json({ error: "Aucun mail actif dans la serie" }, { status: 400 });
    }
    if (usePerLead) {
      const valid = leadSequences.every((ls) => Array.isArray(ls.steps) && ls.steps.some((s) => s.enabled));
      if (!valid) {
        return NextResponse.json({ error: "Chaque lead doit avoir au moins un mail actif" }, { status: 400 });
      }
    }

    const campaign = await getFollowupCampaign(campaignId);
    if (!campaign) return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });

    let order = 1;
    const now = Date.now();
    const items = usePerLead
      ? leadSequences.flatMap((lead, leadIdx) => {
          const steps = lead.steps.filter((s) => s.enabled).sort((a, b) => a.step - b.step);
          const totalSteps = steps.length;

          const base = new Date(now + leadIdx * 10 * 60 * 1000).toISOString();
          let prevScheduledAt = new Date(base);

          return steps.map((step, stepIdx) => {
            const delayBusinessDays = typeof step.delayDays === "number"
              ? Math.max(0, Number(step.delayDays) || 0)
              : typeof step.delayMinutes === "number"
                ? Math.max(0, Math.round(Number(step.delayMinutes) / (24 * 60)) || 0)
                : 0;

            const delayAfterPreviousMinutes = delayBusinessDays * 24 * 60;
            const scheduledAt = stepIdx === 0 ? prevScheduledAt : addBusinessDays(prevScheduledAt, delayBusinessDays);
            prevScheduledAt = scheduledAt;

            const subject = sanitizeTemplateText(step.subject, lead);
            const body = sanitizeTemplateText(step.body, lead);
            return {
              campaignId,
              dealId: lead.dealId ?? null,
              leadEmail: lead.email,
              leadName: lead.name || "",
              company: lead.company || "",
              sequenceStep: step.step,
              totalSteps,
              delayAfterPreviousMinutes,
              delayAfterPreviousBusinessDays: delayBusinessDays,
              subject: subject || `Suivi ${step.step} - ${lead.company || lead.name || lead.email}`,
              body: body || "Bonjour,\n\nJe me permets de revenir vers vous.\n\nTony",
              status: "draft" as const,
              order: order++,
              scheduledAt: scheduledAt.toISOString(),
              lastEmailAt: undefined,
              sentAt: undefined,
              gmailMessageId: undefined,
              gmailThreadId: undefined,
              lastError: undefined,
            };
          });
        })
      : leads.flatMap((lead, leadIdx) => {
          const totalSteps = templates.length;
          const base = new Date(now + leadIdx * 10 * 60 * 1000);
          let prevScheduledAt = new Date(base);
          return templates.map((tpl, stepIdx) => {
            const delayBusinessDays = typeof tpl.delayDays === "number"
              ? Math.max(0, Number(tpl.delayDays) || 0)
              : typeof tpl.delayMinutes === "number"
                ? Math.max(0, Math.round(Number(tpl.delayMinutes) / (24 * 60)) || 0)
                : 0;
            const delayAfterPreviousMinutes = delayBusinessDays * 24 * 60;
            const isStep1 = tpl.step === 1;
            const subject = isStep1 && lead.step1Subject
              ? lead.step1Subject
              : sanitizeTemplateText(tpl.subject, lead);
            const body = isStep1 && lead.step1Body
              ? lead.step1Body
              : sanitizeTemplateText(tpl.body, lead);

            const scheduledAt = stepIdx === 0 ? prevScheduledAt : addBusinessDays(prevScheduledAt, delayBusinessDays);
            prevScheduledAt = scheduledAt;

            return {
              campaignId,
              dealId: lead.dealId ?? null,
              leadEmail: lead.email,
              leadName: lead.name || "",
              company: lead.company || "",
              sequenceStep: tpl.step,
              totalSteps,
              delayAfterPreviousMinutes,
              delayAfterPreviousBusinessDays: delayBusinessDays,
              subject: subject || `Suivi ${tpl.step} - ${lead.company || lead.name || lead.email}`,
              body: body || "Bonjour,\n\nJe me permets de revenir vers vous.\n\nTony",
              status: "draft" as const,
              order: order++,
              scheduledAt: scheduledAt.toISOString(),
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
    return NextResponse.json({ data: { items: stored, totalLeads: usePerLead ? leadSequences.length : leads.length } });
  } catch (error) {
    console.error("POST /api/sequences/affaires/series error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

