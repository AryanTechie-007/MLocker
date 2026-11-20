import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/get-user";
import { SafeIdSchema, UpdateMediaSourceSchema } from "@/lib/domain/validation";
import { extractNormalizedDomain } from "@/lib/domain/source-domain";
import {
  unauthorizedResponse,
  notFoundResponse,
  validationErrorResponse,
  internalErrorResponse,
} from "@/lib/api-response";

/**
 * PATCH /api/sources/[id]
 * Updates an existing external source.
 * Enforces relational tenant isolation: verifies source belongs to a UserMedia owned by session.userId.
 */
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

    // Verify source exists and belongs to a UserMedia owned by this user
    const existing = await prisma.mediaSource.findFirst({
      where: {
        id,
        userMedia: {
          userId,
        },
      },
      select: {
        id: true,
        userMediaId: true,
      },
    });

    if (!existing) {
      return notFoundResponse("Source not found or access denied");
    }

    const rawBody = await req.json().catch(() => null);
    const parseResult = UpdateMediaSourceSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return validationErrorResponse(parseResult.error);
    }

    const body = parseResult.data;
    const updateData: {
      name?: string;
      url?: string;
      normalizedDomain?: string;
      sourceType?: string;
    } = {};

    if (body.name !== undefined) {
      updateData.name = body.name;
    }
    if (body.url !== undefined) {
      updateData.url = body.url;
      updateData.normalizedDomain = extractNormalizedDomain(body.url);
    }
    if (body.sourceType !== undefined) {
      updateData.sourceType = body.sourceType;
    }

    const updated = await prisma.mediaSource.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ source: updated });
  } catch (error) {
    console.error("PATCH /api/sources/[id] error:", error);
    return internalErrorResponse("Failed to update media source");
  }
}

/**
 * DELETE /api/sources/[id]
 * Removes an existing external source.
 * Enforces relational tenant isolation: verifies source belongs to a UserMedia owned by session.userId.
 */
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

    // Verify source exists and belongs to a UserMedia owned by this user
    const existing = await prisma.mediaSource.findFirst({
      where: {
        id,
        userMedia: {
          userId,
        },
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      return notFoundResponse("Source not found or access denied");
    }

    await prisma.mediaSource.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/sources/[id] error:", error);
    return internalErrorResponse("Failed to delete media source");
  }
}
