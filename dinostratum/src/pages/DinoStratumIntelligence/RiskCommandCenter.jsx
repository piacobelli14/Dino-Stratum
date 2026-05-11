import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMountain, faWater, faFire, faCircle, faHurricane, faIndustry, faRoad, faLink,
  faTriangleExclamation, faLocationCrosshairs, faObjectGroup, faGlobe, faChevronDown,
  faChevronUp, faTimes, faPlus, faEdit, faTrash, faRefresh, faDownload, faChartBar,
  faList, faMap, faFilter, faSave, faUndo, faHistory, faExclamationCircle, faCheckCircle,
  faSpinner, faLayerGroup, faCloud, faSmog, faEarthAmericas, faVolcano, faHouseTsunami,
  faTemperatureHigh, faSnowflake, faSatellite, faExternalLinkAlt, faLungs, faPeopleGroup,
  faTornado, faPersonShelter, faKitMedical, faEye, faEyeSlash, faCrosshairs,
  faShieldHalved, faDatabase, faRuler, faCubes, faCodeCompare, faClipboardCheck,
  faCircleCheck, faBullseye, faUpload, faHeartPulse, faGears,
  faServer, faCircleInfo, faBroom, faMapPin, faDrawPolygon,
  faBookmark, faStar,
  faFire as faHeat, faBolt, faLock, faUnlock
} from "@fortawesome/free-solid-svg-icons";
import Nav from "../../helpers/Nav.jsx";
import "../../styles/mainStyles/Intelligence/RiskCommandCenter.css";
import IntelBar from "./IntelBar";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const MAP_PROVIDER_APPLE = "apple";
const MAP_PROVIDER_DECKGL = "deckgl";
const APPLE_MAPS_ZOOM_THRESHOLD = 6;

const RISK_EVENT_TTL_MS = 24 * 60 * 60 * 1000;

const VISIBILITY_PUBLIC = "public";
const VISIBILITY_ORG_PRIVATE = "org-private";

const ASSET_LAYER_MODE_ALL = "all";
const ASSET_LAYER_MODE_OWNED = "owned";
const ASSET_LAYER_MODE_HIDDEN = "hidden";

const HEATMAP_RADIUS_PIXELS = 60;
const HEATMAP_INTENSITY = 1;
const HEATMAP_THRESHOLD = 0.03;

const SAVED_VIEWS_STORAGE_KEY = "riskSavedViews";
const SAVED_VIEWS_MAX = 50;
const USER_AREA_STORAGE_KEY = "riskUserArea";
const AREA_FILTER_ACTIVE_STORAGE_KEY = "riskAreaFilterActive";

const PRIORITY_OPTIONS = ["Critical", "High", "Medium", "Low"];

const SEVERITY_COLORS = {
  Critical: "#FF1744",
  High: "#FF9100",
  Medium: "#FFEA00",
  Low: "#00E676"
};

const SEVERITY_WEIGHTS_LOCAL = {
  Critical: 100,
  High: 75,
  Medium: 40,
  Low: 15
};

const RISK_CATEGORIES = {
  Seismic: { color: "#FF6B6B", icon: faMountain },
  Flood: { color: "#4ECDC4", icon: faWater },
  Wildfire: { color: "#FF9500", icon: faFire },
  Subsidence: { color: "#FFE66D", icon: faCircle },
  Hurricane: { color: "#AB47BC", icon: faHurricane },
  Industrial: { color: "#42A5F5", icon: faIndustry },
  Infrastructure: { color: "#66BB6A", icon: faRoad },
  "Supply Chain": { color: "#00D4FF", icon: faLink },
  Weather: { color: "#5C6BC0", icon: faCloud },
  Volcanic: { color: "#E53935", icon: faVolcano },
  "Air Quality": { color: "#78909C", icon: faSmog },
  Tornado: { color: "#7E57C2", icon: faTornado },
  Tsunami: { color: "#00897B", icon: faHouseTsunami },
  Drought: { color: "#FFA726", icon: faTemperatureHigh },
  Ice: { color: "#81D4FA", icon: faSnowflake },
  Landslide: { color: "#8D6E63", icon: faMountain },
  Space: { color: "#9C27B0", icon: faSatellite },
  "Ground Deformation": { color: "#B388FF", icon: faLayerGroup },
  Other: { color: "#9E9E9E", icon: faEarthAmericas }
};

const RISK_INTELLIGENCE_CATEGORIES = [
  { id: "earthquakes", name: "Earthquakes", icon: faMountain, color: "#FF6B6B" },
  { id: "wildfires", name: "Wildfires", icon: faFire, color: "#FF9500" },
  { id: "weather", name: "Weather Alerts", icon: faCloud, color: "#5C6BC0" },
  { id: "floods", name: "Floods", icon: faWater, color: "#4ECDC4" },
  { id: "volcanoes", name: "Volcanoes", icon: faVolcano, color: "#E53935" },
  { id: "air_quality", name: "Air Quality", icon: faSmog, color: "#78909C" },
  { id: "ground_deformation", name: "Ground Deformation", icon: faLayerGroup, color: "#B388FF" },
  { id: "global_disasters", name: "Global Disasters", icon: faEarthAmericas, color: "#AB47BC" }
];

const RISK_ICON_MAP = {
  seismic: faMountain,
  wildfire: faFire,
  flood: faWater,
  weather: faCloud,
  tornado: faCloud,
  hurricane: faHurricane,
  volcanic: faVolcano,
  "air quality": faSmog,
  tsunami: faHouseTsunami,
  space: faSatellite,
  drought: faTemperatureHigh,
  "ground deformation": faLayerGroup
};

const EMPTY_RISK_DATA = {
  earthquakes: [],
  wildfires: [],
  weather: [],
  floods: [],
  volcanoes: [],
  air_quality: [],
  ground_deformation: [],
  global_disasters: []
};

const ASSET_TYPES = {
  Pipeline: { color: "#FF5722", priority: "Critical" },
  Port: { color: "#2196F3", priority: "High" },
  Factory: { color: "#9C27B0", priority: "High" },
  Warehouse: { color: "#4CAF50", priority: "Medium" },
  "Power Plant": { color: "#F44336", priority: "Critical" },
  "Data Center": { color: "#00BCD4", priority: "Critical" },
  Refinery: { color: "#FF9800", priority: "Critical" },
  Mine: { color: "#795548", priority: "High" },
  Office: { color: "#607D8B", priority: "Medium" },
  Retail: { color: "#E91E63", priority: "Low" },
  Residential: { color: "#8BC34A", priority: "Low" },
  Agricultural: { color: "#CDDC39", priority: "Medium" },
  "Transportation Hub": { color: "#3F51B5", priority: "High" },
  Telecommunications: { color: "#009688", priority: "Critical" },
  "Water Treatment": { color: "#00ACC1", priority: "High" },
  Other: { color: "#9E9E9E", priority: "Low" }
};

const INITIAL_NEARBY_FORM = {
  latitude: "",
  longitude: "",
  radius_km: "100",
  category: "",
  severity: "",
  source: "",
  limit: "50"
};

const INITIAL_AREA_FORM = {
  mode: "point_radius",
  name: "",
  address: "",
  latitude: "",
  longitude: "",
  radius_km: "100",
  min_lat: "",
  max_lat: "",
  min_lng: "",
  max_lng: ""
};

const INITIAL_SAVE_VIEW_FORM = {
  name: "",
  description: "",
  include_filters: true,
  include_layers: true
};

const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass.private.coffee/api/interpreter"
];

const OVERPASS_CACHE = new Map();
const OVERPASS_PENDING = new Map();
const OVERPASS_CACHE_MAX_ENTRIES = 200;
const OVERPASS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const ASSET_PIN_ICON_CACHE = new Map();

let overpassMirrorOffset = 0;

function makeAssetPinIcon(fillColor, borderColor) {
  const key = fillColor + "|" + borderColor;
  if (ASSET_PIN_ICON_CACHE.has(key)) return ASSET_PIN_ICON_CACHE.get(key);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 80">'
    + '<defs><filter id="s" x="-30%" y="-30%" width="160%" height="160%">'
    + '<feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-opacity="0.55"/>'
    + '</filter></defs>'
    + '<path d="M32 4 C18 4 8 14 8 28 C8 46 32 76 32 76 C32 76 56 46 56 28 C56 14 46 4 32 4 Z" '
    + 'fill="' + fillColor + '" stroke="' + borderColor + '" stroke-width="3" filter="url(#s)"/>'
    + '<circle cx="32" cy="26" r="6" fill="rgba(0,0,0,0.6)"/>'
    + '</svg>';
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  ASSET_PIN_ICON_CACHE.set(key, url);
  return url;
}

function buildAssetPinHTML(fillColor, borderColor, animated, label) {
  const pulseHtml = animated
    ? '<div style="position:absolute;width:44px;height:44px;border-radius:50%;background:' + borderColor + ';opacity:0;z-index:1;top:-8px;left:50%;transform:translateX(-50%);animation:markerPulse 2s infinite;pointer-events:none;"></div>'
    : '';
  const labelHtml = label
    ? '<div style="position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:4px;padding:2px 8px;background:rgba(0,0,0,0.88);border:1px solid rgba(0,255,255,0.25);border-radius:3px;font-size:10px;font-weight:700;color:#fff;white-space:nowrap;max-width:140px;overflow:hidden;text-overflow:ellipsis;z-index:3;pointer-events:none;">' + label + '</div>'
    : '';
  return '<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid ' + borderColor + ';background:' + fillColor + ';display:flex;align-items:center;justify-content:center;box-shadow:0 3px 12px rgba(0,0,0,0.5);position:relative;z-index:2;">'
    + '<div style="width:10px;height:10px;background:rgba(0,0,0,0.6);border-radius:50%;transform:rotate(45deg);"></div>'
    + '</div>'
    + pulseHtml
    + labelHtml;
}

function hexToRGBA(hex, alpha = 255) {
  const s = hex.length === 4 ? 1 : 2;
  const o = 1;
  const r = parseInt(hex.substr(o, s).padEnd(2, hex[o]), 16);
  const g = parseInt(hex.substr(o + s, s).padEnd(2, hex[o + s]), 16);
  const b = parseInt(hex.substr(o + 2 * s, s).padEnd(2, hex[o + 2 * s]), 16);
  return [r, g, b, alpha];
}

function formatNumber(num) {
  if (num == null) return "N/A";
  if (typeof num === "string") return num;
  const tiers = [[1e9, "B"], [1e6, "M"], [1e3, "K"]];
  for (const [t, s] of tiers) {
    if (num >= t) return `${(num / t).toFixed(t === 1e3 ? 1 : 2)}${s}`;
  }
  return num.toLocaleString();
}

function formatCurrency(amount) {
  if (amount == null) return "N/A";
  return "$" + formatNumber(amount).replace("$", "");
}

function formatArea(sqMeters) {
  if (sqMeters >= 1e6) return `${(sqMeters / 1e6).toFixed(3)} km²`;
  if (sqMeters >= 1e4) return `${(sqMeters / 1e4).toFixed(3)} ha`;
  return `${sqMeters.toFixed(2)} m²`;
}

function formatDistance(meters) {
  if (meters >= 1000) return `${(meters / 1000).toFixed(3)} km`;
  if (meters >= 1) return `${meters.toFixed(2)} m`;
  return `${(meters * 100).toFixed(1)} cm`;
}

function formatDuration(ms) {
  if (ms == null) return "N/A";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

function formatRiskTime(ts) {
  if (!ts) return "Unknown";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

function getRelativeTime(ts) {
  if (!ts) return "";
  try {
    const ms = Date.now() - new Date(ts).getTime();
    const m = Math.floor(ms / 60000);
    const h = Math.floor(ms / 3600000);
    const d = Math.floor(ms / 86400000);
    if (m < 60) return `${m}m ago`;
    if (h < 24) return `${h}h ago`;
    if (d < 30) return `${d}d ago`;
    return new Date(ts).toLocaleDateString();
  } catch {
    return "";
  }
}

const getRiskCategoryIcon = (cat) => RISK_ICON_MAP[cat?.toLowerCase()] || faTriangleExclamation;
const riskColor = (score) => score > 70 ? "#FF6B6B" : score > 50 ? "#FF9500" : "#4ECDC4";
const severityColorFn = (sev) => ({ critical: "#FF1744", high: "#FF9100", medium: "#FFEA00", low: "#00E676" }[sev?.toLowerCase()] || "#FFEA00");
const deformationSeverityColor = (sev) => ({ critical: "#FF1744", high: "#FF9100", moderate: "#FFEA00", low: "#00E676", negligible: "#4ECDC4" }[sev?.toLowerCase()] || "#9E9E9E");
const healthStatusColor = (s) => ["healthy", "ok", "connected", "available"].includes(s) ? "#00E676" : ["degraded", "warning", "slow"].includes(s) ? "#FFEA00" : "#FF1744";

const getTimezoneFromCoords = (lat, lng) => {
  const o = Math.round(lng / 15);
  return `UTC${o >= 0 ? "+" : ""}${o} (estimated)`;
};

const getClimateZone = (lat) => {
  const a = Math.abs(lat);
  return a < 10 ? "Tropical" : a < 23.5 ? "Subtropical" : a < 35 ? "Warm Temperate" : a < 50 ? "Cool Temperate" : a < 66.5 ? "Subarctic/Subantarctic" : "Polar";
};

const getHemisphere = (lat, lng) => `${lat >= 0 ? "Northern" : "Southern"} & ${lng >= 0 ? "Eastern" : "Western"}`;

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getBoundsFromArea(area) {
  if (!area) return null;
  if (area.mode === "bbox") {
    return {
      min_lat: area.min_lat,
      max_lat: area.max_lat,
      min_lng: area.min_lng,
      max_lng: area.max_lng
    };
  }
  if (area.mode === "point_radius") {
    const latD = area.radius_km / 111;
    const cosLat = Math.cos(area.latitude * Math.PI / 180);
    const lngD = area.radius_km / (111 * Math.max(cosLat, 0.05));
    return {
      min_lat: Math.max(-90, area.latitude - latD),
      max_lat: Math.min(90, area.latitude + latD),
      min_lng: Math.max(-180, area.longitude - lngD),
      max_lng: Math.min(180, area.longitude + lngD)
    };
  }
  return null;
}

function isPointInArea(lat, lng, area) {
  if (!area) return true;
  if (lat == null || lng == null) return false;
  if (area.mode === "point_radius") {
    return haversine(area.latitude, area.longitude, lat, lng) <= area.radius_km * 1000;
  }
  if (area.mode === "bbox") {
    return lat >= area.min_lat && lat <= area.max_lat && lng >= area.min_lng && lng <= area.max_lng;
  }
  return true;
}

function describeArea(area) {
  if (!area) return null;
  const name = area.name && area.name.trim() ? area.name.trim() : null;
  if (area.mode === "point_radius") {
    return name || `${area.latitude.toFixed(3)}°, ${area.longitude.toFixed(3)}° · ${area.radius_km}km`;
  }
  if (area.mode === "bbox") {
    return name || `BBox ${area.min_lat.toFixed(2)}/${area.min_lng.toFixed(2)} → ${area.max_lat.toFixed(2)}/${area.max_lng.toFixed(2)}`;
  }
  return name || "Area";
}

function calculatePolygonArea(coords) {
  if (!coords || coords.length < 3) return 0;
  const R = 6371000;
  const cLat = coords.reduce((s, c) => s + c.lat, 0) / coords.length;
  const cosLat = Math.cos(cLat * Math.PI / 180);
  const pts = coords.map(c => ({
    x: (c.lng - coords[0].lng) * Math.PI / 180 * R * cosLat,
    y: (c.lat - coords[0].lat) * Math.PI / 180 * R
  }));
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(area) / 2;
}

function calculatePerimeter(coords) {
  if (!coords || coords.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < coords.length; i++) {
    const j = (i + 1) % coords.length;
    total += haversine(coords[i].lat, coords[i].lng, coords[j].lat, coords[j].lng);
  }
  return total;
}

function calculateBoundingBox(coords) {
  if (!coords?.length) {
    return { width: 0, height: 0, minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 };
  }
  const lats = coords.map(c => c.lat);
  const lngs = coords.map(c => c.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return {
    width: haversine((minLat + maxLat) / 2, minLng, (minLat + maxLat) / 2, maxLng),
    height: haversine(minLat, (minLng + maxLng) / 2, maxLat, (minLng + maxLng) / 2),
    minLat,
    maxLat,
    minLng,
    maxLng
  };
}

function calculateDetailedDimensions(coords) {
  if (!coords || coords.length < 3) return null;
  const bbox = calculateBoundingBox(coords);
  const midLat = (bbox.minLat + bbox.maxLat) / 2;
  const midLng = (bbox.minLng + bbox.maxLng) / 2;
  const northSouth = haversine(bbox.minLat, midLng, bbox.maxLat, midLng);
  const eastWest = haversine(midLat, bbox.minLng, midLat, bbox.maxLng);
  const diagonal = haversine(bbox.minLat, bbox.minLng, bbox.maxLat, bbox.maxLng);
  const nwDiagonal = haversine(bbox.minLat, bbox.maxLng, bbox.maxLat, bbox.minLng);
  let maxEdge = 0;
  let minEdge = Infinity;
  const edgeLengths = [];
  for (let i = 0; i < coords.length; i++) {
    const j = (i + 1) % coords.length;
    const len = haversine(coords[i].lat, coords[i].lng, coords[j].lat, coords[j].lng);
    edgeLengths.push(len);
    maxEdge = Math.max(maxEdge, len);
    if (len > 0) minEdge = Math.min(minEdge, len);
  }
  const area = calculatePolygonArea(coords);
  return {
    northSouth,
    eastWest,
    diagonal,
    neDiagonal: diagonal,
    nwDiagonal,
    maxEdge,
    minEdge: minEdge === Infinity ? 0 : minEdge,
    avgEdge: edgeLengths.length > 0 ? edgeLengths.reduce((a, b) => a + b, 0) / edgeLengths.length : 0,
    equivalentDiameter: Math.sqrt(area / Math.PI) * 2,
    aspectRatio: eastWest > 0 ? northSouth / eastWest : 1,
    bbox
  };
}

function getCentroid(coords) {
  if (!coords?.length) return { lat: 0, lng: 0 };
  return {
    lat: coords.reduce((s, c) => s + c.lat, 0) / coords.length,
    lng: coords.reduce((s, c) => s + c.lng, 0) / coords.length
  };
}

function pointInPolygon(point, polygon) {
  if (!polygon || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;
    if (((yi > point.lat) !== (yj > point.lat)) && (point.lng < (xj - xi) * (point.lat - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function distanceToLineSegment(point, a, b) {
  const px = point.lng - a.lng;
  const py = point.lat - a.lat;
  const bx = b.lng - a.lng;
  const by = b.lat - a.lat;
  const lenSq = bx * bx + by * by;
  const t = Math.max(0, Math.min(1, lenSq > 0 ? (px * bx + py * by) / lenSq : -1));
  return haversine(point.lat, point.lng, a.lat + t * by, a.lng + t * bx);
}

function distanceToPolygon(point, polygon) {
  if (!polygon?.length) return Infinity;
  let min = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    min = Math.min(min, distanceToLineSegment(point, polygon[i], polygon[(i + 1) % polygon.length]));
  }
  return min;
}

function computeGeodesicCircle(centerLat, centerLng, radiusKm, segments) {
  const R = 6371.0;
  const latRad = centerLat * Math.PI / 180;
  const lngRad = centerLng * Math.PI / 180;
  const angularDist = radiusKm / R;
  const ring = [];
  for (let i = 0; i <= segments; i++) {
    const bearing = (i / segments) * 2 * Math.PI;
    const ptLat = Math.asin(
      Math.sin(latRad) * Math.cos(angularDist) +
      Math.cos(latRad) * Math.sin(angularDist) * Math.cos(bearing)
    );
    const ptLng = lngRad + Math.atan2(
      Math.sin(bearing) * Math.sin(angularDist) * Math.cos(latRad),
      Math.cos(angularDist) - Math.sin(latRad) * Math.sin(ptLat)
    );
    ring.push([ptLng * 180 / Math.PI, ptLat * 180 / Math.PI]);
  }
  return ring;
}

function isRiskEventExpired(risk) {
  const persistentCategories = ["Ground Deformation"];
  const isPersistent = persistentCategories.includes(risk.risk_category);

  if (risk.expires_at) {
    try {
      if (new Date(risk.expires_at).getTime() < Date.now()) return true;
    } catch { }
  }

  if (!isPersistent && risk.event_time) {
    try {
      if (Date.now() - new Date(risk.event_time).getTime() > RISK_EVENT_TTL_MS) return true;
    } catch { }
  }

  if (!isPersistent && risk._ingested_at) {
    try {
      if (Date.now() - new Date(risk._ingested_at).getTime() > RISK_EVENT_TTL_MS) return true;
    } catch { }
  }

  return false;
}

function pruneExpiredRisks(riskData) {
  const pruned = {};
  let removedCount = 0;
  Object.keys(riskData).forEach(k => {
    if (!riskData[k] || !Array.isArray(riskData[k])) {
      pruned[k] = [];
      return;
    }
    const before = riskData[k].length;
    pruned[k] = riskData[k].filter(r => !isRiskEventExpired(r));
    removedCount += before - pruned[k].length;
  });
  return { pruned, removedCount };
}

function computeRiskSummary(riskData) {
  const summary = { total: 0, critical: 0, high: 0, medium: 0, low: 0 };
  Object.values(riskData).forEach(risks => {
    if (!Array.isArray(risks)) return;
    risks.forEach(r => {
      summary.total++;
      const sl = (r.severity || "Low").toLowerCase();
      if (summary[sl] !== undefined) summary[sl]++;
    });
  });
  return summary;
}

function getRiskVisibility(risk) {
  if (!risk) return VISIBILITY_PUBLIC;
  if (risk.visibility) return risk.visibility;
  if (risk.is_private || risk.org_private) return VISIBILITY_ORG_PRIVATE;
  if (risk.orgid && risk.source && risk.source.startsWith("ORG_")) return VISIBILITY_ORG_PRIVATE;
  return VISIBILITY_PUBLIC;
}

function loadScript(src, id) {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) {
      const check = setInterval(() => {
        if ((id === "deckgl-script" && window.deck) || (id === "maplibre-script" && window.maplibregl) || (id === "deckgl-mapbox-script" && window.deck?.MapboxOverlay)) {
          clearInterval(check);
          resolve();
        }
      }, 100);
      setTimeout(() => {
        clearInterval(check);
        reject(new Error("Script load timed out: " + id + "."));
      }, 15000);
      return;
    }
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Script load failed: " + id + "."));
    document.head.appendChild(script);
  });
}

function loadCSS(href, id) {
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

function hashOverpassQuery(query) {
  let hash = 2166136261;
  for (let i = 0; i < query.length; i++) {
    hash ^= query.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36) + "_" + query.length;
}

async function overpassFetch(query, opts = {}) {
  const timeoutMs = opts.timeoutMs || 8000;
  const maxAttempts = Math.min(opts.maxAttempts || OVERPASS_MIRRORS.length, OVERPASS_MIRRORS.length);
  const useCache = opts.useCache !== false;
  const cacheKey = useCache ? hashOverpassQuery(query) : null;

  if (cacheKey) {
    const cached = OVERPASS_CACHE.get(cacheKey);
    if (cached && Date.now() - cached.fetched_at < OVERPASS_CACHE_TTL_MS) {
      OVERPASS_CACHE.delete(cacheKey);
      OVERPASS_CACHE.set(cacheKey, cached);
      return cached.response;
    }
    if (cached) OVERPASS_CACHE.delete(cacheKey);
    const pending = OVERPASS_PENDING.get(cacheKey);
    if (pending) return pending;
  }

  const body = "data=" + encodeURIComponent(query);
  const startIdx = overpassMirrorOffset;

  const promise = (async () => {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const mirrorIdx = (startIdx + attempt) % OVERPASS_MIRRORS.length;
      const url = OVERPASS_MIRRORS[mirrorIdx];
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
          signal: controller.signal
        });
        clearTimeout(timer);
        if (r.ok) {
          const data = await r.json();
          overpassMirrorOffset = mirrorIdx;
          if (cacheKey) {
            OVERPASS_CACHE.set(cacheKey, { response: data, fetched_at: Date.now() });
            while (OVERPASS_CACHE.size > OVERPASS_CACHE_MAX_ENTRIES) {
              const oldestKey = OVERPASS_CACHE.keys().next().value;
              if (oldestKey === undefined) break;
              OVERPASS_CACHE.delete(oldestKey);
            }
          }
          return data;
        }
        if (r.status !== 429 && r.status < 500) return null;
      } catch (error) {
        clearTimeout(timer);
      }
    }
    overpassMirrorOffset = (overpassMirrorOffset + 1) % OVERPASS_MIRRORS.length;
    return null;
  })();

  if (cacheKey) {
    OVERPASS_PENDING.set(cacheKey, promise);
    promise.finally(() => OVERPASS_PENDING.delete(cacheKey));
  }

  return promise;
}

function getFeatureName(tags) {
  if (!tags) return "Unknown Feature";
  if (tags.name) return tags.name;
  const mappings = [
    ["building", v => v === "yes" ? (tags["addr:housename"] || (tags["addr:housenumber"] ? `Building ${tags["addr:housenumber"]}`.trim() : "Building")) : v.charAt(0).toUpperCase() + v.slice(1).replace(/_/g, " ")],
    ["natural"],
    ["landuse"],
    ["leisure"],
    ["man_made"],
    ["amenity"],
    ["shop", v => "Shop: " + v.charAt(0).toUpperCase() + v.slice(1)],
    ["tourism"],
    ["historic"],
    ["water", v => "Water: " + v],
    ["place"]
  ];
  for (const [key, fmt] of mappings) {
    if (tags[key]) return fmt ? fmt(tags[key]) : tags[key].charAt(0).toUpperCase() + tags[key].slice(1).replace(/_/g, " ");
  }
  return "Feature";
}

function getFeatureType(tags) {
  if (!tags) return "unknown";
  for (const k of ["building", "natural", "landuse", "leisure", "man_made", "amenity", "shop", "tourism", "historic", "water", "place", "boundary"]) {
    if (tags[k]) return k;
  }
  return "other";
}

function loadStoredArea() {
  try {
    const raw = localStorage.getItem(USER_AREA_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.mode === "point_radius" && typeof parsed.latitude === "number" && typeof parsed.longitude === "number" && typeof parsed.radius_km === "number") {
      return parsed;
    }
    if (parsed.mode === "bbox" && typeof parsed.min_lat === "number" && typeof parsed.max_lat === "number" && typeof parsed.min_lng === "number" && typeof parsed.max_lng === "number") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function loadStoredAreaFilterActive() {
  try {
    return localStorage.getItem(AREA_FILTER_ACTIVE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function loadStoredSavedViews() {
  try {
    const raw = localStorage.getItem(SAVED_VIEWS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(v => v && typeof v === "object" && v.view_id);
  } catch {
    return [];
  }
}

function persistSavedViewsLocal(views) {
  try {
    localStorage.setItem(SAVED_VIEWS_STORAGE_KEY, JSON.stringify(views.slice(0, SAVED_VIEWS_MAX)));
  } catch { }
}

function generateViewId() {
  return "view_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

function describeSavedView(view) {
  if (!view) return "";
  if (view.name && view.name.trim()) return view.name.trim();
  if (view.bounds) {
    return `BBox ${view.bounds.min_lat.toFixed(1)}/${view.bounds.min_lng.toFixed(1)} → ${view.bounds.max_lat.toFixed(1)}/${view.bounds.max_lng.toFixed(1)}`;
  }
  if (view.center) {
    return `${view.center.lat.toFixed(2)}°, ${view.center.lng.toFixed(2)}° @ ${view.zoom?.toFixed(1) || "?"}`;
  }
  return "Saved View";
}

function MetaField({ label, value, wide, highlight, color, small, scrollable, children }) {
  if (value == null && !children) return null;
  return (
    <div className={`riskMetadataItem${wide ? " riskMetadataItemWide" : ""}`}>
      <span className="riskMetadataLabel">{label}</span>
      <span className={`riskMetadataValue${highlight ? " riskMetadataHighlight" : ""}${small ? " riskMetadataSmall" : ""}${scrollable ? " riskMetadataScrollable" : ""}`} style={color ? { color } : undefined}>
        {children || value}
      </span>
    </div>
  );
}

function MetaSection({ icon, title, children }) {
  return (
    <div className="riskMetadataSection">
      <div className="riskMetadataSectionTitle">
        <FontAwesomeIcon icon={icon} />
        <span>{title}</span>
      </div>
      <div className="riskMetadataGrid">{children}</div>
    </div>
  );
}

function ContainmentBar({ value, thresholds }) {
  const { high = 80, mid = 50, highColor = "#00E676", midColor = "#FFEA00", lowColor = "#FF9100" } = thresholds || {};
  const barColor = value > high ? highColor : value > mid ? midColor : lowColor;
  return (
    <>
      <div className="riskContainmentBar">
        <div className="riskContainmentFill" style={{ width: `${value}%`, backgroundColor: barColor }} />
      </div>
      <span>{value}%</span>
    </>
  );
}

function Modal({ open, onClose, title, size, children }) {
  if (!open) return null;
  return (
    <div className="riskModalOverlay" onClick={onClose}>
      <div className={`riskModal${size ? ` riskModal${size}` : ""}`} onClick={e => e.stopPropagation()}>
        <div className="riskModalHeader">
          <span>{title}</span>
          <button className="riskModalClose" onClick={onClose}>
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>
        <div className="riskModalContent">{children}</div>
      </div>
    </div>
  );
}

function renderMetaFields(fields) {
  return fields.filter(Boolean).map(([label, value, opts = {}], i) => {
    if (value === undefined || value === null) return null;
    return (
      <MetaField key={i} label={label} wide={opts.wide} highlight={opts.highlight} color={opts.color} small={opts.small} scrollable={opts.scrollable}>
        {opts.children || (typeof value === "number" && !opts.raw ? formatNumber(value) : value)}
      </MetaField>
    );
  });
}

function renderEarthquakeMetadata(m) {
  if (!m) return null;
  const alertColors = { red: "#FF1744", orange: "#FF9100", yellow: "#FFEA00", green: "#00E676" };
  return (
    <MetaSection icon={faMountain} title="Seismic Data">
      {renderMetaFields([
        m.magnitude && ["Magnitude", `${m.magnitude} ${m.magnitude_type || ""}`, { highlight: true }],
        m.depth_km !== undefined && ["Depth", `${m.depth_km} km`],
        m.shake_intensity && ["Shake Intensity", m.shake_intensity],
        m.tsunami_risk && ["Tsunami Risk", m.tsunami_risk, { wide: true, color: m.tsunami_risk.includes("warning") ? "#FF1744" : "#4ECDC4" }],
        m.felt_reports !== undefined && ["Felt Reports", m.felt_reports],
        m.expected_aftershocks !== undefined && ["Expected Aftershocks", m.expected_aftershocks],
        m.energy_released_joules && ["Energy Released", `${formatNumber(m.energy_released_joules)} J`, { raw: true }],
        m.equivalent_tnt_tons && ["TNT Equivalent", `${formatNumber(m.equivalent_tnt_tons)} tons`, { raw: true }],
        m.place && ["Location", m.place, { wide: true }],
        m.alert_level && ["Alert Level", m.alert_level, { color: alertColors[m.alert_level] || "#00E676" }],
        m.cdi !== undefined && ["CDI", m.cdi, { raw: true }],
        m.mmi !== undefined && ["MMI", m.mmi, { raw: true }],
        m.significance !== undefined && ["Significance", m.significance, { raw: true }],
        m.station_count !== undefined && ["Stations", m.station_count, { raw: true }],
        m.rms !== undefined && ["RMS", m.rms?.toFixed(3), { raw: true }],
        m.azimuthal_gap !== undefined && ["Azimuthal Gap", `${m.azimuthal_gap}°`, { raw: true }],
        m.network && ["Network", m.network],
        m.status && ["Status", m.status]
      ])}
    </MetaSection>
  );
}

function renderWildfireMetadata(m) {
  if (!m) return null;
  return (
    <MetaSection icon={faFire} title="Wildfire Data">
      {m.total_acres !== undefined && <MetaField label="Total Acres" highlight>{formatNumber(m.total_acres)}</MetaField>}
      {m.percent_contained !== undefined && <MetaField label="Containment"><ContainmentBar value={m.percent_contained} /></MetaField>}
      {renderMetaFields([
        m.duration_days !== undefined && ["Duration", `${m.duration_days} days`],
        m.fire_type && ["Fire Type", m.fire_type],
        m.fire_behavior && ["Fire Behavior", m.fire_behavior, { wide: true }],
        m.estimated_cost_usd !== undefined && ["Estimated Cost", formatCurrency(m.estimated_cost_usd), { raw: true }],
        m.total_personnel !== undefined && ["Personnel", m.total_personnel],
        m.structures_destroyed !== undefined && ["Structures Destroyed", m.structures_destroyed, { color: "#FF1744" }],
        m.structures_threatened !== undefined && ["Structures Threatened", m.structures_threatened, { color: "#FF9100" }],
        m.fatalities > 0 && ["Fatalities", m.fatalities, { color: "#FF1744", raw: true }],
        m.injuries > 0 && ["Injuries", m.injuries, { color: "#FF9100", raw: true }],
        m.poo_state && ["State", m.poo_state],
        m.poo_county && ["County", m.poo_county],
        m.primary_fuel && ["Primary Fuel", m.primary_fuel],
        m.complex_name && ["Complex", m.complex_name, { wide: true }],
        m.irwin_id && ["IRWIN ID", m.irwin_id, { wide: true, small: true }]
      ])}
    </MetaSection>
  );
}

function renderWeatherMetadata(m) {
  if (!m) return null;
  const urgencyColor = { Immediate: "#FF1744", Expected: "#FF9100" };
  return (
    <MetaSection icon={faCloud} title="Weather Data">
      {renderMetaFields([
        m.event_type && ["Event Type", m.event_type, { wide: true, highlight: true }],
        m.nws_severity && ["NWS Severity", m.nws_severity],
        m.urgency && ["Urgency", m.urgency, { color: urgencyColor[m.urgency] || "#FFEA00" }],
        m.certainty && ["Certainty", m.certainty],
        m.response_type && ["Response", m.response_type],
        m.duration_hours !== undefined && ["Duration", `${m.duration_hours} hours`],
        m.sender && ["Issuing Office", m.sender, { wide: true }],
        m.affected_areas && ["Affected Areas", m.affected_areas, { wide: true, scrollable: true }],
        m.headline && ["Headline", m.headline, { wide: true }],
        m.instruction && ["Instructions", m.instruction, { wide: true, scrollable: true }],
        m.risk_level && ["SPC Risk Level", m.risk_level],
        m.outlook_type && ["Outlook Type", m.outlook_type],
        m.impacts?.power_systems && ["Power Systems", m.impacts.power_systems, { wide: true }],
        m.impacts?.hf_radio && ["HF Radio", m.impacts.hf_radio, { wide: true }],
        m.impacts?.navigation && ["Navigation", m.impacts.navigation]
      ])}
    </MetaSection>
  );
}

function renderFloodMetadata(m) {
  if (!m) return null;
  const stageColor = m.flood_stage?.includes("Major") ? "#FF1744" : m.flood_stage?.includes("Moderate") ? "#FF9100" : m.flood_stage?.includes("Minor") ? "#FFEA00" : "#00E676";
  return (
    <MetaSection icon={faWater} title="Flood Data">
      {renderMetaFields([
        m.gage_height_ft !== undefined && ["Gage Height", `${m.gage_height_ft.toFixed(2)} ft`, { highlight: true, raw: true }],
        m.flood_stage && ["Flood Stage", m.flood_stage, { color: stageColor }],
        m.site_name && ["Site Name", m.site_name, { wide: true }],
        m.site_code && ["Site Code", m.site_code],
        m.state && ["State", m.state],
        m.county && ["County", m.county],
        m.huc && ["HUC", m.huc],
        m.drainage_area_sqmi && ["Drainage Area", `${m.drainage_area_sqmi} sq mi`]
      ])}
    </MetaSection>
  );
}

function renderVolcanoMetadata(m) {
  if (!m) return null;
  const alertColor = { Warning: "#FF1744", Watch: "#FF9100", Advisory: "#FFEA00" };
  const aviationColor = { RED: "#FF1744", ORANGE: "#FF9100", YELLOW: "#FFEA00" };
  return (
    <MetaSection icon={faVolcano} title="Volcano Data">
      {renderMetaFields([
        m.volcano_type && ["Volcano Type", m.volcano_type, { wide: true, highlight: true }],
        m.alert_level && ["Alert Level", m.alert_level, { color: alertColor[m.alert_level] || "#00E676" }],
        m.aviation_color_code && ["Aviation Code", m.aviation_color_code, { color: aviationColor[m.aviation_color_code] || "#00E676" }],
        m.elevation_m !== undefined && ["Elevation", `${formatNumber(m.elevation_m)} m`, { raw: true }],
        m.volcanic_explosivity_index !== undefined && ["VEI", m.volcanic_explosivity_index, { raw: true }],
        m.last_eruption && ["Last Eruption", m.last_eruption],
        m.holocene_eruptions !== undefined && ["Holocene Activity", m.holocene_eruptions ? "Yes" : "No"],
        m.country && ["Country", m.country],
        m.region && ["Region", m.region],
        m.rock_type && ["Rock Type", m.rock_type],
        m.volcano_number && ["Volcano Number", m.volcano_number]
      ])}
    </MetaSection>
  );
}

function renderAirQualityMetadata(m) {
  if (!m) return null;
  const aqiColor = m.aqi_category?.includes("Unhealthy") ? "#FF1744" : m.aqi_category === "Moderate" ? "#FFEA00" : "#00E676";
  return (
    <MetaSection icon={faLungs} title="Air Quality Data">
      {renderMetaFields([
        m.pm25_value !== undefined && ["PM2.5", `${m.pm25_value} µg/m³`, { highlight: true, raw: true }],
        m.aqi_category && ["AQI Category", m.aqi_category, { color: aqiColor }],
        m.pm10_value !== undefined && ["PM10", `${m.pm10_value} µg/m³`, { raw: true }],
        m.o3_value !== undefined && ["Ozone (O3)", m.o3_value, { raw: true }],
        m.health_recommendation && ["Health Advisory", m.health_recommendation, { wide: true }],
        m.location_name && ["Station", m.location_name, { wide: true }],
        m.city && ["City", m.city],
        m.country && ["Country", m.country],
        m.source_name && ["Source", m.source_name],
        m.is_mobile !== undefined && ["Mobile Sensor", m.is_mobile ? "Yes" : "No"]
      ])}
      {m.all_measurements?.length > 0 && (
        <MetaField label="All Measurements" wide>
          <div className="riskMeasurementsList">
            {m.all_measurements.map((me, idx) => (
              <span key={idx} className="riskMeasurementTag">{me.parameter}: {me.value} {me.unit}</span>
            ))}
          </div>
        </MetaField>
      )}
    </MetaSection>
  );
}

function renderGroundDeformationMetadata(m) {
  if (!m) return null;
  const dispColor = Math.abs(m.cumulative_displacement_mm) > 20 ? "#FF1744" : Math.abs(m.cumulative_displacement_mm) > 10 ? "#FF9100" : "#FFEA00";
  return (
    <MetaSection icon={faLayerGroup} title="Ground Deformation Data (InSAR)">
      {m.cumulative_displacement_mm !== undefined && <MetaField label="Cumulative Displacement" highlight color={dispColor}>{m.cumulative_displacement_mm} mm</MetaField>}
      {m.estimated_coherence !== undefined && (
        <MetaField label="Estimated Coherence">
          <ContainmentBar value={m.estimated_coherence * 100} thresholds={{ high: 70, mid: 40, highColor: "#00E676", midColor: "#FFEA00", lowColor: "#FF9100" }} />
        </MetaField>
      )}
      {renderMetaFields([
        m.displacement_direction && ["Displacement Direction", m.displacement_direction],
        m.known_annual_rate_mm !== undefined && ["Annual Rate", `${m.known_annual_rate_mm} mm/year`],
        m.infrastructure_at_risk !== undefined && ["Infrastructure at Risk", m.infrastructure_at_risk, { color: m.infrastructure_at_risk > 0 ? "#FF1744" : "#00E676", raw: true }],
        m.observation_period && ["Observation Period", m.observation_period, { wide: true }],
        m.satellite && ["Satellite", m.satellite],
        m.orbit_direction && ["Orbit Direction", m.orbit_direction],
        m.processing_level && ["Processing Level", m.processing_level],
        m.deformation_type && ["Deformation Type", m.deformation_type],
        m.velocity_mm_per_year !== undefined && ["Velocity", `${m.velocity_mm_per_year} mm/year`],
        m.acceleration_mm_per_year2 !== undefined && ["Acceleration", `${m.acceleration_mm_per_year2} mm/year²`],
        m.affected_area_km2 !== undefined && ["Affected Area", `${m.affected_area_km2} km²`],
        m.ground_type && ["Ground Type", m.ground_type]
      ])}
      {m.infrastructure_proximity?.length > 0 && (
        <MetaField label="Nearby Infrastructure" wide>
          <div className="riskInfraProximityList">
            {m.infrastructure_proximity.map((infra, idx) => (
              <div key={idx} className="riskInfraProximityItem">
                <span className="riskInfraProximityName">{infra.name || infra.type}</span>
                {infra.distance_km !== undefined && <span className="riskInfraProximityDistance">{infra.distance_km} km</span>}
                {infra.risk_relevance && (
                  <span className="riskInfraProximityRelevance" style={{ color: infra.risk_relevance.toLowerCase().includes("critical") ? "#FF1744" : infra.risk_relevance.toLowerCase().includes("high") ? "#FF9100" : "#FFEA00" }}>
                    {infra.risk_relevance}
                  </span>
                )}
              </div>
            ))}
          </div>
        </MetaField>
      )}
    </MetaSection>
  );
}

function renderGoldenMeshDetectionMetadata(m) {
  if (!m) return null;
  return (
    <MetaSection icon={faCubes} title="Golden Mesh Change Detection">
      {m.severity && <MetaField label="Detection Severity" highlight color={deformationSeverityColor(m.severity)}>{m.severity.charAt(0).toUpperCase() + m.severity.slice(1)}</MetaField>}
      {m.max_delta_mm !== undefined && <MetaField label="Max Delta" color={Math.abs(m.max_delta_mm) > 20 ? "#FF1744" : "#FF9100"}>{m.max_delta_mm.toFixed(2)} mm</MetaField>}
      {m.affected_point_pct !== undefined && (
        <MetaField label="Affected Percentage">
          <ContainmentBar value={Math.round(m.affected_point_pct * 100)} thresholds={{ high: 30, mid: 60, highColor: "#FF1744", midColor: "#FF9100", lowColor: "#00E676" }} />
        </MetaField>
      )}
      {renderMetaFields([
        m.mean_delta_mm !== undefined && ["Mean Delta", `${m.mean_delta_mm.toFixed(2)} mm`],
        m.std_delta_mm !== undefined && ["Std Deviation", `${m.std_delta_mm.toFixed(2)} mm`],
        m.affected_point_count !== undefined && ["Affected Points", m.affected_point_count],
        m.hotspot_coordinates?.length > 0 && ["Hotspots Detected", `${m.hotspot_coordinates.length} hotspot location${m.hotspot_coordinates.length > 1 ? "s" : ""} identified.`, { wide: true }],
        m.detection_time && ["Detection Time", formatRiskTime(m.detection_time), { wide: true, raw: true }],
        m.mesh_id && ["Baseline Mesh ID", m.mesh_id, { wide: true, small: true }],
        m.acknowledgment_status && ["Acknowledgment", m.acknowledgment_status.charAt(0).toUpperCase() + m.acknowledgment_status.slice(1), { color: m.acknowledgment_status === "acknowledged" ? "#FFEA00" : m.acknowledgment_status === "resolved" ? "#00E676" : "#9E9E9E" }]
      ])}
    </MetaSection>
  );
}

function renderGlobalDisasterMetadata(m) {
  if (!m) return null;
  const gdacsAlertColor = { Red: "#FF1744", Orange: "#FF9100" };
  return (
    <MetaSection icon={faEarthAmericas} title="Global Disaster Data">
      {renderMetaFields([
        m.event_type && ["Event Type", m.event_type, { highlight: true }],
        m.alert_level && ["GDACS Alert", m.alert_level, { color: gdacsAlertColor[m.alert_level] || "#00E676" }],
        m.gdacs_score !== undefined && ["GDACS Score", m.gdacs_score, { raw: true }],
        m.population_affected !== undefined && ["Population Affected", m.population_affected],
        m.vulnerability && ["Vulnerability", m.vulnerability],
        m.severity_value !== undefined && ["Severity", `${m.severity_value} ${m.severity_unit || ""}`],
        m.country && ["Country", m.country],
        m.iso3 && ["ISO Code", m.iso3],
        m.disaster_number && ["FEMA Disaster #", m.disaster_number],
        m.declaration_type && ["Declaration Type", m.declaration_type === "DR" ? "Major Disaster" : "Emergency"],
        m.incident_type && ["Incident Type", m.incident_type],
        m.ih_program_declared !== undefined && ["Individual Assistance", m.ih_program_declared ? "Yes" : "No"],
        m.pa_program_declared !== undefined && ["Public Assistance", m.pa_program_declared ? "Yes" : "No"],
        m.designated_area && ["Designated Area", m.designated_area, { wide: true }],
        m.eonet_id && ["EONET ID", m.eonet_id],
        m.categories?.length > 0 && ["Categories", m.categories.join(", "), { wide: true }],
        m.is_closed !== undefined && ["Status", m.is_closed ? "Closed" : "Active", { color: m.is_closed ? "#00E676" : "#FF9100" }],
        m.geometry_count !== undefined && ["Observations", m.geometry_count, { raw: true }],
        m.first_observed && ["First Observed", formatRiskTime(m.first_observed), { raw: true }],
        m.last_observed && ["Last Observed", formatRiskTime(m.last_observed), { raw: true }]
      ])}
      {m.sources?.length > 0 && (
        <MetaField label="Data Sources" wide>
          <div className="riskSourcesList">
            {m.sources.map((s, idx) => <a key={idx} href={s.url} target="_blank" rel="noopener noreferrer" className="riskSourceLink">{s.id}</a>)}
          </div>
        </MetaField>
      )}
    </MetaSection>
  );
}

const METADATA_RENDERERS = {
  seismic: renderEarthquakeMetadata,
  wildfire: renderWildfireMetadata,
  weather: renderWeatherMetadata,
  tornado: renderWeatherMetadata,
  hurricane: renderWeatherMetadata,
  space: renderWeatherMetadata,
  flood: renderFloodMetadata,
  volcanic: renderVolcanoMetadata,
  "air quality": renderAirQualityMetadata,
  "ground deformation": renderGroundDeformationMetadata
};

const getMetadataRenderer = (cat) => METADATA_RENDERERS[cat?.toLowerCase()] || renderGlobalDisasterMetadata;

export default function RiskCommandCenter({ orgid: propOrgid, username: propUsername }) {
  const MAPKIT_TOKEN = import.meta.env.VITE_APPLE_MAPS_KEY;

  const [orgid] = useState(propOrgid || localStorage.getItem("orgid") || "default_org");
  const [username] = useState(propUsername || localStorage.getItem("username") || "default_user");
  const [theme] = useState("dark");

  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapProvider, setMapProvider] = useState(null);
  const [mapProviderError, setMapProviderError] = useState(null);
  const [mapCenter, setMapCenter] = useState({ lat: 20.0, lng: 0.0 });
  const [mapZoom, setMapZoom] = useState(1);
  const [mapPitch, setMapPitch] = useState(0);
  const [mapBearing, setMapBearing] = useState(0);
  const [currentLocation, setCurrentLocation] = useState("Globe");
  const [activeProvider, setActiveProvider] = useState(MAP_PROVIDER_DECKGL);

  const [show3DTerrain, setShow3DTerrain] = useState(true);
  const [showSatellite, setShowSatellite] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showBuildings, setShowBuildings] = useState(true);
  const [showAssetMarkers, setShowAssetMarkers] = useState(true);
  const [assetLayerMode, setAssetLayerMode] = useState(ASSET_LAYER_MODE_ALL);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showVisibilityBadges, setShowVisibilityBadges] = useState(true);

  const [assets, setAssets] = useState([]);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [detailedAsset, setDetailedAsset] = useState(null);
  const [globalRiskIndex, setGlobalRiskIndex] = useState(0);
  const [alertCount, setAlertCount] = useState(0);
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);

  const [riskIntelligenceData, setRiskIntelligenceData] = useState(EMPTY_RISK_DATA);
  const [riskIntelligenceLoading, setRiskIntelligenceLoading] = useState(false);
  const [riskIntelligenceError, setRiskIntelligenceError] = useState(null);
  const [riskLayersVisible, setRiskLayersVisible] = useState({
    earthquakes: true,
    wildfires: true,
    weather: true,
    floods: true,
    volcanoes: true,
    air_quality: true,
    ground_deformation: true,
    global_disasters: true
  });
  const [selectedRiskEvent, setSelectedRiskEvent] = useState(null);
  const [riskEventExpired, setRiskEventExpired] = useState(false);
  const [riskIntelligenceSummary, setRiskIntelligenceSummary] = useState({ total: 0, critical: 0, high: 0, medium: 0, low: 0 });
  const [riskDataSources, setRiskDataSources] = useState([]);
  const [riskIntelligenceLastUpdated, setRiskIntelligenceLastUpdated] = useState(null);

  const [savedViews, setSavedViews] = useState(loadStoredSavedViews);
  const [saveViewFormData, setSaveViewFormData] = useState({ ...INITIAL_SAVE_VIEW_FORM });

  const [userArea, setUserArea] = useState(loadStoredArea);
  const [areaFilterActive, setAreaFilterActive] = useState(loadStoredAreaFilterActive);
  const [areaFormData, setAreaFormData] = useState({ ...INITIAL_AREA_FORM });
  const [isGeocodingArea, setIsGeocodingArea] = useState(false);

  const [locationAssessment, setLocationAssessment] = useState(null);
  const [isAssessingLocation, setIsAssessingLocation] = useState(false);
  const [nearbyRisks, setNearbyRisks] = useState(null);
  const [isLoadingNearby, setIsLoadingNearby] = useState(false);
  const [nearbyFormData, setNearbyFormData] = useState({ ...INITIAL_NEARBY_FORM });

  const [ingestionStatus, setIngestionStatus] = useState(null);
  const [isLoadingIngestionStatus, setIsLoadingIngestionStatus] = useState(false);
  const [ingestionStreamConnected, setIngestionStreamConnected] = useState(false);
  const [ingestionProgress, setIngestionProgress] = useState([]);

  const [cleanupStatus, setCleanupStatus] = useState(null);
  const [isLoadingCleanupStatus, setIsLoadingCleanupStatus] = useState(false);
  const [isTriggeringCleanup, setIsTriggeringCleanup] = useState(false);

  const [healthStatus, setHealthStatus] = useState(null);
  const [isLoadingHealth, setIsLoadingHealth] = useState(false);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState(null);
  const [featureMeasurements, setFeatureMeasurements] = useState(null);
  const [featureDetails, setFeatureDetails] = useState(null);
  const [isSelectingFeature, setIsSelectingFeature] = useState(false);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  const [selectionError, setSelectionError] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  const [apiError, setApiError] = useState(null);
  const [apiSuccess, setApiSuccess] = useState(null);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeModal, setActiveModal] = useState(null);

  const [expandedRiskSections, setExpandedRiskSections] = useState({
    overview: true,
    metadata: true,
    impact: true,
    recommendations: true,
    technical: false,
    source: false,
    goldenMeshDetection: true
  });

  const [deckLayersVersion, setDeckLayersVersion] = useState(0);

  const mapContainerRef = useRef(null);
  const appleMapContainerRef = useRef(null);
  const deckglMapContainerRef = useRef(null);
  const appleMapRef = useRef(null);
  const deckglMapRef = useRef(null);
  const mapRef = useRef(null);
  const mapProviderRef = useRef(MAP_PROVIDER_DECKGL);
  const mapkitInitializedRef = useRef(false);
  const deckOverlayRef = useRef(null);
  const appleMapReadyRef = useRef(false);
  const deckglMapReadyRef = useRef(false);
  const switchingProviderRef = useRef(false);

  const annotationsRef = useRef([]);
  const riskMarkersRef = useRef([]);
  const riskOverlaysRef = useRef([]);
  const impactCirclesRef = useRef([]);
  const selectionOverlaysRef = useRef([]);
  const selectionGeoJsonRef = useRef(null);
  const userAreaOverlaysRef = useRef([]);
  const userAreaAnnotationRef = useRef(null);
  const selectionModeRef = useRef(false);
  const mouseDownPosRef = useRef(null);
  const queryFeatureAtPointRef = useRef(null);
  const pruneIntervalRef = useRef(null);
  const initialFetchDoneRef = useRef(false);

  const riskStreamRef = useRef(null);
  const streamingDataRef = useRef({ ...EMPTY_RISK_DATA });
  const streamingSummaryRef = useRef({ total: 0, critical: 0, high: 0, medium: 0, low: 0 });
  const nearbyStreamRef = useRef(null);
  const ingestionStreamRef = useRef(null);
  const showHeatmapRef = useRef(false);

  const pendingAppleMarkerRefreshRef = useRef(false);
  const flyToUserAreaRef = useRef(null);

  const showNotification = useCallback((message, type = "success") => {
    const setter = type === "success" ? setApiSuccess : setApiError;
    setter(message);
    setTimeout(() => setter(null), type === "success" ? 4000 : 5000);
  }, []);

  const apiFetch = useCallback(async (url, options = {}) => {
    const response = await fetch(url, options);
    return response.json();
  }, []);

  const apiFetchWithStatus = useCallback(async (url, options = {}) => {
    const response = await fetch(url, options);
    return { status: response.status, data: await response.json() };
  }, []);

  const getVisibleBounds = useCallback(() => {
    if (activeProvider === MAP_PROVIDER_APPLE && appleMapRef.current) {
      const r = appleMapRef.current.region;
      return {
        min_lat: r.center.latitude - r.span.latitudeDelta / 2,
        max_lat: r.center.latitude + r.span.latitudeDelta / 2,
        min_lng: r.center.longitude - r.span.longitudeDelta / 2,
        max_lng: r.center.longitude + r.span.longitudeDelta / 2
      };
    }
    if (activeProvider === MAP_PROVIDER_DECKGL && deckglMapRef.current) {
      const b = deckglMapRef.current.getBounds();
      if (b) {
        return {
          min_lat: b.getSouth(),
          max_lat: b.getNorth(),
          min_lng: b.getWest(),
          max_lng: b.getEast()
        };
      }
    }
    return null;
  }, [activeProvider]);

  const isInBounds = useCallback((lat, lng, bounds) => {
    if (!bounds) return true;
    return lat >= bounds.min_lat && lat <= bounds.max_lat && lng >= bounds.min_lng && lng <= bounds.max_lng;
  }, []);

  const extractGeometry = useCallback((el) => {
    if (el.type === "way" && el.geometry) {
      return el.geometry.map(p => ({ lat: p.lat, lng: p.lon }));
    }
    if (el.type === "relation" && el.members) {
      const outerMembers = el.members.filter(m => m.role === "outer" && m.geometry);
      const geomMembers = outerMembers.length > 0 ? outerMembers : el.members.filter(m => m.geometry);
      if (geomMembers.length === 0) return null;
      if (outerMembers.length === 0) {
        const coords = [];
        geomMembers.forEach(m => m.geometry.forEach(p => coords.push({ lat: p.lat, lng: p.lon })));
        return coords;
      }
      const segments = geomMembers.map(m => m.geometry.map(p => ({ lat: p.lat, lng: p.lon })));
      if (segments.length === 1) return segments[0];
      const assembled = [...segments[0]];
      const used = new Set([0]);
      while (used.size < segments.length) {
        const lastPt = assembled[assembled.length - 1];
        let bestIdx = -1;
        let bestDist = Infinity;
        let bestReverse = false;
        for (let i = 0; i < segments.length; i++) {
          if (used.has(i)) continue;
          const seg = segments[i];
          const dS = (lastPt.lat - seg[0].lat) ** 2 + (lastPt.lng - seg[0].lng) ** 2;
          const dE = (lastPt.lat - seg[seg.length - 1].lat) ** 2 + (lastPt.lng - seg[seg.length - 1].lng) ** 2;
          if (dS < bestDist) { bestDist = dS; bestIdx = i; bestReverse = false; }
          if (dE < bestDist) { bestDist = dE; bestIdx = i; bestReverse = true; }
        }
        if (bestIdx === -1) break;
        used.add(bestIdx);
        assembled.push(...(bestReverse ? [...segments[bestIdx]].reverse() : segments[bestIdx]));
      }
      return assembled;
    }
    return null;
  }, []);

  const extractAddressFromTags = useCallback((tags) => {
    if (!tags) return null;
    const tagMap = {
      housenumber: "addr:housenumber",
      housename: "addr:housename",
      street: "addr:street",
      city: "addr:city",
      state: "addr:state",
      postcode: "addr:postcode",
      country: "addr:country"
    };
    const addr = {};
    Object.entries(tagMap).forEach(([k, t]) => { if (tags[t]) addr[k] = tags[t]; });
    return Object.keys(addr).length > 0 ? addr : null;
  }, []);

  const extractBuildingDetails = useCallback((tags) => {
    if (!tags) return null;
    const details = {};
    const tagMap = {
      "building:levels": "levels",
      "building:material": "material",
      height: "height",
      architect: "architect",
      operator: "operator",
      website: "website",
      phone: "phone",
      opening_hours: "hours"
    };
    if (tags.building && tags.building !== "yes") details.buildingType = tags.building;
    Object.entries(tagMap).forEach(([t, k]) => { if (tags[t]) details[k] = tags[t]; });
    return Object.keys(details).length > 0 ? details : null;
  }, []);

  const fetchAssets = useCallback(async () => {
    setIsLoadingAssets(true);
    setApiError(null);
    try {
      const params = new URLSearchParams({ orgid, limit: "100", sort_by: "risk_score", sort_order: "desc" });
      const data = await apiFetch(`${API_BASE_URL}/risk/assets?${params}`);
      if (data.success) {
        setAssets(data.assets.map(a => ({
          ...a,
          lat: a.latitude,
          lng: a.longitude,
          type: a.asset_type,
          riskLevel: a.risk_score || 0,
          geometry_type: a.geometry_type || "Point",
          geometry_coordinates: a.geometry_coordinates || null,
          dependencies: Array.isArray(a.dependencies) ? a.dependencies : [],
          dependents: Array.isArray(a.dependents) ? a.dependents : [],
          owner_orgid: a.owner_orgid || a.orgid || orgid
        })));
      } else {
        showNotification(data.message || "Failed to fetch assets.", "error");
      }
    } catch (error) {
      showNotification("Network error occurred while fetching assets.", "error");
    } finally {
      setIsLoadingAssets(false);
    }
  }, [orgid, showNotification, apiFetch]);

  const fetchAssetDetails = useCallback(async (assetId) => {
    try {
      const data = await apiFetch(`${API_BASE_URL}/risk/assets/${assetId}?orgid=${orgid}`);
      if (data.success) {
        setDetailedAsset({
          ...data.asset,
          lat: data.asset.latitude,
          lng: data.asset.longitude,
          type: data.asset.asset_type,
          riskLevel: data.asset.risk_score || 0,
          zones: data.zones,
          history: data.history,
          alerts: data.alerts,
          dependencies: Array.isArray(data.asset.dependencies) ? data.asset.dependencies : [],
          dependents: Array.isArray(data.asset.dependents) ? data.asset.dependents : []
        });
        setAlertCount(data.alerts?.length || 0);
      } else {
        showNotification(data.message || "Failed to fetch asset details.", "error");
      }
    } catch (error) {
      showNotification("Network error occurred while fetching asset details.", "error");
    }
  }, [orgid, showNotification, apiFetch]);

  const categorizeRisk = useCallback((risk) => {
    const categoryMap = {
      seismic: "earthquakes",
      wildfire: "wildfires",
      flood: "floods",
      volcanic: "volcanoes",
      "air quality": "air_quality",
      "ground deformation": "ground_deformation"
    };
    const cat = risk.risk_category?.toLowerCase();
    return categoryMap[cat] || (["weather", "tornado", "hurricane", "space"].includes(cat) ? "weather" : "global_disasters");
  }, []);

  const removeExpiredRiskFromState = useCallback((expiredRisk) => {
    if (!expiredRisk || !expiredRisk.id) return;
    setRiskIntelligenceData(prev => {
      const next = {};
      let found = false;
      Object.keys(prev).forEach(k => {
        const filtered = (prev[k] || []).filter(r => {
          const match = r.id === expiredRisk.id || (r.source_id && r.source_id === expiredRisk.source_id && r.source === expiredRisk.source);
          if (match) found = true;
          return !match;
        });
        next[k] = filtered;
      });
      if (!found) return prev;
      return next;
    });
    setRiskIntelligenceSummary(prev => {
      const sl = (expiredRisk.severity || "Low").toLowerCase();
      const newSummary = { ...prev, total: Math.max(0, prev.total - 1) };
      if (newSummary[sl] !== undefined) newSummary[sl] = Math.max(0, newSummary[sl] - 1);
      return newSummary;
    });
  }, []);

  const handleSelectRiskEvent = useCallback((risk) => {
    setRiskEventExpired(false);
    setSelectedRiskEvent(risk);
    if (risk && isRiskEventExpired(risk)) {
      setRiskEventExpired(true);
    }
  }, []);

  const handleDismissExpiredRiskEvent = useCallback(() => {
    if (selectedRiskEvent) {
      removeExpiredRiskFromState(selectedRiskEvent);
    }
    setSelectedRiskEvent(null);
    setRiskEventExpired(false);
  }, [selectedRiskEvent, removeExpiredRiskFromState]);

  const fetchRiskIntelligenceAll = useCallback((bounds = null, areaFilter = null) => {
    if (riskStreamRef.current) {
      riskStreamRef.current.close();
      riskStreamRef.current = null;
    }
    setRiskIntelligenceLoading(true);
    setRiskIntelligenceError(null);

    const freshData = {};
    Object.keys(EMPTY_RISK_DATA).forEach(k => { freshData[k] = []; });
    streamingDataRef.current = freshData;
    streamingSummaryRef.current = { total: 0, critical: 0, high: 0, medium: 0, low: 0 };

    setRiskIntelligenceData({ ...freshData });
    setRiskIntelligenceSummary({ total: 0, critical: 0, high: 0, medium: 0, low: 0 });

    const params = new URLSearchParams();
    if (bounds) Object.entries(bounds).forEach(([k, v]) => params.append(k, v.toString()));
    const enabled = Object.entries(riskLayersVisible).filter(([, v]) => v).map(([k]) => k);
    if (enabled.length > 0) params.append("categories", enabled.join(","));
    if (orgid) params.append("orgid", orgid);
    if (username) params.append("username", username);

    const url = `${API_BASE_URL}/risk/intelligence/stream?${params}`;
    const evtSource = new EventSource(url);
    riskStreamRef.current = evtSource;

    evtSource.addEventListener("source_data", (event) => {
      try {
        const payload = JSON.parse(event.data);
        const risks = payload.risks || [];
        if (!risks.length) return;
        const ref = streamingDataRef.current;
        const sumRef = streamingSummaryRef.current;
        const now = new Date().toISOString();
        for (const risk of risks) {
          if (isRiskEventExpired(risk)) continue;
          if (areaFilter && !isPointInArea(risk.latitude, risk.longitude, areaFilter)) continue;
          risk._ingested_at = risk._ingested_at || now;
          if (!risk.visibility) risk.visibility = getRiskVisibility(risk);
          const bucket = categorizeRisk(risk);
          if (ref[bucket]) ref[bucket].push(risk);
          sumRef.total++;
          const sl = (risk.severity || "Low").toLowerCase();
          if (sumRef[sl] !== undefined) sumRef[sl]++;
        }
        setRiskIntelligenceData(() => {
          const next = {};
          Object.keys(ref).forEach(k => { next[k] = [...ref[k]]; });
          return next;
        });
        setRiskIntelligenceSummary({ ...sumRef });
        setAlertCount(sumRef.critical);
        setRiskIntelligenceLastUpdated(new Date());
      } catch (error) { }
    });

    evtSource.addEventListener("stream_completed", () => {
      setRiskIntelligenceLoading(false);
      evtSource.close();
      riskStreamRef.current = null;
    });

    evtSource.addEventListener("stream_started", () => { });
    evtSource.addEventListener("source_started", () => { });
    evtSource.addEventListener("source_completed", () => { });

    evtSource.onerror = () => {
      setRiskIntelligenceLoading(false);
      if (evtSource.readyState === EventSource.CLOSED) {
        riskStreamRef.current = null;
      } else {
        setRiskIntelligenceError("Streaming connection interrupted. Data may be incomplete.");
        evtSource.close();
        riskStreamRef.current = null;
      }
    };
  }, [riskLayersVisible, categorizeRisk, orgid, username]);

  const fetchRiskDataSources = useCallback(async () => {
    try {
      const data = await apiFetch(`${API_BASE_URL}/risk/intelligence/sources`);
      if (data.success) setRiskDataSources(data.sources);
    } catch (error) { }
  }, [apiFetch]);

  const fetchNearbyRisks = useCallback(async (params = {}) => {
    if (nearbyStreamRef.current) {
      nearbyStreamRef.current.close();
      nearbyStreamRef.current = null;
    }
    setIsLoadingNearby(true);
    setNearbyRisks(null);

    const qp = new URLSearchParams();
    const paramMapping = {
      latitude: "lat",
      longitude: "lng",
      radius_km: "radius_km",
      category: "category",
      severity: "severity",
      source: "source",
      limit: "limit"
    };
    Object.entries(paramMapping).forEach(([k, v]) => { if (params[k]) qp.append(v, params[k].toString()); });
    if (orgid) qp.append("orgid", orgid);

    return new Promise((resolve) => {
      const collectedRisks = [];
      const severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
      const url = `${API_BASE_URL}/risk/intelligence/stream/postgis/nearby?${qp}`;
      const evtSource = new EventSource(url);
      nearbyStreamRef.current = evtSource;

      evtSource.addEventListener("nearby_data", (event) => {
        try {
          const payload = JSON.parse(event.data);
          const batch = payload.batch || [];
          collectedRisks.push(...batch);
          for (const risk of batch) {
            const sl = (risk.severity || "Low").toLowerCase();
            if (severityCounts[sl] !== undefined) severityCounts[sl]++;
          }
          setNearbyRisks({
            success: true,
            total_count: payload.total_available || collectedRisks.length,
            risks: [...collectedRisks],
            by_severity: { ...severityCounts },
            query_time_ms: null,
            streaming: true,
            batches_received: (payload.batch_index || 0) + 1
          });
        } catch (error) { }
      });

      evtSource.addEventListener("stream_completed", () => {
        setIsLoadingNearby(false);
        evtSource.close();
        nearbyStreamRef.current = null;
        const result = {
          success: true,
          total_count: collectedRisks.length,
          risks: collectedRisks,
          by_severity: severityCounts
        };
        setNearbyRisks(result);
        resolve(result);
      });

      evtSource.addEventListener("stream_error", (event) => {
        try {
          const payload = JSON.parse(event.data);
          showNotification(payload.message || "Failed to fetch nearby risks.", "error");
        } catch (error) {
          showNotification("Failed to fetch nearby risks.", "error");
        }
        setIsLoadingNearby(false);
        evtSource.close();
        nearbyStreamRef.current = null;
        resolve(null);
      });

      evtSource.onerror = () => {
        setIsLoadingNearby(false);
        if (evtSource.readyState !== EventSource.CONNECTING) {
          evtSource.close();
          nearbyStreamRef.current = null;
          if (!collectedRisks.length) {
            showNotification("Streaming connection failed for nearby risks.", "error");
            resolve(null);
          } else {
            resolve({ success: true, total_count: collectedRisks.length, risks: collectedRisks, by_severity: severityCounts });
          }
        }
      };
    });
  }, [showNotification, orgid]);

  const fetchIngestionStatus = useCallback(async () => {
    setIsLoadingIngestionStatus(true);
    try {
      const data = await apiFetch(`${API_BASE_URL}/risk/intelligence/ingest/status`);
      if (data.success) setIngestionStatus(data);
      else showNotification(data.message || "Failed to fetch ingestion status.", "error");
    } catch (error) {
      showNotification("Network error occurred while fetching ingestion status.", "error");
    } finally {
      setIsLoadingIngestionStatus(false);
    }
  }, [showNotification, apiFetch]);

  const fetchCleanupStatus = useCallback(async () => {
    setIsLoadingCleanupStatus(true);
    try {
      const data = await apiFetch(`${API_BASE_URL}/risk/intelligence/cleanup/status`);
      if (data.success) setCleanupStatus(data);
      else showNotification(data.message || "Failed to fetch cleanup status.", "error");
    } catch (error) {
      showNotification("Network error occurred while fetching cleanup status.", "error");
    } finally {
      setIsLoadingCleanupStatus(false);
    }
  }, [showNotification, apiFetch]);

  const triggerCleanup = useCallback(async () => {
    setIsTriggeringCleanup(true);
    try {
      const { status, data } = await apiFetchWithStatus(`${API_BASE_URL}/risk/intelligence/cleanup/trigger`, { method: "POST", headers: { "Content-Type": "application/json" } });
      if (status === 202 && data.success) {
        showNotification("Cleanup cycle triggered successfully.");
        setTimeout(() => fetchCleanupStatus(), 3000);
      } else if (status === 409) {
        showNotification("A cleanup cycle is already running.", "error");
      } else {
        showNotification(data.message || "Failed to trigger cleanup.", "error");
      }
    } catch (error) {
      showNotification("Network error occurred while triggering cleanup.", "error");
    } finally {
      setIsTriggeringCleanup(false);
    }
  }, [showNotification, apiFetchWithStatus, fetchCleanupStatus]);

  const fetchHealthStatus = useCallback(async () => {
    setIsLoadingHealth(true);
    try {
      const data = await apiFetch(`${API_BASE_URL}/risk/intelligence/health`);
      const results = data.results || [];
      const okCount = results.filter(r => r.status === "OK").length;
      const overall = okCount === results.length ? "healthy" : okCount > results.length / 2 ? "degraded" : "unhealthy";

      const pgResult = results.find(r => r.name === "PostGIS Database");
      const externalApis = {};
      results.filter(r => r.name !== "PostGIS Database").forEach(r => {
        externalApis[r.name] = { status: r.status === "OK" ? "connected" : "failed", latency_ms: r.response_time_ms };
      });

      setHealthStatus({
        status: overall,
        timestamp: data.timestamp,
        uptime_seconds: null,
        postgresql: pgResult ? {
          status: pgResult.status === "OK" ? "healthy" : "unhealthy",
          latency_ms: pgResult.response_time_ms,
          cached_events: pgResult.cached_events,
          connection_pool: data.database_pool || pgResult.pool_stats
        } : null,
        external_apis: externalApis,
        ingestion_worker: {
          status: data.ingestion_running ? "running" : "idle"
        },
        memory: data.write_queue ? {
          pending_batches: data.write_queue.pending_batches,
          pending_items: data.write_queue.pending_items,
          in_memory_events: data.in_memory_risk_events,
          cache_entries: data.cache_entries
        } : null
      });
    } catch (error) {
      showNotification("Network error occurred while fetching health status.", "error");
    } finally {
      setIsLoadingHealth(false);
    }
  }, [showNotification, apiFetch]);

  const refreshRiskIntelligence = useCallback(() => {
    if (selectedRiskEvent) {
      setSelectedRiskEvent(null);
      setRiskEventExpired(false);
    }
    const bounds = mapZoom > 4 ? {
      min_lat: mapCenter.lat - (180 / Math.pow(2, mapZoom)),
      max_lat: mapCenter.lat + (180 / Math.pow(2, mapZoom)),
      min_lng: mapCenter.lng - (360 / Math.pow(2, mapZoom)),
      max_lng: mapCenter.lng + (360 / Math.pow(2, mapZoom))
    } : null;
    fetchRiskIntelligenceAll(bounds);
  }, [mapZoom, mapCenter, fetchRiskIntelligenceAll, selectedRiskEvent]);

  const assessLocationRisk = useCallback(async (latitude, longitude, radiusKm = 100) => {
    setIsAssessingLocation(true);
    try {
      const { status, data } = await apiFetchWithStatus(`${API_BASE_URL}/risk/intelligence/assess-location`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude, longitude, radius_km: radiusKm, orgid, categories: ["earthquakes", "wildfires", "weather", "floods", "volcanoes", "ground_deformation"] })
      });
      if (status === 404) {
        showNotification("This risk event has expired or been removed from the database. Refreshing data.", "error");
        refreshRiskIntelligence();
        return null;
      }
      if (data.success) {
        setLocationAssessment(data);
        setActiveModal("locationAssess");
        return data;
      }
      showNotification(data.message || "Failed to assess location risk.", "error");
      return null;
    } catch (error) {
      showNotification("Network error occurred while assessing location risk.", "error");
      return null;
    } finally {
      setIsAssessingLocation(false);
    }
  }, [showNotification, apiFetchWithStatus, refreshRiskIntelligence, orgid]);

  const connectIngestionStream = useCallback(() => {
    if (ingestionStreamRef.current) return;
    const evtSource = new EventSource(`${API_BASE_URL}/risk/intelligence/ingest/stream`);
    ingestionStreamRef.current = evtSource;

    evtSource.addEventListener("connected", () => {
      setIngestionStreamConnected(true);
    });

    evtSource.addEventListener("ingestion_started", (event) => {
      try {
        const payload = JSON.parse(event.data);
        setIngestionProgress([{ type: "started", ...payload }]);
        showNotification("Ingestion cycle started.");
      } catch (error) { }
    });

    evtSource.addEventListener("ingestion_progress", (event) => {
      try {
        const payload = JSON.parse(event.data);
        setIngestionProgress(prev => [...prev, { type: "progress", ...payload }]);
      } catch (error) { }
    });

    evtSource.addEventListener("ingestion_completed", (event) => {
      try {
        const payload = JSON.parse(event.data);
        setIngestionProgress(prev => [...prev, { type: "completed", ...payload }]);
        showNotification(`Ingestion completed: ${payload.total_ingested || 0} events ingested.`);
        fetchIngestionStatus();
        refreshRiskIntelligence();
      } catch (error) { }
    });

    evtSource.onerror = () => {
      if (evtSource.readyState === EventSource.CLOSED) {
        setIngestionStreamConnected(false);
        ingestionStreamRef.current = null;
      }
    };
  }, [fetchIngestionStatus, refreshRiskIntelligence, showNotification]);

  const disconnectIngestionStream = useCallback(() => {
    if (ingestionStreamRef.current) {
      ingestionStreamRef.current.close();
      ingestionStreamRef.current = null;
      setIngestionStreamConnected(false);
    }
  }, []);

  const openNearbyQueryModal = useCallback((lat = null, lng = null) => {
    setNearbyFormData({ ...INITIAL_NEARBY_FORM, ...(lat != null && lng != null ? { latitude: lat.toFixed(6), longitude: lng.toFixed(6) } : {}) });
    setNearbyRisks(null);
    setActiveModal("nearbyQuery");
  }, []);

  const handleFormChange = useCallback((setter) => (field, value) => setter(prev => ({ ...prev, [field]: value })), []);
  const handleNearbyFormChange = handleFormChange(setNearbyFormData);
  const handleAreaFormChange = handleFormChange(setAreaFormData);
  const handleSaveViewFormChange = handleFormChange(setSaveViewFormData);

  const handleNearbyQuerySubmit = useCallback((event) => {
    event.preventDefault();
    if (!nearbyFormData.latitude || !nearbyFormData.longitude) {
      showNotification("Latitude and longitude are required for nearby query.", "error");
      return;
    }
    fetchNearbyRisks({
      latitude: parseFloat(nearbyFormData.latitude),
      longitude: parseFloat(nearbyFormData.longitude),
      radius_km: parseFloat(nearbyFormData.radius_km) || 100,
      category: nearbyFormData.category || undefined,
      severity: nearbyFormData.severity || undefined,
      source: nearbyFormData.source || undefined,
      limit: parseInt(nearbyFormData.limit)
    });
  }, [nearbyFormData, fetchNearbyRisks, showNotification]);

  const fetchAreaFromBackend = useCallback(async () => {
    if (!orgid || !username) return;
    try {
      const data = await apiFetch(`${API_BASE_URL}/risk/user/area?orgid=${encodeURIComponent(orgid)}&username=${encodeURIComponent(username)}`);
      if (data?.success && data.area) {
        setUserArea(data.area);
        setAreaFilterActive(!!data.filter_active);
      }
    } catch (error) { }
  }, [orgid, username, apiFetch]);

  const saveAreaToBackend = useCallback(async (area, filterActive) => {
    if (!orgid || !username || !area) return;
    try {
      const { status, data } = await apiFetchWithStatus(`${API_BASE_URL}/risk/user/area`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgid, username, ...area, filter_active: !!filterActive })
      });
      if (status !== 200 || !data?.success) {
        showNotification(data?.message || "Failed to save area to server. Saved locally only.", "error");
      }
    } catch (error) {
      showNotification("Network error saving area to server. Saved locally only.", "error");
    }
  }, [orgid, username, apiFetchWithStatus, showNotification]);

  const deleteAreaFromBackend = useCallback(async () => {
    if (!orgid || !username) return;
    try {
      await apiFetch(`${API_BASE_URL}/risk/user/area?orgid=${encodeURIComponent(orgid)}&username=${encodeURIComponent(username)}`, { method: "DELETE" });
    } catch (error) { }
  }, [orgid, username, apiFetch]);

  const updateFilterStateOnBackend = useCallback(async (filterActive) => {
    if (!orgid || !username) return;
    try {
      await apiFetch(`${API_BASE_URL}/risk/user/area/filter`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgid, username, filter_active: !!filterActive })
      });
    } catch (error) { }
  }, [orgid, username, apiFetch]);

  const fetchSavedViewsFromBackend = useCallback(async () => {
    if (!orgid || !username) return;
    try {
      const data = await apiFetch(`${API_BASE_URL}/risk/user/views?orgid=${encodeURIComponent(orgid)}&username=${encodeURIComponent(username)}`);
      if (data?.success && Array.isArray(data.views)) {
        const local = loadStoredSavedViews();
        const merged = [];
        const seenIds = new Set();
        for (const v of data.views) {
          if (!seenIds.has(v.view_id)) { seenIds.add(v.view_id); merged.push(v); }
        }
        for (const v of local) {
          if (!seenIds.has(v.view_id)) { seenIds.add(v.view_id); merged.push(v); }
        }
        setSavedViews(merged);
        persistSavedViewsLocal(merged);
      }
    } catch (error) { }
  }, [orgid, username, apiFetch]);

  const persistSavedViewToBackend = useCallback(async (view) => {
    if (!orgid || !username || !view) return;
    try {
      await apiFetch(`${API_BASE_URL}/risk/user/views`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgid, username, ...view })
      });
    } catch (error) { }
  }, [orgid, username, apiFetch]);

  const removeSavedViewFromBackend = useCallback(async (viewId) => {
    if (!orgid || !username || !viewId) return;
    try {
      await apiFetch(`${API_BASE_URL}/risk/user/views/${encodeURIComponent(viewId)}?orgid=${encodeURIComponent(orgid)}&username=${encodeURIComponent(username)}`, { method: "DELETE" });
    } catch (error) { }
  }, [orgid, username, apiFetch]);

  const openMyAreaModal = useCallback(() => {
    if (userArea) {
      if (userArea.mode === "point_radius") {
        setAreaFormData({
          ...INITIAL_AREA_FORM,
          mode: "point_radius",
          name: userArea.name || "",
          address: userArea.address || "",
          latitude: userArea.latitude.toString(),
          longitude: userArea.longitude.toString(),
          radius_km: userArea.radius_km.toString()
        });
      } else if (userArea.mode === "bbox") {
        setAreaFormData({
          ...INITIAL_AREA_FORM,
          mode: "bbox",
          name: userArea.name || "",
          min_lat: userArea.min_lat.toString(),
          max_lat: userArea.max_lat.toString(),
          min_lng: userArea.min_lng.toString(),
          max_lng: userArea.max_lng.toString()
        });
      }
    } else {
      setAreaFormData({ ...INITIAL_AREA_FORM });
    }
    setActiveModal("myArea");
  }, [userArea]);

  const handleGeocodeArea = useCallback(async () => {
    const query = areaFormData.address?.trim();
    if (!query) {
      showNotification("Enter an address to geocode.", "error");
      return;
    }
    setIsGeocodingArea(true);
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&addressdetails=1`, { headers: { "User-Agent": "RiskCommandCenter/1.0" } });
      if (!r.ok) throw new Error("Geocoding service returned an error.");
      const results = await r.json();
      if (!results.length) {
        showNotification("Address not found. Try a more specific query.", "error");
        return;
      }
      const place = results[0];
      const lat = parseFloat(place.lat);
      const lng = parseFloat(place.lon);
      const friendlyName = place.address?.city || place.address?.town || place.address?.village || place.address?.county || place.display_name?.split(",")[0] || query;
      setAreaFormData(prev => ({
        ...prev,
        latitude: lat.toFixed(6),
        longitude: lng.toFixed(6),
        name: prev.name?.trim() ? prev.name : friendlyName
      }));
      showNotification(`Geocoded to ${place.display_name?.substring(0, 80) || `${lat}, ${lng}`}.`);
    } catch (error) {
      showNotification("Failed to geocode address. Check your network.", "error");
    } finally {
      setIsGeocodingArea(false);
    }
  }, [areaFormData.address, showNotification]);

  const useMapCenterForArea = useCallback(() => {
    setAreaFormData(prev => ({
      ...prev,
      latitude: mapCenter.lat.toFixed(6),
      longitude: mapCenter.lng.toFixed(6)
    }));
  }, [mapCenter]);

  const useMapViewForArea = useCallback(() => {
    const bounds = getVisibleBounds();
    if (!bounds) {
      showNotification("Map bounds not available yet.", "error");
      return;
    }
    setAreaFormData(prev => ({
      ...prev,
      min_lat: bounds.min_lat.toFixed(6),
      max_lat: bounds.max_lat.toFixed(6),
      min_lng: bounds.min_lng.toFixed(6),
      max_lng: bounds.max_lng.toFixed(6)
    }));
  }, [getVisibleBounds, showNotification]);

  const navigateToLocationDeferred = useCallback((lat, lng, zoom, name) => {
    if (deckglMapRef.current && activeProvider === MAP_PROVIDER_DECKGL) {
      deckglMapRef.current.flyTo({ center: [lng, lat], zoom, duration: 1500 });
    } else if (appleMapRef.current && activeProvider === MAP_PROVIDER_APPLE && window.mapkit) {
      const span = 360 / Math.pow(2, zoom);
      appleMapRef.current.setRegionAnimated(new window.mapkit.CoordinateRegion(new window.mapkit.Coordinate(lat, lng), new window.mapkit.CoordinateSpan(span, span)), true);
    }
    setCurrentLocation(name || `${lat.toFixed(2)}°, ${lng.toFixed(2)}°`);
  }, [activeProvider]);

  const fitToBoundsDeferred = useCallback((area) => {
    if (deckglMapRef.current && activeProvider === MAP_PROVIDER_DECKGL) {
      deckglMapRef.current.fitBounds([[area.min_lng, area.min_lat], [area.max_lng, area.max_lat]], { padding: 50, duration: 1500 });
    } else if (appleMapRef.current && activeProvider === MAP_PROVIDER_APPLE && window.mapkit) {
      const cLat = (area.min_lat + area.max_lat) / 2;
      const cLng = (area.min_lng + area.max_lng) / 2;
      const span = Math.max(area.max_lat - area.min_lat, area.max_lng - area.min_lng) * 1.3;
      appleMapRef.current.setRegionAnimated(new window.mapkit.CoordinateRegion(new window.mapkit.Coordinate(cLat, cLng), new window.mapkit.CoordinateSpan(span, span)), true);
    }
    setCurrentLocation(area.name || "Custom Area");
  }, [activeProvider]);

  const handleSaveArea = useCallback((activateImmediately = true) => {
    let area = null;
    if (areaFormData.mode === "point_radius") {
      const lat = parseFloat(areaFormData.latitude);
      const lng = parseFloat(areaFormData.longitude);
      const radius = parseFloat(areaFormData.radius_km);
      if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        showNotification("Latitude and longitude must be valid coordinates.", "error");
        return;
      }
      if (isNaN(radius) || radius <= 0 || radius > 10000) {
        showNotification("Radius must be between 1 and 10000 km.", "error");
        return;
      }
      area = {
        mode: "point_radius",
        name: areaFormData.name?.trim() || "",
        address: areaFormData.address?.trim() || "",
        latitude: lat,
        longitude: lng,
        radius_km: radius
      };
    } else if (areaFormData.mode === "bbox") {
      const minLat = parseFloat(areaFormData.min_lat);
      const maxLat = parseFloat(areaFormData.max_lat);
      const minLng = parseFloat(areaFormData.min_lng);
      const maxLng = parseFloat(areaFormData.max_lng);
      if ([minLat, maxLat, minLng, maxLng].some(v => isNaN(v))) {
        showNotification("All bounding box coordinates are required.", "error");
        return;
      }
      if (minLat >= maxLat || minLng >= maxLng) {
        showNotification("Min coordinates must be less than max coordinates.", "error");
        return;
      }
      if (minLat < -90 || maxLat > 90 || minLng < -180 || maxLng > 180) {
        showNotification("Coordinates must be in valid lat/lng ranges.", "error");
        return;
      }
      area = {
        mode: "bbox",
        name: areaFormData.name?.trim() || "",
        min_lat: minLat,
        max_lat: maxLat,
        min_lng: minLng,
        max_lng: maxLng
      };
    }
    if (!area) return;
    setUserArea(area);
    if (activateImmediately) {
      setAreaFilterActive(true);
    }
    setActiveModal(null);
    saveAreaToBackend(area, activateImmediately);
    showNotification(`Saved preferred area: ${describeArea(area)}.`);
    if (area.mode === "point_radius") {
      const targetZoom = area.radius_km > 1000 ? 4 : area.radius_km > 500 ? 5 : area.radius_km > 200 ? 6 : area.radius_km > 100 ? 7 : area.radius_km > 50 ? 8 : 9;
      setTimeout(() => navigateToLocationDeferred(area.latitude, area.longitude, targetZoom, area.name || `${area.latitude.toFixed(2)}°, ${area.longitude.toFixed(2)}°`), 100);
    } else {
      setTimeout(() => fitToBoundsDeferred(area), 100);
    }
  }, [areaFormData, showNotification, saveAreaToBackend, navigateToLocationDeferred, fitToBoundsDeferred]);

  const clearUserArea = useCallback(() => {
    setUserArea(null);
    setAreaFilterActive(false);
    setActiveModal(null);
    deleteAreaFromBackend();
    showNotification("Cleared preferred area. Showing global alerts.");
  }, [showNotification, deleteAreaFromBackend]);

  const toggleAreaFilter = useCallback(() => {
    if (!userArea) {
      showNotification("Set a preferred area first.", "error");
      openMyAreaModal();
      return;
    }
    const willActivate = !areaFilterActive;
    setAreaFilterActive(willActivate);
    updateFilterStateOnBackend(willActivate);
    if (willActivate && flyToUserAreaRef.current) {
      flyToUserAreaRef.current();
    }
  }, [userArea, areaFilterActive, openMyAreaModal, showNotification, updateFilterStateOnBackend]);

  useEffect(() => {
    fetchAreaFromBackend();
    fetchSavedViewsFromBackend();
  }, [fetchAreaFromBackend, fetchSavedViewsFromBackend]);

  const toggleRiskLayer = useCallback((cat) => setRiskLayersVisible(prev => ({ ...prev, [cat]: !prev[cat] })), []);
  const toggleRiskSection = useCallback((s) => setExpandedRiskSections(prev => ({ ...prev, [s]: !prev[s] })), []);

  const captureCurrentView = useCallback(() => {
    const bounds = getVisibleBounds();
    return {
      center: { lat: mapCenter.lat, lng: mapCenter.lng },
      zoom: mapZoom,
      pitch: mapPitch,
      bearing: mapBearing,
      bounds,
      provider: activeProvider
    };
  }, [getVisibleBounds, mapCenter, mapZoom, mapPitch, mapBearing, activeProvider]);

  const openSaveViewModal = useCallback(() => {
    setSaveViewFormData({ ...INITIAL_SAVE_VIEW_FORM, name: `View ${new Date().toLocaleString()}` });
    setActiveModal("saveView");
  }, []);

  const handleSaveCurrentView = useCallback(() => {
    const name = saveViewFormData.name?.trim();
    if (!name) {
      showNotification("Enter a name for the saved view.", "error");
      return;
    }
    const camera = captureCurrentView();
    const view = {
      view_id: generateViewId(),
      name,
      description: saveViewFormData.description?.trim() || "",
      created_at: new Date().toISOString(),
      camera,
      center: camera.center,
      zoom: camera.zoom,
      pitch: camera.pitch,
      bearing: camera.bearing,
      bounds: camera.bounds,
      filters: saveViewFormData.include_filters ? {
        area_filter_active: areaFilterActive,
        user_area: userArea,
        risk_layers_visible: { ...riskLayersVisible }
      } : null,
      layers: saveViewFormData.include_layers ? {
        show_3d_terrain: show3DTerrain,
        show_satellite: showSatellite,
        show_buildings: showBuildings,
        show_asset_markers: showAssetMarkers,
        asset_layer_mode: assetLayerMode,
        show_heatmap: showHeatmap,
        show_visibility_badges: showVisibilityBadges
      } : null
    };
    const next = [view, ...savedViews].slice(0, SAVED_VIEWS_MAX);
    setSavedViews(next);
    persistSavedViewsLocal(next);
    persistSavedViewToBackend(view);
    setActiveModal(null);
    showNotification(`Saved view: ${name}.`);
  }, [saveViewFormData, captureCurrentView, areaFilterActive, userArea, riskLayersVisible, show3DTerrain, showSatellite, showBuildings, showAssetMarkers, assetLayerMode, showHeatmap, showVisibilityBadges, savedViews, persistSavedViewToBackend, showNotification]);

  const applySavedView = useCallback((view) => {
    if (!view) return;
    const camera = view.camera || { center: view.center, zoom: view.zoom, pitch: view.pitch, bearing: view.bearing };
    if (camera?.center && camera.zoom != null) {
      navigateToLocationDeferred(camera.center.lat, camera.center.lng, camera.zoom, view.name);
    }
    if (view.filters) {
      if (view.filters.risk_layers_visible) setRiskLayersVisible(view.filters.risk_layers_visible);
      if (view.filters.user_area !== undefined) {
        setUserArea(view.filters.user_area);
        if (view.filters.user_area) {
          saveAreaToBackend(view.filters.user_area, !!view.filters.area_filter_active);
        }
      }
      if (view.filters.area_filter_active !== undefined) setAreaFilterActive(!!view.filters.area_filter_active);
    }
    if (view.layers) {
      if (view.layers.show_3d_terrain !== undefined) setShow3DTerrain(!!view.layers.show_3d_terrain);
      if (view.layers.show_satellite !== undefined) setShowSatellite(!!view.layers.show_satellite);
      if (view.layers.show_buildings !== undefined) setShowBuildings(!!view.layers.show_buildings);
      if (view.layers.show_asset_markers !== undefined) setShowAssetMarkers(!!view.layers.show_asset_markers);
      if (view.layers.asset_layer_mode) setAssetLayerMode(view.layers.asset_layer_mode);
      if (view.layers.show_heatmap !== undefined) setShowHeatmap(!!view.layers.show_heatmap);
      if (view.layers.show_visibility_badges !== undefined) setShowVisibilityBadges(!!view.layers.show_visibility_badges);
    }
    setActiveModal(null);
    showNotification(`Applied saved view: ${describeSavedView(view)}.`);
  }, [navigateToLocationDeferred, saveAreaToBackend, showNotification]);

  const deleteSavedView = useCallback((viewId) => {
    const next = savedViews.filter(v => v.view_id !== viewId);
    setSavedViews(next);
    persistSavedViewsLocal(next);
    removeSavedViewFromBackend(viewId);
    showNotification("Deleted saved view.");
  }, [savedViews, removeSavedViewFromBackend, showNotification]);

  const fetchReverseGeocode = useCallback(async (lat, lng) => {
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&extratags=1&namedetails=1`, { headers: { "User-Agent": "RiskCommandCenter/1.0" } });
      return r.ok ? r.json() : null;
    } catch (error) {
      return null;
    }
  }, []);

  const fetchWikipediaExtract = useCallback(async (tag) => {
    if (!tag) return null;
    try {
      let lang = "en";
      let title = tag;
      if (tag.includes(":")) {
        const p = tag.split(":");
        lang = p[0];
        title = p.slice(1).join(":");
      }
      const r = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, { headers: { "User-Agent": "RiskCommandCenter/1.0" } });
      if (!r.ok) return null;
      const d = await r.json();
      return {
        title: d.title,
        extract: d.extract,
        description: d.description,
        thumbnail: d.thumbnail?.source,
        coordinates: d.coordinates,
        url: d.content_urls?.desktop?.page
      };
    } catch (error) {
      return null;
    }
  }, []);

  const fetchElevation = useCallback(async (lat, lng) => {
    try {
      const r = await fetch(`https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lng}`);
      return r.ok ? (await r.json()).results?.[0]?.elevation : null;
    } catch (error) {
      return null;
    }
  }, []);

  const fetchNearbyPOIs = useCallback(async (lat, lng, radius = 200) => {
    try {
      const data = await overpassFetch(`[out:json][timeout:10];(node["amenity"](around:${radius},${lat},${lng});node["shop"](around:${radius},${lat},${lng});node["tourism"](around:${radius},${lat},${lng});node["public_transport"](around:${radius},${lat},${lng});node["highway"="bus_stop"](around:${radius},${lat},${lng});node["railway"="station"](around:${radius},${lat},${lng});node["railway"="tram_stop"](around:${radius},${lat},${lng}););out body 50;`);
      if (!data) return [];
      return (data.elements || []).map(el => ({
        type: el.tags?.amenity || el.tags?.shop || el.tags?.tourism || el.tags?.public_transport || el.tags?.highway || el.tags?.railway,
        name: el.tags?.name,
        distance: haversine(lat, lng, el.lat, el.lon)
      })).filter(p => p.type).sort((a, b) => a.distance - b.distance).slice(0, 15);
    } catch (error) {
      return [];
    }
  }, []);

  const fetchNearbyStreets = useCallback(async (lat, lng, radius = 100) => {
    try {
      const data = await overpassFetch(`[out:json][timeout:10];way["highway"](around:${radius},${lat},${lng});out tags 20;`);
      if (!data) return [];
      return [...new Set((data.elements || []).filter(el => el.tags?.name).map(el => ({ name: el.tags.name, type: el.tags.highway })))].slice(0, 10);
    } catch (error) {
      return [];
    }
  }, []);

  const fetchAdminBoundaries = useCallback(async (lat, lng) => {
    try {
      const data = await overpassFetch(`[out:json][timeout:10];is_in(${lat},${lng})->.a;area.a["boundary"="administrative"];out tags;`);
      if (!data) return [];
      return (data.elements || []).map(el => ({
        name: el.tags?.name,
        level: el.tags?.admin_level,
        type: el.tags?.boundary,
        population: el.tags?.population
      })).filter(b => b.name).sort((a, b) => (b.level || 0) - (a.level || 0));
    } catch (error) {
      return [];
    }
  }, []);

  const fetchLandUseContext = useCallback(async (lat, lng, radius = 300) => {
    try {
      const data = await overpassFetch(`[out:json][timeout:10];(way["landuse"](around:${radius},${lat},${lng});relation["landuse"](around:${radius},${lat},${lng});way["natural"](around:${radius},${lat},${lng});relation["natural"](around:${radius},${lat},${lng}););out tags 30;`);
      if (!data) return [];
      const counts = {};
      (data.elements || []).forEach(el => {
        const t = el.tags?.landuse || el.tags?.natural;
        if (t) counts[t] = (counts[t] || 0) + 1;
      });
      return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([type, count]) => ({ type, count }));
    } catch (error) {
      return [];
    }
  }, []);

  const fetchFeatureDetails = useCallback(async (feature, centroid) => {
    setIsFetchingDetails(true);
    const details = {
      address: null,
      location: null,
      buildingInfo: null,
      wikipediaInfo: null,
      elevationInfo: null,
      nearbyPOIs: [],
      nearbyStreets: [],
      adminBoundaries: [],
      landUseContext: [],
      geographicInfo: {
        timezone: getTimezoneFromCoords(centroid.lat, centroid.lng),
        climateZone: getClimateZone(centroid.lat),
        hemisphere: getHemisphere(centroid.lat, centroid.lng)
      }
    };
    details.address = extractAddressFromTags(feature.tags);
    details.buildingInfo = extractBuildingDetails(feature.tags);
    try {
      await Promise.allSettled([
        fetchReverseGeocode(centroid.lat, centroid.lng).then(g => {
          if (!g) return;
          details.location = { displayName: g.display_name, addressComponents: g.address || {} };
          if (!details.address && g.address) {
            const a = g.address;
            details.address = {
              housenumber: a.house_number,
              street: a.road,
              city: a.city || a.town || a.village,
              state: a.state,
              postcode: a.postcode,
              country: a.country
            };
          }
        }),
        feature.tags?.wikipedia ? fetchWikipediaExtract(feature.tags.wikipedia).then(w => { if (w) details.wikipediaInfo = w; }) : Promise.resolve(),
        fetchElevation(centroid.lat, centroid.lng).then(e => { if (e !== null) details.elevationInfo = { groundElevation: e, elevationFeet: Math.round(e * 3.28084) }; }),
        fetchNearbyPOIs(centroid.lat, centroid.lng, 300).then(p => { details.nearbyPOIs = p; }),
        fetchNearbyStreets(centroid.lat, centroid.lng, 150).then(s => { details.nearbyStreets = s; }),
        fetchAdminBoundaries(centroid.lat, centroid.lng).then(b => { details.adminBoundaries = b; }),
        fetchLandUseContext(centroid.lat, centroid.lng, 500).then(l => { details.landUseContext = l; })
      ]);
    } catch (error) { }
    setIsFetchingDetails(false);
    setFeatureDetails(details);
  }, [fetchReverseGeocode, fetchWikipediaExtract, fetchElevation, fetchNearbyPOIs, fetchNearbyStreets, fetchAdminBoundaries, fetchLandUseContext, extractAddressFromTags, extractBuildingDetails]);

  const clearSelectionOverlays = useCallback(() => {
    if (appleMapRef.current) selectionOverlaysRef.current.forEach(o => { try { appleMapRef.current.removeOverlay(o); } catch { } });
    selectionOverlaysRef.current = [];
    selectionGeoJsonRef.current = null;
    setDeckLayersVersion(v => v + 1);
  }, []);

  const drawFeatureHighlight = useCallback((coords) => {
    if (!coords || coords.length < 3) return;
    clearSelectionOverlays();
    if (activeProvider === MAP_PROVIDER_APPLE && appleMapRef.current && window.mapkit) {
      const mkCoords = coords.map(c => new window.mapkit.Coordinate(c.lat, c.lng));
      [[10, 0.35, 0.08], [3, 0.95, 0.22]].forEach(([lw, so, fo]) => {
        const ov = new window.mapkit.PolygonOverlay([mkCoords], { style: new window.mapkit.Style({ strokeColor: "#00FFFF", strokeOpacity: so, lineWidth: lw, fillColor: "#00FFFF", fillOpacity: fo }) });
        appleMapRef.current.addOverlay(ov);
        selectionOverlaysRef.current.push(ov);
      });
    }
    const ring = coords.map(c => [c.lng, c.lat]);
    if (ring.length > 0 && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) ring.push([...ring[0]]);
    selectionGeoJsonRef.current = { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Polygon", coordinates: [ring] }, properties: {} }] };
    setDeckLayersVersion(v => v + 1);
  }, [clearSelectionOverlays, activeProvider]);

  const clearSelection = useCallback(() => {
    clearSelectionOverlays();
    setSelectedFeature(null);
    setFeatureMeasurements(null);
    setFeatureDetails(null);
    setSelectionError(null);
  }, [clearSelectionOverlays]);

  const getQueryRadius = useCallback((zoom) => {
    const thresholds = [[21, 3], [20, 5], [19, 8], [18, 12], [17, 20], [16, 35], [15, 50], [14, 80], [13, 120], [12, 200], [11, 400], [10, 800], [8, 2000], [6, 5000]];
    for (const [z, r] of thresholds) {
      if (zoom >= z) return r;
    }
    return 15000;
  }, []);

  const buildOverpassQuery = useCallback((lat, lng, radius, zoom) => {
    const around = `(around:${radius},${lat},${lng})`;
    let filters;
    if (zoom >= 18) {
      filters = ["building", "man_made", "amenity", "shop", "tourism", "historic", "leisure", "landuse", "natural", "barrier"].map(t => `way["${t}"]${around};`).join("") +
        `way["highway"]["area"="yes"]${around};relation["building"]${around};relation["landuse"]${around};`;
    } else if (zoom >= 15) {
      filters = ["building", "man_made", "amenity", "shop", "leisure", "landuse", "natural"].map(t => `way["${t}"]${around};`).join("") +
        `relation["building"]${around};relation["landuse"]${around};`;
    } else if (zoom >= 12) {
      filters = ["building", "landuse", "leisure", "man_made"].map(t => `way["${t}"]${around};`).join("") +
        `way["natural"~"water|wood|scrub|wetland|beach|glacier"]${around};relation["building"]${around};relation["landuse"]${around};relation["natural"]${around};`;
    } else if (zoom >= 8) {
      filters = ["natural", "landuse", "leisure", "water"].map(t => `way["${t}"]${around};relation["${t}"]${around};`).join("") + `relation["place"]${around};`;
    } else {
      filters = `relation["natural"~"mountain_range|volcano|glacier|water|bay"]${around};relation["place"~"island|islet|archipelago"]${around};relation["water"]${around};relation["boundary"~"national_park|protected_area"]${around};way["natural"~"mountain_range|volcano|glacier|water|bay"]${around};`;
    }
    return `[out:json][timeout:25];(${filters});out body geom;`;
  }, []);

  const queryFeatureAtPoint = useCallback(async (lat, lng, zoom) => {
    setIsSelectingFeature(true);
    setSelectionError(null);
    clearSelection();
    try {
      const radius = getQueryRadius(zoom);
      const query = buildOverpassQuery(lat, lng, radius, zoom);
      const data = await overpassFetch(query, { timeoutMs: 15000, maxAttempts: 3 });
      if (!data) {
        setSelectionError("All Overpass mirrors failed or timed out. Try again or zoom in for a smaller query.");
        setIsSelectingFeature(false);
        setTimeout(() => setSelectionError(null), 5000);
        return;
      }
      if (!data.elements?.length) {
        setSelectionError("No selectable feature found here. Try zooming in closer.");
        setIsSelectingFeature(false);
        setTimeout(() => setSelectionError(null), 5000);
        return;
      }
      const clickPoint = { lat, lng };
      const features = data.elements.map(el => {
        const geom = extractGeometry(el);
        if (!geom || geom.length < 3) return null;
        const centroid = getCentroid(geom);
        return {
          id: el.id,
          osmType: el.type,
          tags: el.tags || {},
          geometry: geom,
          area: calculatePolygonArea(geom),
          centroid,
          isInside: pointInPolygon(clickPoint, geom),
          edgeDist: distanceToPolygon(clickPoint, geom),
          centroidDist: haversine(lat, lng, centroid.lat, centroid.lng)
        };
      }).filter(Boolean);
      if (features.length === 0) {
        setSelectionError("No geometry found for nearby features.");
        setIsSelectingFeature(false);
        setTimeout(() => setSelectionError(null), 5000);
        return;
      }
      features.sort((a, b) => {
        if (a.isInside !== b.isInside) return a.isInside ? -1 : 1;
        if (a.isInside && b.isInside) return a.area - b.area;
        return (a.edgeDist + a.area * 0.00001) - (b.edgeDist + b.area * 0.00001);
      });
      const best = features[0];
      setSelectedFeature({
        id: best.id,
        osmType: best.osmType,
        name: getFeatureName(best.tags),
        type: getFeatureType(best.tags),
        tags: best.tags,
        geometry: best.geometry,
        centroid: best.centroid
      });
      setFeatureMeasurements({
        area: best.area,
        perimeter: calculatePerimeter(best.geometry),
        dimensions: calculateDetailedDimensions(best.geometry),
        vertexCount: best.geometry.length,
        centroid: best.centroid
      });
      drawFeatureHighlight(best.geometry);
      fetchFeatureDetails({ id: best.id, osmType: best.osmType, tags: best.tags }, best.centroid);
    } catch (error) {
      setSelectionError(error.name === "AbortError" ? "Query timed out. Try zooming in for faster results." : "Failed to query features.");
      setTimeout(() => setSelectionError(null), 5000);
    }
    setIsSelectingFeature(false);
  }, [getQueryRadius, buildOverpassQuery, extractGeometry, drawFeatureHighlight, clearSelection, fetchFeatureDetails]);

  const loadMapKitJS = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (window.mapkit && mapkitInitializedRef.current) {
        resolve(window.mapkit);
        return;
      }
      if (document.querySelector('script[src*="apple-mapkit"]')) {
        const check = setInterval(() => {
          if (window.mapkit) {
            clearInterval(check);
            if (!mapkitInitializedRef.current) {
              window.mapkit.init({ authorizationCallback: done => done(MAPKIT_TOKEN) });
              mapkitInitializedRef.current = true;
            }
            resolve(window.mapkit);
          }
        }, 100);
        setTimeout(() => {
          clearInterval(check);
          reject(new Error("MapKit JS load timed out."));
        }, 10000);
        return;
      }
      const script = document.createElement("script");
      script.src = "https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js";
      script.crossOrigin = "anonymous";
      const timeout = setTimeout(() => reject(new Error("MapKit JS load timed out.")), 10000);
      script.addEventListener("load", () => {
        clearTimeout(timeout);
        try {
          window.mapkit.init({ authorizationCallback: done => done(MAPKIT_TOKEN) });
          mapkitInitializedRef.current = true;
          resolve(window.mapkit);
        } catch (error) {
          reject(error);
        }
      });
      script.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error("MapKit JS script load failed."));
      });
      document.head.appendChild(script);
    });
  }, [MAPKIT_TOKEN]);

  const loadDeckGlDeps = useCallback(async () => {
    loadCSS("https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.css", "maplibre-css");
    await loadScript("https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.js", "maplibre-script");
    await loadScript("https://unpkg.com/deck.gl@8.9.36/dist.min.js", "deckgl-script");
    await new Promise(resolve => {
      const check = setInterval(() => {
        if (window.deck?.MapboxOverlay && window.maplibregl) {
          clearInterval(check);
          resolve();
        }
      }, 50);
      setTimeout(() => {
        clearInterval(check);
        resolve();
      }, 8000);
    });
  }, []);

  const initAppleMap = useCallback((mapkit) => {
    if (!appleMapContainerRef.current) return null;
    const map = new mapkit.Map(appleMapContainerRef.current, {
      mapType: mapkit.Map.MapTypes.Satellite,
      showsCompass: mapkit.FeatureVisibility.Visible,
      showsZoomControl: true,
      showsScale: mapkit.FeatureVisibility.Visible,
      showsMapTypeControl: false,
      showsUserLocationControl: true,
      showsPointsOfInterest: true,
      isRotationEnabled: true,
      isScrollEnabled: true,
      isZoomEnabled: true,
      padding: new mapkit.Padding(0, 0, 0, 0),
      center: new mapkit.Coordinate(20, 0),
      cameraBoundary: null,
      cameraDistance: 50000000,
      colorScheme: mapkit.Map.ColorSchemes.Dark
    });
    map.rotation = 0;
    map.addEventListener("region-change-end", () => {
      if (mapProviderRef.current !== MAP_PROVIDER_APPLE) return;
      const lat = map.center.latitude;
      const lng = map.center.longitude;
      setMapCenter({ lat, lng });
      const zoom = Math.max(0, Math.min(Math.log2(360 / Math.max(map.region.span.latitudeDelta, 0.0001)), 22));
      setMapZoom(zoom);
      setMapBearing(map.rotation || 0);
      if (zoom < APPLE_MAPS_ZOOM_THRESHOLD && !switchingProviderRef.current) switchToProvider(MAP_PROVIDER_DECKGL, lat, lng, zoom, 0, map.rotation || 0);
    });
    const mapEl = appleMapContainerRef.current;
    mapEl.addEventListener("mousedown", event => {
      if (mapProviderRef.current === MAP_PROVIDER_APPLE) mouseDownPosRef.current = { x: event.clientX, y: event.clientY };
    });
    mapEl.addEventListener("mouseup", event => {
      if (mapProviderRef.current !== MAP_PROVIDER_APPLE || !selectionModeRef.current || !mouseDownPosRef.current) return;
      if (Math.hypot(event.clientX - mouseDownPosRef.current.x, event.clientY - mouseDownPosRef.current.y) > 8) return;
      const coord = map.convertPointOnPageToCoordinate(new DOMPoint(event.clientX, event.clientY));
      if (coord) queryFeatureAtPointRef.current?.(coord.latitude, coord.longitude, Math.max(0, Math.min(Math.log2(360 / Math.max(map.region.span.latitudeDelta, 0.0001)), 22)));
    });
    return map;
  }, []);

  const initDeckGlMap = useCallback(() => {
    if (!deckglMapContainerRef.current || !window.maplibregl) return null;
    const map = new window.maplibregl.Map({
      container: deckglMapContainerRef.current,
      style: {
        version: 8,
        sources: {
          "satellite-tiles": { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, maxzoom: 19, attribution: "Tiles Esri" },
          "labels-tiles": { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, maxzoom: 19 }
        },
        layers: [
          { id: "satellite-layer", type: "raster", source: "satellite-tiles", minzoom: 0, maxzoom: 8 },
          { id: "labels-layer", type: "raster", source: "labels-tiles", minzoom: 0, maxzoom: 8, paint: { "raster-opacity": 0.9 } }
        ],
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf"
      },
      center: [0, 20],
      zoom: 1,
      pitch: 0,
      bearing: 0,
      maxzoom: 7,
      minZoom: 1,
      antialias: true
    });
    map.addControl(new window.maplibregl.NavigationControl(), "top-right");
    map.addControl(new window.maplibregl.ScaleControl(), "bottom-left");
    map._riskBaseStyle = "satellite";
    map.on("moveend", () => {
      if (mapProviderRef.current !== MAP_PROVIDER_DECKGL) return;
      const c = map.getCenter();
      const z = map.getZoom();
      setMapCenter({ lat: c.lat, lng: c.lng });
      setMapZoom(z);
      setMapPitch(map.getPitch());
      setMapBearing(map.getBearing());
      if (z >= APPLE_MAPS_ZOOM_THRESHOLD && appleMapReadyRef.current && !switchingProviderRef.current && !showHeatmapRef.current) switchToProvider(MAP_PROVIDER_APPLE, c.lat, c.lng, z, map.getPitch(), map.getBearing());
    });
    map.on("mousedown", event => {
      mouseDownPosRef.current = { x: event.originalEvent.clientX, y: event.originalEvent.clientY };
    });
    map.on("click", event => {
      if (!selectionModeRef.current) return;
      if (mouseDownPosRef.current && Math.hypot(event.originalEvent.clientX - mouseDownPosRef.current.x, event.originalEvent.clientY - mouseDownPosRef.current.y) > 8) return;
      queryFeatureAtPointRef.current?.(event.lngLat.lat, event.lngLat.lng, map.getZoom());
    });
    return map;
  }, []);

  const switchToProvider = useCallback((targetProvider, lat, lng, zoom, pitch, bearing) => {
    if (switchingProviderRef.current || mapProviderRef.current === targetProvider) return;
    switchingProviderRef.current = true;
    mapProviderRef.current = targetProvider;
    setActiveProvider(targetProvider);
    setMapProvider(targetProvider);
    if (targetProvider === MAP_PROVIDER_APPLE) {
      mapRef.current = appleMapRef.current;
      if (appleMapRef.current && window.mapkit) {
        const span = 360 / Math.pow(2, zoom);
        appleMapRef.current.setRegionAnimated(new window.mapkit.CoordinateRegion(new window.mapkit.Coordinate(lat, lng), new window.mapkit.CoordinateSpan(span, span)), false);
        appleMapRef.current.rotation = bearing;
      }
      if (appleMapContainerRef.current) appleMapContainerRef.current.style.display = "block";
      if (deckglMapContainerRef.current) deckglMapContainerRef.current.style.display = "none";
    } else {
      mapRef.current = deckglMapRef.current;
      if (deckglMapRef.current) {
        deckglMapRef.current.jumpTo({ center: [lng, lat], zoom, pitch, bearing });
        deckglMapRef.current.resize();
      }
      if (appleMapContainerRef.current) appleMapContainerRef.current.style.display = "none";
      if (deckglMapContainerRef.current) deckglMapContainerRef.current.style.display = "block";
    }
    setTimeout(() => {
      switchingProviderRef.current = false;
      if (targetProvider === MAP_PROVIDER_APPLE) {
        pendingAppleMarkerRefreshRef.current = true;
      } else {
        if (deckglMapRef.current) deckglMapRef.current.resize();
        setDeckLayersVersion(v => v + 1);
      }
    }, 300);
  }, []);

  useEffect(() => {
    if (!pendingAppleMarkerRefreshRef.current) return;
    if (activeProvider !== MAP_PROVIDER_APPLE) return;
    pendingAppleMarkerRefreshRef.current = false;
    addAppleAnnotationsNow();
    addAppleRiskMarkersNow();
    drawAppleUserAreaNow();
  });

  const visibleAssets = useMemo(() => {
    if (assetLayerMode === ASSET_LAYER_MODE_HIDDEN) return [];
    if (assetLayerMode === ASSET_LAYER_MODE_OWNED) {
      return assets.filter(a => a.owner_orgid === orgid);
    }
    return assets;
  }, [assets, assetLayerMode, orgid]);

  const filteredRiskData = useMemo(() => {
    if (!areaFilterActive || !userArea) return riskIntelligenceData;
    const filtered = {};
    Object.keys(riskIntelligenceData).forEach(k => {
      filtered[k] = (riskIntelligenceData[k] || []).filter(r =>
        isPointInArea(r.latitude, r.longitude, userArea)
      );
    });
    return filtered;
  }, [riskIntelligenceData, areaFilterActive, userArea]);

  const filteredRiskSummary = useMemo(() => computeRiskSummary(filteredRiskData), [filteredRiskData]);

  const buildDeckLayers = useCallback(() => {
    if (!window.deck) return [];
    const dk = window.deck;
    const layers = [];

    const allRisks = [];
    Object.entries(filteredRiskData).forEach(([cat, risks]) => { if (riskLayersVisible[cat] && risks?.length > 0) allRisks.push(...risks); });

    if (showHeatmap && allRisks.length > 0 && dk.HeatmapLayer) {
      const MAX_PER_CATEGORY = 500;
      const heatmapData = [];
      Object.entries(filteredRiskData).forEach(([cat, risks]) => {
        if (!riskLayersVisible[cat] || !risks?.length) return;
        const valid = risks.filter(r => r.latitude && r.longitude);
        const subset = valid.length > MAX_PER_CATEGORY
          ? valid
              .sort((a, b) => (SEVERITY_WEIGHTS_LOCAL[b.severity] || 10) - (SEVERITY_WEIGHTS_LOCAL[a.severity] || 10))
              .slice(0, MAX_PER_CATEGORY)
          : valid;
        for (const r of subset) {
          heatmapData.push({
            position: [r.longitude, r.latitude],
            weight: (SEVERITY_WEIGHTS_LOCAL[r.severity] || 10) / 10
          });
        }
      });
      if (heatmapData.length > 0) {
        const currentHeatZoom = deckglMapRef.current ? deckglMapRef.current.getZoom() : mapZoom;
        const heatmapRadius = currentHeatZoom >= 10 ? 200 : currentHeatZoom >= 7 ? 120 : currentHeatZoom >= 4 ? 80 : 50;
        const heatmapIntensity = currentHeatZoom >= 8 ? 2.5 : currentHeatZoom >= 5 ? 1.8 : 1.2;
        layers.push(new dk.HeatmapLayer({
          id: "risk-heatmap",
          data: heatmapData,
          getPosition: d => d.position,
          getWeight: d => d.weight,
          radiusPixels: heatmapRadius,
          intensity: heatmapIntensity,
          threshold: 0.01,
          colorRange: [
            [0, 255, 255, 0],
            [78, 205, 196, 100],
            [255, 234, 0, 160],
            [255, 145, 0, 200],
            [255, 23, 68, 230],
            [255, 0, 0, 255]
          ],
          aggregation: "MEAN"
        }));
      }
    }

    if (assetLayerMode !== ASSET_LAYER_MODE_HIDDEN && showAssetMarkers && visibleAssets.length > 0) {
      const pointAssets = [];
      const lineAssets = [];
      const polyAssets = [];
      for (const a of visibleAssets) {
        const gt = a.geometry_type || "Point";
        if (gt === "LineString" && Array.isArray(a.geometry_coordinates)) {
          lineAssets.push(a);
        } else if (gt === "Polygon" && Array.isArray(a.geometry_coordinates)) {
          polyAssets.push(a);
        } else if ((a.lat || a.latitude) && (a.lng || a.longitude)) {
          pointAssets.push(a);
        }
      }

      if (lineAssets.length > 0 && dk.PathLayer) {
        const lineData = lineAssets.map(a => {
          const rs = a.risk_score || a.riskLevel || 0;
          return {
            path: a.geometry_coordinates,
            color: hexToRGBA((ASSET_TYPES[a.asset_type || a.type] || ASSET_TYPES.Other).color, 230),
            width: rs > 70 ? 6 : rs > 50 ? 5 : 4,
            asset: a
          };
        });
        layers.push(new dk.PathLayer({
          id: "asset-polylines",
          data: lineData,
          getPath: d => d.path,
          getColor: [0, 255, 255, 220],
          getWidth: d => d.width,
          widthUnits: "pixels",
          widthMinPixels: 3,
          widthMaxPixels: 10,
          pickable: true,
          jointRounded: true,
          capRounded: true,
          onClick: info => {
            if (info.object?.asset) {
              window.location.href = `/asset-management?asset=${encodeURIComponent(info.object.asset.asset_id)}`;
            }
          }
        }));
      }

      if (polyAssets.length > 0 && dk.SolidPolygonLayer) {
        const polyFill = polyAssets.map(a => {
          const baseColor = (ASSET_TYPES[a.asset_type || a.type] || ASSET_TYPES.Other).color;
          return {
            polygon: a.geometry_coordinates[0] || a.geometry_coordinates,
            color: hexToRGBA(baseColor, 50),
            asset: a
          };
        });
        const polyStroke = polyAssets.map(a => {
          const baseColor = (ASSET_TYPES[a.asset_type || a.type] || ASSET_TYPES.Other).color;
          return {
            path: a.geometry_coordinates[0] || a.geometry_coordinates,
            color: hexToRGBA(baseColor, 230)
          };
        });
        layers.push(new dk.SolidPolygonLayer({
          id: "asset-polygons-fill",
          data: polyFill,
          getPolygon: d => d.polygon,
          getFillColor: d => d.color,
          filled: true,
          pickable: true,
          onClick: info => {
            if (info.object?.asset) {
              window.location.href = `/asset-management?asset=${encodeURIComponent(info.object.asset.asset_id)}`;
            }
          },
          _normalize: false,
          _windingOrder: "CCW"
        }));
        if (dk.PathLayer) {
          layers.push(new dk.PathLayer({
            id: "asset-polygons-stroke",
            data: polyStroke,
            getPath: d => d.path,
            getColor: d => d.color,
            getWidth: 2,
            widthMinPixels: 2,
            pickable: false,
            jointRounded: true,
            capRounded: true
          }));
        }
      }

      if (pointAssets.length > 0) {
        const assetData = pointAssets.map(a => {
          const rs = a.risk_score || a.riskLevel || 0;
          return {
            position: [a.lng || a.longitude, a.lat || a.latitude],
            name: a.name,
            asset_id: a.asset_id,
            asset_type: a.asset_type || a.type,
            risk_score: rs,
            color: hexToRGBA((ASSET_TYPES[a.asset_type || a.type] || ASSET_TYPES.Other).color, 220),
            riskColor: rs > 70 ? [255, 107, 107, 200] : rs > 50 ? [255, 149, 0, 200] : [78, 205, 196, 200],
            _original: a
          };
        });
        layers.push(new dk.ScatterplotLayer({
          id: "asset-markers-outer",
          data: assetData,
          getPosition: d => d.position,
          getRadius: d => d.risk_score > 70 ? 12 : d.risk_score > 50 ? 10 : 8,
          radiusUnits: "pixels",
          radiusMinPixels: 6,
          radiusMaxPixels: 30,
          getFillColor: d => d.riskColor,
          getLineColor: d => d.color,
          lineWidthMinPixels: 2,
          stroked: true,
          filled: true,
          pickable: true,
          autoHighlight: true,
          highlightColor: [0, 255, 255, 100],
          onClick: info => {
            if (info.object) {
              window.location.href = `/asset-management?asset=${encodeURIComponent(info.object.asset_id)}`;
            }
          }
        }));
        layers.push(new dk.ScatterplotLayer({
          id: "asset-markers-inner",
          data: assetData,
          getPosition: d => d.position,
          getRadius: 4,
          radiusUnits: "pixels",
          radiusMinPixels: 3,
          radiusMaxPixels: 12,
          getFillColor: d => d.color,
          pickable: false
        }));
        if (dk.TextLayer) {
          layers.push(new dk.TextLayer({
            id: "asset-labels",
            data: assetData,
            getPosition: d => d.position,
            getText: d => d.name,
            getSize: 14,
            getColor: [255, 255, 255, 220],
            getAngle: 0,
            getTextAnchor: "middle",
            getAlignmentBaseline: "top",
            getPixelOffset: [0, 18],
            fontFamily: "Inter, Arial, sans-serif",
            fontWeight: 600,
            outlineWidth: 3,
            outlineColor: [0, 0, 0, 200],
            billboard: true,
            sizeMinPixels: 10,
            sizeMaxPixels: 16
          }));
        }
      }
    }

    if (!showHeatmap && allRisks.length > 0) {
      const riskPoints = allRisks.filter(r => r.latitude && r.longitude).map(r => ({
        position: [r.longitude, r.latitude],
        severity: r.severity,
        risk_category: r.risk_category,
        title: r.title,
        color: hexToRGBA(SEVERITY_COLORS[r.severity] || "#FFEA00", 200),
        borderColor: hexToRGBA((RISK_CATEGORIES[r.risk_category] || RISK_CATEGORIES.Other).color, 255),
        isPrivate: getRiskVisibility(r) === VISIBILITY_ORG_PRIVATE,
        _original: r
      }));
      layers.push(new dk.ScatterplotLayer({
        id: "risk-event-markers",
        data: riskPoints,
        getPosition: d => d.position,
        getRadius: d => ({ Critical: 14, High: 11, Medium: 9 }[d.severity] || 7),
        radiusUnits: "pixels",
        radiusMinPixels: 5,
        radiusMaxPixels: 25,
        getFillColor: d => d.color,
        getLineColor: d => d.borderColor,
        lineWidthMinPixels: 2,
        stroked: true,
        filled: true,
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 0, 100],
        onClick: info => { if (info.object) { handleSelectRiskEvent(info.object._original); } }
      }));

      if (showVisibilityBadges && riskPoints.some(p => p.isPrivate)) {
        const privatePoints = riskPoints.filter(p => p.isPrivate);
        layers.push(new dk.ScatterplotLayer({
          id: "risk-event-private-badges",
          data: privatePoints,
          getPosition: d => d.position,
          getRadius: 4,
          radiusUnits: "pixels",
          radiusMinPixels: 3,
          radiusMaxPixels: 8,
          getFillColor: [255, 215, 0, 240],
          getLineColor: [0, 0, 0, 200],
          lineWidthMinPixels: 1,
          stroked: true,
          filled: true,
          pickable: false,
          getOffset: [8, -8]
        }));
      }

      const currentZoom = deckglMapRef.current ? deckglMapRef.current.getZoom() : mapZoom;
      if (currentZoom >= 6) {
        const viewBounds = getVisibleBounds();
        const impactRisks = allRisks.filter(r => {
          if (!r.latitude || !r.longitude || !r.impact_radius_km || r.impact_radius_km <= 0) return false;
          if (viewBounds && !isInBounds(r.latitude, r.longitude, viewBounds)) return false;
          return true;
        });
        if (impactRisks.length > 0) {
          const maxCircles = 200;
          const sorted = impactRisks.length > maxCircles
            ? impactRisks.sort((a, b) => (b.impact_radius_km || 0) - (a.impact_radius_km || 0)).slice(0, maxCircles)
            : impactRisks;
          const fillAlpha = Math.max(8, Math.min(30, Math.round(30 - (sorted.length / 10))));
          const strokeAlpha = Math.max(40, Math.min(120, Math.round(120 - (sorted.length / 5))));
          const maxRadiusPixels = currentZoom >= 14 ? 800 : currentZoom >= 10 ? 400 : 200;
          const impactData = sorted.map(r => ({
            position: [r.longitude, r.latitude],
            radius: r.impact_radius_km * 1000,
            fillColor: hexToRGBA(SEVERITY_COLORS[r.severity] || "#FFEA00", fillAlpha),
            lineColor: hexToRGBA(SEVERITY_COLORS[r.severity] || "#FFEA00", strokeAlpha)
          }));
          layers.push(new dk.ScatterplotLayer({
            id: "risk-impact-circles-fill",
            data: impactData,
            getPosition: d => d.position,
            getRadius: d => d.radius,
            radiusUnits: "meters",
            radiusMinPixels: 0,
            radiusMaxPixels: maxRadiusPixels,
            getFillColor: d => d.fillColor,
            getLineColor: d => d.lineColor,
            lineWidthMinPixels: 1,
            stroked: true,
            filled: true,
            pickable: false,
            antialiasing: true
          }));
        }
      }

      const polygonRisks = allRisks.filter(r => r.geometry_type === "Polygon" && r.geometry_coordinates);
      if (polygonRisks.length > 0) {
        const polyFillData = polygonRisks.map(r => {
          try {
            const coords = r.geometry_coordinates[0];
            if (!coords || coords.length < 3) return null;
            return { polygon: coords.map(c => [c[0], c[1]]), color: hexToRGBA(SEVERITY_COLORS[r.severity] || "#FFEA00", 38) };
          } catch {
            return null;
          }
        }).filter(Boolean);
        const polyLineData = polygonRisks.map(r => {
          try {
            const coords = r.geometry_coordinates[0];
            if (!coords || coords.length < 3) return null;
            return { path: coords.map(c => [c[0], c[1]]), color: hexToRGBA(SEVERITY_COLORS[r.severity] || "#FFEA00", 200) };
          } catch {
            return null;
          }
        }).filter(Boolean);
        if (polyFillData.length > 0 && dk.SolidPolygonLayer) {
          layers.push(new dk.SolidPolygonLayer({
            id: "risk-polygon-overlays-fill",
            data: polyFillData,
            getPolygon: d => d.polygon,
            getFillColor: d => d.color,
            filled: true,
            pickable: false,
            _normalize: false,
            _windingOrder: "CCW"
          }));
        } else if (polyFillData.length > 0 && dk.PolygonLayer) {
          layers.push(new dk.PolygonLayer({
            id: "risk-polygon-overlays-fill",
            data: polyFillData,
            getPolygon: d => d.polygon,
            getFillColor: d => d.color,
            getLineColor: [0, 0, 0, 0],
            getLineWidth: 0,
            filled: true,
            stroked: false,
            pickable: false
          }));
        }
        if (polyLineData.length > 0 && dk.PathLayer) {
          layers.push(new dk.PathLayer({
            id: "risk-polygon-overlays-stroke",
            data: polyLineData,
            getPath: d => d.path,
            getColor: d => d.color,
            getWidth: 2,
            widthMinPixels: 1,
            pickable: false,
            jointRounded: true,
            capRounded: true
          }));
        }
      }
    }

    if (areaFilterActive && userArea) {
      let ring = null;
      let centerLng = null;
      let centerLat = null;
      if (userArea.mode === "point_radius") {
        ring = computeGeodesicCircle(userArea.latitude, userArea.longitude, userArea.radius_km, 96);
        centerLng = userArea.longitude;
        centerLat = userArea.latitude;
      } else if (userArea.mode === "bbox") {
        ring = [
          [userArea.min_lng, userArea.min_lat],
          [userArea.max_lng, userArea.min_lat],
          [userArea.max_lng, userArea.max_lat],
          [userArea.min_lng, userArea.max_lat],
          [userArea.min_lng, userArea.min_lat]
        ];
        centerLng = (userArea.min_lng + userArea.max_lng) / 2;
        centerLat = (userArea.min_lat + userArea.max_lat) / 2;
      }
      if (ring) {
        if (dk.SolidPolygonLayer) {
          layers.push(new dk.SolidPolygonLayer({
            id: "user-area-fill",
            data: [{ polygon: ring }],
            getPolygon: d => d.polygon,
            getFillColor: [0, 255, 255, 18],
            filled: true,
            pickable: false,
            _normalize: false,
            _windingOrder: "CCW"
          }));
        }
        if (dk.PathLayer) {
          layers.push(new dk.PathLayer({
            id: "user-area-stroke",
            data: [{ path: ring }],
            getPath: d => d.path,
            getColor: [0, 255, 255, 235],
            getWidth: 3,
            widthMinPixels: 2,
            pickable: false,
            jointRounded: true,
            capRounded: true
          }));
        }
      }
      if (centerLat != null && centerLng != null) {
        const centerData = [{ position: [centerLng, centerLat], name: userArea.name && userArea.name.trim() ? userArea.name.trim() : "My Area" }];
        layers.push(new dk.ScatterplotLayer({
          id: "user-area-center-outer",
          data: centerData,
          getPosition: d => d.position,
          getRadius: 11,
          radiusUnits: "pixels",
          radiusMinPixels: 8,
          radiusMaxPixels: 22,
          getFillColor: [0, 255, 255, 220],
          getLineColor: [255, 255, 255, 240],
          lineWidthMinPixels: 2,
          stroked: true,
          filled: true,
          pickable: false
        }));
        layers.push(new dk.ScatterplotLayer({
          id: "user-area-center-inner",
          data: centerData,
          getPosition: d => d.position,
          getRadius: 4,
          radiusUnits: "pixels",
          radiusMinPixels: 3,
          radiusMaxPixels: 10,
          getFillColor: [0, 30, 35, 230],
          pickable: false
        }));
        if (dk.TextLayer) {
          layers.push(new dk.TextLayer({
            id: "user-area-center-label",
            data: centerData,
            getPosition: d => d.position,
            getText: d => d.name,
            getSize: 13,
            getColor: [0, 255, 255, 240],
            getAngle: 0,
            getTextAnchor: "middle",
            getAlignmentBaseline: "top",
            getPixelOffset: [0, 16],
            fontFamily: "Inter, Arial, sans-serif",
            fontWeight: 700,
            outlineWidth: 3,
            outlineColor: [0, 0, 0, 220],
            billboard: true,
            sizeMinPixels: 10,
            sizeMaxPixels: 16
          }));
        }
      }
    }

    if (selectionGeoJsonRef.current) {
      const selFeatures = (selectionGeoJsonRef.current.features || []);
      const selFillData = selFeatures.map(f => ({ polygon: f.geometry.coordinates[0], fillColor: [0, 255, 255, 56] }));
      const selLineData = selFeatures.map(f => ({ path: f.geometry.coordinates[0], color: [0, 255, 255, 242] }));
      if (selFillData.length > 0 && dk.SolidPolygonLayer) {
        layers.push(new dk.SolidPolygonLayer({
          id: "selection-highlight-fill",
          data: selFillData,
          getPolygon: d => d.polygon,
          getFillColor: d => d.fillColor,
          filled: true,
          pickable: false,
          _normalize: false,
          _windingOrder: "CCW"
        }));
      } else if (selFillData.length > 0 && dk.PolygonLayer) {
        layers.push(new dk.PolygonLayer({
          id: "selection-highlight-fill",
          data: selFillData,
          getPolygon: d => d.polygon,
          getFillColor: d => d.fillColor,
          getLineColor: [0, 0, 0, 0],
          getLineWidth: 0,
          filled: true,
          stroked: false,
          pickable: false
        }));
      }
      if (selLineData.length > 0 && dk.PathLayer) {
        layers.push(new dk.PathLayer({
          id: "selection-highlight-stroke",
          data: selLineData,
          getPath: d => d.path,
          getColor: d => d.color,
          getWidth: 3,
          widthMinPixels: 2,
          pickable: false,
          jointRounded: true,
          capRounded: true
        }));
      }
    }
    return layers;
  }, [visibleAssets, assetLayerMode, showAssetMarkers, filteredRiskData, riskLayersVisible, fetchAssetDetails, mapZoom, getVisibleBounds, isInBounds, handleSelectRiskEvent, areaFilterActive, userArea, showHeatmap, showVisibilityBadges]);

  const updateDeckLayers = useCallback(() => {
    if (deckOverlayRef.current && window.deck) deckOverlayRef.current.setProps({ layers: buildDeckLayers() });
  }, [buildDeckLayers]);

  useEffect(() => { updateDeckLayers(); }, [visibleAssets, showAssetMarkers, assetLayerMode, filteredRiskData, riskLayersVisible, deckLayersVersion, mapZoom, areaFilterActive, userArea, showHeatmap, showVisibilityBadges, updateDeckLayers]);

  const createAnnotationElement = useCallback((asset) => {
    const tc = ASSET_TYPES[asset.type] || ASSET_TYPES[asset.asset_type] || { color: "#888888" };
    const rl = asset.riskLevel || asset.risk_score || 0;
    const rc = riskColor(rl);
    const animated = rl > 50;
    const el = document.createElement("div");
    el.style.cssText = "display:flex;flex-direction:column;align-items:center;cursor:pointer;position:relative;transition:transform 0.2s ease;";
    el.innerHTML = buildAssetPinHTML(tc.color, rc, animated, asset.name);
    el.addEventListener("mouseenter", () => { el.style.transform = "scale(1.1)"; el.style.zIndex = "100"; });
    el.addEventListener("mouseleave", () => { el.style.transform = "scale(1)"; el.style.zIndex = ""; });
    return el;
  }, []);

  const createMarkerElement = useCallback((className, pinStyle, pulseStyle, label, animated) => {
    const el = document.createElement("div");
    el.className = className;
    el.innerHTML = pinStyle + pulseStyle + (label || "");
    if (animated) el.classList.add(className + "-animated");
    return el;
  }, []);

  const createRiskEventMarkerElement = useCallback((risk) => {
    const categoryColor = RISK_CATEGORIES[risk.risk_category]?.color || "#9E9E9E";
    const severityColor = SEVERITY_COLORS[risk.severity] || SEVERITY_COLORS.Medium;
    const isPrivate = getRiskVisibility(risk) === VISIBILITY_ORG_PRIVATE;
    const badgeHtml = (showVisibilityBadges && isPrivate)
      ? `<div class="risk-event-marker-badge" style="position:absolute;top:-4px;right:-4px;width:10px;height:10px;border-radius:50%;background:#FFD700;border:1px solid rgba(0,0,0,0.6);z-index:4;"></div>`
      : "";
    return createMarkerElement("risk-event-marker",
      `<div class="risk-event-marker-pin" style="background:${severityColor};border-color:${categoryColor};"><span class="risk-event-marker-icon"></span>${badgeHtml}</div>`,
      `<div class="risk-event-marker-pulse" style="background:${severityColor};"></div>`,
      null, risk.severity === "Critical" || risk.severity === "High");
  }, [createMarkerElement, showVisibilityBadges]);

  const removeAppleAnnotations = useCallback(() => {
    if (appleMapRef.current) annotationsRef.current.forEach(a => { try { appleMapRef.current.removeAnnotation(a); } catch { } });
    annotationsRef.current = [];
  }, []);

  const addAppleAnnotationsNow = useCallback(() => {
    if (!appleMapRef.current || !window.mapkit || !showAssetMarkers || assetLayerMode === ASSET_LAYER_MODE_HIDDEN) {
      removeAppleAnnotations();
      return;
    }
    removeAppleAnnotations();
    const bounds = getVisibleBounds();
    const visible = bounds ? visibleAssets.filter(a => {
      const lat = a.lat || a.latitude;
      const lng = a.lng || a.longitude;
      return lat && lng && isInBounds(lat, lng, bounds);
    }) : visibleAssets;
    visible.forEach(asset => {
      const lat = asset.lat || asset.latitude;
      const lng = asset.lng || asset.longitude;
      if (!lat || !lng) return;
      const factory = () => {
        const el = createAnnotationElement(asset);
        el.addEventListener("click", event => {
          event.stopPropagation();
          window.location.href = `/asset-management?asset=${encodeURIComponent(asset.asset_id)}`;
        });
        return el;
      };
      const ann = new window.mapkit.Annotation(new window.mapkit.Coordinate(lat, lng), factory, { anchorOffset: new DOMPoint(0, -14), calloutEnabled: false, animates: false });
      ann._assetData = asset;
      appleMapRef.current.addAnnotation(ann);
      annotationsRef.current.push(ann);
    });
  }, [visibleAssets, showAssetMarkers, assetLayerMode, createAnnotationElement, removeAppleAnnotations, getVisibleBounds, isInBounds]);

  const clearAppleRiskMarkers = useCallback(() => {
    if (appleMapRef.current) {
      riskMarkersRef.current.forEach(m => { try { appleMapRef.current.removeAnnotation(m); } catch { } });
      riskOverlaysRef.current.forEach(o => { try { appleMapRef.current.removeOverlay(o); } catch { } });
      impactCirclesRef.current.forEach(c => { try { appleMapRef.current.removeOverlay(c); } catch { } });
    }
    riskMarkersRef.current = [];
    riskOverlaysRef.current = [];
    impactCirclesRef.current = [];
  }, []);

  const addAppleRiskMarkersNow = useCallback(() => {
    if (!appleMapRef.current || !window.mapkit) return;
    clearAppleRiskMarkers();
    if (showHeatmap) return;
    const bounds = getVisibleBounds();
    const allRisks = [];
    Object.entries(filteredRiskData).forEach(([cat, risks]) => {
      if (!riskLayersVisible[cat] || !risks?.length) return;
      allRisks.push(...risks);
    });
    const visible = bounds ? allRisks.filter(r => r.latitude && r.longitude && isInBounds(r.latitude, r.longitude, bounds)) : allRisks;
    visible.forEach(risk => {
      const lat = risk.latitude;
      const lng = risk.longitude;
      if (!lat || !lng) return;
      const coord = new window.mapkit.Coordinate(lat, lng);
      if (risk.impact_radius_km > 0) {
        const sc = SEVERITY_COLORS[risk.severity] || "#FFEA00";
        const circle = new window.mapkit.CircleOverlay(coord, risk.impact_radius_km * 1000, { style: new window.mapkit.Style({ strokeColor: sc, strokeOpacity: 0.6, lineWidth: 2, fillColor: sc, fillOpacity: 0.1 }) });
        appleMapRef.current.addOverlay(circle);
        impactCirclesRef.current.push(circle);
      }
      if (risk.geometry_type === "Polygon" && risk.geometry_coordinates) {
        try {
          const coords = risk.geometry_coordinates[0];
          if (coords?.length > 2) {
            const sc = SEVERITY_COLORS[risk.severity] || "#FFEA00";
            const overlay = new window.mapkit.PolygonOverlay([coords.map(c => new window.mapkit.Coordinate(c[1], c[0]))], { style: new window.mapkit.Style({ strokeColor: sc, strokeOpacity: 0.8, lineWidth: 2, fillColor: sc, fillOpacity: 0.15 }) });
            appleMapRef.current.addOverlay(overlay);
            riskOverlaysRef.current.push(overlay);
          }
        } catch (error) { }
      }
      const factory = () => {
        const el = createRiskEventMarkerElement(risk);
        el.addEventListener("click", event => { event.stopPropagation(); handleSelectRiskEvent(risk); });
        return el;
      };
      const ann = new window.mapkit.Annotation(coord, factory, { anchorOffset: new DOMPoint(0, 0), calloutEnabled: false, animates: false });
      ann._riskData = risk;
      appleMapRef.current.addAnnotation(ann);
      riskMarkersRef.current.push(ann);
    });
  }, [filteredRiskData, riskLayersVisible, clearAppleRiskMarkers, createRiskEventMarkerElement, handleSelectRiskEvent, getVisibleBounds, isInBounds, showHeatmap]);

  const clearAppleUserAreaOverlays = useCallback(() => {
    if (appleMapRef.current) {
      userAreaOverlaysRef.current.forEach(o => { try { appleMapRef.current.removeOverlay(o); } catch { } });
      if (userAreaAnnotationRef.current) {
        try { appleMapRef.current.removeAnnotation(userAreaAnnotationRef.current); } catch { }
      }
    }
    userAreaOverlaysRef.current = [];
    userAreaAnnotationRef.current = null;
  }, []);

  const drawAppleUserAreaNow = useCallback(() => {
    if (!appleMapRef.current || !window.mapkit) return;
    clearAppleUserAreaOverlays();
    if (!areaFilterActive || !userArea) return;
    const style = new window.mapkit.Style({
      strokeColor: "#00FFFF",
      strokeOpacity: 0.85,
      lineWidth: 3,
      fillColor: "#00FFFF",
      fillOpacity: 0.07,
      lineDash: [6, 4]
    });
    let pinLat = null;
    let pinLng = null;
    if (userArea.mode === "point_radius") {
      const overlay = new window.mapkit.CircleOverlay(
        new window.mapkit.Coordinate(userArea.latitude, userArea.longitude),
        userArea.radius_km * 1000,
        { style }
      );
      appleMapRef.current.addOverlay(overlay);
      userAreaOverlaysRef.current.push(overlay);
      pinLat = userArea.latitude;
      pinLng = userArea.longitude;
    } else if (userArea.mode === "bbox") {
      const coords = [
        new window.mapkit.Coordinate(userArea.min_lat, userArea.min_lng),
        new window.mapkit.Coordinate(userArea.min_lat, userArea.max_lng),
        new window.mapkit.Coordinate(userArea.max_lat, userArea.max_lng),
        new window.mapkit.Coordinate(userArea.max_lat, userArea.min_lng)
      ];
      const overlay = new window.mapkit.PolygonOverlay([coords], { style });
      appleMapRef.current.addOverlay(overlay);
      userAreaOverlaysRef.current.push(overlay);
      pinLat = (userArea.min_lat + userArea.max_lat) / 2;
      pinLng = (userArea.min_lng + userArea.max_lng) / 2;
    }
    if (pinLat != null && pinLng != null) {
      const label = userArea.name && userArea.name.trim() ? userArea.name.trim() : "My Area";
      const factory = () => {
        const el = document.createElement("div");
        el.style.cssText = "display:flex;flex-direction:column;align-items:center;cursor:pointer;position:relative;";
        el.innerHTML = buildAssetPinHTML("#00FFFF", "#FFFFFF", true, label);
        return el;
      };
      const ann = new window.mapkit.Annotation(
        new window.mapkit.Coordinate(pinLat, pinLng),
        factory,
        { anchorOffset: new DOMPoint(0, -14), calloutEnabled: false, animates: false, displayPriority: 1000 }
      );
      appleMapRef.current.addAnnotation(ann);
      userAreaAnnotationRef.current = ann;
    }
  }, [areaFilterActive, userArea, clearAppleUserAreaOverlays]);

  const addAnnotations = useCallback(() => { activeProvider === MAP_PROVIDER_APPLE ? addAppleAnnotationsNow() : setDeckLayersVersion(v => v + 1); }, [activeProvider, addAppleAnnotationsNow]);
  const addRiskMarkers = useCallback(() => { activeProvider === MAP_PROVIDER_APPLE ? addAppleRiskMarkersNow() : setDeckLayersVersion(v => v + 1); }, [activeProvider, addAppleRiskMarkersNow]);

  const navigateToLocation = useCallback((lat, lng, zoom = 10, pitch = 60, bearing = 0, name = "") => {
    const useApple = zoom >= APPLE_MAPS_ZOOM_THRESHOLD && appleMapReadyRef.current;
    if (useApple && activeProvider !== MAP_PROVIDER_APPLE) switchToProvider(MAP_PROVIDER_APPLE, lat, lng, zoom, pitch, bearing);
    else if (!useApple && activeProvider !== MAP_PROVIDER_DECKGL) switchToProvider(MAP_PROVIDER_DECKGL, lat, lng, zoom, pitch, bearing);
    if (useApple && appleMapRef.current && window.mapkit) {
      const span = 360 / Math.pow(2, zoom);
      appleMapRef.current.setRegionAnimated(new window.mapkit.CoordinateRegion(new window.mapkit.Coordinate(lat, lng), new window.mapkit.CoordinateSpan(span, span)), true);
      appleMapRef.current.rotation = bearing;
    } else if (deckglMapRef.current) {
      deckglMapRef.current.flyTo({ center: [lng, lat], zoom, pitch, bearing, duration: 2000 });
    }
    setCurrentLocation(name || `${lat.toFixed(2)}°, ${lng.toFixed(2)}°`);
  }, [activeProvider, switchToProvider]);

  const navigateToAsset = useCallback((asset) => {
    setSelectedAsset(asset.asset_id);
    fetchAssetDetails(asset.asset_id);
    navigateToLocation(asset.lat || asset.latitude, asset.lng || asset.longitude, 14, 50, 0, asset.name);
  }, [navigateToLocation, fetchAssetDetails]);

  const navigateToRiskEvent = useCallback((risk) => {
    if (risk.latitude && risk.longitude) {
      handleSelectRiskEvent(risk);
      navigateToLocation(risk.latitude, risk.longitude, 10, 45, 0, risk.title);
    }
  }, [navigateToLocation, handleSelectRiskEvent]);

  const flyToUserArea = useCallback(() => {
    if (!userArea) return;
    if (userArea.mode === "point_radius") {
      const targetZoom = userArea.radius_km > 1000 ? 4 : userArea.radius_km > 500 ? 5 : userArea.radius_km > 200 ? 6 : userArea.radius_km > 100 ? 7 : userArea.radius_km > 50 ? 8 : 9;
      navigateToLocation(userArea.latitude, userArea.longitude, targetZoom, 0, 0, describeArea(userArea));
    } else {
      fitToBoundsDeferred(userArea);
    }
  }, [userArea, navigateToLocation, fitToBoundsDeferred]);

  useEffect(() => { flyToUserAreaRef.current = flyToUserArea; }, [flyToUserArea]);

  const resetToGlobe = useCallback(() => {
    if (activeProvider !== MAP_PROVIDER_DECKGL) switchToProvider(MAP_PROVIDER_DECKGL, 20, 0, 2, 0, 0);
    if (deckglMapRef.current) deckglMapRef.current.flyTo({ center: [0, 20], zoom: 1, pitch: 0, bearing: 0, duration: 2000 });
    setCurrentLocation("Globe");
  }, [activeProvider, switchToProvider]);

  const zoomToFeature = useCallback(() => {
    if (!selectedFeature?.geometry) return;
    const bbox = calculateBoundingBox(selectedFeature.geometry);
    if (activeProvider === MAP_PROVIDER_APPLE && appleMapRef.current && window.mapkit) {
      appleMapRef.current.setRegionAnimated(new window.mapkit.CoordinateRegion(new window.mapkit.Coordinate((bbox.minLat + bbox.maxLat) / 2, (bbox.minLng + bbox.maxLng) / 2), new window.mapkit.CoordinateSpan((bbox.maxLat - bbox.minLat) * 1.5, (bbox.maxLng - bbox.minLng) * 1.5)), true);
    } else if (deckglMapRef.current) {
      deckglMapRef.current.fitBounds([[bbox.minLng, bbox.minLat], [bbox.maxLng, bbox.maxLat]], { padding: 50, maxZoom: 19, duration: 1500 });
    }
  }, [selectedFeature, activeProvider]);

  const fallbackSearch = useCallback(async (query) => {
    try {
      const data = await (await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`)).json();
      setSearchResults(data.map(item => ({
        id: item.place_id,
        name: item.display_name,
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon)
      })));
    } catch (error) {
      setSearchResults([]);
    }
    setIsSearching(false);
  }, []);

  const searchLocation = useCallback(async (query) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      if (window.mapkit && appleMapReadyRef.current) {
        new window.mapkit.Search().search(query, (error, data) => {
          if (error || !data?.places) {
            fallbackSearch(query);
            return;
          }
          setSearchResults(data.places.slice(0, 5).map((p, i) => ({
            id: i,
            name: p.name + (p.formattedAddress ? ", " + p.formattedAddress : ""),
            lat: p.coordinate.latitude,
            lng: p.coordinate.longitude
          })));
          setIsSearching(false);
        });
      } else {
        await fallbackSearch(query);
      }
    } catch (error) {
      await fallbackSearch(query);
    }
  }, [fallbackSearch]);

  const toggle3DTerrain = useCallback(() => {
    const nv = !show3DTerrain;
    setShow3DTerrain(nv);
    if (deckglMapRef.current) {
      try {
        if (nv) {
          if (!deckglMapRef.current.getSource("terrain-source")) deckglMapRef.current.addSource("terrain-source", { type: "raster-dem", tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 15, encoding: "terrarium" });
          deckglMapRef.current.setTerrain({ source: "terrain-source", exaggeration: 1.5 });
        } else {
          deckglMapRef.current.setTerrain(null);
        }
      } catch (error) { }
    }
  }, [show3DTerrain]);

  const toggleSatellite = useCallback(() => {
    const nv = !showSatellite;
    setShowSatellite(nv);
    if (appleMapRef.current && window.mapkit) appleMapRef.current.mapType = nv ? (showLabels ? window.mapkit.Map.MapTypes.Hybrid : window.mapkit.Map.MapTypes.Satellite) : window.mapkit.Map.MapTypes.Standard;
    if (deckglMapRef.current) {
      try {
        if (nv) {
          deckglMapRef.current.setLayoutProperty("satellite-layer", "visibility", "visible");
          deckglMapRef.current.setLayoutProperty("labels-layer", "visibility", "visible");
          if (deckglMapRef.current.getLayer("topo-layer")) deckglMapRef.current.setLayoutProperty("topo-layer", "visibility", "none");
          deckglMapRef.current._riskBaseStyle = "satellite";
        } else {
          deckglMapRef.current.setLayoutProperty("satellite-layer", "visibility", "none");
          deckglMapRef.current.setLayoutProperty("labels-layer", "visibility", "none");
          if (!deckglMapRef.current.getSource("topo-tiles")) deckglMapRef.current.addSource("topo-tiles", { type: "raster", tiles: ["https://a.tile.opentopomap.org/{z}/{x}/{y}.png", "https://b.tile.opentopomap.org/{z}/{x}/{y}.png", "https://c.tile.opentopomap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 17 });
          if (!deckglMapRef.current.getLayer("topo-layer")) deckglMapRef.current.addLayer({ id: "topo-layer", type: "raster", source: "topo-tiles", minzoom: 0, maxzoom: 8 }, deckglMapRef.current.getLayer("satellite-layer") ? "satellite-layer" : undefined);
          deckglMapRef.current.setLayoutProperty("topo-layer", "visibility", "visible");
          deckglMapRef.current._riskBaseStyle = "topo";
        }
      } catch (error) { }
    }
  }, [showSatellite, showLabels]);

  const toggleBuildings = useCallback(() => {
    const nv = !showBuildings;
    setShowBuildings(nv);
    if (appleMapRef.current && window.mapkit) appleMapRef.current.showsPointsOfInterest = nv;
  }, [showBuildings]);

  const cycleAssetLayerMode = useCallback(() => {
    setAssetLayerMode(prev => {
      if (prev === ASSET_LAYER_MODE_ALL) return ASSET_LAYER_MODE_OWNED;
      if (prev === ASSET_LAYER_MODE_OWNED) return ASSET_LAYER_MODE_HIDDEN;
      return ASSET_LAYER_MODE_ALL;
    });
  }, []);

  useEffect(() => { document.body.className = `risk-theme-${theme}`; return () => { document.body.className = ""; }; }, [theme]);
  useEffect(() => {
    let t;
    if (searchTerm) t = setTimeout(() => searchLocation(searchTerm), 300);
    else setSearchResults([]);
    return () => clearTimeout(t);
  }, [searchTerm, searchLocation]);
  useEffect(() => {
    selectionModeRef.current = selectionMode;
    if (deckglMapRef.current) selectionMode ? deckglMapRef.current.doubleClickZoom.disable() : deckglMapRef.current.doubleClickZoom.enable();
  }, [selectionMode]);
  useEffect(() => { queryFeatureAtPointRef.current = queryFeatureAtPoint; }, [queryFeatureAtPoint]);

  useEffect(() => {
    showHeatmapRef.current = showHeatmap;
    if (deckglMapRef.current) {
      try { deckglMapRef.current.setMaxZoom(showHeatmap ? 18 : 7); } catch (error) { }
    }
  }, [showHeatmap]);

  useEffect(() => {
    try {
      if (userArea) localStorage.setItem(USER_AREA_STORAGE_KEY, JSON.stringify(userArea));
      else localStorage.removeItem(USER_AREA_STORAGE_KEY);
    } catch (error) { }
  }, [userArea]);

  useEffect(() => {
    try {
      localStorage.setItem(AREA_FILTER_ACTIVE_STORAGE_KEY, areaFilterActive ? "true" : "false");
    } catch (error) { }
  }, [areaFilterActive]);

  useEffect(() => {
    if (!mapReady) return;
    if (!initialFetchDoneRef.current) {
      fetchAssets();
      fetchRiskDataSources();
      initialFetchDoneRef.current = true;
    }
    fetchRiskIntelligenceAll(null);
  }, [mapReady]);

  useEffect(() => { if (mapReady && visibleAssets.length >= 0) addAnnotations(); }, [mapReady, visibleAssets, assetLayerMode, addAnnotations]);
  useEffect(() => { if (mapReady) addRiskMarkers(); }, [mapReady, filteredRiskData, riskLayersVisible, addRiskMarkers]);
  useEffect(() => { if (mapReady && activeProvider === MAP_PROVIDER_APPLE) drawAppleUserAreaNow(); }, [mapReady, activeProvider, areaFilterActive, userArea, drawAppleUserAreaNow]);

  useEffect(() => {
    pruneIntervalRef.current = setInterval(() => {
      setRiskIntelligenceData(prev => {
        const { pruned, removedCount } = pruneExpiredRisks(prev);
        if (removedCount === 0) return prev;
        const newSummary = computeRiskSummary(pruned);
        setRiskIntelligenceSummary(newSummary);
        setAlertCount(newSummary.critical);
        streamingDataRef.current = pruned;
        streamingSummaryRef.current = newSummary;
        return pruned;
      });
    }, 60000);
    return () => { if (pruneIntervalRef.current) clearInterval(pruneIntervalRef.current); };
  }, []);

  useEffect(() => {
    if (!mapContainerRef.current) return;
    let cancelled = false;
    const createDiv = (display) => {
      const d = document.createElement("div");
      Object.assign(d.style, { width: "100%", height: "100%", position: "absolute", top: "0", left: "0", display });
      mapContainerRef.current.appendChild(d);
      return d;
    };
    appleMapContainerRef.current = createDiv("none");
    deckglMapContainerRef.current = createDiv("block");

    const initDeck = () => loadDeckGlDeps().then(() => {
      if (cancelled) return;
      if (!window.maplibregl) throw new Error("MapLibre GL not loaded.");
      if (!window.deck?.MapboxOverlay) throw new Error("Deck.gl not loaded.");
      const map = initDeckGlMap();
      if (!map) throw new Error("Deck.gl MapLibre initialization failed.");
      deckglMapRef.current = map;
      mapRef.current = map;
      mapProviderRef.current = MAP_PROVIDER_DECKGL;
      setMapProvider(MAP_PROVIDER_DECKGL);
      setActiveProvider(MAP_PROVIDER_DECKGL);
      setMapLoaded(true);
      setShowSatellite(true);
      const onReady = () => {
        if (cancelled) return;
        try {
          if (window.deck?.MapboxOverlay) {
            const overlay = new window.deck.MapboxOverlay({ interleaved: true, layers: [] });
            map.addControl(overlay);
            deckOverlayRef.current = overlay;
          }
        } catch (error) { }
        deckglMapReadyRef.current = true;
        setMapReady(true);
      };
      map.loaded() ? onReady() : map.on("load", onReady);
      map.on("error", () => { });
    });

    const initApple = () => loadMapKitJS().then(mapkit => {
      if (cancelled) return;
      return new Promise((resolve, reject) => {
        let settled = false;
        const map = initAppleMap(mapkit);
        if (!map) {
          reject(new Error("Apple Map initialization failed."));
          return;
        }
        const onErr = () => {
          if (settled) return;
          settled = true;
          mapkit.removeEventListener("error", onErr);
          try { map.destroy(); } catch { }
          reject(new Error("MapKit authorization failed."));
        };
        mapkit.addEventListener("error", onErr);
        setTimeout(() => {
          if (settled || cancelled) return;
          settled = true;
          mapkit.removeEventListener("error", onErr);
          appleMapRef.current = map;
          appleMapReadyRef.current = true;
          resolve();
        }, 3000);
      });
    });

    initDeck().then(() => {
      if (!cancelled) return initApple().catch(() => { setMapProviderError("Apple Maps unavailable for close zoom. Using Deck.gl only."); });
    }).catch(() => {
      if (!cancelled) { setMapProviderError("Map provider failed to load."); }
    });

    return () => {
      cancelled = true;
      if (riskStreamRef.current) { riskStreamRef.current.close(); riskStreamRef.current = null; }
      if (nearbyStreamRef.current) { nearbyStreamRef.current.close(); nearbyStreamRef.current = null; }
      if (ingestionStreamRef.current) { ingestionStreamRef.current.close(); ingestionStreamRef.current = null; }
      if (deckOverlayRef.current && deckglMapRef.current) { try { deckglMapRef.current.removeControl(deckOverlayRef.current); } catch { } deckOverlayRef.current = null; }
      if (appleMapRef.current) { try { appleMapRef.current.destroy(); } catch { } appleMapRef.current = null; }
      if (deckglMapRef.current) { try { deckglMapRef.current.remove(); } catch { } deckglMapRef.current = null; }
      mapRef.current = null;
    };
  }, [loadMapKitJS, loadDeckGlDeps, initAppleMap, initDeckGlMap]);

  useEffect(() => {
    if (!mapReady) return;
    const params = new URLSearchParams(window.location.search);
    const lat = parseFloat(params.get("lat"));
    const lng = parseFloat(params.get("lng"));
    const zoom = parseFloat(params.get("zoom")) || 14;
    const assetId = params.get("asset");
    const viewId = params.get("view");
    if (!isNaN(lat) && !isNaN(lng)) {
      navigateToLocation(lat, lng, zoom, 50, 0, assetId ? "Asset" : `${lat.toFixed(2)}°, ${lng.toFixed(2)}°`);
    }
    if (assetId) {
      setSelectedAsset(assetId);
      fetchAssetDetails(assetId);
    }
    if (viewId) {
      const view = savedViews.find(v => v.view_id === viewId);
      if (view) applySavedView(view);
    }
    if (params.toString()) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [mapReady]);

  const criticalAssets = useMemo(() => assets.filter(a => (a.riskLevel || a.risk_score || 0) > 70).length, [assets]);
  const elevatedAssets = useMemo(() => assets.filter(a => {
    const r = a.riskLevel || a.risk_score || 0;
    return r > 50 && r <= 70;
  }).length, [assets]);
  const nominalAssets = useMemo(() => assets.filter(a => (a.riskLevel || a.risk_score || 0) <= 50).length, [assets]);
  const totalRiskEvents = useMemo(() => Object.values(riskIntelligenceData).reduce((s, arr) => s + (arr?.length || 0), 0), [riskIntelligenceData]);
  const userAreaLabel = useMemo(() => describeArea(userArea), [userArea]);

  const closeModal = useCallback(() => {
    setActiveModal(null);
    setNearbyRisks(null);
  }, []);

  const StatsList = ({ items, onItemClick }) => (
    <div className="riskStatsList">
      {items.map((item, i) => (
        <div key={i} className={`riskStatsListItem${onItemClick ? " riskStatsListItemClickable" : ""}`} onClick={onItemClick ? () => onItemClick(item) : undefined}>
          <span style={item.color ? { color: item.color } : undefined}>{item.label}</span>
          <span className={item.badgeClass || ""} style={item.valueColor ? { color: item.valueColor } : undefined}>{item.value}</span>
        </div>
      ))}
    </div>
  );

  const LoadingSpinner = ({ text }) => <div className="riskTableLoading"><FontAwesomeIcon icon={faSpinner} spin /> {text}</div>;
  const EmptyState = ({ text }) => <div className="riskHistoryEmpty">{text}</div>;

  const SIDEBAR_ACTIONS = [
    [faPlus, "Manage Assets", () => window.location.href = "/asset-management"],
    [faMapPin, userArea ? "Edit My Area" : "Set My Area", openMyAreaModal],
    [faBookmark, "Saved Views", () => setActiveModal("savedViews")],
    [faSave, "Save This View", openSaveViewModal],
    [faLayerGroup, "Risk Layers", () => setActiveModal("riskLayers")],
    [faShieldHalved, "Intelligence", () => setActiveModal("riskIntel")],
    [faBullseye, "Nearby Query", () => openNearbyQueryModal(mapCenter.lat, mapCenter.lng)],
    [faDatabase, "Data Sources", () => setActiveModal("dataSources")],
    [faGears, "Ingestion Worker", () => { setActiveModal("ingestionStatus"); fetchIngestionStatus(); }],
    [faBroom, "Cleanup Worker", () => { setActiveModal("cleanupStatus"); fetchCleanupStatus(); }],
    [faHeartPulse, "Health", () => { setActiveModal("healthStatus"); fetchHealthStatus(); }],
    [faRefresh, "Refresh", refreshRiskIntelligence, riskIntelligenceLoading]
  ];

  return (
    <div className="riskPageWrapper">
      <Nav activePage={"risk"} />
      <div className={`riskCommandCenterContainer risk-theme-${theme}`}>
        {apiError && (
          <div className="riskNotification riskNotificationError">
            <FontAwesomeIcon icon={faExclamationCircle} />
            <span>{apiError}</span>
            <button onClick={() => setApiError(null)}><FontAwesomeIcon icon={faTimes} /></button>
          </div>
        )}
        {apiSuccess && (
          <div className="riskNotification riskNotificationSuccess">
            <FontAwesomeIcon icon={faCheckCircle} />
            <span>{apiSuccess}</span>
            <button onClick={() => setApiSuccess(null)}><FontAwesomeIcon icon={faTimes} /></button>
          </div>
        )}
        <div className={`riskSideBar risk-sidebar ${sidebarCollapsed ? "riskSideBarCollapsed" : ""}`}>
          <div className="riskSideBarHeader">
            <div className="riskSideBarStatusIndicator">
              <div className="riskStatusDot" style={{ backgroundColor: riskColor(globalRiskIndex) }} />
              <span>Global Risk Index: {globalRiskIndex}</span>
            </div>
            <div className="riskAlertBanner">
              <span className="riskAlertIcon"><FontAwesomeIcon icon={faTriangleExclamation} /></span>
              <span>{filteredRiskSummary.critical} Critical {areaFilterActive && userArea ? "in My Area" : "Alerts"}</span>
            </div>
            {areaFilterActive && userArea && (
              <div className="riskAlertBanner" style={{ background: "rgba(0, 255, 255, 0.08)", borderColor: "rgba(0, 255, 255, 0.3)", borderLeftColor: "#00FFFF", color: "#00FFFF" }}>
                <span className="riskAlertIcon"><FontAwesomeIcon icon={faMapPin} /></span>
                <span>Area: {userAreaLabel}</span>
              </div>
            )}
          </div>
          <div className="riskSearchControls">
            <div className="riskSearchInputWrapper">
              <input type="text" placeholder="Search locations..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="riskSearchInput" />
              {isSearching && <div className="riskSearchSpinner" />}
            </div>
            {searchResults.length > 0 && (
              <div className="riskSearchResults">
                {searchResults.map(r => (
                  <div key={r.id} className="riskSearchResultItem" onClick={() => { navigateToLocation(r.lat, r.lng, 12, 50, 0, r.name.split(",")[0]); setSearchTerm(""); setSearchResults([]); }}>
                    <span className="riskSearchResultName">{r.name.substring(0, 60)}...</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="riskIntelligenceSummarySection">
            <div className="riskIntelligenceSummaryHeader">
              <small>{areaFilterActive && userArea ? "My Area Risks" : "Risk Intelligence"}</small>
              {riskIntelligenceLastUpdated && <span className="riskLastUpdated">Updated: {riskIntelligenceLastUpdated.toLocaleTimeString()}</span>}
            </div>
            <div className="riskIntelligenceSummaryGrid">
              {["critical", "high", "medium", "low"].map(sev => (
                <div key={sev} className={`riskSummaryItem riskSummary${sev.charAt(0).toUpperCase() + sev.slice(1)}`}>
                  <span className="riskSummaryValue">{filteredRiskSummary[sev]}</span>
                  <span className="riskSummaryLabel">{sev.charAt(0).toUpperCase() + sev.slice(1)}</span>
                </div>
              ))}
            </div>
            <div className="riskCategoryBreakdown">
              {RISK_INTELLIGENCE_CATEGORIES.map(cat => (
                <div key={cat.id} className="riskCategoryItem" onClick={() => toggleRiskLayer(cat.id)}>
                  <span className="riskCategoryIcon" style={{ color: cat.color, opacity: riskLayersVisible[cat.id] ? 1 : 0.4 }}><FontAwesomeIcon icon={cat.icon} /></span>
                  <span className="riskCategoryName" style={{ opacity: riskLayersVisible[cat.id] ? 1 : 0.5 }}>{cat.name}</span>
                  <span className="riskCategoryCount">{filteredRiskData[cat.id]?.length || 0}</span>
                  <span className="riskCategoryToggle"><FontAwesomeIcon icon={riskLayersVisible[cat.id] ? faEye : faEyeSlash} /></span>
                </div>
              ))}
            </div>
          </div>
          <div className="riskSidebarActions">
            {SIDEBAR_ACTIONS.map(([icon, label, action, disabled], i) => (
              <button key={i} className="riskSidebarButton" onClick={action} disabled={disabled}>
                <FontAwesomeIcon icon={icon} spin={disabled} /> {label}
              </button>
            ))}
          </div>
          <div className="riskSidebarMapControls">
            {[
              [`${show3DTerrain ? "Disable" : "Enable"} 3D Terrain`, toggle3DTerrain],
              [`${showSatellite ? "Topo View" : "Satellite View"}`, toggleSatellite],
              [`${showBuildings ? "Hide" : "Show"} Points of Interest`, toggleBuildings],
              ["Reset Rotation", () => { if (appleMapRef.current) appleMapRef.current.rotation = 0; if (deckglMapRef.current) deckglMapRef.current.setBearing(0); }],
              [`Assets: ${assetLayerMode === ASSET_LAYER_MODE_ALL ? "All" : assetLayerMode === ASSET_LAYER_MODE_OWNED ? "Owned" : "Hidden"}`, cycleAssetLayerMode],
              [`${showHeatmap ? "Hide" : "Show"} Heatmap`, () => setShowHeatmap(v => !v)],
              [`${showVisibilityBadges ? "Hide" : "Show"} Visibility Badges`, () => setShowVisibilityBadges(v => !v)]
            ].map(([label, action], i) => <button key={i} className="riskSidebarButton" onClick={action}>{label}</button>)}
          </div>
          {assets.length > 0 && (
            <div className="riskAssetList">
              <div className="riskAssetListHeader"><small>Assets ({visibleAssets.length}/{assets.length})</small></div>
              <div className="riskAssetListItems">
                {visibleAssets.slice(0, 20).map(asset => (
                  <div key={asset.asset_id} className={`riskAssetListItem ${selectedAsset === asset.asset_id ? "riskAssetListItemSelected" : ""}`} onClick={() => navigateToAsset(asset)}>
                    <div className="riskAssetListItemInfo">
                      <span className="riskAssetListItemName">{asset.name}</span>
                      <span className="riskAssetListItemType">{asset.asset_type || asset.type}{asset.geometry_type && asset.geometry_type !== "Point" ? ` · ${asset.geometry_type}` : ""}</span>
                    </div>
                    <div className="riskAssetListItemRisk" style={{ backgroundColor: riskColor(asset.risk_score || asset.riskLevel || 0) }}>{asset.risk_score || asset.riskLevel || 0}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="riskMainView">
          <div className="riskViewHeader">
            <div className="riskHeaderControls">
              {(isLoadingAssets || riskIntelligenceLoading) && (
                <div className="riskLocationDisplay">
                  <div className="riskHeaderLoadingIndicator">
                    <FontAwesomeIcon icon={faSpinner} spin />
                    <span>Loading...</span>
                  </div>
                </div>
              )}
              <div className="riskLocationDisplay">
                <span className="riskLocationIcon"><FontAwesomeIcon icon={faLocationCrosshairs} /></span>
                <span>{currentLocation}</span>
              </div>
              {mapProvider && <div className="riskCameraInfo"><span>Provider: {activeProvider === MAP_PROVIDER_APPLE ? "Apple Maps" : "Deck.gl + MapLibre"}</span></div>}
              <div className="riskCameraInfo"><span>Zoom: {mapZoom.toFixed(1)}</span></div>
              <div className="riskCameraInfo"><span>Events: {totalRiskEvents}</span></div>
              <button
                className={`riskHeaderButton ${areaFilterActive ? "riskButtonActive" : ""}`}
                onClick={toggleAreaFilter}
                title={userArea ? `${areaFilterActive ? "Disable" : "Enable"} My Area filter` : "Set up your preferred area"}
              >
                <FontAwesomeIcon icon={faMapPin} />
                {userArea ? `My Area: ${areaFilterActive ? "On" : "Off"}` : "Set My Area"}
              </button>
              {userArea && (
                <button className="riskHeaderButton" onClick={openMyAreaModal} title="Edit preferred area">
                  <FontAwesomeIcon icon={faEdit} /> Edit Area
                </button>
              )}
              {areaFilterActive && userArea && (
                <button className="riskHeaderButton" onClick={flyToUserArea} title="Zoom to my area">
                  <FontAwesomeIcon icon={faCrosshairs} /> Zoom to Area
                </button>
              )}
              <button
                className={`riskHeaderButton ${showHeatmap ? "riskButtonActive" : ""}`}
                onClick={() => setShowHeatmap(v => !v)}
                title="Toggle heatmap rendering"
              >
                <FontAwesomeIcon icon={faHeat} /> Heatmap
              </button>
              <button className="riskHeaderButton" onClick={openSaveViewModal} title="Save current view">
                <FontAwesomeIcon icon={faBookmark} /> Save View
              </button>
              <button className={`riskHeaderButton ${selectionMode ? "riskButtonActive" : ""}`} onClick={() => { setSelectionMode(!selectionMode); if (selectionMode) clearSelection(); }}>
                <FontAwesomeIcon icon={faObjectGroup} /> Select
              </button>
              <button className="riskHeaderButton" onClick={() => assessLocationRisk(mapCenter.lat, mapCenter.lng, 100)} disabled={isAssessingLocation}>
                <FontAwesomeIcon icon={faCrosshairs} spin={isAssessingLocation} /> Assess
              </button>
              <button className="riskHeaderButton" onClick={() => openNearbyQueryModal(mapCenter.lat, mapCenter.lng)}><FontAwesomeIcon icon={faBullseye} /> Nearby</button>
              <button className="riskHeaderButton" onClick={resetToGlobe}><FontAwesomeIcon icon={faGlobe} /> Globe</button>
            </div>
          </div>
          <div className="riskMapWrapper">
            <div ref={mapContainerRef} className={`riskMapContainer ${selectionMode ? "riskMapSelectionCursor" : ""}`} />
            {selectionMode && (
              <div className="riskSelectionModeIndicator" style={{ zIndex: 2000 }}>
                <span className="riskSelectionModePulse" />
                <span>SELECTION MODE — Click any feature to identify & measure.</span>
                {isSelectingFeature && <span className="riskSearchSpinner riskSelectionSpinner" />}
              </div>
            )}
            {areaFilterActive && userArea && !selectionMode && (
              <div className="riskSelectionModeIndicator" style={{ zIndex: 1999, top: 16 }}>
                <span className="riskSelectionModePulse" />
                <span>FILTERING TO MY AREA — {userAreaLabel}</span>
              </div>
            )}
            {selectionError && <div className="riskSelectionError" style={{ zIndex: 2000 }}><span>{selectionError}</span></div>}
            {!mapReady && (
              <div className="riskMapLoadingOverlay" style={{ zIndex: 2001 }}>
                <div className="riskMapLoadingContent">
                  <label>Initializing Deck.gl + MapLibre.</label>
                  {mapProviderError && <small className="riskMapProviderError">{mapProviderError}</small>}
                  <div className="riskMapLoadingBar"><div className={`riskMapLoadingBarAccent ${mapLoaded ? "riskMapLoadingBarFast" : ""}`} /></div>
                  <small>{mapLoaded ? "Loading terrain and elevation data." : "Connecting to map services."}</small>
                </div>
              </div>
            )}
          </div>
        </div>

        <Modal open={activeModal === "myArea"} onClose={() => setActiveModal(null)} title="My Preferred Area" size="Medium">
          <p style={{ fontSize: "0.75rem", color: "var(--risk-text-tertiary)", marginBottom: "var(--risk-spacing-md)", lineHeight: 1.5 }}>
            Define your preferred area to filter all alerts, summaries, and map markers to that region only. Choose a point with a radius (circular area around an address or coordinates) or a bounding box (rectangular area).
          </p>
          <div className="riskFormGroup">
            <label>Area Name (optional)</label>
            <input type="text" value={areaFormData.name} onChange={e => handleAreaFormChange("name", e.target.value)} placeholder="e.g. Houston Metro, North Bay, My Region" maxLength="80" />
          </div>
          <div className="riskFormGroup">
            <label>Area Mode</label>
            <select value={areaFormData.mode} onChange={e => handleAreaFormChange("mode", e.target.value)}>
              <option value="point_radius">Point + Radius (circular area)</option>
              <option value="bbox">Bounding Box (rectangular area)</option>
            </select>
          </div>
          {areaFormData.mode === "point_radius" && (
            <>
              <div className="riskFormGroup">
                <label>Address (geocoded to coordinates)</label>
                <div style={{ display: "flex", gap: "var(--risk-spacing-sm)" }}>
                  <input type="text" value={areaFormData.address} onChange={e => handleAreaFormChange("address", e.target.value)} placeholder="e.g. Houston, TX or 1600 Pennsylvania Ave" style={{ flex: 1 }} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleGeocodeArea(); } }} />
                  <button type="button" className="riskModalBtnSecondary" onClick={handleGeocodeArea} disabled={isGeocodingArea || !areaFormData.address?.trim()}>
                    {isGeocodingArea ? <><FontAwesomeIcon icon={faSpinner} spin /> Geocoding</> : <><FontAwesomeIcon icon={faLocationCrosshairs} /> Geocode</>}
                  </button>
                </div>
              </div>
              <div className="riskFormRow">
                <div className="riskFormGroup"><label>Latitude *</label><input type="number" step="any" value={areaFormData.latitude} onChange={e => handleAreaFormChange("latitude", e.target.value)} placeholder="-90 to 90" required /></div>
                <div className="riskFormGroup"><label>Longitude *</label><input type="number" step="any" value={areaFormData.longitude} onChange={e => handleAreaFormChange("longitude", e.target.value)} placeholder="-180 to 180" required /></div>
                <div className="riskFormGroup"><label>Radius (km) *</label><input type="number" min="1" max="10000" step="any" value={areaFormData.radius_km} onChange={e => handleAreaFormChange("radius_km", e.target.value)} placeholder="100" required /></div>
              </div>
              <button type="button" className="riskModalBtnSecondary" onClick={useMapCenterForArea}><FontAwesomeIcon icon={faLocationCrosshairs} /> Use Current Map Center</button>
            </>
          )}
          {areaFormData.mode === "bbox" && (
            <>
              <div className="riskFormRow">
                <div className="riskFormGroup"><label>Min Latitude (south) *</label><input type="number" step="any" value={areaFormData.min_lat} onChange={e => handleAreaFormChange("min_lat", e.target.value)} placeholder="-90 to 90" required /></div>
                <div className="riskFormGroup"><label>Max Latitude (north) *</label><input type="number" step="any" value={areaFormData.max_lat} onChange={e => handleAreaFormChange("max_lat", e.target.value)} placeholder="-90 to 90" required /></div>
              </div>
              <div className="riskFormRow">
                <div className="riskFormGroup"><label>Min Longitude (west) *</label><input type="number" step="any" value={areaFormData.min_lng} onChange={e => handleAreaFormChange("min_lng", e.target.value)} placeholder="-180 to 180" required /></div>
                <div className="riskFormGroup"><label>Max Longitude (east) *</label><input type="number" step="any" value={areaFormData.max_lng} onChange={e => handleAreaFormChange("max_lng", e.target.value)} placeholder="-180 to 180" required /></div>
              </div>
              <button type="button" className="riskModalBtnSecondary" onClick={useMapViewForArea}><FontAwesomeIcon icon={faMap} /> Use Current Map View</button>
            </>
          )}
          {userArea && (
            <>
              <div className="riskAssessmentDivider" />
              <div className="riskMetadataItem"><span className="riskMetadataLabel">Currently Saved</span><span className="riskMetadataValue">{describeArea(userArea)}</span></div>
              <div className="riskMetadataItem"><span className="riskMetadataLabel">Filter Status</span><span className="riskMetadataValue" style={{ color: areaFilterActive ? "#00E676" : "#FF9100" }}>{areaFilterActive ? "Active — filtering all alerts to this area" : "Inactive — showing global alerts"}</span></div>
            </>
          )}
          <div className="riskModalActions">
            {userArea && <button className="riskModalBtnDanger" onClick={clearUserArea}><FontAwesomeIcon icon={faTrash} /> Clear Area</button>}
            <button className="riskModalBtnSecondary" onClick={() => setActiveModal(null)}>Cancel</button>
            <button className="riskModalBtnPrimary" onClick={() => handleSaveArea(true)}><FontAwesomeIcon icon={faSave} /> Save & Activate Filter</button>
          </div>
        </Modal>

        <Modal open={activeModal === "saveView"} onClose={() => setActiveModal(null)} title="Save Current View" size="Medium">
          <p style={{ fontSize: "0.75rem", color: "var(--risk-text-tertiary)", marginBottom: "var(--risk-spacing-md)", lineHeight: 1.5 }}>
            Capture the current map position, zoom, and selected filters as a named view. Saved views work as quick bookmarks and seed configurations for alert rules in the Alerts page.
          </p>
          <div className="riskFormGroup"><label>View Name *</label><input type="text" value={saveViewFormData.name} onChange={e => handleSaveViewFormChange("name", e.target.value)} placeholder="e.g. Houston Petrochem Corridor" maxLength="120" /></div>
          <div className="riskFormGroup"><label>Description (optional)</label><textarea value={saveViewFormData.description} onChange={e => handleSaveViewFormChange("description", e.target.value)} placeholder="What does this view monitor? What's important about it?" maxLength="400" rows="3" /></div>
          <div className="riskFormGroup">
            <label>Include in this saved view</label>
            <label className="riskCheckboxRow"><input type="checkbox" checked={saveViewFormData.include_filters} onChange={e => handleSaveViewFormChange("include_filters", e.target.checked)} /><span>Risk filters and My Area settings</span></label>
            <label className="riskCheckboxRow"><input type="checkbox" checked={saveViewFormData.include_layers} onChange={e => handleSaveViewFormChange("include_layers", e.target.checked)} /><span>Map layer toggles (heatmap, dependencies, asset visibility, etc.)</span></label>
          </div>
          <div className="riskAssessmentDivider" />
          <div className="riskMetadataItem"><span className="riskMetadataLabel">Capturing</span><span className="riskMetadataValue">Center {mapCenter.lat.toFixed(3)}°, {mapCenter.lng.toFixed(3)}° at zoom {mapZoom.toFixed(1)}.</span></div>
          <div className="riskModalActions">
            <button className="riskModalBtnSecondary" onClick={() => setActiveModal(null)}>Cancel</button>
            <button className="riskModalBtnPrimary" onClick={handleSaveCurrentView}><FontAwesomeIcon icon={faSave} /> Save View</button>
          </div>
        </Modal>

        <Modal open={activeModal === "savedViews"} onClose={() => setActiveModal(null)} title={`Saved Views (${savedViews.length})`} size="Large">
          <div className="riskGoldenMeshActions">
            <button className="riskModalBtnPrimary" onClick={() => { setActiveModal(null); openSaveViewModal(); }}><FontAwesomeIcon icon={faPlus} /> Save Current View</button>
            <button className="riskModalBtnSecondary" onClick={fetchSavedViewsFromBackend}><FontAwesomeIcon icon={faRefresh} /> Refresh</button>
          </div>
          {savedViews.length === 0 ? (
            <EmptyState text="No saved views yet. Use Save View to capture your current map and filter setup." />
          ) : (
            <div className="riskSavedViewsList">
              {savedViews.map(view => (
                <div key={view.view_id} className="riskSavedViewItem">
                  <div className="riskSavedViewInfo">
                    <span className="riskSavedViewName">{describeSavedView(view)}</span>
                    {view.description && <span className="riskSavedViewDescription">{view.description}</span>}
                    <span className="riskSavedViewMeta">
                      {view.center ? `${view.center.lat.toFixed(2)}°, ${view.center.lng.toFixed(2)}°` : ""}
                      {view.zoom != null ? ` · z${view.zoom.toFixed(1)}` : ""}
                      {view.created_at ? ` · ${getRelativeTime(view.created_at)}` : ""}
                    </span>
                    <div className="riskSavedViewTags">
                      {view.filters && <span className="riskSavedViewTag">filters</span>}
                      {view.layers && <span className="riskSavedViewTag">layers</span>}
                    </div>
                  </div>
                  <div className="riskSavedViewActions">
                    <button className="riskSavedViewBtn riskSavedViewBtnPrimary" onClick={() => applySavedView(view)}><FontAwesomeIcon icon={faCrosshairs} /> Apply</button>
                    <button className="riskSavedViewBtn riskSavedViewBtnDanger" onClick={() => deleteSavedView(view.view_id)}><FontAwesomeIcon icon={faTrash} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>

        <Modal open={activeModal === "nearbyQuery"} onClose={() => setActiveModal(null)} title="Spatial Nearby Query (PostGIS)" size="Large">
          <form onSubmit={handleNearbyQuerySubmit}>
            <div className="riskFormRow">
              {[["Latitude *", "latitude", "number", "-90 to 90", true], ["Longitude *", "longitude", "number", "-180 to 180", true], ["Radius (km)", "radius_km", "number", "100"]].map(([label, field, type, ph, req], i) => (
                <div key={i} className="riskFormGroup"><label>{label}</label><input type={type} step="any" value={nearbyFormData[field]} onChange={e => handleNearbyFormChange(field, e.target.value)} placeholder={ph} required={req} /></div>
              ))}
            </div>
            <div className="riskFormRow">
              <div className="riskFormGroup"><label>Category</label><select value={nearbyFormData.category} onChange={e => handleNearbyFormChange("category", e.target.value)}><option value="">All Categories</option>{RISK_INTELLIGENCE_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
              <div className="riskFormGroup"><label>Severity</label><select value={nearbyFormData.severity} onChange={e => handleNearbyFormChange("severity", e.target.value)}><option value="">All Severities</option>{PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
              <div className="riskFormGroup"><label>Limit</label><input type="number" min="1" max="500" value={nearbyFormData.limit} onChange={e => handleNearbyFormChange("limit", e.target.value)} placeholder="50" /></div>
            </div>
            <div className="riskFormRow"><div className="riskFormGroup"><label>Source</label><input type="text" value={nearbyFormData.source} onChange={e => handleNearbyFormChange("source", e.target.value)} placeholder="Filter by source" /></div></div>
            <div className="riskModalActions">
              <button type="button" className="riskModalBtnSecondary" onClick={() => setNearbyFormData(prev => ({ ...prev, latitude: mapCenter.lat.toFixed(6), longitude: mapCenter.lng.toFixed(6) }))}><FontAwesomeIcon icon={faLocationCrosshairs} /> Use Map Center</button>
              {userArea && userArea.mode === "point_radius" && (
                <button type="button" className="riskModalBtnSecondary" onClick={() => setNearbyFormData(prev => ({ ...prev, latitude: userArea.latitude.toFixed(6), longitude: userArea.longitude.toFixed(6), radius_km: userArea.radius_km.toString() }))}><FontAwesomeIcon icon={faMapPin} /> Use My Area</button>
              )}
              <button type="submit" className="riskModalBtnPrimary" disabled={isLoadingNearby}>{isLoadingNearby ? <><FontAwesomeIcon icon={faSpinner} spin /> Querying...</> : <><FontAwesomeIcon icon={faBullseye} /> Query Nearby</>}</button>
            </div>
          </form>
          {nearbyRisks && (
            <>
              <div className="riskAssessmentDivider" />
              <div className="riskNearbyResultsHeader">
                <span>Found {nearbyRisks.total_count || nearbyRisks.risks?.length || 0} risks within {nearbyFormData.radius_km} km.</span>
                {nearbyRisks.query_time_ms !== undefined && <span className="riskNearbyQueryTime">Query: {nearbyRisks.query_time_ms}ms</span>}
              </div>
              {nearbyRisks.by_severity && (
                <div className="riskIntelFeedSummary">
                  {[["critical", "Critical", "riskIntelFeedSummaryCritical"], ["high", "High", "riskIntelFeedSummaryHigh"], ["medium", "Medium", "riskIntelFeedSummaryMedium"], ["low", "Low", ""]].map(([key, label, cls]) => (
                    <div key={key} className={`riskIntelFeedSummaryItem ${cls}`}><span className="riskIntelFeedSummaryValue">{nearbyRisks.by_severity[key] || 0}</span><span className="riskIntelFeedSummaryLabel">{label}</span></div>
                  ))}
                </div>
              )}
              <div className="riskIntelFeedList">
                {(nearbyRisks.risks || []).slice(0, 50).map((risk, idx) => (
                  <div key={idx} className="riskIntelFeedItem" onClick={() => { navigateToRiskEvent(risk); setActiveModal(null); }}>
                    <div className="riskIntelFeedItemIcon" style={{ backgroundColor: SEVERITY_COLORS[risk.severity] }}><FontAwesomeIcon icon={getRiskCategoryIcon(risk.risk_category)} /></div>
                    <div className="riskIntelFeedItemInfo">
                      <span className="riskIntelFeedItemTitle">
                        {risk.title}
                        {getRiskVisibility(risk) === VISIBILITY_ORG_PRIVATE && <span className="riskVisibilityBadge riskVisibilityBadgePrivate"><FontAwesomeIcon icon={faLock} /> org</span>}
                      </span>
                      <span className="riskIntelFeedItemMeta">{risk.risk_category} • {risk.source} • {getRelativeTime(risk.event_time)}</span>
                      {risk.distance_km !== undefined && <span className="riskIntelFeedItemImpact"><FontAwesomeIcon icon={faRuler} /> {risk.distance_km.toFixed(1)} km away</span>}
                    </div>
                    <div className="riskIntelFeedItemSeverity" style={{ backgroundColor: SEVERITY_COLORS[risk.severity] }}>{risk.severity}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Modal>

        <Modal open={activeModal === "ingestionStatus"} onClose={() => { setActiveModal(null); disconnectIngestionStream(); }} title="Ingestion Worker Status" size="Large">
          <div className="riskGoldenMeshActions">
            <button className="riskModalBtnSecondary" onClick={fetchIngestionStatus} disabled={isLoadingIngestionStatus}><FontAwesomeIcon icon={faRefresh} spin={isLoadingIngestionStatus} /> Refresh Status</button>
            <button className={`riskModalBtn${ingestionStreamConnected ? "Danger" : "Primary"}`} onClick={ingestionStreamConnected ? disconnectIngestionStream : connectIngestionStream}>
              <FontAwesomeIcon icon={ingestionStreamConnected ? faTimes : faSatellite} /> {ingestionStreamConnected ? "Disconnect Live Feed" : "Connect Live Feed"}
            </button>
          </div>
          {ingestionStreamConnected && ingestionProgress.length > 0 && (
            <>
              <div className="riskStatsDivider" />
              <div className="riskStatsSection">
                <h4><FontAwesomeIcon icon={faSatellite} style={{ marginRight: "8px", color: "#00E676" }} />Live Ingestion Feed</h4>
                <div className="riskDetectionHistoryList">
                  {[...ingestionProgress].reverse().slice(0, 20).map((entry, idx) => (
                    <div key={idx} className="riskDetectionHistoryItem">
                      <div className="riskDetectionHistoryItemHeader">
                        <span className="riskDetectionHistoryBadge" style={{ backgroundColor: entry.type === "completed" ? "#00E676" : entry.type === "started" ? "#42A5F5" : entry.error ? "#FF1744" : "#FFEA00" }}>
                          {entry.type === "completed" ? "Completed" : entry.type === "started" ? "Started" : entry.error ? "Error" : entry.source || "Progress"}
                        </span>
                        <span className="riskDetectionHistoryDate">{formatRiskTime(entry.timestamp)}</span>
                      </div>
                      <div className="riskDetectionHistoryItemBody">
                        {entry.type === "progress" && <span>{entry.source}: {entry.count >= 0 ? `${formatNumber(entry.count)} events` : "Failed."}</span>}
                        {entry.type === "completed" && <span>Total ingested: {formatNumber(entry.total_ingested || 0)} events. Errors: {entry.errors || 0}.</span>}
                        {entry.type === "started" && <span>Ingestion cycle initiated.</span>}
                        {entry.error && <span style={{ color: "#FF1744" }}>{entry.error}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
          {isLoadingIngestionStatus ? <LoadingSpinner text="Loading ingestion status." /> : ingestionStatus ? (
            <>
              <div className="riskStatsGrid">
                {(() => {
                  const isActive = ingestionStatus.currently_running || (ingestionStatus.recent_runs?.length > 0 && ingestionStatus.interval_seconds > 0);
                  const isExecuting = ingestionStatus.currently_running;
                  const statusLabel = isExecuting ? "Ingesting" : isActive ? "Active" : "Inactive";
                  const statusColor = isExecuting ? "#42A5F5" : isActive ? "#00E676" : "#FF1744";
                  const intervalMin = ingestionStatus.interval_seconds ? Math.round(ingestionStatus.interval_seconds / 60) : (ingestionStatus.ingestion_interval_minutes || "N/A");
                  const cachedEvents = ingestionStatus.in_memory_events || ingestionStatus.cache_stats?.total_events || ingestionStatus.cached_events || ingestionStatus.event_count || 0;
                  const totalIngested = ingestionStatus.total_ingested_lifetime || ingestionStatus.total_ingested || (ingestionStatus.recent_runs?.length > 0 ? (ingestionStatus.recent_runs[0].total_ingested || ingestionStatus.recent_runs[0].events_ingested || 0) : 0);
                  return [
                    [statusLabel, "Worker Status", { color: statusColor }],
                    [intervalMin, "Interval (min)"],
                    [formatNumber(cachedEvents), "Cached Events"],
                    [formatNumber(totalIngested), "Last Cycle Events"]
                  ];
                })().map(([val, label, opts], i) => (
                  <div key={i} className="riskStatCard"><span className="riskStatCardValue" style={opts}>{val}</span><span className="riskStatCardLabel">{label}</span></div>
                ))}
              </div>
              {ingestionStatus.by_category && (
                <><div className="riskStatsDivider" /><div className="riskStatsSection"><h4>Cache by Category</h4><StatsList items={Object.entries(ingestionStatus.by_category).map(([k, v]) => ({ label: k, value: formatNumber(v) }))} /></div></>
              )}
              {ingestionStatus.by_severity && (
                <><div className="riskStatsDivider" /><div className="riskStatsSection"><h4>Cache by Severity</h4><StatsList items={Object.entries(ingestionStatus.by_severity).map(([k, v]) => ({ label: k, value: formatNumber(v), color: SEVERITY_COLORS[k] }))} /></div></>
              )}
              {ingestionStatus.recent_runs?.length > 0 && (
                <><div className="riskStatsDivider" /><div className="riskStatsSection"><h4>Recent Ingestion Runs</h4>
                  <div className="riskDetectionHistoryList">
                    {ingestionStatus.recent_runs.map((run, idx) => (
                      <div key={idx} className="riskDetectionHistoryItem">
                        <div className="riskDetectionHistoryItemHeader">
                          <span className="riskDetectionHistoryBadge" style={{ backgroundColor: run.status === "completed" ? "#00E676" : run.status === "completed_with_errors" || run.status === "partial" ? "#FFEA00" : "#FF1744" }}>{run.status || "Unknown"}</span>
                          <span className="riskDetectionHistoryDate">{formatRiskTime(run.started_at || run.timestamp)}</span>
                        </div>
                        <div className="riskDetectionHistoryItemBody">
                          <span>Events: {formatNumber(run.total_ingested || 0)}</span>
                          {run.duration_ms !== undefined && <span>Duration: {formatDuration(run.duration_ms)}</span>}
                          {run.errors > 0 && <span style={{ color: "#FF1744" }}>Errors: {run.errors}</span>}
                        </div>
                      </div>
                    ))}
                  </div></div></>
              )}
              {ingestionStatus.error_counts && Object.keys(ingestionStatus.error_counts).length > 0 && (
                <><div className="riskStatsDivider" /><div className="riskStatsSection"><h4>Error Counts by Source</h4><StatsList items={Object.entries(ingestionStatus.error_counts).map(([k, v]) => ({ label: k, value: v, color: "#FF9100", valueColor: "#FF1744" }))} /></div></>
              )}
              {ingestionStatus.last_successful_run && (
                <><div className="riskStatsDivider" /><div className="riskStatsSection"><h4>Last Successful Run</h4><StatsList items={[{ label: "Time", value: formatRiskTime(ingestionStatus.last_successful_run) }, { label: "Relative", value: getRelativeTime(ingestionStatus.last_successful_run) }]} /></div></>
              )}
            </>
          ) : <EmptyState text="No ingestion status data available." />}
        </Modal>

        <Modal open={activeModal === "cleanupStatus"} onClose={() => setActiveModal(null)} title="Cleanup Worker Status" size="Large">
          <div className="riskGoldenMeshActions">
            <button className="riskModalBtnSecondary" onClick={fetchCleanupStatus} disabled={isLoadingCleanupStatus}><FontAwesomeIcon icon={faRefresh} spin={isLoadingCleanupStatus} /> Refresh Status</button>
            <button className="riskModalBtnPrimary" onClick={triggerCleanup} disabled={isTriggeringCleanup || (cleanupStatus && cleanupStatus.currently_running)}>
              {isTriggeringCleanup ? <><FontAwesomeIcon icon={faSpinner} spin /> Triggering...</> : <><FontAwesomeIcon icon={faBroom} /> Trigger Cleanup</>}
            </button>
          </div>
          {isLoadingCleanupStatus ? <LoadingSpinner text="Loading cleanup status." /> : cleanupStatus ? (
            <>
              <div className="riskStatsGrid">
                {(() => {
                  const isRunning = cleanupStatus.currently_running;
                  const statusLabel = isRunning ? "Running" : "Idle";
                  const statusColor = isRunning ? "#42A5F5" : "#00E676";
                  const intervalMin = cleanupStatus.interval_seconds ? Math.round(cleanupStatus.interval_seconds / 60) : "N/A";
                  return [
                    [statusLabel, "Worker Status", { color: statusColor }],
                    [intervalMin, "Interval (min)"],
                    [cleanupStatus.configuration?.expired_grace_days || "N/A", "Expired Grace (days)"],
                    [cleanupStatus.configuration?.ingestion_run_retention_days || "N/A", "Run Retention (days)"]
                  ];
                })().map(([val, label, opts], i) => (
                  <div key={i} className="riskStatCard"><span className="riskStatCardValue" style={opts}>{val}</span><span className="riskStatCardLabel">{label}</span></div>
                ))}
              </div>
              {cleanupStatus.configuration && (
                <>
                  <div className="riskStatsDivider" />
                  <div className="riskStatsSection">
                    <h4><FontAwesomeIcon icon={faGears} style={{ marginRight: "8px" }} />Cleanup Configuration</h4>
                    <StatsList items={[
                      { label: "Delete Batch Size", value: formatNumber(cleanupStatus.configuration.delete_batch_size) },
                      { label: "Delete Max Iterations", value: formatNumber(cleanupStatus.configuration.delete_max_iterations) },
                      { label: "Dedup Max Iterations", value: formatNumber(cleanupStatus.configuration.dedup_max_iterations) },
                      { label: "Geom Batch Size", value: formatNumber(cleanupStatus.configuration.geom_batch_size) },
                      { label: "Geom Max Iterations", value: formatNumber(cleanupStatus.configuration.geom_max_iterations) },
                      { label: "Expired Grace Days", value: cleanupStatus.configuration.expired_grace_days },
                      { label: "Ingestion Run Retention Days", value: cleanupStatus.configuration.ingestion_run_retention_days }
                    ]} />
                  </div>
                </>
              )}
              <div className="riskStatsDivider" />
              <div className="riskStatsSection">
                <h4><FontAwesomeIcon icon={faCircleInfo} style={{ marginRight: "8px" }} />Cleanup Operations</h4>
                <StatsList items={[
                  { label: "Remove No-Location Rows", value: "Deletes rows with no latitude, longitude, or geometry data." },
                  { label: "Remove Expired Events", value: `Deletes events expired more than ${cleanupStatus.configuration?.expired_grace_days || 7} days ago.` },
                  { label: "Deduplicate Events", value: "Removes duplicate events by source and source_id, keeping newest." },
                  { label: "Backfill Geometry", value: "Creates geom column for rows with lat/lng but NULL geom." },
                  { label: "Analyze Table", value: "Runs ANALYZE on risk_events_cache for query optimization." },
                  { label: "Purge Old Runs", value: `Removes ingestion run records older than ${cleanupStatus.configuration?.ingestion_run_retention_days || 7} days.` }
                ]} />
              </div>
            </>
          ) : <EmptyState text="No cleanup status data available." />}
        </Modal>

        <Modal open={activeModal === "healthStatus"} onClose={() => setActiveModal(null)} title="System Health Dashboard" size="Large">
          <div className="riskGoldenMeshActions">
            <button className="riskModalBtnSecondary" onClick={fetchHealthStatus} disabled={isLoadingHealth}><FontAwesomeIcon icon={faRefresh} spin={isLoadingHealth} /> Refresh Health</button>
          </div>
          {isLoadingHealth ? <LoadingSpinner text="Checking system health." /> : healthStatus ? (
            <>
              <div className="riskStatsGrid">
                <div className="riskStatCard"><span className="riskStatCardValue" style={{ color: healthStatusColor(healthStatus.status) }}>{(healthStatus.status || "Unknown").toUpperCase()}</span><span className="riskStatCardLabel">Overall Status</span></div>
                {healthStatus.uptime_seconds !== undefined && <div className="riskStatCard"><span className="riskStatCardValue">{formatDuration(healthStatus.uptime_seconds * 1000)}</span><span className="riskStatCardLabel">Uptime</span></div>}
                {healthStatus.timestamp && <div className="riskStatCard"><span className="riskStatCardValue" style={{ fontSize: "0.75rem" }}>{formatRiskTime(healthStatus.timestamp)}</span><span className="riskStatCardLabel">Checked At</span></div>}
              </div>
              {[
                [healthStatus.external_apis, "External API Connectivity", faEarthAmericas, hs =>
                  Object.entries(hs).map(([api, info]) => ({
                    label: api,
                    value: `${typeof info === "object" ? info.status : info}${typeof info === "object" && info.latency_ms !== undefined ? ` (${info.latency_ms}ms)` : ""}`,
                    valueColor: healthStatusColor(typeof info === "object" ? info.status : info)
                  }))
                ],
              ].filter(([data]) => data).map(([data, title, icon, getItems], i) => (
                <React.Fragment key={i}>
                  <div className="riskStatsDivider" />
                  <div className="riskStatsSection"><h4><FontAwesomeIcon icon={icon} style={{ marginRight: "8px" }} />{title}</h4><StatsList items={getItems(data)} /></div>
                </React.Fragment>
              ))}
            </>
          ) : <EmptyState text="No health status data available." />}
        </Modal>

        <Modal open={activeModal === "dataSources"} onClose={() => setActiveModal(null)} title={`Data Sources (${riskDataSources.length})`} size="Large">
          <div className="riskDataSourcesGrid">
            {riskDataSources.map((source, idx) => (
              <div key={idx} className="riskDataSourceCard">
                <div className="riskDataSourceHeader">
                  <span className="riskDataSourceName">{source.name}</span>
                  <span className="riskDataSourceCategory" style={{ backgroundColor: RISK_CATEGORIES[source.category]?.color || "#607D8B" }}>{source.category}</span>
                </div>
                <div className="riskDataSourceDetails">
                  <div className="riskDataSourceDetailItem"><span className="riskDataSourceLabel">Update Frequency</span><span className="riskDataSourceValue">{source.update_frequency}</span></div>
                  <div className="riskDataSourceDetailItem"><span className="riskDataSourceLabel">Coverage</span><span className="riskDataSourceValue">{source.coverage}</span></div>
                  {source.data_types && (
                    <div className="riskDataSourceDetailItem riskDataSourceDetailItemWide">
                      <span className="riskDataSourceLabel">Data Types</span>
                      <div className="riskDataSourceTags">{source.data_types.map((dt, i) => <span key={i} className="riskDataSourceTag">{dt}</span>)}</div>
                    </div>
                  )}
                </div>
                <a href={source.url} target="_blank" rel="noopener noreferrer" className="riskDataSourceLink"><FontAwesomeIcon icon={faExternalLinkAlt} /> Visit Source</a>
              </div>
            ))}
          </div>
        </Modal>

        <Modal open={activeModal === "riskLayers"} onClose={() => setActiveModal(null)} title="Risk Intelligence Layers" size="Medium">
          <div className="riskLayersGrid">
            {RISK_INTELLIGENCE_CATEGORIES.map(cat => (
              <div key={cat.id} className={`riskLayerCard ${riskLayersVisible[cat.id] ? "riskLayerCardActive" : ""}`} onClick={() => toggleRiskLayer(cat.id)}>
                <div className="riskLayerCardIcon" style={{ backgroundColor: cat.color }}><FontAwesomeIcon icon={cat.icon} /></div>
                <div className="riskLayerCardInfo"><span className="riskLayerCardName">{cat.name}</span><span className="riskLayerCardCount">{riskIntelligenceData[cat.id]?.length || 0} events</span></div>
                <div className="riskLayerCardToggle"><FontAwesomeIcon icon={riskLayersVisible[cat.id] ? faEye : faEyeSlash} /></div>
              </div>
            ))}
          </div>
          <div className="riskLayersDivider" />
          <div className="riskLayersActions">
            {[["Show All", () => { const all = {}; RISK_INTELLIGENCE_CATEGORIES.forEach(c => all[c.id] = true); setRiskLayersVisible(all); }],
            ["Hide All", () => { const all = {}; RISK_INTELLIGENCE_CATEGORIES.forEach(c => all[c.id] = false); setRiskLayersVisible(all); }]
            ].map(([label, action], i) => <button key={i} className="riskLayersActionBtn" onClick={action}>{label}</button>)}
            <button className="riskLayersActionBtn riskLayersActionBtnPrimary" onClick={refreshRiskIntelligence} disabled={riskIntelligenceLoading}><FontAwesomeIcon icon={faRefresh} spin={riskIntelligenceLoading} /> Refresh Data</button>
          </div>
        </Modal>

        <Modal open={activeModal === "riskIntel"} onClose={() => setActiveModal(null)} title={areaFilterActive && userArea ? `Risk Intelligence Feed — ${userAreaLabel}` : "Risk Intelligence Feed"} size="Large">
          <div className="riskIntelFeedSummary">
            {[["total", "Total Events", ""], ["critical", "Critical", "riskIntelFeedSummaryCritical"], ["high", "High", "riskIntelFeedSummaryHigh"], ["medium", "Medium", "riskIntelFeedSummaryMedium"]].map(([key, label, cls]) => (
              <div key={key} className={`riskIntelFeedSummaryItem ${cls}`}><span className="riskIntelFeedSummaryValue">{riskIntelligenceSummary[key]}</span><span className="riskIntelFeedSummaryLabel">{label}</span></div>
            ))}
          </div>
          <div className="riskIntelFeedList">
            {Object.entries(riskIntelligenceData).flatMap(([cat, risks]) =>
              risks.slice(0, 10).map((risk, idx) => (
                <div key={`${cat}-${idx}`} className="riskIntelFeedItem" onClick={() => { navigateToRiskEvent(risk); setActiveModal(null); }}>
                  <div className="riskIntelFeedItemIcon" style={{ backgroundColor: SEVERITY_COLORS[risk.severity] }}><FontAwesomeIcon icon={getRiskCategoryIcon(risk.risk_category)} /></div>
                  <div className="riskIntelFeedItemInfo">
                    <span className="riskIntelFeedItemTitle">
                      {risk.title}
                      {getRiskVisibility(risk) === VISIBILITY_ORG_PRIVATE && <span className="riskVisibilityBadge riskVisibilityBadgePrivate"><FontAwesomeIcon icon={faLock} /> org</span>}
                    </span>
                    <span className="riskIntelFeedItemMeta">{risk.risk_category} • {risk.source} • {getRelativeTime(risk.event_time)}</span>
                    {risk.impact_radius_km && <span className="riskIntelFeedItemImpact"><FontAwesomeIcon icon={faRuler} /> {risk.impact_radius_km} km impact radius</span>}
                    {risk.golden_mesh_detection && Object.keys(risk.golden_mesh_detection).length > 0 && (
                      <span className="riskIntelFeedItemMeshFlag" style={{ color: deformationSeverityColor(risk.golden_mesh_detection.severity) }}><FontAwesomeIcon icon={faCubes} /> Mesh detection: {risk.golden_mesh_detection.severity || "flagged"}</span>
                    )}
                  </div>
                  <div className="riskIntelFeedItemSeverity" style={{ backgroundColor: SEVERITY_COLORS[risk.severity] }}>{risk.severity}</div>
                </div>
              ))
            ).slice(0, 50)}
          </div>
        </Modal>

        <Modal open={activeModal === "locationAssess" && !!locationAssessment} onClose={() => setActiveModal(null)} title="Location Risk Assessment" size="Medium">
          {locationAssessment && (
            <>
              <div className="riskAssessmentHeader">
                <div className="riskAssessmentScoreCircle" style={{ borderColor: severityColorFn(locationAssessment.assessment.risk_level) }}>
                  <span className="riskAssessmentScoreValue">{locationAssessment.assessment.risk_score}</span>
                  <span className="riskAssessmentScoreLabel">Risk Score</span>
                </div>
                <div className="riskAssessmentInfo">
                  <div className="riskAssessmentLevel" style={{ color: severityColorFn(locationAssessment.assessment.risk_level) }}>{locationAssessment.assessment.risk_level} Risk</div>
                  <div className="riskAssessmentLocation">{locationAssessment.location.latitude.toFixed(4)}°, {locationAssessment.location.longitude.toFixed(4)}°</div>
                  <div className="riskAssessmentRadius">Radius: {locationAssessment.radius_km} km • {locationAssessment.assessment.total_risks_nearby} risks nearby</div>
                  {locationAssessment.location.nearest_city && <div className="riskAssessmentNearestCity">Near: {locationAssessment.location.nearest_city} ({locationAssessment.location.population_density})</div>}
                </div>
              </div>
              {locationAssessment.assessment.ground_deformation_zones > 0 && (
                <><div className="riskAssessmentDeformationBanner"><FontAwesomeIcon icon={faLayerGroup} style={{ color: "#B388FF" }} /><span>{locationAssessment.assessment.ground_deformation_zones} active ground deformation zone{locationAssessment.assessment.ground_deformation_zones > 1 ? "s" : ""} detected via Sentinel-1 InSAR.</span></div><div className="riskAssessmentDivider" /></>
              )}
              {locationAssessment.location.critical_infrastructure_nearby?.length > 0 && (
                <div className="riskAssessmentInfraSection">
                  <div className="riskAssessmentFactorsTitle">Critical Infrastructure Nearby</div>
                  <div className="riskAssessmentNearbyList">
                    {locationAssessment.location.critical_infrastructure_nearby.map((infra, idx) => (
                      <div key={idx} className="riskAssessmentNearbyItem"><span className="riskAssessmentNearbyTitle">{infra.name || infra.type}</span><span className="riskAssessmentNearbyDistance">{infra.distance_km?.toFixed(1)} km</span></div>
                    ))}
                  </div>
                </div>
              )}
              {locationAssessment.assessment.population_exposure && (
                <div className="riskAssessmentPopulation">
                  <div className="riskAssessmentPopulationTitle">Population Exposure</div>
                  <div className="riskAssessmentPopulationGrid">
                    <div className="riskAssessmentPopItem"><span className="riskAssessmentPopLabel">Density</span><span className="riskAssessmentPopValue">{locationAssessment.assessment.population_exposure.density?.replace("_", " ")}</span></div>
                    <div className="riskAssessmentPopItem"><span className="riskAssessmentPopLabel">Est. Population</span><span className="riskAssessmentPopValue">{formatNumber(locationAssessment.assessment.population_exposure.estimated_population)}</span></div>
                  </div>
                </div>
              )}
              {locationAssessment.assessment.risk_factors.length > 0 && (
                <>
                  <div className="riskAssessmentDivider" />
                  <div className="riskAssessmentFactorsTitle">Contributing Risk Factors</div>
                  <div className="riskAssessmentFactors">
                    {locationAssessment.assessment.risk_factors.map((factor, idx) => (
                      <React.Fragment key={idx}>
                        <div className="riskAssessmentFactor">
                          <div className="riskAssessmentFactorIcon" style={{ backgroundColor: SEVERITY_COLORS[factor.severity] }}><FontAwesomeIcon icon={getRiskCategoryIcon(factor.category)} /></div>
                          <div className="riskAssessmentFactorInfo"><span className="riskAssessmentFactorTitle">{factor.title}</span><span className="riskAssessmentFactorMeta">{factor.category} • {factor.distance_km} km away</span></div>
                          <div className="riskAssessmentFactorContribution">+{factor.contribution}</div>
                        </div>
                        {factor.recommendations?.length > 0 && (
                          <div className="riskAssessmentFactor"><div className="riskAssessmentFactorRecs">{factor.recommendations.map((r, i) => <span key={i} className="riskAssessmentFactorRec">{r}</span>)}</div></div>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </>
              )}
              {locationAssessment.nearby_risks.length > 0 && (
                <>
                  <div className="riskAssessmentDivider" />
                  <div className="riskAssessmentFactorsTitle">Nearby Risks ({locationAssessment.nearby_risks.length})</div>
                  <div className="riskAssessmentNearbyList">
                    {locationAssessment.nearby_risks.slice(0, 10).map((risk, idx) => (
                      <div key={idx} className="riskAssessmentNearbyItem" onClick={() => { navigateToRiskEvent(risk); setActiveModal(null); }}>
                        <span className="riskAssessmentNearbyTitle">{risk.title}</span>
                        <span className="riskAssessmentNearbyDistance">{risk.distance_km?.toFixed(1)} km</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <div className="riskAssessmentActions">
                <button className="riskAssessmentActionBtn" onClick={() => openNearbyQueryModal(locationAssessment.location.latitude, locationAssessment.location.longitude)}><FontAwesomeIcon icon={faBullseye} /> Spatial Query</button>
                <button className="riskAssessmentActionBtn" onClick={() => {
                  setAreaFormData({
                    ...INITIAL_AREA_FORM,
                    mode: "point_radius",
                    name: locationAssessment.location.nearest_city || "",
                    latitude: locationAssessment.location.latitude.toString(),
                    longitude: locationAssessment.location.longitude.toString(),
                    radius_km: (locationAssessment.radius_km || 100).toString()
                  });
                  setActiveModal("myArea");
                }}>
                  <FontAwesomeIcon icon={faMapPin} /> Save as My Area
                </button>
              </div>
            </>
          )}
        </Modal>
      </div>
      <IntelBar
        selectedRisk={selectedRiskEvent}
        selectedAsset={detailedAsset}
        selectedFeature={selectedFeature}
        featureMeasurements={featureMeasurements}
        featureDetails={featureDetails}
        isFetchingDetails={isFetchingDetails}
        riskEventExpired={riskEventExpired}
        onClose={() => { setSelectedRiskEvent(null); setRiskEventExpired(false); setDetailedAsset(null); setSelectedAsset(null); clearSelection(); }}
        onCloseRisk={() => { setSelectedRiskEvent(null); setRiskEventExpired(false); }}
        onCloseAsset={() => { setDetailedAsset(null); setSelectedAsset(null); }}
        onCloseFeature={clearSelection}
        onNavigateToRisk={navigateToRiskEvent}
        onDismissExpired={handleDismissExpiredRiskEvent}
        onRefreshRisk={refreshRiskIntelligence}
        onAssessLocation={assessLocationRisk}
        onOpenNearby={openNearbyQueryModal}
        onZoomToFeature={zoomToFeature}
        expandedRiskSections={expandedRiskSections}
        toggleRiskSection={toggleRiskSection}
        getMetadataRenderer={getMetadataRenderer}
        renderGoldenMeshDetectionMetadata={renderGoldenMeshDetectionMetadata}
      />
    </div>
  );
}