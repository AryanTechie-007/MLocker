/**
 * MLocker Versioned Database Migrations Registry
 * Zero-CLI migration definitions for Electron and runtime initialization.
 */

const fs = require("fs");
const path = require("path");

const INIT_MIGRATION_SQL = `-- CreateTable
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "image" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "UserMedia" (
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
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserMedia_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Collection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "coverUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Collection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CollectionItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "collectionId" TEXT NOT NULL,
    "userMediaId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CollectionItem_userMediaId_fkey" FOREIGN KEY ("userMediaId") REFERENCES "UserMedia" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserMedia_userId_mediaType_idx" ON "UserMedia"("userId", "mediaType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserMedia_userId_status_idx" ON "UserMedia"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "UserMedia_userId_mediaType_externalId_key" ON "UserMedia"("userId", "mediaType", "externalId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Collection_userId_idx" ON "Collection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CollectionItem_collectionId_userMediaId_key" ON "CollectionItem"("collectionId", "userMediaId");
`;

/**
 * Ordered list of migrations.
 * Each entry must contain:
 * - version: integer (target PRAGMA user_version)
 * - name: descriptive migration identifier
 * - up: SQL string or async/sync function (db)
 */
const MIGRATIONS = [
  {
    version: 1,
    name: "20261119000000_init",
    sql: INIT_MIGRATION_SQL,
  },
];

const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

module.exports = {
  MIGRATIONS,
  LATEST_SCHEMA_VERSION,
  INIT_MIGRATION_SQL,
};
