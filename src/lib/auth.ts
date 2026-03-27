/**
 * Configuration NextAuth v5 — authentification Google OAuth.
 * Restreint aux emails @metagora.tech.
 */

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { ALLOWED_DOMAINS } from "./config";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

type GoogleJwtToken = Record<string, unknown> & {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  error?: string;
};

async function refreshGoogleAccessToken(token: GoogleJwtToken): Promise<GoogleJwtToken> {
  if (!token.refreshToken) {
    return { ...token, error: "RefreshTokenMissing" };
  }

  try {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
      }),
    });

    const refreshed = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      refresh_token?: string;
    };

    if (!response.ok || !refreshed.access_token || !refreshed.expires_in) {
      return { ...token, error: "RefreshAccessTokenError" };
    }

    return {
      ...token,
      accessToken: refreshed.access_token,
      expiresAt: Date.now() + refreshed.expires_in * 1000,
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
      error: undefined,
    };
  } catch {
    return { ...token, error: "RefreshAccessTokenError" };
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  basePath: "/api/auth",
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/calendar.readonly",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      const email = user.email;
      if (!email) return false;
      const domain = email.split("@")[1];
      return ALLOWED_DOMAINS.includes(domain);
    },
    async jwt({ token, account }) {
      const jwtToken = token as GoogleJwtToken;

      if (account) {
        jwtToken.accessToken = account.access_token;
        jwtToken.refreshToken = account.refresh_token ?? jwtToken.refreshToken;
        jwtToken.expiresAt = account.expires_at
          ? account.expires_at * 1000
          : Date.now() + 55 * 60 * 1000;
        return jwtToken;
      }

      if (jwtToken.expiresAt && Date.now() < jwtToken.expiresAt - 60_000) {
        return jwtToken;
      }

      return refreshGoogleAccessToken(jwtToken);
    },
    async session({ session, token }) {
      const jwtToken = token as GoogleJwtToken;
      (session as unknown as Record<string, unknown>).accessToken = jwtToken.accessToken;
      (session as unknown as Record<string, unknown>).refreshToken = jwtToken.refreshToken;
      (session as unknown as Record<string, unknown>).expiresAt = jwtToken.expiresAt;
      (session as unknown as Record<string, unknown>).authError = jwtToken.error;
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
  trustHost: true,
});
