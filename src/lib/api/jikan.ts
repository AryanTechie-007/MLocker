import { MediaSearchResult } from "./types";

interface KitsuItem {
  id: string | number;
  attributes?: {
    canonicalTitle?: string;
    titles?: { en?: string; en_jp?: string };
    posterImage?: { large?: string; medium?: string };
    startDate?: string;
    synopsis?: string;
    description?: string;
    averageRating?: string;
    episodeCount?: number;
    chapterCount?: number;
  };
}

export async function searchAnime(query: string): Promise<MediaSearchResult[]> {
  try {
    const res = await fetch(
      `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(query)}&page[limit]=12`,
      {
        headers: {
          Accept: "application/vnd.api+json",
          "Content-Type": "application/vnd.api+json",
        },
        next: { revalidate: 3600 },
      }
    );

    if (!res.ok) return [];
    const json = await res.json();
    const data: KitsuItem[] = json.data || [];

    return data.map((item) => {
      const attr = item.attributes || {};
      const rating = attr.averageRating ? Math.round((parseFloat(attr.averageRating) / 10) * 10) / 10 : null;
      let year: number | null = null;
      if (attr.startDate) {
        year = new Date(attr.startDate).getFullYear() || null;
      }

      return {
        externalId: String(item.id),
        externalSource: "kitsu",
        mediaType: "anime",
        title: attr.canonicalTitle || attr.titles?.en || attr.titles?.en_jp || query,
        posterUrl: attr.posterImage?.large || attr.posterImage?.medium || null,
        year,
        genres: ["Anime"],
        overview: attr.synopsis || attr.description || "",
        externalRating: rating,
        totalEpisodes: attr.episodeCount || undefined,
      };
    });
  } catch (err) {
    console.error("Kitsu anime search error:", err);
    return [];
  }
}

export async function searchManga(query: string): Promise<MediaSearchResult[]> {
  try {
    const res = await fetch(
      `https://kitsu.io/api/edge/manga?filter[text]=${encodeURIComponent(query)}&page[limit]=12`,
      {
        headers: {
          Accept: "application/vnd.api+json",
          "Content-Type": "application/vnd.api+json",
        },
        next: { revalidate: 3600 },
      }
    );

    if (!res.ok) return [];
    const json = await res.json();
    const data: KitsuItem[] = json.data || [];

    return data.map((item) => {
      const attr = item.attributes || {};
      const rating = attr.averageRating ? Math.round((parseFloat(attr.averageRating) / 10) * 10) / 10 : null;
      let year: number | null = null;
      if (attr.startDate) {
        year = new Date(attr.startDate).getFullYear() || null;
      }

      return {
        externalId: String(item.id),
        externalSource: "kitsu",
        mediaType: "manga",
        title: attr.canonicalTitle || attr.titles?.en || attr.titles?.en_jp || query,
        posterUrl: attr.posterImage?.large || attr.posterImage?.medium || null,
        year,
        genres: ["Manga"],
        overview: attr.synopsis || attr.description || "",
        externalRating: rating,
        totalChapters: attr.chapterCount || undefined,
      };
    });
  } catch (err) {
    console.error("Kitsu manga search error:", err);
    return [];
  }
}
