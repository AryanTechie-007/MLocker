# Backend & Desktop Component Security & Architecture Audit

**Target:** `src/app/api/`, `src/lib/`, `electron/`, `prisma/`  
**Auditor:** Scanner 2 (`scanbackend`)  
**Standard:** `AGENTS.md` Operating Guide & Security Rules  
**Date:** 2026-11-19  

---

## 1. Executive Summary

A comprehensive static audit was performed across all backend API route handlers (`src/app/api/`), domain/shared utilities (`src/lib/`), Electron desktop runtime components (`electron/`), and database schema definitions (`prisma/`).

While the codebase features solid foundations in desktop sandboxing (`contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`) and NextAuth JWT authentication, several **critical security vulnerabilities**, **architectural deviations**, and **data integrity risks** were identified against the mandatory rules specified in `AGENTS.md`.

### Critical Finding Highlights:
1. **Critical IDOR & Relational Tenant Violation in Collection Item Linkage (`POST /api/collections/[id]`):**  
   The endpoint does not verify that the target `userMediaId` belongs to the authenticated user before creating a `CollectionItem`. An authenticated user can attach any other user's private media item to their collection, subsequently leaking the other tenant's private metadata, ratings, tags, and reviews via `GET /api/collections/[id]`.
2. **Unauthenticated Shared Guest User Fallback (`src/lib/get-user.ts`):**  
   All collection, media, and stats endpoints fall back to `getOrCreateUserId()` / `getUserId()`, which upserts and attaches requests to a shared `guest@medialocker.local` account when unauthenticated. This violates the core rule that unauthenticated requests must strictly fail with `401 Unauthorized`.
3. **Total Absence of Zod Schema Validation Across All Routes and IPC:**  
   `zod` is not installed or used anywhere in API endpoints or Electron IPC handlers. Requests lack type bounds, string sanitization, enum validation (for status, media types), and URL protocol enforcement (`http:` / `https:`).
4. **Violation of Tombstone Deletion Model (Hard Deletes):**  
   Neither `UserMedia`, `Collection`, nor `CollectionItem` have `deletedAt` timestamp columns. All delete endpoints execute raw SQL hard deletes (`delete` / `deleteMany`), breaking future multi-device sync and conflict resolution.
5. **Memory-Exhaustive Database Aggregations (`/api/stats`):**  
   The statistics endpoint loads the user's entire media catalog into Node.js application memory via `prisma.userMedia.findMany()` and iterates over records in JavaScript, directly violating Rule 5.5.
6. **Hardcoded Secrets in Source Code:**  
   Hardcoded fallback secrets and production TMDB API keys are directly embedded in `electron/main.js` and `src/lib/api/tmdb.ts`.

---

## 2. Detailed Findings by Rule Category

### Category A: Authentication Enforcement & Guest Fallbacks
**Rules Cited:** AGENTS.md Rule 1.6 ("No Unauthenticated Guest Fallbacks: Unauthenticated requests must fail with 401 Unauthorized"), Rule 4.1 ("Reject unauthenticated requests to protected endpoints with 401 Unauthorized").

#### Finding A.1: Shared Guest Fallback in `getOrCreateUserId` and `getUserId`
- **Location:** [`src/lib/get-user.ts`](file:///src/lib/get-user.ts#L4-L42)
- **Severity:** High
- **Description:**  
  `getOrCreateUserId()` checks `session?.user?.id`; if absent, it executes:
  ```typescript
  const guest = await prisma.user.upsert({
    where: { email: GUEST_EMAIL }, // "guest@medialocker.local"
    update: {},
    create: { name: "Guest Explorer", email: GUEST_EMAIL },
  });
  return guest.id;
  ```
  `getUserId()` similarly looks up the same `guest@medialocker.local` user.
- **Affected Endpoints:**
  - `GET /api/collections` ([`src/app/api/collections/route.ts#L7`](file:///src/app/api/collections/route.ts#L7))
  - `POST /api/collections` ([`src/app/api/collections/route.ts#L37`](file:///src/app/api/collections/route.ts#L37))
  - `GET /api/collections/[id]` ([`src/app/api/collections/[id]/route.ts#L11`](file:///src/app/api/collections/[id]/route.ts#L11))
  - `PATCH /api/collections/[id]` ([`src/app/api/collections/[id]/route.ts#L48`](file:///src/app/api/collections/[id]/route.ts#L48))
  - `DELETE /api/collections/[id]` ([`src/app/api/collections/[id]/route.ts#L88`](file:///src/app/api/collections/[id]/route.ts#L88))
  - `POST /api/collections/[id]` ([`src/app/api/collections/[id]/route.ts#L121`](file:///src/app/api/collections/[id]/route.ts#L121))
  - `GET /api/media` ([`src/app/api/media/route.ts#L8`](file:///src/app/api/media/route.ts#L8))
  - `POST /api/media` ([`src/app/api/media/route.ts#L63`](file:///src/app/api/media/route.ts#L63))
  - `GET /api/media/[id]` ([`src/app/api/media/[id]/route.ts#L12`](file:///src/app/api/media/[id]/route.ts#L12))
  - `PATCH /api/media/[id]` ([`src/app/api/media/[id]/route.ts#L48`](file:///src/app/api/media/[id]/route.ts#L48))
  - `DELETE /api/media/[id]` ([`src/app/api/media/[id]/route.ts#L111`](file:///src/app/api/media/[id]/route.ts#L111))
  - `GET /api/stats` ([`src/app/api/stats/route.ts#L7`](file:///src/app/api/stats/route.ts#L7))
- **Impact:**  
  Any unauthenticated HTTP request automatically authenticates as the shared `guest@medialocker.local` tenant. In multi-user web deployments or cloud sync contexts, unauthenticated users can view, modify, and delete the guest library, leading to data corruption and potential cross-tenant leakage.
- **Remediation:**  
  Enforce strict session validation: `const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });`. Guest mode must be restricted strictly to local offline desktop SQLite environments.

---

### Category B: Tenant Isolation & IDOR Risks
**Rules Cited:** AGENTS.md Rule 1.7 ("Relational Tenant Isolation: Always verify that both parent and child belong to requesting userId"), Rule 4.2 ("Tenant Isolation (IDOR Prevention): Every mutation and query touching user data must explicitly match userId: session.userId").

#### Finding B.1: Critical Relational IDOR in Collection Item Association
- **Location:** [`src/app/api/collections/[id]/route.ts`](file:///src/app/api/collections/[id]/route.ts#L115-L177)
- **Severity:** Critical
- **Description:**  
  When an item is added to a collection via `POST /api/collections/[id]`:
  ```typescript
  const collection = await prisma.collection.findFirst({
    where: { id: collectionId, userId },
  });
  if (!collection) {
    return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  }

  const { userMediaId, action } = await req.json();
  ...
  const newItem = await prisma.collectionItem.create({
    data: {
      collectionId,
      userMediaId,
      order: count,
    },
  });
  ```
  The endpoint verifies that `collection.userId === userId`, but **fails to verify that `userMediaId` belongs to `userId`**.
- **Impact:**  
  An attacker can take any arbitrary `userMediaId` belonging to Victim User B and associate it with Attacker User A's `collectionId`. Once associated, Attacker User A calls `GET /api/collections/[id]`, which returns:
  ```typescript
  items: { include: { userMedia: true } }
  ```
  This leaks User B's entire `UserMedia` record (including private watch notes, personal review, custom tags, and watch dates) to User A.
- **Remediation:**  
  Before creating `CollectionItem`, verify ownership of the child item:
  ```typescript
  const mediaItem = await prisma.userMedia.findFirst({
    where: { id: userMediaId, userId },
  });
  if (!mediaItem) {
    return NextResponse.json(
      { error: "Media item not found or unauthorized", code: "RESOURCE_NOT_FOUND" },
      { status: 404 }
    );
  }
  ```

#### Finding B.2: Non-Atomic Query & Mutation in `PATCH`/`DELETE` Handlers
- **Location:** [`src/app/api/collections/[id]/route.ts#L63`](file:///src/app/api/collections/[id]/route.ts#L63), [`src/app/api/media/[id]/route.ts#L90-L125`](file:///src/app/api/media/[id]/route.ts#L90-L125)
- **Severity:** Medium
- **Description:**  
  Handlers perform a two-step check:
  1. `existing = await prisma.userMedia.findFirst({ where: { id, userId } });`
  2. `await prisma.userMedia.update({ where: { id }, data: ... })` (and `delete({ where: { id } })`).
  While ownership is verified in step 1, the mutation step targets only `{ id }`.
- **Remediation:**  
  Use compound/atomic ownership conditions in mutations or use `updateMany`/`deleteMany` where `{ id, userId }` is enforced directly in the mutating query.

---

### Category C: Input Validation & Zod Coverage
**Rules Cited:** AGENTS.md Rule 4.3 ("Validate every API payload and Electron IPC argument using Zod. Enforce category enums, status enums, rating bounds (0-100), progress counts, and URL protocols (http:, https: only)"), Rule 3.3 ("Always return typed, structured API error responses ({ error: string, code: string, details?: unknown })").

#### Finding C.1: Zero Zod Schema Usage Across the Entire Backend
- **Location:** All routes in `src/app/api/` and `electron/main.js`
- **Severity:** High
- **Description:**  
  `zod` is not installed in `package.json` and no route validates request bodies or query parameters with schema parsers.
  
#### Finding C.2: Unchecked Bounds, Types, and Enums in `/api/media`
- **Location:** [`src/app/api/media/route.ts#L68-L155`](file:///src/app/api/media/route.ts#L68-L155), [`src/app/api/media/[id]/route.ts#L63-L89`](file:///src/app/api/media/[id]/route.ts#L63-L89)
- **Severity:** High
- **Specific Vulnerabilities:**
  1. **Rating Bounds:** `rating` is parsed using `parseFloat(rating)` without bounds checks. AGENTS.md Rule 4.3 mandates bounds checking (0-100). Currently, a user can submit negative values (`-50`), out-of-range floats (`99999`), or `NaN`.
  2. **Enum Validation:** `mediaType` (`movie`, `tv`, `anime`, `manga`, `game`, `novel`) and `status` (`plan_to_consume`, `in_progress`, `completed`, `on_hold`, `dropped`) are accepted as arbitrary strings.
  3. **Progress Counts:** `watchedEpisodes`, `totalEpisodes`, `readChapters`, `totalChapters`, and `hoursPlayed` accept negative integers or non-integer floating points without validation.
  4. **URL Protocols:** `posterUrl` and `coverUrl` are stored without verifying URL syntax or enforcing `http:`/`https:` protocols. Malicious payloads could attempt `javascript:` or data URI injections.
  5. **Query String Injection / DoS:** In `GET /api/media`, `limit` is parsed via `parseInt(limit, 10)` without an upper bound cap (e.g. max 100), allowing excessive memory allocation.
  
#### Finding C.3: Unstructured API Error Responses
- **Location:** All routes in `src/app/api/`
- **Severity:** Low
- **Description:**  
  All error responses return `{ error: string }` instead of the required structured format:
  `{ error: string, code: string, details?: unknown }`.

---

### Category D: Database Access Patterns & Data Lifecycle
**Rules Cited:** AGENTS.md Rule 5.1 ("Dual-Store Architecture: Local SQLite for desktop; PostgreSQL for cloud"), Rule 5.4 ("Tombstone Deletion Model: Never perform raw hard deletes on synchronized entities. Mark records with deletedAt: DateTime"), Rule 5.5 ("Safe Aggregations: Run statistics and counts via database aggregation queries (groupBy, aggregate), not by pulling entire tables into application memory").

#### Finding D.1: Missing Tombstone Columns & Raw Hard Deletes
- **Location:** [`prisma/schema.prisma`](file:///prisma/schema.prisma#L21-L87), [`src/app/api/media/[id]/route.ts#L124`](file:///src/app/api/media/[id]/route.ts#L124), [`src/app/api/collections/[id]/route.ts#L100`](file:///src/app/api/collections/[id]/route.ts#L100)
- **Severity:** High
- **Description:**  
  `UserMedia`, `Collection`, and `CollectionItem` schemas lack a `deletedAt DateTime?` field.
  When entities are deleted:
  - `prisma.userMedia.delete({ where: { id } })`
  - `prisma.collection.delete({ where: { id } })`
  - `prisma.collectionItem.deleteMany(...)`
- **Impact:**  
  Hard deletes destroy record history and make multi-device synchronization and change-journal tracking impossible. Deleted records cannot be propagated as tombstones to cloud or peer devices.
- **Remediation:**  
  Add `deletedAt DateTime?` to `UserMedia`, `Collection`, and `CollectionItem` models. Implement soft deletes (`update({ where: { id }, data: { deletedAt: new Date() } })`) and filter active queries with `{ where: { deletedAt: null } }`.

#### Finding D.2: In-Memory Aggregations in `/api/stats`
- **Location:** [`src/app/api/stats/route.ts#L12-L124`](file:///src/app/api/stats/route.ts#L12-L124)
- **Severity:** Medium
- **Description:**  
  The endpoint pulls the complete set of user media into Node.js application memory:
  ```typescript
  const items = await prisma.userMedia.findMany({ where: { userId } });
  ```
  It then calculates `totalTracked`, `mediaTypeCounts`, `statusCounts`, `totalHoursPlayed`, `totalEpisodesWatched`, `totalChaptersRead`, `ratingSum`, and histograms via manual `items.forEach(...)` iteration.
- **Impact:**  
  As user catalogs grow to thousands of items, this causes high memory consumption, garbage collector pauses, and slow response times.
- **Remediation:**  
  Use database engine aggregations:
  - `prisma.userMedia.count({ where: { userId } })`
  - `prisma.userMedia.groupBy({ by: ['mediaType'], where: { userId }, _count: true })`
  - `prisma.userMedia.aggregate({ where: { userId }, _sum: { watchedEpisodes: true, readChapters: true, hoursPlayed: true }, _avg: { rating: true } })`

---

### Category E: Electron IPC Security & Desktop Lifecycle
**Rules Cited:** AGENTS.md Rule 4.5 ("Desktop Hardening"), Rule 5.2 ("Desktop Database Location"), Rule 5.3 ("Clean-Install Provisioning: Packaged Electron apps cannot invoke npx prisma migrate in production. Migrations must be handled by an embedded migration runner tracking PRAGMA user_version").

#### Finding E.1: Missing Embedded Migration Runner for Packaged Desktop App
- **Location:** [`electron/main.js#L21-L71`](file:///electron/main.js#L21-L71)
- **Severity:** High
- **Description:**  
  `setupDatabase()` checks if `dev.db` exists in `app.getPath("userData")`. If not, it attempts to copy a template DB file from packaged resources. If no template exists:
  ```javascript
  if (!copied) {
    console.log(`[Media Locker] No starter DB found, SQLite will create a new file at ${targetDbPath}`);
  }
  ```
  SQLite will create a zero-byte empty database file, but no schema migrations are applied. When the app launches, queries fail because tables do not exist.
- **Remediation:**  
  Implement an embedded SQLite migration runner in the Electron main process that inspects `PRAGMA user_version`, runs versioned migration DDL statements inside an atomic transaction, and updates `PRAGMA user_version`.

#### Finding E.2: IPC Input Validation
- **Location:** [`electron/main.js#L289-L293`](file:///electron/main.js#L289-L293)
- **Severity:** Low
- **Description:**  
  `open-external` IPC handler validates that `url` starts with `http://` or `https://`, which prevents protocol hijacking (such as `file://`, `calc.exe`, `powershell:`). However, argument validation does not use Zod schemas as specified by Rule 4.3.

#### Positive Desktop Hardening Confirmations:
- `contextIsolation: true` is properly configured ([`electron/main.js#L178`](file:///electron/main.js#L178)).
- `nodeIntegration: false` is properly configured ([`electron/main.js#L179`](file:///electron/main.js#L179)).
- `sandbox: true` is properly configured ([`electron/main.js#L180`](file:///electron/main.js#L180)).
- `setWindowOpenHandler` denies untrusted window creation and delegates to `shell.openExternal` ([`electron/main.js#L190-L196`](file:///electron/main.js#L190-L196)).
- `will-navigate` blocks navigation away from the application origin ([`electron/main.js#L198-L209`](file:///electron/main.js#L198-L209)).
- Preload script ([`electron/preload.js`](file:///electron/preload.js#L1-L8)) exposes only whitelisted APIs through `contextBridge.exposeInMainWorld`, preventing raw `ipcRenderer` access.

---

### Category F: Secret Hygiene & Credential Exposure
**Rules Cited:** AGENTS.md Rule 4.4 ("Secret Hygiene: Never commit API keys, access tokens, or private secrets to git. Server-only secrets must never be prefixed with NEXT_PUBLIC_").

#### Finding F.1: Hardcoded TMDB API Key Committed in Multiple Files
- **Location:** [`electron/main.js#L67`](file:///electron/main.js#L67), [`src/lib/api/tmdb.ts#L74`](file:///src/lib/api/tmdb.ts#L74)
- **Severity:** High
- **Description:**  
  The TMDB API Key `c93be9cb1dc8ff2594820332b1defeeb` is directly hardcoded as a fallback string in both `electron/main.js` and `src/lib/api/tmdb.ts`.
- **Remediation:**  
  Remove hardcoded keys from version control. Read exclusively from `process.env.TMDB_API_KEY`. In packaged desktop distributions, provide keys via secure environment injection or user settings.

#### Finding F.2: Hardcoded Fallback `NEXTAUTH_SECRET`
- **Location:** [`electron/main.js#L149`](file:///electron/main.js#L149)
- **Severity:** Medium
- **Description:**  
  `process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || "media-locker-desktop-app-secret-key-2026";`
- **Remediation:**  
  Generate an ephemeral random cryptographic secret at desktop startup if none is set, or persist a securely generated secret in the user's data store.

---

### Category G: Architecture Decoupling & Pure Domain Layer
**Rules Cited:** AGENTS.md Rule 2 ("src/lib/domain/ (Pure Domain): Contains session rollup algorithms, sync merge rules, and validation schemas. Zero Next.js or Electron imports. Runnable in Node, Electron, or Web Worker").

#### Finding G.1: Missing `src/lib/domain/` Module
- **Location:** `src/lib/`
- **Severity:** Medium
- **Description:**  
  The `src/lib/domain/` directory does not exist. Domain search scoring and string normalization (`calculateScore`, `normalizeString`) are bundled directly inside the API caller `src/lib/api/unified-search.ts`.
- **Remediation:**  
  Extract pure domain algorithms (e.g. search scoring, text normalization, schema validators, session rollups) into `src/lib/domain/` with zero Next.js or Electron dependencies.

---

## 3. Component-by-Component Audit Scorecard

| Component / File | Auth Checks | Tenant Isolation | Zod Validation | DB Safety / Soft Delete | IPC / Desktop Security | Overall Status |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| `src/app/api/auth/register/route.ts` | N/A (Public) | N/A | ❌ None | ⚠️ Basic findUnique | N/A | **Needs Hardening** |
| `src/app/api/collections/route.ts` | ❌ Guest fallback | ⚠️ Relies on guest | ❌ None | ⚠️ No soft delete | N/A | **Vulnerable** |
| `src/app/api/collections/[id]/route.ts` | ❌ Guest fallback | 🚨 **CRITICAL IDOR** | ❌ None | ❌ Raw hard delete | N/A | **CRITICAL FAULT** |
| `src/app/api/media/route.ts` | ❌ Guest fallback | ⚠️ Relies on guest | ❌ None | ⚠️ No soft delete | N/A | **Vulnerable** |
| `src/app/api/media/[id]/route.ts` | ❌ Guest fallback | ⚠️ 2-step check | ❌ None | ❌ Raw hard delete | N/A | **Vulnerable** |
| `src/app/api/stats/route.ts` | ❌ Guest fallback | ⚠️ Relies on guest | N/A | ❌ In-memory aggregation | N/A | **Defective Pattern** |
| `src/app/api/search/route.ts` | N/A (Public) | N/A | ❌ Basic query check | N/A | N/A | **Needs Validation** |
| `src/lib/get-user.ts` | ❌ Shared guest leak | ❌ Shared guest leak | N/A | N/A | N/A | **Rule Violation** |
| `src/lib/auth.ts` | ✅ NextAuth v5 JWT | ✅ Token ID mapped | N/A | ✅ Secure hash compare | N/A | **Compliant** |
| `src/lib/api/tmdb.ts` | N/A | N/A | N/A | N/A | ❌ Hardcoded API key | **Secret Leak** |
| `electron/main.js` | N/A | N/A | ⚠️ Manual check | ❌ No migration runner | ✅ Sandboxed, Isolated | **Needs Migrations & Secret Fix** |
| `electron/preload.js` | N/A | N/A | N/A | N/A | ✅ Safe contextBridge | **Compliant** |
| `prisma/schema.prisma` | N/A | ⚠️ Missing user checks on items | N/A | ❌ No `deletedAt` field | N/A | **Schema Update Required** |

---

## 4. Priority Remediation Roadmap

### Priority 1: Fix Critical IDOR in `POST /api/collections/[id]`
- Verify child `userMediaId` belongs to `session.userId` before creating `CollectionItem`.
- Return `404 Not Found` if the media item does not exist or belongs to another user.

### Priority 2: Remove Unauthenticated Guest Fallbacks from API Endpoints
- In `src/lib/get-user.ts`, deprecate `getOrCreateUserId` for cloud/API endpoints.
- Require authenticated session `session?.user?.id`; return `401 Unauthorized` with `{ error: "Unauthorized", code: "UNAUTHORIZED" }` when missing.
- Keep guest mode strictly local to desktop offline SQLite.

### Priority 3: Install Zod & Implement Request Schemas
- Install `zod` (`npm i zod`).
- Define schemas in `src/lib/domain/validation/` for:
  - Registration payload (email format, password min length).
  - Media item create/update (enum checks for `mediaType`, `status`; bounds `0-100` for rating; positive integers for progress; protocol check `^https?://` for `posterUrl`).
  - Collection create/update (`coverUrl` protocol check, name trimming).
  - Collection item modification (action enum: `"add" | "remove"`).

### Priority 4: Implement Tombstone Deletion Model
- Update `prisma/schema.prisma` to add `deletedAt DateTime?` on `UserMedia`, `Collection`, and `CollectionItem`.
- Update API DELETE endpoints to set `deletedAt = new Date()` instead of hard deletes.
- Filter active queries with `deletedAt: null`.

### Priority 5: Refactor `/api/stats` to Safe Database Aggregations
- Replace `prisma.userMedia.findMany` with Prisma `groupBy` and `aggregate` queries to avoid loading entire catalogs into Node.js process memory.

### Priority 6: Clean Secret Hygiene & Desktop Provisioning
- Strip hardcoded `TMDB_API_KEY` from `electron/main.js` and `src/lib/api/tmdb.ts`.
- Build an embedded SQLite migration runner in `electron/` using `PRAGMA user_version` to guarantee clean desktop installs.
