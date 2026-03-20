import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import {
  getCampaign,
  getCampaignAnalytics,
  getSequences,
  saveSequences,
  getCampaignLeads,
  addLeadsToCampaign,
  addEmailAccountsToCampaign,
  removeEmailAccountsFromCampaign,
  getCampaignEmailAccounts,
  setCampaignStatus,
  updateCampaignSettings,
  setCampaignSchedule,
  getLeadMessageHistory,
  type SmartleadLead,
  type LeadStatus,
  type EmailStatus,
  type CampaignSettings,
  type CampaignSchedule,
} from "@/lib/smartlead";

/** GET /api/sequences/[id] — campaign detail + stats + sequences + leads + campaign email accounts */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth("sequences" as never, "GET");
  if (guard.denied) return guard.denied;

  try {
    const { id } = await params;
    const campaignId = Number(id);
    const url = new URL(req.url);

    // Lead filters
    const leadStatus = url.searchParams.get("leadStatus") as LeadStatus | null;
    const emailStatus = url.searchParams.get("emailStatus") as EmailStatus | null;
    const leadOffset = Number(url.searchParams.get("leadOffset") || "0");
    const leadLimit = Number(url.searchParams.get("leadLimit") || "100");

    // Lead message history
    const leadIdParam = url.searchParams.get("leadId");
    if (leadIdParam) {
      const messages = await getLeadMessageHistory(campaignId, Number(leadIdParam));
      return NextResponse.json({ messages });
    }

    const [campaign, stats, sequences, leads, campaignAccounts] = await Promise.allSettled([
      getCampaign(campaignId),
      getCampaignAnalytics(campaignId),
      getSequences(campaignId),
      getCampaignLeads(campaignId, leadOffset, leadLimit, {
        status: leadStatus || undefined,
        emailStatus: emailStatus || undefined,
      }),
      getCampaignEmailAccounts(campaignId),
    ]);

    return NextResponse.json({
      campaign: campaign.status === "fulfilled" ? campaign.value : null,
      stats: stats.status === "fulfilled" ? stats.value : null,
      sequences: sequences.status === "fulfilled" ? sequences.value : [],
      leads: leads.status === "fulfilled" ? leads.value : { total_leads: "0", offset: 0, limit: 100, data: [] },
      campaignAccounts: campaignAccounts.status === "fulfilled" ? campaignAccounts.value : [],
    });
  } catch (error) {
    console.error("GET /api/sequences/[id] error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

/** POST /api/sequences/[id] — all campaign actions */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth("sequences" as never, "POST");
  if (guard.denied) return guard.denied;

  try {
    const { id } = await params;
    const campaignId = Number(id);
    const body = await request.json();
    const { action } = body as { action: string };

    switch (action) {
      case "add-leads": {
        const { leads } = body as { leads: SmartleadLead[] };
        if (!leads?.length) return NextResponse.json({ error: "leads[] requis" }, { status: 400 });
        const result = await addLeadsToCampaign(campaignId, leads);
        return NextResponse.json({ success: true, result });
      }
      case "save-sequences": {
        const { sequences } = body as { sequences: { subject: string; email_body: string; seq_number: number; seq_delay_details: { delay_in_days: number } }[] };
        if (!sequences?.length) return NextResponse.json({ error: "sequences[] requis" }, { status: 400 });
        const result = await saveSequences(campaignId, sequences);
        return NextResponse.json({ success: true, result });
      }
      case "add-email-accounts": {
        const { email_account_ids } = body as { email_account_ids: number[] };
        if (!email_account_ids?.length) return NextResponse.json({ error: "email_account_ids[] requis" }, { status: 400 });
        const result = await addEmailAccountsToCampaign(campaignId, email_account_ids);
        return NextResponse.json({ success: true, result });
      }
      case "remove-email-accounts": {
        const { email_account_ids } = body as { email_account_ids: number[] };
        if (!email_account_ids?.length) return NextResponse.json({ error: "email_account_ids[] requis" }, { status: 400 });
        const result = await removeEmailAccountsFromCampaign(campaignId, email_account_ids);
        return NextResponse.json({ success: true, result });
      }
      case "update-settings": {
        const { settings } = body as { settings: CampaignSettings };
        const result = await updateCampaignSettings(campaignId, settings);
        return NextResponse.json({ success: true, result });
      }
      case "set-schedule": {
        const { schedule } = body as { schedule: CampaignSchedule };
        const result = await setCampaignSchedule(campaignId, schedule);
        return NextResponse.json({ success: true, result });
      }
      case "set-status": {
        const { status } = body as { status: "START" | "PAUSE" | "STOP" };
        if (!status) return NextResponse.json({ error: "status requis" }, { status: 400 });
        const result = await setCampaignStatus(campaignId, status);
        return NextResponse.json({ success: true, result });
      }
      default:
        return NextResponse.json({ error: `Action inconnue: ${action}` }, { status: 400 });
    }
  } catch (error) {
    console.error("POST /api/sequences/[id] error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
