/**
 * MLocker SQLite Database Schema Validator & Baseline Inspector
 * Inspects existing database structure, validates compatibility with the v1 baseline,
 * and provides safe baseline and upgrade mechanisms for supported legacy schemas.
 */

class SchemaValidationError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = "SchemaValidationError";
    this.context = context;
  }
}

/**
 * Expected v1 baseline schema definition.
 */
const BASELINE_COLUMNS = {
  User: [
    { name: "id", required: true },
    { name: "email", required: true },
    { name: "createdAt", required: true },
    { name: "name", required: false },
    { name: "passwordHash", required: false },
    { name: "image", required: false },
  ],
  UserMedia: [
    { name: "id", required: true },
    { name: "userId", required: true },
    { name: "mediaType", required: true },
    { name: "title", required: true },
    { name: "createdAt", required: true },
    { name: "updatedAt", required: true },
    { name: "status", required: false, dflt: "'plan_to_consume'" },
    { name: "rating", required: false },
    { name: "review", required: false },
    { name: "isFavorite", required: false, dflt: "0" },
    { name: "totalEpisodes", required: false },
    { name: "watchedEpisodes", required: false },
    { name: "totalChapters", required: false },
    { name: "readChapters", required: false },
    { name: "hoursPlayed", required: false },
    { name: "startDate", required: false },
    { name: "endDate", required: false },
    { name: "tags", required: false },
    { name: "genres", required: false },
    { name: "overview", required: false },
    { name: "posterUrl", required: false },
    { name: "year", required: false },
    { name: "externalId", required: false },
    { name: "externalSource", required: false },
  ],
  Collection: [
    { name: "id", required: true },
    { name: "userId", required: true },
    { name: "name", required: true },
    { name: "createdAt", required: true },
    { name: "updatedAt", required: true },
    { name: "description", required: false },
    { name: "coverUrl", required: false },
  ],
  CollectionItem: [
    { name: "id", required: true },
    { name: "collectionId", required: true },
    { name: "userMediaId", required: true },
    { name: "order", required: false, dflt: "0" },
    { name: "createdAt", required: true },
  ],
};

const REQUIRED_TABLES = Object.keys(BASELINE_COLUMNS);

/**
 * Returns list of user tables in the SQLite database.
 */
function getDatabaseTables(db) {
  const rows = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%'"
    )
    .all();
  return rows.map((r) => r.name);
}

/**
 * Inspects columns of a given table via PRAGMA table_info.
 */
function inspectTableColumns(db, tableName) {
  try {
    const rows = db.prepare(`PRAGMA table_info("${tableName}")`).all();
    return rows.map((r) => ({
      cid: r.cid,
      name: r.name,
      type: (r.type || "").toUpperCase(),
      notnull: Boolean(r.notnull),
      dflt_value: r.dflt_value,
      pk: Boolean(r.pk),
    }));
  } catch {
    return [];
  }
}

/**
 * Inspects indexes on a table via PRAGMA index_list and PRAGMA index_info.
 */
function inspectTableIndexes(db, tableName) {
  try {
    const rows = db.prepare(`PRAGMA index_list("${tableName}")`).all();
    return rows.map((idx) => {
      let cols = [];
      try {
        const info = db.prepare(`PRAGMA index_info("${idx.name}")`).all();
        cols = info.map((c) => c.name);
      } catch {}
      return {
        name: idx.name,
        unique: Boolean(idx.unique),
        origin: idx.origin,
        columns: cols,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Inspects foreign keys on a table via PRAGMA foreign_key_list.
 */
function inspectTableForeignKeys(db, tableName) {
  try {
    const rows = db.prepare(`PRAGMA foreign_key_list("${tableName}")`).all();
    return rows.map((fk) => ({
      id: fk.id,
      table: fk.table,
      from: fk.from,
      to: fk.to,
      on_update: fk.on_update,
      on_delete: fk.on_delete,
    }));
  } catch {
    return [];
  }
}

/**
 * Full structural inspection of an SQLite database.
 */
function inspectDatabaseSchema(db) {
  const tableNames = getDatabaseTables(db);
  const tables = {};

  for (const name of tableNames) {
    tables[name] = {
      name,
      columns: inspectTableColumns(db, name),
      indexes: inspectTableIndexes(db, name),
      foreignKeys: inspectTableForeignKeys(db, name),
    };
  }

  return {
    isFresh: tableNames.length === 0,
    tableCount: tableNames.length,
    tableNames,
    tables,
  };
}

/**
 * Verifies whether an existing database with PRAGMA user_version = 0
 * is compatible with the baseline schema or is a supported legacy variant.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {{
 *   type: 'FRESH' | 'EXACT_BASELINE' | 'SUPPORTED_LEGACY' | 'UNSUPPORTED',
 *   isCompatible: boolean,
 *   missingTables: string[],
 *   missingRequiredColumns: Record<string, string[]>,
 *   missingOptionalColumns: Record<string, string[]>,
 *   reasons: string[]
 * }}
 */
function validateLegacySchema(db) {
  const schema = inspectDatabaseSchema(db);

  if (schema.isFresh) {
    return {
      type: "FRESH",
      isCompatible: true,
      missingTables: [],
      missingRequiredColumns: {},
      missingOptionalColumns: {},
      reasons: [],
    };
  }

  const existingTables = new Set(schema.tableNames);
  const missingTables = REQUIRED_TABLES.filter((t) => !existingTables.has(t));
  const missingRequiredColumns = {};
  const missingOptionalColumns = {};
  const reasons = [];

  if (missingTables.length > 0) {
    reasons.push(`Missing required tables: ${missingTables.join(", ")}`);
  }

  for (const tableName of REQUIRED_TABLES) {
    if (!existingTables.has(tableName)) continue;

    const existingCols = new Set(schema.tables[tableName].columns.map((c) => c.name));
    const baselineCols = BASELINE_COLUMNS[tableName];

    const missingReq = baselineCols
      .filter((c) => c.required && !existingCols.has(c.name))
      .map((c) => c.name);

    const missingOpt = baselineCols
      .filter((c) => !c.required && !existingCols.has(c.name))
      .map((c) => c.name);

    if (missingReq.length > 0) {
      missingRequiredColumns[tableName] = missingReq;
      reasons.push(`Table '${tableName}' is missing required columns: ${missingReq.join(", ")}`);
    }

    if (missingOpt.length > 0) {
      missingOptionalColumns[tableName] = missingOpt;
    }
  }

  const hasMissingTables = missingTables.length > 0;
  const hasMissingRequired = Object.keys(missingRequiredColumns).length > 0;
  const hasMissingOptional = Object.keys(missingOptionalColumns).length > 0;

  // Exact baseline match
  if (!hasMissingTables && !hasMissingRequired && !hasMissingOptional) {
    return {
      type: "EXACT_BASELINE",
      isCompatible: true,
      missingTables: [],
      missingRequiredColumns: {},
      missingOptionalColumns: {},
      reasons: [],
    };
  }

  // Supported legacy: has all 4 core tables and all required columns, but missing known optional/defaulted columns
  if (!hasMissingTables && !hasMissingRequired && hasMissingOptional) {
    return {
      type: "SUPPORTED_LEGACY",
      isCompatible: true,
      missingTables: [],
      missingRequiredColumns: {},
      missingOptionalColumns,
      reasons: [
        `Supported legacy schema detected: missing non-breaking columns (${Object.entries(missingOptionalColumns)
          .map(([t, cols]) => `${t}: [${cols.join(", ")}]`)
          .join("; ")})`,
      ],
    };
  }

  // Unsupported schema
  return {
    type: "UNSUPPORTED",
    isCompatible: false,
    missingTables,
    missingRequiredColumns,
    missingOptionalColumns,
    reasons,
  };
}

/**
 * Upgrades a supported legacy database to the exact v1 baseline schema
 * by adding missing optional/defaulted columns without data loss.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {Record<string, string[]>} missingOptionalColumns
 * @param {Function} [logger=console.log]
 */
function upgradeSupportedLegacySchema(db, missingOptionalColumns, logger = console.log) {
  const COLUMN_DDL = {
    User: {
      passwordHash: 'ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT',
      image: 'ALTER TABLE "User" ADD COLUMN "image" TEXT',
      name: 'ALTER TABLE "User" ADD COLUMN "name" TEXT',
    },
    UserMedia: {
      status: 'ALTER TABLE "UserMedia" ADD COLUMN "status" TEXT NOT NULL DEFAULT \'plan_to_consume\'',
      rating: 'ALTER TABLE "UserMedia" ADD COLUMN "rating" REAL',
      review: 'ALTER TABLE "UserMedia" ADD COLUMN "review" TEXT',
      isFavorite: 'ALTER TABLE "UserMedia" ADD COLUMN "isFavorite" BOOLEAN NOT NULL DEFAULT false',
      totalEpisodes: 'ALTER TABLE "UserMedia" ADD COLUMN "totalEpisodes" INTEGER',
      watchedEpisodes: 'ALTER TABLE "UserMedia" ADD COLUMN "watchedEpisodes" INTEGER',
      totalChapters: 'ALTER TABLE "UserMedia" ADD COLUMN "totalChapters" INTEGER',
      readChapters: 'ALTER TABLE "UserMedia" ADD COLUMN "readChapters" INTEGER',
      hoursPlayed: 'ALTER TABLE "UserMedia" ADD COLUMN "hoursPlayed" REAL',
      startDate: 'ALTER TABLE "UserMedia" ADD COLUMN "startDate" DATETIME',
      endDate: 'ALTER TABLE "UserMedia" ADD COLUMN "endDate" DATETIME',
      tags: 'ALTER TABLE "UserMedia" ADD COLUMN "tags" TEXT',
      genres: 'ALTER TABLE "UserMedia" ADD COLUMN "genres" TEXT',
      overview: 'ALTER TABLE "UserMedia" ADD COLUMN "overview" TEXT',
      posterUrl: 'ALTER TABLE "UserMedia" ADD COLUMN "posterUrl" TEXT',
      year: 'ALTER TABLE "UserMedia" ADD COLUMN "year" INTEGER',
      externalId: 'ALTER TABLE "UserMedia" ADD COLUMN "externalId" TEXT',
      externalSource: 'ALTER TABLE "UserMedia" ADD COLUMN "externalSource" TEXT',
    },
    Collection: {
      description: 'ALTER TABLE "Collection" ADD COLUMN "description" TEXT',
      coverUrl: 'ALTER TABLE "Collection" ADD COLUMN "coverUrl" TEXT',
    },
    CollectionItem: {
      order: 'ALTER TABLE "CollectionItem" ADD COLUMN "order" INTEGER NOT NULL DEFAULT 0',
    },
  };

  for (const [table, cols] of Object.entries(missingOptionalColumns)) {
    for (const col of cols) {
      const sql = COLUMN_DDL[table]?.[col];
      if (sql) {
        logger(`[MLocker Baseline] Adding legacy column ${table}.${col}...`);
        db.exec(sql);
      } else {
        throw new SchemaValidationError(
          `Cannot safely upgrade legacy table '${table}': no safe DDL defined for column '${col}'.`
        );
      }
    }
  }

  // Ensure baseline indexes exist
  const INDEX_DDL = [
    'CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email")',
    'CREATE INDEX IF NOT EXISTS "UserMedia_userId_mediaType_idx" ON "UserMedia"("userId", "mediaType")',
    'CREATE INDEX IF NOT EXISTS "UserMedia_userId_status_idx" ON "UserMedia"("userId", "status")',
    'CREATE UNIQUE INDEX IF NOT EXISTS "UserMedia_userId_mediaType_externalId_key" ON "UserMedia"("userId", "mediaType", "externalId")',
    'CREATE INDEX IF NOT EXISTS "Collection_userId_idx" ON "Collection"("userId")',
    'CREATE UNIQUE INDEX IF NOT EXISTS "CollectionItem_collectionId_userMediaId_key" ON "CollectionItem"("collectionId", "userMediaId")',
  ];

  for (const idxSql of INDEX_DDL) {
    db.exec(idxSql);
  }
}

module.exports = {
  SchemaValidationError,
  BASELINE_COLUMNS,
  REQUIRED_TABLES,
  getDatabaseTables,
  inspectTableColumns,
  inspectTableIndexes,
  inspectTableForeignKeys,
  inspectDatabaseSchema,
  validateLegacySchema,
  upgradeSupportedLegacySchema,
};
