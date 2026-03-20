import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import {
  listEmailAccounts,
  getWarmupStats,
  updateWarmupSettings,
  type WarmupSettings,
} from "@/lib/smartlead";

/** GET /api/sequences/warmup — all email accounts + their warmup stats */
export async function GET() {
  const guard = await requireAuth("sequences" as never, "GET");
  if (guard.denied) return guard.denied;

  try {
    const accounts = await listEmailAccounts();
    // Fetch warmup stats for each account in parallel
    const warmupResults = await Promise.allSettled(
      accounts.map((a) => getWarmupStats(a.id))
    );

    const data = accounts.map((account, i) => {
      const wr = warmupResults[i];
      return {
        ...account,
        warmup_stats: wr.status === "fulfilled" ? wr.value : null,
      };
    });

    return NextResponse.json({ accounts: data });
  } catch (error) {
    console.error("GET /api/sequences/warmup error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

/** POST /api/sequences/warmup — update warmup settings for an account */
export async function POST(request: Request) {
  const guard = await requireAuth("sequences" as never, "POST");
  if (guard.denied) return guard.denied;

  try {
    const body = await request.json();
    const { email_account_id, settings } = body as {
      email_account_id: number;
      settings: WarmupSettings;
    };
    if (!email_account_id) {
      return NextResponse.json({ error: "email_account_id requis" }, { status: 400 });
    }
    const result = await updateWarmupSettings(email_account_id, settings);
    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error("POST /api/sequences/warmup error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
