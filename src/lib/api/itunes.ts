import { MediaSearchResult } from "./types";

interface ITunesItem {
  trackId?: number;
  collectionId?: number;
  trackName?: string;
  collectionName?: string;
  kind?: string;
  artworkUrl100?: string;
  releaseDate?: string;
  primaryGenreName?: string;
  longDescription?: string;
  shortDescription?: string;
  trackViewUrl?: string;
}

export async function searchMovies(query: string): Promise<MediaSearchResult[]> {
  try {
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&country=us&limit=25`,
      { next: { revalidate: 3600 }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const items: ITunesItem[] = data.results || [];

    // Filter strictly for feature movies (never podcasts, audiobooks, or songs)
    const movies = items.filter((item) => item.kind === "feature-movie");

    return movies.map((item) => {
      let year: number | null = null;
      if (item.releaseDate) {
        year = new Date(item.releaseDate).getFullYear() || null;
      }

      let poster = item.artworkUrl100 || null;
      if (poster) {
        poster = poster.replace("100x100bb", "600x600bb");
      }

      return {
        externalId: String(item.trackId || item.collectionId || Math.random()),
        externalSource: "itunes",
        mediaType: "movie",
        title: item.trackName || item.collectionName || query,
        posterUrl: poster,
        year,
        genres: item.primaryGenreName ? [item.primaryGenreName] : ["Movie"],
        overview: item.longDescription || item.shortDescription || "",
        externalRating: null,
        watchProviders: [
          {
            name: "Apple TV",
            url: item.trackViewUrl || undefined,
            type: "stream",
          },
        ],
      };
    });
  } catch (err) {
    console.error("iTunes Movie Search Error:", err);
    return [];
  }
}
