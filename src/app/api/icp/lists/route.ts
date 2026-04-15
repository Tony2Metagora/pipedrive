/**
 * API Route — ICP Lists (CRUD)
 * GET: list all ICP lists
 * POST: create list
 * PATCH: update company
 * DELETE: delete list + contacts
 */

import { NextResponse } from "next/server";
import { readBlob, writeBlob, withLock } from "@/lib/blob-store";
import { requireAuth } from "@/lib/api-guard";

export interface IcpList {
  id: string;
  name: string;
  company: string;
  created_at: string;
  count: number;
}

const KEY = "icp-lists";

export async function GET() {
  const guard = await requireAuth("prospects", "GET");
  if (guard.denied) return guard.denied;
  const lists = await readBlob<IcpList>(KEY);
  return NextResponse.json({ lists });
}

export async function POST(request: Request) {
  const guard = await requireAuth("prospects", "POST");
  if (guard.denied) return guard.denied;
  const { name, company } = (await request.json()) as { name: string; company: string };
  if (!name?.trim()) return NextResponse.json({ error: "Nom requis" }, { status: 400 });

  const newList: IcpList = {
    id: `icp_lst_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim(),
    company: (company || "").trim(),
    created_at: new Date().toISOString(),
    count: 0,
  };

  await withLock(KEY, async () => {
    const lists = await readBlob<IcpList>(KEY);
    lists.push(newList);
    await writeBlob(KEY, lists);
  });

  return NextResponse.json({ list: newList });
}

export async function PATCH(request: Request) {
  const guard = await requireAuth("prospects", "POST");
  if (guard.denied) return guard.denied;
  const { id, company } = (await request.json()) as { id: string; company?: string };
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  await withLock(KEY, async () => {
    const lists = await readBlob<IcpList>(KEY);
    const idx = lists.findIndex((l) => l.id === id);
    if (idx === -1) return;
    if (company !== undefined) lists[idx].company = company.trim();
    await writeBlob(KEY, lists);
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const guard = await requireAuth("prospects", "DELETE");
  if (guard.denied) return guard.denied;
  const { searchParams } = new URL(request.url);
  const listId = searchParams.get("id");
  if (!listId) return NextResponse.json({ error: "id requis" }, { status: 400 });

  await withLock(KEY, async () => {
    const lists = await readBlob<IcpList>(KEY);
    await writeBlob(KEY, lists.filter((l) => l.id !== listId));
  });
  await withLock("icp-contacts", async () => {
    const contacts = await readBlob<{ list_id?: string }>("icp-contacts");
    await writeBlob("icp-contacts", contacts.filter((c) => c.list_id !== listId));
  });
  return NextResponse.json({ ok: true });
}
