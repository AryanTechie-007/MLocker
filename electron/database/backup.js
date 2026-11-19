/**
 * MLocker SQLite Backup & Recovery Service
 * Provides WAL-consistent snapshots, rotation, integrity checks, and disaster recovery.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

let DatabaseSync = null;
try {
  DatabaseSync = require("node:sqlite").DatabaseSync;
} catch {
  // Gracefully handled if running on Node runtime without node:sqlite
}

class BackupError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "BackupError";
    this.details = details;
  }
}

function assertSQLiteAvailable() {
  if (!DatabaseSync) {
    throw new BackupError(
      "node:sqlite is unavailable in this runtime. Node.js >= 22.5.0 or Electron is required."
    );
  }
}

/**
 * Validates whether a file has a valid SQLite 3 header magic string.
 */
function isSQLiteHeaderValid(filePath) {
  if (!fs.existsSync(filePath)) return false;
  try {
    const fd = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(16);
    fs.readSync(fd, buffer, 0, 16, 0);
    fs.closeSync(fd);
    return buffer.toString("utf8", 0, 15) === "SQLite format 3";
  } catch {
    return false;
  }
}

/**
 * Checkpoints SQLite WAL to ensure all uncommitted or pending frames
 * are flushed into the primary database file.
 *
 * @param {string} dbPath Path to primary SQLite database
 * @param {'PASSIVE' | 'FULL' | 'RESTART' | 'TRUNCATE'} [mode='TRUNCATE']
 * @returns {{ ok: boolean, busy?: boolean, log?: number, checkpointed?: number, error?: string }}
 */
function checkpointDatabase(dbPath, mode = "TRUNCATE") {
  if (!dbPath || !fs.existsSync(dbPath)) {
    return { ok: false, error: `Database file does not exist: ${dbPath}` };
  }
  if (!DatabaseSync) {
    return { ok: false, error: "node:sqlite is unavailable in this runtime" };
  }
  try {
    const db = new DatabaseSync(dbPath);
    const row = db.prepare(`PRAGMA wal_checkpoint(${mode})`).get();
    db.close();

    const isBusy = Boolean(row && row.busy === 1);
    if (isBusy) {
      return {
        ok: false,
        busy: true,
        log: row ? row.log : undefined,
        checkpointed: row ? row.checkpointed : undefined,
        error: "WAL checkpoint blocked: database is busy with concurrent readers/writers",
      };
    }

    return {
      ok: true,
      busy: false,
      log: row ? row.log : undefined,
      checkpointed: row ? row.checkpointed : undefined,
    };
  } catch (err) {
    console.warn("[MLocker Backup] Warning: WAL checkpoint failed:", err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Verifies SQLite database integrity using PRAGMA integrity_check.
 *
 * @param {string} dbPath
 * @returns {{ ok: boolean, errors: string[] }}
 */
function verifyDatabaseIntegrity(dbPath) {
  if (!fs.existsSync(dbPath)) {
    return { ok: false, errors: ["Database file does not exist"] };
  }

  if (!isSQLiteHeaderValid(dbPath)) {
    return { ok: false, errors: ["Invalid SQLite header magic string"] };
  }

  if (!DatabaseSync) {
    return { ok: false, errors: ["node:sqlite is unavailable in this runtime"] };
  }

  try {
    const db = new DatabaseSync(dbPath);
    const rows = db.prepare("PRAGMA integrity_check").all();
    db.close();

    const isOk = rows.length === 1 && rows[0].integrity_check === "ok";
    return {
      ok: isOk,
      errors: isOk ? [] : rows.map((r) => r.integrity_check),
    };
  } catch (err) {
    return {
      ok: false,
      errors: [err.message],
    };
  }
}

/**
 * Removes older backups exceeding maxBackups threshold.
 */
function rotateBackups(backupDir, maxBackups = 5, prefix = "") {
  try {
    if (!fs.existsSync(backupDir)) return [];

    const files = fs
      .readdirSync(backupDir)
      .filter((f) => f.endsWith(".bak") && (!prefix || f.startsWith(prefix)))
      .map((f) => {
        const fullPath = path.join(backupDir, f);
        const stats = fs.statSync(fullPath);
        return { name: f, path: fullPath, mtimeMs: stats.mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);

    const deleted = [];
    if (files.length > maxBackups) {
      const toDelete = files.slice(maxBackups);
      for (const item of toDelete) {
        try {
          fs.unlinkSync(item.path);
          deleted.push(item.path);
        } catch (delErr) {
          console.warn("[MLocker Backup] Warning: Failed to delete old backup:", delErr.message);
        }
      }
    }
    return deleted;
  } catch (err) {
    console.warn("[MLocker Backup] Warning during backup rotation:", err.message);
    return [];
  }
}

/**
 * Creates a consistent, WAL-safe backup of the SQLite database.
 * Does NOT copy main database if checkpoint fails when checkpoint is required.
 *
 * @param {string} dbPath Path to primary SQLite database
 * @param {string} backupDir Directory where backup should be placed
 * @param {Object} options Configuration options
 * @param {string} [options.tag="backup"] Descriptive tag (e.g. "pre-migration-v1")
 * @param {number} [options.maxBackups=5] Maximum backups to retain
 * @param {boolean} [options.requireCheckpoint=true] Whether a successful WAL checkpoint is required
 * @returns {{ backupPath: string, filename: string, size: number, timestamp: number }}
 */
function createDatabaseBackup(dbPath, backupDir, options = {}) {
  if (!fs.existsSync(dbPath)) {
    throw new BackupError(`Source database does not exist: ${dbPath}`);
  }

  const tag = options.tag || "backup";
  const maxBackups = options.maxBackups ?? 5;
  const requireCheckpoint = options.requireCheckpoint !== false;

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  // 1. Flush WAL into main database file
  const cpResult = checkpointDatabase(dbPath, "TRUNCATE");
  if (requireCheckpoint && !cpResult.ok) {
    throw new BackupError(
      `Database checkpoint failed before backup: ${cpResult.error}`,
      { dbPath, checkpointResult: cpResult }
    );
  }

  // 2. Generate backup filename with timestamp and random suffix to avoid collision
  const timestamp = Date.now();
  const randomSuffix = crypto.randomBytes(3).toString("hex");
  const filename = `${tag}-${timestamp}-${randomSuffix}.bak`;
  const backupPath = path.join(backupDir, filename);

  // 3. Copy primary database file atomically
  try {
    fs.copyFileSync(dbPath, backupPath);
  } catch (err) {
    throw new BackupError(`Failed to copy database to backup destination: ${err.message}`, {
      dbPath,
      backupPath,
    });
  }

  // 4. Verify integrity of newly created backup
  const integrity = verifyDatabaseIntegrity(backupPath);
  if (!integrity.ok) {
    try {
      fs.unlinkSync(backupPath);
    } catch {}
    throw new BackupError(`Backup verification failed; backup is corrupt`, {
      errors: integrity.errors,
    });
  }

  // 5. Rotate older backups matching the same prefix
  const prefix = tag.startsWith("pre-migration") ? "pre-migration" : "backup";
  rotateBackups(backupDir, maxBackups, prefix);

  const stats = fs.statSync(backupPath);
  return {
    backupPath,
    filename,
    size: stats.size,
    timestamp,
  };
}

/**
 * Safely restores the database from a backup file.
 * Preserves the original database if restoration fails at any point.
 * Avoids deleting existing database before replacement backup has been safely staged and verified.
 * Correctly cleans up and isolates WAL and SHM auxiliary files.
 *
 * @param {string} backupPath Path to backup file
 * @param {string} targetDbPath Path where database should be restored
 * @returns {{ ok: boolean, restoredFrom: string, targetDbPath: string }}
 */
function restoreDatabaseFromBackup(backupPath, targetDbPath) {
  if (!fs.existsSync(backupPath)) {
    throw new BackupError(`Backup file not found: ${backupPath}`);
  }

  // 1. Verify backup integrity prior to restoration
  const backupCheck = verifyDatabaseIntegrity(backupPath);
  if (!backupCheck.ok) {
    throw new BackupError(`Cannot restore corrupt backup: ${backupCheck.errors.join(", ")}`);
  }

  const targetDir = path.dirname(targetDbPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // 2. Stage restoration to a temporary file first
  const randomSuffix = crypto.randomBytes(4).toString("hex");
  const stagingPath = path.join(
    targetDir,
    `.restore-staging-${Date.now()}-${randomSuffix}.tmp`
  );

  try {
    fs.copyFileSync(backupPath, stagingPath);
  } catch (err) {
    try {
      if (fs.existsSync(stagingPath)) fs.unlinkSync(stagingPath);
    } catch {}
    throw new BackupError(`Failed to stage backup file: ${err.message}`);
  }

  // 3. Verify integrity of staged file
  const stagingCheck = verifyDatabaseIntegrity(stagingPath);
  if (!stagingCheck.ok) {
    try {
      fs.unlinkSync(stagingPath);
    } catch {}
    throw new BackupError(
      `Staged backup failed integrity check: ${stagingCheck.errors.join(", ")}`
    );
  }

  // 4. Safely preserve existing target files if they exist before replacement
  const timestamp = Date.now();
  const origPreservedPath = path.join(targetDir, `.pre-restore-orig-${timestamp}-${randomSuffix}.tmp`);
  const origWalPreservedPath = path.join(targetDir, `.pre-restore-orig-${timestamp}-${randomSuffix}.tmp-wal`);
  const origShmPreservedPath = path.join(targetDir, `.pre-restore-orig-${timestamp}-${randomSuffix}.tmp-shm`);

  const hadExistingDb = fs.existsSync(targetDbPath);
  const hadExistingWal = fs.existsSync(`${targetDbPath}-wal`);
  const hadExistingShm = fs.existsSync(`${targetDbPath}-shm`);

  try {
    if (hadExistingDb) fs.renameSync(targetDbPath, origPreservedPath);
    if (hadExistingWal) fs.renameSync(`${targetDbPath}-wal`, origWalPreservedPath);
    if (hadExistingShm) fs.renameSync(`${targetDbPath}-shm`, origShmPreservedPath);
  } catch (renameErr) {
    // Rollback any partial renames
    try { if (!fs.existsSync(targetDbPath) && fs.existsSync(origPreservedPath)) fs.renameSync(origPreservedPath, targetDbPath); } catch {}
    try { if (!fs.existsSync(`${targetDbPath}-wal`) && fs.existsSync(origWalPreservedPath)) fs.renameSync(origWalPreservedPath, `${targetDbPath}-wal`); } catch {}
    try { if (!fs.existsSync(`${targetDbPath}-shm`) && fs.existsSync(origShmPreservedPath)) fs.renameSync(origShmPreservedPath, `${targetDbPath}-shm`); } catch {}
    try { if (fs.existsSync(stagingPath)) fs.unlinkSync(stagingPath); } catch {}
    throw new BackupError(`Failed to preserve existing database before restore: ${renameErr.message}`);
  }

  // 5. Move verified staged file to target path
  try {
    fs.renameSync(stagingPath, targetDbPath);

    // Remove any stale WAL/SHM files at target path to prevent WAL replay corruption
    if (fs.existsSync(`${targetDbPath}-wal`)) fs.unlinkSync(`${targetDbPath}-wal`);
    if (fs.existsSync(`${targetDbPath}-shm`)) fs.unlinkSync(`${targetDbPath}-shm`);

    // 6. Verify restored target database
    const targetCheck = verifyDatabaseIntegrity(targetDbPath);
    if (!targetCheck.ok) {
      throw new Error(`Integrity check failed on restored database: ${targetCheck.errors.join(", ")}`);
    }

    // 7. Success! Clean up preserved original files
    if (hadExistingDb && fs.existsSync(origPreservedPath)) fs.unlinkSync(origPreservedPath);
    if (hadExistingWal && fs.existsSync(origWalPreservedPath)) fs.unlinkSync(origWalPreservedPath);
    if (hadExistingShm && fs.existsSync(origShmPreservedPath)) fs.unlinkSync(origShmPreservedPath);

    return {
      ok: true,
      restoredFrom: backupPath,
      targetDbPath,
    };
  } catch (replaceErr) {
    // Rollback: Restore original database and WAL/SHM if replacement failed
    try {
      if (fs.existsSync(targetDbPath)) fs.unlinkSync(targetDbPath);
      if (fs.existsSync(`${targetDbPath}-wal`)) fs.unlinkSync(`${targetDbPath}-wal`);
      if (fs.existsSync(`${targetDbPath}-shm`)) fs.unlinkSync(`${targetDbPath}-shm`);
      if (hadExistingDb && fs.existsSync(origPreservedPath)) fs.renameSync(origPreservedPath, targetDbPath);
      if (hadExistingWal && fs.existsSync(origWalPreservedPath)) fs.renameSync(origWalPreservedPath, `${targetDbPath}-wal`);
      if (hadExistingShm && fs.existsSync(origShmPreservedPath)) fs.renameSync(origShmPreservedPath, `${targetDbPath}-shm`);
    } catch (rollbackErr) {
      console.error("[MLocker Backup] Catastrophic: Rollback after failed restore failed:", rollbackErr.message);
    }
    throw new BackupError(`Restoration failed, original database preserved: ${replaceErr.message}`);
  }
}

module.exports = {
  BackupError,
  isSQLiteHeaderValid,
  checkpointDatabase,
  verifyDatabaseIntegrity,
  rotateBackups,
  createDatabaseBackup,
  restoreDatabaseFromBackup,
};
