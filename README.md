# DinoStratum

DinoStratum is built to be a free, browser-based operational risk platform. It pairs a live multi-hazard intelligence feed with a geospatial asset portfolio, and continuously scores where the two intersect, which active wildfires are near your sites, which earthquakes just shook ground you have buildings on, which storm tracks are headed at your fleet. The kinds of dashboards that normally sit behind enterprise risk-modeling subscriptions, surfaced from public agency feeds and run client-side against your own data.

DinoStratum sits alongside DinoLabs and DinoSat in the same family of projects. DinoLabs is the flagship; DinoStratum is narrower by design, focused on a single operational workflow rather than a broad toolkit. It is still a side project, the hazard math is intentionally transparent rather than commercial-grade, and the cadence of improvements depends on the rest of my life. Feedback is welcome.

Unlike some of my other Dino platforms, the backend here is doing real work. It polls each of the upstream hazard feeds on its own cadence and normalizes them into a single envelope so the frontend doesn't have to care which agency produced what. It also owns the asset store and runs the PostGIS spatial queries that drive exposure scoring on the server side. The frontend still handles all of the rendering, the interactive recompute path, and the report generation, but the split here is closer to symmetric than the deliberately-thin-server pattern I lean on in the other platforms.

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

There are only two pages and they're built to work as a pair. **Risk Management** is the live operational view, the map, the intel bar, the active-event list, and the inspector that exposes the math behind any given asset-event pairing. **Asset Management** is where you maintain the portfolio that Risk Management scores against. The two pages share both an asset store and the cached hazard feed, so an edit on one side propagates to the other without a reload.

### Risk Management

This is the primary surface of the platform and by far the densest single page in the codebase. The component, `RiskCommandCenter.jsx`, runs to roughly two thousand lines and is responsible for everything from the dual-provider map handoff to the per-category metadata renderers in the right rail. The page is anchored by a full-bleed map with three overlay regions arranged around it: the intel bar pinned across the top, a left rail that lists active events, exposes the hazard filter controls, the user's preferred area, and the saved views, and a right rail (the Intel Bar component) that flips between three inspector modes depending on what's selected.

#### Dual Map Providers with Automatic Handoff

The map is not a single provider. The component initializes two map instances side by side, only one visible at a time, and swaps between them based on zoom level. Below zoom six the page renders through **Deck.gl plus MapLibre GL**, which gives the platform a proper globe-scale view with vector tiles from Esri World Imagery, optional 3D terrain from the Mapzen Terrarium tileset, and a deck.gl `MapboxOverlay` interleaved into the MapLibre style for every custom layer. From zoom six and above the page hands off to **Apple MapKit JS**, which is much stronger for close-in satellite imagery, building footprints, and points of interest.

The handoff is handled by a `switchToProvider` routine that synchronizes camera state (center, zoom, pitch, bearing) between the two providers, hides one DOM container and shows the other, and re-emits the relevant markers and overlays on whichever provider is now active. A `switchingProviderRef` guards against re-entry during the swap, and a deferred `pendingAppleMarkerRefreshRef` flag ensures Apple annotations are rebuilt one frame after the provider becomes visible (you cannot add annotations to a hidden MapKit container and have them render correctly).

The deck.gl side is the one that handles the heavy custom layer load. The Apple side mostly carries native annotations and MapKit `CircleOverlay` / `PolygonOverlay` primitives for risk impact zones and the user's preferred area.

#### Intel Bar

The intel bar (here implemented as the left-rail summary panel rather than a literal top strip; the component named `IntelBar` is actually the right-rail inspector, kept as a separate file) is organized as a per-hazard-family roll-up with severity counts, last-updated timestamp, and a per-category visibility toggle that doubles as a filter chip. Clicking a category narrows the map markers and the active-event list to that single family; a "Show All" / "Hide All" pair in the Risk Layers modal handles bulk toggling.

The bar covers eight hazard families today, and unlike the original design every family is wired all the way through to the backend's ingestion worker rather than to the agencies directly from the browser:

- **Earthquakes**, sourced from four independent agencies: **USGS**, **EMSC**, **INGV** (Italy and the Mediterranean), and **GeoNet** (New Zealand). Each event carries magnitude, magnitude type, depth, place name, origin time, alert level, CDI and MMI where available, station count, RMS, azimuthal gap, an estimated count of expected aftershocks, and the energy released in joules with the TNT equivalent.
- **Wildfires**, from **NIFC WFIGS** active fire perimeters. Each event carries acres burned, percent contained, fire behavior, fire cause (general and specific), discovery date, duration in days, primary and secondary fuel models, total personnel, structures destroyed and threatened, fatalities, injuries, an estimated cost to date, and the IRWIN ID for cross-referencing with other incident systems.
- **Severe weather**, from **NOAA NWS** alerts, **NOAA SPC** convective outlooks (day 1, 2, and 3), and **Open-Meteo Marine** for global sea state. Watches, warnings, and advisories filtered by event type (tornado, severe thunderstorm, flash flood, winter storm, ice storm, red flag, extreme heat) carry the official alert polygon, the full headline and instruction text, the issuing office, urgency, certainty, and response type.
- **Tropical cyclones and tornadoes** are surfaced through the NWS alerts feed and through **GDACS** for global coverage. Cyclone tracks themselves come through GDACS event geometries.
- **Volcanic activity**, from the **USGS Volcano Hazards Program** via the Smithsonian GVP backing dataset. Alert level (Normal / Advisory / Watch / Warning) and aviation color code (Green / Yellow / Orange / Red), elevation, volcanic explosivity index, last eruption date, Holocene activity flag, dominant rock type, and the GVP volcano number.
- **Tsunami**, from the **NWS Tsunami** alert feed, with the source earthquake cross-referenced where available and the impacted coastline polygons attached.
- **Floods**, from **USGS Water Services** real-time gauge observations and **Open-Meteo GloFAS** for global river discharge forecasts. Currently-flooded gauges carry stage in feet, flood category (Normal / Action Stage / Minor / Moderate / Major), site code, HUC, drainage area, and recent stage history. GloFAS adds a seven-day peak discharge forecast with peak-to-average ratio.
- **Air quality**, from **Open-Meteo Air Quality** (CAMS global atmospheric composition), which gives global coverage rather than just the United States. PM2.5, PM10, ozone, NO2, SO2, CO, and the US AQI bucket with the standard six-tier category coloring and a tailored health recommendation per bucket.

Two additional hazard families that did not fit the original eight are now also wired in:

- **Ground deformation**, from **ESA Sentinel-1 InSAR** GUNW products via the ASF DAAC, supplemented by a dynamically maintained catalog of known deformation zones (subsidence basins, extraction fields, mining districts, geothermal areas, deltas, polders) sourced from Wikidata SPARQL and from the Copernicus EGMS ground motion service. Each event carries cumulative displacement, current rate, estimated coherence, perpendicular and temporal baselines, displacement direction, and a list of nearby critical infrastructure with proximity-weighted risk relevance.
- **Space weather**, from the full **NOAA SWPC** suite: human-readable alerts, the planetary Kp index (current and forecast), GOES X-ray flux, DSCOVR / ACE solar wind plasma, and the interplanetary magnetic field Bz component. Each event carries the relevant storm scale (G1 through G5, S1 through S5, R1 through R5) and an explicit per-system impact summary covering power systems, spacecraft operations, HF radio, navigation, and aurora visibility.

Add to that the broader multi-hazard sources (**GDACS** for global disasters, **NASA EONET** for ongoing natural events, **FEMA** for US disaster declarations), and the platform is now pulling from roughly twenty-eight upstream feeds rather than the original eight.

All of these route through the backend's ingestion worker rather than going to the agencies directly from the browser. The worker runs on a five-minute cycle, fans out to every source in parallel with a concurrency limit of three at a time to keep database pressure manageable, caches each source's normalized output in memory and in PostGIS, and serves the frontend over a single Server-Sent Events stream that emits one chunk per source as that source finishes resolving. The client doesn't have to know about per-agency payload shapes, just the unified `risk_events_cache` envelope.

The bar also exposes a "Refresh" button that re-runs the streaming fetch immediately rather than waiting for the next ingestion cycle, and a per-category event count that updates live as new chunks arrive.

#### Streaming Ingestion and Cache

The ingestion side deserves its own note. The backend (`risk-intelligence.js`) implements:

- A **universal fetch dispatcher** with five pagination strategies (single request, offset-based pagination, multi-URL fan-out, batch by location, batch by US state, and fully custom per-source) so that each upstream feed's quirks are encoded once and never leak into the rest of the pipeline.
- A **multi-mirror failover** layer for Overpass queries (used by the Asset Management page for click-to-select feature identification) that rotates across four public Overpass instances and applies an in-memory FNV-hashed query cache with a twenty-four hour TTL.
- A **write queue** in front of PostGIS upserts with a concurrency limit, exponential backoff with jitter on retryable errors (deadlocks, serialization failures, lock timeouts), and a hard cap on queue depth to shed load rather than blow up the pool under pressure.
- A **cleanup worker** that runs every thirty minutes to delete rows without coordinates, delete expired events past the grace period, deduplicate by `(source, source_id)` keeping the newest row, backfill the PostGIS `geom` column for any rows that landed without one, run `ANALYZE risk_events_cache` to keep the planner honest, and purge old ingestion run records.
- A **dynamic reference data refresh** on a twenty-four hour cycle that pulls roughly six hundred urban centers and a few thousand pieces of critical infrastructure from Wikidata SPARQL (dams, pipelines, ports, nuclear plants, bridges, tunnels, fault lines, extraction sites, mines) and feeds them into the location-batched air quality and flood queries as well as into the ground deformation zone synthesis.

The frontend consumes all of this through three separate SSE endpoints (full intelligence stream, nearby-spatial stream, ingestion progress stream) and locally maintains an in-memory `riskIntelligenceData` keyed by category, with a sixty-second prune cycle that drops events past their twenty-four hour client-side TTL (with Ground Deformation exempted as a persistent category since InSAR observations represent ongoing conditions rather than discrete events).

#### My Area and Saved Views

Two operational features sit on top of the intel bar that the original design didn't have.

**My Area** is a persistent geographic filter. Users can save either a point-and-radius (circular area around an address or coordinates, with built-in Nominatim geocoding) or a bounding box, and toggle the filter on or off independently of having an area saved. When active, the filter is applied to every risk category, every summary count, every map marker, and every modal that lists nearby events, all in a single `useMemo` pass that runs `isPointInArea` over the in-memory risk data. The area is persisted both to local storage (so it survives reloads without a server round-trip) and to the backend (so it survives a fresh device).

The geometry is drawn on both providers. On deck.gl the area renders as a `SolidPolygonLayer` fill with a `PathLayer` stroke, the polygon ring computed by a geodesic-circle algorithm at ninety-six segments, with a center pin (outer / inner / label) sitting on top. On Apple Maps the same area renders as either a `CircleOverlay` or a `PolygonOverlay` with a dashed cyan stroke and a translucent fill, plus a labeled annotation at the center.

**Saved Views** capture the current camera (center, zoom, pitch, bearing, bounds), the current filter state (My Area, active risk layers), and the current layer toggle state (3D terrain, satellite versus topographic basemap, building POIs, asset visibility mode, heatmap on or off, visibility badges on or off) under a user-supplied name and description. They're stored both client-side and in the backend's `risk_user_views` table, capped at fifty per user, and applied with a single click that flies the map to the saved camera and restores every toggle. The "Apply" path is also wired to a `?view=` query parameter so saved views can be shared as deep links.

Both features are coupled to the same backend user table set, so an org admin who shares an account or a workspace can hand off their preferred areas and views without re-entering them.

#### Map and Hazard Layers

The deck.gl layer stack is built fresh on every relevant state change by a `buildDeckLayers` callback and pushed into the overlay through `setProps({ layers })`. The full set, in render order, is:

- **Heatmap layer** (optional, toggled by the user). Drawn from up to five hundred events per category with severity-weighted intensity, dynamic radius and intensity that scale with the current zoom (200 pixel radius at z10 and above, down to 50 pixels at z3 and below), and a six-stop color ramp from transparent cyan through to opaque red. When the heatmap is on, individual risk markers and impact circles are suppressed to keep the canvas readable.
- **Asset polylines, polygons, and points**. Line assets (pipelines, transmission corridors) render through a `PathLayer` colored by asset type and widened by risk score. Polygon assets (refinery footprints, mine boundaries, data center campuses) render as a translucent fill plus a stroke. Point assets render as a two-layer scatterplot (outer ring colored by risk score, inner dot colored by asset type) plus a `TextLayer` for the asset name, billboard-aligned with a black outline so labels stay legible on any basemap.
- **Risk event markers**. A single `ScatterplotLayer` carries every active hazard event, sized by severity (Critical at 14 pixels, High at 11, Medium at 9, Low at 7), filled with the severity color, and stroked with the category color so you can see both dimensions at a glance.
- **Visibility badges**. A small gold dot is overlaid on any risk event whose `visibility` is `org-private`, distinguishing your organization's privately-ingested events from the public agency feeds. The badge is toggleable independently of the markers themselves.
- **Impact circles**. For any event with a defined impact radius, a translucent circle is drawn at that radius in meters, with the fill and stroke alpha both scaled down as the circle count grows so a dense view doesn't turn into a single opaque blob. Capped at two hundred circles per render with the largest impact radii prioritized.
- **Risk polygon overlays**. For any event delivered with a real `Polygon` geometry (NWS alert polygons, wildfire perimeters, tsunami coastal segments), a `SolidPolygonLayer` plus `PathLayer` pair renders the actual footprint rather than just the centroid marker. This is the difference between knowing a tornado warning exists in Oklahoma and being able to see which counties it actually covers.
- **My Area** rendered as described above.
- **Selection highlight**. When a feature is selected through the click-to-identify mode, its geometry is drawn as a cyan fill plus stroke on top of everything else.

On the Apple side most of these become native primitives: `Annotation` for markers (with a per-marker DOM factory that builds a CSS pin and an animated pulse for Critical and High severities), `CircleOverlay` for impact radii, and `PolygonOverlay` for risk polygon footprints and the bounding-box My Area.

Symbol sizing is severity-driven and family-specific in the data layer (magnitude for earthquakes, intensity classification for cyclones, AQI bucket for air quality, fire radiative power for wildfires) and severity-tier-driven in the marker layer. Clustering happens implicitly through deck.gl's GPU-side rendering at low zoom; at high zoom every event gets its own marker.

#### Click-to-Identify Feature Selection

A "Select" toggle in the page header puts the map into a feature-identification mode that's powered by Overpass rather than by any of the hazard feeds. Click anywhere on the map and the page runs an Overpass query within a zoom-tiered radius (3 meters at z21, scaling out to 15 kilometers at z6 and below), picks the best matching polygon (preferring features the click is inside, breaking ties by smallest area, then by edge distance plus an area-tiebreaker term), and opens a feature-detail panel with:

- The feature's address (assembled from OSM tags if present, otherwise reverse-geocoded through Nominatim)
- A Wikipedia summary if the feature has a `wikipedia` tag, fetched through the Wikipedia REST API
- The ground elevation at the centroid from Open-Elevation
- A list of nearby points of interest (amenities, shops, tourism, transit) within three hundred meters
- A list of nearby named streets within one hundred fifty meters
- The administrative boundaries the feature sits inside, sorted by admin level
- A land-use context summary based on a five-hundred-meter Overpass query
- Geographic context (estimated timezone from longitude, climate zone from latitude, hemisphere)
- The full set of polygon measurements: area, perimeter, dimensions (north-south extent, east-west extent, diagonal, longest and shortest edges, average edge, equivalent circular diameter, aspect ratio), and the geometric bounding box

The geometry is drawn as a cyan highlight on top of the basemap and a "Zoom to feature" button fits the map to its bounding box. All of this lives client-side; the only server cost is the Overpass and Nominatim and Wikipedia rate limits, which the multi-mirror caching layer keeps polite.

#### Active Event List

The left rail's active event list mirrors whatever the current filter and viewport contain, sorted by severity (the default), most-recent-first, or proximity to the map center. Each row shows the family icon, headline, severity badge, time-ago, and a small chip listing any of your assets whose footprint intersects the event. Selecting a row in the list selects the event on the map and opens it in the inspector simultaneously.

#### Selection Inspector (IntelBar)

The right rail is a dedicated component (`IntelBar.jsx`) that lights up whenever something on the map is selected. It supports two selection contexts: a hazard event (which gets the full intelligence briefing treatment across nine tabs) and a map feature identified through the click-to-identify path (which gets a single details tab with measurements and the enrichment data described above). The component is large, roughly fifteen hundred lines, and behind it sits a separate backend route that runs the actual fan-out across the upstream intelligence sources and the Gemini-powered analysis pipeline. This is where DinoStratum stops being just a map of where the bad things are and starts becoming an analyst tool that explains them.

##### The Nine-Tab Briefing

When a hazard event is selected, the IntelBar exposes nine tabs.

The **Details** tab is the source-of-truth view, the same per-category metadata renderer described before (earthquake, wildfire, weather, flood, volcano, air quality, ground deformation, golden mesh detection, global disaster), but presented as a horizontal scrolling stack of cards: Overview with severity badge and quick actions (Source, Assess, Nearby, Create Alert), Location & Timing, Population Impact (density tier, estimated population, nearest city, distance), Detailed Data flattened from the per-source metadata blob, Golden Mesh Detection when present, Safety Recommendations, and a Source Info card with the internal ID and the upstream source ID. If the event has expired past its TTL, a prominent banner offers to dismiss it or refresh the entire risk feed.

The **AI Summary** tab is the headline feature. On selection, the backend kicks off a parallel fetch across the entire upstream intelligence stack (more on which sources below), filters every returned item against the risk event through a Gemini-powered relevance scorer, runs the curated set through a second Gemini call that generates a structured intelligence briefing (executive summary, five key findings, six contextual statistics, impact assessment, affected areas, recommendations, and a chronological timeline), and returns the whole thing as a multi-card layout. Each card scrolls independently. Confidence is computed separately from the count and tier of corroborating sources (tier-one outlets like Reuters, AP, BBC, NYT, Washington Post, Guardian, AFP; tier-two like CNN, NBC, NPR, DW; verified video channels; academic count; ReliefWeb count; distinct source count) and surfaced both as a colored HIGH/MEDIUM/LOW badge on the IntelBar header and as a dedicated Confidence card in the summary with per-tier indicator breakdown. If the AI summary is unavailable (no Gemini API key, or the call fails), a fallback summary is built from the raw event metadata with confidence forced to LOW.

The **News** tab shows aggregated news coverage from GDELT (the global news event database), GNews (when configured), and Google Custom Search. Each result is deduplicated by URL, date-filtered against the event window, scored by relevance to the event (matching against category, location, magnitude, place name, with a publication-date-versus-event-date proximity bonus and a source-tier bonus), passed through the Gemini relevance filter for a final 0 to 10 score, and rendered as cards with the article image, source, publication time, a Verified/Likely/Unverified badge based on the relevance score, and the provider tag.

The **Videos** tab is the same pattern against the YouTube Data API: search, fetch view/like/duration stats in a second batch call, filter by date window, score by relevance with a view-count bonus and a verified-channel bonus for the major news outlets, and render as cards with the thumbnail, duration, view count, channel, and a relevance badge.

The **Images** tab pulls from Google Images (when configured), Wikimedia Commons (which is unkeyed and surprisingly good for event imagery), and any image URLs extracted from the news articles fetched in the News tab. Images are deduplicated by URL, passed through a dedicated Gemini image-relevance filter that flags generic stock photos and wrong-location maps for removal, and rendered as a grid. Clicking any image opens an in-component lightbox with previous/next navigation, a source link, and a caption.

The **Academic** tab runs against the Semantic Scholar API, mapping the risk category to a discipline term (seismology for earthquakes, hydrology for floods, tropical cyclone for hurricanes, volcanology for volcanic events, and so on) so that "Wildfire in California" queries against "wildfire fire science combustion California" rather than the literal event title. Each paper card shows the title, first five authors, abstract excerpt, year, citation count, and a DOI link when available.

The **Social** tab queries the unauthenticated Reddit search endpoint, filters by relevance through Gemini, and renders each post with the subreddit, score, comment count, author, time, excerpt, and a Relevant/Maybe/Off-topic badge.

The **Related** tab is the only one that doesn't go out to upstream sources at all: it runs a `ST_DWithin` PostGIS query against the in-database hazard cache within the risk's impact radius (capped at five hundred kilometers), sorts by severity score and distance, and returns up to twenty nearby risks. Clicking one navigates the map to that risk and re-opens the briefing in that risk's context.

The **History** tab queries the briefings audit table for the org's most recent briefings, optionally bbox-filtered to the current map viewport, and renders them as a chronological list with the category, severity, title, confidence level, scope (viewport or assets), and asset count. Selecting a row navigates to that risk on the map and reopens the briefing.

##### Viewport vs Asset Scope

A scope toggle in the settings panel switches the briefing between two modes. **Viewport scope** is the default and treats the briefing as a general-purpose analysis of the event for anyone viewing it. **Asset scope** runs an additional PostGIS spatial query against the org's asset registry inside the risk's impact radius, ranks the returned assets by criticality and proximity, surfaces them as a dedicated Org Assets card in the AI Summary tab, and prepends the asset list to the Gemini prompt with an explicit instruction to tailor the impact assessment, recommendations, and key findings toward operational exposure to those named assets. The same briefing for the same event will read very differently in the two modes: viewport reads like a news brief, asset reads like an internal advisory memo addressed to the operations team responsible for the named sites.

##### Source Toggles, Feedback, Alert Rules

Three modal flows sit on top of the briefing.

The **Settings** modal exposes per-source enable/disable toggles for all eleven upstream providers (GDELT, GNews, Google CSE, YouTube, Google Images, Wikimedia, Article Images, Semantic Scholar, Reddit, ReliefWeb, Wikipedia) plus the scope default. Settings persist per username and orgid to a dedicated `intel_user_settings` table and are honored on every subsequent briefing fetch, including the per-tab refresh paths. A disabled source short-circuits its backend call immediately and returns an empty array, so toggling sources off reduces external API load rather than just hiding results.

The **Flag this briefing** modal lets a user submit a structured complaint against any briefing they think is wrong. The categories are intentionally specific: Inaccurate summary, Wrong location, Off-topic sources, Hallucinated content, Outdated information, Other. The submission captures a snapshot of the full source bundle (every URL, every relevance score, every provider tag that fed the AI summary) and the AI summary itself, then stores all of it in `intel_briefing_feedback`. The intent is to be able to reproduce and debug a bad briefing from the audit trail alone, without needing to re-run the upstream feeds at the time of complaint.

The **Create Alert** modal pre-fills from the current briefing and creates a row in the platform's main `risk_alerts` table. Rule name, severity threshold, radius, and category are all pre-populated from the event being briefed; the user adjusts and submits. From that point on, the alert rule is owned by the standard alerting engine and the briefing is just where it was born.

##### Source Bundle and Audit Trail

Every full briefing captures the complete set of sources that informed it (article titles, URLs, providers, publication dates, relevance scores, video stats, paper metadata, Reddit thread context) into the `source_bundle` JSONB column on the briefing record. The AI Summary tab has a Sources button that surfaces this bundle as a dedicated card with per-provider groupings (Articles, Videos, Academic, Reddit, ReliefWeb, Wikipedia, Google Results), each item linked back to its origin and tagged with the relevance score that put it there. This is what makes feedback complaints actionable and what makes asset-scoped briefings defensible: every claim in the AI summary has a paper trail.

##### Performance, Caching, Fallbacks

The briefing path is heavily cached at multiple levels: full briefings in `BRIEFING_CACHE`, per-source search results in `SEARCH_CACHE`, the resolved risk objects themselves in `RISK_OBJECT_CACHE`, captured source bundles in `SOURCE_BUNDLE_CACHE`, and per-user settings in `USER_SETTINGS_CACHE`. All caches use a thirty-minute TTL and a sliding LRU eviction. A second-tier cache lives in the per-source fetchers themselves, so a GDELT query for "Wildfire California" hit by two different briefings within the cache window only makes one outbound call.

Every upstream call goes through a timeout-and-retry wrapper that backs off exponentially on 429s, respects the `Retry-After` header, and falls through to an empty result rather than failing the briefing when a non-critical source returns an error. The Gemini relevance filter has its own fallback: if the API key is missing or the call fails, the filter falls back to a keyword-based scoring path that still does location and category matching, so per-tab item filtering never completely breaks. The AI summary itself has the same property: if Gemini is unavailable, the fallback summary is built from the raw event metadata with confidence forced to LOW and a data quality note attached.

##### Feature Selection Mode

When the selection is a map feature rather than a hazard event (from the Overpass click-to-identify path described earlier), the IntelBar reduces to a single Details tab that renders the feature overview, the measurement card (area, perimeter, vertex count, centroid coordinates), the address (from OSM tags or from the Nominatim reverse geocode fallback), and the elevation card. The fetch-in-progress state is surfaced as a separate skeleton card while the Wikipedia, Open-Elevation, nearby POIs, nearby streets, admin boundaries, and land use queries resolve in parallel. The Zoom, Assess, and Nearby actions are wired in the same way as on the hazard event view so any identified feature can be turned directly into a location risk assessment.

##### Expired Events

The inspector also handles expired event dismissal: if you open a saved or stale event past its twenty-four hour TTL, the panel surfaces a banner offering to remove it from the local cache or refresh the entire risk feed. This catches the case where a link is shared or a saved view is opened long after the underlying event has been pruned, and avoids silently presenting stale data as if it were current.

#### Exposure Scoring

The exposure model is intentionally simple and transparent. There's a single scoring function per hazard family that consumes an event and an asset and returns `{ tier, factors, geometry }`. The factors are always shown in the inspector, so it's never opaque why a score came out the way it did. Earthquake factors are distance from epicenter, asset's mapped ShakeMap intensity if one is available, and asset construction-class modifier. Wildfire factors are distance to the nearest active detection, detection confidence, and wind direction toward the asset. Cyclone factors are which forecast cone band the asset sits in and the forecast intensity at the asset's closest-approach time. Ground deformation factors are cumulative displacement, annual rate, current coherence, and proximity to critical infrastructure (the last of which is the same proximity check used by the backend's location risk assessor). I'm not claiming this rivals a commercial catastrophe model, it's a transparent approximation that's good enough to flag where you should be paying attention.

A dedicated **Assess Location** path is available from the header that runs a server-side equivalent against a point and radius: it pulls every nearby risk across six categories, weights each one by severity and proximity, returns a 0 to 100 composite score with a tier label, surfaces the contributing factors with their individual contributions, includes the population exposure estimate and the count of critical infrastructure within range, and ranks the top hundred nearby risks. The result opens in a dedicated modal and can be saved as a new My Area in one click.

Per-pair exposure scores are cached client-side and invalidated when either side of the pair changes, so re-opening an event you've already scored against your portfolio is instant.

#### Golden Mesh Change Detection

Ground deformation events carry an additional inspector section that the other families don't: a **Golden Mesh** comparison block. Assets in the Asset Management page can have a baseline three-dimensional mesh captured (from LiDAR, photogrammetry, or any other source) and stored as a per-asset "golden" reference. When a Sentinel-1 InSAR observation comes in over an asset that has a golden mesh, the backend runs a per-point comparison of the simulated current surface against the baseline, computes the maximum delta in millimeters, the mean and standard deviation of deltas, the percentage of affected points, and the spatial hotspots where the deviation is concentrated, and attaches the result to the event under `golden_mesh_detection`. The inspector renders this as its own metadata section with a color-coded severity badge, an affected-percentage progress bar, a hotspot count, and an acknowledgment state (unacknowledged, acknowledged, resolved) that propagates back to the backend.

This is the piece of the platform that's furthest from off-the-shelf, and it's the one that ties the InSAR feed to actual operational decision-making rather than just to a passive map layer.

#### Reports

A "Generate report" button on the Risk Management header builds a per-portfolio exposure snapshot PDF: a cover page with the run timestamp and the set of active hazard families, a per-asset table sorted by highest current exposure tier with the contributing event linked, and a final map page with all of the current events and your assets symbolized in context. The PDF is assembled client-side using `jsPDF` plus a snapshot of the MapLibre canvas, with a server-side fallback (`reportBuilder.js`) that runs the same composition headlessly for users who want a scheduled or back-dated report.

#### Health, Ingestion, and Cleanup Dashboards

Three operations-facing modals are wired into the sidebar:

- **Ingestion Worker Status** shows whether the worker is currently running, the configured cycle interval, the number of cached events both in memory and in PostGIS, the breakdown by category and severity, the last ten ingestion runs with duration and error counts, and a live SSE feed of in-progress ingestion that updates as each source completes. The feed connects on demand and disconnects when the modal closes.
- **Cleanup Worker Status** shows the cleanup worker's running state, its interval, the configured retention windows (seven day grace period for expired events, seven day retention for ingestion run records), the per-stage batch and iteration limits, and a manual "Trigger Cleanup" button that returns 202 when accepted and 409 if a cycle is already running.
- **System Health** rolls up the PostGIS connection (with cached event count and the connection pool stats), the external API connectivity per upstream source, and the write queue depth, currently-processing flag, and total dropped count.

These are the kinds of dashboards that normally only the operator sees, but on a platform that's actively polling twenty-eight feeds it felt right to make them visible to anyone using the product, both as a transparency mechanism and as a debugging surface when something goes sideways.

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
