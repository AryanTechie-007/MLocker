export type MediaType = "movie" | "tv" | "anime" | "manga" | "game" | "novel";

export type MediaStatus =
  | "plan_to_consume"
  | "in_progress"
  | "completed"
  | "on_hold"
  | "dropped";

export type ExternalSource =
  | "tmdb"
  | "steam"
  | "crunchyroll"
  | "kitsu"
  | "jikan" // Preserved for backward compatibility with existing records; active anime/manga provider is kitsu
  | "itunes"
  | "tvmaze"
  | "openlibrary"
  | "manual";

export interface WatchProvider {
  name: string;
  logoUrl?: string;
  url?: string;
  type?: "stream" | "rent" | "buy";
}

export interface MediaSearchResult {
  externalId: string;
  externalSource: ExternalSource;
  mediaType: MediaType;
  title: string;
  posterUrl: string | null;
  year: number | null;
  genres: string[];
  overview: string;
  externalRating: number | null;
  totalEpisodes?: number;
  totalChapters?: number;
  watchProviders?: WatchProvider[];
}

export interface MediaSourceItem {
  id: string;
  userMediaId: string;
  name: string;
  url: string;
  normalizedDomain: string;
  sourceType: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserMediaItem {
  id: string;
  userId: string;
  mediaType: MediaType;
  externalId: string | null;
  externalSource: ExternalSource | string | null;
  title: string;
  posterUrl: string | null;
  year: number | null;
  genres: string | null;
  overview: string | null;
  status: MediaStatus;
  rating: number | null;
  review: string | null;
  isFavorite: boolean;
  totalEpisodes: number | null;
  watchedEpisodes: number | null;
  totalChapters: number | null;
  readChapters: number | null;
  hoursPlayed: number | null;
  startDate?: string | null;
  endDate?: string | null;
  tags?: string | null;
  createdAt: string;
  updatedAt: string;
  sources?: MediaSourceItem[];
  collectionItems?: {
    id: string;
    collectionId: string;
    collection?: Collection;
  }[];
}

export interface CollectionItem {
  id: string;
  collectionId: string;
  userMediaId: string;
  order: number;
  createdAt: string;
  userMedia: UserMediaItem;
}

export interface Collection {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  coverUrl: string | null;
  createdAt: string;
  updatedAt: string;
  items?: CollectionItem[];
}

export interface StatsResponse {
  totalTracked: number;
  favoriteCount: number;
  averageRating: string;
  totalHoursPlayed: number;
  totalEpisodesWatched: number;
  totalChaptersRead: number;
  mediaTypeCounts: Record<MediaType, number>;
  statusCounts: Record<MediaStatus, number>;
  statusByType: Record<MediaType, Record<MediaStatus, number>>;
  mediaTypeChartData: { type: string; name: string; count: number }[];
  ratingChartData: { score: string; count: number }[];
  topGenres: { name: string; count: number }[];
  topRated: UserMediaItem[];
}

export interface ActivitySessionItem {
  id: string;
  userId: string;
  userMediaId: string;
  sourceId: string | null;
  startedAt: string;
  endedAt: string | null;
  lastHeartbeatAt: string | null;
  activeSeconds: number;
  lastSequenceNumber: number;
  sourceType: string;
  isManual: boolean;
  status: string;
  closeReason: string | null;
  notes: string | null;
  progressStart: number | null;
  progressEnd: number | null;
  createdAt: string;
  updatedAt: string;
  source?: MediaSourceItem | null;
}
