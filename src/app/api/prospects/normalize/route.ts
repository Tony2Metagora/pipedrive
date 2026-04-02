import { NextResponse } from "next/server";
import { readBlob, writeBlob, withLock } from "@/lib/blob-store";
import { requireAuth } from "@/lib/api-guard";
import { resolveCanonicalProspectField } from "@/lib/prospect-canonical";

interface ProspectRow {
  id: string;
  nom?: string;
  prenom?: string;
  email?: string;
  telephone?: string;
  poste?: string;
  entreprise?: string;
  linkedin?: string;
  naf_code?: string;
  effectifs?: string;
  siren?: string;
  siret?: string;
  adresse_siege?: string;
  extra_fields?: string;
  [key: string]: string | undefined;
}

function clean(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function ensureHttpsUrl(v: string): string {
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  return `https://${v}`;
}

function parseExtra(row: ProspectRow): Record<string, string> {
  if (!row.extra_fields) return {};
  try {
    const parsed = JSON.parse(row.extra_fields) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed || {})) {
      const value = clean(v);
      if (value) out[k] = value;
    }
    return out;
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  const guard = await requireAuth("prospects", "PATCH");
  if (guard.denied) return guard.denied;

  try {
    const body = (await request.json().catch(() => ({}))) as { dryRun?: boolean };
    const dryRun = Boolean(body.dryRun);

    let stats = {
      totalProspects: 0,
      touchedProspects: 0,
      copiedFields: 0,
      copiedByField: {} as Record<string, number>,
    };

    await withLock("prospects.json", async () => {
      const rows = await readBlob<ProspectRow>("prospects.json");
      stats.totalProspects = rows.length;

      for (const row of rows) {
        const before = JSON.stringify(row);
        const extra = parseExtra(row);

        for (const [extraKey, rawValue] of Object.entries(extra)) {
          const canonical = resolveCanonicalProspectField(extraKey);
          if (!canonical) continue;
          const value = canonical === "linkedin" ? ensureHttpsUrl(rawValue) : rawValue;
          if (!value) continue;
          const current = clean(row[canonical]);
          if (!current) {
            row[canonical] = value;
            stats.copiedFields += 1;
            stats.copiedByField[canonical] = (stats.copiedByField[canonical] || 0) + 1;
          }
        }

        const after = JSON.stringify(row);
        if (after !== before) stats.touchedProspects += 1;
      }

      if (!dryRun) {
        await writeBlob("prospects.json", rows);
      }
    });

    return NextResponse.json({
      success: true,
      dryRun,
      stats,
    });
  } catch (error) {
    console.error("POST /api/prospects/normalize error:", error);
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
