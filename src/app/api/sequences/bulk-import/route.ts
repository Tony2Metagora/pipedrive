/**
 * API Route — Bulk Import Prospects → Smartlead Campaigns
 *
 * Creates N sub-campaigns (1 per email account), splits leads evenly,
 * assigns sequences, settings, schedule, and optionally starts them.
 *
 * POST /api/sequences/bulk-import
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import { readBlob, writeBlob, withLock } from "@/lib/blob-store";
import {
  createCampaign,
  addEmailAccountsToCampaign,
  addLeadsToCampaign,
  saveSequences,
  updateCampaignSettings,
  setCampaignSchedule,
  setCampaignStatus,
  type SmartleadLead,
} from "@/lib/smartlead";

// ─── Types ──────────────────────────────────────────────

interface ProspectRow {
  id: string;
  email: string;
  prenom: string;
  nom: string;
  entreprise: string;
  telephone?: string;
  linkedin?: string;
  ville?: string;
  poste?: string;
  ai_score?: string;
  list_id?: string;
  [key: string]: unknown;
}

interface SequenceStep {
  seq_number: number;
  seq_delay_details: { delay_in_days: number };
  subject: string;
  email_body: string;
}

interface BulkImportRequest {
  campaignPrefix: string;
  prospectIds: string[];
  emailAccountIds: number[];
  maxLeadsPerDayPerAccount: Record<number, number>;
  sequences: SequenceStep[];
  schedule: {
    timezone: string;
    days_of_the_week: number[];
    start_hour: string;
    end_hour: string;
  };
  stopLeadSettings: string;
  autoStart: boolean;
}

interface CampaignGroup {
  id: string;
  name: string;
  created_at: string;
  prospect_list_id: string;
  campaign_ids: number[];
  email_account_map: Record<number, number>;
  total_leads: number;
  leads_per_campaign: Record<number, number>;
}

interface CampaignResult {
  campaignId: number;
  campaignName: string;
  accountId: number;
  accountEmail?: string;
  leadCount: number;
  status: "success" | "error";
  error?: string;
}

// ─── Helpers ────────────────────────────────────────────

/** Fisher-Yates shuffle */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Split array into N roughly equal chunks */
function splitIntoChunks<T>(arr: T[], n: number): T[][] {
  const chunks: T[][] = Array.from({ length: n }, () => []);
  arr.forEach((item, i) => chunks[i % n].push(item));
  return chunks;
}

/** Map prospect to SmartleadLead */
function toSmartleadLead(p: ProspectRow): SmartleadLead {
  return {
    email: p.email,
    first_name: p.prenom || undefined,
    last_name: p.nom || undefined,
    company_name: p.entreprise || undefined,
    phone_number: p.telephone || undefined,
    linkedin_profile: p.linkedin || undefined,
    location: p.ville || undefined,
    custom_fields: p.poste ? { title: p.poste } : undefined,
  };
}

// ─── Route ──────────────────────────────────────────────

export async function POST(request: Request) {
  const guard = await requireAuth("sequences" as never, "POST");
  if (guard.denied) return guard.denied;

  try {
    const body = (await request.json()) as BulkImportRequest;
    const {
      campaignPrefix,
      prospectIds,
      emailAccountIds,
      maxLeadsPerDayPerAccount,
      sequences,
      schedule,
      stopLeadSettings,
      autoStart,
    } = body;

    // Validation
    if (!campaignPrefix?.trim()) {
      return NextResponse.json({ error: "Nom de campagne requis" }, { status: 400 });
    }
    if (!prospectIds?.length) {
      return NextResponse.json({ error: "Aucun prospect sélectionné" }, { status: 400 });
    }
    if (!emailAccountIds?.length) {
      return NextResponse.json({ error: "Aucun compte email sélectionné" }, { status: 400 });
    }
    if (!sequences?.length) {
      return NextResponse.json({ error: "Séquence email requise" }, { status: 400 });
    }

    // 1. Load prospects
    const allProspects = await readBlob<ProspectRow>("prospects.json");
    const idSet = new Set(prospectIds.map(String));
    const prospects = allProspects.filter(
      (p) => idSet.has(String(p.id)) && p.email?.trim()
    );

    if (prospects.length === 0) {
      return NextResponse.json({ error: "Aucun prospect avec email trouvé" }, { status: 400 });
    }

    // 2. Shuffle and split
    const shuffled = shuffle(prospects);
    const chunks = splitIntoChunks(shuffled, emailAccountIds.length);

    // 3. Create campaigns in parallel
    const results: CampaignResult[] = [];
    const campaignIds: number[] = [];
    const emailAccountMap: Record<number, number> = {};
    const leadsPerCampaign: Record<number, number> = {};

    const campaignPromises = emailAccountIds.map(async (accountId, idx) => {
      const chunk = chunks[idx];
      if (chunk.length === 0) {
        results.push({
          campaignId: 0,
          campaignName: "",
          accountId,
          leadCount: 0,
          status: "error",
          error: "Aucun lead assigné (plus de comptes que de leads)",
        });
        return;
      }

      const campaignName = emailAccountIds.length === 1
        ? campaignPrefix.trim()
        : `${campaignPrefix.trim()} #${idx + 1}`;

      try {
        // Create campaign
        const campaign = await createCampaign(campaignName);
        const campaignId = campaign.id;
        campaignIds.push(campaignId);
        emailAccountMap[campaignId] = accountId;
        leadsPerCampaign[campaignId] = chunk.length;

        // Assign email account
        await addEmailAccountsToCampaign(campaignId, [accountId]);

        // Import leads
        const leads = chunk.map(toSmartleadLead);
        await addLeadsToCampaign(campaignId, leads);

        // Save sequences
        await saveSequences(campaignId, sequences);

        // Settings
        const maxPerDay = maxLeadsPerDayPerAccount[accountId] || 10;
        await updateCampaignSettings(campaignId, {
          max_leads_per_day: maxPerDay,
          stop_lead_settings: stopLeadSettings || "REPLY_TO_AN_EMAIL",
          enable_ai_esp_matching: true,
          track_settings: ["DONT_TRACK_EMAIL_OPEN"],
        });

        // Schedule
        await setCampaignSchedule(campaignId, {
          timezone: schedule?.timezone || "Europe/Paris",
          days_of_the_week: schedule?.days_of_the_week || [1, 2, 3, 4, 5],
          start_hour: schedule?.start_hour || "09:00",
          end_hour: schedule?.end_hour || "18:00",
          min_time_btw_emails: 8,
          max_new_leads_per_day: maxPerDay,
        });

        // Auto-start
        if (autoStart) {
          await setCampaignStatus(campaignId, "START");
        }

        results.push({
          campaignId,
          campaignName,
          accountId,
          leadCount: chunk.length,
          status: "success",
        });
      } catch (err) {
        console.error(`[Bulk Import] Campaign #${idx + 1} failed:`, err);
        results.push({
          campaignId: 0,
          campaignName,
          accountId,
          leadCount: chunk.length,
          status: "error",
          error: String(err).slice(0, 300),
        });
      }
    });

    await Promise.all(campaignPromises);

    // 4. Save campaign group
    const successCampaigns = results.filter((r) => r.status === "success");
    if (successCampaigns.length > 0) {
      const group: CampaignGroup = {
        id: `grp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: campaignPrefix.trim(),
        created_at: new Date().toISOString(),
        prospect_list_id: "",
        campaign_ids: successCampaigns.map((r) => r.campaignId),
        email_account_map: emailAccountMap,
        total_leads: prospects.length,
        leads_per_campaign: leadsPerCampaign,
      };

      await withLock("campaign-groups", async () => {
        const groups = await readBlob<CampaignGroup>("campaign-groups");
        groups.push(group);
        await writeBlob("campaign-groups", groups);
      });
    }

    const successCount = successCampaigns.length;
    const errorCount = results.filter((r) => r.status === "error").length;

    console.log(
      `[Bulk Import] Done: ${successCount} campaigns created, ${errorCount} errors, ${prospects.length} total leads`
    );

    return NextResponse.json({
      success: errorCount === 0,
      totalLeads: prospects.length,
      campaignsCreated: successCount,
      campaignsFailed: errorCount,
      results,
    });
  } catch (error) {
    console.error("[Bulk Import] Unexpected error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
