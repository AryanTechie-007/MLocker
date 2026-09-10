import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getOrCreateUserId(): Promise<string | null> {
  const session = await auth();
  if (session?.user?.id) {
    return session.user.id;
  }

  // Fallback guest user for effortless local testing
  const guest = await prisma.user.upsert({
    where: { email: "guest@medialocker.local" },
    update: {},
    create: {
      name: "Guest Explorer",
      email: "guest@medialocker.local",
    },
  });

  return guest.id;
}

export async function GET(req: Request) {
  try {
    const userId = await getOrCreateUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const mediaType = searchParams.get("type");
    const status = searchParams.get("status");
    const isFavorite = searchParams.get("favorite");
    const search = searchParams.get("q");

    const whereClause: any = { userId };

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
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error("GET /api/media error:", error);
    return NextResponse.json(
      { error: "Failed to fetch media items" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const userId = await getOrCreateUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
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
    } = body;

    if (!title || !mediaType) {
      return NextResponse.json(
        { error: "Title and mediaType are required" },
        { status: 400 }
      );
    }

    // Check if already exists for this user and externalId
    let existing = null;
    if (externalId) {
      existing = await prisma.userMedia.findUnique({
        where: {
          userId_mediaType_externalId: {
            userId,
            mediaType,
            externalId: String(externalId),
          },
        },
      });
    }

    if (existing) {
      // Update existing item
      const updated = await prisma.userMedia.update({
        where: { id: existing.id },
        data: {
          status: status || existing.status,
          rating: rating !== undefined ? rating : existing.rating,
          review: review !== undefined ? review : existing.review,
          isFavorite: isFavorite !== undefined ? isFavorite : existing.isFavorite,
          watchedEpisodes:
            watchedEpisodes !== undefined ? watchedEpisodes : existing.watchedEpisodes,
          readChapters:
            readChapters !== undefined ? readChapters : existing.readChapters,
          hoursPlayed:
            hoursPlayed !== undefined ? hoursPlayed : existing.hoursPlayed,
          tags: tags ? JSON.stringify(tags) : existing.tags,
        },
      });
      return NextResponse.json({ item: updated });
    }

    // Create new tracked media item
    const newItem = await prisma.userMedia.create({
      data: {
        userId,
        mediaType,
        externalId: externalId ? String(externalId) : null,
        externalSource: externalSource || "manual",
        title,
        posterUrl: posterUrl || null,
        year: year ? parseInt(year, 10) : null,
        genres: Array.isArray(genres) ? JSON.stringify(genres) : genres || null,
        overview: overview || null,
        status: status || "plan_to_consume",
        rating: rating !== undefined ? parseFloat(rating) : null,
        review: review || null,
        isFavorite: Boolean(isFavorite),
        totalEpisodes: totalEpisodes ? parseInt(totalEpisodes, 10) : null,
        watchedEpisodes: watchedEpisodes ? parseInt(watchedEpisodes, 10) : 0,
        totalChapters: totalChapters ? parseInt(totalChapters, 10) : null,
        readChapters: readChapters ? parseInt(readChapters, 10) : 0,
        hoursPlayed: hoursPlayed ? parseFloat(hoursPlayed) : 0,
        tags: tags ? JSON.stringify(tags) : null,
      },
    });

    return NextResponse.json({ item: newItem }, { status: 201 });
  } catch (error) {
    console.error("POST /api/media error:", error);
    return NextResponse.json(
      { error: "Failed to create media item" },
      { status: 500 }
    );
  }
}
