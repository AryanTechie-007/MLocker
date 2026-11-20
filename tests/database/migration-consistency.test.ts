import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import crypto from "crypto";

let DatabaseSync: any = null;
try {
  DatabaseSync = require("node:sqlite").DatabaseSync;
} catch {}

import {
  MIGRATIONS,
  INIT_MIGRATION_SQL,
  INIT_MIGRATION_CHECKSUM,
  resolveMigrationSql,
  getMigrationChecksum,
} from "../../electron/database/migrations";
import { recordPrismaMigration } from "../../electron/database/migrator";
import { inspectDatabaseSchema } from "../../electron/database/schema-validator";

describe("Milestone 2.1 — Single-Source Migration Consistency Suite", () => {
  const prismaMigrationPath = path.resolve(
    __dirname,
    "../../prisma/migrations/20261119000000_init/migration.sql"
  );

  // 1. Single source of truth verification
  it("loads the exact canonical migration SQL from prisma/migrations/20261119000000_init/migration.sql", () => {
    expect(fs.existsSync(prismaMigrationPath)).toBe(true);
    const rawPrismaSql = fs.readFileSync(prismaMigrationPath, "utf8").replace(/\r\n/g, "\n");
    const resolvedSql = resolveMigrationSql("20261119000000_init");

    expect(resolvedSql).toBe(rawPrismaSql);
    expect(INIT_MIGRATION_SQL).toBe(rawPrismaSql);
  });

  // 2. Checksum accuracy (no fabricated hashes)
  it("computes authentic SHA-256 checksum matching Prisma CLI format without fabrication", () => {
    const rawPrismaSql = fs.readFileSync(prismaMigrationPath, "utf8").replace(/\r\n/g, "\n");
    const expectedChecksum = crypto.createHash("sha256").update(rawPrismaSql).digest("hex");

    expect(INIT_MIGRATION_CHECKSUM).toBe(expectedChecksum);
    expect(MIGRATIONS[0].checksum).toBe(expectedChecksum);

    // Verify it is NOT the old fabricated hash of just the migration name string
    const fabricatedStringHash = crypto.createHash("sha256").update("20261119000000_init").digest("hex");
    expect(INIT_MIGRATION_CHECKSUM).not.toBe(fabricatedStringHash);
  });

  // 3. Schema structure parity: Column definitions, defaults, foreign keys, indexes, constraints
  it("creates identical schema between Prisma migration SQL and embedded migration registry", () => {
    const dbPrisma = new DatabaseSync(":memory:");
    const dbEmbedded = new DatabaseSync(":memory:");

    const rawPrismaSql = fs.readFileSync(prismaMigrationPath, "utf8");
    dbPrisma.exec(rawPrismaSql);
    dbEmbedded.exec(INIT_MIGRATION_SQL);

    const schemaPrisma = inspectDatabaseSchema(dbPrisma);
    const schemaEmbedded = inspectDatabaseSchema(dbEmbedded);

    // Verify table lists match
    expect(schemaEmbedded.tableNames.sort()).toEqual(schemaPrisma.tableNames.sort());

    for (const tableName of schemaPrisma.tableNames) {
      const pTable = (schemaPrisma.tables as Record<string, any>)[tableName];
      const eTable = (schemaEmbedded.tables as Record<string, any>)[tableName];

      // Columns match
      expect(eTable.columns).toEqual(pTable.columns);

      // Indexes match
      expect(eTable.indexes).toEqual(pTable.indexes);

      // Foreign keys match
      expect(eTable.foreignKeys).toEqual(pTable.foreignKeys);
    }

    dbPrisma.close();
    dbEmbedded.close();
  });

  // 4. Investigation of updatedAt defaults
  it("enforces identical updatedAt definitions without divergent SQL defaults", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(INIT_MIGRATION_SQL);

    // In Prisma schema, updatedAt has @updatedAt, which in SQLite DDL compiles to:
    // "updatedAt" DATETIME NOT NULL (without DEFAULT CURRENT_TIMESTAMP)
    const userMediaCols = db.prepare('PRAGMA table_info("UserMedia")').all() as any[];
    const updatedAtCol = userMediaCols.find((c) => c.name === "updatedAt");

    expect(updatedAtCol).toBeDefined();
    expect(updatedAtCol.notnull).toBe(1);
    // Verified: No divergent DEFAULT CURRENT_TIMESTAMP between Prisma and Electron definitions
    expect(updatedAtCol.dflt_value).toBeNull();

    const collectionCols = db.prepare('PRAGMA table_info("Collection")').all() as any[];
    const colUpdatedAt = collectionCols.find((c) => c.name === "updatedAt");
    expect(colUpdatedAt.notnull).toBe(1);
    expect(colUpdatedAt.dflt_value).toBeNull();

    db.close();
  });

  // 5. _prisma_migrations metadata compatibility
  it("records valid _prisma_migrations metadata matching Prisma CLI expectations", () => {
    const db = new DatabaseSync(":memory:");
    recordPrismaMigration(db, "20261119000000_init", INIT_MIGRATION_SQL);

    const row = db.prepare('SELECT * FROM "_prisma_migrations" WHERE migration_name = ?').get("20261119000000_init") as any;

    expect(row).toBeDefined();
    expect(row.migration_name).toBe("20261119000000_init");
    expect(row.checksum).toBe(INIT_MIGRATION_CHECKSUM);
    expect(row.applied_steps_count).toBe(1);
    expect(row.rolled_back_at).toBeNull();
    expect(typeof row.finished_at).toBe("number");

    db.close();
  });

  // 6. Milestone 4: MediaSource migration v2 consistency
  it("loads and verifies v2 MediaSource migration SQL and checksum matching Prisma CLI format", () => {
    const v2Path = path.resolve(
      __dirname,
      "../../prisma/migrations/20261120000000_media_source/migration.sql"
    );
    expect(fs.existsSync(v2Path)).toBe(true);

    const rawV2Sql = fs.readFileSync(v2Path, "utf8").replace(/\r\n/g, "\n");
    const resolvedV2Sql = resolveMigrationSql("20261120000000_media_source");

    expect(resolvedV2Sql).toBe(rawV2Sql);

    const expectedChecksum = crypto.createHash("sha256").update(rawV2Sql).digest("hex");
    expect(MIGRATIONS[1].checksum).toBe(expectedChecksum);
    expect(MIGRATIONS[1].version).toBe(2);
    expect(MIGRATIONS[1].name).toBe("20261120000000_media_source");

    // Verify applying v1 + v2 creates MediaSource table with expected columns and foreign keys
    const db = new DatabaseSync(":memory:");
    db.exec(INIT_MIGRATION_SQL);
    db.exec(resolvedV2Sql);

    const schema = inspectDatabaseSchema(db);
    expect(schema.tableNames).toContain("MediaSource");

    const mediaSourceTable = (schema.tables as Record<string, any>)["MediaSource"];
    expect(mediaSourceTable).toBeDefined();

    const colNames = mediaSourceTable.columns.map((c: any) => c.name);
    expect(colNames).toContain("id");
    expect(colNames).toContain("userMediaId");
    expect(colNames).toContain("name");
    expect(colNames).toContain("url");
    expect(colNames).toContain("normalizedDomain");
    expect(colNames).toContain("sourceType");
    expect(colNames).toContain("createdAt");
    expect(colNames).toContain("updatedAt");

    // Verify foreign key to UserMedia(id) ON DELETE CASCADE
    const fk = mediaSourceTable.foreignKeys.find((f: any) => f.table === "UserMedia");
    expect(fk).toBeDefined();
    expect(fk.from).toBe("userMediaId");
    expect(fk.to).toBe("id");
    expect(fk.on_delete).toBe("CASCADE");

    db.close();
  });
});
