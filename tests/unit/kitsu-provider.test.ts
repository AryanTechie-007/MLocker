import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchAnime, searchManga } from "@/lib/api/kitsu";

describe("Kitsu Provider: searchAnime", () => {
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

    expect(await searchAnime("")).toEqual([]);
    expect(await searchAnime("   ")).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("parses valid Kitsu anime response into MediaSearchResult items", async () => {
    const mockKitsuResponse = {
      data: [
        {
          id: "123",
          attributes: {
            canonicalTitle: "Attack on Titan",
            titles: { en: "Attack on Titan", en_jp: "Shingeki no Kyojin" },
            posterImage: {
              large: "https://media.kitsu.io/anime/poster/123/large.jpg",
              medium: "https://media.kitsu.io/anime/poster/123/medium.jpg",
            },
            startDate: "2013-04-07",
            synopsis: "Humans fight against man-eating giants.",
            averageRating: "85.4",
            episodeCount: 25,
          },
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockKitsuResponse,
    });

    const results = await searchAnime("Attack on Titan");
    expect(results.length).toBe(1);
    expect(results[0]).toEqual({
      externalId: "123",
      externalSource: "kitsu",
      mediaType: "anime",
      title: "Attack on Titan",
      posterUrl: "https://media.kitsu.io/anime/poster/123/large.jpg",
      year: 2013,
      genres: ["Anime"],
      overview: "Humans fight against man-eating giants.",
      externalRating: 8.5, // 85.4 / 10 -> rounded to 1 decimal
      totalEpisodes: 25,
    });
  });

  it("handles non-200 HTTP responses gracefully by returning empty array", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const results = await searchAnime("Server Error Show");
    expect(results).toEqual([]);
  });

  it("handles network errors / exceptions gracefully without throwing", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network timeout"));

    const results = await searchAnime("Network Down");
    expect(results).toEqual([]);
  });

  it("handles missing attributes gracefully in response items", async () => {
    const mockIncompleteItem = {
      data: [
        {
          id: "999",
          attributes: {},
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockIncompleteItem,
    });

    const results = await searchAnime("Fallback Title");
    expect(results.length).toBe(1);
    expect(results[0].externalId).toBe("999");
    expect(results[0].title).toBe("Fallback Title");
    expect(results[0].posterUrl).toBeNull();
    expect(results[0].year).toBeNull();
    expect(results[0].externalRating).toBeNull();
    expect(results[0].totalEpisodes).toBeUndefined();
  });
});

describe("Kitsu Provider: searchManga", () => {
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

    expect(await searchManga("")).toEqual([]);
    expect(await searchManga("   \t  ")).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("parses valid Kitsu manga response into MediaSearchResult items", async () => {
    const mockMangaResponse = {
      data: [
        {
          id: "456",
          attributes: {
            canonicalTitle: "Berserk",
            posterImage: {
              large: "https://media.kitsu.io/manga/poster/456/large.jpg",
            },
            startDate: "1989-08-25",
            synopsis: "Guts is a skilled swordsman who joins the Band of the Hawk.",
            averageRating: "90.2",
            chapterCount: 364,
          },
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockMangaResponse,
    });

    const results = await searchManga("Berserk");
    expect(results.length).toBe(1);
    expect(results[0]).toEqual({
      externalId: "456",
      externalSource: "kitsu",
      mediaType: "manga",
      title: "Berserk",
      posterUrl: "https://media.kitsu.io/manga/poster/456/large.jpg",
      year: 1989,
      genres: ["Manga"],
      overview: "Guts is a skilled swordsman who joins the Band of the Hawk.",
      externalRating: 9,
      totalChapters: 364,
    });
  });

  it("handles non-200 HTTP responses gracefully by returning empty array", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });

    const results = await searchManga("Missing Manga");
    expect(results).toEqual([]);
  });

  it("handles fetch rejection gracefully", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Connection refused"));

    const results = await searchManga("Failed Request");
    expect(results).toEqual([]);
  });
});
