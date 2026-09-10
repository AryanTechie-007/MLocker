import { searchAnime, searchManga } from "./jikan";
import { searchMovies } from "./itunes";
import { searchTV } from "./tvmaze";
import { searchBooks } from "./openLibrary";
import { MediaSearchResult, MediaType } from "./types";

export async function searchMedia(
  query: string,
  type?: MediaType | "all"
): Promise<MediaSearchResult[]> {
  if (!query || query.trim().length === 0) return [];

  const trimmed = query.trim();

  if (type === "movie") {
    return searchMovies(trimmed);
  }
  if (type === "tv") {
    return searchTV(trimmed);
  }
  if (type === "anime") {
    return searchAnime(trimmed);
  }
  if (type === "manga") {
    return searchManga(trimmed);
  }
  if (type === "novel") {
    return searchBooks(trimmed);
  }
  if (type === "game") {
    return [];
  }

  // If "all" or unspecified, search everything in parallel
  const [movies, tvShows, anime, manga, books] = await Promise.all([
    searchMovies(trimmed),
    searchTV(trimmed),
    searchAnime(trimmed),
    searchManga(trimmed),
    searchBooks(trimmed),
  ]);

  return [...movies, ...tvShows, ...anime, ...manga, ...books];
}
