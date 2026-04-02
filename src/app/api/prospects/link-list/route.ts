import { NextResponse } from "next/server";
import { readBlob, writeBlob, withLock } from "@/lib/blob-store";
import { requireAuth } from "@/lib/api-guard";

interface ProspectRow {
  id: string;
  email?: string;
  linkedin?: string;
  list_id?: string;
  [key: string]: string | undefined;
}

interface ProspectList {
  id: string;
  name: string;
  company: string;
  created_at: string;
  count: number;
}

function clean(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeEmail(v: string): string {
  return v.trim().toLowerCase();
}

function normalizeLinkedin(v: string): string {
  const raw = v.trim().toLowerCase();
  const withProtocol = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
  return withProtocol.replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");
}

export async function POST(request: Request) {
  const guard = await requireAuth("prospects", "POST");
  if (guard.denied) return guard.denied;

  try {
    const body = (await request.json()) as {
      ids?: string[];
      targetListId?: string;
      mode?: "move" | "copy";
    };
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
    const targetListId = clean(body.targetListId);
    const mode = body.mode === "copy" ? "copy" : "move";

    if (!ids.length || !targetListId) {
      return NextResponse.json({ error: "ids[] et targetListId requis" }, { status: 400 });
    }

    const lists = await readBlob<ProspectList>("prospect-lists.json");
    const targetList = lists.find((l) => l.id === targetListId);
    if (!targetList) {
      return NextResponse.json({ error: "Liste cible introuvable" }, { status: 404 });
    }

    let updated = 0;
    let created = 0;
    let skipped = 0;
    let finalRows: ProspectRow[] = [];

    await withLock("prospects.json", async () => {
      const rows = await readBlob<ProspectRow>("prospects.json");
      const idSet = new Set(ids);
      const selectedRows = rows.filter((r) => idSet.has(String(r.id)));
      if (selectedRows.length === 0) {
        finalRows = rows;
        return;
      }

      if (mode === "move") {
        for (const row of rows) {
          if (!idSet.has(String(row.id))) continue;
          if (clean(row.list_id) === targetListId) {
            skipped += 1;
            continue;
          }
          row.list_id = targetListId;
          updated += 1;
        }
        finalRows = rows;
      } else {
        // copy mode: duplicate into target list and keep original assignment
        const existingEmailsInTarget = new Set<string>();
        const existingLinkedinInTarget = new Set<string>();
        for (const row of rows) {
          if (clean(row.list_id) !== targetListId) continue;
          if (clean(row.email)) existingEmailsInTarget.add(normalizeEmail(clean(row.email)));
          if (clean(row.linkedin)) existingLinkedinInTarget.add(normalizeLinkedin(clean(row.linkedin)));
        }

        const maxId = rows.reduce((max, r) => Math.max(max, Number(r.id) || 0), 0);
        let cursor = maxId;
        const additions: ProspectRow[] = [];
        for (const row of selectedRows) {
          const emailKey = clean(row.email) ? normalizeEmail(clean(row.email)) : "";
          const linkedinKey = clean(row.linkedin) ? normalizeLinkedin(clean(row.linkedin)) : "";
          const alreadyInTarget =
            clean(row.list_id) === targetListId ||
            (emailKey && existingEmailsInTarget.has(emailKey)) ||
            (linkedinKey && existingLinkedinInTarget.has(linkedinKey));
          if (alreadyInTarget) {
            skipped += 1;
            continue;
          }

          cursor += 1;
          const clone: ProspectRow = { ...row, id: String(cursor), list_id: targetListId };
          additions.push(clone);
          created += 1;
          if (emailKey) existingEmailsInTarget.add(emailKey);
          if (linkedinKey) existingLinkedinInTarget.add(linkedinKey);
        }
        finalRows = [...rows, ...additions];
      }

      await writeBlob("prospects.json", finalRows);
    });

    await withLock("prospect-lists.json", async () => {
      const currentLists = await readBlob<ProspectList>("prospect-lists.json");
      const countByList = new Map<string, number>();
      for (const row of finalRows) {
        const lid = clean(row.list_id);
        if (!lid) continue;
        countByList.set(lid, (countByList.get(lid) || 0) + 1);
      }
      for (const list of currentLists) {
        list.count = countByList.get(list.id) || 0;
      }
      await writeBlob("prospect-lists.json", currentLists);
    });

    return NextResponse.json({
      success: true,
      mode,
      updated,
      created,
      skipped,
      targetListId,
    });
  } catch (error) {
    console.error("POST /api/prospects/link-list error:", error);
    return NextResponse.json({ error: "Erreur liaison à la liste" }, { status: 500 });
  }
}

