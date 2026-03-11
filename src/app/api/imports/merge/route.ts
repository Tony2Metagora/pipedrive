import { NextResponse } from "next/server";
import { mergeImportLists, getImportIndex } from "@/lib/import-store";

export async function POST(request: Request) {
  try {
    const { listIds, name, companyTag } = await request.json();

    if (!Array.isArray(listIds) || listIds.length < 2) {
      return NextResponse.json({ error: "Sélectionnez au moins 2 listes à fusionner" }, { status: 400 });
    }

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Nom de la liste fusionnée requis" }, { status: 400 });
    }

    // Verify all lists exist and are enriched
    const index = await getImportIndex();
    for (const lid of listIds) {
      const list = index.find((l) => l.id === lid);
      if (!list) {
        return NextResponse.json({ error: `Liste introuvable : ${lid}` }, { status: 404 });
      }
      if (!list.enriched_at) {
        return NextResponse.json({
          error: `La liste "${list.name}" n'a pas été enrichie. Seules les listes enrichies peuvent être fusionnées.`,
        }, { status: 400 });
      }
    }

    const merged = await mergeImportLists(listIds, name.trim(), companyTag?.trim() || undefined);

    return NextResponse.json({ data: merged, count: merged.count });
  } catch (err) {
    console.error("[imports/merge] Error:", err);
    const message = err instanceof Error ? err.message : "Erreur interne";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
