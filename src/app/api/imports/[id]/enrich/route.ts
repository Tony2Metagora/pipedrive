/**
 * API Route — Enrichissement d'une liste d'import via Dropcontact
 *
 * POST : submit batch to Dropcontact, returns { requestId, contactIds }
 * GET  : poll results, apply to import contacts
 */

import { NextResponse } from "next/server";
import { getImportContacts, writeImportContacts, updateListMeta } from "@/lib/import-store";
import { submitBatchEnrich, pollBatchEnrich, type DropcontactResult } from "@/lib/dropcontact";

export const dynamic = "force-dynamic";

/**
 * POST — Submit contacts that need enrichment to Dropcontact
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { contactIds } = body as { contactIds?: string[] };

    const contacts = await getImportContacts(id);
    if (contacts.length === 0) {
      return NextResponse.json({ error: "Liste vide" }, { status: 404 });
    }

    // If specific IDs provided, enrich only those; otherwise enrich contacts missing data
    let toEnrich: typeof contacts;
    if (contactIds?.length) {
      const idSet = new Set(contactIds);
      toEnrich = contacts.filter((c) => idSet.has(c.id) && !c.enriched);
    } else {
      toEnrich = contacts.filter((c) => (!c.email || !c.phone || !c.linkedin) && !c.enriched);
    }

    if (toEnrich.length === 0) {
      return NextResponse.json({
        error: "Aucun contact à enrichir (tous ont déjà email + téléphone + linkedin, ou sont déjà enrichis)",
      }, { status: 400 });
    }

    if (toEnrich.length > 100) {
      toEnrich = toEnrich.slice(0, 100);
    }

    // Build Dropcontact input
    const inputs = toEnrich.map((c) => ({
      first_name: c.first_name || undefined,
      last_name: c.last_name || undefined,
      full_name: `${c.first_name} ${c.last_name}`.trim() || undefined,
      company: c.company || undefined,
      email: c.email || undefined,
    }));

    console.log(`[Import Enrich] Submitting ${inputs.length} contacts to Dropcontact for list ${id}`);
    const requestId = await submitBatchEnrich(inputs);

    return NextResponse.json({
      submitted: true,
      requestId,
      count: toEnrich.length,
      contactIds: toEnrich.map((c) => c.id),
    });
  } catch (error) {
    console.error("POST /api/imports/[id]/enrich error:", error);
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Apply Dropcontact results to import contacts
 */
function applyResults(
  contacts: import("@/lib/import-store").ImportContact[],
  contactIds: string[],
  dcResults: DropcontactResult[]
) {
  const results: { id: string; name: string; status: string; fields: string[] }[] = [];

  for (let i = 0; i < contactIds.length; i++) {
    const cid = contactIds[i];
    const dc = dcResults[i];
    const idx = contacts.findIndex((c) => c.id === cid);

    if (idx === -1) {
      results.push({ id: cid, name: "?", status: "not_found", fields: [] });
      continue;
    }

    const updatedFields: string[] = [];
    const row = contacts[idx];

    if (dc) {
      // Email
      const bestEmail = dc.email?.find((e) => e.qualification === "professional")?.email || dc.email?.[0]?.email;
      if (bestEmail && !row.email) { row.email = bestEmail; updatedFields.push("email"); }

      // Email qualification
      const qual = dc.email?.[0]?.qualification;
      if (qual) { row.email_qualification = qual; updatedFields.push("email_qualification"); }

      // Phone
      if (dc.phone && !row.phone) { row.phone = dc.phone; updatedFields.push("phone"); }
      if (dc.mobile_phone) { row.mobile_phone = dc.mobile_phone; updatedFields.push("mobile_phone"); }

      // Job
      if (dc.job) { row.job = dc.job; updatedFields.push("job"); }

      // LinkedIn
      if (dc.linkedin) {
        let url = dc.linkedin;
        if (!url.startsWith("http")) url = `https://${url}`;
        row.linkedin = url;
        updatedFields.push("linkedin");
      }

      // Name
      if (dc.first_name && !row.first_name) { row.first_name = dc.first_name; updatedFields.push("first_name"); }
      if (dc.last_name && !row.last_name) { row.last_name = dc.last_name; updatedFields.push("last_name"); }

      // Company
      if (dc.company && !row.company) { row.company = dc.company; updatedFields.push("company"); }

      // Website
      if (dc.website) { row.website = dc.website; updatedFields.push("website"); }

      // NAF
      if (dc.naf5_code) {
        row.naf_code = dc.naf5_code;
        row.naf_label = dc.naf5_des || "";
        updatedFields.push("naf_code");
      }

      // Employees
      if (dc.nb_employees) { row.nb_employees = dc.nb_employees; updatedFields.push("nb_employees"); }

      // SIREN/SIRET
      if (dc.siren) { row.siren = dc.siren; updatedFields.push("siren"); }
      if (dc.siret) { row.siret = dc.siret; updatedFields.push("siret"); }

      // Company address from siret_address (format: "2 Rue Rotland, 67140 Mittelbergheim")
      if (dc.siret_address) {
        row.company_address = dc.siret_address;
        updatedFields.push("company_address");
        // Parse city and postal code from address
        const match = dc.siret_address.match(/(\d{5})\s+(.+)$/);
        if (match) {
          row.company_postal_code = match[1];
          row.company_city = match[2];
          updatedFields.push("company_city", "company_postal_code");
        }
      }

      // Company LinkedIn
      if (dc.company_linkedin) { row.company_linkedin = dc.company_linkedin; updatedFields.push("company_linkedin"); }

      // Company turnover
      if (dc.company_turnover) { row.company_turnover = dc.company_turnover; updatedFields.push("company_turnover"); }

      row.enriched = true;
    }

    results.push({
      id: cid,
      name: `${row.first_name} ${row.last_name}`.trim(),
      status: updatedFields.length > 0 ? "enriched" : "no_new_data",
      fields: updatedFields,
    });
  }

  return results;
}

/**
 * GET — Poll Dropcontact results and apply to import contacts
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: listId } = await params;
    const { searchParams } = new URL(request.url);
    const requestId = searchParams.get("requestId");
    const idsParam = searchParams.get("ids");

    if (!requestId || !idsParam) {
      return NextResponse.json({ error: "requestId et ids requis" }, { status: 400 });
    }

    const contactIds = idsParam.split(",");
    const pollResult = await pollBatchEnrich(requestId);

    if (!pollResult.done) {
      return NextResponse.json({ done: false });
    }

    if (pollResult.error) {
      return NextResponse.json({ done: true, error: pollResult.error });
    }

    // Apply results
    const contacts = await getImportContacts(listId);
    const results = applyResults(contacts, contactIds, pollResult.data || []);
    await writeImportContacts(listId, contacts);

    const enrichedCount = results.filter((r) => r.status === "enriched").length;

    // Mark list as enriched
    if (enrichedCount > 0) {
      await updateListMeta(listId, { enriched_at: new Date().toISOString() });
    }

    return NextResponse.json({
      done: true,
      success: true,
      enriched: enrichedCount,
      total: results.length,
      results,
    });
  } catch (error) {
    console.error("GET /api/imports/[id]/enrich error:", error);
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return NextResponse.json({ done: true, error: message }, { status: 500 });
  }
}
