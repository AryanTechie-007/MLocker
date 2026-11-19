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

    const migrationPath = path.resolve(
      __dirname,
      "../prisma/migrations/20261119000000_init/migration.sql"
    );
    const sql = fs.readFileSync(migrationPath, "utf8");
    db.exec(sql);
    db.exec("PRAGMA user_version = 1");
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
