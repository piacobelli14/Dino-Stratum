import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBolt, faCircle, faCloud, faEarthAmericas, faExclamationCircle, faFire, faGauge, faGlobe, faHandcuffs,
  faHouseTsunami, faHurricane, faIndustry, faLayerGroup, faLink, faMountain, faRadiation,
  faRightToBracket, faRoad, faSatellite, faShieldHalved, faSmog, faSnowflake, faTemperatureHigh,
  faTornado, faUserPlus, faVolcano, faWater, faWind
} from "@fortawesome/free-solid-svg-icons";
import Nav from "../helpers/Nav.jsx";
import useAuth from "../UseAuth.jsx";
import "../styles/mainStyles/Sat/Trackers/WeatherTracker/WeatherTracker.css";
import "../styles/mainStyles/Landing.css";
import "../styles/helperStyles/LoadingSpinner.css";

const SOURCES = {
  apiBase: import.meta.env.VITE_API_BASE_URL,
  endpoints: {
    summary: "/landing/summary"
  },
  routes: {
    register: "/register",
    login: "/login",
    tracker: "/risk-command-center"
  },
  view: {
    center: [-96, 38],
    globeZoom: 0.95,
    flatZoom: 2.6,
    minZoomGlobe: 0
  },
  layout: {
    copyFraction: 0.4,
    copyMaxPx: 600,
    overlayAbovePx: 1000
  },
  all: {
    label: "All Risks",
    description: "Every marker is a live hazard reported right now, from earthquakes and wildfires to floods and severe weather. The full command center adds monitored areas, alerts and intelligence briefs."
  },
  categoryDescription: "Every marker is a live hazard in this category reported right now. The full command center adds monitored areas, alerts and intelligence briefs.",
  stats: [["Active", "total"], ["Critical", "critical"], ["High", "high"], ["Medium", "medium"]]
};

const RISK_SOURCES = {
  apiBase: import.meta.env.VITE_API_BASE_URL,
  endpoints: {
    live: "/risk/intelligence/live"
  },
  assets: {
    maplibreCss: "https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css",
    maplibreScript: "https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js",
    deckScript: "https://unpkg.com/deck.gl@9.3.6/dist.min.js",
    deckMapboxScript: "https://unpkg.com/@deck.gl/mapbox@9.3.6/dist.min.js",
    satelliteTiles: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    labelTiles: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf"
  },
  refresh: {
    expirySweepMs: 60 * 1000
  },
  live: {
    flushMs: 400,
    snapshotWaitMs: 20000
  },
  map: {
    minZoom: 1,
    deckMaxZoom: 7,
    badgeZoom: 4,
    labelZoom: 6,
    maxRisksDrawn: 15000
  }
};

const EMPTY_FEED = { counts: {}, summary: null, total: null, updatedAt: null, loaded: false, connected: false };

const formatCount = (value) => (value === null || value === undefined || Number.isNaN(Number(value)) ? "—" : Number(value).toLocaleString());

const { RiskDemo, RISK_INTELLIGENCE_CATEGORIES } = (() => {
  const SOURCES = RISK_SOURCES;

  const apiUrl = (key) => `${SOURCES.apiBase}${SOURCES.endpoints[key]}`;

  const CHART_FONT = "Inter, Arial, sans-serif";

  const SEVERITY_FILTER_FLOOR = { all: 0, medium: 2, high: 3, critical: 4 };

  const VISIBILITY_PUBLIC = "public";

  const VISIBILITY_ORG_PRIVATE = "org-private";

  const SEVERITY_COLORS = { Critical: "#ff6b6b", High: "#FF9500", Medium: "#ffd93d", Low: "#4ecdc4" };

  const SEVERITY_ORDER = { Critical: 4, High: 3, Medium: 2, Low: 1 };

  const RISK_CATEGORIES = {
    Seismic: { color: "#FF6B6B", icon: faMountain, code: "EQ" },
    Flood: { color: "#4ECDC4", icon: faWater, code: "FL" },
    Wildfire: { color: "#FF9500", icon: faFire, code: "WF" },
    Subsidence: { color: "#ffd93d", icon: faCircle, code: "SB" },
    Hurricane: { color: "#AB47BC", icon: faHurricane, code: "HU" },
    Industrial: { color: "#42A5F5", icon: faIndustry, code: "IN" },
    Infrastructure: { color: "#66BB6A", icon: faRoad, code: "IF" },
    "Supply Chain": { color: "#00D4FF", icon: faLink, code: "SC" },
    Weather: { color: "#5C6BC0", icon: faCloud, code: "WX" },
    Volcanic: { color: "#E53935", icon: faVolcano, code: "VO" },
    "Air Quality": { color: "#78909C", icon: faSmog, code: "AQ" },
    Tornado: { color: "#7E57C2", icon: faTornado, code: "TO" },
    Tsunami: { color: "#00897B", icon: faHouseTsunami, code: "TS" },
    Drought: { color: "#FFA726", icon: faTemperatureHigh, code: "DR" },
    Ice: { color: "#81D4FA", icon: faSnowflake, code: "IC" },
    Landslide: { color: "#8D6E63", icon: faMountain, code: "LS" },
    Space: { color: "#9C27B0", icon: faSatellite, code: "SP" },
    "Ground Deformation": { color: "#B388FF", icon: faLayerGroup, code: "GD" },
    Crime: { color: "#EC407A", icon: faHandcuffs, code: "CR" },
    Lightning: { color: "#ffd93d", icon: faBolt, code: "LT" },
    Wind: { color: "#7fe9e1", icon: faWind, code: "WD" },
    Radiation: { color: "#ffd93d", icon: faRadiation, code: "RA" },
    Other: { color: "#9E9E9E", icon: faEarthAmericas, code: "OT" }
  };

  const RISK_INTELLIGENCE_CATEGORIES = [
    { id: "earthquakes", name: "Earthquakes", icon: faMountain, color: "#FF6B6B" },
    { id: "wildfires", name: "Wildfires", icon: faFire, color: "#FF9500" },
    { id: "weather", name: "Weather Alerts", icon: faCloud, color: "#5C6BC0" },
    { id: "floods", name: "Floods", icon: faWater, color: "#4ECDC4" },
    { id: "volcanoes", name: "Volcanoes", icon: faVolcano, color: "#E53935" },
    { id: "air_quality", name: "Air Quality", icon: faSmog, color: "#78909C" },
    { id: "ground_deformation", name: "Ground Deformation", icon: faLayerGroup, color: "#B388FF" },
    { id: "global_disasters", name: "Global Disasters", icon: faEarthAmericas, color: "#AB47BC" },
    { id: "crime", name: "Crime", icon: faHandcuffs, color: "#EC407A" }
  ];

  const DEFAULT_RISK_LAYERS = {
    earthquakes: true,
    wildfires: true,
    weather: true,
    floods: true,
    volcanoes: true,
    air_quality: true,
    ground_deformation: true,
    global_disasters: true,
    crime: true
  };

  const EMPTY_RISK_DATA = {
    earthquakes: [],
    wildfires: [],
    weather: [],
    floods: [],
    volcanoes: [],
    air_quality: [],
    ground_deformation: [],
    global_disasters: [],
    crime: []
  };

  const riskCategoryMeta = (category) => RISK_CATEGORIES[category] || RISK_CATEGORIES.Other;

  const riskRings = (risk) => {
    const g = risk.geometry_coordinates;
    if (!Array.isArray(g) || !g.length) return [];
    if (risk.geometry_type === "Polygon" && Array.isArray(g[0]) && Array.isArray(g[0][0])) return g[0].length >= 3 ? [g[0]] : [];
    if (risk.geometry_type === "MultiPolygon") return g.map((polygon) => (Array.isArray(polygon) ? polygon[0] : null)).filter((ring) => Array.isArray(ring) && ring.length >= 3);
    return [];
  };

  const isRiskEventExpired = (risk) => {
    if (!risk || !risk.expires_at) return false;
    const expires = new Date(risk.expires_at).getTime();
    return Number.isFinite(expires) && expires < Date.now();
  };

  const getRiskVisibility = (risk) => {
    if (!risk) return VISIBILITY_PUBLIC;
    if (risk.visibility) return risk.visibility;
    if (risk.is_private || risk.org_private) return VISIBILITY_ORG_PRIVATE;
    if (risk.orgid && risk.source && risk.source.startsWith("ORG_")) return VISIBILITY_ORG_PRIVATE;
    return VISIBILITY_PUBLIC;
  };

  const riskPassesSeverity = (risk, filter) => (SEVERITY_ORDER[risk.severity] || 1) >= (SEVERITY_FILTER_FLOOR[filter] || 0);

  const riskSeverityColor = (risk) => SEVERITY_COLORS[risk.severity] || SEVERITY_COLORS.Medium;

  const categorizeRisk = (risk) => {
    const categoryMap = { seismic: "earthquakes", wildfire: "wildfires", flood: "floods", volcanic: "volcanoes", "air quality": "air_quality", "ground deformation": "ground_deformation", crime: "crime" };
    const category = String(risk.risk_category || "").toLowerCase();
    return categoryMap[category] || (["weather", "tornado", "hurricane", "space"].includes(category) ? "weather" : "global_disasters");
  };

  const summarizeRisks = (list) => {
    const summary = { total: list.length, critical: 0, high: 0, medium: 0, low: 0 };
    for (const risk of list) {
      const key = String(risk.severity || "Low").toLowerCase();
      if (summary[key] !== undefined) summary[key] += 1;
    }
    return summary;
  };

  const hexToRgb = (hex) => {
    const value = String(hex || "").replace("#", "");
    if (value.length !== 6) return [192, 192, 192];
    return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
  };

  const colorHex = (color) => `#${color.slice(0, 3).map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`;

  const liftColor = (hex) => {
    const color = hexToRgb(hex);
    return Math.max(...color) >= 180 ? colorHex(color) : colorHex(color.map((value) => value + (255 - value) * 0.45));
  };

  const ICON_SCALE = 3;

  const ICON_GLASS = "#0b0c0f";

  const iconCache = new Map();

  const makeIcon = (key, size, body) => {
    if (iconCache.has(key)) return iconCache.get(key);
    const pixels = size * ICON_SCALE;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pixels}" height="${pixels}" viewBox="0 0 ${size} ${size}"><defs><filter id="g" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.1"/></filter></defs>${body}</svg>`;
    const icon = { id: key, url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, width: pixels, height: pixels, anchorX: pixels / 2, anchorY: pixels / 2 };
    iconCache.set(key, icon);
    return icon;
  };

  const glassShape = (shape, stroke, tint, width) => `<g filter="url(#g)" opacity="0.85">${shape.replace("/>", ` fill="#000" stroke="#000" stroke-width="${width + 2}" stroke-linejoin="round"/>`)}</g>${shape.replace("/>", ` fill="${ICON_GLASS}" fill-opacity="0.78"/>`)}${shape.replace("/>", ` fill="${stroke}" fill-opacity="${tint}" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round"/>`)}`;

  const iconLetter = (letter, size, color, fontSize) => `<text x="${size / 2}" y="${size / 2}" dy="0.36em" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize || (size * 0.42).toFixed(1)}" font-weight="700" fill="${color}">${letter}</text>`;

  const riskStrong = (risk) => risk.severity === "Critical";

  const riskBadgeNear = (risk, zoom) => zoom >= SOURCES.map.badgeZoom || (SEVERITY_ORDER[risk.severity] || 0) >= 3;

  const riskIcon = (risk, near) => {
    const stroke = liftColor(riskSeverityColor(risk));
    const strong = riskStrong(risk);
    if (!near) {
      const size = 10;
      const c = size / 2;
      return makeIcon(`risk-dot-${stroke}`, size, glassShape(`<circle cx="${c}" cy="${c}" r="${c - 2.25}"/>`, stroke, 0.35, 1.5));
    }
    const code = riskCategoryMeta(risk.risk_category).code;
    const size = 28;
    return makeIcon(`risk-${code}-${stroke}-${strong ? 1 : 0}`, size, `${glassShape(`<circle cx="14" cy="14" r="10.5"/>`, stroke, strong ? 0.3 : 0.16, strong ? 2 : 1.5)}${iconLetter(code, size, stroke, "8")}`);
  };

  const riskIconSize = (risk, near) => (near ? (riskStrong(risk) ? 30 : 26) : 10);

  const validLngLat = (lng, lat) => typeof lng === "number" && typeof lat === "number" && Number.isFinite(lng) && Number.isFinite(lat) && lat >= -90 && lat <= 90 && lng >= -540 && lng <= 540;

  const normalizeRiskCoords = (risk) => {
    const lat = risk.latitude == null || risk.latitude === "" ? NaN : Number(risk.latitude);
    const lng = risk.longitude == null || risk.longitude === "" ? NaN : Number(risk.longitude);
    if (validLngLat(lng, lat)) {
      risk.latitude = lat;
      risk.longitude = lng;
    } else {
      risk.latitude = null;
      risk.longitude = null;
    }
    return risk;
  };

  const declutter = (map, items, getLngLat, getPriority, getBox) => {
    if (!map || items.length < 2) return items;
    const width = map.getCanvas().clientWidth;
    const height = map.getCanvas().clientHeight;
    const cellSize = 64;
    const cells = new Map();
    const kept = new Set();
    const ranked = items.map((item, index) => ({ item, index, priority: getPriority(item) })).sort((a, b) => b.priority - a.priority || a.index - b.index);
    for (const { item } of ranked) {
      const lngLat = getLngLat(item);
      if (!lngLat || !validLngLat(Number(lngLat[0]), Number(lngLat[1]))) continue;
      const point = map.project(lngLat);
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
      if (point.x < -cellSize || point.y < -cellSize || point.x > width + cellSize || point.y > height + cellSize) {
        kept.add(item);
        continue;
      }
      const [dx0, dy0, dx1, dy1] = getBox(item);
      const box = [point.x + dx0, point.y + dy0, point.x + dx1, point.y + dy1];
      const keys = [];
      for (let cx = Math.floor(box[0] / cellSize); cx <= Math.floor(box[2] / cellSize); cx += 1) {
        for (let cy = Math.floor(box[1] / cellSize); cy <= Math.floor(box[3] / cellSize); cy += 1) keys.push(`${cx}:${cy}`);
      }
      const hit = keys.some((key) => (cells.get(key) || []).some((other) => box[0] < other[2] && box[2] > other[0] && box[1] < other[3] && box[3] > other[1]));
      if (hit) continue;
      keys.forEach((key) => {
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(box);
      });
      kept.add(item);
    }
    return items.filter((item) => kept.has(item));
  };

  const labelBox = (text, offsetX) => [offsetX - 2, -8, offsetX + String(text || "").length * 6.2 + 8, 8];

  const normalizeLon = (lon) => ((((lon + 180) % 360) + 360) % 360) - 180;

  const inBounds = (bounds, lon, lat) => {
    if (!bounds) return true;
    if (lat < bounds.south || lat > bounds.north) return false;
    if (bounds.east - bounds.west >= 360) return true;
    const west = normalizeLon(bounds.west);
    const east = normalizeLon(bounds.east);
    const value = normalizeLon(lon);
    return west <= east ? value >= west && value <= east : value >= west || value <= east;
  };

  const formatNumber = (value, unit = "", digits = 0) => (value === null || value === undefined || value === "" || isNaN(value) ? "—" : `${Number(value).toLocaleString(undefined, { maximumFractionDigits: digits })}${unit}`);

  const errorText = (error) => String(error && error.message ? error.message : error).replace(/\.$/, "");

  const parseFeedDate = (value) => {
    if (!value) return null;
    if (typeof value !== "string") {
      const d = new Date(value);
      return isNaN(d.getTime()) ? null : d;
    }
    let normalized = value;
    if (!normalized.includes("T") && /^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}/.test(normalized)) normalized = `${normalized.replace(" ", "T")}Z`;
    const d = new Date(normalized);
    return isNaN(d.getTime()) ? null : d;
  };

  const formatAbsoluteTime = (iso) => {
    if (!iso) return "—";
    const d = parseFeedDate(iso);
    if (!d) return iso;
    return d.toLocaleString();
  };

  const ISOLATED_GLOBALS = new Set(["deck", "luma", "loaders", "probe", "maplibregl"]);

  const createIsolatedGlobal = (store) => new Proxy(window, {
    get: (target, key) => {
      if (Object.prototype.hasOwnProperty.call(store, key)) return store[key];
      if (ISOLATED_GLOBALS.has(key)) return undefined;
      const value = Reflect.get(target, key);
      return typeof value === "function" && typeof key === "string" && /^[a-z]/.test(key) ? value.bind(target) : value;
    },
    set: (target, key, value) => {
      store[key] = value;
      return true;
    }
  });

  const evaluateModule = async (url, isolatedGlobal) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`The script ${url} returned status ${response.status}.`);
    const code = await response.text();
    const module = { exports: {} };
    if (isolatedGlobal) new Function("module", "exports", "globalThis", "window", "self", code)(module, module.exports, isolatedGlobal, isolatedGlobal, isolatedGlobal);
    else new Function("module", "exports", code)(module, module.exports);
    return module.exports;
  };

  const loadCSS = (href, id) => {
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  };

  let mapLibrariesPromise = null;

  const loadMapDeps = () => {
    if (mapLibrariesPromise) return mapLibrariesPromise;
    mapLibrariesPromise = (async () => {
      loadCSS(SOURCES.assets.maplibreCss, "flight-maplibre-css");
      const store = {};
      const isolated = createIsolatedGlobal(store);
      const [maplibregl, deck] = await Promise.all([evaluateModule(SOURCES.assets.maplibreScript, null), evaluateModule(SOURCES.assets.deckScript, isolated)]);
      store.deck = deck;
      const mapbox = await evaluateModule(SOURCES.assets.deckMapboxScript, isolated);
      const MapboxOverlay = mapbox.MapboxOverlay || (store.deck && store.deck.MapboxOverlay);
      if (!maplibregl || !maplibregl.Map) throw new Error("MapLibre GL did not load.");
      if (!deck || !deck.IconLayer || !MapboxOverlay) throw new Error("Deck.gl did not load.");
      return { maplibregl, deck: { ...deck, MapboxOverlay } };
    })().catch((error) => {
      mapLibrariesPromise = null;
      throw error;
    });
    return mapLibrariesPromise;
  };

  const flattenRiskData = (data) => {
    const seen = new Set();
    const list = [];
    for (const bucket of Object.values(data)) {
      for (const risk of bucket || []) {
        const key = risk.id || `${risk.source}|${risk.source_id}|${risk.title}`;
        if (seen.has(key)) continue;
        seen.add(key);
        list.push(risk);
      }
    }
    return list;
  };

  const facingViewer = (center, lat, lon) => {
    const toRad = Math.PI / 180;
    return Math.sin(center.lat * toRad) * Math.sin(lat * toRad) + Math.cos(center.lat * toRad) * Math.cos(lat * toRad) * Math.cos((lon - center.lon) * toRad) > 0.02;
  };

  const RiskDemo = ({ category, inset, onFeed, globeMode, view }) => {
    const mapContainerRef = useRef(null);
    const deckglMapRef = useRef(null);
    const deckOverlayRef = useRef(null);
    const libsRef = useRef(null);
    const streamingDataRef = useRef({ ...EMPTY_RISK_DATA });
    const streamFlushTimerRef = useRef(null);
    const [riskIntelligenceData, setRiskIntelligenceData] = useState(EMPTY_RISK_DATA);
    const [riskIntelligenceLastUpdated, setRiskIntelligenceLastUpdated] = useState(null);
    const [snapshotLoaded, setSnapshotLoaded] = useState(false);
    const [liveConnected, setLiveConnected] = useState(false);
    const [mapReady, setMapReady] = useState(false);
    const [mapError, setMapError] = useState(null);
    const [viewState, setViewState] = useState({ lat: view.center[1], lon: view.center[0], zoom: globeMode ? view.globeZoom : view.flatZoom, bounds: null });
    const [globeCenter, setGlobeCenter] = useState(null);
    const [hoverInfo, setHoverInfo] = useState(null);
    const selectedRisk = null;
    const severityFilter = "high";

    const riskLayersVisible = useMemo(() => (category ? Object.fromEntries(Object.keys(DEFAULT_RISK_LAYERS).map((key) => [key, key === category])) : DEFAULT_RISK_LAYERS), [category]);

    const flushStreamingData = useCallback(() => {
      clearTimeout(streamFlushTimerRef.current);
      streamFlushTimerRef.current = null;
      const ref = streamingDataRef.current;
      const next = {};
      Object.keys(EMPTY_RISK_DATA).forEach((key) => { next[key] = [...(ref[key] || [])]; });
      setRiskIntelligenceData(next);
      setRiskIntelligenceLastUpdated(new Date());
    }, []);

    const removeRisksFromStreamingData = useCallback((shouldRemove) => {
      const ref = streamingDataRef.current;
      let removedAny = false;
      Object.keys(ref).forEach((key) => {
        const kept = (ref[key] || []).filter((risk) => !shouldRemove(risk));
        if (kept.length !== (ref[key] || []).length) removedAny = true;
        ref[key] = kept;
      });
      if (removedAny) flushStreamingData();
    }, [flushStreamingData]);

    const applyLiveDelta = useCallback((risks) => {
      const ref = streamingDataRef.current;
      if (!risks.length) return;
      const positions = new Map();
      Object.keys(ref).forEach((key) => (ref[key] || []).forEach((item, index) => positions.set(item.id, [key, index])));
      for (const risk of risks) {
        if (isRiskEventExpired(risk)) continue;
        if (!risk.visibility) risk.visibility = getRiskVisibility(risk);
        normalizeRiskCoords(risk);
        const bucket = categorizeRisk(risk);
        if (!ref[bucket]) continue;
        const position = positions.get(risk.id);
        if (position) ref[position[0]][position[1]] = { ...ref[position[0]][position[1]], ...risk };
        else {
          ref[bucket].push({ ...risk, _live: true, _ingested_at: new Date().toISOString() });
          positions.set(risk.id, [bucket, ref[bucket].length - 1]);
        }
      }
      if (!streamFlushTimerRef.current) streamFlushTimerRef.current = setTimeout(flushStreamingData, SOURCES.live.flushMs);
    }, [flushStreamingData]);

    useEffect(() => {
      const params = new URLSearchParams({ snapshot: "1" });
      const liveSource = new EventSource(`${apiUrl("live")}?${params.toString()}`);
      const snapshotTimer = setTimeout(() => setSnapshotLoaded(true), SOURCES.live.snapshotWaitMs);
      liveSource.onopen = () => setLiveConnected(true);
      liveSource.onerror = () => setLiveConnected(false);
      liveSource.addEventListener("snapshot_data", (event) => {
        try {
          applyLiveDelta(JSON.parse(event.data).risks || []);
        } catch (error) {
          return;
        }
      });
      liveSource.addEventListener("snapshot_completed", () => {
        flushStreamingData();
        setSnapshotLoaded(true);
      });
      liveSource.addEventListener("risk_delta", (event) => {
        try {
          applyLiveDelta(JSON.parse(event.data).risks || []);
        } catch (error) {
          return;
        }
      });
      liveSource.addEventListener("risk_removed", (event) => {
        try {
          const ids = new Set(JSON.parse(event.data).ids || []);
          if (ids.size) removeRisksFromStreamingData((risk) => ids.has(risk.id));
        } catch (error) {
          return;
        }
      });
      const expirySweep = setInterval(() => removeRisksFromStreamingData(isRiskEventExpired), SOURCES.refresh.expirySweepMs);
      return () => {
        clearTimeout(snapshotTimer);
        clearInterval(expirySweep);
        clearTimeout(streamFlushTimerRef.current);
        streamFlushTimerRef.current = null;
        liveSource.close();
        setLiveConnected(false);
      };
    }, [applyLiveDelta, flushStreamingData, removeRisksFromStreamingData]);

    const allRisks = useMemo(() => flattenRiskData(riskIntelligenceData), [riskIntelligenceData]);

    const severityRisks = useMemo(() => allRisks.filter((risk) => riskPassesSeverity(risk, severityFilter)), [allRisks, severityFilter]);

    const mapRisks = useMemo(() => severityRisks.filter((risk) => riskLayersVisible[categorizeRisk(risk)] && (risk.latitude != null || riskRings(risk).length)), [severityRisks, riskLayersVisible]);

    useEffect(() => {
      onFeed({
        counts: Object.fromEntries(Object.keys(EMPTY_RISK_DATA).map((key) => [key, (riskIntelligenceData[key] || []).length])),
        summary: summarizeRisks(category ? riskIntelligenceData[category] || [] : allRisks),
        total: allRisks.length,
        updatedAt: riskIntelligenceLastUpdated,
        loaded: snapshotLoaded,
        connected: liveConnected
      });
    }, [onFeed, riskIntelligenceData, allRisks, category, riskIntelligenceLastUpdated, snapshotLoaded, liveConnected]);

    const updateViewFromDeck = useCallback(() => {
      const map = deckglMapRef.current;
      if (!map || !map.getContainer().clientWidth) return;
      const center = map.getCenter();
      const bounds = map.getBounds();
      setViewState({ lat: center.lat, lon: center.lng, zoom: map.getZoom(), bounds: { west: bounds.getWest(), east: bounds.getEast(), south: bounds.getSouth(), north: bounds.getNorth() } });
    }, []);

    useEffect(() => {
      if (!mapContainerRef.current) return undefined;
      let cancelled = false;
      let observer = null;
      const host = mapContainerRef.current;
      const claimWheel = (event) => { event.preventDefault(); };
      host.addEventListener("wheel", claimWheel, { passive: false, capture: true });
      const div = document.createElement("div");
      Object.assign(div.style, { width: "100%", height: "100%", position: "absolute", top: "0", left: "0" });
      host.appendChild(div);
      loadMapDeps().then((libs) => {
        libsRef.current = libs;
        if (cancelled) return;
        const { maplibregl } = libs;
        const map = new maplibregl.Map({
          container: div,
          style: {
            version: 8,
            sources: {
              "satellite-tiles": { type: "raster", tiles: [SOURCES.assets.satelliteTiles], tileSize: 256, maxzoom: 19, attribution: "Tiles Esri" },
              "labels-tiles": { type: "raster", tiles: [SOURCES.assets.labelTiles], tileSize: 256, maxzoom: 19 }
            },
            layers: [
              { id: "satellite-layer", type: "raster", source: "satellite-tiles" },
              { id: "labels-layer", type: "raster", source: "labels-tiles", paint: { "raster-opacity": 0.9 } }
            ],
            glyphs: SOURCES.assets.glyphs
          },
          center: view.center,
          zoom: globeMode ? view.globeZoom : view.flatZoom,
          pitch: 0,
          bearing: 0,
          maxZoom: SOURCES.map.deckMaxZoom,
          minZoom: globeMode ? view.minZoomGlobe : SOURCES.map.minZoom,
          antialias: true
        });
        map.addControl(new maplibregl.NavigationControl(), "top-right");
        map.addControl(new maplibregl.ScaleControl(), "bottom-left");
        map.on("moveend", updateViewFromDeck);
        deckglMapRef.current = map;
        if (typeof ResizeObserver !== "undefined") {
          observer = new ResizeObserver(() => {
            if (deckglMapRef.current) deckglMapRef.current.resize();
          });
          observer.observe(host);
        }
        const onReady = () => {
          if (cancelled) return;
          const overlay = new libs.deck.MapboxOverlay({ interleaved: true, layers: [] });
          map.addControl(overlay);
          deckOverlayRef.current = overlay;
          updateViewFromDeck();
          setMapReady(true);
        };
        if (map.loaded()) onReady();
        else map.on("load", onReady);
      }).catch((error) => {
        if (!cancelled) setMapError(`The map could not be started because of the error "${errorText(error)}".`);
      });
      return () => {
        cancelled = true;
        if (observer) observer.disconnect();
        host.removeEventListener("wheel", claimWheel, { capture: true });
        deckOverlayRef.current = null;
        if (deckglMapRef.current) {
          try {
            deckglMapRef.current.remove();
          } catch (error) {
            deckglMapRef.current = null;
          }
        }
        deckglMapRef.current = null;
        if (div.parentNode === host) host.removeChild(div);
        setMapReady(false);
      };
    }, [updateViewFromDeck]);

    useEffect(() => {
      const map = deckglMapRef.current;
      if (!mapReady || !map) return;
      map.setPadding({ left: inset, right: 0, top: 0, bottom: 0 });
    }, [mapReady, inset]);

    useEffect(() => {
      const map = deckglMapRef.current;
      if (!mapReady || !map) return undefined;
      try {
        map.setMinZoom(globeMode ? view.minZoomGlobe : SOURCES.map.minZoom);
        map.stop();
        map.jumpTo({ center: view.center, zoom: globeMode ? view.globeZoom : view.flatZoom });
        if (typeof map.setProjection === "function") map.setProjection({ type: globeMode ? "globe" : "mercator" });
      } catch (error) {
        setMapError(`The globe view could not be switched because of the error "${errorText(error)}".`);
      }
      return undefined;
    }, [mapReady, globeMode, view]);

    useEffect(() => {
      const map = deckglMapRef.current;
      if (!mapReady || !map || !globeMode) {
        setGlobeCenter(null);
        return undefined;
      }
      let frame = null;
      const update = () => {
        frame = null;
        const center = map.getCenter();
        setGlobeCenter({ lat: center.lat, lon: center.lng });
      };
      const schedule = () => {
        if (!frame) frame = requestAnimationFrame(update);
      };
      map.on("move", schedule);
      return () => {
        map.off("move", schedule);
        if (frame) cancelAnimationFrame(frame);
      };
    }, [mapReady, globeMode]);

    const hoveredRiskId = hoverInfo && hoverInfo.object ? hoverInfo.object.id : null;
    const hoveredRisk = useMemo(() => (hoveredRiskId ? mapRisks.find((risk) => risk.id === hoveredRiskId) || null : null), [hoveredRiskId, mapRisks]);

    useEffect(() => {
      const overlay = deckOverlayRef.current;
      const dk = libsRef.current && libsRef.current.deck;
      if (!mapReady || !overlay || !dk) return;
      const zoom = viewState.zoom;
      const layers = [];
      const globe = globeMode;
      const faceCenter = globeCenter || viewState;
      const shared = globe ? { parameters: { depthCompare: "always", cullMode: "none" } } : {};
      try {
        {
          const focus = [selectedRisk, hoveredRisk].filter((risk, index, list) => risk && list.findIndex((other) => other && other.id === risk.id) === index);
          const focusPolygons = [];
          focus.forEach((risk) => riskRings(risk).forEach((ring) => focusPolygons.push({ risk, polygon: ring })));
          if (focusPolygons.length) {
            layers.push(new dk.PolygonLayer({
              ...shared,
              id: "risk-focus-area",
              data: focusPolygons,
              getPolygon: (d) => d.polygon,
              filled: true,
              stroked: false,
              getFillColor: (d) => [...hexToRgb(riskSeverityColor(d.risk)), selectedRisk && d.risk.id === selectedRisk.id ? 70 : 45],
              updateTriggers: { getFillColor: [selectedRisk && selectedRisk.id, hoveredRisk && hoveredRisk.id] }
            }));
          }
          const focusImpact = focus.filter((risk) => risk.latitude != null && risk.longitude != null && risk.impact_radius_km > 0);
          if (focusImpact.length) {
            layers.push(new dk.ScatterplotLayer({
              ...shared,
              id: "risk-focus-impact",
              data: focusImpact,
              getPosition: (d) => [d.longitude, d.latitude],
              getRadius: (d) => d.impact_radius_km * 1000,
              radiusUnits: "meters",
              stroked: false,
              filled: true,
              getFillColor: (d) => [...hexToRgb(riskSeverityColor(d)), selectedRisk && d.id === selectedRisk.id ? 46 : 30],
              updateTriggers: { getFillColor: [selectedRisk && selectedRisk.id, hoveredRisk && hoveredRisk.id] }
            }));
          }
          const pointRisks = mapRisks.filter((risk) => risk.latitude != null && risk.longitude != null && (!globe || facingViewer(faceCenter, risk.latitude, risk.longitude))).sort((a, b) => (SEVERITY_ORDER[b.severity] || 0) - (SEVERITY_ORDER[a.severity] || 0)).slice(0, SOURCES.map.maxRisksDrawn);
          const ordered = pointRisks.slice().reverse();
          if (selectedRisk && selectedRisk.latitude != null && ordered.some((risk) => risk.id === selectedRisk.id)) {
            layers.push(new dk.ScatterplotLayer({
              ...shared,
              id: "risk-selected",
              data: [selectedRisk],
              getPosition: (d) => [d.longitude, d.latitude],
              getRadius: (d) => riskIconSize(d, riskBadgeNear(d, zoom)) / 2 + 4,
              radiusUnits: "pixels",
              stroked: true,
              filled: true,
              getFillColor: [235, 240, 248, 30],
              getLineColor: [235, 240, 248, 170],
              lineWidthUnits: "pixels",
              getLineWidth: 1.5
            }));
          }
          layers.push(new dk.IconLayer({
            ...shared,
            id: "risk-events",
            data: ordered,
            getPosition: (d) => [d.longitude, d.latitude],
            getIcon: (d) => riskIcon(d, riskBadgeNear(d, zoom)),
            getSize: (d) => riskIconSize(d, riskBadgeNear(d, zoom)),
            sizeUnits: "pixels",
            pickable: true,
            autoHighlight: true,
            highlightColor: [235, 240, 248, 70],
            onHover: (info) => setHoverInfo(info.object ? { x: info.x, y: info.y, object: info.object } : null),
            updateTriggers: { getIcon: zoom >= SOURCES.map.badgeZoom, getSize: zoom >= SOURCES.map.badgeZoom }
          }));
          if (zoom >= SOURCES.map.labelZoom && dk.TextLayer) {
            layers.push(new dk.TextLayer({
              ...shared,
              id: "risk-event-labels",
              data: declutter(deckglMapRef.current, ordered.filter((risk) => inBounds(viewState.bounds, risk.longitude, risk.latitude)), (d) => [d.longitude, d.latitude], (d) => (SEVERITY_ORDER[d.severity] || 0) * 1000, (d) => labelBox(String(d.title || "").length > 42 ? `${String(d.title).slice(0, 41)}…` : String(d.title || ""), 18)),
              getPosition: (d) => [d.longitude, d.latitude],
              getText: (d) => (String(d.title || "").length > 42 ? `${String(d.title).slice(0, 41)}…` : String(d.title || "")),
              getSize: 10,
              getColor: (d) => [...hexToRgb(liftColor(riskSeverityColor(d))), 255],
              getTextAnchor: "start",
              getAlignmentBaseline: "center",
              getPixelOffset: [18, 0],
              fontFamily: CHART_FONT,
              fontWeight: 800,
              background: true,
              getBackgroundColor: [8, 9, 12, 210],
              backgroundPadding: [3, 1]
            }));
          }
        }
        overlay.setProps({ layers });
      } catch (error) {
        setMapError(`The map layers could not be drawn because of the error "${errorText(error)}".`);
      }
    }, [mapReady, viewState, mapRisks, hoveredRisk, globeMode, globeCenter]);

    const renderHoverTooltip = () => {
      if (!hoverInfo || !hoverInfo.object) return null;
      const risk = hoverInfo.object;
      const lines = [
        risk.title,
        [risk.severity, risk.risk_category, risk.source].filter(Boolean).join(" | "),
        risk.event_time ? formatAbsoluteTime(risk.event_time) : null,
        risk.impact_radius_km ? `Impact Radius ${formatNumber(risk.impact_radius_km, " Km", 1)}` : null
      ];
      return (
        <div className="satWeatherTooltip" style={{ left: hoverInfo.x + 14, top: hoverInfo.y + 14 }}>
          {lines.filter(Boolean).map((line, index) => <div key={index} className={index === 0 ? "satWeatherTooltipTitle" : "satWeatherTooltipLine"}>{line}</div>)}
        </div>
      );
    };

    return (
      <div className="satWeatherMapWrapper">
        <div ref={mapContainerRef} className="satWeatherMapContainer" onMouseLeave={() => setHoverInfo(null)} />
        {renderHoverTooltip()}
        {(mapError || !snapshotLoaded) && (
          <div className="landingViewerOverlay" style={{ paddingLeft: inset }}>
            {mapError ? <div className="landingErrorBox"><FontAwesomeIcon icon={faExclamationCircle} /><span>{mapError}</span></div> : <div className="loading-circle" />}
          </div>
        )}
      </div>
    );
  };

  return { RiskDemo, RISK_INTELLIGENCE_CATEGORIES };
})();

const Landing = () => {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [active, setActive] = useState(null);
  const [feed, setFeed] = useState(EMPTY_FEED);
  const [inset, setInset] = useState(0);
  const [globe, setGlobe] = useState(false);

  const activeCategory = RISK_INTELLIGENCE_CATEGORIES.find((entry) => entry.id === active) || null;

  useEffect(() => {
    const measure = () => setInset(window.innerWidth >= SOURCES.layout.overlayAbovePx ? Math.round(Math.min(SOURCES.layout.copyMaxPx, window.innerWidth * SOURCES.layout.copyFraction)) : 0);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const [summary, setSummary] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`${SOURCES.apiBase}${SOURCES.endpoints.summary}`);
        const body = await response.json().catch(() => null);
        if (!cancelled && response.ok && body && body.success) setSummary(body);
      } catch (error) {
        return;
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const onFeed = useCallback((next) => setFeed(next), []);

  const counts = feed.loaded ? feed.counts : summary ? summary.counts : null;
  const total = feed.loaded ? feed.total : summary ? summary.total : null;
  const stats = feed.loaded ? feed.summary : summary && !active ? summary.summary : null;

  const updatedLabel = feed.updatedAt ? feed.updatedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }) : "—";

  const openPrimary = () => navigate(token ? SOURCES.routes.tracker : SOURCES.routes.register);

  return (
    <div className="landingPage">
      <Nav activePage="landing" />

      <div className="landingScene">
        <div className="landingViewer">
          <RiskDemo category={active} inset={inset} onFeed={onFeed} globeMode={globe} view={SOURCES.view} />
        </div>

        <div className="landingCopy" style={inset ? { width: inset } : undefined}>
          <h1 className="landingHeadline">Global Risk <span className="landingHeadlineAccent">Tracked Live</span></h1>
          <p className="landingLead">{activeCategory ? SOURCES.categoryDescription : SOURCES.all.description}</p>
          <div className="landingActions">
            <button className="landingButton landingButtonSolid" onClick={openPrimary}>
              <FontAwesomeIcon icon={token ? faGauge : faUserPlus} /> <span>{token ? "Open Command Center" : "Create An Account"}</span>
            </button>
            {!token && (
              <button className="landingButton landingButtonGhost" onClick={() => navigate(SOURCES.routes.login)}>
                <FontAwesomeIcon icon={faRightToBracket} /> <span>Sign In</span>
              </button>
            )}
            <button className={`landingButton landingButtonGhost ${globe ? "landingButtonOn" : ""}`} onClick={() => setGlobe((value) => !value)} title={globe ? "Switch To Flat Map" : "Switch To Globe"}>
              <FontAwesomeIcon icon={faGlobe} /> <span>Globe</span>
            </button>
          </div>
          <div className="landingStats">
            {SOURCES.stats.map(([label, key]) => (
              <div key={key} className="landingStat">
                <span className="landingStatValue">{formatCount(stats ? stats[key] : null)}</span>
                <span className="landingStatLabel">{label}</span>
              </div>
            ))}
          </div>
          <span className="landingUpdated">{feed.connected ? `Live Data Updated ${updatedLabel}` : "Connecting To The Live Feed"}</span>
        </div>

        <div className="landingDock">
          <button className={`landingDockTab ${active === null ? "landingDockTabActive" : ""}`} onClick={() => setActive(null)}>
            <FontAwesomeIcon icon={faShieldHalved} />
            <span className="landingDockLabel">{SOURCES.all.label}</span>
            <span className="landingDockCount">{formatCount(total)}</span>
          </button>
          {RISK_INTELLIGENCE_CATEGORIES.map((entry) => (
            <button key={entry.id} className={`landingDockTab ${active === entry.id ? "landingDockTabActive" : ""}`} onClick={() => setActive(entry.id)}>
              <FontAwesomeIcon icon={entry.icon} />
              <span className="landingDockLabel">{entry.name}</span>
              <span className="landingDockCount">{formatCount(counts ? counts[entry.id] : null)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Landing;