import { MediaSearchResult, WatchProvider } from "./types";

interface SteamStoreSearchItem {
  id: number;
  name: string;
  tiny_image?: string;
  metascore?: string;
  platforms?: {
    windows?: boolean;
    mac?: boolean;
    linux?: boolean;
  };
}

interface SteamStoreSearchResponse {
  total: number;
  items: SteamStoreSearchItem[];
}

export async function searchGames(query: string): Promise<MediaSearchResult[]> {
  if (!query || !query.trim()) return [];

  try {
    const res = await fetch(
      `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(
        query.trim()
      )}&l=english&cc=US`,
      { next: { revalidate: 3600 } }
    );

    if (!res.ok) return [];
    const data: SteamStoreSearchResponse = await res.json();
    const items = data.items || [];

    const topItems = items.slice(0, 8);

    const results = await Promise.all(
      topItems.map(async (item) => {
        let year: number | null = null;
        let genres: string[] = ["Video Game"];
        let overview = "";

        try {
          const detailRes = await fetch(
            `https://store.steampowered.com/api/appdetails?appids=${item.id}`,
            { next: { revalidate: 86400 } }
          );
          if (detailRes.ok) {
            const detailJson = await detailRes.json();
            const appData = detailJson[String(item.id)]?.data;
            if (appData) {
              if (appData.release_date?.date) {
                const yearMatch = appData.release_date.date.match(/\d{4}/);
                if (yearMatch) {
                  year = parseInt(yearMatch[0], 10);
                }
              }
              if (appData.genres && Array.isArray(appData.genres)) {
                const gList = appData.genres.map((g: { description: string }) => g.description);
                if (gList.length > 0) {
                  genres = gList.slice(0, 3);
                }
              }
              if (appData.short_description) {
                overview = appData.short_description;
              }
            }
          }
        } catch {
          // If details fetch fails, continue with basic search metadata
        }

        const metascoreRating = item.metascore
          ? Math.round((parseFloat(item.metascore) / 10) * 10) / 10
          : null;

        const cleanTitle = encodeURIComponent(item.name.trim());

        const watchProviders: WatchProvider[] = [
          {
            name: "Steam",
            url: `https://store.steampowered.com/app/${item.id}/`,
            type: "stream",
          },
          {
            name: "Epic Games",
            url: `https://store.epicgames.com/en-US/browse?q=${cleanTitle}`,
            type: "stream",
          },
          {
            name: "GOG",
            url: `https://www.gog.com/en/games?query=${cleanTitle}`,
            type: "stream",
          },
        ];

        return {
          externalId: String(item.id),
          externalSource: "steam" as const,
          mediaType: "game" as const,
          title: item.name,
          posterUrl: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${item.id}/library_600x900.jpg`,
          year,
          genres,
          overview: overview || "Discover this game on Steam, Epic Games Store, and GOG.",
          externalRating: metascoreRating,
          watchProviders,
        };
      })
    );

    return results;
  } catch (err) {
    console.error("Steam game search error:", err);
    return [];
  }
}
