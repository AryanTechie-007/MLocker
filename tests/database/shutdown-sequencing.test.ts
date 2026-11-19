import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

let DatabaseSync: any = null;
try {
  DatabaseSync = require("node:sqlite").DatabaseSync;
} catch {}

import { performShutdownSequence } from "../../electron/shutdown";

describe("Milestone 2.1 — Electron Shutdown Sequencing Suite", () => {
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mlocker-shutdown-test-"));
    dbPath = path.join(tempDir, "shutdown-test.db");

    const db = new DatabaseSync(dbPath);
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("CREATE TABLE Items (id INT, val TEXT); INSERT INTO Items VALUES (1, 'active');");
    db.close();
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
  });

  // 1. Strict execution ordering
  it("executes shutdown steps in strict sequence: stop accepting -> close server -> disconnect prisma -> checkpoint WAL", async () => {
    const sequenceOrder: string[] = [];

    // Mock HTTP server
    const mockServer = {
      closeIdleConnections: vi.fn(() => {
        sequenceOrder.push("closeIdleConnections");
      }),
      close: vi.fn((cb: (err?: Error) => void) => {
        sequenceOrder.push("serverClose");
        setTimeout(() => cb(), 10);
      }),
      closeAllConnections: vi.fn(),
    } as any;

    // Mock Prisma Client
    const mockPrisma = {
      $disconnect: vi.fn(async () => {
        sequenceOrder.push("prismaDisconnect");
      }),
    };

    const databaseConfig = { dbPath };

    const summary = await performShutdownSequence({
      nextServer: mockServer,
      databaseConfig,
      prisma: mockPrisma,
      drainTimeoutMs: 1000,
      logger: (msg: string) => {
        if (msg.includes("Step 5")) {
          sequenceOrder.push("checkpointWAL");
        }
      },
      errorLogger: () => {},
    });

    expect(summary.serverClosed).toBe(true);
    expect(summary.requestsDrained).toBe(true);
    expect(summary.prismaDisconnected).toBe(true);
    expect(summary.checkpointExecuted).toBe(true);
    expect(summary.checkpointSucceeded).toBe(true);
    expect(summary.errors.length).toBe(0);

    // Assert strict ordering:
    // 1. Server stops accepting / close idle
    // 2. Server closes
    // 3. Prisma disconnects
    // 4. WAL checkpoint occurs AFTER prisma disconnect
    const closeIdleIdx = sequenceOrder.indexOf("closeIdleConnections");
    const serverCloseIdx = sequenceOrder.indexOf("serverClose");
    const prismaIdx = sequenceOrder.indexOf("prismaDisconnect");
    const checkpointIdx = sequenceOrder.indexOf("checkpointWAL");

    expect(closeIdleIdx).toBeLessThan(serverCloseIdx);
    expect(serverCloseIdx).toBeLessThan(prismaIdx);
    expect(prismaIdx).toBeLessThan(checkpointIdx);
  });

  // 2. Active request draining and timeout handling
  it("drains active requests and force-terminates when timeout is reached", async () => {
    let closedAllCalled = false;

    // Server whose close() callback hangs until timeout
    const hangingServer = {
      closeIdleConnections: vi.fn(),
      close: vi.fn(), // never calls callback
      closeAllConnections: vi.fn(() => {
        closedAllCalled = true;
      }),
    } as any;

    const summary = await performShutdownSequence({
      nextServer: hangingServer,
      databaseConfig: { dbPath },
      prisma: undefined,
      drainTimeoutMs: 50, // fast timeout for test
      logger: () => {},
      errorLogger: () => {},
    });

    expect(closedAllCalled).toBe(true);
    expect(summary.requestsDrained).toBe(true);
    expect(summary.checkpointSucceeded).toBe(true);
  });

  // 3. Accurate checkpoint error reporting (no false success)
  it("does NOT report a successful checkpoint when checkpoint fails", async () => {
    // Point databaseConfig to an invalid/un-checkpointable path
    const invalidDbPath = path.join(tempDir, "nonexistent-dir", "invalid.db");
    const databaseConfig = { dbPath: invalidDbPath };

    const summary = await performShutdownSequence({
      nextServer: undefined,
      databaseConfig,
      prisma: undefined,
      logger: () => {},
      errorLogger: () => {},
    });

    expect(summary.checkpointExecuted).toBe(true);
    expect(summary.checkpointSucceeded).toBe(false);
    expect(summary.errors.length).toBeGreaterThan(0);
    expect(summary.errors[0]).toContain("Shutdown checkpoint failed");
  });

  // 4. Skipped checkpoint reporting
  it("reports checkpoint as not executed when databaseConfig is missing or null", async () => {
    const summary = await performShutdownSequence({
      nextServer: undefined,
      databaseConfig: undefined,
      prisma: undefined,
      logger: () => {},
      errorLogger: () => {},
    });

    expect(summary.checkpointExecuted).toBe(false);
    expect(summary.checkpointSucceeded).toBe(false);
    expect(summary.errors.length).toBe(0);
  });
});
