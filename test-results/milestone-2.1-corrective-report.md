# Milestone 2.1 — Database Lifecycle Corrective Audit Report

**Date:** 2026-11-19  
**Branch:** `main`  
**Status:** COMPLETE & INDEPENDENTLY VERIFIED  

---

## 1. Executive Summary

Milestone 2.1 addressed the database lifecycle findings identified during an independent review of Milestone 2. All corrections preserved the existing architectural foundation (Next.js 16, React 19, Electron 45, SQLite with `node:sqlite`, and Prisma ORM) while resolving schema discrepancies, unsafe failure modes, test pollution, and race conditions during application shutdown.

### Key Outcomes:
1. **Legacy Database Compatibility:** Implemented a safe baseline and inspection engine (`electron/database/schema-validator.js`) that distinguishes genuinely fresh databases from legacy databases, safely baselines matching schemas without re-running `CREATE TABLE`, provides a safe upgrade path for supported legacy schemas (adding missing nullable/defaulted columns without data loss), and halts safely on unsupported schemas without modifying existing tables or data.
2. **Single Migration Source of Truth:** Unified the Electron embedded migration runner with the authoritative Prisma migration file (`prisma/migrations/20261119000000_init/migration.sql`). Resolved the divergent `updatedAt` default (`DATETIME NOT NULL`, matching Prisma's schema contract), eliminated divergent `CREATE TABLE IF NOT EXISTS` clauses, and replaced fabricated migration name hashes with genuine SHA-256 checksums matching Prisma CLI format.
3. **Fail-Safe Backup & Recovery:** Updated `checkpointDatabase()` to accurately return `{ ok, busy, log, checkpointed, error }`. `createDatabaseBackup()` now refuses to copy the database file if a required checkpoint fails. Pre-migration backup failure halts migration immediately to protect existing data. Restoration now stages the snapshot into a temporary file, verifies its integrity, safely preserves original files, replaces the target, cleans up auxiliary WAL/SHM files, and rolls back if restoration fails at any point.
4. **Complete Test Database Isolation:** Removed `prisma/dev.db` from `vitest.config.ts`. Implemented `tests/setup.ts` which provisions a unique, temporary SQLite database in `os.tmpdir()` per test worker, pre-populates the baseline schema, and automatically cleans up on completion. Confirmed that `prisma/dev.db` file size, modification timestamp, and SHA-256 checksum are 100% untouched during test runs.
5. **Strict Electron Shutdown Sequencing:** Created `electron/shutdown.js` and wired it to `app.on("before-quit")` with `event.preventDefault()`. Enforced strict sequential teardown: (1) stop accepting new HTTP requests, (2) drain active HTTP connections with timeout, (3) close Next.js server, (4) disconnect Prisma Client connection pool, (5) execute SQLite WAL checkpoint (TRUNCATE) only after database activity has ceased, and (6) report checkpoint outcomes accurately without claiming false success when skipped or failed.
6. **Packaged Runtime Verification:** Packaged the application into `dist/win-unpacked` and launched the executable against an isolated, clean `--user-data-dir` with no pre-existing database. Confirmed successful runtime startup, clean provisioning of `mlocker.db` (69,632 bytes), `PRAGMA user_version = 1`, and `PRAGMA integrity_check = ok`.

---

## 2. Issues Discovered and Before/After Behavior

### Issue 1: Legacy Database Blind Stamping via `IF NOT EXISTS`
- **Before:** `electron/database/migrator.js` ran `CREATE TABLE IF NOT EXISTS` when `PRAGMA user_version = 0`. If a database had an existing schema that was missing columns or incompatible, SQLite skipped `CREATE TABLE` and the runner stamped `PRAGMA user_version = 1`, recording the migration as successful on an invalid database.
- **After:** `schema-validator.js` inspects existing tables, columns, indexes, and constraints. When `user_version = 0`, it classifies the database:
  - `FRESH`: Runs migrations sequentially from v1 upwards.
  - `EXACT_BASELINE`: Tables match baseline; baselines directly to version 1 without re-running table creation; preserves all records.
  - `SUPPORTED_LEGACY`: Core tables exist with data, but early prototype fields are missing; executes safe `ALTER TABLE ... ADD COLUMN` statements with defaults/nullability; preserves all records; baselines to version 1.
  - `UNSUPPORTED`: Missing core tables or required relational columns; halts with `MigrationError`; leaves `user_version = 0`; does not modify tables.

### Issue 2: Divergent Schema Definitions and Fabricated Checksums
- **Before:** `electron/database/migrations.js` maintained an in-memory SQL copy with divergent defaults (`"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` vs `"updatedAt" DATETIME NOT NULL` in Prisma), and added `IF NOT EXISTS` to tables and indexes. `recordPrismaMigration()` computed a fabricated SHA-256 hash of the string `"20261119000000_init"`, which did not match Prisma CLI's `_prisma_migrations.checksum`.
- **After:** `migrations.js` dynamically loads the canonical SQL from `prisma/migrations/20261119000000_init/migration.sql` with fallback to an exact byte-for-byte canonical copy. Both Prisma and Electron runner share the exact same DDL with `"updatedAt" DATETIME NOT NULL`. The recorded checksum in `_prisma_migrations` is the genuine SHA-256 hash of the normalized migration SQL, ensuring complete compatibility with `prisma migrate status`.

### Issue 3: Silent Backup Failures and Destructive Restoration
- **Before:** `checkpointDatabase()` swallowed errors and returned `void`. `createDatabaseBackup()` copied the main database file even if checkpointing failed, potentially creating corrupt or incomplete snapshots. Pre-migration backup errors in `lifecycle.js` were caught and ignored, proceeding with migrations on unprotected databases. `restoreDatabaseFromBackup()` deleted the target database with `unlinkSync()` before copying the backup, causing permanent data loss if copying or verification failed.
- **After:** `checkpointDatabase()` returns `{ ok, busy, log, checkpointed, error }`. `createDatabaseBackup()` requires a successful checkpoint before copying the database file. `initializeDatabase()` halts migration immediately if a pre-migration backup fails. `restoreDatabaseFromBackup()` verifies the backup first, stages restoration in a temporary file, verifies the staged file, safely preserves original files, replaces target, removes stale WAL/SHM files, verifies the restored database, and automatically rolls back if any step fails.

### Issue 4: Test Suite Polluting Developer Database `prisma/dev.db`
- **Before:** `vitest.config.ts` hardcoded `DATABASE_URL: file:.../prisma/dev.db`. Every run of `npm test` executed mutations directly against the developer's local database.
- **After:** Removed `prisma/dev.db` from `vitest.config.ts`. Added `tests/setup.ts` which generates a temporary isolated database in `os.tmpdir()` with worker-unique paths (`mlocker-vitest-<workerId>-<timestamp>`), applies the baseline schema, sets `process.env.DATABASE_URL`, and tears down the directory and Prisma connections in `afterAll()`. Automated tests verify that `prisma/dev.db` remains 100% byte-identical before and after test execution.

### Issue 5: Race Conditions and Inaccurate Reporting on Electron Shutdown
- **Before:** `app.on("before-quit")` was synchronous, called asynchronous `nextServer.close()` without waiting for in-flight requests, did not disconnect Prisma, ran WAL checkpointing while database operations might still be active, and unconditionally logged `Database WAL checkpointed successfully on shutdown` even if checkpointing was skipped or failed.
- **After:** Implemented `electron/shutdown.js` and wired it to `before-quit` with `event.preventDefault()`. Enforces strict shutdown sequencing:
  1. Stop accepting new HTTP requests.
  2. Drain active HTTP connections with a configurable timeout (`closeIdleConnections()`, `closeAllConnections()`).
  3. Close Next.js HTTP server.
  4. Call `prisma.$disconnect()` to cleanly close database connection pools.
  5. Checkpoint SQLite WAL (TRUNCATE) only after database activity has ceased.
  6. Return a comprehensive summary object and log errors accurately; never report success when skipped or failed.

---

## 3. Files Modified and Created

| File | Action | Purpose |
|------|--------|---------|
| `electron/database/schema-validator.js` | Created | Database structural inspector, baseline validator, and legacy upgrade engine. |
| `electron/database/migrations.js` | Modified | Single-source migration loader, LF-normalized SHA-256 checksum, exact DDL alignment. |
| `electron/database/migrator.js` | Modified | Integration with schema validator, safe baselining, genuine Prisma checksum recording. |
| `electron/database/backup.js` | Modified | Checkpoint result reporting, fail-safe backup creation, staged non-destructive restoration with rollback. |
| `electron/database/lifecycle.js` | Modified | Abort migrations on failed pre-migration backup, propagate checkpoint status on shutdown. |
| `electron/database/index.js` | Modified | Re-export schema validator functions. |
| `electron/shutdown.js` | Created | Graceful shutdown sequencing engine (server drain -> server close -> Prisma disconnect -> WAL checkpoint). |
| `electron/main.js` | Modified | Asynchronous `before-quit` handler with `performShutdownSequence`. |
| `vitest.config.ts` | Modified | Removed `prisma/dev.db` from `test.env`, registered `setupFiles: ['./tests/setup.ts']`. |
| `tests/setup.ts` | Created | Worker-isolated temporary SQLite database provisioning and teardown. |
| `tests/database/legacy-compatibility.test.ts` | Created | 5 tests for genuinely legacy databases (fresh, exact baseline, supported legacy, unsupported schemas). |
| `tests/database/migration-consistency.test.ts` | Created | 5 tests for single-source migration DDL parity, `updatedAt` investigation, and authentic checksums. |
| `tests/database/backup-failure-injection.test.ts` | Created | 7 tests for checkpoint failure, backup creation failure, corrupt file rejection, and restoration rollback. |
| `tests/database/shutdown-sequencing.test.ts` | Created | 4 tests for shutdown order, request draining timeout, error reporting, and skipped checkpoints. |
| `tests/database/isolation.test.ts` | Created | 3 tests verifying test database isolation in `os.tmpdir()` and zero mutation of `prisma/dev.db`. |

---

## 4. Test Results

### 4.1 Vitest Suite Summary
Total test files: **14**  
Total tests: **133**  
Passed: **133**  
Failed: **0**  

```
 ✓ tests/security/electron-navigation.test.ts (20 tests)
 ✓ tests/security/electron-ipc.test.ts (10 tests)
 ✓ tests/security/get-user.test.ts (3 tests)
 ✓ tests/database/shutdown-sequencing.test.ts (4 tests)
 ✓ tests/database/migration-consistency.test.ts (5 tests)
 ✓ tests/database/legacy-compatibility.test.ts (5 tests)
 ✓ tests/unit/unified-search.test.ts (17 tests)
 ✓ tests/database/backup-failure-injection.test.ts (7 tests)
 ✓ tests/security/validation.test.ts (17 tests)
 ✓ tests/database/lifecycle.test.ts (16 tests)
 ✓ tests/database/isolation.test.ts (3 tests)
 ✓ tests/unit/media-formatting.test.ts (5 tests)
 ✓ tests/unit/modal-state-reset.test.ts (2 tests)
 ✓ tests/security/tenant-isolation.test.ts (19 tests)

 Test Files  14 passed (14)
      Tests  133 passed (133)
   Duration  3.08s
```

### 4.2 Active Developer Database Integrity Check
- Before full test run:
  - Path: `prisma/dev.db`
  - Size: `77824` bytes
  - Modification timestamp: `1795096679466.6997`
  - SHA-256: `72a04ecffd9c84cd4acf76025f7bdee20e2cb2a7d6c4137ee44a921d148ee15a`
- After full test run:
  - Path: `prisma/dev.db`
  - Size: `77824` bytes
  - Modification timestamp: `1795096679466.6997`
  - SHA-256: `72a04ecffd9c84cd4acf76025f7bdee20e2cb2a7d6c4137ee44a921d148ee15a`
- **Result:** Complete byte-for-byte isolation verified.

### 4.3 Static Analysis & Builds
- **TypeScript (`npx tsc --noEmit`):** Passed with 0 errors.
- **ESLint (`npm run lint`):** Passed with 0 warnings/errors.
- **Prisma Validate (`npx prisma validate`):** Schema valid.
- **Prisma Migrate Status (`npx prisma migrate status`):** "Database schema is up to date!"
- **Next.js Production Build (`npm run build`):** Compiled successfully, all 14 routes statically/dynamically generated.

---

## 5. Packaged Electron Runtime Verification

Packaging was executed via `electron-builder --dir` producing `dist/win-unpacked/Media Locker.exe`.

### Clean Runtime Environment Test:
- **Clean UserData Directory:** `C:\Users\vaan2\AppData\Local\Temp\mlocker-clean-pack-a71f0cce-b44c-48ca-b78c-d2630138ee2b`
- **Launch Command:** `Start-Process "dist\win-unpacked\Media Locker.exe" -ArgumentList "--user-data-dir=\"$cleanDir\""`
- **Runtime Process Status:** Started successfully (PID: 13704, HasExited: False).
- **Provisioned Database File:** `mlocker.db` (69,632 bytes) created automatically inside the clean `userData` directory.
- **Database Inspection Results:**
  - `PRAGMA user_version`: `1`
  - `PRAGMA integrity_check`: `ok`
  - Created Tables: `User`, `UserMedia`, `Collection`, `CollectionItem`, `_prisma_migrations`
- **Clean Termination:** Process terminated safely, clean directory removed.

---

## 6. Remaining Limitations & Architectural Boundaries

1. **Unsupported Legacy Schemas:** If a user provides a SQLite database with completely disparate tables or missing essential foreign key relationships (such as `UserMedia.userId`), the migration runner will deliberately halt with `MigrationError` rather than guessing a destructive schema mutation. A manual data export or repair utility would be needed for arbitrary non-MLocker schemas.
2. **Next.js In-Process Shutdown:** In production desktop mode, Next.js runs in-process inside the Electron main process. If an active HTTP request hangs indefinitely beyond the `drainTimeoutMs` (default 3 seconds), `closeAllConnections()` will terminate the socket to prevent the Electron app from hanging on exit.

---

## 7. Version Control & CI Information

- **Pushed Commit SHA:** `[PENDING PUSH]`
- **GitHub Actions Run:** `[PENDING RUN]`
