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
    { name: "id", type: "TEXT", notnull: true, pk: true, required: true },
    { name: "name", type: "TEXT", notnull: false, pk: false, required: false },
    { name: "email", type: "TEXT", notnull: true, pk: false, required: true },
    { name: "passwordHash", type: "TEXT", notnull: false, pk: false, required: false },
    { name: "image", type: "TEXT", notnull: false, pk: false, required: false },
    { name: "createdAt", type: "DATETIME", notnull: true, pk: false, required: true },
  ],
  UserMedia: [
    { name: "id", type: "TEXT", notnull: true, pk: true, required: true },
    { name: "userId", type: "TEXT", notnull: true, pk: false, required: true },
    { name: "mediaType", type: "TEXT", notnull: true, pk: false, required: true },
    { name: "externalId", type: "TEXT", notnull: false, pk: false, required: false },
    { name: "externalSource", type: "TEXT", notnull: false, pk: false, required: false },
    { name: "title", type: "TEXT", notnull: true, pk: false, required: true },
    { name: "posterUrl", type: "TEXT", notnull: false, pk: false, required: false },
    { name: "year", type: "INTEGER", notnull: false, pk: false, required: false },
    { name: "genres", type: "TEXT", notnull: false, pk: false, required: false },
    { name: "overview", type: "TEXT", notnull: false, pk: false, required: false },
    { name: "status", type: "TEXT", notnull: true, pk: false, required: false, dflt: "'plan_to_consume'" },
    { name: "rating", type: "REAL", notnull: false, pk: false, required: false },
    { name: "review", type: "TEXT", notnull: false, pk: false, required: false },
    { name: "isFavorite", type: "BOOLEAN", notnull: true, pk: false, required: false, dflt: "0" },
    { name: "totalEpisodes", type: "INTEGER", notnull: false, pk: false, required: false },
    { name: "watchedEpisodes", type: "INTEGER", notnull: false, pk: false, required: false },
    { name: "totalChapters", type: "INTEGER", notnull: false, pk: false, required: false },
    { name: "readChapters", type: "INTEGER", notnull: false, pk: false, required: false },
    { name: "hoursPlayed", type: "REAL", notnull: false, pk: false, required: false },
    { name: "startDate", type: "DATETIME", notnull: false, pk: false, required: false },
    { name: "endDate", type: "DATETIME", notnull: false, pk: false, required: false },
    { name: "tags", type: "TEXT", notnull: false, pk: false, required: false },
    { name: "createdAt", type: "DATETIME", notnull: true, pk: false, required: true },
    { name: "updatedAt", type: "DATETIME", notnull: true, pk: false, required: true },
  ],
  Collection: [
    { name: "id", type: "TEXT", notnull: true, pk: true, required: true },
    { name: "userId", type: "TEXT", notnull: true, pk: false, required: true },
    { name: "name", type: "TEXT", notnull: true, pk: false, required: true },
    { name: "description", type: "TEXT", notnull: false, pk: false, required: false },
    { name: "coverUrl", type: "TEXT", notnull: false, pk: false, required: false },
    { name: "createdAt", type: "DATETIME", notnull: true, pk: false, required: true },
    { name: "updatedAt", type: "DATETIME", notnull: true, pk: false, required: true },
  ],
  CollectionItem: [
    { name: "id", type: "TEXT", notnull: true, pk: true, required: true },
    { name: "collectionId", type: "TEXT", notnull: true, pk: false, required: true },
    { name: "userMediaId", type: "TEXT", notnull: true, pk: false, required: true },
    { name: "order", type: "INTEGER", notnull: true, pk: false, required: false, dflt: "0" },
    { name: "createdAt", type: "DATETIME", notnull: true, pk: false, required: true },
  ],
};

const REQUIRED_TABLES = Object.keys(BASELINE_COLUMNS);

/**
 * Expected foreign key relationships in baseline v1.
 */
const BASELINE_FOREIGN_KEYS = {
  User: [],
  UserMedia: [
    {
      table: "User",
      from: "userId",
      to: "id",
      on_delete: "CASCADE",
      on_update: "CASCADE",
    },
  ],
  Collection: [
    {
      table: "User",
      from: "userId",
      to: "id",
      on_delete: "CASCADE",
      on_update: "CASCADE",
    },
  ],
  CollectionItem: [
    {
      table: "Collection",
      from: "collectionId",
      to: "id",
      on_delete: "CASCADE",
      on_update: "CASCADE",
    },
    {
      table: "UserMedia",
      from: "userMediaId",
      to: "id",
      on_delete: "CASCADE",
      on_update: "CASCADE",
    },
  ],
};

/**
 * Expected indexes in baseline v1.
 */
const BASELINE_INDEXES = {
  User: [
    { name: "User_email_key", unique: true, columns: ["email"] },
  ],
  UserMedia: [
    { name: "UserMedia_userId_mediaType_idx", unique: false, columns: ["userId", "mediaType"] },
    { name: "UserMedia_userId_status_idx", unique: false, columns: ["userId", "status"] },
    { name: "UserMedia_userId_mediaType_externalId_key", unique: true, columns: ["userId", "mediaType", "externalId"] },
  ],
  Collection: [
    { name: "Collection_userId_idx", unique: false, columns: ["userId"] },
  ],
  CollectionItem: [
    { name: "CollectionItem_collectionId_userMediaId_key", unique: true, columns: ["collectionId", "userMediaId"] },
  ],
};

/**
 * Normalizes SQLite column type for comparison.
 */
function normalizeType(type) {
  const t = (type || "").toUpperCase().trim();
  if (t === "INT" || t === "INTEGER") return "INTEGER";
  if (t === "REAL" || t === "FLOAT" || t === "DOUBLE" || t === "NUMERIC") return "REAL";
  if (t === "TEXT" || t === "VARCHAR" || t.startsWith("VARCHAR")) return "TEXT";
  if (t === "DATETIME" || t === "TIMESTAMP") return "DATETIME";
  if (t === "BOOLEAN") return "BOOLEAN";
  return t;
}

/**
 * Normalizes an SQLite default value expression for semantic equivalence comparison.
 *
 * Handles:
 * - Stripping outer parentheses: e.g. `(0)` -> `0`, `('plan_to_consume')` -> `'plan_to_consume'`
 * - Trimming whitespace
 * - Stripping outer single or double quotes for string literals
 * - Boolean / integer equivalence: `false`, `'false'`, `0`, `'0'` -> `0`; `true`, `'true'`, `1`, `'1'` -> `1`
 * - Timestamp expressions: `CURRENT_TIMESTAMP`, `datetime('now')`, etc.
 *
 * @param {any} val
 * @returns {string | null}
 */
function normalizeDefaultValue(val) {
  if (val === null || val === undefined) return null;
  let str = String(val).trim();

  // Strip wrapping parentheses: e.g. ((0)) -> 0, ('plan_to_consume') -> 'plan_to_consume'
  while (str.startsWith("(") && str.endsWith(")") && str.length >= 2) {
    str = str.slice(1, -1).trim();
  }

  // Boolean / integer equivalence for boolean flags
  const lower = str.toLowerCase();
  if (
    lower === "false" ||
    lower === "'false'" ||
    lower === '"false"' ||
    lower === "0" ||
    lower === "'0'"
  ) {
    return "0";
  }
  if (
    lower === "true" ||
    lower === "'true'" ||
    lower === '"true"' ||
    lower === "1" ||
    lower === "'1'"
  ) {
    return "1";
  }

  // Timestamp equivalence
  const upper = str.toUpperCase();
  if (
    upper === "CURRENT_TIMESTAMP" ||
    upper === "'CURRENT_TIMESTAMP'" ||
    upper === "DATETIME('NOW')" ||
    upper === "DATETIME('NOW','LOCALTIME')"
  ) {
    return "CURRENT_TIMESTAMP";
  }

  // String literal: strip outer single/double quotes
  if (
    (str.startsWith("'") && str.endsWith("'") && str.length >= 2) ||
    (str.startsWith('"') && str.endsWith('"') && str.length >= 2)
  ) {
    return str.slice(1, -1);
  }

  return str;
}

/**
 * Checks whether the actual SQLite default is equivalent to the expected default.
 *
 * @param {any} expected
 * @param {any} actual
 * @returns {boolean}
 */
function areDefaultsEquivalent(expected, actual) {
  if (expected === undefined) return true;
  if (actual === null || actual === undefined) return false;
  return normalizeDefaultValue(expected) === normalizeDefaultValue(actual);
}

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
      type: normalizeType(r.type),
      rawType: (r.type || "").toUpperCase(),
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
      on_update: (fk.on_update || "").toUpperCase(),
      on_delete: (fk.on_delete || "").toUpperCase(),
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
 * Checks:
 * 1. Table presence.
 * 2. Column presence, types, nullability, and primary key definitions.
 * 3. Foreign-key relationships (target table, columns, and CASCADE rules).
 * 4. Required unique constraints and performance indexes.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {{
 *   type: 'FRESH' | 'EXACT_BASELINE' | 'SUPPORTED_LEGACY' | 'UNSUPPORTED',
 *   isCompatible: boolean,
 *   missingTables: string[],
 *   missingRequiredColumns: Record<string, string[]>,
 *   missingOptionalColumns: Record<string, string[]>,
 *   incompatibleColumns: Record<string, string[]>,
 *   missingForeignKeys: Record<string, string[]>,
 *   missingUniqueIndexes: Record<string, string[]>,
 *   missingIndexes: Record<string, string[]>,
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
      incompatibleColumns: {},
      missingForeignKeys: {},
      missingUniqueIndexes: {},
      missingIndexes: {},
      reasons: [],
    };
  }

  const existingTables = new Set(schema.tableNames);
  const missingTables = REQUIRED_TABLES.filter((t) => !existingTables.has(t));
  const missingRequiredColumns = {};
  const missingOptionalColumns = {};
  const incompatibleColumns = {};
  const missingForeignKeys = {};
  const missingUniqueIndexes = {};
  const missingIndexes = {};
  const reasons = [];

  if (missingTables.length > 0) {
    reasons.push(`Missing required tables: ${missingTables.join(", ")}`);
  }

  for (const tableName of REQUIRED_TABLES) {
    if (!existingTables.has(tableName)) continue;

    const inspectedTable = schema.tables[tableName];
    const existingColsMap = new Map(inspectedTable.columns.map((c) => [c.name, c]));
    const baselineCols = BASELINE_COLUMNS[tableName];

    // Check column presence, nullability, primary key, and type
    for (const bCol of baselineCols) {
      const eCol = existingColsMap.get(bCol.name);

      if (!eCol) {
        if (bCol.required) {
          if (!missingRequiredColumns[tableName]) missingRequiredColumns[tableName] = [];
          missingRequiredColumns[tableName].push(bCol.name);
          reasons.push(`Table '${tableName}' is missing required column: ${bCol.name}`);
        } else {
          if (!missingOptionalColumns[tableName]) missingOptionalColumns[tableName] = [];
          missingOptionalColumns[tableName].push(bCol.name);
        }
        continue;
      }

      // Verify Primary Key definition
      if (bCol.pk && !eCol.pk) {
        if (!incompatibleColumns[tableName]) incompatibleColumns[tableName] = [];
        incompatibleColumns[tableName].push(`${bCol.name} (must be PRIMARY KEY)`);
        reasons.push(`Column '${tableName}.${bCol.name}' must be PRIMARY KEY`);
      } else if (!bCol.pk && eCol.pk) {
        if (!incompatibleColumns[tableName]) incompatibleColumns[tableName] = [];
        incompatibleColumns[tableName].push(`${bCol.name} (must not be PRIMARY KEY)`);
        reasons.push(`Column '${tableName}.${bCol.name}' must not be PRIMARY KEY`);
      }

      // Verify Nullability for every existing column (both required and optional)
      if (bCol.notnull && !eCol.notnull) {
        if (!incompatibleColumns[tableName]) incompatibleColumns[tableName] = [];
        incompatibleColumns[tableName].push(`${bCol.name} (must be NOT NULL)`);
        reasons.push(`Column '${tableName}.${bCol.name}' must be NOT NULL`);
      } else if (!bCol.notnull && eCol.notnull) {
        if (!incompatibleColumns[tableName]) incompatibleColumns[tableName] = [];
        incompatibleColumns[tableName].push(`${bCol.name} (must be nullable)`);
        reasons.push(`Column '${tableName}.${bCol.name}' must be nullable (cannot be NOT NULL)`);
      }

      // Verify Default value wherever a default is specified in baseline
      if (bCol.dflt !== undefined) {
        if (!areDefaultsEquivalent(bCol.dflt, eCol.dflt_value)) {
          if (!incompatibleColumns[tableName]) incompatibleColumns[tableName] = [];
          const actualDesc = eCol.dflt_value === null ? "no default" : eCol.dflt_value;
          incompatibleColumns[tableName].push(
            `${bCol.name} (expected default ${bCol.dflt}, got ${actualDesc})`
          );
          reasons.push(
            `Column '${tableName}.${bCol.name}' default mismatch: expected ${bCol.dflt}, got ${actualDesc}`
          );
        }
      }

      // Verify compatible type
      const normalizedExpected = normalizeType(bCol.type);
      if (eCol.type !== normalizedExpected && !(normalizedExpected === "BOOLEAN" && eCol.type === "INTEGER")) {
        if (!incompatibleColumns[tableName]) incompatibleColumns[tableName] = [];
        incompatibleColumns[tableName].push(`${bCol.name} (expected ${normalizedExpected}, got ${eCol.type})`);
        reasons.push(`Column '${tableName}.${bCol.name}' has incompatible type: expected ${normalizedExpected}, got ${eCol.type}`);
      }
    }

    // Verify Foreign Key relationships
    const expectedFks = BASELINE_FOREIGN_KEYS[tableName] || [];
    const actualFks = inspectedTable.foreignKeys || [];

    for (const expFk of expectedFks) {
      const match = actualFks.find(
        (afk) =>
          afk.table === expFk.table &&
          afk.from === expFk.from &&
          afk.to === expFk.to &&
          afk.on_delete === expFk.on_delete &&
          afk.on_update === expFk.on_update
      );

      if (!match) {
        if (!missingForeignKeys[tableName]) missingForeignKeys[tableName] = [];
        const desc = `FOREIGN KEY (${expFk.from}) REFERENCES ${expFk.table}(${expFk.to}) ON DELETE ${expFk.on_delete} ON UPDATE ${expFk.on_update}`;
        missingForeignKeys[tableName].push(desc);
        reasons.push(`Table '${tableName}' missing foreign key: ${desc}`);
      }
    }

    // Verify Indexes and Uniqueness constraints
    const expectedIdxs = BASELINE_INDEXES[tableName] || [];
    const actualIdxs = inspectedTable.indexes || [];

    for (const expIdx of expectedIdxs) {
      const match = actualIdxs.find((aIdx) => {
        if (expIdx.unique && !aIdx.unique) return false;
        if (aIdx.columns.length !== expIdx.columns.length) return false;
        return expIdx.columns.every((c, i) => aIdx.columns[i] === c);
      });

      if (!match) {
        const desc = `${expIdx.unique ? "UNIQUE " : ""}INDEX on (${expIdx.columns.join(", ")})`;
        const allColsExist = expIdx.columns.every((c) => existingColsMap.has(c));
        if (expIdx.unique) {
          if (allColsExist) {
            // A unique constraint is missing on existing columns! Relational uniqueness violated.
            if (!missingUniqueIndexes[tableName]) missingUniqueIndexes[tableName] = [];
            missingUniqueIndexes[tableName].push(desc);
            reasons.push(`Table '${tableName}' missing required unique constraint: ${desc}`);
          } else {
            // Index depends on an optional column that will be added during upgrade
            if (!missingIndexes[tableName]) missingIndexes[tableName] = [];
            missingIndexes[tableName].push(desc);
            reasons.push(`Table '${tableName}' missing index (depends on legacy column): ${desc}`);
          }
        } else {
          if (!missingIndexes[tableName]) missingIndexes[tableName] = [];
          missingIndexes[tableName].push(desc);
          reasons.push(`Table '${tableName}' missing performance index: ${desc}`);
        }
      }
    }
  }

  const hasMissingTables = missingTables.length > 0;
  const hasMissingRequired = Object.keys(missingRequiredColumns).length > 0;
  const hasMissingOptional = Object.keys(missingOptionalColumns).length > 0;
  const hasIncompatible = Object.keys(incompatibleColumns).length > 0;
  const hasMissingFk = Object.keys(missingForeignKeys).length > 0;
  const hasMissingUniqueIdx = Object.keys(missingUniqueIndexes).length > 0;
  const hasMissingNonUniqueIdx = Object.keys(missingIndexes).length > 0;

  // Exact baseline: all tables, columns, constraints, foreign keys, and indexes match
  if (
    !hasMissingTables &&
    !hasMissingRequired &&
    !hasMissingOptional &&
    !hasIncompatible &&
    !hasMissingFk &&
    !hasMissingUniqueIdx &&
    !hasMissingNonUniqueIdx
  ) {
    return {
      type: "EXACT_BASELINE",
      isCompatible: true,
      missingTables: [],
      missingRequiredColumns: {},
      missingOptionalColumns: {},
      incompatibleColumns: {},
      missingForeignKeys: {},
      missingUniqueIndexes: {},
      missingIndexes: {},
      reasons: [],
    };
  }

  // Supported legacy:
  // - All 4 core tables exist.
  // - No missing required columns, no incompatible column types or PK definitions.
  // - Required foreign key relationships exist.
  // - Required UNIQUE constraints exist on all existing columns.
  // - Only missing optional columns or optional non-unique indexes that upgradeSupportedLegacySchema can safely add.
  if (
    !hasMissingTables &&
    !hasMissingRequired &&
    !hasIncompatible &&
    !hasMissingFk &&
    !hasMissingUniqueIdx &&
    (hasMissingOptional || hasMissingNonUniqueIdx)
  ) {
    return {
      type: "SUPPORTED_LEGACY",
      isCompatible: true,
      missingTables: [],
      missingRequiredColumns: {},
      missingOptionalColumns,
      incompatibleColumns: {},
      missingForeignKeys: {},
      missingUniqueIndexes: {},
      missingIndexes,
      reasons: [
        `Supported legacy schema detected: missing non-breaking columns (${Object.entries(missingOptionalColumns)
          .map(([t, cols]) => `${t}: [${cols.join(", ")}]`)
          .join("; ")})`,
      ],
    };
  }

  // Unsupported schema: missing tables, missing required columns, incompatible PKs/types, missing FKs, or missing unique constraints
  return {
    type: "UNSUPPORTED",
    isCompatible: false,
    missingTables,
    missingRequiredColumns,
    missingOptionalColumns,
    incompatibleColumns,
    missingForeignKeys,
    missingUniqueIndexes,
    missingIndexes,
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

  // Ensure all baseline indexes exist
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
  BASELINE_FOREIGN_KEYS,
  BASELINE_INDEXES,
  getDatabaseTables,
  inspectTableColumns,
  inspectTableIndexes,
  inspectTableForeignKeys,
  inspectDatabaseSchema,
  validateLegacySchema,
  upgradeSupportedLegacySchema,
  normalizeDefaultValue,
  areDefaultsEquivalent,
};
