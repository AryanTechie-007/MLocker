/**
 * MLocker SQLite Backup & Recovery Service
 * Provides WAL-consistent snapshots, rotation, integrity checks, and disaster recovery.
 */

const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

class BackupError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "BackupError";
    this.details = details;
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
 */
function checkpointDatabase(dbPath) {
  if (!fs.existsSync(dbPath)) return;
  try {
    const db = new DatabaseSync(dbPath);
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    db.close();
  } catch (err) {
    // If checkpoint fails (e.g. database locked by another connection), log warning
    console.warn("[MLocker Backup] Warning: WAL checkpoint failed:", err.message);
  }
}

/**
 * Verifies SQLite database integrity using PRAGMA integrity_check.
 */
function verifyDatabaseIntegrity(dbPath) {
  if (!fs.existsSync(dbPath)) {
    return { ok: false, errors: ["Database file does not exist"] };
  }

  if (!isSQLiteHeaderValid(dbPath)) {
    return { ok: false, errors: ["Invalid SQLite header magic string"] };
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
 *
 * @param {string} dbPath Path to primary SQLite database
 * @param {string} backupDir Directory where backup should be placed
 * @param {Object} options Configuration options
 * @param {string} [options.tag="backup"] Descriptive tag (e.g. "pre-migration-v1")
 * @param {number} [options.maxBackups=5] Maximum backups to retain
 * @returns {{ backupPath: string, filename: string, size: number, timestamp: number }}
 */
function createDatabaseBackup(dbPath, backupDir, options = {}) {
  if (!fs.existsSync(dbPath)) {
    throw new BackupError(`Source database does not exist: ${dbPath}`);
  }

  const tag = options.tag || "backup";
  const maxBackups = options.maxBackups ?? 5;

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  // 1. Flush WAL into main database file
  checkpointDatabase(dbPath);

  // 2. Generate backup filename with timestamp and random suffix to avoid collision
  const timestamp = Date.now();
  const filename = `${tag}-${timestamp}.bak`;
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
 *
 * @param {string} backupPath Path to backup file
 * @param {string} targetDbPath Path where database should be restored
 */
function restoreDatabaseFromBackup(backupPath, targetDbPath) {
  if (!fs.existsSync(backupPath)) {
    throw new BackupError(`Backup file not found: ${backupPath}`);
  }

  // Verify backup integrity prior to restoration
  const backupCheck = verifyDatabaseIntegrity(backupPath);
  if (!backupCheck.ok) {
    throw new BackupError(`Cannot restore corrupt backup: ${backupCheck.errors.join(", ")}`);
  }

  // Remove existing target files and auxiliary WAL/SHM files
  const filesToRemove = [targetDbPath, `${targetDbPath}-wal`, `${targetDbPath}-shm`];
  for (const f of filesToRemove) {
    if (fs.existsSync(f)) {
      try {
        fs.unlinkSync(f);
      } catch (err) {
        throw new BackupError(`Failed to remove existing file during restore: ${f} (${err.message})`);
      }
    }
  }

  // Ensure parent directory exists
  const targetDir = path.dirname(targetDbPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Copy backup to target location
  fs.copyFileSync(backupPath, targetDbPath);

  // Verify restored target database
  const targetCheck = verifyDatabaseIntegrity(targetDbPath);
  if (!targetCheck.ok) {
    throw new BackupError(`Restored database failed integrity check: ${targetCheck.errors.join(", ")}`);
  }

  return {
    ok: true,
    restoredFrom: backupPath,
    targetDbPath,
  };
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
