import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getOrCreateUserId(): Promise<string | null> {
  const session = await auth();
  if (session?.user?.id) return session.user.id;

  const guest = await prisma.user.findUnique({
    where: { email: "guest@medialocker.local" },
  });
  return guest?.id || null;
}

export async function GET() {
  try {
    const userId = await getOrCreateUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const items = await prisma.userMedia.findMany({
      where: { userId },
    });

    const totalTracked = items.length;

    // Counts by media type
    const mediaTypeCounts: Record<string, number> = {
      movie: 0,
      tv: 0,
      anime: 0,
      manga: 0,
      game: 0,
      novel: 0,
    };

    // Status breakdown overall & per type
    const statusCounts: Record<string, number> = {
      plan_to_consume: 0,
      in_progress: 0,
      completed: 0,
      on_hold: 0,
      dropped: 0,
    };

    const statusByType: Record<string, Record<string, number>> = {
      movie: { plan_to_consume: 0, in_progress: 0, completed: 0, on_hold: 0, dropped: 0 },
      tv: { plan_to_consume: 0, in_progress: 0, completed: 0, on_hold: 0, dropped: 0 },
      anime: { plan_to_consume: 0, in_progress: 0, completed: 0, on_hold: 0, dropped: 0 },
      manga: { plan_to_consume: 0, in_progress: 0, completed: 0, on_hold: 0, dropped: 0 },
      game: { plan_to_consume: 0, in_progress: 0, completed: 0, on_hold: 0, dropped: 0 },
      novel: { plan_to_consume: 0, in_progress: 0, completed: 0, on_hold: 0, dropped: 0 },
    };

    let totalHoursPlayed = 0;
    let totalEpisodesWatched = 0;
    let totalChaptersRead = 0;
    let totalRatingSum = 0;
    let ratedCount = 0;
    let favoriteCount = 0;

    // Rating histogram (1 to 10)
    const ratingHistogram: Record<number, number> = {
      1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0,
    };

    // Genre distribution
    const genreCounts: Record<string, number> = {};

    items.forEach((item) => {
      // Type count
      if (mediaTypeCounts[item.mediaType] !== undefined) {
        mediaTypeCounts[item.mediaType]++;
      }

      // Status count
      if (statusCounts[item.status] !== undefined) {
        statusCounts[item.status]++;
      }

      if (statusByType[item.mediaType] && statusByType[item.mediaType][item.status] !== undefined) {
        statusByType[item.mediaType][item.status]++;
      }

      // Progress metrics
      if (item.hoursPlayed) totalHoursPlayed += item.hoursPlayed;
      if (item.watchedEpisodes) totalEpisodesWatched += item.watchedEpisodes;
      if (item.readChapters) totalChaptersRead += item.readChapters;

      // Ratings
      if (item.rating !== null && item.rating !== undefined) {
        totalRatingSum += item.rating;
        ratedCount++;
        const rounded = Math.min(10, Math.max(1, Math.round(item.rating)));
        ratingHistogram[rounded] = (ratingHistogram[rounded] || 0) + 1;
      }

      if (item.isFavorite) {
        favoriteCount++;
      }

      // Genres
      if (item.genres) {
        try {
          const parsed = JSON.parse(item.genres);
          if (Array.isArray(parsed)) {
            parsed.forEach((g: string) => {
              const cleaned = g.trim();
              if (cleaned) {
                genreCounts[cleaned] = (genreCounts[cleaned] || 0) + 1;
              }
            });
          }
        } catch {
          // not JSON, fallback single string
          const cleaned = item.genres.trim();
          if (cleaned) genreCounts[cleaned] = (genreCounts[cleaned] || 0) + 1;
        }
      }
    });

    const averageRating = ratedCount > 0 ? (totalRatingSum / ratedCount).toFixed(1) : "0.0";

    // Top genres
    const sortedGenres = Object.entries(genreCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Top rated items
    const topRated = [...items]
      .filter((i) => i.rating !== null && i.rating !== undefined)
      .sort((a, b) => (b.rating || 0) - (a.rating || 0))
      .slice(0, 6);

    // Donut data for media types
    const mediaTypeChartData = Object.entries(mediaTypeCounts)
      .map(([type, count]) => ({
        type,
        name: type.charAt(0).toUpperCase() + type.slice(1),
        count,
      }))
      .filter((d) => d.count > 0);

    // Rating histogram array
    const ratingChartData = Object.entries(ratingHistogram).map(([score, count]) => ({
      score: `${score}★`,
      count,
    }));

    return NextResponse.json({
      stats: {
        totalTracked,
        favoriteCount,
        averageRating,
        totalHoursPlayed: Math.round(totalHoursPlayed * 10) / 10,
        totalEpisodesWatched,
        totalChaptersRead,
        mediaTypeCounts,
        statusCounts,
        statusByType,
        mediaTypeChartData,
        ratingChartData,
        topGenres: sortedGenres,
        topRated,
      },
    });
  } catch (error) {
    console.error("GET /api/stats error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
