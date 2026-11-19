import { describe, it, expect } from "vitest";
import {
  CreateMediaSchema,
  UpdateMediaSchema,
  MediaQuerySchema,
  CreateCollectionSchema,
  UpdateCollectionSchema,
  CollectionItemActionSchema,
  RegisterUserSchema,
  SearchQuerySchema,
  ExternalUrlSchema,
} from "@/lib/domain/validation";

describe("Security & Input Validation: Domain Schemas", () => {
  describe("CreateMediaSchema & UpdateMediaSchema", () => {
    it("accepts valid media creation payload", () => {
      const valid = {
        mediaType: "movie",
        title: "Interstellar",
        year: 2014,
        rating: 9.5,
        status: "completed",
        watchedEpisodes: 0,
        hoursPlayed: 2.5,
      };
      const result = CreateMediaSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it("rejects invalid media categories / enums (Scenario 8)", () => {
      const invalid = {
        mediaType: "podcast", // not one of 6 allowed
        title: "Invalid Media",
      };
      const result = CreateMediaSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain("mediaType");
      }
    });

    it("rejects negative or out-of-bounds ratings (0-10)", () => {
      const negativeRating = {
        mediaType: "game",
        title: "Elden Ring",
        rating: -5,
      };
      expect(CreateMediaSchema.safeParse(negativeRating).success).toBe(false);

      const excessiveRating = {
        mediaType: "game",
        title: "Elden Ring",
        rating: 10.5,
      };
      expect(CreateMediaSchema.safeParse(excessiveRating).success).toBe(false);

      const updateNegative = UpdateMediaSchema.safeParse({ rating: -1 });
      expect(updateNegative.success).toBe(false);

      const updateExcessive = UpdateMediaSchema.safeParse({ rating: 100 });
      expect(updateExcessive.success).toBe(false);
    });

    it("rejects negative progress values (episodes, chapters, hours)", () => {
      expect(
        CreateMediaSchema.safeParse({
          mediaType: "tv",
          title: "Dark",
          watchedEpisodes: -2,
        }).success
      ).toBe(false);

      expect(
        CreateMediaSchema.safeParse({
          mediaType: "manga",
          title: "Berserk",
          readChapters: -10,
        }).success
      ).toBe(false);

      expect(
        CreateMediaSchema.safeParse({
          mediaType: "game",
          title: "Hollow Knight",
          hoursPlayed: -5,
        }).success
      ).toBe(false);
    });

    it("rejects dangerous or non-http/https poster URLs", () => {
      const xssUrl = {
        mediaType: "movie",
        title: "XSS Movie",
        posterUrl: "javascript:alert(1)",
      };
      expect(CreateMediaSchema.safeParse(xssUrl).success).toBe(false);

      const fileUrl = {
        mediaType: "movie",
        title: "File Movie",
        posterUrl: "file:///C:/passwords.txt",
      };
      expect(CreateMediaSchema.safeParse(fileUrl).success).toBe(false);

      const validUrl = {
        mediaType: "movie",
        title: "Good Movie",
        posterUrl: "https://image.tmdb.org/t/p/w500/sample.jpg",
      };
      expect(CreateMediaSchema.safeParse(validUrl).success).toBe(true);
    });

    it("rejects empty titles or whitespace-only titles", () => {
      expect(
        CreateMediaSchema.safeParse({
          mediaType: "novel",
          title: "   ",
        }).success
      ).toBe(false);
    });
  });

  describe("MediaQuerySchema", () => {
    it("validates valid query parameters", () => {
      const result = MediaQuerySchema.safeParse({
        type: "anime",
        status: "in_progress",
        favorite: "true",
        limit: "25",
        sortBy: "rating",
        sortOrder: "desc",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(25);
        expect(result.data.type).toBe("anime");
      }
    });

    it("rejects invalid sortBy fields (SQL injection prevention)", () => {
      const result = MediaQuerySchema.safeParse({
        sortBy: "id; DROP TABLE UserMedia; --",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid status filter", () => {
      const result = MediaQuerySchema.safeParse({
        status: "non_existent_status",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("Collection & CollectionItem Validation", () => {
    it("requires non-empty collection name", () => {
      expect(CreateCollectionSchema.safeParse({ name: "" }).success).toBe(false);
      expect(CreateCollectionSchema.safeParse({ name: "   " }).success).toBe(false);
      expect(
        CreateCollectionSchema.safeParse({ name: "Favorites" }).success
      ).toBe(true);
    });

    it("enforces userMediaId in CollectionItemActionSchema", () => {
      expect(CollectionItemActionSchema.safeParse({}).success).toBe(false);
      expect(
        CollectionItemActionSchema.safeParse({ userMediaId: "item_123" }).success
      ).toBe(true);
      expect(
        CollectionItemActionSchema.safeParse({
          userMediaId: "item_123",
          action: "remove",
        }).success
      ).toBe(true);
      expect(
        CollectionItemActionSchema.safeParse({
          userMediaId: "item_123",
          action: "destroy_database",
        }).success
      ).toBe(false);
    });
  });

  describe("RegisterUserSchema", () => {
    it("validates proper email and password minimum length", () => {
      expect(
        RegisterUserSchema.safeParse({
          email: "user@example.com",
          password: "securepassword123",
        }).success
      ).toBe(true);
    });

    it("rejects invalid email formats", () => {
      expect(
        RegisterUserSchema.safeParse({
          email: "not-an-email",
          password: "password123",
        }).success
      ).toBe(false);
    });

    it("rejects passwords shorter than 6 characters", () => {
      expect(
        RegisterUserSchema.safeParse({
          email: "user@example.com",
          password: "123",
        }).success
      ).toBe(false);
    });
  });

  describe("SearchQuerySchema", () => {
    it("rejects empty or whitespace query", () => {
      expect(SearchQuerySchema.safeParse({ q: "" }).success).toBe(false);
      expect(SearchQuerySchema.safeParse({ q: "   " }).success).toBe(false);
      expect(SearchQuerySchema.safeParse({ q: "Inception" }).success).toBe(true);
    });
  });

  describe("Electron IPC URL Validation (Scenario 10)", () => {
    it("permits valid http and https URLs", () => {
      expect(ExternalUrlSchema.safeParse("https://store.steampowered.com").success).toBe(true);
      expect(ExternalUrlSchema.safeParse("http://localhost:3000").success).toBe(true);
    });

    it("strictly rejects file://, javascript:, data: protocols and command injection", () => {
      expect(ExternalUrlSchema.safeParse("file:///etc/passwd").success).toBe(false);
      expect(ExternalUrlSchema.safeParse("javascript:alert('pwn')").success).toBe(false);
      expect(ExternalUrlSchema.safeParse("data:text/html,<script>alert(1)</script>").success).toBe(false);
      expect(ExternalUrlSchema.safeParse("smb://attacker.com/malware").success).toBe(false);
      expect(ExternalUrlSchema.safeParse("not a url at all").success).toBe(false);
    });
  });
});
