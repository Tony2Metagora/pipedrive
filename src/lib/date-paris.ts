export const PARIS_TIMEZONE = "Europe/Paris";

export function formatDateTimeParis(input: string | Date | number | null | undefined): string {
  if (!input) return "—";
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: PARIS_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export function formatDateParis(input: string | Date | number | null | undefined): string {
  if (!input) return "—";
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: PARIS_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function mapWeekdayToJs(day: number): number {
  // Smartlead usually sends 1..7 where 1=Mon and 7=Sun.
  if (day === 7) return 0;
  return Math.max(0, Math.min(6, day));
}

function weekdayInTimezone(date: Date, tz: string): number {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(date);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[wd] ?? date.getDay();
}

export function estimateNextSendAtFromSchedule(
  scheduler?: { tz?: string; days?: number[]; startHour?: string; endHour?: string } | null
): string | null {
  if (!scheduler) return null;
  const tz = scheduler.tz || PARIS_TIMEZONE;
  const daysRaw = scheduler.days && scheduler.days.length > 0 ? scheduler.days : [1, 2, 3, 4, 5];
  const allowed = new Set(daysRaw.map(mapWeekdayToJs));
  const startHour = Number((scheduler.startHour || "09:00").split(":")[0] || 9);
  const endHour = Number((scheduler.endHour || "18:00").split(":")[0] || 18);
  const now = new Date();

  // Approximation in scheduler timezone for UI-only visibility.
  for (let offset = 0; offset < 8; offset += 1) {
    const candidate = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);
    const localWeekday = weekdayInTimezone(candidate, tz);
    if (!allowed.has(localWeekday)) continue;

    const parts = new Intl.DateTimeFormat("fr-FR", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(candidate);
    const [hourText] = parts.split(":");
    const localHour = Number(hourText || "0");
    if (offset === 0 && localHour >= startHour && localHour < endHour) {
      return now.toISOString();
    }
    return new Date(candidate.setHours(startHour, 0, 0, 0)).toISOString();
  }
  return null;
}
