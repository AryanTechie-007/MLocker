export type MediaType = "movie" | "tv" | "anime" | "manga" | "game" | "novel";

export type MediaStatus =
  | "plan_to_consume"
  | "in_progress"
  | "completed"
  | "on_hold"
  | "dropped";

export interface MediaSearchResult {
  externalId: string;
  externalSource: "jikan" | "itunes" | "tvmaze" | "openlibrary" | "manual";
  mediaType: MediaType;
  title: string;
  posterUrl: string | null;
  year: number | null;
  genres: string[];
  overview: string;
  externalRating: number | null;
  totalEpisodes?: number;
  totalChapters?: number;
}
