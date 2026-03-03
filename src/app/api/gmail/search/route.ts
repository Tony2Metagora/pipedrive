/**
 * API Route — Gmail Search
 * GET /api/gmail/search?email=xxx
 * Searches Gmail for emails exchanged with a specific contact email.
 * Requires Google OAuth with gmail.readonly scope.
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
  };
  internalDate: string;
}

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const accessToken = (session as unknown as Record<string, unknown>).accessToken as string;
    if (!accessToken) {
      return NextResponse.json(
        { error: "Token Gmail manquant. Reconnectez-vous pour autoriser l'accès Gmail." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");
    if (!email) {
      return NextResponse.json({ error: "Paramètre email requis" }, { status: 400 });
    }

    // Search Gmail for messages with this contact (max 20)
    const query = encodeURIComponent(`from:${email} OR to:${email}`);
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=20`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!listRes.ok) {
      const errText = await listRes.text();
      console.error("Gmail list error:", listRes.status, errText);
      if (listRes.status === 401) {
        return NextResponse.json(
          { error: "Token Gmail expiré. Reconnectez-vous." },
          { status: 401 }
        );
      }
      return NextResponse.json({ error: "Erreur Gmail API" }, { status: 500 });
    }

    const listJson = await listRes.json();
    const messages: GmailMessage[] = listJson.messages || [];

    if (messages.length === 0) {
      return NextResponse.json({ data: { emails: [], count: 0 } });
    }

    // Fetch details for each message (snippet + headers)
    const details = await Promise.all(
      messages.slice(0, 15).map(async (msg: GmailMessage) => {
        const detailRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!detailRes.ok) return null;
        const detail: GmailMessageDetail = await detailRes.json();
        const headers = detail.payload?.headers || [];
        const getHeader = (name: string) =>
          headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
        return {
          id: detail.id,
          from: getHeader("From"),
          to: getHeader("To"),
          subject: getHeader("Subject"),
          date: getHeader("Date"),
          snippet: detail.snippet,
        };
      })
    );

    const validEmails = details.filter(Boolean);

    return NextResponse.json({ data: { emails: validEmails, count: validEmails.length } });
  } catch (error) {
    console.error("GET /api/gmail/search error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
