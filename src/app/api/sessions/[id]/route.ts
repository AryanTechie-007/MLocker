import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/get-user";
import { SafeIdSchema, UpdateSessionSchema } from "@/lib/domain/validation";
import {
  unauthorizedResponse,
  notFoundResponse,
  validationErrorResponse,
  internalErrorResponse,
} from "@/lib/api-response";

/**
 * GET /api/sessions/[id]
 * Retrieves a single session by ID, enforcing tenant isolation.
 */
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

    const session = await prisma.activitySession.findFirst({
      where: { id, userId },
      include: {
        source: true,
      },
    });

    if (!session) {
      return notFoundResponse("Session not found");
    }

    return NextResponse.json({ session });
  } catch (error) {
    console.error("GET /api/sessions/[id] error:", error);
    return internalErrorResponse("Failed to fetch session");
  }
}

/**
 * PATCH /api/sessions/[id]
 * Updates notes, progress, rating, or activeSeconds of a session.
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

    const rawBody = await req.json().catch(() => null);
    const parseResult = UpdateSessionSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return validationErrorResponse(parseResult.error);
    }

    // Verify session exists and belongs to user
    const existing = await prisma.activitySession.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return notFoundResponse("Session not found");
    }

    const data = parseResult.data;
    const session = await prisma.activitySession.update({
      where: { id },
      data: {
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.progressEnd !== undefined
          ? { progressEnd: data.progressEnd }
          : {}),
        ...(data.activeSeconds !== undefined
          ? { activeSeconds: data.activeSeconds }
          : {}),
      },
    });

    return NextResponse.json({ session });
  } catch (error) {
    console.error("PATCH /api/sessions/[id] error:", error);
    return internalErrorResponse("Failed to update session");
  }
}

/**
 * DELETE /api/sessions/[id]
 * Deletes a recorded activity session.
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

    // Verify session belongs to user before deletion
    const existing = await prisma.activitySession.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return notFoundResponse("Session not found");
    }

    await prisma.activitySession.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/sessions/[id] error:", error);
    return internalErrorResponse("Failed to delete session");
  }
}
