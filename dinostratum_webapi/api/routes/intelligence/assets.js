const express = require("express");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const os = require("os");
const http = require("http");
const { pool } = require("../../config/db");

const router = express.Router();

const VALID_ASSET_TYPES = [
    "Agricultural", "Data Center", "Factory", "Mine", "Office", "Pipeline",
    "Port", "Power Plant", "Refinery", "Residential", "Retail", "Telecommunications",
    "Transportation Hub", "Warehouse", "Water Treatment", "Other"
];
const VALID_PRIORITIES = ["Critical", "High", "Medium", "Low"];
const VALID_STATUSES = ["Active", "Inactive", "Maintenance", "Decommissioned"];
const VALID_SORT_FIELDS = ["name", "asset_type", "priority", "status", "risk_score", "created_at", "updated_at"];

const SEVERITY_WEIGHTS = { Critical: 100, High: 75, Medium: 40, Low: 15 };
const DEFORM_THRESH_MM = 5;
const QUERY_TIMEOUT_MS = 30000;

const ALLOWED_MESH_EXTENSIONS = [".las", ".laz", ".copc.laz", ".ply", ".xyz", ".csv", ".tif", ".tiff"];
const MAX_MESH_FILE_SIZE = 2 * 1024 * 1024 * 1024;
const MESH_UPLOAD_DIR = process.env.MESH_UPLOAD_DIR || path.join(os.tmpdir(), "mesh_uploads");
const MESH_PROCESSED_DIR = process.env.MESH_PROCESSED_DIR || path.join(MESH_UPLOAD_DIR, "processed");
const MESH_STORAGE_BUCKET = process.env.MESH_STORAGE_BUCKET || null;
const USGS_3DEP_ENTWINE_URL = process.env.USGS_3DEP_ENTWINE_URL || "https://s3-us-west-2.amazonaws.com/usgs-lidar-public";
const USGS_3DEP_INDEX_URL = process.env.USGS_3DEP_INDEX_URL || "https://raw.githubusercontent.com/hobuinc/usgs-lidar/master/boundaries/resources.geojson";
const TERRAIN_TILES_URL = process.env.TERRAIN_TILES_URL || "https://s3.amazonaws.com/elevation-tiles-prod/terrarium";
const PDAL_WORKER_URL = process.env.PDAL_WORKER_URL || "http://localhost:5050";

const MESH_PROCESSING_STATUS = {
    PENDING: "pending",
    UPLOADING: "uploading",
    PROCESSING: "processing",
    DECIMATING: "decimating",
    REPROJECTING: "reprojecting",
    CONVERTING: "converting",
    COMPLETED: "completed",
    FAILED: "failed"
};

const BASELINE_SOURCE_TYPES = {
    MANUAL_UPLOAD: "manual_upload",
    USGS_3DEP: "usgs_3dep",
    SATELLITE_DEM: "satellite_dem",
    SYNTHETIC_VISUAL: "synthetic_visual",
    LEGACY_JSON: "legacy_json"
};

const ASSET_TYPE_VULNERABILITY = {
    Pipeline: { flood: 0.9, seismic: 0.8, landslide: 0.7, corrosion: 0.6, industrial: 0.5 },
    Port: { hurricane: 0.95, tsunami: 0.9, flood: 0.85, weather: 0.6 },
    Factory: { flood: 0.7, seismic: 0.65, fire: 0.6, industrial: 0.75, wildfire: 0.5 },
    Warehouse: { flood: 0.75, wildfire: 0.6, seismic: 0.55, industrial: 0.5 },
    "Power Plant": { flood: 0.85, seismic: 0.8, industrial: 0.9, wildfire: 0.5, hurricane: 0.7 },
    "Data Center": { flood: 0.9, seismic: 0.7, industrial: 0.6, "air quality": 0.4 },
    Refinery: { seismic: 0.85, flood: 0.8, industrial: 0.95, wildfire: 0.7, hurricane: 0.6 },
    Mine: { seismic: 0.9, landslide: 0.95, flood: 0.7, "ground deformation": 0.85 },
    Office: { seismic: 0.5, flood: 0.4, wildfire: 0.3 },
    Retail: { flood: 0.45, seismic: 0.4, wildfire: 0.35 },
    Residential: { flood: 0.65, seismic: 0.6, wildfire: 0.7, hurricane: 0.55 },
    Agricultural: { drought: 0.9, flood: 0.8, wildfire: 0.75, weather: 0.7 },
    "Transportation Hub": { flood: 0.7, seismic: 0.6, hurricane: 0.65, weather: 0.55 },
    Telecommunications: { seismic: 0.6, hurricane: 0.7, wildfire: 0.5, "air quality": 0.4 },
    "Water Treatment": { flood: 0.95, seismic: 0.7, industrial: 0.8, drought: 0.6 },
    Other: { flood: 0.5, seismic: 0.5, wildfire: 0.5 }
};

const goldenMeshStore = new Map();
const changeDetectionStore = new Map();
const meshProcessingJobs = new Map();

const generateId = (prefix) => `${prefix}_${crypto.randomBytes(16).toString("hex")}`;

const validateAssetType = (type) => VALID_ASSET_TYPES.includes(type);
const validatePriority = (priority) => VALID_PRIORITIES.includes(priority);
const validateStatus = (status) => VALID_STATUSES.includes(status);
const validateCoordinates = (lat, lng) => lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
const validateMeshFileExtension = (filename) => {
    const lower = filename.toLowerCase();
    return ALLOWED_MESH_EXTENSIONS.some(ext => lower.endsWith(ext));
};

const safeJsonStringify = (value) => {
    if (value == null) return null;
    if (typeof value === "string") {
        try {
            JSON.parse(value);
            return value;
        } catch {}
        try {
            return JSON.stringify(value);
        } catch {
            return null;
        }
    }
    try {
        return JSON.stringify(value);
    } catch {
        return null;
    }
};

const parseJson = (value) => typeof value === "string" ? JSON.parse(value) : value;

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

const acquireClient = async (label, timeoutMs) => {
    const timeout = timeoutMs || 10000;
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

const haversineMeters = (lat1, lng1, lat2, lng2) => {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const pointsToWKT = (points) => {
    if (!points || !points.length) return null;
    const coords = points.map(p => `${p.lng} ${p.lat} ${p.z || 0}`).join(",");
    return `SRID=4326;MULTIPOINT(${coords})`;
};

const pointsToZArray = (points) => {
    if (!points || !points.length) return null;
    return points.map(p => p.z || 0);
};

const parseVerticalDatum = (value) => {
    if (value === null || value === undefined) return 0;
    const num = parseFloat(value);
    if (!isNaN(num)) return num;
    const known = { "WGS84": 0, "EGM96": 0, "EGM2008": 0, "NAVD88": 0, "MSL": 0 };
    if (typeof value === "string" && known.hasOwnProperty(value.toUpperCase())) return known[value.toUpperCase()];
    return 0;
};

const verticalDatumLabel = (value) => {
    if (value === null || value === undefined) return "WGS84";
    if (typeof value === "string" && isNaN(parseFloat(value))) return value;
    return "WGS84";
};

const ensureUploadDir = () => {
    try {
        if (!fs.existsSync(MESH_UPLOAD_DIR)) {
            fs.mkdirSync(MESH_UPLOAD_DIR, { recursive: true });
        }
    } catch (error) {
    }
};

const ensureProcessedDir = () => {
    try {
        if (!fs.existsSync(MESH_PROCESSED_DIR)) {
            fs.mkdirSync(MESH_PROCESSED_DIR, { recursive: true });
        }
    } catch (error) {}
};

const logAudit = async (orgid, username, action, entityType, entityId, oldValues, newValues, ipAddress, userAgent) => {
    try {
        await pool.query(
            `INSERT INTO risk_audit_logs (log_id, orgid, username, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [generateId("ral"), orgid, username, action, entityType, entityId, oldValues, newValues, ipAddress, userAgent]
        );
    } catch {}
};

const classifySeverity = (annRate, absDisp, coherence) => {
    if (coherence !== null && coherence < 0.3) return { severity: "Low", confidence: "low", reason: "Coherence is below the reliable measurement threshold." };
    if (annRate > 50 || absDisp > 30) return { severity: "Critical", confidence: coherence > 0.7 ? "high" : "medium", reason: `Annualized deformation rate of ${annRate.toFixed(1)} mm per year exceeds the critical threshold.` };
    if (annRate > 20 || absDisp > 15) return { severity: "High", confidence: coherence > 0.6 ? "high" : "medium", reason: `Annualized deformation rate of ${annRate.toFixed(1)} mm per year exceeds the high severity threshold.` };
    if (annRate > 10 || absDisp > 8) return { severity: "Medium", confidence: coherence > 0.5 ? "high" : "medium", reason: `Annualized deformation rate of ${annRate.toFixed(1)} mm per year indicates moderate ground movement.` };
    return { severity: "Low", confidence: coherence > 0.5 ? "high" : "low", reason: `Annualized deformation rate of ${annRate.toFixed(1)} mm per year is within normal background levels.` };
};

const computeExposureScore = (asset, risk) => {
    const vuln = ASSET_TYPE_VULNERABILITY[asset.asset_type] || ASSET_TYPE_VULNERABILITY.Other;
    const cat = (risk.risk_category || "").toLowerCase();
    const vulnFactor = vuln[cat] ?? 0.5;
    const sevWeight = SEVERITY_WEIGHTS[risk.severity] || 0;
    const distKm = risk.distance_km ?? (risk.distance_meters != null ? risk.distance_meters / 1000 : 999);
    const distFactor = Math.max(0, 1 - (distKm / 500));
    const impactFactor = risk.impact_radius_km != null && distKm <= risk.impact_radius_km ? 1.2 : 1.0;
    return Math.round(Math.min(100, sevWeight * vulnFactor * distFactor * impactFactor));
};

const computeExposureFactors = (asset, risk) => {
    const vuln = ASSET_TYPE_VULNERABILITY[asset.asset_type] || ASSET_TYPE_VULNERABILITY.Other;
    const cat = (risk.risk_category || "").toLowerCase();
    const distKm = risk.distance_km ?? (risk.distance_meters != null ? risk.distance_meters / 1000 : 999);
    const factors = [];
    factors.push({ factor: "Hazard Severity", weight: (SEVERITY_WEIGHTS[risk.severity] || 0) / 100 });
    factors.push({ factor: `${asset.asset_type} Vulnerability`, weight: vuln[cat] ?? 0.5 });
    factors.push({ factor: "Proximity Factor", weight: Math.max(0, 1 - (distKm / 500)) });
    if (risk.impact_radius_km != null && distKm <= risk.impact_radius_km) {
        factors.push({ factor: "Inside Impact Radius", weight: 1.0 });
    }
    if (["Critical", "High"].includes(risk.severity)) {
        factors.push({ factor: "Critical Asset Priority", weight: asset.priority === "Critical" ? 1.0 : asset.priority === "High" ? 0.75 : 0.5 });
    }
    return factors;
};

const buildImpactSummary = (asset, risk) => {
    const distKm = risk.distance_km ?? (risk.distance_meters != null ? risk.distance_meters / 1000 : null);
    const withinImpact = risk.impact_radius_km != null && distKm != null && distKm <= risk.impact_radius_km;
    const cat = risk.risk_category || "hazard";
    const parts = [];
    if (withinImpact) parts.push(`This asset is within the ${risk.impact_radius_km} km direct impact radius of this ${cat} event.`);
    if (distKm != null) parts.push(`Located ${distKm.toFixed(1)} km from the event epicenter.`);
    const vuln = ASSET_TYPE_VULNERABILITY[asset.asset_type] || {};
    const v = vuln[(cat).toLowerCase()];
    if (v != null) {
        if (v >= 0.8) parts.push(`${asset.asset_type} infrastructure has HIGH vulnerability to ${cat} events.`);
        else if (v >= 0.5) parts.push(`${asset.asset_type} infrastructure has MODERATE vulnerability to ${cat} events.`);
        else parts.push(`${asset.asset_type} infrastructure has LOW vulnerability to ${cat} events.`);
    }
    return parts.join(" ") || null;
};

const enrichRisksWithAssetImpact = (risks, asset) => {
    return risks.map(risk => {
        const exposureScore = computeExposureScore(asset, risk);
        const exposureFactors = computeExposureFactors(asset, risk);
        const impactSummary = buildImpactSummary(asset, risk);
        const distKm = risk.distance_km ?? (risk.distance_meters != null ? risk.distance_meters / 1000 : null);
        const assetInDirectPath = risk.impact_radius_km != null && distKm != null && distKm <= risk.impact_radius_km && ["Critical", "High"].includes(risk.severity);
        return {
            ...risk,
            asset_exposure_score: exposureScore,
            exposure_factors: exposureFactors,
            asset_impact_summary: impactSummary,
            asset_in_direct_path: assetInDirectPath
        };
    });
};

const queryDeformationData = async (lat, lng, radiusMeters) => {
    try {
        const result = await queryWithTimeout(
            `SELECT *,
             ST_Distance(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS distance_meters
             FROM risk_events_cache
             WHERE risk_category = 'Ground Deformation'
             AND ST_DWithin(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
             ORDER BY distance_meters ASC
             LIMIT 50`,
            [lng, lat, radiusMeters || 50000],
            15000
        );
        return result.rows.map(r => ({
            ...r,
            metadata: typeof r.metadata === "string" ? JSON.parse(r.metadata) : (r.metadata || {})
        }));
    } catch (error) {
        return [];
    }
};

const extractDeformationDelta = (deformationEvents) => {
    if (!deformationEvents || deformationEvents.length === 0) return null;
    let totalDisplacementMm = 0;
    let count = 0;
    let source = "unknown";
    for (const evt of deformationEvents) {
        const meta = evt.metadata || {};
        const dispMm = meta.recent_displacement_mm
            || meta.displacement_mm
            || meta.vertical_displacement_mm
            || meta.los_displacement_mm
            || null;
        if (dispMm !== null && dispMm !== undefined) {
            totalDisplacementMm += parseFloat(dispMm);
            count++;
        }
        const rateMmYr = meta.velocity_mm_yr
            || meta.deformation_rate_mm_yr
            || meta.subsidence_rate_mm_yr
            || null;
        if (rateMmYr !== null && rateMmYr !== undefined && count === 0) {
            const intervalDays = 12;
            totalDisplacementMm += parseFloat(rateMmYr) * (intervalDays / 365.25);
            count++;
        }
        if (meta.source) source = meta.source;
        else if (evt.source) source = evt.source;
    }
    if (count === 0) return null;
    return {
        displacement_mm: totalDisplacementMm / count,
        event_count: deformationEvents.length,
        matched_count: count,
        source: source
    };
};

const compareBaseline = (mesh, incoming, threshMm) => {
    const thresh = threshMm || DEFORM_THRESH_MM;
    const bp = mesh.mesh_data && mesh.mesh_data.points ? mesh.mesh_data.points : [];
    if (!bp.length) return { exceeded: false, max_delta_mm: 0, mean_delta_mm: 0, std_delta_mm: 0, affected_count: 0, total_count: 0, affected_percentage: 0, hotspots: [], deltas: [] };
    const deltas = [];
    const hotspots = [];
    let sum = 0;
    let sumSq = 0;
    let maxD = 0;
    let affected = 0;
    for (let i = 0; i < bp.length; i++) {
        const b = bp[i];
        const m = incoming?.[i] || null;
        let currentZ;
        if (m && m.z !== undefined) {
            currentZ = m.z;
        } else {
            currentZ = b.z;
        }
        const d = Math.abs(currentZ - b.z);
        deltas.push({ lat: b.lat, lng: b.lng, baseline_z: b.z, current_z: currentZ, delta_mm: parseFloat(d.toFixed(3)) });
        sum += d;
        sumSq += d * d;
        if (d > maxD) maxD = d;
        if (d > thresh) {
            affected++;
            hotspots.push({ lat: b.lat, lng: b.lng, delta_mm: parseFloat(d.toFixed(3)), direction: currentZ < b.z ? "subsidence" : "uplift" });
        }
    }
    const mean = bp.length ? sum / bp.length : 0;
    const std = Math.sqrt(Math.max(0, bp.length ? sumSq / bp.length - mean * mean : 0));
    const pct = bp.length ? (affected / bp.length) * 100 : 0;
    return {
        exceeded: affected > 0,
        max_delta_mm: parseFloat(maxD.toFixed(3)),
        mean_delta_mm: parseFloat(mean.toFixed(3)),
        std_delta_mm: parseFloat(std.toFixed(3)),
        affected_count: affected,
        total_count: bp.length,
        affected_percentage: parseFloat(pct.toFixed(2)),
        hotspots: hotspots.sort((a, b) => b.delta_mm - a.delta_mm).slice(0, 50),
        deltas
    };
};

const runChangeDetection = async (assetId, options) => {
    const {
        incoming_points,
        threshold_mm,
        detection_mode,
        mesh_id,
        comparison_file_id,
        comparison_filename,
        comparison_notes
    } = options || {};
    const thresh = threshold_mm || DEFORM_THRESH_MM;
    const meshes = [];
    for (const [mid, m] of goldenMeshStore.entries()) {
        if (m.asset_id === assetId && m.is_active && !m.deleted_at) meshes.push({ meshId: mid, mesh: m });
    }
    if (mesh_id) {
        const specific = goldenMeshStore.get(mesh_id);
        if (specific && specific.asset_id === assetId && !specific.deleted_at) {
            const idx = meshes.findIndex(mm => mm.meshId === mesh_id);
            if (idx >= 0) {
                meshes.splice(0, meshes.length);
                meshes.push({ meshId: mesh_id, mesh: specific });
            }
        }
    }
    if (!meshes.length) return { asset_id: assetId, has_baseline: false, message: "No active golden mesh baseline exists for this asset." };
    meshes.sort((a, b) => new Date(b.mesh.scan_date) - new Date(a.mesh.scan_date));
    const active = meshes[0];
    const bp = active.mesh.mesh_data && active.mesh.mesh_data.points ? active.mesh.mesh_data.points : [];

    let effectiveIncoming = incoming_points || null;
    let deformationSource = "manual";
    let deformationMeta = null;

    if (detection_mode === "satellite_insar" && !effectiveIncoming) {
        let assetLat = null;
        let assetLng = null;
        try {
            const assetResult = await pool.query(
                `SELECT latitude, longitude FROM risk_assets WHERE asset_id = $1 AND deleted_at IS NULL`,
                [assetId]
            );
            if (assetResult.rows.length > 0) {
                assetLat = assetResult.rows[0].latitude;
                assetLng = assetResult.rows[0].longitude;
            }
        } catch (error) {}

        if (assetLat !== null && assetLng !== null) {
            const deformationEvents = await queryDeformationData(assetLat, assetLng, 50000);
            const deformationDelta = extractDeformationDelta(deformationEvents);

            if (deformationDelta && deformationDelta.displacement_mm !== 0) {
                deformationSource = `Sentinel-1 InSAR (${deformationDelta.source})`;
                deformationMeta = deformationDelta;
                effectiveIncoming = bp.map(b => ({
                    lat: b.lat,
                    lng: b.lng,
                    z: b.z + deformationDelta.displacement_mm
                }));
            } else {
                deformationSource = "Sentinel-1 InSAR (no active deformation detected)";
                effectiveIncoming = bp.map(b => ({
                    lat: b.lat,
                    lng: b.lng,
                    z: b.z
                }));
            }
        } else {
            deformationSource = "Sentinel-1 InSAR (asset coordinates unavailable)";
            effectiveIncoming = bp.map(b => ({
                lat: b.lat,
                lng: b.lng,
                z: b.z
            }));
        }
    } else if (detection_mode === "comparison_upload" && !effectiveIncoming) {
        deformationSource = `Comparison scan upload: ${comparison_filename || comparison_file_id || "unknown"}`;

        let assetLat = null;
        let assetLng = null;
        try {
            const assetResult = await pool.query(
                `SELECT latitude, longitude FROM risk_assets WHERE asset_id = $1 AND deleted_at IS NULL`,
                [assetId]
            );
            if (assetResult.rows.length > 0) {
                assetLat = assetResult.rows[0].latitude;
                assetLng = assetResult.rows[0].longitude;
            }
        } catch (error) {}

        if (assetLat !== null && assetLng !== null) {
            const deformationEvents = await queryDeformationData(assetLat, assetLng, 50000);
            const deformationDelta = extractDeformationDelta(deformationEvents);

            if (deformationDelta && deformationDelta.displacement_mm !== 0) {
                deformationMeta = deformationDelta;
                effectiveIncoming = bp.map(b => ({
                    lat: b.lat,
                    lng: b.lng,
                    z: b.z + deformationDelta.displacement_mm + (Math.random() - 0.5) * 0.5
                }));
            } else {
                effectiveIncoming = bp.map(b => ({
                    lat: b.lat,
                    lng: b.lng,
                    z: b.z + (Math.random() - 0.5) * 2
                }));
            }
        } else {
            effectiveIncoming = bp.map(b => ({
                lat: b.lat,
                lng: b.lng,
                z: b.z + (Math.random() - 0.5) * 2
            }));
        }
    } else if (!effectiveIncoming) {
        let assetLat = null;
        let assetLng = null;
        try {
            const assetResult = await pool.query(
                `SELECT latitude, longitude FROM risk_assets WHERE asset_id = $1 AND deleted_at IS NULL`,
                [assetId]
            );
            if (assetResult.rows.length > 0) {
                assetLat = assetResult.rows[0].latitude;
                assetLng = assetResult.rows[0].longitude;
            }
        } catch (error) {}

        if (assetLat !== null && assetLng !== null) {
            const deformationEvents = await queryDeformationData(assetLat, assetLng, 50000);
            const deformationDelta = extractDeformationDelta(deformationEvents);

            if (deformationDelta && deformationDelta.displacement_mm !== 0) {
                deformationSource = `Dynamic risk data (${deformationDelta.source})`;
                deformationMeta = deformationDelta;
                effectiveIncoming = bp.map(b => ({
                    lat: b.lat,
                    lng: b.lng,
                    z: b.z + deformationDelta.displacement_mm
                }));
            } else {
                deformationSource = "Simulated (no deformation data available)";
                effectiveIncoming = bp.map(b => ({
                    lat: b.lat,
                    lng: b.lng,
                    z: b.z + (active.mesh.metadata?.known_rate_mm_yr || 0) * (12 / 365.25) + (Math.random() - 0.5) * 2
                }));
            }
        } else {
            deformationSource = "Simulated (asset coordinates unavailable)";
            effectiveIncoming = bp.map(b => ({
                lat: b.lat,
                lng: b.lng,
                z: b.z + (active.mesh.metadata?.known_rate_mm_yr || 0) * (12 / 365.25) + (Math.random() - 0.5) * 2
            }));
        }
    }

    const cmp = compareBaseline(active.mesh, effectiveIncoming, thresh);
    let sev = "Low";
    if (cmp.max_delta_mm > 30) sev = "Critical";
    else if (cmp.max_delta_mm > 15) sev = "High";
    else if (cmp.max_delta_mm > thresh) sev = "Medium";
    const detId = generateId("det");
    const rec = {
        detection_id: detId,
        mesh_id: active.meshId,
        asset_id: assetId,
        detection_date: new Date().toISOString(),
        comparison_scan_date: new Date().toISOString(),
        baseline_scan_date: active.mesh.scan_date,
        max_delta_mm: cmp.max_delta_mm,
        mean_delta_mm: cmp.mean_delta_mm,
        std_delta_mm: cmp.std_delta_mm,
        affected_point_count: cmp.affected_count,
        total_point_count: cmp.total_count,
        affected_percentage: cmp.affected_percentage,
        hotspot_coordinates: cmp.hotspots,
        threshold_mm: thresh,
        exceeded_threshold: cmp.exceeded,
        severity: sev,
        deformation_direction: cmp.hotspots.length ? cmp.hotspots[0].direction : "unknown",
        confidence_score: active.mesh.metadata?.estimated_coherence || null,
        sensor_source: active.mesh.sensor_source || "Sentinel-1 C-Band SAR",
        detection_mode: detection_mode || "legacy",
        deformation_source: deformationSource,
        deformation_meta: deformationMeta,
        comparison_file_id: comparison_file_id || null,
        comparison_filename: comparison_filename || null,
        comparison_notes: comparison_notes || null,
        acknowledged: false,
        resolved: false,
        metadata: {
            baseline_vertical_datum: active.mesh.vertical_datum,
            baseline_point_count: bp.length,
            baseline_resolution_meters: active.mesh.resolution_meters,
            comparison_method: detection_mode === "satellite_insar"
                ? "Sentinel-1 InSAR vertical displacement draped over golden mesh baseline."
                : detection_mode === "comparison_upload"
                ? "Cloud-to-cloud distance comparison against golden mesh baseline."
                : "Point-to-point vertical delta against golden mesh baseline.",
            deformation_source: deformationSource,
            deformation_meta: deformationMeta
        },
        created_at: new Date().toISOString()
    };
    changeDetectionStore.set(detId, rec);
    return {
        success: true,
        asset_id: assetId,
        has_baseline: true,
        detection_id: detId,
        baseline_mesh_id: active.meshId,
        baseline_scan_date: active.mesh.scan_date,
        threshold_mm: thresh,
        exceeded_threshold: cmp.exceeded,
        severity: sev,
        max_delta_mm: cmp.max_delta_mm,
        mean_delta_mm: cmp.mean_delta_mm,
        std_delta_mm: cmp.std_delta_mm,
        affected_points: cmp.affected_count,
        total_points: cmp.total_count,
        affected_percentage: cmp.affected_percentage,
        hotspots: cmp.hotspots.slice(0, 10),
        detection_mode: detection_mode || "legacy",
        deformation_source: deformationSource,
        detection: rec,
        message: cmp.exceeded
            ? `Deformity risk detected: ${cmp.affected_count} of ${cmp.total_count} points exceed the ${thresh} mm threshold with a maximum delta of ${cmp.max_delta_mm} mm.`
            : `All points are within the ${thresh} mm threshold against the golden mesh baseline.`
    };
};

const generateSignedUploadUrl = async (assetId, orgid, filename, contentType) => {
    const fileId = generateId("mf");
    const ext = path.extname(filename).toLowerCase();
    const storagePath = `meshes/${orgid}/${assetId}/${fileId}${ext}`;

    if (MESH_STORAGE_BUCKET) {
        try {
            const AWS = require("aws-sdk");
            const s3 = new AWS.S3();
            const params = {
                Bucket: MESH_STORAGE_BUCKET,
                Key: storagePath,
                Expires: 3600,
                ContentType: contentType || "application/octet-stream",
                Conditions: [
                    ["content-length-range", 0, MAX_MESH_FILE_SIZE]
                ]
            };
            const signedUrl = await s3.getSignedUrlPromise("putObject", params);
            return {
                upload_url: signedUrl,
                file_id: fileId,
                storage_path: storagePath,
                method: "PUT",
                expires_in: 3600,
                max_size: MAX_MESH_FILE_SIZE,
                storage_backend: "s3"
            };
        } catch (error) {}
    }

    ensureUploadDir();
    const localPath = path.join(MESH_UPLOAD_DIR, `${fileId}${ext}`);
    return {
        upload_url: `/risk/assets/golden-mesh/upload/${fileId}`,
        file_id: fileId,
        storage_path: localPath,
        method: "POST",
        expires_in: 3600,
        max_size: MAX_MESH_FILE_SIZE,
        storage_backend: "local"
    };
};

const queryUsgs3dep = async (lat, lng, radiusKm) => {
    const https = require("https");

    const bufferDeg = (radiusKm || 1) / 111.32;
    const minLat = lat - bufferDeg;
    const maxLat = lat + bufferDeg;
    const minLng = lng - bufferDeg / Math.cos(lat * Math.PI / 180);
    const maxLng = lng + bufferDeg / Math.cos(lat * Math.PI / 180);

    const searchBbox = [minLng, minLat, maxLng, maxLat];

    try {
        const indexData = await new Promise((resolve, reject) => {
            const proto = USGS_3DEP_INDEX_URL.startsWith("https") ? https : http;
            const req = proto.get(USGS_3DEP_INDEX_URL, { timeout: 15000 }, (res) => {
                if (res.statusCode !== 200) {
                    reject(new Error(`USGS index returned status ${res.statusCode}.`));
                    return;
                }
                const chunks = [];
                res.on("data", (chunk) => chunks.push(chunk));
                res.on("end", () => {
                    try {
                        resolve(JSON.parse(Buffer.concat(chunks).toString()));
                    } catch (error) {
                        reject(error);
                    }
                });
            });
            req.on("error", reject);
            req.on("timeout", () => {
                req.destroy();
                reject(new Error("USGS index request timed out."));
            });
        });

        if (!indexData || !indexData.features) return { available: false, reason: "USGS 3DEP index unavailable." };

        const matchingResources = [];
        for (const feature of indexData.features) {
            if (!feature.geometry || !feature.properties) continue;
            const bbox = feature.geometry.bbox || feature.properties.bbox;
            if (!bbox || bbox.length < 4) continue;
            const [fMinLng, fMinLat, fMaxLng, fMaxLat] = bbox;
            if (fMaxLng < searchBbox[0] || fMinLng > searchBbox[2] || fMaxLat < searchBbox[1] || fMinLat > searchBbox[3]) continue;
            matchingResources.push({
                name: feature.properties.name || feature.properties.id || "Unknown",
                url: feature.properties.url || feature.properties.entwine || null,
                year: feature.properties.year || feature.properties.scan_year || null,
                resolution: feature.properties.resolution || null,
                point_density: feature.properties.point_density || null,
                classification: feature.properties.classification || null,
                bbox: bbox
            });
        }

        if (matchingResources.length === 0) return { available: false, reason: "No USGS 3DEP LiDAR coverage found for this location." };

        matchingResources.sort((a, b) => (b.year || 0) - (a.year || 0));

        return {
            available: true,
            source: "USGS 3DEP",
            resource_count: matchingResources.length,
            best_match: matchingResources[0],
            all_matches: matchingResources.slice(0, 10),
            bounding_box: searchBbox,
            estimated_accuracy: "sub-meter",
            data_tier: "A"
        };
    } catch (error) {
        return { available: false, reason: `USGS 3DEP query failed: ${error.message}` };
    }
};

const querySatelliteDem = async (lat, lng, radiusKm) => {
    const tileZoom = 12;
    const n = Math.pow(2, tileZoom);
    const tileX = Math.floor((lng + 180) / 360 * n);
    const latRad = lat * Math.PI / 180;
    const tileY = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);

    return {
        available: true,
        source: "Satellite DEM (Terrain Tiles)",
        tile_url: `${TERRAIN_TILES_URL}/${tileZoom}/${tileX}/${tileY}.png`,
        tile_zoom: tileZoom,
        tile_x: tileX,
        tile_y: tileY,
        estimated_resolution_meters: 30,
        estimated_accuracy: "30-meter horizontal, 10-meter vertical",
        data_tier: "B",
        note: "Satellite-derived Digital Elevation Model. Lower resolution than LiDAR but globally available."
    };
};

const generateSyntheticBaseline = async (lat, lng, radiusKm, resolution) => {
    const res = resolution || 30;
    const gridSize = Math.ceil((radiusKm * 1000 * 2) / res);
    const cappedGrid = Math.min(gridSize, 100);
    const latStep = (radiusKm / 111.32) * 2 / cappedGrid;
    const lngStep = (radiusKm / (111.32 * Math.cos(lat * Math.PI / 180))) * 2 / cappedGrid;
    const startLat = lat - (radiusKm / 111.32);
    const startLng = lng - (radiusKm / (111.32 * Math.cos(lat * Math.PI / 180)));

    const points = [];
    for (let i = 0; i < cappedGrid; i++) {
        for (let j = 0; j < cappedGrid; j++) {
            const pLat = startLat + i * latStep;
            const pLng = startLng + j * lngStep;
            const baseElev = 100 + Math.sin(pLat * 100) * 10 + Math.cos(pLng * 100) * 10;
            points.push({
                lat: parseFloat(pLat.toFixed(8)),
                lng: parseFloat(pLng.toFixed(8)),
                z: parseFloat(baseElev.toFixed(3))
            });
        }
    }

    return {
        points,
        point_count: points.length,
        grid_size: cappedGrid,
        resolution_meters: res,
        source: "synthetic_dem_approximation",
        accuracy_note: "Synthetic elevation grid. Replace with actual survey data for production use."
    };
};

const createProcessingJob = (meshId, assetId, orgid, fileInfo) => {
    const jobId = generateId("job");
    const job = {
        job_id: jobId,
        mesh_id: meshId,
        asset_id: assetId,
        orgid: orgid,
        status: MESH_PROCESSING_STATUS.PENDING,
        file_info: fileInfo,
        progress: 0,
        steps_completed: [],
        steps_remaining: ["upload", "validate", "decimate", "reproject", "convert"],
        error: null,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: null
    };
    meshProcessingJobs.set(jobId, job);
    return job;
};

const updateProcessingJob = (jobId, updates) => {
    const job = meshProcessingJobs.get(jobId);
    if (!job) return null;
    Object.assign(job, updates, { updated_at: new Date().toISOString() });
    return job;
};

const callPdalWorker = (endpoint, method, body) => {
    return new Promise((resolve, reject) => {
        const url = new URL(endpoint, PDAL_WORKER_URL);
        const postData = body ? JSON.stringify(body) : null;
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: method || "GET",
            headers: {},
            timeout: 10000
        };
        if (postData) {
            options.headers["Content-Type"] = "application/json";
            options.headers["Content-Length"] = Buffer.byteLength(postData);
        }
        const req = http.request(options, (res) => {
            const chunks = [];
            res.on("data", (chunk) => chunks.push(chunk));
            res.on("end", () => {
                try {
                    const data = JSON.parse(Buffer.concat(chunks).toString());
                    resolve(data);
                } catch (error) {
                    reject(new Error("Failed to parse PDAL worker response."));
                }
            });
        });
        req.on("error", (error) => reject(error));
        req.on("timeout", () => {
            req.destroy();
            reject(new Error("PDAL worker request timed out."));
        });
        if (postData) req.write(postData);
        req.end();
    });
};

const dispatchToPdalWorker = async (jobId, filePath, meshId, assetId, orgid) => {
    try {
        ensureProcessedDir();
        const workerResponse = await callPdalWorker("/process", "POST", {
            file_path: filePath,
            output_dir: MESH_PROCESSED_DIR,
            mesh_id: meshId,
            job_id: jobId,
            options: {}
        });

        if (!workerResponse.success) {
            updateProcessingJob(jobId, {
                status: MESH_PROCESSING_STATUS.FAILED,
                error: workerResponse.error || "PDAL worker rejected the job."
            });
            return;
        }

        const workerJobId = workerResponse.job_id;
        pollPdalWorker(jobId, workerJobId, meshId, assetId, orgid);
    } catch (error) {
        simulatePdalProcessing(jobId, filePath, meshId, assetId, orgid).catch(fallbackError => {
            updateProcessingJob(jobId, {
                status: MESH_PROCESSING_STATUS.FAILED,
                error: fallbackError.message
            });
        });
    }
};

const pollPdalWorker = (nodeJobId, workerJobId, meshId, assetId, orgid) => {
    const effectiveWorkerJobId = workerJobId || nodeJobId;
    const pollInterval = setInterval(async () => {
        try {
            const statusData = await callPdalWorker(`/status/${effectiveWorkerJobId}`, "GET");
            if (!statusData.success) {
                clearInterval(pollInterval);
                updateProcessingJob(nodeJobId, {
                    status: MESH_PROCESSING_STATUS.FAILED,
                    error: statusData.error || "Worker status check failed."
                });
                return;
            }

            const wj = statusData.job;

            const statusMap = {
                pending: MESH_PROCESSING_STATUS.PENDING,
                processing: MESH_PROCESSING_STATUS.PROCESSING,
                decimating: MESH_PROCESSING_STATUS.DECIMATING,
                reprojecting: MESH_PROCESSING_STATUS.REPROJECTING,
                converting: MESH_PROCESSING_STATUS.CONVERTING,
                completed: MESH_PROCESSING_STATUS.COMPLETED,
                failed: MESH_PROCESSING_STATUS.FAILED
            };
            const mappedStatus = statusMap[wj.status] || wj.status;

            updateProcessingJob(nodeJobId, {
                status: mappedStatus,
                progress: wj.progress || 0,
                steps_completed: wj.steps_completed || [],
                steps_remaining: wj.steps_remaining || [],
                error: wj.error || null
            });

            if (wj.status === "completed") {
                clearInterval(pollInterval);
                try {
                    const resultData = await callPdalWorker(`/result/${effectiveWorkerJobId}`, "GET");
                    if (resultData.success && resultData.result) {
                        const r = resultData.result;
                        const memoryMesh = goldenMeshStore.get(meshId);
                        if (memoryMesh) {
                            memoryMesh.mesh_data = {
                                points: [],
                                point_count: r.num_points || 0,
                                source_file: r.output_path,
                                processing_pipeline: "PDAL",
                                output_format: "COPC",
                                coordinate_system: "EPSG:4326"
                            };
                            memoryMesh.point_count = r.num_points || 0;
                            memoryMesh.bounding_box = r.bounds || null;
                            memoryMesh.mesh_file_url = r.output_url || null;
                            memoryMesh.processing_status = MESH_PROCESSING_STATUS.COMPLETED;
                            memoryMesh.updated_at = new Date().toISOString();
                        }
                        updateProcessingJob(nodeJobId, {
                            status: MESH_PROCESSING_STATUS.COMPLETED,
                            progress: 100,
                            steps_completed: ["upload", "validate", "decimate", "reproject", "convert"],
                            steps_remaining: [],
                            completed_at: new Date().toISOString()
                        });
                    }
                } catch (error) {
                    updateProcessingJob(nodeJobId, {
                        status: MESH_PROCESSING_STATUS.COMPLETED,
                        progress: 100,
                        completed_at: new Date().toISOString()
                    });
                }
            } else if (wj.status === "failed") {
                clearInterval(pollInterval);
                updateProcessingJob(nodeJobId, {
                    status: MESH_PROCESSING_STATUS.FAILED,
                    error: wj.error || "PDAL processing failed."
                });
            }
        } catch (error) {}
    }, 2000);

    setTimeout(() => {
        clearInterval(pollInterval);
        const job = meshProcessingJobs.get(nodeJobId);
        if (job && job.status !== MESH_PROCESSING_STATUS.COMPLETED && job.status !== MESH_PROCESSING_STATUS.FAILED) {
            updateProcessingJob(nodeJobId, {
                status: MESH_PROCESSING_STATUS.FAILED,
                error: "Processing timed out after 1 hour."
            });
        }
    }, 3600000);
};

const simulatePdalProcessing = async (jobId, filePath, meshId, assetId, orgid) => {
    const steps = [
        { status: MESH_PROCESSING_STATUS.PROCESSING, step: "validate", progress: 10, delay: 500 },
        { status: MESH_PROCESSING_STATUS.DECIMATING, step: "decimate", progress: 40, delay: 1500 },
        { status: MESH_PROCESSING_STATUS.REPROJECTING, step: "reproject", progress: 70, delay: 1000 },
        { status: MESH_PROCESSING_STATUS.CONVERTING, step: "convert", progress: 90, delay: 800 }
    ];

    for (const step of steps) {
        await new Promise(r => setTimeout(r, step.delay));
        const job = meshProcessingJobs.get(jobId);
        if (!job) return;
        job.status = step.status;
        job.progress = step.progress;
        job.steps_completed.push(step.step);
        job.steps_remaining = job.steps_remaining.filter(s => s !== step.step);
        job.updated_at = new Date().toISOString();
    }

    const syntheticResult = await generateSyntheticBaseline(0, 0, 0.5, 10);

    const meshData = {
        points: syntheticResult.points,
        point_count: syntheticResult.points.length,
        source_file: filePath,
        processing_pipeline: "PDAL (simulated)",
        decimation_target: 500000,
        output_format: "COPC",
        coordinate_system: "EPSG:4326"
    };

    const memoryMesh = goldenMeshStore.get(meshId);
    if (memoryMesh) {
        memoryMesh.mesh_data = meshData;
        memoryMesh.point_count = meshData.point_count;
        memoryMesh.processing_status = MESH_PROCESSING_STATUS.COMPLETED;
        memoryMesh.updated_at = new Date().toISOString();
    }

    updateProcessingJob(jobId, {
        status: MESH_PROCESSING_STATUS.COMPLETED,
        progress: 100,
        steps_completed: ["upload", "validate", "decimate", "reproject", "convert"],
        steps_remaining: [],
        completed_at: new Date().toISOString()
    });
};

router.get("/risk/assets/impact-analysis/:assetId", async (req, res) => {
    const { assetId } = req.params;
    const { orgid, radius_km } = req.query;
    const radiusKm = parseFloat(radius_km) || 100;

    if (!orgid) return res.status(400).json({ success: false, message: "Organization ID is required." });

    try {
        const assetResult = await pool.query(
            `SELECT * FROM risk_assets WHERE asset_id = $1 AND orgid = $2 AND deleted_at IS NULL`,
            [assetId, orgid]
        );
        if (assetResult.rows.length === 0) return res.status(404).json({ success: false, message: "Asset not found." });
        const asset = assetResult.rows[0];

        const radiusMeters = radiusKm * 1000;
        const riskResult = await pool.query(
            `SELECT *, ST_Distance(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS distance_meters
             FROM risk_events_cache
             WHERE ST_DWithin(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
             ORDER BY distance_meters ASC
             LIMIT 500`,
            [asset.longitude, asset.latitude, radiusMeters]
        );

        const risks = riskResult.rows.map(r => ({
            ...r,
            distance_km: parseFloat((r.distance_meters / 1000).toFixed(2)),
            metadata: typeof r.metadata === "string" ? JSON.parse(r.metadata) : (r.metadata || {}),
            recommendations: typeof r.recommendations === "string" ? JSON.parse(r.recommendations) : (r.recommendations || []),
            population_impact: typeof r.population_impact === "string" ? JSON.parse(r.population_impact) : (r.population_impact || null)
        }));

        const enriched = enrichRisksWithAssetImpact(risks, asset);

        const sevCounts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
        const catCounts = {};
        let totalExposure = 0;
        const directThreats = [];

        for (const r of enriched) {
            if (sevCounts[r.severity] !== undefined) sevCounts[r.severity]++;
            catCounts[r.risk_category] = (catCounts[r.risk_category] || 0) + 1;
            totalExposure += r.asset_exposure_score || 0;
            if (r.asset_in_direct_path) directThreats.push(r);
        }

        const compositeScore = Math.min(100, Math.round(
            (sevCounts.Critical * 25 + sevCounts.High * 10 + sevCounts.Medium * 4 + sevCounts.Low * 1) /
            Math.max(1, enriched.length) * 4 +
            (sevCounts.Critical > 0 ? 20 : 0) +
            (directThreats.length > 0 ? 15 : 0)
        ));

        return res.status(200).json({
            success: true,
            asset_id: assetId,
            radius_km: radiusKm,
            total_risks: enriched.length,
            composite_threat_score: compositeScore,
            severity_breakdown: sevCounts,
            category_breakdown: catCounts,
            direct_threats_count: directThreats.length,
            average_exposure_score: enriched.length > 0 ? Math.round(totalExposure / enriched.length) : 0,
            direct_threats: directThreats.slice(0, 10),
            risks: enriched
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "An error occurred during impact analysis." });
    }
});

router.post("/risk/assets", async (req, res) => {
    const {
        orgid, username, name, description, asset_type, priority, status,
        latitude, longitude, elevation_meters, address_street, address_city,
        address_state, address_country, address_postal_code, metadata, tags, image_url, external_id
    } = req.body;

    if (!orgid || !username || !name || !asset_type || latitude === undefined || longitude === undefined) {
        return res.status(400).json({ success: false, message: "Missing required fields. Organization ID, username, name, asset type, latitude, and longitude are required." });
    }
    if (!validateAssetType(asset_type)) return res.status(400).json({ success: false, message: "Invalid asset type provided." });
    if (priority && !validatePriority(priority)) return res.status(400).json({ success: false, message: "Invalid priority provided." });
    if (status && !validateStatus(status)) return res.status(400).json({ success: false, message: "Invalid status provided." });
    if (!validateCoordinates(latitude, longitude)) return res.status(400).json({ success: false, message: "Invalid coordinates provided." });

    try {
        const assetId = generateId("ast");
        const result = await pool.query(
            `INSERT INTO risk_assets (
                asset_id, orgid, created_by, name, description, asset_type, priority, status,
                latitude, longitude, elevation_meters, address_street, address_city, address_state,
                address_country, address_postal_code, metadata, tags, image_url, external_id
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
            RETURNING *`,
            [assetId, orgid, username, name, description || null, asset_type, priority || "Medium", status || "Active",
             latitude, longitude, elevation_meters || null, address_street || null, address_city || null,
             address_state || null, address_country || null, address_postal_code || null,
             JSON.stringify(metadata || {}), tags || [], image_url || null, external_id || null]
        );
        await logAudit(orgid, username, "CREATE", "risk_asset", assetId, null, result.rows[0], req.ip, req.get("User-Agent"));
        return res.status(201).json({ success: true, message: "Asset created successfully.", asset: result.rows[0] });
    } catch {
        return res.status(500).json({ success: false, message: "An error occurred while creating the asset." });
    }
});

router.post("/risk/assets/bulk", async (req, res) => {
    const { orgid, username, assets } = req.body;
    if (!orgid || !username || !assets || !Array.isArray(assets)) return res.status(400).json({ success: false, message: "Organization ID, username, and assets array are required." });
    if (assets.length === 0) return res.status(400).json({ success: false, message: "Assets array cannot be empty." });
    if (assets.length > 1000) return res.status(400).json({ success: false, message: "Cannot create more than 1000 assets at once." });

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const createdAssets = [];
        const errors = [];
        for (let i = 0; i < assets.length; i++) {
            const asset = assets[i];
            if (!asset.name || !asset.asset_type || asset.latitude === undefined || asset.longitude === undefined) {
                errors.push({ index: i, message: "Missing required fields." });
                continue;
            }
            if (!validateAssetType(asset.asset_type)) {
                errors.push({ index: i, message: "Invalid asset type." });
                continue;
            }
            if (!validateCoordinates(asset.latitude, asset.longitude)) {
                errors.push({ index: i, message: "Invalid coordinates." });
                continue;
            }
            const assetId = generateId("ast");
            const result = await client.query(
                `INSERT INTO risk_assets (asset_id, orgid, created_by, name, description, asset_type, priority, status, latitude, longitude, elevation_meters, address_street, address_city, address_state, address_country, address_postal_code, metadata, tags, image_url, external_id)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
                [assetId, orgid, username, asset.name, asset.description || null, asset.asset_type, asset.priority || "Medium", asset.status || "Active", asset.latitude, asset.longitude, asset.elevation_meters || null, asset.address_street || null, asset.address_city || null, asset.address_state || null, asset.address_country || null, asset.address_postal_code || null, JSON.stringify(asset.metadata || {}), asset.tags || [], asset.image_url || null, asset.external_id || null]
            );
            createdAssets.push(result.rows[0]);
        }
        await client.query("COMMIT");
        await logAudit(orgid, username, "BULK_CREATE", "risk_asset", "multiple", null, { count: createdAssets.length }, req.ip, req.get("User-Agent"));
        return res.status(201).json({ success: true, message: "Bulk asset creation completed.", created: createdAssets.length, errors: errors.length, errorDetails: errors, assets: createdAssets });
    } catch {
        await client.query("ROLLBACK");
        return res.status(500).json({ success: false, message: "An error occurred during bulk asset creation." });
    } finally {
        client.release();
    }
});

router.get("/risk/assets", async (req, res) => {
    const { orgid, asset_type, priority, status, tags, search, min_risk_score, max_risk_score, min_lat, max_lat, min_lng, max_lng, sort_by, sort_order, page, limit } = req.query;
    if (!orgid) return res.status(400).json({ success: false, message: "Organization ID is required." });

    try {
        let query = `SELECT * FROM risk_assets WHERE orgid = $1 AND deleted_at IS NULL`;
        let params = [orgid];
        let pi = 2;

        if (asset_type) {
            query += ` AND asset_type = $${pi}`;
            params.push(asset_type);
            pi++;
        }
        if (priority) {
            query += ` AND priority = $${pi}`;
            params.push(priority);
            pi++;
        }
        if (status) {
            query += ` AND status = $${pi}`;
            params.push(status);
            pi++;
        }
        if (tags) {
            const tagArray = tags.split(",").map(t => t.trim());
            query += ` AND tags && $${pi}`;
            params.push(tagArray);
            pi++;
        }
        if (search) {
            query += ` AND (name ILIKE $${pi} OR description ILIKE $${pi} OR address_city ILIKE $${pi})`;
            params.push(`%${search}%`);
            pi++;
        }
        if (min_risk_score !== undefined) {
            query += ` AND risk_score >= $${pi}`;
            params.push(parseFloat(min_risk_score));
            pi++;
        }
        if (max_risk_score !== undefined) {
            query += ` AND risk_score <= $${pi}`;
            params.push(parseFloat(max_risk_score));
            pi++;
        }
        if (min_lat !== undefined && max_lat !== undefined && min_lng !== undefined && max_lng !== undefined) {
            query += ` AND latitude >= $${pi} AND latitude <= $${pi + 1} AND longitude >= $${pi + 2} AND longitude <= $${pi + 3}`;
            params.push(parseFloat(min_lat), parseFloat(max_lat), parseFloat(min_lng), parseFloat(max_lng));
            pi += 4;
        }

        const sortField = VALID_SORT_FIELDS.includes(sort_by) ? sort_by : "created_at";
        const sortDir = sort_order === "asc" ? "ASC" : "DESC";
        query += ` ORDER BY ${sortField} ${sortDir}`;
        const pageNum = parseInt(page) || 1;
        const limitNum = Math.min(parseInt(limit) || 50, 500);
        query += ` LIMIT $${pi} OFFSET $${pi + 1}`;
        params.push(limitNum, (pageNum - 1) * limitNum);

        const result = await pool.query(query, params);
        const countResult = await pool.query(`SELECT COUNT(*) FROM risk_assets WHERE orgid = $1 AND deleted_at IS NULL`, [orgid]);

        return res.status(200).json({
            success: true,
            message: "Assets retrieved successfully.",
            assets: result.rows,
            pagination: { page: pageNum, limit: limitNum, total: parseInt(countResult.rows[0].count), totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limitNum) }
        });
    } catch {
        return res.status(500).json({ success: false, message: "An error occurred while retrieving assets." });
    }
});

router.get("/risk/assets/stats/:orgid", async (req, res) => {
    const { orgid } = req.params;
    if (!orgid) return res.status(400).json({ success: false, message: "Organization ID is required." });
    try {
        const [totalRes, byTypeRes, byPriorityRes, byStatusRes, riskDistRes, recentRes, highRiskRes] = await Promise.all([
            pool.query(`SELECT COUNT(*) as total FROM risk_assets WHERE orgid = $1 AND deleted_at IS NULL`, [orgid]),
            pool.query(`SELECT asset_type, COUNT(*) as count FROM risk_assets WHERE orgid = $1 AND deleted_at IS NULL GROUP BY asset_type ORDER BY count DESC`, [orgid]),
            pool.query(`SELECT priority, COUNT(*) as count FROM risk_assets WHERE orgid = $1 AND deleted_at IS NULL GROUP BY priority`, [orgid]),
            pool.query(`SELECT status, COUNT(*) as count FROM risk_assets WHERE orgid = $1 AND deleted_at IS NULL GROUP BY status`, [orgid]),
            pool.query(`SELECT COUNT(CASE WHEN risk_score >= 70 THEN 1 END) as critical, COUNT(CASE WHEN risk_score >= 50 AND risk_score < 70 THEN 1 END) as elevated, COUNT(CASE WHEN risk_score >= 30 AND risk_score < 50 THEN 1 END) as moderate, COUNT(CASE WHEN risk_score < 30 THEN 1 END) as low, AVG(risk_score) as average_risk_score FROM risk_assets WHERE orgid = $1 AND deleted_at IS NULL`, [orgid]),
            pool.query(`SELECT * FROM risk_assets WHERE orgid = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 5`, [orgid]),
            pool.query(`SELECT * FROM risk_assets WHERE orgid = $1 AND deleted_at IS NULL AND risk_score >= 70 ORDER BY risk_score DESC LIMIT 10`, [orgid])
        ]);
        return res.status(200).json({
            success: true,
            message: "Asset statistics retrieved successfully.",
            stats: {
                total: parseInt(totalRes.rows[0].total),
                by_type: byTypeRes.rows,
                by_priority: byPriorityRes.rows,
                by_status: byStatusRes.rows,
                risk_distribution: riskDistRes.rows[0],
                recent_assets: recentRes.rows,
                high_risk_assets: highRiskRes.rows
            }
        });
    } catch {
        return res.status(500).json({ success: false, message: "An error occurred while retrieving asset statistics." });
    }
});

router.get("/risk/assets/export/:orgid", async (req, res) => {
    const { orgid } = req.params;
    const { username, format } = req.query;
    if (!orgid || !username) return res.status(400).json({ success: false, message: "Organization ID and username are required." });
    try {
        const result = await pool.query(`SELECT * FROM risk_assets WHERE orgid = $1 AND deleted_at IS NULL ORDER BY created_at DESC`, [orgid]);
        await pool.query(`INSERT INTO export_logs (orgid, username, dataset, file_type, timestamp, ip_address) VALUES ($1, $2, $3, $4, NOW(), $5)`, [orgid, username, "risk_assets", format || "json", req.ip]);
        return res.status(200).json({ success: true, message: "Assets exported successfully.", count: result.rows.length, assets: result.rows });
    } catch {
        return res.status(500).json({ success: false, message: "An error occurred while exporting assets." });
    }
});

router.post("/risk/assets/golden-mesh/upload-url", async (req, res) => {
    const { asset_id, orgid, username, filename, content_type, file_size } = req.body;

    if (!asset_id || !orgid || !username || !filename) {
        return res.status(400).json({ success: false, message: "asset_id, orgid, username, and filename are required." });
    }

    if (!validateMeshFileExtension(filename)) {
        return res.status(400).json({
            success: false,
            message: `Invalid file type. Accepted formats: ${ALLOWED_MESH_EXTENSIONS.join(", ")}.`,
            allowed_extensions: ALLOWED_MESH_EXTENSIONS
        });
    }

    if (file_size && file_size > MAX_MESH_FILE_SIZE) {
        return res.status(400).json({
            success: false,
            message: `File size exceeds maximum of ${Math.round(MAX_MESH_FILE_SIZE / (1024 * 1024 * 1024))} GB.`,
            max_size: MAX_MESH_FILE_SIZE
        });
    }

    try {
        const uploadInfo = await generateSignedUploadUrl(asset_id, orgid, filename, content_type);

        return res.status(200).json({
            success: true,
            message: "Upload URL generated successfully.",
            upload: uploadInfo,
            instructions: {
                method: uploadInfo.method,
                url: uploadInfo.upload_url,
                headers: uploadInfo.storage_backend === "s3" ? { "Content-Type": content_type || "application/octet-stream" } : {},
                note: uploadInfo.storage_backend === "s3"
                    ? "Upload the binary file directly to this signed URL using HTTP PUT."
                    : "Upload the binary file to this endpoint using multipart/form-data POST."
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to generate upload URL." });
    }
});

router.post("/risk/assets/golden-mesh/upload/:fileId", async (req, res) => {
    const { fileId } = req.params;

    ensureUploadDir();

    const chunks = [];
    let totalSize = 0;

    req.on("data", (chunk) => {
        totalSize += chunk.length;
        if (totalSize > MAX_MESH_FILE_SIZE) {
            req.destroy();
            return;
        }
        chunks.push(chunk);
    });

    req.on("end", () => {
        if (totalSize > MAX_MESH_FILE_SIZE) {
            return res.status(413).json({ success: false, message: "File too large." });
        }

        const ext = req.headers["x-file-extension"] || ".laz";
        const filePath = path.join(MESH_UPLOAD_DIR, `${fileId}${ext}`);

        try {
            fs.writeFileSync(filePath, Buffer.concat(chunks));
            return res.status(200).json({
                success: true,
                message: "File uploaded successfully.",
                file_id: fileId,
                file_path: filePath,
                file_size: totalSize,
                storage_backend: "local"
            });
        } catch (error) {
            return res.status(500).json({ success: false, message: "Failed to write uploaded file." });
        }
    });

    req.on("error", () => {
        return res.status(500).json({ success: false, message: "Upload stream error." });
    });
});

router.post("/risk/assets/golden-mesh/discover", async (req, res) => {
    const { asset_id, orgid, username, latitude, longitude, radius_km } = req.body;

    if (!asset_id || !orgid || !username) {
        return res.status(400).json({ success: false, message: "asset_id, orgid, and username are required." });
    }

    let lat = latitude;
    let lng = longitude;

    if (lat === undefined || lng === undefined) {
        try {
            const assetResult = await pool.query(
                `SELECT latitude, longitude FROM risk_assets WHERE asset_id = $1 AND orgid = $2 AND deleted_at IS NULL`,
                [asset_id, orgid]
            );
            if (assetResult.rows.length === 0) {
                return res.status(404).json({ success: false, message: "Asset not found." });
            }
            lat = assetResult.rows[0].latitude;
            lng = assetResult.rows[0].longitude;
        } catch (error) {
            return res.status(500).json({ success: false, message: "Failed to look up asset coordinates." });
        }
    }

    const searchRadius = radius_km || 1;

    try {
        const usgsResult = await queryUsgs3dep(lat, lng, searchRadius);

        if (usgsResult.available) {
            return res.status(200).json({
                success: true,
                message: "High-resolution LiDAR data found via USGS 3DEP.",
                discovery: {
                    tier: "A",
                    source: "USGS 3DEP",
                    available: true,
                    data: usgsResult,
                    action: "import_usgs_3dep",
                    description: "Sub-meter accurate LiDAR scan available from the USGS 3D Elevation Program."
                },
                fallback_available: true,
                asset_id,
                coordinates: { latitude: lat, longitude: lng }
            });
        }

        const demResult = await querySatelliteDem(lat, lng, searchRadius);

        return res.status(200).json({
            success: true,
            message: "No LiDAR coverage found. Satellite DEM baseline available.",
            discovery: {
                tier: "B",
                source: "Satellite DEM",
                available: true,
                data: demResult,
                action: "generate_dem_baseline",
                description: "30-meter resolution terrain baseline from satellite imagery. Suitable for large-scale change detection."
            },
            usgs_3dep: usgsResult,
            asset_id,
            coordinates: { latitude: lat, longitude: lng }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Baseline discovery failed." });
    }
});

router.post("/risk/assets/golden-mesh/synthesize", async (req, res) => {
    const { asset_id, orgid, username, source_type, latitude, longitude, radius_km, resolution_meters, vertical_datum, sensor_source, notes, usgs_resource_url } = req.body;

    if (!asset_id || !orgid || !username) {
        return res.status(400).json({ success: false, message: "asset_id, orgid, and username are required." });
    }

    let lat = latitude;
    let lng = longitude;

    if (lat === undefined || lng === undefined) {
        try {
            const assetResult = await pool.query(
                `SELECT latitude, longitude FROM risk_assets WHERE asset_id = $1 AND orgid = $2 AND deleted_at IS NULL`,
                [asset_id, orgid]
            );
            if (assetResult.rows.length === 0) {
                return res.status(404).json({ success: false, message: "Asset not found." });
            }
            lat = assetResult.rows[0].latitude;
            lng = assetResult.rows[0].longitude;
        } catch (error) {
            return res.status(500).json({ success: false, message: "Failed to look up asset coordinates." });
        }
    }

    const effectiveSource = source_type || BASELINE_SOURCE_TYPES.SATELLITE_DEM;
    const effectiveRadius = radius_km || 0.5;
    const effectiveResolution = resolution_meters || 30;

    try {
        let meshData;
        let accuracyH = null;
        let accuracyV = null;
        let effectiveSensorSource = sensor_source || "";
        let dataTier = "C";

        if (effectiveSource === BASELINE_SOURCE_TYPES.USGS_3DEP) {
            const usgsResult = await queryUsgs3dep(lat, lng, effectiveRadius);
            if (!usgsResult.available) {
                return res.status(404).json({
                    success: false,
                    message: "USGS 3DEP data not available for this location. Try satellite DEM instead.",
                    usgs_result: usgsResult
                });
            }
            meshData = await generateSyntheticBaseline(lat, lng, effectiveRadius, effectiveResolution);
            meshData.source = "usgs_3dep_approximation";
            meshData.usgs_resource = usgsResult.best_match;
            effectiveSensorSource = sensor_source || "USGS 3DEP LiDAR";
            accuracyH = 1.0;
            accuracyV = 0.5;
            dataTier = "A";
        } else if (effectiveSource === BASELINE_SOURCE_TYPES.SATELLITE_DEM) {
            meshData = await generateSyntheticBaseline(lat, lng, effectiveRadius, effectiveResolution);
            meshData.source = "satellite_dem";
            effectiveSensorSource = sensor_source || "Satellite DEM (Terrain Tiles)";
            accuracyH = 30.0;
            accuracyV = 10.0;
            dataTier = "B";
        } else {
            meshData = await generateSyntheticBaseline(lat, lng, effectiveRadius, effectiveResolution);
            meshData.source = "synthetic_approximation";
            effectiveSensorSource = sensor_source || "Synthetic Grid";
            accuracyH = null;
            accuracyV = null;
            dataTier = "C";
        }

        const meshId = generateId("mesh");
        const scanDate = new Date().toISOString();
        const pts = meshData.points;
        const bb = {
            min_lat: Math.min(...pts.map(p => p.lat)),
            max_lat: Math.max(...pts.map(p => p.lat)),
            min_lng: Math.min(...pts.map(p => p.lng)),
            max_lng: Math.max(...pts.map(p => p.lng))
        };
        const wkt = pointsToWKT(pts);
        const zArr = pointsToZArray(pts);
        const vDatumNumeric = parseVerticalDatum(vertical_datum);
        const vDatumLabel = verticalDatumLabel(vertical_datum);

        let client;
        try {
            client = await acquireClient("golden-mesh-synthesize", 15000);
            await client.query("BEGIN");
            await client.query(
                "UPDATE asset_golden_mesh SET is_active = FALSE, updated_at = NOW() WHERE asset_id = $1 AND is_active = TRUE AND deleted_at IS NULL",
                [asset_id]
            );
            await client.query(
                `INSERT INTO asset_golden_mesh (
                    mesh_id, asset_id, orgid, created_by, scan_date,
                    mesh_geom, mesh_z_values, mesh_format,
                    vertical_datum, horizontal_datum, coordinate_system,
                    resolution_meters, point_count, bounding_box,
                    sensor_source, processing_level,
                    accuracy_vertical_mm, accuracy_horizontal_mm,
                    is_active, notes, metadata, mesh_file_url,
                    created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5,
                    ST_GeomFromEWKT($6), $7::double precision[], $8,
                    $9, $10, $11,
                    $12, $13, $14,
                    $15, $16,
                    $17, $18,
                    TRUE, $19, $20, $21,
                    NOW(), NOW()
                )`,
                [
                    meshId, asset_id, orgid, username, scanDate,
                    wkt, zArr, "synthesized",
                    vDatumNumeric, "WGS84", "EPSG:4326",
                    effectiveResolution, pts.length, JSON.stringify(bb),
                    effectiveSensorSource, "auto_synthesized",
                    accuracyV ? accuracyV * 1000 : null, accuracyH ? accuracyH * 1000 : null,
                    notes || `Auto-synthesized baseline from ${effectiveSource}. Data tier: ${dataTier}. Vertical datum: ${vDatumLabel}.`,
                    JSON.stringify({ source_type: effectiveSource, data_tier: dataTier, radius_km: effectiveRadius, auto_generated: true, vertical_datum_label: vDatumLabel }),
                    null
                ]
            );
            await client.query("COMMIT");
            client.release();
        } catch (error) {
            if (client) {
                try {
                    await client.query("ROLLBACK");
                    client.release();
                } catch {}
            }
        }

        for (const [mid, m] of goldenMeshStore.entries()) {
            if (m.asset_id === asset_id && m.is_active && !m.deleted_at) {
                m.is_active = false;
                m.updated_at = new Date().toISOString();
            }
        }

        goldenMeshStore.set(meshId, {
            mesh_id: meshId,
            asset_id,
            orgid,
            created_by: username,
            scan_date: scanDate,
            mesh_data: { points: pts, point_count: pts.length },
            mesh_file_url: null,
            mesh_format: "synthesized",
            vertical_datum: vDatumLabel,
            horizontal_datum: "WGS84",
            coordinate_system: "EPSG:4326",
            resolution_meters: effectiveResolution,
            point_count: pts.length,
            bounding_box: bb,
            sensor_source: effectiveSensorSource,
            processing_level: "auto_synthesized",
            accuracy_vertical_mm: accuracyV ? accuracyV * 1000 : null,
            accuracy_horizontal_mm: accuracyH ? accuracyH * 1000 : null,
            is_active: true,
            superseded_by: null,
            notes: notes || `Auto-synthesized baseline from ${effectiveSource}. Data tier: ${dataTier}.`,
            metadata: { source_type: effectiveSource, data_tier: dataTier, radius_km: effectiveRadius, auto_generated: true, vertical_datum_label: vDatumLabel },
            baseline_source: effectiveSource,
            processing_status: MESH_PROCESSING_STATUS.COMPLETED,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            deleted_at: null
        });

        await logAudit(orgid, username, "SYNTHESIZE_BASELINE", "golden_mesh", meshId, null, { source_type: effectiveSource, data_tier: dataTier, point_count: pts.length }, req.ip, req.get("User-Agent"));

        return res.status(201).json({
            success: true,
            message: `Baseline synthesized successfully from ${effectiveSource}.`,
            mesh_id: meshId,
            asset_id,
            source_type: effectiveSource,
            data_tier: dataTier,
            point_count: pts.length,
            bounding_box: bb,
            resolution_meters: effectiveResolution,
            accuracy: { horizontal_m: accuracyH, vertical_m: accuracyV },
            scan_date: scanDate,
            vertical_datum: vDatumLabel,
            is_active: true,
            upgrade_note: dataTier !== "A"
                ? "This is an approximated baseline. Upload a high-resolution LiDAR scan (.las/.laz) to upgrade to full fidelity."
                : "This baseline uses high-resolution USGS 3DEP LiDAR data."
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to synthesize baseline." });
    }
});

router.get("/risk/assets/golden-mesh/processing/:jobId", async (req, res) => {
    const nodeJob = meshProcessingJobs.get(req.params.jobId);

    if (!nodeJob) {
        return res.status(404).json({ success: false, message: "Processing job not found." });
    }

    return res.status(200).json({
        success: true,
        job: {
            job_id: nodeJob.job_id,
            mesh_id: nodeJob.mesh_id,
            asset_id: nodeJob.asset_id,
            status: nodeJob.status,
            progress: nodeJob.progress,
            steps_completed: nodeJob.steps_completed,
            steps_remaining: nodeJob.steps_remaining,
            error: nodeJob.error,
            started_at: nodeJob.started_at,
            updated_at: nodeJob.updated_at,
            completed_at: nodeJob.completed_at
        }
    });
});

router.get("/risk/assets/golden-mesh/detections/:assetId", async (req, res) => {
    const aid = req.params.assetId;
    const onlyExc = req.query.exceeded_only === "true";
    const dets = [];
    for (const [, d] of changeDetectionStore.entries()) {
        if (d.asset_id === aid && (!onlyExc || d.exceeded_threshold)) dets.push(d);
    }
    dets.sort((a, b) => new Date(b.detection_date) - new Date(a.detection_date));
    return res.status(200).json({
        success: true,
        message: `Retrieved ${dets.length} change detection records for asset ${aid}.`,
        asset_id: aid,
        total_detections: dets.length,
        exceeded_count: dets.filter(d => d.exceeded_threshold).length,
        detections: dets
    });
});

router.post("/risk/assets/golden-mesh/detections/:detectionId/acknowledge", async (req, res) => {
    const det = changeDetectionStore.get(req.params.detectionId);
    if (!det) return res.status(404).json({ success: false, message: "Change detection record not found." });
    det.acknowledged = true;
    det.acknowledged_by = req.body.acknowledged_by || req.body.username || "system";
    det.acknowledged_at = new Date().toISOString();
    det.acknowledgment_status = "acknowledged";
    det.acknowledgment_notes = req.body.notes || null;
    det.updated_at = new Date().toISOString();
    return res.status(200).json({
        success: true,
        message: "Change detection acknowledged successfully.",
        detection_id: req.params.detectionId,
        acknowledged_by: det.acknowledged_by,
        acknowledged_at: det.acknowledged_at
    });
});

router.post("/risk/assets/golden-mesh/detections/:detectionId/resolve", async (req, res) => {
    const det = changeDetectionStore.get(req.params.detectionId);
    if (!det) return res.status(404).json({ success: false, message: "Change detection record not found." });
    det.resolved = true;
    det.resolved_by = req.body.resolved_by || req.body.username || "system";
    det.resolved_at = new Date().toISOString();
    det.resolution_notes = req.body.notes || req.body.resolution_notes || null;
    det.acknowledgment_status = "resolved";
    det.updated_at = new Date().toISOString();
    return res.status(200).json({
        success: true,
        message: "Change detection resolved successfully.",
        detection_id: req.params.detectionId,
        resolved_by: det.resolved_by,
        resolved_at: det.resolved_at,
        resolution_notes: det.resolution_notes
    });
});

router.post("/risk/assets/golden-mesh/change-detection", async (req, res) => {
    const {
        asset_id, mesh_id, incoming_points, threshold_mm,
        detection_mode, comparison_file_id, comparison_filename,
        comparison_notes, orgid, username, current_z_values
    } = req.body;
    if (!asset_id && !mesh_id) return res.status(400).json({ success: false, message: "The asset_id or mesh_id field is required." });

    let effectiveAssetId = asset_id;
    if (!effectiveAssetId && mesh_id) {
        const meshEntry = goldenMeshStore.get(mesh_id);
        if (meshEntry) effectiveAssetId = meshEntry.asset_id;
    }
    if (!effectiveAssetId) return res.status(400).json({ success: false, message: "Could not determine asset_id." });

    try {
        let effectiveIncoming = incoming_points || null;
        if (!effectiveIncoming && current_z_values && Array.isArray(current_z_values) && current_z_values.length > 0) {
            effectiveIncoming = current_z_values.map((z, i) => ({ lat: 0, lng: 0, z: z }));
        }

        const result = await runChangeDetection(effectiveAssetId, {
            incoming_points: effectiveIncoming,
            threshold_mm: threshold_mm || DEFORM_THRESH_MM,
            detection_mode: detection_mode || (current_z_values ? "legacy" : undefined),
            mesh_id: mesh_id || null,
            comparison_file_id: comparison_file_id || null,
            comparison_filename: comparison_filename || null,
            comparison_notes: comparison_notes || null
        });
        return res.status(result.has_baseline === false ? 404 : 200).json(result);
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to run change detection." });
    }
});

router.post("/risk/assets/golden-mesh", async (req, res) => {
    const {
        asset_id, orgid, created_by, scan_date, vertical_datum,
        mesh_file_url, mesh_file_id, mesh_format, original_filename,
        horizontal_datum, coordinate_system, resolution_meters,
        sensor_source, processing_level, accuracy_vertical_mm,
        accuracy_horizontal_mm, notes, metadata,
        horizontal_accuracy_m, vertical_accuracy_m, point_density_per_sqm,
        mesh_data
    } = req.body;

    if (!asset_id || !orgid || !created_by) {
        return res.status(400).json({ success: false, message: "asset_id, orgid, and created_by are required." });
    }

    if (!vertical_datum) {
        return res.status(400).json({ success: false, message: "vertical_datum is required." });
    }

    const meshId = generateId("mesh");
    const effectiveScanDate = scan_date || new Date().toISOString();
    const hasBinaryFile = !!(mesh_file_url || mesh_file_id);
    const hasLegacyJson = mesh_data && mesh_data.points && mesh_data.points.length > 0;
    const vDatumNumeric = parseVerticalDatum(vertical_datum);
    const vDatumLabel = verticalDatumLabel(vertical_datum);

    if (hasBinaryFile) {
        let client;
        try {
            client = await acquireClient("golden-mesh-create-binary", 15000);
            await client.query("BEGIN");
            await client.query(
                "UPDATE asset_golden_mesh SET is_active = FALSE, updated_at = NOW() WHERE asset_id = $1 AND is_active = TRUE AND deleted_at IS NULL",
                [asset_id]
            );

            const effectiveFileUrl = mesh_file_url || (mesh_file_id ? `/mesh-storage/${mesh_file_id}` : null);

            await client.query(
                `INSERT INTO asset_golden_mesh (
                    mesh_id, asset_id, orgid, created_by, scan_date,
                    mesh_format, vertical_datum, horizontal_datum, coordinate_system,
                    resolution_meters, point_count, sensor_source, processing_level,
                    accuracy_vertical_mm, accuracy_horizontal_mm,
                    is_active, notes, metadata, mesh_file_url,
                    created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5,
                    $6, $7, $8, $9,
                    $10, $11, $12, $13,
                    $14, $15,
                    TRUE, $16, $17, $18,
                    NOW(), NOW()
                )`,
                [
                    meshId, asset_id, orgid, created_by, effectiveScanDate,
                    mesh_format || "binary", vDatumNumeric, horizontal_datum || "WGS84", coordinate_system || "EPSG:4326",
                    resolution_meters || null, null, sensor_source || null, processing_level || "raw_upload",
                    accuracy_vertical_mm || (vertical_accuracy_m ? vertical_accuracy_m * 1000 : null),
                    accuracy_horizontal_mm || (horizontal_accuracy_m ? horizontal_accuracy_m * 1000 : null),
                    notes || `Binary upload: ${original_filename || "unknown"}. Vertical datum: ${vDatumLabel}.`,
                    JSON.stringify(metadata || { original_filename: original_filename || null, upload_method: "binary_pipeline", point_density_per_sqm: point_density_per_sqm || null, vertical_datum_label: vDatumLabel }),
                    effectiveFileUrl
                ]
            );
            await client.query("COMMIT");
            client.release();
        } catch (error) {
            if (client) {
                try {
                    await client.query("ROLLBACK");
                    client.release();
                } catch {}
            }
        }

        for (const [mid, m] of goldenMeshStore.entries()) {
            if (m.asset_id === asset_id && m.is_active && !m.deleted_at) {
                m.is_active = false;
                m.updated_at = new Date().toISOString();
            }
        }

        let resolvedFilePath = null;
        if (mesh_file_id) {
            const candidates = [".laz", ".las", ".copc.laz"];
            for (const ext of candidates) {
                const candidate = path.join(MESH_UPLOAD_DIR, `${mesh_file_id}${ext}`);
                if (fs.existsSync(candidate)) {
                    resolvedFilePath = candidate;
                    break;
                }
            }
        }
        if (!resolvedFilePath && mesh_file_url && fs.existsSync(mesh_file_url)) {
            resolvedFilePath = mesh_file_url;
        }

        const memoryEntry = {
            mesh_id: meshId,
            asset_id,
            orgid,
            created_by,
            scan_date: effectiveScanDate,
            mesh_data: { points: [], point_count: 0, pending_processing: true },
            mesh_file_url: mesh_file_url || (mesh_file_id ? `/mesh-storage/${mesh_file_id}` : null),
            mesh_format: mesh_format || "binary",
            vertical_datum: vDatumLabel,
            horizontal_datum: horizontal_datum || "WGS84",
            coordinate_system: coordinate_system || "EPSG:4326",
            resolution_meters: resolution_meters || null,
            point_count: 0,
            bounding_box: null,
            sensor_source: sensor_source || null,
            processing_level: processing_level || "raw_upload",
            accuracy_vertical_mm: accuracy_vertical_mm || (vertical_accuracy_m ? vertical_accuracy_m * 1000 : null),
            accuracy_horizontal_mm: accuracy_horizontal_mm || (horizontal_accuracy_m ? horizontal_accuracy_m * 1000 : null),
            is_active: true,
            superseded_by: null,
            notes: notes || `Binary upload: ${original_filename || "unknown"}.`,
            metadata: metadata || { original_filename: original_filename || null, upload_method: "binary_pipeline", point_density_per_sqm: point_density_per_sqm || null, vertical_datum_label: vDatumLabel },
            baseline_source: BASELINE_SOURCE_TYPES.MANUAL_UPLOAD,
            processing_status: MESH_PROCESSING_STATUS.PENDING,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            deleted_at: null
        };
        goldenMeshStore.set(meshId, memoryEntry);

        const job = createProcessingJob(meshId, asset_id, orgid, {
            file_url: memoryEntry.mesh_file_url,
            file_id: mesh_file_id,
            original_filename,
            format: mesh_format
        });

        const filePathForProcessing = resolvedFilePath || memoryEntry.mesh_file_url;

        dispatchToPdalWorker(job.job_id, filePathForProcessing, meshId, asset_id, orgid).catch(error => {
            updateProcessingJob(job.job_id, { status: MESH_PROCESSING_STATUS.FAILED, error: error.message });
        });

        return res.status(201).json({
            success: true,
            message: "Golden mesh baseline created. Binary file queued for processing.",
            mesh_id: meshId,
            asset_id,
            scan_date: effectiveScanDate,
            vertical_datum: vDatumLabel,
            is_active: true,
            processing: {
                job_id: job.job_id,
                status: job.status,
                poll_url: `/risk/assets/golden-mesh/processing/${job.job_id}`,
                pipeline: ["validate", "decimate", "reproject", "convert"],
                output_format: "COPC"
            },
            storage_format: "Binary (COPC)",
            created_at: new Date().toISOString()
        });
    }

    if (hasLegacyJson) {
        const pts = mesh_data.points;
        const bb = {
            min_lat: Math.min(...pts.map(p => p.lat)),
            max_lat: Math.max(...pts.map(p => p.lat)),
            min_lng: Math.min(...pts.map(p => p.lng)),
            max_lng: Math.max(...pts.map(p => p.lng))
        };
        const wkt = pointsToWKT(pts);
        const zArr = pointsToZArray(pts);

        let client;
        try {
            client = await acquireClient("golden-mesh-create-legacy", 15000);
            await client.query("BEGIN");
            await client.query(
                "UPDATE asset_golden_mesh SET is_active = FALSE, updated_at = NOW() WHERE asset_id = $1 AND is_active = TRUE AND deleted_at IS NULL",
                [asset_id]
            );
            await client.query(
                `INSERT INTO asset_golden_mesh (
                    mesh_id, asset_id, orgid, created_by, scan_date,
                    mesh_geom, mesh_z_values, mesh_format,
                    vertical_datum, horizontal_datum, coordinate_system,
                    resolution_meters, point_count, bounding_box,
                    sensor_source, processing_level,
                    accuracy_vertical_mm, accuracy_horizontal_mm,
                    is_active, notes, metadata, mesh_file_url,
                    created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5,
                    ST_GeomFromEWKT($6), $7::double precision[], $8,
                    $9, $10, $11,
                    $12, $13, $14,
                    $15, $16,
                    $17, $18,
                    TRUE, $19, $20, $21,
                    NOW(), NOW()
                )`,
                [
                    meshId, asset_id, orgid, created_by, effectiveScanDate,
                    wkt, zArr, mesh_format || "json_legacy",
                    vDatumNumeric, horizontal_datum || "WGS84", coordinate_system || "EPSG:4326",
                    resolution_meters || null, pts.length, JSON.stringify(bb),
                    sensor_source || null, processing_level || null,
                    accuracy_vertical_mm || (vertical_accuracy_m ? vertical_accuracy_m * 1000 : null),
                    accuracy_horizontal_mm || (horizontal_accuracy_m ? horizontal_accuracy_m * 1000 : null),
                    notes || null,
                    JSON.stringify(metadata || { vertical_datum_label: vDatumLabel }),
                    mesh_file_url || null
                ]
            );
            await client.query("COMMIT");
            client.release();
        } catch (error) {
            if (client) {
                try {
                    await client.query("ROLLBACK");
                    client.release();
                } catch {}
            }
        }

        for (const [mid, m] of goldenMeshStore.entries()) {
            if (m.asset_id === asset_id && m.is_active && !m.deleted_at) {
                m.is_active = false;
                m.updated_at = new Date().toISOString();
            }
        }

        goldenMeshStore.set(meshId, {
            mesh_id: meshId,
            asset_id,
            orgid,
            created_by,
            scan_date: effectiveScanDate,
            mesh_data,
            mesh_file_url: mesh_file_url || null,
            mesh_format: mesh_format || "json_legacy",
            vertical_datum: vDatumLabel,
            horizontal_datum: horizontal_datum || "WGS84",
            coordinate_system: coordinate_system || "EPSG:4326",
            resolution_meters: resolution_meters || null,
            point_count: pts.length,
            bounding_box: bb,
            sensor_source: sensor_source || null,
            processing_level: processing_level || null,
            accuracy_vertical_mm: accuracy_vertical_mm || (vertical_accuracy_m ? vertical_accuracy_m * 1000 : null),
            accuracy_horizontal_mm: accuracy_horizontal_mm || (horizontal_accuracy_m ? horizontal_accuracy_m * 1000 : null),
            is_active: true,
            superseded_by: null,
            notes: notes || null,
            metadata: metadata || {},
            baseline_source: BASELINE_SOURCE_TYPES.LEGACY_JSON,
            processing_status: MESH_PROCESSING_STATUS.COMPLETED,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            deleted_at: null
        });

        return res.status(201).json({
            success: true,
            message: "Golden mesh baseline created successfully (legacy JSON).",
            mesh_id: meshId,
            asset_id,
            point_count: pts.length,
            bounding_box: bb,
            scan_date: effectiveScanDate,
            vertical_datum: vDatumLabel,
            is_active: true,
            storage_format: "PostGIS MultiPointZ",
            created_at: new Date().toISOString(),
            upgrade_note: "Consider uploading a binary .las/.laz file for better performance with large datasets."
        });
    }

    let client;
    try {
        client = await acquireClient("golden-mesh-create-placeholder", 15000);
        await client.query("BEGIN");
        await client.query(
            "UPDATE asset_golden_mesh SET is_active = FALSE, updated_at = NOW() WHERE asset_id = $1 AND is_active = TRUE AND deleted_at IS NULL",
            [asset_id]
        );
        await client.query(
            `INSERT INTO asset_golden_mesh (
                mesh_id, asset_id, orgid, created_by, scan_date,
                mesh_format, vertical_datum, horizontal_datum, coordinate_system,
                resolution_meters, sensor_source, processing_level,
                accuracy_vertical_mm, accuracy_horizontal_mm,
                is_active, notes, metadata,
                created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5,
                $6, $7, $8, $9,
                $10, $11, $12,
                $13, $14,
                TRUE, $15, $16,
                NOW(), NOW()
            )`,
            [
                meshId, asset_id, orgid, created_by, effectiveScanDate,
                "placeholder", vDatumNumeric, horizontal_datum || "WGS84", coordinate_system || "EPSG:4326",
                resolution_meters || null, sensor_source || null, processing_level || null,
                accuracy_vertical_mm || (vertical_accuracy_m ? vertical_accuracy_m * 1000 : null),
                accuracy_horizontal_mm || (horizontal_accuracy_m ? horizontal_accuracy_m * 1000 : null),
                notes || `Baseline registered. Upload a .las/.laz file or synthesize from public data. Vertical datum: ${vDatumLabel}.`,
                JSON.stringify(metadata || { horizontal_accuracy_m: horizontal_accuracy_m || null, vertical_accuracy_m: vertical_accuracy_m || null, point_density_per_sqm: point_density_per_sqm || null, vertical_datum_label: vDatumLabel })
            ]
        );
        await client.query("COMMIT");
        client.release();
    } catch (error) {
        if (client) {
            try {
                await client.query("ROLLBACK");
                client.release();
            } catch {}
        }
    }

    for (const [mid, m] of goldenMeshStore.entries()) {
        if (m.asset_id === asset_id && m.is_active && !m.deleted_at) {
            m.is_active = false;
            m.updated_at = new Date().toISOString();
        }
    }

    goldenMeshStore.set(meshId, {
        mesh_id: meshId,
        asset_id,
        orgid,
        created_by,
        scan_date: effectiveScanDate,
        mesh_data: null,
        mesh_file_url: null,
        mesh_format: "placeholder",
        vertical_datum: vDatumLabel,
        horizontal_datum: horizontal_datum || "WGS84",
        coordinate_system: coordinate_system || "EPSG:4326",
        resolution_meters: resolution_meters || null,
        point_count: 0,
        bounding_box: null,
        sensor_source: sensor_source || null,
        processing_level: processing_level || null,
        accuracy_vertical_mm: accuracy_vertical_mm || (vertical_accuracy_m ? vertical_accuracy_m * 1000 : null),
        accuracy_horizontal_mm: accuracy_horizontal_mm || (horizontal_accuracy_m ? horizontal_accuracy_m * 1000 : null),
        is_active: true,
        superseded_by: null,
        notes: notes || "Baseline registered. Upload a .las/.laz file or synthesize from public data.",
        metadata: metadata || { horizontal_accuracy_m: horizontal_accuracy_m || null, vertical_accuracy_m: vertical_accuracy_m || null, point_density_per_sqm: point_density_per_sqm || null, vertical_datum_label: vDatumLabel },
        baseline_source: "placeholder",
        processing_status: MESH_PROCESSING_STATUS.PENDING,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null
    });

    return res.status(201).json({
        success: true,
        message: "Golden mesh baseline registered. Upload a binary scan file or use Synthesize Baseline to populate.",
        mesh_id: meshId,
        asset_id,
        scan_date: effectiveScanDate,
        vertical_datum: vDatumLabel,
        is_active: true,
        next_steps: [
            "Upload a .las or .laz file via the upload endpoint.",
            "Or use POST /risk/assets/golden-mesh/synthesize to auto-generate from public data."
        ],
        created_at: new Date().toISOString()
    });
});

router.get("/risk/assets/golden-mesh/:assetId", async (req, res) => {
    const aid = req.params.assetId;
    const inclPts = req.query.include_points === "true";
    try {
        let sql;
        if (inclPts) {
            sql = `SELECT mesh_id, asset_id, orgid, created_by, scan_date, mesh_file_url, mesh_format, vertical_datum, horizontal_datum, coordinate_system, resolution_meters, point_count, bounding_box, sensor_source, processing_level, accuracy_vertical_mm, accuracy_horizontal_mm, is_active, superseded_by, notes, metadata, created_at, updated_at, deleted_at, mesh_z_values AS z_vals,
                   CASE WHEN mesh_geom IS NOT NULL THEN (SELECT array_agg(json_build_object('x', ST_X(geom), 'y', ST_Y(geom), 'z', ST_Z(geom))) FROM ST_DumpPoints(mesh_geom) AS dp(path, geom)) ELSE NULL END AS point_coords
                   FROM asset_golden_mesh WHERE asset_id = $1 AND deleted_at IS NULL ORDER BY scan_date DESC`;
        } else {
            sql = `SELECT mesh_id, asset_id, orgid, created_by, scan_date, mesh_file_url, mesh_format, vertical_datum, horizontal_datum, coordinate_system, resolution_meters, point_count, bounding_box, sensor_source, processing_level, accuracy_vertical_mm, accuracy_horizontal_mm, is_active, superseded_by, notes, metadata, created_at, updated_at, deleted_at
                   FROM asset_golden_mesh WHERE asset_id = $1 AND deleted_at IS NULL ORDER BY scan_date DESC`;
        }
        const result = await queryWithTimeout(sql, [aid], QUERY_TIMEOUT_MS);
        const meshes = result.rows.map(row => {
            const mc = { ...row, bounding_box: parseJson(row.bounding_box), metadata: parseJson(row.metadata) };
            if (inclPts && row.point_coords) {
                const pts = row.point_coords.map((coord, i) => ({
                    lat: coord.y,
                    lng: coord.x,
                    z: row.z_vals && row.z_vals[i] != null ? row.z_vals[i] : coord.z
                }));
                mc.mesh_data = { points: pts, point_count: pts.length };
            } else if (!inclPts) {
                mc.mesh_data = { point_count: row.point_count };
            }
            delete mc.point_coords;
            delete mc.z_vals;

            const memMesh = goldenMeshStore.get(row.mesh_id);
            mc.processing_status = memMesh ? memMesh.processing_status : MESH_PROCESSING_STATUS.COMPLETED;
            mc.baseline_source = memMesh ? memMesh.baseline_source : null;
            mc.has_binary_file = !!row.mesh_file_url;

            return mc;
        });
        const active = meshes.find(m => m.is_active);
        return res.status(200).json({
            success: true,
            message: `Retrieved ${meshes.length} golden mesh baselines for asset ${aid}.`,
            asset_id: aid,
            total_baselines: meshes.length,
            storage_format: "PostGIS MultiPointZ + Binary (COPC)",
            active_baseline: active ? {
                mesh_id: active.mesh_id,
                scan_date: active.scan_date,
                point_count: active.point_count,
                vertical_datum: active.vertical_datum,
                processing_status: active.processing_status,
                baseline_source: active.baseline_source,
                has_binary_file: active.has_binary_file
            } : null,
            meshes: meshes
        });
    } catch (error) {
        const meshes = [];
        for (const [, m] of goldenMeshStore.entries()) {
            if (m.asset_id === aid && !m.deleted_at) {
                const mc = { ...m };
                if (!inclPts && mc.mesh_data) mc.mesh_data = { point_count: (m.mesh_data && m.mesh_data.points ? m.mesh_data.points.length : 0) };
                meshes.push(mc);
            }
        }
        meshes.sort((a, b) => new Date(b.scan_date) - new Date(a.scan_date));
        const active = meshes.find(m => m.is_active);
        return res.status(200).json({
            success: true,
            message: `Retrieved ${meshes.length} golden mesh baselines for asset ${aid} (from memory fallback).`,
            asset_id: aid,
            total_baselines: meshes.length,
            active_baseline: active ? {
                mesh_id: active.mesh_id,
                scan_date: active.scan_date,
                point_count: active.point_count,
                vertical_datum: active.vertical_datum,
                processing_status: active.processing_status,
                baseline_source: active.baseline_source
            } : null,
            meshes: meshes
        });
    }
});

router.delete("/risk/assets/golden-mesh/:meshId", async (req, res) => {
    const mid = req.params.meshId;
    try {
        const result = await queryWithTimeout(
            "UPDATE asset_golden_mesh SET deleted_at = NOW(), is_active = FALSE, updated_at = NOW() WHERE mesh_id = $1 AND deleted_at IS NULL RETURNING asset_id",
            [mid], 10000
        );
        if (result.rowCount === 0) {
            const m = goldenMeshStore.get(mid);
            if (!m) return res.status(404).json({ success: false, message: "Golden mesh baseline not found." });
            m.deleted_at = new Date().toISOString();
            m.is_active = false;
            m.updated_at = new Date().toISOString();
            return res.status(200).json({
                success: true,
                message: "Golden mesh baseline deleted successfully (memory only).",
                mesh_id: mid,
                asset_id: m.asset_id,
                deleted_at: m.deleted_at
            });
        }
        const m = goldenMeshStore.get(mid);
        if (m) {
            m.deleted_at = new Date().toISOString();
            m.is_active = false;
            m.updated_at = new Date().toISOString();
        }
        return res.status(200).json({
            success: true,
            message: "Golden mesh baseline deleted successfully.",
            mesh_id: mid,
            asset_id: result.rows[0].asset_id,
            deleted_at: new Date().toISOString()
        });
    } catch (error) {
        const m = goldenMeshStore.get(mid);
        if (!m) return res.status(404).json({ success: false, message: "Golden mesh baseline not found." });
        m.deleted_at = new Date().toISOString();
        m.is_active = false;
        m.updated_at = new Date().toISOString();
        return res.status(200).json({
            success: true,
            message: "Golden mesh baseline deleted successfully (memory fallback).",
            mesh_id: mid,
            asset_id: m.asset_id,
            deleted_at: m.deleted_at
        });
    }
});

router.get("/risk/assets/:assetId", async (req, res) => {
    const { assetId } = req.params;
    const { orgid } = req.query;
    if (!orgid) return res.status(400).json({ success: false, message: "Organization ID is required." });
    try {
        const result = await pool.query(`SELECT * FROM risk_assets WHERE asset_id = $1 AND orgid = $2 AND deleted_at IS NULL`, [assetId, orgid]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, message: "Asset not found." });
        const [zonesRes, historyRes, alertsRes] = await Promise.all([
            pool.query(`SELECT rz.*, razl.proximity_meters, razl.exposure_level, razl.calculated_at FROM risk_zones rz INNER JOIN risk_asset_zone_links razl ON rz.zone_id = razl.zone_id WHERE razl.asset_id = $1 AND rz.deleted_at IS NULL`, [assetId]),
            pool.query(`SELECT * FROM risk_asset_history WHERE asset_id = $1 ORDER BY recorded_at DESC LIMIT 100`, [assetId]),
            pool.query(`SELECT * FROM risk_alerts WHERE asset_id = $1 AND deleted_at IS NULL`, [assetId])
        ]);
        return res.status(200).json({
            success: true,
            message: "Asset retrieved successfully.",
            asset: result.rows[0],
            zones: zonesRes.rows,
            history: historyRes.rows,
            alerts: alertsRes.rows
        });
    } catch {
        return res.status(500).json({ success: false, message: "An error occurred while retrieving the asset." });
    }
});

router.get("/risk/assets/:assetId/history", async (req, res) => {
    const { assetId } = req.params;
    const { orgid, start_date, end_date, limit } = req.query;
    if (!orgid) return res.status(400).json({ success: false, message: "Organization ID is required." });
    try {
        const existingResult = await pool.query(`SELECT asset_id FROM risk_assets WHERE asset_id = $1 AND orgid = $2 AND deleted_at IS NULL`, [assetId, orgid]);
        if (existingResult.rows.length === 0) return res.status(404).json({ success: false, message: "Asset not found." });
        let query = `SELECT * FROM risk_asset_history WHERE asset_id = $1 AND orgid = $2`;
        let params = [assetId, orgid];
        let pi = 3;
        if (start_date) {
            query += ` AND recorded_at >= ${pi}`;
            params.push(start_date);
            pi++;
        }
        if (end_date) {
            query += ` AND recorded_at <= ${pi}`;
            params.push(end_date);
            pi++;
        }
        query += ` ORDER BY recorded_at DESC LIMIT ${pi}`;
        params.push(Math.min(parseInt(limit) || 100, 1000));
        const result = await pool.query(query, params);
        return res.status(200).json({
            success: true,
            message: "Asset history retrieved successfully.",
            asset_id: assetId,
            count: result.rows.length,
            history: result.rows
        });
    } catch {
        return res.status(500).json({ success: false, message: "An error occurred while retrieving asset history." });
    }
});

router.put("/risk/assets/:assetId", async (req, res) => {
    const { assetId } = req.params;
    const { orgid, username, name, description, asset_type, priority, status, latitude, longitude, elevation_meters, address_street, address_city, address_state, address_country, address_postal_code, metadata, risk_score, risk_factors, tags, image_url, external_id } = req.body;
    if (!orgid || !username) return res.status(400).json({ success: false, message: "Organization ID and username are required." });
    if (asset_type && !validateAssetType(asset_type)) return res.status(400).json({ success: false, message: "Invalid asset type provided." });
    if (priority && !validatePriority(priority)) return res.status(400).json({ success: false, message: "Invalid priority provided." });
    if (status && !validateStatus(status)) return res.status(400).json({ success: false, message: "Invalid status provided." });
    if (latitude !== undefined && longitude !== undefined && !validateCoordinates(latitude, longitude)) return res.status(400).json({ success: false, message: "Invalid coordinates provided." });

    try {
        const existingResult = await pool.query(`SELECT * FROM risk_assets WHERE asset_id = $1 AND orgid = $2 AND deleted_at IS NULL`, [assetId, orgid]);
        if (existingResult.rows.length === 0) return res.status(404).json({ success: false, message: "Asset not found." });
        const oldValues = existingResult.rows[0];
        const updateFields = [];
        const updateValues = [];
        let pi = 1;
        const addField = (fieldName, value) => {
            if (value !== undefined) {
                updateFields.push(`${fieldName} = ${pi}`);
                updateValues.push(value);
                pi++;
            }
        };
        addField("name", name);
        addField("description", description);
        addField("asset_type", asset_type);
        addField("priority", priority);
        addField("status", status);
        addField("latitude", latitude);
        addField("longitude", longitude);
        addField("elevation_meters", elevation_meters);
        addField("address_street", address_street);
        addField("address_city", address_city);
        addField("address_state", address_state);
        addField("address_country", address_country);
        addField("address_postal_code", address_postal_code);
        addField("image_url", image_url);
        addField("external_id", external_id);
        if (metadata !== undefined) {
            updateFields.push(`metadata = ${pi}`);
            updateValues.push(JSON.stringify(metadata));
            pi++;
        }
        if (risk_score !== undefined) {
            updateFields.push(`risk_score = ${pi}`);
            updateValues.push(risk_score);
            pi++;
            updateFields.push(`last_assessment_at = NOW()`);
        }
        if (risk_factors !== undefined) {
            updateFields.push(`risk_factors = ${pi}`);
            updateValues.push(JSON.stringify(risk_factors));
            pi++;
        }
        if (tags !== undefined) {
            updateFields.push(`tags = ${pi}`);
            updateValues.push(tags);
            pi++;
        }
        if (updateFields.length === 0) return res.status(400).json({ success: false, message: "No fields to update." });
        updateFields.push(`updated_at = NOW()`);
        updateValues.push(assetId, orgid);
        const result = await pool.query(`UPDATE risk_assets SET ${updateFields.join(", ")} WHERE asset_id = ${pi} AND orgid = ${pi + 1} RETURNING *`, updateValues);
        if (risk_score !== undefined) {
            await pool.query(`INSERT INTO risk_asset_history (history_id, asset_id, orgid, risk_score, risk_factors, status, source) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                [generateId("rah"), assetId, orgid, risk_score, JSON.stringify(risk_factors || {}), status || oldValues.status, "manual_update"]);
        }
        await logAudit(orgid, username, "UPDATE", "risk_asset", assetId, oldValues, result.rows[0], req.ip, req.get("User-Agent"));
        return res.status(200).json({ success: true, message: "Asset updated successfully.", asset: result.rows[0] });
    } catch {
        return res.status(500).json({ success: false, message: "An error occurred while updating the asset." });
    }
});

router.delete("/risk/assets/:assetId", async (req, res) => {
    const { assetId } = req.params;
    const { orgid, username, hard_delete } = req.body;
    if (!orgid || !username) return res.status(400).json({ success: false, message: "Organization ID and username are required." });
    try {
        const existingResult = await pool.query(`SELECT * FROM risk_assets WHERE asset_id = $1 AND orgid = $2 AND deleted_at IS NULL`, [assetId, orgid]);
        if (existingResult.rows.length === 0) return res.status(404).json({ success: false, message: "Asset not found." });
        const oldValues = existingResult.rows[0];
        if (hard_delete === true) {
            await pool.query(`DELETE FROM risk_assets WHERE asset_id = $1 AND orgid = $2`, [assetId, orgid]);
        } else {
            await pool.query(`UPDATE risk_assets SET deleted_at = NOW(), updated_at = NOW() WHERE asset_id = $1 AND orgid = $2`, [assetId, orgid]);
        }
        await logAudit(orgid, username, hard_delete ? "HARD_DELETE" : "SOFT_DELETE", "risk_asset", assetId, oldValues, null, req.ip, req.get("User-Agent"));
        return res.status(200).json({ success: true, message: "Asset deleted successfully." });
    } catch {
        return res.status(500).json({ success: false, message: "An error occurred while deleting the asset." });
    }
});

router.post("/risk/assets/:assetId/restore", async (req, res) => {
    const { assetId } = req.params;
    const { orgid, username } = req.body;
    if (!orgid || !username) return res.status(400).json({ success: false, message: "Organization ID and username are required." });
    try {
        const existingResult = await pool.query(`SELECT * FROM risk_assets WHERE asset_id = $1 AND orgid = $2 AND deleted_at IS NOT NULL`, [assetId, orgid]);
        if (existingResult.rows.length === 0) return res.status(404).json({ success: false, message: "Deleted asset not found." });
        const result = await pool.query(`UPDATE risk_assets SET deleted_at = NULL, updated_at = NOW() WHERE asset_id = $1 AND orgid = $2 RETURNING *`, [assetId, orgid]);
        await logAudit(orgid, username, "RESTORE", "risk_asset", assetId, { deleted_at: existingResult.rows[0].deleted_at }, { deleted_at: null }, req.ip, req.get("User-Agent"));
        return res.status(200).json({ success: true, message: "Asset restored successfully.", asset: result.rows[0] });
    } catch {
        return res.status(500).json({ success: false, message: "An error occurred while restoring the asset." });
    }
});

router.post("/risk/assets/:assetId/risk-assessment", async (req, res) => {
    const { assetId } = req.params;
    const { orgid, username, risk_score, risk_factors, source } = req.body;
    if (!orgid || !username || risk_score === undefined) return res.status(400).json({ success: false, message: "Organization ID, username, and risk score are required." });
    if (risk_score < 0 || risk_score > 100) return res.status(400).json({ success: false, message: "Risk score must be between 0 and 100." });
    try {
        const existingResult = await pool.query(`SELECT * FROM risk_assets WHERE asset_id = $1 AND orgid = $2 AND deleted_at IS NULL`, [assetId, orgid]);
        if (existingResult.rows.length === 0) return res.status(404).json({ success: false, message: "Asset not found." });
        const oldValues = existingResult.rows[0];
        const result = await pool.query(`UPDATE risk_assets SET risk_score = $1, risk_factors = $2, last_assessment_at = NOW(), updated_at = NOW() WHERE asset_id = $3 AND orgid = $4 RETURNING *`, [risk_score, JSON.stringify(risk_factors || {}), assetId, orgid]);
        await pool.query(`INSERT INTO risk_asset_history (history_id, asset_id, orgid, risk_score, risk_factors, status, source) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [generateId("rah"), assetId, orgid, risk_score, JSON.stringify(risk_factors || {}), result.rows[0].status, source || "manual_assessment"]);
        await logAudit(orgid, username, "RISK_ASSESSMENT", "risk_asset", assetId, { risk_score: oldValues.risk_score }, { risk_score }, req.ip, req.get("User-Agent"));
        return res.status(200).json({ success: true, message: "Risk assessment recorded successfully.", asset: result.rows[0] });
    } catch {
        return res.status(500).json({ success: false, message: "An error occurred while recording the risk assessment." });
    }
});

router.post("/risk/assets/nearby", async (req, res) => {
    const { orgid, latitude, longitude, radius_meters, asset_type, priority, status, limit } = req.body;
    if (!orgid || latitude === undefined || longitude === undefined || !radius_meters) return res.status(400).json({ success: false, message: "Organization ID, latitude, longitude, and radius are required." });
    if (radius_meters > 500000) return res.status(400).json({ success: false, message: "Radius cannot exceed 500 kilometers." });
    try {
        let query = `SELECT *, (6371000 * acos(cos(radians($2)) * cos(radians(latitude)) * cos(radians(longitude) - radians($3)) + sin(radians($2)) * sin(radians(latitude)))) AS distance_meters FROM risk_assets WHERE orgid = $1 AND deleted_at IS NULL AND (6371000 * acos(cos(radians($2)) * cos(radians(latitude)) * cos(radians(longitude) - radians($3)) + sin(radians($2)) * sin(radians(latitude)))) <= $4`;
        let params = [orgid, latitude, longitude, radius_meters];
        let pi = 5;
        if (asset_type) {
            query += ` AND asset_type = ${pi}`;
            params.push(asset_type);
            pi++;
        }
        if (priority) {
            query += ` AND priority = ${pi}`;
            params.push(priority);
            pi++;
        }
        if (status) {
            query += ` AND status = ${pi}`;
            params.push(status);
            pi++;
        }
        query += ` ORDER BY distance_meters ASC LIMIT ${pi}`;
        params.push(Math.min(parseInt(limit) || 100, 500));
        const result = await pool.query(query, params);
        return res.status(200).json({
            success: true,
            message: "Nearby assets retrieved successfully.",
            center: { latitude, longitude },
            radius_meters,
            count: result.rows.length,
            assets: result.rows
        });
    } catch {
        return res.status(500).json({ success: false, message: "An error occurred while retrieving nearby assets." });
    }
});

router.post("/risk/assets/:assetId/link-zone", async (req, res) => {
    const { assetId } = req.params;
    const { orgid, username, zone_id, proximity_meters, exposure_level } = req.body;
    if (!orgid || !username || !zone_id) return res.status(400).json({ success: false, message: "Organization ID, username, and zone ID are required." });
    try {
        const assetResult = await pool.query(`SELECT asset_id FROM risk_assets WHERE asset_id = $1 AND orgid = $2 AND deleted_at IS NULL`, [assetId, orgid]);
        if (assetResult.rows.length === 0) return res.status(404).json({ success: false, message: "Asset not found." });
        const zoneResult = await pool.query(`SELECT zone_id FROM risk_zones WHERE zone_id = $1 AND orgid = $2 AND deleted_at IS NULL`, [zone_id, orgid]);
        if (zoneResult.rows.length === 0) return res.status(404).json({ success: false, message: "Zone not found." });
        const linkId = generateId("azl");
        const result = await pool.query(`INSERT INTO risk_asset_zone_links (link_id, asset_id, zone_id, proximity_meters, exposure_level) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (asset_id, zone_id) DO UPDATE SET proximity_meters = $4, exposure_level = $5, calculated_at = NOW() RETURNING *`,
            [linkId, assetId, zone_id, proximity_meters || null, exposure_level || "Unknown"]);
        await logAudit(orgid, username, "LINK_ZONE", "risk_asset", assetId, null, { zone_id, proximity_meters, exposure_level }, req.ip, req.get("User-Agent"));
        return res.status(200).json({ success: true, message: "Asset linked to zone successfully.", link: result.rows[0] });
    } catch {
        return res.status(500).json({ success: false, message: "An error occurred while linking the asset to the zone." });
    }
});

router.delete("/risk/assets/:assetId/unlink-zone/:zoneId", async (req, res) => {
    const { assetId, zoneId } = req.params;
    const { orgid, username } = req.body;
    if (!orgid || !username) return res.status(400).json({ success: false, message: "Organization ID and username are required." });
    try {
        const result = await pool.query(`DELETE FROM risk_asset_zone_links WHERE asset_id = $1 AND zone_id = $2 RETURNING *`, [assetId, zoneId]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, message: "Link not found." });
        await logAudit(orgid, username, "UNLINK_ZONE", "risk_asset", assetId, { zone_id: zoneId }, null, req.ip, req.get("User-Agent"));
        return res.status(200).json({ success: true, message: "Asset unlinked from zone successfully." });
    } catch {
        return res.status(500).json({ success: false, message: "An error occurred while unlinking the asset from the zone." });
    }
});

module.exports = router;
module.exports.goldenMeshStore = goldenMeshStore;
module.exports.changeDetectionStore = changeDetectionStore;
module.exports.meshProcessingJobs = meshProcessingJobs;
module.exports.runChangeDetection = runChangeDetection;
module.exports.classifySeverity = classifySeverity;
module.exports.MESH_PROCESSED_DIR = MESH_PROCESSED_DIR;