---
name: prisma-electron-database
description: Database architecture, Prisma schema lifecycle, SQLite desktop provisioning, and cloud PostgreSQL management for MLocker.
---

# MLocker Prisma & Electron Database Skill

## 1. Dual-Database Paradigm

MLocker uses Prisma ORM across two runtime environments:
1. **Desktop Client:** SQLite database embedded in the user's local operating system directory.
2. **Cloud Backend:** Managed PostgreSQL database accessed through Next.js server runtime.

```
┌─────────────────────────────────┐       ┌─────────────────────────────────┐
│     Electron (Local Desktop)    │       │        Next.js (Web/Cloud)      │
│  - Engine: SQLite               │       │  - Engine: PostgreSQL           │
│  - Storage: app.getPath(...)    │       │  - Storage: Cloud Host          │
│  - Connection: file:mlocker.db  │       │  - Connection: postgresql://... │
└─────────────────────────────────┘       └─────────────────────────────────┘
```

> [!IMPORTANT]
> Never synchronize SQLite binary `.db` files across machines or cloud instances. Synchronize records logically through the MLocker JSON sync journal.

---

## 2. Desktop Database Provisioning (Clean Installation)

In packaged Electron distributions, `node_modules` and the Prisma CLI (`npx prisma migrate`) are unavailable at runtime. The desktop main process must handle database initialization safely.

### 2.1 File Location
Always place the desktop database within the OS user-data directory:
```javascript
import { app } from 'electron';
import path from 'path';

export function getDatabasePath() {
  const userDataDir = app.getPath('userData');
  return path.join(userDataDir, 'mlocker-local.db');
}

export function getDatabaseUrl() {
  const dbPath = getDatabasePath().replace(/\\/g, '/');
  return `file:${dbPath}`;
}
```

### 2.2 First-Run Schema Initialization
To initialize or upgrade the database without Prisma CLI in production:
1. Maintain versioned migration SQL scripts or an initialization DDL in a designated migrations directory (`prisma/migrations/` or bundled assets).
2. On startup, check `PRAGMA user_version` in SQLite.
3. If version is 0 (new installation) or lower than target version, run sequential migration statements inside a single transaction.
4. Update `PRAGMA user_version = <latest_version>` upon successful transaction completion.

---

## 3. Schema Architecture

### 3.1 Core Entity Definitions
```prisma
// Example structural models

enum MediaType {
  MOVIE
  TV_SHOW
  ANIME
  MANGA
  GAME
  BOOK
}

enum MediaStatus {
  PLANNING
  ACTIVE
  COMPLETED
  PAUSED
  DROPPED
}

enum SyncStatus {
  PENDING
  SYNCED
  CONFLICT
}

model MediaItem {
  id              String         @id @default(uuid())
  userId          String
  title           String
  category        MediaType
  status          MediaStatus    @default(PLANNING)
  rating          Int?           // Scaled integer (0-100)
  progress        Int            @default(0)
  totalUnits      Int?
  notes           String?
  metadata        String?        // JSON stringified category-specific attributes
  externalUrl     String?
  version         Int            @default(1)
  deletedAt       DateTime?      // Soft delete for sync tombstone
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  collections     CollectionItem[]
  sessions        ActivitySession[]
  sources         ExternalSource[]

  @@index([userId, category])
  @@index([userId, updatedAt])
}

model Collection {
  id              String           @id @default(uuid())
  userId          String
  name            String
  description     String?
  isPublic        Boolean          @default(false)
  deletedAt       DateTime?
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt

  items           CollectionItem[]

  @@index([userId])
}

model CollectionItem {
  id              String     @id @default(uuid())
  collectionId    String
  mediaItemId     String
  orderIndex      Int        @default(0)
  createdAt       DateTime   @default(now())

  collection      Collection @relation(fields: [collectionId], references: [id], onDelete: Cascade)
  mediaItem       MediaItem  @relation(fields: [mediaItemId], references: [id], onDelete: Cascade)

  @@unique([collectionId, mediaItemId])
}

model ActivitySession {
  id              String      @id @default(uuid())
  userId          String
  mediaItemId     String
  startedAt       DateTime
  endedAt         DateTime
  activeSeconds   Int         // Confirmed active duration (excluding idle)
  sourceType      String      // e.g., 'MANUAL', 'EXTENSION_CHROME'
  syncStatus      SyncStatus  @default(PENDING)
  createdAt       DateTime    @default(now())

  mediaItem       MediaItem   @relation(fields: [mediaItemId], references: [id], onDelete: Cascade)

  @@index([userId, startedAt])
}

model ExternalSource {
  id              String      @id @default(uuid())
  userId          String
  mediaItemId     String
  domainPattern   String      // e.g., 'crunchyroll.com/watch/*'
  label           String
  createdAt       DateTime    @default(now())

  mediaItem       MediaItem   @relation(fields: [mediaItemId], references: [id], onDelete: Cascade)

  @@index([userId, domainPattern])
}
```

---

## 4. Query Performance & Aggregation Rules

1. **Avoid In-Memory Stats Calculations:** Compute aggregate counts, total watch hours, and category progress using Prisma `aggregate` and `groupBy` queries directly on SQLite/PostgreSQL instead of loading thousands of rows into client memory.
2. **Compound Indexing:** Ensure every model accessed in user queries has compound indices covering `[userId, <filterField>]` and `[userId, updatedAt]` to ensure fast synchronization queries.
3. **Soft Deletions (Tombstones):** Records marked with `deletedAt != null` must be excluded from default queries using Prisma middleware or explicit `where: { deletedAt: null }` filters, while retaining the deletion timestamp for incremental sync queries.
