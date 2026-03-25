/**
 * API Route — Scoring Cards (per-company scoring configuration)
 *
 * Stores: product, value prop, ideal client types, company size, good/bad leads with ratings.
 * Used by the AI scoring prompt to dynamically adapt scoring per company.
 *
 * GET           → list all scoring cards
 * GET ?company= → get a single card
 * POST          → create or update a card
 */

import { NextRequest, NextResponse } from "next/server";
import { readBlob, writeBlob, withLock } from "@/lib/blob-store";
import { requireAuth } from "@/lib/api-guard";

export interface ScoringLeadExample {
  prospect_id: string;
  name: string;
  poste: string;
  entreprise: string;
  rating: number; // 1-5 (1=bad, 5=good)
  reason: string;
}

export interface ScoringCard {
  id: string;
  company: string; // "metagora", "promevil", etc.
  product: string;
  value_proposition: string;
  ideal_client_types: string[]; // 3 best client types
  company_size_ideal: string;
  company_size_min: string;
  company_size_max: string;
  good_leads: ScoringLeadExample[]; // rated 4-5
  bad_leads: ScoringLeadExample[]; // rated 1-2
  created_at: string;
  updated_at: string;
  validated: boolean; // true when >=10 good + >=10 bad leads
}

const STORE_KEY = "scoring-cards.json";

export async function GET(request: NextRequest) {
  const guard = await requireAuth("prospects", "GET");
  if (guard.denied) return guard.denied;

  const company = request.nextUrl.searchParams.get("company");
  const cards = await readBlob<ScoringCard>(STORE_KEY);

  if (company) {
    const card = cards.find((c) => c.company.toLowerCase() === company.toLowerCase());
    return NextResponse.json({ card: card || null });
  }

  return NextResponse.json({ cards });
}

export async function POST(request: Request) {
  const guard = await requireAuth("prospects", "POST");
  if (guard.denied) return guard.denied;

  const body = await request.json();
  const {
    company,
    product,
    value_proposition,
    ideal_client_types,
    company_size_ideal,
    company_size_min,
    company_size_max,
    good_leads,
    bad_leads,
  } = body as Partial<ScoringCard>;

  if (!company?.trim()) {
    return NextResponse.json({ error: "company requis" }, { status: 400 });
  }

  const companyKey = company.trim().toLowerCase();
  const now = new Date().toISOString();

  let result: ScoringCard | null = null;

  await withLock(STORE_KEY, async () => {
    const cards = await readBlob<ScoringCard>(STORE_KEY);
    const idx = cards.findIndex((c) => c.company.toLowerCase() === companyKey);

    const goodCount = (good_leads || []).length;
    const badCount = (bad_leads || []).length;
    const validated = goodCount >= 10 && badCount >= 10;

    if (idx !== -1) {
      // Update existing
      cards[idx] = {
        ...cards[idx],
        product: product ?? cards[idx].product,
        value_proposition: value_proposition ?? cards[idx].value_proposition,
        ideal_client_types: ideal_client_types ?? cards[idx].ideal_client_types,
        company_size_ideal: company_size_ideal ?? cards[idx].company_size_ideal,
        company_size_min: company_size_min ?? cards[idx].company_size_min,
        company_size_max: company_size_max ?? cards[idx].company_size_max,
        good_leads: good_leads ?? cards[idx].good_leads,
        bad_leads: bad_leads ?? cards[idx].bad_leads,
        updated_at: now,
        validated,
      };
      result = cards[idx];
    } else {
      // Create new
      const newCard: ScoringCard = {
        id: `sc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        company: company.trim(),
        product: product || "",
        value_proposition: value_proposition || "",
        ideal_client_types: ideal_client_types || [],
        company_size_ideal: company_size_ideal || "",
        company_size_min: company_size_min || "",
        company_size_max: company_size_max || "",
        good_leads: good_leads || [],
        bad_leads: bad_leads || [],
        created_at: now,
        updated_at: now,
        validated,
      };
      cards.push(newCard);
      result = newCard;
    }

    await writeBlob(STORE_KEY, cards);
  });

  console.log(`[Scoring Card] Saved card for "${company}"`);
  return NextResponse.json({ success: true, card: result });
}
