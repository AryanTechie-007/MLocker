import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

let DatabaseSync: any = null;
try {
  DatabaseSync = require("node:sqlite").DatabaseSync;
} catch {}

import {
  MIGRATIONS,
  LATEST_SCHEMA_VERSION,
  INIT_MIGRATION_SQL,
  MEDIA_SOURCE_MIGRATION_SQL,
  SESSION_ENGINE_MIGRATION_SQL,
  SESSION_ENGINE_MIGRATION_CHECKSUM,
  resolveMigrationSql,
  getMigrationChecksum,
} from "../../electron/database/migrations";
import { runMigrations, getSchemaVersion } from "../../electron/database/migrator";
import { inspectDatabaseSchema } from "../../electron/database/schema-validator";

describe("Milestone 5: Schema Version 3 Migration & Immutability Trigger Suite", () => {
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mlocker-v3-test-"));
    dbPath = path.join(tempDir, "v3-test.db");
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it("registers migration 3 in MIGRATIONS with authentic checksum and bumps LATEST_SCHEMA_VERSION to 3", () => {
    expect(LATEST_SCHEMA_VERSION).toBe(3);
    const m3 = MIGRATIONS.find((m) => m.version === 3);
    expect(m3).toBeDefined();
    expect(m3?.name).toBe("20261121000000_session_engine");

    const expectedChecksum = getMigrationChecksum(SESSION_ENGINE_MIGRATION_SQL);
    expect(m3?.checksum).toBe(expectedChecksum);
    expect(SESSION_ENGINE_MIGRATION_CHECKSUM).toBe(expectedChecksum);
  });

  it("applies sequential migrations v0 -> v3 on a fresh database", () => {
    const db = new DatabaseSync(dbPath);
    db.exec("PRAGMA foreign_keys = ON;");

    const result = runMigrations(db, {
      targetVersion: 3,
      migrations: MIGRATIONS,
      logger: () => {},
    });

    expect(result.initialVersion).toBe(0);
    expect(result.finalVersion).toBe(3);
    expect(result.appliedCount).toBe(3);
    expect(getSchemaVersion(db)).toBe(3);

    const schema = inspectDatabaseSchema(db);
    expect(schema.tableNames).toContain("User");
    expect(schema.tableNames).toContain("UserMedia");
    expect(schema.tableNames).toContain("MediaSource");
    expect(schema.tableNames).toContain("ActivitySession");
    expect(schema.tableNames).toContain("ActivityEvent");

    // Check User table has trackingPreferences
    const userTable = (schema.tables as Record<string, any>)["User"];
    const trackingCol = userTable.columns.find((c: any) => c.name === "trackingPreferences");
    expect(trackingCol).toBeDefined();

    db.close();
  });

  it("applies upgrade v2 -> v3 preserving pre-existing data", () => {
    const db = new DatabaseSync(dbPath);
    db.exec("PRAGMA foreign_keys = ON;");

    // Run v1 and v2
    runMigrations(db, { targetVersion: 2, migrations: MIGRATIONS, logger: () => {} });
    expect(getSchemaVersion(db)).toBe(2);

    // Seed data in v2
    db.prepare("INSERT INTO User (id, email, name) VALUES ('u1', 'u1@test.com', 'User 1')").run();
    db.prepare(`
      INSERT INTO UserMedia (id, userId, mediaType, title, rating, updatedAt)
      VALUES ('m1', 'u1', 'anime', 'Steins;Gate', 10, CURRENT_TIMESTAMP)
    `).run();

    // Now run migration to v3
    const upgradeResult = runMigrations(db, {
      targetVersion: 3,
      migrations: MIGRATIONS,
      logger: () => {},
    });

    expect(upgradeResult.initialVersion).toBe(2);
    expect(upgradeResult.finalVersion).toBe(3);
    expect(upgradeResult.appliedCount).toBe(1);
    expect(upgradeResult.appliedMigrations).toEqual(["20261121000000_session_engine"]);

    // Verify existing data is preserved
    const user = db.prepare("SELECT * FROM User WHERE id = 'u1'").get() as any;
    expect(user.name).toBe("User 1");
    expect(user.trackingPreferences).toBeNull();

    const media = db.prepare("SELECT * FROM UserMedia WHERE id = 'm1'").get() as any;
    expect(media.title).toBe("Steins;Gate");

    db.close();
  });

  it("enforces SQLite immutability trigger trg_activityevent_prevent_update", () => {
    const db = new DatabaseSync(dbPath);
    db.exec("PRAGMA foreign_keys = ON;");
    runMigrations(db, { targetVersion: 3, migrations: MIGRATIONS, logger: () => {} });

    // Seed user, media, session, event
    db.prepare("INSERT INTO User (id, email) VALUES ('u1', 'u1@test.com')").run();
    db.prepare(`
      INSERT INTO UserMedia (id, userId, mediaType, title, updatedAt)
      VALUES ('m1', 'u1', 'manga', 'Berserk', CURRENT_TIMESTAMP)
    `).run();
    db.prepare(`
      INSERT INTO ActivitySession (id, userId, userMediaId, startedAt, updatedAt)
      VALUES ('s1', 'u1', 'm1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run();
    db.prepare(`
      INSERT INTO ActivityEvent (id, userId, sessionId, userMediaId, clientNonce, timestamp)
      VALUES ('e1', 'u1', 's1', 'm1', 'nonce-abc', CURRENT_TIMESTAMP)
    `).run();

    // Attempt direct SQL UPDATE on ActivityEvent -> must fail via trigger
    expect(() => {
      db.prepare("UPDATE ActivityEvent SET durationSeconds = 999 WHERE id = 'e1'").run();
    }).toThrowError(/ActivityEvent rows are immutable and cannot be updated/);

    db.close();
  });

  it("enforces 3-column composite foreign key integrity on ActivityEvent", () => {
    const db = new DatabaseSync(dbPath);
    db.exec("PRAGMA foreign_keys = ON;");
    runMigrations(db, { targetVersion: 3, migrations: MIGRATIONS, logger: () => {} });

    db.prepare("INSERT INTO User (id, email) VALUES ('u1', 'u1@test.com')").run();
    db.prepare("INSERT INTO User (id, email) VALUES ('u2', 'u2@test.com')").run();
    db.prepare(`
      INSERT INTO UserMedia (id, userId, mediaType, title, updatedAt)
      VALUES ('m1', 'u1', 'game', 'Elden Ring', CURRENT_TIMESTAMP)
    `).run();
    db.prepare(`
      INSERT INTO UserMedia (id, userId, mediaType, title, updatedAt)
      VALUES ('m2', 'u2', 'game', 'Dark Souls', CURRENT_TIMESTAMP)
    `).run();
    db.prepare(`
      INSERT INTO ActivitySession (id, userId, userMediaId, startedAt, updatedAt)
      VALUES ('s1', 'u1', 'm1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run();

    // Valid event insert referencing s1 with matching u1 and m1
    expect(() => {
      db.prepare(`
        INSERT INTO ActivityEvent (id, userId, sessionId, userMediaId, clientNonce, timestamp)
        VALUES ('e1', 'u1', 's1', 'm1', 'nonce-valid', CURRENT_TIMESTAMP)
      `).run();
    }).not.toThrow();

    // Attempt cross-tenant mismatch: sessionId s1 belongs to u1/m1, but event userId is u2
    expect(() => {
      db.prepare(`
        INSERT INTO ActivityEvent (id, userId, sessionId, userMediaId, clientNonce, timestamp)
        VALUES ('e2', 'u2', 's1', 'm2', 'nonce-cross-tenant', CURRENT_TIMESTAMP)
      `).run();
    }).toThrowError(/FOREIGN KEY constraint failed/);

    db.close();
  });
});
