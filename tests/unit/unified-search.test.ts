import { describe, it, expect } from "vitest";
import {
  normalizeString,
  calculateScore,
  sortAndDeduplicate,
  searchMedia,
} from "@/lib/api/unified-search";
import { MediaSearchResult } from "@/lib/api/types";

describe("unified-search: normalizeString", () => {
  it("returns an empty string when given empty, null, or undefined-like input", () => {
    expect(normalizeString("")).toBe("");
    expect(normalizeString(null as unknown as string)).toBe("");
    expect(normalizeString(undefined as unknown as string)).toBe("");
  });

  it("converts uppercase characters to lowercase", () => {
    expect(normalizeString("INTERSTELLAR")).toBe("interstellar");
    expect(normalizeString("SpIdEr-MaN")).toBe("spider man");
  });

  it("removes punctuation, symbols, and special characters", () => {
    expect(normalizeString("Dune: Part Two (2024)! #1")).toBe("dune part two 2024 1");
    expect(normalizeString("Cowboy Bebop - Knockin' on Heaven's Door")).toBe(
      "cowboy bebop knockin on heaven s door"
    );
  });

  it("collapses multiple consecutive whitespace characters and trims boundaries", () => {
    expect(normalizeString("   Attack    on    Titan   ")).toBe("attack on titan");
    expect(normalizeString("\t\nCyberpunk:   2077\n")).toBe("cyberpunk 2077");
  });
});

describe("unified-search: calculateScore", () => {
  const baseItem: MediaSearchResult = {
    externalId: "test-1",
    externalSource: "tmdb",
    mediaType: "movie",
    title: "Interstellar",
    posterUrl: null,
    year: 2014,
    genres: ["Sci-Fi", "Adventure"],
    overview: "A team of explorers travel through a wormhole in space.",
    externalRating: null,
  };

  it("returns 0 if clean query or clean title is empty", () => {
    expect(calculateScore(baseItem, "")).toBe(0);
    expect(calculateScore(baseItem, "   !!!   ")).toBe(0);
    expect(
      calculateScore(
        { ...baseItem, title: "!!!" },
        "Interstellar"
      )
    ).toBe(0);
  });

  it("awards 1000 points for an exact title match", () => {
    const score = calculateScore(baseItem, "Interstellar");
    expect(score).toBe(1000);
  });

  it("awards 750 points for a prefix match", () => {
    const item: MediaSearchResult = {
      ...baseItem,
      title: "Interstellar: The IMAX Experience",
    };
    const score = calculateScore(item, "Interstellar");
    expect(score).toBe(750);
  });

  it("awards 500 points for a non-prefix substring match", () => {
    const item: MediaSearchResult = {
      ...baseItem,
      title: "Beyond Interstellar Space",
    };
    const score = calculateScore(item, "Interstellar");
    expect(score).toBe(500);
  });

  it("awards 400 points when all search tokens are present in title", () => {
    const item: MediaSearchResult = {
      ...baseItem,
      title: "The Fellowship of the Ring",
    };
    // clean query tokens: ["fellowship", "ring"]
    const score = calculateScore(item, "Ring Fellowship");
    expect(score).toBe(400);
  });

  it("awards proportional token points for partial token matches", () => {
    const item: MediaSearchResult = {
      ...baseItem,
      title: "Spider-Man: No Way Home",
    };
    // query has 3 tokens: ["spider", "man", "chronicles"]
    // matched tokens: "spider", "man" (2 out of 3) -> round(2/3 * 200) = 133
    const score = calculateScore(item, "Spider Man Chronicles");
    expect(score).toBe(133);
  });

  it("adds bonuses for metadata (posterUrl, externalRating, watchProviders)", () => {
    const itemWithBonuses: MediaSearchResult = {
      ...baseItem,
      posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
      externalRating: 8.7,
      watchProviders: [
        { name: "Netflix", type: "stream" },
      ],
    };

    // Exact match (1000) + poster (25) + rating (15) + watchProviders (20) = 1060
    const score = calculateScore(itemWithBonuses, "Interstellar");
    expect(score).toBe(1060);
  });
});

describe("unified-search: sortAndDeduplicate", () => {
  const createMockItem = (
    id: string,
    title: string,
    mediaType: MediaSearchResult["mediaType"] = "movie",
    posterUrl: string | null = null
  ): MediaSearchResult => ({
    externalId: id,
    externalSource: "tmdb",
    mediaType,
    title,
    posterUrl,
    year: 2024,
    genres: ["Action"],
    overview: "Overview for " + title,
    externalRating: null,
  });

  it("returns an empty array when given an empty list", () => {
    expect(sortAndDeduplicate([], "Batman")).toEqual([]);
  });

  it("sorts items by descending relevance score", () => {
    const items: MediaSearchResult[] = [
      createMockItem("1", "The Dark Knight Rises"),
      createMockItem("2", "Batman"),
      createMockItem("3", "Batman Begins"),
    ];

    const results = sortAndDeduplicate(items, "Batman");
    // "Batman" is exact match (score 1000)
    // "Batman Begins" is prefix match (score 750)
    // "The Dark Knight Rises" has no match (score 0, filtered out if other items >= 50)
    expect(results.length).toBe(2);
    expect(results[0].title).toBe("Batman");
    expect(results[1].title).toBe("Batman Begins");
  });

  it("deduplicates items with same mediaType and normalized title, preserving higher scored item", () => {
    const duplicateItems: MediaSearchResult[] = [
      createMockItem("1", "Dune", "movie", null), // exact match without poster (1000)
      createMockItem("2", "Dune: Part One", "movie", null), // prefix match (750)
      createMockItem("3", "Dune", "movie", "https://img.com/dune.jpg"), // exact match with poster (1025)
    ];

    const results = sortAndDeduplicate(duplicateItems, "Dune");
    const duneItems = results.filter((r) => normalizeString(r.title) === "dune");
    expect(duneItems.length).toBe(1);
    expect(duneItems[0].posterUrl).toBe("https://img.com/dune.jpg");
    expect(duneItems[0].externalId).toBe("3");
  });

  it("allows same title across different media types", () => {
    const crossTypeItems: MediaSearchResult[] = [
      createMockItem("1", "Fallout", "game"),
      createMockItem("2", "Fallout", "tv"),
    ];

    const results = sortAndDeduplicate(crossTypeItems, "Fallout");
    expect(results.length).toBe(2);
    const mediaTypes = results.map((r) => r.mediaType);
    expect(mediaTypes).toContain("game");
    expect(mediaTypes).toContain("tv");
  });

  it("caps results to a maximum of 36 items", () => {
    const manyItems: MediaSearchResult[] = Array.from({ length: 50 }, (_, i) =>
      createMockItem(String(i), `Matrix Sequel ${i}`, "movie")
    );

    const results = sortAndDeduplicate(manyItems, "Matrix");
    expect(results.length).toBeLessThanOrEqual(36);
  });
});

describe("unified-search: searchMedia query validation", () => {
  it("returns empty array when query is empty or whitespace", async () => {
    expect(await searchMedia("")).toEqual([]);
    expect(await searchMedia("   ")).toEqual([]);
  });
});
