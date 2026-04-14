/**
 * API Route — Prospect Lists
 * GET  : lire toutes les listes
 * POST : créer une nouvelle liste (metadata uniquement)
 * DELETE : supprimer une liste et ses prospects associés
 */

import { NextResponse } from "next/server";
import { readBlob, writeBlob, withLock } from "@/lib/blob-store";
import { requireAuth } from "@/lib/api-guard";

export interface ProspectList {
  id: string;
  name: string;
  company: string;
  created_at: string;
  count: number;
}

async function readLists(): Promise<ProspectList[]> {
  return readBlob<ProspectList>("prospect-lists.json");
}

async function writeLists(lists: ProspectList[]) {
  await writeBlob("prospect-lists.json", lists);
}

export async function GET() {
  const guard = await requireAuth("prospects", "GET");
  if (guard.denied) return guard.denied;
  try {
    const lists = await readLists();
    return NextResponse.json({ data: lists });
  } catch (error) {
    console.error("GET /api/prospects/lists error:", error);
    return NextResponse.json({ error: "Erreur lecture listes" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const guard = await requireAuth("prospects", "POST");
  if (guard.denied) return guard.denied;
  try {
    const body = await request.json();
    const { name, company } = body;
    if (!name || !company) {
      return NextResponse.json({ error: "name et company requis" }, { status: 400 });
    }

    const id = `lst_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const newList: ProspectList = {
      id,
      name: name.trim(),
      company: company.trim(),
      created_at: new Date().toISOString(),
      count: 0,
    };

    await withLock("prospect-lists.json", async () => {
      const lists = await readLists();
      lists.push(newList);
      await writeLists(lists);
    });

    return NextResponse.json({ data: newList });
  } catch (error) {
    console.error("POST /api/prospects/lists error:", error);
    return NextResponse.json({ error: "Erreur création liste" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const guard = await requireAuth("prospects", "POST");
  if (guard.denied) return guard.denied;
  try {
    const body = await request.json();
    const { id, company } = body as { id: string; company?: string };
    if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

    let updated: ProspectList | null = null;
    await withLock("prospect-lists.json", async () => {
      const lists = await readLists();
      const idx = lists.findIndex((l) => l.id === id);
      if (idx === -1) return;
      if (company !== undefined) lists[idx].company = company.trim();
      updated = lists[idx];
      await writeLists(lists);
    });

    if (!updated) return NextResponse.json({ error: "Liste non trouvée" }, { status: 404 });
    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("PATCH /api/prospects/lists error:", error);
    return NextResponse.json({ error: "Erreur mise à jour liste" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const guard = await requireAuth("prospects", "DELETE");
  if (guard.denied) return guard.denied;
  try {
    const { searchParams } = new URL(request.url);
    const listId = searchParams.get("id");
    if (!listId) return NextResponse.json({ error: "id requis" }, { status: 400 });

    // Remove list metadata
    await withLock("prospect-lists.json", async () => {
      const lists = await readLists();
      const filtered = lists.filter((l) => l.id !== listId);
      await writeLists(filtered);
    });

    // Remove prospects belonging to this list
    await withLock("prospects.json", async () => {
      const rows = await readBlob<{ list_id?: string }>("prospects.json");
      const filtered = rows.filter((r) => r.list_id !== listId);
      await writeBlob("prospects.json", filtered);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/prospects/lists error:", error);
    return NextResponse.json({ error: "Erreur suppression liste" }, { status: 500 });
  }
}
