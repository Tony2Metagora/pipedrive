import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import {
  getCampaignAnalytics,
  getCampaignAnalyticsByDate,
  listCampaigns,
} from "@/lib/smartlead";
import { estimateNextSendAtFromSchedule } from "@/lib/date-paris";
import {
  listFollowupCampaigns,
  listFollowupItemsByCampaign,
  type FollowupItem,
} from "@/lib/followup-store";

type PeriodKey = "7d" | "30d" | "month";

function resolvePeriod(period: string | null): { key: PeriodKey; start: string; end: string } {
  const now = new Date();
  const key: PeriodKey = period === "30d" || period === "month" ? period : "7d";
  const end = now.toISOString().slice(0, 10);
  if (key === "month") {
    const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return { key, start: startDate.toISOString().slice(0, 10), end };
  }
  const days = key === "30d" ? 29 : 6;
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { key, start: startDate.toISOString().slice(0, 10), end };
}

function toNumber(input: unknown): number {
  const n = Number(input);
  return Number.isFinite(n) ? n : 0;
}

function aggregateDateAnalytics(raw: unknown): { sent: number; opened: number; replied: number; bounced: number } {
  const payload = raw as Record<string, unknown> | unknown[];
  const rows: Record<string, unknown>[] = Array.isArray(payload)
    ? (payload as Record<string, unknown>[])
    : Array.isArray((payload as Record<string, unknown>)?.data)
      ? ((payload as Record<string, unknown>).data as Record<string, unknown>[])
      : [];
  if (rows.length === 0) return { sent: 0, opened: 0, replied: 0, bounced: 0 };
  return rows.reduce<{ sent: number; opened: number; replied: number; bounced: number }>(
    (acc, row) => {
      const r = row as Record<string, unknown>;
      acc.sent += toNumber(r.sent_count ?? r.sent ?? r.total_sent);
      acc.opened += toNumber(r.open_count ?? r.opened ?? r.total_open);
      acc.replied += toNumber(r.reply_count ?? r.replied ?? r.total_reply);
      acc.bounced += toNumber(r.bounce_count ?? r.bounced ?? r.total_bounce);
      return acc;
    },
    { sent: 0, opened: 0, replied: 0, bounced: 0 }
  );
}

function isDateInRange(input: string | undefined, start: Date, end: Date): boolean {
  if (!input) return false;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return false;
  return d >= start && d <= end;
}

function computeAffairesCampaignStats(items: FollowupItem[], start: Date, end: Date) {
  const sent_count = items.filter((i) => isDateInRange(i.sentAt, start, end)).length;
  const reply_count = items.filter(
    (i) => i.status === "repondu" && isDateInRange(i.updatedAt, start, end)
  ).length;
  const nextSendAt = items
    .filter((item) => item.status === "a_envoyer" || item.status === "en_cours")
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0]
    ?.scheduledAt || null;
  return { sent_count, reply_count, nextSendAt };
}

export async function GET(request: Request) {
  const guard = await requireAuth("sequences", "GET");
  if (guard.denied) return guard.denied;

  try {
    const url = new URL(request.url);
    const period = resolvePeriod(url.searchParams.get("period"));
    const startDate = new Date(`${period.start}T00:00:00.000Z`);
    const endDate = new Date(`${period.end}T23:59:59.999Z`);

    const smartleadCampaigns = await listCampaigns();
    const smartleadRows = await Promise.all(
      smartleadCampaigns.map(async (campaign) => {
        try {
          const periodRaw = await getCampaignAnalyticsByDate(campaign.id, period.start, period.end);
          const agg = aggregateDateAnalytics(periodRaw);
          const nextSendAt = ["STARTED", "ACTIVE"].includes((campaign.status || "").toUpperCase())
            ? estimateNextSendAtFromSchedule(campaign.scheduler_cron_value || null)
            : null;
          return {
            id: campaign.id,
            name: campaign.name,
            status: campaign.status,
            nextSendAt,
            sent_count: agg.sent,
            open_count: agg.opened,
            reply_count: agg.replied,
            bounce_count: agg.bounced,
            openMeasured: true,
          };
        } catch {
          const lifetime = await getCampaignAnalytics(campaign.id).catch(() => null);
          return {
            id: campaign.id,
            name: campaign.name,
            status: campaign.status,
            nextSendAt: null,
            sent_count: lifetime?.sent_count || 0,
            open_count: lifetime?.open_count || 0,
            reply_count: lifetime?.reply_count || 0,
            bounce_count: lifetime?.bounce_count || 0,
            openMeasured: true,
          };
        }
      })
    );

    const affairesCampaigns = await listFollowupCampaigns();
    const affairesRows = await Promise.all(
      affairesCampaigns.map(async (campaign) => {
        const items = await listFollowupItemsByCampaign(campaign.id);
        const stats = computeAffairesCampaignStats(items, startDate, endDate);
        return {
          id: campaign.id,
          name: campaign.name,
          status: campaign.status,
          nextSendAt: stats.nextSendAt,
          sent_count: stats.sent_count,
          open_count: 0,
          reply_count: stats.reply_count,
          bounce_count: 0,
          openMeasured: false,
        };
      })
    );

    const sum = (rows: Array<Record<string, unknown>>, key: string) =>
      rows.reduce((total, row) => total + toNumber(row[key]), 0);

    return NextResponse.json({
      period,
      smartlead: {
        campaigns: smartleadRows,
        totals: {
          sent_count: sum(smartleadRows as unknown as Array<Record<string, unknown>>, "sent_count"),
          open_count: sum(smartleadRows as unknown as Array<Record<string, unknown>>, "open_count"),
          reply_count: sum(smartleadRows as unknown as Array<Record<string, unknown>>, "reply_count"),
          bounce_count: sum(smartleadRows as unknown as Array<Record<string, unknown>>, "bounce_count"),
        },
      },
      affaires: {
        campaigns: affairesRows,
        totals: {
          sent_count: sum(affairesRows as unknown as Array<Record<string, unknown>>, "sent_count"),
          open_count: 0,
          reply_count: sum(affairesRows as unknown as Array<Record<string, unknown>>, "reply_count"),
          bounce_count: 0,
        },
      },
    });
  } catch (error) {
    console.error("GET /api/sequences/stats error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
