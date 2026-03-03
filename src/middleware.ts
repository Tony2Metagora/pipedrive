/**
 * Middleware NextAuth v5 — protège toutes les routes sauf /login et /api/auth.
 * NOTE : Auth temporairement désactivée tant que Google OAuth n'est pas configuré.
 * Décommenter le code ci-dessous quand les GOOGLE_CLIENT_ID/SECRET seront renseignés.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(_req: NextRequest) {
  // Auth désactivée temporairement — tout le monde a accès
  return NextResponse.next();
}

/*
// --- VERSION AVEC AUTH (à activer plus tard) ---
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  if (!req.auth) {
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});
*/

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
