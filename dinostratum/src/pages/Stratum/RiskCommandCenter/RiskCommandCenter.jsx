import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { openDB } from "idb";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMountain, faWater, faFire, faCircle, faHurricane,
  faIndustry, faRoad, faLink, faTriangleExclamation, faLocationCrosshairs,
  faObjectGroup, faGlobe, faTimes, faPlus, faEdit,
  faTrash, faChartBar, faMap, faSave, faExclamationCircle,
  faCheckCircle, faSpinner, faLayerGroup, faCloud, faSmog,
  faEarthAmericas, faVolcano, faHouseTsunami, faTemperatureHigh, faSnowflake,
  faSatellite, faLungs, faTornado, faEye, faEyeSlash,
  faShieldHalved, faDatabase, faBullseye, faMapPin, faBolt,
  faLocationDot, faWind, faRadiation, faHandcuffs, faBell,
  faSquareCheck, faXmarkSquare, faBan, faCheck, faDownload,
  faLightbulb, faXmark, faSearchPlus, faMapMarkerAlt,
  faBroadcastTower, faHistory, faClock, faRefresh, faList,
  faVolumeHigh, faVolumeXmark, faBellSlash, faRepeat, faPlay,
  faForwardStep, faBackwardStep, faFireFlameCurved,
  faBrain, faGlobeAmericas, faRuler, faBuilding, faCheckDouble
} from "@fortawesome/free-solid-svg-icons";
import Nav from "../../../helpers/Nav.jsx";
import Dropdown from "../../../helpers/Dropdown.jsx";
import useAuth from "../../../UseAuth.jsx";
import ReactEcharts from "echarts-for-react";
import IntelligenceBriefCenter from "../IntelligenceBriefCenter/IntelligenceBriefCenter.jsx";
import "../../../styles/mainStyles/Sat/EarthConditions/EarthConditions.css";
import "../../../styles/mainStyles/Sat/Trackers/WeatherTracker/WeatherTracker.css";
import "../../../styles/mainStyles/Stratum/RiskCommandCenter/RiskCommandCenter.css";
import "../../../styles/helperStyles/LoadingSpinner.css";
import "../../../styles/helperStyles/Disconnected.css";

const SOURCES = {
  apiBase: import.meta.env.VITE_API_BASE_URL,
  endpoints: {
    hazards: "/risk/areas/hazards",
    areas: "/risk/areas",
    live: "/risk/intelligence/live",
    sourceStatus: "/risk/intelligence/sources/status",
    sources: "/risk/intelligence/sources",
    nearby: "/risk/intelligence/stream/postgis/nearby",
    assessLocation: "/risk/intelligence/assess-location",
    views: "/risk/user/views",
    alertAnalysis: "/risk/alerts/analysis",
    locationSearch: "/location-search",
    reverseGeocode: "/reverse-geocode"
  },
  external: {
    overpassMirrors: [
      "https://overpass-api.de/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter",
      "https://overpass.openstreetmap.fr/api/interpreter",
      "https://overpass.private.coffee/api/interpreter"
    ],
    nominatimReverse: "https://nominatim.openstreetmap.org/reverse",
    openElevation: "https://api.open-elevation.com/api/v1/lookup",
    wikipediaSummary: "https://{lang}.wikipedia.org/api/rest_v1/page/summary/",
    userAgent: "RiskCommandCenter/1.0"
  },
  geocoding: {
    photon: "https://photon.komoot.io/api/",
    nominatim: "https://nominatim.openstreetmap.org/search",
    userAgent: "RiskCommandCenter/1.0",
    minQueryLength: 3,
    debounceMs: 300,
    resultLimit: 6,
    cacheLimit: 100,
    attribution: "Photon · © OpenStreetMap Contributors"
  },
  assets: {
    maplibreCss: "https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css",
    maplibreScript: "https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js",
    deckScript: "https://unpkg.com/deck.gl@9.3.6/dist.min.js",
    deckMapboxScript: "https://unpkg.com/@deck.gl/mapbox@9.3.6/dist.min.js",
    mapkitScript: "https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js",
    mapkitToken: import.meta.env.VITE_APPLE_MAPS_KEY,
    satelliteTiles: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    labelTiles: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
    topoTiles: ["https://a.tile.opentopomap.org/{z}/{x}/{y}.png", "https://b.tile.opentopomap.org/{z}/{x}/{y}.png", "https://c.tile.opentopomap.org/{z}/{x}/{y}.png"],
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf"
  },
  harvest: {
    base: `${import.meta.env.VITE_API_BASE_URL}/harvest`,
    domain: "stratum-risk",
    healthRefreshMs: 60 * 1000,
    jobPattern: /^stratumrisk:/,
    statusColors: { Healthy: "#4ecdc4", Degraded: "#FF9500", Idle: "#919baf", "Needs Schema": "#ff6b6b", Loading: "#919baf" }
  },
  refresh: {
    sourceStatusMs: 60 * 1000,
    expirySweepMs: 60 * 1000,
    assessmentMs: 600 * 1000
  },
  live: {
    flushMs: 400,
    maxRetained: 15000,
    snapshotWaitMs: 20000
  },
  tables: {
    tightAt: 14,
    wrapAt: 28,
    maxRows: 500
  },
  persistence: {
    dbName: "RiskCommandCenterStateDB",
    storeName: "state",
    recordId: "state",
    restoreFlag: "riskCommandCenterRestoreInFlight",
    restoreSettleMs: 3000,
    saveDebounceMs: 500
  },
  sounds: {
    defaults: { enabled: false, minLevel: "warning", scope: "view", volume: 0.6, mode: "single", snoozeUntil: 0 },
    repeatGapSeconds: 0.8,
    scheduleAheadSeconds: 120,
    topUpSeconds: 20
  },
  savedViews: {
    storageKey: "riskSavedViews",
    max: 50
  },
  map: {
    center: [0, 20],
    zoom: 1,
    minZoom: 1,
    deckMaxZoom: 7,
    heatmapMaxZoom: 18,
    appleZoomThreshold: 6,
    focusZoom: 10,
    badgeZoom: 4,
    labelZoom: 6,
    maxRisksDrawn: 15000,
    areaUnionGrid: 240,
    appleMaxAnnotations: 500,
    heatmapPerCategory: 500,
    appleLoadTimeoutMs: 10000
  }
};

const apiUrl = (key) => `${SOURCES.apiBase}${SOURCES.endpoints[key]}`;

const DATA_TYPE = {
  LIVE: { label: "LIVE", icon: faBroadcastTower, color: "#4ecdc4", description: "Real-Time Observation" },
  HISTORICAL: { label: "HISTORICAL", icon: faHistory, color: "#919baf", description: "Past Recorded Data" },
  COMPUTED: { label: "COMPUTED", icon: faDatabase, color: "#cdd4e4", description: "Derived from Current Data" },
  FORECAST: { label: "FORECAST", icon: faClock, color: "#B388FF", description: "Model Forecast Data" }
};

const PANEL_CONTAINER_CLASS = { LIVE: "Live", HISTORICAL: "Historical", COMPUTED: "Computed", FORECAST: "Computed" };

const CHART_FONT = "Inter, Arial, sans-serif";

const DEFAULT_LAYOUT = { nav: true, header: true, sidebar: true, footer: true };

const LAYOUT_TOGGLES = [["nav", "Nav"], ["header", "Header"], ["sidebar", "Sidebar"], ["footer", "Footer"]];

const EXPANDABLE_SELECTOR = ".satEarthCondTableCard, .satEarthCondChartDescription, .satEarthCondStatusTileGrid, .satEarthCondStatsSummary";

const REFRESH_INTERVAL_OPTIONS = [[60000, "1 Minute"], [120000, "2 Minutes"], [300000, "5 Minutes"]];

const SEVERITY_FILTER_OPTIONS = [["all", "All Severities"], ["medium", "Medium And Up"], ["high", "High And Up"], ["critical", "Critical Only"]];

const SEVERITY_FILTER_FLOOR = { all: 0, medium: 2, high: 3, critical: 4 };

const AREA_RADIUS_OPTIONS = [[25, "25 Km Radius"], [50, "50 Km Radius"], [100, "100 Km Radius"], [250, "250 Km Radius"], [500, "500 Km Radius"], [1000, "1,000 Km Radius"]];

const ASSESSMENT_SORT_OPTIONS = [["exposure", "Highest Exposure"], ["distance", "Closest First"], ["severity", "Most Severe"], ["time", "Newest First"]];

const DEFAULT_ASSESSMENT_VIEW = { catFilter: "all", sortField: "exposure" };

const SOUND_VOLUME_OPTIONS = [[0.3, "Quiet"], [0.6, "Normal"], [1, "Loud"]];

const SNOOZE_OPTIONS = [[15, "15 Minutes"], [30, "30 Minutes"], [60, "1 Hour"], [120, "2 Hours"], [240, "4 Hours"], [480, "8 Hours"], [1440, "24 Hours"]];

const SOUND_LEVEL_LABELS = { notice: "Medium Severity", warning: "High Severity", critical: "Critical Severity", emergency: "Emergency" };

const WORLDWIDE_KEY = "worldwide";

const CUSTOM_LOCATION_LABEL = "Custom Coordinates";

const PICKER_APPLE_ZOOM_THRESHOLD = 6;

const pickerZoomToSpan = (zoom) => 360 / Math.pow(2, zoom);

const pickerSpanToZoom = (span) => Math.max(0, Math.min(Math.log2(360 / Math.max(span, 0.0001)), 22));

const MAP_PROVIDER_APPLE = "apple";

const MAP_PROVIDER_DECKGL = "deckgl";

const VISIBILITY_PUBLIC = "public";

const VISIBILITY_ORG_PRIVATE = "org-private";

const PRIORITY_OPTIONS = ["Critical", "High", "Medium", "Low"];

const SEVERITY_COLORS = { Critical: "#ff6b6b", High: "#FF9500", Medium: "#ffd93d", Low: "#4ecdc4" };

const SEVERITY_ORDER = { Critical: 4, High: 3, Medium: 2, Low: 1 };

const SEVERITY_WEIGHTS_LOCAL = { Critical: 100, High: 75, Medium: 40, Low: 15 };

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

const MAP_OPTION_LAYERS = [
  { id: "heatmap", name: "Heatmap", icon: faFireFlameCurved, color: "#FF9500" },
  { id: "privateBadges", name: "Private Event Markers", icon: faShieldHalved, color: "#ffd93d" }
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

const AREA_HIGHLIGHT_COLORS = { Critical: "#ff6b6b", High: "#FF9500", Medium: "#ffd93d", Low: "#4ecdc4" };

const riskCategoryMeta = (category) => RISK_CATEGORIES[category] || RISK_CATEGORIES.Other;

const riskSoundLevel = (risk) => {
  if (risk.severity === "Critical") return /emergency|tsunami warning/i.test(String(risk.title || "")) ? "emergency" : "critical";
  if (risk.severity === "High") return "warning";
  return "notice";
};

const riskSoundMessage = (risk, ended) => ({
  title: `${risk.severity || "Unrated"} ${risk.risk_category || "Hazard"} ${ended ? "Event Ended" : "Event"}`,
  body: String(risk.title || "Risk Command Center").slice(0, 160)
});

const riskIdentity = (risk) => String(risk.id);

const riskSoundKey = (risk) => [risk.id, risk.severity, risk.title].join("|");

const ALERT_SOUND_LEVELS = ["notice", "warning", "critical", "emergency"];

const alternating = (low, high, steps, length, wave, gain) => Array.from({ length: steps }, (_, index) => ({ at: index * length, freq: index % 2 ? high : low, length: length * 0.92, wave, gain }));

const ALERT_SOUND_PATTERNS = {
  notice: [{ at: 0, freq: 880, length: 0.16, wave: "sine", gain: 0.45 }, { at: 0.2, freq: 1174.7, length: 0.3, wave: "sine", gain: 0.45 }],
  warning: [0, 0.75].flatMap((offset) => [659.3, 880, 1046.5].map((freq, index) => ({ at: offset + index * 0.16, freq, length: 0.15, wave: "triangle", gain: 0.6 }))),
  critical: alternating(740, 988, 10, 0.17, "square", 0.22),
  emergency: [...alternating(784, 1175, 12, 0.13, "sawtooth", 0.24), ...alternating(784, 1175, 12, 0.13, "sawtooth", 0.24).map((note) => ({ ...note, at: note.at + 1.9 }))]
};

const patternSeconds = (level) => (ALERT_SOUND_PATTERNS[level] || []).reduce((end, note) => Math.max(end, note.at + note.length), 0);

const createAlertSoundEngine = () => {
  let context = null;
  let master = null;
  let loopTimer = null;
  let loopState = null;
  let pending = null;
  const active = new Set();
  const ensure = () => {
    if (context) return context;
    const Context = typeof window !== "undefined" ? window.AudioContext || window.webkitAudioContext : null;
    if (!Context) return null;
    context = new Context();
    master = context.createGain();
    master.connect(context.destination);
    return context;
  };
  const unlock = async () => {
    const audio = ensure();
    if (!audio) return false;
    if (audio.state !== "running") {
      try {
        await audio.resume();
      } catch (error) {
        return false;
      }
    }
    if (audio.state === "running" && pending) {
      const queued = pending;
      pending = null;
      schedule(queued.level, queued.volume, audio.currentTime + 0.05);
    }
    if (audio.state === "running" && loopState) topUp();
    return audio.state === "running";
  };
  const ready = () => Boolean(context && context.state === "running");
  const schedule = (level, volume, start) => {
    const audio = ensure();
    const pattern = ALERT_SOUND_PATTERNS[level];
    if (!audio || !pattern || audio.state !== "running") return false;
    master.gain.setValueAtTime(Math.max(0, Math.min(1, volume)), audio.currentTime);
    for (const note of pattern) {
      const oscillator = audio.createOscillator();
      const filter = audio.createBiquadFilter();
      const envelope = audio.createGain();
      const at = start + note.at;
      oscillator.type = note.wave;
      oscillator.frequency.setValueAtTime(note.freq, at);
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(2600, at);
      envelope.gain.setValueAtTime(0.0001, at);
      envelope.gain.exponentialRampToValueAtTime(note.gain, at + 0.015);
      envelope.gain.setValueAtTime(note.gain, at + note.length * 0.7);
      envelope.gain.exponentialRampToValueAtTime(0.0001, at + note.length);
      oscillator.connect(filter);
      filter.connect(envelope);
      envelope.connect(master);
      oscillator.onended = () => {
        active.delete(oscillator);
        envelope.disconnect();
      };
      active.add(oscillator);
      oscillator.start(at);
      oscillator.stop(at + note.length + 0.02);
    }
    return true;
  };
  const silenceAll = () => {
    for (const oscillator of active) {
      try {
        oscillator.stop(0);
      } catch (error) {
        active.delete(oscillator);
      }
    }
    active.clear();
  };
  const stop = () => {
    pending = null;
    if (loopTimer) clearInterval(loopTimer);
    loopTimer = null;
    loopState = null;
    silenceAll();
  };
  const play = (level, volume) => {
    stop();
    const audio = ensure();
    if (!audio) return false;
    if (audio.state === "running") return schedule(level, volume, audio.currentTime + 0.05);
    pending = { level, volume };
    audio.resume().then(() => {
      if (audio.state === "running" && pending) {
        const queued = pending;
        pending = null;
        schedule(queued.level, queued.volume, audio.currentTime + 0.05);
      }
    }).catch(() => null);
    return false;
  };
  const topUp = () => {
    const audio = ensure();
    if (!loopState || !audio) return;
    if (audio.state !== "running") {
      audio.resume().catch(() => null);
      return;
    }
    if (loopState.next < audio.currentTime) loopState.next = audio.currentTime + 0.05;
    const horizon = audio.currentTime + loopState.ahead;
    while (loopState.next <= horizon) {
      schedule(loopState.level, loopState.volume, loopState.next);
      loopState.next += loopState.every;
    }
  };
  const loop = (level, volume, everyMs, aheadSeconds, topUpMs) => {
    stop();
    const audio = ensure();
    if (!audio) return false;
    loopState = { level, volume, every: patternSeconds(level) + everyMs / 1000, ahead: aheadSeconds, next: audio.currentTime + 0.05 };
    topUp();
    loopTimer = setInterval(topUp, topUpMs);
    return true;
  };
  const looping = () => Boolean(loopState);
  const close = () => {
    stop();
    if (context) context.close().catch(() => null);
    context = null;
    master = null;
  };
  return { unlock, ready, play, loop, looping, stop, close };
};

const PAGE_LOAD_ID = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const stateDBPromise = typeof indexedDB !== "undefined" ? openDB(SOURCES.persistence.dbName, 1, {
  upgrade(db) {
    db.createObjectStore(SOURCES.persistence.storeName, { keyPath: "id" });
  }
}) : null;

const saveStateToDB = async (state) => {
  try {
    const db = await stateDBPromise;
    if (db) await db.put(SOURCES.persistence.storeName, { id: SOURCES.persistence.recordId, data: state, savedAt: Date.now() });
  } catch { }
};

const clearStateFromDB = async () => {
  try {
    const db = await stateDBPromise;
    if (db) await db.delete(SOURCES.persistence.storeName, SOURCES.persistence.recordId);
  } catch { }
};

const loadStateFromDB = async () => {
  try {
    const db = await stateDBPromise;
    if (!db) return null;
    const record = await db.get(SOURCES.persistence.storeName, SOURCES.persistence.recordId);
    if (!record || !record.data) return null;
    const flag = sessionStorage.getItem(SOURCES.persistence.restoreFlag);
    if (flag && flag !== PAGE_LOAD_ID) {
      sessionStorage.removeItem(SOURCES.persistence.restoreFlag);
      await clearStateFromDB();
      return null;
    }
    sessionStorage.setItem(SOURCES.persistence.restoreFlag, PAGE_LOAD_ID);
    return record.data;
  } catch {
    return null;
  }
};

const showSystemNotification = (title, body, persistent) => {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const notification = new Notification(title, { body, tag: "alert-sound", renotify: true, requireInteraction: persistent });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch (error) {
    return;
  }
};

const levelRank = (level) => ALERT_SOUND_LEVELS.indexOf(level);

const topQueueLevel = (queue) => queue.reduce((top, entry) => (!top || levelRank(entry.level) > levelRank(top) ? entry.level : top), null);

const useAlertSounds = ({ defaults, ready, items, inScope, scopeKey, ignoreLevel, getKey, getLevel, getId, describe, repeatMs, aheadSeconds, topUpMs }) => {
  const engineRef = useRef(null);
  const seenRef = useRef(null);
  const promptedRef = useRef(new Set());
  const queueRef = useRef([]);
  const scopeRef = useRef(inScope);
  scopeRef.current = inScope;
  const [settings, setSettings] = useState(defaults);
  const [unlocked, setUnlocked] = useState(false);
  const [queue, setQueue] = useState([]);
  const [testAlarm, setTestAlarm] = useState(null);
  if (!engineRef.current) engineRef.current = createAlertSoundEngine();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const updateSettings = useCallback((patch) => {
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

  const replaceSettings = useCallback((saved) => {
    setSettings({ ...defaults, ...(saved && typeof saved === "object" ? saved : {}) });
  }, [defaults]);

  const unlock = useCallback(async () => {
    const ok = await engineRef.current.unlock();
    setUnlocked(ok);
    return ok;
  }, []);

  useEffect(() => {
    if (!settings.enabled || unlocked) return undefined;
    const handler = () => {
      unlock();
    };
    window.addEventListener("pointerdown", handler);
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("pointerdown", handler);
      window.removeEventListener("keydown", handler);
    };
  }, [settings.enabled, unlocked, unlock]);

  useEffect(() => () => engineRef.current && engineRef.current.stop(), []);

  const snoozed = settings.snoozeUntil > Date.now();

  useEffect(() => {
    if (!settings.snoozeUntil) return undefined;
    const wait = settings.snoozeUntil - Date.now();
    if (wait <= 0) {
      updateSettings({ snoozeUntil: 0 });
      return undefined;
    }
    const timer = setTimeout(() => updateSettings({ snoozeUntil: 0 }), Math.min(wait, 2147483000));
    return () => clearTimeout(timer);
  }, [settings.snoozeUntil, updateSettings]);

  const syncLoop = useCallback((list) => {
    const engine = engineRef.current;
    const current = settingsRef.current;
    if (!list.length) {
      engine.stop();
      return;
    }
    if (current.mode === "persistent") engine.loop(topQueueLevel(list), current.volume, repeatMs, aheadSeconds, topUpMs);
  }, [repeatMs, aheadSeconds, topUpMs]);

  const commitQueue = useCallback((list) => {
    queueRef.current = list;
    setQueue(list);
  }, []);

  const acknowledge = useCallback((key) => {
    const before = queueRef.current;
    const next = before.filter((entry) => entry.key !== key);
    commitQueue(next);
    if (!next.length) engineRef.current.stop();
    else if (topQueueLevel(next) !== topQueueLevel(before)) syncLoop(next);
  }, [commitQueue, syncLoop]);

  const acknowledgeAll = useCallback(() => {
    commitQueue([]);
    setTestAlarm(null);
    engineRef.current.stop();
  }, [commitQueue]);

  const silence = useCallback(() => {
    setTestAlarm(null);
    engineRef.current.stop();
    if (queueRef.current.length) syncLoop(queueRef.current);
  }, [syncLoop]);

  const snooze = useCallback((minutes) => {
    acknowledgeAll();
    updateSettings({ snoozeUntil: minutes > 0 ? Date.now() + minutes * 60000 : 0 });
  }, [acknowledgeAll, updateSettings]);

  const test = useCallback(async (level) => {
    if (!(await unlock())) return;
    const persistent = settings.mode === "persistent";
    if (persistent) engineRef.current.loop(level, settings.volume, repeatMs, aheadSeconds, topUpMs);
    else engineRef.current.play(level, settings.volume);
    setTestAlarm({ level, persistent, at: Date.now() });
  }, [unlock, settings.mode, settings.volume, repeatMs, aheadSeconds, topUpMs]);

  const toggle = useCallback(async () => {
    if (settings.enabled) {
      acknowledgeAll();
      updateSettings({ enabled: false });
      return;
    }
    seenRef.current = null;
    promptedRef.current = new Set();
    updateSettings({ enabled: true });
    if (typeof Notification !== "undefined" && Notification.permission === "default") Notification.requestPermission().catch(() => null);
    if (await unlock()) engineRef.current.play("notice", settings.volume);
  }, [settings.enabled, settings.volume, acknowledgeAll, updateSettings, unlock]);

  useEffect(() => {
    if (!items) return;
    const keys = new Map();
    for (const item of items) {
      const level = getLevel(item);
      if (level) keys.set(getKey(item), { item, level });
    }
    if (!settings.enabled || !ready) {
      seenRef.current = null;
      promptedRef.current = new Set();
      return;
    }
    const previous = seenRef.current || new Map();
    seenRef.current = keys;
    const prompted = promptedRef.current;
    const floor = ignoreLevel ? -1 : levelRank(settings.minLevel);
    const counts = (entry) => levelRank(entry.level) >= floor && (!scopeRef.current || scopeRef.current(entry.item, settings.scope));
    if (snoozed) {
      for (const [key, entry] of keys.entries()) if (counts(entry)) prompted.add(key);
      return;
    }
    const kept = queueRef.current.filter((entry) => {
      if (entry.ended) return true;
      const current = keys.get(entry.key);
      if (current && counts(current)) return true;
      if (current) prompted.delete(entry.key);
      return !current;
    });
    const previousIds = new Set(Array.from(previous.values()).map((entry) => getId(entry.item)));
    const added = [];
    const now = Date.now();
    for (const [key, entry] of keys.entries()) {
      if (prompted.has(key) || !counts(entry)) continue;
      prompted.add(key);
      const id = getId(entry.item);
      added.push({ key, id, item: entry.item, level: entry.level, ended: false, updated: previousIds.has(id) && !previous.has(key), at: now, message: describe ? describe(entry.item, false) : null });
    }
    const liveIds = new Set(Array.from(keys.values()).map((entry) => getId(entry.item)));
    for (const [key, entry] of previous.entries()) {
      if (keys.has(key) || !counts(entry) || liveIds.has(getId(entry.item))) continue;
      added.push({ key: `${key}|ended`, id: getId(entry.item), item: entry.item, level: ALERT_SOUND_LEVELS[0], ended: true, updated: false, at: now, message: describe ? describe(entry.item, true) : null });
    }
    if (!added.length) {
      if (kept.length !== queueRef.current.length) {
        commitQueue(kept);
        if (!kept.length) engineRef.current.stop();
        else syncLoop(kept);
      }
      return;
    }
    const addedIds = new Set(added.map((entry) => entry.id));
    const merged = [...kept.filter((entry) => !addedIds.has(entry.id)), ...added];
    commitQueue(merged);
    const persistent = settings.mode === "persistent";
    if (persistent) syncLoop(merged);
    else engineRef.current.play(topQueueLevel(added), settings.volume);
    const lead = added.reduce((top, entry) => (!top || levelRank(entry.level) > levelRank(top.level) ? entry : top), null);
    if (added.length === 1 && lead.message) showSystemNotification(lead.message.title, lead.message.body, persistent);
    else showSystemNotification(`${added.length} Event Changes`, added.map((entry) => (entry.message ? entry.message.body : "")).filter(Boolean).slice(0, 4).join("; "), persistent);
  }, [items, ready, snoozed, scopeKey, settings.enabled, settings.minLevel, settings.volume, settings.mode, settings.scope, getKey, getLevel, getId, describe, commitQueue, syncLoop]);

  useEffect(() => {
    if (!testAlarm || testAlarm.persistent) return undefined;
    const timer = setTimeout(() => setTestAlarm(null), 15000);
    return () => clearTimeout(timer);
  }, [testAlarm]);

  useEffect(() => {
    const list = queueRef.current;
    if (!list.length) return;
    if (settings.mode === "single") engineRef.current.stop();
    else syncLoop(list);
  }, [settings.mode, settings.volume, syncLoop]);

  const alarm = testAlarm ? { ...testAlarm, test: true } : queue.length ? { level: topQueueLevel(queue), item: queue[0].item, persistent: settings.mode === "persistent", count: queue.length } : null;

  return { settings, updateSettings, replaceSettings, unlocked, alarm, queue, snoozed, acknowledge, acknowledgeAll, silence, snooze, toggle, test };
};

const haversine = (lat1, lon1, lat2, lon2) => {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const distanceKm = (lat1, lon1, lat2, lon2) => haversine(lat1, lon1, lat2, lon2) / 1000;

const computeGeodesicCircle = (centerLat, centerLng, radiusKm, segments) => {
  const R = 6371.0;
  const latRad = centerLat * Math.PI / 180;
  const lngRad = centerLng * Math.PI / 180;
  const angularDist = radiusKm / R;
  const ring = [];
  for (let i = 0; i <= segments; i++) {
    const bearing = (i / segments) * 2 * Math.PI;
    const ptLat = Math.asin(Math.sin(latRad) * Math.cos(angularDist) + Math.cos(latRad) * Math.sin(angularDist) * Math.cos(bearing));
    const ptLng = lngRad + Math.atan2(Math.sin(bearing) * Math.sin(angularDist) * Math.cos(latRad), Math.cos(angularDist) - Math.sin(latRad) * Math.sin(ptLat));
    ring.push([ptLng * 180 / Math.PI, ptLat * 180 / Math.PI]);
  }
  return ring;
};

const describeArea = (area) => {
  if (!area) return null;
  const name = area.name && area.name.trim() ? area.name.trim() : null;
  if (area.mode === "point_radius") return name || `${area.latitude.toFixed(3)}°, ${area.longitude.toFixed(3)}° · ${area.radius_km}km`;
  if (area.mode === "bbox") return name || `BBox ${area.min_lat.toFixed(2)}/${area.min_lng.toFixed(2)} → ${area.max_lat.toFixed(2)}/${area.max_lng.toFixed(2)}`;
  return name || "Area";
};

const areaShape = (area) => {
  const name = area.name && area.name.trim() ? area.name.trim() : "Monitored Area";
  if (area.mode === "point_radius") return { ring: computeGeodesicCircle(area.latitude, area.longitude, area.radius_km, 96), centerLng: area.longitude, centerLat: area.latitude, name };
  return {
    ring: [[area.min_lng, area.min_lat], [area.max_lng, area.min_lat], [area.max_lng, area.max_lat], [area.min_lng, area.max_lat], [area.min_lng, area.min_lat]],
    centerLng: (area.min_lng + area.max_lng) / 2,
    centerLat: (area.min_lat + area.max_lat) / 2,
    name
  };
};

const isPointInArea = (lat, lng, area) => {
  if (!area) return true;
  if (lat == null || lng == null) return false;
  if (area.mode === "point_radius") return haversine(area.latitude, area.longitude, lat, lng) <= area.radius_km * 1000;
  if (area.mode === "bbox") return lat >= area.min_lat && lat <= area.max_lat && lng >= area.min_lng && lng <= area.max_lng;
  return true;
};

const areaZoom = (area) => (area.radius_km > 1000 ? 4 : area.radius_km > 500 ? 5 : area.radius_km > 200 ? 6 : area.radius_km > 100 ? 7 : area.radius_km > 50 ? 8 : 9);

const radiusZoom = (radiusKm, lat) => Math.max(2, Math.min(12, Math.log2((360 * 111 * Math.cos((lat * Math.PI) / 180)) / (radiusKm * 3))));

const areaBoundingBox = (area) => {
  if (!area) return null;
  if (area.mode === "bbox") return { min_lat: area.min_lat, max_lat: area.max_lat, min_lng: area.min_lng, max_lng: area.max_lng };
  const latDelta = area.radius_km / 111.32;
  const lngDelta = area.radius_km / (111.32 * Math.max(0.01, Math.cos((area.latitude * Math.PI) / 180)));
  return {
    min_lat: Math.max(-90, area.latitude - latDelta),
    max_lat: Math.min(90, area.latitude + latDelta),
    min_lng: Math.max(-180, area.longitude - lngDelta),
    max_lng: Math.min(180, area.longitude + lngDelta)
  };
};

const areaCenter = (area) => (area.mode === "point_radius" ? { lat: area.latitude, lng: area.longitude } : { lat: (area.min_lat + area.max_lat) / 2, lng: (area.min_lng + area.max_lng) / 2 });

const areaReachKm = (area) => {
  if (area.mode === "point_radius") return area.radius_km;
  const center = areaCenter(area);
  return Math.max(1, haversine(center.lat, center.lng, area.max_lat, area.max_lng) / 1000);
};

const pointInRing = (lon, lat, ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

const riskPoints = (risk) => {
  const points = [];
  if (risk.latitude != null && risk.longitude != null) points.push([risk.longitude, risk.latitude]);
  const zonePoints = risk.metadata ? risk.metadata.zone_points : null;
  if (Array.isArray(zonePoints)) points.push(...zonePoints);
  return points;
};

const riskRings = (risk) => {
  const g = risk.geometry_coordinates;
  if (!Array.isArray(g) || !g.length) return [];
  if (risk.geometry_type === "Polygon" && Array.isArray(g[0]) && Array.isArray(g[0][0])) return g[0].length >= 3 ? [g[0]] : [];
  if (risk.geometry_type === "MultiPolygon") return g.map((polygon) => (Array.isArray(polygon) ? polygon[0] : null)).filter((ring) => Array.isArray(ring) && ring.length >= 3);
  return [];
};

const areaProbes = (area) => {
  if (area.mode === "point_radius") return [[area.longitude, area.latitude]];
  return [[area.min_lng, area.min_lat], [area.max_lng, area.min_lat], [area.max_lng, area.max_lat], [area.min_lng, area.max_lat], [(area.min_lng + area.max_lng) / 2, (area.min_lat + area.max_lat) / 2]];
};

const riskInArea = (risk, area) => {
  if (!area) return false;
  if (riskPoints(risk).some((point) => isPointInArea(point[1], point[0], area))) return true;
  const rings = riskRings(risk);
  if (!rings.length) return false;
  if (rings.some((ring) => ring.some((point) => isPointInArea(point[1], point[0], area)))) return true;
  return areaProbes(area).some(([lng, lat]) => rings.some((ring) => pointInRing(lng, lat, ring)));
};

const riskNearPoint = (risk, lat, lon, radiusKm) => {
  if (riskPoints(risk).some((point) => distanceKm(lat, lon, point[1], point[0]) <= radiusKm)) return true;
  const rings = riskRings(risk);
  return rings.some((ring) => pointInRing(lon, lat, ring) || ring.some((point) => distanceKm(lat, lon, point[1], point[0]) <= radiusKm));
};

const riskDistanceKm = (risk, lat, lon) => {
  const points = riskPoints(risk);
  if (!points.length) return null;
  return Math.min(...points.map((point) => distanceKm(lat, lon, point[1], point[0])));
};

const computeAreaHazards = (area, risks) => {
  if (!area) return [];
  const center = areaCenter(area);
  const reachKm = areaReachKm(area);
  const hazards = [];
  for (const risk of risks) {
    if (!riskInArea(risk, area)) continue;
    const distance = riskDistanceKm(risk, center.lat, center.lng);
    const distanceValue = distance === null ? 0 : distance;
    const weight = (SEVERITY_ORDER[risk.severity] || 0) * 25;
    hazards.push({
      ...risk,
      distance_km: parseFloat(distanceValue.toFixed(1)),
      distance_meters: Math.round(distanceValue * 1000),
      inside_area: true,
      area_exposure_score: Math.round(weight * (1 - 0.4 * Math.min(1, distanceValue / reachKm)))
    });
  }
  hazards.sort((a, b) => b.area_exposure_score - a.area_exposure_score || a.distance_km - b.distance_km);
  return hazards;
};

const areaSignedDistanceKm = (area, lat, lng) => {
  if (area.mode === "point_radius") return distanceKm(lat, lng, area.latitude, area.longitude) - area.radius_km;
  const kx = 111.32 * Math.cos((lat * Math.PI) / 180);
  const ky = 110.57;
  const dx = Math.max(area.min_lng - lng, 0, lng - area.max_lng) * kx;
  const dy = Math.max(area.min_lat - lat, 0, lat - area.max_lat) * ky;
  if (dx > 0 || dy > 0) return Math.hypot(dx, dy);
  return -Math.min((lng - area.min_lng) * kx, (area.max_lng - lng) * kx, (lat - area.min_lat) * ky, (area.max_lat - lat) * ky);
};

const ringSignedArea = (ring) => {
  let total = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) total += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return total / 2;
};

const unionContours = (cluster) => {
  const boxes = cluster.map(areaBoundingBox);
  const west = Math.min(...boxes.map((box) => box.min_lng));
  const east = Math.max(...boxes.map((box) => box.max_lng));
  const south = Math.min(...boxes.map((box) => box.min_lat));
  const north = Math.max(...boxes.map((box) => box.max_lat));
  const size = SOURCES.map.areaUnionGrid;
  const stepX = (east - west) / (size - 4);
  const stepY = (north - south) / (size - 4);
  const x0 = west - stepX * 2;
  const y0 = south - stepY * 2;
  const values = [];
  for (let j = 0; j <= size; j += 1) {
    const row = [];
    const lat = y0 + j * stepY;
    for (let i = 0; i <= size; i += 1) row.push(Math.min(...cluster.map((area) => areaSignedDistanceKm(area, lat, x0 + i * stepX))));
    values.push(row);
  }
  const point = (i, j, di, dj) => {
    const a = values[j][i];
    const b = values[j + dj][i + di];
    const t = a === b ? 0.5 : a / (a - b);
    return [x0 + (i + di * t) * stepX, y0 + (j + dj * t) * stepY];
  };
  const segments = [];
  for (let j = 0; j < size; j += 1) {
    for (let i = 0; i < size; i += 1) {
      const corners = [values[j][i] < 0, values[j][i + 1] < 0, values[j + 1][i + 1] < 0, values[j + 1][i] < 0];
      const edges = [];
      if (corners[0] !== corners[1]) edges.push([`h${i},${j}`, () => point(i, j, 1, 0)]);
      if (corners[1] !== corners[2]) edges.push([`v${i + 1},${j}`, () => point(i + 1, j, 0, 1)]);
      if (corners[3] !== corners[2]) edges.push([`h${i},${j + 1}`, () => point(i, j + 1, 1, 0)]);
      if (corners[0] !== corners[3]) edges.push([`v${i},${j}`, () => point(i, j, 0, 1)]);
      if (edges.length === 2) segments.push([edges[0], edges[1]]);
      else if (edges.length === 4) {
        const centerInside = (values[j][i] + values[j][i + 1] + values[j + 1][i + 1] + values[j + 1][i]) / 4 < 0;
        if (centerInside === corners[0]) {
          segments.push([edges[0], edges[1]]);
          segments.push([edges[2], edges[3]]);
        } else {
          segments.push([edges[0], edges[3]]);
          segments.push([edges[1], edges[2]]);
        }
      }
    }
  }
  const byEdge = new Map();
  const coords = new Map();
  segments.forEach((segment, index) => segment.forEach(([key, make]) => {
    if (!coords.has(key)) coords.set(key, make());
    if (!byEdge.has(key)) byEdge.set(key, []);
    byEdge.get(key).push(index);
  }));
  const used = new Set();
  const loops = [];
  segments.forEach((segment, start) => {
    if (used.has(start)) return;
    used.add(start);
    const loop = [segment[0][0]];
    let current = segment[1][0];
    while (current !== loop[0]) {
      loop.push(current);
      const next = (byEdge.get(current) || []).find((index) => !used.has(index));
      if (next === undefined) break;
      used.add(next);
      current = segments[next][0][0] === current ? segments[next][1][0] : segments[next][0][0];
    }
    if (loop.length >= 3) loops.push(loop.map((key) => coords.get(key)));
  });
  const outer = loops.filter((loop, index) => !loops.some((other, otherIndex) => otherIndex !== index && Math.abs(ringSignedArea(other)) > Math.abs(ringSignedArea(loop)) && pointInRing(loop[0][0], loop[0][1], other)));
  return outer.map((loop) => [...loop, loop[0]]);
};

const areaUnionRings = (list) => {
  const boxes = list.map(areaBoundingBox);
  const parent = list.map((_, index) => index);
  const find = (index) => (parent[index] === index ? index : (parent[index] = find(parent[index])));
  for (let a = 0; a < list.length; a += 1) {
    for (let b = a + 1; b < list.length; b += 1) {
      const overlap = boxes[a].min_lng <= boxes[b].max_lng && boxes[b].min_lng <= boxes[a].max_lng && boxes[a].min_lat <= boxes[b].max_lat && boxes[b].min_lat <= boxes[a].max_lat;
      if (overlap) parent[find(a)] = find(b);
    }
  }
  const clusters = new Map();
  list.forEach((area, index) => {
    const root = find(index);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root).push(area);
  });
  const rings = [];
  for (const cluster of clusters.values()) {
    if (cluster.length === 1) rings.push(areaShape(cluster[0]).ring);
    else rings.push(...unionContours(cluster));
  }
  return rings;
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

const riskInBounds = (risk, bounds) => riskPoints(risk).some((point) => inBounds(bounds, point[0], point[1]));

const formatNumber = (value, unit = "", digits = 0) => (value === null || value === undefined || value === "" || isNaN(value) ? "—" : `${Number(value).toLocaleString(undefined, { maximumFractionDigits: digits })}${unit}`);

const formatCompact = (num) => {
  if (num == null || isNaN(num)) return "—";
  const tiers = [[1e9, "B"], [1e6, "M"], [1e3, "K"]];
  for (const [t, s] of tiers) {
    if (Math.abs(num) >= t) return `${(num / t).toFixed(t === 1e3 ? 1 : 2)}${s}`;
  }
  return Number(num).toLocaleString();
};

const formatCurrency = (amount) => (amount == null ? null : `$${formatCompact(amount)}`);

const formatCoords = (lat, lon) => (lat === null || lat === undefined || lon === null || lon === undefined ? "—" : `${Number(lat).toFixed(4)}°, ${Number(lon).toFixed(4)}°`);

const formatDuration = (seconds) => {
  if (seconds === null || seconds === undefined || !Number.isFinite(Number(seconds))) return "—";
  const total = Math.max(0, Math.round(Number(seconds)));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days) return `${days}d ${hours}h`;
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
};

const formatUntil = (iso) => {
  if (!iso) return "—";
  const ms = Date.parse(iso) - Date.now();
  if (!Number.isFinite(ms)) return "—";
  if (ms <= 0) return "Expired";
  return `In ${formatDuration(ms / 1000)}`;
};

const formatClock = (iso) => {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

const titleCaseName = (text) => String(text || "").toLowerCase().replace(/(^|[\s/(-])([a-z])/g, (match, lead, ch) => `${lead}${ch.toUpperCase()}`);

const titleCaseWords = (text) => String(text || "").replace(/[_-]+/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());

const labelFor = (options, value) => (options.find(([v]) => v === value) || [null, ""])[1];

const valueFor = (options, label) => (options.find(([, l]) => l === label) || [options[0][0]])[0];

const csvQuote = (val) => {
  const s = String(val === null || val === undefined ? "" : val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return `"${s}"`;
};

const splitWarning = (message) => {
  const text = String(message || "").trim();
  const index = text.indexOf(": ");
  return index > 0 && index <= 80 ? [text.slice(0, index), text.slice(index + 2)] : ["Error", text];
};

const errorText = (error) => String(error && error.message ? error.message : error).replace(/\.$/, "");

const formatBytes = (bytes) => {
  const value = Number(bytes) || 0;
  if (value >= 1073741824) return `${(value / 1073741824).toFixed(2)} GB`;
  if (value >= 1048576) return `${(value / 1048576).toFixed(1)} MB`;
  return `${Math.round(value / 1024)} KB`;
};

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

const formatRelativeTime = (iso) => {
  if (!iso) return "—";
  const d = parseFeedDate(iso);
  if (!d) return iso;
  const diffSec = Math.round((Date.now() - d.getTime()) / 1000);
  if (Math.abs(diffSec) < 60) return `${diffSec}s Ago`;
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return `${diffMin}m Ago`;
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 24) return `${diffHr}h Ago`;
  return `${Math.round(diffHr / 24)}d Ago`;
};

const formatAbsoluteTime = (iso) => {
  if (!iso) return "—";
  const d = parseFeedDate(iso);
  if (!d) return iso;
  return d.toLocaleString();
};

const riskRecommendations = (risk) => (Array.isArray(risk.recommendations) ? risk.recommendations.map((item) => String(item || "").trim()).filter(Boolean) : []);

const riskMetadataFields = (risk) => {
  const m = risk.metadata || {};
  const category = String(risk.risk_category || "").toLowerCase();
  const has = (value) => value !== undefined && value !== null && value !== "";
  const pick = (pairs) => pairs.filter(([, value]) => has(value)).map(([label, value]) => [label, String(value)]);
  if (category === "seismic") {
    return pick([
      ["Magnitude", has(m.magnitude) ? `${m.magnitude} ${m.magnitude_type || ""}`.trim() : null],
      ["Depth", has(m.depth_km) ? `${m.depth_km} Km` : null],
      ["Shake Intensity", m.shake_intensity],
      ["Tsunami Risk", m.tsunami_risk],
      ["Felt Reports", has(m.felt_reports) ? formatNumber(m.felt_reports) : null],
      ["Expected Aftershocks", has(m.expected_aftershocks) ? formatNumber(m.expected_aftershocks) : null],
      ["Energy Released", has(m.energy_released_joules) ? `${formatCompact(m.energy_released_joules)} J` : null],
      ["TNT Equivalent", has(m.equivalent_tnt_tons) ? `${formatCompact(m.equivalent_tnt_tons)} Tons` : null],
      ["Location", m.place || m.location],
      ["Alert Level", m.alert_level ? titleCaseWords(m.alert_level) : null],
      ["CDI", m.cdi],
      ["MMI", m.mmi],
      ["Significance", m.significance],
      ["Stations", m.station_count],
      ["Azimuthal Gap", has(m.azimuthal_gap) ? `${m.azimuthal_gap}°` : null],
      ["Network", m.network],
      ["Review Status", m.status ? titleCaseWords(m.status) : null]
    ]);
  }
  if (category === "wildfire") {
    return pick([
      ["Total Acres", has(m.total_acres) ? formatNumber(m.total_acres) : null],
      ["Containment", has(m.percent_contained) ? `${m.percent_contained}%` : null],
      ["Duration", has(m.duration_days) ? `${m.duration_days} Days` : null],
      ["Fire Type", m.fire_type],
      ["Fire Behavior", m.fire_behavior],
      ["Estimated Cost", formatCurrency(m.estimated_cost_usd)],
      ["Personnel", has(m.total_personnel) ? formatNumber(m.total_personnel) : null],
      ["Structures Destroyed", has(m.structures_destroyed) ? formatNumber(m.structures_destroyed) : null],
      ["Structures Threatened", has(m.structures_threatened) ? formatNumber(m.structures_threatened) : null],
      ["Fatalities", m.fatalities > 0 ? formatNumber(m.fatalities) : null],
      ["Injuries", m.injuries > 0 ? formatNumber(m.injuries) : null],
      ["State", m.poo_state],
      ["County", m.poo_county],
      ["Primary Fuel", m.primary_fuel],
      ["Complex", m.complex_name],
      ["IRWIN ID", m.irwin_id]
    ]);
  }
  if (["weather", "tornado", "hurricane", "space"].includes(category)) {
    return pick([
      ["Event Type", m.event_type],
      ["NWS Severity", m.nws_severity],
      ["Urgency", m.urgency],
      ["Certainty", m.certainty],
      ["Response", m.response_type],
      ["Duration", has(m.duration_hours) ? `${m.duration_hours} Hours` : null],
      ["Issuing Office", m.sender],
      ["Affected Areas", m.affected_areas],
      ["SPC Risk Level", m.risk_level],
      ["Outlook Type", m.outlook_type],
      ["Power Systems", m.impacts ? m.impacts.power_systems : null],
      ["HF Radio", m.impacts ? m.impacts.hf_radio : null],
      ["Navigation", m.impacts ? m.impacts.navigation : null]
    ]);
  }
  if (category === "flood") {
    return pick([
      ["Gage Height", has(m.gage_height_ft) ? `${Number(m.gage_height_ft).toFixed(2)} Ft` : null],
      ["Flood Stage", m.flood_stage],
      ["Site Name", m.site_name],
      ["Site Code", m.site_code],
      ["State", m.state],
      ["County", m.county],
      ["HUC", m.huc],
      ["Drainage Area", has(m.drainage_area_sqmi) ? `${m.drainage_area_sqmi} Sq Mi` : null]
    ]);
  }
  if (category === "volcanic") {
    return pick([
      ["Volcano Type", m.volcano_type],
      ["Alert Level", m.alert_level],
      ["Aviation Code", m.aviation_color_code],
      ["Elevation", has(m.elevation_m) ? `${formatNumber(m.elevation_m)} M` : null],
      ["VEI", m.volcanic_explosivity_index],
      ["Last Eruption", m.last_eruption],
      ["Holocene Activity", has(m.holocene_eruptions) ? (m.holocene_eruptions ? "Yes" : "No") : null],
      ["Country", m.country],
      ["Region", m.region],
      ["Rock Type", m.rock_type],
      ["Volcano Number", m.volcano_number]
    ]);
  }
  if (category === "air quality") {
    return pick([
      ["PM2.5", has(m.pm25_value) ? `${m.pm25_value} µg/m³` : null],
      ["AQI Category", m.aqi_category],
      ["PM10", has(m.pm10_value) ? `${m.pm10_value} µg/m³` : null],
      ["Ozone", m.o3_value],
      ["Health Advisory", m.health_recommendation],
      ["Station", m.location_name],
      ["City", m.city],
      ["Country", m.country],
      ["Data Source", m.source_name],
      ["Mobile Sensor", has(m.is_mobile) ? (m.is_mobile ? "Yes" : "No") : null],
      ["Measurements", Array.isArray(m.all_measurements) && m.all_measurements.length ? m.all_measurements.map((item) => `${item.parameter} ${item.value} ${item.unit}`).join(" | ") : null]
    ]);
  }
  if (category === "ground deformation") {
    return pick([
      ["Cumulative Displacement", has(m.cumulative_displacement_mm) ? `${m.cumulative_displacement_mm} Mm` : null],
      ["Estimated Coherence", has(m.estimated_coherence) ? `${Math.round(m.estimated_coherence * 100)}%` : null],
      ["Displacement Direction", m.displacement_direction],
      ["Annual Rate", has(m.known_annual_rate_mm) ? `${m.known_annual_rate_mm} Mm Per Year` : null],
      ["Infrastructure At Risk", m.infrastructure_at_risk],
      ["Observation Period", m.observation_period],
      ["Satellite", m.satellite],
      ["Orbit Direction", m.orbit_direction],
      ["Processing Level", m.processing_level],
      ["Deformation Type", m.deformation_type],
      ["Velocity", has(m.velocity_mm_per_year) ? `${m.velocity_mm_per_year} Mm Per Year` : null],
      ["Affected Area", has(m.affected_area_km2) ? `${m.affected_area_km2} Km²` : null],
      ["Ground Type", m.ground_type],
      ["Nearby Infrastructure", Array.isArray(m.infrastructure_proximity) && m.infrastructure_proximity.length ? m.infrastructure_proximity.slice(0, 6).map((item) => `${item.name || item.type}${has(item.distance_km) ? ` ${item.distance_km} Km` : ""}`).join(" | ") : null]
    ]);
  }
  return pick([
    ["Event Type", m.event_type],
    ["GDACS Alert", m.alert_level],
    ["GDACS Score", m.gdacs_score],
    ["Population Affected", has(m.population_affected) ? formatNumber(m.population_affected) : null],
    ["Vulnerability", m.vulnerability],
    ["Severity Value", has(m.severity_value) ? `${m.severity_value} ${m.severity_unit || ""}`.trim() : null],
    ["Country", m.country],
    ["ISO Code", m.iso3],
    ["FEMA Disaster", m.disaster_number],
    ["Declaration Type", m.declaration_type ? (m.declaration_type === "DR" ? "Major Disaster" : "Emergency") : null],
    ["Incident Type", m.incident_type],
    ["Designated Area", m.designated_area],
    ["EONET ID", m.eonet_id],
    ["Categories", Array.isArray(m.categories) && m.categories.length ? m.categories.join(", ") : null],
    ["Status", has(m.is_closed) ? (m.is_closed ? "Closed" : "Active") : null],
    ["Observations", m.geometry_count],
    ["First Observed", m.first_observed ? formatAbsoluteTime(m.first_observed) : null],
    ["Last Observed", m.last_observed ? formatAbsoluteTime(m.last_observed) : null],
    ["Source Domain", m.source_domain],
    ["Headline", m.headline]
  ]);
};

const riskBaseFields = (risk) => [
  ["Severity", [risk.severity, risk.severity_score != null ? `Score ${risk.severity_score}` : null].filter(Boolean).join(" | ")],
  ["Category", risk.risk_category],
  ["Source", risk.source],
  ["Event Time", risk.event_time ? formatAbsoluteTime(risk.event_time) : null],
  ["Updated", risk.updated_at ? formatAbsoluteTime(risk.updated_at) : null],
  ["Expires", risk.expires_at ? `${formatAbsoluteTime(risk.expires_at)} (${formatUntil(risk.expires_at)})` : null],
  ["Impact Radius", risk.impact_radius_km != null ? `${formatNumber(risk.impact_radius_km, " Km", 1)}` : null],
  ["Position", risk.latitude != null ? formatCoords(risk.latitude, risk.longitude) : null],
  ["Nearest City", risk.population_impact && risk.population_impact.nearest_city ? `${risk.population_impact.nearest_city}${risk.population_impact.distance_km != null ? ` (${risk.population_impact.distance_km} Km)` : ""}` : null],
  ["Population Exposure", risk.population_impact && risk.population_impact.estimated_population != null ? formatNumber(risk.population_impact.estimated_population) : null],
  ["Visibility", getRiskVisibility(risk) === VISIBILITY_ORG_PRIVATE ? "Organization Only" : null]
];

const riskSourceText = (risk) => {
  const m = risk.metadata || {};
  const sections = [];
  if (m.headline && m.headline !== risk.title) sections.push(["Headline", String(m.headline)]);
  if (risk.description) sections.push(["Description", String(risk.description)]);
  if (m.instruction) sections.push(["Instructions", String(m.instruction)]);
  const recommendations = riskRecommendations(risk);
  if (recommendations.length) sections.push(["Recommendations", recommendations.join("\n\n")]);
  return sections;
};

const OVERPASS_CACHE = new Map();

const OVERPASS_PENDING = new Map();

const OVERPASS_CACHE_MAX_ENTRIES = 200;

const OVERPASS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let overpassMirrorOffset = 0;

const hashOverpassQuery = (query) => {
  let hash = 2166136261;
  for (let i = 0; i < query.length; i++) {
    hash ^= query.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36) + "_" + query.length;
};

const overpassFetch = async (query, opts = {}) => {
  const mirrors = SOURCES.external.overpassMirrors;
  const timeoutMs = opts.timeoutMs || 8000;
  const maxAttempts = Math.min(opts.maxAttempts || mirrors.length, mirrors.length);
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
      const mirrorIdx = (startIdx + attempt) % mirrors.length;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const r = await fetch(mirrors[mirrorIdx], { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, signal: controller.signal });
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
    overpassMirrorOffset = (overpassMirrorOffset + 1) % mirrors.length;
    return null;
  })();
  if (cacheKey) {
    OVERPASS_PENDING.set(cacheKey, promise);
    promise.finally(() => OVERPASS_PENDING.delete(cacheKey));
  }
  return promise;
};

const getFeatureName = (tags) => {
  if (!tags) return "Unknown Feature";
  if (tags.name) return tags.name;
  const mappings = [
    ["building", (v) => (v === "yes" ? (tags["addr:housename"] || (tags["addr:housenumber"] ? `Building ${tags["addr:housenumber"]}`.trim() : "Building")) : v.charAt(0).toUpperCase() + v.slice(1).replace(/_/g, " "))],
    ["natural"],
    ["landuse"],
    ["leisure"],
    ["man_made"],
    ["amenity"],
    ["shop", (v) => "Shop: " + v.charAt(0).toUpperCase() + v.slice(1)],
    ["tourism"],
    ["historic"],
    ["water", (v) => "Water: " + v],
    ["place"]
  ];
  for (const [key, fmt] of mappings) {
    if (tags[key]) return fmt ? fmt(tags[key]) : tags[key].charAt(0).toUpperCase() + tags[key].slice(1).replace(/_/g, " ");
  }
  return "Feature";
};

const getFeatureType = (tags) => {
  if (!tags) return "unknown";
  for (const k of ["building", "natural", "landuse", "leisure", "man_made", "amenity", "shop", "tourism", "historic", "water", "place", "boundary"]) {
    if (tags[k]) return k;
  }
  return "other";
};

const getTimezoneFromCoords = (lat, lng) => {
  const o = Math.round(lng / 15);
  return `UTC${o >= 0 ? "+" : ""}${o} (Estimated)`;
};

const getClimateZone = (lat) => {
  const a = Math.abs(lat);
  return a < 10 ? "Tropical" : a < 23.5 ? "Subtropical" : a < 35 ? "Warm Temperate" : a < 50 ? "Cool Temperate" : a < 66.5 ? "Subarctic Or Subantarctic" : "Polar";
};

const getHemisphere = (lat, lng) => `${lat >= 0 ? "Northern" : "Southern"} And ${lng >= 0 ? "Eastern" : "Western"}`;

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

const formatArea = (sqMeters) => (sqMeters >= 1e6 ? `${formatNumber(sqMeters / 1e6, " Km²", 2)}` : `${formatNumber(sqMeters, " M²")}`);

const formatMeters = (meters) => (meters >= 1000 ? `${formatNumber(meters / 1000, " Km", 2)}` : `${formatNumber(meters, " M")}`);

const loadStoredSavedViews = () => {
  try {
    const raw = localStorage.getItem(SOURCES.savedViews.storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => v && typeof v === "object" && v.view_id) : [];
  } catch (error) {
    return [];
  }
};

const persistSavedViewsLocal = (views) => {
  try {
    localStorage.setItem(SOURCES.savedViews.storageKey, JSON.stringify(views.slice(0, SOURCES.savedViews.max)));
  } catch (error) {
    return;
  }
};

const describeSavedView = (view) => {
  if (!view) return "";
  if (view.name && view.name.trim()) return view.name.trim();
  if (view.center) return `${view.center.lat.toFixed(2)}°, ${view.center.lng.toFixed(2)}°`;
  return "Saved View";
};

const formatMetaNumber = (num) => {
  if (num == null) return "N/A";
  if (typeof num === "string") return num;
  const tiers = [[1e9, "B"], [1e6, "M"], [1e3, "K"]];
  for (const [t, s] of tiers) {
    if (num >= t) return `${(num / t).toFixed(t === 1e3 ? 1 : 2)}${s}`;
  }
  return num.toLocaleString();
};

const formatMetaCurrency = (amount) => (amount == null ? "N/A" : "$" + formatMetaNumber(amount).replace("$", ""));

const formatRiskTime = (ts) => {
  if (!ts) return "Unknown";
  try {
    return new Date(ts).toLocaleString();
  } catch (error) {
    return ts;
  }
};

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
  const { high = 80, mid = 50, highColor = "#4ecdc4", midColor = "#ffd93d", lowColor = "#FF9500" } = thresholds || {};
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

function renderMetaFields(fields) {
  return fields.filter(Boolean).map(([label, value, opts = {}], i) => {
    if (value === undefined || value === null) return null;
    return (
      <MetaField key={i} label={label} wide={opts.wide} highlight={opts.highlight} color={opts.color} small={opts.small} scrollable={opts.scrollable}>
        {opts.children || (typeof value === "number" && !opts.raw ? formatMetaNumber(value) : value)}
      </MetaField>
    );
  });
}

function renderEarthquakeMetadata(m) {
  if (!m) return null;
  const alertColors = { red: "#ff6b6b", orange: "#FF9500", yellow: "#ffd93d", green: "#4ecdc4" };
  return (
    <MetaSection icon={faMountain} title="Seismic Data">
      {renderMetaFields([
        m.magnitude && ["Magnitude", `${m.magnitude} ${m.magnitude_type || ""}`, { highlight: true }],
        m.depth_km !== undefined && ["Depth", `${m.depth_km} km`],
        m.shake_intensity && ["Shake Intensity", m.shake_intensity],
        m.tsunami_risk && ["Tsunami Risk", m.tsunami_risk, { wide: true, color: m.tsunami_risk.includes("warning") ? "#ff6b6b" : "#4ECDC4" }],
        m.felt_reports !== undefined && ["Felt Reports", m.felt_reports],
        m.expected_aftershocks !== undefined && ["Expected Aftershocks", m.expected_aftershocks],
        m.energy_released_joules && ["Energy Released", `${formatMetaNumber(m.energy_released_joules)} J`, { raw: true }],
        m.equivalent_tnt_tons && ["TNT Equivalent", `${formatMetaNumber(m.equivalent_tnt_tons)} tons`, { raw: true }],
        m.place && ["Location", m.place, { wide: true }],
        m.alert_level && ["Alert Level", m.alert_level, { color: alertColors[m.alert_level] || "#4ecdc4" }],
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
      {m.total_acres !== undefined && <MetaField label="Total Acres" highlight>{formatMetaNumber(m.total_acres)}</MetaField>}
      {m.percent_contained !== undefined && <MetaField label="Containment"><ContainmentBar value={m.percent_contained} /></MetaField>}
      {renderMetaFields([
        m.duration_days !== undefined && ["Duration", `${m.duration_days} days`],
        m.fire_type && ["Fire Type", m.fire_type],
        m.fire_behavior && ["Fire Behavior", m.fire_behavior, { wide: true }],
        m.estimated_cost_usd !== undefined && ["Estimated Cost", formatMetaCurrency(m.estimated_cost_usd), { raw: true }],
        m.total_personnel !== undefined && ["Personnel", m.total_personnel],
        m.structures_destroyed !== undefined && ["Structures Destroyed", m.structures_destroyed, { color: "#ff6b6b" }],
        m.structures_threatened !== undefined && ["Structures Threatened", m.structures_threatened, { color: "#FF9500" }],
        m.fatalities > 0 && ["Fatalities", m.fatalities, { color: "#ff6b6b", raw: true }],
        m.injuries > 0 && ["Injuries", m.injuries, { color: "#FF9500", raw: true }],
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
  const urgencyColor = { Immediate: "#ff6b6b", Expected: "#FF9500" };
  return (
    <MetaSection icon={faCloud} title="Weather Data">
      {renderMetaFields([
        m.event_type && ["Event Type", m.event_type, { wide: true, highlight: true }],
        m.nws_severity && ["NWS Severity", m.nws_severity],
        m.urgency && ["Urgency", m.urgency, { color: urgencyColor[m.urgency] || "#ffd93d" }],
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
  const stageColor = m.flood_stage?.includes("Major") ? "#ff6b6b" : m.flood_stage?.includes("Moderate") ? "#FF9500" : m.flood_stage?.includes("Minor") ? "#ffd93d" : "#4ecdc4";
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
  const alertColor = { Warning: "#ff6b6b", Watch: "#FF9500", Advisory: "#ffd93d" };
  const aviationColor = { RED: "#ff6b6b", ORANGE: "#FF9500", YELLOW: "#ffd93d" };
  return (
    <MetaSection icon={faVolcano} title="Volcano Data">
      {renderMetaFields([
        m.volcano_type && ["Volcano Type", m.volcano_type, { wide: true, highlight: true }],
        m.alert_level && ["Alert Level", m.alert_level, { color: alertColor[m.alert_level] || "#4ecdc4" }],
        m.aviation_color_code && ["Aviation Code", m.aviation_color_code, { color: aviationColor[m.aviation_color_code] || "#4ecdc4" }],
        m.elevation_m !== undefined && ["Elevation", `${formatMetaNumber(m.elevation_m)} m`, { raw: true }],
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
  const aqiColor = m.aqi_category?.includes("Unhealthy") ? "#ff6b6b" : m.aqi_category === "Moderate" ? "#ffd93d" : "#4ecdc4";
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
  const dispColor = Math.abs(m.cumulative_displacement_mm) > 20 ? "#ff6b6b" : Math.abs(m.cumulative_displacement_mm) > 10 ? "#FF9500" : "#ffd93d";
  return (
    <MetaSection icon={faLayerGroup} title="Ground Deformation Data (InSAR)">
      {m.cumulative_displacement_mm !== undefined && <MetaField label="Cumulative Displacement" highlight color={dispColor}>{m.cumulative_displacement_mm} mm</MetaField>}
      {m.estimated_coherence !== undefined && (
        <MetaField label="Estimated Coherence">
          <ContainmentBar value={m.estimated_coherence * 100} thresholds={{ high: 70, mid: 40, highColor: "#4ecdc4", midColor: "#ffd93d", lowColor: "#FF9500" }} />
        </MetaField>
      )}
      {renderMetaFields([
        m.displacement_direction && ["Displacement Direction", m.displacement_direction],
        m.known_annual_rate_mm !== undefined && ["Annual Rate", `${m.known_annual_rate_mm} mm/year`],
        m.infrastructure_at_risk !== undefined && ["Infrastructure At Risk", m.infrastructure_at_risk, { color: m.infrastructure_at_risk > 0 ? "#ff6b6b" : "#4ecdc4", raw: true }],
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
                  <span className="riskInfraProximityRelevance" style={{ color: infra.risk_relevance.toLowerCase().includes("critical") ? "#ff6b6b" : infra.risk_relevance.toLowerCase().includes("high") ? "#FF9500" : "#ffd93d" }}>
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

function renderGlobalDisasterMetadata(m) {
  if (!m) return null;
  const gdacsAlertColor = { Red: "#ff6b6b", Orange: "#FF9500" };
  return (
    <MetaSection icon={faEarthAmericas} title="Global Disaster Data">
      {renderMetaFields([
        m.event_type && ["Event Type", m.event_type, { highlight: true }],
        m.alert_level && ["GDACS Alert", m.alert_level, { color: gdacsAlertColor[m.alert_level] || "#4ecdc4" }],
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
        m.is_closed !== undefined && ["Status", m.is_closed ? "Closed" : "Active", { color: m.is_closed ? "#4ecdc4" : "#FF9500" }],
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

const SUGGESTION_CACHE = new Map();

const toSuggestion = (feature) => {
  const p = feature.properties || {};
  const coordinates = (feature.geometry && feature.geometry.coordinates) || [];
  const longitude = Number(coordinates[0]);
  const latitude = Number(coordinates[1]);
  const street = [p.housenumber, p.street].filter(Boolean).join(" ");
  const city = p.city || p.town || p.village || p.district || p.locality || p.county || "";
  const placeName = p.name && p.name !== street ? p.name : "";
  const primary = street || placeName || city || p.state || p.country || "";
  const secondary = [
    street && placeName ? placeName : null,
    city && city !== primary ? city : null,
    p.state && p.state !== primary ? p.state : null,
    p.postcode || null,
    p.country && p.country !== primary ? p.country : null
  ].filter(Boolean).join(", ");
  return {
    id: `${p.osm_type || ""}${p.osm_id || ""}_${latitude}_${longitude}`,
    primary,
    secondary,
    label: [primary, secondary].filter(Boolean).join(", "),
    latitude,
    longitude,
    street: street || (p.osm_key === "highway" ? p.name || "" : ""),
    city,
    state: p.state || "",
    country: p.country || "",
    postalCode: p.postcode || ""
  };
};

const fetchSuggestions = async (query, bias, signal) => {
  const biasKey = bias ? `${bias.latitude.toFixed(1)},${bias.longitude.toFixed(1)}` : "";
  const key = `${query.toLowerCase()}|${biasKey}`;
  if (SUGGESTION_CACHE.has(key)) return SUGGESTION_CACHE.get(key);
  const params = new URLSearchParams({ q: query, limit: String(SOURCES.geocoding.resultLimit), lang: "en" });
  if (bias) {
    params.set("lat", String(bias.latitude));
    params.set("lon", String(bias.longitude));
  }
  const response = await fetch(`${SOURCES.geocoding.photon}?${params.toString()}`, { signal });
  if (!response.ok) throw new Error(`The address service returned status ${response.status}.`);
  const data = await response.json();
  const seen = new Set();
  const results = (data.features || [])
    .map(toSuggestion)
    .filter((suggestion) => suggestion.primary && Number.isFinite(suggestion.latitude) && Number.isFinite(suggestion.longitude))
    .filter((suggestion) => {
      if (seen.has(suggestion.label)) return false;
      seen.add(suggestion.label);
      return true;
    });
  if (SUGGESTION_CACHE.size >= SOURCES.geocoding.cacheLimit) SUGGESTION_CACHE.delete(SUGGESTION_CACHE.keys().next().value);
  SUGGESTION_CACHE.set(key, results);
  return results;
};

const AddressAutocomplete = ({ value, onChange, onSelect, placeholder, className, style, bias, onKeyDown }) => {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchedQuery, setSearchedQuery] = useState("");
  const [highlight, setHighlight] = useState(-1);
  const abortRef = useRef(null);
  const timerRef = useRef(null);
  const skipNextRef = useRef(false);
  const biasLatitude = bias ? Number(bias.latitude) : NaN;
  const biasLongitude = bias ? Number(bias.longitude) : NaN;
  const query = (value || "").trim();

  useEffect(() => {
    clearTimeout(timerRef.current);
    if (skipNextRef.current) {
      skipNextRef.current = false;
      return undefined;
    }
    if (query.length < SOURCES.geocoding.minQueryLength) {
      if (abortRef.current) abortRef.current.abort();
      setSuggestions([]);
      setLoading(false);
      setError("");
      setSearchedQuery("");
      return undefined;
    }
    timerRef.current = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError("");
      try {
        const biasPoint = Number.isFinite(biasLatitude) && Number.isFinite(biasLongitude) ? { latitude: biasLatitude, longitude: biasLongitude } : null;
        const results = await fetchSuggestions(query, biasPoint, controller.signal);
        if (controller.signal.aborted) return;
        setSuggestions(results);
        setHighlight(results.length ? 0 : -1);
        setSearchedQuery(query);
      } catch (fetchError) {
        if (fetchError.name === "AbortError") return;
        setSuggestions([]);
        setSearchedQuery(query);
        setError("Address suggestions are unavailable right now.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, SOURCES.geocoding.debounceMs);
    return () => clearTimeout(timerRef.current);
  }, [query, biasLatitude, biasLongitude]);

  useEffect(() => () => {
    clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();
  }, []);

  const choose = (suggestion) => {
    skipNextRef.current = true;
    setOpen(false);
    setSuggestions([]);
    setSearchedQuery("");
    onChange(suggestion.label);
    if (onSelect) onSelect(suggestion);
  };

  const handleKeyDown = (event) => {
    const menuVisible = open && suggestions.length > 0;
    if (menuVisible && event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((previous) => (previous + 1) % suggestions.length);
      return;
    }
    if (menuVisible && event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((previous) => (previous <= 0 ? suggestions.length - 1 : previous - 1));
      return;
    }
    if (menuVisible && event.key === "Enter" && highlight >= 0) {
      event.preventDefault();
      choose(suggestions[highlight]);
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (onKeyDown) onKeyDown(event);
  };

  const showMenu = open && query.length >= SOURCES.geocoding.minQueryLength && (loading || error || suggestions.length > 0 || searchedQuery === query);

  return (
    <div className="satWeatherAddressAutocomplete" style={style}>
      <input
        type="text"
        className={className}
        value={value || ""}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={showMenu}
        aria-autocomplete="list"
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
      />
      {showMenu && (
        <div className="satWeatherAddressAutocompleteMenu" role="listbox">
          {loading && suggestions.length === 0 && (
            <div className="satWeatherAddressAutocompleteStatus">
              <FontAwesomeIcon icon={faSpinner} spin />
            </div>
          )}
          {!loading && error && (
            <div className="satWeatherAddressAutocompleteStatus satWeatherAddressAutocompleteError">
              <FontAwesomeIcon icon={faTriangleExclamation} />
              <span>{error}</span>
            </div>
          )}
          {!loading && !error && suggestions.length === 0 && (
            <div className="satWeatherAddressAutocompleteStatus">
              <span>No Matching Addresses</span>
            </div>
          )}
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.id}
              type="button"
              role="option"
              aria-selected={index === highlight}
              className={`satWeatherAddressAutocompleteItem${index === highlight ? " satWeatherAddressAutocompleteItemActive" : ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setHighlight(index)}
              onClick={() => choose(suggestion)}
            >
              <FontAwesomeIcon icon={faLocationDot} className="satWeatherAddressAutocompleteIcon" />
              <span className="satWeatherAddressAutocompleteText">
                <span className="satWeatherAddressAutocompletePrimary">{suggestion.primary}</span>
                {suggestion.secondary && <span className="satWeatherAddressAutocompleteSecondary">{suggestion.secondary}</span>}
              </span>
            </button>
          ))}
          <div className="satWeatherAddressAutocompleteAttribution">{SOURCES.geocoding.attribution}</div>
        </div>
      )}
    </div>
  );
};

const parseOfficialText = (text) => {
  const blocks = String(text || "").replace(/\r/g, "").split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
  return blocks.map((block) => {
    const items = [];
    for (const rawLine of block.split("\n")) {
      const line = rawLine.trim();
      if (!line) continue;
      if (/^[-*•]\s+/.test(line) || !items.length) items.push(line);
      else items[items.length - 1] = `${items[items.length - 1]} ${line}`;
    }
    const first = items[0] || "";
    const section = /^(?:[-*•]\s*)?([A-Z][A-Z0-9 /&'()-]{1,40}?)\s*\.{2,}\s*(.*)$/.exec(first);
    const clean = (value) => value.replace(/^[-*•]\s+/, "").replace(/^([^.]{3,80}?)\s*\.{3,}\s*/, "$1: ").replace(/\s*\.{3,}\s*/g, "… ").replace(/\s{2,}/g, " ").trim();
    if (section) {
      const lead = clean(section[2]);
      const rest = items.slice(1).map(clean).filter(Boolean);
      return { label: section[1].trim(), text: lead, bullets: rest };
    }
    if (items.length > 1 && items.every((item) => /^[-*•]\s+/.test(item))) return { label: null, text: "", bullets: items.map(clean) };
    return { label: null, text: clean(items.join(" ")), bullets: [] };
  });
};

const linkify = (text) => String(text || "").split(/(https?:\/\/[^\s]+)/g).map((part, index) => (/^https?:\/\//.test(part)
  ? <a key={index} className="satWeatherTableLink" href={part.replace(/[.,;)]+$/, "").replace(/^http:/, "https:")} target="_blank" rel="noopener noreferrer">{part.replace(/[.,;)]+$/, "")}</a>
  : <React.Fragment key={index}>{part}</React.Fragment>));

const OfficialText = ({ title, text }) => {
  const sections = parseOfficialText(text);
  if (!sections.length) return null;
  return (
    <div className="satWeatherOfficial">
      <div className="satWeatherDetailTextTitle">{title}</div>
      {sections.map((section, index) => (
        <div key={index} className={`satWeatherOfficialRow ${section.label ? "" : "satWeatherOfficialRowPlain"}`}>
          {section.label && <div className="satWeatherOfficialLabel">{titleCaseName(section.label)}</div>}
          <div className="satWeatherOfficialBody">
            {section.text && <p>{linkify(section.text)}</p>}
            {section.bullets.map((item, bullet) => <p key={bullet}>{linkify(item)}</p>)}
          </div>
        </div>
      ))}
    </div>
  );
};

const AreaModal = ({ open, onClose, title, children, className }) => {
  if (!open) return null;
  return createPortal(
    <div className="satWeatherModalOverlay" onClick={onClose}>
      <div className={`satWeatherModal ${className || ""}`} onClick={(event) => event.stopPropagation()}>
        <div className="satWeatherModalHeader">
          <span>{title}</span>
          <button className="satWeatherModalClose" onClick={onClose}>
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>
        <div className="satWeatherModalContent">{children}</div>
      </div>
    </div>,
    document.body
  );
};

const LEAD_STATUS_TABS = [["new", "New"], ["reviewing", "Reviewing"], ["adopted", "Adopted"], ["dismissed", "Dismissed"], ["all", "All"]];

const LEAD_KINDS = { auth: { label: "Authentication", color: "#ff6b6b" }, key: { label: "API Key", color: "#FF9500" }, api: { label: "API", color: "#42a5f5" }, catalog: { label: "Catalog", color: "#4ecdc4" }, feed: { label: "Feed", color: "#7fe9e1" }, stream: { label: "Stream", color: "#ffd93d" }, host: { label: "New Host", color: "#cdd4e4" } };

const leadEvidence = (lead) => {
  const evidence = lead.evidence || {};
  if (evidence.wwwAuthenticate) return `The host answered ${evidence.status} and asked for ${evidence.wwwAuthenticate.split(/\s+/)[0]} credentials.`;
  if (evidence.status) return `The host answered ${evidence.status} without saying which credentials it wants.`;
  if (evidence.excerpt) return `“${evidence.excerpt.slice(0, 220)}${evidence.excerpt.length > 220 ? "…" : ""}”`;
  if (evidence.linkedFrom) return `Linked from ${evidence.linkedFrom}${evidence.text ? ` as “${evidence.text}”` : ""}.`;
  return "—";
};

const sourceAlert = (source) => {
  if (source.last_error && source.last_success_at) return { tone: "warning", title: "Recovering", text: `${String(source.last_error).replace(/\.?$/, ".")} The last successful run was ${formatRelativeTime(source.last_success_at).toLowerCase()}.`, meta: source.last_run_at ? `Last Run ${formatClock(source.last_run_at)}` : null };
  if (source.last_error) return { tone: "error", title: "Not Reporting", text: String(source.last_error).replace(/\.?$/, "."), meta: source.last_run_at ? `Last Run ${formatClock(source.last_run_at)}` : null };
  return null;
};

const sourceStatusLabel = (source) => {
  if (source.last_error && source.last_success_at) return { label: "Recovering", color: "#FF9500" };
  if (source.last_error) return { label: "Error", color: "#ff6b6b" };
  if (source.last_success_at) return { label: "Reporting", color: "#4ecdc4" };
  if (source.last_run_at) return { label: "No Data", color: "#919baf" };
  return { label: "Pending", color: "#919baf" };
};

const SOURCE_ALERT_ICONS = { error: faTriangleExclamation, warning: faClock, muted: faBan };

const renderSourceAlert = (alert, compact) => (alert ? (
  <div className={`satWeatherAlert satWeatherAlert${alert.tone.charAt(0).toUpperCase()}${alert.tone.slice(1)} ${compact ? "satWeatherAlertCompact" : ""}`}>
    <FontAwesomeIcon icon={SOURCE_ALERT_ICONS[alert.tone] || faTriangleExclamation} className="satWeatherAlertIcon" />
    <div className="satWeatherAlertBody">
      <div className="satWeatherAlertHead">
        <span className="satWeatherAlertTitle">{alert.title}</span>
        {alert.meta && <span className="satWeatherAlertMeta">{alert.meta}</span>}
      </div>
      <div className="satWeatherAlertText" title={compact ? alert.text : undefined}>{alert.text}</div>
    </div>
  </div>
) : null);

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

const loadMapKitJS = () => new Promise((resolve, reject) => {
  if (window.mapkit && window.__dinoMapkitInitialized) {
    resolve(window.mapkit);
    return;
  }
  const initialize = () => {
    if (!window.__dinoMapkitInitialized) {
      try {
        window.mapkit.init({ authorizationCallback: (done) => done(SOURCES.assets.mapkitToken) });
      } catch (error) {
        if (!/already/i.test(error.message || "")) throw error;
      }
      window.__dinoMapkitInitialized = true;
    }
    resolve(window.mapkit);
  };
  if (document.querySelector("script[src*=\"apple-mapkit\"]")) {
    const check = setInterval(() => {
      if (window.mapkit) {
        clearInterval(check);
        try {
          initialize();
        } catch (error) {
          reject(error);
        }
      }
    }, 100);
    setTimeout(() => {
      clearInterval(check);
      reject(new Error("The MapKit JS load timed out."));
    }, SOURCES.map.appleLoadTimeoutMs);
    return;
  }
  const script = document.createElement("script");
  script.src = SOURCES.assets.mapkitScript;
  script.crossOrigin = "anonymous";
  const timeout = setTimeout(() => reject(new Error("The MapKit JS load timed out.")), SOURCES.map.appleLoadTimeoutMs);
  script.addEventListener("load", () => {
    clearTimeout(timeout);
    try {
      initialize();
    } catch (error) {
      reject(error);
    }
  });
  script.addEventListener("error", () => {
    clearTimeout(timeout);
    reject(new Error("The MapKit JS script failed to load."));
  });
  document.head.appendChild(script);
});

const ResponsiveChart = ({ option, className, onExpand }) => {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => {
      try {
        chartRef.current?.getEchartsInstance()?.resize();
      } catch (error) {
        return;
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={containerRef} className={`satEarthCondChartWrapper ${onExpand ? "satEarthCondExpandable" : ""}`} onClick={onExpand}>
      <ReactEcharts ref={chartRef} option={option} className={className} autoResize={false} />
    </div>
  );
};

const LocationPickerModal = ({ initialLat, initialLon, initialLabel, onCancel, onConfirm }) => {
  const libreContainerRef = useRef(null);
  const appleContainerRef = useRef(null);
  const libreMapRef = useRef(null);
  const appleMapRef = useRef(null);
  const libreMarkerRef = useRef(null);
  const appleMarkerRef = useRef(null);
  const providerRef = useRef("maplibre");
  const appleReadyRef = useRef(false);
  const switchingRef = useRef(false);
  const pointerDownRef = useRef(null);
  const pickRef = useRef(null);
  const maplibreRef = useRef(null);
  const [provider, setProvider] = useState("maplibre");
  const [picked, setPicked] = useState({ lat: initialLat, lon: initialLon, label: initialLabel || null });
  const [labelLoading, setLabelLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searchStatus, setSearchStatus] = useState("");
  const [mapStatus, setMapStatus] = useState("Loading Map");
  const [locating, setLocating] = useState(false);
  const [latText, setLatText] = useState(initialLat === null || initialLat === undefined ? "" : String(initialLat));
  const [lonText, setLonText] = useState(initialLon === null || initialLon === undefined ? "" : String(initialLon));
  const typedLat = parseFloat(latText);
  const typedLon = parseFloat(lonText);
  const typedValid = Number.isFinite(typedLat) && Number.isFinite(typedLon) && typedLat >= -90 && typedLat <= 90 && typedLon >= -180 && typedLon <= 180;

  const switchProvider = useCallback((target, lat, lon, zoom) => {
    if (switchingRef.current || providerRef.current === target) return;
    switchingRef.current = true;
    providerRef.current = target;
    setProvider(target);
    if (target === "apple" && appleMapRef.current && window.mapkit) {
      const span = pickerZoomToSpan(zoom);
      appleMapRef.current.setRegionAnimated(new window.mapkit.CoordinateRegion(new window.mapkit.Coordinate(lat, lon), new window.mapkit.CoordinateSpan(span, span)), false);
    } else if (target === "maplibre" && libreMapRef.current) {
      libreMapRef.current.jumpTo({ center: [lon, lat], zoom });
      setTimeout(() => libreMapRef.current?.resize(), 0);
    }
    setTimeout(() => { switchingRef.current = false; }, 300);
  }, []);

  const flyTo = useCallback((lat, lon, zoom) => {
    if (zoom >= PICKER_APPLE_ZOOM_THRESHOLD && appleReadyRef.current) {
      if (providerRef.current !== "apple") switchProvider("apple", lat, lon, zoom);
      else if (appleMapRef.current && window.mapkit) {
        const span = pickerZoomToSpan(zoom);
        appleMapRef.current.setRegionAnimated(new window.mapkit.CoordinateRegion(new window.mapkit.Coordinate(lat, lon), new window.mapkit.CoordinateSpan(span, span)), true);
      }
      return;
    }
    if (providerRef.current !== "maplibre") switchProvider("maplibre", lat, lon, zoom);
    else libreMapRef.current?.flyTo({ center: [lon, lat], zoom, duration: 1200 });
  }, [switchProvider]);

  const placeMarkers = useCallback((lat, lon) => {
    if (libreMapRef.current && maplibreRef.current) {
      if (!libreMarkerRef.current) {
        const element = document.createElement("div");
        element.className = "satEarthCondPickerMarker";
        libreMarkerRef.current = new maplibreRef.current.Marker({ element }).setLngLat([lon, lat]).addTo(libreMapRef.current);
      } else {
        libreMarkerRef.current.setLngLat([lon, lat]);
      }
    }
    if (appleMapRef.current && window.mapkit) {
      if (appleMarkerRef.current) appleMapRef.current.removeAnnotation(appleMarkerRef.current);
      appleMarkerRef.current = new window.mapkit.MarkerAnnotation(new window.mapkit.Coordinate(lat, lon), { color: "#4ecdc4", glyphColor: "#08090c", title: "Selected Location" });
      appleMapRef.current.addAnnotation(appleMarkerRef.current);
    }
  }, []);

  const lookupLabel = useCallback(async (lat, lon) => {
    setLabelLoading(true);
    const finish = (label) => {
      setPicked(prev => (prev.lat === lat && prev.lon === lon ? { ...prev, label } : prev));
      setLabelLoading(false);
    };
    if (window.mapkit && window.__dinoMapkitInitialized) {
      try {
        new window.mapkit.Geocoder({ language: "en-US" }).reverseLookup(new window.mapkit.Coordinate(lat, lon), (error, data) => {
          const place = data?.results?.[0];
          if (!error && place) {
            finish([place.locality, place.administrativeArea, place.country].filter(Boolean).join(", ") || place.formattedAddress || null);
          } else {
            fetchBackendLabel(lat, lon).then(finish);
          }
        });
        return;
      } catch (error) {
        finish(await fetchBackendLabel(lat, lon));
        return;
      }
    }
    finish(await fetchBackendLabel(lat, lon));
  }, []);

  const fetchBackendLabel = async (lat, lon) => {
    try {
      const response = await fetch(`${apiUrl("reverseGeocode")}?lat=${lat}&lon=${lon}`);
      if (!response.ok) return null;
      const data = await response.json();
      return data.label || null;
    } catch (error) {
      return null;
    }
  };

  const pickPoint = useCallback((lat, lon, label = null) => {
    const roundedLat = parseFloat(lat.toFixed(4));
    const roundedLon = parseFloat((((lon + 540) % 360) - 180).toFixed(4));
    setPicked({ lat: roundedLat, lon: roundedLon, label });
    setLatText(String(roundedLat));
    setLonText(String(roundedLon));
    placeMarkers(roundedLat, roundedLon);
    if (!label) lookupLabel(roundedLat, roundedLon);
  }, [placeMarkers, lookupLabel]);

  useEffect(() => {
    pickRef.current = pickPoint;
  }, [pickPoint]);

  useEffect(() => {
    let cancelled = false;
    const handleKey = (event) => { if (event.key === "Escape") onCancel(); };
    window.addEventListener("keydown", handleKey);
    const pickerHost = libreContainerRef.current?.parentElement || null;
    const claimWheel = (event) => { event.preventDefault(); };
    pickerHost?.addEventListener("wheel", claimWheel, { passive: false, capture: true });
    loadMapDeps().then(({ maplibregl }) => {
      maplibreRef.current = maplibregl;
      if (cancelled || !libreContainerRef.current) return;
      const map = new maplibregl.Map({
        container: libreContainerRef.current,
        style: {
          version: 8,
          sources: {
            "satellite-tiles": { type: "raster", tiles: [SOURCES.assets.satelliteTiles], tileSize: 256, maxzoom: 19, attribution: "Tiles Esri" },
            "labels-tiles": { type: "raster", tiles: [SOURCES.assets.labelTiles], tileSize: 256, maxzoom: 19 }
          },
          layers: [
            { id: "satellite-layer", type: "raster", source: "satellite-tiles" },
            { id: "labels-layer", type: "raster", source: "labels-tiles", paint: { "raster-opacity": 0.9 } }
          ]
        },
        center: [initialLon, initialLat],
        zoom: 4,
        minZoom: 1,
        maxZoom: 18,
        antialias: true
      });
      map.addControl(new maplibregl.NavigationControl(), "top-right");
      map.addControl(new maplibregl.ScaleControl(), "bottom-left");
      map.on("load", () => {
        setMapStatus("");
        pickRef.current?.(initialLat, initialLon, initialLabel || null);
      });
      map.on("mousedown", event => { pointerDownRef.current = { x: event.originalEvent.clientX, y: event.originalEvent.clientY }; });
      map.on("click", event => {
        const down = pointerDownRef.current;
        if (down && Math.hypot(event.originalEvent.clientX - down.x, event.originalEvent.clientY - down.y) > 8) return;
        pickRef.current?.(event.lngLat.lat, event.lngLat.lng);
      });
      map.on("moveend", () => {
        if (providerRef.current !== "maplibre") return;
        const center = map.getCenter();
        if (map.getZoom() >= PICKER_APPLE_ZOOM_THRESHOLD && appleReadyRef.current && !switchingRef.current) switchProvider("apple", center.lat, center.lng, map.getZoom());
      });
      libreMapRef.current = map;
    }).catch(() => { if (!cancelled) setMapStatus("The map could not be loaded."); });
    loadMapKitJS().then(mapkit => {
      if (cancelled || !appleContainerRef.current) return;
      const map = new mapkit.Map(appleContainerRef.current, {
        mapType: mapkit.Map.MapTypes.Hybrid,
        colorScheme: mapkit.Map.ColorSchemes.Dark,
        showsCompass: mapkit.FeatureVisibility.Visible,
        showsZoomControl: true,
        showsScale: mapkit.FeatureVisibility.Visible,
        showsMapTypeControl: false,
        showsUserLocationControl: true,
        showsPointsOfInterest: true,
        isRotationEnabled: true
      });
      map.addEventListener("region-change-end", () => {
        if (providerRef.current !== "apple" || switchingRef.current) return;
        const zoom = pickerSpanToZoom(map.region.span.latitudeDelta);
        if (zoom < PICKER_APPLE_ZOOM_THRESHOLD) switchProvider("maplibre", map.center.latitude, map.center.longitude, zoom);
      });
      const element = appleContainerRef.current;
      element.addEventListener("mousedown", event => { pointerDownRef.current = { x: event.clientX, y: event.clientY }; });
      element.addEventListener("mouseup", event => {
        if (providerRef.current !== "apple") return;
        const down = pointerDownRef.current;
        if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 8) return;
        if (event.target.closest && event.target.closest(".mk-controls-container, .mk-annotation-container button, .mk-bottom-controls-container, .mk-top-controls-container")) return;
        const coordinate = map.convertPointOnPageToCoordinate(new DOMPoint(event.clientX, event.clientY));
        if (coordinate) pickRef.current?.(coordinate.latitude, coordinate.longitude);
      });
      appleMapRef.current = map;
      appleReadyRef.current = true;
      const current = libreMapRef.current;
      if (current && current.getZoom() >= PICKER_APPLE_ZOOM_THRESHOLD) {
        const center = current.getCenter();
        switchProvider("apple", center.lat, center.lng, current.getZoom());
      }
    }).catch(() => { appleReadyRef.current = false; });
    return () => {
      cancelled = true;
      window.removeEventListener("keydown", handleKey);
      pickerHost?.removeEventListener("wheel", claimWheel, { capture: true });
      try { libreMapRef.current?.remove(); } catch (error) { libreMapRef.current = null; }
      try { appleMapRef.current?.destroy(); } catch (error) { appleMapRef.current = null; }
      libreMapRef.current = null;
      appleMapRef.current = null;
      libreMarkerRef.current = null;
      appleMarkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (appleMapRef.current && window.mapkit && picked.lat !== null && picked.lat !== undefined) placeMarkers(picked.lat, picked.lon);
  }, [provider]);

  const runSearch = useCallback(async () => {
    const text = query.trim();
    if (text.length < 2) {
      setSearchStatus("Enter at least 2 characters to search.");
      setResults([]);
      return;
    }
    setSearchStatus("Searching");
    const useBackend = async () => {
      try {
        const response = await fetch(`${apiUrl("locationSearch")}?query=${encodeURIComponent(text)}`);
        const data = response.ok ? await response.json() : { results: [] };
        const mapped = (data.results || []).map(r => ({ label: r.label, lat: r.latitude, lon: r.longitude }));
        setResults(mapped);
        setSearchStatus(mapped.length ? "" : "No places matched that search.");
      } catch (error) {
        setResults([]);
        setSearchStatus("The location search is unavailable right now.");
      }
    };
    if (window.mapkit && window.__dinoMapkitInitialized) {
      try {
        new window.mapkit.Search({ language: "en-US" }).search(text, (error, data) => {
          if (error || !data?.places?.length) {
            useBackend();
            return;
          }
          setResults(data.places.slice(0, 6).map(p => ({ label: [p.name, p.formattedAddress].filter(Boolean).join(", "), lat: p.coordinate.latitude, lon: p.coordinate.longitude })));
          setSearchStatus("");
        });
        return;
      } catch (error) {
        await useBackend();
        return;
      }
    }
    await useBackend();
  }, [query]);

  const chooseResult = (result) => {
    pickPoint(result.lat, result.lon, result.label);
    flyTo(result.lat, result.lon, 10);
    setResults([]);
    setQuery("");
    setSearchStatus("");
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setSearchStatus("This browser does not support location access.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(position => {
      setLocating(false);
      pickPoint(position.coords.latitude, position.coords.longitude);
      flyTo(position.coords.latitude, position.coords.longitude, 11);
    }, () => {
      setLocating(false);
      setSearchStatus("Your location could not be determined. Check the browser's location permission.");
    }, { enableHighAccuracy: true, timeout: 10000 });
  };

  return (
    <div className="satEarthCondModalOverlay" onClick={onCancel}>
      <div className="satEarthCondModal satEarthCondPickerModal" onClick={(event) => event.stopPropagation()}>
        <div className="satEarthCondModalHeader">
          <h4 className="satEarthCondModalTitle">Choose Location</h4>
          <button type="button" className="satEarthCondModalClose" onClick={onCancel} aria-label="Close">
            <FontAwesomeIcon icon={faXmarkSquare} />
          </button>
        </div>
        <div className="satEarthCondPickerToolbar">
          <div className="satEarthCondPickerSearch">
            <input
              type="text"
              placeholder="Search Places"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") runSearch(); }}
              className="satEarthCondInput"
            />
            {results.length > 0 && (
              <div className="satEarthCondPickerResults">
                {results.map((result, index) => (
                  <button key={`${result.lat}_${result.lon}_${index}`} type="button" className="satEarthCondPickerResult" onClick={() => chooseResult(result)}>
                    <span className="satEarthCondPickerResultName">{result.label}</span>
                    <span className="satEarthCondPickerResultCoords">{result.lat.toFixed(3)}, {result.lon.toFixed(3)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" className="satEarthCondBtn satEarthCondBtnSecondary" onClick={runSearch}>
            <FontAwesomeIcon icon={faSearchPlus} /> Search
          </button>
          <button type="button" className="satEarthCondBtn satEarthCondBtnSecondary" onClick={useMyLocation} disabled={locating}>
            <FontAwesomeIcon icon={locating ? faSpinner : faMapMarkerAlt} spin={locating} /> My Location
          </button>
          {searchStatus && <span className="satEarthCondPickerStatus">{searchStatus}</span>}
        </div>
        <div className="satEarthCondPickerToolbar satWeatherPickerCoords">
          <label className="satWeatherPickerCoordField">
            <span>Latitude</span>
            <input type="number" step="0.0001" min="-90" max="90" value={latText} onChange={(event) => setLatText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && typedValid) { pickPoint(typedLat, typedLon); flyTo(typedLat, typedLon, 9); } }} className="satEarthCondInput" placeholder="-90 To 90" />
          </label>
          <label className="satWeatherPickerCoordField">
            <span>Longitude</span>
            <input type="number" step="0.0001" min="-180" max="180" value={lonText} onChange={(event) => setLonText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && typedValid) { pickPoint(typedLat, typedLon); flyTo(typedLat, typedLon, 9); } }} className="satEarthCondInput" placeholder="-180 To 180" />
          </label>
          <button type="button" className="satEarthCondBtn satEarthCondBtnSecondary" disabled={!typedValid} onClick={() => { pickPoint(typedLat, typedLon); flyTo(typedLat, typedLon, 9); }}>
            <FontAwesomeIcon icon={faMapMarkerAlt} /> Go To Coordinates
          </button>
        </div>
        <div className="satEarthCondPickerMap">
          <div ref={libreContainerRef} className="satEarthCondPickerCanvas" style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, width: "100%", height: "100%", display: provider === "maplibre" ? "block" : "none" }} />
          <div ref={appleContainerRef} className="satEarthCondPickerCanvas" style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, width: "100%", height: "100%", display: provider === "apple" ? "block" : "none" }} />
          {mapStatus && <div className="satEarthCondPickerOverlayStatus">{mapStatus}</div>}
          <div className="satEarthCondPickerHint">Click Anywhere To Drop A Pin</div>
        </div>
        <div className="satEarthCondPickerFooter">
          <div className="satEarthCondPickerSelection">
            <span className="satEarthCondPickerSelectionLabel">Selected Location</span>
            <span className="satEarthCondPickerSelectionValue">
              {labelLoading ? "Looking Up Place Name" : picked.label || "Unnamed Location"}
            </span>
            <span className="satEarthCondPickerSelectionCoords">
              {picked.lat !== null && picked.lat !== undefined ? `${picked.lat.toFixed(4)}°, ${picked.lon.toFixed(4)}°` : "—"}
            </span>
          </div>
          <div className="satEarthCondPickerActions">
            <button type="button" className="satEarthCondBtn satEarthCondBtnSecondary" onClick={onCancel}>Cancel</button>
            <button type="button" className="satEarthCondBtn satEarthCondBtnSecondary" onClick={() => onConfirm(picked)} disabled={picked.lat === null || picked.lat === undefined}>
              <FontAwesomeIcon icon={faSquareCheck} /> Use This Location
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const FeedsModal = ({ title, onClose, children, className, footer }) => {
  useEffect(() => {
    const handleKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);
  return createPortal(
    <div className="satModalPortal">
      <div className="satFeedsModalOverlay" onClick={onClose}>
        <div className={`satFeedsModal ${className || ""}`} onClick={(event) => event.stopPropagation()}>
          <div className="satFeedsModalHeader">
            <span>{title}</span>
            <button type="button" className="satFeedsModalClose" onClick={onClose} aria-label="Close">
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>
          <div className="satFeedsModalContent">{children}</div>
          {footer && <div className="satOpModalFooter">{footer}</div>}
        </div>
      </div>
    </div>,
    document.body
  );
};

const FeedsTabs = ({ tabs, activeTab, onTabChange }) => (
  <div className="satFeedsTabs">
    {tabs.map(tab => (
      <button
        key={tab.key}
        type="button"
        className={`satFeedsTab ${activeTab === tab.key ? "satFeedsTabActive" : ""}`}
        onClick={() => onTabChange(tab.key)}
      >
        <FontAwesomeIcon icon={tab.icon} /> {tab.label}
      </button>
    ))}
  </div>
);

const FeedsTable = ({ columns, rows, emptyText, widths }) => (
  rows.length === 0 ? (
    <div className="satFeedsEmpty">{emptyText}</div>
  ) : (
    <div className="satFeedsTableScroll">
      <table className="satFeedsTable">
        <thead><tr>{columns.map((column, index) => <th key={index} style={widths ? { width: widths[index] } : undefined}>{column}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  )
);


const LeadsModal = ({ onClose, onChanged }) => {
  const [status, setStatus] = useState("new");
  const [kind, setKind] = useState("");
  const [text, setText] = useState("");
  const [leads, setLeads] = useState([]);
  const [counts, setCounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status, limit: "300" });
      if (kind) params.set("kind", kind);
      const response = await fetch(`${SOURCES.harvest.base}/leads?${params.toString()}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.message || `The leads request failed with status ${response.status}.`);
      setLeads(data.leads || []);
      setCounts(data.counts || []);
      setError(null);
    } catch (loadError) {
      setError(`The leads could not be loaded because of the error "${errorText(loadError)}".`);
    } finally {
      setLoading(false);
    }
  }, [status, kind]);

  useEffect(() => {
    load();
  }, [load]);

  const update = async (lead, nextStatus) => {
    setBusyId(lead.leadId);
    try {
      const response = await fetch(`${SOURCES.harvest.base}/leads/${lead.leadId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.message || `The update failed with status ${response.status}.`);
      setLeads(prev => (status === "all" ? prev.map(item => (item.leadId === lead.leadId ? { ...item, status: nextStatus } : item)) : prev.filter(item => item.leadId !== lead.leadId)));
      setCounts(prev => prev.map(row => (row.kind === lead.kind && row.status === lead.status ? { ...row, total: row.total - 1 } : row)).concat([{ status: nextStatus, kind: lead.kind, total: 1 }]));
      setNotice(null);
      if (onChanged) onChanged();
    } catch (updateError) {
      setNotice(`The lead could not be updated because of the error "${errorText(updateError)}".`);
    } finally {
      setBusyId(null);
    }
  };

  const exportLeads = async (format) => {
    setExporting(true);
    try {
      const params = new URLSearchParams({ status, limit: "500" });
      if (kind) params.set("kind", kind);
      const response = await fetch(`${SOURCES.harvest.base}/leads?${params.toString()}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.message || `The export request failed with status ${response.status}.`);
      const rows = data.leads || [];
      let body;
      let type;
      if (format === "json") {
        body = JSON.stringify({ exportedAt: new Date().toISOString(), status, kind: kind || "all", leads: rows }, null, 2);
        type = "application/json";
      } else {
        body = "LeadId,Status,Kind,Title,Host,Url,Hits,Evidence,Note,Source,Domain,FirstSeen,LastSeen\n";
        rows.forEach(lead => {
          body += `${csvQuote(lead.leadId)},${csvQuote(lead.status)},${csvQuote(lead.kind)},${csvQuote(lead.title)},${csvQuote(lead.host)},${csvQuote(lead.url)},${lead.hits},${csvQuote(leadEvidence(lead))},${csvQuote(lead.note || "")},${csvQuote(lead.source_key)},${csvQuote(lead.domain)},${csvQuote(lead.first_seen_at)},${csvQuote(lead.last_seen_at)}\n`;
        });
        type = "text/csv";
      }
      const blob = new Blob([body], { type });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `source_leads_${status}${kind ? `_${kind}` : ""}.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice(null);
    } catch (exportError) {
      setNotice(`The leads could not be exported because of the error "${errorText(exportError)}".`);
    } finally {
      setExporting(false);
    }
  };

  const totalFor = (statusKey, kindKey) => counts.filter(row => (statusKey === "all" || row.status === statusKey) && (!kindKey || row.kind === kindKey)).reduce((sum, row) => sum + row.total, 0);
  const tabs = LEAD_STATUS_TABS.map(([key, label]) => ({ key, label: `${label} (${totalFor(key, kind)})`, icon: key === "new" ? faLightbulb : key === "adopted" ? faCheck : key === "dismissed" ? faBan : key === "reviewing" ? faEye : faLayerGroup }));
  const kindOptions = [["", "All Kinds"]].concat(Object.entries(LEAD_KINDS).map(([key, meta]) => [key, `${meta.label} (${totalFor(status, key)})`]));
  const kindLabel = (kindOptions.find(([value]) => value === kind) || kindOptions[0])[1];
  const needle = text.trim().toLowerCase();
  const visible = needle ? leads.filter(lead => [lead.host, lead.title, lead.url, leadEvidence(lead)].some(value => value && String(value).toLowerCase().includes(needle))) : leads;
  const chips = [
    kind ? { key: "kind", label: (LEAD_KINDS[kind] || { label: titleCaseWords(kind) }).label, clear: () => setKind("") } : null,
    needle ? { key: "text", label: `Text: ${text.trim()}`, clear: () => setText("") } : null
  ].filter(Boolean);

  const rows = visible.map((lead) => {
    const meta = LEAD_KINDS[lead.kind] || { label: titleCaseWords(lead.kind), color: "#cdd4e4" };
    return [
      <div className="satOpResultCell">
        <span className="satOpResultPrimary" title={lead.host || lead.title}>{lead.host || lead.title}</span>
        <a className="satOpResultSecondary satOpResultLink" href={lead.url} target="_blank" rel="noopener noreferrer" title={lead.url}>{lead.url}</a>
        <span className="satOpResultSecondary satOpResultClamp" title={leadEvidence(lead)}>{leadEvidence(lead)}</span>
      </div>,
      <span className="satLeadKind" style={{ color: meta.color, borderColor: meta.color }}>{meta.label}</span>,
      <span className="satOpResultPlain">{lead.hits}</span>,
      <span className="satOpResultPlain" title={formatAbsoluteTime(lead.last_seen_at)}>{formatRelativeTime(lead.last_seen_at)}</span>,
      <div className="satLeadActions">
        {lead.status !== "reviewing" && <button className="satLeadAction" disabled={busyId === lead.leadId} onClick={() => update(lead, "reviewing")} title="Mark As Reviewing"><FontAwesomeIcon icon={faEye} /></button>}
        {lead.status !== "adopted" && <button className="satLeadAction satLeadActionAdopt" disabled={busyId === lead.leadId} onClick={() => update(lead, "adopted")} title="Mark As Adopted"><FontAwesomeIcon icon={faCheck} /></button>}
        {lead.status !== "dismissed" && <button className="satLeadAction satLeadActionDismiss" disabled={busyId === lead.leadId} onClick={() => update(lead, "dismissed")} title="Dismiss"><FontAwesomeIcon icon={faBan} /></button>}
      </div>
    ];
  });

  const footer = (
    <>
      <span className="satOpModalFooterInfo">{needle ? `${visible.length.toLocaleString()} Matches In The Top ${leads.length.toLocaleString()} Of ${totalFor(status, kind).toLocaleString()} Leads` : `${leads.length.toLocaleString()} Of ${totalFor(status, kind).toLocaleString()} Leads Shown`}</span>
      <div className="satOpModalFooterActions">
        <button type="button" className="satLeadFilter" disabled={exporting} onClick={() => exportLeads("csv")} title="Export Leads As CSV"><FontAwesomeIcon icon={faDownload} /> CSV</button>
        <button type="button" className="satLeadFilter" disabled={exporting} onClick={() => exportLeads("json")} title="Export Leads As JSON"><FontAwesomeIcon icon={faDownload} /> JSON</button>
      </div>
    </>
  );

  return (
    <FeedsModal title="Source Leads" onClose={onClose} className="satOpModal satOpLeadsModal" footer={footer}>
      <div className="satOpToolbar">
        <div className="satOpSearchBar">
          <FontAwesomeIcon icon={faSearchPlus} className="satOpSearchBarIcon" />
          <input type="text" className="satOpInput" placeholder="Host, URL, Or Evidence" value={text} onChange={(event) => setText(event.target.value)} />
        </div>
        <div className="satOpToolbarField">
          <Dropdown value={kindLabel} onChange={(option) => setKind((kindOptions.find(([, label]) => label === option) || kindOptions[0])[0])} options={kindOptions.map(([, label]) => label)} placeholder="Kind" />
        </div>
      </div>
      {chips.length > 0 && (
        <div className="satOpChipRow">
          {chips.map((chip) => (
            <button key={chip.key} type="button" className="satOpChip" onClick={chip.clear} title={`Remove ${chip.label}`}>
              <span>{chip.label}</span>
              <FontAwesomeIcon icon={faXmark} />
            </button>
          ))}
        </div>
      )}
      <FeedsTabs tabs={tabs} activeTab={status} onTabChange={setStatus} />
      <div className="satOpNote">The harvester flags sources it found but cannot collect on its own, such as hosts that require credentials, API documentation, and data catalogs on unlisted domains.</div>
      {notice && <div className="satLeadNotice">{notice}</div>}
      {error ? (
        <div className="satFeedsEmpty satFeedsError">{error}</div>
      ) : loading && leads.length === 0 ? (
        <div className="satFeedsEmpty">Loading Leads</div>
      ) : (
        <FeedsTable columns={["Lead", "Kind", "Hits", "Last Seen", ""]} widths={["auto", "124px", "56px", "88px", "140px"]} rows={rows} emptyText={needle ? "No leads match that text." : "No leads match this filter."} />
      )}
    </FeedsModal>
  );
};


const fetchApi = async (key, params) => {
  const query = params ? `?${new URLSearchParams(params).toString()}` : "";
  const response = await fetch(`${apiUrl(key)}${query}`);
  const data = await response.json().catch(() => null);
  if (!data) throw new Error(`The server returned an unreadable response with status ${response.status}`);
  if (!response.ok || !data.success) throw new Error(data.message || `The server returned status ${response.status}`);
  return data;
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

const RiskCommandCenter = ({ orgid: propOrgid, username: propUsername }) => {
  const navigate = useNavigate();
  const { token, loading: authLoading } = useAuth();

  const [orgid] = useState(propOrgid || localStorage.getItem("orgid") || "default_org");
  const [username] = useState(propUsername || localStorage.getItem("username") || "default_user");

  const [harvestHealth, setHarvestHealth] = useState(null);
  const [harvestHealthError, setHarvestHealthError] = useState(null);
  const [harvestObjects, setHarvestObjects] = useState(0);
  const [showLeads, setShowLeads] = useState(false);
  const [expandedWarnings, setExpandedWarnings] = useState({});
  const toggleWarning = (key) => setExpandedWarnings((current) => ({ ...current, [key]: !current[key] }));

  const loadHarvestHealth = useCallback(async () => {
    try {
      const [healthResponse, productsResponse] = await Promise.all([
        fetch(`${SOURCES.harvest.base}/health`),
        fetch(`${SOURCES.harvest.base}/products?domain=${SOURCES.harvest.domain}&limit=1`)
      ]);
      const health = await healthResponse.json().catch(() => null);
      const products = productsResponse.ok ? await productsResponse.json().catch(() => null) : null;
      if (!healthResponse.ok || !health) throw new Error(`The harvester health request failed with status ${healthResponse.status}.`);
      setHarvestHealth(health);
      setHarvestObjects(products ? products.total : 0);
      setHarvestHealthError(null);
    } catch (error) {
      setHarvestHealthError(errorText(error));
    }
  }, []);

  useEffect(() => {
    loadHarvestHealth();
    const timer = setInterval(loadHarvestHealth, SOURCES.harvest.healthRefreshMs);
    return () => clearInterval(timer);
  }, [loadHarvestHealth]);

  const harvestSources = useMemo(() => (harvestHealth?.sources || []).filter((source) => source.domain === SOURCES.harvest.domain), [harvestHealth]);

  const harvestStats = useMemo(() => {
    const jobs = (harvestHealth?.queue || []).filter((row) => SOURCES.harvest.jobPattern.test(row.job_type));
    return {
      frames: harvestSources.reduce((sum, source) => sum + (Number(source.frames) || 0), 0),
      due: jobs.reduce((sum, row) => sum + (Number(row.due) || 0), 0),
      running: jobs.reduce((sum, row) => sum + (Number(row.running) || 0), 0),
      sources: harvestSources.length,
      failing: harvestSources.filter((source) => source.enabled && source.error_streak >= 3).length
    };
  }, [harvestHealth, harvestSources]);

  const harvestWarnings = useMemo(() => harvestSources.filter((source) => source.enabled && source.last_error).map((source) => `${source.name}: ${source.last_error}`), [harvestSources]);

  const harvestStatusLabel = harvestHealth?.status === "Needs Schema" || harvestHealth?.status === "Idle"
    ? harvestHealth.status
    : harvestHealth
      ? (harvestStats.failing ? "Degraded" : "Healthy")
      : harvestHealthError ? "Unavailable" : "Loading";

  const [activeTab, setActiveTab] = useState("map");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(60000);
  const [riskLayersVisible, setRiskLayersVisible] = useState(DEFAULT_RISK_LAYERS);
  const [severityFilter, setSeverityFilter] = useState("high");
  const [showSatellite, setShowSatellite] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showVisibilityBadges, setShowVisibilityBadges] = useState(true);
  const [layoutVisibility, setLayoutVisibility] = useState(DEFAULT_LAYOUT);
  const [selectedLocation, setSelectedLocation] = useState(WORLDWIDE_KEY);
  const [customLocationLabel, setCustomLocationLabel] = useState(null);
  const [areaRadius, setAreaRadius] = useState(100);
  const [locationQuery, setLocationQuery] = useState("");
  const [locationResults, setLocationResults] = useState([]);
  const [locationSearchStatus, setLocationSearchStatus] = useState("");
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [assessmentViewState, setAssessmentViewState] = useState(DEFAULT_ASSESSMENT_VIEW);
  const [stateRestored, setStateRestored] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [apiSuccess, setApiSuccess] = useState(null);
  const [expandedView, setExpandedView] = useState(null);

  const [riskIntelligenceData, setRiskIntelligenceData] = useState(EMPTY_RISK_DATA);
  const [hazardsLoaded, setHazardsLoaded] = useState(false);
  const [riskIntelligenceLoading, setRiskIntelligenceLoading] = useState(false);
  const [riskIntelligenceError, setRiskIntelligenceError] = useState(null);
  const [riskIntelligenceLastUpdated, setRiskIntelligenceLastUpdated] = useState(null);
  const [latency, setLatency] = useState(0);
  const [liveConnected, setLiveConnected] = useState(false);
  const [snapshotLoaded, setSnapshotLoaded] = useState(false);
  const [sourceStatus, setSourceStatus] = useState([]);
  const [sourceStatusError, setSourceStatusError] = useState(null);
  const [riskDataSources, setRiskDataSources] = useState([]);
  const [savedViews, setSavedViews] = useState(loadStoredSavedViews);

  const [areas, setAreas] = useState([]);
  const [areasLoaded, setAreasLoaded] = useState(false);
  const [selectedAreaId, setSelectedAreaId] = useState(null);
  const [editingAreaId, setEditingAreaId] = useState(null);
  const [areaFilterActive, setAreaFilterActive] = useState(false);
  const [areaFormData, setAreaFormData] = useState({ ...INITIAL_AREA_FORM });
  const [isGeocodingArea, setIsGeocodingArea] = useState(false);
  const [areaModalOpen, setAreaModalOpen] = useState(false);

  const [localAssessment, setLocalAssessment] = useState(null);
  const [localAssessmentError, setLocalAssessmentError] = useState(null);
  const [assessmentModal, setAssessmentModal] = useState(null);
  const [isAssessingLocation, setIsAssessingLocation] = useState(false);
  const [nearbyModalOpen, setNearbyModalOpen] = useState(false);
  const [nearbyRisks, setNearbyRisks] = useState(null);
  const [isLoadingNearby, setIsLoadingNearby] = useState(false);
  const [nearbyFormData, setNearbyFormData] = useState({ ...INITIAL_NEARBY_FORM });

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState(null);
  const [featureMeasurements, setFeatureMeasurements] = useState(null);
  const [featureDetails, setFeatureDetails] = useState(null);
  const [isSelectingFeature, setIsSelectingFeature] = useState(false);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  const [selectionError, setSelectionError] = useState(null);

  const [selected, setSelected] = useState(null);
  const [briefOpen, setBriefOpen] = useState(false);
  const [hoverInfo, setHoverInfo] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedRiskSections, setExpandedRiskSections] = useState({ overview: true, metadata: true, impact: true, recommendations: true, technical: false, source: false });

  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(null);
  const [activeProvider, setActiveProvider] = useState(MAP_PROVIDER_DECKGL);
  const [viewState, setViewState] = useState({ lat: SOURCES.map.center[1], lon: SOURCES.map.center[0], zoom: SOURCES.map.zoom, bounds: null });
  const [deckLayersVersion, setDeckLayersVersion] = useState(0);

  const mapContainerRef = useRef(null);
  const libsRef = useRef(null);
  const appleMapContainerRef = useRef(null);
  const deckglMapContainerRef = useRef(null);
  const appleMapRef = useRef(null);
  const deckglMapRef = useRef(null);
  const mapProviderRef = useRef(MAP_PROVIDER_DECKGL);
  const deckOverlayRef = useRef(null);
  const appleMapReadyRef = useRef(false);
  const switchingProviderRef = useRef(false);
  const appleAnnotationsRef = useRef([]);
  const appleOverlaysRef = useRef([]);
  const selectionGeoJsonRef = useRef(null);
  const selectionModeRef = useRef(false);
  const mouseDownPosRef = useRef(null);
  const queryFeatureAtPointRef = useRef(null);
  const showHeatmapRef = useRef(false);
  const streamingDataRef = useRef({ ...EMPTY_RISK_DATA });
  const streamFlushTimerRef = useRef(null);
  const nearbyStreamRef = useRef(null);
  const pendingCameraRef = useRef(null);
  const locationRef = useRef(null);
  const tabContentRef = useRef(null);
  const viewRef = useRef(null);
  const selectRiskRef = useRef(null);
  const setHoverRef = useRef(null);

  useEffect(() => {
    if (!authLoading && !token) navigate("/login");
  }, [authLoading, token, navigate]);

  useEffect(() => {
    if (!expandedView) return undefined;
    const handleKey = (event) => { if (event.key === "Escape") setExpandedView(null); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [expandedView]);

  const showNotification = useCallback((message, type = "success") => {
    const setter = type === "success" ? setApiSuccess : setApiError;
    setter(message);
    setTimeout(() => setter(null), type === "success" ? 4000 : 5000);
  }, []);

  const apiFetch = useCallback(async (url, options = {}) => {
    const response = await fetch(url, options);
    try {
      return await response.json();
    } catch (error) {
      return { success: false, message: `The server returned an unreadable response with status ${response.status}.` };
    }
  }, []);

  const apiFetchWithStatus = useCallback(async (url, options = {}) => {
    const response = await fetch(url, options);
    let data;
    try {
      data = await response.json();
    } catch (error) {
      data = { success: false, message: `The server returned an unreadable response with status ${response.status}.` };
    }
    return { status: response.status, data };
  }, []);

  const locationActive = selectedLocation !== WORLDWIDE_KEY;
  const locationName = customLocationLabel && customLocationLabel.key === selectedLocation ? customLocationLabel.label : CUSTOM_LOCATION_LABEL;
  const [selectedLat, selectedLon] = locationActive ? selectedLocation.split(",").map(Number) : [null, null];


  const searchLocations = useCallback(async () => {
    const query = locationQuery.trim();
    if (query.length < 2) {
      setLocationSearchStatus("Enter at least 2 characters to search.");
      setLocationResults([]);
      return;
    }
    setLocationSearchStatus("Searching");
    try {
      const response = await fetch(`${apiUrl("locationSearch")}?query=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error(`The server returned status ${response.status}.`);
      const data = await response.json();
      setLocationResults(data.results || []);
      setLocationSearchStatus((data.results || []).length ? "" : "No places matched that search.");
    } catch (error) {
      setLocationResults([]);
      setLocationSearchStatus("The location search is unavailable right now.");
    }
  }, [locationQuery]);

  const selectSearchResult = useCallback((result) => {
    const key = `${result.latitude},${result.longitude}`;
    setCustomLocationLabel({ key, label: result.label });
    setSelectedLocation(key);
    setLocationResults([]);
    setLocationQuery("");
    setLocationSearchStatus("");
  }, []);

  const setView = useCallback((next) => {
    viewRef.current = next;
    setViewState(next);
  }, []);

  const flushStreamingData = useCallback(() => {
    clearTimeout(streamFlushTimerRef.current);
    streamFlushTimerRef.current = null;
    const ref = streamingDataRef.current;
    const next = {};
    Object.keys(EMPTY_RISK_DATA).forEach((key) => { next[key] = [...(ref[key] || [])]; });
    setRiskIntelligenceData(next);
    setRiskIntelligenceLastUpdated(new Date());
  }, []);

  const loadHazards = useCallback(async () => {
    if (!orgid || !username) return;
    setRiskIntelligenceLoading(true);
    const started = performance.now();
    try {
      const data = await apiFetch(`${apiUrl("hazards")}?orgid=${encodeURIComponent(orgid)}&username=${encodeURIComponent(username)}`);
      if (!data || !data.success || !Array.isArray(data.risks)) {
        setRiskIntelligenceError((data && data.message) || "The hazards for your monitored areas could not be loaded.");
        return;
      }
      const buckets = {};
      Object.keys(EMPTY_RISK_DATA).forEach((key) => { buckets[key] = []; });
      const seen = new Set();
      for (const risk of data.risks) {
        if (isRiskEventExpired(risk)) continue;
        if (risk.id) {
          if (seen.has(risk.id)) continue;
          seen.add(risk.id);
        }
        if (!risk.visibility) risk.visibility = getRiskVisibility(risk);
        normalizeRiskCoords(risk);
        const bucket = categorizeRisk(risk);
        if (buckets[bucket]) buckets[bucket].push(risk);
      }
      const previous = streamingDataRef.current;
      const retained = [];
      Object.keys(previous).forEach((key) => {
        for (const risk of previous[key] || []) {
          if (risk._live && !seen.has(risk.id) && !isRiskEventExpired(risk)) retained.push([key, risk]);
        }
      });
      retained.sort((a, b) => String(b[1]._ingested_at || "").localeCompare(String(a[1]._ingested_at || "")));
      retained.slice(0, SOURCES.live.maxRetained).forEach(([key, risk]) => buckets[key].push(risk));
      streamingDataRef.current = buckets;
      flushStreamingData();
      setRiskIntelligenceError(null);
      setLatency(Math.round(performance.now() - started));
    } catch (error) {
      setRiskIntelligenceError(`The hazards for your monitored areas could not be loaded because of the error "${errorText(error)}".`);
    } finally {
      setRiskIntelligenceLoading(false);
      setHazardsLoaded(true);
    }
  }, [orgid, username, apiFetch, flushStreamingData]);

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

  const fetchAreas = useCallback(async () => {
    if (!orgid || !username) return;
    try {
      const data = await apiFetch(`${apiUrl("areas")}?orgid=${encodeURIComponent(orgid)}&username=${encodeURIComponent(username)}`);
      if (data && data.success && Array.isArray(data.areas)) {
        setAreas(data.areas);
        setSelectedAreaId((prev) => (prev && data.areas.some((area) => area.area_id === prev) ? prev : (data.areas[0] ? data.areas[0].area_id : null)));
      }
    } catch (error) { }
    setAreasLoaded(true);
  }, [orgid, username, apiFetch]);

  const fetchSavedViewsFromBackend = useCallback(async () => {
    if (!orgid || !username) return;
    try {
      const data = await apiFetch(`${apiUrl("views")}?orgid=${encodeURIComponent(orgid)}&username=${encodeURIComponent(username)}`);
      if (data && data.success && Array.isArray(data.views)) {
        const merged = [];
        const seenIds = new Set();
        for (const view of [...data.views, ...loadStoredSavedViews()]) {
          if (seenIds.has(view.view_id)) continue;
          seenIds.add(view.view_id);
          merged.push(view);
        }
        setSavedViews(merged);
        persistSavedViewsLocal(merged);
      }
    } catch (error) { }
  }, [orgid, username, apiFetch]);

  const loadSourceStatus = useCallback(async () => {
    try {
      const data = await apiFetch(apiUrl("sourceStatus"));
      if (data && data.success && Array.isArray(data.sources)) {
        setSourceStatus(data.sources);
        setSourceStatusError(null);
      } else {
        setSourceStatusError((data && data.message) || "The source status could not be loaded.");
      }
    } catch (error) {
      setSourceStatusError(`The source status could not be loaded because of the error "${errorText(error)}".`);
    }
  }, [apiFetch]);

  const fetchRiskDataSources = useCallback(async () => {
    try {
      const data = await apiFetch(apiUrl("sources"));
      if (data && data.success) setRiskDataSources(data.sources || []);
    } catch (error) { }
  }, [apiFetch]);

  useEffect(() => {
    if (authLoading || !token) return;
    fetchAreas();
    fetchSavedViewsFromBackend();
    fetchRiskDataSources();
  }, [authLoading, token, fetchAreas, fetchSavedViewsFromBackend, fetchRiskDataSources]);

  useEffect(() => {
    if (authLoading || !token) return undefined;
    loadSourceStatus();
    const timer = setInterval(loadSourceStatus, SOURCES.refresh.sourceStatusMs);
    return () => clearInterval(timer);
  }, [authLoading, token, loadSourceStatus]);

  const soundsEnabledRef = useRef(false);

  const areaSignature = areas.map((area) => `${area.area_id}:${area.updated_at || ""}`).join("|");

  useEffect(() => {
    if (authLoading || !token) return undefined;
    loadHazards();
    if (!autoRefresh) return undefined;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" || soundsEnabledRef.current) loadHazards();
    }, refreshInterval);
    return () => clearInterval(timer);
  }, [authLoading, token, areaSignature, autoRefresh, refreshInterval, loadHazards]);

  useEffect(() => {
    if (authLoading || !token || !orgid) return undefined;
    const params = new URLSearchParams({ orgid, snapshot: "1" });
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
      liveSource.close();
      setLiveConnected(false);
    };
  }, [authLoading, token, orgid, applyLiveDelta, flushStreamingData, removeRisksFromStreamingData]);

  const allRisks = useMemo(() => flattenRiskData(riskIntelligenceData), [riskIntelligenceData]);

  const userArea = useMemo(() => areas.find((area) => area.area_id === selectedAreaId) || null, [areas, selectedAreaId]);
  const activeAreas = areaFilterActive && areas.length ? areas : null;

  const localScope = useMemo(() => {
    if (areaFilterActive && userArea) {
      const shape = areaShape(userArea);
      const radius = userArea.mode === "point_radius" ? userArea.radius_km : Math.ceil(haversine(shape.centerLat, shape.centerLng, userArea.max_lat, userArea.max_lng) / 1000);
      return { lat: shape.centerLat, lon: shape.centerLng, radius: Math.max(1, Math.round(radius)), label: describeArea(userArea), area: true };
    }
    if (locationActive) return { lat: selectedLat, lon: selectedLon, radius: areaRadius, label: locationName, area: false };
    return null;
  }, [areaFilterActive, userArea, locationActive, selectedLat, selectedLon, areaRadius, locationName]);

  useEffect(() => {
    locationRef.current = localScope ? { lat: localScope.lat, lon: localScope.lon, radius: localScope.radius } : null;
  }, [localScope]);
  const activeAreasLabel = activeAreas ? (activeAreas.length === 1 ? describeArea(activeAreas[0]) : `My ${activeAreas.length} Areas`) : null;
  const activeUnionRings = useMemo(() => (areaFilterActive && areas.length ? areaUnionRings(areas) : []), [areaFilterActive, areas]);
  const riskInActiveAreas = useCallback((risk) => Boolean(activeAreas) && activeAreas.some((area) => riskInArea(risk, area)), [activeAreas]);

  const severityRisks = useMemo(() => allRisks.filter((risk) => riskPassesSeverity(risk, severityFilter)), [allRisks, severityFilter]);

  const scopedRisks = useMemo(() => {
    const list = activeAreas
      ? severityRisks.filter(riskInActiveAreas)
      : locationActive ? severityRisks.filter((risk) => riskNearPoint(risk, selectedLat, selectedLon, areaRadius)) : severityRisks;
    return list.slice().sort((a, b) => (SEVERITY_ORDER[b.severity] || 0) - (SEVERITY_ORDER[a.severity] || 0) || String(b.event_time || "").localeCompare(String(a.event_time || "")));
  }, [severityRisks, activeAreas, riskInActiveAreas, locationActive, selectedLat, selectedLon, areaRadius]);

  const scopedSummary = useMemo(() => summarizeRisks(scopedRisks), [scopedRisks]);

  const mapRisks = useMemo(() => (activeAreas ? scopedRisks : severityRisks).filter((risk) => riskLayersVisible[categorizeRisk(risk)] && (risk.latitude != null || riskRings(risk).length)), [activeAreas, scopedRisks, severityRisks, riskLayersVisible]);

  const risksInView = useMemo(() => (activeAreas ? mapRisks : mapRisks.filter((risk) => riskInBounds(risk, viewState.bounds))), [mapRisks, activeAreas, viewState]);

  const categoryCounts = useMemo(() => {
    const counts = {};
    for (const category of RISK_INTELLIGENCE_CATEGORIES) counts[category.id] = 0;
    for (const risk of scopedRisks) counts[categorizeRisk(risk)] = (counts[categorizeRisk(risk)] || 0) + 1;
    return counts;
  }, [scopedRisks]);

  const categoriesWithoutData = useMemo(() => {
    const missing = new Set();
    if (!sourceStatus.length) return missing;
    const byCategory = new Map();
    for (const source of sourceStatus) {
      for (const category of source.categories || []) {
        if (!byCategory.has(category)) byCategory.set(category, []);
        byCategory.get(category).push(source);
      }
    }
    for (const category of Object.keys(EMPTY_RISK_DATA)) {
      const sources = byCategory.get(category) || [];
      if (!sources.length || sources.every((source) => !source.last_success_at)) missing.add(category);
    }
    return missing;
  }, [sourceStatus]);

  const areaRiskCounts = useMemo(() => {
    const counts = {};
    for (const area of areas) {
      const inside = severityRisks.filter((risk) => riskInArea(risk, area));
      const top = PRIORITY_OPTIONS.find((severity) => inside.some((risk) => risk.severity === severity)) || null;
      counts[area.area_id] = { total: inside.length, critical: inside.filter((risk) => risk.severity === "Critical").length, top };
    }
    return counts;
  }, [areas, severityRisks]);

  const selectedAreaHazards = useMemo(() => computeAreaHazards(userArea, severityRisks), [userArea, severityRisks]);

  const criticalRisks = useMemo(() => scopedRisks.filter((risk) => risk.severity === "Critical"), [scopedRisks]);

  const bellIds = useMemo(() => new Set(scopedRisks.map((risk) => risk.id)), [scopedRisks]);
  const soundInScope = (risk) => bellIds.has(risk.id);
  const soundScopeKey = useMemo(() => scopedRisks.map((risk) => risk.id).join("|"), [scopedRisks]);

  const sounds = useAlertSounds({
    defaults: SOURCES.sounds.defaults,
    ready: stateRestored && areasLoaded && hazardsLoaded && snapshotLoaded,
    items: hazardsLoaded ? allRisks : null,
    inScope: soundInScope,
    scopeKey: soundScopeKey,
    ignoreLevel: true,
    getKey: riskSoundKey,
    getLevel: riskSoundLevel,
    getId: riskIdentity,
    describe: riskSoundMessage,
    repeatMs: SOURCES.sounds.repeatGapSeconds * 1000,
    aheadSeconds: SOURCES.sounds.scheduleAheadSeconds,
    topUpMs: SOURCES.sounds.topUpSeconds * 1000
  });

  useEffect(() => {
    soundsEnabledRef.current = sounds.settings.enabled;
  }, [sounds.settings.enabled]);

  const [ackOpen, setAckOpen] = useState(false);
  const [ackReview, setAckReview] = useState(false);
  const [ackIndex, setAckIndex] = useState(0);
  const [ackAnalyses, setAckAnalyses] = useState({});
  const ackQueue = sounds.queue;
  const ackLengthRef = useRef(0);
  const ackRequestedRef = useRef(new Set());

  useEffect(() => {
    if (ackQueue.length > ackLengthRef.current && !ackReview) {
      setAckOpen(true);
      setAckIndex(ackLengthRef.current);
    }
    if (!ackQueue.length && !ackReview) setAckOpen(false);
    ackLengthRef.current = ackQueue.length;
  }, [ackQueue, ackReview]);

  useEffect(() => {
    for (const entry of ackQueue) {
      if (entry.ended || !entry.item || !entry.item.id || ackRequestedRef.current.has(entry.key)) continue;
      ackRequestedRef.current.add(entry.key);
      setAckAnalyses((current) => ({ ...current, [entry.key]: { loading: true } }));
      fetchApi("alertAnalysis", { id: entry.item.id, orgid })
        .then((data) => setAckAnalyses((current) => ({ ...current, [entry.key]: { data: data.analysis } })))
        .catch((error) => setAckAnalyses((current) => ({ ...current, [entry.key]: { error: errorText(error) } })));
    }
  }, [ackQueue, orgid]);

  const [ackHistory, setAckHistory] = useState([]);

  useEffect(() => {
    if (!ackQueue.length) return;
    setAckHistory((current) => {
      const known = new Set(current.map((entry) => entry.key));
      const added = ackQueue.filter((entry) => !known.has(entry.key));
      if (!added.length) return current;
      return [...added, ...current].slice(0, 200);
    });
  }, [ackQueue]);

  const ackPendingKeys = useMemo(() => new Set(ackQueue.map((entry) => entry.key)), [ackQueue]);
  const ackReviewList = useMemo(() => {
    const source = activeAreas ? (allRisks || []).filter(riskInActiveAreas) : allRisks || [];
    const live = source.map((item) => ({ key: riskSoundKey(item), id: riskIdentity(item), item, level: riskSoundLevel(item) || ALERT_SOUND_LEVELS[0], ended: false, updated: false, at: Date.now(), message: riskSoundMessage(item, false) }));
    const known = new Set(live.map((entry) => entry.key));
    return [...live, ...ackHistory.filter((entry) => !known.has(entry.key) && (!activeAreas || riskInActiveAreas(entry.item)))];
  }, [allRisks, ackHistory, activeAreas, riskInActiveAreas]);
  const ackList = ackReview ? ackReviewList : ackQueue;

  useEffect(() => {
    setAckIndex((index) => Math.max(0, Math.min(index, ackList.length - 1)));
  }, [ackList]);

  const closeAckModal = useCallback(() => {
    setAckOpen(false);
    setAckReview(false);
  }, []);

  const openAckReview = useCallback(() => {
    setAckReview(true);
    setAckOpen(true);
    setAckIndex(0);
  }, []);

  const ackEntry = ackOpen && ackList.length ? ackList[Math.min(ackIndex, ackList.length - 1)] : null;

  useEffect(() => {
    if (!stateRestored || !areas.length) return;
    if (!selectedAreaId || !areas.some((area) => area.area_id === selectedAreaId)) setSelectedAreaId(areas[0].area_id);
  }, [stateRestored, areas, selectedAreaId]);

  const saveStateDebounceRef = useRef(null);
  const replaceSoundSettings = sounds.replaceSettings;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await loadStateFromDB();
      if (cancelled) return;
      if (saved) {
        const pick = (key, setter, check) => {
          if (saved[key] !== undefined && saved[key] !== null && (!check || check(saved[key]))) setter(saved[key]);
        };
        const inOptions = (options) => (value) => options.some(([option]) => option === value);
        pick("activeTab", setActiveTab, (value) => typeof value === "string");
        pick("autoRefresh", setAutoRefresh, (value) => typeof value === "boolean");
        pick("refreshInterval", setRefreshInterval, inOptions(REFRESH_INTERVAL_OPTIONS));
        pick("riskLayersVisible", (value) => setRiskLayersVisible({ ...DEFAULT_RISK_LAYERS, ...value }), (value) => typeof value === "object");
        pick("severityFilter", setSeverityFilter, inOptions(SEVERITY_FILTER_OPTIONS));
        pick("showSatellite", setShowSatellite, (value) => typeof value === "boolean");
        pick("showHeatmap", setShowHeatmap, (value) => typeof value === "boolean");
        pick("showVisibilityBadges", setShowVisibilityBadges, (value) => typeof value === "boolean");
        pick("customLocationLabel", setCustomLocationLabel, (value) => typeof value === "object");
        pick("selectedLocation", setSelectedLocation, (value) => typeof value === "string");
        pick("areaRadius", setAreaRadius, inOptions(AREA_RADIUS_OPTIONS));
        pick("layoutVisibility", (value) => setLayoutVisibility((current) => ({ ...current, ...value })), (value) => typeof value === "object");
        pick("expandedWarnings", setExpandedWarnings, (value) => typeof value === "object");
        pick("selectedAreaId", setSelectedAreaId, (value) => typeof value === "string");
        pick("areaFilterActive", setAreaFilterActive, (value) => typeof value === "boolean");
        pick("assessmentViewState", (value) => setAssessmentViewState({ ...DEFAULT_ASSESSMENT_VIEW, ...value }), (value) => typeof value === "object");
        pick("sounds", replaceSoundSettings, (value) => typeof value === "object");
        if (saved.camera && Number.isFinite(saved.camera.lat) && Number.isFinite(saved.camera.lon) && Number.isFinite(saved.camera.zoom)) pendingCameraRef.current = saved.camera;
      }
      setStateRestored(true);
      window.setTimeout(() => {
        if (sessionStorage.getItem(SOURCES.persistence.restoreFlag) === PAGE_LOAD_ID) sessionStorage.removeItem(SOURCES.persistence.restoreFlag);
      }, SOURCES.persistence.restoreSettleMs);
    })();
    return () => {
      cancelled = true;
    };
  }, [replaceSoundSettings]);

  useEffect(() => {
    if (!stateRestored) return undefined;
    if (saveStateDebounceRef.current) clearTimeout(saveStateDebounceRef.current);
    saveStateDebounceRef.current = setTimeout(() => {
      saveStateToDB({
        activeTab,
        autoRefresh,
        refreshInterval,
        riskLayersVisible,
        severityFilter,
        showSatellite,
        showHeatmap,
        showVisibilityBadges,
        selectedLocation,
        customLocationLabel,
        areaRadius,
        layoutVisibility,
        expandedWarnings,
        selectedAreaId,
        areaFilterActive,
        assessmentViewState,
        camera: { lat: viewState.lat, lon: viewState.lon, zoom: viewState.zoom },
        sounds: sounds.settings
      });
    }, SOURCES.persistence.saveDebounceMs);
    return () => clearTimeout(saveStateDebounceRef.current);
  }, [stateRestored, activeTab, autoRefresh, refreshInterval, riskLayersVisible, severityFilter, showSatellite, showHeatmap, showVisibilityBadges, selectedLocation, customLocationLabel, areaRadius, layoutVisibility, expandedWarnings, selectedAreaId, areaFilterActive, assessmentViewState, viewState.lat, viewState.lon, viewState.zoom, sounds.settings]);

  const getVisibleBounds = useCallback(() => {
    const bounds = viewRef.current ? viewRef.current.bounds : null;
    if (!bounds) return null;
    return { min_lat: Math.max(-90, bounds.south), max_lat: Math.min(90, bounds.north), min_lng: Math.max(-180, bounds.west), max_lng: Math.min(180, bounds.east) };
  }, []);

  const switchToProvider = useCallback((targetProvider, lat, lng, zoom, pitch, bearing) => {
    if (switchingProviderRef.current || mapProviderRef.current === targetProvider) return;
    switchingProviderRef.current = true;
    mapProviderRef.current = targetProvider;
    setActiveProvider(targetProvider);
    if (targetProvider === MAP_PROVIDER_APPLE) {
      if (appleMapRef.current && window.mapkit) {
        const span = 360 / Math.pow(2, zoom);
        appleMapRef.current.setRegionAnimated(new window.mapkit.CoordinateRegion(new window.mapkit.Coordinate(lat, lng), new window.mapkit.CoordinateSpan(span, span)), false);
        appleMapRef.current.rotation = bearing;
      }
      if (appleMapContainerRef.current) appleMapContainerRef.current.style.display = "block";
      if (deckglMapContainerRef.current) deckglMapContainerRef.current.style.display = "none";
    } else {
      if (deckglMapRef.current) {
        deckglMapRef.current.jumpTo({ center: [lng, lat], zoom, pitch, bearing });
        deckglMapRef.current.resize();
      }
      if (appleMapContainerRef.current) appleMapContainerRef.current.style.display = "none";
      if (deckglMapContainerRef.current) deckglMapContainerRef.current.style.display = "block";
    }
    setHoverInfo(null);
    setTimeout(() => {
      switchingProviderRef.current = false;
      if (targetProvider === MAP_PROVIDER_DECKGL && deckglMapRef.current) deckglMapRef.current.resize();
      setDeckLayersVersion((value) => value + 1);
    }, 300);
  }, []);

  const navigateTo = useCallback((lon, lat, zoom) => {
    const useApple = zoom >= SOURCES.map.appleZoomThreshold && appleMapReadyRef.current && !showHeatmapRef.current;
    if (useApple) {
      if (mapProviderRef.current !== MAP_PROVIDER_APPLE) switchToProvider(MAP_PROVIDER_APPLE, lat, lon, zoom, 0, 0);
      else if (appleMapRef.current && window.mapkit) {
        const span = 360 / Math.pow(2, zoom);
        appleMapRef.current.setRegionAnimated(new window.mapkit.CoordinateRegion(new window.mapkit.Coordinate(lat, lon), new window.mapkit.CoordinateSpan(span, span)), true);
      }
      return;
    }
    if (mapProviderRef.current !== MAP_PROVIDER_DECKGL) switchToProvider(MAP_PROVIDER_DECKGL, lat, lon, Math.min(zoom, SOURCES.map.deckMaxZoom), 0, 0);
    if (deckglMapRef.current) deckglMapRef.current.flyTo({ center: [lon, lat], zoom, bearing: 0, pitch: 0, speed: 1.4 });
  }, [switchToProvider]);

  const fitBox = useCallback((bbox) => {
    const [west, south, east, north] = bbox;
    const span = Math.max(north - south, (east - west) * Math.cos((((north + south) / 2) * Math.PI) / 180), 0.0005);
    const zoom = Math.max(1, Math.min(18, Math.log2(360 / (span * 1.6))));
    navigateTo((west + east) / 2, (south + north) / 2, zoom);
  }, [navigateTo]);

  const flyToArea = useCallback((area) => {
    if (!area) return;
    if (area.mode === "point_radius") navigateTo(area.longitude, area.latitude, areaZoom(area));
    else fitBox([area.min_lng, area.min_lat, area.max_lng, area.max_lat]);
  }, [navigateTo, fitBox]);

  const handleAreaFormChange = useCallback((field, value) => setAreaFormData((prev) => ({ ...prev, [field]: value })), []);

  const openAreaModal = useCallback((area) => {
    setEditingAreaId(area ? area.area_id : null);
    if (area && area.mode === "point_radius") {
      setAreaFormData({ ...INITIAL_AREA_FORM, mode: "point_radius", name: area.name || "", address: area.address || "", latitude: area.latitude.toString(), longitude: area.longitude.toString(), radius_km: area.radius_km.toString() });
    } else if (area && area.mode === "bbox") {
      setAreaFormData({ ...INITIAL_AREA_FORM, mode: "bbox", name: area.name || "", min_lat: area.min_lat.toString(), max_lat: area.max_lat.toString(), min_lng: area.min_lng.toString(), max_lng: area.max_lng.toString() });
    } else {
      setAreaFormData({ ...INITIAL_AREA_FORM });
    }
    setAreaModalOpen(true);
  }, []);

  const handleGeocodeArea = useCallback(async () => {
    const query = (areaFormData.address || "").trim();
    if (!query) {
      showNotification("Enter an address to geocode.", "error");
      return;
    }
    setIsGeocodingArea(true);
    try {
      const response = await fetch(`${SOURCES.geocoding.nominatim}?format=json&q=${encodeURIComponent(query)}&limit=1&addressdetails=1`, { headers: { "User-Agent": SOURCES.geocoding.userAgent } });
      if (!response.ok) throw new Error("The geocoding service returned an error.");
      const results = await response.json();
      if (!results.length) {
        showNotification("The address was not found. Try a more specific query.", "error");
        return;
      }
      const place = results[0];
      const lat = parseFloat(place.lat);
      const lng = parseFloat(place.lon);
      const address = place.address || {};
      const friendlyName = address.city || address.town || address.village || address.county || (place.display_name ? place.display_name.split(",")[0] : "") || query;
      setAreaFormData((prev) => ({ ...prev, latitude: lat.toFixed(6), longitude: lng.toFixed(6), name: prev.name && prev.name.trim() ? prev.name : friendlyName }));
      showNotification(`The address was geocoded to ${place.display_name ? place.display_name.substring(0, 80) : `${lat}, ${lng}`}.`);
    } catch (error) {
      showNotification("The address could not be geocoded. Check your network.", "error");
    } finally {
      setIsGeocodingArea(false);
    }
  }, [areaFormData.address, showNotification]);

  const useMapCenterForArea = useCallback(() => {
    setAreaFormData((prev) => ({ ...prev, latitude: viewState.lat.toFixed(6), longitude: viewState.lon.toFixed(6) }));
  }, [viewState.lat, viewState.lon]);

  const useMapViewForArea = useCallback(() => {
    const bounds = getVisibleBounds();
    if (!bounds) {
      showNotification("The map bounds are not available yet.", "error");
      return;
    }
    setAreaFormData((prev) => ({ ...prev, min_lat: bounds.min_lat.toFixed(6), max_lat: bounds.max_lat.toFixed(6), min_lng: bounds.min_lng.toFixed(6), max_lng: bounds.max_lng.toFixed(6) }));
  }, [getVisibleBounds, showNotification]);

  const saveAreaToBackend = useCallback(async (area, areaId) => {
    if (!orgid || !username || !area) return null;
    try {
      const url = areaId ? `${apiUrl("areas")}/${encodeURIComponent(areaId)}` : apiUrl("areas");
      const { status, data } = await apiFetchWithStatus(url, { method: areaId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgid, username, ...area, filter_active: true }) });
      if ((status !== 200 && status !== 201) || !data || !data.success) {
        showNotification((data && data.message) || "The monitored area could not be saved.", "error");
        return null;
      }
      return data.area;
    } catch (error) {
      showNotification("A network error prevented saving the monitored area.", "error");
      return null;
    }
  }, [orgid, username, apiFetchWithStatus, showNotification]);

  const deleteAreaFromBackend = useCallback(async (areaId) => {
    if (!orgid || !username || !areaId) return false;
    try {
      const data = await apiFetch(`${apiUrl("areas")}/${encodeURIComponent(areaId)}?orgid=${encodeURIComponent(orgid)}&username=${encodeURIComponent(username)}`, { method: "DELETE" });
      return Boolean(data && data.success);
    } catch (error) {
      return false;
    }
  }, [orgid, username, apiFetch]);

  const handleSaveArea = useCallback(async (activateImmediately = true) => {
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
      area = { mode: "point_radius", name: (areaFormData.name || "").trim(), address: (areaFormData.address || "").trim(), latitude: lat, longitude: lng, radius_km: radius };
    } else if (areaFormData.mode === "bbox") {
      const minLat = parseFloat(areaFormData.min_lat);
      const maxLat = parseFloat(areaFormData.max_lat);
      const minLng = parseFloat(areaFormData.min_lng);
      const maxLng = parseFloat(areaFormData.max_lng);
      if ([minLat, maxLat, minLng, maxLng].some((value) => isNaN(value))) {
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
      area = { mode: "bbox", name: (areaFormData.name || "").trim(), min_lat: minLat, max_lat: maxLat, min_lng: minLng, max_lng: maxLng };
    }
    if (!area) return;
    const saved = await saveAreaToBackend(area, editingAreaId);
    if (!saved) return;
    setAreas((prev) => (editingAreaId ? prev.map((item) => (item.area_id === saved.area_id ? saved : item)) : [...prev, saved]));
    setSelectedAreaId(saved.area_id);
    if (activateImmediately) setAreaFilterActive(true);
    setAreaModalOpen(false);
    setEditingAreaId(null);
    showNotification(`The monitored area ${describeArea(saved)} was saved.`);
    setTimeout(() => flyToArea(saved), 100);
  }, [areaFormData, editingAreaId, showNotification, saveAreaToBackend, flyToArea]);

  const deleteArea = useCallback(async (areaId) => {
    if (!areaId) return;
    const deleted = await deleteAreaFromBackend(areaId);
    if (!deleted) {
      showNotification("The monitored area could not be deleted.", "error");
      return;
    }
    setAreas((prev) => {
      const remaining = prev.filter((area) => area.area_id !== areaId);
      setSelectedAreaId((current) => (current === areaId ? (remaining[0] ? remaining[0].area_id : null) : current));
      return remaining;
    });
    setAreaModalOpen(false);
    setEditingAreaId(null);
    showNotification("The monitored area was deleted.");
  }, [showNotification, deleteAreaFromBackend]);

  const selectArea = useCallback((area) => {
    setSelectedAreaId(area.area_id);
    flyToArea(area);
  }, [flyToArea]);

  const toggleAreaFilter = useCallback(() => {
    if (!userArea) {
      showNotification("Add a monitored area first.", "error");
      openAreaModal(null);
      return;
    }
    const willActivate = !areaFilterActive;
    setAreaFilterActive(willActivate);
    if (!willActivate) return;
    if (areas.length === 1) {
      flyToArea(areas[0]);
      return;
    }
    const rings = areas.map((area) => areaShape(area).ring);
    const lons = rings.flat().map((point) => point[0]);
    const lats = rings.flat().map((point) => point[1]);
    fitBox([Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)]);
  }, [userArea, areas, areaFilterActive, openAreaModal, showNotification, flyToArea, fitBox]);

  const requestAssessment = useCallback(async (latitude, longitude, radiusKm) => {
    const { status, data } = await apiFetchWithStatus(apiUrl("assessLocation"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latitude, longitude, radius_km: radiusKm, orgid, categories: ["earthquakes", "wildfires", "weather", "floods", "volcanoes", "ground_deformation"] })
    });
    if (!data || !data.success) throw new Error((data && data.message) || `The assessment request failed with status ${status}.`);
    return data;
  }, [apiFetchWithStatus, orgid]);

  const assessLocationRisk = useCallback(async (latitude, longitude, radiusKm = 100) => {
    setIsAssessingLocation(true);
    try {
      const data = await requestAssessment(latitude, longitude, radiusKm);
      setAssessmentModal(data);
    } catch (error) {
      showNotification(`The location risk could not be assessed because of the error "${errorText(error)}".`, "error");
    } finally {
      setIsAssessingLocation(false);
    }
  }, [requestAssessment, showNotification]);

  const loadLocalAssessment = useCallback(async () => {
    const location = locationRef.current;
    if (!location) {
      setLocalAssessment(null);
      return;
    }
    try {
      const data = await requestAssessment(location.lat, location.lon, location.radius);
      setLocalAssessment(data);
      setLocalAssessmentError(null);
    } catch (error) {
      setLocalAssessmentError(`The local risk assessment could not be loaded because of the error "${errorText(error)}".`);
    }
  }, [requestAssessment]);

  useEffect(() => {
    if (authLoading || !token) return undefined;
    setLocalAssessment(null);
    setLocalAssessmentError(null);
    if (!localScope) return undefined;
    loadLocalAssessment();
    const timer = setInterval(loadLocalAssessment, SOURCES.refresh.assessmentMs);
    return () => clearInterval(timer);
  }, [authLoading, token, localScope, loadLocalAssessment]);

  const fetchNearbyRisks = useCallback(async (params = {}) => {
    if (nearbyStreamRef.current) {
      nearbyStreamRef.current.close();
      nearbyStreamRef.current = null;
    }
    setIsLoadingNearby(true);
    setNearbyRisks(null);
    const qp = new URLSearchParams();
    const paramMapping = { latitude: "lat", longitude: "lng", radius_km: "radius_km", category: "category", severity: "severity", source: "source", limit: "limit" };
    Object.entries(paramMapping).forEach(([key, name]) => {
      if (params[key]) qp.append(name, params[key].toString());
    });
    if (orgid) qp.append("orgid", orgid);
    return new Promise((resolve) => {
      const collected = [];
      const severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
      const evtSource = new EventSource(`${apiUrl("nearby")}?${qp}`);
      nearbyStreamRef.current = evtSource;
      evtSource.addEventListener("nearby_data", (event) => {
        try {
          const payload = JSON.parse(event.data);
          const batch = payload.batch || [];
          collected.push(...batch);
          for (const risk of batch) {
            const key = String(risk.severity || "Low").toLowerCase();
            if (severityCounts[key] !== undefined) severityCounts[key] += 1;
          }
          setNearbyRisks({ total_count: payload.total_available || collected.length, risks: [...collected], by_severity: { ...severityCounts }, streaming: true });
        } catch (error) {
          return;
        }
      });
      evtSource.addEventListener("stream_completed", () => {
        setIsLoadingNearby(false);
        evtSource.close();
        nearbyStreamRef.current = null;
        const result = { total_count: collected.length, risks: collected, by_severity: severityCounts };
        setNearbyRisks(result);
        resolve(result);
      });
      evtSource.addEventListener("stream_error", (event) => {
        let message = "The nearby risks could not be fetched.";
        try {
          message = JSON.parse(event.data).message || message;
        } catch (error) {
          message = "The nearby risks could not be fetched.";
        }
        showNotification(message, "error");
        setIsLoadingNearby(false);
        evtSource.close();
        nearbyStreamRef.current = null;
        resolve(null);
      });
      evtSource.onerror = () => {
        setIsLoadingNearby(false);
        if (evtSource.readyState === EventSource.CONNECTING) return;
        evtSource.close();
        nearbyStreamRef.current = null;
        if (!collected.length) {
          showNotification("The streaming connection for nearby risks failed.", "error");
          resolve(null);
        } else {
          resolve({ total_count: collected.length, risks: collected, by_severity: severityCounts });
        }
      };
    });
  }, [showNotification, orgid]);

  const openNearbyQueryModal = useCallback((lat = null, lng = null, radiusKm = null) => {
    setNearbyFormData({ ...INITIAL_NEARBY_FORM, ...(lat != null && lng != null ? { latitude: Number(lat).toFixed(6), longitude: Number(lng).toFixed(6) } : {}), ...(radiusKm ? { radius_km: String(radiusKm) } : {}) });
    setNearbyRisks(null);
    setNearbyModalOpen(true);
  }, []);

  const handleNearbyFormChange = useCallback((field, value) => setNearbyFormData((prev) => ({ ...prev, [field]: value })), []);

  const handleNearbyQuerySubmit = useCallback((event) => {
    event.preventDefault();
    if (!nearbyFormData.latitude || !nearbyFormData.longitude) {
      showNotification("Latitude and longitude are required for a nearby query.", "error");
      return;
    }
    fetchNearbyRisks({
      latitude: parseFloat(nearbyFormData.latitude),
      longitude: parseFloat(nearbyFormData.longitude),
      radius_km: parseFloat(nearbyFormData.radius_km) || 100,
      category: nearbyFormData.category || undefined,
      severity: nearbyFormData.severity || undefined,
      source: nearbyFormData.source || undefined,
      limit: parseInt(nearbyFormData.limit, 10)
    });
  }, [nearbyFormData, fetchNearbyRisks, showNotification]);

  useEffect(() => () => {
    if (nearbyStreamRef.current) nearbyStreamRef.current.close();
  }, []);

  const selectedRisk = useMemo(() => (selected && selected.kind === "risk" ? allRisks.find((risk) => risk.id === selected.id) || selected.snapshot || null : null), [selected, allRisks]);

  const clearSelectionOverlays = useCallback(() => {
    selectionGeoJsonRef.current = null;
    setDeckLayersVersion((value) => value + 1);
  }, []);

  const clearFeatureSelection = useCallback(() => {
    clearSelectionOverlays();
    setSelectedFeature(null);
    setFeatureMeasurements(null);
    setFeatureDetails(null);
    setSelectionError(null);
  }, [clearSelectionOverlays]);

  const clearSelection = useCallback(() => {
    setSelected(null);
    setBriefOpen(false);
    clearFeatureSelection();
  }, [clearFeatureSelection]);

  const selectRisk = useCallback((risk, focus) => {
    if (!risk) return;
    setSelected({ kind: "risk", id: risk.id, snapshot: risk });
    setBriefOpen(false);
    if (!focus) return;
    setActiveTab("map");
    const rings = riskRings(risk);
    if (risk.latitude != null && risk.longitude != null) navigateTo(risk.longitude, risk.latitude, Math.max(viewRef.current ? viewRef.current.zoom : 0, SOURCES.map.focusZoom - 3));
    else if (rings.length) {
      const points = rings.flat();
      fitBox([Math.min(...points.map((p) => p[0])), Math.min(...points.map((p) => p[1])), Math.max(...points.map((p) => p[0])), Math.max(...points.map((p) => p[1]))]);
    }
  }, [navigateTo, fitBox]);

  useEffect(() => {
    selectRiskRef.current = selectRisk;
    setHoverRef.current = setHoverInfo;
  }, [selectRisk]);

  const toggleRiskLayer = useCallback((id) => setRiskLayersVisible((prev) => ({ ...prev, [id]: !prev[id] })), []);
  const toggleRiskSection = useCallback((section) => setExpandedRiskSections((prev) => ({ ...prev, [section]: !prev[section] })), []);

  const fetchReverseGeocode = useCallback(async (lat, lng) => {
    try {
      const r = await fetch(`${SOURCES.external.nominatimReverse}?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&extratags=1&namedetails=1`, { headers: { "User-Agent": SOURCES.external.userAgent } });
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
        const parts = tag.split(":");
        lang = parts[0];
        title = parts.slice(1).join(":");
      }
      const r = await fetch(`${SOURCES.external.wikipediaSummary.replace("{lang}", lang)}${encodeURIComponent(title)}`, { headers: { "User-Agent": SOURCES.external.userAgent } });
      if (!r.ok) return null;
      const d = await r.json();
      return { title: d.title, extract: d.extract, description: d.description, thumbnail: d.thumbnail ? d.thumbnail.source : null, url: d.content_urls && d.content_urls.desktop ? d.content_urls.desktop.page : null };
    } catch (error) {
      return null;
    }
  }, []);

  const fetchElevation = useCallback(async (lat, lng) => {
    try {
      const r = await fetch(`${SOURCES.external.openElevation}?locations=${lat},${lng}`);
      if (!r.ok) return null;
      const data = await r.json();
      return data.results && data.results[0] ? data.results[0].elevation : null;
    } catch (error) {
      return null;
    }
  }, []);

  const fetchNearbyPOIs = useCallback(async (lat, lng, radius = 200) => {
    try {
      const data = await overpassFetch(`[out:json][timeout:10];(node["amenity"](around:${radius},${lat},${lng});node["shop"](around:${radius},${lat},${lng});node["tourism"](around:${radius},${lat},${lng});node["public_transport"](around:${radius},${lat},${lng});node["highway"="bus_stop"](around:${radius},${lat},${lng});node["railway"="station"](around:${radius},${lat},${lng});node["railway"="tram_stop"](around:${radius},${lat},${lng}););out body 50;`);
      if (!data) return [];
      return (data.elements || []).map((el) => ({ type: el.tags?.amenity || el.tags?.shop || el.tags?.tourism || el.tags?.public_transport || el.tags?.highway || el.tags?.railway, name: el.tags?.name, distance: haversine(lat, lng, el.lat, el.lon) })).filter((p) => p.type).sort((a, b) => a.distance - b.distance).slice(0, 15);
    } catch (error) {
      return [];
    }
  }, []);

  const fetchNearbyStreets = useCallback(async (lat, lng, radius = 100) => {
    try {
      const data = await overpassFetch(`[out:json][timeout:10];way["highway"](around:${radius},${lat},${lng});out tags 20;`);
      if (!data) return [];
      const seen = new Set();
      return (data.elements || []).filter((el) => el.tags?.name && !seen.has(el.tags.name) && seen.add(el.tags.name)).map((el) => ({ name: el.tags.name, type: el.tags.highway })).slice(0, 10);
    } catch (error) {
      return [];
    }
  }, []);

  const fetchAdminBoundaries = useCallback(async (lat, lng) => {
    try {
      const data = await overpassFetch(`[out:json][timeout:10];is_in(${lat},${lng})->.a;area.a["boundary"="administrative"];out tags;`);
      if (!data) return [];
      return (data.elements || []).map((el) => ({ name: el.tags?.name, level: el.tags?.admin_level, type: el.tags?.boundary, population: el.tags?.population })).filter((b) => b.name).sort((a, b) => (b.level || 0) - (a.level || 0));
    } catch (error) {
      return [];
    }
  }, []);

  const fetchLandUseContext = useCallback(async (lat, lng, radius = 300) => {
    try {
      const data = await overpassFetch(`[out:json][timeout:10];(way["landuse"](around:${radius},${lat},${lng});relation["landuse"](around:${radius},${lat},${lng});way["natural"](around:${radius},${lat},${lng});relation["natural"](around:${radius},${lat},${lng}););out tags 30;`);
      if (!data) return [];
      const counts = {};
      (data.elements || []).forEach((el) => {
        const type = el.tags?.landuse || el.tags?.natural;
        if (type) counts[type] = (counts[type] || 0) + 1;
      });
      return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([type, count]) => ({ type, count }));
    } catch (error) {
      return [];
    }
  }, []);

  const fetchFeatureDetails = useCallback(async (feature, centroid) => {
    setIsFetchingDetails(true);
    const tags = feature.tags || {};
    const address = {};
    [["housenumber", "addr:housenumber"], ["housename", "addr:housename"], ["street", "addr:street"], ["city", "addr:city"], ["state", "addr:state"], ["postcode", "addr:postcode"], ["country", "addr:country"]].forEach(([key, tag]) => {
      if (tags[tag]) address[key] = tags[tag];
    });
    const building = {};
    [["building:levels", "levels"], ["building:material", "material"], ["height", "height"], ["architect", "architect"], ["operator", "operator"], ["website", "website"], ["phone", "phone"], ["opening_hours", "hours"]].forEach(([tag, key]) => {
      if (tags[tag]) building[key] = tags[tag];
    });
    if (tags.building && tags.building !== "yes") building.buildingType = tags.building;
    const details = {
      address: Object.keys(address).length ? address : null,
      location: null,
      buildingInfo: Object.keys(building).length ? building : null,
      wikipediaInfo: null,
      elevationInfo: null,
      nearbyPOIs: [],
      nearbyStreets: [],
      adminBoundaries: [],
      landUseContext: [],
      geographicInfo: { timezone: getTimezoneFromCoords(centroid.lat, centroid.lng), climateZone: getClimateZone(centroid.lat), hemisphere: getHemisphere(centroid.lat, centroid.lng) }
    };
    await Promise.allSettled([
      fetchReverseGeocode(centroid.lat, centroid.lng).then((g) => {
        if (!g) return;
        details.location = { displayName: g.display_name, addressComponents: g.address || {} };
        if (!details.address && g.address) {
          const a = g.address;
          details.address = { housenumber: a.house_number, street: a.road, city: a.city || a.town || a.village, state: a.state, postcode: a.postcode, country: a.country };
        }
      }),
      tags.wikipedia ? fetchWikipediaExtract(tags.wikipedia).then((w) => { if (w) details.wikipediaInfo = w; }) : Promise.resolve(),
      fetchElevation(centroid.lat, centroid.lng).then((e) => { if (e !== null) details.elevationInfo = { groundElevation: e, elevationFeet: Math.round(e * 3.28084) }; }),
      fetchNearbyPOIs(centroid.lat, centroid.lng, 300).then((p) => { details.nearbyPOIs = p; }),
      fetchNearbyStreets(centroid.lat, centroid.lng, 150).then((s) => { details.nearbyStreets = s; }),
      fetchAdminBoundaries(centroid.lat, centroid.lng).then((b) => { details.adminBoundaries = b; }),
      fetchLandUseContext(centroid.lat, centroid.lng, 500).then((l) => { details.landUseContext = l; })
    ]);
    setIsFetchingDetails(false);
    setFeatureDetails(details);
  }, [fetchReverseGeocode, fetchWikipediaExtract, fetchElevation, fetchNearbyPOIs, fetchNearbyStreets, fetchAdminBoundaries, fetchLandUseContext]);

  const extractGeometry = useCallback((el) => {
    if (el.type === "way" && el.geometry) return el.geometry.map((p) => ({ lat: p.lat, lng: p.lon }));
    if (el.type === "relation" && el.members) {
      const outerMembers = el.members.filter((m) => m.role === "outer" && m.geometry);
      const geomMembers = outerMembers.length > 0 ? outerMembers : el.members.filter((m) => m.geometry);
      if (geomMembers.length === 0) return null;
      if (outerMembers.length === 0) {
        const coords = [];
        geomMembers.forEach((m) => m.geometry.forEach((p) => coords.push({ lat: p.lat, lng: p.lon })));
        return coords;
      }
      const segments = geomMembers.map((m) => m.geometry.map((p) => ({ lat: p.lat, lng: p.lon })));
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
          if (dS < bestDist) {
            bestDist = dS;
            bestIdx = i;
            bestReverse = false;
          }
          if (dE < bestDist) {
            bestDist = dE;
            bestIdx = i;
            bestReverse = true;
          }
        }
        if (bestIdx === -1) break;
        used.add(bestIdx);
        assembled.push(...(bestReverse ? [...segments[bestIdx]].reverse() : segments[bestIdx]));
      }
      return assembled;
    }
    return null;
  }, []);

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
      filters = ["building", "man_made", "amenity", "shop", "tourism", "historic", "leisure", "landuse", "natural", "barrier"].map((t) => `way["${t}"]${around};`).join("") + `way["highway"]["area"="yes"]${around};relation["building"]${around};relation["landuse"]${around};`;
    } else if (zoom >= 15) {
      filters = ["building", "man_made", "amenity", "shop", "leisure", "landuse", "natural"].map((t) => `way["${t}"]${around};`).join("") + `relation["building"]${around};relation["landuse"]${around};`;
    } else if (zoom >= 12) {
      filters = ["building", "landuse", "leisure", "man_made"].map((t) => `way["${t}"]${around};`).join("") + `way["natural"~"water|wood|scrub|wetland|beach|glacier"]${around};relation["building"]${around};relation["landuse"]${around};relation["natural"]${around};`;
    } else if (zoom >= 8) {
      filters = ["natural", "landuse", "leisure", "water"].map((t) => `way["${t}"]${around};relation["${t}"]${around};`).join("") + `relation["place"]${around};`;
    } else {
      filters = `relation["natural"~"mountain_range|volcano|glacier|water|bay"]${around};relation["place"~"island|islet|archipelago"]${around};relation["water"]${around};relation["boundary"~"national_park|protected_area"]${around};way["natural"~"mountain_range|volcano|glacier|water|bay"]${around};`;
    }
    return `[out:json][timeout:25];(${filters});out body geom;`;
  }, []);

  const queryFeatureAtPoint = useCallback(async (lat, lng, zoom) => {
    setIsSelectingFeature(true);
    setSelectionError(null);
    clearFeatureSelection();
    setSelected(null);
    try {
      const data = await overpassFetch(buildOverpassQuery(lat, lng, getQueryRadius(zoom), zoom), { timeoutMs: 15000, maxAttempts: 3 });
      if (!data) throw new Error("All Overpass mirrors failed or timed out. Try again or zoom in for a smaller query.");
      if (!data.elements || !data.elements.length) throw new Error("No selectable feature was found here. Try zooming in closer.");
      const clickPoint = { lat, lng };
      const features = data.elements.map((el) => {
        const geom = extractGeometry(el);
        if (!geom || geom.length < 3) return null;
        const centroid = getCentroid(geom);
        return { id: el.id, osmType: el.type, tags: el.tags || {}, geometry: geom, area: calculatePolygonArea(geom), centroid, isInside: pointInPolygon(clickPoint, geom), edgeDist: distanceToPolygon(clickPoint, geom) };
      }).filter(Boolean);
      if (!features.length) throw new Error("No geometry was found for nearby features.");
      features.sort((a, b) => {
        if (a.isInside !== b.isInside) return a.isInside ? -1 : 1;
        if (a.isInside && b.isInside) return a.area - b.area;
        return (a.edgeDist + a.area * 0.00001) - (b.edgeDist + b.area * 0.00001);
      });
      const best = features[0];
      setSelectedFeature({ id: best.id, osmType: best.osmType, name: getFeatureName(best.tags), type: getFeatureType(best.tags), tags: best.tags, geometry: best.geometry, centroid: best.centroid });
      setFeatureMeasurements({ area: best.area, perimeter: calculatePerimeter(best.geometry), dimensions: calculateDetailedDimensions(best.geometry), vertexCount: best.geometry.length, centroid: best.centroid });
      setSelected({ kind: "feature", id: best.id });
      const ring = best.geometry.map((c) => [c.lng, c.lat]);
      if (ring.length && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) ring.push([...ring[0]]);
      selectionGeoJsonRef.current = { ring };
      setDeckLayersVersion((value) => value + 1);
      fetchFeatureDetails({ id: best.id, osmType: best.osmType, tags: best.tags }, best.centroid);
    } catch (error) {
      setSelectionError(error.name === "AbortError" ? "The query timed out. Zoom in for faster results." : errorText(error));
      setTimeout(() => setSelectionError(null), 5000);
    }
    setIsSelectingFeature(false);
  }, [getQueryRadius, buildOverpassQuery, extractGeometry, clearFeatureSelection, fetchFeatureDetails]);

  useEffect(() => {
    queryFeatureAtPointRef.current = queryFeatureAtPoint;
  }, [queryFeatureAtPoint]);

  const zoomToFeature = useCallback(() => {
    if (!selectedFeature || !selectedFeature.geometry) return;
    const bbox = calculateBoundingBox(selectedFeature.geometry);
    fitBox([bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat]);
  }, [selectedFeature, fitBox]);

  const updateViewFromDeck = useCallback(() => {
    const map = deckglMapRef.current;
    if (!map || mapProviderRef.current !== MAP_PROVIDER_DECKGL) return;
    const center = map.getCenter();
    const bounds = map.getBounds();
    setView({ lat: center.lat, lon: normalizeLon(center.lng), zoom: map.getZoom(), bounds: { west: bounds.getWest(), east: bounds.getEast(), south: bounds.getSouth(), north: bounds.getNorth() } });
  }, [setView]);

  const initDeckGlMap = useCallback(() => {
    const libs = libsRef.current;
    if (!deckglMapContainerRef.current || !libs) return null;
    const { maplibregl } = libs;
    const map = new maplibregl.Map({
      container: deckglMapContainerRef.current,
      style: {
        version: 8,
        sources: {
          "satellite-tiles": { type: "raster", tiles: [SOURCES.assets.satelliteTiles], tileSize: 256, maxzoom: 19, attribution: "Tiles Esri" },
          "labels-tiles": { type: "raster", tiles: [SOURCES.assets.labelTiles], tileSize: 256, maxzoom: 19 },
          "topo-tiles": { type: "raster", tiles: SOURCES.assets.topoTiles, tileSize: 256, maxzoom: 17, attribution: "OpenTopoMap" }
        },
        layers: [
          { id: "topo-layer", type: "raster", source: "topo-tiles", layout: { visibility: "none" } },
          { id: "satellite-layer", type: "raster", source: "satellite-tiles" },
          { id: "labels-layer", type: "raster", source: "labels-tiles", paint: { "raster-opacity": 0.9 } }
        ],
        glyphs: SOURCES.assets.glyphs
      },
      center: SOURCES.map.center,
      zoom: SOURCES.map.zoom,
      pitch: 0,
      bearing: 0,
      maxZoom: SOURCES.map.deckMaxZoom,
      minZoom: SOURCES.map.minZoom,
      antialias: true
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(new maplibregl.ScaleControl(), "bottom-left");
    map.on("moveend", () => {
      if (mapProviderRef.current !== MAP_PROVIDER_DECKGL) return;
      updateViewFromDeck();
      const c = map.getCenter();
      const z = map.getZoom();
      if (z >= SOURCES.map.appleZoomThreshold && appleMapReadyRef.current && !switchingProviderRef.current && !showHeatmapRef.current) switchToProvider(MAP_PROVIDER_APPLE, c.lat, c.lng, z, map.getPitch(), map.getBearing());
    });
    map.on("mousedown", (event) => {
      mouseDownPosRef.current = { x: event.originalEvent.clientX, y: event.originalEvent.clientY };
    });
    map.on("click", (event) => {
      if (!selectionModeRef.current) return;
      if (mouseDownPosRef.current && Math.hypot(event.originalEvent.clientX - mouseDownPosRef.current.x, event.originalEvent.clientY - mouseDownPosRef.current.y) > 8) return;
      if (queryFeatureAtPointRef.current) queryFeatureAtPointRef.current(event.lngLat.lat, event.lngLat.lng, map.getZoom());
    });
    return map;
  }, [switchToProvider, updateViewFromDeck]);

  const initAppleMap = useCallback((mapkit) => {
    if (!appleMapContainerRef.current) return null;
    const map = new mapkit.Map(appleMapContainerRef.current, {
      mapType: mapkit.Map.MapTypes.Hybrid,
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
      cameraDistance: 50000000,
      colorScheme: mapkit.Map.ColorSchemes.Dark
    });
    map.addEventListener("region-change-end", () => {
      if (mapProviderRef.current !== MAP_PROVIDER_APPLE) return;
      const lat = map.center.latitude;
      const lng = map.center.longitude;
      const region = map.region;
      const zoom = Math.max(0, Math.min(Math.log2(360 / Math.max(region.span.latitudeDelta, 0.0001)), 22));
      setView({ lat, lon: normalizeLon(lng), zoom, bounds: { west: lng - region.span.longitudeDelta / 2, east: lng + region.span.longitudeDelta / 2, south: lat - region.span.latitudeDelta / 2, north: lat + region.span.latitudeDelta / 2 } });
      if (zoom < SOURCES.map.appleZoomThreshold && !switchingProviderRef.current) switchToProvider(MAP_PROVIDER_DECKGL, lat, lng, zoom, 0, map.rotation || 0);
    });
    const element = appleMapContainerRef.current;
    element.addEventListener("mousedown", (event) => {
      if (mapProviderRef.current === MAP_PROVIDER_APPLE) mouseDownPosRef.current = { x: event.clientX, y: event.clientY };
    });
    element.addEventListener("mouseup", (event) => {
      if (mapProviderRef.current !== MAP_PROVIDER_APPLE || !selectionModeRef.current || !mouseDownPosRef.current) return;
      if (Math.hypot(event.clientX - mouseDownPosRef.current.x, event.clientY - mouseDownPosRef.current.y) > 8) return;
      if (event.target.closest && event.target.closest(".mk-controls-container, .mk-annotation-container button, .mk-bottom-controls-container, .mk-top-controls-container")) return;
      const coordinate = map.convertPointOnPageToCoordinate(new DOMPoint(event.clientX, event.clientY));
      if (coordinate && queryFeatureAtPointRef.current) queryFeatureAtPointRef.current(coordinate.latitude, coordinate.longitude, Math.max(0, Math.min(Math.log2(360 / Math.max(map.region.span.latitudeDelta, 0.0001)), 22)));
    });
    return map;
  }, [setView, switchToProvider]);

  useEffect(() => {
    if (authLoading || !token || !mapContainerRef.current) return undefined;
    let cancelled = false;
    let observer = null;
    const host = mapContainerRef.current;
    const claimWheel = (event) => { event.preventDefault(); };
    host.addEventListener("wheel", claimWheel, { passive: false, capture: true });
    const createDiv = (display) => {
      const div = document.createElement("div");
      Object.assign(div.style, { width: "100%", height: "100%", position: "absolute", top: "0", left: "0", display });
      host.appendChild(div);
      return div;
    };
    appleMapContainerRef.current = createDiv("none");
    deckglMapContainerRef.current = createDiv("block");
    const initDeck = async () => {
      libsRef.current = await loadMapDeps();
      if (cancelled) return;
      const map = initDeckGlMap();
      if (!map) throw new Error("The MapLibre map could not be created.");
      deckglMapRef.current = map;
      mapProviderRef.current = MAP_PROVIDER_DECKGL;
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(() => {
          if (deckglMapRef.current) deckglMapRef.current.resize();
        });
        observer.observe(host);
      }
      await new Promise((resolve) => {
        const onReady = () => {
          if (cancelled) return;
          const overlay = new libsRef.current.deck.MapboxOverlay({ interleaved: true, layers: [] });
          map.addControl(overlay);
          deckOverlayRef.current = overlay;
          updateViewFromDeck();
          setMapReady(true);
          resolve();
        };
        if (map.loaded()) onReady();
        else map.on("load", onReady);
      });
    };
    const initApple = () => loadMapKitJS().then((mapkit) => {
      if (cancelled) return null;
      return new Promise((resolve, reject) => {
        let settled = false;
        const map = initAppleMap(mapkit);
        if (!map) {
          reject(new Error("The Apple map could not be created."));
          return;
        }
        const onError = () => {
          if (settled) return;
          settled = true;
          mapkit.removeEventListener("error", onError);
          try {
            map.destroy();
          } catch (error) {
            reject(error);
            return;
          }
          reject(new Error("MapKit authorization failed."));
        };
        mapkit.addEventListener("error", onError);
        setTimeout(() => {
          if (settled || cancelled) return;
          settled = true;
          mapkit.removeEventListener("error", onError);
          appleMapRef.current = map;
          appleMapReadyRef.current = true;
          resolve();
        }, 3000);
      });
    });
    initDeck().then(() => {
      if (!cancelled) return initApple().catch(() => null);
      return null;
    }).catch((error) => {
      if (!cancelled) setMapError(`The map could not be started because of the error "${errorText(error)}".`);
    });
    return () => {
      cancelled = true;
      if (observer) observer.disconnect();
      if (deckOverlayRef.current && deckglMapRef.current) {
        try {
          deckglMapRef.current.removeControl(deckOverlayRef.current);
        } catch (error) {
          deckOverlayRef.current = null;
        }
      }
      deckOverlayRef.current = null;
      if (appleMapRef.current) {
        try {
          appleMapRef.current.destroy();
        } catch (error) {
          appleMapRef.current = null;
        }
      }
      appleMapRef.current = null;
      appleMapReadyRef.current = false;
      if (deckglMapRef.current) {
        try {
          deckglMapRef.current.remove();
        } catch (error) {
          deckglMapRef.current = null;
        }
      }
      deckglMapRef.current = null;
      host.removeEventListener("wheel", claimWheel, { capture: true });
      host.innerHTML = "";
      setMapReady(false);
    };
  }, [authLoading, token, initDeckGlMap, initAppleMap, updateViewFromDeck]);

  useEffect(() => {
    if (activeTab === "map" && mapReady && deckglMapRef.current) deckglMapRef.current.resize();
  }, [activeTab, mapReady]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (deckglMapRef.current) deckglMapRef.current.resize();
    }, 50);
    return () => clearTimeout(timer);
  }, [layoutVisibility, briefOpen]);

  useEffect(() => {
    selectionModeRef.current = selectionMode;
    if (deckglMapRef.current) {
      if (selectionMode) deckglMapRef.current.doubleClickZoom.disable();
      else deckglMapRef.current.doubleClickZoom.enable();
    }
  }, [selectionMode]);

  useEffect(() => {
    showHeatmapRef.current = showHeatmap;
    const map = deckglMapRef.current;
    if (!mapReady || !map) return;
    try {
      map.setMaxZoom(showHeatmap ? SOURCES.map.heatmapMaxZoom : SOURCES.map.deckMaxZoom);
    } catch (error) {
      setMapError(`The heatmap zoom range could not be changed because of the error "${errorText(error)}".`);
    }
    if (showHeatmap && mapProviderRef.current === MAP_PROVIDER_APPLE && viewRef.current) switchToProvider(MAP_PROVIDER_DECKGL, viewRef.current.lat, viewRef.current.lon, viewRef.current.zoom, 0, 0);
  }, [mapReady, showHeatmap, switchToProvider]);

  useEffect(() => {
    const map = deckglMapRef.current;
    if (!mapReady || !map) return;
    try {
      map.setLayoutProperty("satellite-layer", "visibility", showSatellite ? "visible" : "none");
      map.setLayoutProperty("labels-layer", "visibility", showSatellite ? "visible" : "none");
      map.setLayoutProperty("topo-layer", "visibility", showSatellite ? "none" : "visible");
    } catch (error) {
      setMapError(`The base map could not be switched because of the error "${errorText(error)}".`);
    }
    if (appleMapRef.current && window.mapkit) appleMapRef.current.mapType = showSatellite ? window.mapkit.Map.MapTypes.Hybrid : window.mapkit.Map.MapTypes.Standard;
  }, [mapReady, showSatellite, activeProvider]);

  useEffect(() => {
    if (!mapReady || !pendingCameraRef.current) return;
    const camera = pendingCameraRef.current;
    pendingCameraRef.current = null;
    if (camera.zoom > 1.5 && !locationRef.current) navigateTo(camera.lon, camera.lat, camera.zoom);
  }, [mapReady, stateRestored, navigateTo]);

  const hoveredRiskId = hoverInfo && hoverInfo.object ? hoverInfo.object.id : null;
  const hoveredRisk = useMemo(() => (hoveredRiskId ? mapRisks.find((risk) => risk.id === hoveredRiskId) || null : null), [hoveredRiskId, mapRisks]);

  useEffect(() => {
    const overlay = deckOverlayRef.current;
    const dk = libsRef.current && libsRef.current.deck;
    if (!mapReady || !overlay || !dk) return;
    const zoom = viewState.zoom;
    const layers = [];
    try {
      if (activeAreas && dk.SolidPolygonLayer) {
        const holes = activeUnionRings.map((ring) => ring.slice().reverse());
        layers.push(new dk.SolidPolygonLayer({
          id: "risk-area-mask",
          data: [{ polygon: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]], ...holes] }],
          getPolygon: (d) => d.polygon,
          filled: true,
          getFillColor: [8, 9, 12, 225]
        }));
      }

      if (areaFilterActive && areas.length) {
        const shapes = areas.map((area) => ({ ...areaShape(area), selected: area.area_id === selectedAreaId }));
        if (dk.SolidPolygonLayer) {
          layers.push(new dk.SolidPolygonLayer({
            id: "risk-user-areas",
            data: activeUnionRings.map((ring) => ({ ring })),
            getPolygon: (d) => d.ring,
            filled: true,
            getFillColor: [78, 205, 196, 14]
          }));
          layers.push(new dk.SolidPolygonLayer({
            id: "risk-user-area-selected",
            data: shapes.filter((shape) => shape.selected),
            getPolygon: (d) => d.ring,
            filled: true,
            getFillColor: [78, 205, 196, 20]
          }));
        }
        if (dk.TextLayer) {
          layers.push(new dk.TextLayer({
            id: "risk-user-area-labels",
            data: shapes,
            getPosition: (d) => [d.centerLng, d.centerLat],
            getText: (d) => d.name,
            getSize: 11,
            getColor: (d) => (d.selected ? [78, 205, 196, 255] : [170, 180, 200, 220]),
            getTextAnchor: "middle",
            getAlignmentBaseline: "center",
            fontFamily: CHART_FONT,
            fontWeight: 800,
            background: true,
            getBackgroundColor: [8, 9, 12, 200],
            backgroundPadding: [4, 2],
            updateTriggers: { getColor: [selectedAreaId] }
          }));
        }
      }

      if (locationActive) {
        layers.push(new dk.ScatterplotLayer({
          id: "risk-location-area",
          data: [{ lon: selectedLon, lat: selectedLat }],
          getPosition: (d) => [d.lon, d.lat],
          getRadius: areaRadius * 1000,
          radiusUnits: "meters",
          stroked: false,
          filled: true,
          getFillColor: [78, 205, 196, 26],
          updateTriggers: { getRadius: areaRadius }
        }));
        layers.push(new dk.ScatterplotLayer({
          id: "risk-location-center",
          data: [{ lon: selectedLon, lat: selectedLat }],
          getPosition: (d) => [d.lon, d.lat],
          getRadius: 5,
          radiusUnits: "pixels",
          stroked: true,
          filled: true,
          getFillColor: [78, 205, 196, 255],
          getLineColor: [8, 9, 12, 255],
          lineWidthUnits: "pixels",
          getLineWidth: 2
        }));
      }

      if (showHeatmap && mapRisks.length && dk.HeatmapLayer) {
        const heatmapData = [];
        const byCategory = {};
        for (const risk of mapRisks) {
          if (risk.latitude == null || risk.longitude == null) continue;
          const key = categorizeRisk(risk);
          if (!byCategory[key]) byCategory[key] = [];
          byCategory[key].push(risk);
        }
        Object.values(byCategory).forEach((list) => {
          list.sort((a, b) => (SEVERITY_WEIGHTS_LOCAL[b.severity] || 10) - (SEVERITY_WEIGHTS_LOCAL[a.severity] || 10)).slice(0, SOURCES.map.heatmapPerCategory).forEach((risk) => heatmapData.push({ position: [risk.longitude, risk.latitude], weight: (SEVERITY_WEIGHTS_LOCAL[risk.severity] || 10) / 10 }));
        });
        layers.push(new dk.HeatmapLayer({
          id: "risk-heatmap",
          data: heatmapData,
          getPosition: (d) => d.position,
          getWeight: (d) => d.weight,
          radiusPixels: zoom >= 10 ? 200 : zoom >= 7 ? 120 : zoom >= 4 ? 80 : 50,
          intensity: zoom >= 8 ? 2.5 : zoom >= 5 ? 1.8 : 1.2,
          threshold: 0.01,
          colorRange: [[78, 205, 196, 0], [78, 205, 196, 100], [255, 217, 61, 160], [255, 149, 0, 200], [255, 107, 107, 230], [255, 107, 107, 255]],
          aggregation: "MEAN"
        }));
      }

      if (!showHeatmap) {
        const focus = [selectedRisk, hoveredRisk].filter((risk, index, list) => risk && list.findIndex((other) => other && other.id === risk.id) === index);
        const focusPolygons = [];
        focus.forEach((risk) => riskRings(risk).forEach((ring) => focusPolygons.push({ risk, polygon: ring })));
        if (focusPolygons.length) {
          layers.push(new dk.PolygonLayer({
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
        const pointRisks = mapRisks.filter((risk) => risk.latitude != null && risk.longitude != null).sort((a, b) => (SEVERITY_ORDER[b.severity] || 0) - (SEVERITY_ORDER[a.severity] || 0)).slice(0, SOURCES.map.maxRisksDrawn);
        const ordered = pointRisks.slice().reverse();
        if (selectedRisk && selectedRisk.latitude != null && ordered.some((risk) => risk.id === selectedRisk.id)) {
          layers.push(new dk.ScatterplotLayer({
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
          id: "risk-events",
          data: ordered,
          getPosition: (d) => [d.longitude, d.latitude],
          getIcon: (d) => riskIcon(d, riskBadgeNear(d, zoom)),
          getSize: (d) => riskIconSize(d, riskBadgeNear(d, zoom)),
          sizeUnits: "pixels",
          pickable: true,
          autoHighlight: true,
          highlightColor: [235, 240, 248, 70],
          onClick: (info) => {
            if (info.object && !selectionModeRef.current && selectRiskRef.current) selectRiskRef.current(info.object, false);
            return true;
          },
          onHover: (info) => setHoverRef.current && setHoverRef.current(info.object ? { x: info.x, y: info.y, object: info.object } : null),
          updateTriggers: { getIcon: zoom >= SOURCES.map.badgeZoom, getSize: zoom >= SOURCES.map.badgeZoom }
        }));
        if (showVisibilityBadges) {
          const privatePoints = ordered.filter((risk) => getRiskVisibility(risk) === VISIBILITY_ORG_PRIVATE);
          if (privatePoints.length) {
            layers.push(new dk.IconLayer({
              id: "risk-private-markers",
              data: privatePoints,
              getPosition: (d) => [d.longitude, d.latitude],
              getIcon: () => makeIcon("risk-private", 8, `<g filter="url(#g)" opacity="0.85"><circle cx="4" cy="4" r="3" fill="#000"/></g><circle cx="4" cy="4" r="2.6" fill="#ffd93d"/>`),
              getSize: 8,
              sizeUnits: "pixels",
              getPixelOffset: [10, -10]
            }));
          }
        }
        if (zoom >= SOURCES.map.labelZoom && dk.TextLayer) {
          layers.push(new dk.TextLayer({
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

      if (selectionGeoJsonRef.current && dk.SolidPolygonLayer) {
        layers.push(new dk.SolidPolygonLayer({
          id: "risk-feature-highlight",
          data: [{ polygon: selectionGeoJsonRef.current.ring }],
          getPolygon: (d) => d.polygon,
          filled: true,
          getFillColor: [78, 205, 196, 60]
        }));
      }
      overlay.setProps({ layers });
    } catch (error) {
      setMapError(`The map layers could not be drawn because of the error "${errorText(error)}".`);
    }
  }, [mapReady, viewState, activeAreas, activeUnionRings, areaFilterActive, areas, selectedAreaId, locationActive, selectedLat, selectedLon, areaRadius, showHeatmap, mapRisks, selectedRisk, hoveredRisk, showVisibilityBadges, deckLayersVersion]);

  useEffect(() => {
    const map = appleMapRef.current;
    const mapkit = window.mapkit;
    if (!mapReady || !map || !mapkit || activeProvider !== MAP_PROVIDER_APPLE) return undefined;
    const annotations = [];
    const overlays = [];
    const fillStyle = (color, opacity) => new mapkit.Style({ fillColor: color, fillOpacity: opacity, strokeOpacity: 0, lineWidth: 0 });
    try {
      if (activeAreas) {
        const world = [[-85, -180], [-85, 180], [85, 180], [85, -180]].map(([lat, lng]) => new mapkit.Coordinate(lat, lng));
        const holes = activeUnionRings.map((ring) => ring.map(([lng, lat]) => new mapkit.Coordinate(lat, lng)));
        overlays.push(new mapkit.PolygonOverlay([world, ...holes], { style: fillStyle("#08090c", 0.88) }));
      }
      if (areaFilterActive && areas.length) {
        activeUnionRings.forEach((ring) => overlays.push(new mapkit.PolygonOverlay([ring.map(([lng, lat]) => new mapkit.Coordinate(lat, lng))], { style: fillStyle("#4ecdc4", 0.06) })));
        for (const area of areas) {
          const shape = areaShape(area);
          const isSelected = area.area_id === selectedAreaId;
          if (isSelected) overlays.push(new mapkit.PolygonOverlay([shape.ring.map(([lng, lat]) => new mapkit.Coordinate(lat, lng))], { style: fillStyle("#4ecdc4", 0.08) }));
          annotations.push(new mapkit.Annotation(new mapkit.Coordinate(shape.centerLat, shape.centerLng), () => {
            const element = document.createElement("div");
            element.className = `riskMapAreaLabel${isSelected ? " riskMapAreaLabelSelected" : ""}`;
            element.textContent = shape.name;
            return element;
          }, { calloutEnabled: false, animates: false, displayPriority: 1000, anchorOffset: new DOMPoint(0, 10) }));
        }
      }
      if (locationActive) overlays.push(new mapkit.CircleOverlay(new mapkit.Coordinate(selectedLat, selectedLon), areaRadius * 1000, { style: fillStyle("#4ecdc4", 0.1) }));
      if (selectedRisk) {
        riskRings(selectedRisk).forEach((ring) => overlays.push(new mapkit.PolygonOverlay([ring.map(([lng, lat]) => new mapkit.Coordinate(lat, lng))], { style: fillStyle(riskSeverityColor(selectedRisk), 0.27) })));
        if (selectedRisk.latitude != null && selectedRisk.impact_radius_km > 0) overlays.push(new mapkit.CircleOverlay(new mapkit.Coordinate(selectedRisk.latitude, selectedRisk.longitude), selectedRisk.impact_radius_km * 1000, { style: fillStyle(riskSeverityColor(selectedRisk), 0.18) }));
      }
      if (selectionGeoJsonRef.current) overlays.push(new mapkit.PolygonOverlay([selectionGeoJsonRef.current.ring.map(([lng, lat]) => new mapkit.Coordinate(lat, lng))], { style: fillStyle("#4ecdc4", 0.24) }));
      const bounds = viewState.bounds;
      const visible = mapRisks.filter((risk) => risk.latitude != null && risk.longitude != null && inBounds(bounds, risk.longitude, risk.latitude)).sort((a, b) => (SEVERITY_ORDER[b.severity] || 0) - (SEVERITY_ORDER[a.severity] || 0)).slice(0, SOURCES.map.appleMaxAnnotations);
      for (const risk of visible) {
        const icon = riskIcon(risk, true);
        const size = riskIconSize(risk, true);
        annotations.push(new mapkit.Annotation(new mapkit.Coordinate(risk.latitude, risk.longitude), () => {
          const element = document.createElement("div");
          element.className = `riskMapBadge${selectedRisk && selectedRisk.id === risk.id ? " riskMapBadgeSelected" : ""}`;
          element.style.width = `${size}px`;
          element.style.height = `${size}px`;
          element.style.backgroundImage = `url("${icon.url}")`;
          element.title = String(risk.title || "");
          element.addEventListener("click", (event) => {
            event.stopPropagation();
            if (!selectionModeRef.current && selectRiskRef.current) selectRiskRef.current(risk, false);
          });
          return element;
        }, { calloutEnabled: false, animates: false, displayPriority: 100 + (SEVERITY_ORDER[risk.severity] || 0) * 200, anchorOffset: new DOMPoint(0, size / 2) }));
      }
      if (overlays.length) map.addOverlays(overlays);
      if (annotations.length) map.addAnnotations(annotations);
    } catch (error) {
      setMapError(`The Apple map layers could not be drawn because of the error "${errorText(error)}".`);
    }
    appleOverlaysRef.current = overlays;
    appleAnnotationsRef.current = annotations;
    return () => {
      try {
        if (overlays.length) map.removeOverlays(overlays);
        if (annotations.length) map.removeAnnotations(annotations);
      } catch (error) {
        appleOverlaysRef.current = [];
      }
    };
  }, [mapReady, activeProvider, viewState, activeAreas, activeUnionRings, areaFilterActive, areas, selectedAreaId, locationActive, selectedLat, selectedLon, areaRadius, selectedRisk, mapRisks, deckLayersVersion]);

  const resetView = useCallback(() => {
    const location = locationRef.current;
    if (location) navigateTo(location.lon, location.lat, radiusZoom(location.radius, location.lat));
    else navigateTo(SOURCES.map.center[0], SOURCES.map.center[1], SOURCES.map.zoom);
  }, [navigateTo]);

  const locationFocusRef = useRef(null);

  useEffect(() => {
    if (!mapReady) return;
    const signature = locationActive ? `${selectedLocation}|${areaRadius}` : WORLDWIDE_KEY;
    if (locationFocusRef.current === signature) return;
    const previous = locationFocusRef.current;
    locationFocusRef.current = signature;
    if (locationActive) navigateTo(selectedLon, selectedLat, radiusZoom(areaRadius, selectedLat));
    else if (previous && previous !== WORLDWIDE_KEY) resetView();
  }, [mapReady, locationActive, selectedLocation, selectedLat, selectedLon, areaRadius, navigateTo, resetView]);

  const applySavedView = useCallback((view) => {
    if (!view) return;
    const camera = view.camera || { center: view.center, zoom: view.zoom };
    if (camera && camera.center && camera.zoom != null) navigateTo(camera.center.lng, camera.center.lat, camera.zoom);
    if (view.filters) {
      if (view.filters.risk_layers_visible) setRiskLayersVisible({ ...DEFAULT_RISK_LAYERS, ...view.filters.risk_layers_visible });
      if (view.filters.user_area && view.filters.user_area.area_id && areas.some((area) => area.area_id === view.filters.user_area.area_id)) setSelectedAreaId(view.filters.user_area.area_id);
      if (view.filters.area_filter_active !== undefined) setAreaFilterActive(Boolean(view.filters.area_filter_active));
    }
    if (view.layers) {
      if (view.layers.show_satellite !== undefined) setShowSatellite(Boolean(view.layers.show_satellite));
      if (view.layers.show_heatmap !== undefined) setShowHeatmap(Boolean(view.layers.show_heatmap));
      if (view.layers.show_visibility_badges !== undefined) setShowVisibilityBadges(Boolean(view.layers.show_visibility_badges));
    }
    showNotification(`The saved view ${describeSavedView(view)} was applied.`);
  }, [navigateTo, showNotification, areas]);

  useEffect(() => {
    if (!mapReady) return;
    const params = new URLSearchParams(window.location.search);
    const lat = parseFloat(params.get("lat"));
    const lng = parseFloat(params.get("lng"));
    const zoom = parseFloat(params.get("zoom")) || 14;
    const viewId = params.get("view");
    if (!isNaN(lat) && !isNaN(lng)) navigateTo(lng, lat, zoom);
    if (viewId) {
      const view = savedViews.find((item) => item.view_id === viewId);
      if (view) applySavedView(view);
    }
    if (params.toString()) window.history.replaceState({}, "", window.location.pathname);
  }, [mapReady]);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      loadHazards(),
      loadSourceStatus(),
      fetchAreas(),
      loadHarvestHealth(),
      locationActive ? loadLocalAssessment() : null
    ].filter(Boolean));
    setRefreshing(false);
  }, [loadHazards, loadSourceStatus, fetchAreas, loadHarvestHealth, locationActive, loadLocalAssessment]);

  const exportData = useCallback(() => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const header = "Title,Severity,SeverityScore,Category,Source,EventTime,UpdatedAt,ExpiresAt,Latitude,Longitude,ImpactRadiusKm,Visibility,Url,EventId";
    const rows = scopedRisks.map((risk) => [
      csvQuote(risk.title), csvQuote(risk.severity || ""), risk.severity_score == null ? "" : risk.severity_score, csvQuote(risk.risk_category || ""), csvQuote(risk.source || ""),
      csvQuote(risk.event_time || ""), csvQuote(risk.updated_at || ""), csvQuote(risk.expires_at || ""), risk.latitude == null ? "" : risk.latitude, risk.longitude == null ? "" : risk.longitude,
      risk.impact_radius_km == null ? "" : risk.impact_radius_km, csvQuote(getRiskVisibility(risk)), csvQuote(risk.url || ""), csvQuote(risk.id)
    ].join(","));
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `stratum-risk-events-${timestamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [scopedRisks]);

  const handleExpandClick = (event) => {
    if (event.target.closest("button, a, input, select, textarea, label, .satWeatherRowSelectable")) return;
    const target = event.target.closest(EXPANDABLE_SELECTOR);
    if (!target) return;
    const panel = target.closest("[class*='satEarthCondPanel']");
    const heading = panel?.querySelector("h4")?.textContent || target.querySelector("h3")?.textContent || "Details";
    setExpandedView({ title: heading, html: target.outerHTML });
  };

  const renderDataTypeBadge = (dataType, size = "normal") => {
    const config = DATA_TYPE[dataType] || DATA_TYPE.LIVE;
    const sizeClass = size === "small" ? "satEarthCondDataTypeBadgeSmall" : "";
    return (
      <span
        className={`satEarthCondDataTypeBadge ${sizeClass}`}
        style={{ backgroundColor: config.color + "20", color: config.color, borderColor: config.color }}
        title={config.description}
      >
        <FontAwesomeIcon icon={config.icon} />
        <span>{config.label}</span>
      </span>
    );
  };

  const getResponsiveOptions = (screenSize) => {
    if (screenSize < 499) return { fontSize: 0, grid: { left: 0, right: 0, bottom: 0, top: 0 } };
    if (screenSize <= 699) return { fontSize: 9, grid: { left: 40, right: 40, bottom: 8, top: 12 } };
    if (screenSize <= 1299) return { fontSize: 10, grid: { left: 40, right: 40, bottom: 35, top: 30 } };
    return { fontSize: 11, grid: { left: 60, right: 60, bottom: 40, top: 40 } };
  };

  const tooltipStyle = { backgroundColor: "#0b0c0f", borderColor: "#3d4354", borderWidth: 2, padding: 10, extraCssText: "border-radius: 4px;", textStyle: { color: "#ebf0f8", fontSize: 11, fontWeight: 700, fontFamily: CHART_FONT } };

  const axisLabel = (fontSize, width) => ({ color: "#919baf", fontSize, fontWeight: 700, fontFamily: CHART_FONT, width, overflow: "truncate", ellipsis: "…", hideOverlap: true });

  const createBarChart = (title, labels, values, unit = "", color = "#4ecdc4", horizontal = false, colors = null) => {
    if (!values.length) return null;
    const { fontSize, grid } = getResponsiveOptions(window.innerWidth);
    const category = { type: "category", data: labels, axisLabel: axisLabel(fontSize, horizontal ? 110 : 90), axisLine: { lineStyle: { color: "#3d4354", width: 2 } }, axisTick: { lineStyle: { color: "#3d4354" } }, splitLine: { show: false } };
    const value = { type: "value", axisLabel: axisLabel(fontSize, 60), axisLine: { show: false }, splitLine: { lineStyle: { color: "#323746", type: "dashed" } } };
    const option = {
      textStyle: { fontFamily: CHART_FONT },
      tooltip: {
        trigger: "axis",
        ...tooltipStyle,
        formatter: (params) => `<div><div style="font-size:10px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;color:#919baf;margin-bottom:6px">${title}</div>${params.map(p => `<div style="font-weight:700;color:#cdd4e4">${p.name}: <span style="font-weight:800;color:${colors ? colors[p.dataIndex] : color}">${Number(p.data).toLocaleString()}${unit}</span></div>`).join("")}</div>`
      },
      xAxis: horizontal ? value : category,
      yAxis: horizontal ? { ...category, inverse: true } : value,
      series: [{ name: title, type: "bar", data: values, itemStyle: { color: colors ? (params) => colors[params.dataIndex] : color, borderRadius: 0 }, barMaxWidth: 28 }],
      grid: { ...grid, containLabel: true }
    };
    Object.defineProperty(option, "statsMeta", { value: { values, unit }, enumerable: false });
    return option;
  };

  const createLineChart = (title, labels, seriesList, unit = "", bars = false) => {
    if (!labels.length) return null;
    const { fontSize, grid } = getResponsiveOptions(window.innerWidth);
    const option = {
      textStyle: { fontFamily: CHART_FONT },
      tooltip: {
        trigger: "axis",
        ...tooltipStyle,
        formatter: (params) => `<div><div style="font-size:10px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;color:#919baf;margin-bottom:6px">${params[0] ? params[0].axisValue : title}</div>${params.map(p => `<div style="font-weight:700;color:#cdd4e4">${p.seriesName}: <span style="font-weight:800;color:${p.color}">${p.data === null || p.data === undefined ? "—" : Number(p.data).toLocaleString(undefined, { maximumFractionDigits: 2 })}${unit}</span></div>`).join("")}</div>`
      },
      legend: { top: 0, textStyle: { color: "#919baf", fontSize, fontWeight: 700, fontFamily: CHART_FONT } },
      xAxis: { type: "category", data: labels, axisLabel: axisLabel(fontSize, 90), axisLine: { lineStyle: { color: "#3d4354", width: 2 } }, axisTick: { lineStyle: { color: "#3d4354" } }, splitLine: { show: false } },
      yAxis: seriesList.some((series) => series.axis === 1)
        ? [0, 1].map((index) => ({ type: "value", axisLabel: axisLabel(fontSize, 60), axisLine: { show: false }, splitLine: { show: index === 0, lineStyle: { color: "#323746", type: "dashed" } } }))
        : { type: "value", axisLabel: axisLabel(fontSize, 60), axisLine: { show: false }, splitLine: { lineStyle: { color: "#323746", type: "dashed" } } },
      series: seriesList.map(({ name, data, color, axis, bar }) => (bar || bars
        ? { name, data, type: "bar", yAxisIndex: axis || 0, itemStyle: { color, borderRadius: 0 }, barMaxWidth: 16 }
        : { name, data, type: "line", yAxisIndex: axis || 0, smooth: true, showSymbol: false, itemStyle: { color }, lineStyle: { color, width: 2 }, areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: color + "40" }, { offset: 1, color: color + "00" }] } } })),
      grid: { ...grid, containLabel: true }
    };
    Object.defineProperty(option, "statsMeta", { value: { values: seriesList[0] ? seriesList[0].data.filter((v) => v !== null && v !== undefined) : [], unit }, enumerable: false });
    return option;
  };

  const renderChartStats = (chartConfig) => {
    const values = chartConfig?.statsMeta?.values || [];
    const unit = chartConfig?.statsMeta?.unit || "";
    const format = (v) => (v === null || v === undefined || isNaN(v) ? "—" : `${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}${unit}`);
    const has = values.length > 0;
    const stats = [
      ["Points", has ? values.length : "—"],
      ["Min", has ? format(Math.min(...values)) : "—"],
      ["Max", has ? format(Math.max(...values)) : "—"],
      ["Mean", has ? format(values.reduce((a, b) => a + b, 0) / values.length) : "—"],
      ["Total", has ? format(values.reduce((a, b) => a + b, 0)) : "—"]
    ];
    return (
      <div className="satEarthCondStatsSummary">
        {stats.map(([label, value]) => <span key={label}>{label}: {value}</span>)}
      </div>
    );
  };

  const renderChart = (chartConfig) => {
    if (!chartConfig) return <div className="satEarthCondNoChartData">No Data Available</div>;
    return <ResponsiveChart option={chartConfig} className="satEarthCondChart" onExpand={() => setExpandedView({ title: chartConfig.series?.[0]?.name || "Chart", chart: chartConfig })} />;
  };

  const renderTiles = (tiles) => (
    <div className="satEarthCondStatusTileGrid">
      {tiles.map(({ label, value, detail, color, icon }) => (
        <div key={label} className="satEarthCondStatusTile">
          <div className="satEarthCondStatusTileHeader">
            {icon && <FontAwesomeIcon icon={icon} />}
            <span>{label}</span>
          </div>
          <div className="satEarthCondStatusTileValue" style={color ? { color } : undefined}>
            {color && <span className="satEarthCondStatusTileDot" style={{ backgroundColor: color }} />}
            <span>{value}</span>
          </div>
          {detail && <div className="satEarthCondStatusTileDetail" title={detail}>{detail}</div>}
        </div>
      ))}
    </div>
  );

  const renderTable = (title, headers, rows, options = {}) => {
    const cellText = (cell) => {
      const isObject = cell !== null && typeof cell === "object" && !Array.isArray(cell);
      const value = isObject ? cell.value : cell;
      return value === null || value === undefined || value === "" ? "—" : String(value);
    };
    const widths = headers.map((header, column) => rows.reduce((longest, row) => Math.max(longest, cellText(row[column]).length), String(header).length));
    const kindOf = (column) => (widths[column] > SOURCES.tables.wrapAt ? "satWeatherCellWrap" : widths[column] > SOURCES.tables.tightAt ? "satWeatherCellMedium" : "satWeatherCellTight");
    return (
      <div className="satEarthCondTableCard">
        <div className="satEarthCondTableHeader">
          <h3>{title}</h3>
        </div>
        <div className="satEarthCondTableWrapper satWeatherTableWrapper">
          <table className="satEarthCondDataTable satWeatherDataTable">
            <thead><tr>{headers.map((header, column) => <th key={column} className={kindOf(column)}>{header}</th>)}</tr></thead>
            <tbody>
              {rows.length > 0 ? rows.map((row, i) => (
                <tr key={i} className={options.onRowClick ? "satWeatherRowSelectable" : undefined} onClick={options.onRowClick ? () => options.onRowClick(i) : undefined}>
                  {row.map((cell, column) => {
                    const isObject = cell !== null && typeof cell === "object" && !Array.isArray(cell);
                    const text = cellText(cell);
                    if (isObject && cell.href) return <td key={column} className={kindOf(column)}><a className="satWeatherTableLink" href={cell.href} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>{text}</a></td>;
                    return <td key={column} className={kindOf(column)} style={isObject && cell.color ? { color: cell.color } : undefined}>{text}</td>;
                  })}
                </tr>
              )) : <tr><td colSpan={headers.length} className="satEarthCondTableNoData">{options.emptyText || "No Data"}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderSection = (label, icon, rows) => (
    <>
      <div className="satEarthCondSectionDivider">
        <div className="satEarthCondSectionDividerLine" />
        <span className="satEarthCondSectionDividerLabel">
          <FontAwesomeIcon icon={icon} />
          {label}
        </span>
        <div className="satEarthCondSectionDividerLine" />
      </div>
      {rows.map((row, rowIndex) => {
        const panels = row.filter(Boolean);
        if (!panels.length) return null;
        const width = panels.length === 1 ? "Single" : panels.length === 2 ? "Double" : "Triple";
        return (
          <div key={`${label}_${rowIndex}`} className="satEarthCondOverviewGrid">
            {panels.map(panel => (
              <div key={panel.title} className={`satEarthCondPanel${width} satEarthCondChartContainer${PANEL_CONTAINER_CLASS[panel.badge] || "Live"}`}>
                <div className="satEarthCondChartHeaderWithBadge">
                  <h4>{panel.title}</h4>
                  {renderDataTypeBadge(panel.badge || "LIVE", "small")}
                </div>
                {panel.content}
                <div className="satEarthCondChartDescription">
                  {panel.axes && (
                    <div className="satEarthCondChartAxesInfo">
                      <span><strong>X-Axis:</strong> {panel.axes[0]}</span>
                      <span><strong>Y-Axis:</strong> {panel.axes[1]}</span>
                    </div>
                  )}
                  <p className="satEarthCondChartDescriptionText">{panel.description}</p>
                </div>
                {panel.axes && renderChartStats(panel.chart)}
              </div>
            ))}
          </div>
        );
      })}
    </>
  );

  const renderDetailFields = (fields, options = {}) => (options.columns !== 3 ? (
    <div className="satWeatherDetailList">
      {fields.filter(([, value]) => value !== undefined && value !== null && value !== "" && value !== "—").map(([label, value]) => (
        <div key={label} className="satWeatherDetailRow">
          <span className="satWeatherDetailRowLabel">{label}</span>
          <span className="satWeatherDetailRowValue">{String(value)}</span>
        </div>
      ))}
    </div>
  ) : (
    <div className={`satWeatherDetailFields ${options.columns === 3 ? "satWeatherDetailFieldsWide" : ""}`}>
      {fields.filter(([, value]) => value !== undefined && value !== null && value !== "" && value !== "—").map(([label, value]) => {
        const text = value === null || value === "" ? "—" : String(value);
        return (
          <div key={label} className={`satWeatherDetailField ${text.length > (options.fullAt || 9999) ? "satWeatherDetailFieldFull" : text.length > (options.wideAt || 22) ? "satWeatherDetailFieldWide" : ""}`}>
            <span className="satWeatherDetailLabel">{label}</span>
            <span className="satWeatherDetailValue">{text}</span>
          </div>
        );
      })}
    </div>
  ));


  const riskRow = (risk, extra = []) => [
    { value: risk.title || "Untitled Event", color: liftColor(riskSeverityColor(risk)) },
    risk.severity,
    risk.risk_category,
    risk.source,
    risk.event_time ? formatAbsoluteTime(risk.event_time) : null,
    risk.expires_at ? formatUntil(risk.expires_at) : null,
    risk.impact_radius_km != null ? formatNumber(risk.impact_radius_km, " Km", 1) : null,
    ...extra
  ];

  const riskAreaNames = (risk) => areas.filter((area) => riskInArea(risk, area)).map((area) => describeArea(area)).join(", ");

  const renderSourceText = (risk) => riskSourceText(risk).map(([title, text]) => <OfficialText key={title} title={title} text={text} />);

  const renderAckModal = () => {
    if (!ackEntry) return null;
    const position = Math.min(ackIndex, ackList.length - 1);
    const pending = ackPendingKeys.has(ackEntry.key);
    const pendingCount = ackList.filter((item) => ackPendingKeys.has(item.key)).length;
    const analysisState = ackAnalyses[ackEntry.key] || {};
    const live = allRisks.find((risk) => risk.id === ackEntry.item.id) || null;
    const risk = live || ackEntry.item;
    const status = ackEntry.ended ? "Ended" : ackEntry.updated ? "Updated" : "New";
    const analysis = analysisState.data;
    const color = riskSeverityColor(risk);
    const inAreas = riskAreaNames(risk);
    const sourceText = renderSourceText(risk);
    return createPortal(
      <div className="satWeatherModalOverlay satWeatherAckOverlay">
        <div className="satWeatherModal satWeatherAckModal" onClick={(event) => event.stopPropagation()}>
          <div className="satWeatherModalHeader">
            <span>{`Alert ${position + 1} Of ${ackList.length}`}</span>
            <div className="satWeatherAckPager">
              {ackQueue.length > 1 && (
                <button type="button" className="satWeatherModalClose satWeatherAckAllButton" onClick={sounds.acknowledgeAll} title="Acknowledge Every Alert In The Queue"><FontAwesomeIcon icon={faCheckDouble} /> {`Acknowledge All (${ackQueue.length})`}</button>
              )}
              <button type="button" className="satWeatherModalClose" disabled={position <= 0} onClick={() => setAckIndex(position - 1)} title="Previous Alert"><FontAwesomeIcon icon={faBackwardStep} /></button>
              <button type="button" className="satWeatherModalClose" disabled={position >= ackList.length - 1} onClick={() => setAckIndex(position + 1)} title="Next Alert"><FontAwesomeIcon icon={faForwardStep} /></button>
              <button type="button" className="satWeatherModalClose" onClick={closeAckModal} title={ackReview ? "Close" : "Minimize Until The Next Alert"}><FontAwesomeIcon icon={faTimes} /></button>
            </div>
          </div>
          <div className="satWeatherModalContent">
            <div className="satWeatherAckTitle" style={{ borderLeftColor: color }}>
              <div className="satWeatherAckTitleRow">
                <span className="satWeatherAckEvent" style={{ color: liftColor(color) }}>{risk.title || "Untitled Event"}</span>
                <span className={`satWeatherAckStatus satWeatherAckStatus${status}`}>{status}</span>
              </div>
              <div className="satWeatherAckHeadline">{[risk.severity, risk.risk_category, risk.source].filter(Boolean).join(" | ")}</div>
              {risk.severity === "Critical" && !ackEntry.ended && <div className="satWeatherDetailEmergency">{`Critical ${risk.risk_category || "Hazard"} Event${inAreas ? ` In ${inAreas}` : ""}`}</div>}
            </div>
            <div className="satWeatherAckSectionTitle">Event Details</div>
            {renderDetailFields([
              ...riskBaseFields(risk),
              ["Monitored Areas", inAreas || null],
              ["Distance To Location", locationActive && risk.latitude != null ? formatNumber(riskDistanceKm(risk, selectedLat, selectedLon), " Km", 1) : null],
              ...riskMetadataFields(risk)
            ], { columns: 3, skipEmpty: true, wideAt: 26, fullAt: 40 })}
            <div className="satWeatherAckSectionTitle">AI Analysis</div>
            <div className="satWeatherAckAnalysis">
              {ackEntry.ended && <div className="satWeatherAckNote">This event has ended, so no analysis is generated for it.</div>}
              {!ackEntry.ended && analysisState.loading && <div className="satWeatherAckNote"><FontAwesomeIcon icon={faSpinner} spin /> Generating Analysis</div>}
              {!ackEntry.ended && analysisState.error && <div className="satWeatherDetailError">{`The AI analysis is unavailable because of the error "${String(analysisState.error).replace(/\.$/, "")}".`}</div>}
              {analysis && (
                <>
                  <p className="satWeatherAckSummary">{analysis.summary}</p>
                  <div className="satWeatherAckColumns">
                    <div className="satWeatherAckBlock">
                      <div className="satWeatherAckBlockTitle">Threats</div>
                      {analysis.threats.map((item, index) => <p key={index}>{item}</p>)}
                    </div>
                    <div className="satWeatherAckBlock">
                      <div className="satWeatherAckBlockTitle">Protective Actions</div>
                      {analysis.actions.map((item, index) => <p key={index}>{item}</p>)}
                    </div>
                  </div>
                  <div className="satWeatherAckColumns">
                    <div className="satWeatherAckBlock">
                      <div className="satWeatherAckBlockTitle">Timing</div>
                      <p>{analysis.timing}</p>
                    </div>
                    <div className="satWeatherAckBlock">
                      <div className="satWeatherAckBlockTitle">Confidence</div>
                      <p>{analysis.confidence}</p>
                    </div>
                  </div>
                  <div className="satWeatherAckFootnote">{`Generated By ${analysis.model} At ${formatClock(analysis.generatedAt)} From The Source Event Data`}</div>
                </>
              )}
            </div>
            <div className="satWeatherAckSectionTitle">Source Text</div>
            {sourceText.length ? sourceText : <div className="satWeatherAckNote">The source did not publish any text for this event.</div>}
          </div>
          <div className="satWeatherAckActions">
            <span className="satWeatherAckRemaining">{!pending ? "Already Acknowledged" : pendingCount === 1 ? "Last Alert To Acknowledge" : `${pendingCount - 1} More To Acknowledge`}</span>
            {risk.url && (
              <a className="satWeatherModalBtnSecondary riskModalLinkBtn" href={risk.url} target="_blank" rel="noopener noreferrer"><FontAwesomeIcon icon={faLink} /> Original Source</a>
            )}
            <button type="button" className="satWeatherModalBtnSecondary" disabled={!live} onClick={() => {
              closeAckModal();
              if (live) selectRisk(live, true);
            }}><FontAwesomeIcon icon={faLocationCrosshairs} /> View On Map</button>
            <button type="button" className="satWeatherModalBtnPrimary" disabled={!pending} onClick={() => sounds.acknowledge(ackEntry.key)}><FontAwesomeIcon icon={faCheck} /> {pending ? "Acknowledge" : "Acknowledged"}</button>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  const renderDetailCard = () => {
    if (!selected) return null;
    let icon = faTriangleExclamation;
    let color = "#4ecdc4";
    let title = "Details";
    let banner = null;
    let body = null;
    let focus = null;
    let actions = null;
    if (selected.kind === "risk") {
      const risk = selectedRisk;
      if (!risk) return null;
      const meta = riskCategoryMeta(risk.risk_category);
      const expired = isRiskEventExpired(risk);
      icon = meta.icon;
      color = liftColor(riskSeverityColor(risk));
      title = risk.title || "Untitled Event";
      banner = expired ? "This Event Has Expired" : risk.severity === "Critical" ? `Critical ${risk.risk_category || "Hazard"} Event` : null;
      focus = () => selectRisk(risk, true);
      const inAreas = riskAreaNames(risk);
      body = (
        <>
          {renderDetailFields([
            ...riskBaseFields(risk),
            ["Monitored Areas", inAreas || null],
            ["Distance To Location", locationActive && risk.latitude != null ? formatNumber(riskDistanceKm(risk, selectedLat, selectedLon), " Km", 1) : null],
            ...riskMetadataFields(risk)
          ], { skipEmpty: true })}
          {renderSourceText(risk)}
        </>
      );
      actions = (
        <div className="riskDetailActions">
          <button type="button" className="satEarthCondBtn satEarthCondBtnSecondary satWeatherBtnElide" onClick={() => setBriefOpen(true)} title="Open The Intelligence Brief For This Event">
            <FontAwesomeIcon icon={faBrain} /> <span>Intelligence Brief</span>
          </button>
          <button type="button" className="satEarthCondBtn satEarthCondBtnSecondary satWeatherBtnElide" disabled={risk.latitude == null || isAssessingLocation} onClick={() => assessLocationRisk(risk.latitude, risk.longitude, Math.max(50, Math.round(risk.impact_radius_km || 100)))} title="Assess The Risk Around This Event">
            <FontAwesomeIcon icon={isAssessingLocation ? faSpinner : faShieldHalved} spin={isAssessingLocation} /> <span>Assess Location</span>
          </button>
          <button type="button" className="satEarthCondBtn satEarthCondBtnSecondary satWeatherBtnElide" disabled={risk.latitude == null} onClick={() => openNearbyQueryModal(risk.latitude, risk.longitude)} title="Find Events Near This One">
            <FontAwesomeIcon icon={faBullseye} /> <span>Nearby Query</span>
          </button>
          {risk.url ? (
            <a className="satEarthCondBtn satEarthCondBtnSecondary satWeatherBtnElide" href={risk.url} target="_blank" rel="noopener noreferrer" title="Open The Original Source">
              <FontAwesomeIcon icon={faLink} /> <span>Original Source</span>
            </a>
          ) : (
            <button type="button" className="satEarthCondBtn satEarthCondBtnSecondary satWeatherBtnElide" disabled={!expired} onClick={() => {
              removeRisksFromStreamingData((item) => item.id === risk.id);
              clearSelection();
            }} title="Remove This Expired Event">
              <FontAwesomeIcon icon={faTrash} /> <span>Dismiss Expired</span>
            </button>
          )}
        </div>
      );
    } else if (selected.kind === "feature") {
      const feature = selectedFeature;
      if (!feature) return null;
      const details = featureDetails;
      const measurements = featureMeasurements;
      icon = feature.type === "building" ? faBuilding : faObjectGroup;
      title = feature.name;
      focus = zoomToFeature;
      const address = details && details.address ? [[details.address.housenumber, details.address.street].filter(Boolean).join(" "), details.address.city, details.address.state, details.address.postcode, details.address.country].filter(Boolean).join(", ") : null;
      body = (
        <>
          {renderDetailFields([
            ["Feature Type", titleCaseWords(feature.tags[feature.type] && feature.tags[feature.type] !== "yes" ? `${feature.type} ${feature.tags[feature.type]}` : feature.type)],
            ["OSM ID", `${titleCaseWords(feature.osmType)} ${feature.id}`],
            ["Area", measurements ? formatArea(measurements.area) : null],
            ["Perimeter", measurements ? formatMeters(measurements.perimeter) : null],
            ["North To South", measurements && measurements.dimensions ? formatMeters(measurements.dimensions.northSouth) : null],
            ["East To West", measurements && measurements.dimensions ? formatMeters(measurements.dimensions.eastWest) : null],
            ["Vertices", measurements ? formatNumber(measurements.vertexCount) : null],
            ["Centroid", formatCoords(feature.centroid.lat, feature.centroid.lng)],
            ["Address", address],
            ["Elevation", details && details.elevationInfo ? `${formatNumber(details.elevationInfo.groundElevation, " M")} (${formatNumber(details.elevationInfo.elevationFeet, " Ft")})` : null],
            ["Levels", details && details.buildingInfo ? details.buildingInfo.levels : null],
            ["Height", details && details.buildingInfo ? details.buildingInfo.height : null],
            ["Operator", details && details.buildingInfo ? details.buildingInfo.operator : null],
            ["Administrative Areas", details && details.adminBoundaries.length ? details.adminBoundaries.slice(0, 4).map((item) => item.name).join(", ") : null],
            ["Land Use", details && details.landUseContext.length ? details.landUseContext.slice(0, 4).map((item) => titleCaseWords(item.type)).join(", ") : null],
            ["Nearby Streets", details && details.nearbyStreets.length ? details.nearbyStreets.slice(0, 4).map((item) => item.name).join(", ") : null],
            ["Nearby Places", details && details.nearbyPOIs.length ? details.nearbyPOIs.filter((item) => item.name).slice(0, 4).map((item) => item.name).join(", ") || null : null],
            ["Time Zone", details ? details.geographicInfo.timezone : null],
            ["Climate Zone", details ? details.geographicInfo.climateZone : null],
            ["Hemisphere", details ? details.geographicInfo.hemisphere : null]
          ], { skipEmpty: true })}
          {isFetchingDetails && <div className="satWeatherDetailNote">Loading Location Details</div>}
          {details && details.wikipediaInfo && details.wikipediaInfo.extract && <OfficialText title={details.wikipediaInfo.title || "Wikipedia"} text={details.wikipediaInfo.extract} />}
        </>
      );
      actions = (
        <div className="riskDetailActions">
          <button type="button" className="satEarthCondBtn satEarthCondBtnSecondary satWeatherBtnElide" onClick={() => setBriefOpen(true)} title="Open The Intelligence Brief For This Feature">
            <FontAwesomeIcon icon={faBrain} /> <span>Intelligence Brief</span>
          </button>
          <button type="button" className="satEarthCondBtn satEarthCondBtnSecondary satWeatherBtnElide" disabled={isAssessingLocation} onClick={() => assessLocationRisk(feature.centroid.lat, feature.centroid.lng, 50)} title="Assess The Risk Around This Feature">
            <FontAwesomeIcon icon={isAssessingLocation ? faSpinner : faShieldHalved} spin={isAssessingLocation} /> <span>Assess Location</span>
          </button>
        </div>
      );
    }
    return (
      <div className="satWeatherDetailCard">
        <div className="satWeatherDetailHeader">
          <span className="satWeatherDetailIcon" style={{ color }}><FontAwesomeIcon icon={icon} /></span>
          <span className="satWeatherDetailTitle" title={title}>{title}</span>
          {focus && (
            <button type="button" className="satWeatherDetailButton" onClick={focus} title="Zoom To">
              <FontAwesomeIcon icon={faLocationCrosshairs} />
            </button>
          )}
          <button type="button" className="satWeatherDetailButton" onClick={clearSelection} title="Close">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
        {banner && <div className="satWeatherDetailEmergency">{banner}</div>}
        <div className="satWeatherDetailScroll">{body}</div>
        {actions}
      </div>
    );
  };

  const renderHoverTooltip = () => {
    if (!hoverInfo || !hoverInfo.object || activeProvider !== MAP_PROVIDER_DECKGL) return null;
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

  const topCritical = criticalRisks[0] || null;

  const renderMapView = () => (
    <div className="satWeatherMapView" style={{ display: activeTab === "map" ? "flex" : "none" }}>
      <div className="satWeatherViewHeader">
        <div className="satWeatherHeaderControls">
          {(refreshing || riskIntelligenceLoading) && (
            <div className="satWeatherLocationDisplay">
              <FontAwesomeIcon icon={faSpinner} spin className="satWeatherLocationIcon" />
            </div>
          )}
          <div className="satWeatherLocationDisplay">
            <FontAwesomeIcon icon={faLocationCrosshairs} className="satWeatherLocationIcon" />
            <span>{`${viewState.lat.toFixed(2)}°, ${viewState.lon.toFixed(2)}° | Zoom ${viewState.zoom.toFixed(1)}`}</span>
          </div>
          <div className="satWeatherCameraInfo"><span>{`Events In View: ${risksInView.length.toLocaleString()}`}</span></div>
          <button className={`satWeatherHeaderButton ${showSatellite ? "" : "satWeatherButtonActive"}`} onClick={() => setShowSatellite((value) => !value)} title={showSatellite ? "Switch To The Topographic Map" : "Switch To Satellite Imagery"}>
            <FontAwesomeIcon icon={faMap} /> Topo
          </button>
          <button className={`satWeatherHeaderButton ${showHeatmap ? "satWeatherButtonActive" : ""}`} onClick={() => setShowHeatmap((value) => !value)} title={showHeatmap ? "Show Event Markers" : "Show The Event Heatmap"}>
            <FontAwesomeIcon icon={faFireFlameCurved} /> Heatmap
          </button>
          <button className={`satWeatherHeaderButton ${selectionMode ? "satWeatherButtonActive" : ""}`} onClick={() => {
            if (selectionMode) clearFeatureSelection();
            setSelectionMode((value) => !value);
          }} title={selectionMode ? "Stop Selecting Map Features" : "Select A Map Feature To Measure It"}>
            <FontAwesomeIcon icon={faObjectGroup} /> Select
          </button>
          <button
            className={`satWeatherHeaderButton ${areaFilterActive ? "satWeatherButtonActive" : ""}`}
            onClick={toggleAreaFilter}
            title={userArea ? `${areaFilterActive ? "Disable" : "Enable"} Area Filter` : "Add A Monitored Area"}
          >
            <FontAwesomeIcon icon={faMapPin} />
            {userArea ? `Area Filter: ${areaFilterActive ? "On" : "Off"}` : "Add Area"}
          </button>
          <button className="satWeatherHeaderButton" onClick={resetView} title={locationActive ? "Return To Selected Location" : "Reset To Globe View"}>
            <FontAwesomeIcon icon={faGlobe} /> Reset View
          </button>
        </div>
      </div>
      <div className={`satWeatherMapWrapper ${selected ? "satWeatherMapWrapperDetail" : ""}`}>
        <div ref={mapContainerRef} className={`satWeatherMapContainer ${selectionMode ? "riskMapSelectionCursor" : ""}`} onMouseLeave={() => setHoverInfo(null)} />
        {selectionMode ? (
          <div className="satWeatherModeIndicator" style={{ zIndex: 2000 }}>
            <span className="satWeatherModePulse" />
            <span>{isSelectingFeature ? "Identifying The Selected Feature" : "Selection Mode Is On. Click Any Feature To Identify And Measure It."}</span>
          </div>
        ) : topCritical && (
          <button type="button" className="satWeatherModeIndicator satWeatherModeIndicatorAlert" style={{ zIndex: 2000 }} onClick={() => selectRisk(topCritical, true)}>
            <span className="satWeatherModePulse" />
            <span>{criticalRisks.length === 1 ? topCritical.title : `${criticalRisks.length} Critical Events ${activeAreas ? "In Your Areas" : locationActive ? "Near This Location" : "Active"}`}</span>
          </button>
        )}
        {renderDetailCard()}
        {renderHoverTooltip()}
        {(selectionError || mapError) && (
          <div className="satWeatherMapError" style={{ zIndex: 2000 }}>{selectionError || mapError}</div>
        )}
        {!mapReady && (
          <div className="satWeatherMapLoadingOverlay" style={{ zIndex: 2001 }}>
            <div className="satWeatherMapLoadingContent">
              <div className="loading-circle" />
              {mapError && <small className="satWeatherMapProviderError">{mapError}</small>}
            </div>
          </div>
        )}
      </div>
      {briefOpen && (selectedRisk || selectedFeature) && (
        <IntelligenceBriefCenter
          selectedRisk={selected && selected.kind === "risk" ? selectedRisk : null}
          selectedFeature={selected && selected.kind === "feature" ? selectedFeature : null}
          featureMeasurements={featureMeasurements}
          featureDetails={featureDetails}
          isFetchingDetails={isFetchingDetails}
          riskEventExpired={Boolean(selectedRisk && isRiskEventExpired(selectedRisk))}
          username={username}
          orgid={orgid}
          onClose={() => setBriefOpen(false)}
          onCloseRisk={() => setBriefOpen(false)}
          onCloseFeature={() => setBriefOpen(false)}
          onNavigateToRisk={(risk) => selectRisk(risk, true)}
          onDismissExpired={() => {
            if (selectedRisk) removeRisksFromStreamingData((item) => item.id === selectedRisk.id);
            clearSelection();
          }}
          onRefreshRisk={refreshAll}
          onAssessLocation={assessLocationRisk}
          onOpenNearby={openNearbyQueryModal}
          onZoomToFeature={zoomToFeature}
          expandedRiskSections={expandedRiskSections}
          toggleRiskSection={toggleRiskSection}
          getMetadataRenderer={getMetadataRenderer}
          viewportBbox={areaBoundingBox(userArea)}
        />
      )}
    </div>
  );

  const renderAssessmentPanels = (assessment, label, options = {}) => {
    const result = assessment.assessment || {};
    const place = assessment.location || {};
    const color = SEVERITY_COLORS[titleCaseWords(String(result.risk_level || "").toLowerCase())] || "#4ecdc4";
    const tiles = [
      { label: "Risk Score", value: formatNumber(result.risk_score), detail: `${titleCaseWords(String(result.risk_level || "Unknown").toLowerCase())} Risk`, color, icon: faShieldHalved },
      { label: "Risks Nearby", value: formatNumber(result.total_risks_nearby), detail: `Within ${formatNumber(assessment.radius_km, " Km")}`, icon: faTriangleExclamation },
      { label: "Nearest City", value: place.nearest_city || "—", detail: place.population_density ? titleCaseWords(place.population_density) : "Population Density Unknown", icon: faMapMarkerAlt },
      { label: "Population Exposure", value: result.population_exposure ? formatCompact(result.population_exposure.estimated_population) : "—", detail: result.population_exposure && result.population_exposure.density ? titleCaseWords(result.population_exposure.density) : "No Estimate", icon: faChartBar },
      { label: "Ground Deformation", value: formatNumber(result.ground_deformation_zones || 0), detail: "Active Sentinel-1 Zones", color: result.ground_deformation_zones ? "#B388FF" : undefined, icon: faLayerGroup },
      { label: "Infrastructure", value: formatNumber((place.critical_infrastructure_nearby || []).length), detail: "Critical Sites Nearby", icon: faIndustry }
    ];
    const factors = result.risk_factors || [];
    const nearby = assessment.nearby_risks || [];
    const infrastructure = place.critical_infrastructure_nearby || [];
    const coords = place.latitude != null ? formatCoords(place.latitude, place.longitude) : "";
    return [
      [{
        title: label,
        badge: "COMPUTED",
        content: (
          <>
            {renderTiles(tiles)}
            {options.actions && (
              <div className="riskPanelActions">
                <button type="button" className="satEarthCondBtn satEarthCondBtnSecondary satWeatherBtnElide" onClick={() => openNearbyQueryModal(place.latitude, place.longitude, assessment.radius_km)}>
                  <FontAwesomeIcon icon={faBullseye} /> <span>Spatial Query</span>
                </button>
                <button type="button" className="satEarthCondBtn satEarthCondBtnSecondary satWeatherBtnElide" onClick={() => {
                  setEditingAreaId(null);
                  setAreaFormData({ ...INITIAL_AREA_FORM, mode: "point_radius", name: place.nearest_city || "", latitude: String(place.latitude), longitude: String(place.longitude), radius_km: String(assessment.radius_km || 100) });
                  setAssessmentModal(null);
                  setAreaModalOpen(true);
                }}>
                  <FontAwesomeIcon icon={faMapPin} /> <span>Monitor This Area</span>
                </button>
              </div>
            )}
          </>
        ),
        description: `The assessment scores every event within ${formatNumber(assessment.radius_km, " Km")} of ${coords} by severity, distance, and impact radius, and adds active ground deformation and nearby critical infrastructure.`
      }],
      [{
        title: `Contributing Risk Factors (${factors.length})`,
        badge: "COMPUTED",
        content: renderTable("Contributing Risk Factors", ["Factor", "Severity", "Category", "Distance", "Contribution", "Recommendation"], factors.map((factor) => [
          { value: factor.title, color: liftColor(SEVERITY_COLORS[factor.severity] || "#ffd93d") },
          factor.severity,
          factor.category,
          factor.distance_km != null ? formatNumber(factor.distance_km, " Km", 1) : null,
          factor.contribution != null ? `+${factor.contribution}` : null,
          (factor.recommendations || []).join(" ")
        ]), { emptyText: "No single event contributes to the score here." }),
        description: "Each factor is an event that raised the score, with the points it added and what to do about it."
      }],
      [
        {
          title: `Nearby Events (${nearby.length})`,
          badge: "LIVE",
          content: renderTable("Nearby Events", ["Event", "Severity", "Category", "Distance"], nearby.slice(0, SOURCES.tables.maxRows).map((risk) => [
            { value: risk.title, color: liftColor(riskSeverityColor(risk)) },
            risk.severity,
            risk.risk_category,
            risk.distance_km != null ? formatNumber(risk.distance_km, " Km", 1) : null
          ]), { emptyText: "No events were found within this radius.", onRowClick: (index) => { setAssessmentModal(null); selectRisk(nearby[index], true); } }),
          description: "Events inside the assessment radius, closest first. Select a row to open the event on the map."
        },
        {
          title: `Critical Infrastructure (${infrastructure.length})`,
          badge: "COMPUTED",
          content: renderTable("Critical Infrastructure", ["Site", "Type", "Distance"], infrastructure.map((site) => [site.name || titleCaseWords(site.type), site.type ? titleCaseWords(site.type) : null, site.distance_km != null ? formatNumber(site.distance_km, " Km", 1) : null]), { emptyText: "No critical infrastructure was found nearby." }),
          description: "Hospitals, power plants, airports, and other critical sites near the assessed point."
        }
      ]
    ];
  };

  const renderLocalRisk = () => {
    if (!localScope) {
      return [[{ title: "Local Risk", badge: "COMPUTED", content: <div className="satEarthCondNoChartData">Choose A Location To See Local Risk</div>, description: "Pick a place in the sidebar to see its risk score, the events that contribute to it, nearby critical infrastructure, and every event within the selected radius." }]];
    }
    const title = localScope.area ? `Local Risk In ${localScope.label}` : `Local Risk At ${localScope.label}`;
    if (!localAssessment) {
      return [[{ title, badge: "COMPUTED", content: <div className="satEarthCondNoChartData">{localAssessmentError || (localScope.area ? "Assessing This Area" : "Assessing This Location")}</div>, description: `The assessment covers ${formatNumber(localScope.radius, " Km")} around ${formatCoords(localScope.lat, localScope.lon)}.` }]];
    }
    return renderAssessmentPanels(localAssessment, title, { actions: true });
  };

  const renderOverviewTab = () => {
    const summary = scopedSummary;
    const statusLabel = summary.critical > 0 ? "Severe" : summary.high > 0 ? "Elevated" : "Nominal";
    const statusColor = summary.critical > 0 ? "#ff6b6b" : summary.high > 0 ? "#FF9500" : "#4ecdc4";
    const reporting = sourceStatus.filter((source) => source.last_success_at && !source.last_error).length;
    const tiles = [
      { label: "Active Events", value: formatNumber(summary.total), detail: `${formatNumber(summary.critical)} Critical | ${formatNumber(summary.high)} High`, icon: faTriangleExclamation },
      { label: "Overall Status", value: statusLabel, detail: activeAreas ? "Within Your Monitored Areas" : locationActive ? `Within ${formatNumber(areaRadius, " Km")} Of ${locationName}` : "Across All Loaded Events", color: statusColor, icon: faShieldHalved },
      { label: "Critical Events", value: formatNumber(summary.critical), detail: criticalRisks[0] ? criticalRisks[0].title : "None Active", color: summary.critical ? "#ff6b6b" : "#4ecdc4", icon: faXmarkSquare },
      { label: "High Events", value: formatNumber(summary.high), detail: "Severity Rated High", color: summary.high ? "#FF9500" : "#4ecdc4", icon: faBell },
      { label: "Medium And Low", value: formatNumber(summary.medium + summary.low), detail: `${formatNumber(summary.medium)} Medium | ${formatNumber(summary.low)} Low`, icon: faList },
      { label: "Categories Reporting", value: `${Object.keys(EMPTY_RISK_DATA).length - categoriesWithoutData.size} Of ${Object.keys(EMPTY_RISK_DATA).length}`, detail: categoriesWithoutData.size ? `${categoriesWithoutData.size} Without Data` : "Every Category Has Data", icon: faLayerGroup },
      { label: "Sources Reporting", value: `${reporting} Of ${sourceStatus.length}`, detail: sourceStatus.length - reporting ? `${sourceStatus.length - reporting} Not Reporting` : "Every Source Is Healthy", color: sourceStatus.length && reporting < sourceStatus.length ? "#FF9500" : undefined, icon: faBroadcastTower },
      { label: "Monitored Areas", value: formatNumber(areas.length), detail: areaFilterActive && areas.length ? "Area Filter On" : "Area Filter Off", icon: faMapPin }
    ];
    const byCategory = {};
    const bySource = {};
    for (const risk of scopedRisks) {
      const category = risk.risk_category || "Other";
      byCategory[category] = (byCategory[category] || 0) + 1;
      const source = risk.source || "Unknown";
      bySource[source] = (bySource[source] || 0) + 1;
    }
    const categoryEntries = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 15);
    const sourceEntries = Object.entries(bySource).sort((a, b) => b[1] - a[1]).slice(0, 15);
    const categoryChart = createBarChart("Events By Category", categoryEntries.map(([name]) => name), categoryEntries.map(([, count]) => count), "", "#4ecdc4", true, categoryEntries.map(([name]) => riskCategoryMeta(name).color));
    const severityChart = createBarChart("Events By Severity", PRIORITY_OPTIONS, PRIORITY_OPTIONS.map((severity) => summary[severity.toLowerCase()]), "", "#4ecdc4", true, PRIORITY_OPTIONS.map((severity) => SEVERITY_COLORS[severity]));
    const sourceChart = createBarChart("Events By Source", sourceEntries.map(([name]) => name), sourceEntries.map(([, count]) => count), "", "#42a5f5", true);
    const hours = 48;
    const now = Date.now();
    const buckets = Array.from({ length: hours }, (_, index) => new Date(now - (hours - 1 - index) * 3600000));
    const timeline = (filter) => buckets.map((bucket) => scopedRisks.filter((risk) => {
      const time = Date.parse(risk.event_time || "");
      return Number.isFinite(time) && time >= bucket.getTime() - 3600000 && time < bucket.getTime() && filter(risk);
    }).length);
    const timelineChart = createLineChart("Events Over Time", buckets.map((bucket) => bucket.toLocaleString([], { month: "short", day: "numeric", hour: "numeric" })), [
      { name: "All Events", data: timeline(() => true), color: "#4ecdc4" },
      { name: "Critical And High", data: timeline((risk) => (SEVERITY_ORDER[risk.severity] || 0) >= 3), color: "#ff6b6b" }
    ]);
    const scopeLabel = activeAreas ? `Risk In ${activeAreasLabel}` : locationActive ? `Risk Within ${formatNumber(areaRadius, " Km")} Of ${locationName}` : "Global Risk Summary";
    return (
      <div className="satEarthCondOverviewTab">
        {renderSection(scopeLabel, faShieldHalved, [
          [{ title: "Risk Summary", badge: "LIVE", content: renderTiles(tiles), description: `Counts cover every ${labelFor(SEVERITY_FILTER_OPTIONS, severityFilter).toLowerCase()} event ${activeAreas ? "inside your monitored areas" : locationActive ? "near the selected location" : "worldwide"}. Change the Severity filter in the sidebar to widen or narrow it.` }],
          [
            { title: "Events By Category", badge: "LIVE", chart: categoryChart, content: renderChart(categoryChart), axes: ["Events", "Category"], description: "The categories with the most active events, drawn in each category's map color." },
            { title: "Events By Severity", badge: "LIVE", chart: severityChart, content: renderChart(severityChart), axes: ["Events", "Severity"], description: "How the active events split across the four severity ratings." }
          ],
          [
            { title: "Events By Source", badge: "LIVE", chart: sourceChart, content: renderChart(sourceChart), axes: ["Events", "Source"], description: "The data sources contributing the most active events." },
            { title: "Events Over Time", badge: "COMPUTED", chart: timelineChart, content: renderChart(timelineChart), axes: ["Time", "Events"], description: "Active events by the hour they began over the last 48 hours." }
          ]
        ])}
        {renderSection("Local Risk", faMapMarkerAlt, renderLocalRisk())}
      </div>
    );
  };

  const renderEventsTab = () => {
    const list = scopedRisks.slice(0, SOURCES.tables.maxRows);
    return (
      <div className="satEarthCondOverviewTab">
        {renderSection(activeAreas ? `Events In ${activeAreasLabel}` : locationActive ? `Events Within ${formatNumber(areaRadius, " Km")} Of ${locationName}` : "Active Events", faTriangleExclamation, [
          [{
            title: `${labelFor(SEVERITY_FILTER_OPTIONS, severityFilter)} (${scopedRisks.length.toLocaleString()})`,
            badge: "LIVE",
            content: renderTable("Active Events", ["Event", "Severity", "Category", "Source", "Event Time", "Expires", "Impact Radius", "Position"], list.map((risk) => riskRow(risk, [risk.latitude != null ? formatCoords(risk.latitude, risk.longitude) : null])), { emptyText: activeAreas ? "No events of this severity are inside your monitored areas." : "No events of this severity are active.", onRowClick: (index) => selectRisk(list[index], true) }),
            description: `${scopedRisks.length > list.length ? `Showing the first ${list.length} of ${scopedRisks.length.toLocaleString()} events. ` : ""}Events are ordered by severity and then by how recently they began. Change the Severity filter in the sidebar to include lower severities. Select a row to open the event on the map.`
          }]
        ])}
      </div>
    );
  };

  const renderAreaTab = () => {
    if (!userArea) {
      return (
        <div className="satEarthCondOverviewTab">
          {renderSection("Area Assessment", faShieldHalved, [[{ title: "Area Assessment", badge: "COMPUTED", content: <div className="satEarthCondNoChartData">Add A Monitored Area To Assess It</div>, description: "Monitored areas track every hazard inside them. Add one from the sidebar to see its composite threat score and every hazard affecting it." }]])}
        </div>
      );
    }
    const view = assessmentViewState;
    const hazards = selectedAreaHazards.filter((risk) => view.catFilter === "all" || risk.risk_category === view.catFilter);
    const sorted = hazards.slice().sort((a, b) => {
      if (view.sortField === "distance") return (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity);
      if (view.sortField === "severity") return (SEVERITY_ORDER[b.severity] || 0) - (SEVERITY_ORDER[a.severity] || 0);
      if (view.sortField === "time") return (Date.parse(b.event_time || "") || 0) - (Date.parse(a.event_time || "") || 0);
      return (b.area_exposure_score || 0) - (a.area_exposure_score || 0);
    });
    const sevCounts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    const catCounts = {};
    const sourceCounts = {};
    let closest = null;
    const inImpact = [];
    for (const risk of hazards) {
      if (sevCounts[risk.severity] !== undefined) sevCounts[risk.severity] += 1;
      catCounts[risk.risk_category || "Other"] = (catCounts[risk.risk_category || "Other"] || 0) + 1;
      sourceCounts[risk.source || "Unknown"] = (sourceCounts[risk.source || "Unknown"] || 0) + 1;
      if (risk.distance_km != null && (!closest || risk.distance_km < closest.distance_km)) closest = risk;
      if (risk.impact_radius_km != null && risk.distance_km != null && risk.distance_km <= risk.impact_radius_km) inImpact.push(risk);
    }
    const score = hazards.length ? Math.min(100, Math.round((sevCounts.Critical * 25 + sevCounts.High * 10 + sevCounts.Medium * 4 + sevCounts.Low) / Math.max(1, hazards.length) * 4 + (sevCounts.Critical > 0 ? 20 : 0) + (inImpact.length > 0 ? 15 : 0))) : 0;
    const scoreColor = score >= 60 ? "#ff6b6b" : score >= 40 ? "#FF9500" : score >= 20 ? "#ffd93d" : "#4ecdc4";
    const topCategories = Object.entries(catCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const topSources = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const tiles = [
      { label: "Composite Threat Score", value: `${score}`, detail: "Out Of 100", color: scoreColor, icon: faShieldHalved },
      { label: "Hazards Affecting Area", value: formatNumber(hazards.length), detail: `${formatNumber(sevCounts.Critical)} Critical | ${formatNumber(sevCounts.High)} High`, icon: faTriangleExclamation },
      { label: "Closest Threat", value: closest ? formatNumber(closest.distance_km, " Km", 1) : "—", detail: closest ? closest.title : "No Hazards", icon: faRuler },
      { label: "Dominant Category", value: topCategories[0] ? topCategories[0][0] : "—", detail: topCategories[0] ? `${topCategories[0][1]} Events` : "No Hazards", icon: faChartBar },
      { label: "Primary Source", value: topSources[0] ? topSources[0][0] : "—", detail: topSources[0] ? `${topSources[0][1]} Events` : "No Hazards", icon: faDatabase },
      { label: "Inside Impact Radius", value: formatNumber(inImpact.length), detail: "Events Whose Impact Reaches The Center", color: inImpact.length ? "#FF9500" : undefined, icon: faBullseye }
    ];
    const severityChart = createBarChart("Severity Breakdown", PRIORITY_OPTIONS, PRIORITY_OPTIONS.map((severity) => sevCounts[severity]), "", "#4ecdc4", true, PRIORITY_OPTIONS.map((severity) => SEVERITY_COLORS[severity]));
    const categoryChart = createBarChart("Hazards By Category", topCategories.map(([name]) => name), topCategories.map(([, count]) => count), "", "#4ecdc4", true, topCategories.map(([name]) => riskCategoryMeta(name).color));
    const sourceChart = createBarChart("Hazards By Source", topSources.map(([name]) => name), topSources.map(([, count]) => count), "", "#42a5f5", true);
    const categories = Array.from(new Set(selectedAreaHazards.map((risk) => risk.risk_category).filter(Boolean))).sort();
    const rows = sorted.slice(0, SOURCES.tables.maxRows);
    const areaName = describeArea(userArea);
    return (
      <div className="satEarthCondOverviewTab">
        {renderSection(`Assessment For ${areaName}`, faShieldHalved, [
          [{ title: "Area Threat Summary", badge: "COMPUTED", content: renderTiles(tiles), description: "The composite threat score weighs how many hazards affect the area, how severe they are, and whether any reach the area center with their impact radius. Choose another area in the sidebar to assess it." }],
          [
            { title: "Severity Breakdown", badge: "COMPUTED", chart: severityChart, content: renderChart(severityChart), axes: ["Hazards", "Severity"], description: "How the hazards affecting this area split across the four severity ratings." },
            { title: "Hazards By Category", badge: "COMPUTED", chart: categoryChart, content: renderChart(categoryChart), axes: ["Hazards", "Category"], description: "The kinds of hazards affecting this area." },
            { title: "Hazards By Source", badge: "COMPUTED", chart: sourceChart, content: renderChart(sourceChart), axes: ["Hazards", "Source"], description: "The sources reporting hazards in this area." }
          ],
          [{
            title: `Hazards Affecting ${areaName} (${hazards.length.toLocaleString()})`,
            badge: "LIVE",
            content: (
              <>
                <div className="riskPanelToolbar">
                  <Dropdown
                    value={view.catFilter === "all" ? "All Categories" : view.catFilter}
                    onChange={(option) => setAssessmentViewState((current) => ({ ...current, catFilter: option === "All Categories" ? "all" : option }))}
                    options={["All Categories", ...categories]}
                    placeholder="Category"
                  />
                  <Dropdown
                    value={labelFor(ASSESSMENT_SORT_OPTIONS, view.sortField)}
                    onChange={(option) => setAssessmentViewState((current) => ({ ...current, sortField: valueFor(ASSESSMENT_SORT_OPTIONS, option) }))}
                    options={ASSESSMENT_SORT_OPTIONS.map(([, label]) => label)}
                    placeholder="Sort"
                  />
                </div>
                {renderTable("Hazards", ["Event", "Severity", "Category", "Source", "Distance", "Impact Radius", "Exposure", "In Radius", "Event Time"], rows.map((risk) => [
                  { value: risk.title || "Untitled Event", color: liftColor(riskSeverityColor(risk)) },
                  risk.severity,
                  risk.risk_category,
                  risk.source,
                  risk.distance_km != null ? formatNumber(risk.distance_km, " Km", 1) : null,
                  risk.impact_radius_km != null ? formatNumber(risk.impact_radius_km, " Km", 1) : null,
                  { value: risk.area_exposure_score, color: risk.area_exposure_score >= 60 ? "#ff6b6b" : risk.area_exposure_score >= 40 ? "#FF9500" : undefined },
                  risk.impact_radius_km != null && risk.distance_km != null && risk.distance_km <= risk.impact_radius_km ? "Yes" : "No",
                  risk.event_time ? formatRelativeTime(risk.event_time) : null
                ]), { emptyText: selectedAreaHazards.length ? "No hazards match this category." : `No ${labelFor(SEVERITY_FILTER_OPTIONS, severityFilter).toLowerCase()} hazards currently affect this area.`, onRowClick: (index) => selectRisk(rows[index], true) })}
              </>
            ),
            description: `${hazards.length > rows.length ? `Showing the first ${rows.length} of ${hazards.length.toLocaleString()} hazards. ` : ""}Exposure combines severity with distance from the area center. The Severity filter in the sidebar applies here too. Select a row to open the hazard on the map.`
          }]
        ])}
      </div>
    );
  };

  const renderSourcesTab = () => {
    const panels = sourceStatus.map((source) => {
      const status = sourceStatusLabel(source);
      const tiles = [
        { label: "Status", value: status.label, color: status.color, icon: faBroadcastTower },
        { label: "Last Result", value: formatNumber(source.last_count), detail: source.last_success_at ? `Succeeded ${formatRelativeTime(source.last_success_at)}` : "No Successful Run Yet", icon: faClock },
        { label: "In Your Areas", value: formatNumber(source.in_areas), detail: "Events Inside Monitored Areas", icon: faMapPin },
        { label: "In Memory", value: formatNumber(source.in_memory), detail: "Events Held By The Server", icon: faDatabase },
        { label: "Categories", value: formatNumber((source.categories || []).length), detail: (source.categories || []).map((category) => (RISK_INTELLIGENCE_CATEGORIES.find((item) => item.id === category) || { name: titleCaseWords(category) }).name).join(", ") || "None", icon: faLayerGroup }
      ];
      return [{ title: source.name || source.key, badge: "LIVE", content: <>{renderSourceAlert(sourceAlert(source), false)}{renderTiles(tiles)}</>, description: `${source.last_run_at ? `The server last polled this source ${formatRelativeTime(source.last_run_at).toLowerCase()}.` : "The server has not polled this source yet."}` }];
    });
    const coverageTiles = [
      { label: "Live Stream", value: liveConnected ? "Connected" : "Reconnecting", detail: snapshotLoaded ? "Global Snapshot Loaded" : "Loading The Global Snapshot", color: liveConnected ? "#4ecdc4" : "#FF9500", icon: faBroadcastTower },
      { label: "Hazard Refresh", value: riskIntelligenceLastUpdated ? formatClock(riskIntelligenceLastUpdated.toISOString()) : "—", detail: riskIntelligenceError || `Every ${labelFor(REFRESH_INTERVAL_OPTIONS, refreshInterval)}`, color: riskIntelligenceError ? "#ff6b6b" : undefined, icon: faRefresh },
      { label: "Events Loaded", value: formatNumber(allRisks.length), detail: `${formatNumber(allRisks.filter((risk) => risk._live).length)} From The Live Feed`, icon: faDatabase },
      { label: "Categories Without Data", value: formatNumber(categoriesWithoutData.size), detail: Array.from(categoriesWithoutData).map((id) => (RISK_INTELLIGENCE_CATEGORIES.find((item) => item.id === id) || { name: id }).name).join(", ") || "None", color: categoriesWithoutData.size ? "#FF9500" : undefined, icon: faLayerGroup },
      { label: "Registered Sources", value: formatNumber(riskDataSources.length || sourceStatus.length), detail: "Configured On The Server", icon: faSatellite },
      { label: "Map Provider", value: activeProvider === MAP_PROVIDER_APPLE ? "Apple Maps" : "MapLibre", detail: appleMapReadyRef.current ? "Apple Maps Takes Over At Close Zoom" : "Apple Maps Unavailable", icon: faMap }
    ];
    return (
      <div className="satEarthCondOverviewTab">
        {renderSection("Live Sources", faBroadcastTower, panels.length ? panels : [[{ title: "Sources", badge: "LIVE", content: <div className="satEarthCondNoChartData">{sourceStatusError || "Waiting For The First Update"}</div>, description: "Source status appears after the server answers its first request." }]])}
        {renderSection("Coverage", faLayerGroup, [
          [{ title: "Coverage", badge: "COMPUTED", content: renderTiles(coverageTiles), description: "The live stream loads every event the server holds worldwide and then pushes changes as each source is ingested. The hazard refresh keeps your monitored areas current." }]
        ])}
      </div>
    );
  };

  const renderCurrentTabContent = () => {
    switch (activeTab) {
      case "overview": return renderOverviewTab();
      case "events": return renderEventsTab();
      case "assessment": return renderAreaTab();
      case "sources": return renderSourcesTab();
      default: return null;
    }
  };

  const sidebarErrors = [
    ["Hazards", riskIntelligenceError],
    ["Source Status", sourceStatusError],
    ["Local Risk", localScope ? localAssessmentError : null],
    ["Map", mapError]
  ].filter(([, message]) => message);

  const notReporting = sourceStatus.filter((source) => source.last_error);

  const renderControlsPanel = () => (
    <div className="satEarthCondControlsPanel">
      <div className="satWeatherAreaList">
        <div className="satWeatherAreaListHeader">
          <span className="satWeatherAreaListTitle"><FontAwesomeIcon icon={faMapPin} /> Monitored Areas</span>
          <button className="satWeatherAreaListButton" onClick={() => openAreaModal(null)} title="Add Area"><FontAwesomeIcon icon={faPlus} /></button>
        </div>
        {areas.length === 0 ? (
          <div className="satWeatherAreaListEmpty">Add an area to start tracking the hazards inside it.</div>
        ) : (
          <div className="satWeatherAreaListItems">
            {areas.map((area) => {
              const summary = areaRiskCounts[area.area_id] || {};
              const isSelected = area.area_id === selectedAreaId;
              return (
                <div key={area.area_id} className={`satWeatherAreaListItem${isSelected ? " satWeatherAreaListItemSelected" : ""}`} onClick={() => selectArea(area)}>
                  <span className="satWeatherAreaListItemDot" style={{ backgroundColor: summary.top ? AREA_HIGHLIGHT_COLORS[summary.top] : "#3d4354" }} />
                  <div className="satWeatherAreaListItemInfo">
                    <span className="satWeatherAreaListItemName">{area.name || describeArea(area)}</span>
                    <span className="satWeatherAreaListItemMeta">{summary.total || 0} Event{summary.total === 1 ? "" : "s"} · {summary.critical || 0} Critical</span>
                  </div>
                  <button className="satWeatherAreaListButton" onClick={(event) => { event.stopPropagation(); openAreaModal(area); }} title="Edit Area"><FontAwesomeIcon icon={faEdit} /></button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="satEarthCondControlGroupStack">
        <div className="satEarthCondControlGroup">
          <label>Search Places</label>
          <input
            type="text"
            placeholder="City or Place"
            value={locationQuery}
            onChange={(event) => setLocationQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") searchLocations(); }}
            className="satEarthCondInput"
          />
        </div>
        <div className="satEarthCondControlGroup">
          <button onClick={searchLocations} className="satEarthCondBtn satEarthCondBtnSecondary">
            <FontAwesomeIcon icon={faSearchPlus} /> Search
          </button>
          {locationSearchStatus && <div className="satEarthCondLocationSearchStatus">{locationSearchStatus}</div>}
          {locationResults.length > 0 && (
            <div className="satEarthCondLocationResults">
              {locationResults.map((result) => (
                <button key={`${result.latitude}_${result.longitude}`} type="button" className="satEarthCondLocationResult" onClick={() => selectSearchResult(result)}>
                  <span className="satEarthCondLocationResultName">{result.label}</span>
                  <span className="satEarthCondLocationResultCoords">{result.latitude.toFixed(3)}, {result.longitude.toFixed(3)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="satEarthCondControlGroup">
          <button onClick={() => setShowLocationPicker(true)} className="satEarthCondBtn satEarthCondBtnSecondary satWeatherBtnElide" title="Choose A Location On The Map Or By Coordinates">
            <FontAwesomeIcon icon={faGlobeAmericas} /> <span>Set Location</span>
          </button>
        </div>
        {locationActive && (
          <div className="satEarthCondControlGroup">
            <div className="satWeatherLocationCurrent" title={`${locationName} | ${selectedLat.toFixed(4)}°, ${selectedLon.toFixed(4)}°`}>
              <span className="satWeatherLocationCurrentName">{locationName}</span>
              <span className="satWeatherLocationCurrentCoords">{`${selectedLat.toFixed(4)}°, ${selectedLon.toFixed(4)}°`}</span>
            </div>
            <button onClick={() => setSelectedLocation(WORLDWIDE_KEY)} className="satEarthCondBtn satEarthCondBtnSecondary">
              <FontAwesomeIcon icon={faXmark} /> Clear Location
            </button>
          </div>
        )}
        <div className="satEarthCondControlGroup">
          <Dropdown
            value={labelFor(AREA_RADIUS_OPTIONS, areaRadius)}
            onChange={(option) => setAreaRadius(valueFor(AREA_RADIUS_OPTIONS, option))}
            options={AREA_RADIUS_OPTIONS.map(([, label]) => label)}
            placeholder="Area Radius"
            className={locationActive ? "" : "satEarthCondDropdownDisabled"}
          />
        </div>
      </div>

      <div className="satEarthCondControlGroupStack">
        <div className="satEarthCondControlGroup">
          <Dropdown
            value={labelFor(SEVERITY_FILTER_OPTIONS, severityFilter)}
            onChange={(option) => setSeverityFilter(valueFor(SEVERITY_FILTER_OPTIONS, option))}
            options={SEVERITY_FILTER_OPTIONS.map(([, label]) => label)}
            placeholder="Severity"
          />
        </div>
      </div>

      <div className="satEarthCondControlGroupStack">
        <div className="satEarthCondControlGroup">
          <label>Map Layers</label>
          <div className="satWeatherLayerList">
            {RISK_INTELLIGENCE_CATEGORIES.map((category) => (
              <div key={category.id} className="satWeatherLayerItem" onClick={() => toggleRiskLayer(category.id)}>
                <span className="satWeatherLayerIcon" style={{ color: category.color, opacity: riskLayersVisible[category.id] ? 1 : 0.4 }}><FontAwesomeIcon icon={category.icon} /></span>
                <span className="satWeatherLayerName" style={{ opacity: riskLayersVisible[category.id] ? 1 : 0.5 }}>{category.name}</span>
                <span className="satWeatherLayerCount">{!riskLayersVisible[category.id] ? "Off" : categoriesWithoutData.has(category.id) ? "No Data" : (categoryCounts[category.id] || 0).toLocaleString()}</span>
                <span className="satWeatherLayerToggle"><FontAwesomeIcon icon={riskLayersVisible[category.id] ? faEye : faEyeSlash} /></span>
              </div>
            ))}
            {MAP_OPTION_LAYERS.map((layer) => {
              const on = layer.id === "heatmap" ? showHeatmap : showVisibilityBadges;
              return (
                <div key={layer.id} className="satWeatherLayerItem" onClick={() => (layer.id === "heatmap" ? setShowHeatmap((value) => !value) : setShowVisibilityBadges((value) => !value))}>
                  <span className="satWeatherLayerIcon" style={{ color: layer.color, opacity: on ? 1 : 0.4 }}><FontAwesomeIcon icon={layer.icon} /></span>
                  <span className="satWeatherLayerName" style={{ opacity: on ? 1 : 0.5 }}>{layer.name}</span>
                  <span className="satWeatherLayerCount">{on ? "On" : "Off"}</span>
                  <span className="satWeatherLayerToggle"><FontAwesomeIcon icon={on ? faEye : faEyeSlash} /></span>
                </div>
              );
            })}
          </div>
          {(sidebarErrors.length > 0 || notReporting.length > 0) && (
            <div className="satEarthCondHarvestWarnings">
              {sidebarErrors.map(([label, message]) => (
                <div key={label} className={`satEarthCondHarvestWarning ${expandedWarnings[label] ? "satEarthCondHarvestWarningExpanded" : ""}`} onClick={() => toggleWarning(label)}>
                  <FontAwesomeIcon icon={faTriangleExclamation} className="satEarthCondHarvestWarningIcon" />
                  <div className="satEarthCondHarvestWarningBody">
                    <span className="satEarthCondHarvestWarningTitle">{label}</span>
                    <span className="satEarthCondHarvestWarningText">{message}</span>
                  </div>
                </div>
              ))}
              {notReporting.map((source) => (
                <div key={source.key} className={`satEarthCondHarvestWarning ${expandedWarnings[`source:${source.key}`] ? "satEarthCondHarvestWarningExpanded" : ""}`} onClick={() => toggleWarning(`source:${source.key}`)}>
                  <FontAwesomeIcon icon={faTriangleExclamation} className="satEarthCondHarvestWarningIcon" />
                  <div className="satEarthCondHarvestWarningBody">
                    <span className="satEarthCondHarvestWarningTitle">{source.name || source.key}</span>
                    <span className="satEarthCondHarvestWarningText">{source.last_error}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="satEarthCondControlGroupStack">
        <div className="satEarthCondControlGroup">
          <label className="satEarthCondCheckboxLabel">
            <input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} />
            <span>Auto Refresh</span>
          </label>
        </div>
      </div>

      <div className="satEarthCondControlGroupStack" style={{ borderBottom: 0 }}>
        <div className="satEarthCondControlGroup">
          <Dropdown
            value={labelFor(REFRESH_INTERVAL_OPTIONS, refreshInterval)}
            onChange={(option) => setRefreshInterval(valueFor(REFRESH_INTERVAL_OPTIONS, option))}
            options={REFRESH_INTERVAL_OPTIONS.map(([, label]) => label)}
            placeholder="Interval"
            className={autoRefresh ? "" : "satEarthCondDropdownDisabled"}
          />
        </div>
      </div>

      <div className="satEarthCondControlGroupStack">
        <div className="satEarthCondHarvestPanel">
          <div className="satEarthCondHarvestTitle">Harvester</div>
          <div className="satEarthCondHarvestRow"><span>Status</span><span style={{ color: SOURCES.harvest.statusColors[harvestStatusLabel] || "#ff6b6b" }}>{harvestStatusLabel}</span></div>
          <div className="satEarthCondHarvestRow"><span>Archive Streams</span><span>{harvestObjects.toLocaleString()}</span></div>
          <div className="satEarthCondHarvestRow"><span>Archived Events</span><span>{harvestStats.frames.toLocaleString()}</span></div>
          <div className="satEarthCondHarvestRow"><span>Storage</span><span>{harvestHealth?.storage ? formatBytes(harvestHealth.storage.used_bytes) : "—"}</span></div>
          <div className="satEarthCondHarvestRow"><span>Jobs Due</span><span>{harvestStats.due}</span></div>
          <div className="satEarthCondHarvestRow"><span>Jobs Running</span><span>{harvestStats.running}</span></div>
          <div className="satEarthCondHarvestRow"><span>Sources</span><span>{harvestStats.sources}</span></div>
          <div className="satEarthCondHarvestRow"><span>Failing</span><span style={{ color: harvestStats.failing ? "#ff6b6b" : undefined }}>{harvestStats.failing}</span></div>
          <div className="satEarthCondHarvestRow"><span>New Leads</span><span style={{ color: harvestHealth?.leads?.new_leads ? "#ffd93d" : undefined }}>{harvestHealth?.leads ? harvestHealth.leads.new_leads : "—"}</span></div>
          <div className="satEarthCondHarvestRow"><span>Throttle</span><span style={{ color: harvestHealth?.engine?.throttle === "Normal" ? "#4ecdc4" : harvestHealth?.engine?.throttle ? "#FF9500" : undefined }}>{harvestHealth?.engine?.throttle ? `${harvestHealth.engine.throttle} (${harvestHealth.engine.lagMs} ms)` : "—"}</span></div>
          <div className="satEarthCondHarvestRow"><span>Last Tick</span><span>{harvestHealth?.engine?.lastTickAt ? formatRelativeTime(harvestHealth.engine.lastTickAt) : "—"}</span></div>
          {harvestWarnings.length > 0 && (
            <div className="satEarthCondHarvestWarnings">
              {harvestWarnings.map((warning, index) => {
                const [title, text] = splitWarning(warning);
                return (
                  <div key={index} className={`satEarthCondHarvestWarning ${expandedWarnings[warning] ? "satEarthCondHarvestWarningExpanded" : ""}`} onClick={() => toggleWarning(warning)}>
                    <FontAwesomeIcon icon={faTriangleExclamation} className="satEarthCondHarvestWarningIcon" />
                    <div className="satEarthCondHarvestWarningBody">
                      <span className="satEarthCondHarvestWarningTitle">{title}</span>
                      <span className="satEarthCondHarvestWarningText">{text}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="satEarthCondHarvestActions">
            <button className="satEarthCondBtn satEarthCondBtnSecondary" onClick={() => setShowLeads(true)}>
              <FontAwesomeIcon icon={faLightbulb} /><span className="satEarthCondHarvestLabel">Source Leads{harvestHealth?.leads?.new_leads ? ` (${harvestHealth.leads.new_leads} New)` : ""}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="satEarthCondControlActions">
        <button onClick={refreshAll} disabled={refreshing} className="satEarthCondBtn satEarthCondBtnPrimary">
          {refreshing ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faRefresh} />} Refresh
        </button>
        <button onClick={exportData} disabled={!scopedRisks.length} className="satEarthCondBtn satEarthCondBtnSecondary">
          <FontAwesomeIcon icon={faDownload} /> Export
        </button>
      </div>
    </div>
  );

  const tabs = [
    { id: "map", label: "Live Map", icon: faGlobe, badge: 0 },
    { id: "overview", label: "Risk Overview", icon: faChartBar, badge: 0 },
    { id: "events", label: "Events", icon: faTriangleExclamation, badge: scopedRisks.length },
    { id: "assessment", label: "Area Assessment", icon: faShieldHalved, badge: 0 },
    { id: "sources", label: "Sources & Coverage", icon: faDatabase, badge: 0 }
  ];

  const bellCritical = criticalRisks.length > 0;
  const bellWarning = scopedRisks.length > 0 || sidebarErrors.length > 0 || harvestWarnings.length > 0;
  const bellCount = scopedRisks.length;
  const statusLabel = scopedSummary.critical > 0 ? "Severe" : scopedSummary.high > 0 ? "Elevated" : "Nominal";
  const sourcesReporting = sourceStatus.filter((source) => source.last_success_at && !source.last_error).length;

  return (
    <div className="satEarthCondPage">
      {layoutVisibility.nav && <Nav activePage="riskcommandcenter" />}

      {authLoading ? (
        <div className="satEarthCondGate">
          <div className="loading-wrapper">
            <div className="loading-circle" />
            <label className="loading-title">
              Loading
            </label>
          </div>
        </div>
      ) : (
      <div className={`satEarthCondContainer ${layoutVisibility.nav ? "" : "satEarthCondContainerNoNav"}`}>
        {layoutVisibility.header && (
        <header className="satEarthCondHeader satWeatherHeader">
          <div className="satEarthCondHeaderContent">
            <div className="satEarthCondTitleSection">
              <div className="satEarthCondSubtitle">{activeAreas ? `${activeAreasLabel} | Area Filter On | ${scopedRisks.length.toLocaleString()} Event${scopedRisks.length === 1 ? "" : "s"} | ${statusLabel}` : locationActive ? `${locationName} | ${selectedLat.toFixed(4)}°, ${selectedLon.toFixed(4)}° | ${labelFor(AREA_RADIUS_OPTIONS, areaRadius)} | ${statusLabel}` : `Global Risk Intelligence | ${areas.length} ${areas.length === 1 ? "Monitored Area" : "Monitored Areas"} | ${statusLabel}`}</div>
            </div>
            <div className="satEarthCondHeaderStatus">
              <button
                type="button"
                title={bellCritical ? "Show The Critical Event" : "Show Events"}
                className={`satEarthCondAlertBtn ${bellCritical ? "satEarthCondAlertBtnCritical" : bellWarning ? "satEarthCondAlertBtnWarning" : ""}`}
                onClick={() => {
                  if (ackReviewList.length) {
                    openAckReview();
                    return;
                  }
                  if (bellCritical) {
                    selectRisk(criticalRisks[0], true);
                    return;
                  }
                  if (scopedRisks.length) {
                    setActiveTab("events");
                    return;
                  }
                  setLayoutVisibility((prev) => ({ ...prev, sidebar: true }));
                }}
              >
                <FontAwesomeIcon icon={faBell} />
                {bellCount > 0 && <span className="satEarthCondAlertBadge">{bellCount}</span>}
              </button>
              <div className="satWeatherSoundBar">
                {(ackQueue.length > 0 || (sounds.alarm && sounds.alarm.test && sounds.alarm.persistent)) && (
                  <button
                    type="button"
                    title={ackQueue.length ? "Review And Acknowledge Each Alert" : "Stop The Repeating Alert Sound"}
                    className="satWeatherHeaderToggle satWeatherHeaderToggleAlarm"
                    onClick={() => {
                      if (sounds.alarm && sounds.alarm.test) sounds.silence();
                      if (ackQueue.length) setAckOpen(true);
                    }}
                  >
                    <FontAwesomeIcon icon={faVolumeXmark} />
                    <span>{ackQueue.length ? `Acknowledge (${ackQueue.length})` : "Acknowledge"}</span>
                  </button>
                )}
                <div className="satWeatherSoundGroup">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={sounds.settings.enabled}
                    title={!sounds.settings.enabled ? "Turn On Alert Sounds" : sounds.unlocked ? "Turn Off Alert Sounds" : "Click Anywhere To Allow Alert Sounds"}
                    className={`satWeatherSoundSwitchRow ${sounds.settings.enabled && !sounds.unlocked ? "satWeatherSoundSwitchBlocked" : ""}`}
                    onClick={sounds.toggle}
                  >
                    <FontAwesomeIcon icon={sounds.settings.enabled ? faVolumeHigh : faVolumeXmark} className="satWeatherSoundSwitchIcon" />
                    <span className="satWeatherSoundSwitchLabel">Sound</span>
                    <span className={`satWeatherSwitch ${sounds.settings.enabled ? "satWeatherSwitchOn" : ""}`}>
                      <span className="satWeatherSwitchKnob" />
                    </span>
                  </button>
                  <span className="satWeatherSoundDivider" />
                  <button
                    type="button"
                    role="switch"
                    aria-checked={sounds.settings.mode === "persistent"}
                    title={sounds.settings.mode === "persistent" ? "Alert Sounds Repeat Until Acknowledged" : "Alert Sounds Play Once Per Alert"}
                    className="satWeatherSoundSwitchRow"
                    onClick={() => sounds.updateSettings({ mode: sounds.settings.mode === "persistent" ? "single" : "persistent" })}
                  >
                    <FontAwesomeIcon icon={faRepeat} className="satWeatherSoundSwitchIcon" />
                    <span className="satWeatherSoundSwitchLabel">Repeat</span>
                    <span className={`satWeatherSwitch ${sounds.settings.mode === "persistent" ? "satWeatherSwitchOn" : ""}`}>
                      <span className="satWeatherSwitchKnob" />
                    </span>
                  </button>
                </div>
                {sounds.snoozed ? (
                  <button
                    type="button"
                    title="End The Snooze And Resume Alert Sounds And Pop Ups"
                    className="satWeatherHeaderToggle satWeatherHeaderToggleSnoozed"
                    onClick={() => sounds.snooze(0)}
                  >
                    <FontAwesomeIcon icon={faBellSlash} />
                    <span>{`Snoozed Until ${new Date(sounds.settings.snoozeUntil).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}</span>
                  </button>
                ) : (
                  <Dropdown
                    className="satWeatherSoundDropdown satWeatherSoundDropdownNarrow"
                    value={null}
                    onChange={(option) => sounds.snooze(valueFor(SNOOZE_OPTIONS, option))}
                    options={SNOOZE_OPTIONS.map(([, label]) => label)}
                    placeholder="Snooze"
                  />
                )}
                <Dropdown
                  className="satWeatherSoundDropdown satWeatherSoundDropdownSmall"
                  value={labelFor(SOUND_VOLUME_OPTIONS, sounds.settings.volume)}
                  onChange={(option) => sounds.updateSettings({ volume: valueFor(SOUND_VOLUME_OPTIONS, option) })}
                  options={SOUND_VOLUME_OPTIONS.map(([, label]) => label)}
                  placeholder="Volume"
                />
                <button
                  type="button"
                  title={`Test The ${SOUND_LEVEL_LABELS[sounds.settings.minLevel]} Sound`}
                  className="satEarthCondAlertBtn"
                  onClick={() => sounds.test(sounds.settings.minLevel)}
                >
                  <FontAwesomeIcon icon={faPlay} />
                </button>
              </div>
            </div>
          </div>
        </header>
        )}
        <div className="satEarthCondMainContent">
          {layoutVisibility.sidebar && <aside className="satEarthCondSidebar">{renderControlsPanel()}</aside>}
          {showLeads && <LeadsModal onClose={() => setShowLeads(false)} onChanged={loadHarvestHealth} />}
          <div className="satEarthCondContentArea">
            <nav className="satEarthCondTabs">
              {tabs.map((tab) => (
                <button key={tab.id} className={`satEarthCondTab ${activeTab === tab.id ? "satEarthCondTabActive" : ""}`} onClick={() => setActiveTab(tab.id)}>
                  <FontAwesomeIcon icon={tab.icon} />
                  <span>{tab.label}</span>
                  {tab.badge > 0 && <span className="satEarthCondTabBadge">{tab.badge}</span>}
                </button>
              ))}
              <div className="satEarthCondLayoutControls">
                {LAYOUT_TOGGLES.map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    title={`${layoutVisibility[key] ? "Hide" : "Show"} ${label}`}
                    className={`satEarthCondLayoutToggle ${layoutVisibility[key] ? "satEarthCondLayoutToggleActive" : ""}`}
                    onClick={() => setLayoutVisibility((prev) => ({ ...prev, [key]: !prev[key] }))}
                  >
                    <FontAwesomeIcon icon={layoutVisibility[key] ? faEye : faEyeSlash} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </nav>
            <div className={`satEarthCondTabContent ${activeTab === "map" ? "satWeatherTabContentMap" : ""}`} ref={tabContentRef} onClick={activeTab === "map" ? undefined : handleExpandClick}>
              {renderMapView()}
              {activeTab !== "map" && (
                !hazardsLoaded ? (
                  <div className="satEarthCondLoadingState">
                    <div className="loading-circle" />
                  </div>
                ) : renderCurrentTabContent()
              )}
            </div>
          </div>
        </div>
        {layoutVisibility.footer && (
        <footer className="satEarthCondFooter">
          <div className="satEarthCondFooterContent">
            <span>Last Updated: {riskIntelligenceLastUpdated ? riskIntelligenceLastUpdated.toLocaleTimeString() : "—"}</span>
            <span>Latency: {latency}ms</span>
            <span>Active Events: {scopedRisks.length.toLocaleString()}</span>
            <span>Critical: {scopedSummary.critical.toLocaleString()}</span>
            <span>Sources Reporting: {sourcesReporting}/{sourceStatus.length}</span>
            <span>Status: {statusLabel}</span>
          </div>
        </footer>
        )}
      </div>
      )}
      {apiError && (
        <div className="satWeatherNotification satWeatherNotificationError">
          <FontAwesomeIcon icon={faExclamationCircle} />
          <span>{apiError}</span>
          <button onClick={() => setApiError(null)}><FontAwesomeIcon icon={faTimes} /></button>
        </div>
      )}
      {apiSuccess && (
        <div className="satWeatherNotification satWeatherNotificationSuccess">
          <FontAwesomeIcon icon={faCheckCircle} />
          <span>{apiSuccess}</span>
          <button onClick={() => setApiSuccess(null)}><FontAwesomeIcon icon={faTimes} /></button>
        </div>
      )}
      {renderAckModal()}
      <AreaModal open={areaModalOpen} onClose={() => setAreaModalOpen(false)} title={editingAreaId ? "Edit Monitored Area" : "Add Monitored Area"}>
        <p className="satWeatherModalIntro">
          Monitored areas track every hazard inside them or close enough to reach them, and alert sounds can follow them. Choose a point with a radius (a circle around an address or coordinates) or a bounding box (a rectangle).
        </p>
        <div className="satWeatherFormGroup">
          <label>Area Name (Optional)</label>
          <input type="text" value={areaFormData.name} onChange={(event) => handleAreaFormChange("name", event.target.value)} placeholder="Houston Metro or North Bay" maxLength="80" />
        </div>
        <div className="satWeatherFormGroup">
          <Dropdown
            value={areaFormData.mode === "bbox" ? "Bounding Box (Rectangular Area)" : "Point + Radius (Circular Area)"}
            onChange={(option) => handleAreaFormChange("mode", option === "Bounding Box (Rectangular Area)" ? "bbox" : "point_radius")}
            options={["Point + Radius (Circular Area)", "Bounding Box (Rectangular Area)"]}
            placeholder="Area Mode"
          />
        </div>
        {areaFormData.mode === "point_radius" && (
          <>
            <div className="satWeatherFormGroup">
              <label>Address (Geocoded To Coordinates)</label>
              <div className="satWeatherFormInline">
                <AddressAutocomplete
                  value={areaFormData.address}
                  onChange={(text) => handleAreaFormChange("address", text)}
                  onSelect={(place) => setAreaFormData((prev) => ({
                    ...prev,
                    address: place.label,
                    latitude: place.latitude.toFixed(6),
                    longitude: place.longitude.toFixed(6),
                    name: prev.name && prev.name.trim() ? prev.name : (place.city || place.primary)
                  }))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleGeocodeArea();
                    }
                  }}
                  bias={{ latitude: viewState.lat, longitude: viewState.lon }}
                  placeholder="Start typing an address."
                  style={{ flex: 1 }}
                />
                <button type="button" className="satWeatherModalBtnSecondary satWeatherModalBtnInline" onClick={handleGeocodeArea} disabled={isGeocodingArea || !(areaFormData.address || "").trim()}>
                  {isGeocodingArea ? <><FontAwesomeIcon icon={faSpinner} spin /> Geocoding</> : <><FontAwesomeIcon icon={faLocationCrosshairs} /> Geocode</>}
                </button>
              </div>
            </div>
            <div className="satWeatherFormRow">
              <div className="satWeatherFormGroup"><label>Latitude *</label><input type="number" step="any" value={areaFormData.latitude} onChange={(event) => handleAreaFormChange("latitude", event.target.value)} placeholder="-90 To 90" required /></div>
              <div className="satWeatherFormGroup"><label>Longitude *</label><input type="number" step="any" value={areaFormData.longitude} onChange={(event) => handleAreaFormChange("longitude", event.target.value)} placeholder="-180 To 180" required /></div>
              <div className="satWeatherFormGroup"><label>Radius (km) *</label><input type="number" min="1" max="10000" step="any" value={areaFormData.radius_km} onChange={(event) => handleAreaFormChange("radius_km", event.target.value)} placeholder="100" required /></div>
            </div>
            <button type="button" className="satWeatherModalBtnSecondary" onClick={useMapCenterForArea}><FontAwesomeIcon icon={faLocationCrosshairs} /> Use Current Map Center</button>
          </>
        )}
        {areaFormData.mode === "bbox" && (
          <>
            <div className="satWeatherFormRow">
              <div className="satWeatherFormGroup"><label>Min Latitude (South) *</label><input type="number" step="any" value={areaFormData.min_lat} onChange={(event) => handleAreaFormChange("min_lat", event.target.value)} placeholder="-90 To 90" required /></div>
              <div className="satWeatherFormGroup"><label>Max Latitude (North) *</label><input type="number" step="any" value={areaFormData.max_lat} onChange={(event) => handleAreaFormChange("max_lat", event.target.value)} placeholder="-90 To 90" required /></div>
            </div>
            <div className="satWeatherFormRow">
              <div className="satWeatherFormGroup"><label>Min Longitude (West) *</label><input type="number" step="any" value={areaFormData.min_lng} onChange={(event) => handleAreaFormChange("min_lng", event.target.value)} placeholder="-180 To 180" required /></div>
              <div className="satWeatherFormGroup"><label>Max Longitude (East) *</label><input type="number" step="any" value={areaFormData.max_lng} onChange={(event) => handleAreaFormChange("max_lng", event.target.value)} placeholder="-180 To 180" required /></div>
            </div>
            <button type="button" className="satWeatherModalBtnSecondary" onClick={useMapViewForArea}><FontAwesomeIcon icon={faMap} /> Use Current Map View</button>
          </>
        )}
        <div className="satWeatherModalActions">
          {editingAreaId && <button className="satWeatherModalBtnDanger" onClick={() => deleteArea(editingAreaId)}><FontAwesomeIcon icon={faTrash} /> Delete Area</button>}
          <button className="satWeatherModalBtnSecondary" onClick={() => setAreaModalOpen(false)}>Cancel</button>
          <button className="satWeatherModalBtnPrimary" onClick={() => handleSaveArea(true)}><FontAwesomeIcon icon={faSave} /> Save Area</button>
        </div>
      </AreaModal>
      <AreaModal open={nearbyModalOpen} onClose={() => setNearbyModalOpen(false)} title="Spatial Nearby Query" className="riskWideModal">
        <p className="satWeatherModalIntro">
          The nearby query searches the event archive and the live store around a point. Narrow it by category, severity, or source.
        </p>
        <form onSubmit={handleNearbyQuerySubmit}>
          <div className="satWeatherFormRow">
            <div className="satWeatherFormGroup"><label>Latitude *</label><input type="number" step="any" value={nearbyFormData.latitude} onChange={(event) => handleNearbyFormChange("latitude", event.target.value)} placeholder="-90 To 90" required /></div>
            <div className="satWeatherFormGroup"><label>Longitude *</label><input type="number" step="any" value={nearbyFormData.longitude} onChange={(event) => handleNearbyFormChange("longitude", event.target.value)} placeholder="-180 To 180" required /></div>
            <div className="satWeatherFormGroup"><label>Radius (km)</label><input type="number" step="any" value={nearbyFormData.radius_km} onChange={(event) => handleNearbyFormChange("radius_km", event.target.value)} placeholder="100" /></div>
          </div>
          <div className="satWeatherFormRow">
            <div className="satWeatherFormGroup">
              <Dropdown
                value={(RISK_INTELLIGENCE_CATEGORIES.find((category) => category.id === nearbyFormData.category) || {}).name || "All Categories"}
                onChange={(option) => {
                  const match = RISK_INTELLIGENCE_CATEGORIES.find((category) => category.name === option);
                  handleNearbyFormChange("category", match ? match.id : "");
                }}
                options={["All Categories", ...RISK_INTELLIGENCE_CATEGORIES.map((category) => category.name)]}
                placeholder="Category"
              />
            </div>
            <div className="satWeatherFormGroup">
              <Dropdown
                value={nearbyFormData.severity || "All Severities"}
                onChange={(option) => handleNearbyFormChange("severity", option === "All Severities" ? "" : option)}
                options={["All Severities", ...PRIORITY_OPTIONS]}
                placeholder="Severity"
              />
            </div>
            <div className="satWeatherFormGroup"><label>Limit</label><input type="number" min="1" max="500" value={nearbyFormData.limit} onChange={(event) => handleNearbyFormChange("limit", event.target.value)} placeholder="50" /></div>
          </div>
          <div className="satWeatherFormGroup"><label>Source</label><input type="text" value={nearbyFormData.source} onChange={(event) => handleNearbyFormChange("source", event.target.value)} placeholder="Filter By Source" /></div>
          <div className="satWeatherModalActions">
            <button type="button" className="satWeatherModalBtnSecondary" onClick={() => setNearbyFormData((prev) => ({ ...prev, latitude: viewState.lat.toFixed(6), longitude: viewState.lon.toFixed(6) }))}><FontAwesomeIcon icon={faLocationCrosshairs} /> Use Map Center</button>
            {userArea && userArea.mode === "point_radius" && (
              <button type="button" className="satWeatherModalBtnSecondary" onClick={() => setNearbyFormData((prev) => ({ ...prev, latitude: userArea.latitude.toFixed(6), longitude: userArea.longitude.toFixed(6), radius_km: userArea.radius_km.toString() }))}><FontAwesomeIcon icon={faMapPin} /> Use Selected Area</button>
            )}
            <button type="submit" className="satWeatherModalBtnPrimary" disabled={isLoadingNearby}>{isLoadingNearby ? <><FontAwesomeIcon icon={faSpinner} spin /> Querying</> : <><FontAwesomeIcon icon={faBullseye} /> Query Nearby</>}</button>
          </div>
        </form>
        {nearbyRisks && (
          <div className="riskEcScope">
            <div className="satWeatherAckSectionTitle">{`${(nearbyRisks.total_count || nearbyRisks.risks.length).toLocaleString()} Events Within ${formatNumber(parseFloat(nearbyFormData.radius_km) || 100, " Km")}`}</div>
            {renderDetailFields([
              ["Critical", formatNumber(nearbyRisks.by_severity.critical || 0)],
              ["High", formatNumber(nearbyRisks.by_severity.high || 0)],
              ["Medium", formatNumber(nearbyRisks.by_severity.medium || 0)],
              ["Low", formatNumber(nearbyRisks.by_severity.low || 0)]
            ], { columns: 3 })}
            {renderTable("Nearby Events", ["Event", "Severity", "Category", "Source", "Distance", "Event Time"], nearbyRisks.risks.slice(0, SOURCES.tables.maxRows).map((risk) => [
              { value: risk.title, color: liftColor(riskSeverityColor(risk)) },
              risk.severity,
              risk.risk_category,
              risk.source,
              risk.distance_km != null ? formatNumber(risk.distance_km, " Km", 1) : null,
              risk.event_time ? formatRelativeTime(risk.event_time) : null
            ]), { emptyText: "No events were found within this radius.", onRowClick: (index) => { setNearbyModalOpen(false); selectRisk(nearbyRisks.risks[index], true); } })}
          </div>
        )}
      </AreaModal>
      <AreaModal open={Boolean(assessmentModal)} onClose={() => setAssessmentModal(null)} title="Location Risk Assessment" className="riskWideModal">
        {assessmentModal && (
          <div className="riskEcScope">
            {renderAssessmentPanels(assessmentModal, "Location Risk", { actions: true }).flat().map((panel) => (
              <div key={panel.title} className="riskModalPanel">
                <div className="satWeatherAckSectionTitle">{panel.title}</div>
                {panel.content}
              </div>
            ))}
          </div>
        )}
      </AreaModal>
      {showLocationPicker && (
        <LocationPickerModal
          initialLat={locationActive ? selectedLat : viewState.lat}
          initialLon={locationActive ? selectedLon : viewState.lon}
          initialLabel={locationActive && locationName !== CUSTOM_LOCATION_LABEL ? locationName : null}
          onCancel={() => setShowLocationPicker(false)}
          onConfirm={(choice) => {
            const key = `${choice.lat},${choice.lon}`;
            setCustomLocationLabel({ key, label: choice.label || CUSTOM_LOCATION_LABEL });
            setSelectedLocation(key);
            setShowLocationPicker(false);
          }}
        />
      )}
      {expandedView && (
        <div className="satEarthCondModalOverlay" onClick={() => setExpandedView(null)}>
          <div className="satEarthCondModal" onClick={(event) => event.stopPropagation()}>
            <div className="satEarthCondModalHeader">
              <h4 className="satEarthCondModalTitle">{expandedView.title}</h4>
              <button type="button" className="satEarthCondModalClose" onClick={() => setExpandedView(null)} aria-label="Close">
                <FontAwesomeIcon icon={faXmarkSquare} />
              </button>
            </div>
            <div className="satEarthCondModalBody">
              {expandedView.chart ? (
                <ResponsiveChart
                  option={{
                    ...expandedView.chart,
                    xAxis: { ...expandedView.chart.xAxis, axisLabel: { ...expandedView.chart.xAxis?.axisLabel, overflow: "none", width: undefined } },
                    yAxis: Array.isArray(expandedView.chart.yAxis) ? expandedView.chart.yAxis : { ...expandedView.chart.yAxis, axisLabel: { ...expandedView.chart.yAxis?.axisLabel, overflow: "none", width: undefined } }
                  }}
                  className="satEarthCondChart satEarthCondChartExpanded"
                />
              ) : (
                <div className="satEarthCondExpandedContent satWeatherExpandedContent" dangerouslySetInnerHTML={{ __html: expandedView.html }} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RiskCommandCenter;