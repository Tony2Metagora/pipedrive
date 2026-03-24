import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import { getLearnings, createLearning } from "@/lib/linkedin-store";

export const dynamic = "force-dynamic";

// GET — list all learnings
export async function GET() {
  const guard = await requireAuth("linkedin", "GET");
  if (guard.denied) return guard.denied;

  const learnings = await getLearnings();
  return NextResponse.json({ data: learnings });
}

// POST — add a new learning
export async function POST(request: Request) {
  const guard = await requireAuth("linkedin", "POST");
  if (guard.denied) return guard.denied;

  try {
    const body = await request.json();
    const { type, before, after, reason } = body;

    if (!type || !reason) {
      return NextResponse.json({ error: "type et reason requis" }, { status: 400 });
    }

    const learning = await createLearning({
      type,
      before: before || "",
      after: after || "",
      reason,
    });

    return NextResponse.json({ data: learning });
  } catch (error) {
    console.error("POST /api/linkedin/learnings error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
