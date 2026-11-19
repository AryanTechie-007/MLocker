import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchBooks } from "@/lib/api/openLibrary";

describe("Open Library Provider: searchBooks", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns empty array immediately when query is empty or whitespace", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy;

    expect(await searchBooks("")).toEqual([]);
    expect(await searchBooks("    ")).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("parses valid Open Library response into canonical novel MediaSearchResult items", async () => {
    const mockOpenLibResponse = {
      docs: [
        {
          key: "/works/OL12345W",
          title: "Dune",
          first_publish_year: 1965,
          cover_i: 987654,
          author_name: ["Frank Herbert"],
          subject: ["Science Fiction", "Desert", "Space Opera"],
          ratings_average: 4.45,
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockOpenLibResponse,
    });

    const results = await searchBooks("Dune");
    expect(results.length).toBe(1);
    expect(results[0]).toEqual({
      externalId: "OL12345W",
      externalSource: "openlibrary",
      mediaType: "novel", // Decision 1: canonical identifier is "novel"
      title: "Dune",
      posterUrl: "https://covers.openlibrary.org/b/id/987654-L.jpg",
      year: 1965,
      genres: ["Science Fiction", "Desert", "Space Opera"],
      overview: "By Frank Herbert",
      externalRating: 8.9, // 4.45 * 2 = 8.9 / 10
    });
  });

  it("handles missing cover image, author, and subjects gracefully", async () => {
    const mockMinimalResponse = {
      docs: [
        {
          key: "/works/OL99999W",
          title: "Indie Pamphlet",
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockMinimalResponse,
    });

    const results = await searchBooks("Indie Pamphlet");
    expect(results.length).toBe(1);
    expect(results[0].externalId).toBe("OL99999W");
    expect(results[0].mediaType).toBe("novel");
    expect(results[0].posterUrl).toBeNull();
    expect(results[0].year).toBeNull();
    expect(results[0].genres).toEqual([]);
    expect(results[0].overview).toBe("");
    expect(results[0].externalRating).toBeNull();
  });

  it("handles non-200 HTTP response gracefully by returning empty array", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    });

    const results = await searchBooks("Unavailable Service");
    expect(results).toEqual([]);
  });

  it("handles network error gracefully by returning empty array", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Connection reset"));

    const results = await searchBooks("Offline Network");
    expect(results).toEqual([]);
  });
});
