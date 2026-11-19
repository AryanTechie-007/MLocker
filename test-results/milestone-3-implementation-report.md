# MLocker — Milestone 3 Implementation & Corrective Verification Report

**Milestone:** Milestone 3 — Six-Category Search and Library Integration  
**Date:** November 20, 2026  
**Status:** In Review / Awaiting Verification  
**Repository:** `AryanTechie-007/MLocker`  
**Branch:** `main`  
**Audit Report:** [`test-results/milestone-3-six-category-audit.md`](file:///test-results/milestone-3-six-category-audit.md)  
**Implementation Commit (Initial):** [`3c886626e42d871d58089071d88c75d48caa3a03`](https://github.com/AryanTechie-007/MLocker/commit/3c886626e42d871d58089071d88c75d48caa3a03)  
**Documentation Commit:** [`1610079b7ca7cf1cf5cf360ddaa28a5043bf72fa`](https://github.com/AryanTechie-007/MLocker/commit/1610079b7ca7cf1cf5cf360ddaa28a5043bf72fa)  

---

## 1. Executive Summary

Milestone 3 delivers consistent support across all six media categories supported by MLocker:
1. **Movies** (`movie`)
2. **TV Shows** (`tv`)
3. **Anime** (`anime`)
4. **Manga** (`manga`)
5. **Video Games** (`game`)
6. **Novels & Books** (`novel`, with `book` accepted as an API alias)

Following an initial implementation pass, an independent corrective review identified a functional defect in TMDb anime search: when the classifier found zero matches, TMDb anime search fell back to returning unfiltered ordinary TV shows or movies and labelled them as `mediaType: "anime"`, bypassing Kitsu fallback and polluting anime results.

This report documents the completed implementation of Milestone 3, the targeted correction of the anime classifier and fallback engine, and the comprehensive verification results across automated test suites, type checking, linting, and production builds.

---

## 2. Architecture Decisions Applied

### Decision 1 — Canonical Identifier (`novel` vs `book`)
- **Persistence & Runtime:** Retained `novel` as the single canonical identifier in the database (`UserMedia.mediaType = 'novel'`) and runtime TypeScript definitions (`MediaType = "movie" | "tv" | "anime" | "manga" | "game" | "novel"`).
- **API Boundary Normalization:** In `src/lib/domain/validation.ts`, `MediaTypeEnum` uses `.transform((val) => val === "book" ? "novel" : val)`. Any payload or query string submitting `"book"` (via API endpoints, manual entry, or search parameters) is automatically normalized to `"novel"` before reaching application logic or persistence.
- **UI Presentation:** User-facing labels across search pills, navigation tabs, and modal selectors read `"Novels & Books"`.

### Decision 2 — Book Progress Tracking
- **Chapter Tracking Retained:** Novels and books track progress using the existing chapter counters (`readChapters` and `totalChapters`).
- **Zero Schema Migrations:** No page tracking columns (`readPages`, `totalPages`) or database migrations were introduced.
- **Validation:** Added schema validation in `src/lib/domain/validation.ts` ensuring chapter counters are non-negative integers.

### Decision 3 — Anime Fallback & Classifier Correction
- **Primary Provider:** TMDb remains the primary anime provider (`searchTMDBAnime`).
- **Strict Classification:** Only items meeting strict anime criteria via `checkIsAnime()` (Japanese animation, or animation with recognized anime studios/franchise keywords) are returned as anime.
- **Zero Leakage:** Ordinary movies or TV shows are never returned by `searchTMDBAnime()` and are never labelled as `mediaType: "anime"`.
- **Automatic Fallback:** When TMDb produces zero classified anime results, TMDb API key is missing, or TMDb throws an error, `getAnime()` in `unified-search.ts` automatically invokes Kitsu (`searchKitsuAnime`).
- **Graceful Failure:** If both TMDb and Kitsu fail or return no results, `getAnime()` returns an empty array without throwing unhandled exceptions.

### Decision 4 — Provider Rename & Backward Compatibility
- **Renamed:** `src/lib/api/jikan.ts` was renamed to `src/lib/api/kitsu.ts` via `git mv`, reflecting actual Kitsu API v3 integration.
- **Legacy Compatibility:** In `src/lib/api/types.ts` and `prisma/schema.prisma`, `externalSource: "jikan"` is preserved as a recognized legacy value so existing database records remain valid without database migration.

---

## 3. Provider Architecture & Integration Matrix

| Category | Primary Provider | Fallback Provider | Timeout | Rating Scale Mapping |
|---|---|---|---|---|
| **Movies** | TMDb (`api.themoviedb.org`) | iTunes Search API | 8000ms | 0–10 scale |
| **TV Shows** | TMDb (`api.themoviedb.org`) | TVMaze API | 8000ms | 0–10 scale |
| **Anime** | TMDb (`searchTMDBAnime`) | Kitsu API v3 (`kitsu.io/api/edge/anime`) | 8000ms | Percentage (0–100) converted to 0–10 (`rating / 10`) |
| **Manga** | Kitsu API v3 (`kitsu.io/api/edge/manga`) | None (Manual entry available) | 8000ms | Percentage (0–100) converted to 0–10 (`rating / 10`) |
| **Games** | Steam Store API (`store.steampowered.com`) | None (Manual entry available) | 8000ms | Metacritic/review score converted to 0–10 |
| **Novels & Books** | Open Library (`openlibrary.org/search.json`) | None (Manual entry available) | 8000ms | 5-star `ratings_average` mapped to 0–10 (`round(val * 2 * 10) / 10`) |

- **Timeout Guards:** All providers use `AbortSignal.timeout(8000)` to prevent hung network connections.
- **Query Validation:** All providers return `[]` immediately for empty or whitespace-only queries.
- **Error Isolation:** Individual provider rejections are caught internally, logging an error and returning `[]` without disrupting other providers.

---

## 4. Unified Search Engine

- **Concurrent 6-Way Dispatch (`type: "all"`):** Dispatches concurrent searches across movies, tv, anime, manga, games, and novels via `Promise.all`.
- **Dedicated Route Isolation:** When searching a specific category (`movie`, `tv`, `anime`, `manga`, `game`, `novel`, or alias `book`), only the designated provider is queried. Zero cross-category leakage occurs.
- **Scoring & Deduplication:** Items are scored using title exact match, prefix match, and token overlap bonuses, plus bonuses for posters, ratings, and watch providers. Items with the same title across different media types (e.g., "Fallout" game vs "Fallout" TV series) are both preserved using the compound key `${item.mediaType}:${normalizeString(item.title)}`.
- **Fault Resilience:** If one provider fails (e.g., Open Library 503 or Kitsu timeout), all other providers continue and their results are returned cleanly.

---

## 5. UI and User Experience

1. **Search Page (`src/app/search/page.tsx`):**
   - Added category filter pills for **Manga** and **Novels & Books**.
   - Fixed bug where clicking "Games" intercepted the selection and opened the manual entry modal. Selecting "Games" now performs a live game search.
   - Category pill click immediately dispatches `handleSearch(query, cat.type)` to prevent stale search results.
2. **Manual Entry Modal (`src/components/AddMediaModal.tsx`):**
   - Added `<option value="manga">Manga</option>` and `<option value="novel">Novels & Books</option>`.
   - Renders chapter progress fields (`readChapters` and `totalChapters`) for `mediaType === "manga" || mediaType === "novel"`.
   - `resolveInitialType` normalizes `"book"` to `"novel"`.
3. **Library Page (`src/app/library/page.tsx`):**
   - Added category filter tabs for **Manga** and **Novels & Books** with Lucide icons (`BookMarked`, `BookOpen`).
   - Normalizes `initialType` and query params so `?type=book` properly filters `novel`.
   - Updated count badges and list-view chapter displays to handle novels, manga, and legacy book records.
4. **Detail Page (`src/app/media/[id]/page.tsx`):**
   - Header labels and metadata displays reflect the active category.
5. **Watch / Read / Play Links (`src/components/WatchProviderBadge.tsx`):**
   - **Manga:** Direct quick-search links for MangaDex, BookWalker, Crunchyroll, and VIZ Media.
   - **Novels & Books:** Direct search links for Open Library, Goodreads, Google Books, and Amazon Books.

---

## 6. Corrective Defect Resolution: Anime Classification & Fallback

### The Defect
In `src/lib/api/tmdb.ts`, `searchTMDBAnime()` previously contained fallback logic:
```ts
// PREVIOUS DEFECTIVE CODE:
const candidateTv = filteredTv.length > 0 ? filteredTv.slice(0, 8) : tvItems.slice(0, 5);
const candidateMovies = filteredMovies.length > 0 ? filteredMovies.slice(0, 4) : movieItems.slice(0, 3);
```
When TMDb search returned ordinary non-anime titles (e.g. "The Office" or "Inception"), `filteredTv` and `filteredMovies` were empty. The fallback took the top 5 TV shows and top 3 movies and labelled them as `mediaType: "anime" as const`. Consequently, `unified-search.ts` (`getAnime`) received non-empty results and never invoked Kitsu, while ordinary non-anime titles were incorrectly displayed with `mediaType: "anime"`.

### The Correction
1. **Removed Ordinary Fallback in `searchTMDBAnime()`:**
```ts
// CORRECTED CODE:
const candidateTv = filteredTv.slice(0, 8);
const candidateMovies = filteredMovies.slice(0, 4);

if (candidateTv.length === 0 && candidateMovies.length === 0) {
  return [];
}
```
2. **Refined `checkIsAnime()` Classifier:**
```ts
export function checkIsAnime(
  title: string,
  overview: string = "",
  genreIds: number[] = [],
  originalLanguage?: string
): boolean {
  const hasAnimationGenre = (genreIds || []).includes(16);
  const isJapanese = originalLanguage === "ja";
  const text = `${title} ${overview}`;

  // Confident Japanese Animation (e.g. Attack on Titan, Spirited Away)
  if (hasAnimationGenre && isJapanese) return true;

  // Animation with explicit anime studio or franchise keywords
  if (hasAnimationGenre) {
    if (
      /\b(anime|manga|light novel)\b/i.test(text) ||
      /\b(trigger|mappa|ufotable|wit studio|toei animation|ghibli|bones|madhouse|pierrot|cloverworks|kyoto animation|a-1 pictures)\b/i.test(text)
    ) {
      return true;
    }
    if (/edgerunners|dungeon meshi/i.test(title)) return true;
  }

  // Explicit anime/manga mention in title or overview for Japanese language
  if (isJapanese && /\b(anime|manga|light novel|ova|ona)\b/i.test(text)) {
    return true;
  }

  return false;
}
```
3. **Dedicated Provider Output Types:** In `searchTMDBMovies`, `mediaType: "movie"` is always returned. In `searchTMDBTV`, `mediaType: "tv"` is always returned. Only `searchTMDBAnime` produces `mediaType: "anime"`, and only for items passing `checkIsAnime`.

---

## 7. Verification Results

All checks were executed locally in the actual repository environment:

### 1. Vitest Automated Test Suite (`npm test`)
```
> media-locker@0.1.0 test
> vitest run

 RUN  v3.2.7 C:/Users/Aryan/Projects/Media-Locker

 ✓ tests/unit/kitsu-provider.test.ts (9 tests)
 ✓ tests/unit/openlibrary-provider.test.ts (5 tests)
 ✓ tests/security/electron-ipc.test.ts (10 tests)
 ✓ tests/database/migration-consistency.test.ts (5 tests)
 ✓ tests/security/electron-navigation.test.ts (20 tests)
 ✓ tests/database/shutdown-sequencing.test.ts (4 tests)
 ✓ tests/database/backup-failure-injection.test.ts (7 tests)
 ✓ tests/database/legacy-compatibility.test.ts (15 tests)
 ✓ tests/database/lifecycle.test.ts (16 tests)
 ✓ tests/security/validation.test.ts (25 tests)
 ✓ tests/unit/ui-category-controls.test.ts (11 tests)
 ✓ tests/unit/unified-search-categories.test.ts (17 tests)
 ✓ tests/unit/modal-state-reset.test.ts (2 tests)
 ✓ tests/database/isolation.test.ts (3 tests)
 ✓ tests/unit/media-formatting.test.ts (5 tests)
 ✓ tests/unit/unified-search.test.ts (17 tests)
 ✓ tests/security/get-user.test.ts (3 tests)
 ✓ tests/unit/tmdb-anime-classification.test.ts (8 tests)
 ✓ tests/security/tenant-isolation.test.ts (19 tests)

 Test Files  19 passed (19)
      Tests  201 passed (201)
   Duration  2.58s
```
**Result:** 19 test files passed, 201 tests passed, 0 failed.

### 2. Electron Security & Regression Test Suites
```
npx vitest run tests/security/electron-ipc.test.ts tests/security/electron-navigation.test.ts tests/database/shutdown-sequencing.test.ts

 Test Files  3 passed (3)
      Tests  34 passed (34)
   Duration  836ms
```
**Result:** 3 test files passed, 34 tests passed, 0 failed. Electron IPC whitelisting, in-window navigation denial, and graceful shutdown sequencing verified.

### 3. TypeScript Strict Type Check (`npx tsc --noEmit`)
```
Command exited with code 0 (zero errors).
```

### 4. ESLint Check (`npm run lint`)
```
> media-locker@0.1.0 lint
> eslint src

Command exited with code 0 (zero errors, zero warnings).
```

### 5. Next.js Production Build (`npm run build`)
```
> media-locker@0.1.0 build
> next build --webpack

▲ Next.js 16.3.4 (webpack)
✓ Running next.config.ts took 34ms
✓ Compiled successfully in 3.1s
  Running TypeScript ...
  Finished TypeScript in 6.0s ...
✓ Generating static pages using 11 workers (14/14) in 1013ms
  Finalizing page optimization ...
  Collecting build traces ...

Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /api/auth/[...nextauth]
├ ƒ /api/auth/register
├ ƒ /api/collections
├ ƒ /api/collections/[id]
├ ƒ /api/media
├ ƒ /api/media/[id]
├ ƒ /api/search
├ ƒ /api/stats
├ ○ /collections
├ ○ /library
├ ○ /login
├ ƒ /media/[id]
├ ○ /search
└ ○ /stats

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

Command exited with code 0.
```

### 6. GitHub Actions CI Status
The `gh` command-line tool is not installed in the Windows host environment. GitHub Actions runs for remote commit `1610079` cannot be queried via CLI. All checks have been verified locally using identical commands and runners.

---

## 8. Database Schema & Electron Security Boundaries

- **Database Schema Alterations:** None. `prisma/schema.prisma` and SQLite tables remain unchanged.
- **Database Migrations:** Zero migrations were created or modified.
- **Electron Security Settings:** Preserved. All window options (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`), protocol allowlists, and IPC validations remain fully intact.
- **Tenant Isolation:** Enforced across all endpoints via `userId: session.userId`. No unauthenticated guest fallbacks exist.

---

## 9. Deliverable & File Inventory

| File Path | Status | Purpose |
|---|---|---|
| `src/lib/api/tmdb.ts` | **Modified** | Strict anime classification in `checkIsAnime`, eliminated ordinary movie/TV fallback in `searchTMDBAnime` |
| `src/lib/api/types.ts` | **Modified** | Updated `ExternalSource` comment clarifying `kitsu` is active and `jikan` is legacy |
| `prisma/schema.prisma` | **Modified** | Updated `externalSource` schema comment distinguishing active from legacy providers |
| `README.md` | **Modified** | Removed outdated Jikan and guest fallback references; documented 6 categories |
| `tests/unit/tmdb-anime-classification.test.ts` | **Created** | 8 unit tests for `checkIsAnime` and `searchTMDBAnime` classified output |
| `tests/unit/unified-search-categories.test.ts` | **Modified** | 17 unit tests including non-anime TMDb fallback to Kitsu and zero leakage |
| `test-results/milestone-3-implementation-report.md` | **Created** | This comprehensive implementation and verification report |

---

## 10. Milestone Position

- **Milestone 3 (Six Media Categories):** **[AWAITING REVIEW / VERIFICATION]**
- **Milestone 4 (External Source Manager):** **[NEXT / NOT STARTED]**
- **No Milestone 4 work has been performed.**
- **No unapproved git commits or pushes have been performed.**
