import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";

let currentMockUserId: string | null = null;
vi.mock("@/lib/get-user", () => ({
  getUserId: vi.fn(async () => currentMockUserId),
  getOrCreateUserId: vi.fn(async () => currentMockUserId),
}));

import { POST as createSession } from "@/app/api/sessions/route";
import { POST as sendHeartbeat } from "@/app/api/sessions/heartbeat/route";
import { GET as getMediaSessions } from "@/app/api/media/[id]/sessions/route";
import {
  GET as getSessionById,
  PATCH as updateSession,
  DELETE as deleteSession,
} from "@/app/api/sessions/[id]/route";
import {
  GET as getTrackingPreferences,
  POST as updateTrackingPreferences,
} from "@/app/api/tracking/toggle/route";

describe("Milestone 5 — Session Management & Heartbeat REST APIs", () => {
  let testUser: { id: string; email: string };
  let testMedia: { id: string; title: string };

  beforeAll(async () => {
    const ts = Date.now();
    testUser = await prisma.user.create({
      data: {
        name: "Test User M5",
        email: `user_m5_${ts}@test.local`,
      },
    });

    testMedia = await prisma.userMedia.create({
      data: {
        userId: testUser.id,
        mediaType: "anime",
        title: "Cowboy Bebop",
        status: "in_progress",
      },
    });
  });

  afterAll(async () => {
    await prisma.activityEvent.deleteMany({
      where: { userId: testUser.id },
    });
    await prisma.activitySession.deleteMany({
      where: { userId: testUser.id },
    });
    await prisma.userMedia.deleteMany({
      where: { id: testMedia.id },
    });
    await prisma.user.deleteMany({
      where: { id: testUser.id },
    });
  });

  beforeEach(() => {
    currentMockUserId = testUser.id;
  });

  describe("1. POST /api/sessions (Start Active Session & Log Manual Session)", () => {
    it("starts a new active session for user media", async () => {
      const res = await createSession(
        new Request("http://localhost/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userMediaId: testMedia.id,
            sourceType: "web",
          }),
        })
      );

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.session).toBeDefined();
      expect(data.session.userMediaId).toBe(testMedia.id);
      expect(data.session.status).toBe("active");
      expect(data.session.activeSeconds).toBe(0);
      expect(data.session.lastSequenceNumber).toBe(0);
      expect(data.session.isManual).toBe(false);
    });

    it("logs a retroactive manual session with valid bounds", async () => {
      const now = new Date();
      const pastStart = new Date(now.getTime() - 3600 * 1000).toISOString();
      const pastEnd = now.toISOString();

      const res = await createSession(
        new Request("http://localhost/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userMediaId: testMedia.id,
            sourceType: "manual",
            startedAt: pastStart,
            endedAt: pastEnd,
            activeSeconds: 3600,
            notes: "Finished 3 episodes",
            progressStart: 1,
            progressEnd: 4,
          }),
        })
      );

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.session.isManual).toBe(true);
      expect(data.session.status).toBe("completed");
      expect(data.session.closeReason).toBe("manual_entry");
      expect(data.session.activeSeconds).toBe(3600);
      expect(data.session.notes).toBe("Finished 3 episodes");
      expect(data.session.progressEnd).toBe(4);
    });

    it("seals old session when supersededSessionId is provided", async () => {
      // Create first active session
      const sess1 = await prisma.activitySession.create({
        data: {
          userId: testUser.id,
          userMediaId: testMedia.id,
          startedAt: new Date(),
          status: "active",
        },
      });

      // Start new session superseding sess1
      const res = await createSession(
        new Request("http://localhost/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userMediaId: testMedia.id,
            sourceType: "web",
            supersededSessionId: sess1.id,
          }),
        })
      );

      expect(res.status).toBe(201);
      const sess1Updated = await prisma.activitySession.findUnique({
        where: { id: sess1.id },
      });
      expect(sess1Updated?.status).toBe("completed");
      expect(sess1Updated?.closeReason).toBe("unrecoverable_sequence_gap");
    });
  });

  describe("2. POST /api/sessions/heartbeat (Atomic CAS Pulse Ingestion)", () => {
    it("credits 15 active seconds on sequential heartbeat pulse 1", async () => {
      const session = await prisma.activitySession.create({
        data: {
          userId: testUser.id,
          userMediaId: testMedia.id,
          startedAt: new Date(Date.now() - 15000),
          lastHeartbeatAt: new Date(Date.now() - 15000),
          status: "active",
          activeSeconds: 0,
          lastSequenceNumber: 0,
        },
      });

      const res = await sendHeartbeat(
        new Request("http://localhost/api/sessions/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: session.id,
            userMediaId: testMedia.id,
            sequenceNumber: 1,
            clientNonce: "nonce-pulse-1",
            timestamp: new Date().toISOString(),
            durationSeconds: 15,
            isFocused: true,
            eventType: "HEARTBEAT",
          }),
        })
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.sequenceNumber).toBe(1);
      expect(data.activeSeconds).toBe(15);

      // Verify DB record
      const updated = await prisma.activitySession.findUnique({
        where: { id: session.id },
      });
      expect(updated?.activeSeconds).toBe(15);
      expect(updated?.lastSequenceNumber).toBe(1);
      expect(updated?.lastClientNonce).toBe("nonce-pulse-1");

      // Verify ActivityEvent created
      const event = await prisma.activityEvent.findFirst({
        where: { sessionId: session.id, sequenceNumber: 1 },
      });
      expect(event).toBeDefined();
      expect(event?.clientNonce).toBe("nonce-pulse-1");
    });

    it("rejects sequence gap with 409 SEQUENCE_GAP", async () => {
      const session = await prisma.activitySession.create({
        data: {
          userId: testUser.id,
          userMediaId: testMedia.id,
          startedAt: new Date(),
          status: "active",
          activeSeconds: 0,
          lastSequenceNumber: 0,
        },
      });

      const res = await sendHeartbeat(
        new Request("http://localhost/api/sessions/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: session.id,
            userMediaId: testMedia.id,
            sequenceNumber: 5, // Gap: expected 1, received 5
            clientNonce: "nonce-pulse-5",
            timestamp: new Date().toISOString(),
            durationSeconds: 15,
            isFocused: true,
          }),
        })
      );

      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.code).toBe("SEQUENCE_GAP");
      expect(data.details.expectedSequence).toBe(1);
      expect(data.details.receivedSequence).toBe(5);
    });

    it("returns 200 idempotent duplicate when re-sending same sequence and nonce", async () => {
      const session = await prisma.activitySession.create({
        data: {
          userId: testUser.id,
          userMediaId: testMedia.id,
          startedAt: new Date(Date.now() - 30000),
          lastHeartbeatAt: new Date(Date.now() - 15000),
          status: "active",
          activeSeconds: 15,
          lastSequenceNumber: 1,
          lastClientNonce: "nonce-idem-1",
        },
      });

      const res = await sendHeartbeat(
        new Request("http://localhost/api/sessions/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: session.id,
            userMediaId: testMedia.id,
            sequenceNumber: 1,
            clientNonce: "nonce-idem-1",
            timestamp: new Date().toISOString(),
            durationSeconds: 15,
          }),
        })
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.idempotent).toBe(true);
      expect(data.sequenceNumber).toBe(1);
    });

    it("rejects nonce collision with 409 NONCE_COLLISION", async () => {
      const session = await prisma.activitySession.create({
        data: {
          userId: testUser.id,
          userMediaId: testMedia.id,
          startedAt: new Date(Date.now() - 30000),
          lastHeartbeatAt: new Date(Date.now() - 15000),
          status: "active",
          activeSeconds: 15,
          lastSequenceNumber: 1,
          lastClientNonce: "nonce-real-1",
        },
      });

      const res = await sendHeartbeat(
        new Request("http://localhost/api/sessions/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: session.id,
            userMediaId: testMedia.id,
            sequenceNumber: 1,
            clientNonce: "nonce-fake-1", // different nonce for same seq
            timestamp: new Date().toISOString(),
            durationSeconds: 15,
          }),
        })
      );

      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.code).toBe("NONCE_COLLISION");
    });
  });

  describe("3. GET /api/media/[id]/sessions (Media History Listing)", () => {
    it("returns paginated historical sessions for the specified media", async () => {
      const res = await getMediaSessions(
        new Request(`http://localhost/api/media/${testMedia.id}/sessions?limit=10`),
        { params: Promise.resolve({ id: testMedia.id }) }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.sessions)).toBe(true);
      expect(typeof data.total).toBe("number");
      expect(data.total).toBeGreaterThan(0);
    });
  });

  describe("4. GET, PATCH, DELETE /api/sessions/[id]", () => {
    it("retrieves a single session by id", async () => {
      const session = await prisma.activitySession.create({
        data: {
          userId: testUser.id,
          userMediaId: testMedia.id,
          startedAt: new Date(),
          status: "completed",
          closeReason: "user_stop",
          activeSeconds: 1200,
        },
      });

      const res = await getSessionById(
        new Request(`http://localhost/api/sessions/${session.id}`),
        { params: Promise.resolve({ id: session.id }) }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.session.id).toBe(session.id);
      expect(data.session.activeSeconds).toBe(1200);
    });

    it("updates session notes and progressEnd", async () => {
      const session = await prisma.activitySession.create({
        data: {
          userId: testUser.id,
          userMediaId: testMedia.id,
          startedAt: new Date(),
          status: "completed",
        },
      });

      const res = await updateSession(
        new Request(`http://localhost/api/sessions/${session.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            notes: "Updated session notes",
            progressEnd: 5,
          }),
        }),
        { params: Promise.resolve({ id: session.id }) }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.session.notes).toBe("Updated session notes");
      expect(data.session.progressEnd).toBe(5);
    });

    it("deletes a session by id", async () => {
      const session = await prisma.activitySession.create({
        data: {
          userId: testUser.id,
          userMediaId: testMedia.id,
          startedAt: new Date(),
          status: "completed",
        },
      });

      const res = await deleteSession(
        new Request(`http://localhost/api/sessions/${session.id}`, {
          method: "DELETE",
        }),
        { params: Promise.resolve({ id: session.id }) }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      const check = await prisma.activitySession.findUnique({
        where: { id: session.id },
      });
      expect(check).toBeNull();
    });
  });

  describe("5. GET & POST /api/tracking/toggle (Preferences Persistence)", () => {
    it("returns default preferences when not previously configured", async () => {
      const res = await getTrackingPreferences();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.trackingPreferences.enabled).toBe(true);
      expect(data.trackingPreferences.autoAccumulateGameHours).toBe(false);
    });

    it("updates and persists preferences in User.trackingPreferences", async () => {
      const res = await updateTrackingPreferences(
        new Request("http://localhost/api/tracking/toggle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            enabled: false,
            autoAccumulateGameHours: true,
          }),
        })
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.trackingPreferences.enabled).toBe(false);
      expect(data.trackingPreferences.autoAccumulateGameHours).toBe(true);

      // Verify in DB
      const user = await prisma.user.findUnique({
        where: { id: testUser.id },
        select: { trackingPreferences: true },
      });
      expect(user?.trackingPreferences).toContain('"enabled":false');
      expect(user?.trackingPreferences).toContain('"autoAccumulateGameHours":true');
    });

    it("rejects invalid toggle values with 400 validation error", async () => {
      const res = await updateTrackingPreferences(
        new Request("http://localhost/api/tracking/toggle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            enabled: "not-a-boolean",
          }),
        })
      );
      expect(res.status).toBe(400);
    });
  });

  describe("6. API Boundary & Error Condition Regressions", () => {
    it("returns 404 when creating session with non-existent sourceId", async () => {
      const res = await createSession(
        new Request("http://localhost/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userMediaId: testMedia.id,
            sourceId: "non_existent_source_cuid",
          }),
        })
      );
      expect(res.status).toBe(404);
    });

    it("returns 404 when heartbeat sent to non-existent session", async () => {
      const res = await sendHeartbeat(
        new Request("http://localhost/api/sessions/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: "non_existent_session_cuid",
            userMediaId: testMedia.id,
            sequenceNumber: 1,
            clientNonce: "nonce-random",
            timestamp: new Date().toISOString(),
            durationSeconds: 15,
          }),
        })
      );
      expect(res.status).toBe(404);
    });

    it("returns 404 when session exists but userMediaId does not match", async () => {
      const session = await prisma.activitySession.create({
        data: {
          userId: testUser.id,
          userMediaId: testMedia.id,
          startedAt: new Date(),
          status: "active",
        },
      });

      const res = await sendHeartbeat(
        new Request("http://localhost/api/sessions/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: session.id,
            userMediaId: "mismatched_media_id",
            sequenceNumber: 1,
            clientNonce: "nonce-mismatch",
            timestamp: new Date().toISOString(),
            durationSeconds: 15,
          }),
        })
      );
      expect(res.status).toBe(404);
    });

    it("returns 404 on GET/PATCH/DELETE for non-existent session", async () => {
      const dummyId = "cm_dummy_session_id_404";
      const getRes = await getSessionById(
        new Request(`http://localhost/api/sessions/${dummyId}`),
        { params: Promise.resolve({ id: dummyId }) }
      );
      expect(getRes.status).toBe(404);

      const patchRes = await updateSession(
        new Request(`http://localhost/api/sessions/${dummyId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: "Won't exist" }),
        }),
        { params: Promise.resolve({ id: dummyId }) }
      );
      expect(patchRes.status).toBe(404);

      const delRes = await deleteSession(
        new Request(`http://localhost/api/sessions/${dummyId}`, {
          method: "DELETE",
        }),
        { params: Promise.resolve({ id: dummyId }) }
      );
      expect(delRes.status).toBe(404);
    });
  });
});
