import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import {
  listEmailAccounts,
  getWarmupStats,
  updateWarmupSettings,
  createEmailAccount,
  type WarmupSettings,
  type CreateEmailAccountPayload,
} from "@/lib/smartlead";

/** GET /api/sequences/warmup — all email accounts + their warmup stats */
export async function GET() {
  const guard = await requireAuth("sequences" as never, "GET");
  if (guard.denied) return guard.denied;

  try {
    const accounts = await listEmailAccounts();
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

/** POST /api/sequences/warmup — action: "update-warmup" | "create-account" */
export async function POST(request: Request) {
  const guard = await requireAuth("sequences" as never, "POST");
  if (guard.denied) return guard.denied;

  try {
    const body = await request.json();
    const action = (body as { action?: string }).action || "update-warmup";

    if (action === "create-account") {
      const payload = body.payload as CreateEmailAccountPayload;
      if (!payload?.from_email || !payload?.smtp_host) {
        return NextResponse.json({ error: "Email et SMTP host requis" }, { status: 400 });
      }
      const result = await createEmailAccount(payload);
      return NextResponse.json({ success: true, result });
    }

    // Default: update warmup settings
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
