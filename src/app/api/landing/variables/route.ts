/**
 * API Route — Landing page variables.json (cached from GitHub)
 * GET: returns the full variables.json for the landing generator UI
 */

import { NextResponse } from "next/server";
import { getVariables } from "@/lib/landing";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getVariables();
    return NextResponse.json({ data });
  } catch (error) {
    console.error("GET /api/landing/variables error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
