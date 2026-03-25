/**
 * Smartlead API v1 helper — full coverage
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
  const { params: _p, ...fetchOpts } = opts || {} as Record<string, unknown>;
  void _p;
  const res = await fetch(url.toString(), {
    ...fetchOpts,
    headers: { "Content-Type": "application/json", ...(fetchOpts as RequestInit)?.headers },
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
  updated_at?: string;
  max_leads_per_day?: number;
  min_time_btwn_emails?: number;
  stop_lead_settings?: string;
  track_settings?: string[];
  scheduler_cron_value?: { tz: string; days: number[]; endHour: string; startHour: string };
  enable_ai_esp_matching?: boolean;
  send_as_plain_text?: boolean;
  follow_up_percentage?: number;
  unsubscribe_text?: string;
}

export async function listCampaigns(): Promise<Campaign[]> {
  return (await sl("/campaigns", { params: { include_tags: "true" } })) as Campaign[];
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

// ─── Campaign Settings ──────────────────────────────────

export interface CampaignSettings {
  track_settings?: string[];
  stop_lead_settings?: string;
  max_leads_per_day?: number;
  min_time_btwn_emails?: number;
  enable_ai_esp_matching?: boolean;
  send_as_plain_text?: boolean;
  follow_up_percentage?: number;
  unsubscribe_text?: string;
}

export async function updateCampaignSettings(campaignId: number, settings: CampaignSettings): Promise<unknown> {
  return sl(`/campaigns/${campaignId}/settings`, {
    method: "POST",
    body: JSON.stringify(settings),
  });
}

// ─── Campaign Schedule ──────────────────────────────────

export interface CampaignSchedule {
  timezone?: string;
  days_of_the_week?: number[];
  start_hour?: string;
  end_hour?: string;
  min_time_btw_emails?: number;
  max_new_leads_per_day?: number;
}

export async function getCampaignSchedule(campaignId: number): Promise<unknown> {
  return sl(`/campaigns/${campaignId}/schedule`);
}

export async function setCampaignSchedule(campaignId: number, schedule: CampaignSchedule): Promise<unknown> {
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

// ─── Campaign Sequences ─────────────────────────────────

export interface SequenceStep {
  seq_number: number;
  seq_delay_details: { delay_in_days: number };
  subject: string;
  email_body: string;
  variant_label?: string;
}

export async function getSequences(campaignId: number): Promise<SequenceStep[]> {
  const raw = (await sl(`/campaigns/${campaignId}/sequences`)) as Record<string, unknown>[];
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => {
    // Normalize seq_delay_details (may be string JSON or object or missing)
    let delay = { delay_in_days: 0 };
    if (s.seq_delay_details) {
      if (typeof s.seq_delay_details === "string") {
        try { delay = JSON.parse(s.seq_delay_details); } catch { /* keep default */ }
      } else if (typeof s.seq_delay_details === "object") {
        delay = s.seq_delay_details as { delay_in_days: number };
      }
    }
    // Extract subject/email_body from variants if not at top level
    let subject = (s.subject as string) || "";
    let emailBody = (s.email_body as string) || "";
    const variants = s.variants as { subject?: string; email_body?: string; variant_label?: string }[] | undefined;
    if ((!subject || !emailBody) && Array.isArray(variants) && variants.length > 0) {
      subject = subject || variants[0].subject || "";
      emailBody = emailBody || variants[0].email_body || "";
    }
    return {
      seq_number: (s.seq_number as number) || 0,
      seq_delay_details: delay,
      subject,
      email_body: emailBody,
      variant_label: (s.variant_label as string) || (variants?.[0]?.variant_label as string) || undefined,
    };
  });
}

export async function saveSequences(campaignId: number, sequences: { subject: string; email_body: string; seq_number: number; seq_delay_details: { delay_in_days: number } }[]): Promise<unknown> {
  // Smartlead API expects a raw array with variants[] format
  const formatted = sequences.map((s) => ({
    id: null,
    seq_number: s.seq_number,
    seq_delay_details: { delay_in_days: Number(s.seq_delay_details?.delay_in_days) || 0 },
    variant_distribution_type: "MANUALLY_EQUAL",
    variants: [
      {
        id: null,
        subject: s.subject,
        email_body: s.email_body,
        variant_label: "A",
      },
    ],
  }));
  console.log("[saveSequences] campaignId:", campaignId, "payload:", JSON.stringify(formatted, null, 2));
  const result = await sl(`/campaigns/${campaignId}/sequences`, {
    method: "POST",
    body: JSON.stringify(formatted),
  });
  console.log("[saveSequences] response:", JSON.stringify(result));
  return result;
}

// ─── Leads ──────────────────────────────────────────────

export interface SmartleadLead {
  email: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  phone_number?: string;
  website?: string;
  location?: string;
  linkedin_profile?: string;
  company_url?: string;
  custom_fields?: Record<string, string>;
}

export type LeadStatus = "STARTED" | "INPROGRESS" | "COMPLETED" | "PAUSED" | "STOPPED";
export type EmailStatus = "is_opened" | "is_clicked" | "is_replied" | "is_bounced" | "is_unsubscribed" | "is_spam" | "is_accepted" | "not_replied" | "is_sender_bounced";

export interface CampaignLeadEntry {
  campaign_lead_map_id: number;
  lead_category_id: number | null;
  status: string;
  created_at: string;
  lead: {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    phone_number: string | null;
    company_name: string | null;
    website: string | null;
    location: string | null;
    linkedin_profile: string | null;
    company_url: string | null;
    custom_fields: Record<string, string> | null;
    is_unsubscribed: boolean;
  };
}

export interface CampaignLeadsResponse {
  total_leads: string;
  offset: number;
  limit: number;
  data: CampaignLeadEntry[];
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

export async function getCampaignLeads(
  campaignId: number,
  offset = 0,
  limit = 100,
  filters?: { status?: LeadStatus; emailStatus?: EmailStatus }
): Promise<CampaignLeadsResponse> {
  const params: Record<string, string> = { offset: String(offset), limit: String(limit) };
  if (filters?.status) params.status = filters.status;
  if (filters?.emailStatus) params.emailStatus = filters.emailStatus;
  return (await sl(`/campaigns/${campaignId}/leads`, { params })) as CampaignLeadsResponse;
}

// ─── Lead Message History ───────────────────────────────

export interface LeadMessageEntry {
  type: string;
  time: string;
  message_id?: string;
  email_body?: string;
  subject?: string;
  from_email?: string;
}

export async function getLeadMessageHistory(campaignId: number, leadId: number): Promise<LeadMessageEntry[]> {
  const data = await sl(`/campaigns/${campaignId}/leads/${leadId}/message-history`);
  return (Array.isArray(data) ? data : []) as LeadMessageEntry[];
}

// ─── Stats / Analytics ──────────────────────────────────

export interface CampaignAnalytics {
  id?: number;
  campaign_id?: number;
  sent_count: number;
  unique_sent_count?: number;
  open_count: number;
  unique_open_count?: number;
  click_count: number;
  unique_click_count?: number;
  reply_count: number;
  unique_reply_count?: number;
  bounce_count: number;
  total_leads: number;
  unsubscribe_count?: number;
}

export async function getCampaignAnalytics(campaignId: number): Promise<CampaignAnalytics> {
  const data = await sl(`/campaigns/${campaignId}/analytics`);
  return data as CampaignAnalytics;
}

export async function getCampaignAnalyticsByDate(campaignId: number, startDate: string, endDate: string): Promise<unknown> {
  return sl(`/campaigns/${campaignId}/analytics-by-date`, {
    params: { start_date: startDate, end_date: endDate },
  });
}

// ─── Email Accounts ─────────────────────────────────────

export interface EmailAccount {
  id: number;
  from_name: string;
  from_email: string;
  type: string;
  is_smtp_success: boolean;
  is_imap_success?: boolean;
  message_per_day?: number;
  daily_sent_count?: number;
  campaign_count?: number;
  warmup_details?: {
    status: string;
    total_sent_count: number;
    total_spam_count: number;
    warmup_reputation: string;
    reply_rate?: number;
  };
}

export async function listEmailAccounts(): Promise<EmailAccount[]> {
  return (await sl("/email-accounts")) as EmailAccount[];
}

export async function getCampaignEmailAccounts(campaignId: number): Promise<EmailAccount[]> {
  return (await sl(`/campaigns/${campaignId}/email-accounts`)) as EmailAccount[];
}

export async function addEmailAccountsToCampaign(campaignId: number, emailAccountIds: number[]): Promise<unknown> {
  return sl(`/campaigns/${campaignId}/email-accounts`, {
    method: "POST",
    body: JSON.stringify({ email_account_ids: emailAccountIds }),
  });
}

export async function removeEmailAccountsFromCampaign(campaignId: number, emailAccountIds: number[]): Promise<unknown> {
  return sl(`/campaigns/${campaignId}/email-accounts`, {
    method: "DELETE",
    body: JSON.stringify({ email_account_ids: emailAccountIds }),
  });
}

// ─── Create Email Account ──────────────────────────────

export interface CreateEmailAccountPayload {
  from_name: string;
  from_email: string;
  user_name: string;
  password: string;
  smtp_host: string;
  smtp_port: number;
  imap_host: string;
  imap_port: number;
  type?: "GMAIL" | "OUTLOOK" | "SMTP";
  max_email_per_day?: number;
  warmup_enabled?: boolean;
  total_warmup_per_day?: number;
  daily_rampup?: number;
}

export async function createEmailAccount(payload: CreateEmailAccountPayload): Promise<unknown> {
  return sl("/email-accounts/save", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ─── Warmup ────────────────────────────────────────────

export interface WarmupDayStat {
  date: string;
  sent: number;
  spam: number;
  delivered: number;
  opened: number;
  replied: number;
}

export interface WarmupStats {
  total_sent: number;
  spam_count: number;
  reputation_score: number;
  daily_stats: WarmupDayStat[];
}

export interface WarmupSettings {
  warmup_enabled?: boolean;
  total_warmup_per_day?: number;
  daily_rampup?: number;
  reply_rate_percentage?: number;
  auto_adjust_warmup?: boolean;
  is_rampup_enabled?: boolean;
}

export async function getWarmupStats(emailAccountId: number): Promise<WarmupStats> {
  return (await sl(`/email-accounts/${emailAccountId}/warmup-stats`)) as WarmupStats;
}

export async function updateWarmupSettings(emailAccountId: number, settings: WarmupSettings): Promise<unknown> {
  return sl(`/email-accounts/${emailAccountId}/warmup`, {
    method: "POST",
    body: JSON.stringify(settings),
  });
}

// ─── Webhooks ───────────────────────────────────────────

export async function getCampaignWebhooks(campaignId: number): Promise<unknown> {
  return sl(`/campaigns/${campaignId}/webhooks`);
}

// ─── Global Lead Lookup ─────────────────────────────────

export async function getLeadByEmail(email: string): Promise<unknown> {
  return sl("/leads", { params: { email } });
}
