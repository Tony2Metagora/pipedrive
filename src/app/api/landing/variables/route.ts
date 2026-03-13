/**
 * API Route — Landing page variables.json (cached from GitHub)
 * GET: returns the full variables.json for the landing generator UI
 */

import { NextResponse } from "next/server";
import { getVariables } from "@/lib/landing";
import { requireAuth } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireAuth("landing", "GET");
  if (guard.denied) return guard.denied;
  try {
    const data = await getVariables();
    return NextResponse.json({ data });
  } catch (error) {
    console.error("GET /api/landing/variables error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
