const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const { pool } = require("../../config/db");

const QUERY_TIMEOUT_MS = 15000;

const generateId = (prefix) => `${prefix}_${crypto.randomBytes(12).toString("hex")}`;

const logError = (context, error) => {
    const cause = error.cause ? ` (${error.cause.code || error.cause.message})` : "";
    process.stderr.write(`[FAIL] ${context}: ${error.message}${cause}.\n`);
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

const queryWithTimeout = async (sql, params, ms) => {
    return withTimeout(pool.query(sql, params), ms || QUERY_TIMEOUT_MS, "Database query");
};

const parseJson = (value) => {
    if (value == null) return value;
    if (typeof value !== "string") return value;
    try { return JSON.parse(value); } catch { return value; }
};

const validateMode = (mode) => mode === "point_radius" || mode === "bbox";

const validatePointRadius = (body) => {
    const lat = parseFloat(body.latitude);
    const lng = parseFloat(body.longitude);
    const radius = parseFloat(body.radius_km);
    if (isNaN(lat) || isNaN(lng) || isNaN(radius)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    if (radius <= 0 || radius > 10000) return null;
    return { latitude: lat, longitude: lng, radius_km: radius };
};

const validateBbox = (body) => {
    const minLat = parseFloat(body.min_lat);
    const maxLat = parseFloat(body.max_lat);
    const minLng = parseFloat(body.min_lng);
    const maxLng = parseFloat(body.max_lng);
    if ([minLat, maxLat, minLng, maxLng].some((v) => isNaN(v))) return null;
    if (minLat >= maxLat || minLng >= maxLng) return null;
    if (minLat < -90 || maxLat > 90 || minLng < -180 || maxLng > 180) return null;
    return { min_lat: minLat, max_lat: maxLat, min_lng: minLng, max_lng: maxLng };
};

const rowToArea = (row) => {
    if (!row) return null;
    if (row.mode === "point_radius") {
        return {
            mode: "point_radius",
            name: row.name || "",
            address: row.address || "",
            latitude: parseFloat(row.latitude),
            longitude: parseFloat(row.longitude),
            radius_km: parseFloat(row.radius_km)
        };
    }
    return {
        mode: "bbox",
        name: row.name || "",
        min_lat: parseFloat(row.min_lat),
        max_lat: parseFloat(row.max_lat),
        min_lng: parseFloat(row.min_lng),
        max_lng: parseFloat(row.max_lng)
    };
};

const SELECT_AREA_COLUMNS = "area_id, orgid, username, name, mode, address, latitude, longitude, radius_km, min_lat, max_lat, min_lng, max_lng, filter_active, metadata, created_at, updated_at";

router.get("/risk/user/area", async (req, res) => {
    const { orgid, username } = req.query;
    if (!orgid || !username) {
        return res.status(400).json({ success: false, message: "orgid and username query parameters are required." });
    }
    try {
        const result = await queryWithTimeout(
            `SELECT ${SELECT_AREA_COLUMNS} FROM risk_user_areas WHERE orgid = $1 AND username = $2 LIMIT 1`,
            [orgid, username]
        );
        if (!result.rows.length) {
            return res.status(200).json({
                success: true, area: null, filter_active: false,
                message: "No saved area for this user."
            });
        }
        const row = result.rows[0];
        return res.status(200).json({
            success: true,
            area: rowToArea(row),
            filter_active: !!row.filter_active,
            updated_at: row.updated_at,
            metadata: parseJson(row.metadata),
            message: "User area retrieved successfully."
        });
    } catch (error) {
        logError("Get user area.", error);
        return res.status(500).json({ success: false, message: "Failed to retrieve user area." });
    }
});

router.put("/risk/user/area", async (req, res) => {
    const { orgid, username, mode, name, address, filter_active } = req.body;
    if (!orgid || !username) {
        return res.status(400).json({ success: false, message: "orgid and username are required." });
    }
    if (!validateMode(mode)) {
        return res.status(400).json({ success: false, message: "mode must be 'point_radius' or 'bbox'." });
    }

    let pointRadius = null;
    let bbox = null;
    if (mode === "point_radius") {
        pointRadius = validatePointRadius(req.body);
        if (!pointRadius) {
            return res.status(400).json({
                success: false,
                message: "Invalid point or radius. Latitude must be -90 to 90, longitude -180 to 180, radius 1 to 10000 km."
            });
        }
    } else {
        bbox = validateBbox(req.body);
        if (!bbox) {
            return res.status(400).json({
                success: false,
                message: "Invalid bounding box. Min coordinates must be less than max, and values must be in valid lat/lng ranges."
            });
        }
    }

    const isFilterActive = filter_active === undefined ? true : !!filter_active;
    const trimmedName = typeof name === "string" ? name.trim().substring(0, 200) : null;
    const trimmedAddress = typeof address === "string" ? address.trim().substring(0, 500) : null;

    try {
        const areaId = generateId("area");
        const params = [
            areaId, orgid, username, trimmedName, mode, trimmedAddress,
            pointRadius?.latitude ?? null, pointRadius?.longitude ?? null, pointRadius?.radius_km ?? null,
            bbox?.min_lat ?? null, bbox?.max_lat ?? null, bbox?.min_lng ?? null, bbox?.max_lng ?? null,
            isFilterActive
        ];

        const geomSql = mode === "point_radius"
            ? "ST_Buffer(ST_SetSRID(ST_MakePoint($8, $7), 4326)::geography, $9 * 1000)"
            : "ST_SetSRID(ST_MakeEnvelope($12, $10, $13, $11, 4326), 4326)::geography";

        const sql = `
            INSERT INTO risk_user_areas (
                area_id, orgid, username, name, mode, address,
                latitude, longitude, radius_km,
                min_lat, max_lat, min_lng, max_lng,
                filter_active, geom, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, ${geomSql}, NOW())
            ON CONFLICT (orgid, username) DO UPDATE SET
                name = EXCLUDED.name,
                mode = EXCLUDED.mode,
                address = EXCLUDED.address,
                latitude = EXCLUDED.latitude,
                longitude = EXCLUDED.longitude,
                radius_km = EXCLUDED.radius_km,
                min_lat = EXCLUDED.min_lat,
                max_lat = EXCLUDED.max_lat,
                min_lng = EXCLUDED.min_lng,
                max_lng = EXCLUDED.max_lng,
                filter_active = EXCLUDED.filter_active,
                geom = EXCLUDED.geom,
                updated_at = NOW()
            RETURNING ${SELECT_AREA_COLUMNS}
        `;

        const result = await queryWithTimeout(sql, params);
        const row = result.rows[0];
        return res.status(200).json({
            success: true,
            area: rowToArea(row),
            filter_active: !!row.filter_active,
            updated_at: row.updated_at,
            message: "User area saved successfully."
        });
    } catch (error) {
        logError("Save user area.", error);
        return res.status(500).json({ success: false, message: "Failed to save user area." });
    }
});

router.patch("/risk/user/area/filter", async (req, res) => {
    const { orgid, username, filter_active } = req.body;
    if (!orgid || !username) {
        return res.status(400).json({ success: false, message: "orgid and username are required." });
    }
    if (filter_active === undefined || filter_active === null) {
        return res.status(400).json({ success: false, message: "filter_active is required." });
    }
    try {
        const result = await queryWithTimeout(
            "UPDATE risk_user_areas SET filter_active = $1, updated_at = NOW() WHERE orgid = $2 AND username = $3 RETURNING filter_active",
            [!!filter_active, orgid, username]
        );
        if (!result.rows.length) {
            return res.status(404).json({ success: false, message: "No saved area to toggle. Save an area first." });
        }
        return res.status(200).json({
            success: true,
            filter_active: result.rows[0].filter_active,
            message: "Filter state updated."
        });
    } catch (error) {
        logError("Update filter state.", error);
        return res.status(500).json({ success: false, message: "Failed to update filter state." });
    }
});

router.delete("/risk/user/area", async (req, res) => {
    const { orgid, username } = req.query;
    if (!orgid || !username) {
        return res.status(400).json({ success: false, message: "orgid and username query parameters are required." });
    }
    try {
        const result = await queryWithTimeout(
            "DELETE FROM risk_user_areas WHERE orgid = $1 AND username = $2 RETURNING area_id",
            [orgid, username]
        );
        return res.status(200).json({
            success: true,
            deleted: result.rows.length > 0,
            message: result.rows.length ? "User area deleted." : "No saved area to delete."
        });
    } catch (error) {
        logError("Delete user area.", error);
        return res.status(500).json({ success: false, message: "Failed to delete user area." });
    }
});

router.get("/risk/user/area/risks", async (req, res) => {
    const { orgid, username } = req.query;
    const severity = req.query.severity || null;
    const category = req.query.category || null;
    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 2000);
    if (!orgid || !username) {
        return res.status(400).json({ success: false, message: "orgid and username query parameters are required." });
    }
    try {
        const areaResult = await queryWithTimeout(
            "SELECT area_id, name, mode, latitude, longitude, radius_km, min_lat, max_lat, min_lng, max_lng FROM risk_user_areas WHERE orgid = $1 AND username = $2 LIMIT 1",
            [orgid, username]
        );
        if (!areaResult.rows.length) {
            return res.status(404).json({ success: false, message: "No saved area for this user." });
        }
        const areaRow = areaResult.rows[0];

        let sql = `
            SELECT id, source, source_id, risk_category, severity, severity_score, title, description,
                   geometry_type, geometry_coordinates, latitude, longitude, impact_radius_km,
                   event_time, updated_at, expires_at, url, recommendations, metadata, properties,
                   golden_mesh_detection, population_impact, coordinates
            FROM risk_events_cache
            WHERE ST_Intersects(
                geom,
                (SELECT geom FROM risk_user_areas WHERE orgid = $1 AND username = $2)
            )
        `;
        const params = [orgid, username];
        let pi = 3;
        if (severity) {
            sql += ` AND severity = $${pi}`;
            params.push(severity);
            pi++;
        }
        if (category) {
            sql += ` AND risk_category = $${pi}`;
            params.push(category);
            pi++;
        }
        sql += ` ORDER BY severity_score DESC, event_time DESC LIMIT $${pi}`;
        params.push(limit);

        const result = await queryWithTimeout(sql, params);
        const risks = result.rows.map((r) => ({
            ...r,
            recommendations: parseJson(r.recommendations),
            metadata: parseJson(r.metadata),
            properties: parseJson(r.properties),
            golden_mesh_detection: parseJson(r.golden_mesh_detection),
            population_impact: parseJson(r.population_impact),
            geometry_coordinates: parseJson(r.geometry_coordinates),
            coordinates: parseJson(r.coordinates)
        }));

        const sevCounts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
        const catCounts = {};
        for (const r of risks) {
            if (sevCounts[r.severity] !== undefined) sevCounts[r.severity]++;
            catCounts[r.risk_category] = (catCounts[r.risk_category] || 0) + 1;
        }

        return res.status(200).json({
            success: true,
            area: {
                area_id: areaRow.area_id,
                name: areaRow.name,
                mode: areaRow.mode,
                latitude: areaRow.latitude,
                longitude: areaRow.longitude,
                radius_km: areaRow.radius_km,
                min_lat: areaRow.min_lat,
                max_lat: areaRow.max_lat,
                min_lng: areaRow.min_lng,
                max_lng: areaRow.max_lng
            },
            count: risks.length,
            by_severity: sevCounts,
            by_category: catCounts,
            risks,
            message: `Found ${risks.length} risk events within saved area.`
        });
    } catch (error) {
        logError("Query risks within user area.", error);
        return res.status(500).json({ success: false, message: "Failed to query risks within user area." });
    }
});

module.exports = router;