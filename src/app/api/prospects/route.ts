/**
 * API Route — Prospects (Vercel Blob)
 * GET : lire les prospects depuis Blob, enrichis avec statut auto + affaire liée
 * PUT : mettre à jour une ligne et sauvegarder dans Blob
 */

import { NextResponse } from "next/server";
import { getDeals, getPersons, readBlob, writeBlob, withLock } from "@/lib/blob-store";
import { requireAuth } from "@/lib/api-guard";

interface ProspectRow {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  poste: string;
  entreprise: string;
  statut: string;
  pipelines: string;
  notes: string;
  score_entreprise: string;
  score_job: string;
  linkedin: string;
  naf_code: string;
  effectifs: string;
  list_id?: string;
  ai_score?: string;
  ai_comment?: string;
  resume_entreprise?: string;
}

interface EnrichedProspect extends ProspectRow {
  deal_id: number | null;
  deal_title: string | null;
  deal_status: string | null;
  deal_value: number | null;
  computed_statut: string; // "en cours" | "perdu" | "archivé"
}

async function readProspects(): Promise<ProspectRow[]> {
  return readBlob<ProspectRow>("prospects.json");
}

async function writeProspects(rows: ProspectRow[]) {
  await writeBlob("prospects.json", rows);
}

export async function GET() {
  const guard = await requireAuth("prospects", "GET");
  if (guard.denied) return guard.denied;
  try {
    const [rows, deals, persons] = await Promise.all([
      readProspects(),
      getDeals(),
      getPersons(),
    ]);

    // Build email → person mapping
    const emailToPersonId = new Map<string, number>();
    for (const p of persons) {
      for (const e of p.email) {
        if (e.value) emailToPersonId.set(e.value.toLowerCase().trim(), p.id);
      }
    }

    // Build person_id → deal mapping (primary contact + participants)
    const personIdToDeals = new Map<number, typeof deals[0][]>();
    for (const d of deals) {
      // Primary contact
      if (d.person_id) {
        const existing = personIdToDeals.get(d.person_id) || [];
        existing.push(d);
        personIdToDeals.set(d.person_id, existing);
      }
      // Secondary contacts (participants)
      if (d.participants) {
        for (const pid of d.participants) {
          if (pid === d.person_id) continue; // already added above
          const existing = personIdToDeals.get(pid) || [];
          existing.push(d);
          personIdToDeals.set(pid, existing);
        }
      }
    }

    // Enrich each prospect
    const enriched: EnrichedProspect[] = rows.map((r) => {
      const email = r.email?.toLowerCase().trim();
      const personId = email ? emailToPersonId.get(email) : undefined;
      const personDeals = personId ? personIdToDeals.get(personId) : undefined;

      // Find open deal first, otherwise any deal
      const openDeal = personDeals?.find((d) => d.status === "open");
      const anyDeal = personDeals?.[0];
      const deal = openDeal || anyDeal || null;

      // If manually archived, keep that status
      const computed_statut = r.statut === "archivé" ? "archivé" : openDeal ? "en cours" : "perdu";

      return {
        ...r,
        deal_id: deal?.id ?? null,
        deal_title: deal?.title ?? null,
        deal_status: deal?.status ?? null,
        deal_value: deal?.value ?? null,
        computed_statut,
      };
    });

    return NextResponse.json({ data: enriched, count: enriched.length });
  } catch (error) {
    console.error("GET /api/prospects error:", error);
    return NextResponse.json({ error: "Erreur lecture" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const guard = await requireAuth("prospects", "POST");
  if (guard.denied) return guard.denied;
  try {
    const body = await request.json();
    const { nom, prenom, email, telephone, poste, entreprise, notes, linkedin } = body;

    if (!email || !nom || !prenom || !entreprise || !poste) {
      return NextResponse.json({ error: "Champs obligatoires : email, nom, prenom, entreprise, poste" }, { status: 400 });
    }

    let newProspect!: ProspectRow;
    await withLock("prospects.json", async () => {
      const rows = await readProspects();
      const maxId = rows.reduce((max, r) => Math.max(max, Number(r.id) || 0), 0);
      newProspect = {
        id: String(maxId + 1),
        nom: nom || "",
        prenom: prenom || "",
        email: email || "",
        telephone: telephone || "",
        poste: poste || "",
        entreprise: entreprise || "",
        statut: "en cours",
        pipelines: "",
        notes: notes || "",
        score_entreprise: "",
        score_job: "",
        linkedin: linkedin || "",
        naf_code: "",
        effectifs: "",
      };
      rows.push(newProspect);
      await writeProspects(rows);
    });

    return NextResponse.json({ data: newProspect });
  } catch (error) {
    console.error("POST /api/prospects error:", error);
    return NextResponse.json({ error: "Erreur création prospect" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const guard = await requireAuth("prospects", "PUT");
  if (guard.denied) return guard.denied;
  try {
    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

    let result: ProspectRow | null = null;
    await withLock("prospects.json", async () => {
      const rows = await readProspects();
      const idx = rows.findIndex((r) => String(r.id) === String(id));
      if (idx === -1) return;

      const allowedKeys = ["nom", "prenom", "email", "telephone", "poste", "entreprise", "statut", "pipelines", "notes", "score_entreprise", "score_job", "linkedin", "naf_code", "effectifs", "list_id", "ai_score", "ai_comment", "resume_entreprise", "siren", "siret", "adresse_siege", "categorie_entreprise", "chiffre_affaires", "resultat_net", "date_creation_entreprise", "dirigeants", "ville"];
      for (const [key, value] of Object.entries(updates)) {
        if (allowedKeys.includes(key)) {
          (rows[idx] as unknown as Record<string, string>)[key] = String(value);
        }
      }

      await writeProspects(rows);
      result = rows[idx];
    });

    if (!result) return NextResponse.json({ error: "Contact non trouvé" }, { status: 404 });
    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("PUT /api/prospects error:", error);
    return NextResponse.json({ error: "Erreur mise à jour" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const guard = await requireAuth("prospects", "PATCH");
  if (guard.denied) return guard.denied;
  try {
    const body = await request.json();
    const { ids, statut } = body as { ids: string[]; statut: string };
    if (!ids?.length || !statut) {
      return NextResponse.json({ error: "ids[] et statut requis" }, { status: 400 });
    }

    let updated = 0;
    await withLock("prospects.json", async () => {
      const rows = await readProspects();
      const idSet = new Set(ids.map(String));
      for (const row of rows) {
        if (idSet.has(String(row.id))) {
          row.statut = statut;
          updated++;
        }
      }
      await writeProspects(rows);
    });

    return NextResponse.json({ success: true, updated });
  } catch (error) {
    console.error("PATCH /api/prospects error:", error);
    return NextResponse.json({ error: "Erreur mise à jour groupée" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const guard = await requireAuth("prospects", "DELETE");
  if (guard.denied) return guard.denied;
  try {
    const body = (await request.json().catch(() => ({}))) as { ids?: string[] };
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
    if (ids.length === 0) {
      return NextResponse.json({ error: "ids[] requis" }, { status: 400 });
    }

    let deleted = 0;
    await withLock("prospects.json", async () => {
      const rows = await readProspects();
      const idSet = new Set(ids);
      const filtered = rows.filter((row) => {
        const toDelete = idSet.has(String(row.id));
        if (toDelete) deleted += 1;
        return !toDelete;
      });
      await writeProspects(filtered);
    });

    return NextResponse.json({ success: true, deleted });
  } catch (error) {
    console.error("DELETE /api/prospects error:", error);
    return NextResponse.json({ error: "Erreur suppression groupée" }, { status: 500 });
  }
}
