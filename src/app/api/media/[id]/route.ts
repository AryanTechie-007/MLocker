import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getUserId(): Promise<string | null> {
  const session = await auth();
  if (session?.user?.id) {
    return session.user.id;
  }
  // Check guest fallback
  const guest = await prisma.user.findUnique({
    where: { email: "guest@medialocker.local" },
  });
  return guest?.id || null;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const item = await prisma.userMedia.findFirst({
      where: { id, userId },
      include: {
        collectionItems: {
          include: {
            collection: true,
          },
        },
      },
    });

    if (!item) {
      return NextResponse.json({ error: "Media item not found" }, { status: 404 });
    }

    return NextResponse.json({ item });
  } catch (error) {
    console.error("GET /api/media/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch media item" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    const existing = await prisma.userMedia.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Media item not found" }, { status: 404 });
    }

    const updateData: any = {};

    if (body.status !== undefined) updateData.status = body.status;
    if (body.rating !== undefined) {
      updateData.rating = body.rating === null ? null : parseFloat(body.rating);
    }
    if (body.review !== undefined) updateData.review = body.review;
    if (body.isFavorite !== undefined) updateData.isFavorite = Boolean(body.isFavorite);
    if (body.watchedEpisodes !== undefined) {
      updateData.watchedEpisodes = parseInt(body.watchedEpisodes, 10);
    }
    if (body.totalEpisodes !== undefined) {
      updateData.totalEpisodes = body.totalEpisodes ? parseInt(body.totalEpisodes, 10) : null;
    }
    if (body.readChapters !== undefined) {
      updateData.readChapters = parseInt(body.readChapters, 10);
    }
    if (body.totalChapters !== undefined) {
      updateData.totalChapters = body.totalChapters ? parseInt(body.totalChapters, 10) : null;
    }
    if (body.hoursPlayed !== undefined) {
      updateData.hoursPlayed = parseFloat(body.hoursPlayed);
    }
    if (body.tags !== undefined) {
      updateData.tags = Array.isArray(body.tags) ? JSON.stringify(body.tags) : body.tags;
    }

    const updated = await prisma.userMedia.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ item: updated });
  } catch (error) {
    console.error("PATCH /api/media/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update media item" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const existing = await prisma.userMedia.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Media item not found" }, { status: 404 });
    }

    await prisma.userMedia.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/media/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete media item" },
      { status: 500 }
    );
  }
}
