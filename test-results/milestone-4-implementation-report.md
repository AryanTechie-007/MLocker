# MLocker — Milestone 4 Implementation & Audit Report

**Date:** November 20, 2026  
**Auditor / Agent:** Antigravity  
**Repository:** `AryanTechie-007/MLocker`  
**Branch:** `main`  
**Target Milestone:** Milestone 4 — External Source Manager & Link Launcher  
**Status:** **COMPLETE & VERIFIED (Ready for Project Owner Acceptance Review)**  

---

## 1. Executive Summary

Milestone 4 introduces personal **External Source Management** and a secure **Link Launcher** across both Web and Electron desktop environments. Users can attach multiple external destination sources (e.g. Netflix, Crunchyroll, Steam, Open Library, MangaDex, Kindle, custom streams) to any library item, complete with custom labels, normalized domains, and automatic type categorization.

All six phases of Milestone 4 have been executed sequentially and verified in accordance with `AGENTS.md`, `implementation-plan.md`, and `.agents/skills/secure-development/SKILL.md`:
- **Phase 1 (Pure Domain):** URL validation, protocol allowlisting (`http:`, `https:` only), domain canonicalization (`extractNormalizedDomain`), and Zod schemas with zero framework imports.
- **Phase 2 (Prisma Schema & Migration):** `MediaSource` model and `UserMedia.sources` cascade relation with canonical migration `20261120000000_media_source`.
- **Phase 3 (Desktop Migrator Registry Sync):** Embedded zero-CLI migrator registered with authentic SHA-256 checksum matching Prisma CLI byte-for-byte; verified on fresh install, existing baseline, and supported legacy schemas.
- **Phase 4 (Authenticated REST APIs & IDOR Prevention):** `GET /api/media/[id]/sources`, `POST /api/media/[id]/sources`, `PATCH /api/sources/[id]`, and `DELETE /api/sources/[id]` with relational ownership isolation returning HTTP 401 on unauthenticated calls and HTTP 404 on IDOR attempts.
- **Phase 5 (UI & Link Launcher):** Interactive `ExternalSourceManager` component on the Media Detail page (`/media/[id]`) with live domain preview, add/edit modal, delete confirmation, and safe link launching (`window.electronAPI.openExternal` in desktop; `target="_blank" rel="noopener noreferrer"` in web).
- **Phase 6 (Comprehensive Quality Gates):** All 22 test files and 295 automated tests passing with zero failures, 0 TypeScript errors, 0 ESLint warnings, and a successful Next.js production build.

---

## 2. Requirements & Verification Matrix

| Milestone 4 Acceptance Criteria | Implementation Details | Verification Evidence | Finding Classification |
| :--- | :--- | :--- | :--- |
| **1. Multi-source support** | `MediaSource` table attached to `UserMedia` with fields `id`, `userMediaId`, `name`, `url`, `normalizedDomain`, `sourceType`, `createdAt`, `updatedAt`. | Verified in `tests/security/source-tenant-isolation.test.ts` (multiple sources attached to single item). | **PASS** |
| **2. Relational tenant isolation** | Endpoints verify `userMedia.userId === session.userId`. IDOR mutations, reads, and deletes return HTTP 404 to prevent resource existence disclosure. | 14 automated tests in `tests/security/source-tenant-isolation.test.ts` verifying unauthenticated rejection and cross-user rejection. | **PASS** |
| **3. Protocol allowlist & URL validation** | Only `http:` and `https:` URLs permitted. Schemes such as `javascript:`, `file:`, `data:`, `blob:`, `vbscript:`, and custom OS schemes are rejected at the pure domain boundary. | 75 pure domain unit tests in `tests/unit/source-domain.test.ts` and 4 launcher tests in `tests/unit/link-launcher.test.ts`. | **PASS** |
| **4. Domain normalization** | Hostnames canonicalized to lowercase, trailing dots and leading `www.` stripped while preserving subdomains (e.g., `store.steampowered.com`). | Verified in `tests/unit/source-domain.test.ts` across standard URLs, credentials, ports, and internationalized hosts. | **PASS** |
| **5. Safe link launching** | Electron delegates to `window.electronAPI.openExternal(url)` to open URLs in the OS default browser. Web opens via `window.open` with `noopener,noreferrer`. No untrusted pages load inside the Electron window. | Verified in `tests/unit/link-launcher.test.ts` and `tests/security/electron-navigation.test.ts`. | **PASS** |
| **6. Database & migration invariance** | Single migration source of truth with canonical migration `20261120000000_media_source`. SHA-256 checksum recorded in `electron/database/migrations.js`. | Verified in `tests/database/migration-consistency.test.ts` (6/6 tests passed). | **PASS** |
| **7. Cascade deletion** | Deleting a parent `UserMedia` automatically cascades to delete all attached `MediaSource` records. | Verified in `tests/security/source-tenant-isolation.test.ts` and independent database audit script. | **PASS** |
| **8. Milestone 4 Remote CI Run** | Full CI pipeline execution on GitHub Actions across Linux and Windows runners for the Milestone 4 commits. | Requires `git push origin main`, which is gated awaiting project-owner authorization. | **NOT VERIFIED (Pending Push Authorization)** |
| **9. Session tracking integration** | Connecting external sources to automated activity tracking and heartbeat emissions. | Out of Milestone 4 scope. Designated strictly for Milestones 5 & 6 per roadmap. | **DEFERRED (Milestone 5/6 Scope)** |

---

## 3. Git Synchronization & Working Tree Audit

### 3.1 Local HEAD & Upstream Divergence
- **Local HEAD:** `c37e9cbd5afceaf2e0da833800312bbcb7d86cb1` (`c37e9cb`)
- **Remote tracking `origin/main`:** `6b091debfbac2187ec6ec8891491758abc925b15` (`6b091de`)
- **Exact Divergence:** Local `main` is strictly **7 commits ahead** of `origin/main`. Zero uncommitted changes. Working tree is clean.
- **Push status:** **UNPUSHED** (Gated awaiting explicit project-owner authorization).

### 3.2 Seven Local Commits Inventory:
1. `1366bb0e4add9063dd453438d434659dc12f1bf5` — `docs: record formal user acceptance and approval of Milestone 3`
2. `4889b6950fdf755ac841038d93893f1703c0f530` — `docs: add Milestone 4 implementation readiness review and plan`
3. `2be3ae08a5bd142871f3af0dfdfce6c862051c8e` — `feat(domain): implement Phase 1 pure domain URL normalization and source validation schemas`
4. `1da2c231a79e445b974915995a46179efa78bbaf` — `feat(database): add MediaSource model, Prisma migration, and embedded SQLite migrator registry sync (Phases 2 & 3)`
5. `82324523b197ce2610aea7b24ccfea6919ceec62` — `feat(api): implement authenticated external source CRUD endpoints with strict tenant isolation (Phase 4)`
6. `76fe94c39e7f4567e4b7c88141bda11e7807342d` — `feat(ui): add ExternalSourceManager component and secure link launcher on media detail page (Phase 5)`
7. `c37e9cbd5afceaf2e0da833800312bbcb7d86cb1` — `docs(milestone-4): record implementation report and update plan to complete & verified`

### 3.3 Changed-File Inventory (24 files changed, +2849 / -65 lines):
- `ANTIGRAVITY-PROMPTS.md` (Modified)
- `electron/database/migrations.js` (Modified)
- `implementation-plan.md` (Modified)
- `prisma/migrations/20261120000000_media_source/migration.sql` (Added)
- `prisma/schema.prisma` (Modified)
- `src/app/api/media/[id]/route.ts` (Modified)
- `src/app/api/media/[id]/sources/route.ts` (Added)
- `src/app/api/sources/[id]/route.ts` (Added)
- `src/app/media/[id]/page.tsx` (Modified)
- `src/components/ExternalSourceManager.tsx` (Added)
- `src/lib/api/types.ts` (Modified)
- `src/lib/domain/source-domain.ts` (Added)
- `src/lib/domain/validation.ts` (Modified)
- `src/lib/launch-url.ts` (Added)
- `test-results/milestone-3-final-acceptance-report.md` (Modified)
- `test-results/milestone-4-implementation-report.md` (Added)
- `test-results/milestone-4-readiness-and-plan.md` (Added)
- `tests/database/legacy-compatibility.test.ts` (Modified)
- `tests/database/lifecycle.test.ts` (Modified)
- `tests/database/migration-consistency.test.ts` (Modified)
- `tests/security/source-tenant-isolation.test.ts` (Added)
- `tests/setup.ts` (Modified)
- `tests/unit/link-launcher.test.ts` (Added)
- `tests/unit/source-domain.test.ts` (Added)

---

## 4. Electron Security & Navigation Audit

A comprehensive static and dynamic security audit was performed across the Electron main process, preload bridge, and IPC handlers:

### 4.1 Preload Bridge Isolation (`electron/preload.js`)
- **Exposed Surface (Lines 1–8):**
  Only a single hardened namespace `electronAPI` is exposed in the main world:
  ```javascript
  contextBridge.exposeInMainWorld("electronAPI", {
    isElectron: true,
    platform: process.platform,
    openExternal: (url) => ipcRenderer.invoke("open-external", url),
    getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  });
  ```
- **Finding:** Only two typed methods are exposed. No raw `ipcRenderer`, no `require`, no Node `process` (except platform string), and no arbitrary channel invocation is accessible to the renderer. (**PASS**)

### 4.2 BrowserWindow Security Options (`electron/main.js`)
- **Isolation Settings (Lines 159–165):**
  ```javascript
  webPreferences: {
    preload: path.join(__dirname, "preload.js"),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  }
  ```
- **Finding:** Hardened Chromium sandbox enabled, Node integration strictly disabled, context isolation strictly enabled. (**PASS**)

### 4.3 Navigation & Child Window Denial (`electron/ipc-handlers.js`)
- **New Window Denial (Lines 38–49):**
  `handleWindowOpen` intercepts all `window.open` requests from `webContents.setWindowOpenHandler`. It unconditionally returns `{ action: "deny" }`. Child `BrowserWindow` instances can never be created.
- **External URL Re-Validation in Main Process (Lines 11–25):**
  `handleOpenExternal(shell, url)` validates `typeof url === "string"`, trims whitespace, parses using `new URL()`, and verifies `parsed.protocol === "http:" || parsed.protocol === "https:"`. Schemes like `file:`, `javascript:`, `data:`, `blob:`, `smb:`, or custom OS schemes are rejected and never passed to `shell.openExternal`.
- **In-Window Navigation Guard (Lines 59–90):**
  `handleWillNavigate` blocks non-HTTP/HTTPS protocols first (`reason: "blocked_protocol"`). For external HTTP/HTTPS URLs, it cancels in-app navigation with `event.preventDefault()` and delegates safely to the OS system browser via `handleOpenExternal` (`reason: "external_opened"`). Untrusted content can never render inside the Electron window.
- **IPC Handler Channel Whitelist (Lines 95–98):**
  `registerIpcHandlers` registers only two channels: `"open-external"` and `"get-app-version"`. No raw shell, CLI, or database channels exist.
- **Finding:** All Electron security invariants confirmed. Verified with 20 navigation tests (`tests/security/electron-navigation.test.ts`) and 10 IPC tests (`tests/security/electron-ipc.test.ts`). (**PASS**)

---

## 5. Database Upgrade & Integrity Verification (Disposable Test Run)

An independent automated verification script was executed against disposable SQLite database files across four test scenarios.

### Actual Command Output:
```
=== MLOCKER DATABASE UPGRADE & INTEGRITY AUDIT ===
Disposable test directory: C:\Users\vaan2\AppData\Local\Temp\mlocker-db-audit-6xD7Fw

--- TEST 1: Fresh Installation ---
  [Fresh Install] [MLocker Lifecycle] Initializing database at C:\Users\vaan2\AppData\Local\Temp\mlocker-db-audit-6xD7Fw\fresh_install.db (packaged: false, fresh: true)
  [Fresh Install] [MLocker Migrator] Initial schema validation (version 0): status=FRESH, compatible=true
  [Fresh Install] [MLocker Migrator] Applying migration v1: 20261119000000_init...
  [Fresh Install] [MLocker Migrator] Successfully applied migration v1: 20261119000000_init
  [Fresh Install] [MLocker Migrator] Applying migration v2: 20261120000000_media_source...
  [Fresh Install] [MLocker Migrator] Successfully applied migration v2: 20261120000000_media_source
  [Fresh Install] [MLocker Lifecycle] DATABASE_URL established: file:C:/Users/vaan2/AppData/Local/Temp/mlocker-db-audit-6xD7Fw/fresh_install.db
  Fresh install result: isFreshInstall=true, version=2
  PRAGMA user_version: 2 (Expected: 2)
  Tables created: Collection, CollectionItem, MediaSource, User, UserMedia
  PRAGMA integrity_check: {"integrity_check":"ok"}
  PRAGMA foreign_key_check violations: 0

--- TEST 2: Upgrade from Schema Version 1 ---
  Pre-upgrade records: {"users":1,"media":1,"collections":1,"items":1}
  [Upgrade v1->v2] [MLocker Migrator] Applying migration v2: 20261120000000_media_source...
  [Upgrade v1->v2] [MLocker Migrator] Successfully applied migration v2: 20261120000000_media_source
  Applied migrations: ["20261120000000_media_source"]
  PRAGMA user_version after upgrade: 2
  Has MediaSource table: true
  Preserved User: V1 User (v1@test.local)
  Preserved Media: Interstellar (Rating: 9.2, Status: completed)
  PRAGMA integrity_check: {"integrity_check":"ok"}
  PRAGMA foreign_key_check violations: 0

--- TEST 3: Legacy Database Upgrade ---
  [Legacy Upgrade] [MLocker Migrator] Initial schema validation (version 0): status=SUPPORTED_LEGACY, compatible=true
  [Legacy Upgrade] [MLocker Migrator] Upgrading supported legacy database to baseline v1 (Supported legacy schema detected: missing non-breaking columns (User: [passwordHash]; UserMedia: [status, isFavorite, hoursPlayed, tags]; CollectionItem: [order]))...
  [Legacy Upgrade] [MLocker Baseline] Adding legacy column User.passwordHash...
  [Legacy Upgrade] [MLocker Baseline] Adding legacy column UserMedia.status...
  [Legacy Upgrade] [MLocker Baseline] Adding legacy column UserMedia.isFavorite...
  [Legacy Upgrade] [MLocker Baseline] Adding legacy column UserMedia.hoursPlayed...
  [Legacy Upgrade] [MLocker Baseline] Adding legacy column UserMedia.tags...
  [Legacy Upgrade] [MLocker Baseline] Adding legacy column CollectionItem.order...
  [Legacy Upgrade] [MLocker Migrator] Supported legacy database upgraded and baselined to v1 successfully.
  [Legacy Upgrade] [MLocker Migrator] Applying migration v2: 20261120000000_media_source...
  [Legacy Upgrade] [MLocker Migrator] Successfully applied migration v2: 20261120000000_media_source
  Legacy final version: 2
  Applied migrations count: 2
  Has MediaSource table: true
  Upgraded optional status: 'plan_to_consume' (Default added cleanly)
  Upgraded optional isFavorite: 0
  PRAGMA integrity_check: {"integrity_check":"ok"}
  PRAGMA foreign_key_check violations: 0

--- TEST 4: Foreign Key Cascade Deletion ---
  Initial sources attached to m_cas: 2
  Executing: DELETE FROM UserMedia WHERE id = 'm_cas'
  Remaining sources after parent UserMedia deletion: 0 (Expected: 0)
  PRAGMA integrity_check: {"integrity_check":"ok"}
  PRAGMA foreign_key_check violations: 0

=== AUDIT COMPLETE: ALL DATABASE LIFECYCLE CHECKS PASSED ===
```
- **Finding:** Fresh installation provisions v2 cleanly; v1 upgrades cleanly preserving all user data; legacy baseline upgrades and migrates to v2 cleanly; cascade delete completely purges child sources upon parent media deletion; SQLite integrity check returns `"ok"` with 0 FK violations across all scenarios. (**PASS**)

---

## 6. Test Failure Reconciliation & Resolution Log

During the active implementation session, 4 distinct failures occurred across intermediate test runs. Each failure was rigorously investigated, diagnosed to its root cause, and resolved without weakening or removing any test:

### 1. `tests/database/lifecycle.test.ts` (4 failed assertions)
- **Original Failure:** `AssertionError: expected 2 to be 1` at lines 83, 111, 145, 230.
- **Root Cause:** Tests had hardcoded `expect(version).toBe(1)` from Milestone 2 when only 1 migration existed. With version 2 registered, the database legitimately initialized to version 2. Multi-step test also used a synthetic migration numbered version 2, colliding with real version 2.
- **Files Changed:** `tests/database/lifecycle.test.ts`.
- **Correction:** Updated assertions to test against dynamic `LATEST_SCHEMA_VERSION` (2), verified `expect(tables).toContain("MediaSource")`, and renumbered synthetic test migrations to version 3.
- **Verification:** All 16 tests passed. Zero tests weakened or removed.

### 2. `tests/database/legacy-compatibility.test.ts` (3 failed assertions)
- **Original Failure:** `AssertionError: expected 2 to be 1` at lines 142, 217, 850; `ReferenceError: LATEST_SCHEMA_VERSION is not defined`.
- **Root Cause:** Legacy schema upgrade tests asserted that the migration stopped at version 1 after baselining. Because `MIGRATIONS` contained version 2, the runner correctly baselined to 1 and then migrated to 2.
- **Files Changed:** `tests/database/legacy-compatibility.test.ts`.
- **Correction:** Imported `LATEST_SCHEMA_VERSION` from `electron/database/migrations` and asserted that legacy databases baseline and migrate fully to `LATEST_SCHEMA_VERSION` (2).
- **Verification:** All 15 tests passed. Zero tests weakened or removed.

### 3. `tests/security/source-tenant-isolation.test.ts` (6 failed tests)
- **Original Failure:** `PrismaClientKnownRequestError: The table main.MediaSource does not exist in the current database` (`code: 'P2021'`).
- **Root Cause:** Worker isolation in `tests/setup.ts` only applied migration 1 (`20261119000000_init/migration.sql`) to newly created temporary worker databases.
- **Files Changed:** `tests/setup.ts`.
- **Correction:** Updated `tests/setup.ts` to detect and execute `20261120000000_media_source/migration.sql` during worker database setup and set `PRAGMA user_version = 2`.
- **Verification:** All 14 tests in `source-tenant-isolation.test.ts` passed. Zero tests weakened or removed.

### 4. ESLint Check on `ExternalSourceManager.tsx` (2 lint errors)
- **Original Failure:** `Unexpected any. Specify a different type @typescript-eslint/no-explicit-any` at lines 159 and 179.
- **Root Cause:** Catch blocks used `catch (err: any)`.
- **Files Changed:** `src/components/ExternalSourceManager.tsx`.
- **Correction:** Refactored to typed `catch (err: unknown)` with runtime type narrowing (`const msg = err instanceof Error ? err.message : ...`).
- **Verification:** `npm run lint` clean (0 errors, 0 warnings).

### Test Count Preservation Audit:
- **Milestone 3 Test Count:** 201 automated tests across 19 suites.
- **Milestone 4 Test Count:** 295 automated tests across 22 suites (+94 new tests).
- **Audit Confirmation:** No test was deleted, commented out, or weakened. Test count increased monotonically.

---

## 7. Automated Test Coverage & Quality Gates

```
 Test Files  22 passed (22)
      Tests  295 passed (295)
   Duration  4.44s
```

### Test Suite Breakdown:
1. `tests/unit/source-domain.test.ts` (75 tests): Pure domain URL validation, protocol allowlisting, normalization, type classification.
2. `tests/security/source-tenant-isolation.test.ts` (14 tests): Unauthenticated 401s, IDOR 404s, cross-tenant isolation, cascade deletion.
3. `tests/unit/link-launcher.test.ts` (4 tests): Protocol validation, Electron bridge delegation, web fallback with noopener/noreferrer.
4. `tests/database/migration-consistency.test.ts` (6 tests): SHA-256 authentic checksum, v1 & v2 schema parity, SQLite column & constraint checks.
5. `tests/database/lifecycle.test.ts` (16 tests): Lifecycle, fresh installs, backups, WAL checkpoints, graceful shutdown.
6. `tests/database/legacy-compatibility.test.ts` (15 tests): Structural legacy schema validation, safe baselining, and non-breaking column upgrades.
7. `tests/security/electron-navigation.test.ts` (20 tests): Protocol allowlisting, child window denial, in-app navigation guards.
8. `tests/security/electron-ipc.test.ts` (10 tests): Channel whitelisting, shell argument sanitization, version retrieval.
9. `tests/security/validation.test.ts` (25 tests): Zod validation schemas across categories, ratings, progress fields, and URLs.
10. `tests/security/tenant-isolation.test.ts` (19 tests): Media and collections tenant isolation.
11. `tests/security/get-user.test.ts` (3 tests): Session extraction and rejection of unauthenticated requests.
12. `tests/database/backup-failure-injection.test.ts` (7 tests): Fail-safe backup restoration and checkpoint error handling.
13. `tests/database/shutdown-sequencing.test.ts` (4 tests): Server drain, connection closure, WAL truncate checkpoints.
14. `tests/database/isolation.test.ts` (3 tests): Worker database isolation in os.tmpdir().
15. `tests/unit/kitsu-provider.test.ts` (9 tests): Kitsu anime and manga provider search and error resilience.
16. `tests/unit/openlibrary-provider.test.ts` (5 tests): Open Library book search and rating mapping.
17. `tests/unit/tmdb-anime-classification.test.ts` (8 tests): Strict anime classification and TV/movie leakage elimination.
18. `tests/unit/unified-search-categories.test.ts` (17 tests): Multi-category search routing, fallback resilience.
19. `tests/unit/unified-search.test.ts` (17 tests): Unified search query dispatching.
20. `tests/unit/ui-category-controls.test.ts` (11 tests): UI contracts across modals, search pills, and category badges.
21. `tests/unit/modal-state-reset.test.ts` (2 tests): Add/Edit modal state reset on item change.
22. `tests/unit/media-formatting.test.ts` (5 tests): Formatting helpers for duration, episodes, and chapters.

### Quality Gate Summary:
- **TypeScript (`npx tsc --noEmit`):** ✅ Clean (0 errors).
- **ESLint (`npm run lint`):** ✅ Clean (0 errors, 0 warnings).
- **Vitest (`npm test`):** ✅ 22 files passed, 295 tests passed, 0 failures.
- **Production Build (`npm run build`):** ✅ Success (All 18 routes compiled cleanly).

---

## 8. Milestone 4 Remote CI Status

- **Prior Baseline Reference:** GitHub Actions Run [44593093753](https://github.com/AryanTechie-007/MLocker/actions/runs/44593093753) was for **Milestone 3** completion.
- **Milestone 4 CI Status:** **NOT VERIFIED (Pending Push Authorization)**.
- **Reason:** The seven Milestone 4 commits reside on local `main` (`c37e9cb`). In accordance with project instructions (*"Do not push without authorization"*), no remote push has been made. Remote CI execution across Ubuntu Linux and Windows Server runners will be triggered as soon as the project owner authorizes `git push origin main`.

---

## 9. Conclusion & Awaiting Review

All local implementation, security verification, database upgrade testing, and quality gates for **Milestone 4 — External Source Manager & Link Launcher** are **COMPLETE and PASSING**.

Milestone 5 (Session Engine and Manual Tracking Foundation) remains strictly gated and will not begin. Standing by for project-owner review and push authorization.
