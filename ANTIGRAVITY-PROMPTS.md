# Antigravity Prompt Playbook for MLocker

This file contains copy-paste ready, context-engineered prompts for Google Antigravity and other agentic AI systems working on the **MLocker** codebase.

Each prompt is mapped directly to a milestone from [implementation-plan.md](file:///implementation-plan.md) and instructs the agent on context loading, constraints, deliverables, and verification procedures.

---

## Table of Contents
1. [General Agent Instructions](#general-agent-instructions)
2. [Milestone 0: Baseline Audit & Sanity Check](#milestone-0-baseline-audit--sanity-check)
3. [Milestone 1: Security Hardening & Auth Remediation](#milestone-1-security-hardening--auth-remediation)
4. [Milestone 2: Prisma & Electron Database Provisioning](#milestone-2-prisma--electron-database-provisioning)
5. [Milestone 3: Six Media Categories Expansion & Unified Search](#milestone-3-six-media-categories-expansion--unified-search)
6. [Milestone 4: External Source Manager & Link Launcher](#milestone-4-external-source-manager--link-launcher)
7. [Milestone 5: Session Engine & Activity Ingestion Core](#milestone-5-session-engine--activity-ingestion-core)
8. [Milestone 6: Chromium Browser Extension MVP](#milestone-6-chromium-browser-extension-mvp)
9. [Milestone 7: Local-First Cloud Synchronization Engine](#milestone-7-local-first-cloud-synchronization-engine)
10. [Milestone 8: Analytics, Performance & Quality Assurance](#milestone-8-analytics-performance--quality-assurance)

---

## General Agent Instructions

When prompting Antigravity, prefix tasks with:
```markdown
Read @AGENTS.md and @implementation-plan.md before performing any action. 
Strictly adhere to the referenced skill guides under .agents/skills/.
Do not perform broad unrequested refactors. Work strictly within the requested milestone scope.
```

---

## Milestone 0: Baseline Audit & Sanity Check

```markdown
Read @AGENTS.md, @implementation-plan.md, and @.agents/skills/mlocker-test-and-verify/SKILL.md.

TASK:
Produce the Milestone 0 Baseline Report for MLocker before any feature code is changed.

REQUIREMENTS:
1. Identify the current Git commit, branch status, and any untracked or dirty files.
2. Run static verification:
   - TypeScript typechecking (`npx tsc --noEmit`)
   - ESLint (`npm run lint`)
   - Application build verification (`npm run build`)
3. Inspect and confirm the status of known audit findings documented in Section 2 of implementation-plan.md:
   - Check if unauthenticated requests fall back to a guest identity.
   - Check collection-item association queries for cross-tenant IDOR checks.
   - Check Electron's current SQLite database provisioning path.
   - Check if Manga and Book/Novel categories are implemented across UI filters and search.
4. Output a concise markdown report detailing exact findings, failing commands, and immediate risks.
Do not modify any application code in this step.
```

---

## Milestone 1: Security Hardening & Auth Remediation

```markdown
Read @AGENTS.md, @implementation-plan.md, and @.agents/skills/secure-development/SKILL.md.

TASK:
Implement Milestone 1: Security Hardening & Authentication Remediation.

REQUIREMENTS:
1. Audit and eliminate all unauthenticated fallbacks to shared 'guest' accounts in API routes:
   - Reject unauthenticated mutations with HTTP 401 Unauthorized.
   - Ensure all database queries strictly filter by the authenticated user's session ID (`session.userId`).
2. Enforce relational ownership validation (IDOR prevention):
   - When associating a MediaItem with a Collection, verify BOTH the collection and media item belong to the requesting user before performing the join.
3. Implement server-side input validation using Zod:
   - Validate category enums, status enums, rating bounds (0-100), progress numbers, and URL protocols (`http:`, `https:` only).
4. Remove any hardcoded secrets or embedded API tokens from source code. Ensure secrets are loaded strictly from validated environment variables.
5. Harden Electron IPC in `electron/preload.js` and `electron/main.js`:
   - Validate all channel arguments. Never pass raw SQL strings or unrestricted file paths.

VERIFICATION:
- Run `npx tsc --noEmit` and `npm run lint`.
- Add unit/integration tests confirming unauthorized requests are rejected and IDOR attempts fail with 403/404.
- Update Milestone 1 checkbox in `implementation-plan.md`.
```

---

## Milestone 2: Prisma & Electron Database Provisioning

```markdown
Read @AGENTS.md, @implementation-plan.md, and @.agents/skills/prisma-electron-database/SKILL.md.

TASK:
Implement Milestone 2: Database Reliability & Electron Clean-Install Provisioning.

REQUIREMENTS:
1. Electron Database Location:
   - Ensure the SQLite database file is created and accessed within Electron's `app.getPath('userData')` directory.
   - Ensure packaged builds never attempt to write to read-only app bundle resource paths.
2. Clean Installation Migration Runner:
   - Implement an automated database migration/initialization runner in the Electron main process that works without requiring the global Prisma CLI in production distribution.
   - Use SQLite `PRAGMA user_version` tracking for incremental schema version upgrades.
3. Schema Refinements:
   - Update `prisma/schema.prisma` to include models for `MediaItem`, `Collection`, `CollectionItem`, `ActivitySession`, `ExternalSource`, and `SyncJournal`.
   - Add soft deletion (`deletedAt`) to support sync tombstones.
   - Add appropriate compound indices on `[userId, category]` and `[userId, updatedAt]`.

VERIFICATION:
- Test initializing a fresh SQLite database from scratch.
- Verify migrations run sequentially without crashing.
- Run `npx tsc --noEmit` and build test.
- Update Milestone 2 checkbox in `implementation-plan.md`.
```

---

## Milestone 3: Six Media Categories Expansion & Unified Search

```markdown
Read @AGENTS.md, @implementation-plan.md, and @.agents/skills/mlocker-architecture/SKILL.md.

TASK:
Implement Milestone 3: Complete Six Media Categories Support and Unified Library Management.

REQUIREMENTS:
1. Implement full first-class support for all six categories:
   - Movies (`MOVIE`), TV Shows (`TV_SHOW`), Anime (`ANIME`), Manga (`MANGA`), Games (`GAME`), Books/Novels (`BOOK`).
2. Category-Specific Progress Metrics & Attributes:
   - Movies: Runtime minutes & watched toggle.
   - TV Shows & Anime: Season and episode trackers.
   - Manga: Chapter and volume trackers.
   - Books/Novels: Chapter, page, or percentage progress.
   - Games: Playtime hours and completion status.
3. UI & Search Updates:
   - Ensure library filter bar, category tabs, and manual entry modals support all six categories.
   - Fix stale modal state where editing an item preserves previous item form state.
   - Add debouncing, request cancellation, or stale-response guards to unified search queries.

VERIFICATION:
- Test creating, updating, filtering, and searching items across all 6 categories.
- Verify TypeScript types match Prisma schema enums.
- Run `npm run lint` and `npx tsc --noEmit`.
- Update Milestone 3 checkbox in `implementation-plan.md`.
```

---

## Milestone 4: External Source Manager & Link Launcher

```markdown
Read @AGENTS.md, @implementation-plan.md, and @.agents/skills/secure-development/SKILL.md.

TASK:
Implement Milestone 4: External Source Manager and Link Launcher.

REQUIREMENTS:
1. Domain Link Configuration:
   - Allow users to attach one or more external source links/domain patterns to any `MediaItem` (e.g. streaming URLs, reader links, game store pages).
   - Validate URL formats and protocol constraints (`http:` and `https:` only).
2. Desktop Link Launcher:
   - In Electron, launch external URLs safely using Electron's `shell.openExternal` after validating the URL string.
   - Never load untrusted external URLs inside Electron's main application window.
3. Web Link Launcher:
   - In Next.js web client, open links in new tabs using `rel="noopener noreferrer"`.
4. Management Interface:
   - Provide UI to add, label, edit, and remove external sources from the media item detail view.

VERIFICATION:
- Verify that invalid schemes (`javascript:`, `file:`) are rejected.
- Test link launching on desktop and web.
- Run `npx tsc --noEmit`.
- Update Milestone 4 checkbox in `implementation-plan.md`.
```

---

## Milestone 5: Session Engine & Activity Ingestion Core

```markdown
Read @AGENTS.md, @implementation-plan.md, and @.agents/skills/mlocker-session-tracking/SKILL.md.

TASK:
Implement Milestone 5: Session Engine and Activity Ingestion Pipeline.

REQUIREMENTS:
1. Domain Session Engine (`src/lib/domain/session/`):
   - Pure, framework-agnostic session aggregation module.
   - Implement heartbeat ingestion: accept pulse `(mediaItemId, timestamp, duration)`.
   - Implement debouncing and rollup: continuous pulses within `MAX_GAP` (45s) extend the current session; gaps > `MAX_GAP` seal the session and start a new one.
   - Calculate verified `activeSeconds` excluding idle periods.
2. Ingestion Endpoints / IPC:
   - Implement secure Next.js API route `/api/tracking/heartbeat` and Electron IPC handler `tracking:heartbeat`.
   - Validate all incoming payloads with Zod (`HeartbeatPayloadSchema`).
3. Session Storage & History View:
   - Persist completed sessions in `ActivitySession` table.
   - Provide a UI view displaying recent activity sessions with active duration, timestamps, and manual delete/edit capabilities.
4. Product Principles Compliance:
   - Ensure UI labels clearly state 'Active Session Time' and do NOT claim 'Verified 100% Watched/Read'.

VERIFICATION:
- Write comprehensive unit tests for `src/lib/domain/session/` covering continuous pulses, gap boundaries, and idle cutoffs.
- Run `npm test` and `npx tsc --noEmit`.
- Update Milestone 5 checkbox in `implementation-plan.md`.
```

---

## Milestone 6: Chromium Browser Extension MVP

```markdown
Read @AGENTS.md, @implementation-plan.md, and @.agents/skills/mlocker-session-tracking/SKILL.md.

TASK:
Implement Milestone 6: Chromium Browser Extension MVP (`extension/`).

REQUIREMENTS:
1. Extension Architecture (Manifest V3):
   - Manifest configured with least-privilege permissions: `tabs`, `idle`, `storage`.
   - Zero access to DOM, keystrokes, form fields, or passwords.
2. Source Matching & Idle Detection:
   - Match active tab URLs against user-registered source patterns.
   - Detect active focus using `chrome.tabs.onActivated` and `chrome.windows.onFocusChanged`.
   - Detect idle state with `chrome.idle.setDetectionInterval(60)` (60s cutoff).
3. Heartbeat Transmission:
   - Emit periodic heartbeats (every 15s) while tab is active and user is active.
   - Transmit to local Electron loopback server or authenticated web API.
   - Include client-side token authentication for the local bridge.
4. Extension Popup UI:
   - Show connection status (Connected / Disconnected / Paused).
   - Master toggle to pause tracking.
   - Display currently matched media item title if active.

VERIFICATION:
- Test extension build in Chromium.
- Verify heartbeat ceases immediately when tab loses focus or system is idle.
- Update Milestone 6 checkbox in `implementation-plan.md`.
```

---

## Milestone 7: Local-First Cloud Synchronization Engine

```markdown
Read @AGENTS.md, @implementation-plan.md, and @.agents/skills/mlocker-sync-engineering/SKILL.md.

TASK:
Implement Milestone 7: Local-First Cloud Synchronization Engine.

REQUIREMENTS:
1. Change Journal (`SyncJournal`):
   - Record local mutations (MediaItem, Collection, Session) to `SyncJournal` in SQLite.
   - Handle deletions via soft-delete tombstones (`deletedAt != null`).
2. Sync Endpoints (Next.js):
   - Implement `POST /api/sync/push`: Authenticated batch ingestion of client journal records.
   - Implement `GET /api/sync/pull?since=<cursor>`: Incremental delta retrieval.
3. Conflict Resolution:
   - Implement Last-Write-Wins (LWW) based on `updatedAt` timestamps and entity version counters.
   - Handle immutable `ActivitySession` records as append-only.
4. Desktop Sync Client:
   - Background worker with exponential backoff retry logic.
   - Batching (max 100 changes per request) and idempotency keys.
   - UI sync indicator (Synced, Syncing, Offline, Conflict).

VERIFICATION:
- Unit test conflict resolution with older vs newer timestamps.
- Test offline modifications syncing successfully upon reconnect.
- Verify raw `.db` files are never transferred over the network.
- Update Milestone 7 checkbox in `implementation-plan.md`.
```

---

## Milestone 8: Analytics, Performance & Quality Assurance

```markdown
Read @AGENTS.md, @implementation-plan.md, and @.agents/skills/mlocker-test-and-verify/SKILL.md.

TASK:
Implement Milestone 8: Analytics, Performance Optimization, and Final Verification.

REQUIREMENTS:
1. Database-Level Statistics Aggregation:
   - Refactor client-side in-memory analytics to use Prisma `groupBy` and `aggregate` queries.
   - Compute total active hours per category, weekly engagement trends, and completion ratios efficiently.
2. Chart Optimization:
   - Verify Recharts components render responsively and gracefully handle empty data states.
3. End-to-End Quality Audit:
   - Run full test suite (`npm test`).
   - Run typecheck (`npx tsc --noEmit`) and linting (`npm run lint`).
   - Test production build (`npm run build`).
   - Verify that all items in the pre-commit checklist from `mlocker-test-and-verify` pass.

VERIFICATION:
- Produce a final milestone summary report with test results and performance metrics.
- Update Milestone 8 in `implementation-plan.md`.
```
