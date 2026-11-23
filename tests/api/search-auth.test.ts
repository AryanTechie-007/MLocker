import { describe, it, expect, vi, beforeEach } from "vitest";

let mockUserId: string | null = null;
vi.mock("@/lib/get-user", () => ({
  getUserId: vi.fn(async () => mockUserId),
  getOrCreateUserId: vi.fn(async () => mockUserId),
}));

vi.mock("@/lib/api/unified-search", () => ({
  searchMedia: vi.fn(async (q: string, type: string) => [
    {
      externalId: "ext-1",
      externalSource: "tmdb",
      mediaType: type === "all" ? "movie" : type,
      title: `Search Result for ${q}`,
    },
  ]),
}));

import { GET as searchHandler } from "@/app/api/search/route";

describe("Milestone 3 / Audit S-3: /api/search Authentication & Protection", () => {
  beforeEach(() => {
    mockUserId = null;
    vi.clearAllMocks();
  });

  it("strictly rejects unauthenticated requests with 401 Unauthorized", async () => {
    mockUserId = null;

    const req = new Request("http://localhost/api/search?q=Inception&type=all");
    const res = await searchHandler(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("Unauthorized");
    expect(body.code).toBe("UNAUTHORIZED");
  });

  it("permits authenticated users to perform searches", async () => {
    mockUserId = "usr_authenticated_123";

    const req = new Request("http://localhost/api/search?q=Inception&type=movie");
    const res = await searchHandler(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toBeDefined();
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results[0].title).toBe("Search Result for Inception");
  });

  it("returns empty results array when query is empty whitespace", async () => {
    mockUserId = "usr_authenticated_123";

    const req = new Request("http://localhost/api/search?q=   &type=movie");
    const res = await searchHandler(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toEqual([]);
  });

  it("returns 400 Validation Error when media type is invalid", async () => {
    mockUserId = "usr_authenticated_123";

    const req = new Request("http://localhost/api/search?q=Inception&type=invalid_category");
    const res = await searchHandler(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });
});
