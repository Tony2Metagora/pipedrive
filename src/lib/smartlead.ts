/**
 * Smartlead API v1 helper
 * Docs: https://api.smartlead.ai/reference
 */

const BASE = "https://server.smartlead.ai/api/v1";

function apiKey(): string {
  const key = process.env.SMARTLEAD_API_KEY;
  if (!key) throw new Error("SMARTLEAD_API_KEY not set");
  return key;
}

async function sl(path: string, opts?: RequestInit & { params?: Record<string, string> }): Promise<unknown> {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set("api_key", apiKey());
  if (opts?.params) {
    for (const [k, v] of Object.entries(opts.params)) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts?.headers },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Smartlead ${res.status}: ${text.slice(0, 500)}`);
  }
  return res.json();
}

// ─── Campaigns ──────────────────────────────────────────

export interface Campaign {
  id: number;
  name: string;
  status: string;
  created_at: string;
}

export async function listCampaigns(): Promise<Campaign[]> {
  return (await sl("/campaigns")) as Campaign[];
}

export async function getCampaign(id: number): Promise<Campaign> {
  return (await sl(`/campaigns/${id}`)) as Campaign;
}

export async function createCampaign(name: string): Promise<Campaign> {
  return (await sl("/campaigns/create", {
    method: "POST",
    body: JSON.stringify({ name }),
  })) as Campaign;
}

// ─── Campaign Sequences ─────────────────────────────────

export interface SequenceStep {
  seq_number: number;
  seq_delay_details: { delay_in_days: number };
  subject: string;
  email_body: string;
  variant_label?: string;
}

export async function getSequences(campaignId: number): Promise<SequenceStep[]> {
  return (await sl(`/campaigns/${campaignId}/sequences`)) as SequenceStep[];
}

export async function saveSequences(campaignId: number, sequences: { subject: string; email_body: string; seq_number: number; seq_delay_details: { delay_in_days: number } }[]): Promise<unknown> {
  return sl(`/campaigns/${campaignId}/sequences`, {
    method: "POST",
    body: JSON.stringify({ sequences }),
  });
}

// ─── Campaign Schedule ──────────────────────────────────

export async function setCampaignSchedule(campaignId: number, schedule: Record<string, unknown>): Promise<unknown> {
  return sl(`/campaigns/${campaignId}/schedule`, {
    method: "POST",
    body: JSON.stringify(schedule),
  });
}

// ─── Campaign Status ────────────────────────────────────

export async function setCampaignStatus(campaignId: number, status: "START" | "PAUSE" | "STOP"): Promise<unknown> {
  return sl(`/campaigns/${campaignId}/status`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
}

// ─── Leads ──────────────────────────────────────────────

export interface SmartleadLead {
  email: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  custom_fields?: Record<string, string>;
}

export async function addLeadsToCampaign(campaignId: number, leads: SmartleadLead[], settings?: { ignore_global_block_list?: boolean; ignore_unsubscribe_list?: boolean }): Promise<unknown> {
  return sl(`/campaigns/${campaignId}/leads`, {
    method: "POST",
    body: JSON.stringify({
      lead_list: leads,
      settings: settings || { ignore_global_block_list: false, ignore_unsubscribe_list: false },
    }),
  });
}

export async function getCampaignLeads(campaignId: number, offset = 0, limit = 100): Promise<unknown> {
  return sl(`/campaigns/${campaignId}/leads`, {
    params: { offset: String(offset), limit: String(limit) },
  });
}

// ─── Stats ──────────────────────────────────────────────

export interface CampaignStats {
  sent_count: number;
  open_count: number;
  click_count: number;
  reply_count: number;
  bounce_count: number;
  unsubscribe_count: number;
  total_leads: number;
}

export async function getCampaignStats(campaignId: number): Promise<CampaignStats> {
  const data = await sl(`/campaigns/${campaignId}/analytics`);
  return data as CampaignStats;
}

// ─── Email Accounts ─────────────────────────────────────

export interface EmailAccount {
  id: number;
  from_name: string;
  from_email: string;
  type: string;
  is_smtp_success: boolean;
}

export async function listEmailAccounts(): Promise<EmailAccount[]> {
  return (await sl("/email-accounts")) as EmailAccount[];
}

export async function addEmailAccountToCampaign(campaignId: number, emailAccountIds: number[]): Promise<unknown> {
  return sl(`/campaigns/${campaignId}/email-accounts`, {
    method: "POST",
    body: JSON.stringify({ email_account_ids: emailAccountIds }),
  });
}
