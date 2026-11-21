/**
 * MLocker Versioned Database Migrations Registry
 * Single-source migration definitions synchronized with prisma/migrations.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/**
 * Resolves the canonical Prisma migration SQL file from filesystem.
 * Handles development, test, and packaged Electron environments.
 */
function resolveMigrationSql(migrationName) {
  const candidatePaths = [
    // 1. Development and vitest test environment (relative to this file)
    path.resolve(__dirname, "../../prisma/migrations", migrationName, "migration.sql"),
    // 2. Relative to process.cwd()
    path.resolve(process.cwd(), "prisma/migrations", migrationName, "migration.sql"),
    // 3. Packaged Electron resources directory
    typeof process.resourcesPath === "string"
      ? path.join(process.resourcesPath, "prisma/migrations", migrationName, "migration.sql")
      : null,
  ].filter(Boolean);

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      try {
        const content = fs.readFileSync(candidate, "utf8");
        // Normalize CRLF to LF for deterministic cross-platform checksums
        return content.replace(/\r\n/g, "\n");
      } catch {}
    }
  }

  // Canonical fallback identical byte-for-byte to prisma/migrations/20261119000000_init/migration.sql
  if (migrationName === "20261119000000_init") {
    return CANONICAL_INIT_SQL;
  }

  // Canonical fallback identical byte-for-byte to prisma/migrations/20261120000000_media_source/migration.sql
  if (migrationName === "20261120000000_media_source") {
    return CANONICAL_MEDIA_SOURCE_SQL;
  }

  // Canonical fallback identical byte-for-byte to prisma/migrations/20261121000000_session_engine/migration.sql
  if (migrationName === "20261121000000_session_engine") {
    return CANONICAL_SESSION_ENGINE_SQL;
  }

  throw new Error(`Migration SQL file not found for migration: ${migrationName}`);
}

/**
 * Canonical DDL matching prisma/migrations/20261119000000_init/migration.sql byte-for-byte.
 * Note: "updatedAt" is DATETIME NOT NULL (Prisma runtime sets timestamp on inserts/updates).
 */
const CANONICAL_INIT_SQL = `-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "image" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
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

-- CreateTable
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

-- CreateTable
CREATE TABLE "CollectionItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "collectionId" TEXT NOT NULL,
    "userMediaId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CollectionItem_userMediaId_fkey" FOREIGN KEY ("userMediaId") REFERENCES "UserMedia" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "UserMedia_userId_mediaType_idx" ON "UserMedia"("userId", "mediaType");

-- CreateIndex
CREATE INDEX "UserMedia_userId_status_idx" ON "UserMedia"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "UserMedia_userId_mediaType_externalId_key" ON "UserMedia"("userId", "mediaType", "externalId");

-- CreateIndex
CREATE INDEX "Collection_userId_idx" ON "Collection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionItem_collectionId_userMediaId_key" ON "CollectionItem"("collectionId", "userMediaId");
`;

/**
 * Canonical DDL matching prisma/migrations/20261120000000_media_source/migration.sql byte-for-byte.
 */
const CANONICAL_MEDIA_SOURCE_SQL = `-- CreateTable
CREATE TABLE "MediaSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userMediaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "normalizedDomain" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'web',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MediaSource_userMediaId_fkey" FOREIGN KEY ("userMediaId") REFERENCES "UserMedia" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MediaSource_userMediaId_idx" ON "MediaSource"("userMediaId");

-- CreateIndex
CREATE INDEX "MediaSource_normalizedDomain_idx" ON "MediaSource"("normalizedDomain");
`;

/**
 * Canonical DDL matching prisma/migrations/20261121000000_session_engine/migration.sql byte-for-byte.
 */
const CANONICAL_SESSION_ENGINE_SQL = `-- AlterTable User: Add trackingPreferences column
ALTER TABLE "User" ADD COLUMN "trackingPreferences" TEXT;

-- CreateIndex on UserMedia for Composite Foreign Key target
CREATE UNIQUE INDEX IF NOT EXISTS "UserMedia_id_userId_key" ON "UserMedia"("id", "userId");

-- CreateTable ActivitySession
CREATE TABLE "ActivitySession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "userMediaId" TEXT NOT NULL,
    "sourceId" TEXT,
    "startedAt" DATETIME NOT NULL,
    "endedAt" DATETIME,
    "lastHeartbeatAt" DATETIME,
    "activeSeconds" INTEGER NOT NULL DEFAULT 0,
    "lastSequenceNumber" INTEGER NOT NULL DEFAULT 0,
    "lastClientNonce" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'web',
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "closeReason" TEXT,
    "notes" TEXT,
    "progressStart" INTEGER,
    "progressEnd" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ActivitySession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ActivitySession_userMediaId_userId_fkey" FOREIGN KEY ("userMediaId", "userId") REFERENCES "UserMedia" ("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ActivitySession_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "MediaSource" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex on ActivitySession for 3-Column Composite Foreign Key target
CREATE UNIQUE INDEX "ActivitySession_id_userId_userMediaId_key" ON "ActivitySession"("id", "userId", "userMediaId");

-- CreateIndexes on ActivitySession
CREATE INDEX "ActivitySession_userId_userMediaId_idx" ON "ActivitySession"("userId", "userMediaId");
CREATE INDEX "ActivitySession_userId_startedAt_idx" ON "ActivitySession"("userId", "startedAt");
CREATE INDEX "ActivitySession_userMediaId_idx" ON "ActivitySession"("userMediaId");
CREATE INDEX "ActivitySession_status_idx" ON "ActivitySession"("status");

-- CreateTable ActivityEvent
CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "userMediaId" TEXT NOT NULL,
    "clientNonce" TEXT NOT NULL,
    "eventType" TEXT NOT NULL DEFAULT 'HEARTBEAT',
    "sequenceNumber" INTEGER,
    "durationSeconds" INTEGER NOT NULL DEFAULT 15,
    "isFocused" BOOLEAN NOT NULL DEFAULT true,
    "timestamp" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ActivityEvent_sessionId_userId_userMediaId_fkey" FOREIGN KEY ("sessionId", "userId", "userMediaId") REFERENCES "ActivitySession" ("id", "userId", "userMediaId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ActivityEvent_userMediaId_userId_fkey" FOREIGN KEY ("userMediaId", "userId") REFERENCES "UserMedia" ("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndexes on ActivityEvent
CREATE UNIQUE INDEX "ActivityEvent_userId_clientNonce_key" ON "ActivityEvent"("userId", "clientNonce");
CREATE INDEX "ActivityEvent_userId_userMediaId_idx" ON "ActivityEvent"("userId", "userMediaId");
CREATE INDEX "ActivityEvent_sessionId_idx" ON "ActivityEvent"("sessionId");
CREATE INDEX "ActivityEvent_timestamp_idx" ON "ActivityEvent"("timestamp");

-- Immutability Trigger for ActivityEvent (SQLite)
CREATE TRIGGER IF NOT EXISTS "trg_activityevent_prevent_update"
BEFORE UPDATE ON "ActivityEvent"
FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'ActivityEvent rows are immutable and cannot be updated');
END;
`;

/**
 * Calculates deterministic SHA-256 checksum matching Prisma CLI format.
 */
function getMigrationChecksum(sqlContent) {
  const normalized = sqlContent.replace(/\r\n/g, "\n");
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

const INIT_MIGRATION_SQL = resolveMigrationSql("20261119000000_init");
const INIT_MIGRATION_CHECKSUM = getMigrationChecksum(INIT_MIGRATION_SQL);

const MEDIA_SOURCE_MIGRATION_SQL = resolveMigrationSql("20261120000000_media_source");
const MEDIA_SOURCE_MIGRATION_CHECKSUM = getMigrationChecksum(MEDIA_SOURCE_MIGRATION_SQL);

const SESSION_ENGINE_MIGRATION_SQL = resolveMigrationSql("20261121000000_session_engine");
const SESSION_ENGINE_MIGRATION_CHECKSUM = getMigrationChecksum(SESSION_ENGINE_MIGRATION_SQL);

/**
 * Ordered registry of migrations.
 */
const MIGRATIONS = [
  {
    version: 1,
    name: "20261119000000_init",
    sql: INIT_MIGRATION_SQL,
    checksum: INIT_MIGRATION_CHECKSUM,
  },
  {
    version: 2,
    name: "20261120000000_media_source",
    sql: MEDIA_SOURCE_MIGRATION_SQL,
    checksum: MEDIA_SOURCE_MIGRATION_CHECKSUM,
  },
  {
    version: 3,
    name: "20261121000000_session_engine",
    sql: SESSION_ENGINE_MIGRATION_SQL,
    checksum: SESSION_ENGINE_MIGRATION_CHECKSUM,
  },
];

const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

module.exports = {
  MIGRATIONS,
  LATEST_SCHEMA_VERSION,
  INIT_MIGRATION_SQL,
  INIT_MIGRATION_CHECKSUM,
  MEDIA_SOURCE_MIGRATION_SQL,
  MEDIA_SOURCE_MIGRATION_CHECKSUM,
  SESSION_ENGINE_MIGRATION_SQL,
  SESSION_ENGINE_MIGRATION_CHECKSUM,
  resolveMigrationSql,
  getMigrationChecksum,
};
