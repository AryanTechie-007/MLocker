import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/get-user";
import {
  unauthorizedResponse,
  internalErrorResponse,
} from "@/lib/api-response";

export async function GET() {
  try {
    const userId = await getUserId();
    if (!userId) {
      return unauthorizedResponse();
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

    for (const item of items) {
      // Type count
      if (item.mediaType in mediaTypeCounts) {
        mediaTypeCounts[item.mediaType]++;
      }

      // Status count
      if (item.status in statusCounts) {
        statusCounts[item.status]++;
      }

      // Status by type
      if (statusByType[item.mediaType] && item.status in statusByType[item.mediaType]) {
        statusByType[item.mediaType][item.status]++;
      }

      // Time & Progress aggregates
      if (item.hoursPlayed) {
        totalHoursPlayed += item.hoursPlayed;
      }
      if (item.watchedEpisodes) {
        totalEpisodesWatched += item.watchedEpisodes;
      }
      if (item.readChapters) {
        totalChaptersRead += item.readChapters;
      }

      // Ratings
      if (item.rating !== null && item.rating !== undefined) {
        totalRatingSum += item.rating;
        ratedCount++;
        const rounded = Math.round(item.rating);
        if (rounded >= 1 && rounded <= 10) {
          ratingHistogram[rounded]++;
        }
      }

      // Favorites
      if (item.isFavorite) {
        favoriteCount++;
      }

      // Genres
      if (item.genres) {
        try {
          const parsedGenres = JSON.parse(item.genres);
          if (Array.isArray(parsedGenres)) {
            for (const g of parsedGenres) {
              const clean = String(g).trim();
              if (clean) {
                genreCounts[clean] = (genreCounts[clean] || 0) + 1;
              }
            }
          }
        } catch {
          // If plain comma string
          const split = item.genres.split(",");
          for (const s of split) {
            const clean = s.trim();
            if (clean) {
              genreCounts[clean] = (genreCounts[clean] || 0) + 1;
            }
          }
        }
      }
    }

    const averageRating = ratedCount > 0 ? parseFloat((totalRatingSum / ratedCount).toFixed(1)) : 0;

    // Top genres sorted
    const topGenres = Object.entries(genreCounts)
      .map(([genre, count]) => ({ genre, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    const stats = {
      totalTracked,
      mediaTypeCounts,
      statusCounts,
      statusByType,
      totalHoursPlayed: Math.round(totalHoursPlayed * 10) / 10,
      totalEpisodesWatched,
      totalChaptersRead,
      averageRating,
      ratedCount,
      favoriteCount,
      ratingHistogram,
      topGenres,
    };

    return NextResponse.json({ stats });
  } catch (error) {
    console.error("GET /api/stats error:", error);
    return internalErrorResponse("Failed to calculate media statistics");
  }
}
