/**
 * Electron IPC Handlers for Media Locker
 * Hardened against protocol injection and malformed IPC inputs.
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
 * Registers all IPC handlers with ipcMain.
 */
function registerIpcHandlers(ipcMain, shell, app) {
  ipcMain.handle("open-external", async (_, url) => handleOpenExternal(shell, url));
  ipcMain.handle("get-app-version", () => handleGetAppVersion(app));
}

module.exports = {
  handleOpenExternal,
  handleGetAppVersion,
  registerIpcHandlers,
};
