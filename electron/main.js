const { app, BrowserWindow, shell, ipcMain, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");

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

/**
 * Ensures SQLite database exists in a writable location and sets DATABASE_URL
 */
function setupDatabase() {
  const userDataPath = app.getPath("userData");
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }

  const targetDbPath = path.join(userDataPath, "dev.db");

  if (app.isPackaged) {
    if (!fs.existsSync(targetDbPath)) {
      // Look for bundled template database
      const candidates = [
        path.join(process.resourcesPath, "dev.db"),
        path.join(process.resourcesPath, "prisma", "dev.db"),
        path.join(process.resourcesPath, "app", "prisma", "dev.db"),
        path.join(__dirname, "..", "prisma", "dev.db"),
      ];

      let copied = false;
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          try {
            fs.copyFileSync(candidate, targetDbPath);
            copied = true;
            console.log(`[Media Locker] Copied template DB from ${candidate} to ${targetDbPath}`);
            break;
          } catch (err) {
            console.error(`[Media Locker] Error copying candidate DB:`, err);
          }
        }
      }

      if (!copied) {
        console.log(`[Media Locker] No starter DB found, SQLite will create a new file at ${targetDbPath}`);
      }
    }

    process.env.DATABASE_URL = `file:${targetDbPath}`;
  } else {
    // In local dev, use the project's prisma/dev.db
    if (!process.env.DATABASE_URL) {
      process.env.DATABASE_URL = `file:${path.resolve(__dirname, "..", "prisma", "dev.db")}`;
    }
  }

  if (!process.env.TMDB_API_KEY) {
    process.env.TMDB_API_KEY = "c93be9cb1dc8ff2594820332b1defeeb";
  }

  console.log(`[Media Locker] Database configured: ${process.env.DATABASE_URL}`);
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
 * Starts the embedded Next.js production server
 */
async function startProductionServer() {
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
  process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || "media-locker-desktop-app-secret-key-2026";

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

  // Handle external links safely
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http:") || url.startsWith("https:")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    try {
      const parsed = new URL(url);
      const appOrigin = new URL(currentAppUrl).origin;
      if (parsed.origin !== appOrigin) {
        event.preventDefault();
        shell.openExternal(url);
      }
    } catch {
      // internal navigation
    }
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
ipcMain.handle("open-external", async (_, url) => {
  if (typeof url === "string" && (url.startsWith("http://") || url.startsWith("https://"))) {
    await shell.openExternal(url);
  }
});

ipcMain.handle("get-app-version", () => {
  return app.getVersion();
});

// Second instance focus
app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// Application startup
app.whenReady().then(async () => {
  setupDatabase();
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

app.on("before-quit", () => {
  if (nextServer) {
    try {
      nextServer.close();
      console.log("[Media Locker] Next.js server closed.");
    } catch (err) {
      console.error("[Media Locker] Error closing server:", err);
    }
  }
});
