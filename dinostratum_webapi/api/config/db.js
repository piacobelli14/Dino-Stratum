const { Pool, Client } = require("pg");
const ConnectionManager = require("../workers/connectionManager");

require("dotenv").config();

if (!process.env.SUPABASE_URL) {
  throw new Error("SUPABASE_URL environment variable is not set.");
}

const APPLICATION_NAME = "dinostratum_api";

const STARTUP_MAX_RETRIES = 5;
const STARTUP_RETRY_DELAY_MS = 2000;
const MAX_QUERY_RETRIES = 2;
const RETRY_DELAY_MS = 500;

const SSL_CONFIG = {
  rejectUnauthorized: false,
};

const DIRECT_URL = process.env.SUPABASE_DIRECT_URL;

const pool = new Pool({
  connectionString: DIRECT_URL,
  ssl: SSL_CONFIG,
  family: 4,
  max: 4,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
  allowExitOnIdle: true,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  application_name: APPLICATION_NAME,
});

pool.on("error", (error) => {
  if (error.code === "57P01") {
    console.warn("Pool client terminated externally:", error.message);
    return;
  }
  if (error.code === "XX000") {
    console.warn("Pool client fatal error:", error.message);
    return;
  }
  if (
    error.code === "ETIMEDOUT" ||
    error.code === "ECONNRESET" ||
    error.code === "EPIPE" ||
    error.code === "ENETUNREACH" ||
    error.code === "EHOSTUNREACH"
  ) {
    console.warn("Pool client socket error:", error.code, error.message);
    return;
  }
  if (error.message && error.message.includes("Max client connections")) {
    console.warn("Pool client max connections reached:", error.message);
    return;
  }
  if (error.message && error.message.includes("handleDataRow")) {
    console.warn("Pool client stale query on terminated connection:", error.message);
    return;
  }
  console.error("Unexpected error on idle client:", error.message);
});

function _isRecoverableSocketError(err) {
  if (!err) return false;
  if (
    err.code === "57P01" ||
    err.code === "XX000" ||
    err.code === "ETIMEDOUT" ||
    err.code === "ECONNRESET" ||
    err.code === "EPIPE" ||
    err.code === "ENETUNREACH" ||
    err.code === "EHOSTUNREACH" ||
    err.code === "ENOTFOUND" ||
    err.code === "EAI_AGAIN"
  ) {
    return true;
  }
  if (err.message) {
    if (err.message.includes("Max client connections")) return true;
    if (err.message.includes("handleDataRow")) return true;
    if (err.message.includes("Connection terminated")) return true;
    if (err.message.includes("connection terminated")) return true;
    if (err.message.includes("timeout expired")) return true;
    if (err.message.includes("read ETIMEDOUT")) return true;
  }
  return false;
}

process.on("uncaughtException", (error) => {
  if (_isRecoverableSocketError(error)) {
    console.warn(
      "Recoverable socket error (uncaught):",
      error.code || "no-code",
      error.message
    );
    return;
  }
  console.error("Uncaught exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  if (_isRecoverableSocketError(reason)) {
    console.warn(
      "Recoverable socket error (unhandled rejection):",
      (reason && reason.code) || "no-code",
      (reason && reason.message) || reason
    );
    return;
  }
  console.error("Unhandled rejection:", reason);
  process.exit(1);
});

class PoolUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = "PoolUnavailableError";
    this.statusCode = 503;
  }
}

function _isConnectionError(error) {
  if (!error) return false;
  return _isRecoverableSocketError(error);
}

function _sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function purgeStaleConnections() {
  const protectedUsers = process.env.PROTECTED_DB_USERS
    ? process.env.PROTECTED_DB_USERS.split(",")
    : ["postgres"];

  console.log(`Startup: using direct connection to bypass Supavisor for purge.`);

  for (let attempt = 1; attempt <= STARTUP_MAX_RETRIES; attempt++) {
    const client = new Client({
      connectionString: DIRECT_URL,
      ssl: SSL_CONFIG,
      family: 4,
      connectionTimeoutMillis: 10000,
      application_name: `${APPLICATION_NAME}_startup`,
    });

    client.on("error", (err) => {
      console.warn(
        "Startup client socket error:",
        err.code || "no-code",
        err.message
      );
    });

    try {
      await client.connect();

      const protectedList = protectedUsers
        .map((_, i) => `$${i + 2}`)
        .join(", ");

      const countResult = await client.query(
        `SELECT COUNT(*) AS total
         FROM pg_stat_activity
         WHERE pid <> pg_backend_pid()
           AND application_name = $1`,
        [APPLICATION_NAME]
      );
      const staleCount = parseInt(countResult.rows[0]?.total || "0", 10);

      if (staleCount === 0) {
        console.log("Startup: no stale connections found.");
        await client.end();
        return;
      }

      console.log(`Startup: found ${staleCount} stale ${APPLICATION_NAME} connections, terminating...`);

      const terminateResult = await client.query(
        `WITH terminated AS (
           SELECT pg_terminate_backend(pid) AS success, pid
           FROM pg_stat_activity
           WHERE pid <> pg_backend_pid()
             AND usename NOT IN (${protectedList})
             AND application_name = $1
         )
         SELECT COUNT(*) FILTER (WHERE success) AS terminated_count
         FROM terminated`,
        [APPLICATION_NAME, ...protectedUsers]
      );

      const terminated = parseInt(
        terminateResult.rows[0]?.terminated_count || "0",
        10
      );
      console.log(`Startup: terminated ${terminated} stale connections.`);

      await client.end();
      await _sleep(500);
      return;
    } catch (error) {
      try {
        await client.end();
      } catch (_) {}

      if (attempt < STARTUP_MAX_RETRIES) {
        console.warn(
          `Startup: direct purge attempt ${attempt}/${STARTUP_MAX_RETRIES} failed (${error.message}), retrying in ${STARTUP_RETRY_DELAY_MS / 1000}s...`
        );
        await _sleep(STARTUP_RETRY_DELAY_MS);
      } else {
        console.error(
          `Startup: failed to purge after ${STARTUP_MAX_RETRIES} attempts: ${error.message}`
        );
        throw new Error(
          `Cannot establish direct database connection after ${STARTUP_MAX_RETRIES} attempts`
        );
      }
    }
  }
}

async function verifyPoolReady() {
  for (let attempt = 1; attempt <= 5; attempt++) {
    let client;
    try {
      client = await pool.connect();
      client.on("error", () => {});
      await client.query("SELECT 1 AS ready");
      client.release();
      console.log("Startup: pool connection verified.");
      return;
    } catch (error) {
      try {
        if (client) client.release(true);
      } catch (_) {}

      if (attempt < 5) {
        console.warn(
          `Startup: pool verify attempt ${attempt}/5 failed (${error.message}), retrying...`
        );
        await _sleep(1000);
      } else {
        throw new Error(
          `Pool failed readiness check after 5 attempts: ${error.message}`
        );
      }
    }
  }
}

async function startup() {
  console.log("Startup: purging stale connections...");
  await purgeStaleConnections();
  console.log("Startup: verifying pool readiness...");
  await verifyPoolReady();
  console.log("Startup: database ready.");
}

async function query(text, params) {
  let lastError;

  for (let attempt = 0; attempt <= MAX_QUERY_RETRIES; attempt++) {
    let client;
    try {
      client = await pool.connect();
    } catch (connErr) {
      lastError = connErr;
      if (_isConnectionError(connErr) && attempt < MAX_QUERY_RETRIES) {
        await _sleep(RETRY_DELAY_MS * (attempt + 1));
        continue;
      }
      throw new PoolUnavailableError(
        `Database connection unavailable: ${connErr.message}`
      );
    }

    try {
      client.on("error", () => {});
      const result = await client.query(text, params);
      return result;
    } catch (queryErr) {
      lastError = queryErr;
      if (_isConnectionError(queryErr) && attempt < MAX_QUERY_RETRIES) {
        await _sleep(RETRY_DELAY_MS * (attempt + 1));
        continue;
      }
      throw queryErr;
    } finally {
      try {
        client.release(true);
      } catch (_) {}
    }
  }

  throw new PoolUnavailableError(
    `Database unavailable after ${MAX_QUERY_RETRIES + 1} attempts: ${lastError?.message}`
  );
}

async function getClient() {
  let lastError;

  for (let attempt = 0; attempt <= MAX_QUERY_RETRIES; attempt++) {
    try {
      const client = await pool.connect();
      client.on("error", () => {});
      return client;
    } catch (connErr) {
      lastError = connErr;
      if (_isConnectionError(connErr) && attempt < MAX_QUERY_RETRIES) {
        await _sleep(RETRY_DELAY_MS * (attempt + 1));
        continue;
      }
    }
  }

  throw new PoolUnavailableError(
    `Database connection unavailable: ${lastError?.message}`
  );
}

const connectionManager = new ConnectionManager(pool, {
  connectionConfig: {
    connectionString: DIRECT_URL,
    ssl: SSL_CONFIG,
    family: 4,
    connectionTimeoutMillis: 10000,
  },
  cleanupIntervalMs: parseInt(process.env.CLEANUP_INTERVAL_MS, 10) || 5000,
  idleThresholdMs: parseInt(process.env.IDLE_THRESHOLD_MS, 10) || 15000,
  healthCheckIntervalMs:
    parseInt(process.env.HEALTH_CHECK_INTERVAL_MS, 10) || 15000,
  burstThreshold: 10,
  maxBackoffMs: parseInt(process.env.MAX_BACKOFF_MS, 10) || 60000,
  applicationName: APPLICATION_NAME,
});

connectionManager.on("started", (config) => {
  console.log("Connection manager started:", JSON.stringify(config));
});

connectionManager.on("stopped", (stats) => {
  console.log("Connection manager stopped:", JSON.stringify(stats));
});

connectionManager.on("burstDetected", (details) => {
  console.warn(
    `Burst detected: ${details.totalConnections} connections, triggering immediate cleanup`
  );
});

connectionManager.on("cleanupComplete", (result) => {
  if (result.terminated > 0) {
    console.log(
      `[${result.trigger}] Cleanup: ${result.terminated} idle connections terminated`
    );
  }
});

connectionManager.on("cleanupError", (details) => {
  console.error(`[${details.trigger}] Cleanup error:`, details.error);
});

connectionManager.on("circuitOpen", (details) => {
  console.warn(
    `Circuit breaker OPEN: ${details.consecutiveFailures} failures, cooling down ${details.cooldownMs}ms until ${details.resumesAt}`
  );
});

connectionManager.on("circuitClosed", (details) => {
  console.log(
    `Circuit breaker CLOSED: recovered after ${details.previousFailures} failures`
  );
});

connectionManager.on("healthCheckFailed", (details) => {
  console.error(
    `Health check failed (${details.consecutiveFailures} consecutive):`,
    details.error
  );
});

connectionManager.on("critical", (details) => {
  console.error("CRITICAL:", details.message);
});

module.exports = {
  pool,
  query,
  getClient,
  startup,
  connectionManager,
  PoolUnavailableError,
};