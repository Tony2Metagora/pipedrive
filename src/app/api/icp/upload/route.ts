/**
 * API Route — Upload CSV/Excel to ICP Cleaner
 * POST: parse file + create contacts + update list count
 */

import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { readBlob, writeBlob, withLock } from "@/lib/blob-store";
import { requireAuth } from "@/lib/api-guard";
import type { IcpList } from "../lists/route";

interface IcpContact {
  id: string;
  list_id: string;
  [key: string]: unknown;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ",") { fields.push(current); current = ""; }
      else { current += ch; }
    }
  }
  fields.push(current);
  return fields;
}

function detectSeparator(headerLine: string): string {
  return (headerLine.match(/;/g) || []).length > (headerLine.match(/,/g) || []).length ? ";" : ",";
}

function parseLine(line: string, sep: string): string[] {
  if (sep === ",") return parseCsvLine(line);
  return line.split(sep).map((f) => f.replace(/^"|"$/g, "").replace(/""/g, '"'));
}

export async function POST(request: Request) {
  const guard = await requireAuth("prospects", "POST");
  if (guard.denied) return guard.denied;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const listId = formData.get("list_id") as string | null;
    const listName = formData.get("list_name") as string | null;
    const listCompany = formData.get("list_company") as string | null;
    const mappingRaw = formData.get("column_mapping") as string | null;

    if (!file) return NextResponse.json({ error: "Fichier requis" }, { status: 400 });

    const mapping: { index: number; targetField: string }[] = mappingRaw ? JSON.parse(mappingRaw) : [];
    const buffer = await file.arrayBuffer();
    const name = file.name.toLowerCase();
    const isExcel = name.endsWith(".xlsx") || name.endsWith(".xls");

    let dataRows: string[][] = [];

    if (isExcel) {
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      dataRows = json.slice(1).filter((row) => row.some((c) => String(c ?? "").trim()));
    } else {
      let content = new TextDecoder("utf-8").decode(buffer);
      if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
      const lines = content.split(/\r?\n/).filter((l) => l.trim());
      const sep = detectSeparator(lines[0]);
      dataRows = lines.slice(1).map((l) => parseLine(l, sep));
    }

    // Create or use existing list
    let targetListId = listId || "";
    if (!targetListId && listName) {
      targetListId = `icp_lst_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const newList: IcpList = {
        id: targetListId,
        name: listName.trim(),
        company: (listCompany || "").trim(),
        created_at: new Date().toISOString(),
        count: 0,
      };
      await withLock("icp-lists", async () => {
        const lists = await readBlob<IcpList>("icp-lists");
        lists.push(newList);
        await writeBlob("icp-lists", lists);
      });
    }

    // Build contacts from rows + mapping
    const newContacts: IcpContact[] = [];
    const seenEmails = new Set<string>();

    for (const row of dataRows) {
      const contact: IcpContact = {
        id: `icp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        list_id: targetListId,
      };
      const extraFields: Record<string, string> = {};

      for (const col of mapping) {
        const value = (row[col.index] || "").trim();
        if (!value) continue;
        if (col.targetField) {
          contact[col.targetField] = value;
        } else {
          extraFields[`col_${col.index}`] = value;
        }
      }

      // Dedup by email
      const email = String(contact.email || "").toLowerCase().trim();
      if (email && seenEmails.has(email)) continue;
      if (email) seenEmails.add(email);

      if (Object.keys(extraFields).length > 0) {
        contact.extra_fields = JSON.stringify(extraFields);
      }

      newContacts.push(contact);
    }

    // Save contacts
    await withLock("icp-contacts", async () => {
      const existing = await readBlob<IcpContact>("icp-contacts");
      existing.push(...newContacts);
      await writeBlob("icp-contacts", existing);
    });

    // Update list count
    await withLock("icp-lists", async () => {
      const lists = await readBlob<IcpList>("icp-lists");
      const idx = lists.findIndex((l) => l.id === targetListId);
      if (idx !== -1) {
        lists[idx].count += newContacts.length;
        await writeBlob("icp-lists", lists);
      }
    });

    return NextResponse.json({ success: true, count: newContacts.length, list_id: targetListId });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
