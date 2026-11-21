import { describe, it, expect } from "vitest";
import {
  calculateCreditedSeconds,
  evaluateHeartbeat,
  isValidStateTransition,
  NOMINAL_HEARTBEAT_INTERVAL_SECONDS,
  MAX_ACTIVE_GAP_SECONDS,
  MAX_SESSION_DURATION_SECONDS,
  MAX_SINGLE_PULSE_CREDIT_SECONDS,
  PAUSED_INACTIVITY_TIMEOUT_SECONDS,
  type SessionState,
} from "../../src/lib/domain/session-engine";

function createMockSession(overrides: Partial<SessionState> = {}): SessionState {
  const now = new Date("2026-11-20T10:00:00.000Z");
  return {
    id: "session-123",
    userId: "user-456",
    userMediaId: "media-789",
    sourceId: "source-001",
    sourceType: "web",
    isManual: false,
    status: "active",
    closeReason: null,
    activeSeconds: 0,
    lastSequenceNumber: 0,
    lastClientNonce: null,
    startedAt: now,
    endedAt: null,
    lastHeartbeatAt: now,
    notes: null,
    progressStart: 0,
    progressEnd: 0,
    ...overrides,
  };
}

describe("Pure Domain Session Engine (Milestone 5)", () => {
  describe("Time Crediting Formula (calculateCreditedSeconds)", () => {
    it("credits nominal duration when focused and within normal bounds", () => {
      const credited = calculateCreditedSeconds(15, 15, true);
      expect(credited).toBe(15);
    });

    it("credits 0 when window is not focused", () => {
      const credited = calculateCreditedSeconds(15, 15, false);
      expect(credited).toBe(0);
    });

    it("credits 0 on backward clock step (serverElapsedSeconds < 0)", () => {
      const credited = calculateCreditedSeconds(15, -5, true);
      expect(credited).toBe(0);
    });

    it("credits 0 when gap exceeds MAX_ACTIVE_GAP_SECONDS (45s)", () => {
      const credited = calculateCreditedSeconds(15, 46, true);
      expect(credited).toBe(0);
    });

    it("clamps pulse credit to MAX_SINGLE_PULSE_CREDIT_SECONDS (17s)", () => {
      const credited = calculateCreditedSeconds(30, 30, true);
      expect(credited).toBe(17);
    });

    it("bounds credit to server elapsed seconds when server elapsed is smaller than reported", () => {
      const credited = calculateCreditedSeconds(15, 10, true);
      expect(credited).toBe(10);
    });

    it("handles zero and negative reported duration gracefully", () => {
      expect(calculateCreditedSeconds(0, 15, true)).toBe(0);
      expect(calculateCreditedSeconds(-10, 15, true)).toBe(0);
    });
  });

  describe("State Machine Transition Validation (isValidStateTransition)", () => {
    it("allows active to transition to paused, completed, recovered, or abandoned", () => {
      expect(isValidStateTransition("active", "paused")).toBe(true);
      expect(isValidStateTransition("active", "completed")).toBe(true);
      expect(isValidStateTransition("active", "recovered")).toBe(true);
      expect(isValidStateTransition("active", "abandoned")).toBe(true);
      expect(isValidStateTransition("active", "active")).toBe(true);
    });

    it("allows paused to transition to active, completed, recovered, or abandoned", () => {
      expect(isValidStateTransition("paused", "active")).toBe(true);
      expect(isValidStateTransition("paused", "completed")).toBe(true);
      expect(isValidStateTransition("paused", "recovered")).toBe(true);
      expect(isValidStateTransition("paused", "abandoned")).toBe(true);
      expect(isValidStateTransition("paused", "paused")).toBe(true);
    });

    it("rejects transitions from terminal states", () => {
      expect(isValidStateTransition("completed", "active")).toBe(false);
      expect(isValidStateTransition("completed", "paused")).toBe(false);
      expect(isValidStateTransition("recovered", "active")).toBe(false);
      expect(isValidStateTransition("recovered", "paused")).toBe(false);
      expect(isValidStateTransition("abandoned", "active")).toBe(false);
    });
  });

  describe("Heartbeat Evaluation Engine (evaluateHeartbeat)", () => {
    it("accepts sequential heartbeat 1 and credits 15 seconds", () => {
      const session = createMockSession();
      const serverNow = new Date("2026-11-20T10:00:15.000Z");

      const result = evaluateHeartbeat(
        session,
        {
          sessionId: session.id,
          sequenceNumber: 1,
          clientNonce: "nonce-1",
          timestamp: serverNow,
          durationSeconds: 15,
          isFocused: true,
          eventType: "HEARTBEAT",
        },
        serverNow
      );

      expect(result.kind).toBe("ACCEPT");
      if (result.kind === "ACCEPT") {
        expect(result.creditedSeconds).toBe(15);
        expect(result.newActiveSeconds).toBe(15);
        expect(result.newSequenceNumber).toBe(1);
        expect(result.newStatus).toBe("active");
        expect(result.isSealed).toBe(false);
      }
    });

    it("rejects sequence gap (received 2 when last is 0) with 409 SEQUENCE_GAP", () => {
      const session = createMockSession({ lastSequenceNumber: 0 });
      const serverNow = new Date("2026-11-20T10:00:30.000Z");

      const result = evaluateHeartbeat(
        session,
        {
          sessionId: session.id,
          sequenceNumber: 2,
          clientNonce: "nonce-2",
          timestamp: serverNow,
          durationSeconds: 15,
        },
        serverNow
      );

      expect(result.kind).toBe("REJECT");
      if (result.kind === "REJECT") {
        expect(result.code).toBe("SEQUENCE_GAP");
        expect(result.details?.expectedSequence).toBe(1);
        expect(result.details?.receivedSequence).toBe(2);
      }
    });

    it("recognizes idempotent duplicate pulse (matching sequence and clientNonce)", () => {
      const session = createMockSession({
        lastSequenceNumber: 1,
        lastClientNonce: "nonce-1",
        activeSeconds: 15,
      });
      const serverNow = new Date("2026-11-20T10:00:16.000Z");

      const result = evaluateHeartbeat(
        session,
        {
          sessionId: session.id,
          sequenceNumber: 1,
          clientNonce: "nonce-1",
          timestamp: serverNow,
          durationSeconds: 15,
        },
        serverNow
      );

      expect(result.kind).toBe("IDEMPOTENT_DUPLICATE");
      if (result.kind === "IDEMPOTENT_DUPLICATE") {
        expect(result.currentSequence).toBe(1);
        expect(result.currentStatus).toBe("active");
      }
    });

    it("rejects nonce collision for same sequence with NONCE_COLLISION", () => {
      const session = createMockSession({
        lastSequenceNumber: 1,
        lastClientNonce: "nonce-original",
        activeSeconds: 15,
      });
      const serverNow = new Date("2026-11-20T10:00:16.000Z");

      const result = evaluateHeartbeat(
        session,
        {
          sessionId: session.id,
          sequenceNumber: 1,
          clientNonce: "nonce-different",
          timestamp: serverNow,
          durationSeconds: 15,
        },
        serverNow
      );

      expect(result.kind).toBe("REJECT");
      if (result.kind === "REJECT") {
        expect(result.code).toBe("NONCE_COLLISION");
      }
    });

    it("rejects stale pulse when sequenceNumber < lastSequenceNumber", () => {
      const session = createMockSession({
        lastSequenceNumber: 5,
        lastClientNonce: "nonce-5",
        activeSeconds: 75,
      });
      const serverNow = new Date("2026-11-20T10:01:30.000Z");

      const result = evaluateHeartbeat(
        session,
        {
          sessionId: session.id,
          sequenceNumber: 3,
          clientNonce: "nonce-3",
          timestamp: serverNow,
          durationSeconds: 15,
        },
        serverNow
      );

      expect(result.kind).toBe("REJECT");
      if (result.kind === "REJECT") {
        expect(result.code).toBe("STALE_SEQUENCE");
        expect(result.details?.currentSequence).toBe(5);
        expect(result.details?.receivedSequence).toBe(3);
      }
    });

    it("rejects heartbeat on already sealed session (completed/recovered/abandoned)", () => {
      const completedSession = createMockSession({
        status: "completed",
        closeReason: "user_stop",
      });
      const serverNow = new Date("2026-11-20T10:00:15.000Z");

      const result = evaluateHeartbeat(
        completedSession,
        {
          sessionId: completedSession.id,
          sequenceNumber: 1,
          clientNonce: "nonce-1",
          timestamp: serverNow,
          durationSeconds: 15,
        },
        serverNow
      );

      expect(result.kind).toBe("REJECT");
      if (result.kind === "REJECT") {
        expect(result.code).toBe("SESSION_SEALED");
      }
    });

    it("handles active gap (> 45s) by sealing session with closeReason 'active_gap'", () => {
      const session = createMockSession({
        lastSequenceNumber: 1,
        lastClientNonce: "nonce-1",
        activeSeconds: 15,
        lastHeartbeatAt: new Date("2026-11-20T10:00:15.000Z"),
      });
      // 60s later (gap > 45s)
      const serverNow = new Date("2026-11-20T10:01:15.000Z");

      const result = evaluateHeartbeat(
        session,
        {
          sessionId: session.id,
          sequenceNumber: 2,
          clientNonce: "nonce-2",
          timestamp: serverNow,
          durationSeconds: 15,
        },
        serverNow
      );

      expect(result.kind).toBe("ACCEPT");
      if (result.kind === "ACCEPT") {
        expect(result.creditedSeconds).toBe(0);
        expect(result.newActiveSeconds).toBe(15);
        expect(result.newStatus).toBe("completed");
        expect(result.closeReason).toBe("active_gap");
        expect(result.isSealed).toBe(true);
      }
    });

    it("transitions active session to paused on PAUSE event", () => {
      const session = createMockSession({
        lastSequenceNumber: 1,
        lastClientNonce: "nonce-1",
        activeSeconds: 15,
        lastHeartbeatAt: new Date("2026-11-20T10:00:15.000Z"),
      });
      const serverNow = new Date("2026-11-20T10:00:30.000Z");

      const result = evaluateHeartbeat(
        session,
        {
          sessionId: session.id,
          sequenceNumber: 2,
          clientNonce: "nonce-2",
          timestamp: serverNow,
          durationSeconds: 15,
          eventType: "PAUSE",
        },
        serverNow
      );

      expect(result.kind).toBe("ACCEPT");
      if (result.kind === "ACCEPT") {
        expect(result.creditedSeconds).toBe(15);
        expect(result.newActiveSeconds).toBe(30);
        expect(result.newStatus).toBe("paused");
        expect(result.isSealed).toBe(false);
      }
    });

    it("transitions paused session back to active on RESUME event with 0 credit", () => {
      const session = createMockSession({
        status: "paused",
        lastSequenceNumber: 2,
        lastClientNonce: "nonce-2",
        activeSeconds: 30,
        lastHeartbeatAt: new Date("2026-11-20T10:00:30.000Z"),
      });
      const serverNow = new Date("2026-11-20T10:01:00.000Z");

      const result = evaluateHeartbeat(
        session,
        {
          sessionId: session.id,
          sequenceNumber: 3,
          clientNonce: "nonce-3",
          timestamp: serverNow,
          durationSeconds: 0,
          eventType: "RESUME",
        },
        serverNow
      );

      expect(result.kind).toBe("ACCEPT");
      if (result.kind === "ACCEPT") {
        expect(result.creditedSeconds).toBe(0);
        expect(result.newActiveSeconds).toBe(30);
        expect(result.newStatus).toBe("active");
        expect(result.isSealed).toBe(false);
      }
    });

    it("seals paused session with inactivity_timeout when paused for > 300s", () => {
      const session = createMockSession({
        status: "paused",
        lastSequenceNumber: 2,
        lastClientNonce: "nonce-2",
        activeSeconds: 30,
        lastHeartbeatAt: new Date("2026-11-20T10:00:00.000Z"),
      });
      // 301 seconds later
      const serverNow = new Date("2026-11-20T10:05:01.000Z");

      const result = evaluateHeartbeat(
        session,
        {
          sessionId: session.id,
          sequenceNumber: 3,
          clientNonce: "nonce-3",
          timestamp: serverNow,
          durationSeconds: 0,
          eventType: "HEARTBEAT",
        },
        serverNow
      );

      expect(result.kind).toBe("ACCEPT");
      if (result.kind === "ACCEPT") {
        expect(result.creditedSeconds).toBe(0);
        expect(result.newStatus).toBe("completed");
        expect(result.closeReason).toBe("inactivity_timeout");
        expect(result.isSealed).toBe(true);
      }
    });

    it("seals active session with max_duration when reaching 12h cap", () => {
      const session = createMockSession({
        lastSequenceNumber: 100,
        lastClientNonce: "nonce-100",
        activeSeconds: MAX_SESSION_DURATION_SECONDS - 10, // 10 seconds under 12h
        lastHeartbeatAt: new Date("2026-11-20T10:00:00.000Z"),
      });
      const serverNow = new Date("2026-11-20T10:00:15.000Z");

      const result = evaluateHeartbeat(
        session,
        {
          sessionId: session.id,
          sequenceNumber: 101,
          clientNonce: "nonce-101",
          timestamp: serverNow,
          durationSeconds: 15,
        },
        serverNow
      );

      expect(result.kind).toBe("ACCEPT");
      if (result.kind === "ACCEPT") {
        expect(result.creditedSeconds).toBe(15);
        expect(result.newActiveSeconds).toBe(MAX_SESSION_DURATION_SECONDS);
        expect(result.newStatus).toBe("completed");
        expect(result.closeReason).toBe("max_duration");
        expect(result.isSealed).toBe(true);
      }
    });

    it("transitions to abandoned on DISCARD event with 0 credit", () => {
      const session = createMockSession({
        lastSequenceNumber: 1,
        lastClientNonce: "nonce-1",
        activeSeconds: 15,
        lastHeartbeatAt: new Date("2026-11-20T10:00:15.000Z"),
      });
      const serverNow = new Date("2026-11-20T10:00:30.000Z");

      const result = evaluateHeartbeat(
        session,
        {
          sessionId: session.id,
          sequenceNumber: 2,
          clientNonce: "nonce-2",
          timestamp: serverNow,
          durationSeconds: 15,
          eventType: "DISCARD",
        },
        serverNow
      );

      expect(result.kind).toBe("ACCEPT");
      if (result.kind === "ACCEPT") {
        expect(result.creditedSeconds).toBe(0);
        expect(result.newStatus).toBe("abandoned");
        expect(result.closeReason).toBe("user_discard");
        expect(result.isSealed).toBe(true);
      }
    });

    it("transitions to completed on STOP event with credited seconds", () => {
      const session = createMockSession({
        lastSequenceNumber: 1,
        lastClientNonce: "nonce-1",
        activeSeconds: 15,
        lastHeartbeatAt: new Date("2026-11-20T10:00:15.000Z"),
      });
      const serverNow = new Date("2026-11-20T10:00:30.000Z");

      const result = evaluateHeartbeat(
        session,
        {
          sessionId: session.id,
          sequenceNumber: 2,
          clientNonce: "nonce-2",
          timestamp: serverNow,
          durationSeconds: 15,
          eventType: "STOP",
        },
        serverNow
      );

      expect(result.kind).toBe("ACCEPT");
      if (result.kind === "ACCEPT") {
        expect(result.creditedSeconds).toBe(15);
        expect(result.newActiveSeconds).toBe(30);
        expect(result.newStatus).toBe("completed");
        expect(result.closeReason).toBe("user_stop");
        expect(result.isSealed).toBe(true);
      }
    });
  });
});
