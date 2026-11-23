const { app, BrowserWindow, shell, ipcMain, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");
const crypto = require("crypto");
const { registerIpcHandlers, setupNavigationGuards } = require("./ipc-handlers");
const { initializeDatabase, shutdownDatabase } = require("./database");
const { performShutdownSequence } = require("./shutdown");

// Enforce single instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
let mainWindow = null;
let nextServer = null;
let currentAppUrl = null;
let databaseConfig = null;

/**
 * Initializes SQLite database lifecycle, WAL configuration, and migrations
 */
function setupDatabase() {
  databaseConfig = initializeDatabase(app, {
    logger: (msg) => console.log(msg),
  });
  console.log(`[Media Locker] Database configured: ${databaseConfig.dbUrl} (version: ${databaseConfig.version})`);
}

/**
 * Polls an HTTP endpoint until ready or timeout
 */
function waitForUrl(url, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function check() {
      const req = http.get(url, (res) => {
        if (res.statusCode && res.statusCode < 500) {
          resolve(true);
        } else {
          retry();
        }
      });

      req.on("error", () => {
        retry();
      });

      req.end();
    }

    function retry() {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Timed out waiting for ${url}`));
      } else {
        setTimeout(check, 400);
      }
    }

    check();
  });
}

/**
 * Retrieves an existing persistent random secret or generates a new cryptographically
 * secure 32-byte secret for NextAuth desktop sessions.
 */
function getOrCreateDesktopSecret() {
  if (process.env.AUTH_SECRET) {
    return process.env.AUTH_SECRET;
  }
  if (process.env.NEXTAUTH_SECRET) {
    return process.env.NEXTAUTH_SECRET;
  }
  const secretPath = path.join(app.getPath("userData"), ".auth-secret");
  try {
    if (fs.existsSync(secretPath)) {
      const saved = fs.readFileSync(secretPath, "utf8").trim();
      if (saved.length >= 32) return saved;
    }
    const generated = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(secretPath, generated, { encoding: "utf8" });
    return generated;
  } catch (err) {
    console.error("[Media Locker] Error reading/writing persistent secret:", err);
    return crypto.randomBytes(32).toString("hex");
  }
}

/**
 * Starts the embedded Next.js production server
 */
async function startProductionServer() {
  const desktopSecret = getOrCreateDesktopSecret();
  process.env.NEXTAUTH_SECRET = desktopSecret;
  process.env.AUTH_SECRET = desktopSecret;
  process.env.AUTH_TRUST_HOST = "true";

  const next = require("next");
  const appDir = path.join(__dirname, "..");

  const nextApp = next({
    dev: false,
    dir: appDir,
    quiet: false,
  });

  const handle = nextApp.getRequestHandler();
  console.log("[Media Locker] Preparing Next.js production server...");
  await nextApp.prepare();

  // Try standard port 3000, fallback to dynamic 0
  const tryListen = (preferredPort) => {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => handle(req, res));

      server.once("error", (err) => {
        if (err.code === "EADDRINUSE" && preferredPort !== 0) {
          console.warn(`[Media Locker] Port ${preferredPort} in use, picking random available port...`);
          resolve(tryListen(0));
        } else {
          reject(err);
        }
      });

      server.listen(preferredPort, "127.0.0.1", () => {
        const port = server.address().port;
        resolve({ server, port });
      });
    });
  };

  const { server, port } = await tryListen(3000);
  nextServer = server;

  process.env.NEXTAUTH_URL = `http://localhost:${port}`;
  process.env.AUTH_URL = `http://localhost:${port}`;

  console.log(`[Media Locker] Production server active at http://127.0.0.1:${port}`);
  return `http://localhost:${port}`;
}

/**
 * Creates the primary application window
 */
function createMainWindow(targetUrl) {
  currentAppUrl = targetUrl;
  const iconPath = path.join(
    __dirname,
    "assets",
    process.platform === "win32" ? "icon.ico" : "icon.png"
  );

  mainWindow = new BrowserWindow({
    width: 1300,
    height: 860,
    minWidth: 960,
    minHeight: 620,
    backgroundColor: "#090a11",
    title: "Media Locker — Universal Media Tracker",
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Smooth appearance
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // Establish strict navigation and window-open guards (Milestone 1.2)
  setupNavigationGuards(mainWindow, targetUrl, shell);

  mainWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Media Locker] Failed to load ${validatedURL}: ${errorCode} (${errorDescription})`);
  });

  mainWindow.loadURL(targetUrl);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

/**
 * Configure standard application menu
 */
function setupMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [isMac ? { role: "close" } : { role: "quit" }],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac
          ? [{ type: "separator" }, { role: "front" }, { type: "separator" }, { role: "window" }]
          : [{ role: "close" }]),
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// IPC Handlers
registerIpcHandlers(ipcMain, shell, app);

// Second instance focus
app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// Application startup
app.whenReady().then(async () => {
  // Test-scoped graceful shutdown trigger for automated CI / testing environments
  if (process.env.MLOCKER_TEST_MODE === "1" || process.argv.includes("--test-mode")) {
    const signalFile = path.join(app.getPath("userData"), "shutdown.signal");
    const signalTimer = setInterval(() => {
      try {
        if (fs.existsSync(signalFile)) {
          clearInterval(signalTimer);
          console.log("[Media Locker Test] Graceful shutdown signal detected. Exiting application...");
          try {
            fs.unlinkSync(signalFile);
          } catch {}
          app.quit();
        }
      } catch {}
    }, 250);
  }

  try {
    setupDatabase();
  } catch (err) {
    console.error("[Media Locker] Fatal: Failed to initialize database:", err);
    app.quit();
    return;
  }

  setupMenu();

  try {
    let targetUrl;

    if (isDev) {
      const devPort = process.env.PORT || 3000;
      targetUrl = `http://localhost:${devPort}`;
      console.log(`[Media Locker] Development mode. Waiting for Next.js at ${targetUrl}...`);
      await waitForUrl(targetUrl, 45000);
    } else {
      targetUrl = await startProductionServer();
    }

    createMainWindow(targetUrl);
  } catch (err) {
    console.error("[Media Locker] Initialization error:", err);
    app.quit();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0 && currentAppUrl) {
      createMainWindow(currentAppUrl);
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

let isQuitting = false;

app.on("before-quit", async (event) => {
  if (isQuitting) return;
  event.preventDefault();
  isQuitting = true;

  try {
    await performShutdownSequence({
      nextServer,
      databaseConfig,
      prisma: globalThis.prisma,
      drainTimeoutMs: 3000,
      logger: console.log,
      errorLogger: console.error,
    });
  } catch (err) {
    console.error("[Media Locker] Error during graceful shutdown:", err);
  } finally {
    app.exit(0);
  }
});
