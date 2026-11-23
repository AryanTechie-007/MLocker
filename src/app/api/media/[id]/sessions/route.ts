import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/get-user";
import { SafeIdSchema, SessionQuerySchema } from "@/lib/domain/validation";
import { Prisma } from "@prisma/client";
import {
  unauthorizedResponse,
  notFoundResponse,
  validationErrorResponse,
  internalErrorResponse,
} from "@/lib/api-response";

/**
 * GET /api/media/[id]/sessions
 * Returns historical sessions for a user's media item.
 * Strictly verifies ownership via `userId: session.userId`.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userMediaId } = await params;
    const idValidation = SafeIdSchema.safeParse(userMediaId);
    if (!idValidation.success) {
      return validationErrorResponse(idValidation.error);
    }

    const userId = await getUserId();
    if (!userId) {
      return unauthorizedResponse();
    }

    // Verify parent media item exists and belongs to current authenticated user
    const mediaItem = await prisma.userMedia.findFirst({
      where: { id: userMediaId, userId },
      select: { id: true },
    });

    if (!mediaItem) {
      return notFoundResponse("Media item not found");
    }

    const { searchParams } = new URL(req.url);
    const queryParams = Object.fromEntries(searchParams.entries());
    const parseResult = SessionQuerySchema.safeParse(queryParams);
    if (!parseResult.success) {
      return validationErrorResponse(parseResult.error);
    }

    const { status, limit, offset } = parseResult.data;

    const where: Prisma.ActivitySessionWhereInput = {
      userMediaId,
      userId,
      ...(status ? { status } : {}),
    };

    const [sessions, total] = await Promise.all([
      prisma.activitySession.findMany({
        where,
        orderBy: { startedAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.activitySession.count({ where }),
    ]);

    return NextResponse.json({ sessions, total });
  } catch (error) {
    console.error("GET /api/media/[id]/sessions error:", error);
    return internalErrorResponse("Failed to fetch sessions");
  }
}
