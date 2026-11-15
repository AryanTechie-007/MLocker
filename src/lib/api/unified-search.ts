import { searchMovies } from "./itunes";
import { searchTV } from "./tvmaze";
import { searchTMDBMovies, searchTMDBTV, searchTMDBAnime } from "./tmdb";
import { searchGames } from "./steam";
import { MediaSearchResult, MediaType } from "./types";

function normalizeString(str: string): string {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function calculateScore(item: MediaSearchResult, query: string): number {
  const cleanTitle = normalizeString(item.title);
  const cleanQuery = normalizeString(query);

  if (!cleanTitle || !cleanQuery) return 0;

  let score = 0;

  // Exact full title match (e.g. "Dune: Part Two" vs "dune part two")
  if (cleanTitle === cleanQuery) {
    score += 1000;
  } else if (cleanTitle.startsWith(cleanQuery)) {
    score += 750;
  } else if (cleanTitle.includes(cleanQuery)) {
    score += 500;
  } else {
    // Check token matching
    const queryTokens = cleanQuery.split(" ").filter((t) => t.length > 1);
    const titleTokens = cleanTitle.split(" ").filter((t) => t.length > 1);

    if (queryTokens.length > 0) {
      let matchedCount = 0;
      for (const qToken of queryTokens) {
        if (titleTokens.some((tToken) => tToken.includes(qToken) || qToken.includes(tToken))) {
          matchedCount++;
        }
      }

      if (matchedCount === queryTokens.length) {
        // All search words present in title
        score += 400;
      } else if (matchedCount > 0) {
        score += Math.round((matchedCount / queryTokens.length) * 200);
      }
    }
  }

  // Bonus for items with posters, ratings, and watch providers
  if (item.posterUrl) score += 25;
  if (item.externalRating) score += 15;
  if (item.watchProviders && item.watchProviders.length > 0) score += 20;

  return score;
}

async function getMovies(query: string): Promise<MediaSearchResult[]> {
  if (process.env.TMDB_API_KEY) {
    const tmdb = await searchTMDBMovies(query);
    if (tmdb.length > 0) return tmdb;
  }
  return searchMovies(query);
}

async function getTVShows(query: string): Promise<MediaSearchResult[]> {
  if (process.env.TMDB_API_KEY) {
    const tmdb = await searchTMDBTV(query);
    if (tmdb.length > 0) return tmdb;
  }
  return searchTV(query);
}

export async function searchMedia(
  query: string,
  type?: MediaType | "all"
): Promise<MediaSearchResult[]> {
  if (!query || query.trim().length === 0) return [];

  const trimmed = query.trim();

  if (type === "movie") {
    const movies = await getMovies(trimmed);
    return sortAndDeduplicate(movies, trimmed);
  }
  if (type === "tv") {
    const tv = await getTVShows(trimmed);
    return sortAndDeduplicate(tv, trimmed);
  }
  if (type === "anime") {
    const anime = await searchTMDBAnime(trimmed);
    return sortAndDeduplicate(anime, trimmed);
  }
  if (type === "game") {
    const games = await searchGames(trimmed);
    return sortAndDeduplicate(games, trimmed);
  }

  // Unified Search: Movies, TV Shows, Anime, and Games in parallel
  const [movies, tvShows, anime, games] = await Promise.all([
    getMovies(trimmed),
    getTVShows(trimmed),
    searchTMDBAnime(trimmed),
    searchGames(trimmed),
  ]);

  return sortAndDeduplicate([...movies, ...tvShows, ...anime, ...games], trimmed);
}

function sortAndDeduplicate(
  items: MediaSearchResult[],
  query: string
): MediaSearchResult[] {
  if (items.length === 0) return [];

  // Score each item
  const scored = items.map((item) => ({
    item,
    score: calculateScore(item, query),
  }));

  // Keep items with positive relevance
  const filtered = scored.filter((s) => s.score >= 50);
  const pool = filtered.length > 0 ? filtered : scored;

  // Sort descending by relevance score
  pool.sort((a, b) => b.score - a.score);

  // Deduplicate by mediaType + normalized title
  const seen = new Set<string>();
  const deduplicated: MediaSearchResult[] = [];

  for (const { item } of pool) {
    const key = `${item.mediaType}:${normalizeString(item.title)}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(item);
    }
  }

  return deduplicated.slice(0, 36);
}
