import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/get-user";
import { SafeIdSchema, CreateMediaSourceSchema } from "@/lib/domain/validation";
import { extractNormalizedDomain } from "@/lib/domain/source-domain";
import {
  unauthorizedResponse,
  notFoundResponse,
  validationErrorResponse,
  internalErrorResponse,
} from "@/lib/api-response";

/**
 * GET /api/media/[id]/sources
 * Returns all external sources registered to the specified media item.
 * Strictly verifies ownership via `userMedia.userId === session.userId`.
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
      return notFoundResponse("Media item not found or access denied");
    }

    const sources = await prisma.mediaSource.findMany({
      where: { userMediaId },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ sources });
  } catch (error) {
    console.error("GET /api/media/[id]/sources error:", error);
    return internalErrorResponse("Failed to fetch sources");
  }
}

/**
 * POST /api/media/[id]/sources
 * Adds a new external source to the specified media item.
 * Strictly verifies ownership of the media item and validates URL protocol allowlist.
 */
export async function POST(
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

    // Verify parent media item belongs to current authenticated user
    const mediaItem = await prisma.userMedia.findFirst({
      where: { id: userMediaId, userId },
      select: { id: true },
    });

    if (!mediaItem) {
      return notFoundResponse("Media item not found or access denied");
    }

    const rawBody = await req.json().catch(() => null);
    const parseResult = CreateMediaSourceSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return validationErrorResponse(parseResult.error);
    }

    const { name, url, sourceType } = parseResult.data;
    const normalizedDomain = extractNormalizedDomain(url);

    const source = await prisma.mediaSource.create({
      data: {
        userMediaId,
        name,
        url,
        normalizedDomain,
        sourceType: sourceType || "web",
      },
    });

    return NextResponse.json({ source }, { status: 201 });
  } catch (error) {
    console.error("POST /api/media/[id]/sources error:", error);
    return internalErrorResponse("Failed to create media source");
  }
}
