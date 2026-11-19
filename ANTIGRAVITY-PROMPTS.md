# Antigravity Prompt Playbook for MLocker

This file is a comprehensive collection of context-engineered, copy-paste ready prompts for Google Antigravity and other AI agents working on **MLocker**.

All prompts are aligned with the principles in [AGENTS.md](file:///AGENTS.md), the architectural milestones in [implementation-plan.md](file:///implementation-plan.md), and the specialised skills under `.agents/skills/`.

---

## Table of Contents
1. [General Agent Invocation Standard](#general-agent-invocation-standard)
2. [Section A: Planning Prompts](#section-a-planning-prompts)
3. [Section B: Implementation Prompts (Milestones 0–8)](#section-b-implementation-prompts-milestones-08)
4. [Section C: Debugging Prompts](#section-c-debugging-prompts)
5. [Section D: Testing Prompts](#section-d-testing-prompts)
6. [Section E: Code Review Prompts](#section-e-code-review-prompts)
7. [Section F: Security Audit Prompts](#section-f-security-audit-prompts)
8. [Section G: Milestone Completion Prompts](#section-g-milestone-completion-prompts)

---

## General Agent Invocation Standard

When kicking off any major task in Antigravity, prepend this instruction header:

```markdown
Read @AGENTS.md and @implementation-plan.md before performing any action.
Adhere strictly to relevant skills under .agents/skills/.
Do not perform broad unrequested refactors. Preserve existing foundations.
Security, privacy, and data integrity take priority over implementation speed.
```

---

## Section A: Planning Prompts

### A1: Feature Architecture & Boundary Breakdown
```markdown
Read @AGENTS.md, @implementation-plan.md, and @.agents/skills/mlocker-architecture/SKILL.md.

TASK:
Produce an architectural design specification for implementing [FEATURE_NAME].

REQUIREMENTS:
1. Deconstruct the feature into:
   - Pure Domain Logic (`src/lib/domain/`): calculations, state transitions, validation schemas (zero framework imports).
   - Database / Persistence (`prisma/`): schema modifications, indices, migration requirements.
   - Next.js Web Layer (`src/app/`, `src/components/`): server actions, API handlers, responsive UI.
   - Electron Desktop Layer (`electron/`): IPC channels, main process handlers, local storage.
   - Extension Layer (`extension/`, if applicable): permissions, event listeners, local bridge payload.
2. Identify IDOR / tenant isolation boundaries for this feature.
3. Detail how this feature works offline in Electron SQLite and how it reconciles during cloud sync.
4. Output a concise markdown plan with file paths, data contracts, and risk analysis. Do not write feature code yet.
```

### A2: Database Schema & Migration Planning
```markdown
Read @AGENTS.md, @implementation-plan.md, and @.agents/skills/prisma-electron-database/SKILL.md.

TASK:
Plan a schema migration for [PROPOSED_CHANGES].

REQUIREMENTS:
1. Model the proposed changes in `prisma/schema.prisma` supporting both SQLite (desktop) and PostgreSQL (cloud).
2. Ensure soft-deletion (`deletedAt`), version counters, and timestamps (`createdAt`, `updatedAt`) are included for sync compatibility.
3. Specify compound indices for tenant isolation (`[userId, ...]`) and fast delta queries (`[userId, updatedAt]`).
4. Detail the migration execution strategy for desktop: how will Electron apply this schema upgrade on clean installs and existing databases using `PRAGMA user_version` without Prisma CLI in production?
5. Identify any breaking changes to existing data or queries.
```

---

## Section B: Implementation Prompts (Milestones 0–8)

### Milestone 0: Baseline Audit & Sanity Check
```markdown
Read @AGENTS.md, @implementation-plan.md, and @.agents/skills/mlocker-test-and-verify/SKILL.md.

TASK:
Execute Milestone 0 Baseline Audit for MLocker before modifying any application code.

REQUIREMENTS:
1. Verify Git status, active branch, and working tree clean state.
2. Run baseline quality checks:
   - `npx tsc --noEmit`
   - `npm run lint`
   - `npm run build`
3. Check and confirm the status of audit findings from Section 2 of implementation-plan.md:
   - Check API routes for unauthenticated guest fallbacks.
   - Check collection-item association queries for cross-tenant IDOR checks.
   - Check Electron database provisioning path (`app.getPath('userData')` vs bundled path).
   - Check category coverage for Manga and Books/Novels in filters, search, and modals.
4. Output a concise baseline report. Do not modify application source code.
```

### Milestone 1: Security Hardening & Auth Remediation
```markdown
Read @AGENTS.md, @implementation-plan.md, and @.agents/skills/secure-development/SKILL.md.

TASK:
Implement Milestone 1: Security Hardening & Authentication Remediation.

REQUIREMENTS:
1. Eliminate all unauthenticated fallbacks to shared 'guest' accounts:
   - Reject unauthenticated mutations with HTTP 401 Unauthorized.
   - Ensure all queries filter strictly by `session.userId`.
2. Enforce relational ownership verification:
   - When associating a MediaItem with a Collection, verify BOTH items belong to `session.userId`.
3. Implement runtime input validation with Zod on all API endpoints:
   - Validate category enums, status enums, rating limits (0-100), progress numbers, and URL protocols (`http:`, `https:` only).
4. Remove hardcoded secrets or API tokens; load strictly from validated environment variables.
5. Harden Electron IPC in `electron/preload.js` and `electron/main.js` (channel whitelisting, argument validation, no raw SQL).

VERIFICATION:
- Run `npx tsc --noEmit` and `npm run lint`.
- Add tests verifying unauthenticated and IDOR requests are rejected.
- Update Milestone 1 in `implementation-plan.md`.
```

### Milestone 2: Prisma & Electron Database Provisioning
```markdown
Read @AGENTS.md, @implementation-plan.md, and @.agents/skills/prisma-electron-database/SKILL.md.

TASK:
Implement Milestone 2: Database Reliability & Electron Clean-Install Provisioning.

REQUIREMENTS:
1. Ensure the desktop SQLite database resides strictly in `app.getPath('userData')`.
2. Implement a runtime migration runner in Electron main process that tracks `PRAGMA user_version` without requiring `@prisma/cli` in production distribution.
3. Update `prisma/schema.prisma` with models for `MediaItem`, `Collection`, `CollectionItem`, `ActivitySession`, `ExternalSource`, and `SyncJournal`.
4. Include `deletedAt` for sync tombstones and compound indices on `[userId, category]` and `[userId, updatedAt]`.

VERIFICATION:
- Test fresh database initialization on empty profile.
- Verify migrations run sequentially inside a transaction.
- Run `npx tsc --noEmit` and `npm run build`.
- Update Milestone 2 in `implementation-plan.md`.
```

### Milestone 3: Six Media Categories [COMPLETE]

**Status:** Complete  
**Audit Report:** [`test-results/milestone-3-six-category-audit.md`](file:///test-results/milestone-3-six-category-audit.md)  
**Implementation Report:** [`test-results/milestone-3-implementation-report.md`](file:///test-results/milestone-3-implementation-report.md)  
**Acceptance Report:** [`test-results/milestone-3-final-acceptance-report.md`](file:///test-results/milestone-3-final-acceptance-report.md)  
**Implementation Commits:** [`3c88662`](https://github.com/AryanTechie-007/MLocker/commit/3c886626e42d871d58089071d88c75d48caa3a03), [`4765c1d`](https://github.com/AryanTechie-007/MLocker/commit/4765c1d19fd1cdfa7b1d4650a1b52d09a87a4c05), [`20967d6`](https://github.com/AryanTechie-007/MLocker/commit/20967d63f5767c212077e5e4b46d159c9a3ce752)  
**CI Verification:** GitHub Actions Run [44593093753](https://github.com/AryanTechie-007/MLocker/actions/runs/44593093753) (Ubuntu + Windows, 19 suites, 201 tests passed, clean Next.js build & packaged Electron runtime verification).

All six media categories (Movies, TV Shows, Anime, Manga, Games, Novels/Books) are fully integrated across providers (TMDb, iTunes, TVMaze, Kitsu, Steam, Open Library), unified search, manual entry modal, library navigation, category filtering, and legal storefront links.

---

### Milestone 4: External Source Manager & Link Launcher [NEXT / NOT STARTED]
```markdown
Read @AGENTS.md, @implementation-plan.md, and @.agents/skills/secure-development/SKILL.md.

TASK:
Implement Milestone 4: External Source Manager & Link Launcher.

REQUIREMENTS:
1. Allow users to register external source URLs and domain patterns for any MediaItem.
2. Validate URLs strictly (`http:` and `https:` protocols only).
3. In Electron, launch links safely via `shell.openExternal` after protocol validation (never load external URLs in the app window).
4. In Web, open links safely with `rel="noopener noreferrer"`.
5. Provide UI to manage, label, and toggle tracking on external sources.

VERIFICATION:
- Test invalid protocol rejection (`javascript:`, `file:`).
- Verify launch behavior on desktop and web.
- Run `npx tsc --noEmit`.
- Update Milestone 4 in `implementation-plan.md`.
```

### Milestone 5: Session Engine & Activity Ingestion Core
```markdown
Read @AGENTS.md, @implementation-plan.md, and @.agents/skills/mlocker-session-tracking/SKILL.md.

TASK:
Implement Milestone 5: Activity Session Engine & Ingestion Pipeline.

REQUIREMENTS:
1. Implement pure domain session engine in `src/lib/domain/session/`:
   - Group incoming heartbeats into `ActivitySession` records.
   - Debounce pulses within `MAX_GAP` (45s); close session when gap exceeded.
   - Deduct idle time from `activeSeconds`.
2. Implement secure heartbeat ingestion API (`/api/tracking/heartbeat`) and Electron IPC handler (`tracking:heartbeat`).
3. Persist completed sessions in `ActivitySession` table with start, end, and active duration.
4. Provide session history UI with manual edit/delete capabilities.
5. Enforce language compliance: UI must state 'Observed Active Time' (never claim 'Verified 100% Watched').

VERIFICATION:
- Comprehensive unit tests for session engine covering continuous pulses, gap timeouts, and idle cutoffs.
- Run `npm test` and `npx tsc --noEmit`.
- Update Milestone 5 in `implementation-plan.md`.
```

### Milestone 6: Chromium Browser Extension MVP
```markdown
Read @AGENTS.md, @implementation-plan.md, and @.agents/skills/mlocker-session-tracking/SKILL.md.

TASK:
Implement Milestone 6: Chromium Browser Extension MVP (`extension/`).

REQUIREMENTS:
1. Manifest V3 extension with minimal permissions: `tabs`, `idle`, `storage`.
2. Zero access to DOM, form inputs, passwords, or arbitrary browsing history.
3. Match active tab URLs against user-registered domain patterns with explicit user permission.
4. Detect idle state via `chrome.idle` (60s cutoff).
5. Emit 15s heartbeats to desktop loopback bridge or web API with auth token.
6. Popup UI with global tracking toggle and active connection indicator.

VERIFICATION:
- Test extension package in Chromium browser.
- Verify pulses cease when tab loses focus or user is idle.
- Update Milestone 6 in `implementation-plan.md`.
```

### Milestone 7: Local-First Cloud Synchronization Engine
```markdown
Read @AGENTS.md, @implementation-plan.md, and @.agents/skills/mlocker-sync-engineering/SKILL.md.

TASK:
Implement Milestone 7: Local-First Cloud Synchronization Engine.

REQUIREMENTS:
1. Implement `SyncJournal` in local SQLite tracking mutations and soft-deletes (`deletedAt`).
2. Implement Next.js sync endpoints: `POST /api/sync/push` and `GET /api/sync/pull`.
3. Implement Last-Write-Wins (LWW) conflict resolution using `updatedAt` and version counters.
4. Treat `ActivitySession` records as append-only.
5. Desktop background sync worker with retry backoff and batching (max 100 items).
6. UI sync indicator badge (Synced, Syncing, Offline, Conflict).
7. RULE: Never synchronize raw `.db` files directly.

VERIFICATION:
- Unit test conflict resolution with older vs newer timestamps.
- Test offline change queuing and reconnection sync.
- Update Milestone 7 in `implementation-plan.md`.
```

### Milestone 8: Analytics, Performance & Quality Assurance
```markdown
Read @AGENTS.md, @implementation-plan.md, and @.agents/skills/mlocker-test-and-verify/SKILL.md.

TASK:
Implement Milestone 8: Analytics, Performance Optimization, and Quality Assurance.

REQUIREMENTS:
1. Migrate client-side statistics to database-level Prisma `groupBy` and `aggregate` queries.
2. Optimize Recharts dashboard components for responsive display and empty states.
3. Run full verification suite (`tsc`, `lint`, `test`, `build`).
4. Execute full pre-commit security and privacy audit checklist.

VERIFICATION:
- Produce final milestone verification report.
- Update Milestone 8 in `implementation-plan.md`.
```

---

## Section C: Debugging Prompts

### C1: Diagnosing Tracking & Session Discrepancies
```markdown
Read @AGENTS.md, @implementation-plan.md, and @.agents/skills/mlocker-session-tracking/SKILL.md.

TASK:
Investigate and resolve session tracking discrepancy: [DESCRIBE ISSUE, e.g., session active duration exceeding wall clock time, or missing heartbeats].

STEPS:
1. Inspect heartbeat emission logs and payload timestamps.
2. Trace heartbeat processing through `src/lib/domain/session/`.
3. Verify whether idle detection interval (60s) and heartbeat interval (15s) correctly throttle pulse delivery.
4. Check for timezone or daylight saving offset bugs in `startedAt`/`endedAt` calculations.
5. Propose a root-cause explanation and minimal fix with regression unit tests.
```

### C2: Diagnosing Sync Conflicts & Data Divergence
```markdown
Read @AGENTS.md, @implementation-plan.md, and @.agents/skills/mlocker-sync-engineering/SKILL.md.

TASK:
Diagnose synchronization failure or data mismatch: [DESCRIBE ISSUE, e.g., duplicate entries, overwritten changes, sync loop].

STEPS:
1. Inspect the local `SyncJournal` entries and cloud PostgreSQL records for the affected entity IDs.
2. Trace the push/pull payload exchange and verify the LWW timestamp comparison logic.
3. Check if soft-delete tombstones (`deletedAt`) were properly applied or accidentally revived by an older client.
4. Verify idempotency handling: did replayed batches create duplicate rows?
5. Provide a deterministic fix and verify with concurrent sync simulation tests.
```

### C3: Diagnosing Electron IPC & SQLite Errors
```markdown
Read @AGENTS.md, @implementation-plan.md, and @.agents/skills/prisma-electron-database/SKILL.md.

TASK:
Diagnose Electron runtime or SQLite database failure: [DESCRIBE ERROR, e.g., SQLITE_BUSY, table not found, IPC invoke timeout].

STEPS:
1. Inspect the database file path resolution (`app.getPath('userData')`).
2. Verify SQLite PRAGMA journal mode (`WAL` mode recommended for concurrent reads).
3. Inspect `electron/preload.js` and `electron/main.js` channel definitions for mismatched handler names or unhandled promise rejections.
4. Check if the database migration runner failed mid-transaction.
5. Propose a robust fix ensuring clean startup and graceful error recovery.
```

---

## Section D: Testing Prompts

### D1: Domain Logic Unit Test Suite Generation
```markdown
Read @AGENTS.md, @implementation-plan.md, and @.agents/skills/mlocker-test-and-verify/SKILL.md.

TASK:
Generate comprehensive unit tests for domain module: [PATH_TO_MODULE, e.g., src/lib/domain/session/rollup.ts].

REQUIREMENTS:
1. Cover standard execution paths with deterministic fixtures.
2. Test edge cases:
   - Zero, negative, or abnormally large durations.
   - Out-of-order timestamps or duplicate nonces.
   - Null or undefined optional fields.
   - Boundary conditions on maximum session gaps (`MAX_GAP = 45s`).
3. Ensure tests run purely in-memory with zero network or filesystem dependencies.
4. Verify tests pass with `npm test`.
```

### D2: API Route Boundary & IDOR Test Suite
```markdown
Read @AGENTS.md, @implementation-plan.md, and @.agents/skills/secure-development/SKILL.md.

TASK:
Create integration security tests for route: [ROUTE_PATH, e.g., /api/collections/[id]/items].

REQUIREMENTS:
1. Test 1 (Unauthenticated): Request without session -> Verify `401 Unauthorized`.
2. Test 2 (IDOR - Parent): User A requests Collection belonging to User B -> Verify `404 Not Found` or `403 Forbidden`.
3. Test 3 (IDOR - Child): User A attempts to attach MediaItem belonging to User B into User A's Collection -> Verify `403 Forbidden`.
4. Test 4 (Invalid Input): Malformed JSON, negative numbers, invalid enums -> Verify `400 Bad Request` with Zod validation details.
5. Test 5 (Happy Path): Valid authenticated mutation -> Verify `200/201 OK` and database state.
```

---

## Section E: Code Review Prompts

### E1: Pre-Merge Quality & Boundary Review
```markdown
Read @AGENTS.md, @implementation-plan.md, and relevant skills under .agents/skills/.

TASK:
Perform a comprehensive code review of the recent changes / branch.

REVIEW CRITERIA:
1. **Architecture & Boundaries:** Are domain calculations isolated in `src/lib/domain/`? Are Next.js and Electron concerns properly separated?
2. **Security & Auth:** Are there any unauthenticated guest fallbacks? Are IDOR checks present on all relational operations? Are inputs validated with Zod?
3. **Database Safety:** Are migrations clean? Does Electron locate SQLite in `userData`? Are soft deletes handled with tombstones? Is raw SQLite file sync avoided?
4. **Privacy:** Does tracking require explicit opt-in? Is session time described as observed active time, not proof of consumption?
5. **Quality Gates:** Do `tsc --noEmit`, `npm run lint`, and `npm test` pass without warnings or errors?
6. Output a structured review listing: Strengths, Blocking Issues, Recommendations, and Approval Status.
```

---

## Section F: Security Audit Prompts

### F1: Comprehensive Vulnerability & Hardening Audit
```markdown
Read @AGENTS.md, @implementation-plan.md, and @.agents/skills/secure-development/SKILL.md.

TASK:
Perform a full security and credential hygiene audit of the MLocker codebase.

AUDIT CHECKLIST:
1. **Secret Scanning:** Scan codebase for hardcoded API keys, JWT secrets, database connection strings, or test tokens.
2. **Auth & Tenant Isolation:** Verify that every database read/write queries by `session.userId`. Verify no route falls back to `"guest"`.
3. **Electron Hardening:** Verify `BrowserWindow` settings (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`). Verify IPC handlers sanitize all inputs and avoid raw shell/SQL execution.
4. **URL Injection:** Verify all external links validate protocol (`http:`, `https:` only) before opening via `shell.openExternal` or `window.open`.
5. **Extension Permissions:** Verify Manifest V3 permissions adhere to least privilege. Verify no DOM sniffing or credential collection.
6. Output a detailed Vulnerability Report with severity levels (Critical, High, Medium, Low) and concrete remediation diffs.
```

---

## Section G: Milestone Completion Prompts

### G1: Milestone Acceptance & Progress Tracker Sync
```markdown
Read @AGENTS.md, @implementation-plan.md, and @.agents/skills/mlocker-test-and-verify/SKILL.md.

TASK:
Perform formal acceptance verification for [MILESTONE_NUMBER, e.g., Milestone 1].

STEPS:
1. Review all acceptance criteria listed for this milestone in `implementation-plan.md`.
2. Execute automated verification:
   - `npx tsc --noEmit`
   - `npm run lint`
   - `npm test`
   - `npm run build`
3. Verify that all newly created files conform to the architectural guidelines in `AGENTS.md`.
4. Update the Milestone status and evidence/PR reference in Section 11 of `implementation-plan.md`.
5. Prepare a concise Milestone Completion Report summarizing implemented features, verified test results, and next steps for the upcoming milestone.
```
