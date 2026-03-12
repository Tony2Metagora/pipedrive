import { NextResponse } from "next/server";
import { createImportList, type ImportContact } from "@/lib/import-store";
import { parseLocation } from "@/lib/french-geo";

function genId() {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// ─── POST: import PhantomBuster profiles into an import list ──

export async function POST(request: Request) {
  try {
    const { profiles, listName } = await request.json();

    if (!Array.isArray(profiles) || profiles.length === 0) {
      return NextResponse.json({ error: "Aucun profil à importer" }, { status: 400 });
    }

    if (!listName || typeof listName !== "string" || !listName.trim()) {
      return NextResponse.json({ error: "Nom de liste requis" }, { status: 400 });
    }

    if (profiles.length > 500) {
      return NextResponse.json({ error: "Maximum 500 profils par import" }, { status: 400 });
    }

    // Convert PhantomBuster profiles → ImportContact[]
    const contacts: ImportContact[] = profiles.map((p: Record<string, string>) => {
      const loc = (p.location || "").trim();
      const geo = loc ? parseLocation(loc) : { region: undefined, postal_code: undefined };
      return {
        id: genId(),
        first_name: (p.firstName || "").trim(),
        last_name: (p.lastName || "").trim(),
        email: "", // will be enriched by Dropcontact later
        company: (p.companyName || "").trim(),
        job: (p.title || "").trim(),
        phone: "", // will be enriched by Dropcontact later
        linkedin: (p.linkedinUrl || "").trim(),
        location: loc,
        company_location: (p.companyLocation || "").trim(),
        region: geo.region || "",
        postal_code: geo.postal_code || "",
      };
    });

    const list = await createImportList(listName.trim(), contacts, "search");

    return NextResponse.json({
      data: list,
      count: contacts.length,
    });
  } catch (err) {
    console.error("[search/import] Error:", err);
    const message = err instanceof Error ? err.message : "Erreur interne";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
