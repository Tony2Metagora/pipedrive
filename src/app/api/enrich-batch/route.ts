/**
 * API Route — Enrichissement batch de plusieurs contacts via Dropcontact
 * POST { personIds: number[] }
 * Récupère chaque personne de Pipedrive, envoie à Dropcontact, met à jour Pipedrive
 * Retourne les résultats par personId
 */

import { NextResponse } from "next/server";
import { enrichContact } from "@/lib/dropcontact";
import { getPerson, getOrganization, updatePerson } from "@/lib/pipedrive";

interface EnrichResult {
  personId: number;
  personName: string;
  status: "enriched" | "no_result" | "error" | "no_person";
  enriched?: Record<string, string | undefined>;
  error?: string;
}

export async function POST(request: Request) {
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

    // Process sequentially to avoid Dropcontact rate limits
    for (const personId of personIds) {
      try {
        // 1. Fetch person from Pipedrive
        const person = await getPerson(personId);
        if (!person) {
          results.push({ personId, personName: "Inconnu", status: "no_person" });
          continue;
        }

        // 2. Get company name from organization
        let company = "";
        if (person.org_id) {
          const orgId = typeof person.org_id === "object"
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ? (person.org_id as any).value
            : person.org_id;
          if (orgId) {
            const org = await getOrganization(orgId);
            company = org?.name || "";
          }
        }

        // 3. Parse name
        const nameParts = person.name.split(" ");
        const firstName = nameParts[0] || "";
        const lastName = nameParts.slice(1).join(" ") || "";
        const email = person.email?.[0]?.value || undefined;

        // 4. Enrich via Dropcontact
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

        // 5. Build update payload
        const pipedriveUpdate: Record<string, string> = {};
        const enrichedFields: Record<string, string | undefined> = {};

        const bestEmail = dcResult.email?.find((e) => e.qualification === "professional")?.email
          || dcResult.email?.[0]?.email;
        if (bestEmail) {
          pipedriveUpdate.email = bestEmail;
          enrichedFields.email = bestEmail;
        }

        const phone = dcResult.mobile_phone || dcResult.phone;
        if (phone) {
          pipedriveUpdate.phone = phone;
          enrichedFields.phone = phone;
        }

        if (dcResult.job) {
          pipedriveUpdate.job_title = dcResult.job;
          enrichedFields.job_title = dcResult.job;
        }

        if (dcResult.linkedin) {
          enrichedFields.linkedin = dcResult.linkedin;
        }

        // 6. Update Pipedrive
        if (Object.keys(pipedriveUpdate).length > 0) {
          await updatePerson(personId, pipedriveUpdate);
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
