const express = require("express");
const crypto = require("crypto");
const { pool } = require("../../config/db");

const router = express.Router();

const QUERY_TIMEOUT_MS = 15000;
const MAX_AREAS_PER_USER = 50;

const SELECT_AREA_COLUMNS = "area_id, orgid, username, name, mode, address, latitude, longitude, radius_km, min_lat, max_lat, min_lng, max_lng, filter_active, metadata, created_at, updated_at";

const generateId = (prefix) => {
    return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
};

const withTimeout = (promise, ms, label) => {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`${label} timed out after ${ms} milliseconds.`));
        }, ms);
        promise.then(
            (value) => { clearTimeout(timer); resolve(value); },
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

const validateMode = (mode) => {
    return mode === "point_radius" || mode === "bbox";
};

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
    if ([minLat, maxLat, minLng, maxLng].some((value) => isNaN(value))) return null;
    if (minLat >= maxLat || minLng >= maxLng) return null;
    if (minLat < -90 || maxLat > 90 || minLng < -180 || maxLng > 180) return null;
    return { min_lat: minLat, max_lat: maxLat, min_lng: minLng, max_lng: maxLng };
};

const validateAreaBody = (body) => {
    if (!validateMode(body.mode)) {
        return { error: "Mode must be 'point_radius' or 'bbox'." };
    }
    if (body.mode === "point_radius") {
        const pointRadius = validatePointRadius(body);
        if (!pointRadius) {
            return { error: "The point or radius is invalid. Latitude must be -90 to 90, longitude -180 to 180, and radius 1 to 10000 km." };
        }
        return { pointRadius, bbox: null };
    }
    const bbox = validateBbox(body);
    if (!bbox) {
        return { error: "The bounding box is invalid. Min coordinates must be less than max, and values must be in valid lat/lng ranges." };
    }
    return { pointRadius: null, bbox };
};

const rowToArea = (row) => {
    if (!row) return null;
    const base = {
        area_id: row.area_id,
        name: row.name || "",
        mode: row.mode,
        address: row.address || "",
        filter_active: !!row.filter_active,
        metadata: parseJson(row.metadata) || {},
        created_at: row.created_at,
        updated_at: row.updated_at
    };
    if (row.mode === "point_radius") {
        return {
            ...base,
            latitude: parseFloat(row.latitude),
            longitude: parseFloat(row.longitude),
            radius_km: parseFloat(row.radius_km)
        };
    }
    return {
        ...base,
        min_lat: parseFloat(row.min_lat),
        max_lat: parseFloat(row.max_lat),
        min_lng: parseFloat(row.min_lng),
        max_lng: parseFloat(row.max_lng)
    };
};

const geomSqlFor = (mode) => {
    return mode === "point_radius"
        ? "ST_Buffer($15::text::geography, $16::double precision)"
        : "$15::text::geography";
};

const geomParams = (pointRadius, bbox) => {
    if (pointRadius) {
        return [`SRID=4326;POINT(${pointRadius.longitude} ${pointRadius.latitude})`, pointRadius.radius_km * 1000];
    }
    const { min_lat: minLat, max_lat: maxLat, min_lng: minLng, max_lng: maxLng } = bbox;
    return [`SRID=4326;POLYGON((${minLng} ${minLat}, ${maxLng} ${minLat}, ${maxLng} ${maxLat}, ${minLng} ${maxLat}, ${minLng} ${minLat}))`];
};

const areaParams = (areaId, orgid, username, body, pointRadius, bbox) => {
    return [
        areaId, orgid, username,
        typeof body.name === "string" ? body.name.trim().substring(0, 200) : null,
        body.mode,
        typeof body.address === "string" ? body.address.trim().substring(0, 500) : null,
        pointRadius?.latitude ?? null, pointRadius?.longitude ?? null, pointRadius?.radius_km ?? null,
        bbox?.min_lat ?? null, bbox?.max_lat ?? null, bbox?.min_lng ?? null, bbox?.max_lng ?? null,
        body.filter_active === undefined ? true : !!body.filter_active,
        ...geomParams(pointRadius, bbox)
    ];
};

router.get("/risk/areas", async (req, res) => {
    const { orgid, username } = req.query;
    if (!orgid || !username) {
        return res.status(400).json({ success: false, message: "Orgid and username query parameters are required." });
    }
    try {
        const result = await queryWithTimeout(
            `SELECT ${SELECT_AREA_COLUMNS} FROM risk_user_areas WHERE orgid = $1 AND username = $2 ORDER BY created_at ASC LIMIT ${MAX_AREAS_PER_USER}`,
            [orgid, username]
        );
        const areas = result.rows.map(rowToArea);
        return res.status(200).json({
            success: true,
            areas,
            count: areas.length,
            message: areas.length ? `${areas.length} monitored areas were retrieved.` : "There are no monitored areas yet."
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "The monitored areas could not be retrieved." });
    }
});

router.post("/risk/areas", async (req, res) => {
    const { orgid, username } = req.body;
    if (!orgid || !username) {
        return res.status(400).json({ success: false, message: "Orgid and username are required." });
    }
    const validated = validateAreaBody(req.body);
    if (validated.error) {
        return res.status(400).json({ success: false, message: validated.error });
    }
    try {
        const countResult = await queryWithTimeout(
            "SELECT COUNT(*)::int AS total FROM risk_user_areas WHERE orgid = $1 AND username = $2",
            [orgid, username]
        );
        if (countResult.rows[0].total >= MAX_AREAS_PER_USER) {
            return res.status(400).json({ success: false, message: `A user can monitor at most ${MAX_AREAS_PER_USER} areas.` });
        }
        const params = areaParams(generateId("area"), orgid, username, req.body, validated.pointRadius, validated.bbox);
        const result = await queryWithTimeout(
            `INSERT INTO risk_user_areas (
                area_id, orgid, username, name, mode, address,
                latitude, longitude, radius_km,
                min_lat, max_lat, min_lng, max_lng,
                filter_active, geom, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7::double precision, $8::double precision, $9::double precision, $10::double precision, $11::double precision, $12::double precision, $13::double precision, $14, ${geomSqlFor(req.body.mode)}, NOW(), NOW())
            RETURNING ${SELECT_AREA_COLUMNS}`,
            params
        );
        return res.status(201).json({
            success: true,
            area: rowToArea(result.rows[0]),
            message: "The monitored area was created successfully."
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "The monitored area could not be created." });
    }
});

router.put("/risk/areas/:areaId", async (req, res) => {
    const { areaId } = req.params;
    const { orgid, username } = req.body;
    if (!orgid || !username) {
        return res.status(400).json({ success: false, message: "Orgid and username are required." });
    }
    const validated = validateAreaBody(req.body);
    if (validated.error) {
        return res.status(400).json({ success: false, message: validated.error });
    }
    try {
        const params = areaParams(areaId, orgid, username, req.body, validated.pointRadius, validated.bbox);
        const result = await queryWithTimeout(
            `UPDATE risk_user_areas SET
                name = $4, mode = $5, address = $6,
                latitude = $7::double precision, longitude = $8::double precision, radius_km = $9::double precision,
                min_lat = $10::double precision, max_lat = $11::double precision, min_lng = $12::double precision, max_lng = $13::double precision,
                filter_active = $14, geom = ${geomSqlFor(req.body.mode)}, updated_at = NOW()
            WHERE area_id = $1 AND orgid = $2 AND username = $3
            RETURNING ${SELECT_AREA_COLUMNS}`,
            params
        );
        if (!result.rows.length) {
            return res.status(404).json({ success: false, message: "The monitored area was not found." });
        }
        return res.status(200).json({
            success: true,
            area: rowToArea(result.rows[0]),
            message: "The monitored area was updated successfully."
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "The monitored area could not be updated." });
    }
});

router.delete("/risk/areas/:areaId", async (req, res) => {
    const { areaId } = req.params;
    const { orgid, username } = req.query;
    if (!orgid || !username) {
        return res.status(400).json({ success: false, message: "Orgid and username query parameters are required." });
    }
    try {
        const result = await queryWithTimeout(
            "DELETE FROM risk_user_areas WHERE area_id = $1 AND orgid = $2 AND username = $3 RETURNING area_id",
            [areaId, orgid, username]
        );
        if (!result.rows.length) {
            return res.status(404).json({ success: false, message: "The monitored area was not found." });
        }
        return res.status(200).json({ success: true, deleted: true, message: "The monitored area was deleted." });
    } catch (error) {
        return res.status(500).json({ success: false, message: "The monitored area could not be deleted." });
    }
});

module.exports = router;