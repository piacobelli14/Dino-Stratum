CREATE EXTENSION IF NOT EXISTS postgis;

DROP TABLE IF EXISTS risk_assets CASCADE;
CREATE TABLE risk_assets (
    asset_id TEXT PRIMARY KEY,
    orgid TEXT NOT NULL,
    created_by TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    asset_type TEXT NOT NULL,
    priority TEXT DEFAULT 'Medium',
    status TEXT DEFAULT 'Active',
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    elevation_meters DOUBLE PRECISION,
    geometry_type TEXT DEFAULT 'Point',
    geometry_coordinates JSONB,
    geom GEOGRAPHY(GEOMETRY, 4326),
    address_street TEXT,
    address_city TEXT,
    address_state TEXT,
    address_country TEXT,
    address_postal_code TEXT,
    metadata JSONB DEFAULT '{}',
    risk_score DOUBLE PRECISION DEFAULT 0,
    risk_factors JSONB DEFAULT '{}',
    last_assessment_at TIMESTAMPTZ,
    tags TEXT[],
    image_url TEXT,
    external_id TEXT,
    owner_orgid TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);
DROP INDEX IF EXISTS idx_risk_assets_orgid;
CREATE INDEX idx_risk_assets_orgid ON risk_assets (orgid, status, deleted_at);
DROP INDEX IF EXISTS idx_risk_assets_type;
CREATE INDEX idx_risk_assets_type ON risk_assets (asset_type, priority);
DROP INDEX IF EXISTS idx_risk_assets_location;
CREATE INDEX idx_risk_assets_location ON risk_assets (latitude, longitude);
DROP INDEX IF EXISTS idx_risk_assets_risk_score;
CREATE INDEX idx_risk_assets_risk_score ON risk_assets (risk_score DESC);
DROP INDEX IF EXISTS idx_risk_assets_tags;
CREATE INDEX idx_risk_assets_tags ON risk_assets USING GIN (tags);
DROP INDEX IF EXISTS idx_risk_assets_geom;
CREATE INDEX idx_risk_assets_geom ON risk_assets USING GIST (geom);
DROP INDEX IF EXISTS idx_risk_assets_owner_orgid;
CREATE INDEX idx_risk_assets_owner_orgid ON risk_assets (owner_orgid);

DROP TABLE IF EXISTS asset_dependencies CASCADE;
CREATE TABLE asset_dependencies (
    dependency_id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL REFERENCES risk_assets(asset_id) ON DELETE CASCADE,
    depends_on_asset_id TEXT NOT NULL REFERENCES risk_assets(asset_id) ON DELETE CASCADE,
    dependency_type TEXT DEFAULT 'feeds',
    criticality TEXT DEFAULT 'Medium',
    description TEXT,
    metadata JSONB DEFAULT '{}',
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (asset_id, depends_on_asset_id)
);
DROP INDEX IF EXISTS idx_asset_dependencies_asset;
CREATE INDEX idx_asset_dependencies_asset ON asset_dependencies (asset_id);
DROP INDEX IF EXISTS idx_asset_dependencies_depends_on;
CREATE INDEX idx_asset_dependencies_depends_on ON asset_dependencies (depends_on_asset_id);
DROP INDEX IF EXISTS idx_asset_dependencies_type;
CREATE INDEX idx_asset_dependencies_type ON asset_dependencies (dependency_type, criticality);

DROP TABLE IF EXISTS asset_golden_mesh CASCADE;
CREATE TABLE asset_golden_mesh (
    mesh_id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL REFERENCES risk_assets(asset_id) ON DELETE CASCADE,
    orgid TEXT NOT NULL,
    created_by TEXT NOT NULL,
    scan_date TIMESTAMPTZ NOT NULL,
    mesh_geom geometry(MultiPointZ, 4326),
    mesh_z_values DOUBLE PRECISION[],
    mesh_data JSONB,
    mesh_file_url TEXT,
    mesh_format TEXT DEFAULT 'binary',
    vertical_datum DOUBLE PRECISION NOT NULL,
    horizontal_datum TEXT DEFAULT 'WGS84',
    coordinate_system TEXT DEFAULT 'EPSG:4326',
    resolution_meters DOUBLE PRECISION,
    point_count INTEGER,
    bounding_box JSONB,
    sensor_source TEXT,
    processing_level TEXT,
    accuracy_vertical_mm DOUBLE PRECISION,
    accuracy_horizontal_mm DOUBLE PRECISION,
    is_active BOOLEAN DEFAULT TRUE,
    superseded_by TEXT,
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);
DROP INDEX IF EXISTS idx_asset_golden_mesh_asset;
CREATE INDEX idx_asset_golden_mesh_asset ON asset_golden_mesh (asset_id, is_active, scan_date DESC);
DROP INDEX IF EXISTS idx_asset_golden_mesh_orgid;
CREATE INDEX idx_asset_golden_mesh_orgid ON asset_golden_mesh (orgid, deleted_at);
DROP INDEX IF EXISTS idx_asset_golden_mesh_scan_date;
CREATE INDEX idx_asset_golden_mesh_scan_date ON asset_golden_mesh (scan_date DESC);
DROP INDEX IF EXISTS idx_asset_golden_mesh_geom;
CREATE INDEX idx_asset_golden_mesh_geom ON asset_golden_mesh USING GIST (mesh_geom);

DROP TABLE IF EXISTS deformation_change_detections;
CREATE TABLE deformation_change_detections (
    detection_id TEXT PRIMARY KEY,
    mesh_id TEXT NOT NULL REFERENCES asset_golden_mesh(mesh_id) ON DELETE CASCADE,
    asset_id TEXT NOT NULL REFERENCES risk_assets(asset_id) ON DELETE CASCADE,
    orgid TEXT NOT NULL,
    detected_by TEXT,
    detection_date TIMESTAMPTZ NOT NULL,
    comparison_scan_date TIMESTAMPTZ NOT NULL,
    baseline_scan_date TIMESTAMPTZ NOT NULL,
    max_delta_mm DOUBLE PRECISION NOT NULL,
    mean_delta_mm DOUBLE PRECISION NOT NULL,
    std_delta_mm DOUBLE PRECISION,
    affected_area_sqm DOUBLE PRECISION,
    affected_point_count INTEGER,
    total_point_count INTEGER,
    affected_percentage DOUBLE PRECISION,
    delta_grid JSONB,
    hotspot_coordinates JSONB,
    threshold_mm DOUBLE PRECISION NOT NULL,
    exceeded_threshold BOOLEAN NOT NULL,
    severity TEXT NOT NULL,
    deformation_type TEXT,
    deformation_direction TEXT,
    estimated_rate_mm_per_year DOUBLE PRECISION,
    confidence_score DOUBLE PRECISION,
    coherence_mean DOUBLE PRECISION,
    sensor_source TEXT,
    comparison_mesh_data JSONB,
    risk_event_id TEXT,
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by TEXT,
    acknowledged_at TIMESTAMPTZ,
    resolved BOOLEAN DEFAULT FALSE,
    resolved_by TEXT,
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
DROP INDEX IF EXISTS idx_deformation_detections_asset;
CREATE INDEX idx_deformation_detections_asset ON deformation_change_detections (asset_id, detection_date DESC);
DROP INDEX IF EXISTS idx_deformation_detections_mesh;
CREATE INDEX idx_deformation_detections_mesh ON deformation_change_detections (mesh_id, detection_date DESC);
DROP INDEX IF EXISTS idx_deformation_detections_orgid;
CREATE INDEX idx_deformation_detections_orgid ON deformation_change_detections (orgid, exceeded_threshold, resolved, detection_date DESC);
DROP INDEX IF EXISTS idx_deformation_detections_severity;
CREATE INDEX idx_deformation_detections_severity ON deformation_change_detections (severity, exceeded_threshold, detection_date DESC);

DROP TABLE IF EXISTS risk_zones CASCADE;
CREATE TABLE risk_zones (
    zone_id TEXT PRIMARY KEY,
    orgid TEXT NOT NULL,
    created_by TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    zone_type TEXT NOT NULL,
    risk_category TEXT NOT NULL,
    severity TEXT DEFAULT 'Medium',
    geometry_type TEXT NOT NULL,
    geometry_coordinates JSONB NOT NULL,
    center_latitude DOUBLE PRECISION,
    center_longitude DOUBLE PRECISION,
    radius_meters DOUBLE PRECISION,
    metadata JSONB DEFAULT '{}',
    active BOOLEAN DEFAULT TRUE,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    source TEXT,
    source_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);
DROP INDEX IF EXISTS idx_risk_zones_orgid;
CREATE INDEX idx_risk_zones_orgid ON risk_zones (orgid, active, deleted_at);
DROP INDEX IF EXISTS idx_risk_zones_category;
CREATE INDEX idx_risk_zones_category ON risk_zones (risk_category, severity);
DROP INDEX IF EXISTS idx_risk_zones_location;
CREATE INDEX idx_risk_zones_location ON risk_zones (center_latitude, center_longitude);

DROP TABLE IF EXISTS risk_asset_zone_links;
CREATE TABLE risk_asset_zone_links (
    link_id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL REFERENCES risk_assets(asset_id) ON DELETE CASCADE,
    zone_id TEXT NOT NULL REFERENCES risk_zones(zone_id) ON DELETE CASCADE,
    proximity_meters DOUBLE PRECISION,
    exposure_level TEXT DEFAULT 'Unknown',
    calculated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(asset_id, zone_id)
);
DROP INDEX IF EXISTS idx_risk_asset_zone_links;
CREATE INDEX idx_risk_asset_zone_links ON risk_asset_zone_links (asset_id, zone_id);

DROP TABLE IF EXISTS risk_alerts CASCADE;
CREATE TABLE risk_alerts (
    alert_id TEXT PRIMARY KEY,
    orgid TEXT NOT NULL,
    created_by TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    alert_type TEXT NOT NULL,
    risk_category TEXT,
    asset_id TEXT REFERENCES risk_assets(asset_id) ON DELETE SET NULL,
    zone_id TEXT REFERENCES risk_zones(zone_id) ON DELETE SET NULL,
    saved_view_id TEXT,
    condition_field TEXT NOT NULL,
    condition_operator TEXT NOT NULL,
    condition_value DOUBLE PRECISION NOT NULL,
    severity TEXT DEFAULT 'Medium',
    enabled BOOLEAN DEFAULT TRUE,
    notification_channels JSONB DEFAULT '[]',
    cooldown_minutes INTEGER DEFAULT 60,
    last_triggered_at TIMESTAMPTZ,
    trigger_count INTEGER DEFAULT 0,
    source_config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);
DROP INDEX IF EXISTS idx_risk_alerts_orgid;
CREATE INDEX idx_risk_alerts_orgid ON risk_alerts (orgid, enabled, deleted_at);
DROP INDEX IF EXISTS idx_risk_alerts_asset;
CREATE INDEX idx_risk_alerts_asset ON risk_alerts (asset_id);
DROP INDEX IF EXISTS idx_risk_alerts_zone;
CREATE INDEX idx_risk_alerts_zone ON risk_alerts (zone_id);
DROP INDEX IF EXISTS idx_risk_alerts_type;
CREATE INDEX idx_risk_alerts_type ON risk_alerts (alert_type, enabled, created_at DESC);
DROP INDEX IF EXISTS idx_risk_alerts_saved_view;
CREATE INDEX idx_risk_alerts_saved_view ON risk_alerts (saved_view_id);

DROP TABLE IF EXISTS risk_alert_history;
CREATE TABLE risk_alert_history (
    history_id TEXT PRIMARY KEY,
    alert_id TEXT NOT NULL REFERENCES risk_alerts(alert_id) ON DELETE CASCADE,
    orgid TEXT NOT NULL,
    triggered_at TIMESTAMPTZ DEFAULT NOW(),
    triggered_value DOUBLE PRECISION,
    severity TEXT,
    message TEXT,
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by TEXT,
    acknowledged_at TIMESTAMPTZ,
    resolved BOOLEAN DEFAULT FALSE,
    resolved_by TEXT,
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    metadata JSONB DEFAULT '{}'
);
DROP INDEX IF EXISTS idx_risk_alert_history_alert;
CREATE INDEX idx_risk_alert_history_alert ON risk_alert_history (alert_id, triggered_at DESC);
DROP INDEX IF EXISTS idx_risk_alert_history_orgid;
CREATE INDEX idx_risk_alert_history_orgid ON risk_alert_history (orgid, resolved, triggered_at DESC);

DROP TABLE IF EXISTS risk_events;
CREATE TABLE risk_events (
    event_id TEXT PRIMARY KEY,
    orgid TEXT NOT NULL,
    created_by TEXT,
    event_type TEXT NOT NULL,
    risk_category TEXT NOT NULL,
    severity TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    radius_meters DOUBLE PRECISION,
    geometry_type TEXT,
    geometry_coordinates JSONB,
    affected_asset_ids TEXT[],
    affected_zone_ids TEXT[],
    source TEXT,
    source_id TEXT,
    source_url TEXT,
    visibility TEXT DEFAULT 'public',
    event_start_at TIMESTAMPTZ,
    event_end_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    verified BOOLEAN DEFAULT FALSE,
    verified_by TEXT,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
DROP INDEX IF EXISTS idx_risk_events_orgid;
CREATE INDEX idx_risk_events_orgid ON risk_events (orgid, event_type, created_at DESC);
DROP INDEX IF EXISTS idx_risk_events_category;
CREATE INDEX idx_risk_events_category ON risk_events (risk_category, severity);
DROP INDEX IF EXISTS idx_risk_events_location;
CREATE INDEX idx_risk_events_location ON risk_events (latitude, longitude);
DROP INDEX IF EXISTS idx_risk_events_time;
CREATE INDEX idx_risk_events_time ON risk_events (event_start_at, event_end_at);
DROP INDEX IF EXISTS idx_risk_events_affected_assets;
CREATE INDEX idx_risk_events_affected_assets ON risk_events USING GIN (affected_asset_ids);
DROP INDEX IF EXISTS idx_risk_events_visibility;
CREATE INDEX idx_risk_events_visibility ON risk_events (visibility);

DROP TABLE IF EXISTS risk_asset_history;
CREATE TABLE risk_asset_history (
    history_id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL REFERENCES risk_assets(asset_id) ON DELETE CASCADE,
    orgid TEXT NOT NULL,
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    risk_score DOUBLE PRECISION,
    risk_factors JSONB DEFAULT '{}',
    status TEXT,
    metadata JSONB DEFAULT '{}',
    source TEXT
);
DROP INDEX IF EXISTS idx_risk_asset_history_asset;
CREATE INDEX idx_risk_asset_history_asset ON risk_asset_history (asset_id, recorded_at DESC);
DROP INDEX IF EXISTS idx_risk_asset_history_orgid;
CREATE INDEX idx_risk_asset_history_orgid ON risk_asset_history (orgid, recorded_at DESC);

DROP TABLE IF EXISTS risk_data_sources;
CREATE TABLE risk_data_sources (
    source_id TEXT PRIMARY KEY,
    orgid TEXT NOT NULL,
    created_by TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    source_type TEXT NOT NULL,
    provider TEXT,
    endpoint_url TEXT,
    api_key_encrypted TEXT,
    auth_type TEXT,
    auth_config JSONB DEFAULT '{}',
    polling_interval_seconds INTEGER DEFAULT 300,
    enabled BOOLEAN DEFAULT TRUE,
    last_polled_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    last_error TEXT,
    error_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);
DROP INDEX IF EXISTS idx_risk_data_sources_orgid;
CREATE INDEX idx_risk_data_sources_orgid ON risk_data_sources (orgid, enabled, deleted_at);
DROP INDEX IF EXISTS idx_risk_data_sources_type;
CREATE INDEX idx_risk_data_sources_type ON risk_data_sources (source_type, provider);

DROP TABLE IF EXISTS risk_audit_logs;
CREATE TABLE risk_audit_logs (
    log_id TEXT PRIMARY KEY,
    orgid TEXT NOT NULL,
    username TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    old_values JSONB,
    new_values JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
DROP INDEX IF EXISTS idx_risk_audit_logs_orgid;
CREATE INDEX idx_risk_audit_logs_orgid ON risk_audit_logs (orgid, created_at DESC);
DROP INDEX IF EXISTS idx_risk_audit_logs_entity;
CREATE INDEX idx_risk_audit_logs_entity ON risk_audit_logs (entity_type, entity_id, created_at DESC);

DROP TABLE IF EXISTS risk_events_cache;
CREATE TABLE risk_events_cache (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    source_id TEXT,
    risk_category TEXT NOT NULL,
    severity TEXT NOT NULL,
    severity_score INTEGER DEFAULT 0,
    title TEXT,
    description TEXT,
    geom GEOGRAPHY(GEOMETRY, 4326),
    geometry_type TEXT,
    geometry_coordinates JSONB,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    impact_radius_km INTEGER,
    event_time TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    url TEXT,
    recommendations JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    properties JSONB DEFAULT '{}',
    golden_mesh_detection JSONB,
    population_impact JSONB,
    coordinates JSONB,
    radius_meters DOUBLE PRECISION,
    visibility TEXT DEFAULT 'public',
    orgid TEXT,
    ingested_at TIMESTAMPTZ DEFAULT NOW()
);
DROP INDEX IF EXISTS idx_risk_events_cache_geom;
CREATE INDEX idx_risk_events_cache_geom ON risk_events_cache USING GIST (geom);
DROP INDEX IF EXISTS idx_risk_events_cache_category;
CREATE INDEX idx_risk_events_cache_category ON risk_events_cache (risk_category, severity);
DROP INDEX IF EXISTS idx_risk_events_cache_severity_score;
CREATE INDEX idx_risk_events_cache_severity_score ON risk_events_cache (severity_score DESC);
DROP INDEX IF EXISTS idx_risk_events_cache_time;
CREATE INDEX idx_risk_events_cache_time ON risk_events_cache (event_time DESC);
DROP INDEX IF EXISTS idx_risk_events_cache_source;
CREATE INDEX idx_risk_events_cache_source ON risk_events_cache (source, source_id);
DROP INDEX IF EXISTS idx_risk_events_cache_expires;
CREATE INDEX idx_risk_events_cache_expires ON risk_events_cache (expires_at);
DROP INDEX IF EXISTS idx_risk_events_cache_visibility;
CREATE INDEX idx_risk_events_cache_visibility ON risk_events_cache (visibility);
DROP INDEX IF EXISTS idx_risk_events_cache_orgid;
CREATE INDEX idx_risk_events_cache_orgid ON risk_events_cache (orgid);
DROP INDEX IF EXISTS idx_risk_events_cache_time_category;
CREATE INDEX idx_risk_events_cache_time_category ON risk_events_cache (event_time DESC, risk_category);

DROP TABLE IF EXISTS ingestion_runs;
CREATE TABLE ingestion_runs (
    run_id TEXT PRIMARY KEY,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'running',
    total_ingested INTEGER DEFAULT 0,
    errors INTEGER DEFAULT 0,
    sources_completed JSONB DEFAULT '{}',
    error_details JSONB DEFAULT '[]'
);
DROP INDEX IF EXISTS idx_ingestion_runs_status;
CREATE INDEX idx_ingestion_runs_status ON ingestion_runs (status, started_at DESC);

DROP TABLE IF EXISTS intel_briefing_feedback CASCADE;
DROP TABLE IF EXISTS intel_briefings CASCADE;
CREATE TABLE intel_briefings (
    briefing_id TEXT PRIMARY KEY,
    risk_id TEXT NOT NULL,
    orgid TEXT NOT NULL,
    created_by TEXT NOT NULL,
    risk_category TEXT,
    severity TEXT,
    title TEXT,
    ai_briefing JSONB DEFAULT '{}',
    media_counts JSONB DEFAULT '{}',
    research_counts JSONB DEFAULT '{}',
    source_bundle JSONB DEFAULT '{}',
    confidence_level TEXT,
    confidence_score INTEGER DEFAULT 0,
    scope TEXT DEFAULT 'viewport',
    asset_count INTEGER DEFAULT 0,
    viewport_bbox JSONB,
    risk_latitude DOUBLE PRECISION,
    risk_longitude DOUBLE PRECISION,
    generation_time_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
DROP INDEX IF EXISTS idx_intel_briefings_risk;
CREATE INDEX idx_intel_briefings_risk ON intel_briefings (risk_id, created_at DESC);
DROP INDEX IF EXISTS idx_intel_briefings_orgid;
CREATE INDEX idx_intel_briefings_orgid ON intel_briefings (orgid, created_at DESC);
DROP INDEX IF EXISTS idx_intel_briefings_category;
CREATE INDEX idx_intel_briefings_category ON intel_briefings (risk_category, severity, created_at DESC);
DROP INDEX IF EXISTS idx_intel_briefings_confidence;
CREATE INDEX idx_intel_briefings_confidence ON intel_briefings (confidence_level, confidence_score DESC);
DROP INDEX IF EXISTS idx_intel_briefings_scope;
CREATE INDEX idx_intel_briefings_scope ON intel_briefings (scope, created_at DESC);
DROP INDEX IF EXISTS idx_intel_briefings_geom;
CREATE INDEX idx_intel_briefings_geom ON intel_briefings (risk_latitude, risk_longitude);
DROP INDEX IF EXISTS idx_intel_briefings_org_created;
CREATE INDEX idx_intel_briefings_org_created ON intel_briefings (orgid, scope, created_at DESC);

CREATE TABLE intel_briefing_feedback (
    feedback_id TEXT PRIMARY KEY,
    briefing_id TEXT,
    risk_id TEXT,
    orgid TEXT NOT NULL,
    submitted_by TEXT NOT NULL,
    flag_reason TEXT,
    flag_category TEXT,
    comments TEXT,
    source_bundle_snapshot JSONB,
    ai_summary_snapshot JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
DROP INDEX IF EXISTS idx_intel_feedback_briefing;
CREATE INDEX idx_intel_feedback_briefing ON intel_briefing_feedback (briefing_id, created_at DESC);
DROP INDEX IF EXISTS idx_intel_feedback_orgid;
CREATE INDEX idx_intel_feedback_orgid ON intel_briefing_feedback (orgid, created_at DESC);
DROP INDEX IF EXISTS idx_intel_feedback_category;
CREATE INDEX idx_intel_feedback_category ON intel_briefing_feedback (flag_category, created_at DESC);
DROP INDEX IF EXISTS idx_intel_feedback_risk;
CREATE INDEX idx_intel_feedback_risk ON intel_briefing_feedback (risk_id, created_at DESC);

DROP TABLE IF EXISTS intel_user_settings CASCADE;
CREATE TABLE intel_user_settings (
    settings_id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    orgid TEXT NOT NULL,
    sources_enabled JSONB DEFAULT '{}',
    default_scope TEXT DEFAULT 'viewport',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (username, orgid)
);
DROP INDEX IF EXISTS idx_intel_user_settings_lookup;
CREATE INDEX idx_intel_user_settings_lookup ON intel_user_settings (username, orgid);
DROP INDEX IF EXISTS idx_intel_user_settings_orgid;
CREATE INDEX idx_intel_user_settings_orgid ON intel_user_settings (orgid);

DROP TABLE IF EXISTS risk_user_areas;
CREATE TABLE risk_user_areas (
    area_id TEXT PRIMARY KEY,
    orgid TEXT NOT NULL,
    username TEXT NOT NULL,
    name TEXT,
    mode TEXT NOT NULL CHECK (mode IN ('point_radius', 'bbox')),
    address TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    radius_km DOUBLE PRECISION,
    min_lat DOUBLE PRECISION,
    max_lat DOUBLE PRECISION,
    min_lng DOUBLE PRECISION,
    max_lng DOUBLE PRECISION,
    geom GEOGRAPHY(GEOMETRY, 4326),
    filter_active BOOLEAN DEFAULT TRUE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (orgid, username)
);
DROP INDEX IF EXISTS idx_risk_user_areas_orgid;
CREATE INDEX idx_risk_user_areas_orgid ON risk_user_areas (orgid);
DROP INDEX IF EXISTS idx_risk_user_areas_geom;
CREATE INDEX idx_risk_user_areas_geom ON risk_user_areas USING GIST (geom);

DROP TABLE IF EXISTS risk_user_views;
CREATE TABLE risk_user_views (
    view_id TEXT PRIMARY KEY,
    orgid TEXT NOT NULL,
    username TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    view_data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
DROP INDEX IF EXISTS idx_risk_user_views_org_user;
CREATE INDEX idx_risk_user_views_org_user ON risk_user_views (orgid, username, updated_at DESC);
DROP INDEX IF EXISTS idx_risk_user_views_name;
CREATE INDEX idx_risk_user_views_name ON risk_user_views (orgid, name);