import { describe, it, expect } from "vitest";
import {
  SOURCE_TYPES,
  isValidSourceUrl,
  extractNormalizedDomain,
  detectSourceType,
} from "@/lib/domain/source-domain";
import {
  SourceTypeEnum,
  SourceUrlSchema,
  CreateMediaSourceSchema,
  UpdateMediaSourceSchema,
} from "@/lib/domain/validation";

describe("Milestone 4 — Phase 1: Pure Domain Logic & Zod Validation", () => {
  describe("Suite 1: isValidSourceUrl", () => {
    it("accepts standard https URLs", () => {
      expect(isValidSourceUrl("https://crunchyroll.com")).toBe(true);
      expect(isValidSourceUrl("https://youtube.com/watch?v=123")).toBe(true);
    });

    it("accepts standard http URLs", () => {
      expect(isValidSourceUrl("http://example.com/media")).toBe(true);
    });

    it("accepts URLs with subdomains", () => {
      expect(isValidSourceUrl("https://store.steampowered.com/app/10")).toBe(true);
      expect(isValidSourceUrl("https://sub.domain.site.org")).toBe(true);
    });

    it("accepts URLs with leading www", () => {
      expect(isValidSourceUrl("https://www.netflix.com")).toBe(true);
    });

    it("accepts URLs with non-standard ports", () => {
      expect(isValidSourceUrl("http://localhost:3000")).toBe(true);
      expect(isValidSourceUrl("https://media.internal:8443")).toBe(true);
    });

    it("accepts URLs with IPv4 address hostnames", () => {
      expect(isValidSourceUrl("http://192.168.1.100:8080/stream")).toBe(true);
    });

    it("accepts URLs with IPv6 address hostnames", () => {
      expect(isValidSourceUrl("http://[::1]:8080")).toBe(true);
      expect(isValidSourceUrl("http://[2001:db8::1]:8000")).toBe(true);
    });

    it("accepts URLs with complex paths, query strings, and fragments", () => {
      expect(isValidSourceUrl("https://site.com/watch?v=123&t=45s#player")).toBe(true);
    });

    it("accepts URLs with trailing FQDN dot", () => {
      expect(isValidSourceUrl("https://example.com.")).toBe(true);
    });

    it("accepts uppercase and mixed-case URL protocols and domains", () => {
      expect(isValidSourceUrl("HTTPS://WWW.CRUNCHYROLL.COM/SERIES")).toBe(true);
    });

    it("accepts URLs up to maximum permitted length of 2000 characters", () => {
      const longUrl = "https://example.com/" + "a".repeat(1980); // exactly 2000 chars (20 + 1980)
      expect(longUrl.length).toBe(2000);
      expect(isValidSourceUrl(longUrl)).toBe(true);
    });

    it("rejects javascript: protocol injection", () => {
      expect(isValidSourceUrl("javascript:alert(document.cookie)")).toBe(false);
      expect(isValidSourceUrl("javascript:void(0)")).toBe(false);
    });

    it("rejects file:/// protocol access", () => {
      expect(isValidSourceUrl("file:///C:/Windows/System32/calc.exe")).toBe(false);
      expect(isValidSourceUrl("file:///etc/passwd")).toBe(false);
    });

    it("rejects data: URI scheme", () => {
      expect(isValidSourceUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    });

    it("rejects blob: URI scheme", () => {
      expect(isValidSourceUrl("blob:https://example.com/d3b07384")).toBe(false);
    });

    it("rejects vbscript: URI scheme", () => {
      expect(isValidSourceUrl("vbscript:msgbox(1)")).toBe(false);
    });

    it("rejects smb: protocol", () => {
      expect(isValidSourceUrl("smb://attacker.com/share")).toBe(false);
    });

    it("rejects mailto: and ftp: protocols", () => {
      expect(isValidSourceUrl("mailto:user@example.com")).toBe(false);
      expect(isValidSourceUrl("ftp://ftp.example.com")).toBe(false);
    });

    it("rejects operating system custom protocols", () => {
      expect(isValidSourceUrl("steam://run/10")).toBe(false);
      expect(isValidSourceUrl("spotify://track/123")).toBe(false);
      expect(isValidSourceUrl("discord://123")).toBe(false);
      expect(isValidSourceUrl("custom-app://action")).toBe(false);
    });

    it("rejects empty strings and whitespace", () => {
      expect(isValidSourceUrl("")).toBe(false);
      expect(isValidSourceUrl("   ")).toBe(false);
      expect(isValidSourceUrl("\t\n")).toBe(false);
    });

    it("rejects URLs missing protocol scheme", () => {
      expect(isValidSourceUrl("crunchyroll.com")).toBe(false);
      expect(isValidSourceUrl("www.youtube.com")).toBe(false);
    });

    it("rejects relative URL paths", () => {
      expect(isValidSourceUrl("/media/123")).toBe(false);
      expect(isValidSourceUrl("./stream")).toBe(false);
    });

    it("rejects protocol-only strings", () => {
      expect(isValidSourceUrl("http://")).toBe(false);
      expect(isValidSourceUrl("https://")).toBe(false);
      expect(isValidSourceUrl("http:////")).toBe(false);
    });

    it("rejects URLs with missing or invalid host", () => {
      expect(isValidSourceUrl("http://?query=1")).toBe(false);
      expect(isValidSourceUrl("http://#hash")).toBe(false);
      expect(isValidSourceUrl("http:// ex.com")).toBe(false);
    });

    it("rejects URLs exceeding 2000 characters", () => {
      const tooLongUrl = "https://example.com/" + "a".repeat(1981); // 2001 chars (20 + 1981)
      expect(tooLongUrl.length).toBe(2001);
      expect(isValidSourceUrl(tooLongUrl)).toBe(false);
    });

    it("rejects non-string inputs safely", () => {
      expect(isValidSourceUrl(null)).toBe(false);
      expect(isValidSourceUrl(undefined)).toBe(false);
      expect(isValidSourceUrl(12345)).toBe(false);
      expect(isValidSourceUrl({})).toBe(false);
      expect(isValidSourceUrl([])).toBe(false);
      expect(isValidSourceUrl(true)).toBe(false);
    });
  });

  describe("Suite 2: extractNormalizedDomain", () => {
    it("strips leading 'www.' from hostnames", () => {
      expect(extractNormalizedDomain("https://www.youtube.com/watch?v=1")).toBe("youtube.com");
      expect(extractNormalizedDomain("http://www.netflix.com")).toBe("netflix.com");
    });

    it("lowercases domain names", () => {
      expect(extractNormalizedDomain("HTTPS://WWW.CRUNCHYROLL.COM/SERIES")).toBe("crunchyroll.com");
    });

    it("strips ports, paths, query parameters, and hashes", () => {
      expect(extractNormalizedDomain("http://localhost:3000/media?id=1#top")).toBe("localhost");
      expect(extractNormalizedDomain("https://example.com:8443/api?x=1")).toBe("example.com");
    });

    it("preserves subdomains other than leading 'www.'", () => {
      expect(extractNormalizedDomain("https://store.steampowered.com/app/10")).toBe("store.steampowered.com");
      expect(extractNormalizedDomain("https://beta.crunchyroll.com")).toBe("beta.crunchyroll.com");
    });

    it("strips leading 'www.' from subdomains without stripping subsequent labels", () => {
      expect(extractNormalizedDomain("https://www.sub.example.com")).toBe("sub.example.com");
    });

    it("preserves internal 'www' in domain names", () => {
      expect(extractNormalizedDomain("https://sub.www.example.com")).toBe("sub.www.example.com");
    });

    it("strips single and multiple trailing dots (FQDN)", () => {
      expect(extractNormalizedDomain("https://example.com.")).toBe("example.com");
      expect(extractNormalizedDomain("https://www.example.com...")).toBe("example.com");
    });

    it("handles IPv4 hostnames correctly", () => {
      expect(extractNormalizedDomain("http://192.168.1.100:8080/stream")).toBe("192.168.1.100");
    });

    it("handles IPv6 hostnames correctly", () => {
      expect(extractNormalizedDomain("http://[::1]:8080/path")).toBe("[::1]");
    });

    it("strips URL authentication credentials", () => {
      expect(extractNormalizedDomain("https://user:password@www.example.com/path")).toBe("example.com");
    });

    it("returns empty string safely for invalid or disallowed URLs", () => {
      expect(extractNormalizedDomain("javascript:alert(1)")).toBe("");
      expect(extractNormalizedDomain("file:///etc/passwd")).toBe("");
      expect(extractNormalizedDomain("not-a-url")).toBe("");
      expect(extractNormalizedDomain("")).toBe("");
    });

    it("returns empty string safely for non-string inputs", () => {
      expect(extractNormalizedDomain(null)).toBe("");
      expect(extractNormalizedDomain(undefined)).toBe("");
      expect(extractNormalizedDomain(12345)).toBe("");
    });

    it("handles bare domain inputs safely", () => {
      expect(extractNormalizedDomain("youtube.com")).toBe("youtube.com");
      expect(extractNormalizedDomain("www.amazon.co.jp")).toBe("amazon.co.jp");
      expect(extractNormalizedDomain("store.steampowered.com")).toBe("store.steampowered.com");
    });
  });

  describe("Suite 3: detectSourceType", () => {
    it("detects streaming services correctly", () => {
      expect(detectSourceType("youtube.com")).toBe("stream");
      expect(detectSourceType("youtu.be")).toBe("stream");
      expect(detectSourceType("https://www.youtube.com/watch?v=123")).toBe("stream");
      expect(detectSourceType("crunchyroll.com")).toBe("stream");
      expect(detectSourceType("https://www.crunchyroll.com/series/1")).toBe("stream");
      expect(detectSourceType("netflix.com")).toBe("stream");
      expect(detectSourceType("https://www.netflix.com/title/10")).toBe("stream");
      expect(detectSourceType("disneyplus.com")).toBe("stream");
      expect(detectSourceType("hulu.com")).toBe("stream");
      expect(detectSourceType("primevideo.com")).toBe("stream");
      expect(detectSourceType("twitch.tv")).toBe("stream");
      expect(detectSourceType("vimeo.com")).toBe("stream");
      expect(detectSourceType("max.com")).toBe("stream");
      expect(detectSourceType("play.max.com")).toBe("stream");
      expect(detectSourceType("hbomax.com")).toBe("stream");
      expect(detectSourceType("hidive.com")).toBe("stream");
      expect(detectSourceType("funimation.com")).toBe("stream");
    });

    it("detects reader / library services correctly", () => {
      expect(detectSourceType("mangadex.org")).toBe("reader");
      expect(detectSourceType("https://mangadex.org/title/1")).toBe("reader");
      expect(detectSourceType("openlibrary.org")).toBe("reader");
      expect(detectSourceType("webtoons.com")).toBe("reader");
      expect(detectSourceType("archive.org")).toBe("reader");
      expect(detectSourceType("gutenberg.org")).toBe("reader");
      expect(detectSourceType("royalroad.com")).toBe("reader");
      expect(detectSourceType("novelupdates.com")).toBe("reader");
      expect(detectSourceType("archiveofourown.org")).toBe("reader");
      expect(detectSourceType("ao3.org")).toBe("reader");
    });

    it("detects gaming storefronts and platforms correctly", () => {
      expect(detectSourceType("steampowered.com")).toBe("game");
      expect(detectSourceType("store.steampowered.com")).toBe("game");
      expect(detectSourceType("https://store.steampowered.com/app/10")).toBe("game");
      expect(detectSourceType("epicgames.com")).toBe("game");
      expect(detectSourceType("store.epicgames.com")).toBe("game");
      expect(detectSourceType("gog.com")).toBe("game");
      expect(detectSourceType("itch.io")).toBe("game");
      expect(detectSourceType("xbox.com")).toBe("game");
      expect(detectSourceType("playstation.com")).toBe("game");
      expect(detectSourceType("store.playstation.com")).toBe("game");
      expect(detectSourceType("nintendo.com")).toBe("game");
    });

    it("detects commercial storefronts correctly", () => {
      expect(detectSourceType("amazon.com")).toBe("store");
      expect(detectSourceType("https://www.amazon.com/dp/B08")).toBe("store");
      expect(detectSourceType("amazon.co.uk")).toBe("store");
      expect(detectSourceType("amazon.co.jp")).toBe("store");
      expect(detectSourceType("amazon.de")).toBe("store");
      expect(detectSourceType("books.google.com")).toBe("store");
      expect(detectSourceType("play.google.com")).toBe("store");
      expect(detectSourceType("barnesandnoble.com")).toBe("store");
      expect(detectSourceType("bookwalker.jp")).toBe("store");
      expect(detectSourceType("kobo.com")).toBe("store");
      expect(detectSourceType("audible.com")).toBe("store");
      expect(detectSourceType("store.crunchyroll.com")).toBe("store");
    });

    it("falls back to 'web' for general and media-info websites", () => {
      expect(detectSourceType("github.com")).toBe("web");
      expect(detectSourceType("wikipedia.org")).toBe("web");
      expect(detectSourceType("example.com")).toBe("web");
      expect(detectSourceType("myanimelist.net")).toBe("web");
      expect(detectSourceType("anilist.co")).toBe("web");
      expect(detectSourceType("localhost")).toBe("web");
      expect(detectSourceType("192.168.1.1")).toBe("web");
    });

    it("strictly rejects domain spoofing / substring attacks (returns 'web')", () => {
      expect(detectSourceType("evilsteampowered.com")).toBe("web");
      expect(detectSourceType("notyoutube.com")).toBe("web");
      expect(detectSourceType("fakemangadex.org")).toBe("web");
      expect(detectSourceType("phishing-netflix.com")).toBe("web");
      expect(detectSourceType("badamazon.com")).toBe("web");
    });

    it("handles empty, malformed, or non-string inputs safely by returning 'web'", () => {
      expect(detectSourceType("")).toBe("web");
      expect(detectSourceType("   ")).toBe("web");
      expect(detectSourceType(null as unknown as string)).toBe("web");
      expect(detectSourceType(undefined as unknown as string)).toBe("web");
    });
  });

  describe("Suite 4: SourceUrlSchema (Zod Schema)", () => {
    it("validates valid http and https URLs", () => {
      const resHttps = SourceUrlSchema.safeParse("https://crunchyroll.com");
      expect(resHttps.success).toBe(true);

      const resHttp = SourceUrlSchema.safeParse("http://localhost:3000");
      expect(resHttp.success).toBe(true);
    });

    it("trims whitespace from input URLs", () => {
      const res = SourceUrlSchema.safeParse("  https://youtube.com  ");
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data).toBe("https://youtube.com");
      }
    });

    it("rejects empty URL with required message", () => {
      const res = SourceUrlSchema.safeParse("");
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0].message).toBe("URL is required");
      }
    });

    it("rejects whitespace-only URL", () => {
      const res = SourceUrlSchema.safeParse("   ");
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0].message).toBe("URL is required");
      }
    });

    it("rejects URLs exceeding 2000 characters", () => {
      const tooLong = "https://example.com/" + "x".repeat(1981);
      const res = SourceUrlSchema.safeParse(tooLong);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0].message).toBe("URL exceeds maximum length");
      }
    });

    it("rejects javascript: URLs", () => {
      const res = SourceUrlSchema.safeParse("javascript:alert(1)");
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0].message).toBe("Only valid http:// and https:// URLs are permitted");
      }
    });

    it("rejects file:/// URLs", () => {
      const res = SourceUrlSchema.safeParse("file:///C:/passwords.txt");
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0].message).toBe("Only valid http:// and https:// URLs are permitted");
      }
    });

    it("rejects data: and smb: URLs", () => {
      expect(SourceUrlSchema.safeParse("data:text/html,test").success).toBe(false);
      expect(SourceUrlSchema.safeParse("smb://attacker/share").success).toBe(false);
    });

    it("rejects malformed URLs without protocol", () => {
      const res = SourceUrlSchema.safeParse("crunchyroll.com");
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0].message).toBe("Only valid http:// and https:// URLs are permitted");
      }
    });
  });

  describe("Suite 5: CreateMediaSourceSchema (Zod Schema)", () => {
    it("accepts valid source creation payload with explicit sourceType", () => {
      const payload = {
        name: "Crunchyroll",
        url: "https://www.crunchyroll.com/series/1",
        sourceType: "stream" as const,
      };
      const res = CreateMediaSourceSchema.safeParse(payload);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.name).toBe("Crunchyroll");
        expect(res.data.sourceType).toBe("stream");
      }
    });

    it("accepts valid source creation payload when sourceType is omitted (defaults to 'web')", () => {
      const payload = {
        name: "Personal Site",
        url: "https://myblog.com",
      };
      const res = CreateMediaSourceSchema.safeParse(payload);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.sourceType).toBe("web");
      }
    });

    it("accepts all five canonical source types ('stream', 'reader', 'game', 'store', 'web')", () => {
      for (const st of SOURCE_TYPES) {
        const res = CreateMediaSourceSchema.safeParse({
          name: `Source ${st}`,
          url: "https://example.com",
          sourceType: st,
        });
        expect(res.success).toBe(true);
        if (res.success) {
          expect(res.data.sourceType).toBe(st);
        }
      }
    });

    it("trims whitespace from name and url", () => {
      const res = CreateMediaSourceSchema.safeParse({
        name: "  Steam  ",
        url: "  https://store.steampowered.com  ",
      });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.name).toBe("Steam");
        expect(res.data.url).toBe("https://store.steampowered.com");
      }
    });

    it("rejects missing or empty name", () => {
      const resEmpty = CreateMediaSourceSchema.safeParse({
        name: "",
        url: "https://test.com",
      });
      expect(resEmpty.success).toBe(false);
      if (!resEmpty.success) {
        expect(resEmpty.error.issues[0].message).toBe("Source name is required");
      }

      const resWhitespace = CreateMediaSourceSchema.safeParse({
        name: "   ",
        url: "https://test.com",
      });
      expect(resWhitespace.success).toBe(false);
      if (!resWhitespace.success) {
        expect(resWhitespace.error.issues[0].message).toBe("Source name is required");
      }
    });

    it("rejects name exceeding 100 characters", () => {
      const res = CreateMediaSourceSchema.safeParse({
        name: "A".repeat(101),
        url: "https://test.com",
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0].message).toBe("Source name cannot exceed 100 characters");
      }
    });

    it("rejects missing url", () => {
      const res = CreateMediaSourceSchema.safeParse({
        name: "Netflix",
      });
      expect(res.success).toBe(false);
    });

    it("rejects invalid url (e.g. javascript:)", () => {
      const res = CreateMediaSourceSchema.safeParse({
        name: "Hacked",
        url: "javascript:alert(1)",
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0].message).toBe("Only valid http:// and https:// URLs are permitted");
      }
    });

    it("rejects invalid sourceType (e.g. 'movie' or 'podcast')", () => {
      const res = CreateMediaSourceSchema.safeParse({
        name: "Site",
        url: "https://site.com",
        sourceType: "movie",
      });
      expect(res.success).toBe(false);
    });
  });

  describe("Suite 6: UpdateMediaSourceSchema (Zod Schema)", () => {
    it("accepts partial update for name only", () => {
      const res = UpdateMediaSourceSchema.safeParse({
        name: "Updated Source Name",
      });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.name).toBe("Updated Source Name");
        expect(res.data.url).toBeUndefined();
        expect(res.data.sourceType).toBeUndefined();
      }
    });

    it("accepts partial update for url only", () => {
      const res = UpdateMediaSourceSchema.safeParse({
        url: "https://new-url.com",
      });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.url).toBe("https://new-url.com");
      }
    });

    it("accepts partial update for sourceType only", () => {
      const res = UpdateMediaSourceSchema.safeParse({
        sourceType: "reader",
      });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.sourceType).toBe("reader");
      }
    });

    it("accepts empty update object (no modifications)", () => {
      const res = UpdateMediaSourceSchema.safeParse({});
      expect(res.success).toBe(true);
    });

    it("rejects empty name if name is provided", () => {
      const resEmpty = UpdateMediaSourceSchema.safeParse({ name: "" });
      expect(resEmpty.success).toBe(false);
      if (!resEmpty.success) {
        expect(resEmpty.error.issues[0].message).toBe("Source name cannot be empty");
      }

      const resWhitespace = UpdateMediaSourceSchema.safeParse({ name: "   " });
      expect(resWhitespace.success).toBe(false);
      if (!resWhitespace.success) {
        expect(resWhitespace.error.issues[0].message).toBe("Source name cannot be empty");
      }
    });

    it("rejects name exceeding 100 characters", () => {
      const res = UpdateMediaSourceSchema.safeParse({
        name: "A".repeat(101),
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0].message).toBe("Source name cannot exceed 100 characters");
      }
    });

    it("rejects invalid url if url is provided", () => {
      const res = UpdateMediaSourceSchema.safeParse({
        url: "file:///etc/passwd",
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0].message).toBe("Only valid http:// and https:// URLs are permitted");
      }
    });

    it("rejects invalid sourceType if sourceType is provided", () => {
      const res = UpdateMediaSourceSchema.safeParse({
        sourceType: "invalid_type",
      });
      expect(res.success).toBe(false);
    });

    it("does NOT default sourceType on update (preserves omission)", () => {
      const res = UpdateMediaSourceSchema.safeParse({
        name: "New Name",
      });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.sourceType).toBeUndefined();
      }
    });
  });

  describe("Suite 7: SourceTypeEnum (Zod Schema)", () => {
    it("accepts all canonical source types", () => {
      for (const t of SOURCE_TYPES) {
        expect(SourceTypeEnum.safeParse(t).success).toBe(true);
      }
    });

    it("rejects non-canonical source types", () => {
      expect(SourceTypeEnum.safeParse("tv").success).toBe(false);
      expect(SourceTypeEnum.safeParse("anime").success).toBe(false);
      expect(SourceTypeEnum.safeParse("unknown").success).toBe(false);
    });
  });
});
