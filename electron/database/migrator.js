/**
 * MLocker Embedded SQLite Migration Runner
 * Executes versioned migrations tracked by PRAGMA user_version.
 * Runs atomically inside SQLite transactions with schema baseline validation.
 */

const crypto = require("crypto");
const { MIGRATIONS, LATEST_SCHEMA_VERSION, getMigrationChecksum } = require("./migrations");
const {
  validateLegacySchema,
  upgradeSupportedLegacySchema,
  inspectDatabaseSchema,
} = require("./schema-validator");

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
 * using the genuine SHA-256 checksum of the migration SQL so Prisma CLI
 * and embedded runner remain in complete lockstep.
 */
function recordPrismaMigration(db, migrationName, migrationSql = "") {
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
      const checksum = getMigrationChecksum(migrationSql || migrationName);
      const finishedAt = Date.now();
      db.prepare(
        `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count)
         VALUES (?, ?, ?, ?, 1)`
      ).run(id, checksum, finishedAt, migrationName);
    }
  } catch (err) {
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

  const appliedMigrations = [];

  // When initialVersion is 0, we must validate whether this is a fresh database
  // or an existing database needing baseline classification.
  let legacyBaselineHandled = false;
  if (initialVersion === 0) {
    const validation = validateLegacySchema(db);

    logger(
      `[MLocker Migrator] Initial schema validation (version 0): status=${validation.type}, compatible=${validation.isCompatible}`
    );

    if (!validation.isCompatible) {
      throw new MigrationError(
        `Existing database schema (user_version 0) is incompatible with MLocker baseline: ${validation.reasons.join(
          "; "
        )}. Migration halted safely to prevent data loss or corruption.`,
        { validation }
      );
    }

    if (validation.type === "EXACT_BASELINE") {
      // Database already possesses the complete v1 baseline schema.
      // Baseline to v1 directly without executing duplicate CREATE TABLE statements.
      logger("[MLocker Migrator] Database matches baseline schema. Stamping PRAGMA user_version = 1...");
      const v1Migration = migrations.find((m) => m.version === 1);
      const v1Name = v1Migration ? v1Migration.name : "20261119000000_init";
      const v1Sql = v1Migration ? v1Migration.sql : "";

      db.exec("BEGIN IMMEDIATE");
      try {
        setSchemaVersion(db, 1);
        recordPrismaMigration(db, v1Name, v1Sql);
        db.exec("COMMIT");
        appliedMigrations.push(v1Name);
        legacyBaselineHandled = true;
      } catch (err) {
        try { db.exec("ROLLBACK"); } catch {}
        throw new MigrationError(`Failed baselining existing database: ${err.message}`, { originalError: err });
      }
    } else if (validation.type === "SUPPORTED_LEGACY") {
      // Supported legacy database: missing known non-breaking columns.
      // Upgrade missing columns cleanly, then baseline to v1.
      logger(
        `[MLocker Migrator] Upgrading supported legacy database to baseline v1 (${validation.reasons.join("; ")})...`
      );
      const v1Migration = migrations.find((m) => m.version === 1);
      const v1Name = v1Migration ? v1Migration.name : "20261119000000_init";
      const v1Sql = v1Migration ? v1Migration.sql : "";

      db.exec("BEGIN IMMEDIATE");
      try {
        upgradeSupportedLegacySchema(db, validation.missingOptionalColumns, logger);
        setSchemaVersion(db, 1);
        recordPrismaMigration(db, v1Name, v1Sql);
        db.exec("COMMIT");
        appliedMigrations.push(v1Name);
        legacyBaselineHandled = true;
        logger("[MLocker Migrator] Supported legacy database upgraded and baselined to v1 successfully.");
      } catch (err) {
        try { db.exec("ROLLBACK"); } catch {}
        throw new MigrationError(
          `Failed upgrading supported legacy database to baseline: ${err.message}`,
          { originalError: err }
        );
      }
    }
  }

  // Filter migrations strictly between current version and targetVersion
  const currentVersionAfterBaseline = getSchemaVersion(db);
  const pending = migrations.filter(
    (m) => m.version > currentVersionAfterBaseline && m.version <= targetVersion
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
      recordPrismaMigration(db, migration.name, migration.sql || "");

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
