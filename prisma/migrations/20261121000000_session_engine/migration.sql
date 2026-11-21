-- AlterTable User: Add trackingPreferences column
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
