import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/get-user";
import {
  CreateSessionSchema,
  CreateManualSessionSchema,
} from "@/lib/domain/validation";
import {
  unauthorizedResponse,
  notFoundResponse,
  validationErrorResponse,
  internalErrorResponse,
} from "@/lib/api-response";

export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return unauthorizedResponse();
    }

    const rawBody = await req.json();

    // Discriminate between manual session and active session
    const isManual =
      rawBody.sourceType === "manual" ||
      (rawBody.startedAt !== undefined && rawBody.endedAt !== undefined);

    if (isManual) {
      const parseResult = CreateManualSessionSchema.safeParse(rawBody);
      if (!parseResult.success) {
        return validationErrorResponse(parseResult.error);
      }
      const data = parseResult.data;

      // Verify media item belongs to requesting user (Tenant Isolation)
      const media = await prisma.userMedia.findFirst({
        where: { id: data.userMediaId, userId },
      });
      if (!media) {
        return notFoundResponse("Media item not found");
      }

      const session = await prisma.activitySession.create({
        data: {
          userId,
          userMediaId: data.userMediaId,
          sourceType: "manual",
          isManual: true,
          status: "completed",
          closeReason: "manual_entry",
          startedAt: new Date(data.startedAt),
          endedAt: new Date(data.endedAt),
          lastHeartbeatAt: new Date(data.endedAt),
          activeSeconds: data.activeSeconds,
          notes: data.notes ?? null,
          progressStart: data.progressStart ?? null,
          progressEnd: data.progressEnd ?? null,
        },
      });

      return NextResponse.json({ session }, { status: 201 });
    }

    // Active session creation
    const parseResult = CreateSessionSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return validationErrorResponse(parseResult.error);
    }
    const data = parseResult.data;

    // Verify media item belongs to requesting user (Tenant Isolation)
    const media = await prisma.userMedia.findFirst({
      where: { id: data.userMediaId, userId },
    });
    if (!media) {
      return notFoundResponse("Media item not found");
    }

    // If sourceId provided, verify it belongs to this media
    if (data.sourceId) {
      const source = await prisma.mediaSource.findFirst({
        where: { id: data.sourceId, userMediaId: data.userMediaId },
      });
      if (!source) {
        return notFoundResponse("Media source not found");
      }
    }

    // If supersededSessionId provided, seal old session as unrecoverable_sequence_gap
    if (data.supersededSessionId) {
      await prisma.activitySession.updateMany({
        where: {
          id: data.supersededSessionId,
          userId,
          status: { in: ["active", "paused"] },
        },
        data: {
          status: "completed",
          closeReason: "unrecoverable_sequence_gap",
          endedAt: new Date(),
        },
      });
    }

    const now = new Date();
    const session = await prisma.activitySession.create({
      data: {
        userId,
        userMediaId: data.userMediaId,
        sourceId: data.sourceId ?? null,
        sourceType: data.sourceType ?? "web",
        isManual: false,
        status: "active",
        startedAt: now,
        lastHeartbeatAt: now,
        activeSeconds: 0,
        lastSequenceNumber: 0,
      },
    });

    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    return internalErrorResponse(
      error instanceof Error ? error.message : "Failed to create session"
    );
  }
}
