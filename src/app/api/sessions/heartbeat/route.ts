import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/get-user";
import { HeartbeatPayloadSchema } from "@/lib/domain/validation";
import {
  evaluateHeartbeat,
  type SessionState,
  type SessionSourceType,
  type SessionStatus,
  type SessionCloseReason,
} from "@/lib/domain/session-engine";
import {
  unauthorizedResponse,
  notFoundResponse,
  conflictResponse,
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
    const parseResult = HeartbeatPayloadSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return validationErrorResponse(parseResult.error);
    }
    const payload = parseResult.data;
    const serverNow = new Date();

    const transactionResult = await prisma.$transaction(async (tx) => {
      // 1. Fetch current session within transaction
      const current = await tx.activitySession.findFirst({
        where: { id: payload.sessionId, userId },
      });

      if (!current || current.userMediaId !== payload.userMediaId) {
        return { type: "NOT_FOUND" as const };
      }

      const sessionState: SessionState = {
        id: current.id,
        userId: current.userId,
        userMediaId: current.userMediaId,
        sourceId: current.sourceId,
        sourceType: current.sourceType as SessionSourceType,
        isManual: current.isManual,
        status: current.status as SessionStatus,
        closeReason: current.closeReason as SessionCloseReason | null,
        activeSeconds: current.activeSeconds,
        lastSequenceNumber: current.lastSequenceNumber,
        lastClientNonce: current.lastClientNonce,
        startedAt: current.startedAt,
        endedAt: current.endedAt,
        lastHeartbeatAt: current.lastHeartbeatAt,
        notes: current.notes,
        progressStart: current.progressStart,
        progressEnd: current.progressEnd,
      };

      // 2. Evaluate heartbeat using pure domain engine
      const evalResult = evaluateHeartbeat(sessionState, payload, serverNow);

      if (evalResult.kind === "IDEMPOTENT_DUPLICATE") {
        return {
          type: "IDEMPOTENT_DUPLICATE" as const,
          status: evalResult.currentStatus,
          sequenceNumber: evalResult.currentSequence,
        };
      }

      if (evalResult.kind === "REJECT") {
        return {
          type: "REJECT" as const,
          code: evalResult.code,
          message: evalResult.message,
          details: evalResult.details,
        };
      }

      // 3. Execute Atomic CAS update
      const endedAtVal = evalResult.isSealed ? serverNow : null;
      const closeReasonVal = evalResult.closeReason ?? null;

      const updateCount = await tx.$executeRaw`
        UPDATE "ActivitySession"
        SET "activeSeconds" = ${evalResult.newActiveSeconds},
            "lastSequenceNumber" = ${evalResult.newSequenceNumber},
            "lastClientNonce" = ${payload.clientNonce},
            "lastHeartbeatAt" = ${serverNow},
            "status" = ${evalResult.newStatus},
            "closeReason" = ${closeReasonVal},
            "endedAt" = ${endedAtVal},
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${payload.sessionId}
          AND "userId" = ${userId}
          AND "status" IN ('active', 'paused')
          AND "lastSequenceNumber" = ${current.lastSequenceNumber};
      `;

      if (updateCount === 0) {
        // Concurrency collision occurred; re-read session to classify
        const reRead = await tx.activitySession.findFirst({
          where: { id: payload.sessionId, userId },
        });

        if (!reRead || (reRead.status !== "active" && reRead.status !== "paused")) {
          return {
            type: "REJECT" as const,
            code: "SESSION_SEALED",
            message: "Session already sealed",
            details: { currentStatus: reRead?.status },
          };
        }

        if (reRead.lastSequenceNumber === payload.sequenceNumber) {
          if (reRead.lastClientNonce === payload.clientNonce) {
            return {
              type: "IDEMPOTENT_DUPLICATE" as const,
              status: reRead.status,
              sequenceNumber: reRead.lastSequenceNumber,
            };
          }
          return {
            type: "REJECT" as const,
            code: "NONCE_COLLISION",
            message: "Nonce collision for sequence",
          };
        }

        if (reRead.lastSequenceNumber > current.lastSequenceNumber) {
          return {
            type: "REJECT" as const,
            code: "STALE_SEQUENCE",
            message: "Stale heartbeat sequence",
            details: { currentSequence: reRead.lastSequenceNumber },
          };
        }

        return {
          type: "REJECT" as const,
          code: "CONCURRENCY_CONFLICT",
          message: "Concurrency conflict during session update",
        };
      }

      // 4. Record ActivityEvent in append-only audit trail
      await tx.activityEvent.create({
        data: {
          userId,
          sessionId: payload.sessionId,
          userMediaId: payload.userMediaId,
          clientNonce: payload.clientNonce,
          eventType: payload.eventType ?? "HEARTBEAT",
          sequenceNumber: payload.sequenceNumber,
          durationSeconds: payload.durationSeconds,
          isFocused: payload.isFocused ?? true,
          timestamp: new Date(payload.timestamp),
        },
      });

      return {
        type: "SUCCESS" as const,
        status: evalResult.newStatus,
        activeSeconds: evalResult.newActiveSeconds,
        sequenceNumber: evalResult.newSequenceNumber,
      };
    });

    if (transactionResult.type === "NOT_FOUND") {
      return notFoundResponse("Session not found");
    }

    if (transactionResult.type === "IDEMPOTENT_DUPLICATE") {
      return NextResponse.json(
        {
          success: true,
          status: transactionResult.status,
          sequenceNumber: transactionResult.sequenceNumber,
          idempotent: true,
        },
        { status: 200 }
      );
    }

    if (transactionResult.type === "REJECT") {
      return conflictResponse(
        transactionResult.message,
        transactionResult.code,
        transactionResult.details
      );
    }

    return NextResponse.json(
      {
        success: true,
        status: transactionResult.status,
        activeSeconds: transactionResult.activeSeconds,
        sequenceNumber: transactionResult.sequenceNumber,
      },
      { status: 200 }
    );
  } catch (error) {
    return internalErrorResponse(
      error instanceof Error ? error.message : "Failed to process heartbeat"
    );
  }
}
