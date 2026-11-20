import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/get-user";
import { Prisma } from "@prisma/client";
import { SafeIdSchema, UpdateMediaSchema } from "@/lib/domain/validation";
import {
  unauthorizedResponse,
  notFoundResponse,
  validationErrorResponse,
  internalErrorResponse,
} from "@/lib/api-response";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const idValidation = SafeIdSchema.safeParse(id);
    if (!idValidation.success) {
      return validationErrorResponse(idValidation.error);
    }

    const userId = await getUserId();
    if (!userId) {
      return unauthorizedResponse();
    }

    const item = await prisma.userMedia.findFirst({
      where: { id, userId },
      include: {
        sources: {
          orderBy: { createdAt: "asc" },
        },
        collectionItems: {
          where: {
            collection: {
              userId,
            },
          },
          include: {
            collection: true,
          },
        },
      },
    });

    if (!item) {
      return notFoundResponse("Media item not found");
    }

    return NextResponse.json({ item });
  } catch (error) {
    console.error("GET /api/media/[id] error:", error);
    return internalErrorResponse("Failed to fetch media item");
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const idValidation = SafeIdSchema.safeParse(id);
    if (!idValidation.success) {
      return validationErrorResponse(idValidation.error);
    }

    const userId = await getUserId();
    if (!userId) {
      return unauthorizedResponse();
    }

    const existing = await prisma.userMedia.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return notFoundResponse("Media item not found");
    }

    const rawBody = await req.json().catch(() => null);
    const parseResult = UpdateMediaSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return validationErrorResponse(parseResult.error);
    }

    const body = parseResult.data;
    const updateData: Prisma.UserMediaUpdateInput = {};

    if (body.status !== undefined) updateData.status = body.status;
    if (body.rating !== undefined) updateData.rating = body.rating;
    if (body.review !== undefined) updateData.review = body.review;
    if (body.isFavorite !== undefined) updateData.isFavorite = body.isFavorite;
    if (body.watchedEpisodes !== undefined) updateData.watchedEpisodes = body.watchedEpisodes;
    if (body.totalEpisodes !== undefined) updateData.totalEpisodes = body.totalEpisodes;
    if (body.readChapters !== undefined) updateData.readChapters = body.readChapters;
    if (body.totalChapters !== undefined) updateData.totalChapters = body.totalChapters;
    if (body.hoursPlayed !== undefined) updateData.hoursPlayed = body.hoursPlayed;
    if (body.tags !== undefined) {
      updateData.tags = Array.isArray(body.tags) ? JSON.stringify(body.tags) : body.tags;
    }
    if (body.startDate !== undefined) updateData.startDate = body.startDate;
    if (body.endDate !== undefined) updateData.endDate = body.endDate;

    const updated = await prisma.userMedia.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ item: updated });
  } catch (error) {
    console.error("PATCH /api/media/[id] error:", error);
    return internalErrorResponse("Failed to update media item");
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const idValidation = SafeIdSchema.safeParse(id);
    if (!idValidation.success) {
      return validationErrorResponse(idValidation.error);
    }

    const userId = await getUserId();
    if (!userId) {
      return unauthorizedResponse();
    }

    const existing = await prisma.userMedia.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return notFoundResponse("Media item not found");
    }

    await prisma.userMedia.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/media/[id] error:", error);
    return internalErrorResponse("Failed to delete media item");
  }
}
