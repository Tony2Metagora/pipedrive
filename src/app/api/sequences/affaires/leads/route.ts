import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import { getDeals, getPersons } from "@/lib/blob-store";

export async function GET(request: Request) {
  const guard = await requireAuth("sequences", "GET");
  if (guard.denied) return guard.denied;
  try {
    const { searchParams } = new URL(request.url);
    const search = (searchParams.get("search") || "").toLowerCase().trim();

    const [persons, deals] = await Promise.all([getPersons(), getDeals()]);

    const dealByPerson = new Map<number, { dealId: number; dealTitle: string; stageId: number }>();
    for (const d of deals) {
      if (!d.person_id) continue;
      if (!dealByPerson.has(d.person_id)) {
        dealByPerson.set(d.person_id, { dealId: d.id, dealTitle: d.title, stageId: d.stage_id });
      }
    }

    const rows = persons
      .map((p) => {
        const primaryEmail = p.email?.find((e) => e.primary)?.value || p.email?.[0]?.value || "";
        if (!primaryEmail) return null;
        const deal = dealByPerson.get(p.id);
        return {
          personId: p.id,
          email: primaryEmail,
          name: p.name || "",
          company: "",
          dealId: deal?.dealId ?? null,
          dealTitle: deal?.dealTitle ?? "",
          stageId: deal?.stageId ?? null,
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));

    const filtered = search
      ? rows.filter(
          (r) =>
            r.email.toLowerCase().includes(search) ||
            r.name.toLowerCase().includes(search) ||
            r.dealTitle.toLowerCase().includes(search)
        )
      : rows;

    return NextResponse.json({ data: filtered.slice(0, 500) });
  } catch (error) {
    console.error("GET /api/sequences/affaires/leads error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

