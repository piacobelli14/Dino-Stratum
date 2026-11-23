const express = require("express");

const router = express.Router();

const SOURCES = {
  module: "./risk",
  liveRoute: "/risk/intelligence/live",
  refreshSeconds: 30,
  retrySeconds: 15,
  buckets: ["earthquakes", "wildfires", "weather", "floods", "volcanoes", "air_quality", "ground_deformation", "global_disasters", "crime"],
  categoryBuckets: { seismic: "earthquakes", wildfire: "wildfires", flood: "floods", volcanic: "volcanoes", "air quality": "air_quality", "ground deformation": "ground_deformation", crime: "crime" },
  weatherCategories: ["weather", "tornado", "hurricane", "space"],
  fallbackBucket: "global_disasters",
  severities: ["critical", "high", "medium", "low"]
};

const cache = { at: 0, value: null, error: null, failedAt: 0 };

let riskModule = null;

const errorMessage = (error) => (error && error.message ? error.message : String(error));

const loadModule = () => {
  if (riskModule) return riskModule;
  try {
    riskModule = require(SOURCES.module);
    return riskModule;
  } catch (error) {
    throw new Error(`The risk routes could not be loaded from ${SOURCES.module}. ${errorMessage(error)}`);
  }
};

const readSnapshot = () => {
  const routerModule = loadModule();
  const layer = (routerModule.stack || []).find((entry) => entry.route && entry.route.path === SOURCES.liveRoute && entry.route.methods && entry.route.methods.get);
  if (!layer || !layer.route.stack.length) throw new Error(`The route ${SOURCES.liveRoute} was not found.`);
  const risks = [];
  let buffer = "";
  let onClose = null;
  const req = {
    method: "GET",
    url: SOURCES.liveRoute,
    originalUrl: SOURCES.liveRoute,
    query: { snapshot: "1" },
    params: {},
    headers: {},
    on(event, handler) {
      if (event === "close") onClose = handler;
      return this;
    }
  };
  const res = {
    writableEnded: false,
    destroyed: false,
    writableLength: 0,
    writeHead() { return this; },
    flushHeaders() {},
    flush() {},
    destroy() { this.destroyed = true; },
    end() { this.writableEnded = true; },
    write(chunk) {
      buffer += String(chunk);
      let index = buffer.indexOf("\n\n");
      while (index !== -1) {
        const block = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        const event = (block.match(/^event: (.*)$/m) || [])[1];
        const data = (block.match(/^data: (.*)$/m) || [])[1];
        if (event === "snapshot_data" && data) {
          try {
            for (const risk of JSON.parse(data).risks || []) risks.push(risk);
          } catch (error) {
            index = buffer.indexOf("\n\n");
            continue;
          }
        }
        index = buffer.indexOf("\n\n");
      }
      return true;
    }
  };
  return Promise.resolve(layer.route.stack[0].handle(req, res, () => null)).then(() => risks).finally(() => {
    res.writableEnded = true;
    if (onClose) onClose();
  });
};

const bucketOf = (risk) => {
  const category = String(risk.risk_category || "").toLowerCase();
  return SOURCES.categoryBuckets[category] || (SOURCES.weatherCategories.includes(category) ? "weather" : SOURCES.fallbackBucket);
};

const build = async () => {
  const risks = await readSnapshot();
  const counts = Object.fromEntries(SOURCES.buckets.map((key) => [key, 0]));
  const summary = { total: risks.length, ...Object.fromEntries(SOURCES.severities.map((key) => [key, 0])) };
  for (const risk of risks) {
    counts[bucketOf(risk)] += 1;
    const severity = String(risk.severity || "Low").toLowerCase();
    if (summary[severity] !== undefined) summary[severity] += 1;
  }
  return { counts, summary, total: risks.length };
};

router.get("/landing/summary", async (req, res) => {
  try {
    if (!cache.value || Date.now() - cache.at >= SOURCES.refreshSeconds * 1000) {
      if (!cache.error || Date.now() - cache.failedAt >= SOURCES.retrySeconds * 1000) {
        try {
          cache.value = await build();
          cache.at = Date.now();
          cache.error = null;
        } catch (error) {
          cache.error = errorMessage(error);
          cache.failedAt = Date.now();
        }
      }
    }
    if (!cache.value) return res.status(502).json({ success: false, message: cache.error || "The risk summary has no data right now." });
    res.json({ success: true, ...cache.value, stale: Boolean(cache.error), updatedAt: new Date(cache.at).toISOString() });
  } catch (error) {
    res.status(500).json({ success: false, message: `The landing summary could not be built. ${errorMessage(error)}` });
  }
});

module.exports = router;