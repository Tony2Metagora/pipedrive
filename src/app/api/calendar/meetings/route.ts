/**
 * API Route — Google Calendar Meetings
 * GET /api/calendar/meetings?email=xxx&dealId=123
 * Fetches calendar events involving a specific contact email.
 * Returns past meetings (last 90 days) and upcoming meetings (next 30 days).
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/api-guard";

interface CalendarEvent {
  id: string;
  summary: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  attendees?: { email: string; responseStatus?: string }[];
  status: string;
}

export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (guard.denied) return guard.denied;
  try {
    const session = await auth();
    const accessToken = (session as unknown as Record<string, unknown>).accessToken as string;
    if (!accessToken) {
      return NextResponse.json(
        { error: "Token Google manquant. Reconnectez-vous pour autoriser l'accès Calendar." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");
    if (!email) {
      return NextResponse.json({ error: "Paramètre email requis" }, { status: 400 });
    }

    const now = new Date();
    const past90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const future30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Search calendar events in the time range
    const params = new URLSearchParams({
      timeMin: past90.toISOString(),
      timeMax: future30.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "50",
      q: email, // Search by attendee email
    });

    const calRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!calRes.ok) {
      const errText = await calRes.text();
      console.error("Calendar API error:", calRes.status, errText);
      if (calRes.status === 401) {
        return NextResponse.json(
          { error: "Token Google expiré. Reconnectez-vous." },
          { status: 401 }
        );
      }
      return NextResponse.json({ error: "Erreur Calendar API" }, { status: 500 });
    }

    const calJson = await calRes.json();
    const events: CalendarEvent[] = calJson.items || [];

    // Filter events that actually have this contact as attendee
    const contactEmail = email.toLowerCase();
    const relevantEvents = events.filter((evt) => {
      if (evt.status === "cancelled") return false;
      // Check if contact is in attendees
      if (evt.attendees) {
        return evt.attendees.some((a) => a.email.toLowerCase() === contactEmail);
      }
      // If no attendees list but query matched, include it
      return true;
    });

    // Split into past and upcoming
    const pastMeetings: { id: string; subject: string; date: string; type: "meeting" }[] = [];
    const upcomingMeetings: { id: string; subject: string; date: string; type: "meeting" }[] = [];

    for (const evt of relevantEvents) {
      const startStr = evt.start?.dateTime || evt.start?.date || "";
      const startDate = new Date(startStr);
      const dateOnly = startStr.slice(0, 10); // YYYY-MM-DD

      const meeting = {
        id: evt.id,
        subject: evt.summary || "Meeting",
        date: dateOnly,
        type: "meeting" as const,
      };

      if (startDate < now) {
        pastMeetings.push(meeting);
      } else {
        upcomingMeetings.push(meeting);
      }
    }

    return NextResponse.json({
      data: {
        past: pastMeetings,
        upcoming: upcomingMeetings,
        total: relevantEvents.length,
      },
    });
  } catch (error) {
    console.error("GET /api/calendar/meetings error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
