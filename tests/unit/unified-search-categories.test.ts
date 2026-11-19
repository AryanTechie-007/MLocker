import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchMedia } from "@/lib/api/unified-search";
import * as tmdb from "@/lib/api/tmdb";
import * as itunes from "@/lib/api/itunes";
import * as tvmaze from "@/lib/api/tvmaze";
import * as kitsu from "@/lib/api/kitsu";
import * as steam from "@/lib/api/steam";
import * as openLibrary from "@/lib/api/openLibrary";
import { MediaSearchResult } from "@/lib/api/types";

vi.mock("@/lib/api/tmdb", () => ({
  searchTMDBMovies: vi.fn(),
  searchTMDBTV: vi.fn(),
  searchTMDBAnime: vi.fn(),
}));

vi.mock("@/lib/api/itunes", () => ({
  searchMovies: vi.fn(),
}));

vi.mock("@/lib/api/tvmaze", () => ({
  searchTV: vi.fn(),
}));

vi.mock("@/lib/api/kitsu", () => ({
  searchAnime: vi.fn(),
  searchManga: vi.fn(),
}));

vi.mock("@/lib/api/steam", () => ({
  searchGames: vi.fn(),
}));

vi.mock("@/lib/api/openLibrary", () => ({
  searchBooks: vi.fn(),
}));

describe("Unified Search: Six Media Categories & Resilience", () => {
  const originalEnv = process.env;

  const mockMovie: MediaSearchResult = {
    externalId: "m1",
    externalSource: "tmdb",
    mediaType: "movie",
    title: "Akira Movie",
    posterUrl: "https://image.tmdb.org/m1.jpg",
    year: 1988,
    genres: ["Animation", "Sci-Fi"],
    overview: "Classic anime film.",
    externalRating: 8.1,
  };

  const mockTV: MediaSearchResult = {
    externalId: "tv1",
    externalSource: "tmdb",
    mediaType: "tv",
    title: "Cowboy Bebop Series",
    posterUrl: "https://image.tmdb.org/tv1.jpg",
    year: 1998,
    genres: ["Sci-Fi", "Action"],
    overview: "Space western series.",
    externalRating: 8.9,
  };

  const mockTmdbAnime: MediaSearchResult = {
    externalId: "a1",
    externalSource: "tmdb",
    mediaType: "anime",
    title: "Attack on Titan",
    posterUrl: "https://image.tmdb.org/a1.jpg",
    year: 2013,
    genres: ["Animation", "Action"],
    overview: "Titans attack humanity.",
    externalRating: 9.0,
  };

  const mockKitsuAnime: MediaSearchResult = {
    externalId: "ka1",
    externalSource: "kitsu",
    mediaType: "anime",
    title: "Attack on Titan (Kitsu)",
    posterUrl: "https://kitsu.io/ka1.jpg",
    year: 2013,
    genres: ["Action"],
    overview: "Humanity fights Titans.",
    externalRating: 8.5,
  };

  const mockManga: MediaSearchResult = {
    externalId: "mg1",
    externalSource: "kitsu",
    mediaType: "manga",
    title: "Berserk Manga",
    posterUrl: "https://kitsu.io/mg1.jpg",
    year: 1989,
    genres: ["Dark Fantasy"],
    overview: "Guts journey.",
    externalRating: 9.3,
  };

  const mockGame: MediaSearchResult = {
    externalId: "g1",
    externalSource: "steam",
    mediaType: "game",
    title: "Elden Ring",
    posterUrl: "https://steam.com/g1.jpg",
    year: 2022,
    genres: ["RPG", "Action"],
    overview: "Souls-like game.",
    externalRating: 9.4,
  };

  const mockNovel: MediaSearchResult = {
    externalId: "n1",
    externalSource: "openlibrary",
    mediaType: "novel",
    title: "Dune",
    posterUrl: "https://covers.openlibrary.org/b/id/n1.jpg",
    year: 1965,
    genres: ["Science Fiction"],
    overview: "Frank Herbert masterpiece.",
    externalRating: 8.8,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, TMDB_API_KEY: "test-tmdb-key" };

    vi.mocked(tmdb.searchTMDBMovies).mockResolvedValue([mockMovie]);
    vi.mocked(tmdb.searchTMDBTV).mockResolvedValue([mockTV]);
    vi.mocked(tmdb.searchTMDBAnime).mockResolvedValue([mockTmdbAnime]);
    vi.mocked(itunes.searchMovies).mockResolvedValue([]);
    vi.mocked(tvmaze.searchTV).mockResolvedValue([]);
    vi.mocked(kitsu.searchAnime).mockResolvedValue([mockKitsuAnime]);
    vi.mocked(kitsu.searchManga).mockResolvedValue([mockManga]);
    vi.mocked(steam.searchGames).mockResolvedValue([mockGame]);
    vi.mocked(openLibrary.searchBooks).mockResolvedValue([mockNovel]);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("Category-Specific Dispatches", () => {
    it("dispatches dedicated search for 'movie' only", async () => {
      const results = await searchMedia("Akira", "movie");
      expect(tmdb.searchTMDBMovies).toHaveBeenCalledWith("Akira");
      expect(tmdb.searchTMDBTV).not.toHaveBeenCalled();
      expect(tmdb.searchTMDBAnime).not.toHaveBeenCalled();
      expect(kitsu.searchManga).not.toHaveBeenCalled();
      expect(steam.searchGames).not.toHaveBeenCalled();
      expect(openLibrary.searchBooks).not.toHaveBeenCalled();

      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.mediaType === "movie")).toBe(true);
    });

    it("dispatches dedicated search for 'tv' only", async () => {
      const results = await searchMedia("Cowboy Bebop", "tv");
      expect(tmdb.searchTMDBTV).toHaveBeenCalledWith("Cowboy Bebop");
      expect(tmdb.searchTMDBMovies).not.toHaveBeenCalled();
      expect(kitsu.searchManga).not.toHaveBeenCalled();
      expect(openLibrary.searchBooks).not.toHaveBeenCalled();

      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.mediaType === "tv")).toBe(true);
    });

    it("dispatches dedicated search for 'game' only", async () => {
      const results = await searchMedia("Elden Ring", "game");
      expect(steam.searchGames).toHaveBeenCalledWith("Elden Ring");
      expect(tmdb.searchTMDBMovies).not.toHaveBeenCalled();
      expect(kitsu.searchManga).not.toHaveBeenCalled();
      expect(openLibrary.searchBooks).not.toHaveBeenCalled();

      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.mediaType === "game")).toBe(true);
    });

    it("dispatches dedicated search for 'manga' only to Kitsu manga", async () => {
      const results = await searchMedia("Berserk", "manga");
      expect(kitsu.searchManga).toHaveBeenCalledWith("Berserk");
      expect(tmdb.searchTMDBMovies).not.toHaveBeenCalled();
      expect(tmdb.searchTMDBTV).not.toHaveBeenCalled();
      expect(tmdb.searchTMDBAnime).not.toHaveBeenCalled();
      expect(steam.searchGames).not.toHaveBeenCalled();
      expect(openLibrary.searchBooks).not.toHaveBeenCalled();

      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.mediaType === "manga")).toBe(true);
      expect(results[0].externalSource).toBe("kitsu");
    });

    it("dispatches dedicated search for 'novel' only to Open Library", async () => {
      const results = await searchMedia("Dune", "novel");
      expect(openLibrary.searchBooks).toHaveBeenCalledWith("Dune");
      expect(tmdb.searchTMDBMovies).not.toHaveBeenCalled();
      expect(tmdb.searchTMDBTV).not.toHaveBeenCalled();
      expect(kitsu.searchManga).not.toHaveBeenCalled();
      expect(steam.searchGames).not.toHaveBeenCalled();

      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.mediaType === "novel")).toBe(true);
      expect(results[0].externalSource).toBe("openlibrary");
    });

    it("normalizes 'book' alias to 'novel' and dispatches to Open Library", async () => {
      const results = await searchMedia("Dune", "book");
      expect(openLibrary.searchBooks).toHaveBeenCalledWith("Dune");
      expect(tmdb.searchTMDBMovies).not.toHaveBeenCalled();
      expect(kitsu.searchManga).not.toHaveBeenCalled();

      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.mediaType === "novel")).toBe(true);
      expect(results[0].externalSource).toBe("openlibrary");
    });
  });

  describe("Anime Search: TMDb Primary with Kitsu Fallback", () => {
    it("uses TMDb anime search when TMDB_API_KEY is present and TMDb returns results", async () => {
      const results = await searchMedia("Attack on Titan", "anime");
      expect(tmdb.searchTMDBAnime).toHaveBeenCalledWith("Attack on Titan");
      expect(kitsu.searchAnime).not.toHaveBeenCalled();
      expect(results[0].externalSource).toBe("tmdb");
      expect(results[0].title).toBe("Attack on Titan");
    });

    it("falls back to Kitsu anime search when TMDB_API_KEY is missing", async () => {
      delete process.env.TMDB_API_KEY;

      const results = await searchMedia("Attack on Titan", "anime");
      expect(tmdb.searchTMDBAnime).not.toHaveBeenCalled();
      expect(kitsu.searchAnime).toHaveBeenCalledWith("Attack on Titan");
      expect(results[0].externalSource).toBe("kitsu");
      expect(results[0].title).toBe("Attack on Titan (Kitsu)");
    });

    it("falls back to Kitsu anime search when TMDb returns empty array", async () => {
      vi.mocked(tmdb.searchTMDBAnime).mockResolvedValue([]);

      const results = await searchMedia("Attack on Titan", "anime");
      expect(tmdb.searchTMDBAnime).toHaveBeenCalledWith("Attack on Titan");
      expect(kitsu.searchAnime).toHaveBeenCalledWith("Attack on Titan");
      expect(results[0].externalSource).toBe("kitsu");
      expect(results[0].title).toBe("Attack on Titan (Kitsu)");
    });

    it("falls back to Kitsu anime search when TMDb throws an error", async () => {
      vi.mocked(tmdb.searchTMDBAnime).mockRejectedValue(new Error("TMDb 500 Internal Server Error"));

      const results = await searchMedia("Attack on Titan", "anime");
      expect(tmdb.searchTMDBAnime).toHaveBeenCalledWith("Attack on Titan");
      expect(kitsu.searchAnime).toHaveBeenCalledWith("Attack on Titan");
      expect(results.length).toBe(1);
      expect(results[0].externalSource).toBe("kitsu");
    });

    it("returns empty array gracefully when both TMDb and Kitsu fail", async () => {
      vi.mocked(tmdb.searchTMDBAnime).mockRejectedValue(new Error("TMDb down"));
      vi.mocked(kitsu.searchAnime).mockRejectedValue(new Error("Kitsu down"));

      const results = await searchMedia("Attack on Titan", "anime");
      expect(results).toEqual([]);
    });
  });

  describe("Unified 'all' Search: Six-Way Concurrent Dispatch & Resilience", () => {
    it("calls all six category providers concurrently when category is 'all'", async () => {
      const results = await searchMedia("Search Query", "all");

      expect(tmdb.searchTMDBMovies).toHaveBeenCalledWith("Search Query");
      expect(tmdb.searchTMDBTV).toHaveBeenCalledWith("Search Query");
      expect(tmdb.searchTMDBAnime).toHaveBeenCalledWith("Search Query");
      expect(kitsu.searchManga).toHaveBeenCalledWith("Search Query");
      expect(steam.searchGames).toHaveBeenCalledWith("Search Query");
      expect(openLibrary.searchBooks).toHaveBeenCalledWith("Search Query");

      const types = results.map((r) => r.mediaType);
      expect(types).toContain("movie");
      expect(types).toContain("tv");
      expect(types).toContain("anime");
      expect(types).toContain("manga");
      expect(types).toContain("game");
      expect(types).toContain("novel");
    });

    it("defaults to 'all' six categories when type parameter is omitted", async () => {
      const results = await searchMedia("Search Query");

      expect(tmdb.searchTMDBMovies).toHaveBeenCalledWith("Search Query");
      expect(tmdb.searchTMDBTV).toHaveBeenCalledWith("Search Query");
      expect(kitsu.searchManga).toHaveBeenCalledWith("Search Query");
      expect(steam.searchGames).toHaveBeenCalledWith("Search Query");
      expect(openLibrary.searchBooks).toHaveBeenCalledWith("Search Query");
      expect(results.length).toBeGreaterThan(0);
    });

    it("continues and returns remaining results when individual providers fail", async () => {
      // Simulate Open Library throwing 503 and Kitsu Manga timing out
      vi.mocked(openLibrary.searchBooks).mockRejectedValue(new Error("OpenLibrary 503 Service Unavailable"));
      vi.mocked(kitsu.searchManga).mockRejectedValue(new Error("Kitsu ETIMEDOUT"));

      const results = await searchMedia("Search Query", "all");

      // Other 4 providers must still contribute results
      expect(results.length).toBeGreaterThan(0);
      const types = results.map((r) => r.mediaType);
      expect(types).toContain("movie");
      expect(types).toContain("tv");
      expect(types).toContain("anime");
      expect(types).toContain("game");
      expect(types).not.toContain("manga");
      expect(types).not.toContain("novel");
    });
  });

  describe("Category Isolation and Deduplication", () => {
    it("preserves identical titles across different categories", async () => {
      const sharedTitle = "Cyberpunk";
      const gameCyberpunk: MediaSearchResult = {
        ...mockGame,
        title: sharedTitle,
      };
      const animeCyberpunk: MediaSearchResult = {
        ...mockTmdbAnime,
        title: sharedTitle,
      };

      vi.mocked(steam.searchGames).mockResolvedValue([gameCyberpunk]);
      vi.mocked(tmdb.searchTMDBAnime).mockResolvedValue([animeCyberpunk]);
      vi.mocked(tmdb.searchTMDBMovies).mockResolvedValue([]);
      vi.mocked(tmdb.searchTMDBTV).mockResolvedValue([]);
      vi.mocked(kitsu.searchManga).mockResolvedValue([]);
      vi.mocked(openLibrary.searchBooks).mockResolvedValue([]);

      const results = await searchMedia(sharedTitle, "all");
      const matched = results.filter((r) => r.title === sharedTitle);
      expect(matched.length).toBe(2);
      expect(matched.map((r) => r.mediaType).sort()).toEqual(["anime", "game"]);
    });
  });
});
