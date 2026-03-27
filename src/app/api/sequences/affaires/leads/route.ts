import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import { getDeals, getPersons } from "@/lib/blob-store";
import { getPipelineName, getStageName } from "@/lib/config";

export async function GET(request: Request) {
  const guard = await requireAuth("sequences", "GET");
  if (guard.denied) return guard.denied;
  try {
    const { searchParams } = new URL(request.url);
    const search = (searchParams.get("search") || "").toLowerCase().trim();

    const [persons, deals] = await Promise.all([getPersons(), getDeals()]);
    const activeDeals = deals.filter((d) => d.status === "open");

    type DealRef = {
      dealId: number;
      dealTitle: string;
      stageId: number | null;
      stageName: string;
      pipelineId: number | null;
      pipelineName: string;
      company: string;
      rank: number;
    };

    const personById = new Map(persons.map((p) => [p.id, p]));
    const dealByPerson = new Map<number, DealRef>();
    const dealStatusRank: Record<string, number> = { open: 3, won: 2, lost: 1 };

    for (const d of activeDeals) {
      const personIds = new Set<number>();
      if (d.person_id) personIds.add(d.person_id);
      for (const pid of d.participants || []) {
        if (typeof pid === "number") personIds.add(pid);
      }
      if (!personIds.size) continue;

      const rank = (dealStatusRank[d.status || ""] || 0) * 1_000_000 + d.id;
      const dealRef: DealRef = {
        dealId: d.id,
        dealTitle: d.title || "",
        stageId: d.stage_id ?? null,
        stageName: getStageName(d.stage_id),
        pipelineId: d.pipeline_id ?? null,
        pipelineName: getPipelineName(d.pipeline_id),
        company: d.org_name || "",
        rank,
      };

      for (const personId of personIds) {
        if (!personById.has(personId)) continue;
        const existing = dealByPerson.get(personId);
        if (!existing || dealRef.rank > existing.rank) {
          dealByPerson.set(personId, dealRef);
        }
      }
    }

    const rows = Array.from(dealByPerson.entries())
      .map(([personId, deal]) => {
        const p = personById.get(personId);
        if (!p) return null;
        const primaryEmail = p.email?.find((e) => e.primary)?.value || p.email?.[0]?.value || "";
        if (!primaryEmail) return null;
        return {
          personId: p.id,
          email: primaryEmail,
          name: p.name || "",
          company: deal.company,
          dealId: deal.dealId,
          dealTitle: deal.dealTitle,
          stageId: deal.stageId,
          stageName: deal.stageName,
          pipelineId: deal.pipelineId,
          pipelineName: deal.pipelineName,
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));

    const filtered = search
      ? rows.filter(
          (r) =>
            r.email.toLowerCase().includes(search) ||
            r.name.toLowerCase().includes(search) ||
            r.dealTitle.toLowerCase().includes(search) ||
            (r.company || "").toLowerCase().includes(search) ||
            (r.pipelineName || "").toLowerCase().includes(search) ||
            (r.stageName || "").toLowerCase().includes(search)
        )
      : rows;

    return NextResponse.json({ data: filtered.slice(0, 500) });
  } catch (error) {
    console.error("GET /api/sequences/affaires/leads error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

