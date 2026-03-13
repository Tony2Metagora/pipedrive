/**
 * API route returning the current user's email, name, and permissions.
 * Used by the frontend to show/hide nav items and enforce read-only.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserPermissions, isAdmin } from "@/lib/permissions";

export async function GET() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const permissions = await getUserPermissions(email);
  return NextResponse.json({
    email,
    name: session.user?.name || email.split("@")[0],
    isAdmin: isAdmin(email),
    permissions,
  });
}
