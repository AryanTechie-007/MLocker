import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";

let currentMockUserId: string | null = null;
vi.mock("@/lib/get-user", () => ({
  getUserId: vi.fn(async () => currentMockUserId),
  getOrCreateUserId: vi.fn(async () => currentMockUserId),
}));

import { POST as sendHeartbeat } from "@/app/api/sessions/heartbeat/route";

describe("Milestone 5: Concurrency Scenarios TC-C01 to TC-C07 Suite", () => {
  let user: { id: string; email: string };
  let media: { id: string };

  beforeAll(async () => {
    const ts = Date.now();
    user = await prisma.user.create({
      data: { name: "Concurrency User", email: `concurr_${ts}@test.local` },
    });
    media = await prisma.userMedia.create({
      data: {
        userId: user.id,
        mediaType: "game",
        title: "Dark Souls III",
        status: "in_progress",
      },
    });
  });

  afterAll(async () => {
    await prisma.activityEvent.deleteMany({ where: { userId: user.id } });
    await prisma.activitySession.deleteMany({ where: { userId: user.id } });
    await prisma.userMedia.deleteMany({ where: { id: media.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  });

  beforeEach(() => {
    currentMockUserId = user.id;
  });

  // TC-C01: Simultaneous Identical Pulses (seq 5, nonce A)
  it("TC-C01: deduplicates simultaneous identical pulses with exact single credit", async () => {
    const session = await prisma.activitySession.create({
      data: {
        userId: user.id,
        userMediaId: media.id,
        startedAt: new Date(Date.now() - 60000),
        lastHeartbeatAt: new Date(Date.now() - 15000),
        status: "active",
        activeSeconds: 45,
        lastSequenceNumber: 4,
        lastClientNonce: "nonce-4",
      },
    });

    const createPulseRequest = () =>
      sendHeartbeat(
        new Request("http://localhost/api/sessions/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: session.id,
            userMediaId: media.id,
            sequenceNumber: 5,
            clientNonce: "nonce-5-shared",
            timestamp: new Date().toISOString(),
            durationSeconds: 15,
            isFocused: true,
          }),
        })
      );

    const [res1, res2] = await Promise.all([
      createPulseRequest(),
      createPulseRequest(),
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    const data1 = await res1.json();
    const data2 = await res2.json();

    // Exactly one should be the first normal accept, one should be idempotent duplicate
    const idempotentCount = (data1.idempotent ? 1 : 0) + (data2.idempotent ? 1 : 0);
    expect(idempotentCount).toBe(1);

    // Verify database activeSeconds credited exactly once (45 + 15 = 60)
    const updated = await prisma.activitySession.findUnique({
      where: { id: session.id },
    });
    expect(updated?.activeSeconds).toBe(60);
    expect(updated?.lastSequenceNumber).toBe(5);
  });

  // TC-C02: Conflicting Nonces for Same Sequence (seq 5, nonce A vs seq 5, nonce B)
  it("TC-C02: rejects nonce collision for same sequence with 409 NONCE_COLLISION", async () => {
    const session = await prisma.activitySession.create({
      data: {
        userId: user.id,
        userMediaId: media.id,
        startedAt: new Date(Date.now() - 60000),
        lastHeartbeatAt: new Date(Date.now() - 15000),
        status: "active",
        activeSeconds: 45,
        lastSequenceNumber: 4,
        lastClientNonce: "nonce-4",
      },
    });

    const pulseA = sendHeartbeat(
      new Request("http://localhost/api/sessions/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          userMediaId: media.id,
          sequenceNumber: 5,
          clientNonce: "nonce-A",
          timestamp: new Date().toISOString(),
          durationSeconds: 15,
        }),
      })
    );

    // First pulse commits
    const resA = await pulseA;
    expect(resA.status).toBe(200);

    // Conflicting pulse with same sequence but different nonce
    const resB = await sendHeartbeat(
      new Request("http://localhost/api/sessions/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          userMediaId: media.id,
          sequenceNumber: 5,
          clientNonce: "nonce-B",
          timestamp: new Date().toISOString(),
          durationSeconds: 15,
        }),
      })
    );

    expect(resB.status).toBe(409);
    const dataB = await resB.json();
    expect(dataB.code).toBe("NONCE_COLLISION");
  });

  // TC-C03: Concurrent Out-of-Order Sequence Race (seq 5 and seq 6)
  it("TC-C03: rejects pulse arriving ahead of sequence (409 SEQUENCE_GAP), then accepts after predecessor", async () => {
    const session = await prisma.activitySession.create({
      data: {
        userId: user.id,
        userMediaId: media.id,
        startedAt: new Date(Date.now() - 60000),
        lastHeartbeatAt: new Date(Date.now() - 15000),
        status: "active",
        activeSeconds: 45,
        lastSequenceNumber: 4,
      },
    });

    // Pulse 6 races ahead of pulse 5
    const res6Attempt1 = await sendHeartbeat(
      new Request("http://localhost/api/sessions/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          userMediaId: media.id,
          sequenceNumber: 6,
          clientNonce: "nonce-6",
          timestamp: new Date().toISOString(),
          durationSeconds: 15,
        }),
      })
    );
    expect(res6Attempt1.status).toBe(409);
    const gapData = await res6Attempt1.json();
    expect(gapData.code).toBe("SEQUENCE_GAP");
    expect(gapData.details.expectedSequence).toBe(5);

    // Client delivers missing pulse 5
    const res5 = await sendHeartbeat(
      new Request("http://localhost/api/sessions/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          userMediaId: media.id,
          sequenceNumber: 5,
          clientNonce: "nonce-5",
          timestamp: new Date().toISOString(),
          durationSeconds: 15,
        }),
      })
    );
    expect(res5.status).toBe(200);

    // Client retransmits pulse 6 now that 5 is acknowledged
    const res6Attempt2 = await sendHeartbeat(
      new Request("http://localhost/api/sessions/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          userMediaId: media.id,
          sequenceNumber: 6,
          clientNonce: "nonce-6",
          timestamp: new Date().toISOString(),
          durationSeconds: 15,
        }),
      })
    );
    expect(res6Attempt2.status).toBe(200);

    const finalSession = await prisma.activitySession.findUnique({
      where: { id: session.id },
    });
    expect(finalSession?.lastSequenceNumber).toBe(6);
  });

  // TC-C04: Heartbeat Racing with STOP Request
  it("TC-C04: rejects heartbeat pulse with 409 SESSION_SEALED if session stopped", async () => {
    const session = await prisma.activitySession.create({
      data: {
        userId: user.id,
        userMediaId: media.id,
        startedAt: new Date(Date.now() - 30000),
        status: "active",
        activeSeconds: 30,
        lastSequenceNumber: 2,
      },
    });

    // User stops session
    await prisma.activitySession.update({
      where: { id: session.id },
      data: {
        status: "completed",
        closeReason: "user_stop",
        endedAt: new Date(),
      },
    });

    // Delayed pulse arrives
    const res = await sendHeartbeat(
      new Request("http://localhost/api/sessions/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          userMediaId: media.id,
          sequenceNumber: 3,
          clientNonce: "nonce-3-late",
          timestamp: new Date().toISOString(),
          durationSeconds: 15,
        }),
      })
    );

    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.code).toBe("SESSION_SEALED");
  });

  // TC-C05: Heartbeat Racing with Startup Crash Recovery
  it("TC-C05: rejects heartbeat with 409 SESSION_SEALED if session sealed by crash recovery", async () => {
    const session = await prisma.activitySession.create({
      data: {
        userId: user.id,
        userMediaId: media.id,
        startedAt: new Date(Date.now() - 60000),
        status: "active",
        activeSeconds: 45,
        lastSequenceNumber: 3,
      },
    });

    // Crash recovery sweep runs and seals session
    await prisma.activitySession.update({
      where: { id: session.id },
      data: {
        status: "recovered",
        closeReason: "crash_recovery",
        endedAt: new Date(),
      },
    });

    // Stray pulse arrives post-crash
    const res = await sendHeartbeat(
      new Request("http://localhost/api/sessions/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          userMediaId: media.id,
          sequenceNumber: 4,
          clientNonce: "nonce-4-crash",
          timestamp: new Date().toISOString(),
          durationSeconds: 15,
        }),
      })
    );

    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.code).toBe("SESSION_SEALED");
  });

  // TC-C06: Transaction Failure Rollback
  it("TC-C06: rolls back transaction atomically if event creation fails", async () => {
    const session = await prisma.activitySession.create({
      data: {
        userId: user.id,
        userMediaId: media.id,
        startedAt: new Date(Date.now() - 30000),
        status: "active",
        activeSeconds: 15,
        lastSequenceNumber: 1,
        lastClientNonce: "nonce-1",
      },
    });

    // Pre-insert an event with clientNonce 'nonce-duplicate' to force unique constraint failure
    await prisma.activityEvent.create({
      data: {
        userId: user.id,
        sessionId: session.id,
        userMediaId: media.id,
        clientNonce: "nonce-duplicate",
        timestamp: new Date(),
      },
    });

    // Heartbeat sending the duplicate clientNonce -> event insert fails -> transaction rolls back
    const res = await sendHeartbeat(
      new Request("http://localhost/api/sessions/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          userMediaId: media.id,
          sequenceNumber: 2,
          clientNonce: "nonce-duplicate",
          timestamp: new Date().toISOString(),
          durationSeconds: 15,
        }),
      })
    );

    expect(res.status).toBe(500);

    // Verify session state was NOT mutated
    const uncorrupted = await prisma.activitySession.findUnique({
      where: { id: session.id },
    });
    expect(uncorrupted?.lastSequenceNumber).toBe(1);
    expect(uncorrupted?.activeSeconds).toBe(15);
  });

  // TC-C07: Network Drop After Commit
  it("TC-C07: recognizes client retry after dropped network response as idempotent duplicate", async () => {
    const session = await prisma.activitySession.create({
      data: {
        userId: user.id,
        userMediaId: media.id,
        startedAt: new Date(Date.now() - 30000),
        lastHeartbeatAt: new Date(Date.now() - 15000),
        status: "active",
        activeSeconds: 15,
        lastSequenceNumber: 1,
        lastClientNonce: "nonce-1",
      },
    });

    // Attempt 1: succeeds on server
    const res1 = await sendHeartbeat(
      new Request("http://localhost/api/sessions/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          userMediaId: media.id,
          sequenceNumber: 2,
          clientNonce: "nonce-2-retry",
          timestamp: new Date().toISOString(),
          durationSeconds: 15,
        }),
      })
    );
    expect(res1.status).toBe(200);

    // Attempt 2 (Client timeout simulated retry with exact same sequence and nonce)
    const res2 = await sendHeartbeat(
      new Request("http://localhost/api/sessions/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          userMediaId: media.id,
          sequenceNumber: 2,
          clientNonce: "nonce-2-retry",
          timestamp: new Date().toISOString(),
          durationSeconds: 15,
        }),
      })
    );
    expect(res2.status).toBe(200);
    const data2 = await res2.json();
    expect(data2.idempotent).toBe(true);

    // Zero double counting
    const verified = await prisma.activitySession.findUnique({
      where: { id: session.id },
    });
    expect(verified?.activeSeconds).toBe(30); // 15 + 15, not 15 + 15 + 15
  });
});
