---
name: mlocker-architecture
description: Architecture guidelines, structural conventions, and component boundaries for the MLocker ecosystem (Next.js Web, Electron Desktop, Chromium Extension, and Cloud Sync).
---

# MLocker Architecture Skill

## 1. System Overview

MLocker is a personal cross-platform media organization and session tracking platform. It does **not** host, stream, scrape, or distribute media. Instead, it maintains a structured catalog of user media across six categories, launches user-specified external links, and passively tracks observed engagement sessions.

```
┌────────────────────────────────────────────────────────┐
│                   Browser Extension                    │
│   (User-registered domain detection & heartbeat API)   │
└───────────────────────────┬────────────────────────────┘
                            │ (Local bridge / HTTPS API)
                            ▼
┌───────────────────────────────┐   ┌───────────────────────────────┐
│     Electron Desktop App      │   │      Next.js Web Client       │
│  - React UI (Renderer)        │   │  - React 19 / Next.js 15      │
│  - IPC Channel (Preload)      │   │  - Server Actions & REST API  │
│  - SQLite (Local Primary DB)  │   │  - Zod Validation             │
│  - Local Activity Bridge      │   │  - Auth.js / Secure Sessions  │
└───────────────┬───────────────┘   └───────────────┬───────────────┘
                │                                   │
                │     Incremental Sync Protocol     │
                │     (JSON Change Journal / HTTP)  │
                └─────────────────►◄────────────────┘
                                  │
                                  ▼
                   ┌──────────────────────────────┐
                   │     PostgreSQL Cloud DB      │
                   │   (Prisma ORM Cloud Schema)  │
                   └──────────────────────────────┘
```

---

## 2. Platform Roles & Boundaries

### 2.1 Next.js Web Client (`src/`)
- **Framework:** Next.js 15 (App Router) + React 19 + Tailwind CSS.
- **Role:** Web interface for cloud-connected users.
- **Constraints:**
  - Operates purely in standard browser sandbox.
  - Never attempts to read or inspect other browser tabs or operating system processes.
  - Talks directly to authenticated Next.js API route handlers.

### 2.2 Electron Desktop Client (`electron/`)
- **Framework:** Electron with hardened multi-process architecture.
- **Role:** Local-first desktop workspace with offline support.
- **Storage:** Dedicated SQLite database located in `app.getPath('userData')`.
- **Security & IPC:**
  - `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
  - All communication between Renderer (`src/`) and Main (`electron/`) occurs via strictly typed preload bridge (`electron/preload.js`).
  - No raw SQL or unrestricted file system access exposed to the renderer.

### 2.3 Browser Extension (`extension/`)
- **Platform:** Chromium Manifest V3 WebExtension.
- **Role:** Captures active tab engagement signals exclusively for URLs matching user-registered sources.
- **Boundaries:**
  - Zero access to page DOM, form inputs, credentials, tokens, or arbitrary browsing history.
  - Only active window/tab state, URL origin matching, and idle time are processed.

### 2.4 Cloud & Sync Engine
- **Database:** PostgreSQL accessed via Prisma ORM.
- **Protocol:** REST-based change journal sync (LWW conflict resolution with tombstones).
- **Rule:** Never synchronize binary SQLite database files directly. Sync logical, validated domain records.

---

## 3. Six Media Categories Taxonomy

MLocker strictly supports six first-class media categories. Domain structures must treat each uniformly:

| Category | Identifier | Primary Progress Metric | Key Metadata Attributes |
|---|---|---|---|
| **Movies** | `MOVIE` | Runtime minutes / Watched status | Director, Release Year, Runtime |
| **TV Shows** | `TV_SHOW` | Season & Episode counts | Seasons, Episodes, Air Dates |
| **Anime** | `ANIME` | Episode count | Episodes, Format (TV/OVA/Movie), Studio |
| **Manga** | `MANGA` | Chapters / Volumes read | Chapters, Volumes, Serialization, Author |
| **Games** | `GAME` | Playtime hours / Completion status | Platform, Developer, Release Year |
| **Books / Novels** | `BOOK` | Chapters / Pages / Percentage | Author, Page Count, Chapters, ISBN |

---

## 4. Separation of Concerns & Clean Code Layout

All business and domain logic must be strictly decoupled from presentation frameworks:

```
src/
├── app/                  # Next.js App Router pages & route handlers
├── components/           # Presentation UI components (stateless where possible)
├── lib/
│   ├── domain/           # Pure domain logic (ZERO Next.js or Electron imports)
│   │   ├── categories/   # Category definitions, metrics, and parsers
│   │   ├── session/      # Session calculation, idle cutoff, duration rollups
│   │   ├── sync/         # Change journal, diff calculation, conflict resolution
│   │   └── validation/   # Zod schemas for all models & API contracts
│   ├── db/               # Prisma client and database accessor instances
│   └── desktop/          # Electron IPC wrapper with safe fallback for web
```

### Architectural Guardrails:
1. **No Next.js dependencies in Domain Logic:** `src/lib/domain/` must remain runnable under Node, Electron, or Web Worker environments without polyfills.
2. **Deterministic Time Calculations:** Track active session duration as elapsed seconds of confirmed user activity. Never extrapolate or claim passive media consumption without verification.
3. **Graceful Degradation:** If running in Web mode, Electron IPC APIs must safely return stubbed or no-op responses without throwing runtime crashes.
