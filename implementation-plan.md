# MLocker Implementation Plan

**Project:** [AryanTechie-007/MLocker](https://github.com/AryanTechie-007/MLocker)  
**Status:** Active Implementation Plan (Milestones 0–2.1 Complete & Verified; Milestone 3 Next)  
**Product decisions:** Web + desktop; automatic activity tracking; local-first storage with optional cloud synchronisation.

---

## Current Project Position

**Current position:** Milestones 0–2.1 are complete and verified. The next milestone is **Milestone 3 — Six Media Categories**.

The first task for Milestone 3 is an **audit-only investigation** of:
- Movies (`MOVIE`)
- TV Shows (`TV_SHOW`)
- Anime (`ANIME`)
- Manga (`MANGA`)
- Games (`GAME`)
- Books/Novels (`BOOK`/`NOVEL`)

The audit must inspect schema, enums, search providers, unified search, manual entry, CRUD APIs, filters, navigation, detail pages, category-specific progress tracking, and tests.

Determine whether `BOOK`, `NOVEL`, or other naming conventions already exist across the codebase and database. Do not blindly rename enums or alter stored data.

> [!IMPORTANT]
> **No Milestone 3 feature implementation should begin until the audit findings have been reviewed and approved.**

---

## 1. Product direction

MLocker should evolve into a cross-platform personal media library that helps users organise media, launch their own chosen external sources, automatically record supported activity sessions, and view their consumption history.

### Confirmed decisions

| Decision | Direction |
|---|---|
| **Platforms** | Both web and desktop |
| **Tracking** | Automatic, for supported sources |
| **Storage** | Local-first with optional cloud sync |
| **External content** | User-configured links; MLocker does not host or distribute media |

### Product principles

1. Preserve and improve the existing application. Do not rewrite it without a demonstrated technical reason.
2. Keep the six intended media categories coherent: Movies, TV Shows, Anime, Manga, Games, and Books/Novels.
3. Make the tracking engine independent of any one tracking integration.
4. Treat session time as observed active time, not proof that content was actually watched or read.
5. Keep user data private, scoped to the correct account, and exportable.
6. Build incrementally, with tests and working vertical slices at every milestone.

---

## 2. Current-codebase constraints and baseline audit resolutions

The repository has an existing Next.js/React web application, Electron desktop application, Prisma data layer, and SQLite setup. Retain these foundations unless implementation evidence shows they are unsuitable.

The baseline source audit identified the following items, with their verified resolution status:

- **Unauthenticated requests guest fallback:** Resolved in Milestone 1 (`src/lib/get-user.ts` returns typed 401 Unauthorized; zero guest fallback).
- **Collection-item cross-user association IDOR:** Resolved in Milestone 1 (`src/app/api/collections/[id]/route.ts` enforces dual-ownership validation).
- **Electron database clean-install provisioning & migrations:** Resolved in Milestones 2 & 2.1 (canonical migration `20261119000000_init`, zero-CLI embedded runner, single source of truth, fail-safe backups, strict legacy validation).
- **API payload validation:** Resolved in Milestone 1 (`src/lib/domain/validation.ts` pure domain Zod schemas for all mutations and queries).
- **Publicly embedded credentials & fallback secrets:** Resolved in Milestone 1 (committed TMDB key removed; dynamic 32-byte desktop secret).
- **Manga and Novel support incomplete:** Target for Milestone 3 (search providers, unified search, library filters, detail pages, category progress).
- **Add/Edit modal state stale on item change:** Resolved in Milestone 1 (form state resets during render upon item switch).
- **Search request cancellation & debounce:** Target for Milestone 3.
- **Statistics aggregation in database:** Target for Milestone 8.
- **Aggregate time fields vs session tracking:** Target for Milestone 5.

---

## 3. Target architecture

### 3.1 Clients

**Web client**
- Continue using Next.js and React.
- Read and write account data through authenticated backend APIs.
- Support library management, source registration, launching, session history, analytics, and sync status.
- Do not attempt to inspect unrelated browser tabs; normal web pages cannot do this.

**Desktop client**
- Continue using Electron.
- Use a local SQLite database as the primary working copy.
- Support offline library access and queued changes.
- Launch external URLs through the system browser.
- Provide a secure, narrow IPC surface between renderer and main process.
- Keep the database under Electron's application user-data directory, not in a fragile packaged-resource path.

**Browser extension**
- Build a Chromium-compatible extension first, using the WebExtension API where practical.
- Track only user-registered sources and only after explicit permission.
- Detect supported tab activation, focus and idle signals.
- Send minimal activity events to the desktop companion or authenticated backend.
- Do not collect unrelated browsing history, page contents, passwords, form inputs, or credentials.

### 3.2 Backend and persistence

| Layer | Technology |
|---|---|
| Web and API | Existing Next.js application |
| ORM | Existing Prisma |
| Desktop persistence | SQLite |
| Cloud persistence | PostgreSQL |
| Validation | Zod |
| Charts | Existing Recharts setup, if still appropriate |
| Browser activity | WebExtension API |
| Desktop bridge | Electron IPC plus authenticated loopback bridge, if required |

The desktop and cloud databases are separate stores. **Do not synchronise SQLite database files.** Synchronise versioned records and changes through authenticated APIs.

The cloud service should be optional for local-only use. The web application requires cloud access; the desktop application must remain useful offline.

### 3.3 Logical architecture

```text
Web client ───────────────┐
                          ├── Authenticated Next.js API ── PostgreSQL
Electron desktop ─────────┘             ▲
    │                                   │
    ├── Local SQLite                    │
    ├── External browser launcher       │
    └── Secure local bridge ◄── Browser extension
                                       │
                              Activity events
                                       │
                              Session engine
```

The session engine must accept events from multiple providers in the future. The browser extension is one event producer, not the owner of session logic.

---

## 4. Core data model

Adapt names and relations to the existing Prisma schema. Do not paste these sketches blindly; inspect current `UserMedia` and user relations first.

### 4.1 `MediaSource`
Represents a user-configured external destination attached to one media-library entry.

Suggested fields:
- `id`
- `userMediaId`
- `name`
- `url`
- `normalizedDomain`
- `sourceType`
- `createdAt`
- `updatedAt`
- optional URL matching configuration, designed conservatively

Requirements:
- A media item can have multiple sources.
- A source must belong to a media item owned by the same user.
- Only `http` and `https` URLs should be accepted; prefer HTTPS.
- Reject dangerous protocols such as `javascript:`, `data:`, and `file:`.
- Never treat a user-provided URL as trusted HTML or executable content.

### 4.2 `ConsumptionSession`
Represents a bounded period of detected activity.

Suggested fields:
- `id`
- `userMediaId`
- optional `sourceId`
- optional `deviceId`
- `startedAt`
- optional `endedAt`
- `durationSeconds`
- `trackingMethod`
- `status`
- `createdAt`
- `updatedAt`

Use UTC timestamps. Store duration as a derived or periodically updated value with clear rules. Prevent negative durations and overlapping duplicate sessions caused by retries.

### 4.3 `ActivityEvent`
Append-oriented event log for recoverability and diagnostics.

Suggested event types:
- `TAB_ACTIVATED`
- `TAB_DEACTIVATED`
- `WINDOW_FOCUSED`
- `WINDOW_BLURRED`
- `IDLE`
- `ACTIVE`
- `HEARTBEAT`
- `SOURCE_MATCHED`
- `EXTENSION_DISCONNECTED`

Store only the minimum event metadata needed to reconstruct a session. Apply retention limits so this does not become an unnecessary browsing-history database.

### 4.4 `Device`
Identifies a desktop installation or paired extension installation.

Suggested fields:
- `id`
- `userId`
- `deviceType`
- `displayName`
- `createdAt`
- `lastSeenAt`
- `revokedAt`

Use revocable, scoped device credentials. Do not give an extension the user's normal long-lived web session cookie or broad account credentials.

### 4.5 `SyncMetadata` / local outbox
Track pending local mutations and server revisions.

Suggested fields:
- record/entity type
- record ID
- operation type
- local revision
- server revision
- queued timestamp
- retry count
- last error
- idempotency key

Use deletion tombstones so a deleted record does not reappear after another device syncs stale data.

### 4.6 Legacy aggregate fields
Do not abruptly remove existing `hoursPlayed` or similar fields. During migration, preserve compatibility and gradually treat session records as the source of truth:

`totalActiveTime = sum(valid session durations)`

A cached aggregate may be maintained for performance, but it must be rebuildable from sessions.

---

## 5. Tracking behaviour and privacy

### 5.1 What automatic tracking can reliably claim
The first release can detect that a registered source was active in a supported browser context. It cannot generally prove that the user watched a video or read a page.

Use the label **Active session time** or **Tracked activity time**, not verified watch/read time.

### 5.2 Session rules
- A source becomes eligible only when it matches a source explicitly registered by the user.
- Accumulate time only while the relevant tab/window is active and the user is not idle, to the extent the platform exposes those signals.
- Pause when the tab loses focus or the user becomes idle.
- Use periodic heartbeats (initial target: 15–30 seconds).
- Treat missing heartbeats as interruption/disconnection, not proof that activity continued.
- Recover or close orphaned sessions after crashes/restarts.
- Make thresholds configurable and document platform limitations.
- Avoid duplicate sessions when the extension retries an event.
- Provide a visible tracking indicator and global pause/disable control.

### 5.3 Progress tracking
Do not infer episode, chapter, page, or video progress from elapsed time alone.

For the MVP:
- Automatically record active sessions.
- Allow manual progress updates.
- Add content-level progress integrations only for services where a reliable and permitted integration is available.
- Keep manual corrections possible and record progress history.

### 5.4 Privacy and security
- Explicitly request extension permissions and explain why each is needed.
- Track only registered sources.
- Do not collect page text, credentials, form data, unrelated URLs, or general browsing history.
- Minimise stored URL data; prefer domain and approved matching patterns where possible.
- Provide pause, disconnect, delete-session, and data-export controls.
- Validate every extension event on the receiving side.
- Authenticate local bridge requests and restrict them to loopback.
- Validate message origin and extension identity.
- Do not expose Node.js APIs to the Electron renderer.
- Never open arbitrary protocols through Electron's external launcher.

---

## 6. Local-first cloud synchronisation

### 6.1 Behaviour
1. Desktop writes to SQLite first.
2. A local outbox records mutations in the same transaction where possible.
3. When online, the client sends queued changes to the authenticated API.
4. The server validates ownership and applies changes to PostgreSQL.
5. The client records the returned server revision and clears acknowledged outbox entries.
6. Other clients fetch changes since their last known revision.
7. Web reads and writes cloud data through the API.

### 6.2 Conflict policy for the first release
- Merge independent record changes.
- Use explicit deletion tombstones.
- Use last-write-wins for simple scalar fields initially, based on server-accepted timestamps/revisions rather than untrusted client clocks alone.
- Keep sessions append-oriented and use idempotency keys.
- Do not silently discard conflicting progress changes; preserve enough history to resolve or inspect them.
- Make sync retries safe and idempotent.

### 6.3 Sync UX
Expose:
- Online/offline state
- Last successful sync time
- Pending changes count
- Sync error with retry action
- Device list and revoke controls
- Clear local-only versus cloud-synced status

Cloud sync must be optional for desktop users. Do not imply that web access is available without a cloud account.

---

## 7. Implementation milestones

Work in small pull requests. Each milestone must be reviewed and tested before the next one begins.

### Milestone 0 — Repository baseline [COMPLETE]
**Status:** Complete  
**Implementation commits:** `dfbced7`, `3b6bc20`, `d98f48b`, `d547ea4`, [`870543a`](https://github.com/AryanTechie-007/MLocker/commit/870543a152d113ae8a0e08f0a0c4f82875b2258a) (feat(ci): add Vitest test runner, GitHub Actions CI workflow, baseline unit tests, and component audit reports)  
**Verification:** Baseline quality checks executed; Vitest suite and GitHub Actions CI workflow (`.github/workflows/ci.yml`) established.

**Tasks**
- [x] Inspect the current default branch and recent commits.
- [x] Confirm package scripts, runtime versions, Prisma schema, API routes, Electron packaging and CI configuration.
- [x] Run the existing lint, typecheck, build and test commands where available.
- [x] Record existing failures before making changes.
- [x] Confirm which audit findings still reproduce.

**Acceptance criteria**
- [x] A baseline report exists.
- [x] Existing commands and failures are documented.
- [x] No unrelated refactor is bundled into the baseline.

### Milestone 1 — Security and application stability [COMPLETE]
**Status:** Complete  
**Implementation commit:** [`2b933d5c089913ce7a139372f3d4329fdb1df986`](https://github.com/AryanTechie-007/MLocker/commit/2b933d5c089913ce7a139372f3d4329fdb1df986)  
**Documentation commit:** [`a95d3bc650e4175bdf447a1515bb55c1b69165b4`](https://github.com/AryanTechie-007/MLocker/commit/a95d3bc650e4175bdf447a1515bb55c1b69165b4)  
**Verification report:** [`test-results/milestone-1-security-report.md`](file:///test-results/milestone-1-security-report.md)  
**CI verification:** GitHub Actions Run [44519584927](https://github.com/AryanTechie-007/MLocker/actions/runs/44519584927) (`status: completed` / `conclusion: success`, 60/60 tests passing across 5 suites).

**Tasks**
- [x] Remove shared unauthenticated guest identity from public web request paths (`src/lib/get-user.ts`).
- [x] Reject unauthenticated requests with typed 401 Unauthorized (`code: "UNAUTHORIZED"`).
- [x] Enforce ownership on every media, collection, source, and session operation.
- [x] Fix collection-to-media cross-user association with dual-ownership verification.
- [x] Add pure domain Zod validation to write APIs (`src/lib/domain/validation.ts`).
- [x] Validate enum values, numeric bounds, progress ranges and required fields.
- [x] Remove hardcoded API keys and predictable fallback secrets; generate dynamic 32-byte desktop secrets.
- [x] Fix modal state resets during render when selected item changes.
- [x] Add regression tests for authorization, tenant isolation, and input validation.

**Acceptance criteria**
- [x] Two test accounts cannot read or mutate each other's records.
- [x] Unauthenticated web requests cannot fall into one shared library.
- [x] Cross-user collection/media association is rejected (HTTP 404).
- [x] Invalid payloads return safe 4xx structured responses.
- [x] No secret is required to be committed to the repository.

### Milestone 1.1 — Residual security fixes [COMPLETE]
**Status:** Complete  
**Implementation commit:** [`5e14af180d710e1b285657be0644c1cd331a82ca`](https://github.com/AryanTechie-007/MLocker/commit/5e14af180d710e1b285657be0644c1cd331a82ca)  
**Verification advisory:** [`test-results/credential-rotation-advisory.md`](file:///test-results/credential-rotation-advisory.md)

**Tasks**
- [x] Enforce tenant-safe read queries filtering strictly by `session.userId`.
- [x] Add Electron IPC test suite covering channel whitelisting and argument validation (`tests/security/electron-ipc.test.ts`).
- [x] Add modal state reset test suite (`tests/unit/modal-state-reset.test.ts`).
- [x] Publish credential rotation advisory for previously exposed development keys.

**Acceptance criteria**
- [x] Tenant-safe reads verified across all collections and media queries.
- [x] Electron IPC security verified with 10 automated unit tests.
- [x] Modal state synchronization verified with automated tests.

### Milestone 1.2 — Electron navigation security [COMPLETE]
**Status:** Complete  
**Implementation commit:** [`c208385ec85e5757217b2afe1e89fbebb693563f`](https://github.com/AryanTechie-007/MLocker/commit/c208385ec85e5757217b2afe1e89fbebb693563f)  
**Documentation commit:** [`9369ea6e492b45e9985923984d4715b7fb582372`](https://github.com/AryanTechie-007/MLocker/commit/9369ea6e492b45e9985923984d4715b7fb582372)  
**Verification report:** [`test-results/milestone-1.2-electron-navigation-report.md`](file:///test-results/milestone-1.2-electron-navigation-report.md)

**Tasks**
- [x] Unify navigation handlers in `electron/ipc-handlers.js` (`handleWindowOpen`, `handleWillNavigate`).
- [x] Deny child window creation unconditionally (`action: "deny"`).
- [x] Delegate external `http:` and `https:` URLs to system default browser via `shell.openExternal`.
- [x] Block dangerous schemes (`file:`, `javascript:`, `data:`, `smb:`, custom protocols).
- [x] Add 16 automated tests in `tests/security/electron-navigation.test.ts`.

**Acceptance criteria**
- [x] Zero child windows can be opened by renderer content.
- [x] Untrusted or dangerous schemes cannot execute through the system shell.

### Milestone 1.2.1 — Protocol allowlist correction [COMPLETE]
**Status:** Complete  
**Implementation commit:** [`856538c42f6a46039ae0db6edf8c7b72b2f4d0fe`](https://github.com/AryanTechie-007/MLocker/commit/856538c42f6a46039ae0db6edf8c7b72b2f4d0fe)  
**Documentation commit:** [`25f7835efb93fb70c79b9fa13511b816ee3844ce`](https://github.com/AryanTechie-007/MLocker/commit/25f7835efb93fb70c79b9fa13511b816ee3844ce)  
**Verification report:** [`test-results/milestone-1.2-electron-navigation-report.md`](file:///test-results/milestone-1.2-electron-navigation-report.md) (Section 5)  
**CI verification:** GitHub Actions Run [44525905345](https://github.com/AryanTechie-007/MLocker/actions/runs/44525905345) (`status: completed` / `conclusion: success`, 93/93 tests passing across 8 suites).

**Tasks**
- [x] Re-order security checks in `handleWillNavigate()` to enforce the strict protocol allowlist (`http:`, `https:`) **before** origin comparison.
- [x] Block same-origin `blob:` and `filesystem:` schemes from in-window navigation.
- [x] Add 4 edge-case regression tests (expanding the navigation suite to 20 tests).

**Acceptance criteria**
- [x] Non-HTTP/HTTPS protocols cannot navigate in-window even if their parsed origin matches localhost.
- [x] CI passes with all 93 tests green.

### Milestone 2 — Database and desktop reliability [COMPLETE]
**Status:** Complete  
**Implementation commit:** [`1b1481f33a8bcefe7fc677611c080d9ad2eb77e6`](https://github.com/AryanTechie-007/MLocker/commit/1b1481f33a8bcefe7fc677611c080d9ad2eb77e6)  
**Follow-up commits:** [`5c794cb3fc2202613d5cfca7431e285a8508f7ce`](https://github.com/AryanTechie-007/MLocker/commit/5c794cb3fc2202613d5cfca7431e285a8508f7ce) (CI Node 24 update), [`8c12fe489a4d64b86fa207a28dab326883700286`](https://github.com/AryanTechie-007/MLocker/commit/8c12fe489a4d64b86fa207a28dab326883700286) (cross-platform test blocker)  
**Documentation commit:** [`aebf1a469a4dc5db8ffcff0a3aa93eb83d47ad9c`](https://github.com/AryanTechie-007/MLocker/commit/aebf1a469a4dc5db8ffcff0a3aa93eb83d47ad9c)  
**Verification report:** [`test-results/milestone-2-database-report.md`](file:///test-results/milestone-2-database-report.md)  
**CI verification:** GitHub Actions Run [44532724671](https://github.com/AryanTechie-007/MLocker/actions/runs/44532724671) (`status: completed` / `conclusion: success`, 109/109 tests passing across 9 suites).

**Tasks**
- [x] Add Prisma migrations for all supported environments (`prisma/migrations/20261119000000_init`).
- [x] Move desktop database storage to Electron's user-data directory (`app.getPath('userData')`).
- [x] Implement first-launch database creation and migration via zero-CLI embedded migrator.
- [x] Handle migration failure with atomic transaction rollback and automatic backup restoration.
- [x] Verify packaged application includes required Prisma engine/runtime assets (`node_modules/.prisma/**/*`).
- [x] Test clean installation, upgrade, restart and backup/restore on a machine without a development database.

**Acceptance criteria**
- [x] A clean desktop install creates a usable database.
- [x] Existing user data survives an application upgrade.
- [x] The application does not depend on a developer's local `prisma/dev.db`.
- [x] Database migration and recovery steps are documented in `test-results/milestone-2-database-report.md`.

### Milestone 2.1 — Database lifecycle corrective audit [COMPLETE]
**Status:** Complete  
**Implementation commits:**
- [`fc8f6b360ba663be0b8df780c80b54fa31697e68`](https://github.com/AryanTechie-007/MLocker/commit/fc8f6b360ba663be0b8df780c80b54fa31697e68) (core corrective audit: single migration source of truth, authentic SHA-256 checksums, fail-safe backups with rollback, test DB isolation, shutdown sequencing engine)
- [`30033d295f58e7fee93d66b8631360d50f9e9411`](https://github.com/AryanTechie-007/MLocker/commit/30033d295f58e7fee93d66b8631360d50f9e9411) (strict structural legacy validation for foreign keys, unique indexes, and Windows Electron CI job)
- [`74a60decde3f813cbfbfb1e02dcb1744be216f99`](https://github.com/AryanTechie-007/MLocker/commit/74a60decde3f813cbfbfb1e02dcb1744be216f99) (complete SQLite column definition validation, semantic default equivalence, and verified graceful Windows Electron shutdown in CI)  
**Documentation commits:** [`2347003`](https://github.com/AryanTechie-007/MLocker/commit/234700346387a6b5790be6b149b5cf4e82f76378), [`7264cf7`](https://github.com/AryanTechie-007/MLocker/commit/7264cf78b663b7df8ad4518d6a8a44ecad9c84e1), [`b16c159`](https://github.com/AryanTechie-007/MLocker/commit/b16c1598f863b7e7343e06716035272a24c16a62), [`2e7560d`](https://github.com/AryanTechie-007/MLocker/commit/2e7560d96d3f2ec8c983ea190180c5c43d2f9746), [`dbf044e`](https://github.com/AryanTechie-007/MLocker/commit/dbf044eee05f81a359dfd00ba402e8b31ccc453b)  
**Verification report:** [`test-results/milestone-2.1-corrective-report.md`](file:///test-results/milestone-2.1-corrective-report.md)  
**CI verification:** GitHub Actions Run [44569027391](https://github.com/AryanTechie-007/MLocker/actions/runs/44569027391) (`status: completed` / `conclusion: success`, 143/143 tests passing across 14 suites, dual-platform Ubuntu + Windows packaged Electron clean-install and verified graceful shutdown with exit code 0).

**Tasks**
- [x] Establish single migration source of truth (`prisma/migrations/20261119000000_init/migration.sql`), resolving divergent `updatedAt` defaults and using authentic SHA-256 checksums in `_prisma_migrations`.
- [x] Implement structural legacy schema validation enforcing foreign keys (`ON DELETE CASCADE`), unique indexes, primary keys, and complete column definitions (nullability and defaults with semantic SQLite equivalence).
- [x] Preserve safe upgrade paths for supported legacy databases legitimately omitting optional columns (`upgradeSupportedLegacySchema`).
- [x] Make backup operations fail-safe: abort migration on failed checkpoint/backup; staged non-destructive restoration with rollback.
- [x] Complete test database isolation in `tests/setup.ts` using worker-unique temporary databases in `os.tmpdir()`, leaving `prisma/dev.db` 100% untouched.
- [x] Implement strict Electron shutdown sequencing in `electron/shutdown.js` (server drain -> server close -> Prisma disconnect -> SQLite WAL checkpoint TRUNCATE).
- [x] Add dual-platform CI coverage in `.github/workflows/ci.yml` with verified packaged Windows Electron launch, database auto-provisioning, SQLite integrity check, and verified graceful shutdown (exit code 0).

**Acceptance criteria**
- [x] Single migration source of truth verified across CLI and Electron migrator.
- [x] Incompatible or corrupted legacy databases are safely rejected without modifying records.
- [x] Test execution does not modify developer's `prisma/dev.db`.
- [x] Windows packaged Electron runtime and graceful shutdown verified in CI.
- [x] All 143 unit and integration tests passing.

### Milestone 3 — Six media categories [NEXT / NOT STARTED]
**Status:** Next / Not started  

> [!IMPORTANT]
> **Do not mark Milestone 3 as started or completed. No implementation for it has been authorized yet.**  
> The first development activity for Milestone 3 is an **audit-only investigation**. No feature implementation should begin until the audit findings have been reviewed and approved.

**Pre-implementation Audit Tasks**
- [ ] Inspect existing naming conventions across codebase, schema, and database: determine whether `BOOK`, `NOVEL`, or other conventions already exist. Do not blindly rename enums or alter stored data.
- [ ] Audit search providers and unified search logic (`src/lib/api/`) across all six categories:
  - Movies (`MOVIE`)
  - TV Shows (`TV_SHOW`)
  - Anime (`ANIME`)
  - Manga (`MANGA`)
  - Games (`GAME`)
  - Books/Novels (`BOOK`/`NOVEL`)
- [ ] Audit CRUD APIs, validation schemas (`src/lib/domain/validation.ts`), and manual entry flows.
- [ ] Audit library navigation tabs, category filters, and detail page layouts.
- [ ] Audit category-specific progress tracking (episodes, chapters, pages, hours) to ensure clean extension without model duplication.
- [ ] Produce a comprehensive Milestone 3 Audit Report for review before writing feature code.

**Implementation Tasks (Pending Audit Review)**
- [ ] Implement search provider integrations and type safety for missing categories.
- [ ] Add category-specific progress fields where needed without duplicating the entire media model.
- [ ] Implement request cancellation and debounce on unified search.
- [ ] Add comprehensive tests for search, CRUD, and progress across all six categories.

**Acceptance criteria**
- [ ] An audit report is approved prior to feature implementation.
- [ ] Users can add, search, edit, browse and track all six categories consistently.
- [ ] Unsupported external metadata is handled gracefully.

### Milestone 4 — External source manager
**Tasks**
- Add `MediaSource` and migration.
- Add source CRUD APIs with ownership validation.
- Build source registration and management UI on media detail pages.
- Implement safe URL validation.
- Add external launch action in Electron and web.
- Add source deletion/update behaviour and associated session handling.

**Acceptance criteria**
- A media item can have multiple user-defined sources.
- Only the owner can manage or launch their registered sources.
- Invalid protocols and malformed URLs are rejected.
- Electron opens approved URLs in the system browser.
- Web opens the source in a new tab with safe link attributes.

### Milestone 5 — Session engine and manual tracking foundation
**Tasks**
- Add `ConsumptionSession` and `ActivityEvent`.
- Implement a platform-independent session service.
- Implement idempotent event ingestion.
- Add pause/resume/close/recovery behaviour.
- Add session history to media detail pages.
- Add manual session correction/deletion.
- Add tests for duplicate heartbeats, disconnects, idle transitions, crash recovery and time calculations.

**Acceptance criteria**
- Sessions can be created and recovered without the browser extension.
- Duplicate events do not double-count time.
- Invalid or out-of-order timestamps cannot create negative durations.
- All session records are scoped to the correct user.

### Milestone 6 — Browser extension MVP
**Tasks**
- Create a separate extension package/workspace if appropriate.
- Start with Chromium support.
- Implement pairing and revocable scoped credentials.
- Match only registered source domains/URL patterns.
- Detect tab activation, focus and idle transitions within browser permission limits.
- Send heartbeats and activity events.
- Integrate with the desktop companion and/or authenticated cloud API.
- Add tracking indicator and pause/disable controls.
- Document supported browser versions and known limitations.

**Acceptance criteria**
- Only registered sources are tracked.
- Unrelated browsing activity is not collected.
- A source session pauses on tab deactivation/idle and resumes according to documented rules.
- Extension reconnects do not create duplicate sessions.
- Revoking a device/extension stops its access.

### Milestone 7 — Cloud sync
**Tasks**
- Add PostgreSQL deployment configuration and migrations.
- Implement device registration and revocation.
- Implement local outbox and sync cursor/revision tracking.
- Implement upload/download APIs.
- Add conflict handling, tombstones, retry/backoff and idempotency.
- Add sync status UI.
- Test offline edits and multi-device conflicts.

**Acceptance criteria**
- Desktop works without internet and syncs later.
- Web sees cloud-synced changes.
- Two desktop installations can sync the same account.
- Retried operations do not duplicate records or sessions.
- Deletes do not reappear from stale devices.
- Sync errors are visible and recoverable.

### Milestone 8 — Analytics and quality
**Tasks**
- Add daily/weekly/monthly tracked-time aggregates.
- Add a consumption calendar/heatmap.
- Add per-media session history and total tracked time.
- Add progress history.
- Add export/import and backup/restore.
- Move expensive statistics to database aggregation.
- Add performance, accessibility and end-to-end tests.

**Acceptance criteria**
- Analytics derive from valid sessions and explain what tracked time means.
- User can export and restore their data.
- Large libraries do not require loading every record into the client to calculate simple totals.
- Core web and desktop flows pass regression tests.

### Milestone 9 — Advanced integrations (deferred)
Potential future work:
- Content-level episode/chapter progress integrations where technically and contractually supported.
- Game process/platform integrations.
- Firefox and other browser support.
- More sophisticated recommendations.
- Additional device clients.

Do not block the MVP on these integrations.

---

## 8. Testing strategy

### Automated tests
- Unit tests for URL normalisation, source matching, session calculations, heartbeat handling, sync conflict rules and validation.
- API integration tests for authentication, ownership and cross-user access.
- Database migration tests from an empty database and a previous schema.
- Sync tests for retries, duplicate events, offline edits, tombstones and conflicts.
- Electron tests for IPC permissions, external URL handling and clean database setup.
- Extension tests for permissions, tab lifecycle and source matching.

### Manual release checklist
- Fresh web account registration and login.
- Fresh desktop install on a clean machine.
- Offline desktop use followed by successful sync.
- Same account on web and desktop.
- Two accounts with strict data isolation.
- Multiple sources on one media item.
- Source launch on web and desktop.
- Tracking pauses when the relevant tab is inactive or user is idle.
- Browser/desktop crash does not leave sessions counting indefinitely.
- Extension permission revocation stops tracking.
- Export and restore work.
- No credentials or private browsing data appear in logs.

### CI expectations
At minimum, run:
- Lint
- Typecheck
- Unit tests
- API/integration tests
- Production web build
- Electron packaging smoke test where CI supports it

Do not mark a task complete solely because code was written. Link it to a passing test, a reproducible manual check, or a clearly documented external dependency.

---

## 9. Suggested repository organisation

Adapt this to the current structure rather than forcing a large reorganisation.

```text
src/
  app/
  components/
  lib/
    auth/
    db/
    media/
    sources/
    sessions/
    sync/
    validation/
    tracking/
electron/
  main.js
  preload.js
  tracking/
extension/
  manifest.json
  src/
    background/
    content/
    pairing/
    tracking/
prisma/
  schema.prisma
  migrations/
```

Keep domain logic (source validation, session rules, sync merge rules) outside React components and Electron UI code so it can be tested independently.

---

## 10. Developer working agreement

1. Start by inspecting the current branch; do not assume this plan describes the exact current state.
2. Before implementation, report the relevant existing files, current behaviour, and any discrepancy with this plan.
3. Work milestone-by-milestone and use focused pull requests.
4. Do not perform broad rewrites or introduce microservices without a documented need.
5. Do not commit secrets, real user data, database files, build artefacts, or private browsing data.
6. Include migrations and tests with schema/API changes.
7. Preserve existing functionality unless a change is intentional and documented.
8. Update this plan's checkboxes and implementation notes as work is merged.
9. Report blockers and trade-offs explicitly.
10. Never claim automatic watch/read verification when only active-tab/session signals are available.

---

## 11. Progress tracker

| Milestone | Status | Evidence / Reference |
|---|---|---|
| **0. Repository baseline** | Complete | Baseline audit documented; Vitest test runner and GitHub Actions CI configured ([`870543a`](https://github.com/AryanTechie-007/MLocker/commit/870543a152d113ae8a0e08f0a0c4f82875b2258a)) |
| **1. Security and stability** | Complete | Auth enforcement, relational IDOR remediation, Zod validation, credential cleanup ([`2b933d5`](https://github.com/AryanTechie-007/MLocker/commit/2b933d5c089913ce7a139372f3d4329fdb1df986), CI run [44519584927](https://github.com/AryanTechie-007/MLocker/actions/runs/44519584927), [`test-results/milestone-1-security-report.md`](file:///test-results/milestone-1-security-report.md)) |
| **1.1. Residual security fixes** | Complete | Tenant-safe reads, Electron IPC test suite, modal reset test suite, rotation advisory ([`5e14af1`](https://github.com/AryanTechie-007/MLocker/commit/5e14af180d710e1b285657be0644c1cd331a82ca), [`test-results/credential-rotation-advisory.md`](file:///test-results/credential-rotation-advisory.md)) |
| **1.2. Electron navigation security** | Complete | In-window origin allowlist, child window denial, safe external HTTP/HTTPS delegation ([`c208385`](https://github.com/AryanTechie-007/MLocker/commit/c208385ec85e5757217b2afe1e89fbebb693563f), [`test-results/milestone-1.2-electron-navigation-report.md`](file:///test-results/milestone-1.2-electron-navigation-report.md)) |
| **1.2.1. Protocol allowlist correction** | Complete | Protocol allowlist enforced before origin check in `handleWillNavigate()` ([`856538c`](https://github.com/AryanTechie-007/MLocker/commit/856538c42f6a46039ae0db6edf8c7b72b2f4d0fe), CI run [44525905345](https://github.com/AryanTechie-007/MLocker/actions/runs/44525905345)) |
| **2. Database and desktop reliability** | Complete | Embedded SQLite migration runner, WAL journal mode, pre-migration backups, persistent userData path ([`1b1481f`](https://github.com/AryanTechie-007/MLocker/commit/1b1481f33a8bcefe7fc677611c080d9ad2eb77e6), [`8c12fe4`](https://github.com/AryanTechie-007/MLocker/commit/8c12fe489a4d64b86fa207a28dab326883700286), CI run [44532724671](https://github.com/AryanTechie-007/MLocker/actions/runs/44532724671), [`test-results/milestone-2-database-report.md`](file:///test-results/milestone-2-database-report.md)) |
| **2.1. Database lifecycle corrective audit** | Complete | Single migration source of truth, strict structural legacy validation, semantic default equivalence, isolated test DB, graceful Windows Electron shutdown ([`fc8f6b3`](https://github.com/AryanTechie-007/MLocker/commit/fc8f6b360ba663be0b8df780c80b54fa31697e68), [`30033d2`](https://github.com/AryanTechie-007/MLocker/commit/30033d295f58e7fee93d66b8631360d50f9e9411), [`74a60de`](https://github.com/AryanTechie-007/MLocker/commit/74a60decde3f813cbfbfb1e02dcb1744be216f99), CI run [44569027391](https://github.com/AryanTechie-007/MLocker/actions/runs/44569027391), [`test-results/milestone-2.1-corrective-report.md`](file:///test-results/milestone-2.1-corrective-report.md)) |
| **3. Six media categories** | Next / Not started | Milestone 3 audit-only investigation required before feature implementation begins |
| **4. External source manager** | Not started | Blocked on Milestone 3 completion |
| **5. Session engine** | Not started | Blocked on Milestone 4 completion |
| **6. Browser extension MVP** | Not started | Blocked on Milestone 5 completion |
| **7. Cloud sync** | Not started | Blocked on Milestone 6 completion |
| **8. Analytics and quality** | Not started | Blocked on Milestone 7 completion |
| **9. Advanced integrations** | Deferred | Planned post-MVP |

---

## 12. Next developer deliverable — Milestone 3 audit

**Current position:** Milestones 0 through 2.1 are complete and verified. The next development activity is an **audit-only investigation** for Milestone 3 (Six Media Categories).

Before any feature code is written:
1. Conduct an audit-only investigation covering:
   - Movies (`MOVIE`)
   - TV Shows (`TV_SHOW`)
   - Anime (`ANIME`)
   - Manga (`MANGA`)
   - Games (`GAME`)
   - Books/Novels (`BOOK`/`NOVEL`)
2. Inspect:
   - Database schema and Prisma models
   - Category naming conventions across the codebase (`BOOK` vs `NOVEL` vs `BOOKS_NOVELS`)
   - Metadata search providers and unified search logic
   - Manual entry, validation schemas, and CRUD APIs
   - Library filters, navigation tabs, and detail pages
   - Category-specific progress tracking fields (episodes, chapters, pages, hours)
   - Existing automated test coverage and gaps
3. Determine existing naming conventions and data representation. Do not blindly rename enums, change database columns, or alter stored data without documented justification.
4. Document all findings, type contracts, and proposed implementation steps in a dedicated audit report.
5. **Wait for review and approval before beginning any Milestone 3 implementation.** Do not start feature code until the audit findings are confirmed.
