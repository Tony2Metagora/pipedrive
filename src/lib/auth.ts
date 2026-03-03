/**
 * Configuration NextAuth v5 — authentification Google OAuth.
 * Restreint aux emails @metagora.tech.
 */

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { ALLOWED_DOMAINS } from "./config";

export const { handlers, signIn, signOut, auth } = NextAuth({
  basePath: "/api/auth",
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/gmail.readonly",
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
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
      }
      return token;
    },
    async session({ session, token }) {
      (session as unknown as Record<string, unknown>).accessToken = token.accessToken;
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
