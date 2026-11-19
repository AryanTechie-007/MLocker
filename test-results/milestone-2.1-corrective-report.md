# Milestone 2.1 — Database Lifecycle Corrective Audit Report

**Date:** 2026-11-19  
**Branch:** `main`  
**Status:** COMPLETE & INDEPENDENTLY VERIFIED  

---

## 1. Executive Summary

Milestone 2.1 addressed the database lifecycle findings identified during an independent review of Milestone 2, with subsequent hardening performed during the Milestone 2.1 Follow-up Review. All corrections preserve the existing architectural foundation (Next.js 16, React 19, Electron 45, SQLite with `node:sqlite`, and Prisma ORM) while resolving schema discrepancies, unsafe failure modes, test pollution, transaction atomicity gaps, and cross-platform CI coverage.

### Key Outcomes:
1. **Comprehensive Structural Legacy Validation:** Enhanced `electron/database/schema-validator.js` to strictly enforce foreign-key relationships (`on_delete: CASCADE`), primary-key definitions (`id` PK), column types, nullability, and required unique constraints (`User.email`, `CollectionItem(collectionId, userMediaId)`) before classifying any database as `EXACT_BASELINE`. Databases with missing FKs, wrong cascade rules, or missing uniqueness constraints are rejected as `UNSUPPORTED` with zero modifications to existing records. Supported legacy databases (with intact FKs and core columns, but missing optional columns) remain safely upgradeable.
2. **Atomic Migration Metadata Recording:** Removed error-swallowing from `recordPrismaMigration()` in `electron/database/migrator.js`. Any failure in recording metadata in `_prisma_migrations` now throws `MigrationError`, which triggers an immediate `ROLLBACK` of the surrounding transaction, guaranteeing strict atomicity between schema migrations, `PRAGMA user_version`, and Prisma metadata.
3. **Single Migration Source of Truth:** Unified the Electron embedded migration runner with the authoritative Prisma migration file (`prisma/migrations/20261119000000_init/migration.sql`). Resolved the divergent `updatedAt` default (`DATETIME NOT NULL`, matching Prisma's schema contract), eliminated divergent `CREATE TABLE IF NOT EXISTS` clauses, and replaced fabricated migration name hashes with genuine SHA-256 checksums matching Prisma CLI format.
4. **Fail-Safe Backup & Recovery:** Updated `checkpointDatabase()` to accurately return `{ ok, busy, log, checkpointed, error }`. `createDatabaseBackup()` now refuses to copy the database file if a required checkpoint fails. Pre-migration backup failure halts migration immediately to protect existing data. Restoration now stages the snapshot into a temporary file, verifies its integrity, safely preserves original files, replaces the target, cleans up auxiliary WAL/SHM files, and rolls back if restoration fails at any point.
5. **Complete Test Database Isolation:** Removed `prisma/dev.db` from `vitest.config.ts`. Implemented `tests/setup.ts` which provisions a unique, temporary SQLite database in `os.tmpdir()` per test worker, pre-populates the baseline schema, and automatically cleans up on completion. Confirmed that `prisma/dev.db` file size, modification timestamp, and SHA-256 checksum are 100% untouched during test runs.
6. **Strict Electron Shutdown Sequencing:** Created `electron/shutdown.js` and wired it to `app.on("before-quit")` with `event.preventDefault()`. Enforced strict sequential teardown: (1) stop accepting new HTTP requests, (2) drain active HTTP connections with timeout, (3) close Next.js server, (4) disconnect Prisma Client connection pool, (5) execute SQLite WAL checkpoint (TRUNCATE) only after database activity has ceased, and (6) report checkpoint outcomes accurately without claiming false success when skipped or failed.
7. **Cross-Platform Electron CI Coverage:** Added a dedicated `electron-windows` job to `.github/workflows/ci.yml` that builds the application, packages the Windows binary via `electron-builder --dir`, executes it against a clean isolated `--user-data-dir`, verifies automatic database provisioning, checks `PRAGMA user_version = 1`, verifies `PRAGMA integrity_check = ok`, verifies all required tables, and terminates cleanly.

---

## 2. Issues Discovered and Before/After Behavior

### Issue 1: Legacy Database Structural Validation & Foreign Key Enforcment
- **Before:** `schema-validator.js` inspected column presence but did not validate foreign key definitions, cascade rules, primary key flags, nullability, or unique index presence. An existing database missing foreign keys or unique constraints could be mistakenly classified as `EXACT_BASELINE` or `SUPPORTED_LEGACY`.
- **After:** `schema-validator.js` enforces `BASELINE_FOREIGN_KEYS` (`UserMedia.userId -> User.id ON DELETE CASCADE`, `Collection.userId -> User.id ON DELETE CASCADE`, `CollectionItem` FKs), `BASELINE_INDEXES` (unique constraints on `User.email` and `CollectionItem(collectionId, userMediaId)`), primary key definitions, and column nullability. Databases failing foreign key or unique constraint checks are classified as `UNSUPPORTED`. The migration runner rejects them safely without modifying existing tables or data.

### Issue 2: Migration Metadata Swallowing & Transaction Atomicity
- **Before:** `recordPrismaMigration()` in `migrator.js` caught exceptions and only logged `console.warn`. If `_prisma_migrations` failed to insert (e.g. table schema corruption), the transaction committed anyway and the runner reported success with an unrecorded migration.
- **After:** `recordPrismaMigration()` throws `MigrationError` on failure. In `runMigrations()`, this triggers `ROLLBACK` of the transaction, ensuring that DDL operations, `PRAGMA user_version = X`, and `_prisma_migrations` records are committed atomically or not at all.

### Issue 3: Divergent Schema Definitions and Fabricated Checksums
- **Before:** `electron/database/migrations.js` maintained an in-memory SQL copy with divergent defaults (`"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` vs `"updatedAt" DATETIME NOT NULL` in Prisma), and added `IF NOT EXISTS` to tables and indexes. `recordPrismaMigration()` computed a fabricated SHA-256 hash of the string `"20261119000000_init"`.
- **After:** `migrations.js` dynamically loads the canonical SQL from `prisma/migrations/20261119000000_init/migration.sql` with fallback to an exact byte-for-byte canonical copy. Both Prisma and Electron runner share the exact same DDL with `"updatedAt" DATETIME NOT NULL`. Checksums in `_prisma_migrations` match Prisma CLI's SHA-256 calculation.

### Issue 4: Silent Backup Failures and Destructive Restoration
- **Before:** `checkpointDatabase()` swallowed errors and returned `void`. `createDatabaseBackup()` copied the main database file even if checkpointing failed. Pre-migration backup errors in `lifecycle.js` were ignored. `restoreDatabaseFromBackup()` deleted the target database with `unlinkSync()` before copying the backup.
- **After:** `checkpointDatabase()` returns `{ ok, busy, log, checkpointed, error }`. `createDatabaseBackup()` requires a successful checkpoint before copying the database file. `initializeDatabase()` halts migration immediately if a pre-migration backup fails. `restoreDatabaseFromBackup()` verifies the backup first, stages restoration in a temporary file, verifies the staged file, safely preserves original files, replaces target, removes stale WAL/SHM files, verifies the restored database, and automatically rolls back if any step fails.

### Issue 5: Test Suite Polluting Developer Database `prisma/dev.db`
- **Before:** `vitest.config.ts` hardcoded `DATABASE_URL: file:.../prisma/dev.db`. Every run of `npm test` executed mutations directly against the developer's local database.
- **After:** Removed `prisma/dev.db` from `vitest.config.ts`. Added `tests/setup.ts` which generates a temporary isolated database in `os.tmpdir()` with worker-unique paths, applies the baseline schema, and tears down the directory and Prisma connections in `afterAll()`. Automated tests verify that `prisma/dev.db` remains 100% byte-identical before and after test execution.

### Issue 6: Race Conditions and Inaccurate Reporting on Electron Shutdown
- **Before:** `app.on("before-quit")` was synchronous, called asynchronous `nextServer.close()` without waiting for in-flight requests, did not disconnect Prisma, ran WAL checkpointing while database operations might still be active, and unconditionally logged success.
- **After:** Implemented `electron/shutdown.js` and wired it to `before-quit` with `event.preventDefault()`. Enforces strict shutdown sequencing: (1) stop accepting new requests, (2) drain active HTTP connections with timeout, (3) close Next.js HTTP server, (4) call `prisma.$disconnect()`, (5) execute SQLite WAL checkpoint (TRUNCATE) only after database activity has ceased, and (6) return a comprehensive summary object with accurate error logging.

### Issue 7: Absence of Packaged Windows Runtime in CI
- **Before:** `.github/workflows/ci.yml` only ran Linux unit/integration tests and did not test the packaged Electron application on Windows.
- **After:** Added `electron-windows` job running on `windows-latest`. Builds and packages the app with `npm run electron:pack`, launches the binary with a fresh isolated `--user-data-dir`, verifies automatic SQLite provisioning, checks schema version 1 and integrity `ok`, verifies table presence, and cleanly shuts down.

---

## 3. Files Modified and Created

| File | Action | Purpose |
|------|--------|---------|
| `electron/database/schema-validator.js` | Modified | Structural validation of foreign keys, unique constraints, primary keys, types, and nullability. |
| `electron/database/migrator.js` | Modified | Atomic metadata recording (re-throws on failure to trigger transaction rollback). |
| `electron/database/migrations.js` | Modified | Single-source migration loader, LF-normalized SHA-256 checksum, exact DDL alignment. |
| `electron/database/backup.js` | Modified | Checkpoint result reporting, fail-safe backup creation, staged non-destructive restoration with rollback. |
| `electron/database/lifecycle.js` | Modified | Abort migrations on failed pre-migration backup, propagate checkpoint status on shutdown. |
| `electron/database/index.js` | Modified | Re-export schema validator functions. |
| `electron/shutdown.js` | Created | Graceful shutdown sequencing engine (server drain -> server close -> Prisma disconnect -> WAL checkpoint). |
| `electron/main.js` | Modified | Asynchronous `before-quit` handler with `performShutdownSequence`. |
| `.github/workflows/ci.yml` | Modified | Added Windows packaged Electron runtime provisioning and validation job. |
| `vitest.config.ts` | Modified | Removed `prisma/dev.db` from `test.env`, registered `setupFiles: ['./tests/setup.ts']`. |
| `tests/setup.ts` | Created | Worker-isolated temporary SQLite database provisioning and teardown. |
| `tests/database/legacy-compatibility.test.ts` | Modified | 8 tests including negative tests for missing FKs, missing unique indexes, wrong cascade rules, incompatible columns, and metadata rollback. |
| `tests/database/migration-consistency.test.ts` | Created | 5 tests for single-source migration DDL parity, `updatedAt` investigation, and authentic checksums. |
| `tests/database/backup-failure-injection.test.ts` | Created | 7 tests for checkpoint failure, backup creation failure, corrupt file rejection, and restoration rollback. |
| `tests/database/shutdown-sequencing.test.ts` | Created | 4 tests for shutdown order, request draining timeout, error reporting, and skipped checkpoints. |
| `tests/database/isolation.test.ts` | Created | 3 tests verifying test database isolation in `os.tmpdir()` and zero mutation of `prisma/dev.db`. |

---

## 4. Test Results

### 4.1 Vitest Suite Summary
Total test files: **14**  
Total tests: **136**  
Passed: **136**  
Failed: **0**  

```
 ✓ tests/security/electron-navigation.test.ts (20 tests)
 ✓ tests/security/electron-ipc.test.ts (10 tests)
 ✓ tests/database/isolation.test.ts (3 tests)
 ✓ tests/database/migration-consistency.test.ts (5 tests)
 ✓ tests/database/shutdown-sequencing.test.ts (4 tests)
 ✓ tests/unit/unified-search.test.ts (17 tests)
 ✓ tests/database/backup-failure-injection.test.ts (7 tests)
 ✓ tests/database/legacy-compatibility.test.ts (8 tests)
 ✓ tests/security/validation.test.ts (17 tests)
 ✓ tests/database/lifecycle.test.ts (16 tests)
 ✓ tests/unit/media-formatting.test.ts (5 tests)
 ✓ tests/unit/modal-state-reset.test.ts (2 tests)
 ✓ tests/security/get-user.test.ts (3 tests)
 ✓ tests/security/tenant-isolation.test.ts (19 tests)

 Test Files  14 passed (14)
      Tests  136 passed (136)
   Duration  1.89s
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
- **Clean UserData Directory:** Isolated temporary directory in `$env:TEMP`
- **Launch Command:** `Start-Process "dist\win-unpacked\Media Locker.exe" -ArgumentList "--user-data-dir=\"$cleanDir\""`
- **Runtime Process Status:** Started successfully.
- **Provisioned Database File:** `mlocker.db` (69,632 bytes) created automatically inside the clean `userData` directory.
- **Database Inspection Results:**
  - `PRAGMA user_version`: `1`
  - `PRAGMA integrity_check`: `ok`
  - Created Tables: `User`, `UserMedia`, `Collection`, `CollectionItem`, `_prisma_migrations`
- **Clean Termination:** Process terminated safely, clean directory removed.

---

## 6. Remaining Limitations & Architectural Boundaries

1. **Unsupported Legacy Schemas:** If an older database lacks essential foreign keys (e.g. `UserMedia.userId -> User.id`) or required unique constraints (e.g. unique email), the migration runner will deliberately halt with `MigrationError` rather than guessing a destructive schema mutation. A manual data export or repair utility would be needed for arbitrary non-MLocker schemas.
2. **Next.js In-Process Shutdown:** In production desktop mode, Next.js runs in-process inside the Electron main process. If an active HTTP request hangs indefinitely beyond the `drainTimeoutMs` (default 3 seconds), `closeAllConnections()` will terminate the socket to prevent the Electron app from hanging on exit.

---

## 7. Version Control & CI Information

- **Implementation Commit SHA:** `30033d295f58e7fee93d66b8631360d50f9e9411`
- **GitHub Actions Run ID:** `44562218501`
- **GitHub Actions Run URL:** [https://github.com/AryanTechie-007/MLocker/actions/runs/44562218501](https://github.com/AryanTechie-007/MLocker/actions/runs/44562218501)
- **Overall Run Conclusion:** `success`
- **Verified Jobs & Steps:**
  - **Job 1: Build and Test (Linux) (`ubuntu-latest`) — `success`**
    1. `Set up job` — success
    2. `Check out repository` — success
    3. `Set up Node.js 24` — success
    4. `Install dependencies` (`npm ci`) — success
    5. `Generate Prisma client & apply SQLite migrations` (`npx prisma generate && npx prisma migrate deploy`) — success
    6. `Type check` (`npx tsc --noEmit`) — success
    7. `Lint` (`npm run lint`) — success
    8. `Run tests` (`npm test`, 136 tests across 14 suites) — success
    9. `Build Next.js` (`npm run build`) — success
  - **Job 2: Electron Windows Package & Runtime Validation (`windows-latest`) — `success`**
    1. `Set up job` — success
    2. `Check out repository` — success
    3. `Set up Node.js 24` — success
    4. `Install dependencies` (`npm ci`) — success
    5. `Generate Prisma client & apply SQLite migrations` — success
    6. `Build Next.js & package Electron application` (`npm run electron:pack`) — success
    7. `Verify clean-install packaged Electron runtime` — success (verified clean launch, `mlocker.db` auto-provisioning, `PRAGMA user_version = 1`, `PRAGMA integrity_check = ok`, all 5 tables present, and clean termination)
