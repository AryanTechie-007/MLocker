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

describe("Milestone 5 — Tenant Isolation & IDOR Security Suite", () => {
  let userAlice: { id: string; email: string };
  let userBob: { id: string; email: string };
  let aliceMedia: { id: string };
  let bobMedia: { id: string };
  let aliceSession: { id: string };
  let bobSession: { id: string };

  beforeAll(async () => {
    const ts = Date.now();
    userAlice = await prisma.user.create({
      data: { name: "Alice Security", email: `alice_sec_${ts}@test.local` },
    });
    userBob = await prisma.user.create({
      data: { name: "Bob Security", email: `bob_sec_${ts}@test.local` },
    });

    aliceMedia = await prisma.userMedia.create({
      data: {
        userId: userAlice.id,
        mediaType: "novel",
        title: "Alice Light Novel",
        status: "in_progress",
      },
    });

    bobMedia = await prisma.userMedia.create({
      data: {
        userId: userBob.id,
        mediaType: "game",
        title: "Bob RPG",
        status: "in_progress",
      },
    });

    aliceSession = await prisma.activitySession.create({
      data: {
        userId: userAlice.id,
        userMediaId: aliceMedia.id,
        startedAt: new Date(),
        status: "active",
      },
    });

    bobSession = await prisma.activitySession.create({
      data: {
        userId: userBob.id,
        userMediaId: bobMedia.id,
        startedAt: new Date(),
        status: "active",
      },
    });
  });

  afterAll(async () => {
    await prisma.activityEvent.deleteMany({
      where: { userId: { in: [userAlice.id, userBob.id] } },
    });
    await prisma.activitySession.deleteMany({
      where: { userId: { in: [userAlice.id, userBob.id] } },
    });
    await prisma.userMedia.deleteMany({
      where: { id: { in: [aliceMedia.id, bobMedia.id] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userAlice.id, userBob.id] } },
    });
  });

  beforeEach(() => {
    currentMockUserId = null;
  });

  describe("1. Authentication Enforcement (401 Unauthorized, No Guest Fallback)", () => {
    it("rejects POST /api/sessions without auth", async () => {
      const res = await createSession(
        new Request("http://localhost/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userMediaId: aliceMedia.id }),
        })
      );
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe("UNAUTHORIZED");
    });

    it("rejects POST /api/sessions/heartbeat without auth", async () => {
      const res = await sendHeartbeat(
        new Request("http://localhost/api/sessions/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: aliceSession.id,
            userMediaId: aliceMedia.id,
            sequenceNumber: 1,
            clientNonce: "nonce-unauth",
            timestamp: new Date().toISOString(),
          }),
        })
      );
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe("UNAUTHORIZED");
    });

    it("rejects GET /api/media/[id]/sessions without auth", async () => {
      const res = await getMediaSessions(
        new Request(`http://localhost/api/media/${aliceMedia.id}/sessions`),
        { params: Promise.resolve({ id: aliceMedia.id }) }
      );
      expect(res.status).toBe(401);
    });

    it("rejects GET, PATCH, DELETE /api/sessions/[id] without auth", async () => {
      const getRes = await getSessionById(
        new Request(`http://localhost/api/sessions/${aliceSession.id}`),
        { params: Promise.resolve({ id: aliceSession.id }) }
      );
      expect(getRes.status).toBe(401);

      const patchRes = await updateSession(
        new Request(`http://localhost/api/sessions/${aliceSession.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: "hacked" }),
        }),
        { params: Promise.resolve({ id: aliceSession.id }) }
      );
      expect(patchRes.status).toBe(401);

      const delRes = await deleteSession(
        new Request(`http://localhost/api/sessions/${aliceSession.id}`, {
          method: "DELETE",
        }),
        { params: Promise.resolve({ id: aliceSession.id }) }
      );
      expect(delRes.status).toBe(401);
    });

    it("rejects GET and POST /api/tracking/toggle without auth", async () => {
      const getRes = await getTrackingPreferences();
      expect(getRes.status).toBe(401);

      const postRes = await updateTrackingPreferences(
        new Request("http://localhost/api/tracking/toggle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: false }),
        })
      );
      expect(postRes.status).toBe(401);
    });
  });

  describe("2. Relational Tenant Isolation & Anti-IDOR (Strict 404 Not Found)", () => {
    it("returns 404 when Alice attempts to start session on Bob's media", async () => {
      currentMockUserId = userAlice.id;
      const res = await createSession(
        new Request("http://localhost/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userMediaId: bobMedia.id }),
        })
      );
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.code).toBe("NOT_FOUND");
    });

    it("returns 404 when Alice attempts to send heartbeat to Bob's session", async () => {
      currentMockUserId = userAlice.id;
      const res = await sendHeartbeat(
        new Request("http://localhost/api/sessions/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: bobSession.id,
            userMediaId: bobMedia.id,
            sequenceNumber: 1,
            clientNonce: "alice-spoofed-nonce",
            timestamp: new Date().toISOString(),
            durationSeconds: 15,
          }),
        })
      );
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.code).toBe("NOT_FOUND");
    });

    it("returns 404 when Alice attempts to list sessions for Bob's media", async () => {
      currentMockUserId = userAlice.id;
      const res = await getMediaSessions(
        new Request(`http://localhost/api/media/${bobMedia.id}/sessions`),
        { params: Promise.resolve({ id: bobMedia.id }) }
      );
      expect(res.status).toBe(404);
    });

    it("returns 404 when Alice attempts to get, edit, or delete Bob's session", async () => {
      currentMockUserId = userAlice.id;

      const getRes = await getSessionById(
        new Request(`http://localhost/api/sessions/${bobSession.id}`),
        { params: Promise.resolve({ id: bobSession.id }) }
      );
      expect(getRes.status).toBe(404);

      const patchRes = await updateSession(
        new Request(`http://localhost/api/sessions/${bobSession.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: "tampered by Alice" }),
        }),
        { params: Promise.resolve({ id: bobSession.id }) }
      );
      expect(patchRes.status).toBe(404);

      const delRes = await deleteSession(
        new Request(`http://localhost/api/sessions/${bobSession.id}`, {
          method: "DELETE",
        }),
        { params: Promise.resolve({ id: bobSession.id }) }
      );
      expect(delRes.status).toBe(404);
    });

    it("returns 404 when Alice attempts to log a manual session pointing to Bob's media", async () => {
      currentMockUserId = userAlice.id;
      const now = Date.now();
      const res = await createSession(
        new Request("http://localhost/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userMediaId: bobMedia.id,
            sourceType: "manual",
            startedAt: new Date(now - 1800000).toISOString(),
            endedAt: new Date(now).toISOString(),
            activeSeconds: 1800,
          }),
        })
      );
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.code).toBe("NOT_FOUND");
    });

    it("returns 404 when Alice creates a session with Bob's sourceId", async () => {
      currentMockUserId = userAlice.id;
      // Seed a source belonging to Bob
      const bobSource = await prisma.mediaSource.create({
        data: {
          userMediaId: bobMedia.id,
          name: "Bob Steam Source",
          url: "https://store.steampowered.com/app/123",
          normalizedDomain: "store.steampowered.com",
          sourceType: "desktop",
        },
      });

      const res = await createSession(
        new Request("http://localhost/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userMediaId: aliceMedia.id,
            sourceId: bobSource.id,
          }),
        })
      );
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.code).toBe("NOT_FOUND");
    });
  });
});
