import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export interface ProxyRequestLike {
  auth?: unknown;
  nextUrl: {
    pathname: string;
    search?: string;
    origin: string;
  };
  url: string;
}

/**
 * Pure handler for route authorization and unauthenticated redirects (S-5)
 */
export function handleProxyRequest(req: ProxyRequestLike): NextResponse {
  const isLoggedIn = Boolean(req.auth);
  const { pathname } = req.nextUrl;

  const isPublicRoute =
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth");

  if (!isLoggedIn && !isPublicRoute) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }
    const loginUrl = new URL("/login", req.nextUrl.origin);
    const callback = `${pathname}${req.nextUrl.search || ""}`;
    loginUrl.searchParams.set("callbackUrl", callback);
    return NextResponse.redirect(loginUrl);
  }

  if (isLoggedIn && pathname === "/login") {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }

  return NextResponse.next();
}

/**
 * Next.js 16 Proxy entrypoint wrapping NextAuth v5 session resolution
 */
export const proxy = auth((req: NextRequest & { auth?: unknown }) => {
  return handleProxyRequest(req);
});

export default proxy;

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
