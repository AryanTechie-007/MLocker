import { MediaSearchResult } from "./types";

interface TVMazeShowItem {
  show: {
    id: number;
    name: string;
    premiered?: string;
    image?: {
      original?: string;
      medium?: string;
    };
    genres?: string[];
    summary?: string;
    rating?: {
      average?: number;
    };
    network?: {
      name?: string;
    };
    webChannel?: {
      name?: string;
    };
    officialSite?: string;
  };
}

export async function searchTV(query: string): Promise<MediaSearchResult[]> {
  try {
    const res = await fetch(
      `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`,
      { next: { revalidate: 3600 }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return [];
    const items: TVMazeShowItem[] = await res.json();

    return items.slice(0, 12).map(({ show }) => {
      let year: number | null = null;
      if (show.premiered) {
        year = new Date(show.premiered).getFullYear() || null;
      }

      // Strip basic HTML tags from TVMaze summary
      const cleanSummary = (show.summary || "").replace(/<[^>]*>?/gm, "").trim();

      // Extract streaming platform or network
      const providerName = show.webChannel?.name || show.network?.name;
      const watchProviders = providerName
        ? [{ name: providerName, url: show.officialSite || undefined, type: "stream" as const }]
        : undefined;

      return {
        externalId: String(show.id),
        externalSource: "tvmaze",
        mediaType: "tv",
        title: show.name,
        posterUrl: show.image?.original || show.image?.medium || null,
        year,
        genres: show.genres || [],
        overview: cleanSummary,
        externalRating: show.rating?.average || null,
        watchProviders,
      };
    });
  } catch (err) {
    console.error("TVMaze Search Error:", err);
    return [];
  }
}
