# Milestone 2 — Database Lifecycle & Electron SQLite Migrations Report

**Date:** November 19, 2026  
**Status:** Complete & Verified  
**Milestone:** 2 — Database and Desktop Reliability  
**Target Repository:** MLocker (`AryanTechie-007/MLocker`)  

---

## 1. Executive Summary

Milestone 2 establishes a resilient, production-ready database lifecycle for MLocker, resolving the critical packaging vulnerabilities, missing migration mechanisms, and unmanaged database paths identified in the repository audit.

Prior to this milestone:
- The database was unmanaged by migrations (`prisma/migrations` did not exist; CI used `npx prisma db push`).
- Packaged desktop installations attempted to copy a developer's local `prisma/dev.db` via `extraResources`, leaking personal records and causing fresh installations on clean machines to fail when the gitignored `dev.db` was missing.
- Existing desktop installations had no upgrade path when schema changes were introduced.
- SQLite operated in standard `DELETE` journal mode without WAL concurrency, WAL checkpointing, automated backups, or pre-migration recovery.

In Milestone 2, we designed and implemented a dual-paradigm migration architecture:
1. **Prisma Migrations Baseline:** Created `prisma/migrations/20261119000000_init/migration.sql` to formalize the schema for Prisma CLI, local development, and CI environments (`npx prisma migrate deploy`).
2. **Zero-CLI Embedded SQLite Migration Runner:** Implemented in `electron/database/migrator.js` using Node/Electron's built-in `node:sqlite` (`DatabaseSync`), tracking schema versioning via `PRAGMA user_version`.
3. **Automated WAL-Consistent Backup & Disaster Recovery:** Implemented in `electron/database/backup.js`, ensuring WAL checkpointing (`PRAGMA wal_checkpoint(TRUNCATE)`), integrity verification (`PRAGMA integrity_check`), and automatic restoration if a migration fails.
4. **Persistent Electron Storage & Clean Provisioning:** Implemented in `electron/database/lifecycle.js`, ensuring production SQLite databases reside strictly in `app.getPath("userData")` (`mlocker.db` or legacy `dev.db`), completely eliminating developer template database copying.
5. **Graceful Shutdown Checkpointing:** Flushes WAL writes on application exit via `app.on("before-quit")`.
6. **Comprehensive Automated Test Suite:** Added 16 automated tests in `tests/database/lifecycle.test.ts` covering fresh installations, existing databases, multi-step migrations, failure rollback, backup/restore, WAL consistency, and path resolution.

---

## 2. Audit Findings & Resolutions

| Audit Finding | Verified Severity | Resolution Implemented | Relevant Files |
| :--- | :--- | :--- | :--- |
| **No versioned migrations** | High | Created baseline migration `20261119000000_init` matching current models. Baselines existing databases and switches CI from `db push` to `migrate deploy`. | [`prisma/migrations/20261119000000_init/migration.sql`](file:///c:/Users/Aryan/Projects/Media-Locker/prisma/migrations/20261119000000_init/migration.sql), [`.github/workflows/ci.yml`](file:///c:/Users/Aryan/Projects/Media-Locker/.github/workflows/ci.yml) |
| **Template DB copying from developer machine** | High | Removed `extraResources` copying `prisma/dev.db`. Clean desktop installs now initialize an empty SQLite database and run migrations on startup. | [`package.json`](file:///c:/Users/Aryan/Projects/Media-Locker/package.json), [`electron/main.js`](file:///c:/Users/Aryan/Projects/Media-Locker/electron/main.js) |
| **No upgrade migration path for existing users** | High | Embedded migration runner inspects `PRAGMA user_version` on startup and applies pending migrations sequentially inside transactions. | [`electron/database/migrator.js`](file:///c:/Users/Aryan/Projects/Media-Locker/electron/database/migrator.js) |
| **No WAL concurrency mode** | Medium | Configured `PRAGMA journal_mode = WAL` and `PRAGMA busy_timeout = 5000` during database initialization. | [`electron/database/lifecycle.js`](file:///c:/Users/Aryan/Projects/Media-Locker/electron/database/lifecycle.js) |
| **No backup / disaster recovery** | Medium | Built automated pre-migration backup service with WAL flushing and automatic rollback restoration on failure. | [`electron/database/backup.js`](file:///c:/Users/Aryan/Projects/Media-Locker/electron/database/backup.js) |
| **Ungraceful process exit without WAL flush** | Medium | Added shutdown hook in `electron/main.js` executing `PRAGMA wal_checkpoint(TRUNCATE)` before process termination. | [`electron/main.js`](file:///c:/Users/Aryan/Projects/Media-Locker/electron/main.js) |
| **Lack of database test isolation** | Medium | Added isolated temporary database testing in `tests/database/lifecycle.test.ts` using `node:sqlite`. | [`tests/database/lifecycle.test.ts`](file:///c:/Users/Aryan/Projects/Media-Locker/tests/database/lifecycle.test.ts) |

---

## 3. Final Database Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Electron Main Process                           │
│                                                                        │
│  app.whenReady()                                                       │
│         │                                                              │
│         ▼                                                              │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │              Database Lifecycle Manager (lifecycle.js)           │  │
│  │                                                                  │  │
│  │  1. Resolve Path: app.getPath('userData')/mlocker.db             │  │
│  │  2. Integrity Check: PRAGMA integrity_check                     │  │
│  │  3. Concurrency: PRAGMA journal_mode = WAL, foreign_keys = ON    │  │
│  │  4. Inspect Version: PRAGMA user_version                        │  │
│  │  5. Pre-Migration Backup (if pending migrations on existing DB) │  │
│  │  6. Execute Migrations in Transaction (migrator.js)              │  │
│  │  7. Set PRAGMA user_version = TARGET_VERSION                     │  │
│  │  8. Export process.env.DATABASE_URL = file:...                   │  │
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

---

## 4. Path & Environment Strategy

1. **Packaged Desktop Environment:**
   - Database directory: `app.getPath("userData")` (`%APPDATA%\media-locker` on Windows, `~/Library/Application Support/media-locker` on macOS, `~/.config/media-locker` on Linux).
   - Target database: `path.join(userData, "mlocker.db")`.
   - Backward compatibility: If an existing user already has `path.join(userData, "dev.db")`, the resolver automatically adopts `dev.db`, preserving all historical data without manual file migration.
   - Backup directory: `path.join(userData, "backups")`.
2. **Local Development Environment:**
   - Resolves to `prisma/dev.db` or the URL configured in `process.env.DATABASE_URL`.
3. **CI / Build Runner Environment:**
   - Runs `npx prisma generate` and `npx prisma migrate deploy` targeting `file:./dev.db`.

---

## 5. Migration Lifecycle & Embedded Runner

- **Version Tracking:** The database schema version is tracked directly within SQLite via `PRAGMA user_version`.
- **First Launch (Fresh Database):**
  - SQLite creates the empty database file.
  - Migrator executes initial migration `20261119000000_init` inside an atomic transaction.
  - Sets `PRAGMA user_version = 1`.
  - Records the applied migration in `_prisma_migrations` for Prisma CLI parity.
- **Existing Database (Upgrade):**
  - Migrator compares `currentVersion = getSchemaVersion(db)` with `LATEST_SCHEMA_VERSION`.
  - If upgrades are pending:
    1. Creates a timestamped pre-migration backup (`pre-migration-v<version>-<timestamp>.bak`).
    2. Sequentially applies each pending migration in its own `BEGIN IMMEDIATE ... COMMIT` block.
    3. Increments `PRAGMA user_version` on each success.
- **Atomic Rollback & Disaster Recovery:**
  - If a migration statement throws an error, the transaction immediately issues `ROLLBACK`.
  - The lifecycle manager restores the pre-migration snapshot, ensuring the database is never left in an unrecoverable or partially migrated state.
  - The application terminates gracefully and logs the root cause rather than serving requests against a broken schema.

---

## 6. Backup & Recovery Behavior

1. **WAL-Consistent Snapshots:**
   - Running `createDatabaseBackup(dbPath, backupDir)` automatically triggers `PRAGMA wal_checkpoint(TRUNCATE)`.
   - All uncommitted or pending WAL frames are flushed into the primary `.db` file prior to file duplication, avoiding corrupt or incomplete backups.
2. **Integrity Validation:**
   - Both backup creation and backup restoration execute `PRAGMA integrity_check` and check the SQLite 3 magic header (`SQLite format 3\0`) before declaring success.
3. **Automated Rotation:**
   - Retains the 5 most recent backups (`rotateBackups(backupDir, 5)`) to prevent unbounded disk growth.

---

## 7. Files Changed & Added

### Created Files
- [`prisma/migrations/20261119000000_init/migration.sql`](file:///c:/Users/Aryan/Projects/Media-Locker/prisma/migrations/20261119000000_init/migration.sql): Baseline SQL migration for `User`, `UserMedia`, `Collection`, `CollectionItem`.
- [`prisma/migrations/migration_lock.toml`](file:///c:/Users/Aryan/Projects/Media-Locker/prisma/migrations/migration_lock.toml): Prisma migration provider lock.
- [`electron/database/migrations.js`](file:///c:/Users/Aryan/Projects/Media-Locker/electron/database/migrations.js): Versioned migration registry with embedded DDL.
- [`electron/database/migrator.js`](file:///c:/Users/Aryan/Projects/Media-Locker/electron/database/migrator.js): Embedded SQLite migration runner tracking `PRAGMA user_version`.
- [`electron/database/backup.js`](file:///c:/Users/Aryan/Projects/Media-Locker/electron/database/backup.js): WAL-safe backup creation, integrity verification, rotation, and restore.
- [`electron/database/lifecycle.js`](file:///c:/Users/Aryan/Projects/Media-Locker/electron/database/lifecycle.js): Electron startup orchestrator, path resolution, WAL configuration, and shutdown.
- [`electron/database/index.js`](file:///c:/Users/Aryan/Projects/Media-Locker/electron/database/index.js): Subsystem entrypoint.
- [`src/types/sqlite.d.ts`](file:///c:/Users/Aryan/Projects/Media-Locker/src/types/sqlite.d.ts): TypeScript type definitions for `node:sqlite`.
- [`tests/database/lifecycle.test.ts`](file:///c:/Users/Aryan/Projects/Media-Locker/tests/database/lifecycle.test.ts): 16 automated tests covering the entire database lifecycle.
- [`test-results/milestone-2-database-audit.md`](file:///c:/Users/Aryan/Projects/Media-Locker/test-results/milestone-2-database-audit.md): Phase 1 evidence-based audit report.

### Modified Files
- [`package.json`](file:///c:/Users/Aryan/Projects/Media-Locker/package.json): Removed `extraResources` copying `prisma/dev.db`.
- [`electron/main.js`](file:///c:/Users/Aryan/Projects/Media-Locker/electron/main.js): Integrated `initializeDatabase` and `shutdownDatabase` hooks into app startup/exit.
- [`.github/workflows/ci.yml`](file:///c:/Users/Aryan/Projects/Media-Locker/.github/workflows/ci.yml): Changed schema provisioning step to `npx prisma migrate deploy`.
- [`.gitignore`](file:///c:/Users/Aryan/Projects/Media-Locker/.gitignore): Added `*.db-wal`, `*.db-shm`, and `*.bak`.

---

## 8. Verification Results

All local and automated checks were executed and verified:

| Check | Target / Command | Result |
| :--- | :--- | :--- |
| **Focused Database Tests** | `npx vitest run tests/database/lifecycle.test.ts` | **16 / 16 passing** |
| **Full Vitest Test Suite** | `npm test` | **109 / 109 passing** across 9 test suites |
| **TypeScript Compilation** | `npx tsc --noEmit` | **0 errors** |
| **ESLint Analysis** | `npm run lint` | **0 warnings / errors** |
| **Prisma Schema Validation** | `npx prisma validate` | **Valid** |
| **Prisma Migration Status** | `npx prisma migrate status` | **Up to date** (1 migration applied) |
| **Next.js Production Build** | `npm run build` | **Compiled successfully** in 13.1s |
| **Electron Packaging Check** | `npx electron-builder --dir` | **Success** (clean package output without bundled developer DB) |

---

## 9. Operational Steps for Local Development

1. **Clone repository:**
   ```bash
   git clone https://github.com/AryanTechie-007/MLocker.git
   cd MLocker
   npm install
   ```
2. **Apply migrations:**
   ```bash
   npx prisma migrate deploy
   ```
3. **Run local web development server:**
   ```bash
   npm run dev
   ```
4. **Run Electron desktop application in development:**
   ```bash
   npm run electron:dev
   ```
5. **Run test suite:**
   ```bash
   npm test
   ```

---

## 10. Known Limitations & Remaining Risks

1. **SQLite Native Concurrency Ceiling:**
   While WAL mode significantly increases read-write concurrency compared to standard DELETE mode, SQLite remains a single-writer database. High-frequency writes from concurrent background threads must rely on `PRAGMA busy_timeout = 5000` to prevent `SQLITE_BUSY` errors.
2. **Prisma Query Engine in Packaged NSIS Installers:**
   In packaged Windows NSIS builds, `node_modules/.prisma/**/*` is included in `build.files`. On non-Windows platforms (macOS/Linux), packagers must ensure platform-specific query engine binaries are present in `node_modules/.prisma/client`.
3. **OS-Level Permissions on UserData:**
   If a user runs the application with restricted filesystem permissions on `%APPDATA%`, database creation will fail closed with `DatabaseLifecycleError`.
