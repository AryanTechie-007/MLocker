/**
 * MLocker Embedded SQLite Migration Runner
 * Executes versioned migrations tracked by PRAGMA user_version.
 * Runs atomically inside SQLite transactions without Prisma CLI dependencies.
 */

const crypto = require("crypto");
const { MIGRATIONS, LATEST_SCHEMA_VERSION } = require("./migrations");

class MigrationError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = "MigrationError";
    this.context = context;
  }
}

/**
 * Returns current PRAGMA user_version from SQLite database.
 */
function getSchemaVersion(db) {
  const row = db.prepare("PRAGMA user_version").get();
  return row ? (row.user_version ?? 0) : 0;
}

/**
 * Updates PRAGMA user_version.
 */
function setSchemaVersion(db, version) {
  if (!Number.isInteger(version) || version < 0) {
    throw new MigrationError(`Invalid schema version: ${version}`);
  }
  db.exec(`PRAGMA user_version = ${version}`);
}

/**
 * Returns list of user-created table names in SQLite.
 */
function getTableNames(db) {
  const rows = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%'"
    )
    .all();
  return rows.map((r) => r.name);
}

/**
 * Synchronizes applied migration record with _prisma_migrations table
 * so that Prisma CLI and embedded runner remain in harmony.
 */
function recordPrismaMigration(db, migrationName) {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
        "id"                    TEXT PRIMARY KEY NOT NULL,
        "checksum"              TEXT NOT NULL,
        "finished_at"           DATETIME,
        "migration_name"        TEXT NOT NULL,
        "logs"                  TEXT,
        "rolled_back_at"        DATETIME,
        "started_at"            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "applied_steps_count"   INTEGER NOT NULL DEFAULT 1
      );
    `);

    const existing = db
      .prepare('SELECT id FROM "_prisma_migrations" WHERE migration_name = ?')
      .get(migrationName);

    if (!existing) {
      const id = crypto.randomUUID();
      const checksum = crypto.createHash("sha256").update(migrationName).digest("hex");
      const finishedAt = Date.now();
      db.prepare(
        `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count)
         VALUES (?, ?, ?, ?, 1)`
      ).run(id, checksum, finishedAt, migrationName);
    }
  } catch (err) {
    // Non-fatal if _prisma_migrations cannot be written; PRAGMA user_version is authoritative
    console.warn(`[MLocker Migrator] Notice: Could not record in _prisma_migrations:`, err.message);
  }
}

/**
 * Runs all pending migrations sequentially from currentVersion up to targetVersion.
 *
 * @param {import('node:sqlite').DatabaseSync} db Active database connection
 * @param {Object} options Configuration options
 * @param {number} [options.targetVersion=LATEST_SCHEMA_VERSION] Desired target version
 * @param {Array} [options.migrations=MIGRATIONS] Migration registry to execute
 * @param {Function} [options.logger=console.log] Optional logger function
 * @returns {{ initialVersion: number, finalVersion: number, appliedCount: number, appliedMigrations: string[] }}
 */
function runMigrations(db, options = {}) {
  const targetVersion = options.targetVersion ?? LATEST_SCHEMA_VERSION;
  const migrations = options.migrations ?? MIGRATIONS;
  const logger = options.logger || console.log;

  const initialVersion = getSchemaVersion(db);

  if (initialVersion > targetVersion) {
    throw new MigrationError(
      `Database schema version (${initialVersion}) is newer than application supported version (${targetVersion}). Downgrades are not supported.`,
      { initialVersion, targetVersion }
    );
  }

  if (initialVersion === targetVersion) {
    return {
      initialVersion,
      finalVersion: initialVersion,
      appliedCount: 0,
      appliedMigrations: [],
    };
  }

  const existingTables = getTableNames(db);
  const isFreshDatabase = existingTables.length === 0;
  const appliedMigrations = [];

  logger(
    `[MLocker Migrator] Migrating database from version ${initialVersion} to ${targetVersion} (fresh: ${isFreshDatabase})...`
  );

  // Filter migrations strictly between initialVersion + 1 and targetVersion
  const pending = migrations.filter(
    (m) => m.version > initialVersion && m.version <= targetVersion
  );

  for (const migration of pending) {
    logger(`[MLocker Migrator] Applying migration v${migration.version}: ${migration.name}...`);

    try {
      db.exec("BEGIN IMMEDIATE");

      if (migration.sql) {
        db.exec(migration.sql);
      } else if (typeof migration.up === "function") {
        migration.up(db);
      } else {
        throw new MigrationError(`Migration ${migration.name} has no valid sql or up function.`);
      }

      setSchemaVersion(db, migration.version);
      recordPrismaMigration(db, migration.name);

      db.exec("COMMIT");
      appliedMigrations.push(migration.name);
      logger(`[MLocker Migrator] Successfully applied migration v${migration.version}: ${migration.name}`);
    } catch (err) {
      try {
        db.exec("ROLLBACK");
      } catch (rollbackErr) {
        logger(`[MLocker Migrator] Rollback error:`, rollbackErr.message);
      }
      throw new MigrationError(
        `Failed executing migration v${migration.version} (${migration.name}): ${err.message}`,
        {
          failedVersion: migration.version,
          failedMigration: migration.name,
          originalError: err,
        }
      );
    }
  }

  const finalVersion = getSchemaVersion(db);

  return {
    initialVersion,
    finalVersion,
    appliedCount: appliedMigrations.length,
    appliedMigrations,
  };
}

module.exports = {
  MigrationError,
  getSchemaVersion,
  setSchemaVersion,
  getTableNames,
  recordPrismaMigration,
  runMigrations,
};
