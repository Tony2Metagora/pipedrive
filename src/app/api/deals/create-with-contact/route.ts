/**
 * API Route — Créer une affaire avec un contact
 * POST { nom, prenom, email, telephone, poste, entreprise, dealTitle, value, pipeline_id, stage_id }
 * Crée un Person (ou réutilise existant par email), puis crée un Deal lié.
 */

import { NextResponse } from "next/server";
import { getPersons, createPerson, createDeal } from "@/lib/blob-store";
import { requireAuth } from "@/lib/api-guard";

export async function POST(request: Request) {
  const guard = await requireAuth("dashboard", "POST");
  if (guard.denied) return guard.denied;
  try {
    const body = await request.json();
    const { nom, prenom, email, telephone, poste, entreprise, dealTitle, value, pipeline_id, stage_id } = body;

    if (!email || !nom || !prenom || !entreprise || !poste) {
      return NextResponse.json(
        { error: "Champs obligatoires : email, nom, prenom, entreprise, poste" },
        { status: 400 }
      );
    }

    // Find or create person
    const persons = await getPersons();
    let person = persons.find((p) =>
      p.email.some((e) => e.value.toLowerCase().trim() === email.toLowerCase().trim())
    );

    if (!person) {
      person = await createPerson({
        name: `${prenom} ${nom}`.trim(),
        email: [{ value: email, primary: true }],
        phone: telephone ? [{ value: telephone, primary: true }] : [],
        org_id: null,
        job_title: poste || undefined,
      });
    }

    // Create deal
    const title = dealTitle || `${entreprise} - ${prenom} ${nom}`;
    const deal = await createDeal({
      title,
      person_id: person.id,
      org_id: null,
      pipeline_id: pipeline_id || 1,
      stage_id: stage_id || 2,
      value: value || 0,
      currency: "EUR",
      status: "open",
      person_name: person.name,
      org_name: entreprise || "",
    });

    return NextResponse.json({ data: { deal, person } });
  } catch (error) {
    console.error("POST /api/deals/create-with-contact error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
