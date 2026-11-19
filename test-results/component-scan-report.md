# MLocker Full System Component Scan & Security Audit Report

**Authoritative Report Prepared by:** Scan Auditor (`@auditor`)  
**Integrated Scan Inputs:**  
- Frontend & UI Scan: [`test-results/ui-components-scan.md`](file:///test-results/ui-components-scan.md) (Scanner 1: `@scanui`)  
- Backend & Desktop Security Scan: [`test-results/backend-scan.md`](file:///test-results/backend-scan.md) (Scanner 2: `@scanbackend`)  
**Evaluation Standard:** `AGENTS.md` Operating Guide, Security Rules & Architectural Principles  
**Date:** 2026-11-19  
**Repository Version:** Next.js 15+ (`next@16.3.4`), React 19 (`react@19.2.8`), Electron 30, Prisma 5.22  

---

## 1. Executive Summary

A comprehensive architectural, security, and code quality audit was performed across the complete MLocker codebase, covering frontend UI components (`src/components/`), App Router pages (`src/app/`), backend API routes (`src/app/api/`), shared libraries (`src/lib/`), database models (`prisma/`), and desktop runtime processes (`electron/`).

MLocker exhibits commendable strengths in its visual presentation, reactive dark glassmorphism theme, basic Electron process sandboxing (`contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`), and forward-looking adoption of Next.js 15 async route parameters (`const { id } = use(params)`).

However, the audit revealed **critical vulnerabilities and structural non-compliance** across tenant isolation, authentication enforcement, input validation, data lifecycle resilience, and modal state management. Most notably:
1. **Critical Relational IDOR** in collection item management allowing cross-tenant data leakage.
2. **Systemic Guest Bypass / Fallback** violating the zero-unauthenticated-access mandate.
3. **Stale-Data State Retention** in modals corrupting user edits.
4. **Total Absence of Zod Validation** across all network and IPC boundaries.
5. **Absence of Tombstone Deletions**, which will break multi-device sync and conflict resolution.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        VULNERABILITY HEATMAP                           │
├────────────────────┬──────────┬──────────┬──────────┬──────────────────┤
│ Subsystem          │ Critical │   High   │  Medium  │ Status           │
├────────────────────┼──────────┼──────────┼──────────┼──────────────────┤
│ Backend API Routes │    1     │    3     │    2     │ 🚨 High Risk     │
│ Auth & Sessions    │    0     │    2     │    0     │ ⚠️ Non-Compliant │
│ Database & Prisma  │    0     │    1     │    1     │ ⚠️ Action Needed │
│ Electron Runtime   │    0     │    2     │    1     │ ⚠️ Action Needed │
│ Frontend UI Modals │    1     │    1     │    2     │ 🚨 High Risk     │
│ UI Pages & Styling │    0     │    1     │    2     │ ℹ️ Improvement   │
├────────────────────┼──────────┼──────────┼──────────┼──────────────────┤
│ TOTALS             │    2     │    10    │    8     │ Remediation Req. │
└────────────────────┴──────────┴──────────┴──────────┴──────────────────┘
```

---

## 2. Master Vulnerability Register

| ID | Severity | Category | Affected File(s) | Summary & Impact | AGENTS.md Rule |
| :--- | :---: | :--- | :--- | :--- | :--- |
| **SEC-01** | **CRITICAL** | IDOR / Tenant Isolation | `src/app/api/collections/[id]/route.ts` | Missing ownership verification on `userMediaId` when linking to collection. Allows attacker to associate another user's private media item and extract private notes, reviews, and ratings. | Rule 1.7, 4.2 |
| **UI-01** | **CRITICAL** | State Management | `src/components/EditMediaModal.tsx`, `AddMediaModal.tsx`, `src/app/page.tsx`, `src/app/library/page.tsx` | Form states do not re-initialize on item change or re-open due to missing reset hooks, causing Item A's score, status, and review to overwrite Item B on submission. | Rule 3.4 |
| **SEC-02** | **HIGH** | Auth Enforcement | `src/lib/get-user.ts` (affects 12 API routes) | Unauthenticated requests silently fallback to shared `guest@medialocker.local` user instead of failing with `401 Unauthorized`. | Rule 1.6, 4.1 |
| **SEC-03** | **HIGH** | Input Validation | All routes in `src/app/api/` & `electron/main.js` | Zero Zod schema validation. Negative/out-of-bound ratings (`-50`, `99999`), arbitrary strings for status/types, and unvalidated URL protocols permitted. | Rule 4.3 |
| **DAT-01** | **HIGH** | Data Integrity / Sync | `prisma/schema.prisma`, `src/app/api/media/[id]/route.ts`, `collections/[id]/route.ts` | Missing `deletedAt` tombstone columns. Raw SQL hard deletes permanently destroy change history, breaking local-first synchronization and peer replication. | Rule 5.4 |
| **SEC-04** | **HIGH** | Credential Hygiene | `electron/main.js`, `src/lib/api/tmdb.ts` | TMDB API key `c93be9cb1dc8ff2594820332b1defeeb` hardcoded in committed repository code. | Rule 4.4 |
| **DESK-01**| **HIGH** | Desktop Lifecycle | `electron/main.js` | Packaged desktop app lacks embedded SQLite migration runner tracking `PRAGMA user_version`. Clean installs produce empty, table-less database files. | Rule 5.3 |
| **UI-02** | **HIGH** | Taxonomy Incompleteness | `src/app/library/page.tsx`, `src/components/AddMediaModal.tsx` | `manga` and `novel` categories completely omitted from library tabs and manual creation dropdown. | Section 2 |
| **UI-03** | **HIGH** | Auth Boundary | `src/app/login/page.tsx` | "Continue as Guest without login" link presents a false guest pathway on web that leads to broken states or unauthenticated guest fallback exploitation. | Rule 1.6 |
| **PERF-01**| **MEDIUM** | Query Performance | `src/app/api/stats/route.ts` | Entire user media catalog loaded into Node.js process memory via `findMany()` to manually loop aggregations in JavaScript. | Rule 5.5 |
| **ARCH-01**| **MEDIUM** | Architecture Decoupling | `src/lib/` | Missing `src/lib/domain/` pure domain package. Scoring algorithms bundled directly into API network modules. | Section 2 |
| **SEC-05** | **MEDIUM** | Credential Hygiene | `electron/main.js` | Predictable fallback string `"media-locker-desktop-app-secret-key-2026"` for `NEXTAUTH_SECRET`. | Rule 4.4 |
| **SEC-06** | **MEDIUM** | Non-Atomic Mutation | `src/app/api/media/[id]/route.ts`, `collections/[id]/route.ts` | Check-then-act pattern where updates/deletes specify only `{ id }` rather than atomic compound filter `{ id, userId }`. | Rule 4.2 |
| **UI-04** | **MEDIUM** | Hydration / Next 15 | `src/components/Navbar.tsx`, `src/components/Toast.tsx` | Injected `<style jsx global>` tags inside client components risk hydration mismatches and break CSS streaming in Next.js 15 / React 19. | Section 3.2 |
| **UI-05** | **MEDIUM** | Accessibility (a11y) | `AddMediaModal.tsx`, `EditMediaModal.tsx`, `ConfirmDialog.tsx` | Modals lack `role="dialog"`, Escape key dismissal, and keyboard focus trapping. | Section 3.2 |
| **UI-06** | **MEDIUM** | Styling Architecture | Across UI components and pages | Inline `style={{ ... }}` objects and inline event handlers heavily preferred over Tailwind CSS utility classes. | Rule 3.2 |
| **API-01** | **LOW** | Error Standards | All routes in `src/app/api/` | Error responses lack typed structured error envelopes (`code` and `details` fields missing). | Rule 3.3 |
| **UI-07** | **LOW** | State Sync | `src/components/MediaCard.tsx` | Local `favorite` state does not update when parent item prop updates. | Section 3 |

---

## 3. Deep-Dive Subsystem Analysis

### 3.1 Tenant Isolation & IDOR Vulnerability (SEC-01)
In `src/app/api/collections/[id]/route.ts`:
```typescript
// POST /api/collections/[id]
const collection = await prisma.collection.findFirst({
  where: { id: collectionId, userId },
});
if (!collection) return NextResponse.json({ error: "Collection not found" }, { status: 404 });

const { userMediaId, action } = await req.json();
...
const newItem = await prisma.collectionItem.create({
  data: { collectionId, userMediaId, order: count },
});
```
- **The Defect:** While the parent collection ownership is verified, the endpoint assumes `userMediaId` also belongs to `userId`. There is zero ownership verification on `userMediaId`.
- **The Exploit:** User A submits User B's `userMediaId`. User A then queries `GET /api/collections/[id]`, which returns the collection items joined with `userMedia: true`. User A now reads User B's private ratings, reviews, tags, and consumption progress.
- **Resolution:**
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

### 3.2 Unauthenticated Shared Guest Fallback (SEC-02)
In `src/lib/get-user.ts`:
```typescript
export async function getOrCreateUserId(): Promise<string> {
  const session = await auth();
  if (session?.user?.id) return session.user.id;
  
  // Unauthenticated fallback upserts a shared guest user
  const guest = await prisma.user.upsert({
    where: { email: GUEST_EMAIL },
    update: {},
    create: { name: "Guest Explorer", email: GUEST_EMAIL },
  });
  return guest.id;
}
```
- **The Defect:** Unauthenticated calls to `/api/media`, `/api/collections`, and `/api/stats` are automatically granted full read/write access under `guest@medialocker.local`.
- **The Impact:** Any web visitor or automated script can wipe, mutate, or pollute the shared guest data store. In cloud deployments, this completely voids user segregation.
- **Resolution:**
  - Deprecate `getOrCreateUserId()` for API routes.
  - Require an authenticated NextAuth session:
    ```typescript
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized access", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }
    const userId = session.user.id;
    ```
  - Desktop guest mode must be isolated to a local, offline SQLite file in `app.getPath('userData')`.

### 3.3 Modal State Retention & Form Pollution (UI-01)
In `src/components/EditMediaModal.tsx`:
```tsx
const [status, setStatus] = useState<string>(item?.status || "plan_to_consume");
const [rating, setRating] = useState<number | "">(item?.rating ?? "");
const [review, setReview] = useState(item?.review || "");
...
if (!isOpen || !item) return null;
```
- **The Defect:** In React, `useState` initializers run only on initial component mount. When parent components (`page.tsx` and `library/page.tsx`) render `<EditMediaModal isOpen={Boolean(selectedEditItem)} item={selectedEditItem} />`, the modal component remains mounted across different item selections.
- **The Impact:** Opening Item A sets state to Item A. Opening Item B displays Item B's title (from props), but the inputs retain Item A's rating, status, and review. Clicking save overwrites Item B with Item A's data.
- **Resolution:**
  1. Add an active reset synchronization inside the modal:
     ```tsx
     useEffect(() => {
       if (item) {
         setStatus(item.status || "plan_to_consume");
         setRating(item.rating ?? "");
         setReview(item.review || "");
         setWatchedEpisodes(item.watchedEpisodes ?? 0);
         setReadChapters(item.readChapters ?? 0);
         setHoursPlayed(item.hoursPlayed ?? 0);
       }
     }, [item, isOpen]);
     ```
  2. In parent components, supply a key: `<EditMediaModal key={selectedEditItem?.id} ... />`.

### 3.4 Tombstone Deletion Model & Database Schema (DAT-01)
`prisma/schema.prisma` defines models without deletion tracking:
```prisma
model UserMedia {
  id        String   @id @default(cuid())
  userId    String
  // Missing deletedAt DateTime?
}
```
- **The Defect:** Routes execute raw Prisma hard deletes: `prisma.userMedia.delete(...)`.
- **The Impact:** AGENTS.md Rule 1.3 & Rule 5.4 mandate local-first sync with JSON change sets. Hard deletes eliminate tombstones, meaning deletions performed on Desktop cannot be communicated or reconciled with Cloud PostgreSQL or secondary desktop instances.
- **Resolution:**
  1. Add `deletedAt DateTime?` to `UserMedia`, `Collection`, and `CollectionItem` in `prisma/schema.prisma`.
  2. Implement soft delete mutations: `data: { deletedAt: new Date() }`.
  3. Ensure all retrieval queries filter with `where: { deletedAt: null }`.

### 3.5 Input Validation & Zod Schema Enforcement (SEC-03)
- **The Defect:** `zod` is not installed in `package.json`. API routes parse request bodies via raw `await req.json()` and query strings via `parseInt` / `parseFloat` without bounding or sanitization.
- **The Impact:**
  - `rating`: Can be negative or set to millions.
  - `mediaType` & `status`: Any string accepted, violating database schema enums.
  - `posterUrl`: No protocol verification, opening vector for malicious URLs or script payloads.
- **Resolution:**
  Install `zod` and define standardized schemas in `src/lib/domain/validation/`:
  ```typescript
  export const updateMediaItemSchema = z.object({
    status: z.enum(["plan_to_consume", "in_progress", "completed", "on_hold", "dropped"]).optional(),
    rating: z.number().min(0).max(100).nullable().optional(),
    watchedEpisodes: z.number().int().nonnegative().optional(),
    readChapters: z.number().int().nonnegative().optional(),
    hoursPlayed: z.number().nonnegative().optional(),
    review: z.string().max(5000).optional(),
    posterUrl: z.string().url().refine(u => u.startsWith("http://") || u.startsWith("https://")).optional(),
  });
  ```

---

## 4. AGENTS.md Compliance Scorecard

```
┌────────────────────────────────────────────────────────────────────────┐
│                      AGENTS.md RULE COMPLIANCE                         │
├─────────────────────────────────────┬────────────┬─────────────────────┤
│ Core Rule / Principle               │ Compliance │ Status Notes        │
├─────────────────────────────────────┼────────────┼─────────────────────┤
│ 1.1 Dual Target (Web & Desktop)     │ 🟢 PASS    │ Maintained          │
│ 1.2 Local-First & Offline Resilience│ 🟡 PARTIAL │ Needs migrations    │
│ 1.3 No Raw DB Syncing (JSON changes)│ 🟢 PASS    │ Respected in design │
│ 1.6 No Unauthenticated Guest        │ 🔴 FAIL    │ SEC-02 & UI-03      │
│ 1.7 Relational Tenant Isolation     │ 🔴 FAIL    │ SEC-01 in /collect. │
│ 2.0 Pure Domain Layer Decoupling    │ 🟡 PARTIAL │ ARCH-01 (Missing)   │
│ 3.2 Tailwind UI Styling             │ 🟡 PARTIAL │ UI-06 (Heavy inline)│
│ 3.3 Typed Structured Error Responses│ 🔴 FAIL    │ API-01 (Missing)    │
│ 3.4 Modal State Reset Hygiene       │ 🔴 FAIL    │ UI-01 (Stale state) │
│ 4.1 401 Unauthorized Enforcement    │ 🔴 FAIL    │ SEC-02 in /api/*    │
│ 4.2 Tenant Isolation (IDOR Prevent) │ 🔴 FAIL    │ SEC-01 in /collect. │
│ 4.3 Zod Schema Validation           │ 🔴 FAIL    │ SEC-03 (Zod absent) │
│ 4.4 Secret Hygiene                  │ 🔴 FAIL    │ SEC-04 (TMDB Key)   │
│ 4.5 Desktop Hardening (IPC/Sandbox) │ 🟢 PASS    │ Sandboxing active   │
│ 5.3 Clean Desktop Provisioning      │ 🔴 FAIL    │ DESK-01 (No runner) │
│ 5.4 Tombstone Deletion Model        │ 🔴 FAIL    │ DAT-01 (Hard delete)│
│ 5.5 Database Engine Aggregations    │ 🔴 FAIL    │ PERF-01 (In-memory) │
└─────────────────────────────────────┴────────────┴─────────────────────┘
```

---

## 5. Phased Remediation Roadmap

### Phase 1: Immediate Critical Fixes (Sprint 0 / P0)
1. **Fix Relational IDOR in `POST /api/collections/[id]` (SEC-01):** Verify `userMediaId` belongs to authenticated `userId` before linking.
2. **Eliminate Modal Stale-State Bugs (UI-01):** Add `useEffect` state synchronization in `EditMediaModal` and `AddMediaModal`; supply dynamic `key={selectedItem.id}` in parent render trees.
3. **Revoke Unauthenticated Guest API Access (SEC-02):** Replace `getOrCreateUserId` with strict `401 Unauthorized` responses in all cloud API endpoints.
4. **Remove Unauthenticated Guest Link from Login Page (UI-03):** Clean `/login` route.

### Phase 2: Schema Hardening, Validation & Sync Foundations (Sprint 1 / P1)
1. **Install Zod & Implement Domain Validation Layer (SEC-03, ARCH-01):**
   - Create `src/lib/domain/validation/`.
   - Validate every API payload and Electron IPC argument for types, enums, rating bounds (0-100), and URL protocols (`http:`, `https:`).
2. **Implement Tombstone Deletion Model (DAT-01):**
   - Add `deletedAt DateTime?` to `UserMedia`, `Collection`, and `CollectionItem` in `prisma/schema.prisma`.
   - Update API DELETE endpoints to perform soft deletes.
3. **Database Aggregations for Stats (PERF-01):**
   - Refactor `GET /api/stats` to use Prisma `groupBy` and `aggregate` queries.
4. **Secret Hygiene Remediation (SEC-04, SEC-05):**
   - Strip hardcoded TMDB API key and fallback NextAuth secrets from version control. Rely exclusively on environment configuration.

### Phase 3: Desktop Runtime & Frontend Resilience (Sprint 2 / P2)
1. **Embedded SQLite Migration Runner (DESK-01):**
   - Build a migration runner in Electron tracking `PRAGMA user_version` to handle pristine desktop initializations safely.
2. **Complete Media Taxonomy in UI (UI-02):**
   - Add `manga` and `novel` tabs to `LibraryPage` and dropdown options to `AddMediaModal`.
3. **Eliminate Hydration Hazards (UI-04):**
   - Remove `<style jsx global>` from `Navbar.tsx` and `Toast.tsx`, migrating rules to `globals.css` / Tailwind.
4. **Accessible Modals (UI-05):**
   - Add ARIA dialog roles, focus traps, and Escape key listeners.

---

## 6. Verification & Audit Sign-Off

- [x] Full scan of `src/components/` and `src/app/` analyzed and synthesized.
- [x] Full scan of `src/app/api/`, `src/lib/`, `electron/`, and `prisma/` analyzed and synthesized.
- [x] Cross-verification performed against all rules in `AGENTS.md`.
- [x] Remediation tasks prioritized into clear, actionable sprint phases.
- [x] Audit report documented at `test-results/component-scan-report.md`.

*Report compiled and certified by Scan Auditor (`@auditor`).*
