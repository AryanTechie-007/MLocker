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
  runMigrations,
  MigrationError,
  recordPrismaMigration,
} from "../../electron/database/migrator";
import {
  inspectDatabaseSchema,
  validateLegacySchema,
  areDefaultsEquivalent,
  normalizeDefaultValue,
} from "../../electron/database/schema-validator";
import { INIT_MIGRATION_SQL, LATEST_SCHEMA_VERSION } from "../../electron/database/migrations";

describe("Milestone 2.1 — Legacy Database Structural Validation Suite", () => {
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mlocker-legacy-test-"));
    dbPath = path.join(tempDir, "legacy.db");
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
  });

  // Canonical exact baseline DDL with all FKs, PKs, types, nullability, and indexes
  const canonicalBaselineDdl = `
    CREATE TABLE "User" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT,
      "email" TEXT NOT NULL,
      "passwordHash" TEXT,
      "image" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE "UserMedia" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "mediaType" TEXT NOT NULL,
      "externalId" TEXT,
      "externalSource" TEXT,
      "title" TEXT NOT NULL,
      "posterUrl" TEXT,
      "year" INTEGER,
      "genres" TEXT,
      "overview" TEXT,
      "status" TEXT NOT NULL DEFAULT 'plan_to_consume',
      "rating" REAL,
      "review" TEXT,
      "isFavorite" BOOLEAN NOT NULL DEFAULT false,
      "totalEpisodes" INTEGER,
      "watchedEpisodes" INTEGER,
      "totalChapters" INTEGER,
      "readChapters" INTEGER,
      "hoursPlayed" REAL,
      "startDate" DATETIME,
      "endDate" DATETIME,
      "tags" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "UserMedia_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
    CREATE TABLE "Collection" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "coverUrl" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "Collection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
    CREATE TABLE "CollectionItem" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "collectionId" TEXT NOT NULL,
      "userMediaId" TEXT NOT NULL,
      "order" INTEGER NOT NULL DEFAULT 0,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "CollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "CollectionItem_userMediaId_fkey" FOREIGN KEY ("userMediaId") REFERENCES "UserMedia" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
    CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
    CREATE INDEX "UserMedia_userId_mediaType_idx" ON "UserMedia"("userId", "mediaType");
    CREATE INDEX "UserMedia_userId_status_idx" ON "UserMedia"("userId", "status");
    CREATE UNIQUE INDEX "UserMedia_userId_mediaType_externalId_key" ON "UserMedia"("userId", "mediaType", "externalId");
    CREATE INDEX "Collection_userId_idx" ON "Collection"("userId");
    CREATE UNIQUE INDEX "CollectionItem_collectionId_userMediaId_key" ON "CollectionItem"("collectionId", "userMediaId");
  `;

  // 1. Fresh database detection
  it("detects a fresh database with 0 user tables as FRESH", () => {
    const db = new DatabaseSync(dbPath);
    const validation = validateLegacySchema(db);
    expect(validation.type).toBe("FRESH");
    expect(validation.isCompatible).toBe(true);
    db.close();
  });

  // 2. Exact baseline legacy database (user_version = 0, full v1 schema with FKs and indexes)
  it("safely baselines an existing database with complete v1 schema, FKs, and indexes, preserving all records", () => {
    const db = new DatabaseSync(dbPath);
    db.exec(canonicalBaselineDdl);

    // Verify initial user_version is 0
    expect(getSchemaVersion(db)).toBe(0);

    // Insert pre-existing user records
    db.prepare("INSERT INTO User (id, email, name) VALUES ('u_leg_1', 'user1@legacy.test', 'Legacy User 1')").run();
    db.prepare(
      "INSERT INTO UserMedia (id, userId, mediaType, title, updatedAt) VALUES ('m_leg_1', 'u_leg_1', 'movie', 'Legacy Inception', CURRENT_TIMESTAMP)"
    ).run();
    db.prepare("INSERT INTO Collection (id, userId, name, updatedAt) VALUES ('c_leg_1', 'u_leg_1', 'Legacy Favorites', CURRENT_TIMESTAMP)").run();
    db.prepare("INSERT INTO CollectionItem (id, collectionId, userMediaId) VALUES ('ci_leg_1', 'c_leg_1', 'm_leg_1')").run();
    db.close();

    // Verify exact baseline classification
    const dbToMigrate = new DatabaseSync(dbPath);
    const validation = validateLegacySchema(dbToMigrate);
    expect(validation.type).toBe("EXACT_BASELINE");
    expect(validation.isCompatible).toBe(true);

    // Run migration runner
    const result = runMigrations(dbToMigrate, { logger: () => {} });

    expect(result.initialVersion).toBe(0);
    expect(result.finalVersion).toBe(LATEST_SCHEMA_VERSION);
    expect(getSchemaVersion(dbToMigrate)).toBe(LATEST_SCHEMA_VERSION);

    // Verify records are 100% intact
    const user = dbToMigrate.prepare("SELECT * FROM User WHERE id = 'u_leg_1'").get() as any;
    expect(user.name).toBe("Legacy User 1");
    expect(user.email).toBe("user1@legacy.test");

    const media = dbToMigrate.prepare("SELECT * FROM UserMedia WHERE id = 'm_leg_1'").get() as any;
    expect(media.title).toBe("Legacy Inception");

    const col = dbToMigrate.prepare("SELECT * FROM Collection WHERE id = 'c_leg_1'").get() as any;
    expect(col.name).toBe("Legacy Favorites");

    dbToMigrate.close();
  });

  // 3. Supported legacy database (valid FKs and core columns, but missing optional columns)
  it("detects and upgrades a supported legacy schema with valid FKs but missing optional columns, preserving records", () => {
    const db = new DatabaseSync(dbPath);
    // Legacy schema with correct FKs, PKs, types, but missing optional columns (tags, hoursPlayed, isFavorite, review, passwordHash)
    const earlyLegacySql = `
      CREATE TABLE "User" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT,
        "email" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE "UserMedia" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "mediaType" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        CONSTRAINT "UserMedia_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE TABLE "Collection" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        CONSTRAINT "Collection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE TABLE "CollectionItem" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "collectionId" TEXT NOT NULL,
        "userMediaId" TEXT NOT NULL,
        "order" INTEGER NOT NULL DEFAULT 0,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "CollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "CollectionItem_userMediaId_fkey" FOREIGN KEY ("userMediaId") REFERENCES "UserMedia" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
      CREATE UNIQUE INDEX "CollectionItem_collectionId_userMediaId_key" ON "CollectionItem"("collectionId", "userMediaId");
    `;
    db.exec(earlyLegacySql);

    // Seed existing legacy data
    db.prepare("INSERT INTO User (id, email, name) VALUES ('u_early', 'early@legacy.test', 'Early User')").run();
    db.prepare(
      "INSERT INTO UserMedia (id, userId, mediaType, title, updatedAt) VALUES ('m_early', 'u_early', 'anime', 'Steins;Gate', CURRENT_TIMESTAMP)"
    ).run();

    const validation = validateLegacySchema(db);
    expect(validation.type).toBe("SUPPORTED_LEGACY");
    expect(validation.isCompatible).toBe(true);
    expect(validation.missingOptionalColumns.UserMedia).toContain("tags");
    expect(validation.missingOptionalColumns.UserMedia).toContain("hoursPlayed");
    expect(validation.missingOptionalColumns.UserMedia).toContain("isFavorite");
    expect(validation.missingOptionalColumns.User).toContain("passwordHash");

    // Run migrations
    const result = runMigrations(db, { logger: () => {} });
    expect(result.finalVersion).toBe(LATEST_SCHEMA_VERSION);
    expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);

    // Verify existing data is preserved
    const user = db.prepare("SELECT * FROM User WHERE id = 'u_early'").get() as any;
    expect(user.name).toBe("Early User");

    const media = db.prepare("SELECT * FROM UserMedia WHERE id = 'm_early'").get() as any;
    expect(media.title).toBe("Steins;Gate");
    expect(media.isFavorite).toBe(0);

    // Verify new columns can be written to
    db.prepare(
      "UPDATE UserMedia SET tags = '[\"sci-fi\",\"time-travel\"]', hoursPlayed = 24.5, isFavorite = 1 WHERE id = 'm_early'"
    ).run();

    const updatedMedia = db.prepare("SELECT * FROM UserMedia WHERE id = 'm_early'").get() as any;
    expect(updatedMedia.tags).toBe('["sci-fi","time-travel"]');
    expect(updatedMedia.hoursPlayed).toBe(24.5);
    expect(updatedMedia.isFavorite).toBe(1);

    db.close();
  });

  // 4. Negative test: Missing foreign keys
  it("rejects as UNSUPPORTED and halts safely when required foreign keys are missing", () => {
    const db = new DatabaseSync(dbPath);
    // Baseline tables without foreign keys
    db.exec(`
      CREATE TABLE "User" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "email" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE "UserMedia" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "mediaType" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL
      );
      CREATE TABLE "Collection" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL
      );
      CREATE TABLE "CollectionItem" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "collectionId" TEXT NOT NULL,
        "userMediaId" TEXT NOT NULL,
        "order" INTEGER NOT NULL DEFAULT 0,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    db.prepare("INSERT INTO User VALUES ('u1', 'fk_missing@test.local', CURRENT_TIMESTAMP)").run();

    const validation = validateLegacySchema(db);
    expect(validation.type).toBe("UNSUPPORTED");
    expect(validation.isCompatible).toBe(false);
    expect(validation.reasons.some((r) => r.includes("missing foreign key"))).toBe(true);

    expect(() => {
      runMigrations(db, { logger: () => {} });
    }).toThrowError(MigrationError);

    // Database must remain untouched and user_version remains 0
    expect(getSchemaVersion(db)).toBe(0);
    const user = db.prepare("SELECT * FROM User WHERE id = 'u1'").get() as any;
    expect(user.email).toBe("fk_missing@test.local");

    db.close();
  });

  // 5. Negative test: Missing unique indexes
  it("rejects as UNSUPPORTED when required unique indexes are missing", () => {
    const db = new DatabaseSync(dbPath);
    // Full tables and FKs, but omit User_email_key unique index
    db.exec(`
      CREATE TABLE "User" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "email" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE "UserMedia" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "mediaType" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        CONSTRAINT "UserMedia_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE TABLE "Collection" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        CONSTRAINT "Collection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE TABLE "CollectionItem" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "collectionId" TEXT NOT NULL,
        "userMediaId" TEXT NOT NULL,
        "order" INTEGER NOT NULL DEFAULT 0,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "CollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "CollectionItem_userMediaId_fkey" FOREIGN KEY ("userMediaId") REFERENCES "UserMedia" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      -- Omit unique index on User(email)
    `);

    const validation = validateLegacySchema(db);
    expect(validation.type).toBe("UNSUPPORTED");
    expect(validation.isCompatible).toBe(false);
    expect(validation.reasons.some((r) => r.includes("missing required unique constraint"))).toBe(true);

    expect(() => {
      runMigrations(db, { logger: () => {} });
    }).toThrowError(MigrationError);

    expect(getSchemaVersion(db)).toBe(0);
    db.close();
  });

  // 6. Negative test: Incorrect relational constraints (e.g. ON DELETE SET NULL instead of CASCADE)
  it("rejects as UNSUPPORTED when relational constraints have incorrect cascade rules", () => {
    const db = new DatabaseSync(dbPath);
    // UserMedia has FK to User with ON DELETE SET NULL instead of CASCADE
    db.exec(`
      CREATE TABLE "User" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "email" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE "UserMedia" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "mediaType" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        CONSTRAINT "UserMedia_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
      );
      CREATE TABLE "Collection" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        CONSTRAINT "Collection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE TABLE "CollectionItem" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "collectionId" TEXT NOT NULL,
        "userMediaId" TEXT NOT NULL,
        "order" INTEGER NOT NULL DEFAULT 0,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "CollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "CollectionItem_userMediaId_fkey" FOREIGN KEY ("userMediaId") REFERENCES "UserMedia" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
      CREATE UNIQUE INDEX "CollectionItem_collectionId_userMediaId_key" ON "CollectionItem"("collectionId", "userMediaId");
    `);

    const validation = validateLegacySchema(db);
    expect(validation.type).toBe("UNSUPPORTED");
    expect(validation.isCompatible).toBe(false);
    expect(validation.reasons.some((r) => r.includes("ON DELETE CASCADE"))).toBe(true);

    expect(() => {
      runMigrations(db, { logger: () => {} });
    }).toThrowError(MigrationError);

    expect(getSchemaVersion(db)).toBe(0);
    db.close();
  });

  // 7. Negative test: Incompatible column definitions (e.g. id is not PRIMARY KEY, or title is INTEGER)
  it("rejects as UNSUPPORTED when primary key definitions or required column types are incompatible", () => {
    const db = new DatabaseSync(dbPath);
    // UserMedia id is NOT a primary key, and title is INTEGER
    db.exec(`
      CREATE TABLE "User" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "email" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE "UserMedia" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "mediaType" TEXT NOT NULL,
        "title" INTEGER NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        CONSTRAINT "UserMedia_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE TABLE "Collection" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        CONSTRAINT "Collection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE TABLE "CollectionItem" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "collectionId" TEXT NOT NULL,
        "userMediaId" TEXT NOT NULL,
        "order" INTEGER NOT NULL DEFAULT 0,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "CollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "CollectionItem_userMediaId_fkey" FOREIGN KEY ("userMediaId") REFERENCES "UserMedia" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
      CREATE UNIQUE INDEX "CollectionItem_collectionId_userMediaId_key" ON "CollectionItem"("collectionId", "userMediaId");
    `);

    const validation = validateLegacySchema(db);
    expect(validation.type).toBe("UNSUPPORTED");
    expect(validation.isCompatible).toBe(false);
    expect(validation.reasons.some((r) => r.includes("must be PRIMARY KEY"))).toBe(true);
    expect(validation.reasons.some((r) => r.includes("incompatible type"))).toBe(true);

    expect(() => {
      runMigrations(db, { logger: () => {} });
    }).toThrowError(MigrationError);

    expect(getSchemaVersion(db)).toBe(0);
    db.close();
  });

  // 8. Migration metadata failure-injection: atomicity & transaction rollback
  it("rolls back transaction atomically and leaves user_version unchanged if metadata recording fails", () => {
    const db = new DatabaseSync(dbPath);
    // Create a dummy table that conflicts with _prisma_migrations (e.g. _prisma_migrations as a VIEW or incompatible schema)
    db.exec(`
      CREATE TABLE "_prisma_migrations" (
        "id" INT PRIMARY KEY,
        "unsupported_col" INT NOT NULL
      );
    `);

    // Attempt to run migrations on this database
    expect(() => {
      runMigrations(db, { logger: () => {} });
    }).toThrowError(MigrationError);

    // Verify user_version was NOT updated to 1 because the transaction rolled back
    expect(getSchemaVersion(db)).toBe(0);

    // Verify User table was NOT created due to atomic rollback
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='User'").all();
    expect(tables.length).toBe(0);

    db.close();
  });

  // 9. Negative test: Incorrect status default
  it("rejects as UNSUPPORTED and halts safely when UserMedia.status has an incorrect default", () => {
    const db = new DatabaseSync(dbPath);
    // Baseline tables and FKs, but UserMedia.status default is 'active' instead of 'plan_to_consume'
    db.exec(`
      CREATE TABLE "User" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "email" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE "UserMedia" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "mediaType" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'active',
        "isFavorite" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        CONSTRAINT "UserMedia_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE TABLE "Collection" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        CONSTRAINT "Collection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE TABLE "CollectionItem" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "collectionId" TEXT NOT NULL,
        "userMediaId" TEXT NOT NULL,
        "order" INTEGER NOT NULL DEFAULT 0,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "CollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "CollectionItem_userMediaId_fkey" FOREIGN KEY ("userMediaId") REFERENCES "UserMedia" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
      CREATE UNIQUE INDEX "CollectionItem_collectionId_userMediaId_key" ON "CollectionItem"("collectionId", "userMediaId");
    `);

    // Insert dummy record
    db.prepare("INSERT INTO User (id, email) VALUES ('u_stat', 'status_test@test.local')").run();
    db.prepare("INSERT INTO UserMedia (id, userId, mediaType, title, updatedAt) VALUES ('m_stat', 'u_stat', 'book', 'Dune', CURRENT_TIMESTAMP)").run();

    const validation = validateLegacySchema(db);
    expect(validation.type).toBe("UNSUPPORTED");
    expect(validation.isCompatible).toBe(false);
    expect(validation.reasons.some((r) => r.includes("UserMedia.status") && r.includes("default mismatch"))).toBe(true);

    expect(() => {
      runMigrations(db, { logger: () => {} });
    }).toThrowError(MigrationError);

    // Database remains untouched: user_version is 0 and records are unchanged
    expect(getSchemaVersion(db)).toBe(0);
    const media = db.prepare("SELECT * FROM UserMedia WHERE id = 'm_stat'").get() as any;
    expect(media.status).toBe("active");

    db.close();
  });

  // 10. Negative test: Incorrect isFavorite default
  it("rejects as UNSUPPORTED and halts safely when UserMedia.isFavorite has an incorrect default (e.g. 1 / true)", () => {
    const db = new DatabaseSync(dbPath);
    // Baseline tables and FKs, but UserMedia.isFavorite default is 1 (true) instead of 0 (false)
    db.exec(`
      CREATE TABLE "User" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "email" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE "UserMedia" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "mediaType" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'plan_to_consume',
        "isFavorite" BOOLEAN NOT NULL DEFAULT 1,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        CONSTRAINT "UserMedia_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE TABLE "Collection" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        CONSTRAINT "Collection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE TABLE "CollectionItem" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "collectionId" TEXT NOT NULL,
        "userMediaId" TEXT NOT NULL,
        "order" INTEGER NOT NULL DEFAULT 0,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "CollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "CollectionItem_userMediaId_fkey" FOREIGN KEY ("userMediaId") REFERENCES "UserMedia" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
      CREATE UNIQUE INDEX "CollectionItem_collectionId_userMediaId_key" ON "CollectionItem"("collectionId", "userMediaId");
    `);

    db.prepare("INSERT INTO User (id, email) VALUES ('u_fav', 'fav_test@test.local')").run();
    db.prepare("INSERT INTO UserMedia (id, userId, mediaType, title, updatedAt) VALUES ('m_fav', 'u_fav', 'game', 'Hades', CURRENT_TIMESTAMP)").run();

    const validation = validateLegacySchema(db);
    expect(validation.type).toBe("UNSUPPORTED");
    expect(validation.isCompatible).toBe(false);
    expect(validation.reasons.some((r) => r.includes("UserMedia.isFavorite") && r.includes("default mismatch"))).toBe(true);

    expect(() => {
      runMigrations(db, { logger: () => {} });
    }).toThrowError(MigrationError);

    // Database remains untouched
    expect(getSchemaVersion(db)).toBe(0);
    const media = db.prepare("SELECT * FROM UserMedia WHERE id = 'm_fav'").get() as any;
    expect(media.isFavorite).toBe(1);

    db.close();
  });

  // 11. Negative test: Incorrect CollectionItem.order default
  it("rejects as UNSUPPORTED and halts safely when CollectionItem.order has an incorrect default (e.g. 1 instead of 0)", () => {
    const db = new DatabaseSync(dbPath);
    // Baseline tables and FKs, but CollectionItem.order default is 1 instead of 0
    db.exec(`
      CREATE TABLE "User" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "email" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE "UserMedia" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "mediaType" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'plan_to_consume',
        "isFavorite" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        CONSTRAINT "UserMedia_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE TABLE "Collection" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        CONSTRAINT "Collection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE TABLE "CollectionItem" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "collectionId" TEXT NOT NULL,
        "userMediaId" TEXT NOT NULL,
        "order" INTEGER NOT NULL DEFAULT 1,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "CollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "CollectionItem_userMediaId_fkey" FOREIGN KEY ("userMediaId") REFERENCES "UserMedia" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
      CREATE UNIQUE INDEX "CollectionItem_collectionId_userMediaId_key" ON "CollectionItem"("collectionId", "userMediaId");
    `);

    db.prepare("INSERT INTO User (id, email) VALUES ('u_ord', 'order_test@test.local')").run();
    db.prepare("INSERT INTO UserMedia (id, userId, mediaType, title, updatedAt) VALUES ('m_ord', 'u_ord', 'movie', 'Interstellar', CURRENT_TIMESTAMP)").run();
    db.prepare("INSERT INTO Collection (id, userId, name, updatedAt) VALUES ('c_ord', 'u_ord', 'Sci-Fi', CURRENT_TIMESTAMP)").run();
    db.prepare("INSERT INTO CollectionItem (id, collectionId, userMediaId) VALUES ('ci_ord', 'c_ord', 'm_ord')").run();

    const validation = validateLegacySchema(db);
    expect(validation.type).toBe("UNSUPPORTED");
    expect(validation.isCompatible).toBe(false);
    expect(validation.reasons.some((r) => r.includes("CollectionItem.order") && r.includes("default mismatch"))).toBe(true);

    expect(() => {
      runMigrations(db, { logger: () => {} });
    }).toThrowError(MigrationError);

    // Database remains untouched
    expect(getSchemaVersion(db)).toBe(0);
    const item = db.prepare("SELECT * FROM CollectionItem WHERE id = 'ci_ord'").get() as any;
    expect(item.order).toBe(1);

    db.close();
  });

  // 12. Negative test: Optional column incorrectly declared nullable
  it("rejects as UNSUPPORTED when an optional column that must be NOT NULL is declared nullable", () => {
    const db = new DatabaseSync(dbPath);
    // UserMedia.isFavorite is present but declared nullable (missing NOT NULL)
    db.exec(`
      CREATE TABLE "User" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "email" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE "UserMedia" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "mediaType" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'plan_to_consume',
        "isFavorite" BOOLEAN DEFAULT false,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        CONSTRAINT "UserMedia_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE TABLE "Collection" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        CONSTRAINT "Collection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE TABLE "CollectionItem" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "collectionId" TEXT NOT NULL,
        "userMediaId" TEXT NOT NULL,
        "order" INTEGER NOT NULL DEFAULT 0,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "CollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "CollectionItem_userMediaId_fkey" FOREIGN KEY ("userMediaId") REFERENCES "UserMedia" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
      CREATE UNIQUE INDEX "CollectionItem_collectionId_userMediaId_key" ON "CollectionItem"("collectionId", "userMediaId");
    `);

    db.prepare("INSERT INTO User (id, email) VALUES ('u_null', 'null_test@test.local')").run();
    db.prepare("INSERT INTO UserMedia (id, userId, mediaType, title, isFavorite, updatedAt) VALUES ('m_null', 'u_null', 'movie', 'Arrival', NULL, CURRENT_TIMESTAMP)").run();

    const validation = validateLegacySchema(db);
    expect(validation.type).toBe("UNSUPPORTED");
    expect(validation.isCompatible).toBe(false);
    expect(validation.reasons.some((r) => r.includes("UserMedia.isFavorite") && r.includes("must be NOT NULL"))).toBe(true);

    expect(() => {
      runMigrations(db, { logger: () => {} });
    }).toThrowError(MigrationError);

    // Database remains untouched
    expect(getSchemaVersion(db)).toBe(0);
    const media = db.prepare("SELECT * FROM UserMedia WHERE id = 'm_null'").get() as any;
    expect(media.isFavorite).toBeNull();

    db.close();
  });

  // 13. Negative test: Optional column incorrectly declared NOT NULL
  it("rejects as UNSUPPORTED when an optional column that must be nullable is declared NOT NULL", () => {
    const db = new DatabaseSync(dbPath);
    // UserMedia.rating is declared NOT NULL, but baseline requires it to be nullable
    db.exec(`
      CREATE TABLE "User" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "email" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE "UserMedia" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "mediaType" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "rating" REAL NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'plan_to_consume',
        "isFavorite" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        CONSTRAINT "UserMedia_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE TABLE "Collection" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        CONSTRAINT "Collection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE TABLE "CollectionItem" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "collectionId" TEXT NOT NULL,
        "userMediaId" TEXT NOT NULL,
        "order" INTEGER NOT NULL DEFAULT 0,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "CollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "CollectionItem_userMediaId_fkey" FOREIGN KEY ("userMediaId") REFERENCES "UserMedia" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
      CREATE UNIQUE INDEX "CollectionItem_collectionId_userMediaId_key" ON "CollectionItem"("collectionId", "userMediaId");
    `);

    db.prepare("INSERT INTO User (id, email) VALUES ('u_notnull', 'notnull_test@test.local')").run();
    db.prepare("INSERT INTO UserMedia (id, userId, mediaType, title, rating, updatedAt) VALUES ('m_notnull', 'u_notnull', 'tv', 'Dark', 9.5, CURRENT_TIMESTAMP)").run();

    const validation = validateLegacySchema(db);
    expect(validation.type).toBe("UNSUPPORTED");
    expect(validation.isCompatible).toBe(false);
    expect(validation.reasons.some((r) => r.includes("UserMedia.rating") && r.includes("must be nullable"))).toBe(true);

    expect(() => {
      runMigrations(db, { logger: () => {} });
    }).toThrowError(MigrationError);

    // Database remains untouched
    expect(getSchemaVersion(db)).toBe(0);
    const media = db.prepare("SELECT * FROM UserMedia WHERE id = 'm_notnull'").get() as any;
    expect(media.rating).toBe(9.5);

    db.close();
  });

  // 14. Valid supported legacy schema that legitimately omits optional columns remains upgradeable
  it("detects and upgrades a supported legacy schema omitting optional status, order, and other non-breaking columns", () => {
    const db = new DatabaseSync(dbPath);
    // Legacy schema with core required fields, valid FKs, and unique index on email,
    // but legitimately omitting optional columns (UserMedia.status, isFavorite, rating, CollectionItem.order, etc.)
    db.exec(`
      CREATE TABLE "User" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT,
        "email" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE "UserMedia" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "mediaType" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        CONSTRAINT "UserMedia_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE TABLE "Collection" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        CONSTRAINT "Collection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE TABLE "CollectionItem" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "collectionId" TEXT NOT NULL,
        "userMediaId" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "CollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "CollectionItem_userMediaId_fkey" FOREIGN KEY ("userMediaId") REFERENCES "UserMedia" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
      CREATE UNIQUE INDEX "CollectionItem_collectionId_userMediaId_key" ON "CollectionItem"("collectionId", "userMediaId");
    `);

    // Pre-populate records
    db.prepare("INSERT INTO User (id, email, name) VALUES ('u_upg', 'upgradeable@test.local', 'Upgradeable User')").run();
    db.prepare("INSERT INTO UserMedia (id, userId, mediaType, title, updatedAt) VALUES ('m_upg', 'u_upg', 'anime', 'Frieren', CURRENT_TIMESTAMP)").run();
    db.prepare("INSERT INTO Collection (id, userId, name, updatedAt) VALUES ('c_upg', 'u_upg', 'Anime List', CURRENT_TIMESTAMP)").run();
    db.prepare("INSERT INTO CollectionItem (id, collectionId, userMediaId) VALUES ('ci_upg', 'c_upg', 'm_upg')").run();

    // Verify SUPPORTED_LEGACY classification
    const validation = validateLegacySchema(db);
    expect(validation.type).toBe("SUPPORTED_LEGACY");
    expect(validation.isCompatible).toBe(true);
    expect(validation.missingOptionalColumns.UserMedia).toContain("status");
    expect(validation.missingOptionalColumns.UserMedia).toContain("isFavorite");
    expect(validation.missingOptionalColumns.CollectionItem).toContain("order");

    // Execute migration runner
    const result = runMigrations(db, { logger: () => {} });
    expect(result.initialVersion).toBe(0);
    expect(result.finalVersion).toBe(LATEST_SCHEMA_VERSION);
    expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);

    // Verify existing records are 100% intact
    const user = db.prepare("SELECT * FROM User WHERE id = 'u_upg'").get() as any;
    expect(user.name).toBe("Upgradeable User");
    expect(user.email).toBe("upgradeable@test.local");

    const media = db.prepare("SELECT * FROM UserMedia WHERE id = 'm_upg'").get() as any;
    expect(media.title).toBe("Frieren");
    expect(media.status).toBe("plan_to_consume"); // Safe default added by upgrade
    expect(media.isFavorite).toBe(0); // Safe default added by upgrade

    const item = db.prepare("SELECT * FROM CollectionItem WHERE id = 'ci_upg'").get() as any;
    expect(item.order).toBe(0); // Safe default added by upgrade

    // Verify new columns can be mutated cleanly
    db.prepare("UPDATE UserMedia SET status = 'completed', rating = 10, isFavorite = 1 WHERE id = 'm_upg'").run();
    const updatedMedia = db.prepare("SELECT * FROM UserMedia WHERE id = 'm_upg'").get() as any;
    expect(updatedMedia.status).toBe("completed");
    expect(updatedMedia.rating).toBe(10);
    expect(updatedMedia.isFavorite).toBe(1);

    // Integrity check
    const integrity = db.prepare("PRAGMA integrity_check").all() as any[];
    expect(integrity[0].integrity_check).toBe("ok");

    db.close();
  });

  // 15. Unit tests for SQLite default representation equivalence
  it("correctly identifies SQLite equivalent defaults across booleans, numbers, strings, and expressions", () => {
    // Strings
    expect(areDefaultsEquivalent("'plan_to_consume'", "'plan_to_consume'")).toBe(true);
    expect(areDefaultsEquivalent("'plan_to_consume'", "('plan_to_consume')")).toBe(true);
    expect(areDefaultsEquivalent("'plan_to_consume'", "plan_to_consume")).toBe(true);
    expect(areDefaultsEquivalent("'plan_to_consume'", "'active'")).toBe(false);
    expect(areDefaultsEquivalent("'plan_to_consume'", null)).toBe(false);

    // Booleans
    expect(areDefaultsEquivalent("0", "false")).toBe(true);
    expect(areDefaultsEquivalent("0", "'false'")).toBe(true);
    expect(areDefaultsEquivalent("0", "0")).toBe(true);
    expect(areDefaultsEquivalent("0", "'0'")).toBe(true);
    expect(areDefaultsEquivalent("0", "(0)")).toBe(true);
    expect(areDefaultsEquivalent("0", "(false)")).toBe(true);
    expect(areDefaultsEquivalent("0", "1")).toBe(false);
    expect(areDefaultsEquivalent("0", "true")).toBe(false);
    expect(areDefaultsEquivalent("0", null)).toBe(false);

    // Integers
    expect(areDefaultsEquivalent("0", "0")).toBe(true);
    expect(areDefaultsEquivalent("0", 0)).toBe(true);
    expect(areDefaultsEquivalent("0", "(0)")).toBe(true);
    expect(areDefaultsEquivalent("0", "1")).toBe(false);
    expect(areDefaultsEquivalent("0", 1)).toBe(false);
    expect(areDefaultsEquivalent("0", null)).toBe(false);

    // Timestamps
    expect(areDefaultsEquivalent("CURRENT_TIMESTAMP", "CURRENT_TIMESTAMP")).toBe(true);
    expect(areDefaultsEquivalent("CURRENT_TIMESTAMP", "datetime('now')")).toBe(true);
    expect(areDefaultsEquivalent("CURRENT_TIMESTAMP", "(CURRENT_TIMESTAMP)")).toBe(true);

    // Normalizer directly
    expect(normalizeDefaultValue("((0))")).toBe("0");
    expect(normalizeDefaultValue("'custom'")).toBe("custom");
    expect(normalizeDefaultValue(null)).toBeNull();
  });
});

