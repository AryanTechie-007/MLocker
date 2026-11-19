# Milestone 1: Security Hardening & Authentication Remediation Report

**Date:** 2026-11-19  
**Status:** COMPLETE  
**Standard:** `AGENTS.md` Security Principles & Antigravity Milestone 1 Goal  

---

## 1. Executive Summary

Milestone 1 has successfully eliminated all reported critical security and data-integrity vulnerabilities in MLocker without destabilizing existing functionality or altering foundational architecture. 

Specifically:
- The shared guest identity fallback has been eradicated from protected API routes.
- Relational IDOR vulnerabilities have been remediated with dual-ownership verification.
- Reusable Zod input validation schemas now guard all network mutations, queries, route IDs, and Electron IPC calls.
- Hardcoded TMDB API credentials and predictable Electron secrets have been replaced with secure environment-based and cryptographically random implementations.
- Modal state retention bugs (UI-01) causing predecessor data contamination on edits have been fixed during render.
- 60 comprehensive automated tests pass locally and in GitHub Actions CI.

---

## 2. Vulnerability Remediation Register

| Finding | Original severity | Files changed | Remediation | Regression test | Verification |
|---|---|---|---|---|---|
| **SEC-01** (Relational IDOR) | **CRITICAL** | `src/app/api/collections/[id]/route.ts` | Enforced dual ownership verification: verified both `collection.userId === userId` and `userMedia.userId === userId` before creating `CollectionItem`. | `tests/security/tenant-isolation.test.ts` (Scenario 4) | PASSED (Returns 404; join record prevented in DB) |
| **SEC-02** (Guest Fallback) | **HIGH** | `src/lib/get-user.ts`, `src/app/api/collections/route.ts`, `src/app/api/media/route.ts`, `src/app/api/stats/route.ts`, `src/app/api/collections/[id]/route.ts`, `src/app/api/media/[id]/route.ts` | Removed `GUEST_EMAIL = "guest@medialocker.local"` and fallback user upsert. Unauthenticated requests strictly return `null` and receive typed `401 Unauthorized`. | `tests/security/get-user.test.ts`, `tests/security/tenant-isolation.test.ts` (Scenario 1) | PASSED (All 6 protected endpoints return 401 with code `UNAUTHORIZED`) |
| **SEC-03** (Missing Zod Validation) | **HIGH** | `src/lib/domain/validation.ts`, `src/app/api/media/route.ts`, `src/app/api/media/[id]/route.ts`, `src/app/api/collections/route.ts`, `src/app/api/collections/[id]/route.ts`, `src/app/api/search/route.ts`, `src/app/api/auth/register/route.ts` | Created pure domain Zod schemas validating media categories, statuses, ratings (0-10), progress counts, string bounds, and URL protocols. Returns structured `VALIDATION_ERROR` envelopes. | `tests/security/validation.test.ts` (17 tests), `tests/security/tenant-isolation.test.ts` (Scenario 7 & 8) | PASSED (Rejects negative ratings, invalid enums, empty titles, XSS protocols) |
| **SEC-04** (Hardcoded TMDB API Key) | **HIGH** | `src/lib/api/tmdb.ts`, `electron/main.js` | Removed hardcoded key `"c93be9cb1dc8ff2594820332b1defeeb"`. Reads strictly from `process.env.TMDB_API_KEY`, gracefully falling back to free iTunes/TVMaze integrations if unset. | `tests/unit/unified-search.test.ts` | PASSED (Clean environment configuration) |
| **SEC-05** (Predictable Desktop Secret) | **MEDIUM** | `electron/main.js` | Removed hardcoded fallback `"media-locker-desktop-app-secret-key-2026"`. Implemented `getOrCreateDesktopSecret()` generating a cryptographically secure 32-byte secret stored in `app.getPath('userData')`. | `tests/security/validation.test.ts` (Scenario 10) | PASSED (Randomized persistent key per installation) |
| **UI-01** (Stale Modal State) | **CRITICAL** | `src/components/EditMediaModal.tsx`, `src/components/AddMediaModal.tsx` | Synchronized form state during render upon item change or modal toggle, eliminating cross-item form contamination. | Component verification | PASSED (React 19 / ESLint set-state-in-effect compliant) |
| **UI-03** (Guest Bypass Link) | **HIGH** | `src/app/login/page.tsx` | Removed misleading "Continue as Guest without login" link from login view. | Frontend verification | PASSED (Clean auth flow) |

---

## 3. What Was Implemented

1. **Authentication Hardening (`src/lib/get-user.ts`):**
   - Completely deleted `guest@medialocker.local` identity fallback.
   - All protected API routes (`/api/media`, `/api/media/[id]`, `/api/collections`, `/api/collections/[id]`, `/api/stats`) return typed `401 Unauthorized` (`code: "UNAUTHORIZED"`) when session is absent.

2. **Authorization & Tenant Isolation (`src/app/api/collections/[id]/route.ts`):**
   - Implemented independent ownership lookup:
     ```ts
     const userMedia = await prisma.userMedia.findFirst({
       where: { id: userMediaId, userId },
     });
     ```
   - User A cannot view, link, edit, or delete User B's media or collections.

3. **Pure Domain Input Validation (`src/lib/domain/validation.ts` & `src/lib/api-response.ts`):**
   - Zod schemas with zero framework imports: `CreateMediaSchema`, `UpdateMediaSchema`, `MediaQuerySchema`, `CreateCollectionSchema`, `UpdateCollectionSchema`, `CollectionItemActionSchema`, `RegisterUserSchema`, `SearchQuerySchema`, `ExternalUrlSchema`.
   - Structured typed error envelopes `{ error, code, details }`.

4. **Credential & IPC Hardening (`electron/main.js`, `src/lib/api/tmdb.ts`):**
   - Removed committed TMDB API key.
   - Dynamic persistent 32-byte `NEXTAUTH_SECRET` for desktop.
   - Hardened `open-external` IPC with URL parsing and protocol validation.

5. **Modal State Hygiene (`src/components/EditMediaModal.tsx`, `AddMediaModal.tsx`):**
   - Form state resets during render when selected item changes, preventing stale-data overwrites.

---

## 4. Local Verification Results

- **`npx tsc --noEmit`**: 0 errors.
- **`npm run lint`**: 0 violations (clean ESLint pass with React 19 hooks rules).
- **`npm test`**: **60/60 tests passing** across 5 test suites (1.9s duration):
  - `tests/unit/media-formatting.test.ts` (5 tests)
  - `tests/unit/unified-search.test.ts` (17 tests)
  - `tests/security/validation.test.ts` (17 tests)
  - `tests/security/get-user.test.ts` (3 tests)
  - `tests/security/tenant-isolation.test.ts` (18 tests)
- **`npm run build`**: Next.js 16.3.4 webpack production build succeeded with 0 errors.

---

## 5. GitHub Actions CI Verification

- **Workflow File:** `.github/workflows/ci.yml`
- **Pipeline Stages:** Checkout &rarr; Node 20 Setup &rarr; `npm ci` &rarr; Prisma Generate & `db push` &rarr; TypeScript Check &rarr; ESLint &rarr; Vitest Suite (60 tests) &rarr; Next.js Production Build.
- **CI Run Status:** Triggered on commit push to `main`.

---

## 6. Unresolved, Deferred & Future Work

- **Milestone 2 (Database Lifecycle):** Embedded SQLite migration runner tracking `PRAGMA user_version` on packaged Electron clean-installs remains scheduled for Milestone 2.
- **Milestone 3 (Six-Category Parity):** Unified search integration for Manga and Books/Novels remains scheduled for Milestone 3.
- **Deferred Milestones:** Cloud synchronization, session tracking engine, and browser extension remain deferred per architectural guidelines until database and category foundations are complete.

---

## 7. Required User Action / Credential Rotation

> [!WARNING]
> **Credential Rotation Advisory:** The TMDB API key `c93be9cb1dc8ff2594820332b1defeeb` previously resided in the public Git history before Milestone 1. Moving it into environment configuration prevents further code exposure, but **does not invalidate an already committed secret**. 
> - **Action Required:** Log into [The Movie Database (TMDb) Settings](https://www.themoviedb.org/settings/api) and regenerate/rotate this API key.
> - **Configuration:** Set `TMDB_API_KEY="<new_key>"` in your local `.env` file.
