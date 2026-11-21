import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

let DatabaseSync: any = null;
try {
  DatabaseSync = require("node:sqlite").DatabaseSync;
} catch {}

import { initializeDatabase, shutdownDatabase } from "../../electron/database/lifecycle";
import { performShutdownSequence } from "../../electron/shutdown";

describe("Milestone 5: Crash Recovery Sweep & Shutdown Session Flush", () => {
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mlocker-lifecycle-sess-"));
    dbPath = path.join(tempDir, "sess-test.db");
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it("startup crash recovery sweep seals lingering active and paused sessions with 'recovered'", () => {
    const mockApp = { isPackaged: true, getPath: () => tempDir };

    // Step 1: Initialize DB (fresh install)
    initializeDatabase(mockApp, { explicitPath: dbPath, logger: () => {} });

    // Step 2: Seed active and paused sessions as if an abrupt crash occurred
    const db = new DatabaseSync(dbPath);
    db.prepare("INSERT INTO User (id, email) VALUES ('u1', 'u1@test.com')").run();
    db.prepare(`
      INSERT INTO UserMedia (id, userId, mediaType, title, updatedAt)
      VALUES ('m1', 'u1', 'anime', 'Monster', CURRENT_TIMESTAMP)
    `).run();

    // Session 1: active session
    db.prepare(`
      INSERT INTO ActivitySession (id, userId, userMediaId, startedAt, lastHeartbeatAt, activeSeconds, status, updatedAt)
      VALUES ('s_active', 'u1', 'm1', '2026-11-20 10:00:00', '2026-11-20 10:30:00', 1800, 'active', CURRENT_TIMESTAMP)
    `).run();

    // Session 2: paused session
    db.prepare(`
      INSERT INTO ActivitySession (id, userId, userMediaId, startedAt, lastHeartbeatAt, activeSeconds, status, updatedAt)
      VALUES ('s_paused', 'u1', 'm1', '2026-11-20 11:00:00', '2026-11-20 11:15:00', 900, 'paused', CURRENT_TIMESTAMP)
    `).run();

    // Session 3: completed session (already sealed)
    db.prepare(`
      INSERT INTO ActivitySession (id, userId, userMediaId, startedAt, endedAt, activeSeconds, status, closeReason, updatedAt)
      VALUES ('s_completed', 'u1', 'm1', '2026-11-20 08:00:00', '2026-11-20 09:00:00', 3600, 'completed', 'user_stop', CURRENT_TIMESTAMP)
    `).run();

    db.close();

    // Step 3: Simulate app re-launch -> initializeDatabase runs crash recovery sweep
    let sweepLogMessage = "";
    initializeDatabase(mockApp, {
      explicitPath: dbPath,
      logger: (msg: string) => {
        if (msg.includes("Crash recovery sweep")) sweepLogMessage = msg;
      },
    });

    expect(sweepLogMessage).toContain("Crash recovery sweep: sealed 2 lingering session(s)");

    // Step 4: Verify sessions in database
    const verifyDb = new DatabaseSync(dbPath);
    const sActive = verifyDb.prepare("SELECT * FROM ActivitySession WHERE id = 's_active'").get() as any;
    expect(sActive.status).toBe("recovered");
    expect(sActive.closeReason).toBe("crash_recovery");
    expect(sActive.endedAt).toBe("2026-11-20 10:30:00");
    expect(sActive.activeSeconds).toBe(1800);

    const sPaused = verifyDb.prepare("SELECT * FROM ActivitySession WHERE id = 's_paused'").get() as any;
    expect(sPaused.status).toBe("recovered");
    expect(sPaused.closeReason).toBe("crash_recovery");
    expect(sPaused.endedAt).toBe("2026-11-20 11:15:00");
    expect(sPaused.activeSeconds).toBe(900);

    const sCompleted = verifyDb.prepare("SELECT * FROM ActivitySession WHERE id = 's_completed'").get() as any;
    expect(sCompleted.status).toBe("completed");
    expect(sCompleted.closeReason).toBe("user_stop");

    verifyDb.close();
  });

  it("shutdown session flush seals open sessions as 'completed' with 'clean_shutdown'", async () => {
    const mockApp = { isPackaged: true, getPath: () => tempDir };
    initializeDatabase(mockApp, { explicitPath: dbPath, logger: () => {} });

    // Seed an open session
    const db = new DatabaseSync(dbPath);
    db.prepare("INSERT INTO User (id, email) VALUES ('u1', 'u1@test.com')").run();
    db.prepare(`
      INSERT INTO UserMedia (id, userId, mediaType, title, updatedAt)
      VALUES ('m1', 'u1', 'tv', 'Breaking Bad', CURRENT_TIMESTAMP)
    `).run();
    db.prepare(`
      INSERT INTO ActivitySession (id, userId, userMediaId, startedAt, lastHeartbeatAt, activeSeconds, status, updatedAt)
      VALUES ('s_open', 'u1', 'm1', '2026-11-20 12:00:00', '2026-11-20 12:45:00', 2700, 'active', CURRENT_TIMESTAMP)
    `).run();
    db.close();

    // Mock Prisma Client that executes raw update
    const executeRawCalls: string[] = [];
    const mockPrisma = {
      $executeRawUnsafe: vi.fn(async (sql: string) => {
        executeRawCalls.push(sql);
        const liveDb = new DatabaseSync(dbPath);
        liveDb.exec(sql);
        liveDb.close();
      }),
      $disconnect: vi.fn(async () => {}),
    };

    const shutdownSummary = await performShutdownSequence({
      databaseConfig: { dbPath },
      prisma: mockPrisma as any,
      logger: () => {},
      errorLogger: () => {},
    });

    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalled();
    expect(mockPrisma.$disconnect).toHaveBeenCalled();
    expect(shutdownSummary.prismaDisconnected).toBe(true);
    expect(shutdownSummary.checkpointSucceeded).toBe(true);

    // Verify session sealed in database
    const verifyDb = new DatabaseSync(dbPath);
    const s = verifyDb.prepare("SELECT * FROM ActivitySession WHERE id = 's_open'").get() as any;
    expect(s.status).toBe("completed");
    expect(s.closeReason).toBe("clean_shutdown");
    expect(s.endedAt).toBe("2026-11-20 12:45:00");
    verifyDb.close();
  });
});
