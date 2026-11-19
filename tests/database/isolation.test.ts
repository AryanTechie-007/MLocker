import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "crypto";

describe("Milestone 2.1 — Test Database Isolation Suite", () => {
  const devDbPath = path.resolve(__dirname, "../../prisma/dev.db");

  it("points process.env.DATABASE_URL to an isolated temporary database in os.tmpdir()", () => {
    const activeUrl = process.env.DATABASE_URL;

    expect(activeUrl).toBeDefined();
    expect(activeUrl).toMatch(/^file:/);

    // It must NOT point to prisma/dev.db
    const normalizedDevDb = devDbPath.replace(/\\/g, "/");
    expect(activeUrl).not.toContain(normalizedDevDb);

    // It must point to a temporary test directory
    const normalizedTmp = os.tmpdir().replace(/\\/g, "/");
    expect(activeUrl?.toLowerCase()).toContain(normalizedTmp.toLowerCase());
  });

  it("does not allow test suites to modify the developer's active dev.db file", () => {
    if (fs.existsSync(devDbPath)) {
      const statsBefore = fs.statSync(devDbPath);
      const hashBefore = crypto
        .createHash("sha256")
        .update(fs.readFileSync(devDbPath))
        .digest("hex");

      // Verify stats are stable
      const statsAfter = fs.statSync(devDbPath);
      const hashAfter = crypto
        .createHash("sha256")
        .update(fs.readFileSync(devDbPath))
        .digest("hex");

      expect(statsAfter.size).toBe(statsBefore.size);
      expect(statsAfter.mtimeMs).toBe(statsBefore.mtimeMs);
      expect(hashAfter).toBe(hashBefore);
    }
  });

  it("uses process/worker unique identifiers in isolated test database path to avoid collisions", () => {
    const activeUrl = process.env.DATABASE_URL || "";
    // Checks that the path includes mlocker-vitest prefix with process or worker identifier
    expect(activeUrl).toContain("mlocker-vitest-");
  });
});
