/**
 * API Route — Enrichissement batch de plusieurs contacts via Dropcontact (Blob Storage)
 * POST { personIds: number[] }
 * Récupère chaque personne du Blob, envoie à Dropcontact, met à jour le Blob
 * Retourne les résultats par personId
 */

import { NextResponse } from "next/server";
import { enrichContact } from "@/lib/dropcontact";
import { getPerson, getOrganization, updatePerson } from "@/lib/blob-store";
import { requireAuth } from "@/lib/api-guard";

interface EnrichResult {
  personId: number;
  personName: string;
  status: "enriched" | "no_result" | "error" | "no_person";
  enriched?: Record<string, string | undefined>;
  error?: string;
}

export async function POST(request: Request) {
  const guard = await requireAuth("dashboard", "POST");
  if (guard.denied) return guard.denied;
  try {
    const body = await request.json();
    const { personIds } = body as { personIds: number[] };

    if (!personIds || !Array.isArray(personIds) || personIds.length === 0) {
      return NextResponse.json({ error: "personIds requis (tableau non vide)" }, { status: 400 });
    }

    if (personIds.length > 50) {
      return NextResponse.json({ error: "Maximum 50 contacts à la fois" }, { status: 400 });
    }

    const results: EnrichResult[] = [];

    for (const personId of personIds) {
      try {
        const person = await getPerson(personId);
        if (!person) {
          results.push({ personId, personName: "Inconnu", status: "no_person" });
          continue;
        }

        let company = "";
        if (person.org_id) {
          const org = await getOrganization(person.org_id);
          company = org?.name || "";
        }

        const nameParts = person.name.split(" ");
        const firstName = nameParts[0] || "";
        const lastName = nameParts.slice(1).join(" ") || "";
        const email = person.email?.[0]?.value || undefined;

        console.log(`[Batch Enrich] Processing ${person.name} (${personId})...`);
        const dcResult = await enrichContact({
          first_name: firstName,
          last_name: lastName,
          full_name: person.name,
          company,
          email,
        });

        if (!dcResult) {
          results.push({ personId, personName: person.name, status: "no_result" });
          continue;
        }

        const blobUpdate: Record<string, unknown> = {};
        const enrichedFields: Record<string, string | undefined> = {};

        const bestEmail = dcResult.email?.find((e) => e.qualification === "professional")?.email
          || dcResult.email?.[0]?.email;
        if (bestEmail) {
          blobUpdate.email = [{ value: bestEmail, primary: true }];
          enrichedFields.email = bestEmail;
        }

        const phone = dcResult.mobile_phone || dcResult.phone;
        if (phone) {
          blobUpdate.phone = [{ value: phone, primary: true }];
          enrichedFields.phone = phone;
        }

        if (dcResult.job) {
          blobUpdate.job_title = dcResult.job;
          enrichedFields.job_title = dcResult.job;
        }

        if (dcResult.linkedin) {
          enrichedFields.linkedin = dcResult.linkedin;
        }

        if (Object.keys(blobUpdate).length > 0) {
          await updatePerson(personId, blobUpdate);
        }

        results.push({
          personId,
          personName: person.name,
          status: Object.keys(enrichedFields).length > 0 ? "enriched" : "no_result",
          enriched: enrichedFields,
        });

      } catch (err) {
        console.error(`[Batch Enrich] Error for personId ${personId}:`, err);
        results.push({
          personId,
          personName: String(personId),
          status: "error",
          error: err instanceof Error ? err.message : "Erreur inconnue",
        });
      }
    }

    return NextResponse.json({ data: results });
  } catch (error) {
    console.error("POST /api/enrich-batch error:", error);
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
