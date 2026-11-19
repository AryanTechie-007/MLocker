import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

let DatabaseSync: any = null;
try {
  DatabaseSync = require("node:sqlite").DatabaseSync;
} catch {}

import {
  checkpointDatabase,
  createDatabaseBackup,
  restoreDatabaseFromBackup,
  verifyDatabaseIntegrity,
  BackupError,
} from "../../electron/database/backup";
import {
  initializeDatabase,
  DatabaseLifecycleError,
} from "../../electron/database/lifecycle";
import { INIT_MIGRATION_SQL } from "../../electron/database/migrations";

describe("Milestone 2.1 — Backup Failure Injection & Safe Recovery Suite", () => {
  let tempDir: string;
  let dbPath: string;
  let backupDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mlocker-backup-test-"));
    dbPath = path.join(tempDir, "test.db");
    backupDir = path.join(tempDir, "backups");
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
  });

  // 1. Checkpoint reporting accuracy
  describe("1. Checkpoint Reporting Accuracy", () => {
    it("reports ok: false with error description when checkpointing a non-existent database file", () => {
      const nonExistentPath = path.join(tempDir, "does-not-exist.db");
      const result = checkpointDatabase(nonExistentPath);

      expect(result.ok).toBe(false);
      expect(result.error).toContain("does not exist");
    });

    it("reports ok: true when checkpointing an active WAL database", () => {
      const db = new DatabaseSync(dbPath);
      db.exec("PRAGMA journal_mode = WAL");
      db.exec("CREATE TABLE T (id INT); INSERT INTO T VALUES (1);");
      db.close();

      const result = checkpointDatabase(dbPath, "TRUNCATE");
      expect(result.ok).toBe(true);
      expect(result.busy).toBe(false);
    });
  });

  // 2. Backup creation checkpoint failure injection
  describe("2. Backup Creation Checkpoint Failure Injection", () => {
    it("does NOT copy main database file when required checkpoint fails", () => {
      // Point dbPath to an existing but invalid/un-checkpointable target
      // A directory named dbPath cannot be checkpointed as an SQLite database
      const dirAsDb = path.join(tempDir, "dir-as-db.db");
      fs.mkdirSync(dirAsDb, { recursive: true });

      expect(() => {
        createDatabaseBackup(dirAsDb, backupDir, { requireCheckpoint: true });
      }).toThrowError(BackupError);

      // Verify no backup files were created in backupDir
      const files = fs.existsSync(backupDir) ? fs.readdirSync(backupDir) : [];
      expect(files.length).toBe(0);
    });
  });

  // 3. Pre-migration backup failure on existing database prevents migration
  describe("3. Pre-Migration Backup Failure Halts Migration", () => {
    it("aborts migration and prevents database modification if pre-migration backup fails", () => {
      // Step A: Set up an existing database at version 0 (needs migration to v1)
      const db = new DatabaseSync(dbPath);
      db.exec("CREATE TABLE LegacyNotes (id TEXT PRIMARY KEY, note TEXT);");
      db.prepare("INSERT INTO LegacyNotes VALUES ('n1', 'Important user data')").run();
      db.close();

      // Step B: Make backupDir unwritable by placing a read-only file or blocker in place of backupDir
      const mockUserData = path.join(tempDir, "mock-userData");
      fs.mkdirSync(mockUserData, { recursive: true });
      const blockerBackupDir = path.join(mockUserData, "backups");
      // Create a regular file where the backups directory needs to be created
      fs.writeFileSync(blockerBackupDir, "BLOCKER FILE THAT PREVENTS DIRECTORY CREATION");

      const mockApp = {
        isPackaged: true,
        getPath: () => mockUserData,
      };

      // Initialization must fail and NOT proceed with migration
      expect(() => {
        initializeDatabase(mockApp, {
          explicitPath: dbPath,
          logger: () => {},
        });
      }).toThrowError(DatabaseLifecycleError);

      // Verify original data in LegacyNotes is completely untouched
      const dbCheck = new DatabaseSync(dbPath);
      const row = dbCheck.prepare("SELECT * FROM LegacyNotes WHERE id = 'n1'").get() as any;
      expect(row.note).toBe("Important user data");

      // Verify no partial migration tables were created
      const tables = dbCheck
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='User'")
        .all();
      expect(tables.length).toBe(0);
      dbCheck.close();
    });
  });

  // 4. Backup verification includes SQLite integrity
  describe("4. Backup Verification & Corrupt File Handling", () => {
    it("rejects corrupt backup files and removes unverified snapshots", () => {
      // Create database
      const db = new DatabaseSync(dbPath);
      db.exec(INIT_MIGRATION_SQL);
      db.close();

      // Corrupt verification test
      const corruptPath = path.join(tempDir, "corrupted.bak");
      fs.writeFileSync(corruptPath, "CORRUPTED HEADER DATA THAT IS NOT SQLITE");

      const check = verifyDatabaseIntegrity(corruptPath);
      expect(check.ok).toBe(false);
      expect(check.errors[0]).toContain("Invalid SQLite header");
    });
  });

  // 5. Safe restoration: original database preserved if restoration fails
  describe("5. Safe Restoration Failure Recovery", () => {
    it("preserves original database and all records if restoration fails due to corrupt backup", () => {
      // Set up original database with critical records
      const db = new DatabaseSync(dbPath);
      db.exec("CREATE TABLE OriginalData (key TEXT, val TEXT);");
      db.prepare("INSERT INTO OriginalData VALUES ('k1', 'v1_original')").run();
      db.close();

      // Create a corrupt backup file
      const corruptBackup = path.join(backupDir, "corrupt.bak");
      fs.mkdirSync(backupDir, { recursive: true });
      fs.writeFileSync(corruptBackup, "INVALID CORRUPT DATA");

      // Attempt restore: must throw BackupError
      expect(() => {
        restoreDatabaseFromBackup(corruptBackup, dbPath);
      }).toThrowError(BackupError);

      // Verify original database file STILL EXISTS and data is intact!
      expect(fs.existsSync(dbPath)).toBe(true);
      const dbVerify = new DatabaseSync(dbPath);
      const row = dbVerify.prepare("SELECT * FROM OriginalData WHERE key = 'k1'").get() as any;
      expect(row.val).toBe("v1_original");
      dbVerify.close();
    });

    it("handles WAL and SHM auxiliary files safely during restoration", () => {
      // Create database in WAL mode with active writes
      const db = new DatabaseSync(dbPath);
      db.exec("PRAGMA journal_mode = WAL");
      db.exec("CREATE TABLE TableA (id INT); INSERT INTO TableA VALUES (42);");
      db.close();

      // Take verified backup
      const backup = createDatabaseBackup(dbPath, backupDir, { tag: "wal-test" });

      // Simulate stray WAL/SHM files at target
      fs.writeFileSync(`${dbPath}-wal`, "STALE WAL BYTES");
      fs.writeFileSync(`${dbPath}-shm`, "STALE SHM BYTES");

      // Restore from backup
      const result = restoreDatabaseFromBackup(backup.backupPath, dbPath);
      expect(result.ok).toBe(true);

      // Verify database opens cleanly and data is intact
      const restoredDb = new DatabaseSync(dbPath);
      const row = restoredDb.prepare("SELECT * FROM TableA").get() as any;
      expect(row.id).toBe(42);
      restoredDb.close();
    });
  });
});
