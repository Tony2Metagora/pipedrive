import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import {
  getCampaign,
  getCampaignStats,
  getSequences,
  saveSequences,
  getCampaignLeads,
  addLeadsToCampaign,
  addEmailAccountToCampaign,
  setCampaignStatus,
  type SmartleadLead,
} from "@/lib/smartlead";

/** GET /api/sequences/[id] — campaign detail + stats + sequences + leads */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth("sequences" as never, "GET");
  if (guard.denied) return guard.denied;

  try {
    const { id } = await params;
    const campaignId = Number(id);
    const [campaign, stats, sequences, leads] = await Promise.allSettled([
      getCampaign(campaignId),
      getCampaignStats(campaignId),
      getSequences(campaignId),
      getCampaignLeads(campaignId, 0, 100),
    ]);

    return NextResponse.json({
      campaign: campaign.status === "fulfilled" ? campaign.value : null,
      stats: stats.status === "fulfilled" ? stats.value : null,
      sequences: sequences.status === "fulfilled" ? sequences.value : [],
      leads: leads.status === "fulfilled" ? leads.value : [],
    });
  } catch (error) {
    console.error("GET /api/sequences/[id] error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

/** POST /api/sequences/[id] — actions: add-leads, save-sequences, set-email-accounts, set-status */
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
      case "set-email-accounts": {
        const { email_account_ids } = body as { email_account_ids: number[] };
        if (!email_account_ids?.length) return NextResponse.json({ error: "email_account_ids[] requis" }, { status: 400 });
        const result = await addEmailAccountToCampaign(campaignId, email_account_ids);
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
