# DinoStratum

DinoStratum is built to be a free, browser-based operational risk platform. It pairs a live multi-hazard intelligence feed with a geospatial asset portfolio, and continuously scores where the two intersect, which active wildfires are near your sites, which earthquakes just shook ground you have buildings on, which storm tracks are headed at your fleet. The kinds of dashboards that normally sit behind enterprise risk-modeling subscriptions, surfaced from public agency feeds and run client-side against your own data.

DinoStratum sits alongside DinoLabs and DinoSat in the same family of projects. DinoLabs is the flagship; DinoStratum is narrower by design, focused on a single operational workflow rather than a broad toolkit. It is still a side project, the hazard math is intentionally transparent rather than commercial-grade, and the cadence of improvements depends on the rest of my life. Feedback is welcome.

The backend here is doing real work. It polls each of the upstream hazard feeds on its own cadence and normalizes them into a single envelope so the frontend doesn't have to care which agency produced what. It also owns the asset store and runs the PostGIS spatial queries that drive exposure scoring on the server side. The frontend still handles all of the rendering, the interactive recompute path, and the report generation, but the split here is closer to symmetric than the deliberately-thin-server pattern I lean on in the other platforms.

Hosted at **[DinoStratum](https://dino-stratum.vercel.app/login)**. Account creation, sessions, and team management are handled through Dino Auth (see below).

**Stack:** React + Vite + Deck.gl + MapLibre GL + Apple MapKit JS on the frontend, Node.js + Express + PostgreSQL with PostGIS on the backend. IndexedDB for cached intel snapshots and the per-pair exposure score cache.

---

## Screenshots

| Risk Management Global | Intel Bar | Risk Management Detail |
|:---:|:---:|:---:|
| ![Risk Management Global](screenshots/riskmanagement.png) | ![Intel Bar](screenshots/intelbar.png) | ![Risk Management Detail](screenshots/riskmanagementdetail.png) |

| Asset Management | Asset Risk Assessment | Body Selection |
|:---:|:---:|:---:|
| ![Asset Management](screenshots/assets.png) | ![Asset Risk Assessment](screenshots/assetsrisk.png) | ![Body Selection](screenshots/overpass.png) |

---

## The Pages

There are only two pages within the platform and they are built to work together. the risk management page is the live operational view including the map, the intel. bar, and the active event-list. the asset management page is the hub where you can maintain your asset portfolio that the risk management page will score against. The two pages share an asset store and the cached hazards feed, so an edit on either side will propagate to the other without need for a refresh. 

### Risk Management

This is the primary visualization of the platform. It is primarily responsible for everything from the dual-color provider map handoff to the per-category metadata renderers in the right side bar. The page uses a full-bleed map with overlay regions arranged around it including the intel bar to examine specific hazards or assets in detail, a side bar to view summary stats and control the view, and a top bar to toggle between viewing modes. 

#### Dual Map Providers with Automatic Handoff

The map is not a single provider. the component initializes two map instances the work with each other, swapping between the two instantiations on zoom. Below a zoom value of six the page renders through Deck.gl plus MapLibre GL, which gives the page a solid globe-scale view with vector tiles from Esri World Imagery, and a Deck.gl `MapboxOverlay` interleaved into the MapLibre style for each of the custom layers. Beyond a zoom level of six the map renders using Apple MapKit JS, which is a lot stronger for close-in satellite imagery, building footprints, and points of interest. This handoff is handled by a custom-built routine that synchronizes the camera state (center, zoom, pitch, bearing) between the two map providers, hides one DOM container and shows the other, and re-emits the relevant markers and overlays on whichever provider is now active. A guard is also implemented to protect against re-entry during the swap. and a deferred flag ensure Apple annotations are rebuilt one frame after the provider becomes visible (you can't add annotations to a hidden MarkKit container and have them render correctly). The Deck.gl side is the one that handles the heavy custom layer loading, while the Apple Maps side carries native annotations and MapKit markers with radii. 

#### Intel Bar

The intel bar is the tabbed bottom drawer that mounts only when one of the hazards, assets, or selectable body is clicked. The intel bar has two different selection contexts, a risk context that shows all eight of the tabs and a feature context that is set by the Overpass click-to-identify integration which will show only the details of your selection. Selecting a different risk, asset, or selectable body will reset all of the per-tab data and re-fire the fetches to ensure the info is updated to the current selection. 

The tab set in the intel bar when an vent is clicked includes summary, details, articles, videos, images, academic, social, and related tabs. Each tab has its own loading and error state and its own refetch path. the header refresh button will refresh whichever of these tabs is currently active. 



### Asset Management

This is where the asset registry lives. Asset Management is a card-grid surface anchored by a dual-provider global overview map (the same MapLibre plus Apple MapKit handoff pattern used by Risk Management), with a left-rail sidebar for search, filtering, and distribution summaries, and a full-page detail view for any selected asset that includes a local risk minimap, a real-time exposure dashboard with composite threat scoring, and the full golden mesh baseline lifecycle manager.

The page has two views: a **list view** showing all assets as cards on a grid with the global map overhead, and a **detail view** showing everything known about a single asset alongside a local risk map, a risk assessment dashboard, and the operational tooling (golden mesh, history, zone links, alerts).

#### Asset Schema

Every asset has a core profile: name, type (one of sixteen categories: Pipeline, Port, Factory, Warehouse, Power Plant, Data Center, Refinery, Mine, Office, Retail, Residential, Agricultural, Transportation Hub, Telecommunications, Water Treatment, Other), priority (Critical, High, Medium, Low), status (Active, Inactive, Maintenance, Decommissioned), latitude and longitude, optional elevation in meters, a full address block (street, city, state, country, postal code), a free-form description, comma-separated tags, an optional image URL, an optional external ID for cross-referencing with other systems, and a JSON metadata blob for anything that doesn't fit the schema.

Each asset type carries a built-in **vulnerability matrix** on the backend that maps hazard categories to vulnerability factors (Pipeline has 0.9 flood, 0.8 seismic, 0.7 landslide; Mine has 0.95 landslide, 0.9 seismic, 0.85 ground deformation; and so on for all sixteen types across all relevant hazard families). These factors feed directly into the per-risk exposure score computation.

Assets can also carry one or more **golden mesh baselines**: reference three-dimensional point clouds (from LiDAR, photogrammetry, satellite DEM, or synthetic approximation) that are used by the ground deformation change detection path. Assets without a baseline still get the standard distance-and-severity exposure treatment; assets with a baseline get the additional per-point millimeter-level delta analysis on every detection run.

Assets are scoped to an organization. Every create, update, delete, risk assessment, zone link, and mesh operation is recorded in an audit log (`risk_audit_logs`) with the acting user, the old and new values, the IP address, and the user agent.

#### Global Overview Map

The list view is topped by a full-width `AssetsOverviewMap` component that renders every asset in the registry on a dual-provider map (MapLibre below zoom six, Apple MapKit above). Each asset is a styled marker pin colored by asset type with a border colored by risk score, a name label, and an animated pulse ring on assets with risk scores above fifty. Clicking a marker opens the detail view for that asset. A "Fit" button fits the camera to the bounding box of all assets, and a "Globe" button resets to the full-globe view.

The overview map uses the same `switchToProvider` handoff pattern as Risk Management: two DOM containers stacked absolutely, one hidden and one visible, with camera state synchronized on swap and a `switchingRef` guard to prevent re-entry.

#### Asset Card Grid

The main content below the overview map is a sortable card grid. Each `AssetCard` shows the asset name, type (with a color dot matching the type's assigned color), a risk score badge color-coded from green through red, priority and status badges, a location line (city/state/country if available, otherwise raw coordinates), up to five tag chips, an "Updated X ago" timestamp, and four action buttons: Edit, Golden Mesh, Open in Risk Command Center, and Delete.

The grid supports seven sort fields (Risk Score, Name, Type, Priority, Status, Last Updated, Created) with ascending and descending order, and the left sidebar exposes filters by asset type (click-to-toggle from the type breakdown), priority, status, tags, and a full-text search that matches against name, description, and city. All filters and sort state are applied server-side through the REST query parameters.

JSON export writes a timestamped file with the full asset payload for every asset in the org.

#### Asset Detail View

Clicking any asset card or sidebar list item transitions to a full-page detail view. The view opens with a header card (name, risk badge, type/priority/status badges, location chip), followed by the local risk minimap, then the risk assessment dashboard, then a two-column detail grid (location fields on the left, metadata and audit fields on the right), then any linked risk zones and active alerts.

##### Local Risk Minimap

The `AssetMinimap` component is a third instance of the dual-provider map, centered on the selected asset's coordinates, with a geodesic radius circle drawn at the configured search distance. The asset itself renders as a styled pin with a name label and a pulse ring, and every nearby risk event renders as a colored dot sized by severity. Each risk marker has a MapLibre popup showing the severity badge, category, title, distance, time, and impact radius. The radius is configurable from the minimap header through a dropdown (10, 25, 50, 100, 150, 250, or 500 km), and changing it re-runs the nearby risk fetch.

The nearby risks are fetched through the same SSE streaming endpoint used by Risk Management's spatial nearby query (`/risk/intelligence/stream/postgis/nearby`), with client-side deduplication by a composite key of `(source, source_id, risk_category, lat, lng, title)`. The stream emits batches as the PostGIS query resolves, so the minimap populates progressively rather than waiting for the full result set.

An "Open in Risk Command Center" button deep-links to the Risk Management page at the asset's coordinates with the asset ID in the query parameters.

##### Risk Assessment Dashboard

The `RiskAssessmentDashboard` component is the analytical centerpiece of the detail view. It renders a multi-section layout:

The top row shows a **Composite Threat Score** as a large `MiniDonut` (a custom SVG donut chart component with per-segment tooltips, gap rendering between segments, and border lines at segment boundaries) with the numeric score in the center, color-coded from green through red. The score is computed from a weighted formula that accounts for the count of Critical, High, Medium, and Low severity events in the radius, with additive bonuses for any Critical events present and for any events whose impact radius overlaps the asset's position. Next to the donut, a metadata column shows total events in radius, the closest threat by distance and title, the dominant hazard category, the primary data source, and warning banners for any events that overlap the asset's impact radius or that are on a direct trajectory.

The bottom row shows three side-by-side breakdown cells, each with its own `MiniDonut` and a set of horizontal bar charts: **Severity Breakdown** (Critical/High/Medium/Low with the standard severity colors), **Category Breakdown** (top eight hazard categories with a rotating color palette), and **Source Breakdown** (top six data sources).

Below the summary sits a sortable, filterable risk event table with columns for Severity (color dot plus text), Category (icon plus name), Title (with an "IN RADIUS" badge when the event's impact radius overlaps the asset), Source, Distance, Impact Radius, Exposure Score (rendered as a mini progress bar), In Path (YES in red or a dash), Time (relative), and Coordinates. The table supports sort by exposure score, distance, severity, or time, and filter by category and severity. Clicking any row opens the nearby risk detail modal.

**Exposure scoring** for each risk event is computed server-side by `computeExposureScore`, which multiplies the severity weight (Critical 100, High 75, Medium 40, Low 15) by the asset type's vulnerability factor for the risk's hazard category, by a distance decay factor (linear from 1.0 at zero kilometers to 0.0 at five hundred), with a 1.2x multiplier if the asset sits inside the event's stated impact radius. The result is capped at 100 and attached to each risk as `asset_exposure_score`. A parallel function `computeExposureFactors` returns the individual factor names and weights for the detail modal's exposure breakdown bars. A third function `buildImpactSummary` generates a natural-language sentence about the asset's relationship to the risk.

##### Nearby Risk Detail Modal

Clicking a row in the risk table opens `NearbyRiskDetailModal`, a full-detail modal for a single risk event in the context of this asset. The modal shows: the title with the exposure score badge, severity and category badges with the source and distance chips, the description, an Asset Impact Analysis box (the natural-language summary from `buildImpactSummary`), an Event Details grid (event time, updated, impact radius, distance in both km and meters, coordinates, severity score, expiry, geometry type, probability percentage, propagation velocity, time to impact, and an "In Direct Path" flag rendered in red or green), an Exposure Factors section with weighted bars for each contributing factor, a Population Impact section (nearest city, city distance, density tier, estimated population), a Source Metadata section (the full metadata blob flattened into label/value pairs, plus an Infrastructure Proximity subsection if the metadata includes it), a Golden Mesh Detection section if the risk carries one (threshold exceeded, max/mean delta, affected percentage, detection severity), a Recommendations list, and a source URL link.

#### Location Picker Map

The create and edit asset modals embed a `LocationPickerMap`, which is a fourth instance of the dual-provider map stack. It initializes centered on the asset's current coordinates (or on a globe view if creating a new asset with no coordinates yet). Click anywhere on the map to place a pin; drag the pin to reposition it. The resulting coordinates are written back into the latitude and longitude form fields in real time. On the Apple provider side, click-to-place is handled by a mousedown/mouseup distance check (to distinguish clicks from pans), with coordinate conversion through `convertPointOnPageToCoordinate`.

#### Golden Mesh Baseline Manager

The golden mesh system is accessed through a "Mesh" button on any asset card or the detail view header, and opens a modal stack that covers the full baseline lifecycle.

The **Baseline List** modal shows every golden mesh baseline registered for the asset, each rendered as a card with status (Active or Superseded), vertical datum, sensor source, format, whether a binary file is attached, the processing status (from a seven-stage pipeline: pending, uploading, processing, decimating, reprojecting, converting, completed, or failed), the baseline source (manual upload, USGS 3DEP, satellite DEM, synthetic, or legacy JSON), horizontal and vertical accuracy, point density, point count, scan date, notes, and the mesh ID. Actions include Register New Baseline, Detection History, Discover Data, and Synthesize Baseline.

**Discover Data** queries the USGS 3DEP LiDAR coverage index for the asset's coordinates and returns a tiered result: Tier A if high-resolution LiDAR coverage is available (with a one-click import button), or Tier B if only satellite DEM is available (30-meter resolution from the Mapzen Terrain Tiles). The discovery result card shows the tier, source, description, and available action.

**Synthesize Baseline** auto-generates a baseline from public data without any file upload. The backend generates a synthetic elevation grid at the specified resolution (defaulting to 30 meters), stores it in PostGIS as a `MultiPointZ` geometry with a parallel `double precision[]` z-values column, and registers it as the active baseline with the previous active baseline marked as superseded. Three source types are supported: `usgs_3dep` (queries the USGS 3DEP index and generates a grid at the asset's coordinates), `satellite_dem` (uses the Mapzen Terrain Tiles), and `synthetic` (pure mathematical approximation). The synthesized baseline is immediately usable for change detection.

**Register New Baseline** opens a form with a drag-and-drop `MeshFileUploader` component (accepting .las, .laz, .copc.laz, .ply, .xyz, .csv, .tif, .tiff up to 2 GB), vertical datum selector (WGS84, EGM96, EGM2008, NAVD88, MSL, AHD, Other), sensor source, horizontal and vertical accuracy, point density, and notes. On submit, the file is uploaded either to S3 (via a signed PUT URL) or to a local upload directory (via a streaming POST), then dispatched to a PDAL worker for processing through a five-stage pipeline (validate, decimate, reproject, convert to COPC) with progress polling. If the PDAL worker is unavailable, the backend falls back to a simulated processing path that generates a synthetic point cloud and completes the registration. The processing job status is tracked in memory and queryable through a polling endpoint.

**Run Detection** opens a modal with two detection modes. **Autonomous Satellite Sync** queries the `risk_events_cache` for ground deformation events near the asset's coordinates, extracts the displacement delta from the InSAR metadata, applies that delta uniformly to the baseline point cloud, and runs a per-point comparison against the baseline to produce a detection record with max/mean/std deltas, affected point count and percentage, hotspot coordinates and directions (subsidence or uplift), and an overall severity classification. **Upload Comparison Scan** accepts a second point cloud file, runs the same comparison pipeline, and produces the same detection record. Both modes store the result in the `changeDetectionStore` and it appears immediately in the Detection History.

**Detection History** lists every detection run for the asset, sorted by date, each showing the severity badge, detection time, acknowledgment status (Pending, Acknowledged, Resolved), max delta, mean delta, and affected percentage. Clicking a detection opens a detail modal with the full metric grid, detection mode, deformation source, and the **acknowledgment workflow**: a Pending detection can be acknowledged (with notes and the acknowledging user recorded), and an Acknowledged detection can be resolved (with resolution notes and the resolving user recorded). This three-state workflow is the operational loop that connects the automated satellite detection to the human decision about whether the detected deformation requires action.

#### History

Every risk score change on an asset is recorded in a per-asset history table (`risk_asset_history`) with the score, the risk factors that produced it, the asset's status at the time, the source of the assessment (manual update, automated, etc.), and the timestamp. The history modal surfaces this as a chronological list. The backend also maintains a full audit log (`risk_audit_logs`) of every CRUD operation on every asset, with old and new values, the acting user, and the request metadata.

#### Sidebar and Filters

The left sidebar mirrors the Risk Management sidebar's structure: an asset count with a critical-risk alert banner at the top, a full-text search bar, a risk distribution summary (four cards showing Critical/High/Medium/Low counts based on risk score thresholds at 70/50/30), an asset type breakdown where each type row acts as a click-to-filter toggle, a collapsible filter panel (type, priority, status, tags), action buttons (New Asset, Refresh, Export, Risk Command Center), and a scrollable asset list with risk score badges and pagination controls.

---

## Architecture

DinoStratum is split across two repos: a React frontend (`dinostratumweb/`) and a Node.js/Express backend (`dinostratum_webapi/`). The backend hosts the asset and portfolio CRUD routes, the intel-bar feed proxy and its cache, the server-side exposure scoring path, and the Dino Auth integration. The frontend handles all of the map rendering, the interactive scoring path, and the report generation. Exposure scoring is implemented on both sides, the client runs it interactively for everything that lives in its cache, and the server runs it on demand for any asset-event pair the client doesn't already have a result for, and for report generation jobs.

### Frontend (`dinostratumweb/`)

```
dinostratumweb/
├── public/
│   ├── hazard-icons/            Per-hazard-family icon set used by the intel bar and map
│   ├── map-styles/              MapLibre style JSON files
│   ├── ref-images/              Reference imagery
│   ├── ref-logos/               Brand assets
│   ├── DinoStratumLogo*.png
│   └── EarthBackground.mp4
├── src/
│   ├── pages/
│   │   ├── Authentication/
│   │   │   ├── AuthLogin.jsx
│   │   │   ├── AuthRegister.jsx
│   │   │   ├── AuthReset.jsx
│   │   │   └── AuthVerifyEmail.jsx
│   │   ├── DinoStratumAccount/
│   │   │   ├── DinoStratumAccount.jsx
│   │   │   └── DinoStratumTeam.jsx
│   │   ├── DinoStratumRisk/
│   │   │   ├── RiskCommandCenter.jsx          ~2000-line dual-provider map shell
│   │   │   ├── IntelBar.jsx                   Right-rail selection inspector
│   │   │   ├── DinoStratumEventList.jsx
│   │   │   ├── DinoStratumExposure/
│   │   │   │   ├── earthquakes.js
│   │   │   │   ├── wildfires.js
│   │   │   │   ├── cyclones.js
│   │   │   │   ├── severeWeather.js
│   │   │   │   ├── volcanoes.js
│   │   │   │   ├── tsunami.js
│   │   │   │   ├── floods.js
│   │   │   │   ├── airQuality.js
│   │   │   │   └── groundDeformation.js
│   │   │   └── DinoStratumReport.jsx
│   │   ├── DinoStratumAssets/
│   │   │   ├── DinoStratumAssetTable.jsx
│   │   │   ├── DinoStratumAssetMap.jsx
│   │   │   ├── DinoStratumAssetDrawer.jsx
│   │   │   ├── DinoStratumImporter.jsx
│   │   │   └── DinoStratumPortfolios.jsx
│   │   ├── DinoStratum.jsx                Workspace shell
│   │   └── DinoStratumNoPortfolio.jsx
│   ├── helpers/
│   │   ├── MapHelpers/
│   │   │   ├── ClusterIcon.jsx
│   │   │   ├── LayerStyles.js
│   │   │   └── GeometryEdit.js
│   │   ├── FeedHelpers/
│   │   │   ├── FeedClient.js              Calls the backend SSE endpoints, manages IndexedDB cache
│   │   │   └── FeedNormalizers.js         Per-family normalizers to the envelope shape
│   │   ├── Alert.jsx
│   │   ├── ColorPicker.jsx
│   │   ├── Loading.jsx
│   │   ├── Mobile.jsx
│   │   ├── Nav.jsx
│   │   └── Unavailable.jsx
│   ├── styles/
│   │   ├── helperStyles/        Shared component styles
│   │   └── mainStyles/          Per-page styles
│   ├── App.jsx
│   ├── ErrorBoundary.jsx
│   ├── ProtectedRoute.jsx       Token gate, redirects to Dino Auth
│   ├── TouchDevice.jsx          Mobile-block screen
│   └── UseAuth.jsx              Dino Auth hook
├── Dockerfile
├── eslint.config.js
├── vite.config.js
└── vercel.json
```

### Backend (`dinostratum_webapi/`)

```
dinostratum_webapi/
├── api/
│   ├── config/
│   │   ├── db.js                PostgreSQL pool with PostGIS enabled
│   │   ├── s3.js                Object storage client, used for report PDFs
│   │   └── smtp.js              Transactional mail
│   ├── middleware/
│   │   ├── auth.js              Dino Auth token validation
│   │   ├── errorLogger.js
│   │   └── rateLimiter.js
│   ├── routes/
│   │   └── dinostratum-playground/
│   │       ├── dinostratum-playground-assets.js
│   │       ├── dinostratum-playground-portfolios.js
│   │       ├── dinostratum-playground-intel.js         Streaming SSE intel endpoints
│   │       ├── dinostratum-playground-exposure.js
│   │       └── dinostratum-playground-user-area.js     My Area and Saved Views
│   ├── workers/
│   │   ├── feedFetcher.js       Universal dispatcher across 28 upstream feeds
│   │   ├── writeQueue.js        Batched PostGIS upserts with retry and backoff
│   │   ├── cleanupWorker.js     30-minute cleanup cycle
│   │   ├── dynamicRefresh.js    24-hour Wikidata SPARQL refresh
│   │   └── reportBuilder.js     Server-side fallback for exposure report PDF generation
│   ├── public/                  Catchall and static
│   ├── docs/
│   └── index.js
└── vercel.json
```

The backend has a lot more going on than the DinoLabs backend because the hazard feeds need a polite consumer in front of them and because the spatial joins are most efficient where the geometry already lives.

The **asset and portfolio routes** are standard REST against PostGIS-aware tables. The **intel routes** serve all hazard families through a unified streaming endpoint per category and through a streaming nearby-spatial endpoint, both built on SSE rather than long-poll, with per-source chunks emitted as each upstream feed resolves. The **exposure route** runs `ST_Intersects`, `ST_Distance`, and `ST_DWithin` against the active portfolio and the cached event geometries when invoked from the server side. The **user area routes** handle the per-user preferred area (point-radius or bbox) with the area's PostGIS geometry materialized at write time (via `ST_Buffer` for radii and `ST_MakeEnvelope` for boxes) so that intersection queries against `risk_events_cache` are a single indexed spatial join. Everything user-related, auth, profile, team, passes through to Dino Auth.

A handful of operational endpoints also sit alongside the data routes: `/risk/intelligence/ingest/status`, `/risk/intelligence/ingest/trigger`, `/risk/intelligence/cleanup/status`, `/risk/intelligence/cleanup/trigger`, `/risk/intelligence/health`, `/risk/intelligence/dynamic-data/status`, and `/risk/intelligence/dynamic-data/refresh`. These are what back the in-page Health, Ingestion, and Cleanup dashboards described above, and they're also useful as a one-stop check when something looks wrong in the data.

### Persistence
- **PostgreSQL + PostGIS.** Holds assets, portfolios, the asset edit history log, the server-side hazard event cache (`risk_events_cache` with a `geom geography(Geometry, 4326)` column for indexed spatial queries), the per-user preferred area (`risk_user_areas`), the saved views (`risk_user_views`), and the ingestion run audit log (`ingestion_runs`). Asset geometry is a real PostGIS geometry column, which is what makes the server-side exposure path inexpensive enough to be the fallback rather than a workaround.
- **IndexedDB.** Cached intel feed snapshots, in-flight asset edits before they're committed, and the per-pair exposure score cache. All of it survives reloads.
- **Local Storage.** The user's preferred area and area-filter active state are mirrored here in addition to PostGIS, so the UI can render the area immediately on reload without waiting on a server round-trip. Saved views are similarly mirrored.
- **In-Memory Stores.** The backend keeps a `riskStore` of up to fifty thousand recent events keyed by id with severity-weighted eviction, a Wikidata-sourced dynamic reference cache (urban centers, infrastructure, deformation zones, fault lines) refreshed every twenty-four hours, an Overpass query cache with FNV-hashed keys and twenty-four hour TTL, and a fixed-budget write queue in front of PostGIS that batches up to five hundred upserts at a time with up to three retries and exponential backoff with jitter on retryable errors.

### Map
The frontend uses Deck.gl with MapLibre GL for global views and Apple MapKit JS for close-in views, with an automatic handoff at zoom level six. The hosted version uses Apple's MapKit JS token and Esri World Imagery tiles for the MapLibre side. Self-hosters can substitute their own MapKit token and any MapLibre-compatible style.

### Data sources

The platform is now pulling from roughly twenty-eight upstream feeds across ten hazard families:

- **USGS Earthquake Hazards Program.** Public GeoJSON feeds, no key required.
- **EMSC (European-Mediterranean Seismological Centre).** Public FDSN-format JSON feed.
- **INGV (Italy).** Public FDSN GeoJSON feed covering Italy and the Mediterranean.
- **GeoNet (New Zealand).** Public API covering New Zealand earthquakes and volcanic activity.
- **NIFC WFIGS.** Wildland fire perimeters through the WFIGS Interagency Perimeters feature service.
- **NOAA NWS Alerts API.** Public alerts feed, no key required.
- **NOAA SPC.** Storm Prediction Center day-one, day-two, and day-three convective outlooks as GeoJSON.
- **Open-Meteo Air Quality.** CAMS global atmospheric composition, no key required.
- **Open-Meteo Flood.** GloFAS-driven river discharge forecasts, no key required.
- **Open-Meteo Marine.** GFS Wave global sea state, no key required.
- **USGS Water Services.** Real-time stream gauge observations, no key required.
- **USGS Volcano Hazards Program.** Volcano alert levels and aviation color codes through the volcanoApi.
- **NOAA Tsunami Warning Centers via NWS Tsunami.** Public CAP feed.
- **NOAA SWPC Alerts.** Real-time space weather alerts.
- **NOAA SWPC Kp Index.** Current planetary Kp index.
- **NOAA SWPC Kp Forecast.** Three-day Kp forecast.
- **NOAA SWPC X-Ray Flux.** GOES X-ray flux observations.
- **NOAA SWPC Solar Wind Plasma.** DSCOVR/ACE solar wind plasma observations.
- **NOAA SWPC Interplanetary Magnetic Field.** DSCOVR/ACE IMF Bz observations.
- **GDACS.** Global Disaster Alert and Coordination System events with red, orange, and green alert levels.
- **NASA EONET.** Earth Observatory Natural Event Tracker, public API.
- **FEMA.** US disaster declarations via the OpenFEMA v2 API.
- **ESA Sentinel-1 InSAR via ASF DAAC.** Sentinel-1 GUNW interferogram products through the ASF search API.
- **Copernicus EGMS.** European Ground Motion Service mean LOS velocity points.
- **Wikidata SPARQL.** Dynamic reference dataset for urban centers and critical infrastructure (dams, pipelines, ports, nuclear plants, bridges, tunnels, fault lines, extraction sites, mines).
- **Nominatim.** Reverse geocoding for asset address auto-fill and forward geocoding for the My Area address field. Self-hosters should swap in their own geocoder for any non-trivial volume, since the public Nominatim instance is rate-limited aggressively.
- **Overpass API.** Used by the click-to-identify feature selection path on both the Risk Management and Asset Management pages, with multi-mirror failover across four public Overpass instances.
- **Wikipedia REST API.** Used opportunistically to enrich identified features that have a `wikipedia` tag.
- **Open-Elevation.** Used opportunistically to attach ground elevation to identified features.

---

## Hosted Version

The supported way to use DinoStratum is the hosted version at [DinoStratum](https://dino-stratum.vercel.app/login). The hosted instance is what owns the feed polling schedule, the cache layer, and the report generation queue, running these in a single shared backend is what keeps the platform a good citizen of the upstream agency APIs. Account creation and usage are free for now.

This repository is here as a reference and as the development home of the project. Self-hosting works but isn't the supported path, and the upstream feeds will rate-limit you faster than you'd expect if you try to run the platform without the proxy and cache layer in place.

---

## Setup (self-hosting)

If you do want to stand it up yourself, here's the shape of it.

### Requirements
- Node.js 20 or later
- PostgreSQL 15 or later with the PostGIS extension installed
- A modern browser with WebGL 2 (a MapLibre GL and Deck.gl requirement)
- API keys for an Apple MapKit JS token, a MapTiler key or equivalent MapLibre basemap provider, and (optional but recommended) keys for whichever upstream feeds require them (FIRMS, AirNow if you wire it back in)

### Build

Both repos run independently.

**Frontend (`dinostratumweb/`)**
1. `npm install`
2. Create a `.env` with the API base URL, auth provider config, Apple MapKit token, and basemap key
3. `npm run dev` for local development, `npm run build` for production

**Backend (`dinostratum_webapi/`)**
1. `npm install`
2. Create a `.env` with database URL, S3 credentials, SMTP config, auth provider config, and the upstream hazard feed keys
3. `npm run db:migrate`, this also enables the PostGIS extension if your Postgres role has permission, otherwise enable it manually first
4. `npm run dev` for local, `npm start` for production

### Environment variables
No `.env.example` is shipped with this repo. The ones you cannot skip on the backend:

- `DATABASE_URL`
- `AUTH_PROVIDER_URL`
- `AUTH_JWT_PUBLIC_KEY`
- `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`
- `ADMIN_API_KEY` (gates the admin-only cache clear endpoint)

On the frontend:

- `VITE_API_BASE_URL`
- `VITE_AUTH_PROVIDER_URL`
- `VITE_APPLE_MAPS_KEY`
- `VITE_MAPTILER_KEY`

---

## License

Apache License 2.0 with a Commons Clause restriction, same as the rest of the DinoLabs family. Read it, fork it, modify it, run it for non-commercial purposes, but no selling, sublicensing, or offering it as a hosted commercial service. The intent is to keep the source open as reference without giving up the commercial rights. See `LICENSE` for the full text.
