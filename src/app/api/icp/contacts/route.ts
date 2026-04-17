/**
 * API Route — ICP Contacts CRUD
 * GET: list contacts (optionally filtered by list_id)
 * PATCH: bulk update icp_category
 * DELETE: bulk delete
 */

import { NextResponse } from "next/server";
import { readBlob, writeBlob, withLock } from "@/lib/blob-store";
import { requireAuth } from "@/lib/api-guard";

const KEY = "icp-contacts";

export interface IcpContact {
  id: string;
  list_id: string;
  nom?: string;
  prenom?: string;
  email?: string;
  telephone?: string;
  poste?: string;
  entreprise?: string;
  linkedin?: string;
  ville?: string;
  icp_category?: string;
  icp_reason?: string;
  icp_approach?: string;
  extra_fields?: string;
  [key: string]: unknown;
}

export async function GET(request: Request) {
  const guard = await requireAuth("prospects", "GET");
  if (guard.denied) return guard.denied;

  const { searchParams } = new URL(request.url);
  const listId = searchParams.get("list_id");

  let contacts = await readBlob<IcpContact>(KEY);
  if (listId) contacts = contacts.filter((c) => c.list_id === listId);

  return NextResponse.json({ data: contacts });
}

export async function PATCH(request: Request) {
  const guard = await requireAuth("prospects", "POST");
  if (guard.denied) return guard.denied;

  const body = await request.json();
  const { ids, updates } = body as { ids: string[]; updates: Partial<IcpContact> };
  if (!ids?.length) return NextResponse.json({ error: "ids requis" }, { status: 400 });

  await withLock(KEY, async () => {
    const contacts = await readBlob<IcpContact>(KEY);
    const idSet = new Set(ids);
    for (const c of contacts) {
      if (idSet.has(c.id)) {
        Object.assign(c, updates);
      }
    }
    await writeBlob(KEY, contacts);
  });

  return NextResponse.json({ ok: true, updated: ids.length });
}

export async function DELETE(request: Request) {
  const guard = await requireAuth("prospects", "DELETE");
  if (guard.denied) return guard.denied;

  const { ids } = (await request.json()) as { ids: string[] };
  if (!ids?.length) return NextResponse.json({ error: "ids requis" }, { status: 400 });

  const idSet = new Set(ids);
  await withLock(KEY, async () => {
    const contacts = await readBlob<IcpContact>(KEY);
    await writeBlob(KEY, contacts.filter((c) => !idSet.has(c.id)));
  });

  return NextResponse.json({ ok: true });
}
