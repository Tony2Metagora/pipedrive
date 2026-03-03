/**
 * API Route — Enrichissement d'un contact via Dropcontact (Blob Storage)
 * POST : envoie nom + entreprise à Dropcontact, met à jour le contact dans Blob
 */

import { NextResponse } from "next/server";
import { enrichContact } from "@/lib/dropcontact";
import { updatePerson } from "@/lib/blob-store";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ personId: string }> }
) {
  try {
    const { personId } = await params;
    const body = await request.json();
    const { first_name, last_name, full_name, company, email } = body;

    const result = await enrichContact({
      first_name,
      last_name,
      full_name,
      company,
      email,
    });

    if (!result) {
      return NextResponse.json({ data: null, message: "Aucun résultat trouvé" });
    }

    const blobUpdate: Record<string, unknown> = {};
    const enrichedFields: Record<string, string | undefined> = {};

    const bestEmail = result.email?.find((e) => e.qualification === "professional")?.email
      || result.email?.[0]?.email;
    if (bestEmail) {
      blobUpdate.email = [{ value: bestEmail, primary: true }];
      enrichedFields.email = bestEmail;
    }

    const phone = result.mobile_phone || result.phone;
    if (phone) {
      blobUpdate.phone = [{ value: phone, primary: true }];
      enrichedFields.phone = phone;
    }

    if (result.job) {
      blobUpdate.job_title = result.job;
      enrichedFields.job_title = result.job;
    }

    if (result.linkedin) {
      enrichedFields.linkedin = result.linkedin;
    }

    if (Object.keys(blobUpdate).length > 0) {
      await updatePerson(Number(personId), blobUpdate);
    }

    return NextResponse.json({
      data: {
        enriched: enrichedFields,
        raw: result,
      },
    });
  } catch (error) {
    console.error("POST /api/enrich/[personId] error:", error);
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
