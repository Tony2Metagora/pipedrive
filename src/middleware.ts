/**
 * Middleware — protège toutes les routes sauf /login et /api/auth.
 * Vérifie la présence du cookie de session NextAuth.
 *
 * RBAC enforcement is done at the page/API level (not middleware)
 * because middleware runs on the Edge and cannot call Redis.
 * Middleware only handles authentication (session check).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Routes publiques
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/cron") ||
    pathname.startsWith("/api/sequences/affaires/send-next") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  // Vérifier le cookie de session NextAuth
  const sessionToken =
    req.cookies.get("__Secure-authjs.session-token") ||
    req.cookies.get("authjs.session-token") ||
    req.cookies.get("__Secure-next-auth.session-token") ||
    req.cookies.get("next-auth.session-token");

  if (!sessionToken) {
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
