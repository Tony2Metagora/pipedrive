/**
 * API Route — Enrichissement d'un contact via Dropcontact
 * POST : envoie nom + entreprise à Dropcontact, met à jour Pipedrive avec les résultats
 */

import { NextResponse } from "next/server";
import { enrichContact } from "@/lib/dropcontact";
import { updatePerson } from "@/lib/pipedrive";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ personId: string }> }
) {
  try {
    const { personId } = await params;
    const body = await request.json();
    const { first_name, last_name, full_name, company, email } = body;

    // Call Dropcontact
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

    // Build Pipedrive update payload
    const pipedriveUpdate: Record<string, string> = {};
    const enrichedFields: Record<string, string | undefined> = {};

    // Email
    const bestEmail = result.email?.find((e) => e.qualification === "professional")?.email
      || result.email?.[0]?.email;
    if (bestEmail) {
      pipedriveUpdate.email = bestEmail;
      enrichedFields.email = bestEmail;
    }

    // Phone
    const phone = result.mobile_phone || result.phone;
    if (phone) {
      pipedriveUpdate.phone = phone;
      enrichedFields.phone = phone;
    }

    // Job title
    if (result.job) {
      pipedriveUpdate.job_title = result.job;
      enrichedFields.job_title = result.job;
    }

    // LinkedIn
    if (result.linkedin) {
      enrichedFields.linkedin = result.linkedin;
    }

    // Update Pipedrive if we have data
    if (Object.keys(pipedriveUpdate).length > 0) {
      await updatePerson(Number(personId), pipedriveUpdate);
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
