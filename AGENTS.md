<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# MLocker Agent Operating Guide

Welcome to **MLocker** (Media Locker). This repository is a cross-platform personal media library and session tracking system supporting **Web (Next.js 15 / React 19)**, **Desktop (Electron + SQLite)**, a **Chromium Browser Extension**, and **Optional Cloud Sync (PostgreSQL)**.

All AI agents and developers contributing to this codebase must adhere strictly to the guidelines and architecture outlined in this document.

---

## 1. Core Principles & Project Decisions

1. **Dual Target (Web & Desktop):** MLocker delivers a unified user experience across web browsers and native desktop environments.
2. **Local-First & Offline Resilience:** Desktop must remain fully usable offline with primary local SQLite storage.
3. **No Raw DB Syncing:** Never synchronise binary SQLite database files directly across devices or cloud storage. All synchronisation occurs via validated JSON change sets over authenticated APIs.
4. **Automatic Tracking with Explicit Permission:** Activity tracking on supported user-configured domains is automatic, but activates **only** after explicit user opt-in and permission.
5. **Observed Active Time vs Proof of Watching:** Activity tracking measures observed active window engagement on user-approved domains. Never claim verification that a user physically watched or read every second.
6. **No Unauthenticated Guest Fallbacks:** Unauthenticated requests must fail with `401 Unauthorized`. Never fall back to a shared `"guest"` user identifier for multi-user or cloud data.
7. **Relational Tenant Isolation:** Always verify that both parent (e.g. `Collection`) and child (e.g. `MediaItem`) belong to the requesting `userId` before performing relational mutations.
8. **Preserve Foundations:** Preserve the existing technology stack (Next.js, Electron, Prisma, Tailwind, SQLite) unless there is a strong, documented technical justification for changing it.
9. **Quality Over Speed:** Security, user privacy, and data integrity strictly take priority over implementation speed.

---

## 2. Architecture & Ecosystem Boundaries

```
MLocker/
├── AGENTS.md                          # Primary agent operating instructions (this file)
├── CLAUDE.md                          # Pointer file referencing AGENTS.md
├── implementation-plan.md             # Authoritative multi-phase product implementation plan
├── ANTIGRAVITY-PROMPTS.md             # Reusable prompt library for all lifecycle stages
├── .agents/
│   └── skills/                        # Specialized domain skills for agents
│       ├── mlocker-architecture/      # Component boundaries, six media categories, clean domain
│       ├── secure-development/        # Auth, IDOR checks, Zod validation, Electron security
│       ├── prisma-electron-database/  # Dual-database setup (SQLite + Postgres), migrations
│       ├── mlocker-session-tracking/  # Heartbeats, idle detection, session rollup engine
│       ├── mlocker-sync-engineering/  # Local-first sync, change journal, conflict resolution
│       └── mlocker-test-and-verify/   # Quality gates, testing suites, audit checklist
├── src/                               # Next.js web application and shared UI/domain logic
│   ├── app/                           # App Router routes and API handlers
│   ├── components/                    # React presentation components
│   └── lib/                           # Domain logic, validation, DB clients
├── electron/                          # Electron main process, preload script, IPC handlers
├── prisma/                            # Prisma schemas, migrations, seed scripts
└── extension/                         # (Milestone 6) Chromium Manifest V3 WebExtension
```

### Component Boundaries:
- **`src/lib/domain/` (Pure Domain):** Contains session rollup algorithms, sync merge rules, and validation schemas. **Zero** Next.js or Electron imports. Runnable in Node, Electron, or Web Worker.
- **`src/app/` (Web & API):** Next.js 15 App Router handling authenticated endpoints, server actions, and cloud persistence.
- **`electron/` (Desktop Main):** Hardened Electron main process managing local SQLite in `app.getPath('userData')`, system tray, window lifecycle, and safe IPC bridge.
- **`extension/` (Browser Companion):** Manifest V3 background service detecting active tab/window state and emitting pulses to the authenticated local bridge.

---

## 3. Coding Standards & Conventions

1. **TypeScript Strictness:** All code must pass strict TypeScript checks (`noImplicitAny`, `strictNullChecks`). Avoid `any` escapes; use explicit types or `unknown` with runtime type narrowing.
2. **Directory Structure & Decoupling:**
   - Keep business logic in `src/lib/domain/`.
   - Keep UI components in `src/components/` modular, stateless where practical, and styled with Tailwind CSS.
   - Centralize database queries in `src/lib/db/` or dedicated repository modules.
3. **Safe Error Handling:**
   - Always return typed, structured API error responses (`{ error: string, code: string, details?: unknown }`).
   - Never leak internal database stack traces or SQL errors to client responses.
4. **State Management in Modals:**
   - Always reset modal form state when selected items change to prevent stale-data editing bugs.

---

## 4. Security & Privacy Rules

1. **Authentication Enforcement:**
   - Reject unauthenticated requests to protected endpoints with `401 Unauthorized`.
   - Guest mode, if used on desktop, must remain local to that device's SQLite file and never sync to cloud accounts without authenticated onboarding.
2. **Tenant Isolation (IDOR Prevention):**
   - Every mutation and query touching user data must explicitly match `userId: session.userId`.
   - When linking resources (e.g. MediaItem to Collection), verify both items belong to the requesting user before performing the join.
3. **Server-Side Validation:**
   - Validate every API payload and Electron IPC argument using Zod.
   - Enforce category enums, status enums, rating bounds (0-100), progress counts, and URL protocols (`http:`, `https:` only).
4. **Secret Hygiene:**
   - Never commit API keys, access tokens, or private secrets to git.
   - Server-only secrets must never be prefixed with `NEXT_PUBLIC_`.
5. **Desktop Hardening:**
   - Electron windows must run with `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`.
   - Never expose raw IPC communication (`ipcRenderer.send`) or arbitrary shell execution.
6. **Privacy by Design:**
   - Extension tracking requires explicit opt-in for user-registered domain patterns.
   - Never collect or transmit page contents, DOM nodes, form fields, keystrokes, or general browsing history.

---

## 5. Database Safety & Lifecycle

1. **Dual-Store Architecture:** Local SQLite for desktop; PostgreSQL for cloud.
2. **Desktop Database Location:** SQLite database files must reside in `app.getPath('userData')`, never in packaged app resource directories.
3. **Clean-Install Provisioning:** Packaged Electron apps cannot invoke `npx prisma migrate` in production. Migrations must be handled by an embedded migration runner tracking `PRAGMA user_version`.
4. **Tombstone Deletion Model:** Never perform raw hard deletes on synchronized entities. Mark records with `deletedAt: DateTime` so deletions propagate accurately across devices.
5. **Safe Aggregations:** Run statistics and counts via database aggregation queries (`groupBy`, `aggregate`), not by pulling entire tables into application memory.

---

## 6. Testing & Quality Assurance

1. **Mandatory Baseline Verification:** Before proposing or committing changes, run:
   - `npx tsc --noEmit` (Zero type errors)
   - `npm run lint` (Zero lint violations)
   - `npm test` (All unit and integration tests passing)
   - `npm run build` (Next.js production build succeeds)
2. **Domain Logic Testing:** All calculation logic (session rollups, sync merges, Zod validators) must be covered with comprehensive unit tests.
3. **Security Audit Verification:** Verify tenant isolation and IDOR protections with negative test cases (requesting other users' resources).

---

## 7. Developer Collaboration & Milestones

1. **Consult the Plan:** Read [implementation-plan.md](file:///implementation-plan.md) and identify the active milestone.
2. **Consult Prompts:** Select the corresponding prompt template from [ANTIGRAVITY-PROMPTS.md](file:///ANTIGRAVITY-PROMPTS.md).
3. **Incremental Progress:** Work milestone-by-milestone. Do not begin browser extension or cloud sync until database and security foundations are rock solid.
4. **Documentation Sync:** Keep checkboxes and implementation notes in `implementation-plan.md` updated as work is completed.
5. **Specialized Skills:** When working on specific subsystems, load the corresponding skill from `.agents/skills/`:
   - `mlocker-architecture`: Structural boundaries and taxonomy.
   - `secure-development`: Security, auth, and Electron hardening.
   - `prisma-electron-database`: SQLite, PostgreSQL, and schema management.
   - `mlocker-session-tracking`: Activity tracking, idle heuristics, and rollups.
   - `mlocker-sync-engineering`: Local-first sync, change journal, and conflict resolution.
   - `mlocker-test-and-verify`: Quality gates, test suites, and audit checklists.
