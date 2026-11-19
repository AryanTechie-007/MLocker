/**
 * Electron Security & Navigation Handlers for Media Locker
 * Hardened against protocol injection, unauthorized window creation, and malformed inputs.
 */

/**
 * Handles the "open-external" IPC request safely.
 * Only allows valid http:// and https:// protocol URLs to be opened in the system browser.
 * Rejects file://, javascript:, data:, and malformed inputs.
 */
async function handleOpenExternal(shell, url) {
  if (typeof url !== "string") return false;
  try {
    const trimmed = url.trim();
    if (!trimmed) return false;
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      await shell.openExternal(parsed.href);
      return true;
    }
  } catch {
    // Malformed URL or URL parsing failure
  }
  return false;
}

/**
 * Handles the "get-app-version" IPC request safely.
 */
function handleGetAppVersion(app) {
  if (!app || typeof app.getVersion !== "function") {
    return "0.0.0";
  }
  return app.getVersion();
}

/**
 * Hardened window.open handler (webContents.setWindowOpenHandler).
 * Never permits untrusted or arbitrary child BrowserWindow instances ({ action: "deny" }).
 * If the target URL is valid HTTP/HTTPS, safely delegates to the system browser via shell.openExternal.
 * Rejects file://, javascript:, data:, and unrecognized schemes without opening windows.
 */
function handleWindowOpen(details, shell) {
  const url = details?.url;
  if (typeof url === "string") {
    handleOpenExternal(shell, url);
  }
  return { action: "deny" };
}

/**
 * Hardened in-window navigation handler (webContents.on("will-navigate")).
 * Strictly permits navigation only within the application's origin (e.g. Next.js internal pages).
 * For external navigation:
 * - Always calls event.preventDefault() to prevent in-app navigation to untrusted content.
 * - If the protocol is HTTP or HTTPS, delegates to the default system browser via handleOpenExternal.
 * - Strictly denies file://, javascript:, data:, custom protocols, and malformed URLs.
 */
function handleWillNavigate(event, navigationUrl, appOrigin, shell) {
  if (typeof navigationUrl !== "string") {
    if (event && typeof event.preventDefault === "function") event.preventDefault();
    return { allowed: false, reason: "invalid_type" };
  }

  try {
    const parsed = new URL(navigationUrl.trim());

    // 1. Enforce strict HTTP/HTTPS protocol allowlist first (Milestone 1.2.1)
    // Blocks blob:, filesystem:, file:, javascript:, data:, and custom protocols regardless of origin
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      if (event && typeof event.preventDefault === "function") event.preventDefault();
      return { allowed: false, reason: "blocked_protocol" };
    }

    const expectedOrigin = new URL(appOrigin).origin;

    // 2. Legitimate internal application navigation within application origin
    if (parsed.origin === expectedOrigin) {
      return { allowed: true, reason: "internal" };
    }

    // 3. External HTTP/HTTPS navigation: prevent in-window load and open in system browser
    if (event && typeof event.preventDefault === "function") event.preventDefault();
    handleOpenExternal(shell, parsed.href);
    return { allowed: false, reason: "external_opened" };
  } catch {
    if (event && typeof event.preventDefault === "function") event.preventDefault();
    return { allowed: false, reason: "malformed_url" };
  }
}

/**
 * Registers all IPC handlers with ipcMain.
 */
function registerIpcHandlers(ipcMain, shell, app) {
  ipcMain.handle("open-external", async (_, url) => handleOpenExternal(shell, url));
  ipcMain.handle("get-app-version", () => handleGetAppVersion(app));
}

/**
 * Attaches hardened navigation and window open handlers to a BrowserWindow instance.
 */
function setupNavigationGuards(browserWindow, appOrigin, shell) {
  if (!browserWindow || !browserWindow.webContents) return;

  browserWindow.webContents.setWindowOpenHandler((details) => {
    return handleWindowOpen(details, shell);
  });

  browserWindow.webContents.on("will-navigate", (event, url) => {
    handleWillNavigate(event, url, appOrigin, shell);
  });
}

module.exports = {
  handleOpenExternal,
  handleGetAppVersion,
  handleWindowOpen,
  handleWillNavigate,
  registerIpcHandlers,
  setupNavigationGuards,
};
