/**
 * Warmup capacity logic — shared between warmup page and bulk import wizard.
 * Extracted from src/app/sequences/warmup/page.tsx for reuse.
 */

// ─── Types ──────────────────────────────────────────────

export interface WarmupDayStat {
  date: string;
  sent: number;
  spam: number;
  delivered: number;
  opened: number;
  replied: number;
}

export interface WarmupAccountData {
  id: number;
  from_name: string;
  from_email: string;
  type: string;
  is_smtp_success: boolean;
  is_imap_success?: boolean;
  message_per_day?: number;
  daily_sent_count?: number;
  warmup_details?: { status: string; warmup_reputation: string; total_sent_count: number; total_spam_count: number };
  warmup_stats: {
    total_sent: number;
    spam_count: number;
    reputation_score: number;
    daily_stats: WarmupDayStat[];
  } | null;
  warmup_meta?: {
    firstObservedSendAt: string | null;
    emailAgeDays: number | null;
    historyWeeklySent: number;
    historyDailyAvg: number;
    historyDaysCount: number;
  };
}

export interface AccountProfile {
  isGoogle: boolean;
  isHostinger: boolean;
  totalSent: number;
  rep: number;
  spamRate: number;
  maturity: "new" | "warming" | "warm" | "mature";
  rampTable: readonly { week: number; daily: number }[];
  currentWeek: number;
  dailyTarget: number;
  providerCapDaily: number;
  weeklyTarget: number;
  weeklySent: number;
  avgDaily: number;
  historyWeeklySent: number;
  emailAgeDays: number | null;
  estimationConfidence: "haute" | "moyenne" | "faible";
  health: number;
  healthColor: string;
  healthBg: string;
  healthLabel: string;
}

// ─── Ramp tables ────────────────────────────────────────

export const RAMP_NEW_GOOGLE = [
  { week: 1, daily: 10 },
  { week: 2, daily: 15 },
  { week: 3, daily: 25 },
  { week: 4, daily: 35 },
  { week: 5, daily: 50 },
] as const;

export const RAMP_NEW_HOSTINGER = [
  { week: 1, daily: 5 },
  { week: 2, daily: 10 },
  { week: 3, daily: 15 },
  { week: 4, daily: 25 },
  { week: 5, daily: 35 },
] as const;

// ─── Main function ──────────────────────────────────────

export function getAccountProfile(acc: WarmupAccountData): AccountProfile {
  const email = acc.from_email.toLowerCase();
  const isGoogle = email.endsWith("@metagora.tech");
  const isHostinger = email.endsWith("@metagora-tech.fr");
  const totalSent = acc.warmup_stats?.total_sent || acc.warmup_details?.total_sent_count || 0;
  const rep = acc.warmup_stats?.reputation_score || 0;
  const spamRate = (acc.warmup_stats && acc.warmup_stats.total_sent > 0) ? (acc.warmup_stats.spam_count / acc.warmup_stats.total_sent) * 100 : 0;

  let maturity: "new" | "warming" | "warm" | "mature" = "new";
  if (totalSent > 500 && rep >= 80) maturity = "mature";
  else if (totalSent > 200 && rep >= 60) maturity = "warm";
  else if (totalSent > 50) maturity = "warming";

  const rampTable = isGoogle ? RAMP_NEW_GOOGLE : RAMP_NEW_HOSTINGER;
  const providerCapDaily = isGoogle ? 80 : 40;
  const providerBaseDaily = isGoogle ? 10 : 5;

  const ds = acc.warmup_stats?.daily_stats || [];
  const avgDaily = ds.length > 0 ? ds.reduce((s, d) => s + d.sent, 0) / ds.length : 0;
  let currentWeek = 1;
  if (maturity === "mature") currentWeek = 5;
  else if (maturity === "warm") currentWeek = 4;
  else if (maturity === "warming") currentWeek = 3;
  else if (avgDaily > 10) currentWeek = 2;

  const rampEntry = rampTable.find((r) => r.week >= currentWeek) || rampTable[rampTable.length - 1];
  const historyWeeklySent = acc.warmup_meta?.historyWeeklySent ?? ds.reduce((s, d) => s + d.sent, 0);
  const historyDailyObserved = Math.max(
    Number(acc.daily_sent_count || 0),
    Number(acc.warmup_meta?.historyDailyAvg || avgDaily || 0)
  );
  const emailAgeDays = acc.warmup_meta?.emailAgeDays ?? null;
  const ageBoostDaily = emailAgeDays === null
    ? providerBaseDaily
    : emailAgeDays < 14
      ? providerBaseDaily
      : emailAgeDays < 30
        ? providerBaseDaily + 5
        : emailAgeDays < 60
          ? providerBaseDaily + 10
          : providerBaseDaily + 15;
  const historyDrivenDaily = historyDailyObserved > 0
    ? Math.ceil(historyDailyObserved * 1.15)
    : 0;
  const dailyTarget = Math.min(
    providerCapDaily,
    Math.max(rampEntry.daily, ageBoostDaily, historyDrivenDaily, providerBaseDaily)
  );
  const weeklyTarget = dailyTarget * 7;
  const weeklySent = ds.reduce((s, d) => s + d.sent, 0);
  const estimationConfidence: "haute" | "moyenne" | "faible" = (acc.warmup_meta?.historyDaysCount || 0) >= 7
    ? "haute"
    : (acc.warmup_meta?.historyDaysCount || 0) >= 3
      ? "moyenne"
      : "faible";

  let health = 0;
  const warmupActive = acc.warmup_details?.status === "ACTIVE" || acc.warmup_details?.status === "ENABLED";
  if (!acc.is_smtp_success) {
    health = 0;
  } else if (rep > 0) {
    health = rep;
    if (spamRate > 5) health = Math.max(0, health - 30);
    else if (spamRate > 2) health = Math.max(0, health - 15);
  } else {
    health = 40;
    if (warmupActive) health += 25;
    if (totalSent > 0) health += 10;
    if (spamRate === 0 && totalSent > 5) health += 10;
    if (totalSent > 50) health += 15;
  }
  health = Math.min(100, Math.max(0, health));

  const healthColor = health >= 70 ? "text-green-600" : health >= 40 ? "text-yellow-600" : "text-red-600";
  const healthBg = health >= 70 ? "bg-green-100" : health >= 40 ? "bg-yellow-100" : "bg-red-100";
  const healthLabel = health >= 70 ? "Bon" : health >= 40 ? "En cours" : "Critique";

  return {
    isGoogle, isHostinger, totalSent, rep, spamRate, maturity, rampTable,
    currentWeek, dailyTarget, providerCapDaily, weeklyTarget, weeklySent, avgDaily,
    historyWeeklySent, emailAgeDays, estimationConfidence,
    health, healthColor, healthBg, healthLabel,
  };
}

// ─── Helpers ────────────────────────────────────────────

/** Add N business days (skip Sat/Sun) to a date */
export function addBusinessDays(date: Date, count: number): Date {
  const result = new Date(date);
  let added = 0;
  while (added < count) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return result;
}
