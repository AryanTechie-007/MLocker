# Milestone 1.2: Electron Navigation Security Hardening Report

**Date:** 2026-11-19  
**Status:** COMPLETE  
**Standard:** `AGENTS.md` Desktop Hardening Rules & Milestone 1.2 Goal  

---

## 1. Finding & Threat Analysis

Prior to this remediation, `electron/main.js` contained inconsistent and permissive navigation security handlers:
1. **Permissive Window Creation (`setWindowOpenHandler`):**
   ```js
   mainWindow.webContents.setWindowOpenHandler(({ url }) => {
     if (url.startsWith("http:") || url.startsWith("https:")) {
       shell.openExternal(url);
       return { action: "deny" };
     }
     return { action: "allow" }; // VULNERABILITY: Permitted non-HTTP schemes (file:, javascript:, custom) to spawn new Electron windows!
   });
   ```
2. **Unfiltered External Protocol Execution (`will-navigate`):**
   ```js
   mainWindow.webContents.on("will-navigate", (event, url) => {
     try {
       const parsed = new URL(url);
       const appOrigin = new URL(currentAppUrl).origin;
       if (parsed.origin !== appOrigin) {
         event.preventDefault();
         shell.openExternal(url); // VULNERABILITY: Directly passed arbitrary non-HTTP schemes (file:, smb:, custom) to system shell!
       }
     } catch {}
   });
   ```

This inverted security policy allowed non-HTTP/HTTPS schemes to open privileged child windows and invoked the system shell without an HTTP/HTTPS protocol allowlist.

---

## 2. Hardened Architecture & Implementation

The navigation handlers have been completely unified and hardened in [electron/ipc-handlers.js](file:///c:/Users/Aryan/Projects/Media-Locker/electron/ipc-handlers.js) and wired into [electron/main.js](file:///c:/Users/Aryan/Projects/Media-Locker/electron/main.js):

### A. Window Open Guard (`handleWindowOpen`):
- **Zero Child Windows Allowed:** Always returns `{ action: "deny" }`. Untrusted URLs or arbitrary scripts can never spawn new `BrowserWindow` instances.
- **Safe External Delegation:** Reuses `handleOpenExternal(shell, url)` to open only valid `http:` and `https:` URLs in the system's default browser.
- **Dangerous Scheme Denial:** Schemes such as `file:`, `javascript:`, `data:`, `smb:`, and custom protocol handlers are strictly ignored and denied.

### B. In-Window Navigation Guard (`handleWillNavigate`):
- **Strict Application Origin Allowlist:** Verifies `parsed.origin === expectedOrigin` (e.g. `http://localhost:3000` or local dynamic Next.js port). Internal page transitions (`/`, `/library`, `/collections`, `/stats`, `/search`) proceed unhindered without calling `preventDefault()`.
- **External Origin Interception:** If `parsed.origin !== expectedOrigin`, in-window navigation is immediately cancelled via `event.preventDefault()`.
- **Protocol Allowlist Enforcement:** Only valid `http:` and `https:` links are delegated to `handleOpenExternal(shell, parsed.href)`. Dangerous schemes (`file:`, `javascript:`, `data:`, custom protocols) and malformed inputs are strictly aborted without executing shell commands.

### C. Electron Security Baseline Preservation:
The main window continues to run with strict process sandboxing in [electron/main.js](file:///c:/Users/Aryan/Projects/Media-Locker/electron/main.js#L198-L202):
- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`

---

## 3. Regression Test Coverage

Created [tests/security/electron-navigation.test.ts](file:///c:/Users/Aryan/Projects/Media-Locker/tests/security/electron-navigation.test.ts) (16 tests) covering the actual handler runtime:

| Test Group | Scenarios Tested | Result |
|---|---|:---:|
| `handleWindowOpen` | External HTTPS/HTTP delegation to system browser; strict `{ action: "deny" }` for all windows; denial of `file:`, `javascript:`, `data:`, `smb:`, `ftp:`, and malformed payloads without shell invocation. | **PASS** |
| `handleWillNavigate` | Unhindered internal navigation for `/`, `/library`, `/collections`, `/stats`, `/search`; `preventDefault()` interception for external URLs; system browser launch for valid HTTP/HTTPS; strict blocking of `file:`, `javascript:`, `data:`, `custom:`, and malformed URLs. | **PASS** |
| `setupNavigationGuards` | End-to-end registration on `BrowserWindow.webContents` verifying listener attachment and runtime execution. | **PASS** |

---

## 4. Verification Results

| Check | Command | Result |
|---|---|:---:|
| **Navigation Tests** | `npx vitest run tests/security/electron-navigation.test.ts` | **16/16 passed** |
| **All Test Suites** | `npm test` | **89/89 passed across 8 suites** (3.6s) |
| **TypeScript** | `npx tsc --noEmit` | **0 errors** |
| **ESLint** | `npm run lint` | **0 warnings, 0 errors** |
| **Production Build** | `npm run build` | **Next.js production build succeeded** |
| **GitHub Actions CI** | Automated pipeline | Verified on push |
