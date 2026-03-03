/**
 * API Route — Deal Pipedrive par ID
 * GET : récupérer un deal + contacts + activités + notes
 * PUT : mettre à jour un deal
 */

import { NextResponse } from "next/server";
import {
  getDeal,
  updateDeal,
  getPerson,
  getActivitiesForDeal,
  getNotesForDeal,
} from "@/lib/pipedrive";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const dealId = Number(id);

    const deal = await getDeal(dealId);
    if (!deal) {
      return NextResponse.json({ error: "Deal non trouvé" }, { status: 404 });
    }

    // Récupérer le contact principal
    let person = null;
    if (deal.person_id) {
      person = await getPerson(deal.person_id);
    }

    // Récupérer les activités et notes
    const [activities, notes] = await Promise.all([
      getActivitiesForDeal(dealId),
      getNotesForDeal(dealId),
    ]);

    return NextResponse.json({
      data: { deal, person, activities, notes },
    });
  } catch (error) {
    console.error("GET /api/deals/[id] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

const API_TOKEN = process.env.PIPEDRIVE_API_TOKEN!;
const BASE_URL = "https://api.pipedrive.com/v1";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const dealId = Number(id);
    const body = await request.json();

    // Si on met à jour la valeur, il faut d'abord supprimer les produits liés
    if (body.value !== undefined) {
      // Récupérer les produits liés au deal
      const prodRes = await fetch(
        `${BASE_URL}/deals/${dealId}/products?api_token=${API_TOKEN}`,
        { cache: "no-store" }
      );
      const prodJson = await prodRes.json();
      if (prodJson.data && prodJson.data.length > 0) {
        // Supprimer chaque produit lié au deal
        for (const product of prodJson.data) {
          await fetch(
            `${BASE_URL}/deals/${dealId}/products/${product.id}?api_token=${API_TOKEN}`,
            { method: "DELETE" }
          );
        }
      }
    }

    const deal = await updateDeal(dealId, body);
    return NextResponse.json({ data: deal });
  } catch (error) {
    console.error("PUT /api/deals/[id] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
