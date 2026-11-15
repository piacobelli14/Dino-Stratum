const { PermanentError } = require("../../engine");

const SETTINGS = {
  domain: "stratum-risk",

  aggregator: {
    module: "../../../routes/stratum/risk.js",
    provider: "Stratum Risk Intelligence",
    intervalSeconds: 600,
    batchSize: 2000,
    maxBatchesPerRun: 10,
    sources: [{ sourceKey: "stratum-risk-archive", name: "Stratum Risk Archive", config: {} }]
  },

  frontier: {
    seeds: ["https://www.gdacs.org/feed_reference.aspx", "https://eonet.gsfc.nasa.gov/docs/v3", "https://www.fema.gov/about/openfema/data-sets"],
    allow: ["gdacs.org", "nasa.gov", "fema.gov", "usgs.gov", "noaa.gov"],
    deny: ["gdacsapi", "/api/", "/(about|news|contact|privacy|search|careers)(/|\\.|$)"],
    htmlFollow: "/(data|feed|feeds|datasets|docs|api-docs|openfema)(/|$)",
    leadIgnoreHosts: ["twitter.com", "x.com", "facebook.com", "youtube.com", "linkedin.com", "wikipedia.org", "instagram.com"],
    maxDepth: 3,
    maxNodes: 1000,
    dateWindow: 3,
    indexDays: 30,
    minRevisitSeconds: 604800,
    maxRevisitSeconds: 2592000
  }
};

const toNumber = (value) => {
  const number = Number(value);
  return value === null || value === undefined || value === "" || !Number.isFinite(number) ? null : number;
};

const slugOf = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const yieldLoop = () => new Promise((resolve) => setImmediate(resolve));

const offsetMs = (id) => {
  let hash = 0;
  for (const char of String(id)) hash = (hash * 31 + char.charCodeAt(0)) % 1000;
  return hash;
};

const eventCandidate = (row) => {
  const base = row.event_time || row.updated_at || row.ingested_at;
  const time = base ? new Date(base).getTime() : NaN;
  if (!row.id || !Number.isFinite(time)) return null;
  return {
    product: {
      productKey: `risk-${slugOf(row.source)}-${slugOf(row.risk_category)}`,
      name: `${row.source} ${row.risk_category}`,
      category: row.risk_category || "Risk",
      kind: "events",
      mode: "index",
      metadata: { provider: SETTINGS.aggregator.provider, source: row.source, riskCategory: row.risk_category }
    },
    frame: {
      observedAt: new Date(Math.floor(time / 1000) * 1000 + offsetMs(row.id)),
      originUrl: row.url || null,
      mimeType: "application/json",
      metadata: {
        eventId: row.id,
        sourceId: row.source_id || null,
        title: row.title || null,
        severity: row.severity || null,
        severityScore: toNumber(row.severity_score),
        latitude: toNumber(row.latitude),
        longitude: toNumber(row.longitude),
        impactRadiusKm: toNumber(row.impact_radius_km),
        eventTime: row.event_time ? new Date(row.event_time).toISOString() : null
      }
    }
  };
};

const riskArchive = (() => {
  const S = SETTINGS.aggregator;

  const archive = async (job, context) => {
    let aggregator;
    try {
      aggregator = require(S.module);
    } catch (error) {
      throw new PermanentError(`The Stratum risk aggregator could not be loaded from ${S.module}.`);
    }
    if (typeof aggregator.archiveSince !== "function") throw new PermanentError("The Stratum risk aggregator does not expose archiveSince, so deploy the updated routes/stratum/risk.js.");
    const cursor = (await context.cursors.get("stratum:archive")) || { since: null };
    let since = cursor.since;
    const totals = { rows: 0, candidates: 0, products: 0, indexed: 0 };
    for (let batch = 0; batch < S.maxBatchesPerRun; batch += 1) {
      await context.heartbeat();
      const rows = await aggregator.archiveSince(since, S.batchSize);
      if (!rows.length) break;
      const candidates = rows.map(eventCandidate).filter(Boolean);
      const summary = await context.ingest(candidates, { maxArchivePerVisit: 0 });
      totals.rows += rows.length;
      totals.candidates += summary.candidates;
      totals.products += summary.products;
      totals.indexed += summary.indexed;
      since = new Date(rows[rows.length - 1].ingested_at).toISOString();
      await context.cursors.set("stratum:archive", { since, updatedAt: new Date().toISOString() });
      await yieldLoop();
      if (rows.length < S.batchSize) break;
    }
    return { summary: totals, requeue: totals.rows >= S.batchSize * S.maxBatchesPerRun ? 60 : S.intervalSeconds };
  };

  return {
    key: "stratumrisk",
    domain: SETTINGS.domain,
    hosts: {},
    sources: S.sources,
    schedules: (source) => [{ scheduleKey: `${source.sourceKey}:archive`, jobType: "stratumrisk:archive", intervalSeconds: S.intervalSeconds }],
    startupJobs: () => [{ jobType: "stratumrisk:archive", payload: {} }],
    handlers: { archive },
    helpers: { eventCandidate }
  };
})();

module.exports = {
  domain: SETTINGS.domain,
  adapters: [riskArchive],
  frontier: SETTINGS.frontier
};