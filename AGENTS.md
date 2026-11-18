<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# MLocker Agent Operating Guide

Welcome to **MLocker** (Media Locker). This repository is a cross-platform personal media library and session tracking system supporting **Web (Next.js 15 / React 19)**, **Desktop (Electron + SQLite)**, a **Chromium Browser Extension**, and **Optional Cloud Sync (PostgreSQL)**.

All AI agents and developers contributing to this codebase must adhere strictly to the guidelines and architecture outlined here.

---

## 1. Non-Negotiable Core Principles

1. **User Content & Privacy:** MLocker is a metadata catalog and personal activity logger. It does **not** host, stream, scrape, or distribute copyrighted media files. All media sources are user-configured external links.
2. **Observed Active Time vs Proof of Watching:** Activity tracking measures observed active window engagement on user-approved domains. Never claim verification that a user physically watched or read every second.
3. **No Unauthenticated Guest Fallbacks:** Unauthenticated requests must fail with `401 Unauthorized`. Never fall back to a shared `"guest"` user identifier for multi-user or cloud data.
4. **Relational Tenant Isolation:** Always verify that both parent (e.g. `Collection`) and child (e.g. `MediaItem`) belong to the requesting `userId` before performing relational mutations.
5. **No Raw DB Syncing:** Never synchronize binary SQLite database files across devices. All synchronization must occur via validated JSON change sets over authenticated APIs.
6. **Preserve Foundations:** Work incrementally with the existing Next.js, Electron, Prisma, and Tailwind setup. Do not perform indiscriminate rewrites.

---

## 2. Project Architecture & Ecosystem

```
MLocker/
├── AGENTS.md                          # Primary agent operating instructions (this file)
├── CLAUDE.md                          # Pointer file referencing AGENTS.md
├── implementation-plan.md             # Authoritative multi-phase product implementation plan
├── ANTIGRAVITY-PROMPTS.md             # Phased execution prompts for AI agents
├── .agents/
│   └── skills/                        # Specialized domain skills for agents
│       ├── mlocker-architecture/      # High-level architecture, boundaries, taxonomy
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

---

## 3. Specialized Agent Skills

When working on specific subsystems, agents must consult the dedicated skill guides in `.agents/skills/`:

| Skill | Path | Scope & Focus |
|---|---|---|
| **mlocker-architecture** | [.agents/skills/mlocker-architecture/SKILL.md](file:///.agents/skills/mlocker-architecture/SKILL.md) | Component boundaries, six media categories, clean separation of domain logic. |
| **secure-development** | [.agents/skills/secure-development/SKILL.md](file:///.agents/skills/secure-development/SKILL.md) | Auth enforcement, Zod schemas, IDOR prevention, secret hygiene, Electron hardening. |
| **prisma-electron-database** | [.agents/skills/prisma-electron-database/SKILL.md](file:///.agents/skills/prisma-electron-database/SKILL.md) | SQLite user data paths, clean-install migrations without Prisma CLI, schema models. |
| **mlocker-session-tracking** | [.agents/skills/mlocker-session-tracking/SKILL.md](file:///.agents/skills/mlocker-session-tracking/SKILL.md) | Extension heartbeats, 60s idle detection, debouncing, and session rollup logic. |
| **mlocker-sync-engineering** | [.agents/skills/mlocker-sync-engineering/SKILL.md](file:///.agents/skills/mlocker-sync-engineering/SKILL.md) | Local-first sync protocol, change journal, LWW conflict resolution, offline queue. |
| **mlocker-test-and-verify** | [.agents/skills/mlocker-test-and-verify/SKILL.md](file:///.agents/skills/mlocker-test-and-verify/SKILL.md) | Static analysis, unit/integration testing, security audit checklist before PRs. |

---

## 4. Execution Workflow for Agents

1. **Consult the Plan:** Read [implementation-plan.md](file:///implementation-plan.md) and identify the active milestone.
2. **Consult Prompts:** Read [ANTIGRAVITY-PROMPTS.md](file:///ANTIGRAVITY-PROMPTS.md) for pre-formulated prompts and acceptance criteria for that milestone.
3. **Verify Baseline First:** Check git status, typecheck (`npx tsc --noEmit`), and lint before editing files.
4. **Isolate Domain Logic:** Keep calculation algorithms (session rollups, sync merges, schema validation) in `src/lib/domain/` with zero Next.js or Electron imports so they can be unit-tested cleanly.
5. **Verify Before Completion:** Execute the checklist in `mlocker-test-and-verify` before reporting a task complete.
