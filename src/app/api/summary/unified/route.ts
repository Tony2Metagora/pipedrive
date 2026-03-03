/**
 * API Route — Résumé IA unifié (Pipedrive + Gmail)
 * POST /api/summary/unified
 * Body: { pipedriveContext: string, contactEmail: string, contactName: string }
 * Returns a structured summary with 4 sections.
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
    const { pipedriveContext, contactEmail, contactName } = body;

    if (!pipedriveContext) {
      return NextResponse.json({ error: "Contexte Pipedrive requis" }, { status: 400 });
    }

    // 1. Try to fetch Gmail emails if we have an access token and email
    let gmailSection = "Aucun accès Gmail ou aucune adresse email disponible.";
    let emailCount = 0;

    if (accessToken && contactEmail) {
      try {
        const query = encodeURIComponent(`from:${contactEmail} OR to:${contactEmail}`);
        const listRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=15`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (listRes.ok) {
          const listJson = await listRes.json();
          const messages: GmailMessage[] = listJson.messages || [];

          if (messages.length > 0) {
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
                const truncatedBody = textBody.length > 800 ? textBody.slice(0, 800) + "..." : textBody;
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
            emailCount = validEmails.length;

            if (validEmails.length > 0) {
              gmailSection = validEmails
                .map(
                  (e, i) =>
                    `--- Email ${i + 1} ---\nDe: ${e!.from}\nÀ: ${e!.to}\nSujet: ${e!.subject}\nDate: ${e!.date}\n${e!.body}`
                )
                .join("\n\n");
            }
          } else {
            gmailSection = "Aucun email trouvé avec ce contact.";
          }
        } else {
          gmailSection = "Token Gmail expiré ou invalide. Reconnectez-vous.";
        }
      } catch {
        gmailSection = "Erreur lors de la récupération des emails Gmail.";
      }
    }

    // 2. Build unified prompt
    const systemPrompt = `Tu es l'assistant commercial de Tony chez Metagora (formation immersive IA pour le retail/luxe).
Tu reçois deux sources d'information sur un contact "${contactName || "inconnu"}" :
- Les données Pipedrive (deals, notes, activités)
- Les emails Gmail échangés avec ce contact

Réponds EXACTEMENT dans ce format avec ces 4 sections. Chaque section fait 3-4 lignes max :

OPPORTUNITÉ COMMERCIALE
[Budget évoqué (montant si possible), niveau d'intérêt (chaud/tiède/froid), signaux d'achat détectés dans les emails et Pipedrive, type de relation (client/partenaire/prospect).]

SCOPE & BESOIN
[Besoin identifié : type de formation, produits évoqués, personas cibles, vertical métier, nombre d'accès, langues, tout détail sur le périmètre du projet.]

NEXT STEPS & ACTIONS
[Prochaines étapes concrètes : ce que le prospect a demandé, tâches à faire, relances, documents à envoyer, RDV à planifier. Recommandation : relancer / archiver / attendre.]

HISTORIQUE PIPEDRIVE
[Résumé chronologique des interactions : date du premier et dernier contact, deals en cours et leur statut, activités réalisées, notes clés. Fraîcheur du contact.]

RÈGLES : Texte brut sans formatage markdown. Pas de *, #, -. Phrases courtes et factuelles. Croise les infos Pipedrive et Gmail pour une vision complète. Si une info n'est pas disponible, écris "Non mentionné".`;

    const userContent = `=== DONNÉES PIPEDRIVE ===\n${pipedriveContext}\n\n=== EMAILS GMAIL ===\n${gmailSection}`;

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
        max_completion_tokens: 1000,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("Azure OpenAI error:", aiRes.status, errText);
      return NextResponse.json({ error: "Erreur IA : " + aiRes.status }, { status: 500 });
    }

    const aiJson = await aiRes.json();
    const summary = aiJson.choices?.[0]?.message?.content?.trim() || "Impossible de générer le résumé.";

    return NextResponse.json({
      data: {
        summary: summary.replace(/[*#]/g, ""),
        emailCount,
      },
    });
  } catch (error) {
    console.error("POST /api/summary/unified error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
