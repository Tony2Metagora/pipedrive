import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import {
  listCampaigns,
  createCampaign,
  listEmailAccounts,
} from "@/lib/smartlead";

/** GET /api/sequences — list campaigns + email accounts */
export async function GET() {
  const guard = await requireAuth("sequences" as never, "GET");
  if (guard.denied) return guard.denied;

  try {
    const [campaigns, emailAccounts] = await Promise.all([
      listCampaigns(),
      listEmailAccounts(),
    ]);
    return NextResponse.json({ campaigns, emailAccounts });
  } catch (error) {
    console.error("GET /api/sequences error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

/** POST /api/sequences — create a new campaign */
export async function POST(request: Request) {
  const guard = await requireAuth("sequences" as never, "POST");
  if (guard.denied) return guard.denied;

  try {
    const body = await request.json();
    const { name } = body as { name: string };
    if (!name?.trim()) {
      return NextResponse.json({ error: "Nom de campagne requis" }, { status: 400 });
    }
    const campaign = await createCampaign(name.trim());
    return NextResponse.json({ success: true, campaign });
  } catch (error) {
    console.error("POST /api/sequences error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
