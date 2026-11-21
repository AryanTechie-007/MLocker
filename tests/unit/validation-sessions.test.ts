import { describe, it, expect } from "vitest";
import {
  HeartbeatPayloadSchema,
  CreateSessionSchema,
  CreateManualSessionSchema,
  UpdateSessionSchema,
  SessionQuerySchema,
  TrackingPreferencesSchema,
  TrackingToggleSchema,
} from "@/lib/domain/validation";

describe("Milestone 5: Session Engine Zod Validation Suite", () => {
  describe("1. HeartbeatPayloadSchema", () => {
    const validHeartbeat = {
      sessionId: "cm1234567890abcdef123456",
      userMediaId: "cm1234567890abcdef123457",
      sequenceNumber: 1,
      clientNonce: "nonce_abc123_xyz",
      timestamp: new Date().toISOString(),
      durationSeconds: 15,
      isFocused: true,
      eventType: "HEARTBEAT",
    };

    it("accepts valid heartbeat payload", () => {
      const result = HeartbeatPayloadSchema.safeParse(validHeartbeat);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sequenceNumber).toBe(1);
        expect(result.data.durationSeconds).toBe(15);
        expect(result.data.eventType).toBe("HEARTBEAT");
      }
    });

    it("applies defaults for durationSeconds (15), isFocused (true), and eventType (HEARTBEAT)", () => {
      const minimal = {
        sessionId: "cm1234567890abcdef123456",
        userMediaId: "cm1234567890abcdef123457",
        sequenceNumber: 2,
        clientNonce: "nonce_abc123_minimal",
        timestamp: new Date().toISOString(),
      };
      const result = HeartbeatPayloadSchema.safeParse(minimal);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.durationSeconds).toBe(15);
        expect(result.data.isFocused).toBe(true);
        expect(result.data.eventType).toBe("HEARTBEAT");
      }
    });

    it("rejects non-positive sequence numbers (<= 0)", () => {
      expect(
        HeartbeatPayloadSchema.safeParse({
          ...validHeartbeat,
          sequenceNumber: 0,
        }).success
      ).toBe(false);
      expect(
        HeartbeatPayloadSchema.safeParse({
          ...validHeartbeat,
          sequenceNumber: -1,
        }).success
      ).toBe(false);
    });

    it("rejects empty or whitespace-only clientNonce", () => {
      expect(
        HeartbeatPayloadSchema.safeParse({
          ...validHeartbeat,
          clientNonce: "",
        }).success
      ).toBe(false);
      expect(
        HeartbeatPayloadSchema.safeParse({
          ...validHeartbeat,
          clientNonce: "   ",
        }).success
      ).toBe(false);
    });

    it("rejects clientNonce exceeding 128 characters", () => {
      expect(
        HeartbeatPayloadSchema.safeParse({
          ...validHeartbeat,
          clientNonce: "a".repeat(129),
        }).success
      ).toBe(false);
    });

    it("rejects invalid ISO timestamp string", () => {
      expect(
        HeartbeatPayloadSchema.safeParse({
          ...validHeartbeat,
          timestamp: "not-a-date",
        }).success
      ).toBe(false);
      expect(
        HeartbeatPayloadSchema.safeParse({
          ...validHeartbeat,
          timestamp: "2026-11-20",
        }).success
      ).toBe(false);
    });

    it("rejects out-of-range durationSeconds (< 0 or > 60)", () => {
      expect(
        HeartbeatPayloadSchema.safeParse({
          ...validHeartbeat,
          durationSeconds: -1,
        }).success
      ).toBe(false);
      expect(
        HeartbeatPayloadSchema.safeParse({
          ...validHeartbeat,
          durationSeconds: 61,
        }).success
      ).toBe(false);
    });

    it("rejects invalid eventType", () => {
      expect(
        HeartbeatPayloadSchema.safeParse({
          ...validHeartbeat,
          eventType: "INVALID_EVENT",
        }).success
      ).toBe(false);
    });
  });

  describe("2. CreateSessionSchema", () => {
    it("accepts valid active session payload", () => {
      const payload = {
        userMediaId: "cm1234567890abcdef123456",
        sourceId: "cm1234567890abcdef123457",
        sourceType: "web",
      };
      const result = CreateSessionSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.userMediaId).toBe(payload.userMediaId);
        expect(result.data.sourceType).toBe("web");
      }
    });

    it("defaults sourceType to 'web' and accepts null sourceId", () => {
      const payload = {
        userMediaId: "cm1234567890abcdef123456",
        sourceId: null,
      };
      const result = CreateSessionSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sourceType).toBe("web");
        expect(result.data.sourceId).toBeNull();
      }
    });

    it("accepts optional supersededSessionId", () => {
      const payload = {
        userMediaId: "cm1234567890abcdef123456",
        supersededSessionId: "cm1234567890abcdef123499",
      };
      const result = CreateSessionSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.supersededSessionId).toBe("cm1234567890abcdef123499");
      }
    });

    it("rejects invalid userMediaId (empty, whitespace, or exceeding 128 chars)", () => {
      expect(
        CreateSessionSchema.safeParse({
          userMediaId: "",
        }).success
      ).toBe(false);
      expect(
        CreateSessionSchema.safeParse({
          userMediaId: "   ",
        }).success
      ).toBe(false);
      expect(
        CreateSessionSchema.safeParse({
          userMediaId: "a".repeat(129),
        }).success
      ).toBe(false);
    });
  });

  describe("3. CreateManualSessionSchema", () => {
    const now = Date.now();
    const validManual = {
      userMediaId: "cm1234567890abcdef123456",
      sourceType: "manual" as const,
      startedAt: new Date(now - 3600000).toISOString(), // 1 hour ago
      endedAt: new Date(now).toISOString(),
      activeSeconds: 3600, // exactly 1 hour
      notes: "Finished reading volume 1",
      progressStart: 0,
      progressEnd: 10,
    };

    it("accepts valid manual session within wall-clock bounds", () => {
      const result = CreateManualSessionSchema.safeParse(validManual);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sourceType).toBe("manual");
        expect(result.data.activeSeconds).toBe(3600);
      }
    });

    it("rejects manual session where endedAt < startedAt", () => {
      const inverted = {
        ...validManual,
        startedAt: new Date(now).toISOString(),
        endedAt: new Date(now - 3600000).toISOString(),
      };
      const result = CreateManualSessionSchema.safeParse(inverted);
      expect(result.success).toBe(false);
    });

    it("rejects manual session where endedAt is in the future (> now + 5 min buffer)", () => {
      const future = {
        ...validManual,
        startedAt: new Date(now).toISOString(),
        endedAt: new Date(now + 10 * 60 * 1000).toISOString(), // 10 minutes in future
        activeSeconds: 600,
      };
      const result = CreateManualSessionSchema.safeParse(future);
      expect(result.success).toBe(false);
    });

    it("allows slight clock skew (endedAt within + 5 min buffer)", () => {
      const slightSkew = {
        ...validManual,
        startedAt: new Date(now - 300000).toISOString(),
        endedAt: new Date(now + 2 * 60 * 1000).toISOString(), // 2 minutes in future (< 5 min buffer)
        activeSeconds: 300,
      };
      const result = CreateManualSessionSchema.safeParse(slightSkew);
      expect(result.success).toBe(true);
    });

    it("rejects manual session where activeSeconds exceeds wall-clock duration", () => {
      const excessiveActive = {
        ...validManual,
        startedAt: new Date(now - 1800000).toISOString(), // 30 minutes wall clock = 1800s
        endedAt: new Date(now).toISOString(),
        activeSeconds: 2400, // 40 minutes active claimed (impossible!)
      };
      const result = CreateManualSessionSchema.safeParse(excessiveActive);
      expect(result.success).toBe(false);
    });

    it("rejects manual session with activeSeconds <= 0 or > 86400 (24h)", () => {
      expect(
        CreateManualSessionSchema.safeParse({
          ...validManual,
          activeSeconds: 0,
        }).success
      ).toBe(false);

      expect(
        CreateManualSessionSchema.safeParse({
          ...validManual,
          activeSeconds: 86401,
        }).success
      ).toBe(false);
    });

    it("rejects notes exceeding 2000 characters", () => {
      const longNotes = {
        ...validManual,
        notes: "a".repeat(2001),
      };
      expect(CreateManualSessionSchema.safeParse(longNotes).success).toBe(false);
    });
  });

  describe("4. UpdateSessionSchema", () => {
    it("accepts valid session update payload", () => {
      const valid = {
        notes: "Updated session notes",
        rating: 8.5,
        progressEnd: 12,
        activeSeconds: 1800,
      };
      const result = UpdateSessionSchema.safeParse(valid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.rating).toBe(8.5);
      }
    });

    it("accepts partial updates", () => {
      expect(UpdateSessionSchema.safeParse({ notes: "Just notes" }).success).toBe(
        true
      );
      expect(UpdateSessionSchema.safeParse({ rating: null }).success).toBe(true);
      expect(UpdateSessionSchema.safeParse({ progressEnd: 5 }).success).toBe(true);
    });

    it("rejects ratings out of bounds (< 0 or > 10)", () => {
      expect(UpdateSessionSchema.safeParse({ rating: -0.5 }).success).toBe(false);
      expect(UpdateSessionSchema.safeParse({ rating: 10.5 }).success).toBe(false);
    });

    it("rejects negative progressEnd or negative activeSeconds", () => {
      expect(UpdateSessionSchema.safeParse({ progressEnd: -1 }).success).toBe(
        false
      );
      expect(UpdateSessionSchema.safeParse({ activeSeconds: -10 }).success).toBe(
        false
      );
    });
  });

  describe("5. SessionQuerySchema", () => {
    it("parses valid query parameters with defaults", () => {
      const result = SessionQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(50);
        expect(result.data.offset).toBe(0);
      }
    });

    it("coerces string numbers for limit and offset", () => {
      const result = SessionQuerySchema.safeParse({
        limit: "25",
        offset: "10",
        status: "completed",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(25);
        expect(result.data.offset).toBe(10);
        expect(result.data.status).toBe("completed");
      }
    });

    it("rejects limit > 100 or < 1", () => {
      expect(SessionQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
      expect(SessionQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    });

    it("rejects invalid status enum", () => {
      expect(SessionQuerySchema.safeParse({ status: "invalid" }).success).toBe(
        false
      );
    });
  });

  describe("6. TrackingPreferencesSchema & TrackingToggleSchema", () => {
    it("applies default values for TrackingPreferencesSchema", () => {
      const result = TrackingPreferencesSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.enabled).toBe(true);
        expect(result.data.autoAccumulateGameHours).toBe(false);
      }
    });

    it("parses explicit preferences", () => {
      const result = TrackingPreferencesSchema.safeParse({
        enabled: false,
        autoAccumulateGameHours: true,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.enabled).toBe(false);
        expect(result.data.autoAccumulateGameHours).toBe(true);
      }
    });

    it("accepts partial toggles in TrackingToggleSchema", () => {
      expect(
        TrackingToggleSchema.safeParse({ enabled: false }).success
      ).toBe(true);
      expect(
        TrackingToggleSchema.safeParse({ autoAccumulateGameHours: true }).success
      ).toBe(true);
      expect(TrackingToggleSchema.safeParse({}).success).toBe(true);
    });

    it("rejects non-boolean values in TrackingPreferencesSchema", () => {
      expect(
        TrackingPreferencesSchema.safeParse({ enabled: "true" }).success
      ).toBe(false);
      expect(
        TrackingPreferencesSchema.safeParse({
          autoAccumulateGameHours: 1,
        }).success
      ).toBe(false);
    });
  });
});
