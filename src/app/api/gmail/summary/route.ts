/**
 * API Route — Gmail Summary
 * POST /api/gmail/summary
 * Fetches Gmail emails for a contact and generates an AI summary.
 * Body: { email: string, contactName: string }
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/api-guard";
import { askAzureFast } from "@/lib/azure-ai";

interface GmailMessage {
  id: string;
  threadId: string;
}

interface GmailMessageDetail {
  id: string;
  snippet: string;
  payload: {
    headers: { name: string; value: string }[];
    parts?: { mimeType: string; body: { data?: string } }[];
    body?: { data?: string };
  };
  internalDate: string;
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return Buffer.from(base64, "base64").toString("utf-8");
  } catch {
    return "";
  }
}

function extractTextBody(payload: GmailMessageDetail["payload"]): string {
  // Try parts first
  if (payload.parts) {
    const textPart = payload.parts.find((p) => p.mimeType === "text/plain");
    if (textPart?.body?.data) {
      return decodeBase64Url(textPart.body.data);
    }
  }
  // Fallback to direct body
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  return "";
}

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.denied) return guard.denied;
  try {
    const session = await auth();

    const accessToken = (session as unknown as Record<string, unknown>).accessToken as string;
    if (!accessToken) {
      return NextResponse.json(
        { error: "Token Gmail manquant. Reconnectez-vous pour autoriser l'accès Gmail." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { email, contactName } = body;
    if (!email) {
      return NextResponse.json({ error: "Paramètre email requis" }, { status: 400 });
    }

    // 1. Search Gmail for messages with this contact
    const query = encodeURIComponent(`from:${email} OR to:${email}`);
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=15`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!listRes.ok) {
      if (listRes.status === 401) {
        return NextResponse.json({ error: "Token Gmail expiré. Reconnectez-vous." }, { status: 401 });
      }
      return NextResponse.json({ error: "Erreur Gmail API" }, { status: 500 });
    }

    const listJson = await listRes.json();
    const messages: GmailMessage[] = listJson.messages || [];

    if (messages.length === 0) {
      return NextResponse.json({
        data: { summary: `Aucun email trouvé avec ${contactName || email}.` },
      });
    }

    // 2. Fetch full details for each message (up to 10 for token limit)
    const details = await Promise.all(
      messages.slice(0, 10).map(async (msg: GmailMessage) => {
        const detailRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!detailRes.ok) return null;
        const detail: GmailMessageDetail = await detailRes.json();
        const headers = detail.payload?.headers || [];
        const getHeader = (name: string) =>
          headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

        const textBody = extractTextBody(detail.payload);
        // Truncate long emails
        const truncatedBody = textBody.length > 1000 ? textBody.slice(0, 1000) + "..." : textBody;

        return {
          from: getHeader("From"),
          to: getHeader("To"),
          subject: getHeader("Subject"),
          date: getHeader("Date"),
          body: truncatedBody || detail.snippet,
        };
      })
    );

    const validEmails = details.filter(Boolean);

    if (validEmails.length === 0) {
      return NextResponse.json({
        data: { summary: `Emails trouvés mais impossible de lire le contenu.` },
      });
    }

    // 3. Build context for AI summary
    const emailsText = validEmails
      .map(
        (e, i) =>
          `--- Email ${i + 1} ---\nDe: ${e!.from}\nÀ: ${e!.to}\nSujet: ${e!.subject}\nDate: ${e!.date}\n${e!.body}`
      )
      .join("\n\n");

    const systemPrompt = `Tu es un assistant commercial de Tony chez Metagora (formation immersive IA pour le retail/luxe). On te donne les derniers emails échangés avec "${contactName || email}".

Réponds EXACTEMENT dans ce format avec ces 3 sections. Chaque section fait 2-3 lignes max :

OPPORTUNITÉ COMMERCIALE
[Identifie si un budget a été évoqué (montant si possible), le niveau d'intérêt du prospect (chaud/tiède/froid), et les signaux d'achat détectés dans les échanges.]

SCOPE & BESOIN
[Décris le besoin exprimé par le prospect : type de formation, produits évoqués, personas cibles, nombre d'utilisateurs, langues, verticales métier, etc.]

NEXT STEPS & ACTIONS
[Liste les prochaines étapes concrètes : ce que le prospect a demandé, ce qu'on doit lui envoyer, les relances à faire, les RDV à planifier.]

RÈGLES : Texte brut sans formatage markdown. Pas de *, #, -. Phrases courtes et factuelles. Si une info n'est pas disponible, écris "Non mentionné dans les échanges".`;

    // 4. Call Azure OpenAI
    const summary = await askAzureFast([
      { role: "system", content: systemPrompt },
      { role: "user", content: emailsText },
    ], 600) || "Impossible de générer le résumé.";

    return NextResponse.json({
      data: {
        summary: summary.replace(/[*#]/g, ""),
        emailCount: validEmails.length,
      },
    });
  } catch (error) {
    console.error("POST /api/gmail/summary error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
