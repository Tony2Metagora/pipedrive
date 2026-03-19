/**
 * API Route — Analyse structurée du dernier email d'un deal
 * GET /api/deals/[id]/email-analysis?email=xxx
 * Returns: { decisionnaire, nextSteps, budget } with citations from email
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
  if (payload.parts) {
    const textPart = payload.parts.find((p) => p.mimeType === "text/plain");
    if (textPart?.body?.data) return decodeBase64Url(textPart.body.data);
  }
  if (payload.body?.data) return decodeBase64Url(payload.body.data);
  return "";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin();
  if (guard.denied) return guard.denied;
  try {
    const { id } = await params;
    const dealId = Number(id);
    if (!dealId || isNaN(dealId)) {
      return NextResponse.json({ error: "dealId invalide" }, { status: 400 });
    }

    const session = await auth();
    const accessToken = session
      ? ((session as unknown as Record<string, unknown>).accessToken as string)
      : null;

    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");
    if (!email) {
      return NextResponse.json({ error: "Paramètre email requis" }, { status: 400 });
    }

    if (!accessToken) {
      return NextResponse.json({ error: "Token Gmail manquant. Reconnectez-vous." }, { status: 403 });
    }

    // 1. Fetch the most recent emails with this contact
    const emailLower = email.toLowerCase();
    const query = encodeURIComponent(`from:${email} OR to:${email}`);
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=5`,
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
        data: { analysis: null, reason: "Aucun email trouvé avec ce contact." },
      });
    }

    // Fetch full details for the 3 most recent emails for context
    const details = await Promise.all(
      messages.slice(0, 3).map(async (msg: GmailMessage) => {
        const detailRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!detailRes.ok) return null;
        const detail: GmailMessageDetail = await detailRes.json();
        const headers = detail.payload?.headers || [];
        const getHeader = (name: string) =>
          headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
        const from = getHeader("From");
        const to = getHeader("To");
        const textBody = extractTextBody(detail.payload);
        const truncatedBody = textBody.length > 2000 ? textBody.slice(0, 2000) + "..." : textBody;
        const inFrom = from.toLowerCase().includes(emailLower);
        const inTo = to.toLowerCase().includes(emailLower);
        return {
          from,
          to,
          subject: getHeader("Subject"),
          date: getHeader("Date"),
          body: truncatedBody || detail.snippet,
          direct: inFrom || inTo,
        };
      })
    );

    const validEmails = details.filter(Boolean) as NonNullable<(typeof details)[number]>[];
    const directEmails = validEmails.filter((e) => e.direct);
    const emailsToAnalyze = (directEmails.length > 0 ? directEmails : validEmails).slice(0, 3);

    if (emailsToAnalyze.length === 0) {
      return NextResponse.json({
        data: { analysis: null, reason: "Impossible de lire les emails." },
      });
    }

    // 2. Build prompt for structured analysis
    const emailTexts = emailsToAnalyze
      .map(
        (e, i) =>
          `--- Email ${i + 1} ---\nDe: ${e.from}\nÀ: ${e.to}\nSujet: ${e.subject}\nDate: ${e.date}\n\n${e.body}`
      )
      .join("\n\n");

    const systemPrompt = `Tu es un assistant commercial expert. Tu analyses les derniers emails échangés avec un prospect/client pour identifier 3 informations clés.

Tu DOIS répondre EXACTEMENT en JSON valide, sans markdown, sans backticks, sans commentaires :

{
  "summary": "Résumé en 1-2 phrases du dernier échange (ce qui a été discuté, le contexte)",
  "decisionnaire": {
    "value": true ou false,
    "citation": "Citation exacte du mail qui indique si la personne est décisionnaire ou non (max 1 phrase). Vide si pas d'information.",
    "detail": "Explication courte (ex: 'Se présente comme directeur, prend les décisions', 'Mentionne devoir consulter son manager')"
  },
  "nextSteps": {
    "value": "Description de la prochaine étape identifiée",
    "citation": "Citation exacte du mail qui fait référence aux prochaines étapes (max 1 phrase)"
  },
  "budget": {
    "value": true ou false,
    "citation": "Citation exacte du mail qui aborde le budget (max 1 phrase). Vide si pas d'information.",
    "detail": "Montant ou contexte budget si mentionné"
  },
  "lastEmailDate": "Date du dernier email au format JJ/MM/AAAA",
  "lastEmailSubject": "Objet du dernier email"
}

RÈGLES STRICTES :
- Base-toi UNIQUEMENT sur le contenu des emails. N'invente rien.
- Si une information n'est pas trouvable dans les emails, mets "value": false (ou "") et "citation": ""
- Les citations doivent être des extraits EXACTS des emails, pas des reformulations
- Réponds UNIQUEMENT en JSON, aucun texte avant ou après`;

    const rawAnalysis = await askAzureFast([
      { role: "system", content: systemPrompt },
      { role: "user", content: emailTexts },
    ], 800);

    if (!rawAnalysis) {
      return NextResponse.json({
        data: { analysis: null, reason: "L'IA n'a pas pu analyser les emails." },
      });
    }

    // Parse JSON response
    try {
      const cleaned = rawAnalysis.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      const analysis = JSON.parse(cleaned);
      return NextResponse.json({ data: { analysis } });
    } catch (e) {
      console.error("Email analysis parse error:", e, rawAnalysis.slice(0, 500));
      return NextResponse.json({
        data: { analysis: null, reason: "Erreur de parsing de l'analyse IA." },
      });
    }
  } catch (error) {
    console.error("GET /api/deals/[id]/email-analysis error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
