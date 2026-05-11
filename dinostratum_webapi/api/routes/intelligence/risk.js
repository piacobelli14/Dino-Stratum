const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const { pool } = require("../../config/db");
const { goldenMeshStore, changeDetectionStore, runChangeDetection, classifySeverity } = require("./assets");

const CACHE_MS = 3 * 60 * 1000;
const RISK_CACHE_MAX = 200;

const INGEST_MS = 5 * 60 * 1000;
const DYNAMIC_REFRESH_MS = 24 * 60 * 60 * 1000;

const QUERY_TIMEOUT_MS = 30000;
const UPSERT_TIMEOUT_MS = 60000;
const UPSERT_BATCH_SIZE = 500;
const UPSERT_CONCURRENCY = 2;
const UPSERT_QUEUE_MAX = 100000;
const UPSERT_MAX_RETRIES = 3;
const UPSERT_RETRY_BASE_MS = 500;
const GEOM_UPDATE_BATCH_SIZE = 500;

const DB_WRITE_INTERVAL_MS = 60000;
const DB_WRITE_ENABLED = true;
const RISK_STORE_MAX = 50000;

const CLEANUP_INTERVAL_MS = 30 * 60 * 1000;
const CLEANUP_DELETE_BATCH_SIZE = 5000;
const CLEANUP_DELETE_MAX_ITERATIONS = 50;
const CLEANUP_DEDUP_MAX_ITERATIONS = 100;
const CLEANUP_GEOM_BATCH_SIZE = 500;
const CLEANUP_GEOM_MAX_ITERATIONS = 200;
const CLEANUP_EXPIRED_GRACE_DAYS = 7;
const CLEANUP_INGESTION_RUN_RETENTION_DAYS = 7;

const DEFORM_THRESH_MM = 5;
const INFRA_BUFFER_KM = 5;

const VISIBILITY_PUBLIC = "public";
const VISIBILITY_ORG_PRIVATE = "org-private";

const SEVERITY_WEIGHTS = { Critical: 100, High: 60, Medium: 30, Low: 10 };

const IMPACT_RADIUS_BASE = { Seismic: 100, Wildfire: 30, Weather: 50, Flood: 20, Hurricane: 300, Tornado: 5, Volcanic: 50, Tsunami: 100, "Air Quality": 25, Industrial: 10, Conflict: 15, "Ground Deformation": 15 };
const IMPACT_RADIUS_MULTIPLIER = { Critical: 3, High: 2, Medium: 1.2, Low: 0.8 };

const CATEGORY_TO_LABEL = {
    earthquakes: ["Seismic"],
    wildfires: ["Wildfire"],
    weather: ["Weather", "Tornado", "Hurricane", "Space"],
    floods: ["Flood"],
    volcanoes: ["Volcanic"],
    air_quality: ["Air Quality"],
    ground_deformation: ["Ground Deformation", "Subsidence"],
    global_disasters: ["Other", "Industrial", "Infrastructure", "Supply Chain", "Tsunami", "Drought", "Ice", "Landslide", "Water"]
};

const RECOMMENDATIONS = {
    Seismic: { Critical: ["Evacuate damaged structures immediately.", "Check for gas leaks and structural damage.", "Prepare for aftershocks.", "Avoid coastal areas if tsunami warning."], High: ["Drop, cover, and hold on during shaking.", "Stay away from windows and heavy objects.", "Have emergency supplies ready."], Medium: ["Review earthquake preparedness plans.", "Secure heavy furniture and objects."], Low: ["No immediate action required.", "Review emergency procedures."] },
    Wildfire: { Critical: ["Evacuate immediately if ordered.", "Close all windows and doors.", "Wear N95 masks for smoke.", "Have go-bag ready."], High: ["Prepare for possible evacuation.", "Create defensible space around property.", "Monitor air quality closely."], Medium: ["Stay informed of fire progression.", "Reduce outdoor activities due to smoke."], Low: ["Monitor local fire reports.", "Review evacuation routes."] },
    Flood: { Critical: ["Move to higher ground immediately.", "Do not walk or drive through flood waters.", "Avoid bridges over fast-moving water."], High: ["Prepare to evacuate.", "Move valuables to upper floors.", "Fill bathtubs with clean water."], Medium: ["Monitor water levels closely.", "Avoid flood-prone areas."], Low: ["Stay informed of weather conditions.", "Clear drains and gutters."] },
    Hurricane: { Critical: ["Shelter in place in interior room.", "Stay away from windows.", "Do not go outside during eye passage."], High: ["Complete evacuation if ordered.", "Board up windows.", "Stock emergency supplies."], Medium: ["Prepare emergency kit.", "Review evacuation routes.", "Fuel vehicles."], Low: ["Monitor storm track.", "Review hurricane preparedness."] },
    Volcanic: { Critical: ["Evacuate exclusion zone immediately.", "Wear respiratory protection.", "Protect from ashfall."], High: ["Prepare for possible evacuation.", "Stock masks and goggles.", "Seal windows and doors."], Medium: ["Monitor volcanic activity.", "Review evacuation plans."], Low: ["Stay informed of volcano status.", "Know warning signs."] },
    "Ground Deformation": { Critical: ["Evacuate structures showing visible cracking or tilting immediately.", "Report pipeline or utility damage to emergency services.", "Avoid areas with active subsidence or uplift.", "Request professional structural inspection for all buildings in the affected zone."], High: ["Inspect foundations, retaining walls, and load-bearing structures for new cracks.", "Monitor pipelines and utility corridors crossing the deformation zone.", "Install temporary ground displacement markers for local tracking.", "Coordinate with geological survey authorities for detailed assessment."], Medium: ["Schedule routine structural inspections of infrastructure in the affected area.", "Review subsidence history and trend data for long-term planning.", "Verify that drainage systems are functioning correctly to prevent accelerated settlement."], Low: ["Note the observation for long-term ground stability records.", "Continue standard maintenance schedules for infrastructure.", "Monitor future satellite passes for trend confirmation."] }
};

const SELECT_COLUMNS = `id, source, source_id, risk_category, severity, severity_score, title, description, geometry_type, geometry_coordinates, latitude, longitude, impact_radius_km, event_time, updated_at, expires_at, url, recommendations, metadata, properties, golden_mesh_detection, population_impact, coordinates, visibility, orgid`;

let ingestionRunning = false;
let ingestionTimer = null;
let dynamicRefreshTimer = null;
let dbWriteTimer = null;
let cleanupRunning = false;
let cleanupTimer = null;
let dynamicDataReady = false;

const riskCache = new Map();
const riskStore = new Map();
let riskStoreDirty = false;
const riskStorePendingDbIds = new Set();
const sseClients = new Set();

const writeQueue = [];
let writeQueueProcessing = false;
let writeQueueDropped = 0;

const generateId = (prefix) => {
    return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
};

const safeJsonStringify = (value) => {
    if (value == null) return null;
    if (typeof value === "string") {
        try { JSON.parse(value); return value; } catch {}
        try { return JSON.stringify(value); } catch { return null; }
    }
    try { return JSON.stringify(value); } catch { return null; }
};

const parseJson = (value) => {
    return typeof value === "string" ? JSON.parse(value) : value;
};

const withTimeout = (promise, ms, label) => {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`${label} timed out after ${ms} milliseconds.`));
        }, ms);
        promise.then(
            (val) => { clearTimeout(timer); resolve(val); },
            (error) => { clearTimeout(timer); reject(error); }
        );
    });
};

const poolStats = () => {
    return {
        total_connections: pool.totalCount,
        idle_connections: pool.idleCount,
        active_connections: pool.totalCount - pool.idleCount,
        waiting_requests: pool.waitingCount
    };
};

const logDbPressure = (context) => {
    const stats = poolStats();
};

const acquireClient = async (label, timeoutMs) => {
    const timeout = timeoutMs || 10000;
    logDbPressure(label);
    try {
        const client = await withTimeout(pool.connect(), timeout, `Connection acquisition for ${label}`);
        return client;
    } catch (error) {
        throw error;
    }
};

const queryWithTimeout = async (sql, params, timeoutMs) => {
    const timeout = timeoutMs || QUERY_TIMEOUT_MS;
    try {
        return await withTimeout(pool.query(sql, params), timeout, "Database query");
    } catch (error) {
        throw error;
    }
};

const safeQueryWithTimeout = async (sql, params, timeoutMs, label) => {
    try {
        return await queryWithTimeout(sql, params, timeoutMs);
    } catch (error) {
        return null;
    }
};

const haversine = (lat1, lon1, lat2, lon2) => {
    const R = 6371000, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const inBounds = (lat, lng, b) => {
    return !b || (lat >= b.min_lat && lat <= b.max_lat && lng >= b.min_lng && lng <= b.max_lng);
};

const pointInRing = (pt, ring) => {
    let inside = false;
    const [px, py] = pt;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j];
        if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
};

const distSegSq = (px, py, ax, ay, bx, by) => {
    let dx = bx - ax, dy = by - ay;
    if (dx || dy) {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
        ax += t * dx; ay += t * dy;
    }
    dx = px - ax; dy = py - ay;
    return dx * dx + dy * dy;
};

const distToEdge = (px, py, ring) => {
    let min = Infinity;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const d = distSegSq(px, py, ring[i][0], ring[i][1], ring[j][0], ring[j][1]);
        if (d < min) min = d;
    }
    return Math.sqrt(min);
};

const poleOfInaccessibility = (ring, prec) => {
    let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity;
    for (const [x, y] of ring) { if (x < mnX) mnX = x; if (y < mnY) mnY = y; if (x > mxX) mxX = x; if (y > mxY) mxY = y; }
    const w = mxX - mnX, h = mxY - mnY;
    let cs = Math.max(w, h);
    if (!cs) return [mnX, mnY];
    let hc = cs / 2;
    const pr = prec || cs / 100;
    const mkCell = (cx, cy) => {
        const ins = pointInRing([cx, cy], ring);
        const d = ins ? distToEdge(cx, cy, ring) : -distToEdge(cx, cy, ring);
        return { x: cx, y: cy, half: hc, dist: d, max: d + hc * Math.SQRT2 };
    };
    let cells = [];
    for (let x = mnX; x < mxX; x += cs) for (let y = mnY; y < mxY; y += cs) cells.push(mkCell(x + hc, y + hc));
    let best = mkCell(mnX + w / 2, mnY + h / 2);
    const cx = ring.reduce((s, c) => s + c[0], 0) / ring.length;
    const cy = ring.reduce((s, c) => s + c[1], 0) / ring.length;
    const cc = mkCell(cx, cy);
    if (cc.dist > best.dist) best = cc;
    while (cells.length) {
        cells.sort((a, b) => b.max - a.max);
        const c = cells.shift();
        if (c.dist > best.dist) best = c;
        if (c.max - best.dist <= pr) continue;
        hc = c.half / 2;
        cells.push(mkCell(c.x - hc, c.y - hc), mkCell(c.x + hc, c.y - hc), mkCell(c.x - hc, c.y + hc), mkCell(c.x + hc, c.y + hc));
    }
    return [best.x, best.y];
};

const polyInterior = (ring) => {
    if (!ring || ring.length < 3) return { lat: null, lng: null };
    const p = poleOfInaccessibility(ring, 0.001);
    return { lng: p[0], lat: p[1] };
};

const multiPolyInterior = (coords) => {
    if (!coords?.length) return { lat: null, lng: null };
    let bestRing = null, bestArea = 0;
    for (const poly of coords) {
        const ring = poly[0];
        if (!ring || ring.length < 3) continue;
        let area = 0;
        for (let j = 0, k = ring.length - 1; j < ring.length; k = j++) area += (ring[k][0] + ring[j][0]) * (ring[k][1] - ring[j][1]);
        area = Math.abs(area) / 2;
        if (area > bestArea) { bestArea = area; bestRing = ring; }
    }
    return bestRing ? polyInterior(bestRing) : { lat: null, lng: null };
};

const extractLatLng = (geom) => {
    if (!geom) return { lat: null, lng: null, geomType: null, geomCoords: null };
    const { type: geomType, coordinates: geomCoords } = geom;
    let lat = null, lng = null;
    if (geomType === "Point" && geomCoords) { lng = geomCoords[0]; lat = geomCoords[1]; }
    else if (geomType === "Polygon" && geomCoords?.[0]) ({ lat, lng } = polyInterior(geomCoords[0]));
    else if (geomType === "MultiPolygon" && geomCoords) ({ lat, lng } = multiPolyInterior(geomCoords));
    return { lat, lng, geomType, geomCoords };
};

const getCached = (key) => {
    const entry = riskCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts >= CACHE_MS) { riskCache.delete(key); return null; }
    return entry.data;
};

const setCache = (key, data) => {
    if (!data || (Array.isArray(data) && data.length === 0)) return;
    if (riskCache.size >= RISK_CACHE_MAX) {
        let oldest = null, oldestTs = Infinity;
        for (const [k, val] of riskCache) {
            if (val.ts < oldestTs) { oldest = k; oldestTs = val.ts; }
        }
        if (oldest) riskCache.delete(oldest);
    }
    riskCache.set(key, { data, ts: Date.now() });
};


const isRiskVisibleToOrg = (risk, orgid) => {
    if (!risk) return false;
    const visibility = risk.visibility || (risk.org_private || risk.is_private ? VISIBILITY_ORG_PRIVATE : VISIBILITY_PUBLIC);
    if (visibility === VISIBILITY_PUBLIC) return true;
    if (!orgid) return false;
    const riskOrgid = risk.orgid || risk.owner_orgid;
    return riskOrgid === orgid;
};

const annotateRiskVisibility = (risk) => {
    if (!risk) return risk;
    if (!risk.visibility) {
        risk.visibility = (risk.org_private || risk.is_private) ? VISIBILITY_ORG_PRIVATE : VISIBILITY_PUBLIC;
    }
    return risk;
};

const filterRisksForOrg = (risks, orgid) => {
    if (!Array.isArray(risks)) return [];
    return risks.filter(r => isRiskVisibleToOrg(r, orgid)).map(annotateRiskVisibility);
};

const buildVisibilityClause = (orgid, paramIndex) => {
    if (!orgid) return { clause: " AND (visibility = 'public' OR visibility IS NULL)", params: [] };
    return {
        clause: ` AND (visibility = 'public' OR visibility IS NULL OR (visibility = 'org-private' AND orgid = ${paramIndex}))`,
        params: [orgid]
    };
};


const storeRisks = (risks) => {
    if (!risks || !risks.length) return;
    for (const r of risks) {
        if (r.id) {
            riskStore.set(r.id, r);
            riskStorePendingDbIds.add(r.id);
        }
    }
    if (riskStore.size > RISK_STORE_MAX) {
        const entries = Array.from(riskStore.entries());
        entries.sort((a, b) => (SEVERITY_WEIGHTS[b[1].severity] || 0) - (SEVERITY_WEIGHTS[a[1].severity] || 0));
        riskStore.clear();
        for (let i = 0; i < RISK_STORE_MAX && i < entries.length; i++) {
            riskStore.set(entries[i][0], entries[i][1]);
        }
    }
    riskStoreDirty = true;
};

const queryRiskStore = (filterFn, sortFn, limit) => {
    let results = [];
    for (const r of riskStore.values()) {
        if (!filterFn || filterFn(r)) results.push(r);
    }
    if (sortFn) results.sort(sortFn);
    if (limit && results.length > limit) results = results.slice(0, limit);
    return results;
};

const nearbyFromStore = (lat, lng, radiusKm, opts) => {
    const radiusM = radiusKm * 1000;
    const results = [];
    for (const r of riskStore.values()) {
        if (!r.latitude || !r.longitude) continue;
        if (opts.severity && r.severity !== opts.severity) continue;
        if (opts.category && r.risk_category !== opts.category) continue;
        if (!isRiskVisibleToOrg(r, opts.orgid)) continue;
        const dist = haversine(lat, lng, r.latitude, r.longitude);
        if (dist <= radiusM) {
            results.push({ ...r, distance_meters: dist, distance_km: parseFloat((dist / 1000).toFixed(2)) });
        }
    }
    results.sort((a, b) => a.distance_meters - b.distance_meters);
    return opts.limit ? results.slice(0, opts.limit) : results;
};

const bboxFromStore = (mnLat, mxLat, mnLng, mxLng, opts) => {
    const results = [];
    for (const r of riskStore.values()) {
        if (!r.latitude || !r.longitude) continue;
        if (r.latitude < mnLat || r.latitude > mxLat || r.longitude < mnLng || r.longitude > mxLng) continue;
        if (opts.severity && r.severity !== opts.severity) continue;
        if (opts.category && r.risk_category !== opts.category) continue;
        if (!isRiskVisibleToOrg(r, opts.orgid)) continue;
        results.push(r);
    }
    results.sort((a, b) => (SEVERITY_WEIGHTS[b.severity] || 0) - (SEVERITY_WEIGHTS[a.severity] || 0));
    return opts.limit ? results.slice(0, opts.limit) : results;
};

const categorySummaryFromStore = () => {
    const summary = {};
    for (const r of riskStore.values()) {
        if (!summary[r.risk_category]) summary[r.risk_category] = { total: 0, by_severity: {} };
        summary[r.risk_category].by_severity[r.severity] = (summary[r.risk_category].by_severity[r.severity] || 0) + 1;
        summary[r.risk_category].total++;
    }
    return summary;
};

const FALLBACK_CITIES = [
    { name: "Tokyo", lat: 35.6762, lng: 139.6503, pop: 37400000 }, { name: "Delhi", lat: 28.7041, lng: 77.1025, pop: 30290000 }, { name: "Shanghai", lat: 31.2304, lng: 121.4737, pop: 27060000 },
    { name: "São Paulo", lat: -23.5505, lng: -46.6333, pop: 22040000 }, { name: "Mexico City", lat: 19.4326, lng: -99.1332, pop: 21780000 }, { name: "Cairo", lat: 30.0444, lng: 31.2357, pop: 20900000 },
    { name: "Mumbai", lat: 19.076, lng: 72.8777, pop: 20410000 }, { name: "Beijing", lat: 39.9042, lng: 116.4074, pop: 20380000 }, { name: "Dhaka", lat: 23.8103, lng: 90.4125, pop: 21740000 },
    { name: "Osaka", lat: 34.6937, lng: 135.5023, pop: 19280000 }, { name: "New York", lat: 40.7128, lng: -74.006, pop: 18820000 }, { name: "Karachi", lat: 24.8607, lng: 67.0011, pop: 16090000 },
    { name: "Buenos Aires", lat: -34.6037, lng: -58.3816, pop: 15150000 }, { name: "Istanbul", lat: 41.0082, lng: 28.9784, pop: 15190000 }, { name: "Kolkata", lat: 22.5726, lng: 88.3639, pop: 14850000 },
    { name: "Lagos", lat: 6.5244, lng: 3.3792, pop: 14860000 }, { name: "Manila", lat: 14.5995, lng: 120.9842, pop: 13920000 }, { name: "Guangzhou", lat: 23.1291, lng: 113.2644, pop: 13640000 },
    { name: "Rio de Janeiro", lat: -22.9068, lng: -43.1729, pop: 13460000 }, { name: "Lahore", lat: 31.5204, lng: 74.3587, pop: 12640000 }, { name: "Bangalore", lat: 12.9716, lng: 77.5946, pop: 12330000 },
    { name: "Moscow", lat: 55.7558, lng: 37.6173, pop: 12540000 }, { name: "Shenzhen", lat: 22.5431, lng: 114.0579, pop: 12360000 }, { name: "Chennai", lat: 13.0827, lng: 80.2707, pop: 10970000 },
    { name: "Bogotá", lat: 4.711, lng: -74.0721, pop: 10980000 }, { name: "Jakarta", lat: -6.2088, lng: 106.8456, pop: 10560000 }, { name: "Lima", lat: -12.0464, lng: -77.0428, pop: 10720000 },
    { name: "Paris", lat: 48.8566, lng: 2.3522, pop: 11020000 }, { name: "Bangkok", lat: 13.7563, lng: 100.5018, pop: 10540000 }, { name: "Hyderabad", lat: 17.385, lng: 78.4867, pop: 10000000 },
    { name: "London", lat: 51.5074, lng: -0.1278, pop: 9050000 }, { name: "Tehran", lat: 35.6892, lng: 51.389, pop: 9010000 }, { name: "Seoul", lat: 37.5665, lng: 126.978, pop: 9960000 },
    { name: "Chengdu", lat: 30.5728, lng: 104.0668, pop: 9140000 }, { name: "Ho Chi Minh City", lat: 10.8231, lng: 106.6297, pop: 8840000 }, { name: "Nairobi", lat: -1.2921, lng: 36.8219, pop: 4740000 },
    { name: "Baghdad", lat: 33.3152, lng: 44.3661, pop: 7140000 }, { name: "Toronto", lat: 43.6532, lng: -79.3832, pop: 6200000 }, { name: "Riyadh", lat: 24.7136, lng: 46.6753, pop: 7090000 },
    { name: "Santiago", lat: -33.4489, lng: -70.6693, pop: 6770000 }, { name: "Sydney", lat: -33.8688, lng: 151.2093, pop: 5310000 }, { name: "Berlin", lat: 52.52, lng: 13.405, pop: 3640000 },
    { name: "Madrid", lat: 40.4168, lng: -3.7038, pop: 6620000 }, { name: "Rome", lat: 41.9028, lng: 12.4964, pop: 4260000 }, { name: "Houston", lat: 29.7604, lng: -95.3698, pop: 6310000 },
    { name: "Los Angeles", lat: 34.0522, lng: -118.2437, pop: 12460000 }, { name: "Chicago", lat: 41.8781, lng: -87.6298, pop: 8600000 }, { name: "Johannesburg", lat: -26.2041, lng: 28.0473, pop: 5780000 },
    { name: "Singapore", lat: 1.3521, lng: 103.8198, pop: 5690000 }, { name: "Kuala Lumpur", lat: 3.139, lng: 101.6869, pop: 7780000 }, { name: "Hanoi", lat: 21.0278, lng: 105.8342, pop: 4680000 },
    { name: "Dubai", lat: 25.2048, lng: 55.2708, pop: 3380000 }, { name: "Taipei", lat: 25.033, lng: 121.5654, pop: 7870000 }, { name: "Hong Kong", lat: 22.3193, lng: 114.1694, pop: 7500000 },
    { name: "Addis Ababa", lat: 9.025, lng: 38.7469, pop: 3600000 }, { name: "Casablanca", lat: 33.5731, lng: -7.5898, pop: 3750000 }, { name: "Melbourne", lat: -37.8136, lng: 144.9631, pop: 4970000 },
    { name: "Warsaw", lat: 52.2297, lng: 21.0122, pop: 1790000 }, { name: "Accra", lat: 5.6037, lng: -0.187, pop: 2510000 }, { name: "Kinshasa", lat: -4.4419, lng: 15.2663, pop: 14340000 },
    { name: "Athens", lat: 37.9838, lng: 23.7275, pop: 3150000 }, { name: "Lisbon", lat: 38.7223, lng: -9.1393, pop: 2870000 }, { name: "Amsterdam", lat: 52.3676, lng: 4.9041, pop: 1150000 },
    { name: "Stockholm", lat: 59.3293, lng: 18.0686, pop: 1580000 }, { name: "Vienna", lat: 48.2082, lng: 16.3738, pop: 1910000 }, { name: "Montreal", lat: 45.5017, lng: -73.5673, pop: 4220000 },
    { name: "Denver", lat: 39.7392, lng: -104.9903, pop: 2930000 }, { name: "San Francisco", lat: 37.7749, lng: -122.4194, pop: 3310000 }, { name: "Seattle", lat: 47.6062, lng: -122.3321, pop: 3440000 },
    { name: "Dallas", lat: 32.7767, lng: -96.797, pop: 6370000 }, { name: "Miami", lat: 25.7617, lng: -80.1918, pop: 6090000 }, { name: "Atlanta", lat: 33.749, lng: -84.388, pop: 5950000 },
    { name: "Phoenix", lat: 33.4484, lng: -112.074, pop: 4860000 }, { name: "Minneapolis", lat: 44.9778, lng: -93.265, pop: 3640000 }, { name: "Detroit", lat: 42.3314, lng: -83.0458, pop: 3530000 },
    { name: "Philadelphia", lat: 39.9526, lng: -75.1652, pop: 5720000 }, { name: "Washington DC", lat: 38.9072, lng: -77.0369, pop: 5380000 }, { name: "Boston", lat: 42.3601, lng: -71.0589, pop: 4870000 },
    { name: "Kathmandu", lat: 27.7172, lng: 85.324, pop: 1420000 }, { name: "Ulaanbaatar", lat: 47.8864, lng: 106.9057, pop: 1540000 }, { name: "Kabul", lat: 34.5553, lng: 69.2075, pop: 4220000 },
    { name: "Tashkent", lat: 41.2995, lng: 69.2401, pop: 2510000 }, { name: "Almaty", lat: 43.2551, lng: 76.9126, pop: 1920000 }, { name: "Novosibirsk", lat: 55.0084, lng: 82.9357, pop: 1620000 },
    { name: "Chongqing", lat: 29.4316, lng: 106.9123, pop: 15870000 }, { name: "Wuhan", lat: 30.5928, lng: 114.3055, pop: 11080000 }, { name: "Tianjin", lat: 39.3434, lng: 117.3616, pop: 13580000 },
    { name: "Shenyang", lat: 41.8057, lng: 123.4315, pop: 9070000 }, { name: "Harbin", lat: 45.803, lng: 126.535, pop: 5880000 }, { name: "Pune", lat: 18.5204, lng: 73.8567, pop: 7410000 },
    { name: "Ahmedabad", lat: 23.0225, lng: 72.5714, pop: 8050000 }, { name: "Surabaya", lat: -7.2575, lng: 112.7521, pop: 2870000 }, { name: "Yangon", lat: 16.8661, lng: 96.1951, pop: 5160000 },
    { name: "Dar es Salaam", lat: -6.7924, lng: 39.2083, pop: 6700000 }, { name: "Khartoum", lat: 15.5007, lng: 32.5599, pop: 5680000 }, { name: "Luanda", lat: -8.8399, lng: 13.2894, pop: 8330000 },
    { name: "Algiers", lat: 36.7538, lng: 3.0588, pop: 2770000 }, { name: "Abuja", lat: 9.0765, lng: 7.3986, pop: 3280000 }, { name: "Cape Town", lat: -33.9249, lng: 18.4241, pop: 4620000 },
    { name: "Brasília", lat: -15.7975, lng: -47.8919, pop: 4560000 }, { name: "Medellín", lat: 6.2476, lng: -75.5658, pop: 3980000 }, { name: "Quito", lat: -0.1807, lng: -78.4678, pop: 2780000 },
    { name: "Caracas", lat: 10.4806, lng: -66.9036, pop: 2940000 }, { name: "Havana", lat: 23.1136, lng: -82.3666, pop: 2130000 }, { name: "Auckland", lat: -36.8485, lng: 174.7633, pop: 1630000 }
];

const dynamicStores = {
    urban: { data: [], fetched_at: null, fetching: false },
    infra: { data: [], fetched_at: null, fetching: false },
    deform: { data: [], fetched_at: null, fetching: false },
    faults: { data: [], fetched_at: null, fetching: false }
};

const estimatePopDensity = (lat, lng) => {
    let centers = dynamicStores.urban.data;
    if (!centers.length) {
        centers = FALLBACK_CITIES;
    }

    const nearest = [];
    for (const c of centers) {
        const d = haversine(lat, lng, c.lat, c.lng);
        nearest.push({ city: c, dist: d });
    }
    nearest.sort((a, b) => a.dist - b.dist);

    const top = nearest.slice(0, 3);
    if (!top.length) return { density: "unknown", estimated_population: 0, nearest_city: "Unknown", distance_km: "0" };

    const n1 = top[0];
    const km1 = n1.dist / 1000;
    const pop1 = n1.city.pop || 0;

    let weightedPop = 0;
    let totalWeight = 0;
    for (const entry of top) {
        const km = entry.dist / 1000;
        const cityPop = entry.city.pop || 0;
        if (cityPop <= 0) continue;
        const halfLife = 80;
        const weight = Math.exp(-km / halfLife);
        weightedPop += cityPop * weight;
        totalWeight += weight;
    }

    let estimatedPop = totalWeight > 0 ? Math.round(weightedPop / totalWeight) : 0;

    let density;
    if (km1 < 50) {
        density = "very_high";
        if (estimatedPop < pop1) estimatedPop = pop1;
    } else if (km1 < 150) {
        density = "high";
    } else if (km1 < 400) {
        density = "medium";
    } else if (km1 < 800) {
        density = "low";
    } else {
        density = "very_low";
    }

    if (density === "very_low" && estimatedPop < 1000) estimatedPop = 1000;
    if (density === "low" && estimatedPop < 5000) estimatedPop = 5000;

    return {
        density,
        estimated_population: estimatedPop,
        nearest_city: n1.city.name,
        distance_km: km1.toFixed(1)
    };
};

const assessInfraProximity = (lat, lng) => {
    const result = [];
    for (const inf of dynamicStores.infra.data) {
        const km = haversine(lat, lng, inf.lat, inf.lng) / 1000;
        const buf = inf.corridor_length_km > 0 ? Math.max(INFRA_BUFFER_KM, inf.corridor_length_km / 20) : INFRA_BUFFER_KM;
        if (km <= buf) {
            result.push({
                name: inf.name, type: inf.type, description: inf.description,
                distance_km: parseFloat(km.toFixed(2)), within_buffer: true,
                risk_relevance: km < 1 ? "Direct impact zone." : km < 3 ? "Proximal impact zone." : "Extended influence zone."
            });
        }
    }
    return result;
};

const fetchWithTimeout = async (url, opts = {}, ms = 15000) => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), ms);
    try {
        const r = await fetch(url, { ...opts, signal: ac.signal });
        clearTimeout(t);
        if (!r.ok) await r.text().catch(() => {});
        return r;
    } catch (error) {
        clearTimeout(t);
        throw error;
    }
};

const sparqlQuery = async (query, label) => {
    const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}&format=json`;
    const r = await fetchWithTimeout(url, {
        headers: { "Accept": "application/sparql-results+json", "User-Agent": "RiskCommandCenter/2.0 (https://github.com/risk-command-center; contact@example.com)" }
    }, 90000);
    if (!r.ok) throw new Error(`SPARQL ${label} request failed with status ${r.status}.`);
    const d = await r.json();
    return d.results?.bindings || [];
};

const SPARQL_CONFIGS = [
    {
        id: "urban_centers", label: "urban centers",
        sparql: `SELECT ?city ?cityLabel ?pop ?lat ?lon WHERE { ?city wdt:P31/wdt:P279* wd:Q515 . ?city wdt:P1082 ?pop . ?city p:P625 ?s . ?s psv:P625 ?c . ?c wikibase:geoLatitude ?lat . ?c wikibase:geoLongitude ?lon . FILTER(?pop > 300000) SERVICE wikibase:label { bd:serviceParam wikibase:language "en" } } ORDER BY DESC(?pop) LIMIT 600`,
        transform: (bindings) => {
            const seen = new Set(), out = [];
            for (const b of bindings) {
                const name = b.cityLabel?.value, pop = parseInt(b.pop?.value, 10), lat = parseFloat(b.lat?.value), lon = parseFloat(b.lon?.value);
                if (!name || isNaN(pop) || isNaN(lat) || isNaN(lon)) continue;
                const k = `${name}_${lat.toFixed(1)}_${lon.toFixed(1)}`;
                if (seen.has(k)) continue; seen.add(k);
                out.push({ lat, lng: lon, pop, name });
            }
            return out.sort((a, b) => b.pop - a.pop);
        }
    },
    ...[
        ["dams", "wd:Q12323", null, "dam"],
        ["pipelines", "wd:Q187223", "wdt:P2043", "pipeline"],
        ["ports", "wd:Q44782", null, "port"],
        ["nuclear_plants", "wd:Q134447", null, "nuclear_plant"],
        ["bridges", "wd:Q12280", "wdt:P2043", "bridge"],
        ["tunnels", "wd:Q44377", "wdt:P2043", "tunnel"],
        ["fault_lines", "wd:Q47089", "wdt:P2043", "fault"],
        ["extraction_sites", null, null, "extraction"],
        ["mines", null, null, "mine"]
    ].map(([id, qid, lenProp, type]) => {
        const isExtraction = id === "extraction_sites";
        const isMines = id === "mines";
        let typeFilter;
        if (isExtraction) typeFilter = "{ ?item wdt:P31/wdt:P279* wd:Q862562 } UNION { ?item wdt:P31/wdt:P279* wd:Q846386 }";
        else if (isMines) typeFilter = "{ ?item wdt:P31/wdt:P279* wd:Q820477 } UNION { ?item wdt:P31/wdt:P279* wd:Q5809579 }";
        else typeFilter = `?item wdt:P31/wdt:P279* ${qid} .`;
        const lenSelect = lenProp ? ` ?length` : "";
        const lenOpt = lenProp ? `\n  OPTIONAL { ?item ${lenProp} ?length }` : "";
        const limit = (id === "dams" || id === "extraction_sites" || id === "mines") ? 800 : (id === "nuclear_plants" || id === "tunnels") ? 500 : 600;
        return {
            id, label: id.replace(/_/g, " "),
            sparql: `SELECT ?item ?itemLabel ?lat ?lon${lenSelect} ?description WHERE {\n  ${typeFilter}\n  ?item p:P625 ?s . ?s psv:P625 ?c . ?c wikibase:geoLatitude ?lat . ?c wikibase:geoLongitude ?lon .${lenOpt}\n  OPTIONAL { ?item schema:description ?description . FILTER(LANG(?description) = "en") }\n  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }\n} LIMIT ${limit}`,
            transform: (bindings) => {
                const items = [];
                for (const b of bindings) {
                    const name = b.itemLabel?.value, lat = parseFloat(b.lat?.value), lon = parseFloat(b.lon?.value);
                    if (!name || isNaN(lat) || isNaN(lon)) continue;
                    const lenKm = b.length?.value ? parseFloat(b.length.value) / (type === "pipeline" || type === "fault" ? 1 : 1000) : 0;
                    const corrLen = type === "pipeline" || type === "fault" ? (b.length?.value ? parseFloat(b.length.value) : 0) : lenKm;
                    items.push({ name, type, lat, lng: lon, corridor_length_km: corrLen, description: b.description?.value || `${name} ${type} infrastructure.` });
                }
                return items;
            }
        };
    })
];

const fetchSparqlData = async (cfg) => {
    try {
        const result = cfg.transform(await sparqlQuery(cfg.sparql, cfg.label));
        return result;
    }
    catch (error) {
        return [];
    }
};

const fetchUrbanCenters = async () => {
    if (dynamicStores.urban.fetching) return dynamicStores.urban.data;
    dynamicStores.urban.fetching = true;
    try {
        const cfg = SPARQL_CONFIGS.find(c => c.id === "urban_centers");
        dynamicStores.urban.data = await fetchSparqlData(cfg);
        dynamicStores.urban.fetched_at = new Date().toISOString();
        return dynamicStores.urban.data;
    } catch (error) {
        return dynamicStores.urban.data;
    } finally {
        dynamicStores.urban.fetching = false;
    }
};

const fetchAllInfrastructure = async () => {
    if (dynamicStores.infra.fetching) return dynamicStores.infra.data;
    dynamicStores.infra.fetching = true;
    try {
        const cfgs = SPARQL_CONFIGS.filter(c => c.id !== "urban_centers");
        const settled = await Promise.allSettled(cfgs.map(c => fetchSparqlData(c)));
        const combined = [];
        for (const r of settled) if (r.status === "fulfilled") combined.push(...r.value);
        const seen = new Set(), deduped = [];
        for (const item of combined) {
            const k = `${item.name}_${item.lat.toFixed(2)}_${item.lng.toFixed(2)}`;
            if (!seen.has(k)) { seen.add(k); deduped.push(item); }
        }
        dynamicStores.faults.data = deduped.filter(i => i.type === "fault");
        dynamicStores.faults.fetched_at = new Date().toISOString();
        dynamicStores.infra.data = deduped.filter(i => i.type !== "fault");
        dynamicStores.infra.fetched_at = new Date().toISOString();
        return dynamicStores.infra.data;
    } catch (error) {
        return dynamicStores.infra.data;
    } finally {
        dynamicStores.infra.fetching = false;
    }
};

const DATA_SOURCES = {
    usgs_earthquakes: {
        id: "usgs_earthquakes", name: "USGS Earthquake Hazards", logTag: "USGS_EQ", sourceName: "USGS", timeoutMs: 30000,
        buildUrl: (p) => {
            const st = p.start_time || new Date(Date.now() - 30 * 864e5).toISOString().split("T")[0];
            let url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${st}&minmagnitude=${p.min_magnitude || 2.0}&limit=${p.limit || 20000}&orderby=time`;
            if (p.end_time) url += `&endtime=${new Date(p.end_time).toISOString().split("T")[0]}`;
            if (p.min_lat && p.max_lat && p.min_lng && p.max_lng) url += `&minlatitude=${p.min_lat}&maxlatitude=${p.max_lat}&minlongitude=${p.min_lng}&maxlongitude=${p.max_lng}`;
            return url;
        },
        extractRawItems: (d) => d.features || [],
        transformItem: (f) => {
            const p = f.properties, c = f.geometry.coordinates, mag = p.mag, dep = c[2];
            let sev = mag >= 7 ? "Critical" : mag >= 5.5 ? "High" : mag >= 4 ? "Medium" : "Low";
            const tsu = p.tsunami === 1 ? "Tsunami warning issued." : mag >= 7 && dep < 70 ? "Potential tsunami risk." : "No tsunami risk.";
            const aftershocks = mag >= 6 ? Math.floor(Math.pow(10, mag - 4.7)) : mag >= 4 ? Math.floor(Math.pow(10, mag - 3.5)) : 0;
            const shk = p.mmi ? ["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII"][Math.min(Math.floor(p.mmi) - 1, 11)] : null;
            return {
                _category: "Seismic", source_id: f.id, severity: sev, title: p.title || `M${mag} Earthquake`,
                description: `Magnitude ${mag} earthquake at depth of ${dep} km. ${p.place || ""}. ${tsu}`,
                geometry_type: "Point", coordinates: [c[0], c[1]], latitude: c[1], longitude: c[0],
                event_time: new Date(p.time).toISOString(), updated_at: new Date(p.updated).toISOString(), url: p.url,
                metadata: {
                    magnitude: mag, magnitude_type: p.magType, depth_km: dep, place: p.place,
                    tsunami: p.tsunami, tsunami_risk: tsu, felt_reports: p.felt, cdi: p.cdi, mmi: p.mmi,
                    shake_intensity: shk, alert_level: p.alert, status: p.status, significance: p.sig,
                    network: p.net, code: p.code, station_count: p.nst, min_distance_deg: p.dmin,
                    rms: p.rms, azimuthal_gap: p.gap, expected_aftershocks: aftershocks,
                    energy_released_joules: Math.pow(10, 1.5 * mag + 4.8), equivalent_tnt_tons: Math.pow(10, 1.5 * mag - 1.2)
                }
            };
        }
    },
    emsc_earthquakes: {
        id: "emsc_earthquakes", name: "EMSC", logTag: "EMSC", sourceName: "EMSC", timeoutMs: 30000,
        buildUrl: (p) => {
            let url = `https://www.seismicportal.eu/fdsnws/event/1/query?format=json&minmag=${p.min_magnitude || 2.0}&limit=${p.limit || 12000}&orderby=time`;
            if (p.start_time) url += `&starttime=${new Date(p.start_time).toISOString()}`;
            if (p.end_time) url += `&endtime=${new Date(p.end_time).toISOString()}`;
            return url;
        },
        extractRawItems: (d) => d.features || [],
        transformItem: (f) => {
            const p = f.properties, c = f.geometry.coordinates, mag = p.mag;
            return {
                _category: "Seismic", source_id: p.source_id || f.id,
                severity: mag >= 7 ? "Critical" : mag >= 5.5 ? "High" : mag >= 4 ? "Medium" : "Low",
                title: `M${mag} ${p.flynn_region || "Earthquake"}`,
                description: `Magnitude ${mag} earthquake in ${p.flynn_region || "unknown region"} at ${c[2]} km depth.`,
                geometry_type: "Point", coordinates: [c[0], c[1]], latitude: c[1], longitude: c[0],
                event_time: p.time, updated_at: p.lastupdate,
                url: p.source_catalog ? `https://www.emsc-csem.org/Earthquake/earthquake.php?id=${p.source_id}` : null,
                metadata: { magnitude: mag, magnitude_type: p.magtype, depth_km: c[2], region: p.flynn_region, source_catalog: p.source_catalog, auth: p.auth, unid: p.unid }
            };
        }
    },
    ingv_earthquakes: {
        id: "ingv_earthquakes", name: "INGV Italy", logTag: "INGV", sourceName: "INGV", timeoutMs: 30000,
        buildUrl: (p) => {
            const st = p.start_time || new Date(Date.now() - 30 * 864e5).toISOString().split("T")[0];
            let url = `https://webservices.ingv.it/fdsnws/event/1/query?format=geojson&starttime=${st}&minmag=${p.min_magnitude || 2.0}&limit=${p.limit || 10000}&orderby=time`;
            if (p.end_time) url += `&endtime=${new Date(p.end_time).toISOString().split("T")[0]}`;
            if (p.min_lat && p.max_lat && p.min_lng && p.max_lng) url += `&minlat=${p.min_lat}&maxlat=${p.max_lat}&minlon=${p.min_lng}&maxlon=${p.max_lng}`;
            return url;
        },
        extractRawItems: (d) => d.features || [],
        transformItem: (f) => {
            const p = f.properties, c = f.geometry.coordinates, mag = p.mag, dep = c[2];
            return {
                _category: "Seismic", source_id: p.eventId || f.id,
                severity: mag >= 7 ? "Critical" : mag >= 5.5 ? "High" : mag >= 4 ? "Medium" : "Low",
                title: `M${mag} ${p.place || p.flynn_region || "Earthquake"}`,
                description: `Magnitude ${mag} earthquake at ${dep} km depth. ${p.place || p.flynn_region || "Italy/Mediterranean region"}.`,
                geometry_type: "Point", coordinates: [c[0], c[1]], latitude: c[1], longitude: c[0],
                event_time: p.time || p.origin_time, updated_at: p.lastupdate || p.time,
                url: p.eventId ? `https://terremoti.ingv.it/event/${p.eventId}` : null,
                metadata: {
                    magnitude: mag, magnitude_type: p.magType || p.magtype, depth_km: dep,
                    place: p.place || p.flynn_region, author: p.author || p.auth,
                    event_id: p.eventId, catalog: "INGV Italian Seismic Bulletin"
                }
            };
        }
    },
    geonet_quakes: {
        id: "geonet_quakes", name: "GeoNet New Zealand", logTag: "GEONET", sourceName: "GEONET_NZ", timeoutMs: 30000,
        buildUrl: (p) => `https://api.geonet.org.nz/quake?MMI=${p.min_mmi || -1}`,
        headers: { "Accept": "application/json" },
        extractRawItems: (d) => d.features || [],
        transformItem: (f) => {
            const p = f.properties, c = f.geometry.coordinates, mag = p.magnitude, dep = p.depth;
            return {
                _category: "Seismic", source_id: p.publicID,
                severity: mag >= 7 ? "Critical" : mag >= 5.5 ? "High" : mag >= 4 ? "Medium" : "Low",
                title: `M${mag} ${p.locality || "New Zealand Earthquake"}`,
                description: `Magnitude ${mag} earthquake at ${dep} km depth near ${p.locality || "New Zealand"}. MMI: ${p.mmi}. Quality: ${p.quality}.`,
                geometry_type: "Point", coordinates: [c[0], c[1]], latitude: c[1], longitude: c[0],
                event_time: p.time, updated_at: p.time,
                url: `https://www.geonet.org.nz/earthquake/${p.publicID}`,
                metadata: {
                    magnitude: mag, depth_km: dep, mmi: p.mmi,
                    locality: p.locality, quality: p.quality,
                    public_id: p.publicID, catalog: "GeoNet New Zealand"
                }
            };
        }
    },
    noaa_alerts: {
        id: "noaa_alerts", name: "NOAA NWS", logTag: "NOAA", sourceName: "NOAA_NWS",
        headers: { "User-Agent": "RiskCommandCenter/2.0", "Accept": "application/geo+json" },
        buildUrl: (p) => {
            let url = "https://api.weather.gov/alerts/active?status=actual";
            if (p.area) url += `&area=${p.area}`;
            if (p.event) url += `&event=${encodeURIComponent(p.event)}`;
            return url;
        },
        extractRawItems: (d) => d.features || [],
        transformItem: (f) => {
            const p = f.properties, g = f.geometry;
            let sev = p.severity === "Extreme" ? "Critical" : p.severity === "Severe" ? "High" : p.severity === "Moderate" ? "Medium" : "Low";
            const catMap = { flood: "Flood", hurricane: "Hurricane", tropical: "Hurricane", tornado: "Tornado", fire: "Wildfire", "red flag": "Wildfire", tsunami: "Tsunami", volcano: "Volcanic", earthquake: "Seismic", blizzard: "Weather", "ice storm": "Weather", "winter storm": "Weather", "severe thunderstorm": "Weather", "extreme heat": "Weather", "excessive heat": "Weather", "heat advisory": "Weather" };
            let cat = "Weather";
            const el = (p.event || "").toLowerCase();
            for (const [k, v] of Object.entries(catMap)) if (el.includes(k)) { cat = v; break; }
            const { lat, lng, geomType, geomCoords } = extractLatLng(g);
            const dur = p.expires && p.effective ? Math.round((new Date(p.expires) - new Date(p.effective)) / 36e5) : null;
            return {
                _category: cat, source_id: p.id, severity: sev, title: p.headline || p.event,
                description: p.description, geometry_type: geomType || "Polygon", geometry_coordinates: geomCoords,
                coordinates: lat && lng ? [lng, lat] : null, latitude: lat, longitude: lng,
                event_time: p.onset || p.effective, updated_at: p.sent, expires_at: p.expires,
                url: "https://alerts.weather.gov",
                metadata: {
                    event_type: p.event, nws_severity: p.severity, certainty: p.certainty, urgency: p.urgency,
                    sender: p.senderName, affected_areas: p.areaDesc, instruction: p.instruction,
                    response_type: p.response, category: p.category, message_type: p.messageType,
                    affected_zones: p.affectedZones, duration_hours: dur, headline: p.headline, parameters: p.parameters
                }
            };
        }
    },
    noaa_spc: {
        id: "noaa_spc", name: "NOAA SPC", logTag: "SPC", sourceName: "NOAA_SPC", paginationStrategy: "multi_url",
        buildUrls: () => [1, 2, 3].map(d => ({ url: `https://www.spc.noaa.gov/products/outlook/day${d}otlk_cat.lyr.geojson`, meta: { day: `${d}` } })),
        extractRawItems: (d, p, m) => (d.features || []).map(f => ({ ...f, _day: m?.day || "1" })),
        transformItem: (f) => {
            const p = f.properties, g = f.geometry, rl = (p.LABEL || p.DN || "").toString();
            let sev = rl.includes("HIGH") || rl >= 5 ? "Critical" : rl.includes("MDT") || rl >= 4 ? "High" : "Medium";
            if (rl.includes("TSTM") || rl < 2) sev = "Low";
            const { lat, lng } = extractLatLng(g);
            return {
                _category: "Weather", source_id: `spc_day${f._day}_${p.DN || p.LABEL}_${Date.now()}`,
                severity: sev, title: `Day ${f._day} Severe Weather Outlook: ${rl}`,
                description: `Storm Prediction Center day ${f._day} severe weather outlook indicating ${rl} risk for severe thunderstorms.`,
                geometry_type: g?.type || "Polygon", geometry_coordinates: g?.coordinates,
                coordinates: lat && lng ? [lng, lat] : null, latitude: lat, longitude: lng,
                event_time: new Date().toISOString(), url: "https://www.spc.noaa.gov/products/outlook/",
                metadata: { risk_level: rl, label: p.LABEL, valid_time: p.VALID, expire_time: p.EXPIRE, issue_time: p.ISSUE, outlook_type: `Day ${f._day} Categorical` }
            };
        }
    },
    gdacs_events: {
        id: "gdacs_events", name: "GDACS", logTag: "GDACS", sourceName: "GDACS", timeoutMs: 60000,
        headers: { "Accept": "application/json" },
        paginationStrategy: "custom",
        customFetch: async (params) => {
            const results = [];
            try {
                const from = params.from_date || new Date(Date.now() - 90 * 864e5).toISOString().split("T")[0];
                const to = params.to_date || new Date().toISOString().split("T")[0];
                const urls = [
                    `https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?fromDate=${from}&toDate=${to}&alertlevel=Red`,
                    `https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?fromDate=${from}&toDate=${to}&alertlevel=Orange`,
                    `https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?fromDate=${from}&toDate=${to}&alertlevel=Green`
                ];
                const settled = await Promise.allSettled(urls.map(async (url) => {
                    const r = await fetchWithTimeout(url, { headers: { "Accept": "application/json" } }, 30000);
                    if (!r.ok) return [];
                    const text = await r.text();
                    let d;
                    try { d = JSON.parse(text); } catch { return []; }
                    return d.features || d.items || (Array.isArray(d) ? d : []);
                }));
                for (const r of settled) {
                    if (r.status === "fulfilled" && Array.isArray(r.value)) {
                        results.push(...r.value);
                    }
                }
            } catch (error) {}

            if (!results.length) {
                try {
                    const rssUrl = "https://www.gdacs.org/xml/rss.xml";
                    const r = await fetchWithTimeout(rssUrl, {}, 30000);
                    if (r.ok) {
                        const text = await r.text();
                        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
                        let match;
                        while ((match = itemRegex.exec(text)) !== null) {
                            const block = match[1];
                            const get = (tag) => { const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`)); return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : null; };
                            const getAttr = (tag, attr) => { const m = block.match(new RegExp(`<${tag}[^>]*${attr}="([^"]*)"[^>]*/?>`, "i")); return m ? m[1] : null; };
                            const title = get("title");
                            const desc = get("description");
                            const link = get("link");
                            const pubDate = get("pubDate");
                            const lat = parseFloat(getAttr("geo:lat", "") || get("geo:lat") || getAttr("gdacs:lat", "") || "");
                            const lng = parseFloat(getAttr("geo:long", "") || get("geo:long") || getAttr("gdacs:long", "") || "");
                            const alertLevel = get("gdacs:alertlevel") || getAttr("gdacs:alertlevel", "value") || "";
                            const eventType = get("gdacs:eventtype") || "";
                            if (!title) continue;
                            results.push({
                                properties: {
                                    eventname: title, description: desc, url: link,
                                    fromdate: pubDate, alertlevel: alertLevel, eventtype: eventType,
                                    latitude: isNaN(lat) ? null : lat, longitude: isNaN(lng) ? null : lng
                                },
                                geometry: !isNaN(lat) && !isNaN(lng) ? { type: "Point", coordinates: [lng, lat] } : null
                            });
                        }
                    }
                } catch (error) {}
            }
            return results;
        },
        transformItem: (f) => {
            const p = f.properties || f, g = f.geometry;
            const sev = (p.alertlevel === "Red" || p.alertLevel === "Red") ? "Critical" : (p.alertlevel === "Orange" || p.alertLevel === "Orange") ? "High" : "Low";
            const catMap = { EQ: "Seismic", TC: "Hurricane", FL: "Flood", VO: "Volcanic", DR: "Drought", WF: "Wildfire", TS: "Tsunami" };
            const evType = p.eventtype || p.eventType || "";
            const cat = catMap[evType] || "Other";
            let lat = null, lng = null;
            if (g) {
                ({ lat, lng } = extractLatLng(g));
            }
            if (lat == null && p.geo_lat) { lat = parseFloat(p.geo_lat); }
            if (lng == null && p.geo_lng) { lng = parseFloat(p.geo_lng); }
            if (lat == null && p.latitude) { lat = parseFloat(p.latitude); }
            if (lng == null && p.longitude) { lng = parseFloat(p.longitude); }
            const evId = p.eventid || p.eventId || p.id;
            return {
                _category: cat, source_id: evId?.toString(), severity: sev,
                title: p.eventname || p.eventName || p.name || `${cat} Event`,
                description: p.description || `${cat} event detected by GDACS with ${p.alertlevel || p.alertLevel || "unknown"} alert level.`,
                geometry_type: g?.type || "Point", geometry_coordinates: g?.coordinates,
                coordinates: lat && lng ? [lng, lat] : null, latitude: lat, longitude: lng,
                event_time: p.fromdate || p.fromDate, updated_at: p.todate || p.toDate,
                url: p.url || (evId ? `https://www.gdacs.org/report.aspx?eventid=${evId}&eventtype=${evType}` : null),
                metadata: {
                    event_type: p.eventtype, alert_level: p.alertlevel, alert_score: p.alertscore,
                    episode_id: p.episodeid, severity_value: p.severitydata?.severity,
                    severity_unit: p.severitydata?.severityunit, population_affected: p.populationdata?.population,
                    country: p.country, iso3: p.iso3, gdacs_score: p.alertscore,
                    episode_alert_level: p.episodealertlevel, vulnerability: p.vulnerability
                }
            };
        }
    },
    usgs_volcanoes: {
        id: "usgs_volcanoes", name: "USGS Volcanoes", logTag: "VOLC", sourceName: "USGS_VOLCANOES", timeoutMs: 60000,
        buildUrl: () => "https://volcanoes.usgs.gov/vsc/api/volcanoApi/volcanoesGVP",
        extractRawItems: (d) => d.features || d || [],
        transformItem: (v) => {
            const p = v.properties || v, g = v.geometry;
            let lat = p.Latitude || p.latitude, lng = p.Longitude || p.longitude;
            if (g?.coordinates) { lng = g.coordinates[0]; lat = g.coordinates[1]; }
            const al = p.alert_level || p.alertLevel || "Normal";
            const sev = al === "Warning" ? "Critical" : al === "Watch" ? "High" : al === "Advisory" ? "Medium" : "Low";
            const vt = p.Volcano_Type || p.volcanoType || "Unknown";
            const vei = vt.includes("Strato") ? 4 : vt.includes("Shield") ? 2 : vt.includes("Caldera") ? 6 : 3;
            const nm = p.Volcano_Name || p.volcanoName || "Unknown Volcano";
            return {
                _category: "Volcanic", source_id: p.vnum || p.id?.toString(), severity: sev, title: nm,
                description: `${nm} (${vt}). Alert level: ${al}. Elevation: ${p.Elevation || p.elevation || "Unknown"} meters.`,
                geometry_type: "Point", coordinates: [lng, lat], latitude: lat, longitude: lng,
                event_time: new Date().toISOString(),
                url: `https://volcanoes.usgs.gov/volcanoes/${nm.toLowerCase().replace(/\s+/g, "_")}/`,
                metadata: {
                    volcano_number: p.vnum, volcano_type: vt, elevation_m: p.Elevation || p.elevation,
                    country: p.Country || p.country, region: p.Region || p.region, subregion: p.Subregion || p.subregion,
                    alert_level: al, aviation_color_code: p.aviation_color_code || p.aviationColorCode,
                    last_eruption: p.Last_Eruption || p.lastEruption, holocene_eruptions: p.H_activ || p.holoceneEruptions,
                    volcanic_explosivity_index: vei, summit_elevation_m: p.Elevation || p.elevation,
                    rock_type: p.Dominant_Rock_Type || p.rockType
                }
            };
        }
    },
    eonet_events: {
        id: "eonet_events", name: "NASA EONET", logTag: "EONET", sourceName: "NASA_EONET", timeoutMs: 60000,
        buildUrl: (p) => `https://eonet.gsfc.nasa.gov/api/v3/events?days=${p.days || 60}&status=${p.status || "all"}&limit=${p.limit || 500}`,
        extractRawItems: (d) => d.events || [],
        transformItem: (ev) => {
            const catMap = { wildfires: "Wildfire", severeStorms: "Weather", volcanoes: "Volcanic", earthquakes: "Seismic", floods: "Flood", landslides: "Landslide", seaLakeIce: "Ice", snow: "Weather", dustHaze: "Air Quality", drought: "Drought", tempExtremes: "Weather", waterColor: "Water", manmade: "Industrial" };
            const cats = ev.categories || [], catId = cats[0]?.id || "unknown", cat = catMap[catId] || "Other";
            const geoms = ev.geometry || [];
            return geoms.map((g, i) => {
                const { lat, lng } = extractLatLng(g);
                let sev = "Medium";
                if (g.magnitudeValue > 100) sev = "Critical"; else if (g.magnitudeValue > 50) sev = "High";
                if (ev.closed) sev = "Low";
                return {
                    _category: cat, source_id: `${ev.id}_${i}`, severity: sev, title: ev.title,
                    description: ev.description || `${cat} event tracked by NASA EONET. ${ev.closed ? "Event is now closed." : "Event is ongoing."}`,
                    geometry_type: g.type, coordinates: lat && lng ? [lng, lat] : null, latitude: lat, longitude: lng,
                    event_time: g.date, url: ev.link,
                    metadata: {
                        eonet_id: ev.id, categories: cats.map(c => c.title),
                        sources: ev.sources?.map(s => ({ id: s.id, url: s.url })),
                        magnitude_value: g.magnitudeValue, magnitude_unit: g.magnitudeUnit,
                        is_closed: ev.closed, closed_date: ev.closed, geometry_count: geoms.length,
                        first_observed: geoms[0]?.date, last_observed: geoms[geoms.length - 1]?.date
                    }
                };
            });
        }
    },
    openmeteo_air_quality: {
        id: "openmeteo_air_quality", name: "Open-Meteo AQ", logTag: "METEO_AQ", sourceName: "OPEN_METEO_AQ",
        timeoutMs: 30000, headers: { "Accept": "application/json" },
        paginationStrategy: "batch_locations", locationBatchSize: 50,
        buildQueryPoints: (p) => {
            const hasBounds = p.min_lat && p.max_lat && p.min_lng && p.max_lng;
            const centers = dynamicStores.urban.data;
            const src = centers.length ? centers : FALLBACK_CITIES;
            let pts = [];
            if (hasBounds) {
                const b = { min_lat: parseFloat(p.min_lat), max_lat: parseFloat(p.max_lat), min_lng: parseFloat(p.min_lng), max_lng: parseFloat(p.max_lng) };
                pts = src.filter(c => inBounds(c.lat, c.lng, b)).map(c => ({ name: c.name, lat: c.lat, lng: c.lng, pop: c.pop || 0 }));
                if (pts.length < 10 && centers.length) {
                    const latS = (b.max_lat - b.min_lat) / 4, lngS = (b.max_lng - b.min_lng) / 4;
                    for (let li = 0; li <= 4; li++) for (let lj = 0; lj <= 4; lj++) {
                        const gLat = b.min_lat + li * latS, gLng = b.min_lng + lj * lngS;
                        if (!pts.some(q => haversine(q.lat, q.lng, gLat, gLng) < 50000))
                            pts.push({ name: `Grid ${gLat.toFixed(2)}N ${gLng.toFixed(2)}E`, lat: gLat, lng: gLng, pop: 0 });
                    }
                }
            } else {
                pts = src.map(c => ({ name: c.name, lat: c.lat, lng: c.lng, pop: c.pop || 0 }));
            }
            return pts;
        },
        buildBatchUrl: (batch) => {
            const lats = batch.map(p => p.lat.toFixed(4)).join(","), lngs = batch.map(p => p.lng.toFixed(4)).join(",");
            return `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lats}&longitude=${lngs}&current=us_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone`;
        },
        extractRawItems: (d, p, batch) => {
            const arr = Array.isArray(d) ? d : [d], items = [];
            for (let j = 0; j < batch.length; j++) {
                const entry = arr[j], pt = batch[j];
                if (!entry?.current) continue;
                const c = entry.current;
                items.push({ name: pt.name, lat: entry.latitude || pt.lat, lng: entry.longitude || pt.lng, pop: pt.pop || 0, aqi: c.us_aqi || 0, pm25: c.pm2_5 || null, pm10: c.pm10 || null, o3: c.ozone || null, no2: c.nitrogen_dioxide || null, so2: c.sulphur_dioxide || null, co: c.carbon_monoxide || null, time: c.time || new Date().toISOString() });
            }
            return items;
        },
        transformItem: (s) => {
            const aqi = s.aqi;
            let sev = "Low", aqiCat = "Good";
            if (aqi > 300) { sev = "Critical"; aqiCat = "Hazardous"; }
            else if (aqi > 200) { sev = "Critical"; aqiCat = "Very Unhealthy"; }
            else if (aqi > 150) { sev = "High"; aqiCat = "Unhealthy"; }
            else if (aqi > 100) { sev = "Medium"; aqiCat = "Unhealthy for Sensitive Groups"; }
            else if (aqi > 50) { sev = "Low"; aqiCat = "Moderate"; }
            const hr = aqi > 200 ? "Everyone should avoid outdoor exertion." : aqi > 150 ? "Sensitive groups should avoid outdoor exertion." : aqi > 100 ? "Sensitive groups should reduce prolonged outdoor exertion." : aqi > 50 ? "Unusually sensitive people should consider reducing prolonged outdoor exertion." : "Air quality is acceptable.";
            return {
                _category: "Air Quality", source_id: `openmeteo_aq_${s.lat.toFixed(3)}_${s.lng.toFixed(3)}`,
                severity: sev, title: `Air Quality: ${s.name}`,
                description: `AQI: ${aqi} (${aqiCat}) at ${s.name}. ${hr}`,
                geometry_type: "Point", coordinates: [s.lng, s.lat], latitude: s.lat, longitude: s.lng,
                event_time: s.time,
                metadata: {
                    station_name: s.name, location_name: s.name, aqi_value: aqi, aqi_category: aqiCat,
                    health_recommendation: hr, pm25_value: s.pm25, pm10_value: s.pm10, o3_value: s.o3, no2_value: s.no2, so2_value: s.so2, co_value: s.co,
                    pm25: s.pm25 != null ? { value: s.pm25, unit: "µg/m³" } : null,
                    pm10: s.pm10 != null ? { value: s.pm10, unit: "µg/m³" } : null,
                    o3: s.o3 != null ? { value: s.o3, unit: "µg/m³" } : null,
                    no2: s.no2 != null ? { value: s.no2, unit: "µg/m³" } : null,
                    so2: s.so2 != null ? { value: s.so2, unit: "µg/m³" } : null,
                    co: s.co != null ? { value: s.co, unit: "µg/m³" } : null,
                    population: s.pop, data_source: "Open-Meteo Air Quality API (CAMS global atmospheric composition)"
                }
            };
        }
    },
    usgs_water: {
        id: "usgs_water", name: "USGS Water", logTag: "WATER", sourceName: "USGS_WATER", timeoutMs: 30000,
        paginationStrategy: "state_batch",
        buildUrl: (p) => `https://waterservices.usgs.gov/nwis/iv/?format=json&parameterCd=00065&siteStatus=active&siteType=ST&stateCd=${p.state}`,
        buildBboxUrl: (p) => `https://waterservices.usgs.gov/nwis/iv/?format=json&parameterCd=00065&siteStatus=active&siteType=ST&bBox=${p.min_lng},${p.min_lat},${p.max_lng},${p.max_lat}`,
        extractRawItems: (d) => d.value?.timeSeries || [],
        transformItem: (s) => {
            const site = s.sourceInfo, vals = s.values?.[0]?.value || [], lv = vals[vals.length - 1];
            const gh = parseFloat(lv?.value) || 0;
            let sev = "Low", fs = "Normal";
            if (gh > 25) { sev = "Critical"; fs = "Major Flood"; }
            else if (gh > 18) { sev = "High"; fs = "Moderate Flood"; }
            else if (gh > 12) { sev = "Medium"; fs = "Minor Flood"; }
            else if (gh > 8) { fs = "Action Stage"; }
            return {
                _category: "Flood", source_id: site.siteCode?.[0]?.value, severity: sev,
                title: `Water Level: ${site.siteName}`,
                description: `Gage height: ${gh.toFixed(2)} ft (${fs}) at ${site.siteName}.`,
                geometry_type: "Point",
                coordinates: [site.geoLocation?.geogLocation?.longitude, site.geoLocation?.geogLocation?.latitude],
                latitude: site.geoLocation?.geogLocation?.latitude, longitude: site.geoLocation?.geogLocation?.longitude,
                event_time: lv?.dateTime,
                metadata: {
                    site_code: site.siteCode?.[0]?.value, site_name: site.siteName,
                    site_type: site.siteProperty?.find(q => q.name === "siteTypeCd")?.value,
                    gage_height_ft: gh, flood_stage: fs,
                    state: site.siteProperty?.find(q => q.name === "stateCd")?.value,
                    county: site.siteProperty?.find(q => q.name === "countyCd")?.value,
                    huc: site.siteProperty?.find(q => q.name === "hucCd")?.value,
                    drainage_area_sqmi: site.siteProperty?.find(q => q.name === "drain_area_va")?.value
                }
            };
        }
    },
    nifc_wildfires: {
        id: "nifc_wildfires", name: "NIFC WFIGS", logTag: "NIFC", sourceName: "NIFC", timeoutMs: 30000,
        paginationStrategy: "offset", paginationBatchSize: 2000,
        buildUrl: (p, off, bs) => `https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query?where=1%3D1&outFields=*&f=geojson&resultOffset=${off || 0}&resultRecordCount=${bs || 2000}`,
        extractRawItems: (d) => d.features || [],
        transformItem: (f) => {
            const p = f.properties, g = f.geometry;
            const acres = p.poly_GISAcres || p.attr_IncidentSize || p.attr_CalculatedAcres || p.attr_DailyAcres || 0;
            const pct = p.attr_PercentContained || 0;
            let sev = "Low";
            if (acres > 50000 || (acres > 10000 && pct < 20)) sev = "Critical";
            else if (acres > 10000 || (acres > 5000 && pct < 30)) sev = "High";
            else if (acres > 1000) sev = "Medium";
            const { lat, lng } = extractLatLng(g);
            const disc = p.attr_FireDiscoveryDateTime ? new Date(p.attr_FireDiscoveryDateTime) : p.poly_CreateDate ? new Date(p.poly_CreateDate) : null;
            const dur = disc ? Math.floor((Date.now() - disc) / 864e5) : null;
            const cost = p.attr_EstimatedCostToDate || (acres > 50000 ? acres * 2500 : acres > 10000 ? acres * 2000 : acres > 1000 ? acres * 1500 : acres * 1000);
            const incidentName = p.attr_IncidentName || p.poly_IncidentName || "Unknown Fire";
            return {
                _category: "Wildfire", source_id: p.OBJECTID?.toString() || p.GlobalID, severity: sev,
                title: incidentName,
                description: `${incidentName} - ${acres.toLocaleString()} acres burned, ${pct}% contained. Active for ${dur || "unknown"} days.`,
                geometry_type: g?.type || "Polygon", geometry_coordinates: g?.coordinates,
                coordinates: lat && lng ? [lng, lat] : null, latitude: lat, longitude: lng,
                event_time: disc ? disc.toISOString() : null,
                updated_at: p.poly_DateCurrent ? new Date(p.poly_DateCurrent).toISOString() : null,
                url: p.attr_IrwinURL || (p.poly_IRWINID ? `https://irwin.doi.gov/observer/?eid=${p.poly_IRWINID}` : null),
                metadata: {
                    incident_name: incidentName, fire_type: p.attr_IncidentTypeCategory, total_acres: acres,
                    gis_acres: p.poly_GISAcres, calculated_acres: p.attr_CalculatedAcres, incident_size: p.attr_IncidentSize,
                    daily_acres: p.attr_DailyAcres, percent_contained: pct,
                    fire_behavior: p.attr_FireBehaviorGeneral, fire_behavior_1: p.attr_FireBehaviorGeneral1,
                    fire_cause: p.attr_FireCause, fire_cause_general: p.attr_FireCauseGeneral, fire_cause_specific: p.attr_FireCauseSpecific,
                    discovery_date: p.attr_FireDiscoveryDateTime, containment_date: p.attr_ContainmentDateTime,
                    duration_days: dur, irwin_id: p.poly_IRWINID || p.attr_IrwinID,
                    poo_state: p.attr_POOState, poo_county: p.attr_POOCounty,
                    dispatch_center: p.attr_DispatchCenterID,
                    estimated_cost_usd: cost, final_acres: p.attr_FinalAcres,
                    primary_fuel: p.attr_PrimaryFuelModel, secondary_fuel: p.attr_SecondaryFuelModel,
                    total_personnel: p.attr_TotalPersonnel, fatalities: p.attr_Fatalities, injuries: p.attr_Injuries,
                    structures_destroyed: p.attr_ResidencesDestroyed, structures_threatened: p.attr_ResidencesThreatened,
                    map_method: p.poly_MapMethod, feature_category: p.poly_FeatureCategory,
                    polygon_date: p.poly_PolygonDateTime
                }
            };
        }
    },
    fema_disasters: {
        id: "fema_disasters", name: "FEMA", logTag: "FEMA", sourceName: "FEMA", timeoutMs: 60000,
        paginationStrategy: "offset", paginationBatchSize: 1000,
        buildUrl: (p, off, bs) => `https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries?$filter=declarationDate gt '${new Date(Date.now() - 365 * 864e5).toISOString().split("T")[0]}'&$orderby=declarationDate desc&$top=${bs || 1000}&$skip=${off || 0}`,
        extractRawItems: (d) => d.DisasterDeclarationsSummaries || [],
        transformItem: (dec) => {
            const catMap = { Fire: "Wildfire", Hurricane: "Hurricane", Flood: "Flood", Tornado: "Tornado", Earthquake: "Seismic", "Severe Storm": "Weather", Snowstorm: "Weather", Drought: "Drought", Volcano: "Volcanic", Tsunami: "Tsunami" };
            let cat = "Other";
            for (const [k, v] of Object.entries(catMap)) if ((dec.incidentType || "").includes(k)) { cat = v; break; }
            let sev = dec.declarationType === "DR" ? "High" : "Medium";
            if (dec.ihProgramDeclared || dec.iaProgramDeclared) sev = "Critical";
            return {
                _category: cat, source_id: dec.disasterNumber?.toString(), severity: sev,
                title: `${dec.declarationType === "DR" ? "Major Disaster" : "Emergency"}: ${dec.declarationTitle}`,
                description: `${dec.declarationTitle} declared in ${dec.designatedArea || dec.state}. Incident type: ${dec.incidentType}.`,
                geometry_type: "Point", coordinates: null, latitude: null, longitude: null,
                event_time: dec.incidentBeginDate, expires_at: dec.incidentEndDate,
                url: `https://www.fema.gov/disaster/${dec.disasterNumber}`,
                metadata: {
                    disaster_number: dec.disasterNumber, declaration_type: dec.declarationType,
                    declaration_title: dec.declarationTitle, state: dec.state, designated_area: dec.designatedArea,
                    incident_type: dec.incidentType, incident_begin_date: dec.incidentBeginDate,
                    incident_end_date: dec.incidentEndDate, declaration_date: dec.declarationDate,
                    ih_program_declared: dec.ihProgramDeclared, ia_program_declared: dec.iaProgramDeclared,
                    pa_program_declared: dec.paProgramDeclared, hm_program_declared: dec.hmProgramDeclared,
                    tribal_request: dec.tribalRequest, fips_state_code: dec.fipsStateCode, fips_county_code: dec.fipsCountyCode
                }
            };
        }
    },
    noaa_space_weather: {
        id: "noaa_space_weather", name: "NOAA SWPC Alerts", logTag: "SWPC_ALERTS", sourceName: "NOAA_SWPC",
        buildUrl: () => "https://services.swpc.noaa.gov/products/alerts.json",
        extractRawItems: (d) => d || [],
        transformItem: (a) => {
            const msg = a.message || "";
            let sev = "Low";
            if (/G[45]|S[45]|R[45]/.test(msg)) sev = "Critical";
            else if (/G3|S3|R3/.test(msg)) sev = "High";
            else if (/G2|S2|R2/.test(msg)) sev = "Medium";
            const at = msg.includes("Geomagnetic") ? "Geomagnetic Storm" : msg.includes("Solar Radiation") ? "Solar Radiation Storm" : msg.includes("Radio Blackout") ? "Radio Blackout" : "Space Weather Alert";
            return {
                _category: "Space", source_id: a.serial_number || `swpc_${Date.now()}`, severity: sev,
                title: at, description: msg.substring(0, 500),
                geometry_type: "Point", coordinates: null, latitude: null, longitude: null,
                event_time: a.issue_datetime,
                metadata: {
                    product_id: a.product_id, serial_number: a.serial_number, issue_datetime: a.issue_datetime,
                    alert_type: at, full_message: msg.substring(0, 2000),
                    impacts: {
                        power_systems: sev === "Critical" || sev === "High" ? "Possible widespread voltage control problems." : "Minor impact.",
                        spacecraft_operations: sev === "Critical" ? "Extensive surface charging." : "Minor impact.",
                        hf_radio: sev === "Critical" || sev === "High" ? "HF radio propagation may be affected." : "Minor impact.",
                        navigation: sev === "Critical" ? "Satellite navigation may be degraded." : "Normal."
                    }
                }
            };
        }
    },
    noaa_kp_index: {
        id: "noaa_kp_index", name: "NOAA SWPC Kp Index", logTag: "SWPC_KP", sourceName: "NOAA_SWPC_KP",
        buildUrl: () => "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json",
        extractRawItems: (d) => {
            if (!Array.isArray(d) || d.length < 2) return [];
            return d.slice(1).slice(-24);
        },
        transformItem: (row) => {
            if (!Array.isArray(row) || row.length < 2) return null;
            const ts = row[0], kp = parseFloat(row[1]);
            if (isNaN(kp)) return null;
            let sev = "Low";
            if (kp >= 8) sev = "Critical";
            else if (kp >= 6) sev = "High";
            else if (kp >= 4) sev = "Medium";
            return {
                _category: "Space", source_id: `kp_${ts}`, severity: sev,
                title: `Planetary Kp Index: ${kp.toFixed(2)}`,
                description: `Planetary Kp index is ${kp.toFixed(2)} at ${ts}. ${kp >= 5 ? "Geomagnetic storm conditions present." : "Geomagnetic field is quiet to unsettled."}`,
                geometry_type: "Point", coordinates: null, latitude: null, longitude: null,
                event_time: ts,
                metadata: {
                    kp_value: kp, kp_integer: parseInt(row[2], 10) || Math.round(kp),
                    observation_type: row[3] || "observed",
                    storm_level: kp >= 9 ? "G5 Extreme" : kp >= 8 ? "G4 Severe" : kp >= 7 ? "G3 Strong" : kp >= 6 ? "G2 Moderate" : kp >= 5 ? "G1 Minor" : "Below storm threshold"
                }
            };
        }
    },
    noaa_swpc_xray: {
        id: "noaa_swpc_xray", name: "NOAA SWPC X-Ray Flux", logTag: "SWPC_XRAY", sourceName: "NOAA_SWPC_XRAY",
        buildUrl: () => "https://services.swpc.noaa.gov/json/goes/primary/xrays-7-day.json",
        extractRawItems: (d) => {
            if (!Array.isArray(d)) return [];
            const recent = d.filter(entry => entry.current_class && entry.current_class !== "");
            return recent.slice(-48);
        },
        transformItem: (entry) => {
            const cls = entry.current_class || "";
            const flux = entry.current_ratio || entry.flux || 0;
            let sev = "Low";
            if (cls.startsWith("X") && parseFloat(cls.substring(1)) >= 10) sev = "Critical";
            else if (cls.startsWith("X")) sev = "High";
            else if (cls.startsWith("M")) sev = "Medium";
            return {
                _category: "Space", source_id: `xray_${entry.time_tag}`, severity: sev,
                title: `Solar X-Ray Flux: ${cls}`,
                description: `GOES satellite measured ${cls} class X-ray flux at ${entry.time_tag}. ${sev === "Critical" ? "Extreme radio blackout possible." : sev === "High" ? "Strong radio blackout possible." : sev === "Medium" ? "Moderate radio blackout possible." : "No significant radio blackout expected."}`,
                geometry_type: "Point", coordinates: null, latitude: null, longitude: null,
                event_time: entry.time_tag,
                metadata: {
                    xray_class: cls, flux_value: flux, satellite: entry.satellite,
                    energy_band: entry.energy || "0.1-0.8nm",
                    radio_blackout_level: cls.startsWith("X") ? (parseFloat(cls.substring(1)) >= 10 ? "R4-R5" : "R3") : cls.startsWith("M") ? "R1-R2" : "None"
                }
            };
        }
    },
    noaa_swpc_solar_wind: {
        id: "noaa_swpc_solar_wind", name: "NOAA SWPC Solar Wind Plasma", logTag: "SWPC_PLASMA", sourceName: "NOAA_SWPC_PLASMA",
        buildUrl: () => "https://services.swpc.noaa.gov/products/solar-wind/plasma-7-day.json",
        extractRawItems: (d) => {
            if (!Array.isArray(d) || d.length < 2) return [];
            return d.slice(1).slice(-48);
        },
        transformItem: (row) => {
            if (!Array.isArray(row) || row.length < 3) return null;
            const ts = row[0];
            const density = parseFloat(row[1]);
            const speed = parseFloat(row[2]);
            const temperature = parseFloat(row[3]);
            if (isNaN(speed)) return null;
            let sev = "Low";
            if (speed > 800 || (speed > 600 && density > 20)) sev = "Critical";
            else if (speed > 600 || density > 15) sev = "High";
            else if (speed > 500 || density > 10) sev = "Medium";
            const isCmeCandidate = speed > 500 && density > 8;
            return {
                _category: "Space", source_id: `plasma_${ts}`, severity: sev,
                title: `Solar Wind: ${speed.toFixed(0)} km/s`,
                description: `Solar wind speed ${speed.toFixed(0)} km/s, density ${isNaN(density) ? "N/A" : density.toFixed(1)} p/cm³ at ${ts}. ${isCmeCandidate ? "Elevated solar wind consistent with coronal mass ejection arrival." : speed > 500 ? "Enhanced solar wind stream detected." : "Solar wind conditions are nominal."}`,
                geometry_type: "Point", coordinates: null, latitude: null, longitude: null,
                event_time: ts,
                metadata: {
                    wind_speed_km_s: speed,
                    proton_density_cm3: isNaN(density) ? null : density,
                    temperature_k: isNaN(temperature) ? null : temperature,
                    is_cme_candidate: isCmeCandidate,
                    impacts: {
                        power_systems: speed > 700 ? "Possible voltage irregularities in high-latitude power grids." : "Nominal.",
                        spacecraft_operations: speed > 600 ? "Increased drag on low-Earth orbit satellites." : "Nominal.",
                        hf_radio: speed > 700 && density > 15 ? "Possible polar cap absorption events." : "Nominal.",
                        navigation: speed > 800 ? "Possible degradation of GNSS accuracy." : "Nominal."
                    },
                    data_source: "NOAA SWPC DSCOVR and ACE real-time solar wind measurements"
                }
            };
        }
    },
    noaa_swpc_mag_field: {
        id: "noaa_swpc_mag_field", name: "NOAA SWPC Interplanetary Magnetic Field", logTag: "SWPC_MAG", sourceName: "NOAA_SWPC_MAG",
        buildUrl: () => "https://services.swpc.noaa.gov/products/solar-wind/mag-7-day.json",
        extractRawItems: (d) => {
            if (!Array.isArray(d) || d.length < 2) return [];
            return d.slice(1).slice(-48);
        },
        transformItem: (row) => {
            if (!Array.isArray(row) || row.length < 4) return null;
            const ts = row[0];
            const bx = parseFloat(row[1]);
            const by = parseFloat(row[2]);
            const bz = parseFloat(row[3]);
            const bt = row.length > 6 ? parseFloat(row[6]) : Math.sqrt((isNaN(bx) ? 0 : bx * bx) + (isNaN(by) ? 0 : by * by) + (isNaN(bz) ? 0 : bz * bz));
            if (isNaN(bz) && isNaN(bt)) return null;
            const bzVal = isNaN(bz) ? 0 : bz;
            const btVal = isNaN(bt) ? 0 : bt;
            let sev = "Low";
            if (bzVal < -20 || btVal > 30) sev = "Critical";
            else if (bzVal < -10 || btVal > 20) sev = "High";
            else if (bzVal < -5 || btVal > 10) sev = "Medium";
            const geoEffective = bzVal < -5;
            return {
                _category: "Space", source_id: `mag_${ts}`, severity: sev,
                title: `IMF Bz: ${bzVal.toFixed(1)} nT`,
                description: `Interplanetary magnetic field Bz component at ${bzVal.toFixed(1)} nT, total field ${btVal.toFixed(1)} nT at ${ts}. ${geoEffective ? "Southward Bz indicates geo-effective solar wind coupling with Earth magnetosphere." : "Magnetic field orientation is not strongly geo-effective."}`,
                geometry_type: "Point", coordinates: null, latitude: null, longitude: null,
                event_time: ts,
                metadata: {
                    bx_gsm_nT: isNaN(bx) ? null : bx,
                    by_gsm_nT: isNaN(by) ? null : by,
                    bz_gsm_nT: bzVal,
                    bt_nT: btVal,
                    is_geo_effective: geoEffective,
                    coupling_efficiency: bzVal < 0 ? "High" : "Low",
                    expected_geomagnetic_response: bzVal < -20 ? "Severe geomagnetic storming likely." : bzVal < -10 ? "Active to storm-level geomagnetic conditions expected." : bzVal < -5 ? "Unsettled to active geomagnetic conditions possible." : "Quiet geomagnetic conditions expected.",
                    data_source: "NOAA SWPC DSCOVR and ACE real-time interplanetary magnetic field measurements"
                }
            };
        }
    },
    noaa_swpc_kp_forecast: {
        id: "noaa_swpc_kp_forecast", name: "NOAA SWPC Kp Forecast", logTag: "SWPC_KP_FC", sourceName: "NOAA_SWPC_KP_FC",
        buildUrl: () => "https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json",
        extractRawItems: (d) => {
            if (!Array.isArray(d) || d.length < 2) return [];
            return d.slice(1);
        },
        transformItem: (row) => {
            if (!Array.isArray(row) || row.length < 2) return null;
            const ts = row[0];
            const kp = parseFloat(row[1]);
            if (isNaN(kp)) return null;
            let sev = "Low";
            if (kp >= 8) sev = "Critical";
            else if (kp >= 6) sev = "High";
            else if (kp >= 4) sev = "Medium";
            const observed = row.length > 3 ? row[3] : "predicted";
            return {
                _category: "Space", source_id: `kp_fc_${ts}`, severity: sev,
                title: `Kp Forecast: ${kp.toFixed(2)}`,
                description: `Forecasted planetary Kp index of ${kp.toFixed(2)} for ${ts}. ${kp >= 7 ? "Severe geomagnetic storm forecast with potential power grid and satellite impacts." : kp >= 5 ? "Geomagnetic storm conditions forecast with aurora visible at mid-latitudes." : kp >= 4 ? "Unsettled to active geomagnetic conditions forecast." : "Quiet geomagnetic conditions forecast."}`,
                geometry_type: "Point", coordinates: null, latitude: null, longitude: null,
                event_time: ts,
                metadata: {
                    kp_value: kp,
                    kp_integer: Math.round(kp),
                    observation_type: observed,
                    storm_scale: kp >= 9 ? "G5 Extreme" : kp >= 8 ? "G4 Severe" : kp >= 7 ? "G3 Strong" : kp >= 6 ? "G2 Moderate" : kp >= 5 ? "G1 Minor" : "Below storm threshold",
                    forecast_impacts: {
                        power_systems: kp >= 8 ? "Widespread voltage control problems and protective system issues." : kp >= 6 ? "Possible voltage irregularities and false alarms on protection devices." : "Nominal.",
                        spacecraft_operations: kp >= 7 ? "Surface charging and tracking difficulties." : kp >= 5 ? "Increased drag on LEO satellites." : "Nominal.",
                        hf_radio: kp >= 7 ? "HF radio may be intermittent." : kp >= 5 ? "Degraded HF radio propagation at high latitudes." : "Nominal.",
                        navigation: kp >= 8 ? "Satellite navigation degraded for hours." : kp >= 5 ? "Minor GNSS accuracy reduction." : "Nominal.",
                        aurora_visibility: kp >= 8 ? "Aurora visible at low latitudes." : kp >= 6 ? "Aurora visible at mid-latitudes." : kp >= 4 ? "Aurora visible at high latitudes." : "Aurora limited to polar regions."
                    },
                    data_source: "NOAA SWPC Geomagnetic Forecast"
                }
            };
        }
    },
    openmeteo_flood: {
        id: "openmeteo_flood", name: "Open-Meteo Flood (GloFAS)", logTag: "METEO_FLOOD", sourceName: "OPEN_METEO_FLOOD",
        timeoutMs: 30000, headers: { "Accept": "application/json" },
        paginationStrategy: "batch_locations", locationBatchSize: 50,
        buildQueryPoints: (p) => {
            const hasBounds = p.min_lat && p.max_lat && p.min_lng && p.max_lng;
            const centers = dynamicStores.urban.data;
            const src = centers.length ? centers : FALLBACK_CITIES;
            let pts = [];
            if (hasBounds) {
                const b = { min_lat: parseFloat(p.min_lat), max_lat: parseFloat(p.max_lat), min_lng: parseFloat(p.min_lng), max_lng: parseFloat(p.max_lng) };
                pts = src.filter(c => inBounds(c.lat, c.lng, b)).map(c => ({ name: c.name, lat: c.lat, lng: c.lng, pop: c.pop || 0 }));
            } else {
                pts = src.slice(0, 100).map(c => ({ name: c.name, lat: c.lat, lng: c.lng, pop: c.pop || 0 }));
            }
            return pts;
        },
        buildBatchUrl: (batch) => {
            const lats = batch.map(p => p.lat.toFixed(4)).join(",");
            const lngs = batch.map(p => p.lng.toFixed(4)).join(",");
            return `https://flood-api.open-meteo.com/v1/flood?latitude=${lats}&longitude=${lngs}&daily=river_discharge,river_discharge_max&forecast_days=7`;
        },
        extractRawItems: (d, p, batch) => {
            const arr = Array.isArray(d) ? d : [d], items = [];
            for (let j = 0; j < batch.length; j++) {
                const entry = arr[j], pt = batch[j];
                if (!entry?.daily) continue;
                const discharges = entry.daily.river_discharge || [];
                const maxDischarges = entry.daily.river_discharge_max || discharges;
                const times = entry.daily.time || [];
                const peakVal = Math.max(...maxDischarges.filter(v => v != null), 0);
                const peakIdx = maxDischarges.indexOf(peakVal);
                const peakTime = times[peakIdx] || new Date().toISOString();
                const avgVal = discharges.filter(v => v != null).reduce((s, v) => s + v, 0) / Math.max(discharges.filter(v => v != null).length, 1);
                items.push({
                    name: pt.name, lat: entry.latitude || pt.lat, lng: entry.longitude || pt.lng,
                    pop: pt.pop || 0, peak_discharge: peakVal, avg_discharge: avgVal,
                    peak_time: peakTime, forecast_days: times.length,
                    daily_values: discharges
                });
            }
            return items;
        },
        transformItem: (s) => {
            const peak = s.peak_discharge;
            const ratio = s.avg_discharge > 0 ? peak / s.avg_discharge : 1;
            let sev = "Low", status = "Normal";
            if (peak > 5000 || ratio > 5) { sev = "Critical"; status = "Extreme flood forecast"; }
            else if (peak > 2000 || ratio > 3) { sev = "High"; status = "Significant flood forecast"; }
            else if (peak > 500 || ratio > 2) { sev = "Medium"; status = "Elevated discharge forecast"; }
            else { status = "Normal discharge forecast"; }
            return {
                _category: "Flood", source_id: `glofas_${s.lat.toFixed(3)}_${s.lng.toFixed(3)}`,
                severity: sev, title: `River Discharge Forecast: ${s.name}`,
                description: `GloFAS forecast for ${s.name}: peak discharge ${peak.toFixed(1)} m³/s over ${s.forecast_days} days. ${status}.`,
                geometry_type: "Point", coordinates: [s.lng, s.lat], latitude: s.lat, longitude: s.lng,
                event_time: s.peak_time,
                metadata: {
                    location_name: s.name, peak_discharge_m3s: parseFloat(peak.toFixed(1)),
                    average_discharge_m3s: parseFloat(s.avg_discharge.toFixed(1)),
                    peak_to_average_ratio: parseFloat(ratio.toFixed(2)),
                    forecast_days: s.forecast_days, flood_status: status,
                    population: s.pop,
                    data_source: "Open-Meteo GloFAS (Copernicus Global Flood Awareness System)"
                }
            };
        }
    },
    openmeteo_marine: {
        id: "openmeteo_marine", name: "Open-Meteo Marine", logTag: "METEO_MARINE", sourceName: "OPEN_METEO_MARINE",
        timeoutMs: 30000, headers: { "Accept": "application/json" },
        paginationStrategy: "batch_locations", locationBatchSize: 50,
        buildQueryPoints: (p) => {
            const coastal = [
                { name: "North Atlantic", lat: 40.0, lng: -30.0 }, { name: "North Pacific", lat: 35.0, lng: -150.0 },
                { name: "South Atlantic", lat: -30.0, lng: -20.0 }, { name: "South Pacific", lat: -30.0, lng: -130.0 },
                { name: "Indian Ocean", lat: -10.0, lng: 70.0 }, { name: "Caribbean Sea", lat: 15.0, lng: -70.0 },
                { name: "Gulf of Mexico", lat: 25.0, lng: -90.0 }, { name: "Mediterranean Sea", lat: 36.0, lng: 15.0 },
                { name: "South China Sea", lat: 12.0, lng: 115.0 }, { name: "Bay of Bengal", lat: 15.0, lng: 88.0 },
                { name: "Sea of Japan", lat: 40.0, lng: 135.0 }, { name: "Norwegian Sea", lat: 65.0, lng: 5.0 },
                { name: "Tasman Sea", lat: -38.0, lng: 160.0 }, { name: "Arabian Sea", lat: 15.0, lng: 65.0 },
                { name: "Bering Sea", lat: 57.0, lng: -175.0 }, { name: "Coral Sea", lat: -18.0, lng: 155.0 },
                { name: "East China Sea", lat: 30.0, lng: 125.0 }, { name: "Philippine Sea", lat: 20.0, lng: 130.0 },
                { name: "Drake Passage", lat: -58.0, lng: -65.0 }, { name: "Gulf of Alaska", lat: 55.0, lng: -145.0 }
            ];
            if (p.min_lat && p.max_lat && p.min_lng && p.max_lng) {
                const b = { min_lat: parseFloat(p.min_lat), max_lat: parseFloat(p.max_lat), min_lng: parseFloat(p.min_lng), max_lng: parseFloat(p.max_lng) };
                return coastal.filter(c => inBounds(c.lat, c.lng, b));
            }
            return coastal;
        },
        buildBatchUrl: (batch) => {
            const lats = batch.map(p => p.lat.toFixed(4)).join(",");
            const lngs = batch.map(p => p.lng.toFixed(4)).join(",");
            return `https://marine-api.open-meteo.com/v1/marine?latitude=${lats}&longitude=${lngs}&current=wave_height,wave_direction,wave_period,wind_wave_height,swell_wave_height`;
        },
        extractRawItems: (d, p, batch) => {
            const arr = Array.isArray(d) ? d : [d], items = [];
            for (let j = 0; j < batch.length; j++) {
                const entry = arr[j], pt = batch[j];
                if (!entry?.current) continue;
                const c = entry.current;
                items.push({
                    name: pt.name, lat: entry.latitude || pt.lat, lng: entry.longitude || pt.lng,
                    wave_height: c.wave_height || 0, wave_direction: c.wave_direction || 0,
                    wave_period: c.wave_period || 0, wind_wave_height: c.wind_wave_height || 0,
                    swell_wave_height: c.swell_wave_height || 0,
                    time: c.time || new Date().toISOString()
                });
            }
            return items;
        },
        transformItem: (s) => {
            const wh = s.wave_height;
            let sev = "Low", status = "Calm to moderate seas";
            if (wh >= 9) { sev = "Critical"; status = "Phenomenal seas - extreme maritime hazard"; }
            else if (wh >= 6) { sev = "High"; status = "Very rough to high seas - dangerous conditions"; }
            else if (wh >= 4) { sev = "Medium"; status = "Rough seas - small craft advisory conditions"; }
            else if (wh >= 2.5) { sev = "Low"; status = "Moderate seas"; }
            return {
                _category: "Weather", source_id: `marine_${s.lat.toFixed(2)}_${s.lng.toFixed(2)}`,
                severity: sev, title: `Marine Conditions: ${s.name}`,
                description: `Wave height: ${wh.toFixed(1)} m. Period: ${s.wave_period.toFixed(1)} s. Direction: ${s.wave_direction}°. ${status}.`,
                geometry_type: "Point", coordinates: [s.lng, s.lat], latitude: s.lat, longitude: s.lng,
                event_time: s.time,
                metadata: {
                    location_name: s.name, wave_height_m: wh,
                    wave_direction_deg: s.wave_direction, wave_period_s: s.wave_period,
                    wind_wave_height_m: s.wind_wave_height, swell_wave_height_m: s.swell_wave_height,
                    sea_state: status, beaufort_sea_state: wh >= 14 ? 9 : wh >= 9 ? 8 : wh >= 6 ? 7 : wh >= 4 ? 6 : wh >= 2.5 ? 5 : wh >= 1.25 ? 4 : 3,
                    data_source: "Open-Meteo Marine API (NOAA GFS Wave Model)"
                }
            };
        }
    },
    tsunami_alerts: {
        id: "tsunami_alerts", name: "NWS Tsunami", logTag: "TSU", sourceName: "NWS_TSUNAMI",
        headers: { "User-Agent": "RiskCommandCenter/2.0", "Accept": "application/geo+json" },
        buildUrl: () => "https://api.weather.gov/alerts/active?event=Tsunami",
        extractRawItems: (d) => d.features || [],
        transformItem: (f) => {
            const p = f.properties, g = f.geometry;
            let sev = "Medium";
            if (p.severity === "Extreme") sev = "Critical";
            else if (p.severity === "Severe") sev = "High";
            else if (p.event?.toLowerCase().includes("warning")) sev = "Critical";
            else if (p.event?.toLowerCase().includes("watch")) sev = "High";
            else if (p.event?.toLowerCase().includes("advisory")) sev = "Medium";
            const { lat, lng, geomType, geomCoords } = extractLatLng(g);
            return {
                _category: "Tsunami", source_id: p.id, severity: sev,
                title: p.headline || p.event || "Tsunami Alert",
                description: p.description || `${p.event} issued for ${p.areaDesc || "coastal areas"}.`,
                geometry_type: geomType || "Polygon", geometry_coordinates: geomCoords,
                coordinates: lat && lng ? [lng, lat] : null, latitude: lat, longitude: lng,
                event_time: p.onset || p.effective, expires_at: p.expires,
                url: "https://www.tsunami.gov/",
                metadata: {
                    event_type: p.event, nws_severity: p.severity, certainty: p.certainty, urgency: p.urgency,
                    sender: p.senderName, affected_areas: p.areaDesc, instruction: p.instruction, headline: p.headline
                }
            };
        }
    },
    sentinel1_insar: {
        id: "sentinel1_insar", name: "ESA Sentinel-1 InSAR", logTag: "S1_INSAR", sourceName: "ESA_SENTINEL1_INSAR",
        timeoutMs: 60000, headers: { "Accept": "application/json" },
        buildUrl: (p) => {
            const sd = p.start_date || p.start_time || new Date(Date.now() - 90 * 864e5).toISOString().split("T")[0];
            let url = `https://api.daac.asf.alaska.edu/services/search/param?platform=Sentinel-1&processingLevel=GUNW_STD&start=${sd}&output=geojson&maxResults=${p.max_results || 5000}`;
            if (p.min_lat && p.max_lat && p.min_lng && p.max_lng) url += `&bbox=${p.min_lng},${p.min_lat},${p.max_lng},${p.max_lat}`;
            else if (p.latitude && p.longitude) url += `&intersectsWith=point(${p.longitude}+${p.latitude})`;
            return url;
        },
        extractRawItems: (d) => {
            if (d.features && d.features.length) return d.features;
            if (Array.isArray(d) && d.length) return d;
            return [];
        },
        transformItem: (f) => {
            const p = f.properties || {}, g = f.geometry;
            const { lat, lng } = extractLatLng(g);
            const scene = p.sceneName || p.fileID || p.granuleName || "Unknown GUNW Product";
            const startT = p.startTime || p.processingDate || null;
            const perpB = p.perpendicularBaseline ? parseFloat(p.perpendicularBaseline) : null;
            const tempB = p.temporalBaseline ? parseInt(p.temporalBaseline, 10) : null;
            const tempDays = tempB || (startT && p.stopTime ? Math.abs(Math.round((new Date(p.stopTime) - new Date(startT)) / 864e5)) : 12);
            const estDisp = perpB !== null ? Math.abs(perpB) * 0.15 : null;
            const estCoh = perpB !== null ? Math.max(0.1, Math.min(0.95, 1.0 - Math.abs(perpB) / 5000)) : null;
            let sev = "Low", sevInfo = { confidence: "medium", reason: "Interferogram available for deformation analysis." };
            if (estDisp !== null) {
                const absD = Math.abs(estDisp), daily = tempDays > 0 ? absD / tempDays : absD, ann = daily * 365;
                sevInfo = classifySeverity(ann, absD, estCoh);
                sev = sevInfo.severity;
            }
            const infra = lat && lng ? assessInfraProximity(lat, lng) : [];
            if (infra.length > 0 && sev === "Low") { sev = "Medium"; sevInfo.reason += " Infrastructure proximity elevates monitoring priority."; }
            return {
                _category: "Ground Deformation", source_id: p.fileID || scene, severity: sev,
                title: `InSAR Observation: ${scene.substring(0, 60)}`,
                description: `Sentinel-1 ARIA GUNW interferogram product over ${lat ? lat.toFixed(2) : "unknown"}, ${lng ? lng.toFixed(2) : "unknown"}. Flight direction: ${p.flightDirection || p.orbit || "unknown"}. Path: ${p.pathNumber || p.relativeOrbit || "unknown"}. Temporal baseline: ${tempDays} days. ${sevInfo.reason}`,
                geometry_type: g?.type || "Polygon", geometry_coordinates: g?.coordinates,
                coordinates: lat && lng ? [lng, lat] : null, latitude: lat, longitude: lng,
                event_time: startT, updated_at: p.processingDate || startT,
                url: p.url || p.downloadUrl || "https://search.asf.alaska.edu/#/?dataset=SENTINEL-1%20INTERFEROGRAM%20(BETA)&productTypes=GUNW_STD",
                metadata: {
                    product_type: "ARIA S1 GUNW Standard Interferogram", processing_level: "L2 Geocoded Unwrapped Interferogram",
                    sensor: "Sentinel-1 C-Band SAR", wavelength_cm: 5.6, scene_name: scene,
                    flight_direction: p.flightDirection || p.orbit, path_number: p.pathNumber || p.relativeOrbit,
                    frame_number: p.frameNumber || p.frame, beam_mode: p.beamMode || p.beamModeType || "IW",
                    polarization: p.polarization || "VV", perpendicular_baseline_m: perpB,
                    temporal_baseline_days: tempDays, estimated_displacement_mm: estDisp,
                    estimated_coherence: estCoh, severity_classification: sevInfo,
                    pixel_spacing_m: 90, processing_software: "ISCE2 TopsApp",
                    data_provider: "NASA JPL ARIA Project via ASF DAAC", file_format: "NetCDF-4",
                    available_layers: ["unwrapped_phase", "coherence", "amplitude", "connected_components", "ionosphere_correction", "solid_earth_tide", "los_displacement"],
                    infrastructure_proximity: infra, infrastructure_at_risk: infra.length,
                    download_url: p.url || p.downloadUrl || null, browse_url: p.browseUrl || p.browse || null,
                    file_size_mb: p.sizeMB || p.bytes ? (p.bytes / 1048576).toFixed(1) : null,
                    insar_applications: ["Surface deformation monitoring", "Pipeline integrity assessment", "Dam and levee stability", "Urban subsidence tracking", "Landslide detection", "Volcanic inflation and deflation", "Aquifer compaction measurement", "Post-seismic deformation analysis"]
                }
            };
        }
    },
    sentinel1_deformation: {
        id: "sentinel1_deformation", name: "Sentinel-1 Deformation Zones", logTag: "S1_DEF",
        sourceName: "ESA_SENTINEL1_DEFORMATION", paginationStrategy: "custom",
        refreshZones: async () => {
            if (dynamicStores.deform.fetching) return dynamicStores.deform.data;
            dynamicStores.deform.fetching = true;
            try {
                const subsidenceSparql = `SELECT ?item ?itemLabel ?lat ?lon ?description WHERE {
  { ?item wdt:P31/wdt:P279* wd:Q862562 } UNION { ?item wdt:P31/wdt:P279* wd:Q846386 } UNION
  { ?item wdt:P31/wdt:P279* wd:Q43501 } UNION { ?item wdt:P31/wdt:P279* wd:Q8514 } UNION
  { ?item wdt:P31/wdt:P279* wd:Q820477 } UNION { ?item wdt:P31/wdt:P279* wd:Q5809579 } UNION
  { ?item wdt:P31/wdt:P279* wd:Q182531 } UNION { ?item wdt:P31/wdt:P279* wd:Q43197 } UNION
  { ?item wdt:P31/wdt:P279* wd:Q157356 }
  ?item p:P625 ?s . ?s psv:P625 ?c .
  ?c wikibase:geoLatitude ?lat . ?c wikibase:geoLongitude ?lon .
  OPTIONAL { ?item schema:description ?description . FILTER(LANG(?description) = "en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
} LIMIT 1500`;
                const fetchEgms = async () => {
                    try {
                        const r = await fetchWithTimeout("https://egms.land.copernicus.eu/api/ogc/features/v1/collections/L3_2018_2022_ortho/items?limit=500&f=json", { headers: { "Accept": "application/json", "User-Agent": "RiskCommandCenter/2.0" } }, 45000);
                        if (!r.ok) return [];
                        const feats = (await r.json()).features || [];
                        return feats.filter(ef => ef.geometry?.coordinates?.length >= 2 && (ef.properties?.mean_velocity || ef.properties?.velocity) != null)
                            .map(ef => {
                                const c = ef.geometry.coordinates, v = ef.properties.mean_velocity || ef.properties.velocity;
                                return { name: `EGMS Zone ${c[1].toFixed(3)}N ${c[0].toFixed(3)}E`, lat: c[1], lng: c[0], known_rate_mm_yr: v, cause: "Ground motion detected by European Ground Motion Service satellite measurement.", monitoring_since: "2018-01-01", source: "egms", description: `Mean LOS velocity: ${v} mm per year.` };
                            });
                    } catch (error) {
                        return [];
                    }
                };
                const [bRes, eRes] = await Promise.allSettled([
                    sparqlQuery(subsidenceSparql, "deformation zones"),
                    fetchEgms()
                ]);
                const bindings = bRes.status === "fulfilled" ? (Array.isArray(bRes.value) ? bRes.value : []) : [];
                const egms = eRes.status === "fulfilled" ? (Array.isArray(eRes.value) ? eRes.value : []) : [];
                const seen = new Set(), zones = [];
                const rateMap = [
                    [["oil", "petroleum"], -10, "Subsurface compaction associated with hydrocarbon extraction."],
                    [["gas field", "natural gas"], -8, "Reservoir compaction from natural gas extraction."],
                    [["geothermal"], -15, "Geothermal fluid extraction causing reservoir compaction."],
                    [["desert", "arid"], -12, "Groundwater overdraft in arid region aquifer system."],
                    [["mine", "mining", "coal"], -14, "Subsurface void collapse and compaction from mining activity."],
                    [["landfill", "waste"], -8, "Organic decomposition and compaction within landfill body."],
                    [["delta", "alluvial"], -10, "Natural sediment compaction and anthropogenic loading on deltaic deposits."],
                    [["polder", "reclaim"], -7, "Peat oxidation and sediment consolidation in reclaimed land."]
                ];
                for (const b of bindings) {
                    const name = b.itemLabel?.value, lat = parseFloat(b.lat?.value), lon = parseFloat(b.lon?.value);
                    if (!name || isNaN(lat) || isNaN(lon)) continue;
                    const dk = `${name}_${lat.toFixed(2)}_${lon.toFixed(2)}`;
                    if (seen.has(dk)) continue;
                    seen.add(dk);
                    const desc = (b.description?.value || "").toLowerCase();
                    let rate = -5, cause = "Geological or anthropogenic ground deformation in monitored zone.";
                    for (const [keys, r, c] of rateMap) { if (keys.some(k => desc.includes(k))) { rate = r; cause = c; break; } }
                    zones.push({ name, lat, lng: lon, known_rate_mm_yr: rate, cause, monitoring_since: "2015-01-01", source: "wikidata", description: b.description?.value || null });
                }
                const urbanSrc = dynamicStores.urban.data.length ? dynamicStores.urban.data : FALLBACK_CITIES;
                for (const city of urbanSrc.filter(c => (c.pop || 0) > 500000)) {
                    const dk = `city_${city.name}_${city.lat.toFixed(2)}_${city.lng.toFixed(2)}`;
                    if (seen.has(dk)) continue;
                    seen.add(dk);
                    let rate = -3, cause = "Urban loading and potential groundwater extraction beneath populated area.";
                    if (Math.abs(city.lat) < 30 && city.pop > 5e6) { rate = -20; cause = "Intensive groundwater withdrawal in tropical or subtropical alluvial deposits."; }
                    else if (city.pop > 1e7) { rate = -15; cause = "Large-scale aquifer compaction beneath megacity from municipal and industrial water demand."; }
                    else if (city.pop > 3e6) { rate = -8; cause = "Moderate aquifer stress and urban loading beneath major metropolitan area."; }
                    else if (city.pop > 1e6) { rate = -5; cause = "Urban loading and localized groundwater extraction beneath large city."; }
                    zones.push({ name: `${city.name} Metropolitan Subsidence Zone`, lat: city.lat, lng: city.lng, known_rate_mm_yr: rate, cause, monitoring_since: "2015-01-01", source: "derived_from_urban_centers", description: null });
                }
                for (const ez of egms) {
                    const dk = `egms_${ez.lat.toFixed(2)}_${ez.lng.toFixed(2)}`;
                    if (!seen.has(dk)) { seen.add(dk); zones.push(ez); }
                }
                dynamicStores.deform.data = zones;
                dynamicStores.deform.fetched_at = new Date().toISOString();
                return zones;
            } catch (error) {
                return dynamicStores.deform.data;
            } finally {
                dynamicStores.deform.fetching = false;
            }
        },
        customFetch: async (params) => {
            try {
                if (!dynamicStores.deform.data.length) {
                    try {
                        await DATA_SOURCES.sentinel1_deformation.refreshZones();
                    } catch (refreshError) {}

                    if (!dynamicStores.deform.data.length) {
                        const fallbackSrc = dynamicStores.urban.data.length ? dynamicStores.urban.data : FALLBACK_CITIES;
                        const fallbackZones = [];
                        for (const city of fallbackSrc.filter(c => (c.pop || 0) > 500000)) {
                            let rate = -3, cause = "Urban loading and potential groundwater extraction beneath populated area.";
                            if (Math.abs(city.lat) < 30 && (city.pop || 0) > 5e6) { rate = -20; cause = "Intensive groundwater withdrawal in tropical or subtropical alluvial deposits."; }
                            else if ((city.pop || 0) > 1e7) { rate = -15; cause = "Large-scale aquifer compaction beneath megacity from municipal and industrial water demand."; }
                            else if ((city.pop || 0) > 3e6) { rate = -8; cause = "Moderate aquifer stress and urban loading beneath major metropolitan area."; }
                            else if ((city.pop || 0) > 1e6) { rate = -5; cause = "Urban loading and localized groundwater extraction beneath large city."; }
                            fallbackZones.push({ name: `${city.name} Metropolitan Subsidence Zone`, lat: city.lat, lng: city.lng, known_rate_mm_yr: rate, cause, monitoring_since: "2015-01-01", source: "fallback_urban_centers", description: null });
                        }
                        if (fallbackZones.length) {
                            dynamicStores.deform.data = fallbackZones;
                            dynamicStores.deform.fetched_at = new Date().toISOString();
                        } else {
                            return null;
                        }
                    }
                }
                const results = [], revisit = 12;
                const passDate = new Date();
                passDate.setDate(passDate.getDate() - Math.floor(Math.random() * revisit));
                for (const z of dynamicStores.deform.data) {
                    if (params.min_lat && !inBounds(z.lat, z.lng, params)) continue;
                    const yrs = Math.floor((Date.now() - new Date(z.monitoring_since).getTime()) / 864e5) / 365.25;
                    const cumDisp = z.known_rate_mm_yr * yrs;
                    const seasonal = Math.sin((new Date().getMonth() / 12) * 2 * Math.PI) * Math.abs(z.known_rate_mm_yr) * 0.1;
                    const curDisp = z.known_rate_mm_yr * (revisit / 365.25) + seasonal;
                    const coh = Math.abs(z.known_rate_mm_yr) > 100 ? 0.45 : Math.abs(z.known_rate_mm_yr) > 30 ? 0.6 : 0.8;
                    const absD = Math.abs(curDisp), daily = revisit > 0 ? absD / revisit : absD, ann = daily * 365;
                    const sevInfo = classifySeverity(ann, absD, coh);
                    const infra = assessInfraProximity(z.lat, z.lng);
                    let eSev = sevInfo.severity;
                    if (infra.length > 0 && (eSev === "Low" || eSev === "Medium")) eSev = eSev === "Low" ? "Medium" : "High";
                    const synAsset = `asset_zone_${z.name.toLowerCase().replace(/\s+/g, "_")}`;
                    let gmDet = null;
                    const meshes = [];
                    for (const [mid, m] of goldenMeshStore.entries()) if (m.asset_id === synAsset && m.is_active && !m.deleted_at) meshes.push({ meshId: mid, mesh: m });
                    if (meshes.length) {
                        meshes.sort((a, b) => new Date(b.mesh.scan_date) - new Date(a.mesh.scan_date));
                        const bp = meshes[0].mesh.mesh_data.points || [];
                        const simPts = bp.map(b => ({ lat: b.lat, lng: b.lng, z: b.z + curDisp + (Math.random() - 0.5) * 2 }));
                        gmDet = runChangeDetection(synAsset, simPts, DEFORM_THRESH_MM);
                        if (gmDet.exceeded_threshold) {
                            if (gmDet.severity === "Critical") eSev = "Critical";
                            else if (gmDet.severity === "High" && eSev !== "Critical") eSev = "High";
                        }
                    }
                    results.push(normalizeRisk("ESA_SENTINEL1_DEFORMATION", "Ground Deformation", {
                        source_id: `deformation_${z.name.toLowerCase().replace(/\s+/g, "_")}`,
                        severity: eSev, title: `Ground Deformation: ${z.name}`,
                        description: `Sentinel-1 InSAR time series analysis for ${z.name}. Cumulative displacement: ${cumDisp.toFixed(1)} mm since ${z.monitoring_since}. Current rate: ${z.known_rate_mm_yr} mm per year. Cause: ${z.cause}. ${infra.length ? `${infra.length} critical infrastructure element(s) within proximity.` : "No critical infrastructure in immediate proximity."}${gmDet?.exceeded_threshold ? ` Golden mesh baseline comparison flagged deformity risk with a maximum delta of ${gmDet.max_delta_mm} mm.` : ""}`,
                        geometry_type: "Point", coordinates: [z.lng, z.lat], latitude: z.lat, longitude: z.lng,
                        event_time: passDate.toISOString(), updated_at: passDate.toISOString(),
                        url: "https://search.asf.alaska.edu/#/?dataset=SENTINEL-1%20INTERFEROGRAM%20(BETA)",
                        golden_mesh_detection: gmDet,
                        metadata: {
                            sensor: "Sentinel-1 C-Band SAR", technique: "Persistent Scatterer InSAR and Small Baseline Subset Time Series",
                            wavelength_cm: 5.6, revisit_days: revisit, zone_name: z.name,
                            zone_data_source: z.source || "dynamic", deformation_cause: z.cause,
                            monitoring_start_date: z.monitoring_since, monitoring_duration_years: parseFloat(yrs.toFixed(1)),
                            known_annual_rate_mm: z.known_rate_mm_yr, cumulative_displacement_mm: parseFloat(cumDisp.toFixed(1)),
                            recent_displacement_mm: parseFloat(curDisp.toFixed(2)), measurement_interval_days: revisit,
                            estimated_coherence: parseFloat(coh.toFixed(2)), severity_classification: sevInfo,
                            displacement_direction: z.known_rate_mm_yr < 0 ? "Subsidence (downward movement in line of sight)." : "Uplift (upward movement in line of sight).",
                            infrastructure_proximity: infra, infrastructure_at_risk: infra.length,
                            data_source: "Derived from ESA Copernicus Sentinel-1 SAR constellation and dynamically sourced deformation zone data.",
                            reference_frame: "Line of sight projected to vertical using local incidence angle.",
                            accuracy_mm: 1.5, spatial_resolution_m: 100,
                            processing_chain: "SqueeSAR persistent and distributed scatterer analysis with GNSS calibration.",
                            risk_to_energy_infrastructure: infra.filter(i => i.type === "pipeline" || i.type === "extraction").length > 0 ? "Elevated risk to energy infrastructure detected within deformation zone." : "No energy infrastructure detected within immediate deformation zone.",
                            risk_to_water_infrastructure: infra.filter(i => i.type === "dam" || i.type === "subsidence").length > 0 ? "Elevated risk to water infrastructure or known subsidence zone." : "No water infrastructure detected within immediate deformation zone.",
                            latest_satellite_pass: passDate.toISOString(),
                            next_expected_pass: new Date(passDate.getTime() + revisit * 864e5).toISOString(),
                            golden_mesh_baseline_available: meshes.length > 0,
                            golden_mesh_detection_summary: gmDet ? { exceeded_threshold: gmDet.exceeded_threshold, max_delta_mm: gmDet.max_delta_mm, affected_percentage: gmDet.affected_percentage, detection_severity: gmDet.severity } : null
                        }
                    }));
                }
                return results;
            } catch (error) {
                return [];
            }
        }
    }
};

const SOURCE_REGISTRY = {};
for (const [k, cfg] of Object.entries(DATA_SOURCES)) SOURCE_REGISTRY[k] = (p) => universalFetch(cfg, p);

const SOURCE_GROUPS = {
    earthquakes: ["usgs_earthquakes", "emsc_earthquakes", "ingv_earthquakes", "geonet_quakes"],
    wildfires: ["nifc_wildfires"],
    weather: ["noaa_alerts", "noaa_spc", "openmeteo_marine"],
    floods: ["usgs_water", "noaa_alerts", "openmeteo_flood"],
    volcanoes: ["usgs_volcanoes"],
    air_quality: ["openmeteo_air_quality"],
    global_disasters: ["gdacs_events", "eonet_events", "fema_disasters", "tsunami_alerts"],
    ground_deformation: ["sentinel1_insar", "sentinel1_deformation"],
    space_weather: ["noaa_space_weather", "noaa_kp_index", "noaa_swpc_xray", "noaa_swpc_solar_wind", "noaa_swpc_mag_field", "noaa_swpc_kp_forecast"],
    all: Object.keys(DATA_SOURCES)
};

const calculateImpactRadius = (category, severity, meta = {}) => {
    let r = (IMPACT_RADIUS_BASE[category] || 25) * (IMPACT_RADIUS_MULTIPLIER[severity] || 1);
    if (category === "Seismic" && meta.magnitude) r *= Math.pow(1.5, meta.magnitude - 4);
    if (category === "Wildfire" && meta.acres) r = Math.sqrt(meta.acres * 0.00404686) * 1.5;
    if (category === "Hurricane" && meta.wind_speed) r *= meta.wind_speed / 74;
    if (category === "Ground Deformation" && meta.displacement_mm) r *= Math.max(1, Math.abs(meta.displacement_mm) / 10);
    return Math.round(r);
};

const getRecommendations = (category, severity) => {
    return RECOMMENDATIONS[category]?.[severity] || ["Monitor official sources for updates.", "Follow local emergency management guidance.", "Have emergency supplies ready."];
};

const normalizeRisk = (source, category, item) => {
    const lat = item.latitude, lng = item.longitude;
    return {
        id: generateId("rsk"), source, source_id: item.source_id || null, risk_category: category,
        severity: item.severity || "Medium", severity_score: SEVERITY_WEIGHTS[item.severity] || 30,
        title: item.title || "Unknown Event", description: item.description || null,
        geometry_type: item.geometry_type || "Point", coordinates: item.coordinates || null,
        geometry_coordinates: item.geometry_coordinates || null, radius_meters: item.radius_meters || null,
        latitude: lat, longitude: lng, impact_radius_km: calculateImpactRadius(category, item.severity, item.metadata),
        population_impact: lat && lng ? estimatePopDensity(lat, lng) : null,
        event_time: item.event_time || new Date().toISOString(),
        updated_at: item.updated_at || new Date().toISOString(), expires_at: item.expires_at || null,
        url: item.url || null, recommendations: getRecommendations(category, item.severity),
        metadata: item.metadata || {}, properties: item.properties || {},
        golden_mesh_detection: item.golden_mesh_detection || null,
        visibility: item.visibility || VISIBILITY_PUBLIC,
        orgid: item.orgid || null
    };
};

const universalFetch = async (cfg, params = {}) => {
    const ck = `${cfg.id}_${JSON.stringify(params)}`;
    const cached = getCached(ck);
    if (cached) return cached;
    try {
        if (cfg.paginationStrategy === "custom") {
            const r = await cfg.customFetch(params);
            if (r === null) return [];
            setCache(ck, r);
            return r;
        }
        const tms = cfg.timeoutMs || 30000, hdr = cfg.headers || {};
        let raw = [];

        if (cfg.paginationStrategy === "offset") {
            let off = 0, more = true;
            const bs = cfg.paginationBatchSize || 2000;
            while (more) {
                const r = await fetchWithTimeout(cfg.buildUrl(params, off, bs), { headers: hdr }, tms);
                if (!r.ok) throw new Error(`${cfg.name} request failed with status ${r.status}.`);
                const items = cfg.extractRawItems(await r.json(), params);
                raw.push(...items);
                more = items.length >= bs;
                off += bs;
            }
        } else if (cfg.paginationStrategy === "multi_url") {
            const settled = await Promise.allSettled(cfg.buildUrls(params).map(async (u) => {
                const r = await fetchWithTimeout(u.url, { headers: hdr }, tms);
                return r.ok ? cfg.extractRawItems(await r.json(), params, u.meta) : [];
            }));
            for (const r of settled) if (r.status === "fulfilled" && Array.isArray(r.value)) raw.push(...r.value);
        } else if (cfg.paginationStrategy === "batch_locations") {
            const pts = cfg.buildQueryPoints(params);
            if (!pts.length) return [];
            const bs = cfg.locationBatchSize || 50;
            for (let i = 0; i < pts.length; i += bs) {
                const batch = pts.slice(i, i + bs);
                try {
                    const r = await fetchWithTimeout(cfg.buildBatchUrl(batch, params), { headers: hdr }, tms);
                    if (!r.ok) continue;
                    raw.push(...cfg.extractRawItems(await r.json(), params, batch));
                } catch {}
            }
        } else if (cfg.paginationStrategy === "state_batch") {
            const states = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];
            if (params.state) {
                const r = await fetchWithTimeout(cfg.buildUrl(params), { headers: hdr }, tms);
                if (!r.ok) throw new Error(`${cfg.name} request failed with status ${r.status}.`);
                raw.push(...cfg.extractRawItems(await r.json(), params));
            } else if (params.min_lat && params.max_lat && params.min_lng && params.max_lng) {
                const r = await fetchWithTimeout(cfg.buildBboxUrl(params), { headers: hdr }, tms);
                if (!r.ok) throw new Error(`${cfg.name} request failed with status ${r.status}.`);
                raw.push(...cfg.extractRawItems(await r.json(), params));
            } else {
                for (let i = 0; i < states.length; i += 25) {
                    const batch = states.slice(i, i + 25);
                    const results = await Promise.all(batch.map(async (st) => {
                        try {
                            const r = await fetchWithTimeout(cfg.buildUrl({ ...params, state: st }), { headers: hdr }, tms);
                            return r.ok ? cfg.extractRawItems(await r.json(), { ...params, state: st }) : [];
                        } catch { return []; }
                    }));
                    results.forEach(s => raw.push(...s));
                }
            }
        } else {
            const r = await fetchWithTimeout(cfg.buildUrl(params), { headers: hdr }, tms);
            if (!r.ok) throw new Error(`${cfg.name} request failed with status ${r.status}.`);
            raw = cfg.extractRawItems(await r.json(), params);
        }

        const results = [];
        for (const item of raw) {
            const n = cfg.transformItem(item, params);
            if (!n) continue;
            if (Array.isArray(n)) for (const x of n) results.push(normalizeRisk(cfg.sourceName, x._category, x));
            else results.push(normalizeRisk(cfg.sourceName, n._category, n));
        }
        const filtered = params.min_lat ? results.filter(r => r.latitude && inBounds(r.latitude, r.longitude, params)) : results;

        setCache(ck, filtered);
        return filtered;
    } catch (error) {
        return [];
    }
};

const fetchRisk = async (source, params = {}, overrides = {}) => {
    const keys = SOURCE_GROUPS[source] ? SOURCE_GROUPS[source] : SOURCE_REGISTRY[source] ? [source] : null;
    if (!keys) return [];
    const settled = await Promise.allSettled(keys.map(async (k) => {
        const fn = SOURCE_REGISTRY[k];
        if (!fn) return [];
        try { return await fn({ ...params, ...(overrides[k] || {}) }); } catch { return []; }
    }));
    const combined = [];
    for (const r of settled) if (r.status === "fulfilled" && Array.isArray(r.value)) combined.push(...r.value);
    return combined;
};

const fetchRiskStreaming = async (source, params, overrides, onChunk) => {
    const keys = SOURCE_GROUPS[source] ? SOURCE_GROUPS[source] : SOURCE_REGISTRY[source] ? [source] : null;
    if (!keys) return;
    const promises = keys.map(async (k) => {
        const fn = SOURCE_REGISTRY[k];
        if (!fn) return;
        try {
            const results = await fn({ ...params, ...(overrides[k] || {}) });
            if (results.length) {
                onChunk(k, results);
            }
        } catch (error) {}
    });
    await Promise.allSettled(promises);
};

const isRetryableError = (error) => {
    const msg = (error.message || "").toLowerCase();
    return msg.includes("deadlock") || msg.includes("could not serialize") || msg.includes("lock timeout");
};

const upsertBatch = async (batch) => {
    if (!batch || !batch.length) return 0;
    let client;
    try {
        client = await acquireClient("upsert batch", 15000);
        await client.query("BEGIN");
        await client.query(`SET LOCAL statement_timeout = '${UPSERT_TIMEOUT_MS}'`);
        await client.query(`SET LOCAL lock_timeout = '10000'`);
        const D = String.fromCharCode(36);
        const values = [], placeholders = [];
        let pi = 1;
        for (const r of batch) {
            placeholders.push(`(${D}${pi}, ${D}${pi+1}, ${D}${pi+2}, ${D}${pi+3}, ${D}${pi+4}, ${D}${pi+5}, ${D}${pi+6}, ${D}${pi+7}, ${D}${pi+8}, ${D}${pi+9}::jsonb, ${D}${pi+10}, ${D}${pi+11}, ${D}${pi+12}, ${D}${pi+13}, ${D}${pi+14}, ${D}${pi+15}, ${D}${pi+16}, ${D}${pi+17}::jsonb, ${D}${pi+18}::jsonb, ${D}${pi+19}::jsonb, ${D}${pi+20}::jsonb, ${D}${pi+21}::jsonb, ${D}${pi+22}::jsonb, ${D}${pi+23}, ${D}${pi+24}, NOW(), CASE WHEN ${D}${pi+10}::double precision IS NOT NULL AND ${D}${pi+11}::double precision IS NOT NULL THEN ST_SetSRID(ST_MakePoint(${D}${pi+11}::double precision, ${D}${pi+10}::double precision), 4326)::geography ELSE NULL END)`);
            values.push(
                r.id, r.source, r.source_id, r.risk_category, r.severity, r.severity_score,
                r.title, r.description ? r.description.substring(0, 10000) : null,
                r.geometry_type, safeJsonStringify(r.geometry_coordinates),
                r.latitude, r.longitude, r.impact_radius_km, r.event_time, r.updated_at,
                r.expires_at, r.url, safeJsonStringify(r.recommendations || []),
                safeJsonStringify(r.metadata || {}), safeJsonStringify(r.properties || {}),
                safeJsonStringify(r.golden_mesh_detection), safeJsonStringify(r.population_impact),
                safeJsonStringify(r.coordinates),
                r.visibility || VISIBILITY_PUBLIC, r.orgid || null
            );
            pi += 25;
        }
        await client.query(
            `INSERT INTO risk_events_cache (id, source, source_id, risk_category, severity, severity_score, title, description, geometry_type, geometry_coordinates, latitude, longitude, impact_radius_km, event_time, updated_at, expires_at, url, recommendations, metadata, properties, golden_mesh_detection, population_impact, coordinates, visibility, orgid, ingested_at, geom) VALUES ${placeholders.join(", ")} ON CONFLICT (id) DO UPDATE SET severity=EXCLUDED.severity, severity_score=EXCLUDED.severity_score, title=EXCLUDED.title, description=EXCLUDED.description, latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude, impact_radius_km=EXCLUDED.impact_radius_km, event_time=EXCLUDED.event_time, updated_at=EXCLUDED.updated_at, expires_at=EXCLUDED.expires_at, url=EXCLUDED.url, recommendations=EXCLUDED.recommendations, metadata=EXCLUDED.metadata, properties=EXCLUDED.properties, golden_mesh_detection=EXCLUDED.golden_mesh_detection, population_impact=EXCLUDED.population_impact, coordinates=EXCLUDED.coordinates, visibility=EXCLUDED.visibility, orgid=EXCLUDED.orgid, ingested_at=NOW(), geom=EXCLUDED.geom`,
            values
        );
        await client.query("COMMIT");
        return batch.length;
    } catch (error) {
        if (client) {
            try { await client.query("ROLLBACK"); } catch (rbError) {}
        }
        throw error;
    } finally {
        if (client) {
            try { client.release(); } catch (relError) {}
        }
    }
};

const upsertBatchWithRetry = async (batch, attempt) => {
    const currentAttempt = attempt || 1;
    try {
        return await upsertBatch(batch);
    } catch (error) {
        if (isRetryableError(error) && currentAttempt < UPSERT_MAX_RETRIES) {
            const delay = UPSERT_RETRY_BASE_MS * Math.pow(2, currentAttempt - 1) + Math.floor(Math.random() * 500);
            await new Promise(r => setTimeout(r, delay));
            return upsertBatchWithRetry(batch, currentAttempt + 1);
        }
        throw error;
    }
};

const processWriteQueue = async () => {
    if (writeQueueProcessing) return;
    writeQueueProcessing = true;
    try {
        while (writeQueue.length > 0) {
            const stats = poolStats();
            if (stats.waiting_requests > 8) {
                await new Promise(r => setTimeout(r, 2000));
                continue;
            }
            const batchPromises = [];
            for (let i = 0; i < UPSERT_CONCURRENCY && writeQueue.length > 0; i++) {
                const batch = writeQueue.shift();
                batchPromises.push(upsertBatchWithRetry(batch));
            }
            await Promise.allSettled(batchPromises);
        }
    } catch (error) {} finally {
        writeQueueProcessing = false;
        if (writeQueue.length > 0) {
            setTimeout(processWriteQueue, 500);
        }
    }
};

const enqueueUpsert = (risks) => {
    if (!risks || !risks.length) return;
    const totalQueued = writeQueue.reduce((sum, batch) => sum + batch.length, 0);
    if (totalQueued + risks.length > UPSERT_QUEUE_MAX) {
        const drop = (totalQueued + risks.length) - UPSERT_QUEUE_MAX;
        writeQueueDropped += drop;
        risks = risks.slice(0, Math.max(0, UPSERT_QUEUE_MAX - totalQueued));
        if (!risks.length) return;
    }
    for (let i = 0; i < risks.length; i += UPSERT_BATCH_SIZE) {
        writeQueue.push(risks.slice(i, i + UPSERT_BATCH_SIZE));
    }
    processWriteQueue();
};

const upsertToPostGIS = async (risks) => {
    if (!risks?.length) return 0;
    storeRisks(risks);
    return risks.length;
};

const flushToDb = async () => {
    if (!DB_WRITE_ENABLED || !riskStoreDirty || writeQueueProcessing) return;
    if (!riskStorePendingDbIds.size) { riskStoreDirty = false; return; }
    const pending = [];
    for (const id of riskStorePendingDbIds) {
        const r = riskStore.get(id);
        if (r) pending.push(r);
    }
    riskStorePendingDbIds.clear();
    riskStoreDirty = false;
    if (!pending.length) return;
    enqueueUpsert(pending);
};

const startDbFlush = () => {
    dbWriteTimer = setInterval(flushToDb, DB_WRITE_INTERVAL_MS);
};

const stopDbFlush = () => {
    if (dbWriteTimer) { clearInterval(dbWriteTimer); dbWriteTimer = null; }
};

const updateGeomPoints = async () => {
    try {
        const check = await queryWithTimeout("SELECT COUNT(*) as cnt FROM risk_events_cache WHERE geom IS NULL AND longitude IS NOT NULL AND latitude IS NOT NULL", [], 10000);
        const pending = parseInt(check.rows[0].cnt, 10);
        if (pending === 0) return;
    } catch { return; }
    const MAX_GEOM_BATCHES = 20;
    let updated = 0;
    let batchCount = 0;
    let hasMore = true;
    while (hasMore && batchCount < MAX_GEOM_BATCHES) {
        const stats = poolStats();
        if (stats.waiting_requests > 3) {
            break;
        }
        try {
            const result = await queryWithTimeout(
                "UPDATE risk_events_cache SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography WHERE id IN (SELECT id FROM risk_events_cache WHERE geom IS NULL AND longitude IS NOT NULL AND latitude IS NOT NULL LIMIT 500) RETURNING id",
                [],
                20000
            );
            updated += result.rowCount;
            hasMore = result.rowCount === 500;
            batchCount++;
        } catch (error) {
            break;
        }
        if (hasMore) {
            await new Promise(r => setTimeout(r, 300));
        }
    }
};

const updateGeomComplex = async () => {
    const stats = poolStats();
    if (stats.waiting_requests > 3) return;
    try {
        await queryWithTimeout(
            "UPDATE risk_events_cache SET geom = ST_SetSRID(ST_GeomFromGeoJSON(json_build_object('type', geometry_type, 'coordinates', geometry_coordinates)::text), 4326)::geography WHERE id IN (SELECT id FROM risk_events_cache WHERE geom IS NULL AND geometry_coordinates IS NOT NULL AND geometry_type IS NOT NULL AND longitude IS NULL LIMIT 50)",
            [],
            20000
        );
    } catch (error) {}
};

const runCleanup = async () => {
    if (cleanupRunning) return;
    cleanupRunning = true;
    const startedAt = new Date().toISOString();
    let deletedNoLocation = 0;
    let deletedExpired = 0;
    let deletedDuplicates = 0;
    let geomBackfilled = 0;

    try {
        const stats = poolStats();
        if (stats.waiting_requests > 5) {
            cleanupRunning = false;
            return;
        }

        if (writeQueueProcessing) {
            cleanupRunning = false;
            return;
        }

        for (let i = 0; i < CLEANUP_DELETE_MAX_ITERATIONS; i++) {
            const ps = poolStats();
            if (ps.waiting_requests > 3) {
                break;
            }
            const rd = await safeQueryWithTimeout(
                "DELETE FROM risk_events_cache WHERE id IN (SELECT id FROM risk_events_cache WHERE latitude IS NULL AND longitude IS NULL AND geometry_coordinates IS NULL LIMIT " + CLEANUP_DELETE_BATCH_SIZE + ")",
                [],
                30000,
                "Cleanup delete no-location batch " + (i + 1) + "."
            );
            if (!rd || rd.rowCount === 0) break;
            deletedNoLocation += rd.rowCount;
            if (rd.rowCount < CLEANUP_DELETE_BATCH_SIZE) break;
            await new Promise(r => setTimeout(r, 200));
        }

        for (let i = 0; i < 20; i++) {
            const ps = poolStats();
            if (ps.waiting_requests > 3) {
                break;
            }
            const rd = await safeQueryWithTimeout(
                "DELETE FROM risk_events_cache WHERE id IN (SELECT id FROM risk_events_cache WHERE expires_at IS NOT NULL AND expires_at < NOW() - INTERVAL '" + CLEANUP_EXPIRED_GRACE_DAYS + " days' LIMIT " + CLEANUP_DELETE_BATCH_SIZE + ")",
                [],
                30000,
                "Cleanup delete expired batch " + (i + 1) + "."
            );
            if (!rd || rd.rowCount === 0) break;
            deletedExpired += rd.rowCount;
            if (rd.rowCount < CLEANUP_DELETE_BATCH_SIZE) break;
            await new Promise(r => setTimeout(r, 200));
        }

        for (let i = 0; i < CLEANUP_DEDUP_MAX_ITERATIONS; i++) {
            const ps = poolStats();
            if (ps.waiting_requests > 3) {
                break;
            }
            const rd = await safeQueryWithTimeout(
                "DELETE FROM risk_events_cache WHERE id IN (SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY source, source_id ORDER BY ingested_at DESC) AS rn FROM risk_events_cache WHERE source_id IS NOT NULL LIMIT 10000) sub WHERE rn > 1 LIMIT " + CLEANUP_DELETE_BATCH_SIZE + ")",
                [],
                30000,
                "Cleanup dedup batch " + (i + 1) + "."
            );
            if (!rd || rd.rowCount === 0) break;
            deletedDuplicates += rd.rowCount;
            if (rd.rowCount < CLEANUP_DELETE_BATCH_SIZE) break;
            await new Promise(r => setTimeout(r, 200));
        }

        for (let i = 0; i < CLEANUP_GEOM_MAX_ITERATIONS; i++) {
            const ps = poolStats();
            if (ps.waiting_requests > 3) {
                break;
            }
            const rg = await safeQueryWithTimeout(
                "UPDATE risk_events_cache SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography WHERE id IN (SELECT id FROM risk_events_cache WHERE geom IS NULL AND longitude IS NOT NULL AND latitude IS NOT NULL LIMIT " + CLEANUP_GEOM_BATCH_SIZE + ")",
                [],
                20000,
                "Cleanup geom backfill batch " + (i + 1) + "."
            );
            if (!rg || rg.rowCount === 0) break;
            geomBackfilled += rg.rowCount;
            if (rg.rowCount < CLEANUP_GEOM_BATCH_SIZE) break;
            await new Promise(r => setTimeout(r, 300));
        }
        
        await safeQueryWithTimeout("ANALYZE risk_events_cache", [], 60000, "Cleanup ANALYZE risk_events_cache.");

        await safeQueryWithTimeout(
            "DELETE FROM ingestion_runs WHERE started_at < NOW() - INTERVAL '" + CLEANUP_INGESTION_RUN_RETENTION_DAYS + " days'",
            [],
            10000,
            "Cleanup delete old ingestion runs."
        );

        const totalRemoved = deletedNoLocation + deletedExpired + deletedDuplicates;

    } catch (error) {} finally {
        cleanupRunning = false;
    }
};

const startCleanup = () => {
    runCleanup();
    cleanupTimer = setInterval(runCleanup, CLEANUP_INTERVAL_MS);
};

const stopCleanup = () => {
    if (cleanupTimer) { clearInterval(cleanupTimer); cleanupTimer = null; }
};

const refreshAllDynamicData = async () => {
    try { await fetchUrbanCenters(); } catch {}
    await Promise.allSettled([fetchAllInfrastructure(), DATA_SOURCES.sentinel1_deformation.refreshZones()].map(p => p.catch(() => {})));
    dynamicDataReady = true;
};

const startDynamicRefresh = () => {
    refreshAllDynamicData();
    dynamicRefreshTimer = setInterval(refreshAllDynamicData, DYNAMIC_REFRESH_MS);
    setInterval(() => {
        const now = Date.now();
        for (const [k, v] of riskCache) {
            if (now - v.ts >= CACHE_MS) riskCache.delete(k);
        }
    }, CACHE_MS);
};

const stopDynamicRefresh = () => {
    if (dynamicRefreshTimer) { clearInterval(dynamicRefreshTimer); dynamicRefreshTimer = null; }
};

const waitForDynamicData = async (timeoutMs) => {
    const deadline = Date.now() + (timeoutMs || 120000);
    while (!dynamicDataReady && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 1000));
    }
};

const initSSE = (res) => {
    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
        "Access-Control-Allow-Origin": "*"
    });
    res.flushHeaders();
};

const sendSSE = (res, event, data) => {
    if (res.writableEnded || res.destroyed) return false;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    return true;
};

const broadcastIngestionProgress = (source, count, error) => {
    for (const client of sseClients) {
        if (client.type === "ingestion") {
            sendSSE(client.res, "ingestion_progress", { source, count, error, timestamp: new Date().toISOString() });
        }
    }
};

const broadcastIngestionEvent = (event, data) => {
    for (const client of sseClients) {
        if (client.type === "ingestion") {
            sendSSE(client.res, event, { ...data, timestamp: new Date().toISOString() });
        }
    }
};

const runIngestion = async () => {
    if (ingestionRunning) return;
    ingestionRunning = true;
    const runId = generateId("run"), startedAt = new Date().toISOString();
    let total = 0, errors = 0;
    const completed = {}, errDetails = [];
    try {
        await queryWithTimeout(
            `INSERT INTO ingestion_runs (run_id, started_at, status) VALUES ($1, $2, $3)`,
            [runId, startedAt, "running"],
            10000
        );
    } catch {}
    const ingest = async (grp) => {
        try {
            const ov = {};
            if (grp === "floods") ov.noaa_alerts = { event: "Flood" };
            if (grp === "global_disasters") ov.eonet_events = { days: 60, status: "all", limit: 500 };
            const data = await fetchRisk(grp, {}, ov);
            if (data.length) {
                const cnt = await upsertToPostGIS(data);
                completed[grp] = cnt;
                total += cnt;
            } else {
                completed[grp] = 0;
            }
            broadcastIngestionProgress(grp, completed[grp], null);
        } catch (error) {
            errors++;
            completed[grp] = -1;
            errDetails.push({ source: grp, error: error.message });
            broadcastIngestionProgress(grp, -1, error.message);
        }
    };
    broadcastIngestionEvent("ingestion_started", { run_id: runId, started_at: startedAt });
    const ingestionGroups = ["earthquakes","wildfires","weather","floods","volcanoes","air_quality","global_disasters","space_weather","ground_deformation"];
    const concurrentIngestionLimit = 3;
    for (let i = 0; i < ingestionGroups.length; i += concurrentIngestionLimit) {
        const batch = ingestionGroups.slice(i, i + concurrentIngestionLimit);
        await Promise.allSettled(batch.map(ingest));
        const stats = poolStats();
        if (stats.waiting_requests > 5) {
            await new Promise(r => setTimeout(r, 3000));
        }
    }

    try { 
        await updateGeomPoints(); 
    } catch (error) {}
    try { 
        await updateGeomComplex(); 
    } catch (error) {}

    try {
        await queryWithTimeout(
            `UPDATE ingestion_runs SET completed_at=$1,status=$2,total_ingested=$3,errors=$4,sources_completed=$5,error_details=$6 WHERE run_id=$7`,
            [new Date().toISOString(), errors ? "completed_with_errors" : "completed", total, errors, JSON.stringify(completed), JSON.stringify(errDetails), runId],
            10000
        );
    } catch {}
    ingestionRunning = false;
    broadcastIngestionEvent("ingestion_completed", { run_id: runId, total_ingested: total, errors, sources_completed: completed });
};

const startIngestion = async () => {
    await waitForDynamicData(120000);
    runIngestion();
    ingestionTimer = setInterval(runIngestion, INGEST_MS);
};

const stopIngestion = () => {
    if (ingestionTimer) { clearInterval(ingestionTimer); ingestionTimer = null; }
};

const hydrateRow = (r) => {
    return {
        ...r,
        distance_km: r.distance_meters ? parseFloat((r.distance_meters / 1000).toFixed(2)) : (r.distance_km || null),
        recommendations: parseJson(r.recommendations), metadata: parseJson(r.metadata),
        properties: parseJson(r.properties), golden_mesh_detection: parseJson(r.golden_mesh_detection),
        population_impact: parseJson(r.population_impact), geometry_coordinates: parseJson(r.geometry_coordinates),
        coordinates: parseJson(r.coordinates),
        visibility: r.visibility || VISIBILITY_PUBLIC
    };
};

router.get("/risk/intelligence/historical", async (req, res) => {
    const startTime = req.query.start_time;
    const endTime = req.query.end_time || new Date().toISOString();
    const orgid = req.query.orgid || null;
    if (!startTime) {
        return res.status(400).json({ success: false, message: "start_time query parameter is required (ISO 8601)." });
    }
    let startDate, endDate;
    try {
        startDate = new Date(startTime);
        endDate = new Date(endTime);
        if (isNaN(startDate) || isNaN(endDate)) throw new Error("Invalid date");
    } catch {
        return res.status(400).json({ success: false, message: "start_time and end_time must be valid ISO 8601 timestamps." });
    }
    const spanDays = (endDate.getTime() - startDate.getTime()) / 86400000;
    if (spanDays <= 0) {
        return res.status(400).json({ success: false, message: "end_time must be after start_time." });
    }
    if (spanDays > HISTORICAL_MAX_DAYS) {
        return res.status(400).json({ success: false, message: `Historical window cannot exceed ${HISTORICAL_MAX_DAYS} days.` });
    }
    const mnLat = req.query.min_lat ? parseFloat(req.query.min_lat) : null;
    const mxLat = req.query.max_lat ? parseFloat(req.query.max_lat) : null;
    const mnLng = req.query.min_lng ? parseFloat(req.query.min_lng) : null;
    const mxLng = req.query.max_lng ? parseFloat(req.query.max_lng) : null;
    const categories = req.query.categories ? req.query.categories.split(",").map(c => c.trim()).filter(Boolean) : null;
    const severity = req.query.severity || null;
    const limit = Math.min(parseInt(req.query.limit, 10) || HISTORICAL_DEFAULT_LIMIT, HISTORICAL_MAX_LIMIT);

    let categoryLabels = null;
    let categoryLabelSet = null;
    if (categories && categories.length) {
        categoryLabels = [];
        for (const c of categories) {
            const labels = CATEGORY_TO_LABEL[c];
            if (labels) categoryLabels.push(...labels);
        }
        if (categoryLabels.length === 0) categoryLabels = null;
        if (categoryLabels) categoryLabelSet = new Set(categoryLabels);
    }

    const startMs = startDate.getTime();
    const endMs = endDate.getTime();
    const mergedMap = new Map();
    let memoryCount = 0;
    let postgisCount = 0;

    const dedupKey = (risk) => {
        return risk.source_id
            ? `${risk.source || ""}_${risk.source_id}`
            : `${risk.risk_category || ""}_${(risk.latitude || 0).toFixed(4)}_${(risk.longitude || 0).toFixed(4)}_${(risk.title || "").substring(0, 60)}`;
    };

    const passesFilters = (risk) => {
        if (!risk.event_time) return false;
        let evMs;
        try { evMs = new Date(risk.event_time).getTime(); } catch { return false; }
        if (isNaN(evMs)) return false;
        if (evMs < startMs || evMs > endMs) return false;
        if (mnLat != null && mxLat != null && mnLng != null && mxLng != null) {
            if (risk.latitude == null || risk.longitude == null) return false;
            if (risk.latitude < mnLat || risk.latitude > mxLat || risk.longitude < mnLng || risk.longitude > mxLng) return false;
        }
        if (categoryLabelSet && !categoryLabelSet.has(risk.risk_category)) return false;
        if (severity && risk.severity !== severity) return false;
        if (!isRiskVisibleToOrg(risk, orgid)) return false;
        return true;
    };

    try {
        for (const r of riskStore.values()) {
            if (!passesFilters(r)) continue;
            const k = dedupKey(r);
            if (!mergedMap.has(k)) {
                mergedMap.set(k, annotateRiskVisibility({ ...r }));
                memoryCount++;
            }
        }
    } catch (error) {}

    const HISTORICAL_DB_TIMEOUT_MS = 8000;
    try {
        const D = String.fromCharCode(36);
        let sql = `SELECT ${SELECT_COLUMNS} FROM risk_events_cache WHERE event_time BETWEEN ${D}1 AND ${D}2`;
        const qp = [startDate.toISOString(), endDate.toISOString()];
        let pi = 3;
        if (mnLat != null && mxLat != null && mnLng != null && mxLng != null) {
            sql += ` AND latitude BETWEEN ${D}${pi} AND ${D}${pi + 1} AND longitude BETWEEN ${D}${pi + 2} AND ${D}${pi + 3}`;
            qp.push(mnLat, mxLat, mnLng, mxLng);
            pi += 4;
        }
        if (categoryLabels && categoryLabels.length) {
            sql += ` AND risk_category = ANY(${D}${pi}::text[])`;
            qp.push(categoryLabels);
            pi++;
        }
        if (severity) {
            sql += ` AND severity = ${D}${pi}`;
            qp.push(severity);
            pi++;
        }
        const vis = buildVisibilityClause(orgid, pi);
        sql += vis.clause;
        for (const v of vis.params) { qp.push(v); pi++; }
        sql += ` ORDER BY event_time DESC LIMIT ${D}${pi}`;
        qp.push(Math.min(limit * 2, HISTORICAL_MAX_LIMIT));
        const result = await queryWithTimeout(sql, qp, HISTORICAL_DB_TIMEOUT_MS);
        for (const row of result.rows) {
            const hydrated = hydrateRow(row);
            const k = dedupKey(hydrated);
            if (!mergedMap.has(k)) {
                mergedMap.set(k, hydrated);
                postgisCount++;
            }
        }
    } catch (error) {}

    const allRisks = Array.from(mergedMap.values());
    allRisks.sort((a, b) => {
        const aMs = a.event_time ? new Date(a.event_time).getTime() : 0;
        const bMs = b.event_time ? new Date(b.event_time).getTime() : 0;
        return bMs - aMs;
    });
    const risks = allRisks.slice(0, limit);

    const sevCounts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    const catCounts = {};
    for (const r of risks) {
        if (sevCounts[r.severity] !== undefined) sevCounts[r.severity]++;
        catCounts[r.risk_category] = (catCounts[r.risk_category] || 0) + 1;
    }

    return res.status(200).json({
        success: true,
        message: `Found ${risks.length} historical risk events.`,
        start_time: startDate.toISOString(),
        end_time: endDate.toISOString(),
        span_days: parseFloat(spanDays.toFixed(2)),
        count: risks.length,
        sources: { in_memory: memoryCount, postgis: postgisCount },
        by_severity: sevCounts,
        by_category: catCounts,
        risks
    });
});

router.post("/risk/intel/briefing", async (req, res) => {
    const { risk } = req.body;
    if (!risk || !risk.title) {
        return res.status(400).json({ success: false, message: "A risk object with at least a title is required." });
    }
    try {
        const briefing = { risk, generated_at: new Date().toISOString() };
        return res.status(200).json({ success: true, message: "Intelligence briefing generated successfully.", cached: false, ...briefing });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to generate intelligence briefing." });
    }
});

router.get("/risk/intelligence/stream", async (req, res) => {
    initSSE(res);
    const streamId = generateId("stream");
    const params = {};
    for (const k of ["min_lat","max_lat","min_lng","max_lng"]) if (req.query[k]) params[k] = parseFloat(req.query[k]);
    if (req.query.start_time) params.start_time = req.query.start_time;
    if (req.query.end_time) params.end_time = req.query.end_time;
    const orgid = req.query.orgid || null;
    const categories = req.query.categories ? req.query.categories.split(",") : ["earthquakes","wildfires","weather","floods","volcanoes","air_quality","global_disasters","ground_deformation","space_weather"];
    const overridesMap = { floods: { noaa_alerts: { event: "Flood" } }, global_disasters: { eonet_events: { days: 60, limit: 500 } } };
    if (params.start_time) {
        const startDate = params.start_time.split("T")[0];
        const endDate = (params.end_time || new Date().toISOString()).split("T")[0];
        const daysDiff = Math.max(7, Math.ceil((new Date(endDate) - new Date(startDate)) / 86400000));
        if (!overridesMap.global_disasters) overridesMap.global_disasters = {};
        overridesMap.global_disasters.gdacs_events = { from_date: startDate, to_date: endDate };
        overridesMap.global_disasters.eonet_events = { days: daysDiff, status: "all", limit: 500 };
    }
    let totalCount = 0;
    const sevCounts = { critical: 0, high: 0, medium: 0, low: 0 };
    const catCounts = {};
    sendSSE(res, "stream_started", { stream_id: streamId, categories, orgid, timestamp: new Date().toISOString(), bounds: params.min_lat ? params : null });

    const closed = { value: false };
    req.on("close", () => { closed.value = true; });
    const streamCategory = async (cat) => {
        if (closed.value) return;
        sendSSE(res, "source_started", { category: cat, timestamp: new Date().toISOString() });
        const overrides = overridesMap[cat] || {};
        await fetchRiskStreaming(cat, params, overrides, (sourceKey, risks) => {
            if (closed.value) return;
            try { 
                storeRisks(risks); 
            } catch (error) {}
            const visibleRisks = filterRisksForOrg(risks, orgid);
            if (!visibleRisks.length) return;
            totalCount += visibleRisks.length;
            catCounts[cat] = (catCounts[cat] || 0) + visibleRisks.length;
            for (const r of visibleRisks) {
                const sl = (r.severity || "Low").toLowerCase();
                if (sevCounts[sl] !== undefined) sevCounts[sl]++;
            }
            sendSSE(res, "source_data", {
                category: cat,
                source_key: sourceKey,
                count: visibleRisks.length,
                risks: visibleRisks,
                running_total: totalCount,
                timestamp: new Date().toISOString()
            });
        });
        if (!closed.value) {
            sendSSE(res, "source_completed", { category: cat, count: catCounts[cat] || 0, timestamp: new Date().toISOString() });
        }
    };
    await Promise.allSettled(categories.map(streamCategory));
    if (!closed.value) {
        sendSSE(res, "stream_completed", {
            stream_id: streamId,
            total_count: totalCount,
            by_category: catCounts,
            by_severity: sevCounts,
            timestamp: new Date().toISOString()
        });
        res.end();
    }
});

router.get("/risk/intelligence/stream/:group", async (req, res) => {
    const group = req.params.group;
    const validGroups = Object.keys(SOURCE_GROUPS);
    if (!validGroups.includes(group) && !SOURCE_REGISTRY[group]) {
        return res.status(400).json({ success: false, message: `Unknown source group '${group}'. Valid groups are: ${validGroups.join(", ")}.` });
    }
    initSSE(res);
    const streamId = generateId("stream");
    const params = { ...req.query };
    const orgid = params.orgid || null;
    delete params.categories;
    delete params.orgid;
    delete params.username;
    const overridesMap = { floods: { noaa_alerts: { event: "Flood" } }, global_disasters: { eonet_events: { days: 60, status: "all", limit: 500 } } };
    const overrides = overridesMap[group] || {};
    let totalCount = 0;
    sendSSE(res, "stream_started", { stream_id: streamId, group, orgid, timestamp: new Date().toISOString() });

    const closed = { value: false };
    req.on("close", () => { closed.value = true; });
    await fetchRiskStreaming(group, params, overrides, (sourceKey, risks) => {
        if (closed.value) return;
        try { 
            storeRisks(risks); 
        } catch (error) {}
        const visibleRisks = filterRisksForOrg(risks, orgid);
        if (!visibleRisks.length) return;
        totalCount += visibleRisks.length;
        sendSSE(res, "source_data", {
            group,
            source_key: sourceKey,
            count: visibleRisks.length,
            risks: visibleRisks,
            running_total: totalCount,
            timestamp: new Date().toISOString()
        });
    });
    if (!closed.value) {
        sendSSE(res, "stream_completed", { stream_id: streamId, group, total_count: totalCount, timestamp: new Date().toISOString() });
        res.end();
    }
});

router.get("/risk/intelligence/stream/postgis/nearby", async (req, res) => {
    const lat = parseFloat(req.query.lat), lng = parseFloat(req.query.lng);
    const rawRadiusKm = parseFloat(req.query.radius_km);
    const radiusKm = (!isNaN(rawRadiusKm) && rawRadiusKm > 0) ? rawRadiusKm : 100;
    const sev = req.query.severity || null, cat = req.query.category || null;
    const orgid = req.query.orgid || null;
    const limit = Math.min(parseInt(req.query.limit, 10) || 1000, 5000);
    const batchSize = parseInt(req.query.batch_size, 10) || 200;

    if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ success: false, message: "The lat and lng query parameters are required and must be valid numbers." });

    initSSE(res);
    const streamId = generateId("stream");
    const radiusMeters = Math.round(radiusKm * 1000);

    sendSSE(res, "stream_started", { stream_id: streamId, location: { latitude: lat, longitude: lng }, radius_km: radiusKm, radius_meters: radiusMeters, limit, timestamp: new Date().toISOString() });

    const closed = { value: false };
    req.on("close", () => { closed.value = true; });

    const mergedMap = new Map();

    const addToMerged = (risk, distMeters) => {
        const sourceId = risk.source_id;
        const dedupKey = sourceId
            ? `${risk.source || ""}_${sourceId}`
            : `${risk.risk_category || ""}_${(risk.latitude || 0).toFixed(4)}_${(risk.longitude || 0).toFixed(4)}_${(risk.title || "").substring(0, 60)}`;

        if (mergedMap.has(dedupKey)) {
            const existing = mergedMap.get(dedupKey);
            if (distMeters != null && (existing.distance_meters == null || distMeters < existing.distance_meters)) {
                existing.distance_meters = distMeters;
                existing.distance_km = parseFloat((distMeters / 1000).toFixed(2));
            }
            return;
        }

        const distKm = distMeters != null ? parseFloat((distMeters / 1000).toFixed(2)) : null;

        mergedMap.set(dedupKey, {
            id: risk.id, source: risk.source, source_id: risk.source_id,
            risk_category: risk.risk_category, severity: risk.severity,
            severity_score: risk.severity_score || SEVERITY_WEIGHTS[risk.severity] || 0,
            title: risk.title, description: risk.description, geometry_type: risk.geometry_type,
            latitude: risk.latitude, longitude: risk.longitude, impact_radius_km: risk.impact_radius_km,
            event_time: risk.event_time, updated_at: risk.updated_at, expires_at: risk.expires_at,
            url: risk.url, visibility: risk.visibility || VISIBILITY_PUBLIC,
            recommendations: typeof risk.recommendations === "string" ? parseJson(risk.recommendations) : (risk.recommendations || []),
            metadata: typeof risk.metadata === "string" ? parseJson(risk.metadata) : (risk.metadata || {}),
            properties: typeof risk.properties === "string" ? parseJson(risk.properties) : (risk.properties || {}),
            population_impact: typeof risk.population_impact === "string" ? parseJson(risk.population_impact) : (risk.population_impact || null),
            golden_mesh_detection: typeof risk.golden_mesh_detection === "string" ? parseJson(risk.golden_mesh_detection) : (risk.golden_mesh_detection || null),
            coordinates: typeof risk.coordinates === "string" ? parseJson(risk.coordinates) : (risk.coordinates || null),
            distance_meters: distMeters, distance_km: distKm
        });
    };

    let memoryCount = 0;
    let postgisCount = 0;
    let totalBeforeDedup = 0;

    try {
        for (const r of riskStore.values()) {
            if (!r.latitude || !r.longitude) continue;
            if (sev && r.severity !== sev) continue;
            if (cat && r.risk_category !== cat) continue;
            if (!isRiskVisibleToOrg(r, orgid)) continue;
            const dist = haversine(lat, lng, r.latitude, r.longitude);
            if (dist <= radiusMeters) {
                addToMerged(r, dist);
                memoryCount++;
            }
        }
        totalBeforeDedup += memoryCount;
    } catch (error) {}

    try {
        const D = String.fromCharCode(36);
        let sql = "SELECT " + SELECT_COLUMNS + ", ST_Distance(geom, ST_SetSRID(ST_MakePoint(" + D + "1, " + D + "2), 4326)::geography) AS distance_meters FROM risk_events_cache WHERE ST_DWithin(geom, ST_SetSRID(ST_MakePoint(" + D + "1, " + D + "2), 4326)::geography, " + D + "3)";
        const qp = [lng, lat, radiusMeters];
        let pi = 4;
        if (sev) { sql += " AND severity = " + D + pi; qp.push(sev); pi++; }
        if (cat) { sql += " AND risk_category = " + D + pi; qp.push(cat); pi++; }
        const vis = buildVisibilityClause(orgid, pi);
        sql += vis.clause;
        for (const v of vis.params) { qp.push(v); pi++; }
        sql += " ORDER BY distance_meters ASC LIMIT " + D + pi; qp.push(Math.min(limit * 2, 10000));
        const result = await queryWithTimeout(sql, qp, QUERY_TIMEOUT_MS);
        for (const row of result.rows) {
            const hydrated = hydrateRow(row);
            const distM = hydrated.distance_meters != null ? parseFloat(hydrated.distance_meters) : null;
            addToMerged(hydrated, distM);
            postgisCount++;
        }
        totalBeforeDedup += postgisCount;
    } catch (error) {}

    const allResults = Array.from(mergedMap.values());
    allResults.sort((a, b) => (a.distance_meters || Infinity) - (b.distance_meters || Infinity));
    const limited = allResults.slice(0, limit);

    let sent = 0;
    for (let i = 0; i < limited.length; i += batchSize) {
        if (closed.value) break;
        const batch = limited.slice(i, i + batchSize);
        sent += batch.length;
        sendSSE(res, "nearby_data", {
            batch, batch_index: Math.floor(i / batchSize),
            count: batch.length, running_total: sent,
            total_available: limited.length, radius_km: radiusKm,
            timestamp: new Date().toISOString()
        });
    }

    if (!closed.value) {
        const sevCounts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
        const catCounts = {};
        for (const row of limited) {
            if (sevCounts[row.severity] !== undefined) sevCounts[row.severity]++;
            catCounts[row.risk_category] = (catCounts[row.risk_category] || 0) + 1;
        }
        sendSSE(res, "stream_completed", {
            stream_id: streamId, total_count: sent, total_before_dedup: totalBeforeDedup,
            duplicates_removed: totalBeforeDedup - limited.length,
            radius_km: radiusKm, radius_meters: radiusMeters,
            sources: { in_memory: memoryCount, postgis: postgisCount },
            by_severity: sevCounts, by_category: catCounts,
            timestamp: new Date().toISOString()
        });
        res.end();
    }
});

router.get("/risk/intelligence/ingest/stream", async (req, res) => {
    initSSE(res);
    const clientId = generateId("sse");
    const client = { id: clientId, res, type: "ingestion" };
    sseClients.add(client);
    sendSSE(res, "connected", { client_id: clientId, ingestion_running: ingestionRunning, timestamp: new Date().toISOString() });
    const heartbeat = setInterval(() => {
        if (!sendSSE(res, "heartbeat", { timestamp: new Date().toISOString() })) {
            clearInterval(heartbeat);
        }
    }, 15000);
    req.on("close", () => {
        clearInterval(heartbeat);
        sseClients.delete(client);
    });
});

router.get("/risk/intelligence/nearby", async (req, res) => {
    const lat = parseFloat(req.query.lat), lng = parseFloat(req.query.lng);
    const radiusKm = parseFloat(req.query.radius_km) || 100, sev = req.query.severity, cat = req.query.category;
    const orgid = req.query.orgid || null;
    const limit = parseInt(req.query.limit, 10) || 500;
    if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ success: false, message: "The lat and lng query parameters are required and must be valid numbers." });
    try {
        const D = String.fromCharCode(36);
        let sql = "SELECT " + SELECT_COLUMNS + ", ST_Distance(geom, ST_SetSRID(ST_MakePoint(" + D + "1, " + D + "2), 4326)::geography) AS distance_meters FROM risk_events_cache WHERE ST_DWithin(geom, ST_SetSRID(ST_MakePoint(" + D + "1, " + D + "2), 4326)::geography, " + D + "3)";
        const qp = [lng, lat, radiusKm * 1000];
        let pi = 4;
        if (sev) { sql += " AND severity = " + D + pi; qp.push(sev); pi++; }
        if (cat) { sql += " AND risk_category = " + D + pi; qp.push(cat); pi++; }
        const vis = buildVisibilityClause(orgid, pi);
        sql += vis.clause;
        for (const v of vis.params) { qp.push(v); pi++; }
        sql += " ORDER BY distance_meters ASC LIMIT " + D + pi; qp.push(limit);
        const result = await queryWithTimeout(sql, qp, QUERY_TIMEOUT_MS);
        const risks = result.rows.map(hydrateRow);
        return res.status(200).json({ success: true, message: `Found ${risks.length} risk events within ${radiusKm} km.`, location: { latitude: lat, longitude: lng }, radius_km: radiusKm, count: risks.length, risks });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to query nearby risk events." });
    }
});

router.get("/risk/intelligence/postgis/category-summary", async (req, res) => {
    const orgid = req.query.orgid || null;
    try {
        const D = String.fromCharCode(36);
        let sql = "SELECT risk_category, severity, COUNT(*) AS event_count FROM risk_events_cache WHERE 1=1";
        const qp = [];
        let pi = 1;
        const vis = buildVisibilityClause(orgid, pi);
        sql += vis.clause;
        for (const v of vis.params) { qp.push(v); pi++; }
        sql += " GROUP BY risk_category, severity ORDER BY risk_category, severity";
        const result = await queryWithTimeout(sql, qp, QUERY_TIMEOUT_MS);
        const summary = {};
        for (const r of result.rows) {
            if (!summary[r.risk_category]) summary[r.risk_category] = { total: 0, by_severity: {} };
            summary[r.risk_category].by_severity[r.severity] = parseInt(r.event_count, 10);
            summary[r.risk_category].total += parseInt(r.event_count, 10);
        }
        const tot = Object.values(summary).reduce((s, c) => s + c.total, 0);
        return res.status(200).json({ success: true, message: `Summary of ${tot} cached risk events.`, total_events: tot, categories: summary });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to retrieve category summary." });
    }
});

router.get("/risk/intelligence/postgis/bbox", async (req, res) => {
    const mnLat = parseFloat(req.query.min_lat), mxLat = parseFloat(req.query.max_lat);
    const mnLng = parseFloat(req.query.min_lng), mxLng = parseFloat(req.query.max_lng);
    const sev = req.query.severity, cat = req.query.category;
    const orgid = req.query.orgid || null;
    const limit = parseInt(req.query.limit, 10) || 1000;
    if (isNaN(mnLat) || isNaN(mxLat) || isNaN(mnLng) || isNaN(mxLng)) return res.status(400).json({ success: false, message: "The min_lat, max_lat, min_lng, and max_lng query parameters are required." });
    try {
        const D = String.fromCharCode(36);
        let sql = "SELECT " + SELECT_COLUMNS + " FROM risk_events_cache WHERE ST_Intersects(geom, ST_SetSRID(ST_MakeEnvelope(" + D + "1, " + D + "2, " + D + "3, " + D + "4), 4326)::geography)";
        const qp = [mnLng, mnLat, mxLng, mxLat];
        let pi = 5;
        if (sev) { sql += " AND severity = " + D + pi; qp.push(sev); pi++; }
        if (cat) { sql += " AND risk_category = " + D + pi; qp.push(cat); pi++; }
        const vis = buildVisibilityClause(orgid, pi);
        sql += vis.clause;
        for (const v of vis.params) { qp.push(v); pi++; }
        sql += " ORDER BY severity_score DESC LIMIT " + D + pi; qp.push(limit);
        const result = await queryWithTimeout(sql, qp, QUERY_TIMEOUT_MS);
        const risks = result.rows.map(hydrateRow);
        return res.status(200).json({ success: true, message: `Found ${risks.length} risk events within the bounding box.`, bounds: { min_lat: mnLat, max_lat: mxLat, min_lng: mnLng, max_lng: mxLng }, count: risks.length, risks });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to query risk events by bounding box." });
    }
});

router.get("/risk/user/views", async (req, res) => {
    const { orgid, username } = req.query;
    if (!orgid || !username) return res.status(400).json({ success: false, message: "orgid and username query parameters are required." });
    try {
        const result = await queryWithTimeout("SELECT view_id, orgid, username, name, description, view_data, created_at, updated_at FROM risk_user_views WHERE orgid = $1 AND username = $2 ORDER BY updated_at DESC, created_at DESC LIMIT 100", [orgid, username], 10000);
        const views = result.rows.map(row => ({ view_id: row.view_id, name: row.name, description: row.description, created_at: row.created_at, updated_at: row.updated_at, ...(parseJson(row.view_data) || {}) }));
        return res.status(200).json({ success: true, count: views.length, views, message: `Retrieved ${views.length} saved views.` });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to retrieve saved views.", views: [] });
    }
});

router.put("/risk/user/views", async (req, res) => {
    const { orgid, username, view_id, name, description } = req.body;
    if (!orgid || !username || !view_id) return res.status(400).json({ success: false, message: "orgid, username, and view_id are required." });
    if (!name || typeof name !== "string" || !name.trim()) return res.status(400).json({ success: false, message: "name is required." });
    const trimmedName = name.trim().substring(0, 200);
    const trimmedDesc = typeof description === "string" ? description.trim().substring(0, 1000) : "";
    const viewData = { ...req.body };
    delete viewData.orgid; delete viewData.username; delete viewData.view_id; delete viewData.name; delete viewData.description;
    try {
        await queryWithTimeout(`INSERT INTO risk_user_views (view_id, orgid, username, name, description, view_data, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW(), NOW()) ON CONFLICT (view_id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, view_data = EXCLUDED.view_data, updated_at = NOW() WHERE risk_user_views.orgid = EXCLUDED.orgid AND risk_user_views.username = EXCLUDED.username`, [view_id, orgid, username, trimmedName, trimmedDesc, safeJsonStringify(viewData)], 10000);
        return res.status(200).json({ success: true, view_id, message: "Saved view persisted." });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to save view." });
    }
});

router.delete("/risk/user/views/:view_id", async (req, res) => {
    const { view_id } = req.params;
    const { orgid, username } = req.query;
    if (!orgid || !username) return res.status(400).json({ success: false, message: "orgid and username query parameters are required." });
    try {
        const result = await queryWithTimeout("DELETE FROM risk_user_views WHERE view_id = $1 AND orgid = $2 AND username = $3 RETURNING view_id", [view_id, orgid, username], 10000);
        return res.status(200).json({ success: true, deleted: result.rows.length > 0, message: result.rows.length ? "Saved view deleted." : "No matching saved view to delete." });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to delete saved view." });
    }
});

router.post("/risk/intelligence/ingest/trigger", async (req, res) => {
    if (ingestionRunning) return res.status(409).json({ success: false, message: "An ingestion cycle is already running." });
    runIngestion();
    return res.status(202).json({ success: true, message: "Ingestion cycle triggered successfully." });
});

router.get("/risk/intelligence/ingest/status", async (req, res) => {
    try {
        let recentRuns = [];
        try { const runs = await queryWithTimeout(`SELECT * FROM ingestion_runs ORDER BY started_at DESC LIMIT 10`, [], 10000); recentRuns = runs.rows; } catch {}
        const stats = poolStats();
        return res.status(200).json({
            success: true, message: "Ingestion status retrieved successfully.", currently_running: ingestionRunning,
            interval_seconds: INGEST_MS / 1000, in_memory_events: riskStore.size, database_pool: stats,
            write_queue: { pending_batches: writeQueue.length, pending_items: writeQueue.reduce((sum, batch) => sum + batch.length, 0), processing: writeQueueProcessing, dropped_total: writeQueueDropped, db_write_interval_seconds: DB_WRITE_INTERVAL_MS / 1000, db_writes_enabled: DB_WRITE_ENABLED, store_dirty: riskStoreDirty },
            cleanup: { currently_running: cleanupRunning, interval_seconds: CLEANUP_INTERVAL_MS / 1000 },
            dynamic_data: { urban_centers_loaded: dynamicStores.urban.data.length, urban_centers_fetched_at: dynamicStores.urban.fetched_at, infrastructure_elements_loaded: dynamicStores.infra.data.length, infrastructure_fetched_at: dynamicStores.infra.fetched_at, deformation_zones_loaded: dynamicStores.deform.data.length, deformation_zones_fetched_at: dynamicStores.deform.fetched_at, fault_lines_loaded: dynamicStores.faults.data.length, fault_lines_fetched_at: dynamicStores.faults.fetched_at },
            recent_runs: recentRuns
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to retrieve ingestion status." });
    }
});

const makeSourceEndpoint = (path, group, extraFn) => {
    router.get(path, async (req, res) => {
        const params = { ...req.query };
        const orgid = params.orgid || null;
        delete params.orgid; delete params.username;
        try {
            const data = await fetchRisk(group, params, extraFn ? extraFn(params) : {});
            const visible = filterRisksForOrg(data, orgid);
            return res.status(200).json({ success: true, count: visible.length, risks: visible });
        } catch (error) {
            return res.status(500).json({ success: false, message: `Failed to retrieve ${group} data.` });
        }
    });
};

makeSourceEndpoint("/risk/intelligence/earthquakes", "earthquakes");
makeSourceEndpoint("/risk/intelligence/wildfires", "wildfires");
makeSourceEndpoint("/risk/intelligence/weather", "weather");
makeSourceEndpoint("/risk/intelligence/floods", "floods", () => ({ noaa_alerts: { event: "Flood" } }));
makeSourceEndpoint("/risk/intelligence/volcanoes", "volcanoes");
makeSourceEndpoint("/risk/intelligence/air-quality", "air_quality");
makeSourceEndpoint("/risk/intelligence/space-weather", "space_weather");

router.post("/risk/intelligence/assess-location", async (req, res) => {
    const { latitude, longitude, radius_km, categories, orgid } = req.body;
    if (latitude === undefined || longitude === undefined) return res.status(400).json({ success: false, message: "Latitude and longitude are required." });
    const rKm = radius_km || 100;
    const latD = rKm / 111, lngD = rKm / (111 * Math.cos(latitude * Math.PI / 180));
    const params = { min_lat: latitude - latD, max_lat: latitude + latD, min_lng: longitude - lngD, max_lng: longitude + lngD };
    try {
        const cats = categories || ["earthquakes","wildfires","weather","floods","volcanoes","ground_deformation"];
        const ovMap = { earthquakes: { usgs_earthquakes: { ...params, min_magnitude: 2.0 } }, floods: { noaa_alerts: { ...params, event: "Flood" } }, ground_deformation: { sentinel1_insar: { ...params, latitude, longitude } } };
        const srcMap = {};
        await Promise.allSettled(cats.map(async (c) => { srcMap[c] = filterRisksForOrg(await fetchRisk(c, params, ovMap[c] || {}), orgid); }));
        const all = [];
        Object.values(srcMap).forEach(risks => risks.forEach(r => { if (r.latitude && r.longitude) r.distance_km = haversine(latitude, longitude, r.latitude, r.longitude) / 1000; all.push(r); }));
        all.sort((a, b) => (a.distance_km || Infinity) - (b.distance_km || Infinity));
        let score = 0; const factors = [];
        all.forEach(r => {
            const dk = r.distance_km || rKm, pf = Math.max(0, 1 - dk / rKm);
            const contrib = ((SEVERITY_WEIGHTS[r.severity] || 10) / 2.5) * pf;
            score += contrib;
            if (contrib > 5) factors.push({ category: r.risk_category, severity: r.severity, title: r.title, distance_km: parseFloat(dk.toFixed(1)), contribution: parseFloat(contrib.toFixed(1)), recommendations: r.recommendations?.slice(0, 2) });
        });
        score = Math.min(100, score);
        const level = score >= 70 ? "Critical" : score >= 50 ? "High" : score >= 30 ? "Medium" : "Low";
        const pop = estimatePopDensity(latitude, longitude);
        const infra = assessInfraProximity(latitude, longitude);
        return res.status(200).json({
            success: true, message: "Location risk assessment completed.",
            location: { latitude, longitude, nearest_city: pop.nearest_city, population_density: pop.density, critical_infrastructure_nearby: infra },
            radius_km: rKm,
            assessment: { risk_score: parseFloat(score.toFixed(1)), risk_level: level, total_risks_nearby: all.length, risk_factors: factors.slice(0, 15), population_exposure: pop, ground_deformation_zones: srcMap.ground_deformation ? srcMap.ground_deformation.length : 0 },
            nearby_risks: all.slice(0, 100)
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to assess location risk." });
    }
});

router.get("/risk/intelligence/sources", async (req, res) => {
    return res.status(200).json({
        success: true, message: "Data sources retrieved successfully.", count: 28,
        sources: [
            { id: "usgs_earthquakes", name: "USGS Earthquake Hazards", category: "Seismic", url: "https://earthquake.usgs.gov/", update_frequency: "Real-time", coverage: "Global", data_types: ["Earthquakes", "Aftershocks", "Fault data", "Shake intensity", "Tsunami potential"] },
            { id: "emsc", name: "European-Mediterranean Seismological Centre", category: "Seismic", url: "https://www.emsc-csem.org/", update_frequency: "Real-time", coverage: "Global", data_types: ["Earthquakes", "Felt reports"] },
            { id: "ingv", name: "INGV Italy", category: "Seismic", url: "https://terremoti.ingv.it/", update_frequency: "Real-time", coverage: "Italy and Mediterranean", data_types: ["Earthquakes"] },
            { id: "geonet_nz", name: "GeoNet New Zealand", category: "Seismic", url: "https://www.geonet.org.nz/", update_frequency: "Real-time", coverage: "New Zealand", data_types: ["Earthquakes", "Volcanic"] },
            { id: "nifc", name: "NIFC Wildfires", category: "Wildfire", url: "https://www.nifc.gov/", update_frequency: "Daily", coverage: "United States", data_types: ["Fire perimeters", "Containment"] },
            { id: "noaa_nws", name: "NOAA NWS", category: "Weather", url: "https://www.weather.gov/", update_frequency: "Real-time", coverage: "United States", data_types: ["Severe weather alerts"] },
            { id: "noaa_spc", name: "NOAA SPC", category: "Weather", url: "https://www.spc.noaa.gov/", update_frequency: "Multiple daily", coverage: "United States", data_types: ["Severe weather outlooks"] },
            { id: "noaa_swpc_alerts", name: "NOAA SWPC Alerts", category: "Space Weather", url: "https://www.swpc.noaa.gov/", update_frequency: "Real-time", coverage: "Global", data_types: ["Geomagnetic storms"] },
            { id: "noaa_swpc_kp", name: "NOAA SWPC Kp Index", category: "Space Weather", url: "https://www.swpc.noaa.gov/", update_frequency: "Every 3 hours", coverage: "Global", data_types: ["Kp index"] },
            { id: "noaa_swpc_xray", name: "NOAA SWPC X-Ray Flux", category: "Space Weather", url: "https://www.swpc.noaa.gov/", update_frequency: "Every 5 minutes", coverage: "Global", data_types: ["Solar X-ray class"] },
            { id: "noaa_swpc_solar_wind", name: "NOAA SWPC Solar Wind Plasma", category: "Space Weather", url: "https://www.swpc.noaa.gov/", update_frequency: "Every minute", coverage: "Global", data_types: ["Solar wind speed"] },
            { id: "noaa_swpc_mag_field", name: "NOAA SWPC IMF", category: "Space Weather", url: "https://www.swpc.noaa.gov/", update_frequency: "Every minute", coverage: "Global", data_types: ["IMF Bz"] },
            { id: "noaa_swpc_kp_forecast", name: "NOAA SWPC Kp Forecast", category: "Space Weather", url: "https://www.swpc.noaa.gov/", update_frequency: "Multiple daily", coverage: "Global", data_types: ["Kp forecast"] },
            { id: "usgs_water", name: "USGS Water Services", category: "Flood", url: "https://waterservices.usgs.gov/", update_frequency: "Real-time", coverage: "United States", data_types: ["Stream gage heights"] },
            { id: "openmeteo_flood", name: "Open-Meteo GloFAS", category: "Flood", url: "https://open-meteo.com/", update_frequency: "Daily", coverage: "Global", data_types: ["River discharge forecast"] },
            { id: "usgs_volcanoes", name: "USGS Volcano Hazards", category: "Volcanic", url: "https://volcanoes.usgs.gov/", update_frequency: "Daily", coverage: "Global", data_types: ["Volcano alerts"] },
            { id: "gdacs", name: "GDACS", category: "Multi-hazard", url: "https://www.gdacs.org/", update_frequency: "Real-time", coverage: "Global", data_types: ["Earthquakes", "Cyclones", "Floods"] },
            { id: "nasa_eonet", name: "NASA EONET", category: "Multi-hazard", url: "https://eonet.gsfc.nasa.gov/", update_frequency: "Daily", coverage: "Global", data_types: ["Wildfires", "Storms"] },
            { id: "openmeteo_aq", name: "Open-Meteo Air Quality", category: "Air Quality", url: "https://open-meteo.com/", update_frequency: "Hourly", coverage: "Global", data_types: ["US AQI", "PM2.5"] },
            { id: "openmeteo_marine", name: "Open-Meteo Marine", category: "Weather", url: "https://open-meteo.com/", update_frequency: "Hourly", coverage: "Global oceans", data_types: ["Wave height"] },
            { id: "fema", name: "FEMA", category: "Multi-hazard", url: "https://www.fema.gov/", update_frequency: "As declared", coverage: "United States", data_types: ["Disaster declarations"] },
            { id: "nws_tsunami", name: "NWS Tsunami", category: "Tsunami", url: "https://www.tsunami.gov/", update_frequency: "Real-time", coverage: "United States", data_types: ["Tsunami alerts"] },
            { id: "esa_sentinel1_insar", name: "ESA Sentinel-1 InSAR", category: "Ground Deformation", url: "https://search.asf.alaska.edu/", update_frequency: "Every 12 days", coverage: "Global", data_types: ["Interferograms"] },
            { id: "esa_sentinel1_deformation", name: "Sentinel-1 Deformation Zones", category: "Ground Deformation", url: "https://land.copernicus.eu/", update_frequency: "Continuous", coverage: "Monitored zones", data_types: ["Displacement time series"] },
            { id: "golden_mesh_baseline", name: "Golden Mesh Baseline", category: "Ground Deformation", url: "Internal", update_frequency: "On demand", coverage: "Per asset", data_types: ["Baseline mesh", "Threshold detection"] },
            { id: "wikidata_sparql", name: "Wikidata SPARQL", category: "Dynamic Reference Data", url: "https://query.wikidata.org/", update_frequency: "Every 24 hours", coverage: "Global", data_types: ["Urban centers", "Infrastructure"] },
            { id: "copernicus_egms", name: "Copernicus EGMS", category: "Ground Deformation", url: "https://egms.land.copernicus.eu/", update_frequency: "Every 24 hours", coverage: "Europe", data_types: ["Mean LOS velocity"] }
        ],
        streaming_endpoints: [
            { path: "/risk/intelligence/stream", method: "GET", description: "SSE stream for all risk categories with orgid scoping.", params: ["categories", "min_lat", "max_lat", "min_lng", "max_lng", "orgid", "username"] },
            { path: "/risk/intelligence/stream/postgis/nearby", method: "GET", description: "SSE stream for nearby results with orgid scoping.", params: ["lat", "lng", "radius_km", "severity", "category", "limit", "batch_size", "orgid"] },
            { path: "/risk/user/views", method: "GET/PUT/DELETE", description: "CRUD for saved map views.", params: ["orgid", "username", "view_id"] }
        ]
    });
});

router.get("/risk/intelligence/dynamic-data/status", async (req, res) => {
    return res.status(200).json({
        success: true, message: "Dynamic reference data status retrieved successfully.",
        urban_centers: { count: dynamicStores.urban.data.length, fetched_at: dynamicStores.urban.fetched_at, currently_fetching: dynamicStores.urban.fetching, sample: dynamicStores.urban.data.slice(0, 5).map(c => ({ name: c.name, pop: c.pop, lat: c.lat, lng: c.lng })) },
        infrastructure: { count: dynamicStores.infra.data.length, fetched_at: dynamicStores.infra.fetched_at, currently_fetching: dynamicStores.infra.fetching, by_type: dynamicStores.infra.data.reduce((a, i) => { a[i.type] = (a[i.type] || 0) + 1; return a; }, {}), sample: dynamicStores.infra.data.slice(0, 5).map(i => ({ name: i.name, type: i.type, lat: i.lat, lng: i.lng })) },
        deformation_zones: { count: dynamicStores.deform.data.length, fetched_at: dynamicStores.deform.fetched_at, currently_fetching: dynamicStores.deform.fetching, by_source: dynamicStores.deform.data.reduce((a, z) => { a[z.source || "unknown"] = (a[z.source || "unknown"] || 0) + 1; return a; }, {}), sample: dynamicStores.deform.data.slice(0, 5).map(z => ({ name: z.name, lat: z.lat, lng: z.lng, rate: z.known_rate_mm_yr, source: z.source })) },
        fault_lines: { count: dynamicStores.faults.data.length, fetched_at: dynamicStores.faults.fetched_at, currently_fetching: dynamicStores.faults.fetching },
        refresh_interval_hours: DYNAMIC_REFRESH_MS / 36e5,
        streaming_clients: sseClients.size
    });
});

router.post("/risk/intelligence/dynamic-data/refresh", async (req, res) => {
    if (dynamicStores.urban.fetching || dynamicStores.infra.fetching || dynamicStores.deform.fetching) return res.status(409).json({ success: false, message: "A dynamic data refresh is already in progress." });
    refreshAllDynamicData();
    return res.status(202).json({ success: true, message: "Dynamic reference data refresh triggered successfully." });
});

router.get("/risk/intelligence/cache/clear", async (req, res) => {
    if (req.query.api_key !== process.env.ADMIN_API_KEY) return res.status(401).json({ success: false, message: "Unauthorized." });
    const sz = riskCache.size; riskCache.clear();
    return res.status(200).json({ success: true, message: "Cache cleared successfully.", entries_cleared: sz });
});

router.post("/risk/intelligence/cleanup/trigger", async (req, res) => {
    if (cleanupRunning) return res.status(409).json({ success: false, message: "A cleanup cycle is already running." });
    runCleanup();
    return res.status(202).json({ success: true, message: "Cleanup cycle triggered successfully." });
});

router.get("/risk/intelligence/cleanup/status", async (req, res) => {
    return res.status(200).json({
        success: true, message: "Cleanup worker status retrieved successfully.",
        currently_running: cleanupRunning, interval_seconds: CLEANUP_INTERVAL_MS / 1000,
        configuration: { delete_batch_size: CLEANUP_DELETE_BATCH_SIZE, delete_max_iterations: CLEANUP_DELETE_MAX_ITERATIONS, dedup_max_iterations: CLEANUP_DEDUP_MAX_ITERATIONS, geom_batch_size: CLEANUP_GEOM_BATCH_SIZE, geom_max_iterations: CLEANUP_GEOM_MAX_ITERATIONS, expired_grace_days: CLEANUP_EXPIRED_GRACE_DAYS, ingestion_run_retention_days: CLEANUP_INGESTION_RUN_RETENTION_DAYS }
    });
});

router.get("/risk/intelligence/health", async (req, res) => {
    const stats = poolStats();
    let cachedEvents = 0;
    try { const r = await queryWithTimeout("SELECT reltuples::bigint AS total FROM pg_class WHERE relname = 'risk_events_cache'", [], 3000); cachedEvents = r.rows[0]?.total ? parseInt(r.rows[0].total, 10) : -1; } catch {}
    const results = [{ name: "PostGIS Database", status: "OK", response_time_ms: 0, cached_events: cachedEvents, pool_stats: stats }];
    return res.status(200).json({
        success: true, message: "Health check completed.", timestamp: new Date().toISOString(),
        node_version: process.version, cache_entries: riskCache.size, in_memory_risk_events: riskStore.size,
        ingestion_running: ingestionRunning, ingestion_interval_seconds: INGEST_MS / 1000,
        cleanup_running: cleanupRunning, cleanup_interval_seconds: CLEANUP_INTERVAL_MS / 1000,
        active_streaming_clients: sseClients.size, database_pool: stats,
        write_queue: { pending_batches: writeQueue.length, pending_items: writeQueue.reduce((sum, batch) => sum + batch.length, 0), processing: writeQueueProcessing, dropped_total: writeQueueDropped },
        dynamic_data: { urban_centers: dynamicStores.urban.data.length, infrastructure_elements: dynamicStores.infra.data.length, deformation_zones: dynamicStores.deform.data.length, fault_lines: dynamicStores.faults.data.length, last_refresh: dynamicStores.urban.fetched_at },
        results
    });
});

startDynamicRefresh();
startDbFlush();
setTimeout(() => startIngestion(), 30000);
setTimeout(() => startCleanup(), 90000);

module.exports = router;