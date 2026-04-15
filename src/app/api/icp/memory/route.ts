/**
 * API Route — ICP Memory (learning from corrections)
 * GET ?company= → list corrections for a company
 * POST → save a correction
 */

import { NextResponse } from "next/server";
import { readBlob, writeBlob, withLock } from "@/lib/blob-store";
import { requireAuth } from "@/lib/api-guard";

export interface IcpMemoryEntry {
  id: string;
  company: string;
  contact_id: string;
  poste: string;
  entreprise: string;
  old_category: string;
  new_category: string;
  reason: string;
  created_at: string;
}

const KEY = "icp-memory";

export async function GET(request: Request) {
  const guard = await requireAuth("prospects", "GET");
  if (guard.denied) return guard.denied;
  const { searchParams } = new URL(request.url);
  const company = searchParams.get("company");
  let data = await readBlob<IcpMemoryEntry>(KEY);
  if (company) {
    const norm = company.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    data = data.filter((m) => m.company.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() === norm);
  }
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const guard = await requireAuth("prospects", "POST");
  if (guard.denied) return guard.denied;
  const body = await request.json();
  const { company, contact_id, poste, entreprise, old_category, new_category, reason } = body;
  if (!company || !new_category) return NextResponse.json({ error: "company et new_category requis" }, { status: 400 });

  const entry: IcpMemoryEntry = {
    id: `icpm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    company, contact_id: contact_id || "", poste: poste || "", entreprise: entreprise || "",
    old_category: old_category || "", new_category, reason: reason || "",
    created_at: new Date().toISOString(),
  };

  await withLock(KEY, async () => {
    const data = await readBlob<IcpMemoryEntry>(KEY);
    data.push(entry);
    await writeBlob(KEY, data);
  });

  return NextResponse.json({ ok: true, entry });
}
