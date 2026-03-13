/**
 * Permissions system — role-based access control stored in Vercel Blob.
 *
 * Each user has permissions per "view" (page section).
 * Permission levels: "none" | "read" | "write"
 * tony@metagora.tech is always admin with full write access.
 */

import { Redis } from "@upstash/redis";

// ─── Types ───────────────────────────────────────────────

export type PermissionLevel = "none" | "read" | "write";

/** All controllable views in the app */
export const APP_VIEWS = [
  { key: "dashboard", label: "Affaires", path: "/dashboard" },
  { key: "prospects", label: "Prospects", path: "/prospects" },
  { key: "pipeline", label: "Pipeline", path: "/pipeline" },
  { key: "import", label: "Import", path: "/import" },
  { key: "scrapping", label: "Scrapping", path: "/scrapping" },
  { key: "landing", label: "Landing Generator", path: "/landing-generator" },
  { key: "deal", label: "Fiche affaire", path: "/deal" },
] as const;

export type ViewKey = (typeof APP_VIEWS)[number]["key"];

export interface UserPermissions {
  email: string;
  name?: string;
  permissions: Record<ViewKey, PermissionLevel>;
}

export interface PermissionsConfig {
  users: UserPermissions[];
  updated_at: string;
}

// ─── Constants ───────────────────────────────────────────

const REDIS_KEY = "permissions";
const ADMIN_EMAIL = "tony@metagora.tech";

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

/** Default team members */
const DEFAULT_TEAM: Array<{ email: string; name: string }> = [
  { email: "tony@metagora.tech", name: "Tony" },
  { email: "yves@metagora.tech", name: "Yves" },
  { email: "johann@metagora.tech", name: "Johann" },
  { email: "mounji@metagora.tech", name: "Mounji" },
];

/** Default permissions for new non-admin users */
function defaultPermissions(): Record<ViewKey, PermissionLevel> {
  return {
    dashboard: "read",
    prospects: "read",
    pipeline: "read",
    import: "none",
    scrapping: "read",
    landing: "none",
    deal: "read",
  };
}

/** Admin always gets full write */
function adminPermissions(): Record<ViewKey, PermissionLevel> {
  return {
    dashboard: "write",
    prospects: "write",
    pipeline: "write",
    import: "write",
    scrapping: "write",
    landing: "write",
    deal: "write",
  };
}

// ─── Blob operations ─────────────────────────────────────

export async function getPermissionsConfig(): Promise<PermissionsConfig> {
  try {
    const data = await redis.get<PermissionsConfig>(REDIS_KEY);
    if (data && data.users) return data;
  } catch {
    // First run or missing key — create default
  }
  const config: PermissionsConfig = {
    users: DEFAULT_TEAM.map((u) => ({
      email: u.email,
      name: u.name,
      permissions:
        u.email === ADMIN_EMAIL ? adminPermissions() : defaultPermissions(),
    })),
    updated_at: new Date().toISOString(),
  };
  await redis.set(REDIS_KEY, config);
  return config;
}

export async function savePermissionsConfig(
  config: PermissionsConfig
): Promise<void> {
  // Ensure admin always has full write
  const adminUser = config.users.find((u) => u.email === ADMIN_EMAIL);
  if (adminUser) {
    adminUser.permissions = adminPermissions();
  }
  config.updated_at = new Date().toISOString();
  await redis.set(REDIS_KEY, config);
}

// ─── Helpers ─────────────────────────────────────────────

export function isAdmin(email: string): boolean {
  return email === ADMIN_EMAIL;
}

export async function getUserPermissions(
  email: string
): Promise<Record<ViewKey, PermissionLevel>> {
  if (isAdmin(email)) return adminPermissions();
  const config = await getPermissionsConfig();
  const user = config.users.find(
    (u) => u.email.toLowerCase() === email.toLowerCase()
  );
  if (!user) return defaultPermissions();
  return user.permissions;
}

/** Check if a user can access a given path */
export async function canAccessPath(
  email: string,
  pathname: string
): Promise<{ allowed: boolean; level: PermissionLevel }> {
  const perms = await getUserPermissions(email);
  const view = APP_VIEWS.find((v) => pathname.startsWith(v.path));
  if (!view) return { allowed: true, level: "write" }; // unknown path = allow
  const level = perms[view.key] || "none";
  return { allowed: level !== "none", level };
}

/** Check if a path is a write operation (POST/PUT/PATCH/DELETE) */
export function isWriteMethod(method: string): boolean {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());
}

/** Map API routes to their corresponding view */
export function apiPathToView(pathname: string): ViewKey | null {
  if (pathname.startsWith("/api/deals") || pathname.startsWith("/api/activities") || pathname.startsWith("/api/notes")) return "dashboard";
  if (pathname.startsWith("/api/prospects")) return "prospects";
  if (pathname.startsWith("/api/pipeline")) return "pipeline";
  if (pathname.startsWith("/api/import")) return "import";
  if (pathname.startsWith("/api/scraping")) return "scrapping";
  if (pathname.startsWith("/api/landing") || pathname.startsWith("/api/generate")) return "landing";
  return null;
}
