import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";

let currentMockUserId: string | null = null;
vi.mock("@/lib/get-user", () => ({
  getUserId: vi.fn(async () => currentMockUserId),
  getOrCreateUserId: vi.fn(async () => currentMockUserId),
}));

import { POST as createSession } from "@/app/api/sessions/route";
import { POST as sendHeartbeat } from "@/app/api/sessions/heartbeat/route";
import { PATCH as updateSession } from "@/app/api/sessions/[id]/route";
import { POST as updateTrackingPreferences } from "@/app/api/tracking/toggle/route";

describe("Milestone 5 / Audit S-2: Malformed JSON Request Handling & Zero Leakage", () => {
  let testUser: { id: string; email: string };
  let testMedia: { id: string; title: string };
  let testSession: { id: string };

  beforeAll(async () => {
    const ts = Date.now();
    testUser = await prisma.user.create({
      data: {
        name: "Test S2 Safety",
        email: `s2_safety_${ts}@test.local`,
      },
    });

    currentMockUserId = testUser.id;

    testMedia = await prisma.userMedia.create({
      data: {
        userId: testUser.id,
        mediaType: "anime",
        title: "Neon Genesis Evangelion",
        status: "in_progress",
      },
    });

    testSession = await prisma.activitySession.create({
      data: {
        userId: testUser.id,
        userMediaId: testMedia.id,
        sourceType: "web",
        status: "active",
        startedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
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

  it("POST /api/sessions returns 400 Validation Error on malformed non-JSON body (not 500)", async () => {
    const res = await createSession(
      new Request("http://localhost/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{ malformed json :::",
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.error).toBe("Validation failed");
  });

  it("POST /api/sessions/heartbeat returns 400 Validation Error on malformed non-JSON body (not 500)", async () => {
    const res = await sendHeartbeat(
      new Request("http://localhost/api/sessions/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{ truncated json",
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.error).toBe("Validation failed");
  });

  it("PATCH /api/sessions/[id] returns 400 Validation Error on malformed non-JSON body (not 500)", async () => {
    const res = await updateSession(
      new Request(`http://localhost/api/sessions/${testSession.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "<<not a json string>>",
      }),
      { params: Promise.resolve({ id: testSession.id }) }
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.error).toBe("Validation failed");
  });

  it("POST /api/tracking/toggle returns 400 Validation Error on malformed non-JSON body (not 500)", async () => {
    const res = await updateTrackingPreferences(
      new Request("http://localhost/api/tracking/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "###",
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.error).toBe("Validation failed");
  });
});
