import { searchMovies } from "./itunes";
import { searchTV } from "./tvmaze";
import { searchTMDBMovies, searchTMDBTV, searchTMDBAnime } from "./tmdb";
import { searchGames } from "./steam";
import { searchAnime as searchKitsuAnime, searchManga as searchKitsuManga } from "./kitsu";
import { searchBooks as searchOpenLibraryBooks } from "./openLibrary";
import { MediaSearchResult, MediaType } from "./types";

export function normalizeString(str: string): string {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function calculateScore(item: MediaSearchResult, query: string): number {
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
    try {
      const tmdb = await searchTMDBMovies(query);
      if (tmdb && tmdb.length > 0) return tmdb;
    } catch (err) {
      console.error("TMDB Movie Search Error, falling back to iTunes:", err);
    }
  }
  try {
    return await searchMovies(query);
  } catch (err) {
    console.error("iTunes Movie Search Error:", err);
    return [];
  }
}

async function getTVShows(query: string): Promise<MediaSearchResult[]> {
  if (process.env.TMDB_API_KEY) {
    try {
      const tmdb = await searchTMDBTV(query);
      if (tmdb && tmdb.length > 0) return tmdb;
    } catch (err) {
      console.error("TMDB TV Search Error, falling back to TVMaze:", err);
    }
  }
  try {
    return await searchTV(query);
  } catch (err) {
    console.error("TVMaze Search Error:", err);
    return [];
  }
}

async function getAnime(query: string): Promise<MediaSearchResult[]> {
  // Decision 3: TMDb is primary, Kitsu is fallback
  if (process.env.TMDB_API_KEY) {
    try {
      const tmdb = await searchTMDBAnime(query);
      if (tmdb && tmdb.length > 0) return tmdb;
    } catch (err) {
      console.error("TMDB Anime Search Error, falling back to Kitsu:", err);
    }
  }
  try {
    return await searchKitsuAnime(query);
  } catch (err) {
    console.error("Kitsu Anime Search Error:", err);
    return [];
  }
}

async function getManga(query: string): Promise<MediaSearchResult[]> {
  try {
    return await searchKitsuManga(query);
  } catch (err) {
    console.error("Kitsu Manga Search Error:", err);
    return [];
  }
}

async function getGamesSafe(query: string): Promise<MediaSearchResult[]> {
  try {
    return await searchGames(query);
  } catch (err) {
    console.error("Steam Game Search Error:", err);
    return [];
  }
}

async function getNovels(query: string): Promise<MediaSearchResult[]> {
  try {
    return await searchOpenLibraryBooks(query);
  } catch (err) {
    console.error("Open Library Book Search Error:", err);
    return [];
  }
}

export async function searchMedia(
  query: string,
  type?: MediaType | "book" | "all"
): Promise<MediaSearchResult[]> {
  if (!query || query.trim().length === 0) return [];

  const trimmed = query.trim();
  const normalizedType = type === "book" ? "novel" : type;

  if (normalizedType === "movie") {
    const movies = await getMovies(trimmed);
    return sortAndDeduplicate(movies, trimmed);
  }
  if (normalizedType === "tv") {
    const tv = await getTVShows(trimmed);
    return sortAndDeduplicate(tv, trimmed);
  }
  if (normalizedType === "anime") {
    const anime = await getAnime(trimmed);
    return sortAndDeduplicate(anime, trimmed);
  }
  if (normalizedType === "manga") {
    const manga = await getManga(trimmed);
    return sortAndDeduplicate(manga, trimmed);
  }
  if (normalizedType === "game") {
    const games = await getGamesSafe(trimmed);
    return sortAndDeduplicate(games, trimmed);
  }
  if (normalizedType === "novel") {
    const novels = await getNovels(trimmed);
    return sortAndDeduplicate(novels, trimmed);
  }

  // Unified Search: Movies, TV Shows, Anime, Manga, Games, and Novels in parallel
  const [movies, tvShows, anime, manga, games, novels] = await Promise.all([
    getMovies(trimmed),
    getTVShows(trimmed),
    getAnime(trimmed),
    getManga(trimmed),
    getGamesSafe(trimmed),
    getNovels(trimmed),
  ]);

  return sortAndDeduplicate(
    [...movies, ...tvShows, ...anime, ...manga, ...games, ...novels],
    trimmed
  );
}

export function sortAndDeduplicate(
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
