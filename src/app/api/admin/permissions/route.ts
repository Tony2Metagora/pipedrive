/**
 * API route for managing user permissions.
 * GET  — returns current permissions config
 * PUT  — updates permissions (admin only)
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getPermissionsConfig,
  savePermissionsConfig,
  isAdmin,
  type PermissionsConfig,
} from "@/lib/permissions";

export async function GET() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  // Only admin can view permissions config
  if (!isAdmin(email)) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const config = await getPermissionsConfig();
  return NextResponse.json({ data: config });
}

export async function PUT(request: Request) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  if (!isAdmin(email)) {
    return NextResponse.json({ error: "Accès refusé — admin uniquement" }, { status: 403 });
  }

  try {
    const body = (await request.json()) as PermissionsConfig;
    if (!body.users || !Array.isArray(body.users)) {
      return NextResponse.json({ error: "Format invalide" }, { status: 400 });
    }
    await savePermissionsConfig(body);
    const updated = await getPermissionsConfig();
    return NextResponse.json({ data: updated });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
