import { describe, it, expect, vi } from "vitest";

vi.mock("next-auth", () => ({
  default: vi.fn(() => ({
    auth: vi.fn((fn: any) => fn),
  })),
}));
vi.mock("@/lib/auth", () => ({
  auth: vi.fn((fn: any) => fn),
}));

import { handleProxyRequest } from "@/proxy";

describe("Milestone S-5 — Proxy Route Protection Suite", () => {
  const origin = "http://localhost:3000";

  function createMockRequest(pathname: string, auth: unknown = null, search = "") {
    return {
      auth,
      nextUrl: {
        pathname,
        search,
        origin,
      },
      url: `${origin}${pathname}${search}`,
    };
  }

  describe("1. Unauthenticated Page Access", () => {
    it("redirects unauthenticated root page access (/) to /login", () => {
      const req = createMockRequest("/");
      const res = handleProxyRequest(req);

      expect(res.status).toBe(307);
      const location = res.headers.get("location");
      expect(location).toContain("/login?callbackUrl=%2F");
    });

    it("redirects unauthenticated /library access to /login", () => {
      const req = createMockRequest("/library");
      const res = handleProxyRequest(req);

      expect(res.status).toBe(307);
      const location = res.headers.get("location");
      expect(location).toContain("/login?callbackUrl=%2Flibrary");
    });

    it("preserves query parameters in callbackUrl upon redirect", () => {
      const req = createMockRequest("/media/clx123abc", null, "?tab=sources");
      const res = handleProxyRequest(req);

      expect(res.status).toBe(307);
      const location = res.headers.get("location");
      expect(location).toContain("/login?callbackUrl=%2Fmedia%2Fclx123abc%3Ftab%3Dsources");
    });

    it("redirects unauthenticated /collections access to /login", () => {
      const req = createMockRequest("/collections");
      const res = handleProxyRequest(req);

      expect(res.status).toBe(307);
      const location = res.headers.get("location");
      expect(location).toContain("/login?callbackUrl=%2Fcollections");
    });

    it("redirects unauthenticated /media/:id detail access to /login", () => {
      const req = createMockRequest("/media/clx123abc");
      const res = handleProxyRequest(req);

      expect(res.status).toBe(307);
      const location = res.headers.get("location");
      expect(location).toContain("/login?callbackUrl=%2Fmedia%2Fclx123abc");
    });
  });

  describe("2. Unauthenticated API Boundary Access", () => {
    it("returns JSON 401 Unauthorized for unauthenticated API requests", async () => {
      const req = createMockRequest("/api/media");
      const res = handleProxyRequest(req);

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toEqual({
        error: "Unauthorized",
        code: "UNAUTHORIZED",
      });
    });

    it("returns JSON 401 Unauthorized for /api/stats requests", async () => {
      const req = createMockRequest("/api/stats");
      const res = handleProxyRequest(req);

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.code).toBe("UNAUTHORIZED");
    });
  });

  describe("3. Public Route Access", () => {
    it("allows unauthenticated access to /login without redirecting", () => {
      const req = createMockRequest("/login");
      const res = handleProxyRequest(req);

      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    });

    it("allows unauthenticated access to NextAuth handlers under /api/auth", () => {
      const req = createMockRequest("/api/auth/callback/credentials");
      const res = handleProxyRequest(req);

      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    });
  });

  describe("4. Authenticated User Flow", () => {
    const mockAuthSession = { user: { id: "usr_1", email: "test@example.com" } };

    it("allows authenticated user to access protected pages", () => {
      const req = createMockRequest("/library", mockAuthSession);
      const res = handleProxyRequest(req);

      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    });

    it("redirects authenticated user from /login back to home (/)", () => {
      const req = createMockRequest("/login", mockAuthSession);
      const res = handleProxyRequest(req);

      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe(`${origin}/`);
    });

    it("allows authenticated user to access API routes", () => {
      const req = createMockRequest("/api/media", mockAuthSession);
      const res = handleProxyRequest(req);

      expect(res.status).toBe(200);
    });
  });
});
