/**
 * MLocker Desktop Database Lifecycle Manager
 * Controls path resolution, WAL configuration, startup migrations, and shutdown checkpointing.
 */

const fs = require("fs");
const path = require("path");

let DatabaseSync = null;
try {
  DatabaseSync = require("node:sqlite").DatabaseSync;
} catch {
  // Handled if runtime lacks node:sqlite
}
const { getSchemaVersion, runMigrations, MigrationError } = require("./migrator");
const {
  createDatabaseBackup,
  restoreDatabaseFromBackup,
  verifyDatabaseIntegrity,
  checkpointDatabase,
} = require("./backup");
const { LATEST_SCHEMA_VERSION } = require("./migrations");

class DatabaseLifecycleError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "DatabaseLifecycleError";
    this.details = details;
  }
}

/**
 * Resolves the appropriate SQLite database file path.
 * In packaged mode, strictly resolves to Electron's userData directory.
 * In development mode, defaults to prisma/dev.db unless overridden.
 *
 * @param {Object} [app] Electron app instance (optional in unit tests)
 * @param {Object} [options]
 * @param {string} [options.explicitPath] Override path for testing
 * @param {boolean} [options.isPackaged] Explicit override for packaged state
 * @returns {{ dbPath: string, dbUrl: string, isPackaged: boolean, userDataPath?: string }}
 */
function resolveDatabasePath(app, options = {}) {
  if (options.explicitPath) {
    const dbPath = path.resolve(options.explicitPath);
    return {
      dbPath,
      dbUrl: `file:${dbPath.replace(/\\/g, "/")}`,
      isPackaged: false,
    };
  }

  const isPackaged =
    options.isPackaged !== undefined
      ? options.isPackaged
      : app && typeof app.isPackaged === "boolean"
      ? app.isPackaged
      : process.env.NODE_ENV === "production";

  if (isPackaged) {
    if (!app || typeof app.getPath !== "function") {
      throw new DatabaseLifecycleError(
        "Electron app instance with getPath('userData') is required in packaged mode."
      );
    }
    const userDataPath = app.getPath("userData");

    // Maintain backward compatibility with existing user databases (dev.db)
    const existingLegacyDb = path.join(userDataPath, "dev.db");
    const standardDb = path.join(userDataPath, "mlocker.db");

    const targetDbPath = fs.existsSync(existingLegacyDb) ? existingLegacyDb : standardDb;

    return {
      dbPath: targetDbPath,
      dbUrl: `file:${targetDbPath.replace(/\\/g, "/")}`,
      isPackaged: true,
      userDataPath,
    };
  }

  // Development mode: resolve to repository prisma/dev.db or DATABASE_URL
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith("file:")) {
    const rawPath = process.env.DATABASE_URL.replace(/^file:/, "");
    const dbPath = path.isAbsolute(rawPath)
      ? rawPath
      : path.resolve(process.cwd(), rawPath);
    return {
      dbPath,
      dbUrl: `file:${dbPath.replace(/\\/g, "/")}`,
      isPackaged: false,
    };
  }

  const defaultDevPath = path.resolve(__dirname, "../../prisma/dev.db");
  return {
    dbPath: defaultDevPath,
    dbUrl: `file:${defaultDevPath.replace(/\\/g, "/")}`,
    isPackaged: false,
  };
}

/**
 * Initializes, verifies, and migrates the SQLite database on application startup.
 *
 * @param {Object} [app] Electron app instance
 * @param {Object} [options] Lifecycle options
 * @param {string} [options.explicitPath] Explicit database path override
 * @param {boolean} [options.isPackaged] Explicit override for packaged state
 * @param {Function} [options.logger=console.log] Optional logger function
 * @returns {{ dbPath: string, dbUrl: string, version: number, isFreshInstall: boolean, appliedMigrations: string[] }}
 */
function initializeDatabase(app, options = {}) {
  const logger = options.logger || console.log;
  const { dbPath, dbUrl, isPackaged, userDataPath } = resolveDatabasePath(app, options);

  const dbDir = path.dirname(dbPath);
  try {
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
  } catch (err) {
    throw new DatabaseLifecycleError(
      `Cannot create database directory ${dbDir}: ${err.message}`,
      { dbPath, originalError: err }
    );
  }

  const isFreshInstall = !fs.existsSync(dbPath);
  const backupDir = userDataPath
    ? path.join(userDataPath, "backups")
    : path.join(dbDir, "backups");

  logger(
    `[MLocker Lifecycle] Initializing database at ${dbPath} (packaged: ${isPackaged}, fresh: ${isFreshInstall})`
  );

  // If existing database, verify integrity before proceeding
  if (!isFreshInstall) {
    const integrity = verifyDatabaseIntegrity(dbPath);
    if (!integrity.ok) {
      throw new DatabaseLifecycleError(
        `Pre-startup database integrity check failed: ${integrity.errors.join(", ")}`,
        { dbPath, errors: integrity.errors }
      );
    }
  }

  // Open database connection for setup, WAL enablement, and migrations
  if (!DatabaseSync) {
    throw new DatabaseLifecycleError(
      "node:sqlite is unavailable in this runtime. Node.js >= 22.5.0 or Electron is required.",
      { dbPath }
    );
  }

  let db;
  try {
    db = new DatabaseSync(dbPath);
  } catch (err) {
    throw new DatabaseLifecycleError(`Failed opening SQLite database: ${err.message}`, {
      dbPath,
      originalError: err,
    });
  }

  let appliedMigrations = [];
  let preMigrationBackup = null;

  try {
    // 1. Enable WAL mode for high concurrency and crash resilience
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("PRAGMA busy_timeout = 5000");

    const currentVersion = getSchemaVersion(db);

    // 2. If upgrades are needed and database contains existing data, take pre-migration backup.
    // If the backup fails or is unverifiable, HALT migration immediately to protect user data.
    if (currentVersion < LATEST_SCHEMA_VERSION && !isFreshInstall) {
      try {
        preMigrationBackup = createDatabaseBackup(dbPath, backupDir, {
          tag: `pre-migration-v${currentVersion}`,
          maxBackups: 5,
          requireCheckpoint: true,
        });
        logger(
          `[MLocker Lifecycle] Created verified pre-migration backup at: ${preMigrationBackup.backupPath}`
        );
      } catch (backupErr) {
        throw new DatabaseLifecycleError(
          `Pre-migration backup failed: ${backupErr.message}. Halting migration to protect database from unrecoverable modification.`,
          { dbPath, originalError: backupErr }
        );
      }
    }

    // 3. Execute embedded migrations
    const migrationResult = runMigrations(db, {
      targetVersion: LATEST_SCHEMA_VERSION,
      logger,
    });

    appliedMigrations = migrationResult.appliedMigrations;

    // 4. Execute startup crash recovery sweep for unsealed sessions (DEC-M5-03)
    try {
      const tableCheck = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ActivitySession'")
        .get();
      if (tableCheck) {
        const sweepResult = db.prepare(`
          UPDATE "ActivitySession"
          SET "status" = 'recovered',
              "closeReason" = 'crash_recovery',
              "endedAt" = COALESCE("lastHeartbeatAt", "startedAt"),
              "updatedAt" = CURRENT_TIMESTAMP
          WHERE "status" IN ('active', 'paused')
        `).run();
        if (sweepResult.changes > 0) {
          logger(
            `[MLocker Lifecycle] Crash recovery sweep: sealed ${sweepResult.changes} lingering session(s) as 'recovered'.`
          );
        }
      }
    } catch (sweepErr) {
      logger(`[MLocker Lifecycle] Warning: Crash recovery sweep failed: ${sweepErr.message}`);
    }

    // 5. Run passive WAL checkpoint after migration
    db.exec("PRAGMA wal_checkpoint(PASSIVE)");
  } catch (err) {
    // Close active setup connection before attempting rollback
    try {
      db.close();
      db = null;
    } catch {}

    // Rollback to pre-migration backup if available
    if (preMigrationBackup && fs.existsSync(preMigrationBackup.backupPath)) {
      logger(
        `[MLocker Lifecycle] Migration failure detected. Restoring from pre-migration backup: ${preMigrationBackup.backupPath}...`
      );
      try {
        restoreDatabaseFromBackup(preMigrationBackup.backupPath, dbPath);
        logger(`[MLocker Lifecycle] Restored database successfully from pre-migration backup.`);
      } catch (restoreErr) {
        logger(
          `[MLocker Lifecycle] Critical: Failed to restore backup after migration failure: ${restoreErr.message}`
        );
      }
    }

    throw new DatabaseLifecycleError(
      `Database initialization/migration failed: ${err.message}`,
      {
        dbPath,
        originalError: err,
        preMigrationBackup: preMigrationBackup ? preMigrationBackup.backupPath : null,
      }
    );
  } finally {
    if (db) {
      try {
        db.close();
      } catch {}
    }
  }

  // Set DATABASE_URL for Next.js / PrismaClient runtime
  process.env.DATABASE_URL = dbUrl;
  logger(`[MLocker Lifecycle] DATABASE_URL established: ${process.env.DATABASE_URL}`);

  return {
    dbPath,
    dbUrl,
    version: LATEST_SCHEMA_VERSION,
    isFreshInstall,
    appliedMigrations,
  };
}

/**
 * Gracefully checkpoints WAL and flushes writes prior to application shutdown.
 * Returns the checkpoint outcome so callers never report success when skipped or failed.
 *
 * @param {string} dbPath
 * @returns {{ ok: boolean, error?: string, busy?: boolean }}
 */
function shutdownDatabase(dbPath) {
  if (dbPath && fs.existsSync(dbPath)) {
    return checkpointDatabase(dbPath, "TRUNCATE");
  }
  return { ok: false, error: "Database file does not exist or dbPath is missing" };
}

module.exports = {
  DatabaseLifecycleError,
  resolveDatabasePath,
  initializeDatabase,
  shutdownDatabase,
};
