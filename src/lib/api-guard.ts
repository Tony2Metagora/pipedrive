/**
 * API route auth guard — checks session + RBAC permissions server-side.
 *
 * Usage in any route:
 *   const guard = await requireAuth(viewKey, method);
 *   if (guard.denied) return guard.denied;
 *   // guard.email is the authenticated user's email
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserPermissions, isAdmin, type ViewKey } from "@/lib/permissions";

interface GuardResult {
  denied: NextResponse | null;
  email: string;
  isAdmin: boolean;
}

/**
 * @param view   — the ViewKey this route belongs to (e.g. "dashboard", "scrapping")
 * @param method — HTTP method ("GET" = needs read, "POST"/"PUT"/"PATCH"/"DELETE" = needs write)
 */
export async function requireAuth(
  view: ViewKey | null,
  method: string = "GET"
): Promise<GuardResult> {
  const session = await auth();
  const email = session?.user?.email;

  if (!email) {
    return {
      denied: NextResponse.json({ error: "Non authentifié" }, { status: 401 }),
      email: "",
      isAdmin: false,
    };
  }

  // If no specific view is required, just check authentication
  if (!view) {
    return { denied: null, email, isAdmin: isAdmin(email) };
  }

  const perms = await getUserPermissions(email);
  const level = perms[view] || "none";

  if (level === "none") {
    return {
      denied: NextResponse.json(
        { error: "Accès refusé à cette fonctionnalité" },
        { status: 403 }
      ),
      email,
      isAdmin: isAdmin(email),
    };
  }

  const isWrite = ["POST", "PUT", "PATCH", "DELETE"].includes(
    method.toUpperCase()
  );

  if (isWrite && level === "read") {
    return {
      denied: NextResponse.json(
        { error: "Accès en lecture seule — modification interdite" },
        { status: 403 }
      ),
      email,
      isAdmin: isAdmin(email),
    };
  }

  return { denied: null, email, isAdmin: isAdmin(email) };
}

/**
 * Admin-only guard — rejects non-admin users.
 */
export async function requireAdmin(): Promise<GuardResult> {
  const session = await auth();
  const email = session?.user?.email;

  if (!email) {
    return {
      denied: NextResponse.json({ error: "Non authentifié" }, { status: 401 }),
      email: "",
      isAdmin: false,
    };
  }

  if (!isAdmin(email)) {
    return {
      denied: NextResponse.json(
        { error: "Accès réservé à l'administrateur" },
        { status: 403 }
      ),
      email,
      isAdmin: false,
    };
  }

  return { denied: null, email, isAdmin: true };
}
