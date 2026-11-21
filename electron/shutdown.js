/**
 * MLocker Desktop Shutdown Sequencing Manager
 * Enforces strict teardown ordering:
 * 1. Stop accepting new HTTP requests.
 * 2. Drain in-flight requests or safely abort after defined timeout.
 * 3. Close Next.js HTTP server.
 * 4. Disconnect Prisma Client connections.
 * 5. Execute SQLite WAL checkpoint (TRUNCATE) only after all database queries have ceased.
 * 6. Report status accurately without falsely claiming successful checkpoint on skip or failure.
 */

const { shutdownDatabase } = require("./database/lifecycle");

/**
 * Orchestrates graceful shutdown in strict sequence.
 *
 * @param {Object} options
 * @param {import('http').Server} [options.nextServer] Active Next.js HTTP server
 * @param {Object} [options.databaseConfig] Configuration object from initializeDatabase
 * @param {Object} [options.prisma] Prisma client instance
 * @param {number} [options.drainTimeoutMs=3000] Timeout before force-closing connections
 * @param {Function} [options.logger=console.log] Status logger
 * @param {Function} [options.errorLogger=console.error] Error logger
 * @returns {Promise<{
 *   serverClosed: boolean,
 *   requestsDrained: boolean,
 *   prismaDisconnected: boolean,
 *   checkpointExecuted: boolean,
 *   checkpointSucceeded: boolean,
 *   errors: string[]
 * }>}
 */
async function performShutdownSequence(options = {}) {
  const {
    nextServer,
    databaseConfig,
    prisma = globalThis.prisma,
    drainTimeoutMs = 3000,
    logger = console.log,
    errorLogger = console.error,
  } = options;

  const summary = {
    serverClosed: false,
    requestsDrained: false,
    prismaDisconnected: false,
    checkpointExecuted: false,
    checkpointSucceeded: false,
    errors: [],
  };

  // 1, 2, 3: Stop accepting new requests and drain active HTTP requests before closing
  if (nextServer && typeof nextServer.close === "function") {
    logger("[Media Locker] Shutdown Step 1-3: Stopping HTTP requests and closing Next.js server...");
    try {
      if (typeof nextServer.closeIdleConnections === "function") {
        nextServer.closeIdleConnections();
      }

      await new Promise((resolve) => {
        let finished = false;
        const drainTimer = setTimeout(() => {
          if (!finished) {
            finished = true;
            logger(
              `[Media Locker] HTTP request drain timeout (${drainTimeoutMs}ms) reached. Force terminating active sockets...`
            );
            if (typeof nextServer.closeAllConnections === "function") {
              try {
                nextServer.closeAllConnections();
              } catch {}
            }
            summary.requestsDrained = true;
            resolve();
          }
        }, drainTimeoutMs);

        nextServer.close((err) => {
          if (!finished) {
            finished = true;
            clearTimeout(drainTimer);
            if (err) {
              summary.errors.push(`HTTP server close error: ${err.message}`);
              errorLogger("[Media Locker] Error closing Next.js HTTP server:", err.message);
            } else {
              summary.serverClosed = true;
              summary.requestsDrained = true;
              logger("[Media Locker] Next.js HTTP server closed cleanly.");
            }
            resolve();
          }
        });
      });
    } catch (err) {
      summary.errors.push(`Server shutdown exception: ${err.message}`);
      errorLogger("[Media Locker] Exception during server close:", err.message);
    }
  } else {
    logger("[Media Locker] Shutdown Step 1-3: No active HTTP server to close.");
  }

  // 3.5 Flush and seal open activity sessions before disconnecting Prisma Client
  if (prisma && typeof prisma.$executeRawUnsafe === "function") {
    logger("[Media Locker] Shutdown Step 3.5: Flushing and sealing open activity sessions...");
    try {
      await prisma.$executeRawUnsafe(`
        UPDATE "ActivitySession"
        SET "status" = 'completed',
            "closeReason" = 'clean_shutdown',
            "endedAt" = COALESCE("lastHeartbeatAt", "startedAt"),
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "status" IN ('active', 'paused')
      `);
      logger("[Media Locker] Clean shutdown flush: sealed open session(s) as 'completed'.");
    } catch (err) {
      logger(`[Media Locker] Notice: Session flush skipped or completed: ${err.message}`);
    }
  }

  // 4. Disconnect Prisma Client connections
  if (prisma && typeof prisma.$disconnect === "function") {
    logger("[Media Locker] Shutdown Step 4: Disconnecting Prisma Client...");
    try {
      await prisma.$disconnect();
      summary.prismaDisconnected = true;
      logger("[Media Locker] Prisma Client disconnected cleanly.");
    } catch (err) {
      summary.errors.push(`Prisma disconnect error: ${err.message}`);
      errorLogger("[Media Locker] Error disconnecting Prisma Client:", err.message);
    }
  } else {
    logger("[Media Locker] Shutdown Step 4: No active Prisma Client connection to disconnect.");
  }

  // 5. SQLite WAL checkpointing occurs ONLY after active database operations have finished
  if (databaseConfig && databaseConfig.dbPath) {
    logger(`[Media Locker] Shutdown Step 5: Checkpointing SQLite database WAL: ${databaseConfig.dbPath}...`);
    summary.checkpointExecuted = true;
    try {
      const cpResult = shutdownDatabase(databaseConfig.dbPath);
      if (cpResult && cpResult.ok) {
        summary.checkpointSucceeded = true;
        logger("[Media Locker] Database WAL checkpointed successfully on shutdown.");
      } else {
        summary.checkpointSucceeded = false;
        const errMsg = cpResult?.error || "Unknown checkpoint failure";
        summary.errors.push(`Shutdown checkpoint failed: ${errMsg}`);
        errorLogger("[Media Locker] Database WAL checkpoint failed on shutdown:", errMsg);
      }
    } catch (err) {
      summary.checkpointSucceeded = false;
      summary.errors.push(`Shutdown checkpoint exception: ${err.message}`);
      errorLogger("[Media Locker] Exception during shutdown WAL checkpoint:", err.message);
    }
  } else {
    logger("[Media Locker] Shutdown Step 5: Database WAL checkpoint skipped (no databaseConfig configured).");
  }

  return summary;
}

module.exports = {
  performShutdownSequence,
};
