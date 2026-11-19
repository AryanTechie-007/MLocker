# Frontend & UI Component Audit Scan Report (Scanner 1)

**Target Repository:** MLocker (Media Locker)  
**Date:** 2026-11-19  
**Auditor:** @scanui (Scanner 1)  
**Scope:** `src/components/` and `src/app/`  
**Framework Baseline:** Next.js 15+ (`next@16.3.4`), React 19 (`react@19.2.8`), TypeScript, Tailwind CSS  

---

## 1. Executive Summary

This scan provides a comprehensive architectural and code quality audit of all UI components, modals, and route pages across the MLocker frontend. 

The frontend provides an attractive, unified dark glassmorphism aesthetic covering the six core media formats (`movie`, `tv`, `anime`, `manga`, `game`, `novel`). It successfully leverages Next.js 15 dynamic route parameter handling (`use(params)` with `Promise<{ id: string }>`) and React 19 external store hydration safety (`useSyncExternalStore`).

However, the audit identified **critical state management and modal hygiene vulnerabilities**, **taxonomy coverage gaps**, **authentication boundary inconsistencies**, and **styling architecture divergence** from the standards outlined in `AGENTS.md`.

### Summary of Findings
| Severity | Count | Summary of Key Issues |
| :--- | :---: | :--- |
| **Critical** | 1 | Stale-data state retention bug in `EditMediaModal` (AGENTS.md Rule 3.4 violation). Form state does not re-initialize when selecting different media items. |
| **High** | 2 | 1) Category omission: `manga` and `novel` are completely omitted from `LibraryPage` category tabs and `AddMediaModal` manual selection.<br>2) Auth circumvention link: "Continue as Guest without login" on `/login` conflicts with AGENTS.md Rule 1.6 ("No Unauthenticated Guest Fallbacks"). |
| **Medium** | 4 | 1) Overly broad Client Component boundaries with duplicated imperative `fetch` calls in `useEffect` and callbacks.<br>2) `<style jsx global>` injections inside `Navbar` and `Toast` causing hydration risks in React 19 / Next.js 15.<br>3) Modals lack ARIA dialog semantics, keyboard focus traps, and Escape key dismissal.<br>4) Heavy reliance on inline styles and ad-hoc CSS classes rather than Tailwind CSS utility classes. |
| **Low** | 2 | 1) Stale props in `MediaCard` favorite state.<br>2) Hardcoded user profile information in `Navbar` sidebar footer. |

---

## 2. Component Inventory & Boundary Inspection

### 2.1 Reusable UI Components (`src/components/`)

| File | Directives | Primary Role | Assessment & Findings |
| :--- | :--- | :--- | :--- |
| `AddMediaModal.tsx` | `"use client"` | Modal for manual & external media creation | **High Risk:** Form fields initialize once via `useState(mediaItem?.xxx)` and do not reset on re-open or prop changes. Manual category dropdown is missing `manga` and `novel`. Lacks ARIA dialog roles and focus trapping. |
| `EditMediaModal.tsx` | `"use client"` | Modal for updating progress, score, review, and deletion | **Critical Risk:** Direct violation of AGENTS.md Rule 3.4. State is not reset when `item` changes while mounted in parents (`Dashboard`, `LibraryPage`). Form overwrites new item with previous item's data on save. |
| `ConfirmDialog.tsx` | `"use client"` | Destructive action confirmation dialog | **Pass with Minor Concerns:** Good prop design and loading state. Missing `role="alertdialog"`, Escape key dismiss, and focus trap. Inline styles dominate. |
| `MediaCard.tsx` | `"use client"` | Standard media display card across shelf & grid views | **Pass with Notes:** Handles all 6 media types and watch providers. Local `favorite` state is decoupled from prop changes. Uses inline hover event listeners instead of Tailwind `hover:`. |
| `Navbar.tsx` | `"use client"` | Desktop sidebar & responsive mobile top header | **Medium Risk:** Hardcoded "My Locker / Local Vault" without session integration. Uses `<style jsx global>` for responsive breakpoints, conflicting with Next.js 15 CSS streaming and Tailwind conventions. |
| `Skeleton.tsx` | None (Server capable) | Skeleton placeholders for cards, tables, stats | **Clean:** Stateless, pure presentation. Could omit `"use client"` entirely and run as RSC. |
| `StatusBadge.tsx` | None (Server capable) | Badge for media consumption statuses | **Clean:** Pure presentation, covers all 5 statuses accurately. |
| `Toast.tsx` | `"use client"` | Floating notification system & context provider | **Pass with Notes:** Clean context API and auto-dismiss. Uses `<style jsx global>` for keyframe animation instead of global CSS / Tailwind. |
| `WatchProviderBadge.tsx`| `"use client"` | Platform badges and streaming search dropdown | **Pass with Notes:** Rich streaming links and theme lookup. Dropdown lacks keyboard navigation and Escape key listener. (752 lines; data maps could be modularized). |

---

### 2.2 App Router Routes & Pages (`src/app/`)

| Route / File | Boundary | Assessment & Findings |
| :--- | :--- | :--- |
| `src/app/layout.tsx` | Server Component (RSC) | **Clean:** Correct HTML root structure, metadata export, and wraps `ToastProvider` and `Navbar`. |
| `src/app/page.tsx` (`/`) | Client Component | **Medium Risk:** Duplicated data fetch logic between `fetchData` and `useEffect`. Static rendering of `<EditMediaModal>` causes stale-state bug across shelf items. |
| `src/app/library/page.tsx` (`/library`) | Client Component | **High Risk:** Correctly wraps `useSearchParams()` with `<Suspense>`. However, `categoryTabs` omits `manga` and `novel`. Static `<EditMediaModal>` suffers from stale state bug. Duplicated fetch routines. |
| `src/app/collections/page.tsx` (`/collections`) | Client Component | **Pass with Notes:** Good selection retention logic. Form inputs reset on collection creation. Missing collection rename/edit feature. Duplicated fetch routines. |
| `src/app/login/page.tsx` (`/login`) | Client Component | **High Risk:** Contains "Continue as Guest without login →" link which bypasses login but points to protected routes that reject unauthenticated access with 401s. |
| `src/app/media/[id]/page.tsx` (`/media/[id]`) | Client Component | **Pass with Accolades:** Properly implements Next.js 15 `const { id } = use(params)` for async route params. Steppers for all 6 media formats work accurately. Duplicated initial fetch pattern. |
| `src/app/search/page.tsx` (`/search`) | Client Component | **Pass with Notes:** Debounced search works smoothly. Clicking "Games" tab triggers manual entry modal unexpectedly. `AddMediaModal` form state does not update when `defaultType` changes. |
| `src/app/stats/page.tsx` (`/stats`) | Client Component | **Clean:** Correctly uses `useSyncExternalStore` to prevent Recharts SSR hydration mismatches in React 19. All 6 categories accurately calculated. |
| `src/app/globals.css` | Global CSS | **Medium Risk:** Well structured CSS custom variables, but frontend heavily underutilizes Tailwind utility classes in favor of inline styles and global classes. |

---

## 3. Deep-Dive Audit Findings

### Finding 1 (Critical): Modal Reset Hygiene & Stale-Data Editing Bug
- **Location:** `src/components/EditMediaModal.tsx` (Lines 18–51), `src/components/AddMediaModal.tsx` (Lines 18–44), `src/app/page.tsx` (Lines 548–554), `src/app/library/page.tsx` (Lines 490–496)
- **AGENTS.md Policy Violated:** Section 3.4:
  > *"State Management in Modals: Always reset modal form state when selected items change to prevent stale-data editing bugs."*
- **Mechanism:**
  In both `page.tsx` and `library/page.tsx`, `EditMediaModal` is rendered unconditionally:
  ```tsx
  <EditMediaModal
    item={selectedEditItem}
    isOpen={Boolean(selectedEditItem)}
    onClose={() => setSelectedEditItem(null)}
    onUpdated={() => fetchData()}
  />
  ```
  Inside `EditMediaModal.tsx`:
  ```tsx
  const [status, setStatus] = useState<string>(item?.status || "plan_to_consume");
  const [rating, setRating] = useState<number | "">(item?.rating ?? "");
  const [review, setReview] = useState(item?.review || "");
  const [watchedEpisodes, setWatchedEpisodes] = useState(...);
  ...
  if (!isOpen || !item) return null;
  ```
  Because `useState` initializers only execute on initial component mount:
  1. The user clicks "Quick Update" on Item A (e.g. *Dune*, rating 9). State initializes to Item A.
  2. The user closes the modal (`selectedEditItem` becomes `null`, modal returns `null` but **remains mounted in the React component tree**).
  3. The user clicks "Quick Update" on Item B (e.g. *Elden Ring*, unrated).
  4. The modal renders with Item B's title/poster (from props), but the form fields (`status`, `rating`, `review`, `hoursPlayed`, `watchedEpisodes`) retain **Item A's values**.
  5. Submitting the form saves Item A's score and notes onto Item B.
- **Remediation:**
  1. Add a `useEffect` inside `EditMediaModal` and `AddMediaModal` that synchronizes all form fields whenever `item` / `mediaItem` or `isOpen` changes.
  2. Pass a dynamic `key={selectedEditItem?.id}` when rendering `EditMediaModal` in parent components to force a clean unmount and fresh remount when the target item changes.

---

### Finding 2 (High): Media Taxonomy Incompleteness (`manga` and `novel` omissions)
- **Location:** `src/app/library/page.tsx` (Line 110), `src/components/AddMediaModal.tsx` (Lines 206–210)
- **Description:**
  MLocker's architecture defines six media categories: `movie`, `tv`, `anime`, `manga`, `game`, `novel` (`src/lib/api/types.ts`).
  - On the Dashboard (`src/app/page.tsx`), all 6 media vaults are displayed and link to `/library?type=manga` and `/library?type=novel`.
  - However, in `src/app/library/page.tsx`:
    ```tsx
    const categoryTabs = [
      { type: "all", label: "All Vaults", icon: Layers },
      { type: "movie", label: "Movies", icon: Film },
      { type: "tv", label: "TV Shows", icon: Tv },
      { type: "anime", label: "Anime", icon: Sparkles },
      { type: "game", label: "Games", icon: Gamepad2 },
    ];
    ```
    `manga` and `novel` are completely missing. Navigating from the dashboard leaves no active tab selected, and users cannot filter by manga or novels from the library UI.
  - In `src/components/AddMediaModal.tsx`:
    ```tsx
    <select value={mediaType} onChange={(e) => setMediaType(e.target.value)}>
      <option value="movie">Movie</option>
      <option value="tv">TV Series</option>
      <option value="anime">Anime (Crunchyroll, TV, Movie)</option>
      <option value="game">Video Game (PC, Steam, Epic)</option>
    </select>
    ```
    `manga` and `novel` are missing from the manual entry category dropdown, preventing users from adding custom books, light novels, or manga, even though the chapter progress fields are already implemented below.
- **Remediation:**
  Add `manga` (using `BookMarked` icon) and `novel` (using `BookOpen` icon) to `categoryTabs` in `LibraryPage` and to the category `<select>` in `AddMediaModal`.

---

### Finding 3 (High): Unauthenticated Guest Bypass UI Link
- **Location:** `src/app/login/page.tsx` (Lines 230–237)
- **AGENTS.md Policy Violated:** Section 1.6 & Section 4.1:
  > *"No Unauthenticated Guest Fallbacks: Unauthenticated requests must fail with 401 Unauthorized. Never fall back to a shared 'guest' user identifier for multi-user or cloud data."*
- **Description:**
  `LoginPage` provides:
  ```tsx
  <Link href="/" style={{ color: "var(--text-dim)", fontSize: "0.78rem" }}>
    Continue as Guest without login →
  </Link>
  ```
  Clicking this directs the browser to the main dashboard `/`. If the backend enforces 401s on unauthenticated requests (as mandated by AGENTS.md), the dashboard displays error toasts ("Failed to refresh dashboard data") and empty screens. If the backend does have an insecure guest fallback, it violates tenant isolation.
- **Remediation:**
  Remove the "Continue as Guest" link from the web authentication interface, or clarify that guest mode is strictly a local desktop feature when running within Electron without cloud sync.

---

### Finding 4 (Medium): Client/Server Component Boundaries & Redundant Fetching
- **Location:** `src/app/page.tsx`, `src/app/library/page.tsx`, `src/app/collections/page.tsx`, `src/app/media/[id]/page.tsx`
- **Description:**
  Across all pages, an identical anti-pattern is present:
  ```tsx
  const fetchData = useCallback(async () => {
    // fetch calls...
  }, []);

  useEffect(() => {
    let ignore = false;
    // exact duplicate fetch calls...
  }, []);
  ```
  The code duplicates the entire fetching and state extraction logic between `useCallback` and `useEffect`.
  Furthermore, every page is rendered entirely on the client (`"use client"`), forcing empty skeleton initial renders and client-side waterfalls instead of leveraging Next.js React Server Components for fast initial page loads.
- **Remediation:**
  1. Consolidate the fetch logic: call `fetchData()` directly inside `useEffect(() => { fetchData(); }, [fetchData])`.
  2. For future milestones, extract static layouts to Server Components and pass initial data to interactive client islands.

---

### Finding 5 (Medium): React 19 / Next.js 15 Style Injections & Hydration Safety
- **Location:** `src/components/Navbar.tsx` (Lines 286–295), `src/components/Toast.tsx` (Lines 127–138)
- **Description:**
  Both components embed `<style jsx global>` tags directly inside React client components:
  ```tsx
  <style jsx global>{`
    @media (max-width: 1024px) {
      .desktop-sidebar { display: none !important; }
      .mobile-header { display: flex !important; }
    }
  `}</style>
  ```
  In Next.js 15 / React 19, inline `style jsx` elements inside client components can cause hydration mismatch warnings and break CSS chunking during streaming rendering.
- **Remediation:**
  Move responsive sidebar rules and keyframe animations into `globals.css` or Tailwind CSS configuration (`tailwind.config.ts`), and eliminate `<style jsx>` tags.

---

### Finding 6 (Medium): Accessibility (a11y) & Modal Keyboard Trapping
- **Location:** `AddMediaModal.tsx`, `EditMediaModal.tsx`, `ConfirmDialog.tsx`
- **Description:**
  All modal implementations render `div` overlays with `onClick` backdrops, but lack:
  1. `role="dialog"` or `role="alertdialog"`
  2. `aria-modal="true"`
  3. `aria-labelledby` linking to modal titles
  4. `keydown` event listener for the Escape key (`e.key === "Escape"`)
  5. Keyboard focus trap (tab navigation leaks out into background page)
  6. Explicit `htmlFor` / `id` bindings on `<label>` and `<input>` tags
- **Remediation:**
  Implement a reusable modal wrapper or custom hook (`useModalAccessibility`) handling Escape key dismissals, focus trapping, and ARIA attributes.

---

### Finding 7 (Medium): Styling Architecture Divergence (Inline CSS vs Tailwind)
- **Location:** Across all UI components and routes
- **AGENTS.md Policy Violated:** Section 3.2:
  > *"Keep UI components in `src/components/` modular, stateless where practical, and styled with Tailwind CSS."*
- **Description:**
  Almost all components use heavy inline `style={{ ... }}` objects and CSS variables (`var(--accent-cyan)`, `var(--bg-elevated)`) mixed with a few global utility classes (`glass-panel`, `btn-primary`).
  This leads to:
  - High JSX verbosity and larger DOM bundle footprints.
  - Manual pseudo-classes (e.g. `onMouseEnter` / `onMouseLeave` overriding styles on `e.currentTarget.style`).
  - Less predictable responsive behavior.
- **Remediation:**
  Map CSS variables into `tailwind.config.ts` theme extensions (e.g. `bg-card`, `text-dim`, `accent-purple`) and refactor inline styles to standard Tailwind classes.

---

## 4. Prioritized Remediation Plan

```
┌────────────────────────────────────────────────────────────────────────┐
│                        REMEDIATION ACTION MATRIX                       │
├───────────┬─────────────────────────────────────┬──────────────────────┤
│ Priority  │ Target                              │ Action Item          │
├───────────┼─────────────────────────────────────┼──────────────────────┤
│ 1. CRIT   │ src/components/EditMediaModal.tsx   │ Add form reset effect│
│           │ src/components/AddMediaModal.tsx    │ on item change       │
│           │ src/app/page.tsx, library/page.tsx  │ Add key={item.id}    │
├───────────┼─────────────────────────────────────┼──────────────────────┤
│ 2. HIGH   │ src/app/library/page.tsx            │ Add manga & novel    │
│           │ src/components/AddMediaModal.tsx    │ category options     │
├───────────┼─────────────────────────────────────┼──────────────────────┤
│ 3. HIGH   │ src/app/login/page.tsx              │ Remove guest link    │
├───────────┼─────────────────────────────────────┼──────────────────────┤
│ 4. MED    │ src/components/Navbar.tsx           │ Remove <style jsx>   │
│           │ src/components/Toast.tsx            │ Move to globals.css  │
├───────────┼─────────────────────────────────────┼──────────────────────┤
│ 5. MED    │ src/components/*Modal.tsx           │ Add Escape listener  │
│           │                                     │ and ARIA dialog tags │
├───────────┼─────────────────────────────────────┼──────────────────────┤
│ 6. LOW    │ All pages                           │ Eliminate duplicated │
│           │                                     │ fetch routines       │
└───────────┴─────────────────────────────────────┴──────────────────────┘
```

---

## 5. Verification Checklist

- [x] All 9 components in `src/components/` inspected.
- [x] All 8 route files in `src/app/` inspected.
- [x] Modal reset hygiene evaluated against AGENTS.md Section 3.4.
- [x] React 19 / Next.js 15 compatibility verified (`use(params)`, `useSyncExternalStore`, hydration risks).
- [x] Client vs Server boundaries analyzed.
- [x] TypeScript compiler check executed (`npx tsc --noEmit` -> 0 errors).
- [x] ESLint executed (`npm run lint` -> 0 violations).
- [x] Detailed audit report generated in `test-results/ui-components-scan.md`.
