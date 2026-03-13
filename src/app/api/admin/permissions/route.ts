/**
 * API route for managing user permissions.
 * GET  — returns current permissions config
 * PUT  — updates permissions (admin only)
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-guard";
import {
  getPermissionsConfig,
  savePermissionsConfig,
  type PermissionsConfig,
} from "@/lib/permissions";

export async function GET() {
  const guard = await requireAdmin();
  if (guard.denied) return guard.denied;

  const config = await getPermissionsConfig();
  return NextResponse.json({ data: config });
}

export async function PUT(request: Request) {
  const guard = await requireAdmin();
  if (guard.denied) return guard.denied;

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
