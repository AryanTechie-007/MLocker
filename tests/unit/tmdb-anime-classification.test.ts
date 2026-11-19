import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkIsAnime, searchTMDBAnime } from "@/lib/api/tmdb";

describe("TMDb Anime Classification and Fallback Boundary", () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv, TMDB_API_KEY: "mock-tmdb-key" };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  describe("checkIsAnime classifier", () => {
    it("confirms genuine Japanese animation as anime", () => {
      // Attack on Titan
      expect(
        checkIsAnime("Attack on Titan", "Humanity fights giant Titans behind massive walls.", [16, 10759], "ja")
      ).toBe(true);

      // Spirited Away
      expect(
        checkIsAnime("Spirited Away", "A young girl enters a world ruled by gods and spirits.", [16, 14], "ja")
      ).toBe(true);
    });

    it("confirms animation with recognized anime studios or keywords as anime", () => {
      // Animation with Studio Trigger or anime keywords
      expect(
        checkIsAnime("Promare", "A futuristic firefighting anime film by Studio Trigger.", [16, 28], "en")
      ).toBe(true);

      // Cyberpunk Edgerunners franchise title
      expect(
        checkIsAnime("Cyberpunk: Edgerunners", "A street kid trying to survive in Night City.", [16, 10759], "en")
      ).toBe(true);
    });

    it("strictly rejects ordinary western live-action movies and TV shows", () => {
      // The Dark Knight
      expect(
        checkIsAnime("The Dark Knight", "Batman raises the stakes in his war on crime.", [28, 80, 18], "en")
      ).toBe(false);

      // Breaking Bad
      expect(
        checkIsAnime("Breaking Bad", "A high school chemistry teacher diagnosed with cancer.", [18, 80], "en")
      ).toBe(false);

      // The Office
      expect(
        checkIsAnime("The Office", "A mockumentary on a group of typical office workers.", [35], "en")
      ).toBe(false);
    });

    it("strictly rejects ordinary western animation without anime origin or keywords", () => {
      // The Simpsons
      expect(
        checkIsAnime("The Simpsons", "The satiric adventures of a working-class family in Springfield.", [16, 35], "en")
      ).toBe(false);

      // Family Guy
      expect(
        checkIsAnime("Family Guy", "Sick, twisted and politically incorrect animated series.", [16, 35], "en")
      ).toBe(false);
    });

    it("strictly rejects ordinary Japanese live-action films without anime/manga markers", () => {
      // Drive My Car (Oscar-winning live-action Japanese drama)
      expect(
        checkIsAnime("Drive My Car", "An aging theater director directs Uncle Vanya in Hiroshima.", [18], "ja")
      ).toBe(false);

      // Seven Samurai (Classic live-action Japanese action film)
      expect(
        checkIsAnime("Seven Samurai", "A samurai defends a village from bandits.", [28, 18], "ja")
      ).toBe(false);

      // Godzilla Minus One (Live-action kaiju movie)
      expect(
        checkIsAnime("Godzilla Minus One", "Post-war Japan is at its lowest point when Godzilla appears.", [28, 878], "ja")
      ).toBe(false);
    });
  });

  describe("searchTMDBAnime: Pure Classified Output & Zero Leakage", () => {
    it("returns genuine classified anime results with mediaType: 'anime'", async () => {
      const mockTvResponse = {
        results: [
          {
            id: 1429,
            name: "Attack on Titan",
            overview: "Humanity fights Titans.",
            genre_ids: [16, 10759],
            original_language: "ja",
            poster_path: "/titan.jpg",
            first_air_date: "2013-04-07",
            vote_average: 8.6,
          },
        ],
      };

      const mockMovieResponse = { results: [] };

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/search/tv")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockTvResponse),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockMovieResponse),
        });
      });

      const results = await searchTMDBAnime("Attack on Titan");
      expect(results.length).toBe(1);
      expect(results[0].title).toBe("Attack on Titan");
      expect(results[0].mediaType).toBe("anime");
      expect(results[0].externalSource).toBe("tmdb");
    });

    it("returns empty array when TMDb only produces non-anime results (no fallback to ordinary TV/movie)", async () => {
      // Simulate TMDb returning ordinary non-anime shows for a search like "The Office" or "Friends"
      const mockTvResponse = {
        results: [
          {
            id: 2316,
            name: "The Office",
            overview: "A mockumentary about office workers.",
            genre_ids: [35],
            original_language: "en",
            poster_path: "/office.jpg",
            first_air_date: "2005-03-24",
            vote_average: 8.6,
          },
          {
            id: 1668,
            name: "Friends",
            overview: "Six friends in Manhattan.",
            genre_ids: [35, 18],
            original_language: "en",
            poster_path: "/friends.jpg",
            first_air_date: "1994-09-22",
            vote_average: 8.5,
          },
        ],
      };

      const mockMovieResponse = {
        results: [
          {
            id: 27205,
            title: "Inception",
            overview: "A thief enters people dreams.",
            genre_ids: [28, 878],
            original_language: "en",
            poster_path: "/inception.jpg",
            release_date: "2010-07-16",
            vote_average: 8.4,
          },
        ],
      };

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/search/tv")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockTvResponse),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockMovieResponse),
        });
      });

      const results = await searchTMDBAnime("Non-Anime Query");
      // MUST NOT return The Office, Friends, or Inception labeled as anime!
      expect(results).toEqual([]);
    });

    it("returns empty array when TMDb returns no results", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      });

      const results = await searchTMDBAnime("Completely Unknown Anime");
      expect(results).toEqual([]);
    });
  });
});
