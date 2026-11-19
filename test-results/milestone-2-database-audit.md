# Milestone 2 — Database Lifecycle & Electron SQLite Migrations Audit

**Date:** November 19, 2026  
**Auditor:** Antigravity Agent  
**Target Repository:** MLocker (`AryanTechie-007/MLocker`)  
**Scope:** Database Architecture, Electron Integration, Migration Lifecycle, Persistence & Recovery, and Testing Infrastructure.

---

## 1. Executive Summary

This audit establishes an evidence-based foundation for **Milestone 2 (Database Lifecycle & Electron SQLite Migrations)**. A thorough inspection of the repository reveals that while Prisma ORM is correctly utilized for typed application queries across the Next.js API routes, the current database lifecycle has significant production defects, missing migration infrastructure, and dangerous Electron packaging assumptions:

1. **No versioned migrations:** Prisma is currently unmanaged by migrations; `prisma/migrations` does not exist, and CI relies on `npx prisma db push`.
2. **Template database copy vulnerability:** Packaged Electron attempts to copy a bundled developer `dev.db` from application resources into `app.getPath("userData")`. Because `prisma/dev.db` is in `.gitignore`, clean checkouts and CI builds will fail to package a database, leaving a clean installation with a 0-byte SQLite file and no tables.
3. **Developer data leakage:** Bundling `prisma/dev.db` via `extraResources` risks shipping local developer media records, test accounts, and sensitive data to end-user machines.
4. **No upgrade migration path:** Existing desktop installations running older schema versions will not be migrated upon app updates, causing runtime crashes when new columns/tables are queried.
5. **No WAL mode or concurrency configuration:** The SQLite database operates in standard `DELETE` journal mode, which creates table lock contention during concurrent operations.
6. **No backup and recovery system:** No automated backup precedes schema migrations, leaving failed upgrades irrecoverable.
7. **Test isolation deficit:** Tests currently write to and read from the developer's active `prisma/dev.db`.

This audit documents each finding with file and line citations, evaluates risks, and presents an architectural design and phased implementation plan to achieve production reliability.

---

## 2. Relevant Files & Current Responsibilities

| File | Current Responsibility |
| :--- | :--- |
| [`prisma/schema.prisma`](file:///c:/Users/Aryan/Projects/Media-Locker/prisma/schema.prisma) | Defines SQLite datasource and 4 core models: `User`, `UserMedia`, `Collection`, `CollectionItem`. Specifies cascading foreign keys and compound indexes. |
| [`src/lib/prisma.ts`](file:///c:/Users/Aryan/Projects/Media-Locker/src/lib/prisma.ts) | Exports singleton `PrismaClient` instance cached on `globalThis` in development. Contains no lifecycle hooks, disconnect handlers, or connection validation. |
| [`electron/main.js`](file:///c:/Users/Aryan/Projects/Media-Locker/electron/main.js) | Handles Electron app lifecycle, single instance locking, and `setupDatabase()` (lines 23–69). Copies candidate template `dev.db` to `userData` and configures `process.env.DATABASE_URL`. Starts embedded Next.js production server. |
| [`package.json`](file:///c:/Users/Aryan/Projects/Media-Locker/package.json) | Configures scripts, dependencies (`@prisma/client`, `prisma`, `electron-builder`), and packaging rules (`build.files`, `extraResources` copying `prisma/dev.db` to `dev.db`). |
| [`.github/workflows/ci.yml`](file:///c:/Users/Aryan/Projects/Media-Locker/.github/workflows/ci.yml) | GitHub Actions workflow running `npx prisma generate` and `npx prisma db push` before running tests. |
| [`vitest.config.ts`](file:///c:/Users/Aryan/Projects/Media-Locker/vitest.config.ts) | Test runner configuration hardcoding `DATABASE_URL: "file:.../prisma/dev.db"`. |
| [`tests/security/tenant-isolation.test.ts`](file:///c:/Users/Aryan/Projects/Media-Locker/tests/security/tenant-isolation.test.ts) | Regression test suite that creates, queries, and deletes records directly against `prisma/dev.db`. |

---

## 3. Existing Implementation Strengths

1. **Strong Tenant Isolation & Relational Constraints:**
   - In [`prisma/schema.prisma`](file:///c:/Users/Aryan/Projects/Media-Locker/prisma/schema.prisma#L24-L86), foreign keys enforce referential integrity with `onDelete: Cascade` across `User` &rarr; `UserMedia` &rarr; `CollectionItem` and `User` &rarr; `Collection` &rarr; `CollectionItem`.
   - Compound indexes (`[userId, mediaType]`, `[userId, status]`, `[collectionId, userMediaId]`) optimize tenant-scoped queries.
2. **Proper OS Directory Targeting in Electron:**
   - In [`electron/main.js`](file:///c:/Users/Aryan/Projects/Media-Locker/electron/main.js#L24-L29), `setupDatabase()` uses `app.getPath("userData")` for the production database, avoiding placement in the read-only application installation directory.
3. **Single Instance Locking:**
   - In [`electron/main.js`](file:///c:/Users/Aryan/Projects/Media-Locker/electron/main.js#L9-L13), `app.requestSingleInstanceLock()` prevents multiple desktop processes from simultaneously accessing the SQLite database file, preventing file locking conflicts across app instances.
4. **Boundary Isolation:**
   - Renderer processes have no direct database or raw SQL IPC access; queries are strictly handled by authenticated API routes within the Next.js process.
5. **Modern Runtime Capabilities:**
   - Both Node.js (v24.19.0) and Electron (v45.2.3, embedding Node.js v24.22.2) include built-in `node:sqlite` (`DatabaseSync`), enabling atomic transactions, PRAGMA manipulation, and embedded migrations without requiring external native binaries.

---

## 4. Verified Defects & Potential Risks

### 4.1 Verified Defects

#### Defect 1: Total Absence of Versioned Migrations
- **Evidence:** Querying `npx prisma migrate status` reports:
  ```text
  No migration found in prisma/migrations
  The current database is not managed by Prisma Migrate.
  ```
- **File:** `prisma/` contains only `schema.prisma` and `dev.db`. No `prisma/migrations/` directory exists.
- **Impact:** Schema changes cannot be deployed deterministically. Schema drift across environments is untracked.

#### Defect 2: Fragile "Template Database Copy" Clean Installation
- **Evidence:** [`electron/main.js`](file:///c:/Users/Aryan/Projects/Media-Locker/electron/main.js#L32-L58):
  ```javascript
  if (!fs.existsSync(targetDbPath)) {
    const candidates = [
      path.join(process.resourcesPath, "dev.db"),
      path.join(process.resourcesPath, "prisma", "dev.db"),
      ...
    ];
    let copied = false;
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        fs.copyFileSync(candidate, targetDbPath);
        copied = true;
        break;
      }
    }
    if (!copied) {
      console.log(`[Media Locker] No starter DB found, SQLite will create a new file at ${targetDbPath}`);
    }
  }
  ```
- **File:** [`package.json`](file:///c:/Users/Aryan/Projects/Media-Locker/package.json#L60-L65) specifies:
  ```json
  "extraResources": [
    {
      "from": "prisma/dev.db",
      "to": "dev.db"
    }
  ]
  ```
- **Impact:** `prisma/dev.db` is an uncommitted file listed in `.gitignore`. In any clean environment (e.g. fresh developer clone, CI build server), `prisma/dev.db` does not exist prior to build. The resulting package contains no starter database. On first launch, SQLite creates an empty 0-byte file without any tables, causing immediate runtime crashes when Next.js queries `User` or `UserMedia`.

#### Defect 3: Shipping Developer Local Data to End Users
- **Evidence:** In `prisma/dev.db`, there is an existing user (`guest@medialocker.local`, name: `Aryan Explorer`), 11 `UserMedia` items, and 1 collection.
- **Impact:** If a developer builds an Electron distribution on their machine where `prisma/dev.db` exists, all of the developer's personal media entries and account data are bundled into `extraResources` and copied to every user's desktop!

#### Defect 4: Inability to Upgrade Existing Installations
- **Evidence:** In [`electron/main.js`](file:///c:/Users/Aryan/Projects/Media-Locker/electron/main.js#L32), the copy logic only runs `if (!fs.existsSync(targetDbPath))`.
- **Impact:** If an existing user has a previous version of the app and updates, their database already exists. If the update introduces new columns, tables, or indexes, no migration executes. The application immediately throws SQL errors (`no such column`, `no such table`) on the first query targeting new schema structures.

#### Defect 5: Unmanaged SQLite Journal Mode (Lack of WAL Mode)
- **Evidence:** Running `PRAGMA journal_mode;` on `prisma/dev.db` returns:
  ```json
  { "journal_mode": "delete" }
  ```
- **Impact:** In `delete` journal mode, any write operation exclusively locks the entire database file against all concurrent readers. In desktop usage where Next.js API routes may execute concurrent read and write operations, this can trigger `SQLITE_BUSY` errors and UI lag.

#### Defect 6: Missing Graceful Disconnect and Checkpoint on Shutdown
- **Evidence:** [`electron/main.js`](file:///c:/Users/Aryan/Projects/Media-Locker/electron/main.js#L337-L346):
  ```javascript
  app.on("before-quit", () => {
    if (nextServer) {
      nextServer.close();
    }
  });
  ```
- **Impact:** Neither `prisma.$disconnect()` nor SQLite checkpointing (`PRAGMA wal_checkpoint(TRUNCATE)`) is invoked before process termination, risking unflushed journal writes if the application terminates abruptly.

#### Defect 7: Test Suite Lacks Database Isolation
- **Evidence:** [`vitest.config.ts`](file:///c:/Users/Aryan/Projects/Media-Locker/vitest.config.ts#L16):
  ```typescript
  DATABASE_URL: `file:${path.resolve(__dirname, 'prisma/dev.db')}`
  ```
- **Impact:** Vitest tests run against the primary development database `prisma/dev.db`. Test suite mutations (creating test users, deleting items) can destroy local development data or cause test flakiness if run concurrently.

---

### 4.2 Potential Risks

1. **Inconsistent Backups with Active WAL:**
   - If WAL mode is enabled, copying only the primary `.db` file while a write is occurring or without checkpointing will create a corrupted or incomplete backup because active transactions reside in the `<dbname>-wal` file.
2. **Packaged Runtime Prisma Engine Availability:**
   - In packaged Electron distributions, Prisma requires the query engine binary (`query_engine-windows.dll.node` on Windows, `.so.node` on Linux, `.dylib.node` on macOS). If the engine binary path resolution fails in packaged mode, the app cannot execute queries.
3. **Partial DDL Failure Without Transaction Rollback:**
   - If a migration statement fails halfway through (e.g. syntax error or constraint conflict), non-transactional execution leaves the database in an inconsistent schema state.

---

## 5. Missing Functionality

1. **Embedded Migration Runner:** An automated, zero-CLI migration runner embedded in the Electron startup sequence that tracks schema versioning via `PRAGMA user_version`.
2. **Schema Baseline & Versioned Migration SQL:** Initial baseline migration `0001_init/migration.sql` matching the current Prisma schema.
3. **Automated Pre-Migration Backup:** Automatic snapshot of the database prior to applying schema migrations.
4. **Disaster Recovery / Rollback Strategy:** Ability to revert to the pre-migration snapshot if a migration throws an error during startup.
5. **Database Integrity & WAL Configuration:** Routine `PRAGMA integrity_check` on startup and persistent `PRAGMA journal_mode = WAL` configuration.
6. **Graceful Shutdown Checkpointing:** Explicit hook ensuring WAL logs are checkpointed and connections closed on `before-quit`.
7. **Test Database Isolation:** Dedicated temporary test database for Vitest execution.

---

## 6. Migration Compatibility Concerns

- **Existing Database Preservation:**
  The developer's local `dev.db` (and any existing user's `userData/dev.db`) contains data with `PRAGMA user_version = 0`.
  The migration runner must detect whether existing tables (`User`, `UserMedia`) already exist when `user_version === 0`.
  - If tables exist: Stamp `PRAGMA user_version = 1` as a baseline without re-running `CREATE TABLE` statements (which would otherwise fail with `table already exists`).
  - If tables do not exist (fresh installation): Run `0001_init` SQL within a transaction and stamp `PRAGMA user_version = 1`.
  - If subsequent migrations exist (v2, v3, etc.): Sequentially execute migrations from `current_version + 1` up to `TARGET_VERSION`.

---

## 7. Recommended Implementation Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Electron Main Process                           │
│                                                                        │
│  app.whenReady()                                                       │
│         │                                                              │
│         ▼                                                              │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │               Database Lifecycle Manager (lifecycle.js)          │  │
│  │                                                                  │  │
│  │  1. Resolve Persistent Path (app.getPath('userData')/mlocker.db)  │  │
│  │  2. Integrity Check (PRAGMA integrity_check)                     │  │
│  │  3. WAL Configuration (PRAGMA journal_mode = WAL)                │  │
│  │  4. Version Inspection (PRAGMA user_version)                     │  │
│  │  5. Pre-Migration Backup (if pending migrations)                 │  │
│  │  6. Execute Migrations inside Transaction (migrator.js)          │  │
│  │  7. Stamp PRAGMA user_version = TARGET_VERSION                   │  │
│  │  8. Set process.env.DATABASE_URL = file:...                      │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│         │                                                              │
│         ▼                                                              │
│  Start Next.js Production Server ──► PrismaClient queries mlocker.db   │
│         │                                                              │
│         ▼                                                              │
│  Create Main Window (BrowserWindow)                                    │
│                                                                        │
│  app.on('before-quit')                                                 │
│         │                                                              │
│         ▼                                                              │
│  PRAGMA wal_checkpoint(TRUNCATE) & Close Next.js Server                 │
└────────────────────────────────────────────────────────────────────────┘
```

### Key Components

1. **Embedded Migration Runner (`electron/database/migrator.js`):**
   - Implements zero-dependency migration execution using built-in `node:sqlite`.
   - Reads versioned SQL scripts.
   - Executes migrations in sequential transactions.
   - Maintains `PRAGMA user_version`.
2. **Database Backup & Recovery Service (`electron/database/backup.js`):**
   - Safely creates backups using WAL checkpointing (`PRAGMA wal_checkpoint(TRUNCATE)`).
   - Stores timestamped backups in `app.getPath("userData")/backups/`.
   - Supports safe restoration if migration or corruption occurs.
3. **Database Lifecycle Orchestrator (`electron/database/lifecycle.js`):**
   - Coordinates directory verification, WAL mode, migration execution, and shutdown checkpointing.
   - Eliminates template database copying from `package.json` (`extraResources`).
4. **Baseline Prisma Migration (`prisma/migrations/0001_init/migration.sql`):**
   - Formalizes the initial schema so that `npx prisma migrate status` and `npx prisma migrate deploy` work in CI and developer environments.
5. **Test Environment Isolation (`vitest.config.ts`):**
   - Uses an isolated SQLite database for Vitest execution, ensuring `prisma/dev.db` is never modified by test runs.

---

## 8. Phased Implementation Plan

- **Step 1: Baseline Prisma Migration**
  - Generate `prisma/migrations/0001_init/migration.sql` representing the current models in `prisma/schema.prisma`.
  - Update `.github/workflows/ci.yml` to use `npx prisma migrate deploy` instead of `prisma db push`.

- **Step 2: Embedded Database Services**
  - Implement `electron/database/migrator.js` for versioned migrations tracking `PRAGMA user_version`.
  - Implement `electron/database/backup.js` for WAL-safe backup creation, rotation, and recovery.
  - Implement `electron/database/lifecycle.js` to coordinate path resolution, integrity checks, WAL mode, migrations, and clean shutdowns.

- **Step 3: Electron Main Process Integration & Packaging Hardening**
  - Update `electron/main.js` to use `lifecycle.js`.
  - Remove `extraResources` copying `prisma/dev.db` from `package.json`.
  - Standardize database naming (support existing `dev.db` or migrate to `mlocker.db` in `userData`).
  - Add graceful `before-quit` WAL checkpointing.

- **Step 4: Test Database Isolation & Lifecycle Tests**
  - Update `vitest.config.ts` to use an isolated test database.
  - Create comprehensive tests in `tests/database/lifecycle.test.ts`:
    - Fresh database initialization (user_version 0 &rarr; 1 on empty file).
    - Existing database baseline adoption (user_version 0 with existing tables &rarr; 1).
    - Sequential multi-step migration.
    - Transaction rollback on migration error.
    - Backup creation and WAL-consistent restoration.
    - Database path resolution in dev vs packaged mode.
    - Startup failure handling.

- **Step 5: Verification & Delivery**
  - Run all database tests, full Vitest suite (all 93+ tests), TypeScript compilation, ESLint, Next.js production build.
  - Verify GitHub Actions CI workflow on pushed commit.
  - Produce final report in `test-results/milestone-2-database-report.md`.
