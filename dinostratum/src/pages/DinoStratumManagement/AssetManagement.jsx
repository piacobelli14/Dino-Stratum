import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus, faEdit, faTrash, faFilter, faUndo, faDownload, faSave, faSpinner,
  faTimes, faChevronDown, faChevronUp, faExclamationCircle, faCheckCircle,
  faHistory, faMap, faCubes, faCodeCompare, faClipboardCheck, faCircleCheck,
  faUpload, faRefresh, faSearch, faBuilding, faLocationDot, faSortUp, faSortDown,
  faArrowLeft, faFileExport, faBoxesStacked, faShieldHalved, faBullseye,
  faCrosshairs, faLayerGroup, faTriangleExclamation, faExpand, faCompress,
  faMountain, faFire, faWater, faCloud, faVolcano, faSmog, faEarthAmericas,
  faHurricane, faSatellite, faTemperatureHigh, faSnowflake, faTornado,
  faHouseTsunami, faEye, faEyeSlash, faGears, faExternalLink, faClock,
  faChartBar, faCircleInfo, faUsers, faIndustry, faLink, faArrowUp, faArrowDown,
  faMinus, faRuler, faRadiation, faWind, faBolt, faPersonFalling, faRoadBarrier,
  faChartLine, faPercent, faWeightHanging, faNetworkWired, faDatabase,
  faCloudArrowUp, faWandMagicSparkles, faFileArrowUp, faCircleNotch, faCheck,
  faFloppyDisk, faRotate, faTableCells, faGripVertical, faLocationCrosshairs,
  faGlobe
} from "@fortawesome/free-solid-svg-icons";
import Nav from "../../helpers/Nav.jsx";
import "../../styles/mainStyles/Management/AssetManagement.css";

const getApiBaseUrl = () => {
  if (typeof window !== "undefined" && window.REACT_APP_API_URL) return window.REACT_APP_API_URL;
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) return import.meta.env.VITE_API_URL;
  try {
    if (typeof process !== "undefined" && process.env?.REACT_APP_API_URL) return process.env.REACT_APP_API_URL;
  } catch {}
  return "http://localhost:3000";
};

const API_BASE_URL = getApiBaseUrl();

const MAP_PROVIDER_APPLE = "apple";
const MAP_PROVIDER_MAPLIBRE = "maplibre";
const APPLE_MAPS_ZOOM_THRESHOLD = 6;

const MAPKIT_TOKEN = typeof import.meta !== "undefined" && import.meta.env?.VITE_APPLE_MAPS_KEY
  ? import.meta.env.VITE_APPLE_MAPS_KEY
  : "";

let mapkitGlobalInitialized = false;

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

const ASSET_TYPE_OPTIONS = Object.keys(ASSET_TYPES);
const PRIORITY_OPTIONS = ["Critical", "High", "Medium", "Low"];
const STATUS_OPTIONS = ["Active", "Inactive", "Maintenance", "Decommissioned"];
const VERTICAL_DATUM_OPTIONS = ["WGS84", "EGM96", "EGM2008", "NAVD88", "MSL", "AHD", "Other"];

const SEVERITY_COLORS = {
  Critical: "#FF1744",
  High: "#FF9100",
  Medium: "#FFEA00",
  Low: "#00E676"
};

const SEVERITY_ORDER = { Critical: 4, High: 3, Medium: 2, Low: 1 };

const RISK_ICON_MAP = {
  seismic: faMountain,
  wildfire: faFire,
  flood: faWater,
  weather: faCloud,
  tornado: faTornado,
  hurricane: faHurricane,
  volcanic: faVolcano,
  "air quality": faSmog,
  tsunami: faHouseTsunami,
  space: faSatellite,
  drought: faTemperatureHigh,
  "ground deformation": faLayerGroup,
  other: faTriangleExclamation,
  industrial: faIndustry,
  ice: faSnowflake,
  landslide: faMountain,
  wind: faWind,
  lightning: faBolt,
  radiation: faRadiation
};

const INITIAL_ASSET_FORM = {
  name: "",
  description: "",
  asset_type: "Other",
  priority: "Medium",
  status: "Active",
  latitude: "",
  longitude: "",
  elevation_meters: "",
  address_street: "",
  address_city: "",
  address_state: "",
  address_country: "",
  address_postal_code: "",
  tags: "",
  image_url: "",
  external_id: "",
  risk_score: "",
  metadata: {}
};

const INITIAL_FILTERS = {
  asset_type: "",
  priority: "",
  status: "",
  search: "",
  min_risk_score: "",
  max_risk_score: "",
  tags: ""
};

const INITIAL_GOLDEN_MESH_FORM = {
  vertical_datum: "WGS84",
  sensor_source: "",
  horizontal_accuracy_m: "",
  vertical_accuracy_m: "",
  point_density_per_sqm: "",
  notes: ""
};

const ALLOWED_MESH_EXTENSIONS = [".las", ".laz", ".copc.laz", ".ply", ".xyz", ".csv", ".tif", ".tiff"];

const MINIMAP_RADIUS_OPTIONS = [
  { value: 10, label: "10 km" },
  { value: 25, label: "25 km" },
  { value: 50, label: "50 km" },
  { value: 100, label: "100 km" },
  { value: 150, label: "150 km" },
  { value: 250, label: "250 km" },
  { value: 500, label: "500 km" }
];

const DEFAULT_MINIMAP_RADIUS_KM = 50;
const MINIMAP_MAX_RISK_LIMIT = 1000;

const SORT_OPTIONS = [
  { value: "risk_score", label: "Risk Score" },
  { value: "name", label: "Name" },
  { value: "asset_type", label: "Type" },
  { value: "priority", label: "Priority" },
  { value: "status", label: "Status" },
  { value: "updated_at", label: "Last Updated" },
  { value: "created_at", label: "Created" }
];

const TOPO_STYLE = {
  version: 8,
  sources: {
    "satellite-tiles": {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "Tiles Esri"
    },
    "labels-tiles": {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 19
    }
  },
  layers: [
    { id: "satellite-layer", type: "raster", source: "satellite-tiles", minzoom: 0, maxzoom: 19 },
    { id: "labels-layer", type: "raster", source: "labels-tiles", minzoom: 0, maxzoom: 19, paint: { "raster-opacity": 0.85 } }
  ],
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf"
};

function loadScript(src, id) {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) {
      const c = setInterval(() => {
        if (window.maplibregl) {
          clearInterval(c);
          resolve();
        }
      }, 100);
      setTimeout(() => {
        clearInterval(c);
        reject(new Error("Script load timeout for: " + id + "."));
      }, 15000);
      return;
    }
    const s = document.createElement("script");
    s.id = id;
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error("Script load failed for: " + id + "."));
    document.head.appendChild(s);
  });
}

function loadCSS(href, id) {
  if (document.getElementById(id)) return;
  const l = document.createElement("link");
  l.id = id;
  l.rel = "stylesheet";
  l.href = href;
  document.head.appendChild(l);
}

function loadMapKitJS() {
  return new Promise((resolve, reject) => {
    if (window.mapkit && mapkitGlobalInitialized) {
      resolve(window.mapkit);
      return;
    }
    if (document.querySelector('script[src*="apple-mapkit"]')) {
      const check = setInterval(() => {
        if (window.mapkit) {
          clearInterval(check);
          if (!mapkitGlobalInitialized) {
            window.mapkit.init({ authorizationCallback: done => done(MAPKIT_TOKEN) });
            mapkitGlobalInitialized = true;
          }
          resolve(window.mapkit);
        }
      }, 100);
      setTimeout(() => {
        clearInterval(check);
        reject(new Error("MapKit JS load timeout."));
      }, 10000);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js";
    script.crossOrigin = "anonymous";
    const timeout = setTimeout(() => reject(new Error("MapKit JS load timeout.")), 10000);
    script.addEventListener("load", () => {
      clearTimeout(timeout);
      try {
        window.mapkit.init({ authorizationCallback: done => done(MAPKIT_TOKEN) });
        mapkitGlobalInitialized = true;
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
}

function zoomToAppleSpan(zoom) {
  return 360 / Math.pow(2, zoom);
}

function appleRegionToZoom(region) {
  return Math.max(0, Math.min(Math.log2(360 / Math.max(region.span.latitudeDelta, 0.0001)), 22));
}

function radiusKmToFitZoom(r) {
  if (r <= 10) return 11;
  if (r <= 25) return 10;
  if (r <= 50) return 9;
  if (r <= 100) return 8;
  if (r <= 250) return 7;
  return 6;
}

function computeBoundsFromRadius(lat, lng, r) {
  const latD = r / 111.32;
  const lngD = r / (111.32 * Math.cos(lat * Math.PI / 180));
  return [[lng - lngD, lat - latD], [lng + lngD, lat + latD]];
}

function buildRadiusCircleCoords(lat, lng, r) {
  const steps = 128;
  const coords = [];
  const dr = r / 6371.0;
  const clr = lat * Math.PI / 180;
  const clg = lng * Math.PI / 180;
  for (let i = 0; i <= steps; i++) {
    const b = (i / steps) * 2 * Math.PI;
    const pl = Math.asin(Math.sin(clr) * Math.cos(dr) + Math.cos(clr) * Math.sin(dr) * Math.cos(b));
    const pg = clg + Math.atan2(Math.sin(b) * Math.sin(dr) * Math.cos(clr), Math.cos(dr) - Math.sin(clr) * Math.sin(pl));
    coords.push([pg * 180 / Math.PI, pl * 180 / Math.PI]);
  }
  return coords;
}

function addRadiusCircle(map, lat, lng, r) {
  const coords = buildRadiusCircleCoords(lat, lng, r);
  if (map.getSource("radius-circle")) {
    map.getSource("radius-circle").setData({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [coords] }
    });
  } else {
    map.addSource("radius-circle", {
      type: "geojson",
      data: { type: "Feature", geometry: { type: "Polygon", coordinates: [coords] } }
    });
    map.addLayer({
      id: "radius-circle-fill",
      type: "fill",
      source: "radius-circle",
      paint: { "fill-color": "#00FFFF", "fill-opacity": 0.04 }
    });
    map.addLayer({
      id: "radius-circle-stroke",
      type: "line",
      source: "radius-circle",
      paint: {
        "line-color": "#00FFFF",
        "line-width": 1.5,
        "line-dasharray": [4, 3],
        "line-opacity": 0.5
      }
    });
  }
}

function updateRadiusCircle(map, lat, lng, r) {
  if (!map.getSource("radius-circle")) {
    addRadiusCircle(map, lat, lng, r);
    return;
  }
  const coords = buildRadiusCircleCoords(lat, lng, r);
  map.getSource("radius-circle").setData({
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [coords] }
  });
}

function buildRiskCommandCenterUrl(asset) {
  const p = new URLSearchParams();
  if (asset.latitude != null) p.set("lat", asset.latitude.toString());
  if (asset.longitude != null) p.set("lng", asset.longitude.toString());
  p.set("zoom", "14");
  if (asset.asset_id) p.set("asset", asset.asset_id);
  return `/risk-command-center?${p.toString()}`;
}

function getRiskCategoryIcon(cat) {
  return RISK_ICON_MAP[cat?.toLowerCase()] || faTriangleExclamation;
}

function getRiskColor(s) {
  if (s > 70) return "#FF6B6B";
  if (s > 50) return "#FF9500";
  return "#4ECDC4";
}

function getRiskColorFromScore(s) {
  if (s >= 80) return "#FF1744";
  if (s >= 60) return "#FF6B6B";
  if (s >= 40) return "#FF9500";
  if (s >= 20) return "#FFEA00";
  return "#00E676";
}

function getDeformationSeverityColor(sev) {
  return ({
    critical: "#FF1744",
    high: "#FF9100",
    moderate: "#FFEA00",
    low: "#00E676",
    negligible: "#4ECDC4"
  }[sev?.toLowerCase()] || "#9E9E9E");
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

function Modal({ open, onClose, title, size, children }) {
  if (!open) return null;
  return (
    <div className="amModalOverlay" onClick={onClose}>
      <div
        className={`amModal${size ? ` amModal${size}` : ""}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="amModalHeader">
          <span>{title}</span>
          <button className="amModalClose" onClick={onClose}>
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>
        <div className="amModalContent">
          {children}
        </div>
      </div>
    </div>
  );
}

function LoadingSpinner({ text }) {
  return (
    <div className="amLoadingBlock">
      <div className="amLoadingBlockInner">
        <div className="amLoadingIconRing">
          <FontAwesomeIcon icon={faSpinner} spin className="amLoadingIcon" />
        </div>
        <div className="amLoadingText">{text || "Loading..."}</div>
        <div className="amLoadingBarTrack">
          <div className="amLoadingBarFill" />
        </div>
      </div>
    </div>
  );
}

function EmptyState({ icon, text, subtext, action }) {
  return (
    <div className="amEmptyState">
      {icon && <FontAwesomeIcon icon={icon} className="amEmptyStateIcon" />}
      <span className="amEmptyStateText">{text}</span>
      {subtext && <span className="amEmptyStateSubtext">{subtext}</span>}
      {action}
    </div>
  );
}

function RiskImpactBar({ label, value, max, color }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="amRibBar">
      <div className="amRibBarLabel">{label}</div>
      <div className="amRibBarTrack">
        <div
          className="amRibBarFill"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <div className="amRibBarValue">{value}</div>
    </div>
  );
}

function MiniDonut({ segments, size = 56, strokeWidth = 9 }) {
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const activeSegments = segments.filter(sg => sg.value > 0);
  const total = segments.reduce((s, sg) => s + sg.value, 0) || 1;
  const [tooltip, setTooltip] = useState(null);
  const svgRef = useRef(null);
  const gapDeg = activeSegments.length > 1 ? 3 : 0;
  const totalGapDeg = gapDeg * activeSegments.length;
  const usableDeg = 360 - totalGapDeg;
  const arcs = [];
  let currentAngle = 0;

  activeSegments.forEach((sg) => {
    const segDeg = (sg.value / total) * usableDeg;
    arcs.push({ ...sg, startAngle: currentAngle, sweepAngle: segDeg });
    currentAngle += segDeg + gapDeg;
  });

  const describeArc = (startDeg, sweepDeg) => {
    const sr = ((startDeg - 90) * Math.PI) / 180;
    const er = ((startDeg + sweepDeg - 90) * Math.PI) / 180;
    return `M ${cx + r * Math.cos(sr)} ${cy + r * Math.sin(sr)} A ${r} ${r} 0 ${sweepDeg > 180 ? 1 : 0} 1 ${cx + r * Math.cos(er)} ${cy + r * Math.sin(er)}`;
  };

  const handleMouse = useCallback((e, arc) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    setTooltip({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top - 36,
      label: arc.label || "",
      value: arc.value,
      color: arc.color,
      pct: Math.round((arc.value / total) * 100)
    });
  }, [total]);

  const handleLeave = useCallback(() => setTooltip(null), []);
  const borderWidth = Math.max(2, strokeWidth * 0.25);

  return (
    <div style={{ position: "relative", flexShrink: 0, width: size, height: size }}>
      <svg ref={svgRef} width={size} height={size}>
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
        />
        {arcs.map((arc, i) => (
          <path
            key={i}
            d={describeArc(arc.startAngle, arc.sweepAngle)}
            fill="none"
            stroke={arc.color}
            strokeWidth={strokeWidth}
            strokeLinecap="butt"
            style={{ cursor: arc.label ? "pointer" : "default" }}
            onMouseMove={e => handleMouse(e, arc)}
            onMouseLeave={handleLeave}
          />
        ))}
        {activeSegments.length > 1 && arcs.map((arc, i) => {
          const sr = ((arc.startAngle - 90) * Math.PI) / 180;
          const er = ((arc.startAngle + arc.sweepAngle - 90) * Math.PI) / 180;
          return (
            <g key={`b${i}`}>
              <line
                x1={cx + (r - strokeWidth / 2) * Math.cos(sr)}
                y1={cy + (r - strokeWidth / 2) * Math.sin(sr)}
                x2={cx + (r + strokeWidth / 2) * Math.cos(sr)}
                y2={cy + (r + strokeWidth / 2) * Math.sin(sr)}
                stroke="var(--am-bg-secondary, #101216)"
                strokeWidth={borderWidth}
                strokeLinecap="round"
              />
              <line
                x1={cx + (r - strokeWidth / 2) * Math.cos(er)}
                y1={cy + (r - strokeWidth / 2) * Math.sin(er)}
                x2={cx + (r + strokeWidth / 2) * Math.cos(er)}
                y2={cy + (r + strokeWidth / 2) * Math.sin(er)}
                stroke="var(--am-bg-secondary, #101216)"
                strokeWidth={borderWidth}
                strokeLinecap="round"
              />
            </g>
          );
        })}
      </svg>
      {tooltip && tooltip.label && (
        <div className="amDonutTooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          <span className="amDonutTooltipDot" style={{ backgroundColor: tooltip.color }} />
          <span className="amDonutTooltipLabel">{tooltip.label}</span>
          <span className="amDonutTooltipValue">{tooltip.value}</span>
          <span className="amDonutTooltipPct">({tooltip.pct}%)</span>
        </div>
      )}
    </div>
  );
}

function AssetsOverviewMap({ assets, selectedAssetId, onAssetClick, onAssetHover, isLoading }) {
  const wrapperRef = useRef(null);
  const maplibreContainerRef = useRef(null);
  const appleContainerRef = useRef(null);
  const maplibreMapRef = useRef(null);
  const appleMapRef = useRef(null);
  const maplibreMarkersRef = useRef([]);
  const appleAnnotationsRef = useRef([]);
  const activeProviderRef = useRef(MAP_PROVIDER_MAPLIBRE);
  const switchingRef = useRef(false);
  const appleReadyRef = useRef(false);
  const initAttemptedRef = useRef(false);
  const hasFitBoundsRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(null);
  const [activeProvider, setActiveProvider] = useState(MAP_PROVIDER_MAPLIBRE);

  const clearAllMaplibreMarkers = useCallback(() => {
    maplibreMarkersRef.current.forEach(m => {
      try { m.remove(); } catch {}
    });
    maplibreMarkersRef.current = [];
  }, []);

  const clearAllAppleAnnotations = useCallback(() => {
    if (appleMapRef.current) {
      appleAnnotationsRef.current.forEach(a => {
        try { appleMapRef.current.removeAnnotation(a); } catch {}
      });
    }
    appleAnnotationsRef.current = [];
  }, []);

  const buildAssetMarkerHTML = useCallback((asset, isSelected) => {
    const typeColor = (ASSET_TYPES[asset.asset_type] || ASSET_TYPES.Other).color;
    const riskCol = getRiskColor(asset.risk_score || 0);
    const animated = (asset.risk_score || 0) > 50;
    const pulseHtml = animated
      ? `<div class="amOverviewMarkerPulse" style="background:${riskCol};"></div>`
      : "";
    const ringClass = isSelected ? " amOverviewMarkerSelected" : "";
    return `<div class="amOverviewMarkerWrap${ringClass}">
      <div class="amOverviewMarkerPin" style="background:${typeColor};border-color:${riskCol};">
        <div class="amOverviewMarkerInner"></div>
      </div>
      ${pulseHtml}
      <div class="amOverviewMarkerLabel">${asset.name || "Asset"}</div>
    </div>`;
  }, []);

  const placeMaplibreMarkers = useCallback((map, list) => {
    clearAllMaplibreMarkers();
    if (!window.maplibregl || !map || !list?.length) return;
    list.forEach(asset => {
      const lat = asset.latitude ?? asset.lat;
      const lng = asset.longitude ?? asset.lng;
      if (lat == null || lng == null) return;
      const el = document.createElement("div");
      el.className = "amOverviewMarker";
      el.innerHTML = buildAssetMarkerHTML(asset, asset.asset_id === selectedAssetId);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onAssetClick?.(asset);
      });
      const marker = new window.maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([lng, lat])
        .addTo(map);
      maplibreMarkersRef.current.push(marker);
    });
  }, [buildAssetMarkerHTML, clearAllMaplibreMarkers, onAssetClick, selectedAssetId]);

  const placeAppleMarkers = useCallback((map, list) => {
    clearAllAppleAnnotations();
    if (!window.mapkit || !map || !list?.length) return;
    list.forEach(asset => {
      const lat = asset.latitude ?? asset.lat;
      const lng = asset.longitude ?? asset.lng;
      if (lat == null || lng == null) return;
      const factory = () => {
        const el = document.createElement("div");
        el.className = "amOverviewMarker";
        el.innerHTML = buildAssetMarkerHTML(asset, asset.asset_id === selectedAssetId);
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          onAssetClick?.(asset);
        });
        return el;
      };
      const ann = new window.mapkit.Annotation(
        new window.mapkit.Coordinate(lat, lng),
        factory,
        { anchorOffset: new DOMPoint(0, -15), calloutEnabled: false, animates: false }
      );
      map.addAnnotation(ann);
      appleAnnotationsRef.current.push(ann);
    });
  }, [buildAssetMarkerHTML, clearAllAppleAnnotations, onAssetClick, selectedAssetId]);

  const fitToAssets = useCallback((list) => {
    if (!list?.length) return;
    const coords = list
      .map(a => [a.longitude ?? a.lng, a.latitude ?? a.lat])
      .filter(([lng, lat]) => lng != null && lat != null);
    if (!coords.length) return;
    const lats = coords.map(c => c[1]);
    const lngs = coords.map(c => c[0]);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    if (maplibreMapRef.current) {
      if (coords.length === 1) {
        maplibreMapRef.current.flyTo({ center: coords[0], zoom: 8, duration: 1200 });
      } else {
        maplibreMapRef.current.fitBounds(
          [[minLng, minLat], [maxLng, maxLat]],
          { padding: 60, duration: 1200, maxZoom: 10 }
        );
      }
    }
  }, []);

  const switchToProvider = useCallback((target, sLat, sLng, zoom, bearing) => {
    if (switchingRef.current || activeProviderRef.current === target) return;
    switchingRef.current = true;
    activeProviderRef.current = target;
    setActiveProvider(target);

    if (target === MAP_PROVIDER_APPLE) {
      if (appleMapRef.current && window.mapkit) {
        const span = zoomToAppleSpan(zoom);
        appleMapRef.current.setRegionAnimated(
          new window.mapkit.CoordinateRegion(
            new window.mapkit.Coordinate(sLat, sLng),
            new window.mapkit.CoordinateSpan(span, span)
          ),
          false
        );
        appleMapRef.current.rotation = bearing || 0;
      }
      if (appleContainerRef.current) appleContainerRef.current.style.display = "block";
      if (maplibreContainerRef.current) maplibreContainerRef.current.style.display = "none";
    } else {
      if (maplibreMapRef.current) {
        maplibreMapRef.current.jumpTo({ center: [sLng, sLat], zoom, bearing: bearing || 0 });
        maplibreMapRef.current.resize();
      }
      if (appleContainerRef.current) appleContainerRef.current.style.display = "none";
      if (maplibreContainerRef.current) maplibreContainerRef.current.style.display = "block";
    }

    setTimeout(() => {
      switchingRef.current = false;
      if (target === MAP_PROVIDER_MAPLIBRE && maplibreMapRef.current) {
        maplibreMapRef.current.resize();
      }
    }, 300);
  }, []);

  useEffect(() => {
    if (!wrapperRef.current || initAttemptedRef.current) return;
    initAttemptedRef.current = true;
    let cancelled = false;

    const mlContainer = document.createElement("div");
    Object.assign(mlContainer.style, {
      width: "100%",
      height: "100%",
      position: "absolute",
      top: "0",
      left: "0",
      display: "block"
    });
    wrapperRef.current.appendChild(mlContainer);
    maplibreContainerRef.current = mlContainer;

    const apContainer = document.createElement("div");
    Object.assign(apContainer.style, {
      width: "100%",
      height: "100%",
      position: "absolute",
      top: "0",
      left: "0",
      display: "none"
    });
    wrapperRef.current.appendChild(apContainer);
    appleContainerRef.current = apContainer;

    const initMaplibre = async () => {
      loadCSS("https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.css", "minimap-maplibre-css");
      await loadScript("https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.js", "minimap-maplibre-script");
      if (cancelled || !window.maplibregl) return;

      const map = new window.maplibregl.Map({
        container: mlContainer,
        style: TOPO_STYLE,
        center: [0, 20],
        zoom: 1.5,
        minZoom: 1,
        pitch: 0,
        bearing: 0,
        antialias: true,
        attributionControl: false
      });
      map.addControl(new window.maplibregl.NavigationControl({ showCompass: false }), "top-right");

      map.on("moveend", () => {
        if (activeProviderRef.current !== MAP_PROVIDER_MAPLIBRE || switchingRef.current) return;
        const z = map.getZoom();
        const c = map.getCenter();
        if (z >= APPLE_MAPS_ZOOM_THRESHOLD && appleReadyRef.current) {
          switchToProvider(MAP_PROVIDER_APPLE, c.lat, c.lng, z, map.getBearing());
        }
      });

      map.on("error", () => {});

      const onLoad = () => {
        if (cancelled) return;
        maplibreMapRef.current = map;
        setMapReady(true);
      };
      if (map.loaded()) {
        onLoad();
      } else {
        map.on("load", onLoad);
      }
    };

    const initApple = async () => {
      if (!MAPKIT_TOKEN) return;
      try {
        const mapkit = await loadMapKitJS();
        if (cancelled) return;
        await new Promise((resolve, reject) => {
          let settled = false;
          const map = new mapkit.Map(apContainer, {
            mapType: mapkit.Map.MapTypes.Satellite,
            showsCompass: mapkit.FeatureVisibility.Visible,
            showsZoomControl: true,
            showsScale: mapkit.FeatureVisibility.Visible,
            showsMapTypeControl: false,
            isRotationEnabled: true,
            isScrollEnabled: true,
            isZoomEnabled: true,
            padding: new mapkit.Padding(0, 0, 0, 0),
            center: new mapkit.Coordinate(20, 0),
            cameraDistance: 50000000,
            colorScheme: mapkit.Map.ColorSchemes.Dark
          });

          map.addEventListener("region-change-end", () => {
            if (activeProviderRef.current !== MAP_PROVIDER_APPLE || switchingRef.current) return;
            const mLat = map.center.latitude;
            const mLng = map.center.longitude;
            const zoom = appleRegionToZoom(map.region);
            if (zoom < APPLE_MAPS_ZOOM_THRESHOLD) {
              switchToProvider(MAP_PROVIDER_MAPLIBRE, mLat, mLng, zoom, map.rotation || 0);
            }
          });

          const onErr = () => {
            if (settled) return;
            settled = true;
            try { map.destroy(); } catch {}
            reject(new Error("MapKit authorization failed."));
          };
          mapkit.addEventListener("error", onErr);

          setTimeout(() => {
            if (settled || cancelled) return;
            settled = true;
            mapkit.removeEventListener("error", onErr);
            appleMapRef.current = map;
            appleReadyRef.current = true;
            resolve();
          }, 3000);
        });
      } catch {}
    };

    initMaplibre()
      .then(() => { if (!cancelled) return initApple(); })
      .catch(() => { if (!cancelled) setMapError("Failed to load the overview map."); });

    return () => {
      cancelled = true;
      clearAllMaplibreMarkers();
      clearAllAppleAnnotations();
      if (appleMapRef.current) {
        try { appleMapRef.current.destroy(); } catch {}
        appleMapRef.current = null;
      }
      if (maplibreMapRef.current) {
        try { maplibreMapRef.current.remove(); } catch {}
        maplibreMapRef.current = null;
      }
      appleReadyRef.current = false;
      initAttemptedRef.current = false;
      hasFitBoundsRef.current = false;
      setMapReady(false);
      setMapError(null);
    };
  }, [clearAllMaplibreMarkers, clearAllAppleAnnotations, switchToProvider]);

  useEffect(() => {
    if (!mapReady) return;
    if (maplibreMapRef.current) placeMaplibreMarkers(maplibreMapRef.current, assets);
    if (appleMapRef.current) placeAppleMarkers(appleMapRef.current, assets);
    if (!hasFitBoundsRef.current && assets?.length > 0) {
      fitToAssets(assets);
      hasFitBoundsRef.current = true;
    }
  }, [mapReady, assets, placeMaplibreMarkers, placeAppleMarkers, fitToAssets]);

  const handleFitToAssets = useCallback(() => {
    fitToAssets(assets);
  }, [assets, fitToAssets]);

  const handleResetGlobe = useCallback(() => {
    if (maplibreMapRef.current && activeProviderRef.current === MAP_PROVIDER_MAPLIBRE) {
      maplibreMapRef.current.flyTo({ center: [0, 20], zoom: 1.5, duration: 1200 });
    } else if (appleMapRef.current && activeProviderRef.current === MAP_PROVIDER_APPLE) {
      switchToProvider(MAP_PROVIDER_MAPLIBRE, 20, 0, 1.5, 0);
    }
  }, [switchToProvider]);

  return (
    <div className="amOverviewMapContainer">
      <div className="amOverviewMapHeader">
        <div className="amOverviewMapHeaderLeft">
          <FontAwesomeIcon icon={faGlobe} />
          <span>Global Asset Map</span>
          {isLoading && <FontAwesomeIcon icon={faSpinner} spin className="amMinimapSpinner" />}
          <span className="amOverviewMapCount">
            {assets?.length || 0} asset{(assets?.length || 0) !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="amOverviewMapHeaderRight">
          <button
            className="amOverviewMapHeaderBtn"
            onClick={handleFitToAssets}
            title="Fit to all assets"
            disabled={!assets?.length}
          >
            <FontAwesomeIcon icon={faCrosshairs} />
            <span>Fit</span>
          </button>
          <button
            className="amOverviewMapHeaderBtn"
            onClick={handleResetGlobe}
            title="Reset to globe view"
          >
            <FontAwesomeIcon icon={faGlobe} />
            <span>Globe</span>
          </button>
        </div>
      </div>
      <div className="amOverviewMapBody">
        <div ref={wrapperRef} className="amOverviewMapCanvas" style={{ position: "relative" }} />
        {mapError && <div className="amMinimapError">{mapError}</div>}
        {!mapReady && !mapError && (
          <div className="amMinimapLoading">
            <FontAwesomeIcon icon={faSpinner} spin />
            <span>Initializing global asset map.</span>
          </div>
        )}
        {mapReady && !assets?.length && !isLoading && (
          <div className="amOverviewMapEmpty">
            <FontAwesomeIcon icon={faBuilding} />
            <span>No assets to display.</span>
            <small>Register your first asset to see it on the map.</small>
          </div>
        )}
      </div>
    </div>
  );
}

function LocationPickerMap({ latitude, longitude, onLocationChange }) {
  const wrapperRef = useRef(null);
  const maplibreContainerRef = useRef(null);
  const appleContainerRef = useRef(null);
  const maplibreMapRef = useRef(null);
  const appleMapRef = useRef(null);
  const maplibreMarkerRef = useRef(null);
  const appleAnnotationRef = useRef(null);
  const activeProviderRef = useRef(MAP_PROVIDER_MAPLIBRE);
  const switchingRef = useRef(false);
  const appleReadyRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(null);
  const initRef = useRef(false);
  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);
  const hasCoords = !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  const mouseDownPosRef = useRef(null);

  const clearAllMarkers = useCallback(() => {
    if (maplibreMarkerRef.current) {
      try { maplibreMarkerRef.current.remove(); } catch {}
      maplibreMarkerRef.current = null;
    }
    if (appleAnnotationRef.current && appleMapRef.current) {
      try { appleMapRef.current.removeAnnotation(appleAnnotationRef.current); } catch {}
      appleAnnotationRef.current = null;
    }
  }, []);

  const placeMaplibreMarker = useCallback((map, mLat, mLng) => {
    if (maplibreMarkerRef.current) {
      try { maplibreMarkerRef.current.remove(); } catch {}
      maplibreMarkerRef.current = null;
    }
    const el = document.createElement("div");
    el.className = "amLocationPickerMarker";
    el.innerHTML = '<div class="amLocationPickerMarkerPin"></div><div class="amLocationPickerMarkerPulse"></div>';
    const marker = new window.maplibregl.Marker({ element: el, draggable: true, anchor: "bottom" })
      .setLngLat([mLng, mLat])
      .addTo(map);
    marker.on("dragend", () => {
      const pos = marker.getLngLat();
      onLocationChange(parseFloat(pos.lat.toFixed(6)), parseFloat(pos.lng.toFixed(6)));
    });
    maplibreMarkerRef.current = marker;
  }, [onLocationChange]);

  const placeAppleMarker = useCallback((map, mLat, mLng) => {
    if (appleAnnotationRef.current) {
      try { map.removeAnnotation(appleAnnotationRef.current); } catch {}
      appleAnnotationRef.current = null;
    }
    if (!window.mapkit) return;
    const factory = () => {
      const el = document.createElement("div");
      el.className = "amLocationPickerMarker";
      el.innerHTML = '<div class="amLocationPickerMarkerPin"></div><div class="amLocationPickerMarkerPulse"></div>';
      return el;
    };
    const ann = new window.mapkit.Annotation(
      new window.mapkit.Coordinate(mLat, mLng),
      factory,
      { anchorOffset: new DOMPoint(0, -15), calloutEnabled: false, animates: false, draggable: true }
    );
    ann.addEventListener("drag-end", () => {
      const c = ann.coordinate;
      onLocationChange(parseFloat(c.latitude.toFixed(6)), parseFloat(c.longitude.toFixed(6)));
    });
    map.addAnnotation(ann);
    appleAnnotationRef.current = ann;
  }, [onLocationChange]);

  const syncMarkerToProvider = useCallback((mLat, mLng) => {
    clearAllMarkers();
    if (activeProviderRef.current === MAP_PROVIDER_MAPLIBRE && maplibreMapRef.current && window.maplibregl) {
      placeMaplibreMarker(maplibreMapRef.current, mLat, mLng);
    } else if (activeProviderRef.current === MAP_PROVIDER_APPLE && appleMapRef.current && window.mapkit) {
      placeAppleMarker(appleMapRef.current, mLat, mLng);
    }
  }, [clearAllMarkers, placeMaplibreMarker, placeAppleMarker]);

  const switchToProvider = useCallback((target, sLat, sLng, zoom, bearing) => {
    if (switchingRef.current || activeProviderRef.current === target) return;
    switchingRef.current = true;
    activeProviderRef.current = target;

    if (target === MAP_PROVIDER_APPLE) {
      if (appleMapRef.current && window.mapkit) {
        const span = zoomToAppleSpan(zoom);
        appleMapRef.current.setRegionAnimated(
          new window.mapkit.CoordinateRegion(
            new window.mapkit.Coordinate(sLat, sLng),
            new window.mapkit.CoordinateSpan(span, span)
          ),
          false
        );
        appleMapRef.current.rotation = bearing || 0;
      }
      if (appleContainerRef.current) appleContainerRef.current.style.display = "block";
      if (maplibreContainerRef.current) maplibreContainerRef.current.style.display = "none";
    } else {
      if (maplibreMapRef.current) {
        maplibreMapRef.current.jumpTo({ center: [sLng, sLat], zoom, bearing: bearing || 0 });
        maplibreMapRef.current.resize();
      }
      if (appleContainerRef.current) appleContainerRef.current.style.display = "none";
      if (maplibreContainerRef.current) maplibreContainerRef.current.style.display = "block";
    }

    setTimeout(() => {
      switchingRef.current = false;
      if (hasCoords) syncMarkerToProvider(lat, lng);
      if (target === MAP_PROVIDER_MAPLIBRE && maplibreMapRef.current) maplibreMapRef.current.resize();
    }, 300);
  }, [hasCoords, lat, lng, syncMarkerToProvider]);

  useEffect(() => {
    if (!wrapperRef.current || initRef.current) return;
    initRef.current = true;
    let cancelled = false;

    const mlContainer = document.createElement("div");
    Object.assign(mlContainer.style, {
      width: "100%",
      height: "100%",
      position: "absolute",
      top: "0",
      left: "0",
      display: "block"
    });
    wrapperRef.current.appendChild(mlContainer);
    maplibreContainerRef.current = mlContainer;

    const apContainer = document.createElement("div");
    Object.assign(apContainer.style, {
      width: "100%",
      height: "100%",
      position: "absolute",
      top: "0",
      left: "0",
      display: "none"
    });
    wrapperRef.current.appendChild(apContainer);
    appleContainerRef.current = apContainer;

    const initMaplibre = async () => {
      loadCSS("https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.css", "minimap-maplibre-css");
      await loadScript("https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.js", "minimap-maplibre-script");
      if (cancelled || !window.maplibregl) return;

      const center = hasCoords ? [lng, lat] : [0, 20];
      const zoom = hasCoords ? 10 : 2;
      const map = new window.maplibregl.Map({
        container: mlContainer,
        style: TOPO_STYLE,
        center,
        zoom,
        pitch: 0,
        bearing: 0,
        attributionControl: false
      });
      map.addControl(new window.maplibregl.NavigationControl({ showCompass: false }), "top-right");

      map.on("moveend", () => {
        if (activeProviderRef.current !== MAP_PROVIDER_MAPLIBRE || switchingRef.current) return;
        const z = map.getZoom();
        const c = map.getCenter();
        if (z >= APPLE_MAPS_ZOOM_THRESHOLD && appleReadyRef.current) {
          switchToProvider(MAP_PROVIDER_APPLE, c.lat, c.lng, z, map.getBearing());
        }
      });

      map.on("click", (e) => {
        const cLat = parseFloat(e.lngLat.lat.toFixed(6));
        const cLng = parseFloat(e.lngLat.lng.toFixed(6));
        clearAllMarkers();
        placeMaplibreMarker(map, cLat, cLng);
        onLocationChange(cLat, cLng);
      });

      map.on("error", () => {});

      const onLoad = () => {
        if (cancelled) return;
        maplibreMapRef.current = map;
        if (hasCoords) placeMaplibreMarker(map, lat, lng);
        setMapReady(true);
      };

      if (map.loaded()) {
        onLoad();
      } else {
        map.on("load", onLoad);
      }
    };

    const initApple = async () => {
      if (!MAPKIT_TOKEN) return;
      try {
        const mapkit = await loadMapKitJS();
        if (cancelled) return;
        await new Promise((resolve, reject) => {
          let settled = false;
          const map = new mapkit.Map(apContainer, {
            mapType: mapkit.Map.MapTypes.Satellite,
            showsCompass: mapkit.FeatureVisibility.Visible,
            showsZoomControl: true,
            showsScale: mapkit.FeatureVisibility.Visible,
            showsMapTypeControl: false,
            isRotationEnabled: true,
            isScrollEnabled: true,
            isZoomEnabled: true,
            padding: new mapkit.Padding(0, 0, 0, 0),
            center: new mapkit.Coordinate(hasCoords ? lat : 20, hasCoords ? lng : 0),
            cameraDistance: hasCoords ? 50000 : 50000000,
            colorScheme: mapkit.Map.ColorSchemes.Dark
          });

          map.addEventListener("region-change-end", () => {
            if (activeProviderRef.current !== MAP_PROVIDER_APPLE || switchingRef.current) return;
            const mLat = map.center.latitude;
            const mLng = map.center.longitude;
            const zoom = appleRegionToZoom(map.region);
            if (zoom < APPLE_MAPS_ZOOM_THRESHOLD) {
              switchToProvider(MAP_PROVIDER_MAPLIBRE, mLat, mLng, zoom, map.rotation || 0);
            }
          });

          apContainer.addEventListener("mousedown", (e) => {
            if (activeProviderRef.current === MAP_PROVIDER_APPLE) {
              mouseDownPosRef.current = { x: e.clientX, y: e.clientY };
            }
          });

          apContainer.addEventListener("mouseup", (e) => {
            if (activeProviderRef.current !== MAP_PROVIDER_APPLE || !mouseDownPosRef.current) return;
            if (Math.hypot(e.clientX - mouseDownPosRef.current.x, e.clientY - mouseDownPosRef.current.y) > 8) return;
            const coord = map.convertPointOnPageToCoordinate(new DOMPoint(e.clientX, e.clientY));
            if (!coord) return;
            const cLat = parseFloat(coord.latitude.toFixed(6));
            const cLng = parseFloat(coord.longitude.toFixed(6));
            clearAllMarkers();
            placeAppleMarker(map, cLat, cLng);
            onLocationChange(cLat, cLng);
          });

          const onErr = () => {
            if (settled) return;
            settled = true;
            try { map.destroy(); } catch {}
            reject(new Error("MapKit authorization failed."));
          };
          mapkit.addEventListener("error", onErr);

          setTimeout(() => {
            if (settled || cancelled) return;
            settled = true;
            mapkit.removeEventListener("error", onErr);
            appleMapRef.current = map;
            appleReadyRef.current = true;
            resolve();
          }, 3000);
        });
      } catch {}
    };

    initMaplibre()
      .then(() => { if (!cancelled) return initApple(); })
      .catch(() => { if (!cancelled) setMapError("Failed to load the location picker map."); });

    return () => {
      cancelled = true;
      clearAllMarkers();
      if (appleMapRef.current) {
        try { appleMapRef.current.destroy(); } catch {}
        appleMapRef.current = null;
      }
      if (maplibreMapRef.current) {
        try { maplibreMapRef.current.remove(); } catch {}
        maplibreMapRef.current = null;
      }
      appleReadyRef.current = false;
      initRef.current = false;
      setMapReady(false);
      setMapError(null);
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !hasCoords) return;
    if (activeProviderRef.current === MAP_PROVIDER_MAPLIBRE && maplibreMapRef.current) {
      if (maplibreMarkerRef.current) {
        const pos = maplibreMarkerRef.current.getLngLat();
        if (Math.abs(pos.lat - lat) > 0.0001 || Math.abs(pos.lng - lng) > 0.0001) {
          maplibreMarkerRef.current.setLngLat([lng, lat]);
          maplibreMapRef.current.flyTo({ center: [lng, lat], zoom: 10, duration: 800 });
        }
      } else {
        placeMaplibreMarker(maplibreMapRef.current, lat, lng);
        maplibreMapRef.current.flyTo({ center: [lng, lat], zoom: 10, duration: 800 });
      }
    } else if (activeProviderRef.current === MAP_PROVIDER_APPLE && appleMapRef.current && window.mapkit) {
      if (appleAnnotationRef.current) {
        appleAnnotationRef.current.coordinate = new window.mapkit.Coordinate(lat, lng);
      } else {
        placeAppleMarker(appleMapRef.current, lat, lng);
      }
      const span = zoomToAppleSpan(10);
      appleMapRef.current.setRegionAnimated(
        new window.mapkit.CoordinateRegion(
          new window.mapkit.Coordinate(lat, lng),
          new window.mapkit.CoordinateSpan(span, span)
        ),
        true
      );
    }
  }, [mapReady, lat, lng, hasCoords, placeMaplibreMarker, placeAppleMarker]);

  return (
    <div className="amLocationPickerContainer">
      <div className="amLocationPickerHeader">
        <FontAwesomeIcon icon={faLocationDot} />
        <span>Click map or drag pin to set location.</span>
      </div>
      <div className="amLocationPickerBody">
        <div ref={wrapperRef} className="amLocationPickerCanvas" style={{ position: "relative" }} />
        {mapError && <div className="amMinimapError">{mapError}</div>}
        {!mapReady && !mapError && (
          <div className="amMinimapLoading">
            <FontAwesomeIcon icon={faSpinner} spin />
            <span>Loading map.</span>
          </div>
        )}
      </div>
      {hasCoords && (
        <div className="amLocationPickerCoords">
          <span>{lat.toFixed(6)}°, {lng.toFixed(6)}°</span>
        </div>
      )}
    </div>
  );
}

function NearbyRiskDetailModal({ open, onClose, risk }) {
  if (!open || !risk) return null;
  const sevColor = SEVERITY_COLORS[risk.severity] || "#FFEA00";
  const meta = risk.metadata || {};
  const popImpact = risk.population_impact || {};
  const recs = risk.recommendations || [];
  const gmDet = risk.golden_mesh_detection;
  const exposureFactors = risk.exposure_factors || [];

  return (
    <Modal open={open} onClose={onClose} title="Risk Event Detail" size="Large">
      <div className="amDetailContainer">
        <div className="amDetailCard amDetailCardMain">
          <div className="amDetailCardHeader">
            <div className="amDetailTitleRow">
              <h2 className="amDetailName">{risk.title || "Unknown Risk"}</h2>
              {risk.asset_exposure_score != null && (
                <span
                  className="amRiskBadgeLarge"
                  style={{ backgroundColor: getRiskColorFromScore(risk.asset_exposure_score) }}
                >
                  Exposure: {risk.asset_exposure_score}
                </span>
              )}
            </div>
            <div className="amDetailSubtitleRow">
              <span
                className={`amPriorityBadge amPriority${
                  risk.severity === "Critical" ? "Critical"
                  : risk.severity === "High" ? "High"
                  : risk.severity === "Medium" ? "Medium"
                  : "Low"
                }`}
              >
                {risk.severity}
              </span>
              <span className="amTypeBadge" style={{ borderLeftColor: sevColor }}>
                {risk.risk_category}
              </span>
              {risk.source && (
                <span className="amDetailLocationChip">
                  {risk.source}
                </span>
              )}
              {risk.distance_km != null && (
                <span className="amDetailLocationChip">
                  <FontAwesomeIcon icon={faRuler} />
                  {risk.distance_km} km away
                </span>
              )}
            </div>
          </div>
          {risk.description && (
            <div className="amDetailDescription">{risk.description}</div>
          )}
        </div>

        {risk.asset_impact_summary && (
          <div className="amRiskDetailImpactBox">
            <div className="amRiskDetailImpactTitle">
              <FontAwesomeIcon icon={faRadiation} /> Asset Impact Analysis
            </div>
            <p className="amRiskDetailImpactText">{risk.asset_impact_summary}</p>
          </div>
        )}

        <div className="amDetailCard">
          <div className="amDetailCardTitle">
            <FontAwesomeIcon icon={faCircleInfo} /> Event Details
          </div>
          <div className="amDetailFieldGrid">
            {risk.event_time && (
              <div className="amDetailField">
                <span className="amDetailFieldLabel">Event Time</span>
                <span className="amDetailFieldValue">{formatRiskTime(risk.event_time)}</span>
              </div>
            )}
            {risk.updated_at && (
              <div className="amDetailField">
                <span className="amDetailFieldLabel">Updated</span>
                <span className="amDetailFieldValue">{formatRiskTime(risk.updated_at)}</span>
              </div>
            )}
            {risk.impact_radius_km != null && (
              <div className="amDetailField">
                <span className="amDetailFieldLabel">Impact Radius</span>
                <span className="amDetailFieldValue">{risk.impact_radius_km} km</span>
              </div>
            )}
            {risk.distance_meters != null && (
              <div className="amDetailField">
                <span className="amDetailFieldLabel">Distance</span>
                <span className="amDetailFieldValue">
                  {(risk.distance_meters / 1000).toFixed(2)} km ({Math.round(risk.distance_meters)} m)
                </span>
              </div>
            )}
            {risk.latitude != null && risk.longitude != null && (
              <div className="amDetailField">
                <span className="amDetailFieldLabel">Coordinates</span>
                <span className="amDetailFieldValue amDetailFieldMono">
                  {risk.latitude.toFixed(5)}°, {risk.longitude.toFixed(5)}°
                </span>
              </div>
            )}
            {risk.severity_score != null && (
              <div className="amDetailField">
                <span className="amDetailFieldLabel">Severity Score</span>
                <span className="amDetailFieldValue">{risk.severity_score}</span>
              </div>
            )}
            {risk.expires_at && (
              <div className="amDetailField">
                <span className="amDetailFieldLabel">Expires</span>
                <span className="amDetailFieldValue">{formatRiskTime(risk.expires_at)}</span>
              </div>
            )}
            {risk.geometry_type && (
              <div className="amDetailField">
                <span className="amDetailFieldLabel">Geometry</span>
                <span className="amDetailFieldValue">{risk.geometry_type}</span>
              </div>
            )}
            {risk.probability_pct != null && (
              <div className="amDetailField">
                <span className="amDetailFieldLabel">Probability</span>
                <span className="amDetailFieldValue">{risk.probability_pct}%</span>
              </div>
            )}
            {risk.propagation_velocity_kmh != null && (
              <div className="amDetailField">
                <span className="amDetailFieldLabel">Propagation Speed</span>
                <span className="amDetailFieldValue">{risk.propagation_velocity_kmh} km/h</span>
              </div>
            )}
            {risk.time_to_impact_hours != null && (
              <div className="amDetailField">
                <span className="amDetailFieldLabel">Time to Impact</span>
                <span className="amDetailFieldValue">{risk.time_to_impact_hours}h</span>
              </div>
            )}
            {risk.asset_in_direct_path != null && (
              <div className="amDetailField">
                <span className="amDetailFieldLabel">In Direct Path</span>
                <span
                  className="amDetailFieldValue"
                  style={{ color: risk.asset_in_direct_path ? "#FF1744" : "#00E676" }}
                >
                  {risk.asset_in_direct_path ? "YES" : "No"}
                </span>
              </div>
            )}
          </div>
        </div>

        {exposureFactors.length > 0 && (
          <div className="amDetailCard">
            <div className="amDetailCardTitle">
              <FontAwesomeIcon icon={faWeightHanging} /> Exposure Factors
            </div>
            <div className="amRiskDetailExposureList">
              {exposureFactors.map((f, i) => (
                <div key={i} className="amRiskDetailExposureItem">
                  <span className="amRiskDetailExposureName">{f.factor}</span>
                  <div className="amRiskDetailExposureBar">
                    <div
                      className="amRiskDetailExposureBarFill"
                      style={{
                        width: `${Math.min(100, f.weight * 100)}%`,
                        backgroundColor: f.weight > 0.7 ? "#FF1744" : f.weight > 0.4 ? "#FF9100" : "#FFEA00"
                      }}
                    />
                  </div>
                  <span className="amRiskDetailExposureWeight">{Math.round(f.weight * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {popImpact.nearest_city && (
          <div className="amDetailCard">
            <div className="amDetailCardTitle">
              <FontAwesomeIcon icon={faUsers} /> Population Impact
            </div>
            <div className="amDetailFieldGrid">
              <div className="amDetailField">
                <span className="amDetailFieldLabel">Nearest City</span>
                <span className="amDetailFieldValue">{popImpact.nearest_city}</span>
              </div>
              {popImpact.distance_km != null && (
                <div className="amDetailField">
                  <span className="amDetailFieldLabel">City Distance</span>
                  <span className="amDetailFieldValue">{popImpact.distance_km} km</span>
                </div>
              )}
              {popImpact.density && (
                <div className="amDetailField">
                  <span className="amDetailFieldLabel">Density</span>
                  <span className="amDetailFieldValue">{popImpact.density.replace(/_/g, " ")}</span>
                </div>
              )}
              {popImpact.estimated_population != null && (
                <div className="amDetailField">
                  <span className="amDetailFieldLabel">Est. Population</span>
                  <span className="amDetailFieldValue">
                    {formatNumber(popImpact.estimated_population)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {Object.keys(meta).length > 0 && (
          <div className="amDetailCard">
            <div className="amDetailCardTitle">
              <FontAwesomeIcon icon={faDatabase} /> Source Metadata
            </div>
            <div className="amDetailFieldGrid">
              {Object.entries(meta)
                .filter(([k, v]) =>
                  v != null &&
                  typeof v !== "object" &&
                  k !== "full_message" &&
                  k !== "description" &&
                  String(v).length < 200
                )
                .slice(0, 24)
                .map(([k, v]) => (
                  <div key={k} className="amDetailField">
                    <span className="amDetailFieldLabel">
                      {k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                    </span>
                    <span className="amDetailFieldValue">
                      {typeof v === "number"
                        ? (Number.isInteger(v) ? v.toLocaleString() : v.toFixed(2))
                        : String(v)}
                    </span>
                  </div>
                ))}
            </div>
            {meta.infrastructure_proximity && meta.infrastructure_proximity.length > 0 && (
              <>
                <div className="amDivider" />
                <div className="amDetailCardTitle" style={{ marginTop: 0 }}>
                  <FontAwesomeIcon icon={faIndustry} /> Infrastructure Proximity ({meta.infrastructure_proximity.length})
                </div>
                <div className="amDetailFieldGrid">
                  {meta.infrastructure_proximity.slice(0, 10).map((inf, idx) => (
                    <div key={idx} className="amDetailField amDetailFieldWide">
                      <span className="amDetailFieldLabel">{inf.name}</span>
                      <span className="amDetailFieldValue">
                        {inf.type} · {inf.distance_km} km · {inf.risk_relevance}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {gmDet && (
          <div className="amDetailCard">
            <div className="amDetailCardTitle">
              <FontAwesomeIcon icon={faCubes} /> Golden Mesh Detection
            </div>
            <div className="amDetailFieldGrid">
              <div className="amDetailField">
                <span className="amDetailFieldLabel">Threshold Exceeded</span>
                <span
                  className="amDetailFieldValue"
                  style={{ color: gmDet.exceeded_threshold ? "#FF1744" : "#00E676" }}
                >
                  {gmDet.exceeded_threshold ? "Yes" : "No"}
                </span>
              </div>
              {gmDet.max_delta_mm != null && (
                <div className="amDetailField">
                  <span className="amDetailFieldLabel">Max Delta</span>
                  <span className="amDetailFieldValue">{gmDet.max_delta_mm} mm</span>
                </div>
              )}
              {gmDet.mean_delta_mm != null && (
                <div className="amDetailField">
                  <span className="amDetailFieldLabel">Mean Delta</span>
                  <span className="amDetailFieldValue">{gmDet.mean_delta_mm} mm</span>
                </div>
              )}
              {gmDet.affected_percentage != null && (
                <div className="amDetailField">
                  <span className="amDetailFieldLabel">Affected Points</span>
                  <span className="amDetailFieldValue">{gmDet.affected_percentage}%</span>
                </div>
              )}
              {gmDet.severity && (
                <div className="amDetailField">
                  <span className="amDetailFieldLabel">Detection Severity</span>
                  <span
                    className="amDetailFieldValue"
                    style={{ color: SEVERITY_COLORS[gmDet.severity] || "#FFF" }}
                  >
                    {gmDet.severity}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {recs.length > 0 && (
          <div className="amDetailCard">
            <div className="amDetailCardTitle">
              <FontAwesomeIcon icon={faClipboardCheck} /> Recommendations
            </div>
            <div className="amDetailFieldGrid" style={{ gridTemplateColumns: "1fr" }}>
              {recs.map((rec, idx) => (
                <div key={idx} className="amDetailField amDetailFieldWide">
                  <span className="amDetailFieldValue">{rec}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {risk.url && (
          <div className="amDetailCard">
            <a
              href={risk.url}
              target="_blank"
              rel="noopener noreferrer"
              className="amRiskDetailUrl"
            >
              <FontAwesomeIcon icon={faLink} /> View Source
            </a>
          </div>
        )}
      </div>
    </Modal>
  );
}

function RiskAssessmentDashboard({ asset, risks, isLoading, radiusKm }) {
  const [sortField, setSortField] = useState("exposure");
  const [sortDir, setSortDir] = useState("desc");
  const [catFilter, setCatFilter] = useState("all");
  const [sevFilter, setSevFilter] = useState("all");
  const [selectedRisk, setSelectedRisk] = useState(null);
  const [riskDetailOpen, setRiskDetailOpen] = useState(false);

  const displayRisks = useMemo(() => {
    if (!risks) return [];
    return risks.filter(r => {
      if (r.distance_meters !== undefined && r.distance_meters > radiusKm * 1000) return false;
      if (catFilter !== "all" && r.risk_category !== catFilter) return false;
      if (sevFilter !== "all" && r.severity !== sevFilter) return false;
      return true;
    });
  }, [risks, radiusKm, catFilter, sevFilter]);

  const stats = useMemo(() => {
    if (!displayRisks.length) return null;
    const sevCounts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    const catCounts = {};
    const sourceCounts = {};
    let closestDist = Infinity;
    let closestRisk = null;
    const withinImpactRadius = [];

    for (const r of displayRisks) {
      if (sevCounts[r.severity] !== undefined) sevCounts[r.severity]++;
      catCounts[r.risk_category] = (catCounts[r.risk_category] || 0) + 1;
      sourceCounts[r.source || "Unknown"] = (sourceCounts[r.source || "Unknown"] || 0) + 1;
      const distKm = r.distance_km ?? (r.distance_meters != null ? r.distance_meters / 1000 : null);
      if (distKm != null && distKm < closestDist) {
        closestDist = distKm;
        closestRisk = r;
      }
      if (r.impact_radius_km != null && distKm != null && distKm <= r.impact_radius_km) {
        withinImpactRadius.push(r);
      }
    }

    const compositeScore = Math.min(100, Math.round(
      (sevCounts.Critical * 25 + sevCounts.High * 10 + sevCounts.Medium * 4 + sevCounts.Low * 1) /
      Math.max(1, displayRisks.length) * 4 +
      (sevCounts.Critical > 0 ? 20 : 0) +
      (withinImpactRadius.length > 0 ? 15 : 0)
    ));

    return {
      sevCounts,
      catCounts,
      sourceCounts,
      totalRisks: displayRisks.length,
      closestRisk,
      closestDist: closestDist === Infinity ? null : closestDist,
      compositeScore,
      withinImpactRadius,
      topCategories: Object.entries(catCounts).sort((a, b) => b[1] - a[1]).slice(0, 8),
      topSources: Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]).slice(0, 6),
      criticalInPath: displayRisks.filter(r => r.severity === "Critical" && r.asset_in_direct_path)
    };
  }, [displayRisks]);

  const sortedRisks = useMemo(() => {
    return [...displayRisks].sort((a, b) => {
      let av, bv;
      if (sortField === "exposure") {
        av = a.asset_exposure_score ?? (SEVERITY_ORDER[a.severity] || 0) * 25;
        bv = b.asset_exposure_score ?? (SEVERITY_ORDER[b.severity] || 0) * 25;
      } else if (sortField === "distance") {
        av = a.distance_km ?? (a.distance_meters != null ? a.distance_meters / 1000 : Infinity);
        bv = b.distance_km ?? (b.distance_meters != null ? b.distance_meters / 1000 : Infinity);
      } else if (sortField === "severity") {
        av = SEVERITY_ORDER[a.severity] || 0;
        bv = SEVERITY_ORDER[b.severity] || 0;
      } else if (sortField === "time") {
        av = a.event_time ? new Date(a.event_time).getTime() : 0;
        bv = b.event_time ? new Date(b.event_time).getTime() : 0;
      }
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [displayRisks, sortField, sortDir]);

  const categories = useMemo(() => {
    const s = new Set();
    (risks || []).forEach(r => {
      if (r.risk_category) s.add(r.risk_category);
    });
    return Array.from(s).sort();
  }, [risks]);

  const toggleSort = (f) => {
    if (sortField === f) {
      setSortDir(d => d === "desc" ? "asc" : "desc");
    } else {
      setSortField(f);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <FontAwesomeIcon icon={faMinus} style={{ opacity: 0.3, fontSize: "0.5rem" }} />;
    return <FontAwesomeIcon icon={sortDir === "desc" ? faChevronDown : faChevronUp} style={{ fontSize: "0.5rem" }} />;
  };

  if (isLoading) {
    return (
      <div className="amRibLoading">
        <FontAwesomeIcon icon={faSpinner} spin /> Analyzing nearby risks.
      </div>
    );
  }

  if (!risks || risks.length === 0) {
    return (
      <div className="amRibEmpty">
        <FontAwesomeIcon icon={faShieldHalved} />
        <span>No risks detected within {radiusKm} km.</span>
      </div>
    );
  }

  const catColors = ["#FF9100", "#FF1744", "#FFEA00", "#00E676", "#00BCD4", "#9C27B0", "#FF5722", "#3F51B5"];
  const srcColors = ["#00BCD4", "#00E676", "#FF9100", "#9C27B0", "#FF1744", "#3F51B5"];

  return (
    <div className="amRib">
      {stats && (
        <div className="amRibSummaryGrid">
          <div className="amRibSummaryTopRow">
            <div className="amRibScoreCell">
              <div className="amRibScoreLabel">Composite Threat Score</div>
              <div className="amRibScoreDonutWrap">
                <MiniDonut
                  size={110}
                  strokeWidth={16}
                  segments={[
                    { value: stats.compositeScore, color: getRiskColorFromScore(stats.compositeScore), label: "Threat Score" },
                    { value: 100 - stats.compositeScore, color: "rgba(255,255,255,0.04)", label: "" }
                  ]}
                />
                <div
                  className="amRibScoreDonutCenter"
                  style={{ color: getRiskColorFromScore(stats.compositeScore) }}
                >
                  {stats.compositeScore}
                </div>
              </div>
            </div>
            <div className="amRibAlertsCell">
              <div className="amRibMetaItem">
                <span className="amRibMetaLabel">
                  <FontAwesomeIcon icon={faShieldHalved} /> Events in Radius
                </span>
                <span className="amRibMetaValue">
                  {stats.totalRisks} active risk event{stats.totalRisks !== 1 ? "s" : ""} within {radiusKm} km
                </span>
              </div>
              {stats.closestRisk && (
                <div className="amRibMetaItem">
                  <span className="amRibMetaLabel">
                    <FontAwesomeIcon icon={faRuler} /> Closest Threat
                  </span>
                  <span className="amRibMetaValue">
                    {stats.closestDist?.toFixed(1)} km — {stats.closestRisk.title?.substring(0, 44) || stats.closestRisk.risk_category}
                  </span>
                </div>
              )}
              {stats.topCategories.length > 0 && (
                <div className="amRibMetaItem">
                  <span className="amRibMetaLabel">
                    <FontAwesomeIcon icon={faChartBar} /> Dominant Category
                  </span>
                  <span className="amRibMetaValue">
                    {stats.topCategories[0][0]} — {stats.topCategories[0][1]} event{stats.topCategories[0][1] !== 1 ? "s" : ""}
                  </span>
                </div>
              )}
              {stats.topSources.length > 0 && (
                <div className="amRibMetaItem">
                  <span className="amRibMetaLabel">
                    <FontAwesomeIcon icon={faDatabase} /> Primary Source
                  </span>
                  <span className="amRibMetaValue">
                    {stats.topSources[0][0]} — {stats.topSources[0][1]} event{stats.topSources[0][1] !== 1 ? "s" : ""}
                  </span>
                </div>
              )}
              {stats.withinImpactRadius.length > 0 && (
                <div className="amRibMetaItem amRibMetaItemWarn amRibMetaItemFull">
                  <span className="amRibMetaLabel">
                    <FontAwesomeIcon icon={faCrosshairs} /> Inside Impact Radius
                  </span>
                  <span className="amRibMetaValue">
                    {stats.withinImpactRadius.length} active event{stats.withinImpactRadius.length !== 1 ? "s" : ""} overlap this asset
                  </span>
                </div>
              )}
              {stats.criticalInPath.length > 0 && (
                <div className="amRibMetaItem amRibMetaItemDanger amRibMetaItemFull">
                  <span className="amRibMetaLabel">
                    <FontAwesomeIcon icon={faTriangleExclamation} /> In Direct Path
                  </span>
                  <span className="amRibMetaValue">
                    {stats.criticalInPath.length} critical event{stats.criticalInPath.length !== 1 ? "s" : ""} on trajectory
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="amRibSummaryBottomRow">
            <div className="amRibBreakdownCell">
              <div className="amRibBreakdownDonutCol">
                <div className="amRibScoreLabel">Severity Breakdown</div>
                <div className="amRibSevDonutWrap">
                  <MiniDonut
                    size={110}
                    strokeWidth={16}
                    segments={Object.entries(stats.sevCounts).map(([sev, cnt]) => ({
                      value: cnt,
                      color: SEVERITY_COLORS[sev],
                      label: sev
                    }))}
                  />
                  <div className="amRibSevDonutCenter">{stats.totalRisks}</div>
                </div>
              </div>
              <div className="amRibBreakdownBarsCol">
                {Object.entries(stats.sevCounts).map(([sev, cnt]) => {
                  const pct = Math.round((cnt / (stats.totalRisks || 1)) * 100);
                  return (
                    <div key={sev} className="amRibSevRow">
                      <div className="amRibSevRowDot" style={{ backgroundColor: SEVERITY_COLORS[sev] }} />
                      <div className="amRibSevRowCount" style={{ color: SEVERITY_COLORS[sev] }}>{cnt}</div>
                      <div className="amRibSevRowLabel">{sev}</div>
                      <div className="amRibSevRowBar">
                        <div
                          className="amRibSevRowBarFill"
                          style={{ width: `${pct}%`, backgroundColor: SEVERITY_COLORS[sev] }}
                        />
                      </div>
                      <div className="amRibSevRowPct">{pct}%</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="amRibBreakdownCell">
              <div className="amRibBreakdownDonutCol">
                <div className="amRibScoreLabel">By Category</div>
                <div className="amRibSevDonutWrap">
                  <MiniDonut
                    size={110}
                    strokeWidth={16}
                    segments={stats.topCategories.map(([cat, cnt], i) => ({
                      value: cnt,
                      color: catColors[i % 8],
                      label: cat
                    }))}
                  />
                  <div className="amRibSevDonutCenter">
                    {stats.topCategories.reduce((s, [, c]) => s + c, 0)}
                  </div>
                </div>
              </div>
              <div className="amRibBreakdownBarsCol">
                {stats.topCategories.map(([cat, cnt], i) => (
                  <RiskImpactBar
                    key={cat}
                    label={cat}
                    value={cnt}
                    max={stats.totalRisks}
                    color={catColors[i % 8]}
                  />
                ))}
              </div>
            </div>

            <div className="amRibBreakdownCell">
              <div className="amRibBreakdownDonutCol">
                <div className="amRibScoreLabel">By Source</div>
                <div className="amRibSevDonutWrap">
                  <MiniDonut
                    size={110}
                    strokeWidth={16}
                    segments={stats.topSources.map(([src, cnt], i) => ({
                      value: cnt,
                      color: srcColors[i % 6],
                      label: src
                    }))}
                  />
                  <div className="amRibSevDonutCenter">
                    {stats.topSources.reduce((s, [, c]) => s + c, 0)}
                  </div>
                </div>
              </div>
              <div className="amRibBreakdownBarsCol">
                {stats.topSources.map(([src, cnt], i) => (
                  <RiskImpactBar
                    key={src}
                    label={src}
                    value={cnt}
                    max={stats.totalRisks}
                    color={srcColors[i % 6]}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="amRibTableControls">
        <div className="amRibFilters">
          <select
            className="amGridSortSelect"
            value={catFilter}
            onChange={e => setCatFilter(e.target.value)}
          >
            <option value="all">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            className="amGridSortSelect"
            value={sevFilter}
            onChange={e => setSevFilter(e.target.value)}
          >
            <option value="all">All Severities</option>
            {["Critical", "High", "Medium", "Low"].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <span className="amRibTableCount">{sortedRisks.length} events</span>
      </div>

      <div className="amRibTableScroll">
        <table className="amRibTable">
          <thead>
            <tr className="amRibTableHeader">
              <th className="amRibTh">Sev</th>
              <th className="amRibTh">Category</th>
              <th className="amRibTh amRibThTitle">Title</th>
              <th className="amRibTh">Source</th>
              <th className="amRibTh amRibThSortable" onClick={() => toggleSort("distance")}>Dist</th>
              <th className="amRibTh">Impact R.</th>
              <th className="amRibTh amRibThSortable" onClick={() => toggleSort("exposure")}>Exposure</th>
              <th className="amRibTh">In Path</th>
              <th className="amRibTh amRibThSortable" onClick={() => toggleSort("time")}>Time</th>
              <th className="amRibTh">Coords</th>
            </tr>
          </thead>
          <tbody>
            {sortedRisks.map((risk, idx) => {
              const sevCol = SEVERITY_COLORS[risk.severity] || "#FFEA00";
              const distKm = risk.distance_km ?? (risk.distance_meters != null ? risk.distance_meters / 1000 : null);
              const expScore = risk.asset_exposure_score ?? ((SEVERITY_ORDER[risk.severity] || 0) * 25);
              const inPath = risk.asset_in_direct_path;
              const withinImpact = risk.impact_radius_km != null && distKm != null && distKm <= risk.impact_radius_km;

              return (
                <tr
                  key={risk.id || idx}
                  className={`amRibRow ${withinImpact ? "amRibRowInImpact" : ""} ${inPath ? "amRibRowInPath" : ""}`}
                  onClick={() => {
                    setSelectedRisk(risk);
                    setRiskDetailOpen(true);
                  }}
                >
                  <td className="amRibTd amRibTdSev">
                    <span className="amRibSevDot" style={{ backgroundColor: sevCol }} />
                    <span className="amRibSevText" style={{ color: sevCol }}>
                      {risk.severity || "?"}
                    </span>
                  </td>
                  <td className="amRibTd amRibTdCat">
                    <FontAwesomeIcon icon={getRiskCategoryIcon(risk.risk_category)} className="amRibCatIcon" />
                    <span>{risk.risk_category || "—"}</span>
                  </td>
                  <td className="amRibTd amRibTdTitle">
                    <span className="amRibTitleText">{risk.title || "Unknown"}</span>
                    {withinImpact && <span className="amRibInImpactBadge">IN RADIUS</span>}
                  </td>
                  <td className="amRibTd amRibTdSource">
                    <span className="amRibSourceTag">{risk.source || "—"}</span>
                  </td>
                  <td className="amRibTd amRibTdDist">
                    {distKm != null ? `${distKm.toFixed(1)} km` : "—"}
                  </td>
                  <td className="amRibTd amRibTdImpact">
                    {risk.impact_radius_km != null ? `${risk.impact_radius_km} km` : "—"}
                  </td>
                  <td className="amRibTd amRibTdExp">
                    <div className="amRibExpBar">
                      <div
                        className="amRibExpBarFill"
                        style={{
                          width: `${Math.min(100, expScore)}%`,
                          backgroundColor: getRiskColorFromScore(expScore)
                        }}
                      />
                    </div>
                    <span className="amRibExpVal">{expScore}</span>
                  </td>
                  <td className="amRibTd amRibTdPath">
                    {inPath
                      ? <span className="amRibPathYes">YES</span>
                      : <span className="amRibPathNo">—</span>
                    }
                  </td>
                  <td className="amRibTd amRibTdTime">
                    {risk.event_time ? getRelativeTime(risk.event_time) : "—"}
                  </td>
                  <td className="amRibTd amRibTdCoords">
                    {risk.latitude != null
                      ? `${risk.latitude.toFixed(3)}, ${risk.longitude.toFixed(3)}`
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <NearbyRiskDetailModal
        open={riskDetailOpen}
        onClose={() => {
          setRiskDetailOpen(false);
          setSelectedRisk(null);
        }}
        risk={selectedRisk}
      />
    </div>
  );
}

function AssetMinimap({ asset, nearbyRisks, isLoading, onExpandToRCC, radiusKm, onRadiusChange, streamMeta }) {
  const wrapperRef = useRef(null);
  const maplibreContainerRef = useRef(null);
  const appleContainerRef = useRef(null);
  const maplibreMapRef = useRef(null);
  const appleMapRef = useRef(null);
  const maplibreMarkersRef = useRef([]);
  const appleAnnotationsRef = useRef([]);
  const activeProviderRef = useRef(MAP_PROVIDER_MAPLIBRE);
  const switchingRef = useRef(false);
  const appleReadyRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const initAttemptedRef = useRef(false);
  const [showRadiusSelector, setShowRadiusSelector] = useState(false);
  const radiusSelectorRef = useRef(null);
  const currentRadiusRef = useRef(radiusKm);
  const appleRadiusOverlayRef = useRef(null);

  useEffect(() => {
    currentRadiusRef.current = radiusKm;
  }, [radiusKm]);

  useEffect(() => {
    if (!showRadiusSelector) return;
    const handle = (e) => {
      if (radiusSelectorRef.current && !radiusSelectorRef.current.contains(e.target)) {
        setShowRadiusSelector(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [showRadiusSelector]);

  const clearAllMaplibreMarkers = useCallback(() => {
    maplibreMarkersRef.current.forEach(m => {
      try { m.remove(); } catch {}
    });
    maplibreMarkersRef.current = [];
  }, []);

  const clearAllAppleAnnotations = useCallback(() => {
    if (appleMapRef.current) {
      appleAnnotationsRef.current.forEach(a => {
        try { appleMapRef.current.removeAnnotation(a); } catch {}
      });
    }
    appleAnnotationsRef.current = [];
  }, []);

  const addAppleRadiusOverlay = useCallback((map, aLat, aLng, r) => {
    if (!window.mapkit) return;
    if (appleRadiusOverlayRef.current) {
      try { map.removeOverlay(appleRadiusOverlayRef.current); } catch {}
      appleRadiusOverlayRef.current = null;
    }
    const coords = buildRadiusCircleCoords(aLat, aLng, r);
    const mkCoords = coords.map(c => new window.mapkit.Coordinate(c[1], c[0]));
    const overlay = new window.mapkit.PolygonOverlay([mkCoords], {
      style: new window.mapkit.Style({
        strokeColor: "#00FFFF",
        strokeOpacity: 0.5,
        lineWidth: 1.5,
        fillColor: "#00FFFF",
        fillOpacity: 0.04
      })
    });
    map.addOverlay(overlay);
    appleRadiusOverlayRef.current = overlay;
  }, []);

  const placeAppleMarkers = useCallback((map, assetData, risks, radius) => {
    clearAllAppleAnnotations();
    if (!window.mapkit || !map) return;

    const assetColor = (ASSET_TYPES[assetData.asset_type] || ASSET_TYPES.Other).color;
    const assetRiskColor = getRiskColor(assetData.risk_score || 0);
    const assetFactory = () => {
      const el = document.createElement("div");
      el.className = "amMinimapAssetMarker";
      el.innerHTML = `<div class="amMinimapAssetMarkerPin" style="background:${assetColor};border-color:${assetRiskColor};"><div class="amMinimapAssetMarkerInner"></div></div><div class="amMinimapAssetMarkerPulse" style="background:${assetRiskColor};"></div><div class="amMinimapAssetMarkerLabel">${assetData.name || "Asset"}</div>`;
      return el;
    };
    const assetAnn = new window.mapkit.Annotation(
      new window.mapkit.Coordinate(assetData.latitude, assetData.longitude),
      assetFactory,
      { anchorOffset: new DOMPoint(0, -15), calloutEnabled: false, animates: false }
    );
    map.addAnnotation(assetAnn);
    appleAnnotationsRef.current.push(assetAnn);

    if (risks?.length > 0) {
      const radiusMeters = radius * 1000;
      risks.forEach(risk => {
        if (!risk.latitude || !risk.longitude) return;
        if (risk.distance_meters !== undefined && risk.distance_meters > radiusMeters) return;
        const sevColor = SEVERITY_COLORS[risk.severity] || "#FFEA00";
        const riskFactory = () => {
          const el = document.createElement("div");
          el.className = "amMinimapRiskMarker";
          el.innerHTML = `<div class="amMinimapRiskMarkerPin" style="background:${sevColor};"></div>`;
          return el;
        };
        const riskAnn = new window.mapkit.Annotation(
          new window.mapkit.Coordinate(risk.latitude, risk.longitude),
          riskFactory,
          { anchorOffset: new DOMPoint(0, 0), calloutEnabled: false, animates: false }
        );
        map.addAnnotation(riskAnn);
        appleAnnotationsRef.current.push(riskAnn);
      });
    }
  }, [clearAllAppleAnnotations]);

  const switchToProvider = useCallback((target, sLat, sLng, zoom, bearing) => {
    if (switchingRef.current || activeProviderRef.current === target) return;
    switchingRef.current = true;
    activeProviderRef.current = target;

    if (target === MAP_PROVIDER_APPLE) {
      if (appleMapRef.current && window.mapkit) {
        const span = zoomToAppleSpan(zoom);
        appleMapRef.current.setRegionAnimated(
          new window.mapkit.CoordinateRegion(
            new window.mapkit.Coordinate(sLat, sLng),
            new window.mapkit.CoordinateSpan(span, span)
          ),
          false
        );
        appleMapRef.current.rotation = bearing || 0;
      }
      if (appleContainerRef.current) appleContainerRef.current.style.display = "block";
      if (maplibreContainerRef.current) maplibreContainerRef.current.style.display = "none";
    } else {
      if (maplibreMapRef.current) {
        maplibreMapRef.current.jumpTo({ center: [sLng, sLat], zoom, bearing: bearing || 0 });
        maplibreMapRef.current.resize();
      }
      if (appleContainerRef.current) appleContainerRef.current.style.display = "none";
      if (maplibreContainerRef.current) maplibreContainerRef.current.style.display = "block";
    }

    setTimeout(() => {
      switchingRef.current = false;
      if (target === MAP_PROVIDER_MAPLIBRE && maplibreMapRef.current) {
        maplibreMapRef.current.resize();
      }
    }, 300);
  }, []);

  useEffect(() => {
    if (!wrapperRef.current || !asset?.latitude || !asset?.longitude || initAttemptedRef.current) return;
    initAttemptedRef.current = true;
    let cancelled = false;

    const mlContainer = document.createElement("div");
    Object.assign(mlContainer.style, {
      width: "100%",
      height: "100%",
      position: "absolute",
      top: "0",
      left: "0",
      display: "block"
    });
    wrapperRef.current.appendChild(mlContainer);
    maplibreContainerRef.current = mlContainer;

    const apContainer = document.createElement("div");
    Object.assign(apContainer.style, {
      width: "100%",
      height: "100%",
      position: "absolute",
      top: "0",
      left: "0",
      display: "none"
    });
    wrapperRef.current.appendChild(apContainer);
    appleContainerRef.current = apContainer;

    const initMaplibre = async () => {
      loadCSS("https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.css", "minimap-maplibre-css");
      await loadScript("https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.js", "minimap-maplibre-script");
      if (cancelled || !window.maplibregl) return;

      const fitZoom = radiusKmToFitZoom(currentRadiusRef.current);
      const map = new window.maplibregl.Map({
        container: mlContainer,
        style: TOPO_STYLE,
        center: [asset.longitude, asset.latitude],
        zoom: fitZoom,
        minZoom: 2,
        pitch: 0,
        bearing: 0,
        antialias: true,
        attributionControl: false
      });
      map.addControl(new window.maplibregl.NavigationControl({ showCompass: false }), "top-right");

      map.on("moveend", () => {
        if (activeProviderRef.current !== MAP_PROVIDER_MAPLIBRE || switchingRef.current) return;
        const z = map.getZoom();
        const c = map.getCenter();
        if (z >= APPLE_MAPS_ZOOM_THRESHOLD && appleReadyRef.current) {
          switchToProvider(MAP_PROVIDER_APPLE, c.lat, c.lng, z, map.getBearing());
        }
      });

      map.on("error", () => {});

      const onLoad = () => {
        if (cancelled) return;
        maplibreMapRef.current = map;
        addRadiusCircle(map, asset.latitude, asset.longitude, currentRadiusRef.current);
        setMapReady(true);
      };
      if (map.loaded()) {
        onLoad();
      } else {
        map.on("load", onLoad);
      }
    };

    const initApple = async () => {
      if (!MAPKIT_TOKEN) return;
      try {
        const mapkit = await loadMapKitJS();
        if (cancelled) return;
        await new Promise((resolve, reject) => {
          let settled = false;
          const map = new mapkit.Map(apContainer, {
            mapType: mapkit.Map.MapTypes.Satellite,
            showsCompass: mapkit.FeatureVisibility.Visible,
            showsZoomControl: true,
            showsScale: mapkit.FeatureVisibility.Visible,
            showsMapTypeControl: false,
            isRotationEnabled: true,
            isScrollEnabled: true,
            isZoomEnabled: true,
            padding: new mapkit.Padding(0, 0, 0, 0),
            center: new mapkit.Coordinate(asset.latitude, asset.longitude),
            cameraDistance: 500000,
            colorScheme: mapkit.Map.ColorSchemes.Dark
          });

          map.addEventListener("region-change-end", () => {
            if (activeProviderRef.current !== MAP_PROVIDER_APPLE || switchingRef.current) return;
            const mLat = map.center.latitude;
            const mLng = map.center.longitude;
            const zoom = appleRegionToZoom(map.region);
            if (zoom < APPLE_MAPS_ZOOM_THRESHOLD) {
              switchToProvider(MAP_PROVIDER_MAPLIBRE, mLat, mLng, zoom, map.rotation || 0);
            }
          });

          const onErr = () => {
            if (settled) return;
            settled = true;
            try { map.destroy(); } catch {}
            reject(new Error("MapKit authorization failed."));
          };
          mapkit.addEventListener("error", onErr);

          setTimeout(() => {
            if (settled || cancelled) return;
            settled = true;
            mapkit.removeEventListener("error", onErr);
            appleMapRef.current = map;
            appleReadyRef.current = true;
            resolve();
          }, 3000);
        });
      } catch {}
    };

    initMaplibre()
      .then(() => { if (!cancelled) return initApple(); })
      .catch(() => { if (!cancelled) setMapError("Failed to load the minimap."); });

    return () => {
      cancelled = true;
      clearAllMaplibreMarkers();
      clearAllAppleAnnotations();
      if (appleRadiusOverlayRef.current && appleMapRef.current) {
        try { appleMapRef.current.removeOverlay(appleRadiusOverlayRef.current); } catch {}
        appleRadiusOverlayRef.current = null;
      }
      if (appleMapRef.current) {
        try { appleMapRef.current.destroy(); } catch {}
        appleMapRef.current = null;
      }
      if (maplibreMapRef.current) {
        try { maplibreMapRef.current.remove(); } catch {}
        maplibreMapRef.current = null;
      }
      appleReadyRef.current = false;
      initAttemptedRef.current = false;
      setMapReady(false);
      setMapError(null);
    };
  }, [asset?.latitude, asset?.longitude, asset?.asset_id, switchToProvider, clearAllMaplibreMarkers, clearAllAppleAnnotations, addAppleRadiusOverlay]);

  useEffect(() => {
    if (!mapReady || !asset?.latitude || !asset?.longitude) return;
    if (maplibreMapRef.current) {
      updateRadiusCircle(maplibreMapRef.current, asset.latitude, asset.longitude, radiusKm);
      const fitZoom = radiusKmToFitZoom(radiusKm);
      const bounds = computeBoundsFromRadius(asset.latitude, asset.longitude, radiusKm * 1.1);
      maplibreMapRef.current.fitBounds(bounds, { padding: 30, maxZoom: fitZoom, duration: 800 });
    }
    if (appleMapRef.current && window.mapkit) {
      addAppleRadiusOverlay(appleMapRef.current, asset.latitude, asset.longitude, radiusKm);
    }
  }, [mapReady, radiusKm, asset?.latitude, asset?.longitude, addAppleRadiusOverlay]);

  useEffect(() => {
    if (!mapReady || !asset?.latitude || !asset?.longitude) return;

    clearAllMaplibreMarkers();

    if (maplibreMapRef.current && window.maplibregl) {
      const assetColor = (ASSET_TYPES[asset.asset_type] || ASSET_TYPES.Other).color;
      const assetRiskColor = getRiskColor(asset.risk_score || 0);
      const assetEl = document.createElement("div");
      assetEl.className = "amMinimapAssetMarker";
      assetEl.innerHTML = `<div class="amMinimapAssetMarkerPin" style="background:${assetColor};border-color:${assetRiskColor};"><div class="amMinimapAssetMarkerInner"></div></div><div class="amMinimapAssetMarkerPulse" style="background:${assetRiskColor};"></div><div class="amMinimapAssetMarkerLabel">${asset.name || "Asset"}</div>`;

      maplibreMarkersRef.current.push(
        new window.maplibregl.Marker({ element: assetEl, anchor: "bottom" })
          .setLngLat([asset.longitude, asset.latitude])
          .addTo(maplibreMapRef.current)
      );

      if (nearbyRisks?.length > 0) {
        const radiusMeters = radiusKm * 1000;
        nearbyRisks.forEach(risk => {
          if (!risk.latitude || !risk.longitude) return;
          if (risk.distance_meters !== undefined && risk.distance_meters > radiusMeters) return;

          const sevColor = SEVERITY_COLORS[risk.severity] || "#FFEA00";
          const el = document.createElement("div");
          el.className = "amMinimapRiskMarker";
          el.innerHTML = `<div class="amMinimapRiskMarkerPin" style="background:${sevColor};"></div>`;

          const distKm = risk.distance_km ?? (risk.distance_meters != null ? risk.distance_meters / 1000 : null);
          const distLabel = distKm != null ? `${Number(distKm).toFixed(1)} km` : "";

          const popup = new window.maplibregl.Popup({
            offset: 10,
            closeButton: false,
            maxWidth: "300px",
            className: "amMinimapPopupWrapper"
          }).setHTML(`
            <div class="amMinimapPopup">
              <div class="amMinimapPopupHeader">
                <div class="amMinimapPopupSev" style="background:${sevColor};">${risk.severity || "?"}</div>
                <div class="amMinimapPopupCat">${risk.risk_category || ""}</div>
              </div>
              <div class="amMinimapPopupBody">
                <div class="amMinimapPopupTitle">${risk.title || "Unknown Risk"}</div>
                <div class="amMinimapPopupMeta">${distLabel}${risk.event_time ? " · " + getRelativeTime(risk.event_time) : ""}${risk.impact_radius_km ? ` · Impact: ${risk.impact_radius_km} km` : ""}</div>
              </div>
            </div>
          `);

          maplibreMarkersRef.current.push(
            new window.maplibregl.Marker({ element: el, anchor: "center" })
              .setLngLat([risk.longitude, risk.latitude])
              .setPopup(popup)
              .addTo(maplibreMapRef.current)
          );
        });
      }
    }

    if (appleMapRef.current && window.mapkit) {
      placeAppleMarkers(appleMapRef.current, asset, nearbyRisks, radiusKm);
    }
  }, [mapReady, asset, nearbyRisks, radiusKm, clearAllMaplibreMarkers, placeAppleMarkers]);

  useEffect(() => {
    if (maplibreMapRef.current) setTimeout(() => maplibreMapRef.current.resize(), 50);
  }, [expanded]);

  if (!asset?.latitude || !asset?.longitude) return null;

  const displayRisks = nearbyRisks
    ? nearbyRisks.filter(r => r.distance_meters === undefined || r.distance_meters <= radiusKm * 1000)
    : null;

  return (
    <div className={`amMinimapContainer ${expanded ? "amMinimapExpanded" : ""}`}>
      <div className="amMinimapHeader">
        <div className="amMinimapHeaderLeft">
          <FontAwesomeIcon icon={faMap} />
          <span>Local Risk Map</span>
          {isLoading && <FontAwesomeIcon icon={faSpinner} spin className="amMinimapSpinner" />}
          {!isLoading && displayRisks && (
            <span className="amMinimapRiskCount">
              {displayRisks.length} risk{displayRisks.length !== 1 ? "s" : ""} within {radiusKm} km
            </span>
          )}
        </div>
        <div className="amMinimapHeaderRight">
          <div className="amMinimapRadiusSelector" ref={radiusSelectorRef}>
            <button
              className="amMinimapHeaderBtn amMinimapRadiusToggle"
              onClick={() => setShowRadiusSelector(!showRadiusSelector)}
              title="Change search radius"
            >
              <FontAwesomeIcon icon={faBullseye} />
              <span className="amMinimapRadiusLabel">{radiusKm} km</span>
            </button>
            {showRadiusSelector && (
              <div className="amMinimapRadiusDropdown">
                {MINIMAP_RADIUS_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    className={`amMinimapRadiusOption ${radiusKm === opt.value ? "amMinimapRadiusOptionActive" : ""}`}
                    onClick={() => {
                      onRadiusChange(opt.value);
                      setShowRadiusSelector(false);
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            className="amMinimapHeaderBtn"
            onClick={() => setExpanded(!expanded)}
            title={expanded ? "Collapse" : "Expand"}
          >
            <FontAwesomeIcon icon={expanded ? faCompress : faExpand} />
          </button>
          <button
            className="amMinimapHeaderBtn"
            onClick={onExpandToRCC}
            title="Open in Risk Command Center"
          >
            <FontAwesomeIcon icon={faCrosshairs} />
          </button>
        </div>
      </div>
      <div className="amMinimapBody">
        <div ref={wrapperRef} className="amMinimapCanvas" style={{ position: "relative" }} />
        {mapError && <div className="amMinimapError">{mapError}</div>}
        {!mapReady && !mapError && (
          <div className="amMinimapLoading">
            <FontAwesomeIcon icon={faSpinner} spin />
            <span>Loading map.</span>
          </div>
        )}
      </div>
      {streamMeta && streamMeta.duplicates_removed > 0 && (
        <div className="amMinimapStreamMeta">
          {streamMeta.duplicates_removed} duplicate{streamMeta.duplicates_removed !== 1 ? "s" : ""} removed
        </div>
      )}
    </div>
  );
}

function MeshFileUploader({ onFileSelected, onFileClear, selectedFile, uploadProgress, uploadStatus }) {
  const dropRef = useRef(null);
  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const validateFile = useCallback((file) => {
    if (!file) return null;
    const name = file.name.toLowerCase();
    const valid = ALLOWED_MESH_EXTENSIONS.some(ext => name.endsWith(ext));
    if (!valid) return `Invalid file type. Accepted: ${ALLOWED_MESH_EXTENSIONS.join(", ")}.`;
    if (file.size > 2 * 1024 * 1024 * 1024) return "File exceeds 2 GB limit.";
    return null;
  }, []);

  const handleFiles = useCallback((files) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    const err = validateFile(file);
    if (err) {
      onFileSelected(null, err);
      return;
    }
    onFileSelected(file, null);
  }, [validateFile, onFileSelected]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleInputChange = useCallback((e) => {
    handleFiles(e.target.files);
    if (inputRef.current) inputRef.current.value = "";
  }, [handleFiles]);

  const formatSize = (bytes) => {
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${bytes} bytes`;
  };

  return (
    <div className="amMeshUploaderContainer">
      {!selectedFile ? (
        <div
          ref={dropRef}
          className={`amMeshDropZone ${isDragging ? "amMeshDropZoneActive" : ""}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ALLOWED_MESH_EXTENSIONS.join(",")}
            onChange={handleInputChange}
            style={{ display: "none" }}
          />
          <FontAwesomeIcon icon={faCloudArrowUp} className="amMeshDropZoneIcon" />
          <div className="amMeshDropZoneText">Drag & drop a point cloud file here.</div>
          <div className="amMeshDropZoneSubtext">Or click to browse.</div>
          <div className="amMeshDropZoneFormats">Accepted: .las, .laz, .copc.laz, .ply, .xyz, .tif</div>
        </div>
      ) : (
        <div className="amMeshFileInfo">
          <div className="amMeshFileInfoHeader">
            <FontAwesomeIcon icon={faFileArrowUp} className="amMeshFileIcon" />
            <div className="amMeshFileDetails">
              <div className="amMeshFileName">{selectedFile.name}</div>
              <div className="amMeshFileMeta">
                {formatSize(selectedFile.size)} · {selectedFile.name.split(".").pop().toUpperCase()}
              </div>
            </div>
            {uploadStatus !== "uploading" && uploadStatus !== "processing" && (
              <button className="amMeshFileClear" onClick={onFileClear}>
                <FontAwesomeIcon icon={faTimes} />
              </button>
            )}
          </div>
          {uploadProgress > 0 && uploadProgress < 100 && (
            <div className="amMeshUploadProgress">
              <div className="amMeshUploadProgressBar">
                <div className="amMeshUploadProgressFill" style={{ width: `${uploadProgress}%` }} />
              </div>
              <span className="amMeshUploadProgressText">{uploadProgress}%</span>
            </div>
          )}
          {uploadStatus === "processing" && (
            <div className="amMeshProcessingStatus">
              <FontAwesomeIcon icon={faCircleNotch} spin /> Validating point cloud.
            </div>
          )}
          {uploadStatus === "completed" && (
            <div className="amMeshProcessingComplete">
              <FontAwesomeIcon icon={faCheck} /> Processing complete.
            </div>
          )}
          {uploadStatus === "error" && (
            <div className="amMeshProcessingError">
              <FontAwesomeIcon icon={faExclamationCircle} /> Upload failed. Try again.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AssetCard({ asset, isSelected, onClick, onEdit, onMap, onMesh, onDelete }) {
  const typeColor = (ASSET_TYPES[asset.asset_type] || ASSET_TYPES.Other).color;
  const riskCol = getRiskColor(asset.risk_score || 0);
  const riskScore = asset.risk_score || 0;

  return (
    <div
      className={`amAssetCard ${isSelected ? "amAssetCardSelected" : ""}`}
      onClick={onClick}
      style={{ borderLeftColor: typeColor }}
    >
      <div className="amAssetCardHeader">
        <div className="amAssetCardNameWrap">
          <div className="amAssetCardName">{asset.name}</div>
          <div className="amAssetCardTypeRow">
            <span className="amAssetCardTypeDot" style={{ backgroundColor: typeColor }} />
            <span className="amAssetCardTypeText">{asset.asset_type}</span>
          </div>
        </div>
        <div className="amAssetCardRiskBadge" style={{ backgroundColor: riskCol }}>
          {riskScore}
        </div>
      </div>

      <div className="amAssetCardMeta">
        <span className={`amPriorityBadge amPriority${asset.priority}`}>{asset.priority}</span>
        <span className={`amStatusBadge amStatus${asset.status}`}>{asset.status}</span>
        <span className="amAssetCardLocation">
          <FontAwesomeIcon icon={faLocationDot} className="amAssetCardLocationIcon" />
          <span className="amAssetCardLocationText">
            {asset.address_city
              ? `${asset.address_city}${asset.address_state ? `, ${asset.address_state}` : ""}${asset.address_country ? `, ${asset.address_country}` : ""}`
              : `${(asset.latitude || 0).toFixed(4)}°, ${(asset.longitude || 0).toFixed(4)}°`}
          </span>
        </span>
      </div>

      {asset.tags?.length > 0 && (
        <div className="amAssetCardTags">
          {asset.tags.slice(0, 5).map((tag, i) => (
            <span key={i} className="amTag amTagSm">{tag}</span>
          ))}
          {asset.tags.length > 5 && (
            <span className="amTag amTagSm amTagMore">+{asset.tags.length - 5}</span>
          )}
        </div>
      )}

      <div className="amAssetCardFooter">
        <span className="amAssetCardTimestamp">
          {asset.updated_at ? `Updated ${getRelativeTime(asset.updated_at)}` : "—"}
        </span>
        <div className="amAssetCardActions">
          <button
            className="amIconButton"
            onClick={(e) => { e.stopPropagation(); onEdit(asset); }}
            title="Edit"
          >
            <FontAwesomeIcon icon={faEdit} />
          </button>
          <button
            className="amIconButton"
            onClick={(e) => { e.stopPropagation(); onMesh(asset.asset_id); }}
            title="Golden Mesh"
          >
            <FontAwesomeIcon icon={faCubes} />
          </button>
          <button
            className="amIconButton"
            onClick={(e) => { e.stopPropagation(); onMap(asset); }}
            title="Open in Risk Command Center"
          >
            <FontAwesomeIcon icon={faMap} />
          </button>
          <button
            className="amIconButton amIconButtonDanger"
            onClick={(e) => { e.stopPropagation(); onDelete(asset); }}
            title="Delete"
          >
            <FontAwesomeIcon icon={faTrash} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AssetManagement({ orgid: propOrgid, username: propUsername }) {
  const [orgid] = useState(propOrgid || localStorage.getItem("orgid") || "default_org");
  const [username] = useState(propUsername || localStorage.getItem("username") || "default_user");

  const [assets, setAssets] = useState([]);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [detailedAsset, setDetailedAsset] = useState(null);
  const [assetHistory, setAssetHistory] = useState([]);
  const [editingAsset, setEditingAsset] = useState(null);
  const [assetToDelete, setAssetToDelete] = useState(null);

  const [isLoadingAssets, setIsLoadingAssets] = useState(false);
  const [isSavingAsset, setIsSavingAsset] = useState(false);
  const [isDeletingAsset, setIsDeletingAsset] = useState(false);

  const [assetFormData, setAssetFormData] = useState({ ...INITIAL_ASSET_FORM });
  const [assetFilters, setAssetFilters] = useState({ ...INITIAL_FILTERS });
  const [sortBy, setSortBy] = useState("risk_score");
  const [sortOrder, setSortOrder] = useState("desc");
  const [pagination, setPagination] = useState({ page: 1, limit: 100, total: 0, totalPages: 0 });

  const [goldenMeshes, setGoldenMeshes] = useState([]);
  const [goldenMeshDetections, setGoldenMeshDetections] = useState([]);
  const [isLoadingGoldenMesh, setIsLoadingGoldenMesh] = useState(false);
  const [isLoadingDetections, setIsLoadingDetections] = useState(false);
  const [isSavingGoldenMesh, setIsSavingGoldenMesh] = useState(false);
  const [isDeletingGoldenMesh, setIsDeletingGoldenMesh] = useState(false);
  const [isRunningDetection, setIsRunningDetection] = useState(false);
  const [isAcknowledgingDetection, setIsAcknowledgingDetection] = useState(false);
  const [isResolvingDetection, setIsResolvingDetection] = useState(false);
  const [goldenMeshFormData, setGoldenMeshFormData] = useState({ ...INITIAL_GOLDEN_MESH_FORM });
  const [selectedDetection, setSelectedDetection] = useState(null);
  const [goldenMeshAssetId, setGoldenMeshAssetId] = useState(null);
  const [goldenMeshToDelete, setGoldenMeshToDelete] = useState(null);
  const [selectedMeshForDetection, setSelectedMeshForDetection] = useState(null);
  const [detectionAcknowledgeNotes, setDetectionAcknowledgeNotes] = useState("");
  const [detectionResolveNotes, setDetectionResolveNotes] = useState("");

  const [meshUploadFile, setMeshUploadFile] = useState(null);
  const [meshUploadProgress, setMeshUploadProgress] = useState(0);
  const [meshUploadStatus, setMeshUploadStatus] = useState(null);
  const [meshUploadError, setMeshUploadError] = useState(null);
  const [meshFileId, setMeshFileId] = useState(null);

  const [comparisonUploadFile, setComparisonUploadFile] = useState(null);
  const [comparisonUploadProgress, setComparisonUploadProgress] = useState(0);
  const [comparisonUploadStatus, setComparisonUploadStatus] = useState(null);

  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryResult, setDiscoveryResult] = useState(null);

  const [minimapNearbyRisks, setMinimapNearbyRisks] = useState(null);
  const [isLoadingMinimapRisks, setIsLoadingMinimapRisks] = useState(false);
  const [minimapRadiusKm, setMinimapRadiusKm] = useState(DEFAULT_MINIMAP_RADIUS_KM);
  const [minimapStreamMeta, setMinimapStreamMeta] = useState(null);
  const minimapNearbyStreamRef = useRef(null);

  const [activeModal, setActiveModal] = useState(null);
  const [activeView, setActiveView] = useState("list");
  const [showFilters, setShowFilters] = useState(false);

  const [apiError, setApiError] = useState(null);
  const [apiSuccess, setApiSuccess] = useState(null);

  const [detectionComparisonNotes, setDetectionComparisonNotes] = useState("");

  const showNotification = useCallback((message, type = "success") => {
    const setter = type === "success" ? setApiSuccess : setApiError;
    setter(message);
    setTimeout(() => setter(null), type === "success" ? 4000 : 5000);
  }, []);

  const apiFetch = useCallback(async (url, options = {}) => {
    const response = await fetch(url, options);
    return response.json();
  }, []);

  const fetchAssets = useCallback(async (filters = {}) => {
    setIsLoadingAssets(true);
    setApiError(null);
    try {
      const params = new URLSearchParams({
        orgid,
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        sort_by: sortBy,
        sort_order: sortOrder
      });
      Object.entries(filters).forEach(([k, v]) => {
        if (v) params.append(k === "search" ? "search" : k, v);
      });
      const data = await apiFetch(`${API_BASE_URL}/risk/assets?${params}`);
      if (data.success) {
        setAssets(data.assets.map(a => ({
          ...a,
          lat: a.latitude,
          lng: a.longitude,
          type: a.asset_type,
          riskLevel: a.risk_score || 0
        })));
        setPagination(prev => ({
          ...prev,
          total: data.pagination.total,
          totalPages: data.pagination.totalPages
        }));
      } else {
        showNotification(data.message || "Failed to fetch assets.", "error");
      }
    } catch {
      showNotification("A network error occurred while fetching assets.", "error");
    } finally {
      setIsLoadingAssets(false);
    }
  }, [orgid, pagination.page, pagination.limit, sortBy, sortOrder, showNotification, apiFetch]);

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
          alerts: data.alerts
        });
      } else {
        showNotification(data.message || "Failed to fetch asset details.", "error");
      }
    } catch {
      showNotification("A network error occurred while fetching asset details.", "error");
    }
  }, [orgid, showNotification, apiFetch]);

  const fetchAssetHistory = useCallback(async (assetId) => {
    try {
      const data = await apiFetch(`${API_BASE_URL}/risk/assets/${assetId}/history?orgid=${orgid}&limit=50`);
      if (data.success) {
        setAssetHistory(data.history);
      } else {
        showNotification(data.message || "Failed to fetch asset history.", "error");
      }
    } catch {
      showNotification("A network error occurred while fetching asset history.", "error");
    }
  }, [orgid, showNotification, apiFetch]);

  const fetchGoldenMeshes = useCallback(async (assetId) => {
    setIsLoadingGoldenMesh(true);
    try {
      const data = await apiFetch(`${API_BASE_URL}/risk/assets/golden-mesh/${assetId}?orgid=${orgid}`);
      if (data.success) {
        setGoldenMeshes(data.meshes || data.baselines || []);
      } else {
        showNotification(data.message || "Failed to fetch golden mesh baselines.", "error");
      }
    } catch {
      showNotification("A network error occurred while fetching golden mesh baselines.", "error");
    } finally {
      setIsLoadingGoldenMesh(false);
    }
  }, [orgid, showNotification, apiFetch]);

  const fetchGoldenMeshDetections = useCallback(async (assetId) => {
    setIsLoadingDetections(true);
    try {
      const data = await apiFetch(`${API_BASE_URL}/risk/assets/golden-mesh/detections/${assetId}?orgid=${orgid}`);
      if (data.success) {
        setGoldenMeshDetections(data.detections || []);
      } else {
        showNotification(data.message || "Failed to fetch change detection history.", "error");
      }
    } catch {
      showNotification("A network error occurred while fetching change detection history.", "error");
    } finally {
      setIsLoadingDetections(false);
    }
  }, [orgid, showNotification, apiFetch]);

  const fetchMinimapNearbyRisks = useCallback((lat, lng, radius) => {
    if (minimapNearbyStreamRef.current) {
      try { minimapNearbyStreamRef.current.close(); } catch {}
      minimapNearbyStreamRef.current = null;
    }
    if (!lat || !lng || !radius) return;
    const effectiveRadius = Number(radius);
    if (isNaN(effectiveRadius) || effectiveRadius <= 0) return;

    setIsLoadingMinimapRisks(true);
    setMinimapNearbyRisks(null);
    setMinimapStreamMeta(null);

    const qp = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      radius_km: String(effectiveRadius),
      limit: String(MINIMAP_MAX_RISK_LIMIT),
      batch_size: "200",
      include_asset_impact: "true"
    });

    const collectedRisks = [];
    const seenIds = new Set();
    const streamUrl = `${API_BASE_URL}/risk/intelligence/stream/postgis/nearby?${qp}`;
    let evtSource;
    try {
      evtSource = new EventSource(streamUrl);
    } catch {
      setIsLoadingMinimapRisks(false);
      return;
    }

    minimapNearbyStreamRef.current = evtSource;
    let completed = false;

    const finalize = () => {
      if (completed) return;
      completed = true;
      setIsLoadingMinimapRisks(false);
      try { evtSource.close(); } catch {}
      if (minimapNearbyStreamRef.current === evtSource) minimapNearbyStreamRef.current = null;
      if (collectedRisks.length > 0) setMinimapNearbyRisks([...collectedRisks]);
    };

    evtSource.addEventListener("nearby_data", (e) => {
      try {
        const payload = JSON.parse(e.data);
        const batch = payload.batch || [];
        for (const risk of batch) {
          const riskKey = risk.source_id
            ? `${risk.source || ""}_${risk.source_id}`
            : `${risk.risk_category || ""}_${(risk.latitude || 0).toFixed(4)}_${(risk.longitude || 0).toFixed(4)}_${(risk.title || "").substring(0, 60)}`;
          if (seenIds.has(riskKey)) continue;
          seenIds.add(riskKey);
          collectedRisks.push(risk);
        }
        setMinimapNearbyRisks([...collectedRisks]);
      } catch {}
    });

    evtSource.addEventListener("stream_completed", (e) => {
      try {
        const payload = JSON.parse(e.data);
        setMinimapStreamMeta({
          total_count: payload.total_count,
          total_before_dedup: payload.total_before_dedup,
          duplicates_removed: payload.duplicates_removed || 0,
          by_severity: payload.by_severity,
          by_category: payload.by_category,
          radius_km: payload.radius_km
        });
      } catch {}
      finalize();
    });

    evtSource.addEventListener("stream_error", () => { finalize(); });
    evtSource.onerror = () => {
      if (evtSource.readyState === EventSource.CLOSED) finalize();
      else if (evtSource.readyState !== EventSource.CONNECTING) finalize();
    };
  }, []);

  const detailedAssetRef = useRef(null);
  useEffect(() => {
    detailedAssetRef.current = detailedAsset;
  }, [detailedAsset]);

  const handleMinimapRadiusChange = useCallback((newRadius) => {
    setMinimapRadiusKm(newRadius);
    const asset = detailedAssetRef.current;
    if (asset?.latitude && asset?.longitude) {
      fetchMinimapNearbyRisks(asset.latitude, asset.longitude, newRadius);
    }
  }, [fetchMinimapNearbyRisks]);

  const buildAssetPayload = useCallback((data, includeRisk = false) => {
    const payload = {
      orgid,
      username,
      name: data.name,
      description: data.description || null,
      asset_type: data.asset_type,
      priority: data.priority,
      status: data.status,
      latitude: parseFloat(data.latitude),
      longitude: parseFloat(data.longitude),
      elevation_meters: data.elevation_meters ? parseFloat(data.elevation_meters) : null,
      address_street: data.address_street || null,
      address_city: data.address_city || null,
      address_state: data.address_state || null,
      address_country: data.address_country || null,
      address_postal_code: data.address_postal_code || null,
      tags: data.tags ? data.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
      image_url: data.image_url || null,
      external_id: data.external_id || null,
      metadata: data.metadata || {}
    };
    if (includeRisk && data.risk_score) payload.risk_score = parseFloat(data.risk_score);
    return payload;
  }, [orgid, username]);

  const uploadMeshFile = useCallback(async (file, assetId) => {
    setMeshUploadStatus("uploading");
    setMeshUploadProgress(0);
    setMeshUploadError(null);
    try {
      const urlData = await apiFetch(`${API_BASE_URL}/risk/assets/golden-mesh/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_id: assetId,
          orgid,
          username,
          filename: file.name,
          content_type: file.type || "application/octet-stream",
          file_size: file.size
        })
      });
      if (!urlData.success) {
        setMeshUploadStatus("error");
        setMeshUploadError(urlData.message);
        return null;
      }
      const uploadInfo = urlData.upload;

      if (uploadInfo.storage_backend === "s3") {
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", uploadInfo.upload_url, true);
          xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) setMeshUploadProgress(Math.round((e.loaded / e.total) * 100));
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error("Upload failed with status " + xhr.status + "."));
          };
          xhr.onerror = () => reject(new Error("Upload network error occurred."));
          xhr.send(file);
        });
      } else {
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", `${API_BASE_URL}${uploadInfo.upload_url}`, true);
          xhr.setRequestHeader("X-File-Extension", "." + file.name.split(".").pop().toLowerCase());
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) setMeshUploadProgress(Math.round((e.loaded / e.total) * 100));
          };
          xhr.onload = () => {
            try {
              const resp = JSON.parse(xhr.responseText);
              if (resp.success) resolve(resp);
              else reject(new Error(resp.message));
            } catch {
              reject(new Error("Upload response parse error."));
            }
          };
          xhr.onerror = () => reject(new Error("Upload network error occurred."));
          xhr.send(file);
        });
      }

      setMeshUploadProgress(100);
      setMeshUploadStatus("processing");
      setMeshFileId(uploadInfo.file_id);
      return uploadInfo;
    } catch (error) {
      setMeshUploadStatus("error");
      setMeshUploadError(error.message || "Upload failed.");
      return null;
    }
  }, [orgid, username, apiFetch]);

  const handleMeshFileSelected = useCallback((file, error) => {
    if (error) {
      showNotification(error, "error");
      setMeshUploadFile(null);
      return;
    }
    setMeshUploadFile(file);
    setMeshUploadStatus(null);
    setMeshUploadProgress(0);
    setMeshUploadError(null);
    setMeshFileId(null);
  }, [showNotification]);

  const handleMeshFileClear = useCallback(() => {
    setMeshUploadFile(null);
    setMeshUploadStatus(null);
    setMeshUploadProgress(0);
    setMeshUploadError(null);
    setMeshFileId(null);
  }, []);

  const handleComparisonFileSelected = useCallback((file, error) => {
    if (error) {
      showNotification(error, "error");
      setComparisonUploadFile(null);
      return;
    }
    setComparisonUploadFile(file);
    setComparisonUploadStatus(null);
    setComparisonUploadProgress(0);
  }, [showNotification]);

  const handleComparisonFileClear = useCallback(() => {
    setComparisonUploadFile(null);
    setComparisonUploadStatus(null);
    setComparisonUploadProgress(0);
  }, []);

  const triggerSatelliteSync = useCallback(async (meshId) => {
    if (!meshId || !goldenMeshAssetId) return;
    setIsRunningDetection(true);
    try {
      const data = await apiFetch(`${API_BASE_URL}/risk/assets/golden-mesh/change-detection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgid,
          username,
          mesh_id: meshId,
          asset_id: goldenMeshAssetId,
          detection_mode: "satellite_insar",
          comparison_notes: detectionComparisonNotes || "Autonomous Sentinel-1 InSAR sync."
        })
      });
      if (data.success) {
        showNotification("Satellite InSAR sync completed successfully.");
        setSelectedDetection(data.detection || data);
        setActiveModal("detectionDetail");
        setDetectionComparisonNotes("");
        if (goldenMeshAssetId) fetchGoldenMeshDetections(goldenMeshAssetId);
      } else {
        showNotification(data.message || "Failed to run satellite sync.", "error");
      }
    } catch (error) {
      showNotification(error.message || "A network error occurred during satellite sync.", "error");
    } finally {
      setIsRunningDetection(false);
    }
  }, [orgid, username, goldenMeshAssetId, detectionComparisonNotes, showNotification, apiFetch, fetchGoldenMeshDetections]);

  const triggerComparisonUpload = useCallback(async (meshId) => {
    if (!meshId || !goldenMeshAssetId || !comparisonUploadFile) return;
    setIsRunningDetection(true);
    setComparisonUploadStatus("uploading");
    try {
      const urlData = await apiFetch(`${API_BASE_URL}/risk/assets/golden-mesh/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_id: goldenMeshAssetId,
          orgid,
          username,
          filename: comparisonUploadFile.name,
          content_type: comparisonUploadFile.type || "application/octet-stream",
          file_size: comparisonUploadFile.size
        })
      });
      if (!urlData.success) {
        setComparisonUploadStatus("error");
        showNotification(urlData.message || "Failed to get upload URL.", "error");
        setIsRunningDetection(false);
        return;
      }
      const uploadInfo = urlData.upload;

      if (uploadInfo.storage_backend === "s3") {
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", uploadInfo.upload_url, true);
          xhr.setRequestHeader("Content-Type", comparisonUploadFile.type || "application/octet-stream");
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) setComparisonUploadProgress(Math.round((e.loaded / e.total) * 100));
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error("Upload failed with status " + xhr.status + "."));
          };
          xhr.onerror = () => reject(new Error("Upload network error occurred."));
          xhr.send(comparisonUploadFile);
        });
      } else {
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", `${API_BASE_URL}${uploadInfo.upload_url}`, true);
          xhr.setRequestHeader("X-File-Extension", "." + comparisonUploadFile.name.split(".").pop().toLowerCase());
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) setComparisonUploadProgress(Math.round((e.loaded / e.total) * 100));
          };
          xhr.onload = () => {
            try {
              const resp = JSON.parse(xhr.responseText);
              if (resp.success) resolve(resp);
              else reject(new Error(resp.message));
            } catch {
              reject(new Error("Upload response parse error."));
            }
          };
          xhr.onerror = () => reject(new Error("Upload network error occurred."));
          xhr.send(comparisonUploadFile);
        });
      }

      setComparisonUploadStatus("processing");

      const data = await apiFetch(`${API_BASE_URL}/risk/assets/golden-mesh/change-detection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgid,
          username,
          mesh_id: meshId,
          asset_id: goldenMeshAssetId,
          detection_mode: "comparison_upload",
          comparison_file_id: uploadInfo.file_id,
          comparison_filename: comparisonUploadFile.name,
          comparison_notes: detectionComparisonNotes || `Comparison scan: ${comparisonUploadFile.name}.`
        })
      });
      if (data.success) {
        setComparisonUploadStatus("completed");
        showNotification("Comparison scan detection completed successfully.");
        setSelectedDetection(data.detection || data);
        setActiveModal("detectionDetail");
        setDetectionComparisonNotes("");
        handleComparisonFileClear();
        if (goldenMeshAssetId) fetchGoldenMeshDetections(goldenMeshAssetId);
      } else {
        setComparisonUploadStatus("error");
        showNotification(data.message || "Failed to run comparison detection.", "error");
      }
    } catch (error) {
      setComparisonUploadStatus("error");
      showNotification(error.message || "A network error occurred during comparison upload.", "error");
    } finally {
      setIsRunningDetection(false);
    }
  }, [orgid, username, goldenMeshAssetId, comparisonUploadFile, detectionComparisonNotes, showNotification, apiFetch, fetchGoldenMeshDetections, handleComparisonFileClear]);

  const discoverBaseline = useCallback(async (assetId) => {
    setIsDiscovering(true);
    setDiscoveryResult(null);
    try {
      const data = await apiFetch(`${API_BASE_URL}/risk/assets/golden-mesh/discover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset_id: assetId, orgid, username })
      });
      if (data.success) {
        setDiscoveryResult(data);
        showNotification(data.message);
      } else {
        showNotification(data.message || "Discovery failed.", "error");
      }
    } catch {
      showNotification("Discovery network error occurred.", "error");
    } finally {
      setIsDiscovering(false);
    }
  }, [orgid, username, apiFetch, showNotification]);

  const synthesizeBaseline = useCallback(async (assetId, sourceType) => {
    setIsSynthesizing(true);
    try {
      const data = await apiFetch(`${API_BASE_URL}/risk/assets/golden-mesh/synthesize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_id: assetId,
          orgid,
          username,
          source_type: sourceType || "satellite_dem"
        })
      });
      if (data.success) {
        showNotification(data.message);
        setActiveModal("goldenMeshList");
        fetchGoldenMeshes(assetId);
      } else {
        showNotification(data.message || "Synthesis failed.", "error");
      }
    } catch {
      showNotification("Synthesis network error occurred.", "error");
    } finally {
      setIsSynthesizing(false);
    }
  }, [orgid, username, apiFetch, showNotification, fetchGoldenMeshes]);

  const createAsset = useCallback(async (assetData) => {
    setIsSavingAsset(true);
    try {
      const data = await apiFetch(`${API_BASE_URL}/risk/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildAssetPayload(assetData))
      });
      if (data.success) {
        showNotification("Asset created successfully.");
        setActiveModal(null);
        setAssetFormData({ ...INITIAL_ASSET_FORM });
        fetchAssets(assetFilters);
      } else {
        showNotification(data.message || "Failed to create asset.", "error");
      }
    } catch {
      showNotification("A network error occurred while creating the asset.", "error");
    } finally {
      setIsSavingAsset(false);
    }
  }, [buildAssetPayload, assetFilters, fetchAssets, showNotification, apiFetch]);

  const updateAsset = useCallback(async (assetId, assetData) => {
    setIsSavingAsset(true);
    try {
      const data = await apiFetch(`${API_BASE_URL}/risk/assets/${assetId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildAssetPayload(assetData, true))
      });
      if (data.success) {
        showNotification("Asset updated successfully.");
        setActiveModal(null);
        setEditingAsset(null);
        setAssetFormData({ ...INITIAL_ASSET_FORM });
        fetchAssets(assetFilters);
        if (detailedAsset?.asset_id === assetId) fetchAssetDetails(assetId);
      } else {
        showNotification(data.message || "Failed to update asset.", "error");
      }
    } catch {
      showNotification("A network error occurred while updating the asset.", "error");
    } finally {
      setIsSavingAsset(false);
    }
  }, [buildAssetPayload, assetFilters, detailedAsset, fetchAssets, fetchAssetDetails, showNotification, apiFetch]);

  const deleteAsset = useCallback(async (assetId, hardDelete = false) => {
    setIsDeletingAsset(true);
    try {
      const data = await apiFetch(`${API_BASE_URL}/risk/assets/${assetId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgid, username, hard_delete: hardDelete })
      });
      if (data.success) {
        showNotification("Asset deleted successfully.");
        setActiveModal(null);
        setAssetToDelete(null);
        if (detailedAsset?.asset_id === assetId) {
          setDetailedAsset(null);
          setMinimapNearbyRisks(null);
          setActiveView("list");
        }
        fetchAssets(assetFilters);
      } else {
        showNotification(data.message || "Failed to delete asset.", "error");
      }
    } catch {
      showNotification("A network error occurred while deleting the asset.", "error");
    } finally {
      setIsDeletingAsset(false);
    }
  }, [orgid, username, assetFilters, detailedAsset, fetchAssets, showNotification, apiFetch]);

  const exportAssets = useCallback(async () => {
    try {
      const data = await apiFetch(`${API_BASE_URL}/risk/assets/export/${orgid}?username=${username}&format=json`);
      if (data.success) {
        const blob = new Blob([JSON.stringify({
          timestamp: new Date().toISOString(),
          organization: orgid,
          exportedBy: username,
          count: data.count,
          assets: data.assets
        }, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `risk_assets_${orgid}_${new Date().toISOString().split("T")[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showNotification(`Exported ${data.count} assets successfully.`);
      } else {
        showNotification(data.message || "Failed to export assets.", "error");
      }
    } catch {
      showNotification("A network error occurred while exporting assets.", "error");
    }
  }, [orgid, username, showNotification, apiFetch]);

  const createGoldenMesh = useCallback(async (assetId, meshData) => {
    setIsSavingGoldenMesh(true);
    try {
      let uploadInfo = null;
      if (meshUploadFile) {
        uploadInfo = await uploadMeshFile(meshUploadFile, assetId);
        if (!uploadInfo) {
          setIsSavingGoldenMesh(false);
          return;
        }
      }

      const payload = {
        orgid,
        username: username,
        created_by: username,
        asset_id: assetId,
        vertical_datum: meshData.vertical_datum || "WGS84",
        sensor_source: meshData.sensor_source || null,
        horizontal_accuracy_m: meshData.horizontal_accuracy_m ? parseFloat(meshData.horizontal_accuracy_m) : null,
        vertical_accuracy_m: meshData.vertical_accuracy_m ? parseFloat(meshData.vertical_accuracy_m) : null,
        point_density_per_sqm: meshData.point_density_per_sqm ? parseFloat(meshData.point_density_per_sqm) : null,
        notes: meshData.notes || null,
        scan_date: new Date().toISOString()
      };

      if (uploadInfo) {
        payload.mesh_file_id = uploadInfo.file_id;
        payload.mesh_file_url = uploadInfo.storage_path || null;
        const lowerName = meshUploadFile.name.toLowerCase();
        payload.mesh_format = lowerName.endsWith(".laz") ? "laz" : lowerName.endsWith(".las") ? "las" : "binary";
        payload.original_filename = meshUploadFile.name;
      }

      const data = await apiFetch(`${API_BASE_URL}/risk/assets/golden-mesh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (data.success) {
        showNotification(data.message || "Golden mesh baseline registered successfully.");
        setActiveModal("goldenMeshList");
        setGoldenMeshFormData({ ...INITIAL_GOLDEN_MESH_FORM });
        handleMeshFileClear();
        fetchGoldenMeshes(assetId);
      } else {
        showNotification(data.message || "Failed to register golden mesh baseline.", "error");
      }
    } catch {
      showNotification("A network error occurred while registering golden mesh baseline.", "error");
    } finally {
      setIsSavingGoldenMesh(false);
      setMeshUploadStatus(null);
    }
  }, [orgid, username, meshUploadFile, uploadMeshFile, handleMeshFileClear, fetchGoldenMeshes, showNotification, apiFetch]);

  const deleteGoldenMesh = useCallback(async (meshId) => {
    setIsDeletingGoldenMesh(true);
    try {
      const data = await apiFetch(`${API_BASE_URL}/risk/assets/golden-mesh/${meshId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgid, username })
      });
      if (data.success) {
        showNotification("Golden mesh baseline deleted successfully.");
        setGoldenMeshToDelete(null);
        setActiveModal("goldenMeshList");
        if (goldenMeshAssetId) fetchGoldenMeshes(goldenMeshAssetId);
      } else {
        showNotification(data.message || "Failed to delete golden mesh baseline.", "error");
      }
    } catch {
      showNotification("A network error occurred while deleting golden mesh baseline.", "error");
    } finally {
      setIsDeletingGoldenMesh(false);
    }
  }, [orgid, username, goldenMeshAssetId, fetchGoldenMeshes, showNotification, apiFetch]);

  const detectionWorkflow = useCallback(async (detectionId, action, notes, setLoading) => {
    setLoading(true);
    const endpoint = action === "acknowledge" ? "acknowledge" : "resolve";
    try {
      const data = await apiFetch(`${API_BASE_URL}/risk/assets/golden-mesh/detections/${detectionId}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgid, username, notes: notes || null })
      });
      if (data.success) {
        showNotification(`Detection ${endpoint}d successfully.`);
        if (action === "acknowledge") setDetectionAcknowledgeNotes("");
        else setDetectionResolveNotes("");
        if (selectedDetection?.detection_id === detectionId) {
          const updates = action === "acknowledge"
            ? {
                acknowledgment_status: "acknowledged",
                acknowledged_by: username,
                acknowledged_at: new Date().toISOString(),
                acknowledgment_notes: notes
              }
            : {
                acknowledgment_status: "resolved",
                resolved_by: username,
                resolved_at: new Date().toISOString(),
                resolution_notes: notes
              };
          setSelectedDetection(prev => ({ ...prev, ...updates }));
        }
        if (goldenMeshAssetId) fetchGoldenMeshDetections(goldenMeshAssetId);
      } else {
        showNotification(data.message || `Failed to ${endpoint} detection.`, "error");
      }
    } catch {
      showNotification(`A network error occurred while ${endpoint}ing detection.`, "error");
    } finally {
      setLoading(false);
    }
  }, [orgid, username, selectedDetection, goldenMeshAssetId, fetchGoldenMeshDetections, showNotification, apiFetch]);

  const acknowledgeDetection = useCallback(
    (id) => detectionWorkflow(id, "acknowledge", detectionAcknowledgeNotes, setIsAcknowledgingDetection),
    [detectionWorkflow, detectionAcknowledgeNotes]
  );

  const resolveDetection = useCallback(
    (id) => detectionWorkflow(id, "resolve", detectionResolveNotes, setIsResolvingDetection),
    [detectionWorkflow, detectionResolveNotes]
  );

  const navigateToAssetOnMap = useCallback((asset) => {
    window.location.href = buildRiskCommandCenterUrl(asset);
  }, []);

  const openCreateModal = useCallback(() => {
    setEditingAsset(null);
    setAssetFormData({ ...INITIAL_ASSET_FORM });
    setActiveModal("asset");
  }, []);

  const openEditModal = useCallback((asset) => {
    setEditingAsset(asset);
    setAssetFormData({
      name: asset.name || "",
      description: asset.description || "",
      asset_type: asset.asset_type || "Other",
      priority: asset.priority || "Medium",
      status: asset.status || "Active",
      latitude: asset.latitude?.toString() || "",
      longitude: asset.longitude?.toString() || "",
      elevation_meters: asset.elevation_meters?.toString() || "",
      address_street: asset.address_street || "",
      address_city: asset.address_city || "",
      address_state: asset.address_state || "",
      address_country: asset.address_country || "",
      address_postal_code: asset.address_postal_code || "",
      tags: Array.isArray(asset.tags) ? asset.tags.join(", ") : "",
      image_url: asset.image_url || "",
      external_id: asset.external_id || "",
      risk_score: asset.risk_score?.toString() || "",
      metadata: asset.metadata || {}
    });
    setActiveModal("asset");
  }, []);

  const openGoldenMeshManager = useCallback((assetId) => {
    setGoldenMeshAssetId(assetId);
    fetchGoldenMeshes(assetId);
    fetchGoldenMeshDetections(assetId);
    setActiveModal("goldenMeshList");
  }, [fetchGoldenMeshes, fetchGoldenMeshDetections]);

  const openAssetDetail = useCallback((asset) => {
    setSelectedAsset(asset.asset_id);
    fetchAssetDetails(asset.asset_id);
    setMinimapNearbyRisks(null);
    setMinimapStreamMeta(null);
    setActiveView("detail");
  }, [fetchAssetDetails]);

  const goBackToList = useCallback(() => {
    setDetailedAsset(null);
    setSelectedAsset(null);
    setMinimapNearbyRisks(null);
    setMinimapStreamMeta(null);
    setActiveView("list");
  }, []);

  const minimapRadiusRef = useRef(minimapRadiusKm);
  useEffect(() => {
    minimapRadiusRef.current = minimapRadiusKm;
  }, [minimapRadiusKm]);

  useEffect(() => {
    if (detailedAsset?.latitude && detailedAsset?.longitude && activeView === "detail") {
      fetchMinimapNearbyRisks(detailedAsset.latitude, detailedAsset.longitude, minimapRadiusRef.current);
    }
    return () => {
      if (minimapNearbyStreamRef.current) {
        try { minimapNearbyStreamRef.current.close(); } catch {}
        minimapNearbyStreamRef.current = null;
      }
    };
  }, [detailedAsset?.asset_id, activeView]);

  const handleFormChange = useCallback(
    (setter) => (field, value) => setter(prev => ({ ...prev, [field]: value })),
    []
  );
  const handleAssetFormChange = handleFormChange(setAssetFormData);
  const handleFilterChange = handleFormChange(setAssetFilters);
  const handleGoldenMeshFormChange = handleFormChange(setGoldenMeshFormData);

  const handleAssetFormSubmit = useCallback((e) => {
    e.preventDefault();
    if (!assetFormData.name || !assetFormData.latitude || !assetFormData.longitude) {
      showNotification("Name, latitude, and longitude are required.", "error");
      return;
    }
    if (editingAsset) {
      updateAsset(editingAsset.asset_id, assetFormData);
    } else {
      createAsset(assetFormData);
    }
  }, [assetFormData, editingAsset, createAsset, updateAsset, showNotification]);

  const handleGoldenMeshFormSubmit = useCallback((e) => {
    e.preventDefault();
    if (!goldenMeshAssetId) {
      showNotification("No asset selected for golden mesh registration.", "error");
      return;
    }
    createGoldenMesh(goldenMeshAssetId, goldenMeshFormData);
  }, [goldenMeshAssetId, goldenMeshFormData, createGoldenMesh, showNotification]);

  const applyFilters = useCallback(() => {
    setPagination(prev => ({ ...prev, page: 1 }));
    fetchAssets(assetFilters);
  }, [assetFilters, fetchAssets]);

  const clearFilters = useCallback(() => {
    setAssetFilters({ ...INITIAL_FILTERS });
    setPagination(prev => ({ ...prev, page: 1 }));
    fetchAssets({});
  }, [fetchAssets]);

  const toggleSort = useCallback((field) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  }, [sortBy]);

  const handleSortChange = useCallback((value) => {
    if (sortBy === value) {
      setSortOrder(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortBy(value);
      setSortOrder("desc");
    }
  }, [sortBy]);

  const closeModal = useCallback(() => {
    setActiveModal(null);
    setEditingAsset(null);
    setAssetToDelete(null);
    setAssetFormData({ ...INITIAL_ASSET_FORM });
    setGoldenMeshToDelete(null);
    setSelectedMeshForDetection(null);
    setSelectedDetection(null);
    handleMeshFileClear();
    handleComparisonFileClear();
    setDiscoveryResult(null);
    setDetectionComparisonNotes("");
  }, [handleMeshFileClear, handleComparisonFileClear]);

  useEffect(() => {
    fetchAssets(assetFilters);
  }, [pagination.page, sortBy, sortOrder]);

  useEffect(() => {
    document.body.className = "risk-theme-dark";
    return () => { document.body.className = ""; };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const assetId = params.get("asset");
    if (assetId) {
      setSelectedAsset(assetId);
      fetchAssetDetails(assetId);
      setActiveView("detail");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [fetchAssetDetails]);

  useEffect(() => {
    return () => {
      if (minimapNearbyStreamRef.current) {
        minimapNearbyStreamRef.current.close();
        minimapNearbyStreamRef.current = null;
      }
    };
  }, []);

  const riskDistribution = useMemo(() => {
    const dist = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    assets.forEach(a => {
      const s = a.risk_score || 0;
      if (s > 70) dist.Critical++;
      else if (s > 50) dist.High++;
      else if (s > 30) dist.Medium++;
      else dist.Low++;
    });
    return dist;
  }, [assets]);

  const assetTypeBreakdown = useMemo(() => {
    const counts = {};
    assets.forEach(a => {
      const t = a.asset_type || "Other";
      counts[t] = (counts[t] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [assets]);

  const criticalCount = useMemo(
    () => assets.filter(a => (a.risk_score || 0) > 70).length,
    [assets]
  );

  const SIDEBAR_ACTIONS = [
    [faPlus, "New Asset", openCreateModal],
    [faRefresh, "Refresh", () => fetchAssets(assetFilters), isLoadingAssets],
    [faFileExport, "Export", exportAssets],
    [faGlobe, "Risk Command Center", () => { window.location.href = "/risk-command-center"; }]
  ];

  const handleAssetTypeFilterClick = useCallback((typeName) => {
    if (assetFilters.asset_type === typeName) {
      handleFilterChange("asset_type", "");
    } else {
      handleFilterChange("asset_type", typeName);
    }
    setPagination(prev => ({ ...prev, page: 1 }));
    setTimeout(() => fetchAssets({ ...assetFilters, asset_type: assetFilters.asset_type === typeName ? "" : typeName }), 50);
  }, [assetFilters, handleFilterChange, fetchAssets]);

  return (
    <div className="amPageWrapper">
      <Nav activePage={"assets"} />
      <div className="amCommandCenterContainer">
        {apiError && (
          <div className="amNotification amNotificationError">
            <FontAwesomeIcon icon={faExclamationCircle} />
            <span>{apiError}</span>
            <button onClick={() => setApiError(null)}>
              <FontAwesomeIcon icon={faTimes} />
            </button>
          </div>
        )}
        {apiSuccess && (
          <div className="amNotification amNotificationSuccess">
            <FontAwesomeIcon icon={faCheckCircle} />
            <span>{apiSuccess}</span>
            <button onClick={() => setApiSuccess(null)}>
              <FontAwesomeIcon icon={faTimes} />
            </button>
          </div>
        )}

        <div className="amSideBar">
          <div className="amSideBarHeader">
            <div className="amSideBarStatusIndicator">
              <div
                className="amStatusDot"
                style={{ backgroundColor: criticalCount > 0 ? "#FF6B6B" : "#4ECDC4" }}
              />
              <span>{pagination.total || assets.length} Assets Registered</span>
            </div>
            {criticalCount > 0 && (
              <div className="amAlertBanner">
                <span className="amAlertIcon">
                  <FontAwesomeIcon icon={faTriangleExclamation} />
                </span>
                <span>{criticalCount} Critical Risk Assets</span>
              </div>
            )}
          </div>

          <div className="amSearchControls">
            <div className="amSearchInputWrapper">
              <input
                type="text"
                placeholder="Search assets..."
                value={assetFilters.search}
                onChange={e => handleFilterChange("search", e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") applyFilters(); }}
                className="amSearchInput"
              />
              {isLoadingAssets && <div className="amSearchSpinner" />}
            </div>
          </div>

          <div className="amIntelligenceSummarySection">
            <div className="amIntelligenceSummaryHeader">
              <small>Asset Risk Distribution</small>
            </div>
            <div className="amIntelligenceSummaryGrid">
              <div className="amSummaryItem amSummaryCritical">
                <span className="amSummaryValue">{riskDistribution.Critical}</span>
                <span className="amSummaryLabel">Critical</span>
              </div>
              <div className="amSummaryItem amSummaryHigh">
                <span className="amSummaryValue">{riskDistribution.High}</span>
                <span className="amSummaryLabel">High</span>
              </div>
              <div className="amSummaryItem amSummaryMedium">
                <span className="amSummaryValue">{riskDistribution.Medium}</span>
                <span className="amSummaryLabel">Medium</span>
              </div>
              <div className="amSummaryItem amSummaryLow">
                <span className="amSummaryValue">{riskDistribution.Low}</span>
                <span className="amSummaryLabel">Low</span>
              </div>
            </div>
            {assetTypeBreakdown.length > 0 && (
              <div className="amTypeBreakdown">
                {assetTypeBreakdown.slice(0, 8).map(([typeName, count]) => {
                  const typeColor = (ASSET_TYPES[typeName] || ASSET_TYPES.Other).color;
                  const isActive = assetFilters.asset_type === typeName;
                  return (
                    <div
                      key={typeName}
                      className={`amTypeItem ${isActive ? "amTypeItemActive" : ""}`}
                      onClick={() => handleAssetTypeFilterClick(typeName)}
                    >
                      <span
                        className="amTypeItemDot"
                        style={{ backgroundColor: typeColor, opacity: isActive ? 1 : 0.7 }}
                      />
                      <span className="amTypeItemName">{typeName}</span>
                      <span className="amTypeItemCount">{count}</span>
                      <span className="amTypeItemToggle">
                        <FontAwesomeIcon icon={isActive ? faEye : faEyeSlash} />
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="amFilterSection">
            <div
              className={`amFilterSectionHeader ${showFilters ? "amFilterSectionOpen" : ""}`}
              onClick={() => setShowFilters(!showFilters)}
            >
              <span className="amFilterSectionHeaderLabel">
                <FontAwesomeIcon icon={faFilter} />
                <span>Filters</span>
              </span>
              <FontAwesomeIcon icon={faChevronDown} className="amFilterSectionHeaderToggle" />
            </div>
            {showFilters && (
              <div className="amFilterBody">
                <div className="amFilterGroup">
                  <label>Type</label>
                  <select
                    value={assetFilters.asset_type}
                    onChange={e => handleFilterChange("asset_type", e.target.value)}
                    className="amFilterSelect"
                  >
                    <option value="">All Types</option>
                    {ASSET_TYPE_OPTIONS.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="amFilterGroup">
                  <label>Priority</label>
                  <select
                    value={assetFilters.priority}
                    onChange={e => handleFilterChange("priority", e.target.value)}
                    className="amFilterSelect"
                  >
                    <option value="">All</option>
                    {PRIORITY_OPTIONS.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div className="amFilterGroup">
                  <label>Status</label>
                  <select
                    value={assetFilters.status}
                    onChange={e => handleFilterChange("status", e.target.value)}
                    className="amFilterSelect"
                  >
                    <option value="">All</option>
                    {STATUS_OPTIONS.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div className="amFilterGroup">
                  <label>Tags</label>
                  <input
                    type="text"
                    value={assetFilters.tags}
                    onChange={e => handleFilterChange("tags", e.target.value)}
                    placeholder="tag1, tag2"
                    className="amFilterInput"
                  />
                </div>
                <div className="amFilterActions">
                  <button className="amSidebarButton" onClick={applyFilters}>
                    <FontAwesomeIcon icon={faFilter} /> Apply
                  </button>
                  <button className="amSidebarButton" onClick={clearFilters}>
                    <FontAwesomeIcon icon={faUndo} /> Clear
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="amSidebarActions">
            {SIDEBAR_ACTIONS.map(([icon, label, action, disabled], i) => (
              <button key={i} className="amSidebarButton" onClick={action} disabled={disabled}>
                <FontAwesomeIcon icon={icon} spin={disabled} /> {label}
              </button>
            ))}
          </div>

          {assets.length > 0 && (
            <div className="amAssetList">
              <div className="amAssetListHeader">
                <small>Assets ({assets.length})</small>
              </div>
              <div className="amAssetListItems">
                {assets.slice(0, 50).map(asset => (
                  <div
                    key={asset.asset_id}
                    className={`amAssetListItem ${selectedAsset === asset.asset_id ? "amAssetListItemSelected" : ""}`}
                    onClick={() => openAssetDetail(asset)}
                  >
                    <div className="amAssetListItemInfo">
                      <span className="amAssetListItemName">{asset.name}</span>
                      <span className="amAssetListItemType">{asset.asset_type || asset.type}</span>
                    </div>
                    <div
                      className="amAssetListItemRisk"
                      style={{ backgroundColor: getRiskColor(asset.risk_score || 0) }}
                    >
                      {asset.risk_score || 0}
                    </div>
                  </div>
                ))}
              </div>
              {pagination.totalPages > 1 && (
                <div className="amAssetListPagination">
                  <button
                    className="amSidebarButton"
                    disabled={pagination.page <= 1}
                    onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                  >
                    Prev
                  </button>
                  <span className="amPaginationInfo">{pagination.page}/{pagination.totalPages}</span>
                  <button
                    className="amSidebarButton"
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="amMainView">
          <div className="amViewHeader">
            <div className="amHeaderControls">
              {activeView === "detail" && (
                <button className="amHeaderBackButton" onClick={goBackToList}>
                  <FontAwesomeIcon icon={faArrowLeft} />
                  <span>Back</span>
                </button>
              )}
              {isLoadingAssets && (
                <div className="amHeaderLoadingIndicator">
                  <FontAwesomeIcon icon={faSpinner} spin />
                  <span>Loading...</span>
                </div>
              )}
              <div className="amHeaderInfo">
                <FontAwesomeIcon icon={faLocationCrosshairs} className="amHeaderInfoIcon" />
                <span>
                  {activeView === "detail" && detailedAsset ? detailedAsset.name : "Asset Registry"}
                </span>
              </div>
              <div className="amHeaderInfo">
                <span>Total: {pagination.total || assets.length}</span>
              </div>
              {activeView === "list" && (
                <>
                  <button className="amHeaderButton" onClick={openCreateModal}>
                    <FontAwesomeIcon icon={faPlus} /> New Asset
                  </button>
                  <button
                    className="amHeaderButton"
                    onClick={() => fetchAssets(assetFilters)}
                    disabled={isLoadingAssets}
                  >
                    <FontAwesomeIcon icon={faRefresh} spin={isLoadingAssets} /> Refresh
                  </button>
                  <button className="amHeaderButton" onClick={exportAssets}>
                    <FontAwesomeIcon icon={faFileExport} /> Export
                  </button>
                </>
              )}
              {activeView === "detail" && detailedAsset && (
                <>
                  <button className="amHeaderButton" onClick={() => navigateToAssetOnMap(detailedAsset)}>
                    <FontAwesomeIcon icon={faMap} /> Map
                  </button>
                  <button
                    className="amHeaderButton"
                    onClick={() => openGoldenMeshManager(detailedAsset.asset_id)}
                  >
                    <FontAwesomeIcon icon={faCubes} /> Mesh
                  </button>
                  <button className="amHeaderButton" onClick={() => openEditModal(detailedAsset)}>
                    <FontAwesomeIcon icon={faEdit} /> Edit
                  </button>
                  <button
                    className="amHeaderButton"
                    onClick={() => {
                      fetchAssetHistory(detailedAsset.asset_id);
                      setActiveModal("history");
                    }}
                  >
                    <FontAwesomeIcon icon={faHistory} /> History
                  </button>
                  <button
                    className="amHeaderButton amHeaderButtonDanger"
                    onClick={() => {
                      setAssetToDelete(detailedAsset);
                      setActiveModal("deleteConfirm");
                    }}
                  >
                    <FontAwesomeIcon icon={faTrash} /> Delete
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="amMainContent">
            {activeView === "list" && (
              <div className="amListContent">
                <AssetsOverviewMap
                  assets={assets}
                  selectedAssetId={selectedAsset}
                  onAssetClick={openAssetDetail}
                  isLoading={isLoadingAssets}
                />

                <div className="amGridToolbar">
                  <div className="amGridToolbarLeft">
                    <span className="amGridToolbarTitle">
                      <FontAwesomeIcon icon={faTableCells} />
                      Asset Registry
                    </span>
                    <span className="amGridToolbarCount">{assets.length} shown</span>
                  </div>
                  <div className="amGridToolbarRight">
                    <span className="amGridToolbarLabel">Sort:</span>
                    <select
                      className="amGridSortSelect"
                      value={sortBy}
                      onChange={e => setSortBy(e.target.value)}
                    >
                      {SORT_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <button
                      className="amGridSortDirBtn"
                      onClick={() => setSortOrder(prev => prev === "asc" ? "desc" : "asc")}
                      title={sortOrder === "asc" ? "Ascending" : "Descending"}
                    >
                      <FontAwesomeIcon icon={sortOrder === "asc" ? faSortUp : faSortDown} />
                    </button>
                  </div>
                </div>

                {isLoadingAssets ? (
                  <div className="amCardSkeletonGrid">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="amCardSkeleton" style={{ opacity: 1 - i * 0.1 }}>
                        <div className="amCardSkeletonHeader">
                          <div className="amSkeletonBar amSkeletonBarLg" />
                          <div className="amSkeletonBar amSkeletonBarCircle" />
                        </div>
                        <div className="amSkeletonBar amSkeletonBarMd" />
                        <div className="amSkeletonBar amSkeletonBarSm" />
                        <div className="amSkeletonBar amSkeletonBarFull" />
                      </div>
                    ))}
                  </div>
                ) : assets.length === 0 ? (
                  <div className="amEmptyRegistry">
                    <FontAwesomeIcon icon={faBoxesStacked} className="amEmptyRegistryIcon" />
                    <div className="amEmptyRegistryTitle">No Assets Registered</div>
                    <div className="amEmptyRegistryText">
                      Register your first asset to begin monitoring risk exposure, track geospatial positions, manage golden mesh baselines, and receive real-time threat intelligence alerts.
                    </div>
                    <div className="amEmptyRegistryActions">
                      <button className="amButton amButtonPrimary" onClick={openCreateModal}>
                        <FontAwesomeIcon icon={faPlus} /> Register First Asset
                      </button>
                      <button className="amButton amButtonSecondary" onClick={() => fetchAssets(assetFilters)}>
                        <FontAwesomeIcon icon={faRefresh} /> Refresh
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="amAssetGrid">
                    {assets.map(asset => (
                      <AssetCard
                        key={asset.asset_id}
                        asset={asset}
                        isSelected={selectedAsset === asset.asset_id}
                        onClick={() => openAssetDetail(asset)}
                        onEdit={() => openEditModal(asset)}
                        onMap={() => navigateToAssetOnMap(asset)}
                        onMesh={() => openGoldenMeshManager(asset.asset_id)}
                        onDelete={() => {
                          setAssetToDelete(asset);
                          setActiveModal("deleteConfirm");
                        }}
                      />
                    ))}
                  </div>
                )}

                {pagination.totalPages > 1 && (
                  <div className="amGridPagination">
                    <button
                      className="amButton amButtonSecondary"
                      disabled={pagination.page <= 1}
                      onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                    >
                      <FontAwesomeIcon icon={faArrowLeft} /> Previous
                    </button>
                    <span className="amGridPaginationInfo">
                      Page {pagination.page} of {pagination.totalPages} · {pagination.total} total
                    </span>
                    <button
                      className="amButton amButtonSecondary"
                      disabled={pagination.page >= pagination.totalPages}
                      onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                    >
                      Next <FontAwesomeIcon icon={faArrowLeft} style={{ transform: "rotate(180deg)" }} />
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeView === "detail" && (
              <>
                {!detailedAsset ? (
                  <LoadingSpinner text="Loading asset details." />
                ) : (
                  <div className="amDetailContainer">
                    <div className="amDetailCard amDetailCardMain">
                      <div className="amDetailCardHeader">
                        <div className="amDetailTitleRow">
                          <h2 className="amDetailName">{detailedAsset.name}</h2>
                          <span
                            className="amRiskBadgeLarge"
                            style={{ backgroundColor: getRiskColor(detailedAsset.risk_score || 0) }}
                          >
                            Risk: {detailedAsset.risk_score || 0}
                          </span>
                        </div>
                        <div className="amDetailSubtitleRow">
                          <span
                            className="amTypeBadge"
                            style={{ borderLeftColor: (ASSET_TYPES[detailedAsset.asset_type] || ASSET_TYPES.Other).color }}
                          >
                            {detailedAsset.asset_type}
                          </span>
                          <span className={`amPriorityBadge amPriority${detailedAsset.priority}`}>
                            {detailedAsset.priority}
                          </span>
                          <span className={`amStatusBadge amStatus${detailedAsset.status}`}>
                            {detailedAsset.status}
                          </span>
                          {detailedAsset.address_city && (
                            <span className="amDetailLocationChip">
                              <FontAwesomeIcon icon={faLocationDot} />
                              {detailedAsset.address_city}
                              {detailedAsset.address_state ? `, ${detailedAsset.address_state}` : ""}
                              {detailedAsset.address_country ? `, ${detailedAsset.address_country}` : ""}
                            </span>
                          )}
                        </div>
                      </div>
                      {detailedAsset.description && (
                        <div className="amDetailDescription">{detailedAsset.description}</div>
                      )}
                    </div>

                    <AssetMinimap
                      asset={detailedAsset}
                      nearbyRisks={minimapNearbyRisks}
                      isLoading={isLoadingMinimapRisks}
                      onExpandToRCC={() => navigateToAssetOnMap(detailedAsset)}
                      radiusKm={minimapRadiusKm}
                      onRadiusChange={handleMinimapRadiusChange}
                      streamMeta={minimapStreamMeta}
                    />

                    <div className="amDetailSectionHeader">
                      <FontAwesomeIcon icon={faShieldHalved} />
                      <span>Risk Assessment</span>
                      {isLoadingMinimapRisks && (
                        <FontAwesomeIcon icon={faSpinner} spin className="amMinimapSpinner" />
                      )}
                      <div className="amDetailSectionHeaderRight">
                        <select
                          className="amGridSortSelect"
                          value={minimapRadiusKm}
                          onChange={e => handleMinimapRadiusChange(Number(e.target.value))}
                        >
                          {MINIMAP_RADIUS_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <RiskAssessmentDashboard
                      asset={detailedAsset}
                      risks={minimapNearbyRisks}
                      isLoading={isLoadingMinimapRisks}
                      radiusKm={minimapRadiusKm}
                    />

                    <div className="amDetailGrid">
                      <div className="amDetailCard">
                        <div className="amDetailCardTitle">
                          <FontAwesomeIcon icon={faLocationDot} /> Location
                        </div>
                        <div className="amDetailFieldGrid">
                          <div className="amDetailField">
                            <span className="amDetailFieldLabel">Latitude</span>
                            <span className="amDetailFieldValue">{detailedAsset.latitude?.toFixed(6)}°</span>
                          </div>
                          <div className="amDetailField">
                            <span className="amDetailFieldLabel">Longitude</span>
                            <span className="amDetailFieldValue">{detailedAsset.longitude?.toFixed(6)}°</span>
                          </div>
                          {detailedAsset.elevation_meters && (
                            <div className="amDetailField">
                              <span className="amDetailFieldLabel">Elevation</span>
                              <span className="amDetailFieldValue">{detailedAsset.elevation_meters} m</span>
                            </div>
                          )}
                          {detailedAsset.address_street && (
                            <div className="amDetailField amDetailFieldWide">
                              <span className="amDetailFieldLabel">Street</span>
                              <span className="amDetailFieldValue">{detailedAsset.address_street}</span>
                            </div>
                          )}
                          {detailedAsset.address_city && (
                            <div className="amDetailField">
                              <span className="amDetailFieldLabel">City</span>
                              <span className="amDetailFieldValue">{detailedAsset.address_city}</span>
                            </div>
                          )}
                          {detailedAsset.address_state && (
                            <div className="amDetailField">
                              <span className="amDetailFieldLabel">State</span>
                              <span className="amDetailFieldValue">{detailedAsset.address_state}</span>
                            </div>
                          )}
                          {detailedAsset.address_country && (
                            <div className="amDetailField">
                              <span className="amDetailFieldLabel">Country</span>
                              <span className="amDetailFieldValue">{detailedAsset.address_country}</span>
                            </div>
                          )}
                          {detailedAsset.address_postal_code && (
                            <div className="amDetailField">
                              <span className="amDetailFieldLabel">Postal Code</span>
                              <span className="amDetailFieldValue">{detailedAsset.address_postal_code}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="amDetailCard">
                        <div className="amDetailCardTitle">
                          <FontAwesomeIcon icon={faShieldHalved} /> Metadata
                        </div>
                        <div className="amDetailFieldGrid">
                          {detailedAsset.external_id && (
                            <div className="amDetailField amDetailFieldWide">
                              <span className="amDetailFieldLabel">External ID</span>
                              <span className="amDetailFieldValue amDetailFieldMono">
                                {detailedAsset.external_id}
                              </span>
                            </div>
                          )}
                          {detailedAsset.tags?.length > 0 && (
                            <div className="amDetailField amDetailFieldWide">
                              <span className="amDetailFieldLabel">Tags</span>
                              <div className="amTagList">
                                {detailedAsset.tags.map((tag, i) => (
                                  <span key={i} className="amTag">{tag}</span>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="amDetailField">
                            <span className="amDetailFieldLabel">Created</span>
                            <span className="amDetailFieldValue">
                              {formatRiskTime(detailedAsset.created_at)}
                            </span>
                          </div>
                          <div className="amDetailField">
                            <span className="amDetailFieldLabel">Updated</span>
                            <span className="amDetailFieldValue">
                              {formatRiskTime(detailedAsset.updated_at)}
                            </span>
                          </div>
                          <div className="amDetailField amDetailFieldWide">
                            <span className="amDetailFieldLabel">Asset ID</span>
                            <span className="amDetailFieldValue amDetailFieldMono">
                              {detailedAsset.asset_id}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {detailedAsset.zones?.length > 0 && (
                      <div className="amDetailCard">
                        <div className="amDetailCardTitle">
                          <FontAwesomeIcon icon={faBullseye} /> Risk Zones ({detailedAsset.zones.length})
                        </div>
                        <div className="amZoneList">
                          {detailedAsset.zones.map((zone, i) => (
                            <div key={i} className="amZoneItem">
                              <span className="amZoneName">{zone.name || zone.zone_type}</span>
                              <span className="amZoneExposure">{zone.exposure_level}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {detailedAsset.alerts?.length > 0 && (
                      <div className="amDetailCard">
                        <div className="amDetailCardTitle">
                          <FontAwesomeIcon icon={faTriangleExclamation} /> Active Alerts ({detailedAsset.alerts.length})
                        </div>
                        <div className="amAlertList">
                          {detailedAsset.alerts.map((alert, i) => (
                            <div key={i} className="amAlertItem">
                              <FontAwesomeIcon icon={faTriangleExclamation} className="amAlertIcon" />
                              <span>{alert.title || alert.alert_type}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <Modal
          open={activeModal === "asset"}
          onClose={closeModal}
          title={editingAsset ? "Edit Asset" : "Create New Asset"}
          size="Medium"
        >
          <form onSubmit={handleAssetFormSubmit}>
            <div className="amFormGroup">
              <label>Name *</label>
              <input
                type="text"
                value={assetFormData.name}
                onChange={e => handleAssetFormChange("name", e.target.value)}
                placeholder="Asset name"
                required
                className="amInput"
              />
            </div>
            <div className="amFormGroup">
              <label>Description</label>
              <textarea
                value={assetFormData.description}
                onChange={e => handleAssetFormChange("description", e.target.value)}
                placeholder="Asset description"
                rows={3}
                className="amTextarea"
              />
            </div>
            <div className="amFormRow">
              <div className="amFormGroup">
                <label>Asset Type *</label>
                <select
                  value={assetFormData.asset_type}
                  onChange={e => handleAssetFormChange("asset_type", e.target.value)}
                  className="amSelect"
                >
                  {ASSET_TYPE_OPTIONS.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="amFormGroup">
                <label>Priority</label>
                <select
                  value={assetFormData.priority}
                  onChange={e => handleAssetFormChange("priority", e.target.value)}
                  className="amSelect"
                >
                  {PRIORITY_OPTIONS.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div className="amFormGroup">
                <label>Status</label>
                <select
                  value={assetFormData.status}
                  onChange={e => handleAssetFormChange("status", e.target.value)}
                  className="amSelect"
                >
                  {STATUS_OPTIONS.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="amFormRow">
              <div className="amFormGroup">
                <label>Latitude *</label>
                <input
                  type="number"
                  step="any"
                  value={assetFormData.latitude}
                  onChange={e => handleAssetFormChange("latitude", e.target.value)}
                  placeholder="-90 to 90"
                  required
                  className="amInput"
                />
              </div>
              <div className="amFormGroup">
                <label>Longitude *</label>
                <input
                  type="number"
                  step="any"
                  value={assetFormData.longitude}
                  onChange={e => handleAssetFormChange("longitude", e.target.value)}
                  placeholder="-180 to 180"
                  required
                  className="amInput"
                />
              </div>
              <div className="amFormGroup">
                <label>Elevation (m)</label>
                <input
                  type="number"
                  step="any"
                  value={assetFormData.elevation_meters}
                  onChange={e => handleAssetFormChange("elevation_meters", e.target.value)}
                  placeholder="Meters"
                  className="amInput"
                />
              </div>
            </div>
            <div className="amFormGroup">
              <LocationPickerMap
                latitude={assetFormData.latitude}
                longitude={assetFormData.longitude}
                onLocationChange={(lat, lng) => {
                  handleAssetFormChange("latitude", lat.toString());
                  handleAssetFormChange("longitude", lng.toString());
                }}
              />
            </div>
            <div className="amFormGroup">
              <label>Street Address</label>
              <input
                type="text"
                value={assetFormData.address_street}
                onChange={e => handleAssetFormChange("address_street", e.target.value)}
                placeholder="Street address"
                className="amInput"
              />
            </div>
            <div className="amFormRow">
              <div className="amFormGroup">
                <label>City</label>
                <input
                  type="text"
                  value={assetFormData.address_city}
                  onChange={e => handleAssetFormChange("address_city", e.target.value)}
                  placeholder="City"
                  className="amInput"
                />
              </div>
              <div className="amFormGroup">
                <label>State</label>
                <input
                  type="text"
                  value={assetFormData.address_state}
                  onChange={e => handleAssetFormChange("address_state", e.target.value)}
                  placeholder="State"
                  className="amInput"
                />
              </div>
            </div>
            <div className="amFormRow">
              <div className="amFormGroup">
                <label>Country</label>
                <input
                  type="text"
                  value={assetFormData.address_country}
                  onChange={e => handleAssetFormChange("address_country", e.target.value)}
                  placeholder="Country"
                  className="amInput"
                />
              </div>
              <div className="amFormGroup">
                <label>Postal Code</label>
                <input
                  type="text"
                  value={assetFormData.address_postal_code}
                  onChange={e => handleAssetFormChange("address_postal_code", e.target.value)}
                  placeholder="Postal code"
                  className="amInput"
                />
              </div>
            </div>
            <div className="amFormGroup">
              <label>Tags (comma-separated)</label>
              <input
                type="text"
                value={assetFormData.tags}
                onChange={e => handleAssetFormChange("tags", e.target.value)}
                placeholder="tag1, tag2, tag3"
                className="amInput"
              />
            </div>
            {editingAsset && (
              <div className="amFormGroup">
                <label>Risk Score (0-100)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={assetFormData.risk_score}
                  onChange={e => handleAssetFormChange("risk_score", e.target.value)}
                  placeholder="0-100"
                  className="amInput"
                />
              </div>
            )}
            <div className="amFormGroup">
              <label>External ID</label>
              <input
                type="text"
                value={assetFormData.external_id}
                onChange={e => handleAssetFormChange("external_id", e.target.value)}
                placeholder="External reference ID"
                className="amInput"
              />
            </div>
            <div className="amModalActions">
              <button type="button" className="amButton amButtonSecondary" onClick={closeModal}>
                Cancel
              </button>
              <button type="submit" className="amButton amButtonPrimary" disabled={isSavingAsset}>
                {isSavingAsset ? (
                  <>
                    <FontAwesomeIcon icon={faSpinner} spin /> Saving...
                  </>
                ) : (
                  <>
                    <FontAwesomeIcon icon={faSave} /> {editingAsset ? "Update" : "Create"}
                  </>
                )}
              </button>
            </div>
          </form>
        </Modal>

        <Modal
          open={activeModal === "deleteConfirm" && !!assetToDelete}
          onClose={() => {
            setActiveModal(null);
            setAssetToDelete(null);
          }}
          title="Confirm Delete"
          size="Small"
        >
          {assetToDelete && (
            <>
              <p className="amDeleteText">
                Are you sure you want to delete <strong>{assetToDelete.name}</strong>?
              </p>
              <p className="amDeleteWarning">This action can be undone by restoring the asset.</p>
              <div className="amModalActions">
                <button
                  className="amButton amButtonSecondary"
                  onClick={() => {
                    setActiveModal(null);
                    setAssetToDelete(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  className="amButton amButtonDanger"
                  onClick={() => deleteAsset(assetToDelete.asset_id)}
                  disabled={isDeletingAsset}
                >
                  {isDeletingAsset ? (
                    <>
                      <FontAwesomeIcon icon={faSpinner} spin /> Deleting...
                    </>
                  ) : (
                    <>
                      <FontAwesomeIcon icon={faTrash} /> Delete
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </Modal>

        <Modal
          open={activeModal === "history"}
          onClose={() => setActiveModal(null)}
          title="Asset History"
          size="Medium"
        >
          {assetHistory.length === 0 ? (
            <EmptyState icon={faHistory} text="No history records found." />
          ) : (
            <div className="amHistoryList">
              {assetHistory.map((record, idx) => (
                <div key={idx} className="amHistoryItem">
                  <div className="amHistoryItemHeader">
                    <span className="amHistoryDate">
                      {new Date(record.recorded_at).toLocaleString()}
                    </span>
                    <span className="amHistorySource">{record.source}</span>
                  </div>
                  <div className="amHistoryItemBody">
                    <span>Risk Score: <strong>{record.risk_score}</strong></span>
                    <span>Status: {record.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>

        <Modal
          open={activeModal === "goldenMeshList"}
          onClose={() => setActiveModal(null)}
          title="Golden Mesh Baselines"
          size="Large"
        >
          <div className="amGoldenMeshToolbar">
            <button
              className="amButton amButtonPrimary"
              onClick={() => {
                setGoldenMeshFormData({ ...INITIAL_GOLDEN_MESH_FORM });
                handleMeshFileClear();
                setDiscoveryResult(null);
                setActiveModal("goldenMeshCreate");
              }}
            >
              <FontAwesomeIcon icon={faUpload} /> Register New Baseline
            </button>
            <button
              className="amButton amButtonSecondary"
              onClick={() => {
                if (goldenMeshAssetId) fetchGoldenMeshDetections(goldenMeshAssetId);
                setActiveModal("detectionHistory");
              }}
            >
              <FontAwesomeIcon icon={faCodeCompare} /> Detection History
            </button>
            <button
              className="amButton amButtonSecondary"
              onClick={() => {
                if (goldenMeshAssetId) discoverBaseline(goldenMeshAssetId);
              }}
              disabled={isDiscovering}
            >
              {isDiscovering ? (
                <>
                  <FontAwesomeIcon icon={faSpinner} spin /> Discovering...
                </>
              ) : (
                <>
                  <FontAwesomeIcon icon={faSearch} /> Discover Data
                </>
              )}
            </button>
            <button
              className="amButton amButtonSecondary"
              onClick={() => {
                if (goldenMeshAssetId) synthesizeBaseline(goldenMeshAssetId, "satellite_dem");
              }}
              disabled={isSynthesizing}
            >
              {isSynthesizing ? (
                <>
                  <FontAwesomeIcon icon={faSpinner} spin /> Synthesizing...
                </>
              ) : (
                <>
                  <FontAwesomeIcon icon={faWandMagicSparkles} /> Synthesize Baseline
                </>
              )}
            </button>
          </div>

          {discoveryResult && (
            <div className="amDiscoveryResult">
              <div className="amDiscoveryResultHeader">
                <FontAwesomeIcon icon={faSatellite} /> Data Discovery Result — Tier {discoveryResult.discovery?.tier || "?"}
              </div>
              <div className="amDiscoveryResultBody">
                <div className="amDiscoveryResultSource">
                  {discoveryResult.discovery?.source || "Unknown"}
                </div>
                <div className="amDiscoveryResultDesc">
                  {discoveryResult.discovery?.description || discoveryResult.message}
                </div>
                {discoveryResult.discovery?.tier === "A" && (
                  <button
                    className="amButton amButtonPrimary"
                    onClick={() => {
                      if (goldenMeshAssetId) synthesizeBaseline(goldenMeshAssetId, "usgs_3dep");
                    }}
                    disabled={isSynthesizing}
                  >
                    {isSynthesizing ? (
                      <>
                        <FontAwesomeIcon icon={faSpinner} spin /> Importing...
                      </>
                    ) : (
                      <>
                        <FontAwesomeIcon icon={faCloudArrowUp} /> Import USGS 3DEP Data
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}

          {isLoadingGoldenMesh ? (
            <LoadingSpinner text="Loading golden mesh baselines." />
          ) : goldenMeshes.length === 0 ? (
            <EmptyState
              icon={faCubes}
              text="No golden mesh baselines registered for this asset."
              subtext="Upload a .las/.laz file or click Synthesize Baseline to auto-generate from public datasets."
            />
          ) : (
            <div className="amGoldenMeshGrid">
              {goldenMeshes.map((mesh, idx) => (
                <div
                  key={mesh.mesh_id || idx}
                  className={`amGoldenMeshCard ${mesh.is_active ? "amGoldenMeshCardActive" : ""}`}
                >
                  <div className="amGoldenMeshCardHeader">
                    <span className="amGoldenMeshCardTitle">
                      <FontAwesomeIcon
                        icon={faCubes}
                        style={{ color: mesh.is_active ? "#00E676" : "#9E9E9E" }}
                      />
                      Baseline {idx + 1}
                    </span>
                    <span
                      className={`amGoldenMeshStatusBadge ${mesh.is_active ? "amGoldenMeshStatusActive" : "amGoldenMeshStatusInactive"}`}
                    >
                      {mesh.is_active ? "Active" : "Superseded"}
                    </span>
                  </div>
                  <div className="amGoldenMeshCardBody">
                    {[
                      ["Datum", mesh.vertical_datum || "WGS84"],
                      ["Sensor", mesh.sensor_source || "N/A"],
                      ["Format", mesh.mesh_format || "N/A"],
                      mesh.has_binary_file && ["Binary File", "Yes"],
                      mesh.processing_status && ["Processing", mesh.processing_status],
                      mesh.baseline_source && ["Source", mesh.baseline_source],
                      mesh.horizontal_accuracy_m != null && ["H-Accuracy", `${mesh.horizontal_accuracy_m} m`],
                      mesh.vertical_accuracy_m != null && ["V-Accuracy", `${mesh.vertical_accuracy_m} m`],
                      mesh.point_density_per_sqm != null && ["Point Density", `${mesh.point_density_per_sqm} pts/m²`],
                      mesh.point_count != null && ["Points", formatNumber(mesh.point_count)],
                      ["Scanned", formatRiskTime(mesh.scan_date || mesh.created_at)],
                      mesh.notes && ["Notes", mesh.notes, true],
                      ["Mesh ID", mesh.mesh_id, true, true]
                    ].filter(Boolean).map(([l, v, wide, small], i) => (
                      <div
                        key={i}
                        className={`amGoldenMeshDetailItem${wide ? " amGoldenMeshDetailItemWide" : ""}`}
                      >
                        <span className="amGoldenMeshDetailLabel">{l}</span>
                        <span
                          className={`amGoldenMeshDetailValue${small ? " amGoldenMeshDetailValueSmall" : ""}`}
                        >
                          {v}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="amGoldenMeshCardActions">
                    {mesh.is_active && (
                      <button
                        className="amButton amButtonSecondary"
                        onClick={() => {
                          setSelectedMeshForDetection(mesh);
                          handleComparisonFileClear();
                          setDetectionComparisonNotes("");
                          setActiveModal("runDetection");
                        }}
                      >
                        <FontAwesomeIcon icon={faCodeCompare} /> Run Detection
                      </button>
                    )}
                    <button
                      className="amButton amButtonDanger"
                      onClick={() => {
                        setGoldenMeshToDelete(mesh);
                        setActiveModal("goldenMeshDeleteConfirm");
                      }}
                    >
                      <FontAwesomeIcon icon={faTrash} /> Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>

        <Modal
          open={activeModal === "goldenMeshCreate"}
          onClose={() => setActiveModal("goldenMeshList")}
          title="Register Golden Mesh Baseline"
          size="Medium"
        >
          <form onSubmit={handleGoldenMeshFormSubmit}>
            <div className="amFormGroup">
              <label>Point Cloud File (.las, .laz, .copc.laz)</label>
              <MeshFileUploader
                onFileSelected={handleMeshFileSelected}
                onFileClear={handleMeshFileClear}
                selectedFile={meshUploadFile}
                uploadProgress={meshUploadProgress}
                uploadStatus={meshUploadStatus}
              />
            </div>
            <div className="amFormRow">
              <div className="amFormGroup">
                <label>Vertical Datum *</label>
                <select
                  value={goldenMeshFormData.vertical_datum}
                  onChange={e => handleGoldenMeshFormChange("vertical_datum", e.target.value)}
                  className="amSelect"
                >
                  {VERTICAL_DATUM_OPTIONS.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div className="amFormGroup">
                <label>Sensor Source</label>
                <input
                  type="text"
                  value={goldenMeshFormData.sensor_source}
                  onChange={e => handleGoldenMeshFormChange("sensor_source", e.target.value)}
                  placeholder="LiDAR, photogrammetry, etc."
                  className="amInput"
                />
              </div>
            </div>
            <div className="amFormRow">
              {[
                ["Horizontal Accuracy (m)", "horizontal_accuracy_m"],
                ["Vertical Accuracy (m)", "vertical_accuracy_m"],
                ["Point Density (pts/m²)", "point_density_per_sqm"]
              ].map(([label, field], i) => (
                <div key={i} className="amFormGroup">
                  <label>{label}</label>
                  <input
                    type="number"
                    step="any"
                    value={goldenMeshFormData[field]}
                    onChange={e => handleGoldenMeshFormChange(field, e.target.value)}
                    placeholder={label.includes("Point") ? "Points per square meter" : "Meters"}
                    className="amInput"
                  />
                </div>
              ))}
            </div>
            <div className="amFormGroup">
              <label>Notes</label>
              <textarea
                value={goldenMeshFormData.notes}
                onChange={e => handleGoldenMeshFormChange("notes", e.target.value)}
                placeholder="Additional notes about this baseline scan."
                rows={3}
                className="amTextarea"
              />
            </div>
            <div className="amModalActions">
              <button
                type="button"
                className="amButton amButtonSecondary"
                onClick={() => setActiveModal("goldenMeshList")}
              >
                Cancel
              </button>
              <button type="submit" className="amButton amButtonPrimary" disabled={isSavingGoldenMesh}>
                {isSavingGoldenMesh ? (
                  <>
                    <FontAwesomeIcon icon={faSpinner} spin />
                    {meshUploadFile ? "Uploading & Registering..." : "Registering..."}
                  </>
                ) : (
                  <>
                    <FontAwesomeIcon icon={faUpload} /> Register Baseline
                  </>
                )}
              </button>
            </div>
          </form>
        </Modal>

        <Modal
          open={activeModal === "goldenMeshDeleteConfirm" && !!goldenMeshToDelete}
          onClose={() => {
            setGoldenMeshToDelete(null);
            setActiveModal("goldenMeshList");
          }}
          title="Confirm Delete Baseline"
          size="Small"
        >
          {goldenMeshToDelete && (
            <>
              <p className="amDeleteText">Are you sure you want to delete this golden mesh baseline?</p>
              <p className="amDeleteWarning">Mesh ID: {goldenMeshToDelete.mesh_id}</p>
              <div className="amModalActions">
                <button
                  className="amButton amButtonSecondary"
                  onClick={() => {
                    setGoldenMeshToDelete(null);
                    setActiveModal("goldenMeshList");
                  }}
                >
                  Cancel
                </button>
                <button
                  className="amButton amButtonDanger"
                  onClick={() => deleteGoldenMesh(goldenMeshToDelete.mesh_id)}
                  disabled={isDeletingGoldenMesh}
                >
                  {isDeletingGoldenMesh ? (
                    <>
                      <FontAwesomeIcon icon={faSpinner} spin /> Deleting...
                    </>
                  ) : (
                    <>
                      <FontAwesomeIcon icon={faTrash} /> Delete
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </Modal>

        <Modal
          open={activeModal === "runDetection"}
          onClose={() => setActiveModal("goldenMeshList")}
          title="Run Change Detection"
          size="Medium"
        >
          {selectedMeshForDetection && (
            <div>
              <div className="amDetectionInfo">
                {[
                  ["Baseline Mesh", selectedMeshForDetection.mesh_id, true],
                  ["Datum", selectedMeshForDetection.vertical_datum],
                  ["Sensor", selectedMeshForDetection.sensor_source || "N/A"]
                ].map(([l, v, small], i) => (
                  <div key={i} className="amGoldenMeshDetailItem">
                    <span className="amGoldenMeshDetailLabel">{l}</span>
                    <span
                      className={`amGoldenMeshDetailValue${small ? " amGoldenMeshDetailValueSmall" : ""}`}
                    >
                      {v}
                    </span>
                  </div>
                ))}
              </div>

              <div className="amDetectionOptions">
                <div className="amDetectionOptionCard">
                  <h4><FontAwesomeIcon icon={faSatellite} /> 1. Autonomous Satellite Sync</h4>
                  <p>Check Sentinel-1 radar data to detect millimeter-level ground subsidence over this baseline.</p>
                  <button
                    className="amButton amButtonPrimary"
                    onClick={() => triggerSatelliteSync(selectedMeshForDetection.mesh_id)}
                    disabled={isRunningDetection}
                  >
                    {isRunningDetection ? (
                      <>
                        <FontAwesomeIcon icon={faSpinner} spin /> Running InSAR Sync...
                      </>
                    ) : (
                      <>
                        <FontAwesomeIcon icon={faSatellite} /> Run InSAR Sync
                      </>
                    )}
                  </button>
                </div>

                <div className="amDetectionOptionCard">
                  <h4><FontAwesomeIcon icon={faCloudArrowUp} /> 2. Upload Comparison Scan</h4>
                  <p>Upload a new .las/.laz file to compare against the Golden Mesh.</p>
                  <MeshFileUploader
                    onFileSelected={handleComparisonFileSelected}
                    onFileClear={handleComparisonFileClear}
                    selectedFile={comparisonUploadFile}
                    uploadProgress={comparisonUploadProgress}
                    uploadStatus={comparisonUploadStatus}
                  />
                  {comparisonUploadFile && (
                    <button
                      className="amButton amButtonPrimary"
                      onClick={() => triggerComparisonUpload(selectedMeshForDetection.mesh_id)}
                      disabled={isRunningDetection}
                      style={{ marginTop: "12px" }}
                    >
                      {isRunningDetection ? (
                        <>
                          <FontAwesomeIcon icon={faSpinner} spin /> Uploading & Comparing...
                        </>
                      ) : (
                        <>
                          <FontAwesomeIcon icon={faCodeCompare} /> Upload & Run Detection
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              <div className="amFormGroup" style={{ marginTop: "16px" }}>
                <label>Comparison Notes</label>
                <textarea
                  value={detectionComparisonNotes}
                  onChange={e => setDetectionComparisonNotes(e.target.value)}
                  placeholder="Notes about this comparison run."
                  rows={3}
                  className="amTextarea"
                />
              </div>

              <div className="amModalActions">
                <button
                  type="button"
                  className="amButton amButtonSecondary"
                  onClick={() => setActiveModal("goldenMeshList")}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </Modal>

        <Modal
          open={activeModal === "detectionHistory"}
          onClose={() => setActiveModal("goldenMeshList")}
          title="Change Detection History"
          size="Large"
        >
          {isLoadingDetections ? (
            <LoadingSpinner text="Loading detection history." />
          ) : goldenMeshDetections.length === 0 ? (
            <EmptyState icon={faCodeCompare} text="No change detections recorded for this asset." />
          ) : (
            <div className="amDetectionHistoryList">
              {goldenMeshDetections.map((det, idx) => (
                <div
                  key={det.detection_id || idx}
                  className="amDetectionHistoryItem"
                  onClick={() => {
                    setSelectedDetection(det);
                    setActiveModal("detectionDetail");
                  }}
                >
                  <div className="amDetectionHistoryItemHeader">
                    <span
                      className="amDetectionBadge"
                      style={{ backgroundColor: getDeformationSeverityColor(det.severity) }}
                    >
                      {det.severity
                        ? det.severity.charAt(0).toUpperCase() + det.severity.slice(1)
                        : "Unknown"}
                    </span>
                    <span className="amDetectionDate">
                      {formatRiskTime(det.detection_time || det.created_at)}
                    </span>
                    <span
                      className={`amDetectionStatus amDetectionStatus${
                        det.acknowledgment_status === "resolved" ? "Resolved"
                          : det.acknowledgment_status === "acknowledged" ? "Acknowledged"
                          : "Pending"
                      }`}
                    >
                      {det.acknowledgment_status
                        ? det.acknowledgment_status.charAt(0).toUpperCase() + det.acknowledgment_status.slice(1)
                        : "Pending"}
                    </span>
                  </div>
                  <div className="amDetectionHistoryItemBody">
                    <span>Max Delta: {det.max_delta_mm?.toFixed(2) || "N/A"} mm</span>
                    <span>Mean Delta: {det.mean_delta_mm?.toFixed(2) || "N/A"} mm</span>
                    <span>
                      Affected: {det.affected_point_count || 0} points
                      ({det.affected_point_pct ? (det.affected_point_pct * 100).toFixed(1) : "0"}%)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>

        <Modal
          open={activeModal === "detectionDetail" && !!selectedDetection}
          onClose={() => setActiveModal("detectionHistory")}
          title="Detection Detail"
          size="Large"
        >
          {selectedDetection && (
            <>
              <div className="amDetectionDetailHeader">
                <div
                  className="amDetectionBadge amDetectionBadgeLarge"
                  style={{ backgroundColor: getDeformationSeverityColor(selectedDetection.severity) }}
                >
                  {selectedDetection.severity
                    ? selectedDetection.severity.charAt(0).toUpperCase() + selectedDetection.severity.slice(1)
                    : "Unknown"}
                </div>
                <div className="amDetectionDetailTime">
                  {formatRiskTime(selectedDetection.detection_time || selectedDetection.created_at)}
                </div>
              </div>

              <div className="amDetectionDetailGrid">
                {[
                  [
                    "Max Delta",
                    `${selectedDetection.max_delta_mm?.toFixed(2) || "N/A"} mm`,
                    { color: Math.abs(selectedDetection.max_delta_mm || 0) > 20 ? "#FF1744" : "#FF9100" }
                  ],
                  ["Mean Delta", `${selectedDetection.mean_delta_mm?.toFixed(2) || "N/A"} mm`],
                  ["Std Deviation", `${selectedDetection.std_delta_mm?.toFixed(2) || "N/A"} mm`],
                  ["Affected Points", formatNumber(selectedDetection.affected_point_count || 0)],
                  [
                    "Affected Percentage",
                    `${selectedDetection.affected_point_pct ? (selectedDetection.affected_point_pct * 100).toFixed(1) : "0"}%`
                  ],
                  selectedDetection.hotspot_coordinates?.length > 0 && [
                    "Hotspots",
                    `${selectedDetection.hotspot_coordinates.length} location${selectedDetection.hotspot_coordinates.length > 1 ? "s" : ""}`
                  ],
                  selectedDetection.detection_mode && [
                    "Detection Mode",
                    selectedDetection.detection_mode === "satellite_insar"
                      ? "Sentinel-1 InSAR"
                      : selectedDetection.detection_mode === "comparison_upload"
                      ? "Comparison Scan Upload"
                      : selectedDetection.detection_mode
                  ],
                  selectedDetection.deformation_source && [
                    "Deformation Source",
                    selectedDetection.deformation_source
                  ],
                  ["Mesh ID", selectedDetection.mesh_id || "N/A", { small: true }],
                  ["Detection ID", selectedDetection.detection_id || "N/A", { small: true }]
                ].filter(Boolean).map(([l, v, opts = {}], i) => (
                  <div key={i} className="amDetectionDetailItem">
                    <span className="amDetectionDetailLabel">{l}</span>
                    <span
                      className={`amDetectionDetailValue${opts.small ? " amDetectionDetailValueSmall" : ""}`}
                      style={opts.color ? { color: opts.color } : undefined}
                    >
                      {v}
                    </span>
                  </div>
                ))}
              </div>

              <div className="amDivider" />
              <div className="amSectionTitle">Acknowledgment Workflow</div>

              <div className="amDetectionDetailGrid">
                {[
                  [
                    "Status",
                    selectedDetection.acknowledgment_status
                      ? selectedDetection.acknowledgment_status.charAt(0).toUpperCase() + selectedDetection.acknowledgment_status.slice(1)
                      : "Pending",
                    {
                      color: selectedDetection.acknowledgment_status === "resolved"
                        ? "#00E676"
                        : selectedDetection.acknowledgment_status === "acknowledged"
                        ? "#FFEA00"
                        : "#9E9E9E"
                    }
                  ],
                  selectedDetection.acknowledged_by && ["Acknowledged By", selectedDetection.acknowledged_by],
                  selectedDetection.acknowledged_at && ["Acknowledged At", formatRiskTime(selectedDetection.acknowledged_at)],
                  selectedDetection.acknowledgment_notes && ["Ack Notes", selectedDetection.acknowledgment_notes, { wide: true }],
                  selectedDetection.resolved_by && ["Resolved By", selectedDetection.resolved_by],
                  selectedDetection.resolved_at && ["Resolved At", formatRiskTime(selectedDetection.resolved_at)],
                  selectedDetection.resolution_notes && ["Resolution Notes", selectedDetection.resolution_notes, { wide: true }]
                ].filter(Boolean).map(([l, v, opts = {}], i) => (
                  <div
                    key={i}
                    className={`amDetectionDetailItem${opts.wide ? " amDetectionDetailItemWide" : ""}`}
                  >
                    <span className="amDetectionDetailLabel">{l}</span>
                    <span
                      className="amDetectionDetailValue"
                      style={opts.color ? { color: opts.color } : undefined}
                    >
                      {v}
                    </span>
                  </div>
                ))}
              </div>

              {selectedDetection.acknowledgment_status !== "acknowledged"
                && selectedDetection.acknowledgment_status !== "resolved" && (
                <>
                  <div className="amDivider" />
                  <div className="amFormGroup">
                    <label>Acknowledgment Notes</label>
                    <textarea
                      value={detectionAcknowledgeNotes}
                      onChange={e => setDetectionAcknowledgeNotes(e.target.value)}
                      placeholder="Enter notes for acknowledging this detection."
                      rows={2}
                      className="amTextarea"
                    />
                  </div>
                  <button
                    className="amButton amButtonPrimary"
                    onClick={() => acknowledgeDetection(selectedDetection.detection_id)}
                    disabled={isAcknowledgingDetection}
                  >
                    {isAcknowledgingDetection ? (
                      <>
                        <FontAwesomeIcon icon={faSpinner} spin /> Acknowledging...
                      </>
                    ) : (
                      <>
                        <FontAwesomeIcon icon={faClipboardCheck} /> Acknowledge Detection
                      </>
                    )}
                  </button>
                </>
              )}

              {selectedDetection.acknowledgment_status === "acknowledged" && (
                <>
                  <div className="amDivider" />
                  <div className="amFormGroup">
                    <label>Resolution Notes</label>
                    <textarea
                      value={detectionResolveNotes}
                      onChange={e => setDetectionResolveNotes(e.target.value)}
                      placeholder="Enter notes for resolving this detection."
                      rows={2}
                      className="amTextarea"
                    />
                  </div>
                  <button
                    className="amButton amButtonPrimary"
                    onClick={() => resolveDetection(selectedDetection.detection_id)}
                    disabled={isResolvingDetection}
                  >
                    {isResolvingDetection ? (
                      <>
                        <FontAwesomeIcon icon={faSpinner} spin /> Resolving...
                      </>
                    ) : (
                      <>
                        <FontAwesomeIcon icon={faCircleCheck} /> Resolve Detection
                      </>
                    )}
                  </button>
                </>
              )}
            </>
          )}
        </Modal>
      </div>
    </div>
  );
}