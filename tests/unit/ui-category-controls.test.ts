import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("UI Category Controls: Six Media Categories Across App", () => {
  const rootDir = process.cwd();

  describe("AddMediaModal (Manual Entry)", () => {
    const modalPath = path.join(rootDir, "src/components/AddMediaModal.tsx");
    const modalSource = fs.readFileSync(modalPath, "utf-8");

    it("includes all six canonical category options in the select element", () => {
      expect(modalSource).toContain('<option value="movie">Movie</option>');
      expect(modalSource).toContain('<option value="tv">TV Series</option>');
      expect(modalSource).toContain('<option value="anime">Anime (Crunchyroll, TV, Movie)</option>');
      expect(modalSource).toContain('<option value="manga">Manga</option>');
      expect(modalSource).toContain('<option value="game">Video Game (PC, Steam, Epic)</option>');
      expect(modalSource).toContain('<option value="novel">Novels & Books</option>');
    });

    it("normalizes 'book' initialType to canonical 'novel'", () => {
      expect(modalSource).toContain('type === "book" ? "novel" : type');
      expect(modalSource).toContain('resolveInitialType(mediaType)');
    });

    it("renders chapter progress fields for both 'manga' and 'novel'", () => {
      expect(modalSource).toContain('mediaType === "manga" || mediaType === "novel"');
      expect(modalSource).toContain("Read Chapters");
      expect(modalSource).toContain("Total Chapters");
      expect(modalSource).toContain("readChapters");
      expect(modalSource).toContain("totalChapters");
    });
  });

  describe("Search Page (Pills & Interaction)", () => {
    const searchPath = path.join(rootDir, "src/app/search/page.tsx");
    const searchSource = fs.readFileSync(searchPath, "utf-8");

    it("defines pills for all six categories plus 'all'", () => {
      const requiredPills = [
        { label: "All Titles", type: "all" },
        { label: "Movies", type: "movie" },
        { label: "TV Shows", type: "tv" },
        { label: "Anime", type: "anime" },
        { label: "Manga", type: "manga" },
        { label: "Games", type: "game" },
        { label: "Novels & Books", type: "novel" },
      ];

      for (const pill of requiredPills) {
        expect(searchSource).toContain(`label: "${pill.label}"`);
        expect(searchSource).toContain(`type: "${pill.type}"`);
      }
    });

    it("does NOT intercept game selection with manual modal popup", () => {
      // Must not contain the old bug: cat.type === "game" -> setIsManualModalOpen(true)
      expect(searchSource).not.toContain('cat.type === "game"');
      expect(searchSource).not.toContain('if (cat.type === "game")');
    });

    it("dispatches immediate search on category pill click when query is present", () => {
      expect(searchSource).toContain("handleSearch(query, newType)");
    });
  });

  describe("Library Page (Filter Tabs & Counts)", () => {
    const libraryPath = path.join(rootDir, "src/app/library/page.tsx");
    const librarySource = fs.readFileSync(libraryPath, "utf-8");

    it("defines filter tabs for all six categories plus 'all'", () => {
      const requiredTabs = [
        { type: "all", label: "All Vaults" },
        { type: "movie", label: "Movies" },
        { type: "tv", label: "TV Shows" },
        { type: "anime", label: "Anime" },
        { type: "manga", label: "Manga" },
        { type: "game", label: "Games" },
        { type: "novel", label: "Novels & Books" },
      ];

      for (const tab of requiredTabs) {
        expect(librarySource).toContain(`type: "${tab.type}"`);
        expect(librarySource).toContain(`label: "${tab.label}"`);
      }
    });

    it("handles novel category and book alias in count badge calculations", () => {
      expect(librarySource).toContain('const iType = (i.mediaType as string) === "book" ? "novel" : i.mediaType');
      expect(librarySource).toContain('tab.type === "all" || iType === tab.type');
    });

    it("handles novel category and book alias in item filtering", () => {
      expect(librarySource).toContain('const itemType = (item.mediaType as string) === "book" ? "novel" : item.mediaType');
      expect(librarySource).toContain('currentActiveType !== "all" && itemType !== currentActiveType');
    });
  });

  describe("WatchProviderBadge / Storefront Links", () => {
    const badgePath = path.join(rootDir, "src/components/WatchProviderBadge.tsx");
    const badgeSource = fs.readFileSync(badgePath, "utf-8");

    it("provides legal storefront links for manga", () => {
      expect(badgeSource).toContain('if (mediaType === "manga")');
      expect(badgeSource).toContain("mangadex.org");
      expect(badgeSource).toContain("bookwalker.jp");
      expect(badgeSource).toContain("crunchyroll.com");
      expect(badgeSource).toContain("viz.com");
    });

    it("provides legal storefront links for novel and book", () => {
      expect(badgeSource).toContain('mediaType === "novel" || (mediaType as string) === "book"');
      expect(badgeSource).toContain("openlibrary.org");
      expect(badgeSource).toContain("goodreads.com");
      expect(badgeSource).toContain("google.com");
      expect(badgeSource).toContain("amazon.com");
    });
  });
});
