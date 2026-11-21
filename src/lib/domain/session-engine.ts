/**
 * Pure Domain Session Engine
 *
 * Implements the core finite state machine, dual-bounded time crediting formula,
 * sequence gap rejection, idempotency checks, and continuity bounds for MLocker sessions.
 * ZERO framework / Next.js / Electron / Node OS imports.
 * Safe to execute in Node, Electron, Web Workers, or browsers.
 */

export const NOMINAL_HEARTBEAT_INTERVAL_SECONDS = 15;
export const MAX_ACTIVE_GAP_SECONDS = 45; // G_active
export const IDLE_CUTOFF_SECONDS = 60;
export const PAUSED_INACTIVITY_TIMEOUT_SECONDS = 300; // 5 minutes
export const MAX_SESSION_DURATION_SECONDS = 43200; // 12 hours
export const MAX_SINGLE_PULSE_CREDIT_SECONDS = 17; // 15s + 2s clock skew tolerance
export const MAX_MANUAL_SESSION_DURATION_SECONDS = 86400; // 24 hours

export const SESSION_STATUSES = [
  "active",
  "paused",
  "completed",
  "recovered",
  "abandoned",
] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const SESSION_CLOSE_REASONS = [
  "user_stop",
  "inactivity_timeout",
  "active_gap",
  "clock_jump",
  "clean_shutdown",
  "crash_recovery",
  "max_duration",
  "user_discard",
  "manual_entry",
  "unrecoverable_sequence_gap",
] as const;
export type SessionCloseReason = (typeof SESSION_CLOSE_REASONS)[number];

export const SESSION_EVENT_TYPES = [
  "START",
  "HEARTBEAT",
  "PAUSE",
  "RESUME",
  "STOP",
  "RECOVER",
  "DISCARD",
] as const;
export type SessionEventType = (typeof SESSION_EVENT_TYPES)[number];

export const SESSION_SOURCE_TYPES = [
  "web",
  "desktop",
  "manual",
  "extension",
] as const;
export type SessionSourceType = (typeof SESSION_SOURCE_TYPES)[number];

export interface SessionState {
  id: string;
  userId: string;
  userMediaId: string;
  sourceId?: string | null;
  sourceType: SessionSourceType;
  isManual: boolean;
  status: SessionStatus;
  closeReason?: SessionCloseReason | null;
  activeSeconds: number;
  lastSequenceNumber: number;
  lastClientNonce?: string | null;
  startedAt: Date;
  endedAt?: Date | null;
  lastHeartbeatAt?: Date | null;
  notes?: string | null;
  progressStart?: number | null;
  progressEnd?: number | null;
}

export interface HeartbeatEvaluationInput {
  sessionId: string;
  sequenceNumber: number;
  clientNonce: string;
  timestamp: Date | string;
  durationSeconds: number;
  isFocused?: boolean;
  eventType?: SessionEventType;
}

export type HeartbeatEvaluationResult =
  | {
      kind: "ACCEPT";
      creditedSeconds: number;
      newActiveSeconds: number;
      newSequenceNumber: number;
      newStatus: SessionStatus;
      closeReason?: SessionCloseReason | null;
      isSealed: boolean;
    }
  | {
      kind: "IDEMPOTENT_DUPLICATE";
      currentSequence: number;
      currentStatus: SessionStatus;
    }
  | {
      kind: "REJECT";
      code:
        | "NOT_FOUND"
        | "SESSION_SEALED"
        | "SEQUENCE_GAP"
        | "STALE_SEQUENCE"
        | "NONCE_COLLISION"
        | "INVALID_PAYLOAD"
        | "CONCURRENCY_CONFLICT";
      message: string;
      details?: Record<string, unknown>;
    };

/**
 * Validates whether a state transition is legal in the finite state machine.
 */
export function isValidStateTransition(
  from: SessionStatus,
  to: SessionStatus
): boolean {
  if (from === to) return true;
  switch (from) {
    case "active":
      return (
        to === "paused" ||
        to === "completed" ||
        to === "recovered" ||
        to === "abandoned"
      );
    case "paused":
      return (
        to === "active" ||
        to === "completed" ||
        to === "recovered" ||
        to === "abandoned"
      );
    case "completed":
    case "recovered":
    case "abandoned":
      // Terminal states cannot transition to any other state
      return false;
    default:
      return false;
  }
}

/**
 * Calculates dual-bounded active seconds credited for a single pulse.
 * Bounded by:
 * - 0 if unfocused
 * - 0 if backward clock step (serverElapsedSeconds < 0)
 * - 0 if gap exceeds MAX_ACTIVE_GAP_SECONDS (45s)
 * - min(reportedDuration, serverElapsedSeconds, MAX_SINGLE_PULSE_CREDIT_SECONDS [17s])
 */
export function calculateCreditedSeconds(
  reportedDuration: number,
  serverElapsedSeconds: number,
  isFocused: boolean = true
): number {
  if (!isFocused) {
    return 0;
  }
  if (serverElapsedSeconds < 0) {
    return 0;
  }
  if (serverElapsedSeconds > MAX_ACTIVE_GAP_SECONDS) {
    return 0;
  }
  const safeReported = Math.max(0, reportedDuration);
  const credited = Math.min(
    safeReported,
    serverElapsedSeconds,
    MAX_SINGLE_PULSE_CREDIT_SECONDS
  );
  return Math.floor(credited);
}

/**
 * Evaluates an incoming heartbeat against the current session state.
 * Implements strict sequence validation, deduplication idempotency,
 * continuity bounding, and state machine transitions.
 */
export function evaluateHeartbeat(
  currentState: SessionState,
  payload: HeartbeatEvaluationInput,
  serverReceivedAt: Date = new Date()
): HeartbeatEvaluationResult {
  // 1. Session must be in active or paused state
  if (currentState.status !== "active" && currentState.status !== "paused") {
    return {
      kind: "REJECT",
      code: "SESSION_SEALED",
      message: "Session already sealed",
      details: { currentStatus: currentState.status },
    };
  }

  // 2. Check Sequence Number & Nonce Idempotency
  if (payload.sequenceNumber === currentState.lastSequenceNumber) {
    if (payload.clientNonce === currentState.lastClientNonce) {
      return {
        kind: "IDEMPOTENT_DUPLICATE",
        currentSequence: currentState.lastSequenceNumber,
        currentStatus: currentState.status,
      };
    }
    return {
      kind: "REJECT",
      code: "NONCE_COLLISION",
      message: "Nonce collision for sequence",
      details: {
        sequenceNumber: payload.sequenceNumber,
        expectedNonce: currentState.lastClientNonce,
        receivedNonce: payload.clientNonce,
      },
    };
  }

  if (payload.sequenceNumber < currentState.lastSequenceNumber) {
    return {
      kind: "REJECT",
      code: "STALE_SEQUENCE",
      message: "Stale heartbeat sequence",
      details: {
        currentSequence: currentState.lastSequenceNumber,
        receivedSequence: payload.sequenceNumber,
      },
    };
  }

  if (payload.sequenceNumber > currentState.lastSequenceNumber + 1) {
    return {
      kind: "REJECT",
      code: "SEQUENCE_GAP",
      message: "Sequence gap detected",
      details: {
        expectedSequence: currentState.lastSequenceNumber + 1,
        receivedSequence: payload.sequenceNumber,
      },
    };
  }

  // Sequence is strictly currentState.lastSequenceNumber + 1
  const prevTimeMs = currentState.lastHeartbeatAt
    ? new Date(currentState.lastHeartbeatAt).getTime()
    : new Date(currentState.startedAt).getTime();
  const serverReceivedMs = serverReceivedAt.getTime();
  const serverElapsedMs = serverReceivedMs - prevTimeMs;
  const serverElapsedSeconds = serverElapsedMs / 1000;

  const eventType = payload.eventType ?? "HEARTBEAT";
  const isFocused = payload.isFocused ?? true;

  // 3. Paused session handling
  if (currentState.status === "paused") {
    if (serverElapsedSeconds > PAUSED_INACTIVITY_TIMEOUT_SECONDS) {
      return {
        kind: "ACCEPT",
        creditedSeconds: 0,
        newActiveSeconds: currentState.activeSeconds,
        newSequenceNumber: payload.sequenceNumber,
        newStatus: "completed",
        closeReason: "inactivity_timeout",
        isSealed: true,
      };
    }

    if (eventType === "RESUME") {
      return {
        kind: "ACCEPT",
        creditedSeconds: 0,
        newActiveSeconds: currentState.activeSeconds,
        newSequenceNumber: payload.sequenceNumber,
        newStatus: "active",
        closeReason: null,
        isSealed: false,
      };
    }

    if (eventType === "STOP") {
      return {
        kind: "ACCEPT",
        creditedSeconds: 0,
        newActiveSeconds: currentState.activeSeconds,
        newSequenceNumber: payload.sequenceNumber,
        newStatus: "completed",
        closeReason: "user_stop",
        isSealed: true,
      };
    }

    if (eventType === "DISCARD") {
      return {
        kind: "ACCEPT",
        creditedSeconds: 0,
        newActiveSeconds: currentState.activeSeconds,
        newSequenceNumber: payload.sequenceNumber,
        newStatus: "abandoned",
        closeReason: "user_discard",
        isSealed: true,
      };
    }

    // While paused, normal HEARTBEAT pulses yield 0 credit
    return {
      kind: "ACCEPT",
      creditedSeconds: 0,
      newActiveSeconds: currentState.activeSeconds,
      newSequenceNumber: payload.sequenceNumber,
      newStatus: "paused",
      closeReason: null,
      isSealed: false,
    };
  }

  // 4. Active session handling
  if (serverElapsedSeconds > MAX_ACTIVE_GAP_SECONDS) {
    // Gap exceeded: auto-seal with active_gap, credit 0
    return {
      kind: "ACCEPT",
      creditedSeconds: 0,
      newActiveSeconds: currentState.activeSeconds,
      newSequenceNumber: payload.sequenceNumber,
      newStatus: "completed",
      closeReason: "active_gap",
      isSealed: true,
    };
  }

  if (eventType === "PAUSE") {
    const credited = calculateCreditedSeconds(
      payload.durationSeconds,
      serverElapsedSeconds,
      isFocused
    );
    const newActive = currentState.activeSeconds + credited;
    return {
      kind: "ACCEPT",
      creditedSeconds: credited,
      newActiveSeconds: newActive,
      newSequenceNumber: payload.sequenceNumber,
      newStatus: "paused",
      closeReason: null,
      isSealed: false,
    };
  }

  if (eventType === "STOP") {
    const credited = calculateCreditedSeconds(
      payload.durationSeconds,
      serverElapsedSeconds,
      isFocused
    );
    const newActive = currentState.activeSeconds + credited;
    return {
      kind: "ACCEPT",
      creditedSeconds: credited,
      newActiveSeconds: newActive,
      newSequenceNumber: payload.sequenceNumber,
      newStatus: "completed",
      closeReason: "user_stop",
      isSealed: true,
    };
  }

  if (eventType === "DISCARD") {
    return {
      kind: "ACCEPT",
      creditedSeconds: 0,
      newActiveSeconds: currentState.activeSeconds,
      newSequenceNumber: payload.sequenceNumber,
      newStatus: "abandoned",
      closeReason: "user_discard",
      isSealed: true,
    };
  }

  // Standard HEARTBEAT pulse
  const credited = calculateCreditedSeconds(
    payload.durationSeconds,
    serverElapsedSeconds,
    isFocused
  );
  const newActive = currentState.activeSeconds + credited;

  if (newActive >= MAX_SESSION_DURATION_SECONDS) {
    return {
      kind: "ACCEPT",
      creditedSeconds: credited,
      newActiveSeconds: Math.min(newActive, MAX_SESSION_DURATION_SECONDS),
      newSequenceNumber: payload.sequenceNumber,
      newStatus: "completed",
      closeReason: "max_duration",
      isSealed: true,
    };
  }

  return {
    kind: "ACCEPT",
    creditedSeconds: credited,
    newActiveSeconds: newActive,
    newSequenceNumber: payload.sequenceNumber,
    newStatus: "active",
    closeReason: null,
    isSealed: false,
  };
}
