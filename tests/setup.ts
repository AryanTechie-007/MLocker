import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { afterAll } from "vitest";

let DatabaseSync: any = null;
try {
  DatabaseSync = require("node:sqlite").DatabaseSync;
} catch {}

// Generate an isolated temporary directory for this test process/worker
const workerId = process.env.VITEST_POOL_ID || process.pid;
const tempTestDir = fs.mkdtempSync(
  path.join(os.tmpdir(), `mlocker-vitest-${workerId}-${Date.now()}-`)
);
const isolatedDbPath = path.join(tempTestDir, "test.db");
const isolatedDbUrl = `file:${isolatedDbPath.replace(/\\/g, "/")}`;

// Point DATABASE_URL strictly to the isolated database before any modules load
process.env.DATABASE_URL = isolatedDbUrl;

// Pre-provision the isolated database with the canonical baseline schema
if (DatabaseSync) {
  try {
    const db = new DatabaseSync(isolatedDbPath);
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");

    const migration1Path = path.resolve(
      __dirname,
      "../prisma/migrations/20261119000000_init/migration.sql"
    );
    const sql1 = fs.readFileSync(migration1Path, "utf8");
    db.exec(sql1);

    const migration2Path = path.resolve(
      __dirname,
      "../prisma/migrations/20261120000000_media_source/migration.sql"
    );
    if (fs.existsSync(migration2Path)) {
      const sql2 = fs.readFileSync(migration2Path, "utf8");
      db.exec(sql2);
      db.exec("PRAGMA user_version = 2");
    } else {
      db.exec("PRAGMA user_version = 1");
    }

    const migration3Path = path.resolve(
      __dirname,
      "../prisma/migrations/20261121000000_session_engine/migration.sql"
    );
    if (fs.existsSync(migration3Path)) {
      const sql3 = fs.readFileSync(migration3Path, "utf8");
      db.exec(sql3);
      db.exec("PRAGMA user_version = 3");
    }
    db.close();
  } catch (err: any) {
    console.error("[Test Setup] Failed initializing isolated test database:", err.message);
  }
}

// Cleanup after all tests in this worker finish
afterAll(async () => {
  const globalPrisma = (globalThis as any).prisma;
  if (globalPrisma && typeof globalPrisma.$disconnect === "function") {
    try {
      await globalPrisma.$disconnect();
    } catch {}
  }

  try {
    if (fs.existsSync(tempTestDir)) {
      fs.rmSync(tempTestDir, { recursive: true, force: true });
    }
  } catch {}
});

// Guard against abrupt exits
process.on("exit", () => {
  try {
    if (fs.existsSync(tempTestDir)) {
      fs.rmSync(tempTestDir, { recursive: true, force: true });
    }
  } catch {}
});
