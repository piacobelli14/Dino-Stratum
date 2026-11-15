const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const zlib = require("zlib");
const v8 = require("v8");
const { pool } = require("../../config/db");

const SOURCE_URLS = {
    DATA_GDELTPROJECT_ORG_GDELTV2_LASTUPDATE_TXT: "http://data.gdeltproject.org/gdeltv2/lastupdate.txt",
    DATA_GDELTPROJECT_ORG_GDELTV2: "http://data.gdeltproject.org/gdeltv2/",
    ALERTS_WEATHER_GOV: "https://alerts.weather.gov",
    API_GDELTPROJECT_ORG_API_V2_GEO_GEO: "https://api.gdeltproject.org/api/v2/geo/geo",
    MESONET_AGRON_IASTATE_EDU_GEOJSON_LSR_GEOJSON: "https://mesonet.agron.iastate.edu/geojson/lsr.geojson?hours=24",
    MESONET_AGRON_IASTATE_EDU_GEOJSON_LSR_GEOJSON_2: "https://mesonet.agron.iastate.edu/geojson/lsr.geojson",
    NEWS_GOOGLE_COM_RSS_SEARCH: "https://news.google.com/rss/search",
    SPC_NOAA_GOV_PRODUCTS_OUTLOOK: "https://www.spc.noaa.gov/products/outlook/",
    GDACS_ORG_XML_RSS_XML: "https://www.gdacs.org/xml/rss.xml",
    VOLCANOES_USGS_GOV_VSC_API_VOLCANOAPI_VOLCANOESGVP: "https://volcanoes.usgs.gov/vsc/api/volcanoApi/volcanoesGVP",
    SERVICES_SWPC_NOAA_GOV_PRODUCTS_ALERTS_JSON: "https://services.swpc.noaa.gov/products/alerts.json",
    SERVICES_SWPC_NOAA_GOV_PRODUCTS_NOAA_PLANETARY_K_INDEX_JSON: "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json",
    SERVICES_SWPC_NOAA_GOV_JSON_GOES_PRIMARY_XRAYS_7_DAY_JSON: "https://services.swpc.noaa.gov/json/goes/primary/xrays-7-day.json",
    SERVICES_SWPC_NOAA_GOV_PRODUCTS_SOLAR_WIND_PLASMA_7_DAY_JSON: "https://services.swpc.noaa.gov/products/solar-wind/plasma-7-day.json",
    SERVICES_SWPC_NOAA_GOV_PRODUCTS_SOLAR_WIND_MAG_7_DAY_JSON: "https://services.swpc.noaa.gov/products/solar-wind/mag-7-day.json",
    SERVICES_SWPC_NOAA_GOV_PRODUCTS_NOAA_PLANETARY_K_INDEX_FOREC: "https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json",
    API_WEATHER_GOV_ALERTS_ACTIVE: "https://api.weather.gov/alerts/active?event=Tsunami",
    TSUNAMI_GOV: "https://www.tsunami.gov/",
    FIRMS_MODAPS_EOSDIS_NASA_GOV_MAP: "https://firms.modaps.eosdis.nasa.gov/map/",
    MESONET_AGRON_IASTATE_EDU_LSR: "https://mesonet.agron.iastate.edu/lsr/",
    AIRNOW_GOV: "https://www.airnow.gov/",
    SEARCH_ASF_ALASKA_EDU: "https://search.asf.alaska.edu/#/?dataset=SENTINEL-1%20INTERFEROGRAM%20(BETA)&productTypes=GUNW_STD",
    EGMS_LAND_COPERNICUS_EU_API_OGC_FEATURES_V1_COLLECTIONS_L3_2: "https://egms.land.copernicus.eu/api/ogc/features/v1/collections/L3_2018_2022_ortho/items?limit=500&f=json",
    SEARCH_ASF_ALASKA_EDU_2: "https://search.asf.alaska.edu/#/?dataset=SENTINEL-1%20INTERFEROGRAM%20(BETA)",
    EARTHQUAKE_USGS_GOV: "https://earthquake.usgs.gov/",
    EMSC_CSEM_ORG: "https://www.emsc-csem.org/",
    TERREMOTI_INGV_IT: "https://terremoti.ingv.it/",
    GEONET_ORG_NZ: "https://www.geonet.org.nz/",
    NIFC_GOV: "https://www.nifc.gov/",
    WEATHER_GOV: "https://www.weather.gov/",
    SPC_NOAA_GOV: "https://www.spc.noaa.gov/",
    SWPC_NOAA_GOV: "https://www.swpc.noaa.gov/",
    WATERSERVICES_USGS_GOV: "https://waterservices.usgs.gov/",
    OPEN_METEO_COM: "https://open-meteo.com/",
    VOLCANOES_USGS_GOV: "https://volcanoes.usgs.gov/",
    GDACS_ORG: "https://www.gdacs.org/",
    EONET_GSFC_NASA_GOV: "https://eonet.gsfc.nasa.gov/",
    FEMA_GOV: "https://www.fema.gov/",
    GDELTPROJECT_ORG: "https://www.gdeltproject.org/",
    SEARCH_ASF_ALASKA_EDU_3: "https://search.asf.alaska.edu/",
    LAND_COPERNICUS_EU: "https://land.copernicus.eu/",
    QUERY_WIKIDATA_ORG: "https://query.wikidata.org/",
    EGMS_LAND_COPERNICUS_EU: "https://egms.land.copernicus.eu/",
    QUERY_WIKIDATA_ORG_SPARQL: "https://query.wikidata.org/sparql",
    EARTHQUAKE_USGS_GOV_FDSNWS_EVENT_1_QUERY: "https://earthquake.usgs.gov/fdsnws/event/1/query",
    SEISMICPORTAL_EU_FDSNWS_EVENT_1_QUERY: "https://www.seismicportal.eu/fdsnws/event/1/query",
    EMSC_CSEM_ORG_EARTHQUAKE_EARTHQUAKE_PHP: "https://www.emsc-csem.org/Earthquake/earthquake.php",
    WEBSERVICES_INGV_IT_FDSNWS_EVENT_1_QUERY: "https://webservices.ingv.it/fdsnws/event/1/query",
    TERREMOTI_INGV_IT_EVENT: "https://terremoti.ingv.it/event/",
    API_GEONET_ORG_NZ_QUAKE: "https://api.geonet.org.nz/quake",
    GEONET_ORG_NZ_EARTHQUAKE: "https://www.geonet.org.nz/earthquake/",
    API_WEATHER_GOV_ALERTS_ACTIVE_2: "https://api.weather.gov/alerts/active",
    SPC_NOAA_GOV_PRODUCTS_OUTLOOK_DAY: "https://www.spc.noaa.gov/products/outlook/day",
    GDACS_ORG_GDACSAPI_API_EVENTS_GETEVENTLIST_SEARCH: "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH",
    GDACS_ORG_REPORT_ASPX: "https://www.gdacs.org/report.aspx",
    VOLCANOES_USGS_GOV_VOLCANOES: "https://volcanoes.usgs.gov/volcanoes/",
    EONET_GSFC_NASA_GOV_API_V3_EVENTS: "https://eonet.gsfc.nasa.gov/api/v3/events",
    AIR_QUALITY_API_OPEN_METEO_COM_V1_AIR_QUALITY: "https://air-quality-api.open-meteo.com/v1/air-quality",
    WATERSERVICES_USGS_GOV_NWIS_IV: "https://waterservices.usgs.gov/nwis/iv/",
    SERVICES3_ARCGIS_COM_T4QMSPBFLG3QTGWY_ARCGIS_REST_SERVICES_W: "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query",
    IRWIN_DOI_GOV_OBSERVER: "https://irwin.doi.gov/observer/",
    FEMA_GOV_API_OPEN_V2_DISASTERDECLARATIONSSUMMARIES: "https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries",
    FEMA_GOV_DISASTER: "https://www.fema.gov/disaster/",
    FLOOD_API_OPEN_METEO_COM_V1_FLOOD: "https://flood-api.open-meteo.com/v1/flood",
    MARINE_API_OPEN_METEO_COM_V1_MARINE: "https://marine-api.open-meteo.com/v1/marine",
    SERVICES3_ARCGIS_COM_T4QMSPBFLG3QTGWY_ARCGIS_REST_SERVICES_W_2: "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Incident_Locations_Current/FeatureServer/0/query",
    FIRMS_MODAPS_EOSDIS_NASA_GOV_API_AREA_CSV: "https://firms.modaps.eosdis.nasa.gov/api/area/csv/",
    AIRNOWAPI_ORG_AQ_OBSERVATION_LATLONG_CURRENT: "https://www.airnowapi.org/aq/observation/latLong/current/",
    API_DAAC_ASF_ALASKA_EDU_SERVICES_SEARCH_PARAM: "https://api.daac.asf.alaska.edu/services/search/param"
};

const SOURCE_KEYS = {
    airnowApiKey: "AIRNOW_API_KEY",
    firmsMapKey: "FIRMS_MAP_KEY"
};

const SOURCE_ANALYSIS = {
    name: "Gemini",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
    apiKeyEnv: "GEMINI_API_KEY",
    model: process.env.RISK_ANALYSIS_MODEL || "gemini-3.5-flash-lite",
    thinkingLevel: process.env.RISK_ANALYSIS_THINKING || "low",
    temperature: 0.3,
    maxOutputTokens: 1200,
    timeoutMs: 20000,
    warmConcurrency: 3,
    warmSeverities: ["Critical", "High"],
    warmPerRequest: 30,
    failureCooldownMs: 10 * 60 * 1000,
    cacheLimit: 500,
    maxTextChars: 6000,
    instructions: "You are a senior emergency management and hazard risk analyst briefing a member of the public about one active hazard event that affects an area they monitor. Use only the event data provided and never invent facts, places, numbers, or times. Write in plain, calm, direct language. The summary must be 2 to 4 complete sentences that say what is happening, where, and how severe it is. List the specific threats with their magnitudes when given. List concrete protective actions in priority order, taking any recommendations in the data into account. The timing field must be one complete sentence about when the event started, whether it is ongoing, and when it is expected to end if that is known. The confidence field must be one complete sentence explaining how reliable the information is based on the source and the data provided. Every list item must be a complete sentence that ends with a period."
};

const SOURCE_USER_AGENTS = {
    fetch: "DinoStratumRiskMonitor/2.0 (+https://dino-stratum.vercel.app)",
    wikidata: "RiskCommandCenter/2.0 (https://github.com/risk-command-center; contact@example.com)"
};

const CACHE_MS = 15 * 60 * 1000;
const RISK_CACHE_MAX = 40;
const RISK_CACHE_RECORD_BUDGET = 8000;

const INGEST_TICK_MS = 60 * 1000;
const DYNAMIC_REFRESH_MS = 24 * 60 * 60 * 1000;

const QUERY_TIMEOUT_MS = 30000;
const UPSERT_TIMEOUT_MS = 60000;
const UPSERT_BATCH_SIZE = 250;
const UPSERT_CONCURRENCY = 1;
const UPSERT_QUEUE_MAX = 20000;
const UPSERT_MAX_RETRIES = 3;
const UPSERT_RETRY_BASE_MS = 500;

const DB_WRITE_INTERVAL_MS = 5 * 60 * 1000;
const LIVE_CHUNK_SIZE = 500;
const LIVE_HEARTBEAT_MS = 25000;
const DB_WRITE_ENABLED = true;
const RISK_STORE_MAX = 12000;
const RISK_STORE_TRIM_RATIO = 0.8;
const MEMORY_CHECK_INTERVAL_MS = 15000;
const EXPIRY_PURGE_INTERVAL_MS = 60000;
const SSE_MAX_BUFFERED_BYTES = 4 * 1024 * 1024;
const SSE_DRAIN_THRESHOLD_BYTES = 1024 * 1024;
const SSE_DRAIN_TIMEOUT_MS = 1000;
const MEMORY_PRESSURE_RATIO = 0.82;
const MEMORY_RELIEF_RATIO = 0.75;
const HASH_STORE_MAX = 40000;

const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const CLEANUP_DELETE_BATCH_SIZE = 5000;
const CLEANUP_DELETE_MAX_ITERATIONS = 50;
const CLEANUP_DEDUP_MAX_ITERATIONS = 100;
const CLEANUP_GEOM_BATCH_SIZE = 500;
const CLEANUP_GEOM_MAX_ITERATIONS = 200;
const CLEANUP_EXPIRED_GRACE_DAYS = 7;
const CLEANUP_INGESTION_RUN_RETENTION_DAYS = 7;
const CLEANUP_DEDUP_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000;
const CLEANUP_ANALYZE_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000;
const INFRA_BUFFER_KM = 5;

const POOL_PRESSURE_WAITING_HIGH = 8;
const POOL_PRESSURE_WAITING_BACKOFF = 5;
const POOL_PRESSURE_WAITING_PAUSE = 3;

const VISIBILITY_PUBLIC = "public";
const VISIBILITY_ORG_PRIVATE = "org-private";

const SEVERITY_WEIGHTS = { Critical: 100, High: 60, Medium: 30, Low: 10 };

const IMPACT_RADIUS_BASE = { Seismic: 100, Wildfire: 30, Weather: 50, Flood: 20, Hurricane: 300, Tornado: 5, Volcanic: 50, Tsunami: 100, "Air Quality": 25, Industrial: 10, Conflict: 15, "Ground Deformation": 15, Crime: 2 };
const IMPACT_RADIUS_MULTIPLIER = { Critical: 3, High: 2, Medium: 1.2, Low: 0.8 };

const classifySeverity = (annRate, absDisp, coherence) => {
    if (coherence !== null && coherence < 0.3) return { severity: "Low", confidence: "low", reason: "Coherence is below the reliable measurement threshold." };
    if (annRate > 50 || absDisp > 30) return { severity: "Critical", confidence: coherence > 0.7 ? "high" : "medium", reason: `Annualized deformation rate of ${annRate.toFixed(1)} mm per year exceeds the critical threshold.` };
    if (annRate > 20 || absDisp > 15) return { severity: "High", confidence: coherence > 0.6 ? "high" : "medium", reason: `Annualized deformation rate of ${annRate.toFixed(1)} mm per year exceeds the high severity threshold.` };
    if (annRate > 10 || absDisp > 8) return { severity: "Medium", confidence: coherence > 0.5 ? "high" : "medium", reason: `Annualized deformation rate of ${annRate.toFixed(1)} mm per year indicates moderate ground movement.` };
    return { severity: "Low", confidence: coherence > 0.5 ? "high" : "low", reason: `Annualized deformation rate of ${annRate.toFixed(1)} mm per year is within normal background levels.` };
};

const GDELT_LAST_UPDATE_URL = SOURCE_URLS.DATA_GDELTPROJECT_ORG_GDELTV2_LASTUPDATE_TXT;
const GDELT_EXPORT_BASE_URL = SOURCE_URLS.DATA_GDELTPROJECT_ORG_GDELTV2;
const GDELT_CRIME_WINDOW_FILES = 96;
const GDELT_CRIME_MAX_NEW_FILES = 12;
const GDELT_CRIME_DOWNLOAD_CONCURRENCY = 4;
const GDELT_CRIME_TTL_MS = 24 * 60 * 60 * 1000;
const gdeltFileCache = new Map();
const GDELT_CRIME_CODES = {
    "173": { label: "Arrest", severity: "Low", phrase: "an arrest" },
    "180": { label: "Violent Attack", severity: "Medium", phrase: "a violent attack" },
    "181": { label: "Abduction or Hostage Taking", severity: "High", phrase: "an abduction or hostage taking" },
    "182": { label: "Physical Assault", severity: "Medium", phrase: "a physical assault" },
    "1821": { label: "Sexual Assault", severity: "High", phrase: "a sexual assault" },
    "1822": { label: "Torture", severity: "High", phrase: "torture" },
    "1823": { label: "Killing", severity: "Critical", phrase: "a killing" },
    "183": { label: "Bombing", severity: "Critical", phrase: "a bombing" },
    "1831": { label: "Suicide Bombing", severity: "Critical", phrase: "a suicide bombing" },
    "1832": { label: "Vehicle Bombing", severity: "Critical", phrase: "a vehicle bombing" },
    "1833": { label: "Roadside Bombing", severity: "Critical", phrase: "a roadside bombing" },
    "1834": { label: "Bombing", severity: "Critical", phrase: "a bombing" },
    "184": { label: "Use of Human Shields", severity: "High", phrase: "the use of human shields" },
    "185": { label: "Attempted Assassination", severity: "High", phrase: "an attempted assassination" },
    "186": { label: "Assassination", severity: "Critical", phrase: "an assassination" }
};

const readFirstZipEntry = (buf) => {
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
        if (buf.readUInt32LE(i) === 0x06054b50) {
            eocd = i;
            break;
        }
    }
    if (eocd < 0) throw new Error("The archive is missing its end of central directory record.");
    const cdOffset = buf.readUInt32LE(eocd + 16);
    if (buf.readUInt32LE(cdOffset) !== 0x02014b50) throw new Error("The archive central directory is invalid.");
    const method = buf.readUInt16LE(cdOffset + 10);
    const compressedSize = buf.readUInt32LE(cdOffset + 20);
    const localOffset = buf.readUInt32LE(cdOffset + 42);
    if (buf.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("The archive local file header is invalid.");
    const start = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
    const data = buf.subarray(start, start + compressedSize);
    if (method === 0) return data.toString("utf8");
    if (method === 8) return zlib.inflateRawSync(data).toString("utf8");
    throw new Error(`The archive uses unsupported compression method ${method}.`);
};

const gdeltTimestampToIso = (ts) => {
    if (!/^\d{14}$/.test(ts || "")) return null;
    return `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(8, 10)}:${ts.slice(10, 12)}:${ts.slice(12, 14)}Z`;
};

const gdeltPreviousTimestamps = (latest, count) => {
    const start = Date.parse(gdeltTimestampToIso(latest));
    const stamps = [];
    for (let i = 0; i < count; i++) {
        const d = new Date(start - i * 15 * 60 * 1000);
        stamps.push(d.toISOString().replace(/[-:T]/g, "").slice(0, 14));
    }
    return stamps;
};

const parseGdeltCrimeEvents = (text, seen) => {
    const events = [];
    for (const line of text.split("\n")) {
        const c = line.split("\t");
        if (c.length < 61) continue;
        const rule = GDELT_CRIME_CODES[c[26]] || (c[28] === "18" ? GDELT_CRIME_CODES["180"] : null);
        if (!rule) continue;
        if (c[51] !== "3" && c[51] !== "4") continue;
        const lat = parseFloat(c[56]);
        const lng = parseFloat(c[57]);
        if (isNaN(lat) || isNaN(lng)) continue;
        const sourceUrl = c[60] || null;
        const dedupKey = `${sourceUrl}|${c[26]}|${c[58] || c[52]}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);
        const addedIso = gdeltTimestampToIso(c[59]);
        if (!addedIso) continue;
        let domain = null;
        try {
            domain = sourceUrl ? new URL(sourceUrl).hostname.replace(/^www\./, "") : null;
        } catch { }
        const place = c[52] || "an unspecified location";
        events.push(normalizeRisk("GDELT_CRIME", "Crime", {
            source_id: `gdelt_${c[0]}`,
            severity: rule.severity,
            title: `${rule.label}: ${place}`,
            description: `News coverage${domain ? ` from ${domain}` : ""} reports ${rule.phrase} in ${place}.`,
            geometry_type: "Point", coordinates: [lng, lat], latitude: lat, longitude: lng,
            event_time: addedIso, updated_at: addedIso,
            expires_at: new Date(Date.parse(addedIso) + GDELT_CRIME_TTL_MS).toISOString(),
            url: sourceUrl,
            metadata: {
                cameo_code: c[26], event_type: rule.label, actor1: c[6] || null, actor2: c[16] || null,
                location: place, country_code: c[53] || null, num_sources: parseInt(c[32]) || 0,
                num_articles: parseInt(c[33]) || 0, average_tone: parseFloat(c[34]) || 0, source_domain: domain
            }
        }));
    }
    return events;
};

const NWS_HEADERS = { "User-Agent": "RiskCommandCenter/2.0", "Accept": "application/geo+json" };

const transformNoaaAlert = (f, probePoints) => {
    const p = f.properties;
    const g = f.geometry;
    let sev = p.severity === "Extreme" ? "Critical" : p.severity === "Severe" ? "High" : p.severity === "Moderate" ? "Medium" : "Low";
    const catMap = { flood: "Flood", hurricane: "Hurricane", tropical: "Hurricane", tornado: "Tornado", fire: "Wildfire", "red flag": "Wildfire", tsunami: "Tsunami", volcano: "Volcanic", earthquake: "Seismic", blizzard: "Weather", "ice storm": "Weather", "winter storm": "Weather", "severe thunderstorm": "Weather", "extreme heat": "Weather", "excessive heat": "Weather", "heat advisory": "Weather" };
    let cat = "Weather";
    const el = (p.event || "").toLowerCase();
    for (const [k, v] of Object.entries(catMap)) {
        if (el.includes(k)) {
            cat = v;
            break;
        }
    }
    let { lat, lng, geomType, geomCoords } = extractLatLng(g);
    const zonePoints = g ? [] : (probePoints || []);
    if (!g && zonePoints.length) {
        lng = zonePoints.reduce((sum, point) => sum + point[0], 0) / zonePoints.length;
        lat = zonePoints.reduce((sum, point) => sum + point[1], 0) / zonePoints.length;
        geomType = "Point";
        geomCoords = [lng, lat];
    }
    const dur = p.expires && p.effective ? Math.round((new Date(p.expires) - new Date(p.effective)) / 36e5) : null;
    return {
        _category: cat, source_id: p.id, severity: sev, title: p.headline || p.event,
        description: p.description, geometry_type: geomType || "Polygon", geometry_coordinates: geomCoords,
        coordinates: lat && lng ? [lng, lat] : null, latitude: lat, longitude: lng,
        event_time: p.onset || p.effective, updated_at: p.sent, expires_at: p.expires,
        url: SOURCE_URLS.ALERTS_WEATHER_GOV,
        metadata: {
            event_type: p.event, nws_severity: p.severity, certainty: p.certainty, urgency: p.urgency,
            sender: p.senderName, affected_areas: p.areaDesc, instruction: p.instruction,
            response_type: p.response, category: p.category, message_type: p.messageType,
            affected_zones: p.affectedZones, duration_hours: dur, headline: p.headline, parameters: p.parameters, zone_points: zonePoints.length ? zonePoints : null
        }
    };
};

const GDELT_GEO_URL = SOURCE_URLS.API_GDELTPROJECT_ORG_API_V2_GEO_GEO;
const GDELT_GEO_CRIME_QUERY = "(shooting OR stabbing OR homicide OR murder OR robbery OR carjacking OR assault OR kidnapping OR burglary OR arson OR gunfire)";
const GDELT_GEO_TTL_MS = 24 * 60 * 60 * 1000;
const GDELT_GEO_MAX_AREAS = 50;

const gdeltGeoSeverity = (text) => {
    const t = (text || "").toLowerCase();
    if (/(homicide|murder|killed|fatal|slain|mass shooting|dead)/.test(t)) return "Critical";
    if (/(shooting|shot|stabbing|stabbed|kidnap|carjack|armed robbery|gunfire|gunman)/.test(t)) return "High";
    if (/(robbery|assault|arson|burglary)/.test(t)) return "Medium";
    return "Low";
};

const parseGdeltGeoArticles = (html) => {
    const articles = [];
    const re = /<a[^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/gi;
    let m;
    while ((m = re.exec(html || "")) !== null) {
        const title = m[2].replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").trim();
        if (title) articles.push({ url: m[1], title });
    }
    return articles;
};

const gdeltGeoFeatureToRisk = (feature) => {
    const coords = feature?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return null;
    const lng = parseFloat(coords[0]);
    const lat = parseFloat(coords[1]);
    if (isNaN(lat) || isNaN(lng)) return null;
    const props = feature.properties || {};
    const name = (props.name || "").trim() || "an unspecified location";
    const articles = parseGdeltGeoArticles(props.html);
    const count = parseInt(props.count) || articles.length || 1;
    const severity = gdeltGeoSeverity(articles.map((a) => a.title).join(" "));
    const now = new Date();
    const lead = articles[0];
    return normalizeRisk("GDELT_GEO_CRIME", "Crime", {
        source_id: `gdelt_geo_${lat.toFixed(3)}_${lng.toFixed(3)}`,
        severity,
        title: `Crime Reports: ${name}`,
        description: lead ? `${count} news ${count === 1 ? "report mentions" : "reports mention"} crime near ${name}. The latest is titled "${lead.title}".` : `${count} news ${count === 1 ? "report mentions" : "reports mention"} crime near ${name}.`,
        geometry_type: "Point", coordinates: [lng, lat], latitude: lat, longitude: lng,
        event_time: now.toISOString(), updated_at: now.toISOString(),
        expires_at: new Date(now.getTime() + GDELT_GEO_TTL_MS).toISOString(),
        url: lead ? lead.url : null,
        metadata: { location: name, report_count: count, headline: lead ? lead.title : null, articles: articles.slice(0, 5) }
    });
};

const GDELT_REQUEST_SPACING_MS = 5500;

const fetchGdeltGeo = async (query, maxpoints) => {
    const url = `${GDELT_GEO_URL}?query=${encodeURIComponent(query)}&mode=PointData&format=GeoJSON&timespan=24h&geores=2&maxpoints=${maxpoints}`;
    const r = await fetchWithTimeout(url, {}, 30000);
    if (!r.ok) throw new Error(`The GDELT GEO API returned status ${r.status}.`);
    const text = await r.text();
    let d;
    try {
        d = JSON.parse(text);
    } catch {
        throw new Error(`The GDELT GEO API returned a non-JSON response that began with "${text.slice(0, 120).replace(/\s+/g, " ").trim()}".`);
    }
    return Array.isArray(d.features) ? d.features : [];
};

let monitoredAreaCenters = [];

const loadMonitoredAreaCenters = async () => {
    try {
        const result = await queryWithTimeout(
            `SELECT name, latitude, longitude, radius_km, min_lat, max_lat, min_lng, max_lng, mode FROM risk_user_areas LIMIT ${GDELT_GEO_MAX_AREAS}`,
            [], 10000
        );
        const seen = new Set();
        const centers = [];
        for (const row of result.rows) {
            let area;
            if (row.mode === "point_radius") {
                area = { lat: parseFloat(row.latitude), lng: parseFloat(row.longitude), km: Math.min(parseFloat(row.radius_km) || 50, 500) };
            } else {
                const lat = (parseFloat(row.min_lat) + parseFloat(row.max_lat)) / 2;
                const lng = (parseFloat(row.min_lng) + parseFloat(row.max_lng)) / 2;
                area = { lat, lng, km: Math.min(haversine(lat, lng, parseFloat(row.max_lat), parseFloat(row.max_lng)) / 1000, 500) };
            }
            if (isNaN(area.lat) || isNaN(area.lng)) continue;
            const key = `${area.lat.toFixed(2)},${area.lng.toFixed(2)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            area.name = row.name && String(row.name).trim() ? String(row.name).trim() : `Monitored Area ${area.lat.toFixed(2)}, ${area.lng.toFixed(2)}`;
            centers.push(area);
        }
        monitoredAreaCenters = centers;
        return centers;
    } catch {
        return monitoredAreaCenters;
    }
};

const OPEN_METEO_AQ_CITY_CAP = 0;
const OPEN_METEO_FLOOD_CITY_CAP = 10;

const openMeteoQueryPoints = (cap) => {
    const cities = (dynamicStores.urban.data.length ? dynamicStores.urban.data : FALLBACK_CITIES)
        .slice()
        .sort((a, b) => (b.pop || 0) - (a.pop || 0))
        .slice(0, cap);
    const points = monitoredAreaCenters.map((a) => ({ name: a.name, lat: a.lat, lng: a.lng, pop: 0 }));
    for (const c of cities) {
        if (!points.some((q) => haversine(q.lat, q.lng, c.lat, c.lng) < 25000)) points.push({ name: c.name, lat: c.lat, lng: c.lng, pop: c.pop || 0 });
    }
    return points;
};

const FIRMS_SOURCE = "VIIRS_NOAA20_NRT";
const FIRMS_GRID_DEG = 0.05;

const parseFirmsCsv = (text) => {
    const lines = (text || "").trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const idx = (name) => header.indexOf(name);
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",");
        const lat = parseFloat(cols[idx("latitude")]);
        const lng = parseFloat(cols[idx("longitude")]);
        if (isNaN(lat) || isNaN(lng)) continue;
        rows.push({ lat, lng, frp: parseFloat(cols[idx("frp")]) || 0, confidence: (cols[idx("confidence")] || "").trim().toLowerCase(), date: (cols[idx("acq_date")] || "").trim(), time: (cols[idx("acq_time")] || "").trim().padStart(4, "0") });
    }
    return rows;
};

const firmsClusters = (rows) => {
    const cells = new Map();
    const seenDetections = new Set();
    for (const r of rows) {
        const detection = `${r.lat.toFixed(4)}_${r.lng.toFixed(4)}_${r.date}_${r.time}`;
        if (seenDetections.has(detection)) continue;
        seenDetections.add(detection);
        const key = `${Math.round(r.lat / FIRMS_GRID_DEG)}_${Math.round(r.lng / FIRMS_GRID_DEG)}`;
        const cell = cells.get(key) || { key, lat: 0, lng: 0, n: 0, frp: 0, maxFrp: 0, high: false, latest: "" };
        cell.lat += r.lat;
        cell.lng += r.lng;
        cell.n++;
        cell.frp += r.frp;
        cell.maxFrp = Math.max(cell.maxFrp, r.frp);
        if (r.confidence === "h" || r.confidence === "high") cell.high = true;
        const stamp = r.date && r.time ? `${r.date}T${r.time.slice(0, 2)}:${r.time.slice(2, 4)}:00Z` : "";
        if (stamp > cell.latest) cell.latest = stamp;
        cells.set(key, cell);
    }
    return [...cells.values()].map((c) => ({ ...c, lat: c.lat / c.n, lng: c.lng / c.n }));
};

const LSR_URL = SOURCE_URLS.MESONET_AGRON_IASTATE_EDU_GEOJSON_LSR_GEOJSON;
const LSR_BASE_URL = SOURCE_URLS.MESONET_AGRON_IASTATE_EDU_GEOJSON_LSR_GEOJSON_2;

const lsrCategory = (typetext) => {
    const t = (typetext || "").toUpperCase();
    if (t.includes("TORNADO") || t.includes("FUNNEL") || t.includes("WATERSPOUT")) return "Tornado";
    if (t.includes("FLOOD")) return "Flood";
    if (t.includes("WILDFIRE")) return "Wildfire";
    return "Weather";
};

const lsrSeverity = (typetext, magnitude) => {
    const t = (typetext || "").toUpperCase();
    const mag = parseFloat(magnitude);
    if (t.includes("TORNADO")) return "Critical";
    if (t.includes("FLASH FLOOD")) return "High";
    if (t.includes("HAIL")) return !isNaN(mag) && mag >= 1.75 ? "High" : "Medium";
    if (t.includes("WND") || t.includes("WIND")) return !isNaN(mag) && mag >= 58 ? "High" : "Medium";
    if (t.includes("FLOOD") || t.includes("DEBRIS FLOW") || t.includes("STORM SURGE")) return "High";
    return "Low";
};

const USGS_BBOX_MAX_SQ_DEG = 25;

const usgsAreaBox = (area) => {
    const latDelta = area.km / 111.32;
    const lngDelta = area.km / (111.32 * Math.max(0.2, Math.cos((area.lat * Math.PI) / 180)));
    const scale = Math.min(1, Math.sqrt(USGS_BBOX_MAX_SQ_DEG / ((latDelta * 2) * (lngDelta * 2))));
    const la = latDelta * scale;
    const lo = lngDelta * scale;
    return {
        min_lat: (area.lat - la).toFixed(4), max_lat: (area.lat + la).toFixed(4),
        min_lng: (area.lng - lo).toFixed(4), max_lng: (area.lng + lo).toFixed(4)
    };
};

const NWS_PROBE_CONCURRENCY = 3;
const NWS_PROBE_MAX_BYTES = 8 * 1024 * 1024;
const AREA_EVENT_MARGIN_KM = 25;

const ensureMonitoredAreas = async () => (monitoredAreaCenters.length ? monitoredAreaCenters : await loadMonitoredAreaCenters());

const areaProbePoints = (area) => {
    const reach = area.km * 0.6;
    const dLat = reach / 111.32;
    const dLng = reach / (111.32 * Math.max(0.2, Math.cos((area.lat * Math.PI) / 180)));
    return [
        { lat: area.lat, lng: area.lng },
        { lat: area.lat + dLat, lng: area.lng },
        { lat: area.lat - dLat, lng: area.lng },
        { lat: area.lat, lng: area.lng + dLng },
        { lat: area.lat, lng: area.lng - dLng }
    ];
};

const areaBounds = (area) => {
    const dLat = area.km / 111.32;
    const dLng = area.km / (111.32 * Math.max(0.2, Math.cos((area.lat * Math.PI) / 180)));
    return { south: area.lat - dLat, north: area.lat + dLat, west: area.lng - dLng, east: area.lng + dLng };
};

const nearAnyArea = (lat, lng, areas) => areas.some((area) => haversine(area.lat, area.lng, lat, lng) / 1000 <= area.km + AREA_EVENT_MARGIN_KM);

const ACTIVE_SOURCES = new Set(["usgs_water", "noaa_alerts", "nws_storm_reports", "usgs_earthquakes", "wfigs_incidents", "firms_hotspots", "usgs_volcanoes", "airnow_observations", "openmeteo_air_quality", "google_news_crime", "gdelt_crime", "eonet_events", "fema_disasters", "tsunami_alerts"]);

const GOOGLE_NEWS_RSS_URL = SOURCE_URLS.NEWS_GOOGLE_COM_RSS_SEARCH;
const GOOGLE_NEWS_CRIME_TERMS = "(shooting OR stabbing OR homicide OR murder OR robbery OR carjacking OR assault OR burglary OR kidnapping OR arson)";
const GOOGLE_NEWS_TTL_MS = 24 * 60 * 60 * 1000;

const decodeXmlText = (value) => (value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .trim();

const parseRssItems = (xml) => {
    const items = [];
    const re = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = re.exec(xml || "")) !== null) {
        const block = m[1];
        const pick = (tag) => {
            const t = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
            return t ? decodeXmlText(t[1]) : "";
        };
        items.push({ title: pick("title"), link: pick("link"), pubDate: pick("pubDate"), source: pick("source") });
    }
    return items;
};

const AIRNOW_DISTANCE_MILES = 50;

const aqiSeverity = (aqi) => (aqi > 200 ? "Critical" : aqi > 150 ? "High" : aqi > 100 ? "Medium" : "Low");

const CATEGORY_TO_LABEL = {
    earthquakes: ["Seismic"],
    wildfires: ["Wildfire"],
    weather: ["Weather", "Tornado", "Hurricane", "Space"],
    floods: ["Flood"],
    volcanoes: ["Volcanic"],
    air_quality: ["Air Quality"],
    ground_deformation: ["Ground Deformation", "Subsidence"],
    global_disasters: ["Other", "Industrial", "Infrastructure", "Supply Chain", "Tsunami", "Drought", "Ice", "Landslide", "Water"],
    crime: ["Crime"]
};

const RECOMMENDATIONS = {
    Seismic: { Critical: ["Evacuate damaged structures immediately.", "Check for gas leaks and structural damage.", "Prepare for aftershocks.", "Avoid coastal areas if a tsunami warning is issued."], High: ["Drop, cover, and hold on during shaking.", "Stay away from windows and heavy objects.", "Have emergency supplies ready."], Medium: ["Review earthquake preparedness plans.", "Secure heavy furniture and objects."], Low: ["No immediate action is required.", "Review emergency procedures."] },
    Wildfire: { Critical: ["Evacuate immediately if ordered.", "Close all windows and doors.", "Wear N95 masks for smoke.", "Have go-bag ready."], High: ["Prepare for possible evacuation.", "Create defensible space around property.", "Monitor air quality closely."], Medium: ["Stay informed of fire progression.", "Reduce outdoor activities due to smoke."], Low: ["Monitor local fire reports.", "Review evacuation routes."] },
    Flood: { Critical: ["Move to higher ground immediately.", "Do not walk or drive through flood waters.", "Avoid bridges over fast-moving water."], High: ["Prepare to evacuate.", "Move valuables to upper floors.", "Fill bathtubs with clean water."], Medium: ["Monitor water levels closely.", "Avoid flood-prone areas."], Low: ["Stay informed of weather conditions.", "Clear drains and gutters."] },
    Hurricane: { Critical: ["Shelter in place in an interior room.", "Stay away from windows.", "Do not go outside during eye passage."], High: ["Complete evacuation if ordered.", "Board up windows.", "Stock emergency supplies."], Medium: ["Prepare emergency kit.", "Review evacuation routes.", "Fuel vehicles."], Low: ["Monitor storm track.", "Review hurricane preparedness."] },
    Volcanic: { Critical: ["Evacuate exclusion zone immediately.", "Wear respiratory protection.", "Protect yourself from ashfall."], High: ["Prepare for possible evacuation.", "Stock masks and goggles.", "Seal windows and doors."], Medium: ["Monitor volcanic activity.", "Review evacuation plans."], Low: ["Stay informed of volcano status.", "Learn the warning signs."] },
    "Ground Deformation": { Critical: ["Evacuate structures showing visible cracking or tilting immediately.", "Report pipeline or utility damage to emergency services.", "Avoid areas with active subsidence or uplift.", "Request professional structural inspection for all buildings in the affected zone."], High: ["Inspect foundations, retaining walls, and load-bearing structures for new cracks.", "Monitor pipelines and utility corridors crossing the deformation zone.", "Install temporary ground displacement markers for local tracking.", "Coordinate with geological survey authorities for detailed assessment."], Medium: ["Schedule routine structural inspections of infrastructure in the affected area.", "Review subsidence history and trend data for long-term planning.", "Verify that drainage systems are functioning correctly to prevent accelerated settlement."], Low: ["Note the observation for long-term ground stability records.", "Continue standard maintenance schedules for infrastructure.", "Monitor future satellite passes for trend confirmation."] },
    Crime: { Critical: ["Avoid the area and follow instructions from local police.", "Shelter in a secure location if you are nearby.", "Check on the safety of people you know in the area."], High: ["Avoid the area until police declare it clear.", "Stay alert and report suspicious activity to local police."], Medium: ["Use caution when traveling through the area.", "Stay aware of your surroundings."], Low: ["Stay informed through local news and police updates."] }
};

const SELECT_COLUMNS = `id, source, source_id, risk_category, severity, severity_score, title, description, geometry_type, geometry_coordinates, latitude, longitude, impact_radius_km, event_time, updated_at, expires_at, url, recommendations, metadata, properties, golden_mesh_detection, population_impact, coordinates, visibility, orgid`;

const INGEST_PRIORITY = ["noaa_alerts", "nws_storm_reports", "usgs_earthquakes", "usgs_water", "gdelt_crime", "wfigs_incidents", "openmeteo_air_quality", "tsunami_alerts", "noaa_spc", "emsc_earthquakes", "usgs_volcanoes", "gdacs_events", "eonet_events", "fema_disasters"];
const HEAVY_SOURCES = new Set(["nifc_wildfires", "sentinel1_insar", "sentinel1_deformation", "firms_hotspots", "gdelt_geo_crime", "openmeteo_flood", "openmeteo_marine"]);
const LIGHT_INGEST_CONCURRENCY = 2;
const SOURCE_DEADLINE_MS = 120000;
const ingestionInFlight = new Set();

const SOURCE_SCHEDULE = {
    usgs_earthquakes: { intervalMs: 5 * 60 * 1000, periodicWindowDays: 1 },
    emsc_earthquakes: { intervalMs: 5 * 60 * 1000, periodicWindowDays: 1 },
    ingv_earthquakes: { intervalMs: 5 * 60 * 1000, periodicWindowDays: 1 },
    geonet_quakes: { intervalMs: 5 * 60 * 1000 },
    noaa_alerts: { intervalMs: 5 * 60 * 1000 },
    noaa_spc: { intervalMs: 10 * 60 * 1000 },
    gdacs_events: { intervalMs: 30 * 60 * 1000, periodicWindowDays: 7 },
    usgs_volcanoes: { intervalMs: 60 * 60 * 1000 },
    eonet_events: { intervalMs: 30 * 60 * 1000, periodicEonetDays: 7 },
    openmeteo_air_quality: { intervalMs: 60 * 60 * 1000 },
    usgs_water: { intervalMs: 15 * 60 * 1000 },
    nifc_wildfires: { intervalMs: 30 * 60 * 1000 },
    fema_disasters: { intervalMs: 60 * 60 * 1000, periodicWindowDays: 7 },
    noaa_space_weather: { intervalMs: 5 * 60 * 1000 },
    noaa_kp_index: { intervalMs: 15 * 60 * 1000 },
    noaa_swpc_xray: { intervalMs: 10 * 60 * 1000 },
    noaa_swpc_solar_wind: { intervalMs: 10 * 60 * 1000 },
    noaa_swpc_mag_field: { intervalMs: 10 * 60 * 1000 },
    noaa_swpc_kp_forecast: { intervalMs: 60 * 60 * 1000 },
    openmeteo_flood: { intervalMs: 60 * 60 * 1000 },
    openmeteo_marine: { intervalMs: 60 * 60 * 1000 },
    tsunami_alerts: { intervalMs: 5 * 60 * 1000 },
    gdelt_crime: { intervalMs: 15 * 60 * 1000 },
    google_news_crime: { intervalMs: 15 * 60 * 1000 },
    airnow_observations: { intervalMs: 30 * 60 * 1000 },
    gdelt_geo_crime: { intervalMs: 15 * 60 * 1000 },
    wfigs_incidents: { intervalMs: 10 * 60 * 1000 },
    firms_hotspots: { intervalMs: 30 * 60 * 1000 },
    nws_storm_reports: { intervalMs: 5 * 60 * 1000 },
    sentinel1_insar: { intervalMs: 6 * 60 * 60 * 1000 },
    sentinel1_deformation: { intervalMs: 6 * 60 * 60 * 1000 }
};

let ingestionRunning = false;
let contentHashColumnReady = false;
let ingestionTimer = null;
let dynamicRefreshTimer = null;
let cacheCleanupTimer = null;
let dbWriteTimer = null;
let cleanupRunning = false;
let cleanupTimer = null;
let dynamicDataReady = false;
let lastDedupAt = 0;
let lastAnalyzeAt = 0;
let geomBackfillNeeded = null;
let startupRunComplete = false;

const sourceLastRunAt = {};
const sourceLastSuccessAt = {};
const sourceLastError = {};
const sourceLastCount = {};

let peakWaitingRequests = 0;
let peakActiveConnections = 0;
let lastPressureCheck = null;

const riskCache = new Map();
const riskStore = new Map();
const hashStore = new Map();
let riskStoreDirty = false;
const riskStorePendingDbIds = new Set();
const sseClients = new Set();

const writeQueue = [];
let writeQueueProcessing = false;
let writeQueueDropped = 0;

let writesSkippedHash = 0;
let writesAccepted = 0;

const generateId = (prefix) => {
    return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
};

const safeJsonStringify = (value) => {
    if (value == null) return null;
    if (typeof value === "string") {
        try {
            JSON.parse(value);
            return value;
        } catch {
            try {
                return JSON.stringify(value);
            } catch {
                return null;
            }
        }
    }
    try {
        return JSON.stringify(value);
    } catch {
        return null;
    }
};

const parseJson = (value) => {
    return typeof value === "string" ? JSON.parse(value) : value;
};

const computeRiskHash = (risk) => {
    const geometry = risk.geometry_coordinates ? crypto.createHash("sha1").update(safeJsonStringify(risk.geometry_coordinates) || "").digest("hex") : "";
    const parts = [
        risk.source || "",
        risk.source_id || "",
        risk.severity || "",
        risk.severity_score || 0,
        risk.expires_at || "",
        risk.latitude != null ? Number(risk.latitude).toFixed(5) : "",
        risk.longitude != null ? Number(risk.longitude).toFixed(5) : "",
        risk.impact_radius_km || 0,
        risk.title || "",
        (risk.description || "").substring(0, 200),
        risk.visibility || VISIBILITY_PUBLIC,
        risk.orgid || "",
        geometry
    ];
    return crypto.createHash("sha1").update(parts.join("|")).digest("hex");
};

const dedupKey = (risk) => {
    if (risk.source_id) return `${risk.source || ""}::${risk.source_id}`;
    return `${risk.risk_category || ""}::${(risk.latitude || 0).toFixed(4)}::${(risk.longitude || 0).toFixed(4)}::${(risk.title || "").substring(0, 80)}`;
};

const stableRiskId = (risk) => {
    return `rsk_${crypto.createHash("md5").update(dedupKey(risk)).digest("hex").substring(0, 24)}`;
};

const withTimeout = (promise, ms, label) => {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`${label} timed out after ${ms} milliseconds.`));
        }, ms);
        promise.then(
            (val) => {
                clearTimeout(timer);
                resolve(val);
            },
            (error) => {
                clearTimeout(timer);
                reject(error);
            }
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
    if (stats.waiting_requests > peakWaitingRequests) {
        peakWaitingRequests = stats.waiting_requests;
    }
    if (stats.active_connections > peakActiveConnections) {
        peakActiveConnections = stats.active_connections;
    }
    lastPressureCheck = {
        context: context || null,
        stats,
        timestamp: new Date().toISOString()
    };
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
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
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
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
            inside = !inside;
        }
    }
    return inside;
};

const distSegSq = (px, py, ax, ay, bx, by) => {
    let dx = bx - ax;
    let dy = by - ay;
    if (dx || dy) {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
        ax += t * dx;
        ay += t * dy;
    }
    dx = px - ax;
    dy = py - ay;
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
    let mnX = Infinity;
    let mnY = Infinity;
    let mxX = -Infinity;
    let mxY = -Infinity;
    for (const [x, y] of ring) {
        if (x < mnX) mnX = x;
        if (y < mnY) mnY = y;
        if (x > mxX) mxX = x;
        if (y > mxY) mxY = y;
    }
    const w = mxX - mnX;
    const h = mxY - mnY;
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
    for (let x = mnX; x < mxX; x += cs) {
        for (let y = mnY; y < mxY; y += cs) {
            cells.push(mkCell(x + hc, y + hc));
        }
    }
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
    let bestRing = null;
    let bestArea = 0;
    for (const poly of coords) {
        const ring = poly[0];
        if (!ring || ring.length < 3) continue;
        let area = 0;
        for (let j = 0, k = ring.length - 1; j < ring.length; k = j++) {
            area += (ring[k][0] + ring[j][0]) * (ring[k][1] - ring[j][1]);
        }
        area = Math.abs(area) / 2;
        if (area > bestArea) {
            bestArea = area;
            bestRing = ring;
        }
    }
    return bestRing ? polyInterior(bestRing) : { lat: null, lng: null };
};

const extractLatLng = (geom) => {
    if (!geom) return { lat: null, lng: null, geomType: null, geomCoords: null };
    const { type: geomType, coordinates: geomCoords } = geom;
    let lat = null;
    let lng = null;
    if (geomType === "Point" && geomCoords) {
        lng = geomCoords[0];
        lat = geomCoords[1];
    } else if (geomType === "Polygon" && geomCoords?.[0]) {
        ({ lat, lng } = polyInterior(geomCoords[0]));
    } else if (geomType === "MultiPolygon" && geomCoords) {
        ({ lat, lng } = multiPolyInterior(geomCoords));
    }
    return { lat, lng, geomType, geomCoords };
};

const getCached = (key) => {
    const entry = riskCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts >= CACHE_MS) {
        riskCache.delete(key);
        return null;
    }
    return entry.data;
};

const cachedRecordCount = () => {
    let total = 0;
    for (const entry of riskCache.values()) total += Array.isArray(entry.data) ? entry.data.length : 1;
    return total;
};

const setCache = (key, data) => {
    if (!data || (Array.isArray(data) && data.length === 0)) return;
    const incoming = Array.isArray(data) ? data.length : 1;
    if (incoming > RISK_CACHE_RECORD_BUDGET) return;
    riskCache.delete(key);
    while (riskCache.size && (riskCache.size >= RISK_CACHE_MAX || cachedRecordCount() + incoming > RISK_CACHE_RECORD_BUDGET)) {
        riskCache.delete(riskCache.keys().next().value);
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
        clause: ` AND (visibility = 'public' OR visibility IS NULL OR (visibility = 'org-private' AND orgid = $${paramIndex}))`,
        params: [orgid]
    };
};

const trimHashStore = () => {
    if (hashStore.size <= HASH_STORE_MAX) return;
    const overflow = hashStore.size - HASH_STORE_MAX;
    let removed = 0;
    for (const k of hashStore.keys()) {
        hashStore.delete(k);
        removed++;
        if (removed >= overflow) break;
    }
};

const LEAN_METADATA_KEYS = ["event_type", "nws_severity", "certainty", "urgency", "magnitude", "depth_km", "location", "affected_areas", "source_domain", "cameo_code", "headline"];
const LEAN_DESCRIPTION_MAX = 400;
const LEAN_GEOMETRY_MAX_POINTS = 24;

const leanMetadata = (metadata) => {
    if (!metadata || typeof metadata !== "object") return {};
    const out = {};
    for (const key of LEAN_METADATA_KEYS) {
        if (metadata[key] != null) out[key] = metadata[key];
    }
    if (Array.isArray(metadata.zone_points)) out.zone_points = metadata.zone_points;
    return out;
};

const leanGeometry = (risk) => {
    const g = risk.geometry_coordinates;
    if (!g) return null;
    const ring = Array.isArray(g) ? g[0] : null;
    if (!Array.isArray(ring)) return null;
    if (ring.length > LEAN_GEOMETRY_MAX_POINTS) return null;
    return g;
};

const slimRiskForMemory = (risk) => {
    if (risk._lean) return risk;
    const lean = {
        id: risk.id, source: risk.source, source_id: risk.source_id, risk_category: risk.risk_category,
        severity: risk.severity, severity_score: risk.severity_score, title: risk.title,
        description: typeof risk.description === "string" && risk.description.length > LEAN_DESCRIPTION_MAX ? `${risk.description.slice(0, LEAN_DESCRIPTION_MAX)}\u2026` : (risk.description || null),
        geometry_type: risk.geometry_type, coordinates: risk.coordinates, geometry_coordinates: leanGeometry(risk),
        latitude: risk.latitude, longitude: risk.longitude, impact_radius_km: risk.impact_radius_km,
        population_impact: risk.population_impact, event_time: risk.event_time, updated_at: risk.updated_at,
        expires_at: risk.expires_at, url: risk.url, recommendations: risk.recommendations,
        metadata: leanMetadata(risk.metadata), visibility: risk.visibility, orgid: risk.orgid, _lean: true
    };
    return lean;
};

const slimStoredRisks = (ids) => {
    for (const id of ids) {
        if (riskStorePendingDbIds.has(id)) continue;
        const risk = riskStore.get(id);
        if (risk && !risk._lean) riskStore.set(id, slimRiskForMemory(risk));
    }
};

const dedupAndDiffRisks = (risks) => {
    if (!risks || !risks.length) return { merged: [], changed: [], skipped: 0 };
    const merged = new Map();
    for (const r of risks) {
        if (!r || !r.id) continue;
        const k = r.id;
        const existing = merged.get(k);
        if (!existing) {
            merged.set(k, r);
        } else {
            const existingScore = SEVERITY_WEIGHTS[existing.severity] || 0;
            const newScore = SEVERITY_WEIGHTS[r.severity] || 0;
            if (newScore > existingScore) {
                merged.set(k, r);
            } else if (newScore === existingScore) {
                const existingTime = existing.updated_at ? new Date(existing.updated_at).getTime() : 0;
                const newTime = r.updated_at ? new Date(r.updated_at).getTime() : 0;
                if (newTime > existingTime) merged.set(k, r);
            }
        }
    }
    const changed = [];
    let skipped = 0;
    for (const [k, r] of merged) {
        const hash = computeRiskHash(r);
        Object.defineProperty(r, "content_hash", { value: hash, enumerable: false, writable: true, configurable: true });
        const prev = hashStore.get(k);
        if (prev && prev.hash === hash) {
            skipped++;
            continue;
        }
        hashStore.set(k, { hash, id: r.id });
        changed.push(r);
    }
    trimHashStore();
    return { merged: Array.from(merged.values()), changed, skipped };
};

const trimRiskStore = (target) => {
    if (riskStore.size <= target) return 0;
    const before = riskStore.size;
    const now = Date.now();
    for (const [id, r] of riskStore) {
        if (riskStore.size <= target) break;
        const expires = r.expires_at ? new Date(r.expires_at).getTime() : NaN;
        if (!isNaN(expires) && expires < now && !riskStorePendingDbIds.has(id)) riskStore.delete(id);
    }
    if (riskStore.size > target) {
        const bySource = new Map();
        let pinned = 0;
        for (const [id, r] of riskStore) {
            if (riskStorePendingDbIds.has(id)) {
                pinned++;
                continue;
            }
            const time = r.event_time ? new Date(r.event_time).getTime() : 0;
            const rank = (SEVERITY_WEIGHTS[r.severity] || 0) * 1e13 + (isNaN(time) ? 0 : time);
            if (!bySource.has(r.source)) bySource.set(r.source, []);
            bySource.get(r.source).push([id, rank]);
        }
        const budget = Math.max(0, target - pinned);
        const counts = [...bySource.values()].map((list) => list.length).sort((a, b) => a - b);
        let cap = counts.length ? counts[counts.length - 1] : 0;
        let used = 0;
        for (let i = 0; i < counts.length; i++) {
            const remaining = counts.length - i;
            const even = Math.floor((budget - used) / remaining);
            if (counts[i] <= even) {
                used += counts[i];
            } else {
                cap = even;
                break;
            }
        }
        for (const list of bySource.values()) {
            if (list.length <= cap) continue;
            list.sort((a, b) => a[1] - b[1]);
            for (let i = 0; i < list.length - cap; i++) riskStore.delete(list[i][0]);
        }
    }
    return before - riskStore.size;
};

const relieveMemoryPressure = () => {
    const limit = v8.getHeapStatistics().heap_size_limit;
    const used = process.memoryUsage().heapUsed;
    if (used < limit * MEMORY_PRESSURE_RATIO) return;
    riskCache.clear();
    trimRiskStore(Math.floor(riskStore.size * MEMORY_RELIEF_RATIO));
};

const storeRisks = (risks, opts) => {
    if (!risks || !risks.length) return { added: 0, skipped: 0, changed: [] };
    const enqueueForDb = opts && opts.enqueueForDb;
    const { merged, changed, skipped } = dedupAndDiffRisks(risks);
    writesSkippedHash += skipped;
    for (const r of merged) {
        riskStore.set(r.id, enqueueForDb ? r : slimRiskForMemory(r));
    }
    if (enqueueForDb) {
        for (const r of changed) riskStorePendingDbIds.add(r.id);
    }
    if (riskStore.size > RISK_STORE_MAX) trimRiskStore(Math.floor(RISK_STORE_MAX * RISK_STORE_TRIM_RATIO));
    if (enqueueForDb && changed.length) riskStoreDirty = true;
    return { added: changed.length, skipped, changed };
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
                name: inf.name,
                type: inf.type,
                description: inf.description,
                distance_km: parseFloat(km.toFixed(2)),
                within_buffer: true,
                risk_relevance: km < 1 ? "Direct Impact Zone" : km < 3 ? "Proximal Impact Zone" : "Extended Influence Zone"
            });
        }
    }
    return result;
};

const FETCH_USER_AGENT = SOURCE_USER_AGENTS.fetch;

const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;

const readCappedBody = async (r, url, cap) => {
    let host = url;
    try { host = new URL(url).hostname; } catch { }
    const limitMb = Math.round(cap / 1048576);
    const declared = parseInt(r.headers?.get?.("content-length") || "", 10);
    if (!isNaN(declared) && declared > cap) {
        try { await r.body?.cancel(); } catch { }
        throw new Error(`The response from ${host} is ${Math.round(declared / 1048576)} MB, over the ${limitMb} MB limit.`);
    }
    if (!r.body || typeof r.body.getReader !== "function") {
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length > cap) throw new Error(`The response from ${host} exceeded the ${limitMb} MB limit.`);
        return buf;
    }
    const reader = r.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > cap) {
            try { await reader.cancel(); } catch { }
            throw new Error(`The response from ${host} exceeded the ${limitMb} MB limit.`);
        }
        chunks.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
    }
    return Buffer.concat(chunks, total);
};

const fetchWithTimeout = async (url, opts = {}, ms = 15000) => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), ms);
    const { maxBytes, ...fetchOpts } = opts;
    const headers = { ...(fetchOpts.headers || {}) };
    if (!Object.keys(headers).some((k) => k.toLowerCase() === "user-agent")) headers["User-Agent"] = FETCH_USER_AGENT;
    let r;
    try {
        r = await fetch(url, { ...fetchOpts, headers, signal: ac.signal });
    } catch (error) {
        clearTimeout(t);
        throw error;
    }
    let bodyPromise = null;
    const body = () => {
        if (!bodyPromise) bodyPromise = readCappedBody(r, url, maxBytes || MAX_RESPONSE_BYTES).finally(() => clearTimeout(t));
        return bodyPromise;
    };
    const wrapped = {
        ok: r.ok, status: r.status, statusText: r.statusText, headers: r.headers, url: r.url,
        text: async () => (await body()).toString("utf8"),
        json: async () => JSON.parse((await body()).toString("utf8")),
        arrayBuffer: async () => {
            const b = await body();
            return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
        }
    };
    if (!r.ok) await wrapped.text().catch(() => { });
    return wrapped;
};

const sparqlQuery = async (query, label) => {
    const url = `${SOURCE_URLS.QUERY_WIKIDATA_ORG_SPARQL}?query=${encodeURIComponent(query)}&format=json`;
    const r = await fetchWithTimeout(url, {
        headers: { "Accept": "application/sparql-results+json", "User-Agent": SOURCE_USER_AGENTS.wikidata }
    }, 90000);
    if (!r.ok) throw new Error(`The SPARQL request for ${label} failed with status ${r.status}.`);
    const d = await r.json();
    return d.results?.bindings || [];
};

const SPARQL_CONFIGS = [
    {
        id: "urban_centers", label: "urban centers",
        sparql: `SELECT ?city ?cityLabel ?pop ?lat ?lon WHERE { ?city wdt:P31/wdt:P279* wd:Q515 . ?city wdt:P1082 ?pop . ?city p:P625 ?s . ?s psv:P625 ?c . ?c wikibase:geoLatitude ?lat . ?c wikibase:geoLongitude ?lon . FILTER(?pop > 300000) SERVICE wikibase:label { bd:serviceParam wikibase:language "en" } } ORDER BY DESC(?pop) LIMIT 600`,
        transform: (bindings) => {
            const seen = new Set();
            const out = [];
            for (const b of bindings) {
                const name = b.cityLabel?.value;
                const pop = parseInt(b.pop?.value, 10);
                const lat = parseFloat(b.lat?.value);
                const lon = parseFloat(b.lon?.value);
                if (!name || isNaN(pop) || isNaN(lat) || isNaN(lon)) continue;
                const k = `${name}_${lat.toFixed(1)}_${lon.toFixed(1)}`;
                if (seen.has(k)) continue;
                seen.add(k);
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
        if (isExtraction) {
            typeFilter = "{ ?item wdt:P31/wdt:P279* wd:Q862562 } UNION { ?item wdt:P31/wdt:P279* wd:Q846386 }";
        } else if (isMines) {
            typeFilter = "{ ?item wdt:P31/wdt:P279* wd:Q820477 } UNION { ?item wdt:P31/wdt:P279* wd:Q5809579 }";
        } else {
            typeFilter = `?item wdt:P31/wdt:P279* ${qid} .`;
        }
        const lenSelect = lenProp ? ` ?length` : "";
        const lenOpt = lenProp ? `\n  OPTIONAL { ?item ${lenProp} ?length }` : "";
        const limit = (id === "dams" || id === "extraction_sites" || id === "mines") ? 800 : (id === "nuclear_plants" || id === "tunnels") ? 500 : 600;
        return {
            id, label: id.replace(/_/g, " "),
            sparql: `SELECT ?item ?itemLabel ?lat ?lon${lenSelect} ?description WHERE {\n  ${typeFilter}\n  ?item p:P625 ?s . ?s psv:P625 ?c . ?c wikibase:geoLatitude ?lat . ?c wikibase:geoLongitude ?lon .${lenOpt}\n  OPTIONAL { ?item schema:description ?description . FILTER(LANG(?description) = "en") }\n  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }\n} LIMIT ${limit}`,
            transform: (bindings) => {
                const items = [];
                for (const b of bindings) {
                    const name = b.itemLabel?.value;
                    const lat = parseFloat(b.lat?.value);
                    const lon = parseFloat(b.lon?.value);
                    if (!name || isNaN(lat) || isNaN(lon)) continue;
                    const lenKm = b.length?.value ? parseFloat(b.length.value) / (type === "pipeline" || type === "fault" ? 1 : 1000) : 0;
                    const corrLen = type === "pipeline" || type === "fault" ? (b.length?.value ? parseFloat(b.length.value) : 0) : lenKm;
                    items.push({ name, type, lat, lng: lon, corridor_length_km: corrLen, description: b.description?.value || `${name} is ${/^[aeiou]/i.test(String(type)) ? "an" : "a"} ${String(type).replace(/_/g, " ")} infrastructure site.` });
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
    } catch (error) {
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
        for (const r of settled) {
            if (r.status === "fulfilled") combined.push(...r.value);
        }
        const seen = new Set();
        const deduped = [];
        for (const item of combined) {
            const k = `${item.name}_${item.lat.toFixed(2)}_${item.lng.toFixed(2)}`;
            if (!seen.has(k)) {
                seen.add(k);
                deduped.push(item);
            }
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
            let url = `${SOURCE_URLS.EARTHQUAKE_USGS_GOV_FDSNWS_EVENT_1_QUERY}?format=geojson&starttime=${st}&minmagnitude=${p.min_magnitude || 2.0}&limit=${p.limit || 20000}&orderby=time`;
            if (p.end_time) url += `&endtime=${new Date(p.end_time).toISOString().split("T")[0]}`;
            if (p.min_lat && p.max_lat && p.min_lng && p.max_lng) url += `&minlatitude=${p.min_lat}&maxlatitude=${p.max_lat}&minlongitude=${p.min_lng}&maxlongitude=${p.max_lng}`;
            return url;
        },
        extractRawItems: (d) => d.features || [],
        transformItem: (f) => {
            const p = f.properties;
            const c = f.geometry.coordinates;
            const mag = p.mag;
            const dep = c[2];
            let sev = mag >= 7 ? "Critical" : mag >= 5.5 ? "High" : mag >= 4 ? "Medium" : "Low";
            const tsu = p.tsunami === 1 ? "A tsunami warning has been issued." : mag >= 7 && dep < 70 ? "There is a potential tsunami risk." : "There is no tsunami risk.";
            const aftershocks = mag >= 6 ? Math.floor(Math.pow(10, mag - 4.7)) : mag >= 4 ? Math.floor(Math.pow(10, mag - 3.5)) : 0;
            const shk = p.mmi ? ["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII"][Math.min(Math.floor(p.mmi) - 1, 11)] : null;
            return {
                _category: "Seismic", source_id: f.id, severity: sev, title: p.title || `M${mag} Earthquake`,
                description: `A magnitude ${mag} earthquake occurred at a depth of ${dep} km${p.place ? ` near ${p.place}` : ""}. ${tsu}`,
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
            let url = `${SOURCE_URLS.SEISMICPORTAL_EU_FDSNWS_EVENT_1_QUERY}?format=json&minmag=${p.min_magnitude || 2.0}&limit=${p.limit || 12000}&orderby=time`;
            if (p.start_time) url += `&starttime=${new Date(p.start_time).toISOString()}`;
            if (p.end_time) url += `&endtime=${new Date(p.end_time).toISOString()}`;
            return url;
        },
        extractRawItems: (d) => d.features || [],
        transformItem: (f) => {
            const p = f.properties;
            const c = f.geometry.coordinates;
            const mag = p.mag;
            return {
                _category: "Seismic", source_id: p.source_id || f.id,
                severity: mag >= 7 ? "Critical" : mag >= 5.5 ? "High" : mag >= 4 ? "Medium" : "Low",
                title: `M${mag} ${p.flynn_region || "Earthquake"}`,
                description: `A magnitude ${mag} earthquake occurred ${p.flynn_region ? `in ${p.flynn_region}` : "in an unknown region"} at a depth of ${c[2]} km.`,
                geometry_type: "Point", coordinates: [c[0], c[1]], latitude: c[1], longitude: c[0],
                event_time: p.time, updated_at: p.lastupdate,
                url: p.source_catalog ? `${SOURCE_URLS.EMSC_CSEM_ORG_EARTHQUAKE_EARTHQUAKE_PHP}?id=${p.source_id}` : null,
                metadata: { magnitude: mag, magnitude_type: p.magtype, depth_km: c[2], region: p.flynn_region, source_catalog: p.source_catalog, auth: p.auth, unid: p.unid }
            };
        }
    },
    ingv_earthquakes: {
        id: "ingv_earthquakes", name: "INGV Italy", logTag: "INGV", sourceName: "INGV", timeoutMs: 30000,
        buildUrl: (p) => {
            const st = p.start_time || new Date(Date.now() - 30 * 864e5).toISOString().split("T")[0];
            let url = `${SOURCE_URLS.WEBSERVICES_INGV_IT_FDSNWS_EVENT_1_QUERY}?format=geojson&starttime=${st}&minmag=${p.min_magnitude || 2.0}&limit=${p.limit || 10000}&orderby=time`;
            if (p.end_time) url += `&endtime=${new Date(p.end_time).toISOString().split("T")[0]}`;
            if (p.min_lat && p.max_lat && p.min_lng && p.max_lng) url += `&minlat=${p.min_lat}&maxlat=${p.max_lat}&minlon=${p.min_lng}&maxlon=${p.max_lng}`;
            return url;
        },
        extractRawItems: (d) => d.features || [],
        transformItem: (f) => {
            const p = f.properties;
            const c = f.geometry.coordinates;
            const mag = p.mag;
            const dep = c[2];
            return {
                _category: "Seismic", source_id: p.eventId || f.id,
                severity: mag >= 7 ? "Critical" : mag >= 5.5 ? "High" : mag >= 4 ? "Medium" : "Low",
                title: `M${mag} ${p.place || p.flynn_region || "Earthquake"}`,
                description: `A magnitude ${mag} earthquake occurred at a depth of ${dep} km ${p.place || p.flynn_region ? `near ${p.place || p.flynn_region}` : "in the Italy and Mediterranean region"}.`,
                geometry_type: "Point", coordinates: [c[0], c[1]], latitude: c[1], longitude: c[0],
                event_time: p.time || p.origin_time, updated_at: p.lastupdate || p.time,
                url: p.eventId ? `${SOURCE_URLS.TERREMOTI_INGV_IT_EVENT}${p.eventId}` : null,
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
        buildUrl: (p) => `${SOURCE_URLS.API_GEONET_ORG_NZ_QUAKE}?MMI=${p.min_mmi || -1}`,
        headers: { "Accept": "application/json" },
        extractRawItems: (d) => d.features || [],
        transformItem: (f) => {
            const p = f.properties;
            const c = f.geometry.coordinates;
            const mag = p.magnitude;
            const dep = p.depth;
            return {
                _category: "Seismic", source_id: p.publicID,
                severity: mag >= 7 ? "Critical" : mag >= 5.5 ? "High" : mag >= 4 ? "Medium" : "Low",
                title: `M${mag} ${p.locality || "New Zealand Earthquake"}`,
                description: `A magnitude ${mag} earthquake occurred at a depth of ${dep} km near ${p.locality || "New Zealand"}. Its modified Mercalli intensity is ${p.mmi}, and its data quality is rated ${p.quality}.`,
                geometry_type: "Point", coordinates: [c[0], c[1]], latitude: c[1], longitude: c[0],
                event_time: p.time, updated_at: p.time,
                url: `${SOURCE_URLS.GEONET_ORG_NZ_EARTHQUAKE}${p.publicID}`,
                metadata: {
                    magnitude: mag, depth_km: dep, mmi: p.mmi,
                    locality: p.locality, quality: p.quality,
                    public_id: p.publicID, catalog: "GeoNet New Zealand"
                }
            };
        }
    },
    noaa_alerts: {
        id: "noaa_alerts", name: "NOAA NWS", logTag: "NOAA", sourceName: "NOAA_NWS", timeoutMs: 120000,
        paginationStrategy: "custom",
        customFetch: async () => {
            const areas = await ensureMonitoredAreas();
            if (!areas.length) return [];
            const probes = areas.flatMap(areaProbePoints);
            const byId = new Map();
            let lastError = null;
            let anyOk = false;
            for (let i = 0; i < probes.length; i += NWS_PROBE_CONCURRENCY) {
                await Promise.all(probes.slice(i, i + NWS_PROBE_CONCURRENCY).map(async (pt) => {
                    try {
                        const r = await fetchWithTimeout(`${SOURCE_URLS.API_WEATHER_GOV_ALERTS_ACTIVE_2}?status=actual&point=${pt.lat.toFixed(4)},${pt.lng.toFixed(4)}`, { headers: NWS_HEADERS, maxBytes: NWS_PROBE_MAX_BYTES }, 20000);
                        if (!r.ok) {
                            lastError = new Error(`NWS alerts request failed with status ${r.status}.`);
                            return;
                        }
                        anyOk = true;
                        for (const f of (await r.json()).features || []) {
                            const id = f.properties?.id || f.id;
                            if (!id) continue;
                            const entry = byId.get(id) || { f, points: [] };
                            entry.points.push([pt.lng, pt.lat]);
                            byId.set(id, entry);
                        }
                    } catch (error) {
                        lastError = error.name === "AbortError" ? new Error("NWS alerts request timed out.") : error;
                    }
                }));
            }
            if (!anyOk && lastError) throw lastError;
            return [...byId.values()].map(({ f, points }) => {
                const item = transformNoaaAlert(f, points);
                return normalizeRisk("NOAA_NWS", item._category, item);
            });
        }
    },
    noaa_spc: {
        id: "noaa_spc", name: "NOAA SPC", logTag: "SPC", sourceName: "NOAA_SPC", paginationStrategy: "multi_url",
        buildUrls: () => [1, 2, 3].map(d => ({ url: `${SOURCE_URLS.SPC_NOAA_GOV_PRODUCTS_OUTLOOK_DAY}${d}otlk_cat.lyr.geojson`, meta: { day: `${d}` } })),
        extractRawItems: (d, p, m) => (d.features || []).map(f => ({ ...f, _day: m?.day || "1" })),
        transformItem: (f) => {
            const p = f.properties;
            const g = f.geometry;
            const rl = (p.LABEL || p.DN || "").toString();
            let sev = rl.includes("HIGH") || rl >= 5 ? "Critical" : rl.includes("MDT") || rl >= 4 ? "High" : "Medium";
            if (rl.includes("TSTM") || rl < 2) sev = "Low";
            const { lat, lng } = extractLatLng(g);
            const issueDate = p.ISSUE || p.VALID || new Date().toISOString().split("T")[0];
            return {
                _category: "Weather", source_id: `spc_day${f._day}_${p.DN || p.LABEL}_${issueDate}`,
                severity: sev, title: `Day ${f._day} Severe Weather Outlook: ${rl}`,
                description: `The Storm Prediction Center day ${f._day} severe weather outlook indicates a ${String(rl).toLowerCase()} risk of severe thunderstorms.`,
                geometry_type: g?.type || "Polygon", geometry_coordinates: g?.coordinates,
                coordinates: lat && lng ? [lng, lat] : null, latitude: lat, longitude: lng,
                event_time: new Date().toISOString(), url: SOURCE_URLS.SPC_NOAA_GOV_PRODUCTS_OUTLOOK,
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
                    `${SOURCE_URLS.GDACS_ORG_GDACSAPI_API_EVENTS_GETEVENTLIST_SEARCH}?fromDate=${from}&toDate=${to}&alertlevel=Red`,
                    `${SOURCE_URLS.GDACS_ORG_GDACSAPI_API_EVENTS_GETEVENTLIST_SEARCH}?fromDate=${from}&toDate=${to}&alertlevel=Orange`,
                    `${SOURCE_URLS.GDACS_ORG_GDACSAPI_API_EVENTS_GETEVENTLIST_SEARCH}?fromDate=${from}&toDate=${to}&alertlevel=Green`
                ];
                const settled = await Promise.allSettled(urls.map(async (url) => {
                    const r = await fetchWithTimeout(url, { headers: { "Accept": "application/json" } }, 30000);
                    if (!r.ok) return [];
                    const text = await r.text();
                    let d;
                    try {
                        d = JSON.parse(text);
                    } catch {
                        return [];
                    }
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
                    const rssUrl = SOURCE_URLS.GDACS_ORG_XML_RSS_XML;
                    const r = await fetchWithTimeout(rssUrl, {}, 30000);
                    if (r.ok) {
                        const text = await r.text();
                        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
                        let match;
                        while ((match = itemRegex.exec(text)) !== null) {
                            const block = match[1];
                            const get = (tag) => {
                                const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
                                return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : null;
                            };
                            const getAttr = (tag, attr) => {
                                const m = block.match(new RegExp(`<${tag}[^>]*${attr}="([^"]*)"[^>]*/?>`, "i"));
                                return m ? m[1] : null;
                            };
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
            const p = f.properties || f;
            const g = f.geometry;
            const sev = (p.alertlevel === "Red" || p.alertLevel === "Red") ? "Critical" : (p.alertlevel === "Orange" || p.alertLevel === "Orange") ? "High" : "Low";
            const catMap = { EQ: "Seismic", TC: "Hurricane", FL: "Flood", VO: "Volcanic", DR: "Drought", WF: "Wildfire", TS: "Tsunami" };
            const evType = p.eventtype || p.eventType || "";
            const cat = catMap[evType] || "Other";
            let lat = null;
            let lng = null;
            if (g) {
                ({ lat, lng } = extractLatLng(g));
            }
            if (lat == null && p.geo_lat) lat = parseFloat(p.geo_lat);
            if (lng == null && p.geo_lng) lng = parseFloat(p.geo_lng);
            if (lat == null && p.latitude) lat = parseFloat(p.latitude);
            if (lng == null && p.longitude) lng = parseFloat(p.longitude);
            const evId = p.eventid || p.eventId || p.id;
            return {
                _category: cat, source_id: evId?.toString(), severity: sev,
                title: p.eventname || p.eventName || p.name || `${cat} Event`,
                description: p.description || `${cat} event detected by GDACS with ${p.alertlevel || p.alertLevel || "unknown"} alert level.`,
                geometry_type: g?.type || "Point", geometry_coordinates: g?.coordinates,
                coordinates: lat && lng ? [lng, lat] : null, latitude: lat, longitude: lng,
                event_time: p.fromdate || p.fromDate, updated_at: p.todate || p.toDate,
                url: p.url || (evId ? `${SOURCE_URLS.GDACS_ORG_REPORT_ASPX}?eventid=${evId}&eventtype=${evType}` : null),
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
        buildUrl: () => SOURCE_URLS.VOLCANOES_USGS_GOV_VSC_API_VOLCANOAPI_VOLCANOESGVP,
        extractRawItems: (d) => d.features || d || [],
        transformItem: (v) => {
            const p = v.properties || v;
            const g = v.geometry;
            let lat = p.Latitude || p.latitude;
            let lng = p.Longitude || p.longitude;
            if (g?.coordinates) {
                lng = g.coordinates[0];
                lat = g.coordinates[1];
            }
            const al = p.alert_level || p.alertLevel || "Normal";
            const sev = al === "Warning" ? "Critical" : al === "Watch" ? "High" : al === "Advisory" ? "Medium" : "Low";
            const vt = p.Volcano_Type || p.volcanoType || "Unknown";
            const vei = vt.includes("Strato") ? 4 : vt.includes("Shield") ? 2 : vt.includes("Caldera") ? 6 : 3;
            const nm = p.Volcano_Name || p.volcanoName || "Unknown Volcano";
            return {
                _category: "Volcanic", source_id: p.vnum || p.id?.toString(), severity: sev, title: nm,
                description: `${nm} is ${vt && vt !== "Unknown" ? `${/^[aeiou]/i.test(vt) ? "an" : "a"} ${String(vt).toLowerCase()}` : "a volcano of unknown type"} at alert level ${al}${p.Elevation || p.elevation ? `, with an elevation of ${p.Elevation || p.elevation} meters` : ""}.`,
                geometry_type: "Point", coordinates: [lng, lat], latitude: lat, longitude: lng,
                event_time: new Date().toISOString(),
                url: `${SOURCE_URLS.VOLCANOES_USGS_GOV_VOLCANOES}${nm.toLowerCase().replace(/\s+/g, "_")}/`,
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
        buildUrl: (p) => `${SOURCE_URLS.EONET_GSFC_NASA_GOV_API_V3_EVENTS}?days=${p.days || 60}&status=${p.status || "all"}&limit=${p.limit || 500}`,
        extractRawItems: (d) => d.events || [],
        transformItem: (ev) => {
            const catMap = { wildfires: "Wildfire", severeStorms: "Weather", volcanoes: "Volcanic", earthquakes: "Seismic", floods: "Flood", landslides: "Landslide", seaLakeIce: "Ice", snow: "Weather", dustHaze: "Air Quality", drought: "Drought", tempExtremes: "Weather", waterColor: "Water", manmade: "Industrial" };
            const cats = ev.categories || [];
            const catId = cats[0]?.id || "unknown";
            const cat = catMap[catId] || "Other";
            const geoms = ev.geometry || [];
            return geoms.map((g, i) => {
                const { lat, lng } = extractLatLng(g);
                let sev = "Medium";
                if (g.magnitudeValue > 100) sev = "Critical";
                else if (g.magnitudeValue > 50) sev = "High";
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
        buildQueryPoints: () => openMeteoQueryPoints(OPEN_METEO_AQ_CITY_CAP),
        buildBatchUrl: (batch) => {
            const lats = batch.map(p => p.lat.toFixed(4)).join(",");
            const lngs = batch.map(p => p.lng.toFixed(4)).join(",");
            return `${SOURCE_URLS.AIR_QUALITY_API_OPEN_METEO_COM_V1_AIR_QUALITY}?latitude=${lats}&longitude=${lngs}&current=us_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone`;
        },
        extractRawItems: (d, p, batch) => {
            const arr = Array.isArray(d) ? d : [d];
            const items = [];
            for (let j = 0; j < batch.length; j++) {
                const entry = arr[j];
                const pt = batch[j];
                if (!entry?.current) continue;
                const c = entry.current;
                items.push({ name: pt.name, lat: entry.latitude || pt.lat, lng: entry.longitude || pt.lng, pop: pt.pop || 0, aqi: c.us_aqi || 0, pm25: c.pm2_5 || null, pm10: c.pm10 || null, o3: c.ozone || null, no2: c.nitrogen_dioxide || null, so2: c.sulphur_dioxide || null, co: c.carbon_monoxide || null, time: c.time || new Date().toISOString() });
            }
            return items;
        },
        transformItem: (s) => {
            const aqi = s.aqi;
            let sev = "Low";
            let aqiCat = "Good";
            if (aqi > 300) {
                sev = "Critical";
                aqiCat = "Hazardous";
            } else if (aqi > 200) {
                sev = "Critical";
                aqiCat = "Very Unhealthy";
            } else if (aqi > 150) {
                sev = "High";
                aqiCat = "Unhealthy";
            } else if (aqi > 100) {
                sev = "Medium";
                aqiCat = "Unhealthy for Sensitive Groups";
            } else if (aqi > 50) {
                sev = "Low";
                aqiCat = "Moderate";
            }
            const hr = aqi > 200 ? "Everyone should avoid outdoor exertion." : aqi > 150 ? "Sensitive groups should avoid outdoor exertion." : aqi > 100 ? "Sensitive groups should reduce prolonged outdoor exertion." : aqi > 50 ? "Unusually sensitive people should consider reducing prolonged outdoor exertion." : "Air quality is acceptable.";
            return {
                _category: "Air Quality", source_id: `openmeteo_aq_${s.lat.toFixed(3)}_${s.lng.toFixed(3)}`,
                severity: sev, title: `Air Quality: ${s.name}`,
                description: `The AQI at ${s.name} is ${aqi}, which is rated ${String(aqiCat).toLowerCase()}. ${hr}`,
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
                    population: s.pop, data_source: "Open-Meteo Air Quality API (CAMS Global Atmospheric Composition)"
                }
            };
        }
    },
    usgs_water: {
        id: "usgs_water", name: "USGS Water", logTag: "WATER", sourceName: "USGS_WATER", timeoutMs: 60000,
        paginationStrategy: "custom",
        customFetch: async () => {
            const cfg = DATA_SOURCES.usgs_water;
            const areas = monitoredAreaCenters.length ? monitoredAreaCenters : await loadMonitoredAreaCenters();
            if (!areas.length) return [];
            const byId = new Map();
            let lastError = null;
            await Promise.all(areas.map(usgsAreaBox).map(async (box) => {
                try {
                    const r = await fetchWithTimeout(cfg.buildBboxUrl(box), { headers: { "Accept": "application/json" } }, cfg.timeoutMs);
                    if (!r.ok) {
                        lastError = new Error(`USGS Water request failed with status ${r.status}.`);
                        return;
                    }
                    for (const item of cfg.extractRawItems(await r.json())) {
                        const n = cfg.transformItem(item, box);
                        if (!n) continue;
                        const risk = normalizeRisk(cfg.sourceName, n._category, n);
                        if (!byId.has(risk.source_id)) byId.set(risk.source_id, risk);
                    }
                } catch (error) {
                    lastError = error.name === "AbortError" ? new Error("USGS Water request timed out.") : error;
                }
            }));
            if (!byId.size && lastError) throw lastError;
            return [...byId.values()];
        },
        buildUrl: (p) => `${SOURCE_URLS.WATERSERVICES_USGS_GOV_NWIS_IV}?format=json&parameterCd=00065&siteStatus=active&siteType=ST&stateCd=${p.state}`,
        buildBboxUrl: (p) => `${SOURCE_URLS.WATERSERVICES_USGS_GOV_NWIS_IV}?format=json&parameterCd=00065&siteStatus=active&siteType=ST&bBox=${p.min_lng},${p.min_lat},${p.max_lng},${p.max_lat}`,
        extractRawItems: (d) => d.value?.timeSeries || [],
        transformItem: (s) => {
            const site = s.sourceInfo;
            const vals = s.values?.[0]?.value || [];
            const lv = vals[vals.length - 1];
            const gh = parseFloat(lv?.value) || 0;
            let sev = "Low";
            let fs = "Normal";
            if (gh > 25) {
                sev = "Critical";
                fs = "Major Flood";
            } else if (gh > 18) {
                sev = "High";
                fs = "Moderate Flood";
            } else if (gh > 12) {
                sev = "Medium";
                fs = "Minor Flood";
            } else if (gh > 8) {
                fs = "Action Stage";
            }
            return {
                _category: "Flood", source_id: site.siteCode?.[0]?.value, severity: sev,
                title: `Water Level: ${site.siteName}`,
                description: `The gage height at ${site.siteName} is ${gh.toFixed(2)} ft, which is at ${String(fs).toLowerCase()} stage.`,
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
        buildUrl: (p, off, bs) => `${SOURCE_URLS.SERVICES3_ARCGIS_COM_T4QMSPBFLG3QTGWY_ARCGIS_REST_SERVICES_W}?where=1%3D1&outFields=*&f=geojson&geometryPrecision=4&maxAllowableOffset=0.005&resultOffset=${off || 0}&resultRecordCount=${bs || 2000}`,
        extractRawItems: (d) => d.features || [],
        transformItem: (f) => {
            const p = f.properties;
            const g = f.geometry;
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
                description: `${incidentName} has burned ${acres.toLocaleString()} acres and is ${pct}% contained. ${dur ? `It has been active for ${dur} days.` : "How long it has been active is unknown."}`,
                geometry_type: g?.type || "Polygon", geometry_coordinates: g?.coordinates,
                coordinates: lat && lng ? [lng, lat] : null, latitude: lat, longitude: lng,
                event_time: disc ? disc.toISOString() : null,
                updated_at: p.poly_DateCurrent ? new Date(p.poly_DateCurrent).toISOString() : null,
                url: p.attr_IrwinURL || (p.poly_IRWINID ? `${SOURCE_URLS.IRWIN_DOI_GOV_OBSERVER}?eid=${p.poly_IRWINID}` : null),
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
        buildUrl: (p, off, bs) => {
            const windowDays = p.window_days || 365;
            const since = new Date(Date.now() - windowDays * 864e5).toISOString().split("T")[0];
            return `${SOURCE_URLS.FEMA_GOV_API_OPEN_V2_DISASTERDECLARATIONSSUMMARIES}?$filter=declarationDate gt '${since}'&$orderby=declarationDate desc&$top=${bs || 1000}&$skip=${off || 0}`;
        },
        extractRawItems: (d) => d.DisasterDeclarationsSummaries || [],
        transformItem: (dec) => {
            const catMap = { Fire: "Wildfire", Hurricane: "Hurricane", Flood: "Flood", Tornado: "Tornado", Earthquake: "Seismic", "Severe Storm": "Weather", Snowstorm: "Weather", Drought: "Drought", Volcano: "Volcanic", Tsunami: "Tsunami" };
            let cat = "Other";
            for (const [k, v] of Object.entries(catMap)) {
                if ((dec.incidentType || "").includes(k)) {
                    cat = v;
                    break;
                }
            }
            let sev = dec.declarationType === "DR" ? "High" : "Medium";
            if (dec.ihProgramDeclared || dec.iaProgramDeclared) sev = "Critical";
            return {
                _category: cat, source_id: dec.disasterNumber?.toString(), severity: sev,
                title: `${dec.declarationType === "DR" ? "Major Disaster" : "Emergency"}: ${dec.declarationTitle}`,
                description: `${dec.declarationTitle} was declared in ${dec.designatedArea || dec.state}, and the incident type is ${String(dec.incidentType).toLowerCase()}.`,
                geometry_type: "Point", coordinates: null, latitude: null, longitude: null,
                event_time: dec.incidentBeginDate, expires_at: dec.incidentEndDate,
                url: `${SOURCE_URLS.FEMA_GOV_DISASTER}${dec.disasterNumber}`,
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
        buildUrl: () => SOURCE_URLS.SERVICES_SWPC_NOAA_GOV_PRODUCTS_ALERTS_JSON,
        extractRawItems: (d) => d || [],
        transformItem: (a) => {
            const msg = a.message || "";
            let sev = "Low";
            if (/G[45]|S[45]|R[45]/.test(msg)) sev = "Critical";
            else if (/G3|S3|R3/.test(msg)) sev = "High";
            else if (/G2|S2|R2/.test(msg)) sev = "Medium";
            const at = msg.includes("Geomagnetic") ? "Geomagnetic Storm" : msg.includes("Solar Radiation") ? "Solar Radiation Storm" : msg.includes("Radio Blackout") ? "Radio Blackout" : "Space Weather Alert";
            return {
                _category: "Space", source_id: a.serial_number || `swpc_${a.issue_datetime || ""}`, severity: sev,
                title: at, description: msg.substring(0, 500),
                geometry_type: "Point", coordinates: null, latitude: null, longitude: null,
                event_time: a.issue_datetime,
                metadata: {
                    product_id: a.product_id, serial_number: a.serial_number, issue_datetime: a.issue_datetime,
                    alert_type: at, full_message: msg.substring(0, 2000),
                    impacts: {
                        power_systems: sev === "Critical" || sev === "High" ? "Widespread voltage control problems are possible." : "Minor Impact",
                        spacecraft_operations: sev === "Critical" ? "Extensive surface charging is expected." : "Minor Impact",
                        hf_radio: sev === "Critical" || sev === "High" ? "HF radio propagation may be affected." : "Minor Impact",
                        navigation: sev === "Critical" ? "Satellite navigation may be degraded." : "Normal"
                    }
                }
            };
        }
    },
    noaa_kp_index: {
        id: "noaa_kp_index", name: "NOAA SWPC Kp Index", logTag: "SWPC_KP", sourceName: "NOAA_SWPC_KP",
        buildUrl: () => SOURCE_URLS.SERVICES_SWPC_NOAA_GOV_PRODUCTS_NOAA_PLANETARY_K_INDEX_JSON,
        extractRawItems: (d) => {
            if (!Array.isArray(d) || d.length < 2) return [];
            return d.slice(1).slice(-24);
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
            return {
                _category: "Space", source_id: `kp_${ts}`, severity: sev,
                title: `Planetary Kp Index: ${kp.toFixed(2)}`,
                description: `The planetary Kp index is ${kp.toFixed(2)} at ${ts}. ${kp >= 5 ? "Geomagnetic storm conditions are present." : "The geomagnetic field is quiet to unsettled."}`,
                geometry_type: "Point", coordinates: null, latitude: null, longitude: null,
                event_time: ts,
                metadata: {
                    kp_value: kp, kp_integer: parseInt(row[2], 10) || Math.round(kp),
                    observation_type: row[3] || "observed",
                    storm_level: kp >= 9 ? "G5 Extreme" : kp >= 8 ? "G4 Severe" : kp >= 7 ? "G3 Strong" : kp >= 6 ? "G2 Moderate" : kp >= 5 ? "G1 Minor" : "Below Storm Threshold"
                }
            };
        }
    },
    noaa_swpc_xray: {
        id: "noaa_swpc_xray", name: "NOAA SWPC X-Ray Flux", logTag: "SWPC_XRAY", sourceName: "NOAA_SWPC_XRAY",
        buildUrl: () => SOURCE_URLS.SERVICES_SWPC_NOAA_GOV_JSON_GOES_PRIMARY_XRAYS_7_DAY_JSON,
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
                description: `A GOES satellite measured ${cls} class X-ray flux at ${entry.time_tag}. ${sev === "Critical" ? "An extreme radio blackout is possible." : sev === "High" ? "A strong radio blackout is possible." : sev === "Medium" ? "A moderate radio blackout is possible." : "No significant radio blackout is expected."}`,
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
        buildUrl: () => SOURCE_URLS.SERVICES_SWPC_NOAA_GOV_PRODUCTS_SOLAR_WIND_PLASMA_7_DAY_JSON,
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
                description: `The solar wind speed is ${speed.toFixed(0)} km/s${isNaN(density) ? "" : ` with a density of ${density.toFixed(1)} p/cm³`} at ${ts}. ${isCmeCandidate ? "This elevated solar wind is consistent with a coronal mass ejection arrival." : speed > 500 ? "An enhanced solar wind stream has been detected." : "Solar wind conditions are nominal."}`,
                geometry_type: "Point", coordinates: null, latitude: null, longitude: null,
                event_time: ts,
                metadata: {
                    wind_speed_km_s: speed,
                    proton_density_cm3: isNaN(density) ? null : density,
                    temperature_k: isNaN(temperature) ? null : temperature,
                    is_cme_candidate: isCmeCandidate,
                    impacts: {
                        power_systems: speed > 700 ? "Voltage irregularities are possible in high-latitude power grids." : "Nominal",
                        spacecraft_operations: speed > 600 ? "Satellites in low-Earth orbit will experience increased drag." : "Nominal",
                        hf_radio: speed > 700 && density > 15 ? "Polar cap absorption events are possible." : "Nominal",
                        navigation: speed > 800 ? "GNSS accuracy may be degraded." : "Nominal"
                    },
                    data_source: "NOAA SWPC DSCOVR and ACE Real-Time Solar Wind Measurements"
                }
            };
        }
    },
    noaa_swpc_mag_field: {
        id: "noaa_swpc_mag_field", name: "NOAA SWPC Interplanetary Magnetic Field", logTag: "SWPC_MAG", sourceName: "NOAA_SWPC_MAG",
        buildUrl: () => SOURCE_URLS.SERVICES_SWPC_NOAA_GOV_PRODUCTS_SOLAR_WIND_MAG_7_DAY_JSON,
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
                description: `The interplanetary magnetic field Bz component is ${bzVal.toFixed(1)} nT and the total field is ${btVal.toFixed(1)} nT at ${ts}. ${geoEffective ? "The southward Bz indicates geo-effective coupling between the solar wind and the Earth's magnetosphere." : "The magnetic field orientation is not strongly geo-effective."}`,
                geometry_type: "Point", coordinates: null, latitude: null, longitude: null,
                event_time: ts,
                metadata: {
                    bx_gsm_nT: isNaN(bx) ? null : bx,
                    by_gsm_nT: isNaN(by) ? null : by,
                    bz_gsm_nT: bzVal,
                    bt_nT: btVal,
                    is_geo_effective: geoEffective,
                    coupling_efficiency: bzVal < 0 ? "High" : "Low",
                    expected_geomagnetic_response: bzVal < -20 ? "Severe geomagnetic storming is likely." : bzVal < -10 ? "Active to storm-level geomagnetic conditions are expected." : bzVal < -5 ? "Unsettled to active geomagnetic conditions are possible." : "Quiet geomagnetic conditions are expected.",
                    data_source: "NOAA SWPC DSCOVR and ACE Real-Time Interplanetary Magnetic Field Measurements"
                }
            };
        }
    },
    noaa_swpc_kp_forecast: {
        id: "noaa_swpc_kp_forecast", name: "NOAA SWPC Kp Forecast", logTag: "SWPC_KP_FC", sourceName: "NOAA_SWPC_KP_FC",
        buildUrl: () => SOURCE_URLS.SERVICES_SWPC_NOAA_GOV_PRODUCTS_NOAA_PLANETARY_K_INDEX_FOREC,
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
                description: `The planetary Kp index is forecast to reach ${kp.toFixed(2)} at ${ts}. ${kp >= 7 ? "A severe geomagnetic storm is forecast, with potential impacts on power grids and satellites." : kp >= 5 ? "Geomagnetic storm conditions are forecast, and aurora may be visible at mid-latitudes." : kp >= 4 ? "Unsettled to active geomagnetic conditions are forecast." : "Quiet geomagnetic conditions are forecast."}`,
                geometry_type: "Point", coordinates: null, latitude: null, longitude: null,
                event_time: ts,
                metadata: {
                    kp_value: kp,
                    kp_integer: Math.round(kp),
                    observation_type: observed,
                    storm_scale: kp >= 9 ? "G5 Extreme" : kp >= 8 ? "G4 Severe" : kp >= 7 ? "G3 Strong" : kp >= 6 ? "G2 Moderate" : kp >= 5 ? "G1 Minor" : "Below Storm Threshold",
                    forecast_impacts: {
                        power_systems: kp >= 8 ? "Widespread voltage control problems and protective system issues are likely." : kp >= 6 ? "Voltage irregularities and false alarms on protection devices are possible." : "Nominal",
                        spacecraft_operations: kp >= 7 ? "Spacecraft may experience surface charging and tracking difficulties." : kp >= 5 ? "Satellites in low-Earth orbit will experience increased drag." : "Nominal",
                        hf_radio: kp >= 7 ? "HF radio may be intermittent." : kp >= 5 ? "HF radio propagation will be degraded at high latitudes." : "Nominal",
                        navigation: kp >= 8 ? "Satellite navigation may be degraded for hours." : kp >= 5 ? "GNSS accuracy may be slightly reduced." : "Nominal",
                        aurora_visibility: kp >= 8 ? "Aurora may be visible at low latitudes." : kp >= 6 ? "Aurora may be visible at mid-latitudes." : kp >= 4 ? "Aurora may be visible at high latitudes." : "Aurora will be limited to polar regions."
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
        buildQueryPoints: () => openMeteoQueryPoints(OPEN_METEO_FLOOD_CITY_CAP),
        buildBatchUrl: (batch) => {
            const lats = batch.map(p => p.lat.toFixed(4)).join(",");
            const lngs = batch.map(p => p.lng.toFixed(4)).join(",");
            return `${SOURCE_URLS.FLOOD_API_OPEN_METEO_COM_V1_FLOOD}?latitude=${lats}&longitude=${lngs}&daily=river_discharge,river_discharge_max&forecast_days=7`;
        },
        extractRawItems: (d, p, batch) => {
            const arr = Array.isArray(d) ? d : [d];
            const items = [];
            for (let j = 0; j < batch.length; j++) {
                const entry = arr[j];
                const pt = batch[j];
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
            let sev = "Low";
            let status = "Normal";
            if (peak > 5000 || ratio > 5) {
                sev = "Critical";
                status = "Extreme Flood Forecast";
            } else if (peak > 2000 || ratio > 3) {
                sev = "High";
                status = "Significant Flood Forecast";
            } else if (peak > 500 || ratio > 2) {
                sev = "Medium";
                status = "Elevated Discharge Forecast";
            } else {
                status = "Normal Discharge Forecast";
            }
            return {
                _category: "Flood", source_id: `glofas_${s.lat.toFixed(3)}_${s.lng.toFixed(3)}`,
                severity: sev, title: `River Discharge Forecast: ${s.name}`,
                description: `The GloFAS forecast for ${s.name} shows a peak discharge of ${peak.toFixed(1)} m³/s over the next ${s.forecast_days} days, which is rated as ${status.toLowerCase()}.`,
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
            return `${SOURCE_URLS.MARINE_API_OPEN_METEO_COM_V1_MARINE}?latitude=${lats}&longitude=${lngs}&current=wave_height,wave_direction,wave_period,wind_wave_height,swell_wave_height`;
        },
        extractRawItems: (d, p, batch) => {
            const arr = Array.isArray(d) ? d : [d];
            const items = [];
            for (let j = 0; j < batch.length; j++) {
                const entry = arr[j];
                const pt = batch[j];
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
            let sev = "Low";
            let status = "Calm to Moderate Seas";
            if (wh >= 9) {
                sev = "Critical";
                status = "Phenomenal Seas (Extreme Maritime Hazard)";
            } else if (wh >= 6) {
                sev = "High";
                status = "Very Rough to High Seas (Dangerous Conditions)";
            } else if (wh >= 4) {
                sev = "Medium";
                status = "Rough Seas (Small Craft Advisory Conditions)";
            } else if (wh >= 2.5) {
                sev = "Low";
                status = "Moderate Seas";
            }
            return {
                _category: "Weather", source_id: `marine_${s.lat.toFixed(2)}_${s.lng.toFixed(2)}`,
                severity: sev, title: `Marine Conditions: ${s.name}`,
                description: `Waves are ${wh.toFixed(1)} m high with a ${s.wave_period.toFixed(1)} s period, arriving from ${s.wave_direction}°, and conditions are rated as ${status.toLowerCase()}.`,
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
        buildUrl: () => SOURCE_URLS.API_WEATHER_GOV_ALERTS_ACTIVE,
        extractRawItems: (d) => d.features || [],
        transformItem: (f) => {
            const p = f.properties;
            const g = f.geometry;
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
                description: p.description || `${p.event || "A tsunami alert"} has been issued for ${p.areaDesc || "coastal areas"}.`,
                geometry_type: geomType || "Polygon", geometry_coordinates: geomCoords,
                coordinates: lat && lng ? [lng, lat] : null, latitude: lat, longitude: lng,
                event_time: p.onset || p.effective, expires_at: p.expires,
                url: SOURCE_URLS.TSUNAMI_GOV,
                metadata: {
                    event_type: p.event, nws_severity: p.severity, certainty: p.certainty, urgency: p.urgency,
                    sender: p.senderName, affected_areas: p.areaDesc, instruction: p.instruction, headline: p.headline
                }
            };
        }
    },
    wfigs_incidents: {
        id: "wfigs_incidents", name: "NIFC WFIGS Incident Locations", logTag: "WFIGS_INC", sourceName: "NIFC_INCIDENTS", timeoutMs: 30000,
        paginationStrategy: "offset", paginationBatchSize: 2000,
        buildUrl: (p, off, bs) => `${SOURCE_URLS.SERVICES3_ARCGIS_COM_T4QMSPBFLG3QTGWY_ARCGIS_REST_SERVICES_W_2}?where=1%3D1&outFields=*&f=geojson&resultOffset=${off}&resultRecordCount=${bs}`,
        extractRawItems: (d) => d.features || [],
        transformItem: (f) => {
            const p = f.properties || {};
            const c = f.geometry?.coordinates;
            if (!Array.isArray(c) || c.length < 2) return null;
            const type = String(p.IncidentTypeCategory || p.attr_IncidentTypeCategory || "").toUpperCase();
            if (type === "RX") return null;
            const acres = parseFloat(p.IncidentSize ?? p.DailyAcres ?? p.CalculatedAcres ?? 0) || 0;
            const pct = parseFloat(p.PercentContained ?? 0) || 0;
            let sev = "Low";
            if (acres > 50000 || (acres > 10000 && pct < 20)) sev = "Critical";
            else if (acres > 10000 || (acres > 1000 && pct < 30)) sev = "High";
            else if (acres > 100) sev = "Medium";
            const name = String(p.IncidentName || "Unnamed Fire").trim();
            const titleName = name.toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase());
            const place = [p.POOCounty, p.POOState].filter(Boolean).join(", ");
            const disc = p.FireDiscoveryDateTime ? new Date(p.FireDiscoveryDateTime) : null;
            const modified = p.ModifiedOnDateTime_dt || p.ModifiedOnDateTime;
            return {
                _category: "Wildfire", source_id: p.UniqueFireIdentifier || p.IrwinID || String(p.OBJECTID || ""),
                severity: sev,
                title: /fire$/i.test(titleName) ? titleName : `${titleName} Fire`,
                description: `${/fire$/i.test(titleName) ? titleName : `${titleName} Fire`} has burned ${acres.toLocaleString()} acres${place ? ` in ${place}` : ""} and is ${pct}% contained.`,
                geometry_type: "Point", coordinates: [c[0], c[1]], latitude: c[1], longitude: c[0],
                event_time: disc && !isNaN(disc) ? disc.toISOString() : null,
                updated_at: modified ? new Date(modified).toISOString() : null,
                url: p.IrwinID ? `${SOURCE_URLS.IRWIN_DOI_GOV_OBSERVER}?eid=${p.IrwinID}` : null,
                metadata: { event_type: "Wildfire Incident", location: place || null, total_acres: acres, percent_contained: pct }
            };
        }
    },
    firms_hotspots: {
        id: "firms_hotspots", name: "NASA FIRMS Hotspots", logTag: "FIRMS", sourceName: "NASA_FIRMS", timeoutMs: 60000,
        paginationStrategy: "custom",
        customFetch: async () => {
            const key = process.env[SOURCE_KEYS.firmsMapKey];
            if (!key) return null;
            const areas = monitoredAreaCenters.length ? monitoredAreaCenters : await loadMonitoredAreaCenters();
            if (!areas.length) return null;
            const settled = await Promise.allSettled(areas.map(async (a) => {
                const dLat = a.km / 111.32;
                const dLng = a.km / (111.32 * Math.max(0.01, Math.cos((a.lat * Math.PI) / 180)));
                const box = [a.lng - dLng, a.lat - dLat, a.lng + dLng, a.lat + dLat].map((v) => v.toFixed(3)).join(",");
                const r = await fetchWithTimeout(`${SOURCE_URLS.FIRMS_MODAPS_EOSDIS_NASA_GOV_API_AREA_CSV}${key}/${FIRMS_SOURCE}/${box}/1`, {}, 30000);
                if (!r.ok) return null;
                return parseFirmsCsv(await r.text());
            }));
            const rows = settled.filter((r) => r.status === "fulfilled" && Array.isArray(r.value)).flatMap((r) => r.value);
            if (!settled.some((r) => r.status === "fulfilled" && Array.isArray(r.value))) return null;
            return firmsClusters(rows).map((c) => {
                const sev = c.maxFrp > 100 || c.n >= 10 ? "High" : c.maxFrp > 30 || c.high ? "Medium" : "Low";
                const when = c.latest || new Date().toISOString();
                return normalizeRisk("NASA_FIRMS", "Wildfire", {
                    source_id: `firms_${c.key}`,
                    severity: sev,
                    title: `Satellite Fire Detection: ${c.lat.toFixed(3)}, ${c.lng.toFixed(3)}`,
                    description: `${c.n} satellite fire ${c.n === 1 ? "detection was" : "detections were"} recorded here in the last day, with a peak radiative power of ${c.maxFrp.toFixed(1)} MW.`,
                    geometry_type: "Point", coordinates: [c.lng, c.lat], latitude: c.lat, longitude: c.lng,
                    event_time: when, updated_at: when,
                    expires_at: new Date(Date.parse(when) + 24 * 60 * 60 * 1000).toISOString(),
                    url: SOURCE_URLS.FIRMS_MODAPS_EOSDIS_NASA_GOV_MAP,
                    metadata: { event_type: "Satellite Fire Detection", detection_count: c.n, peak_frp_mw: parseFloat(c.maxFrp.toFixed(1)), high_confidence: c.high }
                });
            });
        }
    },
    gdelt_geo_crime: {
        id: "gdelt_geo_crime", name: "GDELT Crime News", logTag: "GDELT_GEO", sourceName: "GDELT_GEO_CRIME", timeoutMs: 120000,
        paginationStrategy: "custom",
        customFetch: async () => {
            const queries = [{ query: GDELT_GEO_CRIME_QUERY, maxpoints: 1000 }];
            for (const area of monitoredAreaCenters.length ? monitoredAreaCenters : await loadMonitoredAreaCenters()) {
                queries.push({ query: `${GDELT_GEO_CRIME_QUERY} near:${area.lat.toFixed(4)},${area.lng.toFixed(4)},${Math.max(10, Math.round(area.km))}km`, maxpoints: 250 });
            }
            const featureSets = [];
            let lastError = null;
            for (let i = 0; i < queries.length; i++) {
                if (i > 0) await new Promise((done) => setTimeout(done, GDELT_REQUEST_SPACING_MS));
                try {
                    featureSets.push(await fetchGdeltGeo(queries[i].query, queries[i].maxpoints));
                } catch (error) {
                    lastError = error;
                }
            }
            if (!featureSets.length) throw lastError || new Error("The GDELT GEO API did not respond.");
            const byId = new Map();
            for (const features of featureSets) {
                for (const feature of features) {
                    const risk = gdeltGeoFeatureToRisk(feature);
                    if (risk && !byId.has(risk.source_id)) byId.set(risk.source_id, risk);
                }
            }
            return [...byId.values()];
        }
    },
    nws_storm_reports: {
        id: "nws_storm_reports", name: "NWS Local Storm Reports", logTag: "LSR", sourceName: "NWS_LSR", timeoutMs: 30000,
        headers: { "Accept": "application/geo+json" },
        paginationStrategy: "custom",
        customFetch: async () => {
            const cfg = DATA_SOURCES.nws_storm_reports;
            const areas = await ensureMonitoredAreas();
            if (!areas.length) return [];
            const byId = new Map();
            let lastError = null;
            let anyOk = false;
            for (const area of areas) {
                const b = areaBounds(area);
                try {
                    const ets = new Date();
                    const sts = new Date(ets.getTime() - 24 * 60 * 60 * 1000);
                    const stamp = (d) => d.toISOString().slice(0, 16) + "Z";
                    const r = await fetchWithTimeout(`${LSR_BASE_URL}?west=${b.west.toFixed(4)}&east=${b.east.toFixed(4)}&south=${b.south.toFixed(4)}&north=${b.north.toFixed(4)}&sts=${stamp(sts)}&ets=${stamp(ets)}`, { headers: cfg.headers }, cfg.timeoutMs);
                    if (!r.ok) {
                        lastError = new Error(`NWS storm reports request failed with status ${r.status}.`);
                        continue;
                    }
                    anyOk = true;
                    for (const f of cfg.extractRawItems(await r.json())) {
                        const n = cfg.transformItem(f);
                        if (!n) continue;
                        if (!nearAnyArea(n.latitude, n.longitude, areas)) continue;
                        const risk = normalizeRisk(cfg.sourceName, n._category, n);
                        if (!byId.has(risk.source_id)) byId.set(risk.source_id, risk);
                    }
                } catch (error) {
                    lastError = error;
                }
            }
            if (!anyOk && lastError) throw lastError;
            return [...byId.values()];
        },
        buildUrl: () => LSR_URL,
        extractRawItems: (d) => d.features || [],
        transformItem: (f) => {
            const p = f.properties || {};
            const lat = parseFloat(p.lat ?? f.geometry?.coordinates?.[1]);
            const lng = parseFloat(p.lon ?? f.geometry?.coordinates?.[0]);
            if (isNaN(lat) || isNaN(lng)) return null;
            const type = p.typetext || p.type || "Storm Report";
            const place = [p.city, p.st || p.state].filter(Boolean).join(", ");
            const magnitude = p.magnitude != null && p.magnitude !== "" ? `${p.magnitude}${p.unit ? ` ${p.unit}` : ""}` : null;
            const typeTitle = String(type).toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase());
            const valid = p.valid ? new Date(p.valid) : new Date();
            return {
                _category: lsrCategory(type), source_id: `lsr_${p.valid || ""}_${lat.toFixed(3)}_${lng.toFixed(3)}_${type}`,
                severity: lsrSeverity(type, p.magnitude),
                title: place ? `${typeTitle}: ${place}` : typeTitle,
                description: p.remark ? `${p.remark.trim().replace(/\.?$/, ".")}` : `A ${typeTitle.toLowerCase()} was reported${place ? ` near ${place}` : ""}.`,
                geometry_type: "Point", coordinates: [lng, lat], latitude: lat, longitude: lng,
                event_time: valid.toISOString(), updated_at: valid.toISOString(),
                expires_at: new Date(valid.getTime() + 24 * 60 * 60 * 1000).toISOString(),
                url: SOURCE_URLS.MESONET_AGRON_IASTATE_EDU_LSR,
                metadata: { event_type: typeTitle, magnitude, location: place || null, source_domain: p.source || null, headline: p.wfo ? `NWS ${p.wfo}` : null }
            };
        }
    },
    airnow_observations: {
        id: "airnow_observations", name: "EPA AirNow", logTag: "AIRNOW", sourceName: "EPA_AIRNOW", timeoutMs: 30000,
        paginationStrategy: "custom",
        customFetch: async () => {
            const key = process.env[SOURCE_KEYS.airnowApiKey];
            if (!key) return [];
            const areas = await ensureMonitoredAreas();
            const results = [];
            let lastError = null;
            let anyOk = false;
            for (const area of areas) {
                try {
                    const r = await fetchWithTimeout(`${SOURCE_URLS.AIRNOWAPI_ORG_AQ_OBSERVATION_LATLONG_CURRENT}?format=application/json&latitude=${area.lat.toFixed(4)}&longitude=${area.lng.toFixed(4)}&distance=${AIRNOW_DISTANCE_MILES}&API_KEY=${key}`, {}, 30000);
                    if (!r.ok) {
                        lastError = new Error(`EPA AirNow request failed with status ${r.status}.`);
                        continue;
                    }
                    anyOk = true;
                    const rows = await r.json();
                    if (!Array.isArray(rows) || !rows.length) continue;
                    const worst = rows.reduce((a, b) => ((b.AQI || 0) > (a.AQI || 0) ? b : a));
                    const aqi = worst.AQI || 0;
                    const category = worst.Category?.Name || "Unknown";
                    const lat = parseFloat(worst.Latitude) || area.lat;
                    const lng = parseFloat(worst.Longitude) || area.lng;
                    const observed = worst.DateObserved ? new Date(`${worst.DateObserved.trim()}T${String(worst.HourObserved || 0).padStart(2, "0")}:00:00`) : new Date();
                    results.push(normalizeRisk("EPA_AIRNOW", "Air Quality", {
                        source_id: `airnow_${(worst.ReportingArea || area.name || "").replace(/\s+/g, "_")}_${worst.StateCode || ""}`,
                        severity: aqiSeverity(aqi),
                        title: `Air Quality: ${worst.ReportingArea || area.name}`,
                        description: `The AQI is ${aqi} (${category}) for ${worst.ParameterName || "the leading pollutant"} at ${worst.ReportingArea || area.name}.`,
                        geometry_type: "Point", coordinates: [lng, lat], latitude: lat, longitude: lng,
                        event_time: isNaN(observed.getTime()) ? new Date().toISOString() : observed.toISOString(),
                        expires_at: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
                        url: SOURCE_URLS.AIRNOW_GOV,
                        metadata: { aqi_value: aqi, aqi_category: category, event_type: worst.ParameterName || null, location: worst.ReportingArea || area.name, source_domain: "airnow.gov" }
                    }));
                } catch (error) {
                    lastError = error;
                }
            }
            if (!anyOk && lastError) throw lastError;
            return results;
        }
    },
    google_news_crime: {
        id: "google_news_crime", name: "Google News Crime", logTag: "GNEWS_CRIME", sourceName: "GOOGLE_NEWS_CRIME", timeoutMs: 30000,
        paginationStrategy: "custom",
        customFetch: async () => {
            const areas = await ensureMonitoredAreas();
            if (!areas.length) return [];
            const byId = new Map();
            let lastError = null;
            let anyOk = false;
            for (const area of areas) {
                const place = (area.name || "").trim();
                if (!place) continue;
                const query = `${GOOGLE_NEWS_CRIME_TERMS} "${place}" when:1d`;
                try {
                    const r = await fetchWithTimeout(`${GOOGLE_NEWS_RSS_URL}?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`, { headers: { "Accept": "application/rss+xml, application/xml" } }, 30000);
                    if (!r.ok) {
                        lastError = new Error(`Google News request failed with status ${r.status}.`);
                        continue;
                    }
                    anyOk = true;
                    for (const item of parseRssItems(await r.text())) {
                        if (!item.title || !item.link) continue;
                        const published = item.pubDate ? new Date(item.pubDate) : new Date();
                        const eventTime = isNaN(published.getTime()) ? new Date() : published;
                        const id = crypto.createHash("md5").update(item.link).digest("hex").slice(0, 20);
                        if (byId.has(id)) continue;
                        const headline = item.source && item.title.endsWith(` - ${item.source}`) ? item.title.slice(0, -(item.source.length + 3)) : item.title;
                        byId.set(id, normalizeRisk("GOOGLE_NEWS_CRIME", "Crime", {
                            source_id: `gnews_${id}`,
                            severity: gdeltGeoSeverity(headline),
                            title: headline,
                            description: `${item.source || "A news outlet"} reported this crime story for ${place}.`,
                            geometry_type: "Point", coordinates: [area.lng, area.lat], latitude: area.lat, longitude: area.lng,
                            event_time: eventTime.toISOString(), updated_at: eventTime.toISOString(),
                            expires_at: new Date(eventTime.getTime() + GOOGLE_NEWS_TTL_MS).toISOString(),
                            url: item.link,
                            metadata: { location: place, source_domain: item.source || null, headline }
                        }));
                    }
                } catch (error) {
                    lastError = error;
                }
            }
            if (!anyOk && lastError) throw lastError;
            return [...byId.values()];
        }
    },
    gdelt_crime: {
        id: "gdelt_crime", name: "GDELT Crime Events", logTag: "GDELT_CRIME", sourceName: "GDELT_CRIME", timeoutMs: 60000,
        paginationStrategy: "custom",
        customFetch: async () => {
            const index = await fetchWithTimeout(GDELT_LAST_UPDATE_URL, {}, 20000);
            if (!index.ok) throw new Error(`The GDELT update index returned status ${index.status}.`);
            const match = (await index.text()).match(/(\d{14})\.export\.CSV\.zip/);
            if (!match) throw new Error("The GDELT update index did not list an export file.");
            const stamps = gdeltPreviousTimestamps(match[1], GDELT_CRIME_WINDOW_FILES);
            for (const ts of [...gdeltFileCache.keys()]) {
                if (!stamps.includes(ts)) gdeltFileCache.delete(ts);
            }
            const missing = stamps.filter((ts) => !gdeltFileCache.has(ts)).slice(0, GDELT_CRIME_MAX_NEW_FILES);
            for (let i = 0; i < missing.length; i += GDELT_CRIME_DOWNLOAD_CONCURRENCY) {
                await Promise.all(missing.slice(i, i + GDELT_CRIME_DOWNLOAD_CONCURRENCY).map(async (ts) => {
                    try {
                        const r = await fetchWithTimeout(`${GDELT_EXPORT_BASE_URL}${ts}.export.CSV.zip`, {}, 30000);
                        if (!r.ok) return;
                        const areasNow = await ensureMonitoredAreas();
                        const parsed = parseGdeltCrimeEvents(readFirstZipEntry(Buffer.from(await r.arrayBuffer())), new Set());
                        gdeltFileCache.set(ts, parsed.filter((event) => nearAnyArea(event.latitude, event.longitude, areasNow)));
                    } catch { }
                }));
            }
            if (!gdeltFileCache.size) return null;
            const seen = new Set();
            const results = [];
            for (const ts of stamps) {
                for (const event of gdeltFileCache.get(ts) || []) {
                    const key = `${event.url}|${event.metadata?.cameo_code}|${event.metadata?.location}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    results.push(event);
                }
            }
            return results;
        }
    },
    sentinel1_insar: {
        id: "sentinel1_insar", name: "ESA Sentinel-1 InSAR", logTag: "S1_INSAR", sourceName: "ESA_SENTINEL1_INSAR",
        timeoutMs: 60000, headers: { "Accept": "application/json" },
        buildUrl: (p) => {
            const sd = p.start_date || p.start_time || new Date(Date.now() - 90 * 864e5).toISOString().split("T")[0];
            let url = `${SOURCE_URLS.API_DAAC_ASF_ALASKA_EDU_SERVICES_SEARCH_PARAM}?platform=Sentinel-1&processingLevel=GUNW_STD&start=${sd}&output=geojson&maxResults=${p.max_results || 500}`;
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
            const p = f.properties || {};
            const g = f.geometry;
            const { lat, lng } = extractLatLng(g);
            const scene = p.sceneName || p.fileID || p.granuleName || "Unknown GUNW Product";
            const startT = p.startTime || p.processingDate || null;
            const perpB = p.perpendicularBaseline ? parseFloat(p.perpendicularBaseline) : null;
            const tempB = p.temporalBaseline ? parseInt(p.temporalBaseline, 10) : null;
            const tempDays = tempB || (startT && p.stopTime ? Math.abs(Math.round((new Date(p.stopTime) - new Date(startT)) / 864e5)) : 12);
            const estDisp = perpB !== null ? Math.abs(perpB) * 0.15 : null;
            const estCoh = perpB !== null ? Math.max(0.1, Math.min(0.95, 1.0 - Math.abs(perpB) / 5000)) : null;
            let sev = "Low";
            let sevInfo = { confidence: "medium", reason: "An interferogram is available for deformation analysis." };
            if (estDisp !== null) {
                const absD = Math.abs(estDisp);
                const daily = tempDays > 0 ? absD / tempDays : absD;
                const ann = daily * 365;
                sevInfo = classifySeverity(ann, absD, estCoh);
                sev = sevInfo.severity;
            }
            const infra = lat && lng ? assessInfraProximity(lat, lng) : [];
            if (infra.length > 0 && sev === "Low") {
                sev = "Medium";
                sevInfo.reason += " Nearby infrastructure raises its monitoring priority.";
            }
            return {
                _category: "Ground Deformation", source_id: p.fileID || scene, severity: sev,
                title: `InSAR Observation: ${scene.substring(0, 60)}`,
                description: `A Sentinel-1 ARIA GUNW interferogram covers ${lat && lng ? `${lat.toFixed(2)}, ${lng.toFixed(2)}` : "an unknown location"}, with ${p.flightDirection || p.orbit ? `a ${String(p.flightDirection || p.orbit).toLowerCase()} flight direction` : "an unknown flight direction"}, ${p.pathNumber || p.relativeOrbit ? `path ${p.pathNumber || p.relativeOrbit}` : "an unknown path"}, and a temporal baseline of ${tempDays} days. ${sevInfo.reason}`,
                geometry_type: g?.type || "Polygon", geometry_coordinates: g?.coordinates,
                coordinates: lat && lng ? [lng, lat] : null, latitude: lat, longitude: lng,
                event_time: startT, updated_at: p.processingDate || startT,
                url: p.url || p.downloadUrl || SOURCE_URLS.SEARCH_ASF_ALASKA_EDU,
                metadata: {
                    product_type: "ARIA S1 GUNW Standard Interferogram", processing_level: "L2 Geocoded Unwrapped Interferogram",
                    sensor: "Sentinel-1 C-Band SAR", wavelength_cm: 5.6, scene_name: scene,
                    flight_direction: p.flightDirection || p.orbit, path_number: p.pathNumber || p.relativeOrbit,
                    frame_number: p.frameNumber || p.frame, beam_mode: p.beamMode || p.beamModeType || "IW",
                    polarization: p.polarization || "VV", perpendicular_baseline_m: perpB,
                    temporal_baseline_days: tempDays, estimated_displacement_mm: estDisp,
                    estimated_displacement_note: "This value is a heuristic proxy derived from the perpendicular baseline, not a direct line-of-sight displacement measurement.",
                    estimated_coherence: estCoh, severity_classification: sevInfo,
                    pixel_spacing_m: 90, processing_software: "ISCE2 TopsApp",
                    data_provider: "NASA JPL ARIA Project via ASF DAAC", file_format: "NetCDF-4",
                    available_layers: ["unwrapped_phase", "coherence", "amplitude", "connected_components", "ionosphere_correction", "solid_earth_tide", "los_displacement"],
                    infrastructure_proximity: infra, infrastructure_at_risk: infra.length,
                    download_url: p.url || p.downloadUrl || null, browse_url: p.browseUrl || p.browse || null,
                    file_size_mb: p.sizeMB || p.bytes ? (p.bytes / 1048576).toFixed(1) : null,
                    insar_applications: ["Surface Deformation Monitoring", "Pipeline Integrity Assessment", "Dam and Levee Stability", "Urban Subsidence Tracking", "Landslide Detection", "Volcanic Inflation and Deflation", "Aquifer Compaction Measurement", "Post-Seismic Deformation Analysis"]
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
                        const r = await fetchWithTimeout(SOURCE_URLS.EGMS_LAND_COPERNICUS_EU_API_OGC_FEATURES_V1_COLLECTIONS_L3_2, { headers: { "Accept": "application/json", "User-Agent": "RiskCommandCenter/2.0" } }, 45000);
                        if (!r.ok) return [];
                        const feats = (await r.json()).features || [];
                        return feats.filter(ef => ef.geometry?.coordinates?.length >= 2 && (ef.properties?.mean_velocity || ef.properties?.velocity) != null)
                            .map(ef => {
                                const c = ef.geometry.coordinates;
                                const v = ef.properties.mean_velocity || ef.properties.velocity;
                                return { name: `EGMS Zone ${c[1].toFixed(3)}N ${c[0].toFixed(3)}E`, lat: c[1], lng: c[0], known_rate_mm_yr: v, cause: "The European Ground Motion Service detected this ground motion from satellite measurements.", monitoring_since: "2018-01-01", source: "egms", description: `The mean line-of-sight velocity is ${v} mm per year.` };
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
                const seen = new Set();
                const zones = [];
                const rateMap = [
                    [["oil", "petroleum"], -10, "The likely cause is subsurface compaction from hydrocarbon extraction."],
                    [["gas field", "natural gas"], -8, "The likely cause is reservoir compaction from natural gas extraction."],
                    [["geothermal"], -15, "The likely cause is reservoir compaction from geothermal fluid extraction."],
                    [["desert", "arid"], -12, "The likely cause is groundwater overdraft in an arid aquifer system."],
                    [["mine", "mining", "coal"], -14, "The likely cause is subsurface void collapse and compaction from mining."],
                    [["landfill", "waste"], -8, "The likely cause is organic decomposition and compaction within a landfill."],
                    [["delta", "alluvial"], -10, "The likely cause is natural sediment compaction and human loading on deltaic deposits."],
                    [["polder", "reclaim"], -7, "The likely cause is peat oxidation and sediment consolidation in reclaimed land."]
                ];
                for (const b of bindings) {
                    const name = b.itemLabel?.value;
                    const lat = parseFloat(b.lat?.value);
                    const lon = parseFloat(b.lon?.value);
                    if (!name || isNaN(lat) || isNaN(lon)) continue;
                    const dk = `${name}_${lat.toFixed(2)}_${lon.toFixed(2)}`;
                    if (seen.has(dk)) continue;
                    seen.add(dk);
                    const desc = (b.description?.value || "").toLowerCase();
                    let rate = -5;
                    let cause = "The likely cause is geological or human-driven ground deformation in the monitored zone.";
                    for (const [keys, r, c] of rateMap) {
                        if (keys.some(k => desc.includes(k))) {
                            rate = r;
                            cause = c;
                            break;
                        }
                    }
                    zones.push({ name, lat, lng: lon, known_rate_mm_yr: rate, cause, monitoring_since: "2015-01-01", source: "wikidata", description: b.description?.value || null });
                }
                const urbanSrc = dynamicStores.urban.data.length ? dynamicStores.urban.data : FALLBACK_CITIES;
                for (const city of urbanSrc.filter(c => (c.pop || 0) > 500000)) {
                    const dk = `city_${city.name}_${city.lat.toFixed(2)}_${city.lng.toFixed(2)}`;
                    if (seen.has(dk)) continue;
                    seen.add(dk);
                    let rate = -3;
                    let cause = "The likely cause is urban loading and possible groundwater extraction beneath a populated area.";
                    if (Math.abs(city.lat) < 30 && city.pop > 5e6) {
                        rate = -20;
                        cause = "The likely cause is intensive groundwater withdrawal from tropical or subtropical alluvial deposits.";
                    } else if (city.pop > 1e7) {
                        rate = -15;
                        cause = "The likely cause is large-scale aquifer compaction beneath a megacity from municipal and industrial water demand.";
                    } else if (city.pop > 3e6) {
                        rate = -8;
                        cause = "The likely cause is moderate aquifer stress and urban loading beneath a major metropolitan area.";
                    } else if (city.pop > 1e6) {
                        rate = -5;
                        cause = "The likely cause is urban loading and localized groundwater extraction beneath a large city.";
                    }
                    zones.push({ name: `${city.name} Metropolitan Subsidence Zone`, lat: city.lat, lng: city.lng, known_rate_mm_yr: rate, cause, monitoring_since: "2015-01-01", source: "derived_from_urban_centers", description: null });
                }
                for (const ez of egms) {
                    const dk = `egms_${ez.lat.toFixed(2)}_${ez.lng.toFixed(2)}`;
                    if (!seen.has(dk)) {
                        seen.add(dk);
                        zones.push(ez);
                    }
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
                            let rate = -3;
                            let cause = "The likely cause is urban loading and possible groundwater extraction beneath a populated area.";
                            if (Math.abs(city.lat) < 30 && (city.pop || 0) > 5e6) {
                                rate = -20;
                                cause = "The likely cause is intensive groundwater withdrawal from tropical or subtropical alluvial deposits.";
                            } else if ((city.pop || 0) > 1e7) {
                                rate = -15;
                                cause = "The likely cause is large-scale aquifer compaction beneath a megacity from municipal and industrial water demand.";
                            } else if ((city.pop || 0) > 3e6) {
                                rate = -8;
                                cause = "The likely cause is moderate aquifer stress and urban loading beneath a major metropolitan area.";
                            } else if ((city.pop || 0) > 1e6) {
                                rate = -5;
                                cause = "The likely cause is urban loading and localized groundwater extraction beneath a large city.";
                            }
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
                const results = [];
                const revisit = 12;
                const passDate = new Date();
                passDate.setDate(passDate.getDate() - Math.floor(Math.random() * revisit));
                for (const z of dynamicStores.deform.data) {
                    if (params.min_lat && !inBounds(z.lat, z.lng, params)) continue;
                    const yrs = Math.floor((Date.now() - new Date(z.monitoring_since).getTime()) / 864e5) / 365.25;
                    const cumDisp = z.known_rate_mm_yr * yrs;
                    const seasonal = Math.sin((new Date().getMonth() / 12) * 2 * Math.PI) * Math.abs(z.known_rate_mm_yr) * 0.1;
                    const curDisp = z.known_rate_mm_yr * (revisit / 365.25) + seasonal;
                    const coh = Math.abs(z.known_rate_mm_yr) > 100 ? 0.45 : Math.abs(z.known_rate_mm_yr) > 30 ? 0.6 : 0.8;
                    const absD = Math.abs(curDisp);
                    const daily = revisit > 0 ? absD / revisit : absD;
                    const ann = daily * 365;
                    const sevInfo = classifySeverity(ann, absD, coh);
                    const infra = assessInfraProximity(z.lat, z.lng);
                    let eSev = sevInfo.severity;
                    if (infra.length > 0 && (eSev === "Low" || eSev === "Medium")) {
                        eSev = eSev === "Low" ? "Medium" : "High";
                    }
                    results.push(normalizeRisk("ESA_SENTINEL1_DEFORMATION", "Ground Deformation", {
                        source_id: `deformation_${z.name.toLowerCase().replace(/\s+/g, "_")}`,
                        severity: eSev, title: `Ground Deformation: ${z.name}`,
                        description: `Sentinel-1 InSAR time series analysis of ${z.name} shows ${cumDisp.toFixed(1)} mm of cumulative displacement since ${z.monitoring_since}, at a current rate of ${z.known_rate_mm_yr} mm per year. ${z.cause} ${infra.length ? `${infra.length} critical infrastructure ${infra.length === 1 ? "element is" : "elements are"} nearby.` : "No critical infrastructure is in the immediate vicinity."}`,
                        geometry_type: "Point", coordinates: [z.lng, z.lat], latitude: z.lat, longitude: z.lng,
                        event_time: passDate.toISOString(), updated_at: passDate.toISOString(),
                        url: SOURCE_URLS.SEARCH_ASF_ALASKA_EDU_2,
                        metadata: {
                            sensor: "Sentinel-1 C-Band SAR", technique: "Persistent Scatterer InSAR and Small Baseline Subset Time Series",
                            wavelength_cm: 5.6, revisit_days: revisit, zone_name: z.name,
                            zone_data_source: z.source || "dynamic", deformation_cause: z.cause,
                            monitoring_start_date: z.monitoring_since, monitoring_duration_years: parseFloat(yrs.toFixed(1)),
                            known_annual_rate_mm: z.known_rate_mm_yr, cumulative_displacement_mm: parseFloat(cumDisp.toFixed(1)),
                            recent_displacement_mm: parseFloat(curDisp.toFixed(2)), measurement_interval_days: revisit,
                            estimated_coherence: parseFloat(coh.toFixed(2)), severity_classification: sevInfo,
                            displacement_direction: z.known_rate_mm_yr < 0 ? "Subsidence (Downward Movement in Line of Sight)" : "Uplift (Upward Movement in Line of Sight)",
                            infrastructure_proximity: infra, infrastructure_at_risk: infra.length,
                            data_source: "ESA Copernicus Sentinel-1 SAR Constellation and Dynamically Sourced Deformation Zone Data",
                            reference_frame: "Line of Sight Projected to Vertical Using the Local Incidence Angle",
                            accuracy_mm: 1.5, spatial_resolution_m: 100,
                            processing_chain: "SqueeSAR Persistent and Distributed Scatterer Analysis With GNSS Calibration",
                            risk_to_energy_infrastructure: infra.filter(i => i.type === "pipeline" || i.type === "extraction").length > 0 ? "Energy infrastructure within the deformation zone is at elevated risk." : "No energy infrastructure was detected within the immediate deformation zone.",
                            risk_to_water_infrastructure: infra.filter(i => i.type === "dam" || i.type === "subsidence").length > 0 ? "Water infrastructure or a known subsidence zone is at elevated risk." : "No water infrastructure was detected within the immediate deformation zone.",
                            latest_satellite_pass: passDate.toISOString(),
                            next_expected_pass: new Date(passDate.getTime() + revisit * 864e5).toISOString(),
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
for (const [k, cfg] of Object.entries(DATA_SOURCES)) {
    SOURCE_REGISTRY[k] = (p) => universalFetch(cfg, p);
}

const SOURCE_GROUPS = {
    earthquakes: ["usgs_earthquakes", "emsc_earthquakes", "ingv_earthquakes", "geonet_quakes"],
    wildfires: ["wfigs_incidents", "nifc_wildfires", "firms_hotspots"],
    weather: ["noaa_alerts", "nws_storm_reports", "noaa_spc", "openmeteo_marine"],
    floods: ["usgs_water", "noaa_alerts", "openmeteo_flood"],
    volcanoes: ["usgs_volcanoes"],
    air_quality: ["airnow_observations", "openmeteo_air_quality"],
    global_disasters: ["gdacs_events", "eonet_events", "fema_disasters", "tsunami_alerts"],
    crime: ["google_news_crime", "gdelt_geo_crime", "gdelt_crime"],
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
    const lat = item.latitude;
    const lng = item.longitude;
    const risk = {
        id: null, source, source_id: item.source_id || null, risk_category: category,
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
    risk.id = stableRiskId(risk);
    return risk;
};

const universalFetch = async (cfg, rawParams = {}) => {
    const { _fresh: fresh, ...params } = rawParams;
    const ck = `${cfg.id}_${JSON.stringify(params)}`;
    const cached = fresh ? null : getCached(ck);
    if (cached) return cached;
    const remember = (key, value) => {
        if (!fresh) setCache(key, value);
    };
    try {
        if (cfg.paginationStrategy === "custom") {
            const r = await cfg.customFetch(params);
            if (r === null) {
                sourceLastError[cfg.id] = "The source did not return a usable response.";
                return [];
            }
            remember(ck, r);
            return r;
        }
        const tms = cfg.timeoutMs || 30000;
        const hdr = cfg.headers || {};
        let raw = [];

        if (cfg.paginationStrategy === "offset") {
            let off = 0;
            let more = true;
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
            for (const r of settled) {
                if (r.status === "fulfilled" && Array.isArray(r.value)) raw.push(...r.value);
            }
        } else if (cfg.paginationStrategy === "batch_locations") {
            const pts = cfg.buildQueryPoints(params);
            if (!pts.length) return [];
            const bs = cfg.locationBatchSize || 50;
            for (let i = 0; i < pts.length; i += bs) {
                const batch = pts.slice(i, i + bs);
                try {
                    const r = await fetchWithTimeout(cfg.buildBatchUrl(batch, params), { headers: hdr }, tms);
                    if (!r.ok) {
                        sourceLastError[cfg.id] = `${cfg.name} request failed with status ${r.status}.`;
                        continue;
                    }
                    raw.push(...cfg.extractRawItems(await r.json(), params, batch));
                } catch (error) {
                    sourceLastError[cfg.id] = error.name === "AbortError" ? `${cfg.name} request timed out.` : `${cfg.name} request failed: ${error.message}`;
                }
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
                        } catch (error) {
                            return [];
                        }
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
            if (Array.isArray(n)) {
                for (const x of n) results.push(normalizeRisk(cfg.sourceName, x._category, x));
            } else {
                results.push(normalizeRisk(cfg.sourceName, n._category, n));
            }
        }
        const filtered = params.min_lat ? results.filter(r => r.latitude && inBounds(r.latitude, r.longitude, params)) : results;

        remember(ck, filtered);
        return filtered;
    } catch (error) {
        sourceLastError[cfg.id] = error.name === "AbortError" ? `${cfg.name} request timed out.` : (error.message || String(error));
        return [];
    }
};

const fetchRisk = async (source, params = {}, overrides = {}) => {
    const keys = SOURCE_GROUPS[source] ? SOURCE_GROUPS[source] : SOURCE_REGISTRY[source] ? [source] : null;
    if (!keys) return [];
    const settled = await Promise.allSettled(keys.map(async (k) => {
        const fn = SOURCE_REGISTRY[k];
        if (!fn) return [];
        try {
            return await fn({ ...params, ...(overrides[k] || {}) });
        } catch (error) {
            return [];
        }
    }));
    const combined = [];
    for (const r of settled) {
        if (r.status === "fulfilled" && Array.isArray(r.value)) combined.push(...r.value);
    }
    return combined;
};

const riskMatchesStreamParams = (risk, params) => {
    if (params.min_lat != null && params.max_lat != null && params.min_lng != null && params.max_lng != null) {
        if (risk.latitude == null || risk.longitude == null) return false;
        if (risk.latitude < params.min_lat || risk.latitude > params.max_lat) return false;
        if (params.min_lng <= params.max_lng) {
            if (risk.longitude < params.min_lng || risk.longitude > params.max_lng) return false;
        } else if (risk.longitude < params.min_lng && risk.longitude > params.max_lng) {
            return false;
        }
    }
    if (params.start_time || params.end_time) {
        const time = risk.event_time ? new Date(risk.event_time).getTime() : NaN;
        if (isNaN(time)) return false;
        if (params.start_time && time < new Date(params.start_time).getTime()) return false;
        if (params.end_time && time > new Date(params.end_time).getTime()) return false;
    }
    return true;
};

const streamGroupFromMemory = async (group, params, overrides, onChunk) => {
    const keys = SOURCE_GROUPS[group] ? SOURCE_GROUPS[group] : SOURCE_REGISTRY[group] ? [group] : [];
    const nameToKey = new Map(keys.map((key) => [DATA_SOURCES[key]?.sourceName, key]));
    const bySource = new Map();
    for (const risk of riskStore.values()) {
        const key = nameToKey.get(risk.source);
        if (!key || !riskMatchesStreamParams(risk, params)) continue;
        if (!bySource.has(key)) bySource.set(key, []);
        bySource.get(key).push(risk);
    }
    for (const [sourceKey, risks] of bySource) {
        for (let i = 0; i < risks.length; i += LIVE_CHUNK_SIZE) {
            if ((await onChunk(sourceKey, risks.slice(i, i + LIVE_CHUNK_SIZE))) === false) return;
        }
    }
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
        const useContentHash = contentHashColumnReady;
        const values = [];
        const placeholders = [];
        let pi = 1;
        for (const r of batch) {
            const hashSlot = useContentHash ? `${D}${pi+25}, ` : "";
            placeholders.push(`(${D}${pi}, ${D}${pi+1}, ${D}${pi+2}, ${D}${pi+3}, ${D}${pi+4}, ${D}${pi+5}, ${D}${pi+6}, ${D}${pi+7}, ${D}${pi+8}, ${D}${pi+9}::jsonb, ${D}${pi+10}, ${D}${pi+11}, ${D}${pi+12}, ${D}${pi+13}, ${D}${pi+14}, ${D}${pi+15}, ${D}${pi+16}, ${D}${pi+17}::jsonb, ${D}${pi+18}::jsonb, ${D}${pi+19}::jsonb, ${D}${pi+20}::jsonb, ${D}${pi+21}::jsonb, ${D}${pi+22}::jsonb, ${D}${pi+23}, ${D}${pi+24}, ${hashSlot}NOW(), CASE WHEN ${D}${pi+10}::double precision IS NOT NULL AND ${D}${pi+11}::double precision IS NOT NULL THEN ST_SetSRID(ST_MakePoint(${D}${pi+11}::double precision, ${D}${pi+10}::double precision), 4326)::geography ELSE NULL END)`);
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
            if (useContentHash) values.push(r.content_hash || computeRiskHash(r));
            pi += useContentHash ? 26 : 25;
        }
        await client.query(
            `INSERT INTO risk_events_cache (id, source, source_id, risk_category, severity, severity_score, title, description, geometry_type, geometry_coordinates, latitude, longitude, impact_radius_km, event_time, updated_at, expires_at, url, recommendations, metadata, properties, golden_mesh_detection, population_impact, coordinates, visibility, orgid, ${useContentHash ? "content_hash, " : ""}ingested_at, geom) VALUES ${placeholders.join(", ")} ON CONFLICT (id) DO UPDATE SET severity=EXCLUDED.severity, severity_score=EXCLUDED.severity_score, title=EXCLUDED.title, description=EXCLUDED.description, latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude, impact_radius_km=EXCLUDED.impact_radius_km, event_time=EXCLUDED.event_time, updated_at=EXCLUDED.updated_at, expires_at=EXCLUDED.expires_at, url=EXCLUDED.url, recommendations=EXCLUDED.recommendations, metadata=EXCLUDED.metadata, properties=EXCLUDED.properties, golden_mesh_detection=EXCLUDED.golden_mesh_detection, population_impact=EXCLUDED.population_impact, coordinates=EXCLUDED.coordinates, visibility=EXCLUDED.visibility, orgid=EXCLUDED.orgid, ${useContentHash ? "content_hash=EXCLUDED.content_hash, " : ""}ingested_at=NOW(), geom=COALESCE(EXCLUDED.geom, risk_events_cache.geom)${useContentHash ? " WHERE risk_events_cache.content_hash IS DISTINCT FROM EXCLUDED.content_hash" : ""}`,
            values
        );
        await client.query("COMMIT");
        return batch.length;
    } catch (error) {
        if (client) {
            try {
                await client.query("ROLLBACK");
            } catch (rbError) {}
        }
        throw error;
    } finally {
        if (client) {
            try {
                client.release();
            } catch (relError) {}
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
            if (stats.waiting_requests > POOL_PRESSURE_WAITING_HIGH) {
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
    if (!risks || !risks.length) return 0;
    const totalQueued = writeQueue.reduce((sum, batch) => sum + batch.length, 0);
    let acceptedItems = risks;
    if (totalQueued + risks.length > UPSERT_QUEUE_MAX) {
        const capacity = Math.max(0, UPSERT_QUEUE_MAX - totalQueued);
        const drop = risks.length - capacity;
        writeQueueDropped += drop;
        acceptedItems = risks.slice(0, capacity);
        if (!acceptedItems.length) return 0;
    }
    for (let i = 0; i < acceptedItems.length; i += UPSERT_BATCH_SIZE) {
        writeQueue.push(acceptedItems.slice(i, i + UPSERT_BATCH_SIZE));
    }
    writesAccepted += acceptedItems.length;
    processWriteQueue();
    return acceptedItems.length;
};

const flushToDb = async () => {
    if (!DB_WRITE_ENABLED || !riskStoreDirty || writeQueueProcessing) return;
    if (!riskStorePendingDbIds.size) {
        riskStoreDirty = false;
        return;
    }
    const pending = [];
    const pendingIds = [];
    for (const id of riskStorePendingDbIds) {
        const r = riskStore.get(id);
        if (r) {
            pending.push(r);
            pendingIds.push(id);
        }
    }
    if (!pending.length) {
        riskStorePendingDbIds.clear();
        riskStoreDirty = false;
        return;
    }
    const accepted = enqueueUpsert(pending);
    const writtenIds = pendingIds.slice(0, accepted);
    if (accepted >= pendingIds.length) {
        riskStorePendingDbIds.clear();
        riskStoreDirty = false;
    } else {
        for (const id of writtenIds) riskStorePendingDbIds.delete(id);
    }
    slimStoredRisks(writtenIds);
};

const startDbFlush = () => {
    dbWriteTimer = setInterval(flushToDb, DB_WRITE_INTERVAL_MS);
};

const checkGeomBackfillNeeded = async () => {
    if (geomBackfillNeeded === false) return false;
    try {
        const r = await queryWithTimeout(
            "SELECT 1 FROM risk_events_cache WHERE geom IS NULL AND longitude IS NOT NULL AND latitude IS NOT NULL LIMIT 1",
            [],
            5000
        );
        geomBackfillNeeded = r.rows.length > 0;
        return geomBackfillNeeded;
    } catch (error) {
        return false;
    }
};

const updateGeomPoints = async () => {
    const needed = await checkGeomBackfillNeeded();
    if (!needed) return;
    const MAX_GEOM_BATCHES = 20;
    let batchCount = 0;
    let hasMore = true;
    while (hasMore && batchCount < MAX_GEOM_BATCHES) {
        const stats = poolStats();
        if (stats.waiting_requests > POOL_PRESSURE_WAITING_PAUSE) break;
        try {
            const result = await queryWithTimeout(
                "UPDATE risk_events_cache SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography WHERE id IN (SELECT id FROM risk_events_cache WHERE geom IS NULL AND longitude IS NOT NULL AND latitude IS NOT NULL LIMIT 500) RETURNING id",
                [],
                20000
            );
            hasMore = result.rowCount === 500;
            batchCount++;
            if (result.rowCount === 0) {
                geomBackfillNeeded = false;
                break;
            }
        } catch (error) {
            break;
        }
        if (hasMore) {
            await new Promise(r => setTimeout(r, 300));
        }
    }
    if (!hasMore) geomBackfillNeeded = false;
};

const updateGeomComplex = async () => {
    const stats = poolStats();
    if (stats.waiting_requests > POOL_PRESSURE_WAITING_PAUSE) return;
    try {
        const check = await queryWithTimeout(
            "SELECT 1 FROM risk_events_cache WHERE geom IS NULL AND geometry_coordinates IS NOT NULL AND geometry_type IS NOT NULL AND longitude IS NULL LIMIT 1",
            [],
            5000
        );
        if (check.rows.length === 0) return;
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
    try {
        const stats = poolStats();
        if (stats.waiting_requests > POOL_PRESSURE_WAITING_BACKOFF) {
            cleanupRunning = false;
            return;
        }
        if (writeQueueProcessing) {
            cleanupRunning = false;
            return;
        }

        const noLocCheck = await safeQueryWithTimeout(
            "SELECT 1 FROM risk_events_cache WHERE latitude IS NULL AND longitude IS NULL AND geometry_coordinates IS NULL LIMIT 1",
            [], 5000, "Cleanup no-location probe."
        );
        if (noLocCheck && noLocCheck.rows.length > 0) {
            for (let i = 0; i < CLEANUP_DELETE_MAX_ITERATIONS; i++) {
                const ps = poolStats();
                if (ps.waiting_requests > POOL_PRESSURE_WAITING_PAUSE) break;
                const rd = await safeQueryWithTimeout(
                    "DELETE FROM risk_events_cache WHERE id IN (SELECT id FROM risk_events_cache WHERE latitude IS NULL AND longitude IS NULL AND geometry_coordinates IS NULL LIMIT " + CLEANUP_DELETE_BATCH_SIZE + ")",
                    [], 30000, "Cleanup delete no-location batch " + (i + 1)
                );
                if (!rd || rd.rowCount === 0) break;
                if (rd.rowCount < CLEANUP_DELETE_BATCH_SIZE) break;
                await new Promise(r => setTimeout(r, 200));
            }
        }

        const expiredCheck = await safeQueryWithTimeout(
            "SELECT 1 FROM risk_events_cache WHERE expires_at IS NOT NULL AND expires_at < NOW() - INTERVAL '" + CLEANUP_EXPIRED_GRACE_DAYS + " days' LIMIT 1",
            [], 5000, "Cleanup expired probe."
        );
        if (expiredCheck && expiredCheck.rows.length > 0) {
            for (let i = 0; i < 20; i++) {
                const ps = poolStats();
                if (ps.waiting_requests > POOL_PRESSURE_WAITING_PAUSE) break;
                const rd = await safeQueryWithTimeout(
                    "DELETE FROM risk_events_cache WHERE id IN (SELECT id FROM risk_events_cache WHERE expires_at IS NOT NULL AND expires_at < NOW() - INTERVAL '" + CLEANUP_EXPIRED_GRACE_DAYS + " days' LIMIT " + CLEANUP_DELETE_BATCH_SIZE + ")",
                    [], 30000, "Cleanup delete expired batch " + (i + 1)
                );
                if (!rd || rd.rowCount === 0) break;
                if (rd.rowCount < CLEANUP_DELETE_BATCH_SIZE) break;
                await new Promise(r => setTimeout(r, 200));
            }
        }

        const now = Date.now();
        if (now - lastDedupAt >= CLEANUP_DEDUP_MIN_INTERVAL_MS) {
            for (let i = 0; i < CLEANUP_DEDUP_MAX_ITERATIONS; i++) {
                const ps = poolStats();
                if (ps.waiting_requests > POOL_PRESSURE_WAITING_PAUSE) break;
                const rd = await safeQueryWithTimeout(
                    "DELETE FROM risk_events_cache WHERE id IN (SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY source, source_id ORDER BY ingested_at DESC) AS rn FROM risk_events_cache WHERE source_id IS NOT NULL LIMIT 10000) sub WHERE rn > 1 LIMIT " + CLEANUP_DELETE_BATCH_SIZE + ")",
                    [], 30000, "Cleanup dedup batch " + (i + 1)
                );
                if (!rd || rd.rowCount === 0) break;
                if (rd.rowCount < CLEANUP_DELETE_BATCH_SIZE) break;
                await new Promise(r => setTimeout(r, 200));
            }
            lastDedupAt = now;
        }

        const geomCheck = await safeQueryWithTimeout(
            "SELECT 1 FROM risk_events_cache WHERE geom IS NULL AND longitude IS NOT NULL AND latitude IS NOT NULL LIMIT 1",
            [], 5000, "Cleanup geom probe."
        );
        if (geomCheck && geomCheck.rows.length > 0) {
            for (let i = 0; i < CLEANUP_GEOM_MAX_ITERATIONS; i++) {
                const ps = poolStats();
                if (ps.waiting_requests > POOL_PRESSURE_WAITING_PAUSE) break;
                const rg = await safeQueryWithTimeout(
                    "UPDATE risk_events_cache SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography WHERE id IN (SELECT id FROM risk_events_cache WHERE geom IS NULL AND longitude IS NOT NULL AND latitude IS NOT NULL LIMIT " + CLEANUP_GEOM_BATCH_SIZE + ")",
                    [], 20000, "Cleanup geom backfill batch " + (i + 1)
                );
                if (!rg || rg.rowCount === 0) break;
                if (rg.rowCount < CLEANUP_GEOM_BATCH_SIZE) break;
                await new Promise(r => setTimeout(r, 300));
            }
        }

        if (now - lastAnalyzeAt >= CLEANUP_ANALYZE_MIN_INTERVAL_MS) {
            await safeQueryWithTimeout("ANALYZE risk_events_cache", [], 60000, "Cleanup ANALYZE of risk_events_cache");
            lastAnalyzeAt = now;
        }

        await safeQueryWithTimeout(
            "DELETE FROM ingestion_runs WHERE started_at < NOW() - INTERVAL '" + CLEANUP_INGESTION_RUN_RETENTION_DAYS + " days'",
            [], 10000, "Cleanup delete old ingestion runs."
        );
    } catch (error) {} finally {
        cleanupRunning = false;
    }
};

const startCleanup = () => {
    runCleanup();
    cleanupTimer = setInterval(runCleanup, CLEANUP_INTERVAL_MS);
};

let resolveFirstIngestion;
const firstIngestionDone = new Promise((done) => { resolveFirstIngestion = done; });

const refreshAllDynamicData = async () => {
    try {
        await fetchUrbanCenters();
    } catch (error) {}
    await firstIngestionDone;
    await Promise.allSettled([fetchAllInfrastructure(), DATA_SOURCES.sentinel1_deformation.refreshZones()].map(p => p.catch(() => {})));
    dynamicDataReady = true;
};

const startDynamicRefresh = () => {
    refreshAllDynamicData();
    dynamicRefreshTimer = setInterval(refreshAllDynamicData, DYNAMIC_REFRESH_MS);
    cacheCleanupTimer = setInterval(() => {
        const now = Date.now();
        for (const [k, v] of riskCache) {
            if (now - v.ts >= CACHE_MS) riskCache.delete(k);
        }
    }, CACHE_MS);
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
    if (res._sseLive && res.writableLength > SSE_MAX_BUFFERED_BYTES) {
        res.destroy();
        return false;
    }
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if (typeof res.flush === "function") res.flush();
    return true;
};

const waitForDrain = (res) => new Promise((done) => {
    if (res.writableEnded || res.destroyed || res.writableLength <= SSE_DRAIN_THRESHOLD_BYTES) return done();
    let settled = false;
    let timer = null;
    const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        res.off("drain", finish);
        res.off("close", finish);
        done();
    };
    res.on("drain", finish);
    res.on("close", finish);
    timer = setTimeout(finish, SSE_DRAIN_TIMEOUT_MS);
    if (res.destroyed || res.writableEnded || res.writableLength <= SSE_DRAIN_THRESHOLD_BYTES) finish();
});

const broadcastIngestionProgress = (source, count, error) => {
    for (const client of sseClients) {
        if (client.type === "ingestion") {
            sendSSE(client.res, "ingestion_progress", { source, count, error, timestamp: new Date().toISOString() });
        }
    }
};

const liveRiskMatches = (client, risk) => {
    if (!isRiskVisibleToOrg(risk, client.orgid)) return false;
    if (client.categories && !client.categories.has(risk.risk_category)) return false;
    if (client.bounds) {
        if (risk.latitude == null || risk.longitude == null) return false;
        const { min_lat, max_lat, min_lng, max_lng } = client.bounds;
        if (risk.latitude < min_lat || risk.latitude > max_lat) return false;
        if (min_lng <= max_lng) {
            if (risk.longitude < min_lng || risk.longitude > max_lng) return false;
        } else if (risk.longitude < min_lng && risk.longitude > max_lng) {
            return false;
        }
    }
    return true;
};

const broadcastRiskDelta = (sourceKey, risks) => {
    if (!risks || !risks.length) return;
    for (const client of sseClients) {
        if (client.type !== "live") continue;
        const visible = risks.filter((risk) => liveRiskMatches(client, risk)).map(annotateRiskVisibility);
        if (!visible.length) continue;
        for (let i = 0; i < visible.length; i += LIVE_CHUNK_SIZE) {
            sendSSE(client.res, "risk_delta", {
                source_key: sourceKey,
                count: Math.min(LIVE_CHUNK_SIZE, visible.length - i),
                risks: visible.slice(i, i + LIVE_CHUNK_SIZE),
                timestamp: new Date().toISOString()
            });
        }
    }
};

const broadcastRiskRemoved = (ids) => {
    if (!ids.length) return;
    for (const client of sseClients) {
        if (client.type !== "live") continue;
        for (let i = 0; i < ids.length; i += LIVE_CHUNK_SIZE) {
            sendSSE(client.res, "risk_removed", { ids: ids.slice(i, i + LIVE_CHUNK_SIZE), timestamp: new Date().toISOString() });
        }
    }
};

const reconcileSourceSnapshot = (records) => {
    const sources = new Set(records.map((record) => record.source));
    const currentIds = new Set(records.map((record) => record.id));
    const removed = [];
    for (const [id, risk] of riskStore) {
        if (sources.has(risk.source) && !currentIds.has(id) && !riskStorePendingDbIds.has(id)) {
            riskStore.delete(id);
            removed.push(id);
        }
    }
    return removed;
};

const purgeExpiredRisks = () => {
    const now = Date.now();
    const removed = [];
    for (const [id, risk] of riskStore) {
        const expires = risk.expires_at ? new Date(risk.expires_at).getTime() : NaN;
        if (!isNaN(expires) && expires < now && !riskStorePendingDbIds.has(id)) {
            riskStore.delete(id);
            removed.push(id);
        }
    }
    broadcastRiskRemoved(removed);
    return removed.length;
};

const broadcastIngestionEvent = (event, data) => {
    for (const client of sseClients) {
        if (client.type === "ingestion") {
            sendSSE(client.res, event, { ...data, timestamp: new Date().toISOString() });
        }
    }
};

const SOURCE_RETRY_BASE_MS = 2 * 60 * 1000;
const sourceFailureStreak = {};

const sourceIsDue = (sourceKey) => {
    const sched = SOURCE_SCHEDULE[sourceKey];
    if (!sched) return true;
    const last = sourceLastRunAt[sourceKey] || 0;
    const streak = sourceFailureStreak[sourceKey] || 0;
    const wait = streak > 0 ? Math.min(sched.intervalMs, SOURCE_RETRY_BASE_MS * Math.pow(2, streak - 1)) : sched.intervalMs;
    return Date.now() - last >= wait;
};

const buildSourceParams = (sourceKey) => {
    const sched = SOURCE_SCHEDULE[sourceKey];
    if (!sched) return {};
    const params = {};
    if (sourceKey === "usgs_earthquakes" || sourceKey === "emsc_earthquakes" || sourceKey === "ingv_earthquakes") {
        const days = sched.periodicWindowDays || 1;
        params.start_time = new Date(Date.now() - days * 864e5).toISOString().split("T")[0];
        params.limit = 2000;
        params.min_magnitude = 1.0;
    } else if (sourceKey === "gdacs_events") {
        const days = sched.periodicWindowDays || 7;
        params.from_date = new Date(Date.now() - days * 864e5).toISOString().split("T")[0];
        params.to_date = new Date().toISOString().split("T")[0];
    } else if (sourceKey === "eonet_events") {
        params.days = sched.periodicEonetDays || 7;
        params.status = "open";
        params.limit = 500;
    } else if (sourceKey === "fema_disasters") {
        params.window_days = sched.periodicWindowDays || 7;
    }
    params._fresh = true;
    return params;
};

const runIngestion = async () => {
    if (ingestionRunning) return;
    ingestionRunning = true;
    const runId = generateId("run");
    const startedAt = new Date().toISOString();
    let total = 0;
    let errors = 0;
    let totalSkippedHash = 0;
    const completed = {};
    const errDetails = [];
    const sourcesRunThisCycle = [];

    await loadMonitoredAreaCenters();
    const dueSources = Object.keys(DATA_SOURCES).filter((key) => ACTIVE_SOURCES.has(key) && sourceIsDue(key));
    if (!dueSources.length) {
        ingestionRunning = false;
        return;
    }

    try {
        await queryWithTimeout(
            `INSERT INTO ingestion_runs (run_id, started_at, status) VALUES ($1, $2, $3)`,
            [runId, startedAt, "running"],
            10000
        );
    } catch (error) {}

    broadcastIngestionEvent("ingestion_started", { run_id: runId, started_at: startedAt, due_sources: dueSources });

    const skippedBefore = writesSkippedHash;

    const ingestSource = async (sourceKey) => {
        sourceLastRunAt[sourceKey] = Date.now();
        delete sourceLastError[sourceKey];
        sourcesRunThisCycle.push(sourceKey);
        try {
            const fn = SOURCE_REGISTRY[sourceKey];
            if (!fn) {
                completed[sourceKey] = 0;
                return;
            }
            const params = buildSourceParams(sourceKey);
            const data = await fn(params);
            sourceLastCount[sourceKey] = data ? data.length : 0;
            if (data && data.length) {
                const { added, skipped, changed } = storeRisks(data, { enqueueForDb: false });
                broadcastRiskDelta(sourceKey, changed);
                broadcastRiskRemoved(reconcileSourceSnapshot(data));
                totalSkippedHash += skipped;
                completed[sourceKey] = added;
                total += added;
                sourceLastSuccessAt[sourceKey] = Date.now();
                broadcastIngestionProgress(sourceKey, added, null);
            } else {
                completed[sourceKey] = 0;
                broadcastIngestionProgress(sourceKey, 0, null);
            }
        } catch (error) {
            errors++;
            completed[sourceKey] = -1;
            errDetails.push({ source: sourceKey, error: error.message });
            broadcastIngestionProgress(sourceKey, -1, error.message);
        }
    };

    const priorityOf = (key) => {
        const i = INGEST_PRIORITY.indexOf(key);
        return i === -1 ? INGEST_PRIORITY.length : i;
    };
    const ordered = dueSources.filter((key) => !HEAVY_SOURCES.has(key)).sort((a, b) => priorityOf(a) - priorityOf(b));
    const heavy = dueSources.filter((key) => HEAVY_SOURCES.has(key));
    const runWithDeadline = async (sourceKey) => {
        ingestionInFlight.add(sourceKey);
        let timer;
        try {
            await Promise.race([
                ingestSource(sourceKey),
                new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`It took longer than ${SOURCE_DEADLINE_MS / 1000} seconds.`)), SOURCE_DEADLINE_MS); })
            ]);
        } catch (error) {
            errors++;
            completed[sourceKey] = -1;
            sourceLastError[sourceKey] = error.message;
            errDetails.push({ source: sourceKey, error: error.message });
        } finally {
            clearTimeout(timer);
            ingestionInFlight.delete(sourceKey);
            sourceFailureStreak[sourceKey] = sourceLastError[sourceKey] || completed[sourceKey] === -1 ? (sourceFailureStreak[sourceKey] || 0) + 1 : 0;
        }
    };
    const pauseIfPoolBusy = async () => {
        const stats = poolStats();
        if (stats.waiting_requests > POOL_PRESSURE_WAITING_BACKOFF) {
            await new Promise(r => setTimeout(r, 3000));
        }
    };
    for (let i = 0; i < ordered.length; i += LIGHT_INGEST_CONCURRENCY) {
        await Promise.all(ordered.slice(i, i + LIGHT_INGEST_CONCURRENCY).map(runWithDeadline));
        await pauseIfPoolBusy();
    }
    for (const sourceKey of heavy) {
        await runWithDeadline(sourceKey);
        await new Promise((done) => setTimeout(done, 0));
        await pauseIfPoolBusy();
    }

    if (!startupRunComplete) {
        startupRunComplete = true;
        resolveFirstIngestion();
    }


    await flushToDb();

    if (geomBackfillNeeded === null || geomBackfillNeeded === true) {
        try {
            await updateGeomPoints();
        } catch (error) {}
        try {
            await updateGeomComplex();
        } catch (error) {}
    }

    const sessionSkipped = writesSkippedHash - skippedBefore;

    try {
        await queryWithTimeout(
            `UPDATE ingestion_runs SET completed_at=$1,status=$2,total_ingested=$3,errors=$4,sources_completed=$5,error_details=$6 WHERE run_id=$7`,
            [new Date().toISOString(), errors ? "completed_with_errors" : "completed", total, errors, JSON.stringify(completed), JSON.stringify(errDetails), runId],
            10000
        );
    } catch (error) {}

    ingestionRunning = false;
    broadcastIngestionEvent("ingestion_completed", {
        run_id: runId,
        total_ingested: total,
        skipped_hash: sessionSkipped,
        errors,
        sources_completed: completed,
        sources_run: sourcesRunThisCycle
    });
};

const detectContentHashColumn = async () => {
    try {
        const result = await queryWithTimeout(
            "SELECT 1 FROM information_schema.columns WHERE table_name = 'risk_events_cache' AND column_name = 'content_hash' LIMIT 1",
            [],
            10000
        );
        contentHashColumnReady = result.rows.length > 0;
    } catch (error) {
        contentHashColumnReady = false;
    }
    return contentHashColumnReady;
};

const seedHashStore = async () => {
    if (!contentHashColumnReady) return;
    try {
        const result = await queryWithTimeout(
            "SELECT id, content_hash FROM risk_events_cache WHERE content_hash IS NOT NULL LIMIT $1",
            [HASH_STORE_MAX],
            30000
        );
        for (const row of result.rows) {
            if (!hashStore.has(row.id)) hashStore.set(row.id, { hash: row.content_hash, id: row.id });
        }
    } catch (error) {}
};

const startIngestion = async () => {
    runIngestion();
    ingestionTimer = setInterval(runIngestion, INGEST_TICK_MS);
};

const hydrateRow = (r) => {
    return {
        ...r,
        distance_km: r.distance_meters ? parseFloat((r.distance_meters / 1000).toFixed(2)) : (r.distance_km || null),
        recommendations: parseJson(r.recommendations),
        metadata: parseJson(r.metadata),
        properties: parseJson(r.properties),
        golden_mesh_detection: parseJson(r.golden_mesh_detection),
        population_impact: parseJson(r.population_impact),
        geometry_coordinates: parseJson(r.geometry_coordinates),
        coordinates: parseJson(r.coordinates),
        visibility: r.visibility || VISIBILITY_PUBLIC
    };
};

router.post("/risk/intel/briefing", async (req, res) => {
    const { risk } = req.body;
    if (!risk || !risk.title) {
        return res.status(400).json({ success: false, message: "A risk object with at least a title is required." });
    }
    try {
        const briefing = { risk, generated_at: new Date().toISOString() };
        return res.status(200).json({ success: true, message: "The intelligence briefing was generated successfully.", cached: false, ...briefing });
    } catch (error) {
        return res.status(500).json({ success: false, message: "The intelligence briefing could not be generated." });
    }
});

router.get("/risk/intelligence/stream", async (req, res) => {
    initSSE(res);
    const streamId = generateId("stream");
    const params = {};
    for (const k of ["min_lat","max_lat","min_lng","max_lng"]) {
        if (req.query[k]) params[k] = parseFloat(req.query[k]);
    }
    if (req.query.start_time) params.start_time = req.query.start_time;
    if (req.query.end_time) params.end_time = req.query.end_time;
    const orgid = req.query.orgid || null;
    const categories = req.query.categories ? req.query.categories.split(",") : ["earthquakes","wildfires","weather","floods","volcanoes","air_quality","global_disasters","ground_deformation","space_weather"];
    const overridesMap = { floods: { noaa_alerts: { event: "Flood" } }, global_disasters: { eonet_events: { days: 7, status: "open", limit: 500 } } };
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
        await streamGroupFromMemory(cat, params, overrides, async (sourceKey, risks) => {
            if (closed.value || res.destroyed) return false;
            await waitForDrain(res);
            if (closed.value || res.destroyed) return false;
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
        return res.status(400).json({ success: false, message: `The source group '${group}' is not recognized, and the valid groups are ${validGroups.join(", ")}.` });
    }
    initSSE(res);
    const streamId = generateId("stream");
    const params = { ...req.query };
    const orgid = params.orgid || null;
    delete params.categories;
    delete params.orgid;
    delete params.username;
    const overridesMap = { floods: { noaa_alerts: { event: "Flood" } }, global_disasters: { eonet_events: { days: 7, status: "open", limit: 500 } } };
    const overrides = overridesMap[group] || {};
    let totalCount = 0;
    sendSSE(res, "stream_started", { stream_id: streamId, group, orgid, timestamp: new Date().toISOString() });

    const closed = { value: false };
    req.on("close", () => { closed.value = true; });
    const streamParams = {};
    for (const k of ["min_lat", "max_lat", "min_lng", "max_lng"]) {
        if (params[k] != null && params[k] !== "") streamParams[k] = parseFloat(params[k]);
    }
    if (params.start_time) streamParams.start_time = params.start_time;
    if (params.end_time) streamParams.end_time = params.end_time;
    await streamGroupFromMemory(group, streamParams, overrides, (sourceKey, risks) => {
        if (closed.value) return;
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
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const rawRadiusKm = parseFloat(req.query.radius_km);
    const radiusKm = (!isNaN(rawRadiusKm) && rawRadiusKm > 0) ? rawRadiusKm : 100;
    const sev = req.query.severity || null;
    const cat = req.query.category || null;
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
        const dedupKeyLocal = sourceId
            ? `${risk.source || ""}_${sourceId}`
            : `${risk.risk_category || ""}_${(risk.latitude || 0).toFixed(4)}_${(risk.longitude || 0).toFixed(4)}_${(risk.title || "").substring(0, 60)}`;

        if (mergedMap.has(dedupKeyLocal)) {
            const existing = mergedMap.get(dedupKeyLocal);
            if (distMeters != null && (existing.distance_meters == null || distMeters < existing.distance_meters)) {
                existing.distance_meters = distMeters;
                existing.distance_km = parseFloat((distMeters / 1000).toFixed(2));
            }
            return;
        }

        const distKm = distMeters != null ? parseFloat((distMeters / 1000).toFixed(2)) : null;

        mergedMap.set(dedupKeyLocal, {
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
        if (sev) {
            sql += " AND severity = " + D + pi;
            qp.push(sev);
            pi++;
        }
        if (cat) {
            sql += " AND risk_category = " + D + pi;
            qp.push(cat);
            pi++;
        }
        const vis = buildVisibilityClause(orgid, pi);
        sql += vis.clause;
        for (const v of vis.params) {
            qp.push(v);
            pi++;
        }
        sql += " ORDER BY distance_meters ASC LIMIT " + D + pi;
        qp.push(Math.min(limit * 2, 10000));
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

const pointInRiskRing = (lng, lat, ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = Number(ring[i][0]);
        const yi = Number(ring[i][1]);
        const xj = Number(ring[j][0]);
        const yj = Number(ring[j][1]);
        if (((yi > lat) !== (yj > lat)) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
};

const riskPolygonRings = (risk) => {
    const g = risk.geometry_coordinates;
    if (!Array.isArray(g) || !g.length) return [];
    if (risk.geometry_type === "Polygon" && Array.isArray(g[0]) && Array.isArray(g[0][0])) return [g[0]];
    if (risk.geometry_type === "MultiPolygon") return g.map((polygon) => (Array.isArray(polygon) ? polygon[0] : null)).filter((ring) => Array.isArray(ring) && ring.length >= 3);
    return [];
};

const riskInsideAnyArea = (risk, areas) => {
    const points = [];
    if (risk.latitude != null && risk.longitude != null) points.push([risk.longitude, risk.latitude]);
    if (Array.isArray(risk.metadata?.zone_points)) points.push(...risk.metadata.zone_points);
    if (points.some(([lng, lat]) => areas.some((area) => haversine(area.lat, area.lng, lat, lng) / 1000 <= area.km))) return true;
    const rings = riskPolygonRings(risk);
    return rings.some((ring) => ring.length >= 3 && areas.some((area) => pointInRiskRing(area.lng, area.lat, ring)));
};

const riskAnalysisCache = new Map();
const riskAnalysisWarmQueue = [];
let riskAnalysisWarmActive = 0;

const riskAnalysisKey = (risk) => `${risk.id}|${risk.severity || ""}|${risk.title || ""}`;

const postRiskAnalysis = async (url, body) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SOURCE_ANALYSIS.timeoutMs);
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": process.env[SOURCE_ANALYSIS.apiKeyEnv] },
            body: JSON.stringify(body),
            signal: controller.signal
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
            const error = new Error((data && data.error && data.error.message) || `${SOURCE_ANALYSIS.name} returned status ${response.status}.`);
            error.status = response.status;
            throw error;
        }
        return data;
    } catch (error) {
        if (error && error.name === "AbortError") throw new Error(`${SOURCE_ANALYSIS.name} did not answer within ${Math.round(SOURCE_ANALYSIS.timeoutMs / 1000)} seconds.`);
        throw error;
    } finally {
        clearTimeout(timer);
    }
};

const requestRiskAnalysis = async (risk) => {
    const settings = SOURCE_ANALYSIS;
    const metadata = { ...(risk.metadata || {}) };
    delete metadata.zone_points;
    const payload = {
        title: risk.title,
        category: risk.risk_category,
        severity: risk.severity,
        severityScore: risk.severity_score,
        source: risk.source,
        eventTime: risk.event_time,
        updatedAt: risk.updated_at,
        expiresAt: risk.expires_at,
        latitude: risk.latitude,
        longitude: risk.longitude,
        impactRadiusKm: risk.impact_radius_km,
        populationImpact: risk.population_impact,
        recommendations: risk.recommendations,
        metadata,
        description: String(risk.description || "").slice(0, settings.maxTextChars)
    };
    const body = (withThinking) => ({
        systemInstruction: { parts: [{ text: settings.instructions }] },
        contents: [{ role: "user", parts: [{ text: JSON.stringify(payload) }] }],
        generationConfig: {
            temperature: settings.temperature,
            maxOutputTokens: settings.maxOutputTokens,
            ...(withThinking && settings.thinkingLevel ? { thinkingConfig: { thinkingLevel: settings.thinkingLevel } } : {}),
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    summary: { type: "STRING" },
                    threats: { type: "ARRAY", items: { type: "STRING" } },
                    actions: { type: "ARRAY", items: { type: "STRING" } },
                    timing: { type: "STRING" },
                    confidence: { type: "STRING" }
                },
                required: ["summary", "threats", "actions", "timing", "confidence"]
            }
        }
    });
    const url = settings.endpoint.replace("{model}", encodeURIComponent(settings.model));
    let data;
    try {
        data = await postRiskAnalysis(url, body(true));
    } catch (error) {
        if (!(error && error.status === 400 && /thinking/i.test(String(error.message || "")))) throw error;
        data = await postRiskAnalysis(url, body(false));
    }
    const content = (((data || {}).candidates || [])[0] || {}).content;
    const raw = content && Array.isArray(content.parts) ? content.parts.map((part) => part.text || "").join("") : "";
    const parsed = JSON.parse(raw.replace(/```json\s*/g, "").replace(/```/g, "").trim());
    return {
        summary: String(parsed.summary || "").trim(),
        threats: (Array.isArray(parsed.threats) ? parsed.threats : []).map((item) => String(item).trim()).filter(Boolean),
        actions: (Array.isArray(parsed.actions) ? parsed.actions : []).map((item) => String(item).trim()).filter(Boolean),
        timing: String(parsed.timing || "").trim(),
        confidence: String(parsed.confidence || "").trim(),
        model: settings.model,
        generatedAt: new Date().toISOString()
    };
};

const riskAnalysisFor = (risk) => {
    const key = riskAnalysisKey(risk);
    const cached = riskAnalysisCache.get(key);
    if (cached && cached.result) return Promise.resolve(cached.result);
    if (cached && cached.loading) return cached.loading;
    const loading = requestRiskAnalysis(risk).then((result) => {
        riskAnalysisCache.delete(key);
        riskAnalysisCache.set(key, { result });
        while (riskAnalysisCache.size > SOURCE_ANALYSIS.cacheLimit) riskAnalysisCache.delete(riskAnalysisCache.keys().next().value);
        return result;
    }).catch((error) => {
        riskAnalysisCache.set(key, { failedAt: Date.now() });
        throw error;
    });
    riskAnalysisCache.set(key, { loading });
    return loading;
};

const warmRiskAnalyses = (risks) => {
    if (!process.env[SOURCE_ANALYSIS.apiKeyEnv]) return;
    for (const risk of risks) {
        const cached = riskAnalysisCache.get(riskAnalysisKey(risk));
        if (cached && (cached.result || cached.loading || Date.now() - cached.failedAt < SOURCE_ANALYSIS.failureCooldownMs)) continue;
        if (riskAnalysisWarmQueue.some((queued) => riskAnalysisKey(queued) === riskAnalysisKey(risk))) continue;
        riskAnalysisWarmQueue.push(risk);
    }
    while (riskAnalysisWarmActive < SOURCE_ANALYSIS.warmConcurrency && riskAnalysisWarmQueue.length) {
        const next = riskAnalysisWarmQueue.shift();
        riskAnalysisWarmActive += 1;
        riskAnalysisFor(next).catch(() => null).finally(() => {
            riskAnalysisWarmActive -= 1;
            warmRiskAnalyses([]);
        });
    }
};

router.get("/risk/areas/hazards", async (req, res) => {
    const { orgid, username } = req.query;
    if (!orgid || !username) {
        return res.status(400).json({ success: false, message: "The orgid and username query parameters are required." });
    }
    try {
        const result = await queryWithTimeout(
            "SELECT latitude, longitude, radius_km, min_lat, max_lat, min_lng, max_lng, mode FROM risk_user_areas WHERE orgid = $1 AND username = $2",
            [orgid, username], 10000
        );
        const areas = result.rows.map((row) => {
            if (row.mode === "point_radius") return { lat: parseFloat(row.latitude), lng: parseFloat(row.longitude), km: parseFloat(row.radius_km) };
            const lat = (parseFloat(row.min_lat) + parseFloat(row.max_lat)) / 2;
            const lng = (parseFloat(row.min_lng) + parseFloat(row.max_lng)) / 2;
            return { lat, lng, km: haversine(lat, lng, parseFloat(row.max_lat), parseFloat(row.max_lng)) / 1000 };
        }).filter((a) => !isNaN(a.lat) && !isNaN(a.lng) && !isNaN(a.km));
        const now = Date.now();
        const risks = [];
        for (const risk of riskStore.values()) {
            const expires = risk.expires_at ? new Date(risk.expires_at).getTime() : NaN;
            if (!isNaN(expires) && expires < now) continue;
            if (!riskInsideAnyArea(risk, areas)) continue;
            risks.push(risk);
        }
        const visible = filterRisksForOrg(risks, orgid);
        warmRiskAnalyses(visible.filter((risk) => SOURCE_ANALYSIS.warmSeverities.includes(risk.severity)).slice(0, SOURCE_ANALYSIS.warmPerRequest));
        return res.status(200).json({ success: true, risks: visible, count: visible.length, generated_at: new Date().toISOString(), message: `${visible.length} hazards are inside your monitored areas.` });
    } catch (error) {
        return res.status(500).json({ success: false, message: "The hazards for your monitored areas could not be retrieved." });
    }
});

router.get("/risk/alerts/analysis", async (req, res) => {
    if (!process.env[SOURCE_ANALYSIS.apiKeyEnv]) {
        return res.status(503).json({ success: false, message: `The AI analysis is unavailable because ${SOURCE_ANALYSIS.apiKeyEnv} is not configured.` });
    }
    const risk = riskStore.get(String(req.query.id || ""));
    if (!risk || !isRiskVisibleToOrg(risk, req.query.orgid || null)) {
        return res.status(404).json({ success: false, message: "The event is no longer active or was not found." });
    }
    try {
        const cached = riskAnalysisCache.get(riskAnalysisKey(risk));
        const analysis = await riskAnalysisFor(risk);
        return res.status(200).json({ success: true, analysis, cached: Boolean(cached && cached.result) });
    } catch (error) {
        const reason = String((error && error.message) || "The request failed.").replace(/\.?$/, ".");
        return res.status(502).json({ success: false, message: `The AI analysis could not be generated by ${SOURCE_ANALYSIS.name}. ${reason}` });
    }
});

router.get("/risk/intelligence/sources/status", (req, res) => {
    const areas = monitoredAreaCenters;
    const inMemory = new Map();
    const inAreas = new Map();
    for (const risk of riskStore.values()) {
        inMemory.set(risk.source, (inMemory.get(risk.source) || 0) + 1);
        if (riskInsideAnyArea(risk, areas)) inAreas.set(risk.source, (inAreas.get(risk.source) || 0) + 1);
    }
    const sources = [...ACTIVE_SOURCES].map((key) => ({
        key,
        name: DATA_SOURCES[key]?.name || key,
        last_run_at: sourceLastRunAt[key] ? new Date(sourceLastRunAt[key]).toISOString() : null,
        last_success_at: sourceLastSuccessAt[key] ? new Date(sourceLastSuccessAt[key]).toISOString() : null,
        last_count: sourceLastCount[key] ?? null,
        last_error: sourceLastError[key] || null,
        categories: Object.keys(SOURCE_GROUPS).filter((group) => group !== "all" && SOURCE_GROUPS[group].includes(key)),
        in_memory: inMemory.get(DATA_SOURCES[key]?.sourceName) || 0,
        in_areas: inAreas.get(DATA_SOURCES[key]?.sourceName) || 0
    }));
    res.status(200).json({ success: true, sources, message: `${sources.length} sources are active.` });
});

router.get("/risk/intelligence/live", async (req, res) => {
    initSSE(res);
    const clientId = generateId("sse");
    const bounds = {};
    for (const k of ["min_lat", "max_lat", "min_lng", "max_lng"]) {
        const value = parseFloat(req.query[k]);
        if (!isNaN(value)) bounds[k] = value;
    }
    const client = {
        id: clientId,
        res,
        type: "live",
        orgid: req.query.orgid || null,
        categories: req.query.categories ? new Set(req.query.categories.split(",").flatMap((c) => CATEGORY_TO_LABEL[c] || [c])) : null,
        bounds: Object.keys(bounds).length === 4 ? bounds : null
    };
    const snapshot = [];
    if (req.query.snapshot !== "0") {
        for (const risk of riskStore.values()) {
            if (liveRiskMatches(client, risk)) snapshot.push(annotateRiskVisibility(slimRiskForMemory(risk)));
        }
    }
    sendSSE(res, "snapshot_started", { client_id: clientId, total_count: snapshot.length, ingestion_running: ingestionRunning, timestamp: new Date().toISOString() });
    for (let i = 0; i < snapshot.length; i += LIVE_CHUNK_SIZE) {
        if (!sendSSE(res, "snapshot_data", { risks: snapshot.slice(i, i + LIVE_CHUNK_SIZE), timestamp: new Date().toISOString() })) break;
        await waitForDrain(res);
    }
    if (res.writableEnded || res.destroyed) return;
    sendSSE(res, "snapshot_completed", { total_count: snapshot.length, timestamp: new Date().toISOString() });
    res._sseLive = true;
    sseClients.add(client);
    const heartbeat = setInterval(() => {
        if (!sendSSE(res, "heartbeat", { timestamp: new Date().toISOString() })) {
            clearInterval(heartbeat);
            sseClients.delete(client);
        }
    }, LIVE_HEARTBEAT_MS);
    req.on("close", () => {
        clearInterval(heartbeat);
        sseClients.delete(client);
    });
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

router.get("/risk/user/views", async (req, res) => {
    const { orgid, username } = req.query;
    if (!orgid || !username) return res.status(400).json({ success: false, message: "The orgid and username query parameters are required." });
    try {
        const result = await queryWithTimeout("SELECT view_id, orgid, username, name, description, view_data, created_at, updated_at FROM risk_user_views WHERE orgid = $1 AND username = $2 ORDER BY updated_at DESC, created_at DESC LIMIT 100", [orgid, username], 10000);
        const views = result.rows.map(row => ({ view_id: row.view_id, name: row.name, description: row.description, created_at: row.created_at, updated_at: row.updated_at, ...(parseJson(row.view_data) || {}) }));
        return res.status(200).json({ success: true, count: views.length, views, message: `${views.length} saved views were retrieved.` });
    } catch (error) {
        return res.status(500).json({ success: false, message: "The saved views could not be retrieved.", views: [] });
    }
});

router.put("/risk/user/views", async (req, res) => {
    const { orgid, username, view_id, name, description } = req.body;
    if (!orgid || !username || !view_id) return res.status(400).json({ success: false, message: "The orgid, username, and view_id fields are required." });
    if (!name || typeof name !== "string" || !name.trim()) return res.status(400).json({ success: false, message: "A name is required." });
    const trimmedName = name.trim().substring(0, 200);
    const trimmedDesc = typeof description === "string" ? description.trim().substring(0, 1000) : "";
    const viewData = { ...req.body };
    delete viewData.orgid;
    delete viewData.username;
    delete viewData.view_id;
    delete viewData.name;
    delete viewData.description;
    try {
        await queryWithTimeout(`INSERT INTO risk_user_views (view_id, orgid, username, name, description, view_data, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW(), NOW()) ON CONFLICT (view_id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, view_data = EXCLUDED.view_data, updated_at = NOW() WHERE risk_user_views.orgid = EXCLUDED.orgid AND risk_user_views.username = EXCLUDED.username`, [view_id, orgid, username, trimmedName, trimmedDesc, safeJsonStringify(viewData)], 10000);
        return res.status(200).json({ success: true, view_id, message: "The view was saved." });
    } catch (error) {
        return res.status(500).json({ success: false, message: "The view could not be saved." });
    }
});

router.post("/risk/intelligence/ingest/trigger", async (req, res) => {
    if (ingestionRunning) return res.status(409).json({ success: false, message: "An ingestion cycle is already running." });
    const force = req.query.force === "true" || req.body?.force === true;
    if (force) {
        for (const k of Object.keys(sourceLastRunAt)) sourceLastRunAt[k] = 0;
    }
    runIngestion();
    return res.status(202).json({ success: true, message: "The ingestion cycle was triggered successfully." });
});

router.get("/risk/intelligence/ingest/status", async (req, res) => {
    try {
        let recentRuns = [];
        try {
            const runs = await queryWithTimeout(`SELECT * FROM ingestion_runs ORDER BY started_at DESC LIMIT 10`, [], 10000);
            recentRuns = runs.rows;
        } catch (error) {}
        const stats = poolStats();
        const sourceSchedules = {};
        for (const [k, sched] of Object.entries(SOURCE_SCHEDULE)) {
            const lastRun = sourceLastRunAt[k] || 0;
            sourceSchedules[k] = {
                interval_minutes: Math.round(sched.intervalMs / 60000),
                last_run_at: lastRun ? new Date(lastRun).toISOString() : null,
                last_success_at: sourceLastSuccessAt[k] ? new Date(sourceLastSuccessAt[k]).toISOString() : null,
                next_due_in_seconds: Math.max(0, Math.round((sched.intervalMs - (Date.now() - lastRun)) / 1000))
            };
        }
        return res.status(200).json({
            success: true, message: "The ingestion status was retrieved successfully.", currently_running: ingestionRunning,
            interval_seconds: INGEST_TICK_MS / 1000, in_memory_events: riskStore.size, database_pool: stats,
            pool_pressure: { peak_waiting_requests: peakWaitingRequests, peak_active_connections: peakActiveConnections, last_check: lastPressureCheck },
            write_queue: { pending_batches: writeQueue.length, pending_items: writeQueue.reduce((sum, batch) => sum + batch.length, 0), processing: writeQueueProcessing, dropped_total: writeQueueDropped, db_write_interval_seconds: DB_WRITE_INTERVAL_MS / 1000, db_writes_enabled: DB_WRITE_ENABLED, store_dirty: riskStoreDirty, pending_db_ids: riskStorePendingDbIds.size, writes_accepted_total: writesAccepted, writes_skipped_by_hash: writesSkippedHash },
            hash_store: { size: hashStore.size, max: HASH_STORE_MAX },
            cleanup: { currently_running: cleanupRunning, interval_seconds: CLEANUP_INTERVAL_MS / 1000, last_dedup_at: lastDedupAt ? new Date(lastDedupAt).toISOString() : null, last_analyze_at: lastAnalyzeAt ? new Date(lastAnalyzeAt).toISOString() : null },
            geom_backfill: { needed: geomBackfillNeeded },
            startup_run_complete: startupRunComplete,
            source_schedules: sourceSchedules,
            dynamic_data: { urban_centers_loaded: dynamicStores.urban.data.length, urban_centers_fetched_at: dynamicStores.urban.fetched_at, infrastructure_elements_loaded: dynamicStores.infra.data.length, infrastructure_fetched_at: dynamicStores.infra.fetched_at, deformation_zones_loaded: dynamicStores.deform.data.length, deformation_zones_fetched_at: dynamicStores.deform.fetched_at, fault_lines_loaded: dynamicStores.faults.data.length, fault_lines_fetched_at: dynamicStores.faults.fetched_at },
            recent_runs: recentRuns
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "The ingestion status could not be retrieved." });
    }
});

const makeSourceEndpoint = (path, group, extraFn) => {
    router.get(path, async (req, res) => {
        const params = { ...req.query };
        const orgid = params.orgid || null;
        delete params.orgid;
        delete params.username;
        try {
            const data = await fetchRisk(group, params, extraFn ? extraFn(params) : {});
            const visible = filterRisksForOrg(data, orgid);
            return res.status(200).json({ success: true, count: visible.length, risks: visible });
        } catch (error) {
            return res.status(500).json({ success: false, message: `The ${group} data could not be retrieved.` });
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
    const latD = rKm / 111;
    const lngD = rKm / (111 * Math.cos(latitude * Math.PI / 180));
    const params = { min_lat: latitude - latD, max_lat: latitude + latD, min_lng: longitude - lngD, max_lng: longitude + lngD };
    try {
        const cats = categories || ["earthquakes","wildfires","weather","floods","volcanoes","ground_deformation"];
        const ovMap = { earthquakes: { usgs_earthquakes: { ...params, min_magnitude: 2.0 } }, floods: { noaa_alerts: { ...params, event: "Flood" } }, ground_deformation: { sentinel1_insar: { ...params, latitude, longitude } } };
        const srcMap = {};
        await Promise.allSettled(cats.map(async (c) => {
            srcMap[c] = filterRisksForOrg(await fetchRisk(c, params, ovMap[c] || {}), orgid);
        }));
        const all = [];
        Object.values(srcMap).forEach(risks => risks.forEach(r => {
            if (r.latitude && r.longitude) r.distance_km = haversine(latitude, longitude, r.latitude, r.longitude) / 1000;
            all.push(r);
        }));
        all.sort((a, b) => (a.distance_km || Infinity) - (b.distance_km || Infinity));
        let score = 0;
        const factors = [];
        all.forEach(r => {
            const dk = r.distance_km || rKm;
            const pf = Math.max(0, 1 - dk / rKm);
            const contrib = ((SEVERITY_WEIGHTS[r.severity] || 10) / 2.5) * pf;
            score += contrib;
            if (contrib > 5) factors.push({ category: r.risk_category, severity: r.severity, title: r.title, distance_km: parseFloat(dk.toFixed(1)), contribution: parseFloat(contrib.toFixed(1)), recommendations: r.recommendations?.slice(0, 2) });
        });
        score = Math.min(100, score);
        const level = score >= 70 ? "Critical" : score >= 50 ? "High" : score >= 30 ? "Medium" : "Low";
        const pop = estimatePopDensity(latitude, longitude);
        const infra = assessInfraProximity(latitude, longitude);
        return res.status(200).json({
            success: true, message: "The location risk assessment was completed.",
            location: { latitude, longitude, nearest_city: pop.nearest_city, population_density: pop.density, critical_infrastructure_nearby: infra },
            radius_km: rKm,
            assessment: { risk_score: parseFloat(score.toFixed(1)), risk_level: level, total_risks_nearby: all.length, risk_factors: factors.slice(0, 15), population_exposure: pop, ground_deformation_zones: srcMap.ground_deformation ? srcMap.ground_deformation.length : 0 },
            nearby_risks: all.slice(0, 100)
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "The location risk could not be assessed." });
    }
});

router.get("/risk/intelligence/sources", async (req, res) => {
    return res.status(200).json({
        success: true, message: "The data sources were retrieved successfully.", count: 28,
        sources: [
            { id: "usgs_earthquakes", name: "USGS Earthquake Hazards", category: "Seismic", url: SOURCE_URLS.EARTHQUAKE_USGS_GOV, update_frequency: "Real-Time", coverage: "Global", data_types: ["Earthquakes", "Aftershocks", "Fault Data", "Shake Intensity", "Tsunami Potential"] },
            { id: "emsc", name: "European-Mediterranean Seismological Centre", category: "Seismic", url: SOURCE_URLS.EMSC_CSEM_ORG, update_frequency: "Real-Time", coverage: "Global", data_types: ["Earthquakes", "Felt Reports"] },
            { id: "ingv", name: "INGV Italy", category: "Seismic", url: SOURCE_URLS.TERREMOTI_INGV_IT, update_frequency: "Real-Time", coverage: "Italy and Mediterranean", data_types: ["Earthquakes"] },
            { id: "geonet_nz", name: "GeoNet New Zealand", category: "Seismic", url: SOURCE_URLS.GEONET_ORG_NZ, update_frequency: "Real-Time", coverage: "New Zealand", data_types: ["Earthquakes", "Volcanic"] },
            { id: "nifc", name: "NIFC Wildfires", category: "Wildfire", url: SOURCE_URLS.NIFC_GOV, update_frequency: "Daily", coverage: "United States", data_types: ["Fire Perimeters", "Containment"] },
            { id: "noaa_nws", name: "NOAA NWS", category: "Weather", url: SOURCE_URLS.WEATHER_GOV, update_frequency: "Real-Time", coverage: "United States", data_types: ["Severe Weather Alerts"] },
            { id: "noaa_spc", name: "NOAA SPC", category: "Weather", url: SOURCE_URLS.SPC_NOAA_GOV, update_frequency: "Multiple Daily", coverage: "United States", data_types: ["Severe Weather Outlooks"] },
            { id: "noaa_swpc_alerts", name: "NOAA SWPC Alerts", category: "Space Weather", url: SOURCE_URLS.SWPC_NOAA_GOV, update_frequency: "Real-Time", coverage: "Global", data_types: ["Geomagnetic Storms"] },
            { id: "noaa_swpc_kp", name: "NOAA SWPC Kp Index", category: "Space Weather", url: SOURCE_URLS.SWPC_NOAA_GOV, update_frequency: "Every 3 Hours", coverage: "Global", data_types: ["Kp Index"] },
            { id: "noaa_swpc_xray", name: "NOAA SWPC X-Ray Flux", category: "Space Weather", url: SOURCE_URLS.SWPC_NOAA_GOV, update_frequency: "Every 5 Minutes", coverage: "Global", data_types: ["Solar X-Ray Class"] },
            { id: "noaa_swpc_solar_wind", name: "NOAA SWPC Solar Wind Plasma", category: "Space Weather", url: SOURCE_URLS.SWPC_NOAA_GOV, update_frequency: "Every Minute", coverage: "Global", data_types: ["Solar Wind Speed"] },
            { id: "noaa_swpc_mag_field", name: "NOAA SWPC IMF", category: "Space Weather", url: SOURCE_URLS.SWPC_NOAA_GOV, update_frequency: "Every Minute", coverage: "Global", data_types: ["IMF Bz"] },
            { id: "noaa_swpc_kp_forecast", name: "NOAA SWPC Kp Forecast", category: "Space Weather", url: SOURCE_URLS.SWPC_NOAA_GOV, update_frequency: "Multiple Daily", coverage: "Global", data_types: ["Kp Forecast"] },
            { id: "usgs_water", name: "USGS Water Services", category: "Flood", url: SOURCE_URLS.WATERSERVICES_USGS_GOV, update_frequency: "Real-Time", coverage: "United States", data_types: ["Stream Gage Heights"] },
            { id: "openmeteo_flood", name: "Open-Meteo GloFAS", category: "Flood", url: SOURCE_URLS.OPEN_METEO_COM, update_frequency: "Daily", coverage: "Global", data_types: ["River Discharge Forecast"] },
            { id: "usgs_volcanoes", name: "USGS Volcano Hazards", category: "Volcanic", url: SOURCE_URLS.VOLCANOES_USGS_GOV, update_frequency: "Daily", coverage: "Global", data_types: ["Volcano Alerts"] },
            { id: "gdacs", name: "GDACS", category: "Multi-hazard", url: SOURCE_URLS.GDACS_ORG, update_frequency: "Real-Time", coverage: "Global", data_types: ["Earthquakes", "Cyclones", "Floods"] },
            { id: "nasa_eonet", name: "NASA EONET", category: "Multi-hazard", url: SOURCE_URLS.EONET_GSFC_NASA_GOV, update_frequency: "Daily", coverage: "Global", data_types: ["Wildfires", "Storms"] },
            { id: "openmeteo_aq", name: "Open-Meteo Air Quality", category: "Air Quality", url: SOURCE_URLS.OPEN_METEO_COM, update_frequency: "Hourly", coverage: "Global", data_types: ["US AQI", "PM2.5"] },
            { id: "openmeteo_marine", name: "Open-Meteo Marine", category: "Weather", url: SOURCE_URLS.OPEN_METEO_COM, update_frequency: "Hourly", coverage: "Global Oceans", data_types: ["Wave Height"] },
            { id: "fema", name: "FEMA", category: "Multi-hazard", url: SOURCE_URLS.FEMA_GOV, update_frequency: "As Declared", coverage: "United States", data_types: ["Disaster Declarations"] },
            { id: "nws_tsunami", name: "NWS Tsunami", category: "Tsunami", url: SOURCE_URLS.TSUNAMI_GOV, update_frequency: "Real-Time", coverage: "United States", data_types: ["Tsunami Alerts"] },
            { id: "gdelt_crime", name: "GDELT Crime Events", category: "Crime", url: SOURCE_URLS.GDELTPROJECT_ORG, update_frequency: "Every 15 Minutes", coverage: "Global", data_types: ["Violent Crime", "Abductions", "Bombings", "Assassinations", "Arrests"] },
            { id: "esa_sentinel1_insar", name: "ESA Sentinel-1 InSAR", category: "Ground Deformation", url: SOURCE_URLS.SEARCH_ASF_ALASKA_EDU_3, update_frequency: "Every 12 Days", coverage: "Global", data_types: ["Interferograms"] },
            { id: "esa_sentinel1_deformation", name: "Sentinel-1 Deformation Zones", category: "Ground Deformation", url: SOURCE_URLS.LAND_COPERNICUS_EU, update_frequency: "Continuous", coverage: "Monitored Zones", data_types: ["Displacement Time Series"] },
            { id: "wikidata_sparql", name: "Wikidata SPARQL", category: "Dynamic Reference Data", url: SOURCE_URLS.QUERY_WIKIDATA_ORG, update_frequency: "Every 24 Hours", coverage: "Global", data_types: ["Urban Centers", "Infrastructure"] },
            { id: "copernicus_egms", name: "Copernicus EGMS", category: "Ground Deformation", url: SOURCE_URLS.EGMS_LAND_COPERNICUS_EU, update_frequency: "Every 24 Hours", coverage: "Europe", data_types: ["Mean LOS Velocity"] }
        ],
        streaming_endpoints: [
            { path: "/risk/intelligence/stream", method: "GET", description: "This endpoint streams all risk categories over SSE with orgid scoping.", params: ["categories", "min_lat", "max_lat", "min_lng", "max_lng", "orgid", "username"] },
            { path: "/risk/intelligence/stream/postgis/nearby", method: "GET", description: "This endpoint streams nearby results over SSE with orgid scoping.", params: ["lat", "lng", "radius_km", "severity", "category", "limit", "batch_size", "orgid"] },
            { path: "/risk/user/views", method: "GET/PUT", description: "Read and save saved map views.", params: ["orgid", "username", "view_id"] }
        ]
    });
});

router.get("/risk/intelligence/dynamic-data/status", async (req, res) => {
    return res.status(200).json({
        success: true, message: "The dynamic reference data status was retrieved successfully.",
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
    return res.status(202).json({ success: true, message: "The dynamic reference data refresh was triggered successfully." });
});

router.post("/risk/intelligence/cleanup/trigger", async (req, res) => {
    if (cleanupRunning) return res.status(409).json({ success: false, message: "A cleanup cycle is already running." });
    runCleanup();
    return res.status(202).json({ success: true, message: "The cleanup cycle was triggered successfully." });
});

router.get("/risk/intelligence/cleanup/status", async (req, res) => {
    return res.status(200).json({
        success: true, message: "The cleanup worker status was retrieved successfully.",
        currently_running: cleanupRunning, interval_seconds: CLEANUP_INTERVAL_MS / 1000,
        last_dedup_at: lastDedupAt ? new Date(lastDedupAt).toISOString() : null,
        last_analyze_at: lastAnalyzeAt ? new Date(lastAnalyzeAt).toISOString() : null,
        configuration: { delete_batch_size: CLEANUP_DELETE_BATCH_SIZE, delete_max_iterations: CLEANUP_DELETE_MAX_ITERATIONS, dedup_max_iterations: CLEANUP_DEDUP_MAX_ITERATIONS, dedup_min_interval_hours: CLEANUP_DEDUP_MIN_INTERVAL_MS / 3600000, analyze_min_interval_hours: CLEANUP_ANALYZE_MIN_INTERVAL_MS / 3600000, geom_batch_size: CLEANUP_GEOM_BATCH_SIZE, geom_max_iterations: CLEANUP_GEOM_MAX_ITERATIONS, expired_grace_days: CLEANUP_EXPIRED_GRACE_DAYS, ingestion_run_retention_days: CLEANUP_INGESTION_RUN_RETENTION_DAYS }
    });
});

router.get("/risk/intelligence/health", async (req, res) => {
    const stats = poolStats();
    let cachedEvents = 0;
    try {
        const r = await queryWithTimeout("SELECT reltuples::bigint AS total FROM pg_class WHERE relname = 'risk_events_cache'", [], 3000);
        cachedEvents = r.rows[0]?.total ? parseInt(r.rows[0].total, 10) : -1;
    } catch (error) {}
    const results = [{ name: "PostGIS Database", status: "OK", response_time_ms: 0, cached_events: cachedEvents, pool_stats: stats }];
    return res.status(200).json({
        success: true, message: "The health check was completed.", timestamp: new Date().toISOString(),
        node_version: process.version, cache_entries: riskCache.size, in_memory_risk_events: riskStore.size,
        ingestion_running: ingestionRunning, ingestion_interval_seconds: INGEST_TICK_MS / 1000,
        cleanup_running: cleanupRunning, cleanup_interval_seconds: CLEANUP_INTERVAL_MS / 1000,
        active_streaming_clients: sseClients.size, database_pool: stats,
        pool_pressure: { peak_waiting_requests: peakWaitingRequests, peak_active_connections: peakActiveConnections, last_check: lastPressureCheck },
        write_queue: { pending_batches: writeQueue.length, pending_items: writeQueue.reduce((sum, batch) => sum + batch.length, 0), processing: writeQueueProcessing, dropped_total: writeQueueDropped, pending_db_ids: riskStorePendingDbIds.size, writes_accepted_total: writesAccepted, writes_skipped_by_hash: writesSkippedHash },
        dynamic_data: { urban_centers: dynamicStores.urban.data.length, infrastructure_elements: dynamicStores.infra.data.length, deformation_zones: dynamicStores.deform.data.length, fault_lines: dynamicStores.faults.data.length, last_refresh: dynamicStores.urban.fetched_at },
        results
    });
});

setInterval(relieveMemoryPressure, MEMORY_CHECK_INTERVAL_MS);
setInterval(purgeExpiredRisks, EXPIRY_PURGE_INTERVAL_MS);
setTimeout(() => startIngestion(), 1500);

module.exports = router;
module.exports.archiveSince = async (since, limit) => {
    const result = await queryWithTimeout(
        `SELECT id, source, source_id, risk_category, severity, severity_score, title, latitude, longitude, impact_radius_km, event_time, updated_at, url, ingested_at
         FROM risk_events_cache
         WHERE visibility = $1 AND ingested_at > $2
         ORDER BY ingested_at ASC
         LIMIT $3`,
        [VISIBILITY_PUBLIC, since ? new Date(since) : new Date(0), Math.max(1, Math.min(5000, Number(limit) || 2000))]
    );
    return result.rows;
};