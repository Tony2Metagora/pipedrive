import { NextResponse } from "next/server";
import { listFollowupCampaigns } from "@/lib/followup-store";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET non configure" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const campaigns = await listFollowupCampaigns();
    const running = campaigns.filter((c) => c.status === "running");
    const results: Array<{ campaignId: number; ok: boolean; result: unknown }> = [];

    for (const campaign of running) {
      const url = new URL("/api/sequences/affaires/send-next", request.url);
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cron-secret": cronSecret,
        },
        body: JSON.stringify({ campaignId: campaign.id }),
      });
      const payload = await res.json().catch(() => ({}));
      results.push({ campaignId: campaign.id, ok: res.ok, result: payload });
    }

    return NextResponse.json({ data: { processed: results.length, results } });
  } catch (error) {
    console.error("GET /api/cron/followup-dispatch error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

