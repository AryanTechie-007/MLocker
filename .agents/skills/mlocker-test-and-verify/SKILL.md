---
name: mlocker-test-and-verify
description: Testing strategies, verification routines, static analysis, security audits, and milestone completion checklists for MLocker.
---

# MLocker Test and Verify Skill

## 1. Quality Gates & Verification Hierarchy

Every code change in MLocker must pass through a multi-tier verification process before being considered complete.

```
┌────────────────────────────────────────────────────────┐
│ 1. Static Analysis: Linting, TypeScript Typecheck      │
├────────────────────────────────────────────────────────┤
│ 2. Unit Tests: Pure Domain & Business Logic            │
├────────────────────────────────────────────────────────┤
│ 3. Integration Tests: API Routes & Database Contracts  │
├────────────────────────────────────────────────────────┤
│ 4. Desktop & Electron IPC Verification                 │
├────────────────────────────────────────────────────────┤
│ 5. Security & Privacy Audit Checklist                  │
└────────────────────────────────────────────────────────┘
```

---

## 2. Standard Verification Commands

Run these standard scripts to verify code health:

```bash
# 1. Typecheck the entire TypeScript codebase
npm run typecheck # or npx tsc --noEmit

# 2. Run linter and formatting checks
npm run lint

# 3. Execute unit and integration tests
npm test

# 4. Verify Next.js production build completes without warnings/errors
npm run build
```

---

## 3. Unit Testing Domain Logic

Domain logic in `src/lib/domain/` has zero dependencies on Next.js or Electron and must have comprehensive test coverage.

### Key Test Suites:
- **Session Rollup Engine (`src/lib/domain/session/`):**
  - Verify continuous pulses within `MAX_GAP` (e.g. 45s) extend the active session.
  - Verify pulses separated by > `MAX_GAP` seal the previous session and spawn a new one.
  - Verify idle duration is deducted from `activeSeconds`.
  - Verify negative or zero durations are rejected.
- **Sync Conflict Resolution (`src/lib/domain/sync/`):**
  - Verify Last-Write-Wins selects the record with newer `updatedAt`.
  - Verify soft-deletion tombstones (`deletedAt`) overwrite older active records.
  - Verify idempotent replay of already applied change journal batches.
- **Zod Schemas (`src/lib/domain/validation/`):**
  - Verify invalid category enums or malformed URLs are rejected with clean error messages.
  - Verify numerical limits (ratings, chapter counts) enforce boundary constraints.

---

## 4. Integration & Security Testing

### 4.1 Tenant Isolation Tests (IDOR)
For every protected API route:
1. Issue request with `User A` credentials accessing `User B`'s media item -> Expect `404 Not Found` or `403 Forbidden`.
2. Issue request attempting to attach `User B`'s item to `User A`'s collection -> Expect `403 Forbidden`.
3. Issue unauthenticated request -> Expect `401 Unauthorized` (NEVER fallback to `"guest"`).

### 4.2 Database Migration Verification
When introducing Prisma schema changes:
1. Verify migrations execute cleanly on an empty SQLite database (`file:test.db`).
2. Verify rollback and forward migrations execute without data loss for existing fields.
3. Verify all foreign key cascade behaviors (`onDelete: Cascade` vs `onDelete: SetNull`) operate as expected.

---

## 5. Pre-Commit / Pull Request Checklist

Before submitting a milestone or opening a PR, verify:

- [ ] `tsc --noEmit` exits with status code 0.
- [ ] `npm run lint` passes without errors.
- [ ] Production build (`npm run build`) completes successfully.
- [ ] No hardcoded API keys, bearer tokens, or secrets exist in the diff.
- [ ] No `.db`, `.db-journal`, or private browsing logs are staged in Git.
- [ ] All new or modified API routes validate incoming bodies using Zod.
- [ ] Electron IPC calls validate arguments in the Main process before execution.
- [ ] Relevant milestone checkboxes in `implementation-plan.md` are updated.
