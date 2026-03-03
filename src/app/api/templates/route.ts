/**
 * API Route — Templates de messages
 * GET : retourne la liste des templates depuis le JSON
 */

import { NextResponse } from "next/server";
import templates from "@/data/templates.json";

export async function GET() {
  return NextResponse.json({ data: templates });
}
