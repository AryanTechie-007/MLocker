import { MediaSearchResult, WatchProvider } from "./types";

interface TMDBMovie {
  id: number;
  title: string;
  poster_path?: string | null;
  release_date?: string;
  overview?: string;
  vote_average?: number;
  genre_ids?: number[];
  original_language?: string;
}

interface TMDBTVShow {
  id: number;
  name: string;
  poster_path?: string | null;
  first_air_date?: string;
  overview?: string;
  vote_average?: number;
  genre_ids?: number[];
  original_language?: string;
}

interface ProviderInfo {
  provider_id: number;
  provider_name: string;
  logo_path?: string;
}

interface TMDBWatchProviderResponse {
  results?: {
    [region: string]: {
      link?: string;
      flatrate?: ProviderInfo[];
      rent?: ProviderInfo[];
      buy?: ProviderInfo[];
      free?: ProviderInfo[];
    };
  };
}

const TMDB_GENRE_MAP: Record<number, string> = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Sci-Fi",
  10770: "TV Movie",
  53: "Thriller",
  10752: "War",
  37: "Western",
  10759: "Action & Adventure",
  10762: "Kids",
  10763: "News",
  10764: "Reality",
  10765: "Sci-Fi & Fantasy",
  10766: "Soap",
  10767: "Talk",
  10768: "War & Politics",
};

function getTMDBKey(): string {
  return process.env.TMDB_API_KEY || "c93be9cb1dc8ff2594820332b1defeeb";
}

/**
 * Builds a direct search/watch link to the streaming service's website
 * instead of opening TMDb or JustWatch landing pages.
 */
export function getDirectStreamingUrl(providerName: string, title: string): string {
  const cleanTitle = encodeURIComponent(title.trim());
  const lower = (providerName || "").toLowerCase();

  // Anime / Asian streaming
  if (lower.includes("crunchyroll")) {
    return `https://www.crunchyroll.com/search?q=${cleanTitle}`;
  }
  if (lower.includes("hidive")) {
    return `https://www.hidive.com/search?q=${cleanTitle}`;
  }
  if (lower.includes("viki")) {
    return `https://www.viki.com/search?q=${cleanTitle}`;
  }

  // Major global streaming
  if (lower.includes("netflix")) {
    return `https://www.netflix.com/search?q=${cleanTitle}`;
  }
  if (lower.includes("prime") || lower.includes("amazon")) {
    return `https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${cleanTitle}`;
  }
  if (lower.includes("hotstar")) {
    return `https://www.hotstar.com/in/explore?search_query=${cleanTitle}`;
  }
  if (lower.includes("disney")) {
    return `https://www.disneyplus.com/search?q=${cleanTitle}`;
  }
  if (lower.includes("max") || lower.includes("hbo")) {
    return `https://play.max.com/search?q=${cleanTitle}`;
  }
  if (lower.includes("apple") || lower.includes("itunes")) {
    return `https://tv.apple.com/search?term=${cleanTitle}`;
  }
  if (lower.includes("hulu")) {
    return `https://www.hulu.com/search?q=${cleanTitle}`;
  }
  if (lower.includes("paramount")) {
    return `https://www.paramountplus.com/search/?q=${cleanTitle}`;
  }
  if (lower.includes("peacock")) {
    return `https://www.peacocktv.com/search?q=${cleanTitle}`;
  }
  if (lower.includes("youtube")) {
    return `https://www.youtube.com/results?search_query=${cleanTitle}+full+movie`;
  }
  if (lower.includes("google play") || lower.includes("google tv")) {
    return `https://play.google.com/store/search?q=${cleanTitle}&c=movies`;
  }
  if (lower.includes("tubi")) {
    return `https://tubitv.com/search/${cleanTitle}`;
  }
  if (lower.includes("pluto")) {
    return `https://pluto.tv/search/details?q=${cleanTitle}`;
  }
  if (lower.includes("jiocinema")) {
    return `https://www.jiocinema.com/search/${cleanTitle}`;
  }
  if (lower.includes("sony") || lower.includes("liv")) {
    return `https://www.sonyliv.com/search?q=${cleanTitle}`;
  }
  if (lower.includes("zee5")) {
    return `https://www.zee5.com/search?q=${cleanTitle}`;
  }
  if (lower.includes("discovery")) {
    return `https://www.discoveryplus.com/search?q=${cleanTitle}`;
  }
  if (lower.includes("starz")) {
    return `https://www.starz.com/us/en/search?q=${cleanTitle}`;
  }
  if (lower.includes("mubi")) {
    return `https://mubi.com/search/films?query=${cleanTitle}`;
  }
  if (lower.includes("criterion")) {
    return `https://www.criterionchannel.com/search?q=${cleanTitle}`;
  }
  if (lower.includes("iplayer") || lower.includes("bbc")) {
    return `https://www.bbc.co.uk/iplayer/search?q=${cleanTitle}`;
  }
  if (lower.includes("itvx")) {
    return `https://www.itv.com/watch/search?q=${cleanTitle}`;
  }
  if (lower.includes("channel 4")) {
    return `https://www.channel4.com/search?q=${cleanTitle}`;
  }
  if (lower.includes("shudder")) {
    return `https://www.shudder.com/search?q=${cleanTitle}`;
  }
  if (lower.includes("vudu") || lower.includes("fandango")) {
    return `https://www.vudu.com/content/movies/search?minYear=0&searchString=${cleanTitle}`;
  }

  // Fallback to Google direct watch query
  return `https://www.google.com/search?q=watch+${cleanTitle}+on+${encodeURIComponent(providerName)}`;
}

/**
 * Normalizes provider name to avoid duplicate ad-tiers or channel duplicates
 * e.g. "Netflix Standard with Ads" -> "Netflix"
 * "Crunchyroll Amazon Channel" -> "Crunchyroll"
 */
function normalizeProviderName(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("crunchyroll")) return "Crunchyroll";
  if (lower.includes("netflix")) return "Netflix";
  if (lower.includes("prime") || lower.includes("amazon")) return "Prime Video";
  if (lower.includes("hotstar")) return "Hotstar";
  if (lower.includes("disney")) return "Disney+";
  if (lower.includes("max") || lower.includes("hbo")) return "Max";
  if (lower.includes("apple")) return "Apple TV";
  if (lower.includes("hulu")) return "Hulu";
  if (lower.includes("paramount")) return "Paramount+";
  if (lower.includes("peacock")) return "Peacock";
  if (lower.includes("hidive")) return "HIDIVE";
  return raw;
}

export async function fetchWatchProviders(
  id: number,
  type: "movie" | "tv",
  title: string,
  key: string,
  isAnime?: boolean
): Promise<WatchProvider[]> {
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/${type}/${id}/watch/providers?api_key=${key}`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) {
      if (isAnime) {
        return [
          {
            name: "Crunchyroll",
            url: `https://www.crunchyroll.com/search?q=${encodeURIComponent(title)}`,
            type: "stream",
          },
        ];
      }
      return [];
    }

    const data: TMDBWatchProviderResponse = await res.json();
    const results = data.results || {};

    const providers: WatchProvider[] = [];
    const seen = new Set<string>();

    const addProvider = (p: ProviderInfo, streamType: "stream" | "rent" | "buy" = "stream") => {
      const normalized = normalizeProviderName(p.provider_name);
      if (!seen.has(normalized)) {
        seen.add(normalized);
        providers.push({
          name: normalized,
          logoUrl: p.logo_path ? `https://image.tmdb.org/t/p/original${p.logo_path}` : undefined,
          url: getDirectStreamingUrl(normalized, title),
          type: streamType,
        });
      }
    };

    // Check if Crunchyroll exists in ANY region on TMDB
    let foundCrunchyrollOnTMDB = false;
    for (const reg of Object.values(results)) {
      if (reg.flatrate?.some((p) => p.provider_name.toLowerCase().includes("crunchyroll"))) {
        foundCrunchyrollOnTMDB = true;
        break;
      }
    }

    // If it's anime or Crunchyroll was found anywhere, give Crunchyroll top spot
    if (isAnime || foundCrunchyrollOnTMDB) {
      seen.add("Crunchyroll");
      providers.push({
        name: "Crunchyroll",
        url: `https://www.crunchyroll.com/search?q=${encodeURIComponent(title)}`,
        type: "stream",
      });
    }

    // Inspect candidate regions for flatrate streaming (US, IN, GB, CA, JP, AU)
    const priorityRegions = [results.US, results.IN, results.GB, results.CA, results.JP, results.AU].filter(Boolean);
    for (const reg of priorityRegions) {
      if (reg?.flatrate && Array.isArray(reg.flatrate)) {
        for (const p of reg.flatrate) {
          addProvider(p, "stream");
          if (providers.length >= 4) break;
        }
      }
      if (providers.length >= 4) break;
    }

    // Fallback to rent/buy if no stream options
    if (providers.length === 0) {
      for (const reg of priorityRegions) {
        if (reg?.rent && Array.isArray(reg.rent)) {
          for (const p of reg.rent) {
            addProvider(p, "rent");
            if (providers.length >= 2) break;
          }
        }
        if (providers.length >= 2) break;
      }
    }

    return providers.slice(0, 4);
  } catch (err) {
    console.error(`Failed to fetch watch providers for ${type} ${id}:`, err);
    if (isAnime) {
      return [
        {
          name: "Crunchyroll",
          url: `https://www.crunchyroll.com/search?q=${encodeURIComponent(title)}`,
          type: "stream",
        },
      ];
    }
    return [];
  }
}

function checkIsAnime(
  title: string,
  overview: string = "",
  genreIds: number[] = [],
  originalLanguage?: string
): boolean {
  if (originalLanguage === "ja") return true;
  if (genreIds.includes(16)) {
    if (/anime|manga|japan|studio|trigger|mappa|ufotable|wit|toei|ghibli/i.test(overview)) return true;
    if (/edgerunners|dungeon meshi|cyberpunk/i.test(title)) return true;
  }
  return false;
}

export async function searchTMDBMovies(query: string): Promise<MediaSearchResult[]> {
  const key = getTMDBKey();
  if (!key) return [];

  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/search/movie?api_key=${key}&query=${encodeURIComponent(
        query
      )}&include_adult=false&language=en-US&page=1`,
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const results: TMDBMovie[] = data.results || [];

    const topItems = results.slice(0, 10);
    const withProviders = await Promise.all(
      topItems.map(async (item) => {
        const isAnime = checkIsAnime(
          item.title,
          item.overview,
          item.genre_ids,
          item.original_language
        );
        const watchProviders = await fetchWatchProviders(item.id, "movie", item.title, key, isAnime);
        const year = item.release_date ? new Date(item.release_date).getFullYear() || null : null;
        const genres = (item.genre_ids || [])
          .map((id) => TMDB_GENRE_MAP[id])
          .filter(Boolean)
          .slice(0, 3);

        if (isAnime && !genres.includes("Anime")) {
          genres.unshift("Anime");
        }

        return {
          externalId: String(item.id),
          externalSource: "tmdb" as const,
          mediaType: isAnime ? ("anime" as const) : ("movie" as const),
          title: item.title,
          posterUrl: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
          year,
          genres: genres.length > 0 ? genres : ["Movie"],
          overview: item.overview || "",
          externalRating: item.vote_average ? Math.round(item.vote_average * 10) / 10 : null,
          watchProviders,
        };
      })
    );

    return withProviders;
  } catch (err) {
    console.error("TMDB Movie Search Error:", err);
    return [];
  }
}

export async function searchTMDBTV(query: string): Promise<MediaSearchResult[]> {
  const key = getTMDBKey();
  if (!key) return [];

  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/search/tv?api_key=${key}&query=${encodeURIComponent(
        query
      )}&include_adult=false&language=en-US&page=1`,
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const results: TMDBTVShow[] = data.results || [];

    const topItems = results.slice(0, 10);
    const withProviders = await Promise.all(
      topItems.map(async (item) => {
        const isAnime = checkIsAnime(
          item.name,
          item.overview,
          item.genre_ids,
          item.original_language
        );
        const watchProviders = await fetchWatchProviders(item.id, "tv", item.name, key, isAnime);
        const year = item.first_air_date ? new Date(item.first_air_date).getFullYear() || null : null;
        const genres = (item.genre_ids || [])
          .map((id) => TMDB_GENRE_MAP[id])
          .filter(Boolean)
          .slice(0, 3);

        if (isAnime && !genres.includes("Anime")) {
          genres.unshift("Anime");
        }

        return {
          externalId: String(item.id),
          externalSource: "tmdb" as const,
          mediaType: isAnime ? ("anime" as const) : ("tv" as const),
          title: item.name,
          posterUrl: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
          year,
          genres: genres.length > 0 ? genres : ["TV Show"],
          overview: item.overview || "",
          externalRating: item.vote_average ? Math.round(item.vote_average * 10) / 10 : null,
          watchProviders,
        };
      })
    );

    return withProviders;
  } catch (err) {
    console.error("TMDB TV Search Error:", err);
    return [];
  }
}

export async function searchTMDBAnime(query: string): Promise<MediaSearchResult[]> {
  const key = getTMDBKey();
  if (!key) return [];

  try {
    const [tvRes, movieRes] = await Promise.all([
      fetch(
        `https://api.themoviedb.org/3/search/tv?api_key=${key}&query=${encodeURIComponent(
          query
        )}&include_adult=false&language=en-US&page=1`,
        { next: { revalidate: 3600 } }
      ),
      fetch(
        `https://api.themoviedb.org/3/search/movie?api_key=${key}&query=${encodeURIComponent(
          query
        )}&include_adult=false&language=en-US&page=1`,
        { next: { revalidate: 3600 } }
      ),
    ]);

    const tvData = tvRes.ok ? await tvRes.json() : { results: [] };
    const movieData = movieRes.ok ? await movieRes.json() : { results: [] };

    const tvItems: TMDBTVShow[] = tvData.results || [];
    const movieItems: TMDBMovie[] = movieData.results || [];

    const isAnimeTv = (item: TMDBTVShow) =>
      checkIsAnime(item.name, item.overview, item.genre_ids, item.original_language);

    const isAnimeMovie = (item: TMDBMovie) =>
      checkIsAnime(item.title, item.overview, item.genre_ids, item.original_language);

    const filteredTv = tvItems.filter(isAnimeTv);
    const filteredMovies = movieItems.filter(isAnimeMovie);

    // Fall back to top results if strict filter caught nothing
    const candidateTv = filteredTv.length > 0 ? filteredTv.slice(0, 8) : tvItems.slice(0, 5);
    const candidateMovies = filteredMovies.length > 0 ? filteredMovies.slice(0, 4) : movieItems.slice(0, 3);

    const processedTv = await Promise.all(
      candidateTv.map(async (item) => {
        const watchProviders = await fetchWatchProviders(item.id, "tv", item.name, key, true);
        const year = item.first_air_date ? new Date(item.first_air_date).getFullYear() || null : null;
        const genres = (item.genre_ids || [])
          .map((id) => TMDB_GENRE_MAP[id])
          .filter(Boolean)
          .slice(0, 2);

        if (!genres.includes("Anime")) genres.unshift("Anime");

        return {
          externalId: String(item.id),
          externalSource: "tmdb" as const,
          mediaType: "anime" as const,
          title: item.name,
          posterUrl: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
          year,
          genres,
          overview: item.overview || "",
          externalRating: item.vote_average ? Math.round(item.vote_average * 10) / 10 : null,
          watchProviders,
        };
      })
    );

    const processedMovies = await Promise.all(
      candidateMovies.map(async (item) => {
        const watchProviders = await fetchWatchProviders(item.id, "movie", item.title, key, true);
        const year = item.release_date ? new Date(item.release_date).getFullYear() || null : null;
        const genres = (item.genre_ids || [])
          .map((id) => TMDB_GENRE_MAP[id])
          .filter(Boolean)
          .slice(0, 2);

        if (!genres.includes("Anime")) genres.unshift("Anime");

        return {
          externalId: String(item.id),
          externalSource: "tmdb" as const,
          mediaType: "anime" as const,
          title: item.title,
          posterUrl: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
          year,
          genres,
          overview: item.overview || "",
          externalRating: item.vote_average ? Math.round(item.vote_average * 10) / 10 : null,
          watchProviders,
        };
      })
    );

    return [...processedTv, ...processedMovies];
  } catch (err) {
    console.error("TMDB Anime Search Error:", err);
    return [];
  }
}
