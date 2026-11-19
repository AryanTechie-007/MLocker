# Credential Hygiene & Key Rotation Advisory — Milestone 1.1

**Document Version:** 1.0  
**Target:** MLocker Repository Operators & Developers  
**Date:** 2026-11-19  

---

## 1. Background & Scope of Exposure

During the Milestone 0 repository audit, a hardcoded The Movie Database (TMDb) v3 API key was identified in plain text in committed application source files:
- `src/lib/api/tmdb.ts`
- `electron/main.js`

In Milestone 1, all hardcoded instances were removed from source code and replaced with environment configuration:
```ts
function getTMDBKey(): string {
  return process.env.TMDB_API_KEY || "";
}
```
In addition, a static desktop fallback string (`"media-locker-desktop-app-secret-key-2026"`) was removed and replaced with per-installation dynamic cryptographic secret generation via `crypto.randomBytes(32).toString('hex')`.

> [!CAUTION]
> **Important Security Fact:**
> Moving an API key or secret from source code into an environment variable does **NOT** invalidate, revoke, or rotate the key. Because the repository history contains earlier commits where this key was committed in plain text, the key must be considered publicly compromised and rotated at the provider level.

---

## 2. Step-by-Step TMDb Key Rotation Procedure

To revoke the exposed key and establish a fresh credential:

1. **Log in to TMDb:**
   - Navigate to [The Movie Database (TMDb)](https://www.themoviedb.org/) and sign in to the account that generated the original API key.
2. **Access API Settings:**
   - Go to [https://www.themoviedb.org/settings/api](https://www.themoviedb.org/settings/api).
3. **Revoke Old Key:**
   - Select the existing API key and click **Delete / Revoke**.
4. **Generate New API Key:**
   - Select **Create** &rarr; **Developer**.
   - Accept the terms of service and submit the application information (e.g. "MLocker Personal Media Library").
   - Copy the newly issued **API Key (v3 auth)**.
5. **Update Environment Files:**
   - In your local development environment, open `.env`:
     ```bash
     TMDB_API_KEY="your_new_v3_api_key_here"
     ```
   - Verify that `.env` is listed in `.gitignore` (already configured in root `.gitignore`).
   - Never commit `.env` to version control.
6. **Graceful Fallback Mode:**
   - If `TMDB_API_KEY` is omitted or left empty, MLocker automatically and safely falls back to free, unauthenticated search providers (iTunes for Movies and TVMaze for TV series). The application continues to function without error.

---

## 3. Desktop NextAuth Secret Lifecycle

In desktop (Electron) mode:
- `electron/main.js` now uses `getOrCreateDesktopSecret()`:
  - Checks `process.env.NEXTAUTH_SECRET`.
  - If unset, generates a unique 256-bit (32-byte) hex string via `crypto.randomBytes(32).toString('hex')`.
  - Persists this private secret to `app.getPath('userData')/.auth-secret`.
  - This guarantees that no two desktop installations share the same JWT signing key, and sessions survive app restarts without relying on any hardcoded repository secret.

---

## 4. Verification Check

As of Milestone 1.1:
- `git grep -i "c93be9"` confirms **zero** active source code references.
- All secrets are strictly loaded via runtime environment variables or secure local filesystem storage.
