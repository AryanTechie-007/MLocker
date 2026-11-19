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
} from "../../electron/database/migrator";
import {
  inspectDatabaseSchema,
  validateLegacySchema,
} from "../../electron/database/schema-validator";
import { initializeDatabase } from "../../electron/database/lifecycle";

describe("Milestone 2.1 — Legacy Database Compatibility Suite", () => {
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

  // 1. Fresh database detection
  it("detects a fresh database with 0 user tables as FRESH", () => {
    const db = new DatabaseSync(dbPath);
    const validation = validateLegacySchema(db);
    expect(validation.type).toBe("FRESH");
    expect(validation.isCompatible).toBe(true);
    db.close();
  });

  // 2. Exact baseline legacy database (user_version = 0, full v1 schema)
  it("safely baselines an existing database with complete v1 schema and user_version = 0, preserving all records", () => {
    const db = new DatabaseSync(dbPath);
    // Build legacy database with user_version = 0
    const rawBaselineSql = `
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
        "updatedAt" DATETIME NOT NULL
      );
      CREATE TABLE "Collection" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "description" TEXT,
        "coverUrl" TEXT,
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
    `;
    db.exec(rawBaselineSql);

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

    // Now run migration runner on this existing database
    const dbToMigrate = new DatabaseSync(dbPath);
    const result = runMigrations(dbToMigrate, { logger: () => {} });

    expect(result.initialVersion).toBe(0);
    expect(result.finalVersion).toBe(1);
    expect(getSchemaVersion(dbToMigrate)).toBe(1);

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

  // 3. Supported legacy database (early prototype schema missing optional columns)
  it("detects and upgrades a supported legacy schema with missing optional columns, preserving existing records", () => {
    const db = new DatabaseSync(dbPath);
    // Legacy schema missing tags, hoursPlayed, isFavorite, review on UserMedia; missing passwordHash on User
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
    expect(result.finalVersion).toBe(1);
    expect(getSchemaVersion(db)).toBe(1);

    // Verify existing data is preserved
    const user = db.prepare("SELECT * FROM User WHERE id = 'u_early'").get() as any;
    expect(user.name).toBe("Early User");

    const media = db.prepare("SELECT * FROM UserMedia WHERE id = 'm_early'").get() as any;
    expect(media.title).toBe("Steins;Gate");
    expect(media.isFavorite).toBe(0); // Default applied

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

  // 4. Unsupported legacy database: missing core tables
  it("stops safely and refuses to migrate when an incompatible schema with missing core tables is encountered", () => {
    const db = new DatabaseSync(dbPath);
    // Arbitrary incompatible tables
    db.exec(`
      CREATE TABLE "BlogPosts" (
        "id" TEXT PRIMARY KEY,
        "content" TEXT
      );
      CREATE TABLE "Comments" (
        "id" TEXT PRIMARY KEY,
        "postId" TEXT
      );
    `);
    db.prepare("INSERT INTO BlogPosts (id, content) VALUES ('p1', 'Hello world')").run();

    const validation = validateLegacySchema(db);
    expect(validation.type).toBe("UNSUPPORTED");
    expect(validation.isCompatible).toBe(false);

    expect(() => {
      runMigrations(db, { logger: () => {} });
    }).toThrowError(MigrationError);

    // user_version must remain 0
    expect(getSchemaVersion(db)).toBe(0);

    // Original data must remain untouched
    const post = db.prepare("SELECT * FROM BlogPosts WHERE id = 'p1'").get() as any;
    expect(post.content).toBe("Hello world");

    db.close();
  });

  // 5. Unsupported legacy database: missing required non-nullable columns
  it("stops safely when core tables exist but lack critical non-nullable columns without defaults", () => {
    const db = new DatabaseSync(dbPath);
    // UserMedia exists but lacks userId (critical relational column)
    db.exec(`
      CREATE TABLE "User" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "email" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE "UserMedia" (
        "id" TEXT NOT NULL PRIMARY KEY,
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
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const validation = validateLegacySchema(db);
    expect(validation.type).toBe("UNSUPPORTED");
    expect(validation.missingRequiredColumns.UserMedia).toContain("userId");

    expect(() => {
      runMigrations(db, { logger: () => {} });
    }).toThrowError(MigrationError);

    expect(getSchemaVersion(db)).toBe(0);
    db.close();
  });
});
