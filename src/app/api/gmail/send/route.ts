/**
 * API Route — Gmail Send
 * POST /api/gmail/send
 * Sends an email with Google OAuth (gmail.send scope).
 * Body: { to: string, subject: string, text?: string, html?: string }
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/api-guard";
import { sendGmailMessage } from "@/lib/gmail-sender";

interface SendBody {
  to?: string;
  subject?: string;
  text?: string;
  html?: string;
}

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.denied) return guard.denied;

  try {
    const session = await auth();
    const accessToken = (session as unknown as Record<string, unknown>).accessToken as
      | string
      | undefined;

    if (!accessToken) {
      return NextResponse.json(
        { error: "Token Gmail manquant. Reconnectez-vous pour autoriser l'envoi." },
        { status: 403 }
      );
    }

    const body = (await request.json()) as SendBody;
    const to = body.to?.trim();
    const subject = body.subject?.trim();
    const text = body.text ?? "";
    const html = body.html;

    if (!to) {
      return NextResponse.json({ error: "Champ 'to' requis" }, { status: 400 });
    }
    if (!subject) {
      return NextResponse.json({ error: "Champ 'subject' requis" }, { status: 400 });
    }
    if (!text && !html) {
      return NextResponse.json(
        { error: "Ajoutez au moins 'text' ou 'html' dans le body" },
        { status: 400 }
      );
    }

    const sent = await sendGmailMessage(
      {
        accessToken,
        refreshToken: (session as unknown as Record<string, unknown>).refreshToken as string | undefined,
        expiresAt: (session as unknown as Record<string, unknown>).expiresAt as number | undefined,
      },
      {
        to,
        subject,
        text,
        html,
      }
    );

    return NextResponse.json({
      data: {
        id: sent.id,
        threadId: sent.threadId,
        to,
        subject,
      },
    });
  } catch (error) {
    console.error("POST /api/gmail/send error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
