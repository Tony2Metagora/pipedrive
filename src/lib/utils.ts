import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formater une date en français */
export function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Vérifie si une date est passée ou aujourd'hui */
export function isOverdue(dateStr: string): boolean {
  if (!dateStr) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(dateStr);
  date.setHours(0, 0, 0, 0);
  return date <= today;
}

/** Vérifie si une date est dans les N prochains jours */
export function isWithinDays(dateStr: string, days: number): boolean {
  if (!dateStr) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(dateStr);
  date.setHours(0, 0, 0, 0);
  const limit = new Date(today);
  limit.setDate(limit.getDate() + days);
  return date > today && date <= limit;
}

/** Détecte le type d'activité depuis le titre */
export function detectActivityType(subject: string): string {
  const lower = subject.toLowerCase();
  if (lower.includes("email") || lower.includes("mail")) return "email";
  if (lower.includes("sms") || lower.includes("whatsapp")) return "sms";
  if (lower.includes("appel") || lower.includes("call") || lower.includes("contacter")) return "call";
  if (lower.includes("rdv") || lower.includes("meeting") || lower.includes("rendez")) return "meeting";
  return "task";
}
