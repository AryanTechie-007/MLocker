-- CreateTable
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
