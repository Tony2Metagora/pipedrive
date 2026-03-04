/**
 * API Route — Résumé IA basé sur les 2 derniers emails Gmail
 * POST /api/summary/unified
 * Body: { contactEmail: string, contactName: string }
 * Returns: 2 email blocks (opportunité commerciale) + 1 next steps block
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

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
  if (payload.parts) {
    const textPart = payload.parts.find((p) => p.mimeType === "text/plain");
    if (textPart?.body?.data) return decodeBase64Url(textPart.body.data);
  }
  if (payload.body?.data) return decodeBase64Url(payload.body.data);
  return "";
}

const ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT!;
const API_KEY = process.env.AZURE_OPENAI_API_KEY!;
const API_VERSION = process.env.AZURE_OPENAI_API_VERSION || "2024-12-01-preview";
const DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-5.2-chat-2";

export async function POST(request: Request) {
  try {
    const session = await auth();
    const accessToken = session
      ? ((session as unknown as Record<string, unknown>).accessToken as string)
      : null;

    const body = await request.json();
    const { contactEmail, contactName } = body;

    if (!contactEmail) {
      return NextResponse.json({ error: "Adresse email du contact requise" }, { status: 400 });
    }

    if (!accessToken) {
      return NextResponse.json({ error: "Token Gmail manquant. Reconnectez-vous." }, { status: 403 });
    }

    // 1. Fetch the 2 most recent emails with this contact
    const query = encodeURIComponent(`from:${contactEmail} OR to:${contactEmail}`);
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=2`,
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
        data: { summary: "Aucun email trouvé avec ce contact.", emailCount: 0 },
      });
    }

    // Fetch full details for the 2 emails
    const details = await Promise.all(
      messages.slice(0, 2).map(async (msg: GmailMessage) => {
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
        const truncatedBody = textBody.length > 1500 ? textBody.slice(0, 1500) + "..." : textBody;
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
        data: { summary: "Impossible de lire les emails.", emailCount: 0 },
      });
    }

    // 2. Build prompt — emails only, no Pipedrive
    const lastEmail = validEmails[0]!;
    const emailTexts = validEmails
      .map(
        (e, i) =>
          `--- Email ${i === 0 ? "le plus récent" : "précédent"} ---\nDe: ${e!.from}\nÀ: ${e!.to}\nSujet: ${e!.subject}\nDate: ${e!.date}\n\n${e!.body}`
      )
      .join("\n\n");

    const systemPrompt = `Tu es l'assistant commercial de Tony chez Metagora (formation immersive IA pour le retail/luxe).
Tu reçois les derniers emails échangés avec le contact "${contactName || "inconnu"}".

Réponds EXACTEMENT dans ce format. Texte brut, pas de formatage markdown, pas de *, #, -.

DERNIER EMAIL (${lastEmail.date})
[3-4 lignes : résumé de l'opportunité commerciale dans ce dernier email. Ce qui a été discuté, niveau d'intérêt, signaux d'achat, demandes concrètes.]

NEXT STEPS & ACTIONS
[3-4 lignes : prochaines étapes concrètes. Ce que le prospect attend, ce que Tony doit faire. Recommandation claire.]

FOLLOWUP EMAIL
Objet: [objet du mail de followup]
[Rédige un email de followup professionnel mais naturel que Tony pourrait envoyer en réponse. Le mail doit être court (5-8 lignes), en français, tutoyer le contact si le dernier email tutoyait, vouvoyer sinon. Signe "Tony" à la fin. Le mail doit être la suite logique de la conversation : relancer, proposer un RDV, envoyer un document, confirmer une action, etc.]

RÈGLES : Phrases courtes et factuelles. Base-toi UNIQUEMENT sur le contenu des emails.`;

    const userContent = emailTexts;

    // 3. Call Azure OpenAI
    const url = `${ENDPOINT}openai/deployments/${DEPLOYMENT}/chat/completions?api-version=${API_VERSION}`;

    const aiRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": API_KEY,
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        max_completion_tokens: 1200,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("Azure OpenAI error:", aiRes.status, errText);
      return NextResponse.json({ error: "Erreur IA : " + aiRes.status }, { status: 500 });
    }

    const aiJson = await aiRes.json();
    const rawSummary = aiJson.choices?.[0]?.message?.content?.trim() || "Impossible de générer le résumé.";
    const summary = rawSummary.replace(/[*#]/g, "");

    // Extract followup email and subject from the summary
    let followupEmail = "";
    let followupSubject = "";
    const followupMatch = summary.match(/FOLLOWUP EMAIL\s*\n(?:Objet\s*:\s*(.+)\n)?([\s\S]*?)$/i);
    if (followupMatch) {
      followupSubject = followupMatch[1]?.trim() || "";
      followupEmail = followupMatch[2]?.trim() || "";
    }

    return NextResponse.json({
      data: {
        summary,
        emailCount: validEmails.length,
        followupEmail,
        followupSubject,
      },
    });
  } catch (error) {
    console.error("POST /api/summary/unified error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
