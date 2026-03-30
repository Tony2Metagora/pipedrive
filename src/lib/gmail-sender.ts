export interface GmailAuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

interface RefreshResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
}

function encodeBase64Url(input: string): string {
  return Buffer.from(input, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function buildRawMessage({
  to,
  subject,
  text,
  html,
}: {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}): string {
  const safeSubject = (subject || "").replace(/\r?\n/g, " ").trim();
  const plainText = (text || "").replace(/\r/g, "");
  const htmlBody = html?.replace(/\r/g, "");

  if (!htmlBody) {
    return [
      "MIME-Version: 1.0",
      `To: ${to}`,
      `Subject: ${safeSubject}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "",
      plainText,
    ].join("\r\n");
  }

  const boundary = `boundary_${Date.now()}`;
  return [
    "MIME-Version: 1.0",
    `To: ${to}`,
    `Subject: ${safeSubject}`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    plainText || " ",
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "",
    htmlBody,
    "",
    `--${boundary}--`,
  ].join("\r\n");
}

export async function refreshGoogleToken(token: GmailAuthToken): Promise<GmailAuthToken | null> {
  if (!token.refreshToken) return null;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      grant_type: "refresh_token",
      refresh_token: token.refreshToken,
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as RefreshResponse;
  if (!response.ok || !payload.access_token || !payload.expires_in) return null;
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? token.refreshToken,
    expiresAt: Date.now() + payload.expires_in * 1000,
  };
}

export async function ensureValidGoogleToken(token: GmailAuthToken): Promise<GmailAuthToken | null> {
  if (!token.accessToken) return null;
  if (token.expiresAt && Date.now() < token.expiresAt - 60_000) return token;
  const refreshed = await refreshGoogleToken(token);
  return refreshed ?? token;
}

export async function sendGmailMessage(
  authToken: GmailAuthToken,
  payload: { to: string; subject: string; text?: string; html?: string }
): Promise<{ id: string; threadId: string; token: GmailAuthToken }> {
  const token = await ensureValidGoogleToken(authToken);
  if (!token?.accessToken) throw new Error("Gmail token indisponible");

  const raw = buildRawMessage(payload);
  const sendRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: encodeBase64Url(raw) }),
  });

  const body = (await sendRes.json().catch(() => ({}))) as {
    id?: string;
    threadId?: string;
    error?: { message?: string; status?: string; code?: number; errors?: Array<{ reason?: string }> };
  };
  if (!sendRes.ok) {
    const reason = body.error?.errors?.[0]?.reason || "";
    const detail = body.error?.message || "";
    throw new Error(`Gmail send failed: ${sendRes.status} ${reason} ${detail}`.trim());
  }

  return {
    id: body.id || "",
    threadId: body.threadId || "",
    token,
  };
}

