const EventEmitter = require("events");
const { Client } = require("pg");

const RECOVERABLE_CODES = new Set([
  "57P01",
  "XX000",
  "ETIMEDOUT",
  "ECONNRESET",
  "EPIPE",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "ENOTFOUND",
  "EAI_AGAIN",
]);

function _isRecoverable(err) {
  if (!err) return false;
  if (err.code && RECOVERABLE_CODES.has(err.code)) return true;
  if (err.message) {
    if (err.message.includes("terminated")) return true;
    if (err.message.includes("Max client connections")) return true;
    if (err.message.includes("timeout expired")) return true;
    if (err.message.includes("read ETIMEDOUT")) return true;
  }
  return false;
}

class ConnectionManager extends EventEmitter {
  constructor(pool, options = {}) {
    super();
    this._pool = pool;
    this._connectionConfig = options.connectionConfig || {};
    this._cleanupIntervalMs = options.cleanupIntervalMs || 5000;
    this._idleThresholdMs = options.idleThresholdMs || 15000;
    this._healthCheckIntervalMs = options.healthCheckIntervalMs || 15000;
    this._burstThreshold = options.burstThreshold || 10;
    this._applicationName = options.applicationName || "dinostratum_api";
    this._cleanupTimer = null;
    this._healthCheckTimer = null;
    this._isRunning = false;
    this._cleanupInProgress = false;
    this._consecutiveConnectFailures = 0;
    this._circuitOpenUntil = 0;
    this._maxBackoffMs = options.maxBackoffMs || 60000;
    this._stats = {
      totalCleanups: 0,
      totalTerminated: 0,
      burstCleanups: 0,
      lastCleanupAt: null,
      lastHealthCheckAt: null,
      healthCheckFailures: 0,
      consecutiveFailures: 0,
      circuitBreakerTrips: 0,
    };

    this._onPoolConnect = this._onPoolConnect.bind(this);
  }

  start() {
    if (this._isRunning) return;
    this._isRunning = true;

    this._cleanupTimer = setInterval(
      () => this._runCleanup("scheduled"),
      this._cleanupIntervalMs
    );

    this._healthCheckTimer = setInterval(
      () => this._runHealthCheck(),
      this._healthCheckIntervalMs
    );

    this._cleanupTimer.unref();
    this._healthCheckTimer.unref();

    this._pool.on("connect", this._onPoolConnect);

    this.emit("started", {
      cleanupIntervalMs: this._cleanupIntervalMs,
      healthCheckIntervalMs: this._healthCheckIntervalMs,
      idleThresholdMs: this._idleThresholdMs,
      burstThreshold: this._burstThreshold,
      applicationName: this._applicationName,
    });

    this._runCleanup("startup");
    this._runHealthCheck();
  }

  async stop() {
    if (!this._isRunning) return;
    this._isRunning = false;

    this._pool.removeListener("connect", this._onPoolConnect);

    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }

    if (this._healthCheckTimer) {
      clearInterval(this._healthCheckTimer);
      this._healthCheckTimer = null;
    }

    this.emit("stopped", this.getStats());
  }

  getStats() {
    const now = Date.now();
    return {
      ...this._stats,
      isRunning: this._isRunning,
      poolTotal: this._pool.totalCount,
      poolIdle: this._pool.idleCount,
      poolWaiting: this._pool.waitingCount,
      circuitOpen: now < this._circuitOpenUntil,
      circuitResumesInMs: Math.max(0, this._circuitOpenUntil - now),
      consecutiveConnectFailures: this._consecutiveConnectFailures,
    };
  }

  _isCircuitOpen() {
    return Date.now() < this._circuitOpenUntil;
  }

  _openCircuit() {
    const backoffExponent = Math.min(this._consecutiveConnectFailures - 3, 6);
    const cooldown = Math.min(
      this._cleanupIntervalMs * Math.pow(2, backoffExponent),
      this._maxBackoffMs
    );
    this._circuitOpenUntil = Date.now() + cooldown;
    this._stats.circuitBreakerTrips++;

    this.emit("circuitOpen", {
      consecutiveFailures: this._consecutiveConnectFailures,
      cooldownMs: cooldown,
      resumesAt: new Date(this._circuitOpenUntil).toISOString(),
    });
  }

  _resetCircuit() {
    if (this._consecutiveConnectFailures > 0 || this._circuitOpenUntil > 0) {
      this.emit("circuitClosed", {
        previousFailures: this._consecutiveConnectFailures,
      });
    }
    this._consecutiveConnectFailures = 0;
    this._circuitOpenUntil = 0;
  }

  async _safeQuery(query, params) {
    if (this._isCircuitOpen()) {
      return { rows: [], rowCount: 0 };
    }

    const client = new Client({
      ...this._connectionConfig,
      application_name: `${this._applicationName}_manager`,
    });

    client.on("error", (err) => {
      if (_isRecoverable(err)) {
        this.emit("cleanupError", {
          trigger: "client-socket",
          error: `${err.code || "no-code"}: ${err.message}`,
        });
        return;
      }
      this.emit("cleanupError", {
        trigger: "client-socket-unknown",
        error: err.message,
      });
    });

    try {
      await client.connect();
    } catch (connErr) {
      this._consecutiveConnectFailures++;
      if (this._consecutiveConnectFailures >= 3) {
        this._openCircuit();
      } else {
        this.emit("cleanupError", {
          trigger: "safeQuery-connect",
          error: connErr.message,
        });
      }
      try {
        await client.end();
      } catch (_) {}
      return { rows: [], rowCount: 0 };
    }

    this._resetCircuit();

    try {
      return await client.query(query, params);
    } catch (queryErr) {
      if (_isRecoverable(queryErr)) {
        return { rows: [], rowCount: 0 };
      }
      throw queryErr;
    } finally {
      try {
        await client.end();
      } catch (_) {}
    }
  }

  _onPoolConnect() {
    const total = this._pool.totalCount;
    if (total >= this._burstThreshold) {
      this.emit("burstDetected", { totalConnections: total });
      this._runCleanup("burst");
    }
  }

  async _runCleanup(trigger) {
    if (!this._isRunning || this._cleanupInProgress) return;
    if (this._isCircuitOpen() && trigger === "scheduled") return;

    this._cleanupInProgress = true;

    try {
      const terminated = await this._batchTerminateIdle();

      this._stats.totalCleanups++;
      this._stats.totalTerminated += terminated;
      this._stats.lastCleanupAt = new Date().toISOString();
      if (trigger === "burst") this._stats.burstCleanups++;

      if (terminated > 0) {
        this.emit("cleanupComplete", {
          trigger,
          terminated,
          timestamp: this._stats.lastCleanupAt,
        });
      }

      if (trigger === "burst" && terminated === 0) {
        await this._terminateOldestIdle();
      }
    } catch (error) {
      this.emit("cleanupError", { trigger, error: error.message });
    } finally {
      this._cleanupInProgress = false;
    }
  }

  async _batchTerminateIdle() {
    const query = `
      WITH terminated AS (
        SELECT pg_terminate_backend(pid) AS success, pid
        FROM pg_stat_activity
        WHERE pid <> pg_backend_pid()
          AND usename = current_user
          AND application_name != $2
          AND state = 'idle'
          AND EXTRACT(EPOCH FROM (NOW() - state_change)) * 1000 > $1
      )
      SELECT COUNT(*) FILTER (WHERE success) AS terminated_count
      FROM terminated
    `;

    const result = await this._safeQuery(query, [
      this._idleThresholdMs,
      this._applicationName,
    ]);

    return parseInt(result.rows[0]?.terminated_count || "0", 10);
  }

  async _terminateOldestIdle() {
    const query = `
      WITH oldest AS (
        SELECT pid
        FROM pg_stat_activity
        WHERE pid <> pg_backend_pid()
          AND usename = current_user
          AND application_name != $1
          AND state = 'idle'
        ORDER BY state_change ASC
        LIMIT 3
      )
      SELECT pg_terminate_backend(pid) FROM oldest
    `;

    const result = await this._safeQuery(query, [this._applicationName]);
    const terminated = result.rowCount;

    if (terminated > 0) {
      this.emit("cleanupComplete", {
        trigger: "burst-forced",
        terminated,
        timestamp: new Date().toISOString(),
      });
    }

    return terminated;
  }

  async _runHealthCheck() {
    if (!this._isRunning) return;
    if (this._isCircuitOpen()) return;

    try {
      const result = await this._safeQuery("SELECT 1 AS health");

      if (result.rows[0]?.health === 1) {
        this._stats.consecutiveFailures = 0;
        this._stats.lastHealthCheckAt = new Date().toISOString();
        this.emit("healthCheckPassed", {
          timestamp: this._stats.lastHealthCheckAt,
          pool: {
            total: this._pool.totalCount,
            idle: this._pool.idleCount,
            waiting: this._pool.waitingCount,
          },
        });
      }
    } catch (error) {
      this._stats.healthCheckFailures++;
      this._stats.consecutiveFailures++;
      this.emit("healthCheckFailed", {
        error: error.message,
        consecutiveFailures: this._stats.consecutiveFailures,
      });

      if (this._stats.consecutiveFailures >= 3) {
        this.emit("critical", {
          message: "Multiple consecutive health check failures",
          failures: this._stats.consecutiveFailures,
        });
      }
    }
  }

  async terminateAllNonAdmin() {
    const query = `
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE pid <> pg_backend_pid()
        AND usename = current_user
        AND application_name != $1
    `;

    const result = await this._safeQuery(query, [this._applicationName]);
    const terminated = result.rowCount;

    this.emit("bulkTermination", { terminated });
    return terminated;
  }
}

module.exports = ConnectionManager;