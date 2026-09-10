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
}

export async function searchMovies(query: string): Promise<MediaSearchResult[]> {
  try {
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&limit=30`,
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const items: ITunesItem[] = data.results || [];

    // Filter for movies or video content
    const movies = items.filter(
      (item) =>
        item.kind === "feature-movie" ||
        item.kind === "movie" ||
        (!item.kind && item.trackName)
    );

    return (movies.length > 0 ? movies : items.slice(0, 10)).map((item) => {
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
      };
    });
  } catch (err) {
    console.error("iTunes Movie Search Error:", err);
    return [];
  }
}
