import { NextResponse } from "next/server";
import { launchAgent } from "@/lib/phantombuster";
import { readBlob, writeBlob } from "@/lib/blob-store";

// ─── Quota tracking ──────────────────────────────────────

interface SearchQuota {
  month: string; // "2026-03"
  used: number;
}

const QUOTA_FILE = "search-quota.json";
const MAX_PER_MONTH = 3000;

async function getQuota(): Promise<SearchQuota> {
  const arr = await readBlob<SearchQuota>(QUOTA_FILE);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const q = arr[0];
  if (!q || q.month !== currentMonth) {
    return { month: currentMonth, used: 0 };
  }
  return q;
}

async function incrementQuota(count: number): Promise<void> {
  const q = await getQuota();
  q.used += count;
  await writeBlob(QUOTA_FILE, [q]);
}

// ─── POST: launch extraction ─────────────────────────────

export async function POST(request: Request) {
  try {
    const { salesNavUrl, numberOfProfiles = 100, listName } = await request.json();

    if (!salesNavUrl || typeof salesNavUrl !== "string") {
      return NextResponse.json({ error: "URL Sales Navigator requise" }, { status: 400 });
    }

    if (!salesNavUrl.includes("linkedin.com/sales/")) {
      return NextResponse.json({ error: "L'URL doit être une URL Sales Navigator (linkedin.com/sales/...)" }, { status: 400 });
    }

    if (!listName || typeof listName !== "string" || !listName.trim()) {
      return NextResponse.json({ error: "Nom de liste requis" }, { status: 400 });
    }

    const profileCount = Math.min(Math.max(1, Number(numberOfProfiles) || 100), 100);

    // Check quota
    const quota = await getQuota();
    if (quota.used + profileCount > MAX_PER_MONTH) {
      return NextResponse.json({
        error: `Quota mensuel dépassé. ${quota.used}/${MAX_PER_MONTH} utilisés ce mois. Demande : ${profileCount}.`,
      }, { status: 429 });
    }

    // Launch PhantomBuster agent
    const { containerId } = await launchAgent(salesNavUrl, profileCount);

    // Increment quota optimistically
    await incrementQuota(profileCount);

    return NextResponse.json({
      launched: true,
      containerId,
      profileCount,
      quotaUsed: quota.used + profileCount,
      quotaMax: MAX_PER_MONTH,
    });
  } catch (err) {
    console.error("[search/launch] Error:", err);
    const message = err instanceof Error ? err.message : "Erreur interne";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── GET: check quota ────────────────────────────────────

export async function GET() {
  try {
    const quota = await getQuota();
    return NextResponse.json({ quota: quota.used, max: MAX_PER_MONTH, month: quota.month });
  } catch (err) {
    console.error("[search/launch] Quota error:", err);
    return NextResponse.json({ error: "Erreur quota" }, { status: 500 });
  }
}
