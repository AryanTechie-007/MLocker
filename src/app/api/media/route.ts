import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/get-user";
import { Prisma } from "@prisma/client";
import { CreateMediaSchema, MediaQuerySchema } from "@/lib/domain/validation";
import {
  unauthorizedResponse,
  validationErrorResponse,
  internalErrorResponse,
} from "@/lib/api-response";

export async function GET(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return unauthorizedResponse();
    }

    const { searchParams } = new URL(req.url);
    const queryParams = Object.fromEntries(searchParams.entries());
    const parseResult = MediaQuerySchema.safeParse(queryParams);

    if (!parseResult.success) {
      return validationErrorResponse(parseResult.error);
    }

    const {
      type: mediaType,
      status,
      favorite: isFavorite,
      q: search,
      limit,
      sortBy,
      sortOrder,
    } = parseResult.data;

    const whereClause: Prisma.UserMediaWhereInput = { userId };

    if (mediaType && mediaType !== "all") {
      whereClause.mediaType = mediaType;
    }

    if (status && status !== "all") {
      whereClause.status = status;
    }

    if (isFavorite === "true") {
      whereClause.isFavorite = true;
    }

    if (search && search.trim()) {
      whereClause.title = {
        contains: search.trim(),
      };
    }

    const items = await prisma.userMedia.findMany({
      where: whereClause,
      orderBy: { [sortBy]: sortOrder },
      take: limit,
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error("GET /api/media error:", error);
    return internalErrorResponse("Failed to fetch media items");
  }
}

export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return unauthorizedResponse();
    }

    const rawBody = await req.json().catch(() => null);
    const parseResult = CreateMediaSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return validationErrorResponse(parseResult.error);
    }

    const {
      mediaType,
      externalId,
      externalSource,
      title,
      posterUrl,
      year,
      genres,
      overview,
      status,
      rating,
      review,
      isFavorite,
      totalEpisodes,
      watchedEpisodes,
      totalChapters,
      readChapters,
      hoursPlayed,
      tags,
    } = parseResult.data;

    // Check if already exists for this user and externalId
    let existing = null;
    if (externalId) {
      existing = await prisma.userMedia.findUnique({
        where: {
          userId_mediaType_externalId: {
            userId,
            mediaType,
            externalId,
          },
        },
      });
    }

    if (existing) {
      // Update existing item
      const updated = await prisma.userMedia.update({
        where: { id: existing.id },
        data: {
          status: status ?? existing.status,
          rating: rating !== undefined ? rating : existing.rating,
          review: review !== undefined ? review : existing.review,
          isFavorite: isFavorite !== undefined ? isFavorite : existing.isFavorite,
          watchedEpisodes:
            watchedEpisodes !== undefined ? watchedEpisodes : existing.watchedEpisodes,
          readChapters:
            readChapters !== undefined ? readChapters : existing.readChapters,
          hoursPlayed:
            hoursPlayed !== undefined ? hoursPlayed : existing.hoursPlayed,
          tags: tags ? (Array.isArray(tags) ? JSON.stringify(tags) : tags) : existing.tags,
        },
      });
      return NextResponse.json({ item: updated });
    }

    // Create new tracked media item
    const newItem = await prisma.userMedia.create({
      data: {
        userId,
        mediaType,
        externalId: externalId ?? null,
        externalSource: externalSource || "manual",
        title,
        posterUrl: posterUrl || null,
        year: year ?? null,
        genres: Array.isArray(genres) ? JSON.stringify(genres) : genres || null,
        overview: overview || null,
        status: status || "plan_to_consume",
        rating: rating !== undefined ? rating : null,
        review: review || null,
        isFavorite: Boolean(isFavorite),
        totalEpisodes: totalEpisodes ?? null,
        watchedEpisodes: watchedEpisodes ?? 0,
        totalChapters: totalChapters ?? null,
        readChapters: readChapters ?? 0,
        hoursPlayed: hoursPlayed ?? 0,
        tags: tags ? (Array.isArray(tags) ? JSON.stringify(tags) : tags) : null,
      },
    });

    return NextResponse.json({ item: newItem }, { status: 201 });
  } catch (error) {
    console.error("POST /api/media error:", error);
    return internalErrorResponse("Failed to create media item");
  }
}
