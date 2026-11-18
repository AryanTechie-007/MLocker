---
name: mlocker-sync-engineering
description: Local-first data synchronization, change journal protocols, conflict resolution strategies, and offline queue management for MLocker.
---

# MLocker Sync Engineering Skill

## 1. Local-First Philosophy

MLocker Desktop is designed to be **offline-first and local-first**:
1. All user actions (creating items, logging sessions, modifying collections) write immediately to the local SQLite database.
2. The user experience is never blocked on network requests.
3. When network connectivity is available, an incremental synchronization engine propagates changes to and from the cloud PostgreSQL instance.
4. **Never sync raw SQLite files.** Always sync logical JSON change sets over authenticated REST endpoints.

---

## 2. Sync Protocol Architecture

```
┌─────────────────────────────────┐
│     Local SQLite (Desktop)      │
│  - MediaItem, Session, etc.     │
│  - SyncJournal (Pending queue)  │
└────────────────┬────────────────┘
                 │
                 │ 1. Push: POST /api/sync/push { clientChanges: [...] }
                 ▼
┌─────────────────────────────────┐
│      Next.js Cloud Backend      │
│  - Verify JWT session & tenant  │
│  - Reconcile changes (LWW)      │
│  - Apply to Cloud PostgreSQL    │
│  - Return server cursor/acks    │
└────────────────┬────────────────┘
                 │
                 │ 2. Pull: GET /api/sync/pull?since=<cursor>
                 ▼
┌─────────────────────────────────┐
│      Apply Remote Changes       │
│  - Insert / Update local DB     │
│  - Mark local records as SYNCED │
│  - Advance local sync cursor    │
└─────────────────────────────────┘
```

---

## 3. Change Journal & Mutation Tracking

To support incremental synchronization without scanning entire tables, all mutating operations log a record in `SyncJournal`:

```prisma
model SyncJournal {
  id            String    @id @default(uuid())
  entityType    String    // e.g. 'MEDIA_ITEM', 'COLLECTION', 'SESSION'
  entityId      String
  action        String    // 'CREATE', 'UPDATE', 'DELETE'
  payload       String    // Serialized entity snapshot or diff
  version       Int
  createdAt     DateTime  @default(now())
  syncedAt      DateTime? // Null if pending upload
  
  @@index([syncedAt, createdAt])
}
```

### 3.1 Tombstones for Deletions
Hard deletions break synchronization because deleted rows leave no trace for other clients.
- Any entity deletion must be recorded as a soft-delete: `deletedAt = DateTime.now()`.
- The soft deletion propagates across the sync protocol with `action: 'DELETE'`.
- Deletions are retained as tombstones until all authorized client devices have acknowledged receipt past the tombstone timestamp.

---

## 4. Conflict Resolution (Last-Write-Wins with Entity Granularity)

When the same record is modified on multiple clients while offline:
1. **Timestamp & Version Verification:**
   - Every mutable entity has `version: Int` and `updatedAt: DateTime`.
   - The cloud server compares incoming `updatedAt` with the existing server record.
2. **Resolution Rules:**
   - If `incoming.updatedAt > server.updatedAt`, the incoming change is accepted and the server record is updated.
   - If `incoming.updatedAt < server.updatedAt`, the incoming change is rejected; the server returns its fresher version to the client to overwrite its local state.
   - For collections or arrays (e.g. `CollectionItem`), items are joined via compound keys `[collectionId, mediaItemId]`, allowing concurrent additions of different items to the same collection without conflict.
3. **Session Immutability:**
   - Completed `ActivitySession` records are append-only. They are never overwritten by automatic sync; edits or deletions require explicit user action.

---

## 5. Offline Queue & Network Resilience

- **Retry Policy:** Use exponential backoff with jitter (e.g., 2s, 5s, 15s, 60s, max 5m) on network failures.
- **Batch Processing:** Limit sync requests to a maximum of 100 items per batch to prevent HTTP payload timeouts on slow connections.
- **Idempotency:** Sync payloads must contain a deterministic `clientBatchId` so repeated submissions caused by network drops do not duplicate records.
- **UI State Indicators:** Provide transparent sync badges in the application header:
  - 🟢 `Synced` (all journals acknowledged)
  - 🟡 `Syncing...` (batch transfer in progress)
  - ⚪ `Offline` (local changes queued)
  - 🔴 `Sync Attention Required` (authenticated token expired or schema mismatch)
