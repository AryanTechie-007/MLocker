import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

let DatabaseSync: any = null;
try {
  DatabaseSync = require("node:sqlite").DatabaseSync;
} catch {}

import {
  getSchemaVersion,
  setSchemaVersion,
  getTableNames,
  runMigrations,
  MigrationError,
} from "../../electron/database/migrator";
import {
  createDatabaseBackup,
  restoreDatabaseFromBackup,
  verifyDatabaseIntegrity,
  checkpointDatabase,
  rotateBackups,
  BackupError,
} from "../../electron/database/backup";
import {
  resolveDatabasePath,
  initializeDatabase,
  shutdownDatabase,
  DatabaseLifecycleError,
} from "../../electron/database/lifecycle";
import {
  MIGRATIONS,
  LATEST_SCHEMA_VERSION,
  INIT_MIGRATION_SQL,
} from "../../electron/database/migrations";

describe("Milestone 2: Database Lifecycle & SQLite Migration Suite", () => {
  let tempDir: string;
  let dbPath: string;
  let backupDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mlocker-db-test-"));
    dbPath = path.join(tempDir, "test-mlocker.db");
    backupDir = path.join(tempDir, "backups");
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
  });

  // 1. Fresh database initialization
  describe("1. Fresh Database Initialization", () => {
    it("initializes an empty SQLite database with all tables, WAL mode, and PRAGMA user_version = 1", () => {
      const mockApp = {
        isPackaged: true,
        getPath: () => tempDir,
      };

      const result = initializeDatabase(mockApp, {
        explicitPath: dbPath,
        logger: () => {},
      });

      expect(result.isFreshInstall).toBe(true);
      expect(result.version).toBe(LATEST_SCHEMA_VERSION);
      expect(result.appliedMigrations).toContain("20261119000000_init");

      // Verify tables created in SQLite
      const db = new DatabaseSync(dbPath);
      const tables = getTableNames(db);
      expect(tables).toContain("User");
      expect(tables).toContain("UserMedia");
      expect(tables).toContain("Collection");
      expect(tables).toContain("CollectionItem");

      // Verify pragmas
      expect(getSchemaVersion(db)).toBe(1);
      const journalMode = db.prepare("PRAGMA journal_mode").get() as { journal_mode: string };
      expect(journalMode.journal_mode).toBe("wal");
      db.close();
    });
  });

  // 2. Existing database initialization
  describe("2. Existing Database Initialization", () => {
    it("correctly identifies existing database, preserves data, and reports isFreshInstall = false", () => {
      // Step A: First initialization
      const mockApp = {
        isPackaged: true,
        getPath: () => tempDir,
      };
      initializeDatabase(mockApp, { explicitPath: dbPath, logger: () => {} });

      // Insert record
      const db = new DatabaseSync(dbPath);
      db.prepare(
        "INSERT INTO User (id, email, name) VALUES ('u1', 'existing@test.local', 'Existing User')"
      ).run();
      db.close();

      // Step B: Second initialization on existing database
      const secondResult = initializeDatabase(mockApp, { explicitPath: dbPath, logger: () => {} });

      expect(secondResult.isFreshInstall).toBe(false);
      expect(secondResult.version).toBe(1);

      // Verify data preserved
      const dbCheck = new DatabaseSync(dbPath);
      const user = dbCheck.prepare("SELECT * FROM User WHERE id = 'u1'").get() as { email: string };
      expect(user.email).toBe("existing@test.local");
      dbCheck.close();
    });
  });

  // 3. Successful migration from older schema
  describe("3. Multi-Step Migration Execution", () => {
    it("applies sequential migrations in order and updates PRAGMA user_version", () => {
      const db = new DatabaseSync(dbPath);
      db.exec(INIT_MIGRATION_SQL);
      setSchemaVersion(db, 1);

      const customMigrations = [
        ...MIGRATIONS,
        {
          version: 2,
          name: "20261119000001_add_notes",
          sql: 'ALTER TABLE "UserMedia" ADD COLUMN "internalReviewNotes" TEXT;',
        },
      ];

      const result = runMigrations(db, {
        targetVersion: 2,
        migrations: customMigrations,
        logger: () => {},
      });

      expect(result.initialVersion).toBe(1);
      expect(result.finalVersion).toBe(2);
      expect(result.appliedCount).toBe(1);
      expect(result.appliedMigrations).toEqual(["20261119000001_add_notes"]);
      expect(getSchemaVersion(db)).toBe(2);

      // Verify newly added column exists by inserting into it
      db.prepare("INSERT INTO User (id, email) VALUES ('u_mig', 'mig@test.local')").run();
      db.prepare(
        "INSERT INTO UserMedia (id, userId, mediaType, title, internalReviewNotes, updatedAt) VALUES ('m_mig', 'u_mig', 'game', 'Test Game', 'Migrated Note', CURRENT_TIMESTAMP)"
      ).run();

      const item = db.prepare("SELECT internalReviewNotes FROM UserMedia WHERE id = 'm_mig'").get() as {
        internalReviewNotes: string;
      };
      expect(item.internalReviewNotes).toBe("Migrated Note");

      db.close();
    });
  });

  // 4. Preservation of existing records after migration
  describe("4. Record Preservation Across Migrations", () => {
    it("preserves pre-existing user records and relations when schema is upgraded", () => {
      const db = new DatabaseSync(dbPath);
      db.exec(INIT_MIGRATION_SQL);
      setSchemaVersion(db, 1);

      // Seed pre-migration data
      db.prepare("INSERT INTO User (id, email, name) VALUES ('u_preserve', 'preserve@test.local', 'Pre User')").run();
      db.prepare(
        "INSERT INTO UserMedia (id, userId, mediaType, title, rating, updatedAt) VALUES ('m_preserve', 'u_preserve', 'movie', 'Inception', 9.5, CURRENT_TIMESTAMP)"
      ).run();

      const customMigrations = [
        ...MIGRATIONS,
        {
          version: 2,
          name: "20261119000002_add_flag",
          sql: 'ALTER TABLE "UserMedia" ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT 0;',
        },
      ];

      runMigrations(db, { targetVersion: 2, migrations: customMigrations, logger: () => {} });

      // Verify original records are unchanged
      const user = db.prepare("SELECT * FROM User WHERE id = 'u_preserve'").get() as { name: string };
      expect(user.name).toBe("Pre User");

      const media = db.prepare("SELECT * FROM UserMedia WHERE id = 'm_preserve'").get() as {
        title: string;
        rating: number;
        isArchived: number;
      };
      expect(media.title).toBe("Inception");
      expect(media.rating).toBe(9.5);
      expect(media.isArchived).toBe(0);

      db.close();
    });
  });

  // 5. Migration failure handling & atomic rollback
  describe("5. Migration Failure Handling & Atomic Rollback", () => {
    it("rolls back partial transaction changes on invalid SQL and preserves original version", () => {
      const db = new DatabaseSync(dbPath);
      db.exec(INIT_MIGRATION_SQL);
      setSchemaVersion(db, 1);

      const invalidMigrations = [
        ...MIGRATIONS,
        {
          version: 2,
          name: "20261119000003_bad_syntax",
          sql: "ALTER TABLE UserMedia ADD COLUMN validCol TEXT; INVALID SYNTAX ERROR STATEMENT;",
        },
      ];

      expect(() => {
        runMigrations(db, {
          targetVersion: 2,
          migrations: invalidMigrations,
          logger: () => {},
        });
      }).toThrowError(MigrationError);

      // PRAGMA user_version must remain at 1
      expect(getSchemaVersion(db)).toBe(1);

      // Column 'validCol' must NOT exist because of atomic rollback
      const tableInfo = db.prepare("PRAGMA table_info('UserMedia')").all() as Array<{ name: string }>;
      const hasValidCol = tableInfo.some((col) => col.name === "validCol");
      expect(hasValidCol).toBe(false);

      db.close();
    });
  });

  // 6. Database backup creation
  describe("6. Database Backup Creation", () => {
    it("creates a valid, verified SQLite backup file in the target directory", () => {
      const db = new DatabaseSync(dbPath);
      db.exec(INIT_MIGRATION_SQL);
      setSchemaVersion(db, 1);
      db.prepare("INSERT INTO User (id, email) VALUES ('u_bak', 'bak@test.local')").run();
      db.close();

      const backup = createDatabaseBackup(dbPath, backupDir, { tag: "test-snapshot" });

      expect(fs.existsSync(backup.backupPath)).toBe(true);
      expect(backup.filename).toContain("test-snapshot");
      expect(backup.size).toBeGreaterThan(0);

      const check = verifyDatabaseIntegrity(backup.backupPath);
      expect(check.ok).toBe(true);
    });
  });

  // 7. Backup restoration
  describe("7. Backup Restoration & Recovery", () => {
    it("restores database cleanly after corruption or data loss", () => {
      // Create initial DB
      const db = new DatabaseSync(dbPath);
      db.exec(INIT_MIGRATION_SQL);
      setSchemaVersion(db, 1);
      db.prepare("INSERT INTO User (id, email, name) VALUES ('u_rec', 'rec@test.local', 'Recovery User')").run();
      db.close();

      // Create backup
      const backup = createDatabaseBackup(dbPath, backupDir, { tag: "pre-disaster" });

      // Corrupt / drop table in active database
      const corruptDb = new DatabaseSync(dbPath);
      corruptDb.exec("DROP TABLE User");
      corruptDb.close();

      // Restore from backup
      const restoreResult = restoreDatabaseFromBackup(backup.backupPath, dbPath);
      expect(restoreResult.ok).toBe(true);

      // Verify User table and record restored
      const restoredDb = new DatabaseSync(dbPath);
      const user = restoredDb.prepare("SELECT * FROM User WHERE id = 'u_rec'").get() as { name: string };
      expect(user.name).toBe("Recovery User");
      restoredDb.close();
    });

    it("rejects restoring a corrupt or non-SQLite file", () => {
      const invalidBackupPath = path.join(backupDir, "corrupt.bak");
      fs.mkdirSync(backupDir, { recursive: true });
      fs.writeFileSync(invalidBackupPath, "NOT AN SQLITE FILE DATA TEXT");

      expect(() => {
        restoreDatabaseFromBackup(invalidBackupPath, dbPath);
      }).toThrowError(BackupError);
    });
  });

  // 8. WAL-compatible backup behavior
  describe("8. WAL-Compatible Backup Consistency", () => {
    it("flushes WAL journal pages into primary database file during backup creation", () => {
      const db = new DatabaseSync(dbPath);
      db.exec("PRAGMA journal_mode = WAL");
      db.exec(INIT_MIGRATION_SQL);
      setSchemaVersion(db, 1);

      // Write data under WAL
      db.prepare("INSERT INTO User (id, email, name) VALUES ('u_wal', 'wal@test.local', 'WAL User')").run();
      db.close();

      // Backup will call checkpointDatabase(dbPath)
      const backup = createDatabaseBackup(dbPath, backupDir, { tag: "wal-test" });

      // Open the backup file directly without any accompanying -wal file
      const backupDb = new DatabaseSync(backup.backupPath);
      const user = backupDb.prepare("SELECT * FROM User WHERE id = 'u_wal'").get() as { name: string };
      expect(user.name).toBe("WAL User");
      backupDb.close();
    });
  });

  // 9. Persistent database path resolution
  describe("9. Persistent Path Resolution", () => {
    it("resolves to app.getPath('userData')/mlocker.db in packaged mode", () => {
      const mockUserData = path.join(tempDir, "user-data");
      fs.mkdirSync(mockUserData, { recursive: true });

      const mockApp = {
        isPackaged: true,
        getPath: (name: string) => {
          if (name === "userData") return mockUserData;
          return tempDir;
        },
      };

      const resolved = resolveDatabasePath(mockApp, { isPackaged: true });
      expect(resolved.isPackaged).toBe(true);
      expect(resolved.dbPath).toBe(path.join(mockUserData, "mlocker.db"));
      expect(resolved.dbUrl).toBe(`file:${path.join(mockUserData, "mlocker.db").replace(/\\/g, "/")}`);
    });

    it("preserves backward compatibility if dev.db exists in userData", () => {
      const mockUserData = path.join(tempDir, "user-data-legacy");
      fs.mkdirSync(mockUserData, { recursive: true });
      const legacyDbPath = path.join(mockUserData, "dev.db");
      fs.writeFileSync(legacyDbPath, "");

      const mockApp = {
        isPackaged: true,
        getPath: () => mockUserData,
      };

      const resolved = resolveDatabasePath(mockApp, { isPackaged: true });
      expect(resolved.dbPath).toBe(legacyDbPath);
    });

    it("resolves to development database when isPackaged is false", () => {
      const savedEnv = process.env.DATABASE_URL;
      delete process.env.DATABASE_URL;
      try {
        const resolved = resolveDatabasePath(undefined, { isPackaged: false });
        expect(resolved.isPackaged).toBe(false);
        expect(resolved.dbPath).toContain("dev.db");
      } finally {
        if (savedEnv !== undefined) {
          process.env.DATABASE_URL = savedEnv;
        }
      }
    });
  });

  // 10. Startup failure handling
  describe("10. Startup Failure Handling", () => {
    it("fails closed with DatabaseLifecycleError when database path is invalid or un-writable", () => {
      const mockApp = {
        isPackaged: true,
        getPath: () => "Z:\\non-existent-drive-path\\directory",
      };

      expect(() => {
        initializeDatabase(mockApp, {
          explicitPath: "Z:\\non-existent-drive-path\\db.sqlite",
          logger: () => {},
        });
      }).toThrowError(DatabaseLifecycleError);
    });
  });

  // 11. Idempotency & duplicate initialization prevention
  describe("11. Idempotent Initialization", () => {
    it("safely handles repeated calls to initializeDatabase without re-executing migrations or failing", () => {
      const mockApp = { isPackaged: true, getPath: () => tempDir };

      const init1 = initializeDatabase(mockApp, { explicitPath: dbPath, logger: () => {} });
      expect(init1.isFreshInstall).toBe(true);

      const init2 = initializeDatabase(mockApp, { explicitPath: dbPath, logger: () => {} });
      expect(init2.isFreshInstall).toBe(false);
      expect(init2.appliedMigrations.length).toBe(0);

      const init3 = initializeDatabase(mockApp, { explicitPath: dbPath, logger: () => {} });
      expect(init3.isFreshInstall).toBe(false);
      expect(init3.appliedMigrations.length).toBe(0);

      // Verify database remains valid
      const integrity = verifyDatabaseIntegrity(dbPath);
      expect(integrity.ok).toBe(true);
    });
  });

  // 12. Restart behavior & data persistence
  describe("12. Restart Persistence & Graceful Shutdown", () => {
    it("persists writes across shutdown checkpoint and subsequent re-launch", () => {
      const mockApp = { isPackaged: true, getPath: () => tempDir };

      // Launch 1
      initializeDatabase(mockApp, { explicitPath: dbPath, logger: () => {} });
      const db1 = new DatabaseSync(dbPath);
      db1.prepare("INSERT INTO User (id, email, name) VALUES ('u_restart', 'restart@test.local', 'Restart User')").run();
      db1.close();

      // Shutdown
      shutdownDatabase(dbPath);

      // Launch 2 (App restart)
      const restartInit = initializeDatabase(mockApp, { explicitPath: dbPath, logger: () => {} });
      expect(restartInit.isFreshInstall).toBe(false);

      const db2 = new DatabaseSync(dbPath);
      const user = db2.prepare("SELECT * FROM User WHERE id = 'u_restart'").get() as { name: string };
      expect(user.name).toBe("Restart User");
      db2.close();
    });
  });

  // Backup rotation testing
  describe("Backup Rotation", () => {
    it("limits stored backups to maxBackups", () => {
      fs.mkdirSync(backupDir, { recursive: true });
      for (let i = 1; i <= 8; i++) {
        fs.writeFileSync(path.join(backupDir, `backup-test-${i}.bak`), `data ${i}`);
      }

      const deleted = rotateBackups(backupDir, 5, "backup-test");
      expect(deleted.length).toBe(3);

      const remaining = fs.readdirSync(backupDir).filter((f) => f.endsWith(".bak"));
      expect(remaining.length).toBe(5);
    });
  });
});
