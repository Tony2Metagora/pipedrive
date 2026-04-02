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

function encodeMimeWordUtf8(input: string): string {
  // RFC 2047 encoded-word (B-encoding) for non-ASCII headers (e.g., Subject).
  return `=?UTF-8?B?${Buffer.from(input, "utf-8").toString("base64")}?=`;
}

function encodeHeaderValue(input: string): string {
  const cleaned = (input || "").replace(/\r?\n/g, " ").trim();
  if (!cleaned) return "";
  return /[^\x20-\x7E]/.test(cleaned) ? encodeMimeWordUtf8(cleaned) : cleaned;
}

function encodeBodyBase64(input: string): string {
  // Use base64 transfer encoding so all UTF-8 characters are transported safely.
  const base64 = Buffer.from(input, "utf-8").toString("base64");
  // Fold lines to keep MIME body lines reasonably short.
  return base64.replace(/.{1,76}/g, "$&\r\n").replace(/\r\n$/, "");
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
  const safeSubject = encodeHeaderValue(subject || "");
  const safeTo = encodeHeaderValue(to || "");
  const plainText = (text || "").replace(/\r/g, "");
  const htmlBody = html?.replace(/\r/g, "");
  const encodedTextBody = encodeBodyBase64(plainText);
  const encodedHtmlBody = htmlBody ? encodeBodyBase64(htmlBody) : "";

  if (!htmlBody) {
    return [
      "MIME-Version: 1.0",
      `To: ${safeTo}`,
      `Subject: ${safeSubject}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      encodedTextBody,
    ].join("\r\n");
  }

  const boundary = `boundary_${Date.now()}`;
  return [
    "MIME-Version: 1.0",
    `To: ${safeTo}`,
    `Subject: ${safeSubject}`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    encodedTextBody || encodeBodyBase64(" "),
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    encodedHtmlBody,
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

