/**
 * Source Domain Pure Domain Module
 *
 * Handles domain normalization, protocol enforcement, and source type detection.
 * Pure domain logic with ZERO framework imports (no Next.js, React, or Electron imports).
 * Safe to execute across Node.js, Electron (main, preload, renderer), Web Workers, and browsers.
 */

export const SOURCE_TYPES = [
  "stream",
  "reader",
  "game",
  "store",
  "web",
] as const;

export type SourceType = (typeof SOURCE_TYPES)[number];

/**
 * Validates that an input is a safe, well-formed HTTP or HTTPS URL.
 * Strictly enforces length boundaries (1 <= length <= 2000), protocol allowlisting
 * (only "http:" and "https:"), non-empty hostname, and rejects dangerous injection schemes
 * (javascript:, file:, data:, blob:, vbscript:, smb:, custom OS schemes).
 */
export function isValidSourceUrl(url: unknown): boolean {
  if (typeof url !== "string") {
    return false;
  }

  const trimmed = url.trim();
  if (trimmed.length < 1 || trimmed.length > 2000) {
    return false;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    return Boolean(parsed.hostname && parsed.hostname.trim().length > 0);
  } catch {
    return false;
  }
}

/**
 * Extracts and normalizes the canonical domain from a URL or domain string.
 * Strips leading 'www.' when the hostname has more than 2 parts, lowercases the host,
 * removes trailing dots (FQDN), strips credentials, ports, paths, queries, and fragments,
 * while preserving valid subdomains (e.g. store.steampowered.com).
 *
 * Returns an empty string for invalid URLs, disallowed schemes, or non-string inputs.
 */
export function extractNormalizedDomain(input: unknown): string {
  if (typeof input !== "string") {
    return "";
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }

  let parsed: URL;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      parsed = new URL(trimmed);
    } catch {
      return "";
    }
  } else if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    // Other schemes (javascript:, file:, data:, blob:, smb:, steam:, etc.) are rejected
    return "";
  } else {
    // Hostname or domain without explicit scheme
    // Must contain at least one dot (domain.tld), or be "localhost", or IPv6 "[...]"
    if (
      !trimmed.includes(".") &&
      trimmed.toLowerCase() !== "localhost" &&
      !(trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      return "";
    }
    // Reject strings with whitespace inside hostname
    if (/\s/.test(trimmed)) {
      return "";
    }
    try {
      parsed = new URL(`https://${trimmed}`);
    } catch {
      return "";
    }
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "";
  }

  let hostname = parsed.hostname;
  if (!hostname) {
    return "";
  }

  hostname = hostname.toLowerCase().trim();
  hostname = hostname.replace(/\.+$/, "");

  if (!hostname) {
    return "";
  }

  // Preserve IPv6 bracketed host
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    return hostname;
  }

  // Strip leading www. if hostname has multiple parts (e.g. www.netflix.com -> netflix.com, but keep www.com)
  const parts = hostname.split(".");
  while (parts.length > 2 && parts[0] === "www") {
    parts.shift();
  }
  hostname = parts.join(".");

  return hostname;
}

/**
 * Explicit metadata and information catalog domains mapped to "web"
 */
const WEB_METADATA_DOMAINS = [
  "themoviedb.org",
  "tmdb.org",
  "imdb.com",
  "tvmaze.com",
  "kitsu.io",
  "myanimelist.net",
  "anilist.co",
  "wikipedia.org",
  "wikidata.org",
  "github.com",
  "example.com",
];

/**
 * Store / retail domains
 */
const STORE_DOMAINS = [
  "store.crunchyroll.com",
  "cdjapan.co.jp",
  "amiami.com",
  "play-asia.com",
  "rightstufanime.com",
  "ebay.com",
  "play.google.com",
  "books.google.com",
  "apps.apple.com",
  "barnesandnoble.com",
  "bookwalker.jp",
  "global.bookwalker.jp",
  "kobo.com",
  "audible.com",
];

/**
 * Gaming platform domains
 */
const GAME_DOMAINS = [
  "steampowered.com",
  "steamcommunity.com",
  "epicgames.com",
  "gog.com",
  "itch.io",
  "roblox.com",
  "xbox.com",
  "playstation.com",
  "nintendo.com",
  "battle.net",
  "blizzard.com",
  "ea.com",
  "ubisoft.com",
  "riotgames.com",
  "retroachievements.org",
  "nexusmods.com",
  "speedrun.com",
  "howlongtobeat.com",
];

/**
 * Reading / digital library domains
 */
const READER_DOMAINS = [
  "mangadex.org",
  "webtoons.com",
  "tapas.io",
  "mangaplus.shueisha.co.jp",
  "royalroad.com",
  "novelupdates.com",
  "openlibrary.org",
  "archiveofourown.org",
  "ao3.org",
  "wattpad.com",
  "scribblehub.com",
  "dynasty-scans.com",
  "viz.com",
  "gutenberg.org",
  "archive.org",
  "readcomiconline.li",
  "readlightnovel.me",
  "wuxiaworld.com",
  "comixology.com",
];

/**
 * Video and audio streaming domains
 */
const STREAM_DOMAINS = [
  "youtube.com",
  "youtu.be",
  "crunchyroll.com",
  "netflix.com",
  "disneyplus.com",
  "hulu.com",
  "primevideo.com",
  "twitch.tv",
  "vimeo.com",
  "max.com",
  "hbomax.com",
  "hidive.com",
  "funimation.com",
  "tv.apple.com",
  "peacocktv.com",
  "paramountplus.com",
  "bilibili.com",
  "bilibili.tv",
  "iq.com",
  "iqiyi.com",
  "dailymotion.com",
  "vrv.co",
  "plex.tv",
  "spotify.com",
  "soundcloud.com",
  "deezer.com",
  "tidal.com",
];

/**
 * Well-known brand roots for anti-spoofing detection
 */
const KNOWN_TARGET_ROOTS = [
  "steampowered",
  "youtube",
  "netflix",
  "crunchyroll",
  "mangadex",
  "disneyplus",
  "primevideo",
  "amazon",
  "hulu",
  "epicgames",
  "playstation",
  "nintendo",
];

function matchesDomain(domain: string, target: string): boolean {
  return domain === target || domain.endsWith("." + target);
}

function matchesAnyDomain(domain: string, targets: string[]): boolean {
  for (const target of targets) {
    if (matchesDomain(domain, target)) {
      return true;
    }
  }
  return false;
}

function isAmazonStore(domain: string): boolean {
  const match = domain.match(/^(?:[a-z0-9-]+\.)*amazon(\.[a-z]{2,3}(?:\.[a-z]{2})?)$/);
  if (!match) return false;
  const tld = match[1];
  const validAmazonTlds = new Set([
    ".com",
    ".co.jp",
    ".co.uk",
    ".de",
    ".fr",
    ".ca",
    ".it",
    ".es",
    ".com.au",
    ".com.br",
    ".com.mx",
    ".in",
    ".nl",
    ".se",
    ".pl",
    ".sg",
    ".ae",
    ".cn",
  ]);
  return validAmazonTlds.has(tld);
}

/**
 * Detects the source category based on domain or URL.
 * Suffix matching ensures subdomains are categorized properly without substring spoofing.
 *
 * Returns: "stream" | "reader" | "game" | "store" | "web"
 */
export function detectSourceType(input: string): SourceType {
  const domain = extractNormalizedDomain(input);
  if (!domain) {
    return "web";
  }

  // 1. Explicit metadata / information sites (always "web")
  if (matchesAnyDomain(domain, WEB_METADATA_DOMAINS)) {
    return "web";
  }

  // 2. Commercial storefronts (checked before streaming to allow store.crunchyroll.com)
  if (isAmazonStore(domain) || matchesAnyDomain(domain, STORE_DOMAINS)) {
    return "store";
  }

  // 3. Gaming platforms
  if (matchesAnyDomain(domain, GAME_DOMAINS)) {
    return "game";
  }

  // 4. Reading platforms
  if (matchesAnyDomain(domain, READER_DOMAINS)) {
    return "reader";
  }

  // 5. Video and music streaming platforms
  if (matchesAnyDomain(domain, STREAM_DOMAINS)) {
    return "stream";
  }

  // 6. Anti-spoofing check:
  // If the domain contains a well-known brand root but did not match the legitimate domain suffix,
  // it is an impersonation/spoof attempt (e.g. evilsteampowered.com, notyoutube.com, fakemangadex.org, badamazon.com)
  for (const root of KNOWN_TARGET_ROOTS) {
    if (domain.includes(root)) {
      return "web";
    }
  }

  // 7. Secondary keyword heuristics for uncatalogued domains
  if (
    domain.includes("manga") ||
    domain.includes("webtoon") ||
    domain.includes("novel") ||
    domain.includes("comic") ||
    domain.includes("reader")
  ) {
    return "reader";
  }

  if (
    domain.includes("stream") ||
    domain.includes("anime") ||
    domain.includes("watch") ||
    domain.includes("cinema")
  ) {
    return "stream";
  }

  // 8. Default fallback
  return "web";
}
