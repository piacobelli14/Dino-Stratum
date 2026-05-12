import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faTimes, faChevronUp, faChevronDown, faChevronLeft, faChevronRight,
  faNewspaper, faVideo, faImage, faGraduationCap, faUsers,
  faSpinner, faExternalLinkAlt,
  faMountain, faFire, faWater, faCloud, faVolcano, faSmog, faLayerGroup,
  faHurricane, faSatellite, faTriangleExclamation,
  faClock, faComment, faSyncAlt,
  faExclamationTriangle, faLink, faPlay, faEye,
  faBrain, faChartBar, faShieldAlt, faMapMarkerAlt,
  faCheckCircle, faTimesCircle, faInfoCircle,
  faCrosshairs, faBullseye, faTrash, faRefresh,
  faExclamationCircle, faPersonShelter, faKitMedical,
  faPeopleGroup, faCubes, faRuler, faObjectGroup,
  faBuilding, faLocationCrosshairs, faFlag, faGear,
  faGlobe, faDatabase, faSliders, faFilter,
  faCircleCheck, faSave, faPaperPlane
} from "@fortawesome/free-solid-svg-icons";
import "../../styles/mainStyles/Intelligence/IntelBar.css";

const SEVERITY_COLORS = { Critical: "#FF6B6B", High: "#FF9500", Medium: "#FFE66D", Low: "#4ECDC4" };

const RISK_ICONS = {
  seismic: faMountain, wildfire: faFire, flood: faWater, weather: faCloud,
  tornado: faCloud, hurricane: faHurricane, volcanic: faVolcano,
  "air quality": faSmog, "ground deformation": faLayerGroup, space: faSatellite
};

const SOURCE_LABELS = {
  gdelt: { name: "GDELT", description: "Global news event database" },
  gnews: { name: "GNews", description: "Aggregated news API" },
  google_cse: { name: "Google CSE", description: "Custom search engine" },
  youtube: { name: "YouTube", description: "Video search and stats" },
  google_images: { name: "Google Images", description: "Image search via CSE" },
  wikimedia_images: { name: "Wikimedia", description: "Commons image library" },
  article_images: { name: "Article Images", description: "Extracted from news" },
  semantic_scholar: { name: "Semantic Scholar", description: "Academic paper search" },
  reddit: { name: "Reddit", description: "Social media discourse" },
  reliefweb: { name: "ReliefWeb", description: "Humanitarian reports" },
  wikipedia: { name: "Wikipedia", description: "Encyclopedia context" }
};

const TAB_CONFIG = [
  { id: "summary", label: "AI Summary", icon: faBrain },
  { id: "details", label: "Details", icon: faInfoCircle },
  { id: "articles", label: "News", icon: faNewspaper },
  { id: "videos", label: "Videos", icon: faVideo },
  { id: "images", label: "Images", icon: faImage },
  { id: "academic", label: "Academic", icon: faGraduationCap },
  { id: "social", label: "Social", icon: faUsers },
  { id: "related", label: "Related", icon: faLink }
];

const FLAG_CATEGORIES = [
  "Inaccurate summary",
  "Wrong location",
  "Off-topic sources",
  "Hallucinated content",
  "Outdated information",
  "Other"
];

function getRiskIcon(category) {
  return RISK_ICONS[category?.toLowerCase()] || faTriangleExclamation;
}

function getRiskColor(score) {
  if (score > 70) return "#FF6B6B";
  if (score > 50) return "#FF9500";
  return "#4ECDC4";
}

function getConfidenceClass(level) {
  if (level === "HIGH") return "ibConfHigh";
  if (level === "MEDIUM") return "ibConfMedium";
  return "ibConfLow";
}

function getRelevanceColor(score) {
  if (score >= 7) return { class: "ibRelevanceHigh", color: "#4ECDC4" };
  if (score >= 4) return { class: "ibRelevanceMed", color: "#FFE66D" };
  return { class: "ibRelevanceLow", color: "#FF6B6B" };
}

function resolveRiskId(risk) {
  if (!risk) return null;
  return risk.id || risk.risk_id || risk.event_id || risk.source_id || null;
}

function formatRelativeTime(ts) {
  if (!ts) return "";
  try {
    const ms = Date.now() - new Date(ts).getTime();
    const m = Math.floor(ms / 60000), h = Math.floor(ms / 3600000), d = Math.floor(ms / 86400000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    if (h < 24) return `${h}h ago`;
    if (d < 30) return `${d}d ago`;
    return new Date(ts).toLocaleDateString();
  } catch { return ""; }
}

function formatRiskTime(ts) {
  if (!ts) return "Unknown";
  try { return new Date(ts).toLocaleString(); } catch { return ts; }
}

function formatNumber(n) {
  if (n == null) return "N/A";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString();
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

function truncate(s, len) {
  if (!s) return "";
  return s.length > len ? s.substring(0, len) + "…" : s;
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}.`);
  return res.json();
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}.`);
  return res.json();
}

export default function IntelBar({
  selectedRisk,
  selectedAsset,
  selectedFeature,
  featureMeasurements,
  featureDetails,
  isFetchingDetails,
  riskEventExpired,
  viewportBbox,
  username: propUsername,
  orgid: propOrgid,
  onClose,
  onCloseRisk,
  onCloseAsset,
  onCloseFeature,
  onNavigateToRisk,
  onDismissExpired,
  onRefreshRisk,
  onAssessLocation,
  onOpenNearby,
  onZoomToFeature,
  expandedRiskSections,
  toggleRiskSection
}) {
  const orgid = propOrgid || (typeof window !== "undefined" && localStorage.getItem("orgid")) || "default_org";
  const username = propUsername || (typeof window !== "undefined" && localStorage.getItem("username")) || "default_user";

  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState("summary");
  const [scope, setScope] = useState("viewport");
  const [activeContext, setActiveContext] = useState(null);

  const [summaryData, setSummaryData] = useState(null);
  const [articlesData, setArticlesData] = useState(null);
  const [videosData, setVideosData] = useState(null);
  const [imagesData, setImagesData] = useState(null);
  const [academicData, setAcademicData] = useState(null);
  const [socialData, setSocialData] = useState(null);
  const [relatedData, setRelatedData] = useState(null);
  const [sourceBundle, setSourceBundle] = useState(null);
  const [assetContext, setAssetContext] = useState(null);

  const [loading, setLoading] = useState({});
  const [errors, setErrors] = useState({});
  const [imageViewerIdx, setImageViewerIdx] = useState(null);

  const [userSettings, setUserSettings] = useState(null);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);

  const [feedbackCategory, setFeedbackCategory] = useState(FLAG_CATEGORIES[0]);
  const [feedbackReason, setFeedbackReason] = useState("");
  const [feedbackComments, setFeedbackComments] = useState("");
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackResult, setFeedbackResult] = useState(null);

  const [showSources, setShowSources] = useState(false);
  const [currentBriefingId, setCurrentBriefingId] = useState(null);

  const scrollRefs = {
    details: useRef(null),
    summary: useRef(null),
    articles: useRef(null),
    videos: useRef(null),
    images: useRef(null),
    academic: useRef(null),
    social: useRef(null),
    related: useRef(null)
  };

  const prevRiskIdRef = useRef(null);
  const prevFeatureIdRef = useRef(null);
  const selectedRiskRef = useRef(selectedRisk);
  const scopeRef = useRef(scope);
  const userSettingsRef = useRef(userSettings);

  const riskId = resolveRiskId(selectedRisk);
  const featureId = selectedFeature?.id || null;
  const hasContent = selectedRisk || selectedFeature;

  useEffect(() => {
    selectedRiskRef.current = selectedRisk;
  }, [selectedRisk]);

  useEffect(() => {
    scopeRef.current = scope;
  }, [scope]);

  useEffect(() => {
    userSettingsRef.current = userSettings;
  }, [userSettings]);

  useEffect(() => {
    if (selectedRisk) {
      setActiveContext("risk");
    } else if (selectedFeature) {
      setActiveContext("feature");
    } else {
      setActiveContext(null);
    }
  }, [selectedRisk, selectedFeature]);

  useEffect(() => {
    if (!username) return;
    (async () => {
      try {
        const params = new URLSearchParams({ username });
        if (orgid) params.append("orgid", orgid);
        const data = await getJson(`${import.meta.env.VITE_API_BASE_URL}/risk/intel/user-settings?${params.toString()}`);
        if (data && data.success !== false) {
          setUserSettings(data.settings);
          if (data.settings.default_scope) {
            setScope(data.settings.default_scope);
          }
        }
      } catch (error) {}
    })();
  }, [username, orgid]);

  const setLoadingKey = (key, val) => setLoading(prev => ({ ...prev, [key]: val }));
  const setErrorKey = (key, val) => setErrors(prev => ({ ...prev, [key]: val }));

  const resetIntelData = useCallback(() => {
    setSummaryData(null);
    setArticlesData(null);
    setVideosData(null);
    setImagesData(null);
    setAcademicData(null);
    setSocialData(null);
    setRelatedData(null);
    setSourceBundle(null);
    setAssetContext(null);
    setLoading({});
    setErrors({});
    setImageViewerIdx(null);
    setCurrentBriefingId(null);
    setShowSources(false);
  }, []);

  const fetchSummary = useCallback(async () => {
    const risk = selectedRiskRef.current;
    if (!risk) return;
    setLoadingKey("summary", true);
    setErrorKey("summary", null);
    try {
      const body = { risk, scope: scopeRef.current, username, orgid };
      const data = await postJson(`${import.meta.env.VITE_API_BASE_URL}/risk/intel/briefing/summary`, body);
      if (data && data.success !== false) {
        setSummaryData(data.summary);
        if (data.summary?.briefing_id) setCurrentBriefingId(data.summary.briefing_id);
      } else {
        setErrorKey("summary", data?.message || "Failed to generate AI summary.");
      }
    } catch (error) {
      setErrorKey("summary", error.message);
    }
    setLoadingKey("summary", false);
  }, [username, orgid]);

  const fetchArticles = useCallback(async () => {
    const risk = selectedRiskRef.current;
    if (!risk) return;
    setLoadingKey("articles", true);
    setErrorKey("articles", null);
    try {
      const data = await postJson(`${import.meta.env.VITE_API_BASE_URL}/risk/intel/briefing/articles`, { risk, limit: 20, username, orgid });
      if (data && data.success !== false) {
        setArticlesData({ count: data.count, items: data.articles });
      } else {
        setErrorKey("articles", data?.message || "Failed to load articles.");
      }
    } catch (error) {
      setErrorKey("articles", error.message);
    }
    setLoadingKey("articles", false);
  }, [username, orgid]);

  const fetchVideos = useCallback(async () => {
    const risk = selectedRiskRef.current;
    if (!risk) return;
    setLoadingKey("videos", true);
    setErrorKey("videos", null);
    try {
      const data = await postJson(`${import.meta.env.VITE_API_BASE_URL}/risk/intel/briefing/videos`, { risk, limit: 15, username, orgid });
      if (data && data.success !== false) {
        setVideosData({ count: data.count, items: data.videos });
      } else {
        setErrorKey("videos", data?.message || "Failed to load videos.");
      }
    } catch (error) {
      setErrorKey("videos", error.message);
    }
    setLoadingKey("videos", false);
  }, [username, orgid]);

  const fetchImages = useCallback(async () => {
    const risk = selectedRiskRef.current;
    if (!risk) return;
    setLoadingKey("images", true);
    setErrorKey("images", null);
    try {
      const data = await postJson(`${import.meta.env.VITE_API_BASE_URL}/risk/intel/briefing/images`, { risk, limit: 12, username, orgid });
      if (data && data.success !== false) {
        setImagesData({ count: data.count, items: data.images });
      } else {
        setErrorKey("images", data?.message || "Failed to load images.");
      }
    } catch (error) {
      setErrorKey("images", error.message);
    }
    setLoadingKey("images", false);
  }, [username, orgid]);

  const fetchAcademic = useCallback(async () => {
    const risk = selectedRiskRef.current;
    if (!risk) return;
    setLoadingKey("academic", true);
    setErrorKey("academic", null);
    try {
      const data = await postJson(`${import.meta.env.VITE_API_BASE_URL}/risk/intel/briefing/academic`, { risk, limit: 10, username, orgid });
      if (data && data.success !== false) {
        setAcademicData({ count: data.count, items: data.papers });
      } else {
        setErrorKey("academic", data?.message || "Failed to load academic papers.");
      }
    } catch (error) {
      setErrorKey("academic", error.message);
    }
    setLoadingKey("academic", false);
  }, [username, orgid]);

  const fetchSocial = useCallback(async () => {
    const risk = selectedRiskRef.current;
    if (!risk) return;
    setLoadingKey("social", true);
    setErrorKey("social", null);
    try {
      const data = await postJson(`${import.meta.env.VITE_API_BASE_URL}/risk/intel/briefing/social`, { risk, limit: 10, username, orgid });
      if (data && data.success !== false) {
        setSocialData({ count: data.count, items: data.reddit });
      } else {
        setErrorKey("social", data?.message || "Failed to load social posts.");
      }
    } catch (error) {
      setErrorKey("social", error.message);
    }
    setLoadingKey("social", false);
  }, [username, orgid]);

  const fetchRelated = useCallback(async () => {
    const risk = selectedRiskRef.current;
    if (!risk) return;
    setLoadingKey("related", true);
    setErrorKey("related", null);
    try {
      const data = await postJson(`${import.meta.env.VITE_API_BASE_URL}/risk/intel/briefing/related`, { risk, limit: 20 });
      if (data && data.success !== false) {
        setRelatedData({ count: data.count, items: data.related });
      } else {
        setErrorKey("related", data?.message || "Failed to load related risks.");
      }
    } catch (error) {
      setErrorKey("related", error.message);
    }
    setLoadingKey("related", false);
  }, []);

  const fetchFullBriefing = useCallback(async () => {
    const risk = selectedRiskRef.current;
    if (!risk) return;
    setLoadingKey("full", true);
    try {
      const body = { risk, scope: scopeRef.current, username, orgid, viewport_bbox: viewportBbox || null };
      const data = await postJson(`${import.meta.env.VITE_API_BASE_URL}/risk/intel/briefing`, body);
      if (data && data.success !== false) {
        if (data.summary) setSummaryData(data.summary);
        if (data.media?.articles) setArticlesData({ count: data.media.articles.count, items: data.media.articles.items });
        if (data.media?.videos) setVideosData({ count: data.media.videos.count, items: data.media.videos.items });
        if (data.media?.images) setImagesData({ count: data.media.images.count, items: data.media.images.items });
        if (data.research?.academic_papers) setAcademicData({ count: data.research.academic_papers.count, items: data.research.academic_papers.items });
        if (data.social?.reddit) setSocialData({ count: data.social.reddit.count, items: data.social.reddit.items });
        if (data.related_risks) setRelatedData({ count: data.related_risks.count, items: data.related_risks.items });
        if (data.asset_context) setAssetContext(data.asset_context);
        if (data.briefing_id) setCurrentBriefingId(data.briefing_id);
      }
    } catch (error) {
      setErrorKey("summary", error.message);
    }
    setLoadingKey("full", false);
  }, [username, orgid, viewportBbox]);

  const fetchSourceBundle = useCallback(async (briefingId) => {
    if (!briefingId) return;
    setLoadingKey("sources", true);
    try {
      const data = await getJson(`${import.meta.env.VITE_API_BASE_URL}/risk/intel/briefing/${briefingId}/sources`);
      if (data && data.success !== false) {
        setSourceBundle(data.source_bundle);
      }
    } catch (error) {}
    setLoadingKey("sources", false);
  }, []);

  const fetchAllIntel = useCallback(() => {
    fetchSummary();
    fetchArticles();
    fetchVideos();
    fetchImages();
    fetchAcademic();
    fetchSocial();
    fetchRelated();
  }, [fetchSummary, fetchArticles, fetchVideos, fetchImages, fetchAcademic, fetchSocial, fetchRelated]);

  useEffect(() => {
    if (!riskId) {
      if (prevRiskIdRef.current) {
        resetIntelData();
        prevRiskIdRef.current = null;
      }
      return;
    }
    if (riskId !== prevRiskIdRef.current) {
      prevRiskIdRef.current = riskId;
      resetIntelData();
      setExpanded(true);
      setActiveTab("summary");
      setTimeout(() => fetchAllIntel(), 50);
    }
  }, [riskId, resetIntelData, fetchAllIntel]);

  useEffect(() => {
    if (featureId && featureId !== prevFeatureIdRef.current) {
      prevFeatureIdRef.current = featureId;
      setExpanded(true);
      setActiveTab("details");
    } else if (!featureId) {
      prevFeatureIdRef.current = null;
    }
  }, [featureId]);

  useEffect(() => {
    if (showSources && currentBriefingId && !sourceBundle && !loading.sources) {
      fetchSourceBundle(currentBriefingId);
    }
  }, [showSources, currentBriefingId, sourceBundle, loading.sources, fetchSourceBundle]);

  const handleScopeChange = useCallback((newScope) => {
    if (newScope === scope) return;
    setScope(newScope);
    scopeRef.current = newScope;
    if (selectedRiskRef.current) {
      resetIntelData();
      setTimeout(() => fetchAllIntel(), 50);
    }
  }, [scope, resetIntelData, fetchAllIntel]);

  const scrollGallery = useCallback((ref, dir) => {
    if (ref.current) {
      const amount = ref.current.clientWidth * 0.8;
      ref.current.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
    }
  }, []);

  const refreshTab = useCallback(() => {
    if (!selectedRiskRef.current) return;
    const tabFetchers = {
      summary: () => { setSummaryData(null); fetchSummary(); },
      articles: () => { setArticlesData(null); fetchArticles(); },
      videos: () => { setVideosData(null); fetchVideos(); },
      images: () => { setImagesData(null); fetchImages(); },
      academic: () => { setAcademicData(null); fetchAcademic(); },
      social: () => { setSocialData(null); fetchSocial(); },
      related: () => { setRelatedData(null); fetchRelated(); }
    };
    tabFetchers[activeTab]?.();
  }, [activeTab, fetchSummary, fetchArticles, fetchVideos, fetchImages, fetchAcademic, fetchSocial, fetchRelated]);

  const handleToggleSource = useCallback((sourceKey) => {
    if (!userSettings) return;
    const newEnabled = {
      ...userSettings.sources_enabled,
      [sourceKey]: !userSettings.sources_enabled[sourceKey]
    };
    setUserSettings({ ...userSettings, sources_enabled: newEnabled });
  }, [userSettings]);

  const handleSaveSettings = useCallback(async () => {
    if (!username || !userSettings) return;
    try {
      const body = {
        username,
        orgid,
        sources_enabled: userSettings.sources_enabled,
        default_scope: scope
      };
      const data = await postJson(`${import.meta.env.VITE_API_BASE_URL}/risk/intel/user-settings`, body);
      if (data && data.success !== false) {
        setUserSettings(data.settings);
        setSettingsModalOpen(false);
        if (selectedRiskRef.current) {
          resetIntelData();
          setTimeout(() => fetchAllIntel(), 50);
        }
      }
    } catch (error) {}
  }, [username, orgid, userSettings, scope, resetIntelData, fetchAllIntel]);

  const handleSubmitFeedback = useCallback(async () => {
    if (!feedbackReason && !feedbackComments) return;
    setFeedbackSubmitting(true);
    setFeedbackResult(null);
    try {
      const risk = selectedRiskRef.current;
      const body = {
        briefing_id: currentBriefingId,
        risk_id: risk ? resolveRiskId(risk) : null,
        orgid,
        username,
        flag_reason: feedbackReason || feedbackCategory,
        flag_category: feedbackCategory,
        comments: feedbackComments,
        summary_snapshot: summaryData,
        source_bundle_snapshot: sourceBundle
      };
      const data = await postJson(`${import.meta.env.VITE_API_BASE_URL}/risk/intel/briefing/feedback`, body);
      if (data && data.success !== false) {
        setFeedbackResult({ success: true, message: "Feedback recorded successfully." });
        setTimeout(() => {
          setFeedbackModalOpen(false);
          setFeedbackReason("");
          setFeedbackComments("");
          setFeedbackCategory(FLAG_CATEGORIES[0]);
          setFeedbackResult(null);
        }, 1500);
      } else {
        setFeedbackResult({ success: false, message: data?.message || "Submission failed." });
      }
    } catch (error) {
      setFeedbackResult({ success: false, message: error.message });
    }
    setFeedbackSubmitting(false);
  }, [currentBriefingId, orgid, username, feedbackReason, feedbackCategory, feedbackComments, summaryData, sourceBundle]);

  const handleCloseContext = (error) => {
    error.stopPropagation();
    if (activeContext === "risk") onCloseRisk?.();
    else if (activeContext === "feature") onCloseFeature?.();
    else onClose?.();
  };

  const tabCounts = useMemo(() => ({
    details: 1,
    summary: summaryData ? 1 : 0,
    articles: articlesData?.count || 0,
    videos: videosData?.count || 0,
    images: imagesData?.count || 0,
    academic: academicData?.count || 0,
    social: socialData?.count || 0,
    related: relatedData?.count || 0
  }), [summaryData, articlesData, videosData, imagesData, academicData, socialData, relatedData]);

  const visibleTabs = useMemo(() => {
    if (activeContext === "risk") return TAB_CONFIG;
    return [TAB_CONFIG.find(t => t.id === "details") || TAB_CONFIG[1]];
  }, [activeContext]);

  const confidenceLevel = summaryData?.confidence_level || summaryData?.source_confidence?.level || null;

  const renderLoading = (text) => (
    <div className="ibContentPanel">
      <div className="ibLoadingState">
        <FontAwesomeIcon icon={faSpinner} spin />
        <span>{text}</span>
      </div>
    </div>
  );

  const renderError = (msg) => (
    <div className="ibContentPanel">
      <div className="ibErrorState">
        <FontAwesomeIcon icon={faExclamationTriangle} />
        <span>{msg}</span>
      </div>
    </div>
  );

  const renderEmpty = (msg) => (
    <div className="ibContentPanel">
      <div className="ibEmptyState">
        <span>{msg}</span>
      </div>
    </div>
  );

  const renderRiskDetailsTab = () => {
    const risk = selectedRisk;
    if (!risk) return null;
    return (
      <div className="ibContentPanel">
        <div className="ibDetailsHScroll" ref={scrollRefs.details}>
          {riskEventExpired && (
            <div className="ibDetailsCard ibDetailsCardExpired">
              <div className="ibDetailsCardHeader">
                <div className="ibDetailsCardIcon ibDetailsCardIconExpired">
                  <FontAwesomeIcon icon={faExclamationCircle} />
                </div>
                <span className="ibDetailsCardTitle">Event Expired</span>
              </div>
              <div className="ibDetailsCardBody">
                <span className="ibDetailsCardText">This risk event has expired or been removed from active monitoring.</span>
                <div className="ibDetailsCardActions">
                  <button className="ibActionBtn" onClick={onDismissExpired}><FontAwesomeIcon icon={faTrash} /> Dismiss</button>
                  <button className="ibActionBtn" onClick={() => { onCloseRisk?.(); onRefreshRisk?.(); }}><FontAwesomeIcon icon={faRefresh} /> Refresh All</button>
                </div>
              </div>
            </div>
          )}
          <div className="ibDetailsCard ibDetailsCardOverview">
            <div className="ibDetailsCardHeader">
              <div className="ibDetailsCardIcon" style={{ backgroundColor: SEVERITY_COLORS[risk.severity] }}>
                <FontAwesomeIcon icon={getRiskIcon(risk.risk_category)} />
              </div>
              <span className="ibDetailsCardTitle">Overview</span>
              <span className="ibDetailsSeverityBadge" style={{ backgroundColor: SEVERITY_COLORS[risk.severity] }}>{risk.severity}</span>
              <span className="ibDetailsSeverityScore">Score: {risk.severity_score || 0}</span>
            </div>
            <div className="ibDetailsCardBody">
              <div className="ibDetailsCardTitleText">{risk.title}</div>
              <div className="ibDetailsCardMeta">{risk.risk_category} • {risk.source} • {formatRelativeTime(risk.event_time)}</div>
              {risk.description && <div className="ibDetailsCardDesc">{risk.description}</div>}
              <div className="ibDetailsCardActions">
                {risk.url && <a href={risk.url} target="_blank" rel="noopener noreferrer" className="ibActionBtn"><FontAwesomeIcon icon={faExternalLinkAlt} /> Source</a>}
                <button className="ibActionBtn" onClick={() => onAssessLocation?.(risk.latitude, risk.longitude, risk.impact_radius_km || 50)}><FontAwesomeIcon icon={faCrosshairs} /> Assess</button>
                {risk.latitude && risk.longitude && (
                  <button className="ibActionBtn" onClick={() => onOpenNearby?.(risk.latitude, risk.longitude)}><FontAwesomeIcon icon={faBullseye} /> Nearby</button>
                )}
              </div>
            </div>
          </div>
          <div className="ibDetailsCard">
            <div className="ibDetailsCardHeader">
              <div className="ibDetailsCardIcon ibDetailsCardIconLocation">
                <FontAwesomeIcon icon={faMapMarkerAlt} />
              </div>
              <span className="ibDetailsCardTitle">Location & Timing</span>
            </div>
            <div className="ibDetailsCardBody">
              <div className="ibDetailsGrid">
                {[
                  ["Event Time", formatRiskTime(risk.event_time)],
                  risk.updated_at && ["Last Update", formatRiskTime(risk.updated_at)],
                  risk.expires_at && ["Expires", formatRiskTime(risk.expires_at)],
                  risk.latitude && ["Latitude", `${risk.latitude.toFixed(6)}°`],
                  risk.longitude && ["Longitude", `${risk.longitude.toFixed(6)}°`],
                  risk.impact_radius_km && ["Impact Radius", `${risk.impact_radius_km} km`],
                  risk.geometry_type && ["Geometry", risk.geometry_type]
                ].filter(Boolean).map(([label, value], i) => (
                  <div key={i} className="ibDetailsGridItem">
                    <span className="ibDetailsGridLabel">{label}</span>
                    <span className="ibDetailsGridValue">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {risk.population_impact && (
            <div className="ibDetailsCard">
              <div className="ibDetailsCardHeader">
                <div className="ibDetailsCardIcon ibDetailsCardIconPop">
                  <FontAwesomeIcon icon={faPeopleGroup} />
                </div>
                <span className="ibDetailsCardTitle">Population Impact</span>
              </div>
              <div className="ibDetailsCardBody">
                <div className="ibDetailsGrid">
                  {[
                    risk.population_impact.density && ["Density", risk.population_impact.density.replace("_", " ").toUpperCase()],
                    risk.population_impact.estimated_population !== undefined && ["Est. Pop.", formatNumber(risk.population_impact.estimated_population)],
                    risk.population_impact.nearest_city && ["Nearest City", risk.population_impact.nearest_city],
                    risk.population_impact.distance_km && ["Distance", `${risk.population_impact.distance_km} km`]
                  ].filter(Boolean).map(([label, value], i) => (
                    <div key={i} className="ibDetailsGridItem">
                      <span className="ibDetailsGridLabel">{label}</span>
                      <span className="ibDetailsGridValue">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {risk.metadata && Object.keys(risk.metadata).length > 0 && (
            <div className="ibDetailsCard ibDetailsCardWide">
              <div className="ibDetailsCardHeader">
                <div className="ibDetailsCardIcon ibDetailsCardIconData">
                  <FontAwesomeIcon icon={faCubes} />
                </div>
                <span className="ibDetailsCardTitle">Detailed Data</span>
              </div>
              <div className="ibDetailsCardBody">
                <div className="ibDetailsGrid">
                  {Object.entries(risk.metadata).filter(([, v]) => v !== null && v !== undefined && v !== "" && typeof v !== "object").map(([k, v], i) => (
                    <div key={i} className="ibDetailsGridItem">
                      <span className="ibDetailsGridLabel">{k.replace(/_/g, " ")}</span>
                      <span className="ibDetailsGridValue">{String(v)}</span>
                    </div>
                  ))}
                  {Object.entries(risk.metadata).filter(([, v]) => v && typeof v === "object" && !Array.isArray(v)).map(([k, obj]) =>
                    Object.entries(obj).filter(([, v2]) => v2 !== null && v2 !== undefined && v2 !== "" && typeof v2 !== "object").map(([k2, v2], i) => (
                      <div key={`${k}-${i}`} className="ibDetailsGridItem">
                        <span className="ibDetailsGridLabel">{k2.replace(/_/g, " ")}</span>
                        <span className="ibDetailsGridValue">{String(v2)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
          {risk.golden_mesh_detection && Object.keys(risk.golden_mesh_detection).length > 0 && (
            <div className="ibDetailsCard ibDetailsCardWide">
              <div className="ibDetailsCardHeader">
                <div className="ibDetailsCardIcon ibDetailsCardIconMesh">
                  <FontAwesomeIcon icon={faShieldAlt} />
                </div>
                <span className="ibDetailsCardTitle">Golden Mesh Detection</span>
              </div>
              <div className="ibDetailsCardBody">
                <div className="ibDetailsGrid">
                  {Object.entries(risk.golden_mesh_detection).filter(([, v]) => v !== null && v !== undefined && v !== "" && typeof v !== "object").map(([k, v], i) => (
                    <div key={i} className="ibDetailsGridItem">
                      <span className="ibDetailsGridLabel">{k.replace(/_/g, " ")}</span>
                      <span className="ibDetailsGridValue">{String(v)}</span>
                    </div>
                  ))}
                  {Object.entries(risk.golden_mesh_detection).filter(([, v]) => v && typeof v === "object" && !Array.isArray(v)).map(([k, obj]) =>
                    Object.entries(obj).filter(([, v2]) => v2 !== null && v2 !== undefined && v2 !== "" && typeof v2 !== "object").map(([k2, v2], i) => (
                      <div key={`${k}-${i}`} className="ibDetailsGridItem">
                        <span className="ibDetailsGridLabel">{k2.replace(/_/g, " ")}</span>
                        <span className="ibDetailsGridValue">{String(v2)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
          {risk.recommendations?.length > 0 && (
            <div className="ibDetailsCard">
              <div className="ibDetailsCardHeader">
                <div className="ibDetailsCardIcon ibDetailsCardIconRec">
                  <FontAwesomeIcon icon={faKitMedical} />
                </div>
                <span className="ibDetailsCardTitle">Safety ({risk.recommendations.length})</span>
              </div>
              <div className="ibDetailsCardBody">
                <div className="ibRecommendationsList">
                  {risk.recommendations.map((rec, idx) => (
                    <div key={idx} className="ibRecommendationItem">
                      <span className="ibRecommendationNum">{String(idx + 1).padStart(2, "0")}</span>
                      <span>{rec}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div className="ibDetailsCard ibDetailsCardNarrow">
            <div className="ibDetailsCardHeader">
              <div className="ibDetailsCardIcon ibDetailsCardIconSrc">
                <FontAwesomeIcon icon={faLink} />
              </div>
              <span className="ibDetailsCardTitle">Source Info</span>
            </div>
            <div className="ibDetailsCardBody">
              <div className="ibDetailsGrid">
                {[
                  ["Source", risk.source],
                  risk.source_id && ["Source ID", risk.source_id],
                  ["Internal ID", risk.id]
                ].filter(Boolean).map(([label, value], i) => (
                  <div key={i} className="ibDetailsGridItem">
                    <span className="ibDetailsGridLabel">{label}</span>
                    <span className="ibDetailsGridValue">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderFeatureDetailsTab = () => {
    if (!selectedFeature || !featureMeasurements) return null;
    return (
      <div className="ibContentPanel">
        <div className="ibDetailsHScroll" ref={scrollRefs.details}>
          <div className="ibDetailsCard ibDetailsCardOverview">
            <div className="ibDetailsCardHeader">
              <div className="ibDetailsCardIcon" style={{ backgroundColor: "#00FFFF" }}>
                <FontAwesomeIcon icon={faObjectGroup} />
              </div>
              <span className="ibDetailsCardTitle">Feature</span>
            </div>
            <div className="ibDetailsCardBody">
              <div className="ibDetailsCardTitleText">{selectedFeature.name}</div>
              <div className="ibDetailsCardMeta">{selectedFeature.type} • OSM {selectedFeature.osmType}/{selectedFeature.id}</div>
              <div className="ibDetailsCardActions">
                <button className="ibActionBtn" onClick={onZoomToFeature}><FontAwesomeIcon icon={faLocationCrosshairs} /> Zoom</button>
                <button className="ibActionBtn" onClick={() => onAssessLocation?.(featureMeasurements.centroid.lat, featureMeasurements.centroid.lng, 50)}><FontAwesomeIcon icon={faCrosshairs} /> Assess</button>
                <button className="ibActionBtn" onClick={() => onOpenNearby?.(featureMeasurements.centroid.lat, featureMeasurements.centroid.lng)}><FontAwesomeIcon icon={faBullseye} /> Nearby</button>
              </div>
            </div>
          </div>
          <div className="ibDetailsCard">
            <div className="ibDetailsCardHeader">
              <div className="ibDetailsCardIcon ibDetailsCardIconData">
                <FontAwesomeIcon icon={faRuler} />
              </div>
              <span className="ibDetailsCardTitle">Measurements</span>
            </div>
            <div className="ibDetailsCardBody">
              <div className="ibDetailsGrid">
                {[
                  ["Area", formatArea(featureMeasurements.area)],
                  ["Perimeter", formatDistance(featureMeasurements.perimeter)],
                  ["Vertices", featureMeasurements.vertexCount],
                  ["Centroid Lat", `${featureMeasurements.centroid.lat.toFixed(6)}°`],
                  ["Centroid Lng", `${featureMeasurements.centroid.lng.toFixed(6)}°`]
                ].map(([l, v], i) => (
                  <div key={i} className="ibDetailsGridItem">
                    <span className="ibDetailsGridLabel">{l}</span>
                    <span className="ibDetailsGridValue">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {isFetchingDetails && (
            <div className="ibDetailsCard">
              <div className="ibDetailsCardBody">
                <div className="ibLoadingState"><FontAwesomeIcon icon={faSpinner} spin /><span>Fetching details…</span></div>
              </div>
            </div>
          )}
          {featureDetails?.address && (
            <div className="ibDetailsCard">
              <div className="ibDetailsCardHeader">
                <div className="ibDetailsCardIcon ibDetailsCardIconLocation">
                  <FontAwesomeIcon icon={faMapMarkerAlt} />
                </div>
                <span className="ibDetailsCardTitle">Address</span>
              </div>
              <div className="ibDetailsCardBody">
                <div className="ibDetailsGrid">
                  {[
                    featureDetails.address.street && ["Street", `${featureDetails.address.housenumber ? featureDetails.address.housenumber + " " : ""}${featureDetails.address.street}`],
                    featureDetails.address.city && ["City", featureDetails.address.city],
                    featureDetails.address.state && ["State", featureDetails.address.state],
                    featureDetails.address.country && ["Country", featureDetails.address.country]
                  ].filter(Boolean).map(([l, v], i) => (
                    <div key={i} className="ibDetailsGridItem">
                      <span className="ibDetailsGridLabel">{l}</span>
                      <span className="ibDetailsGridValue">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {featureDetails?.elevationInfo && (
            <div className="ibDetailsCard ibDetailsCardNarrow">
              <div className="ibDetailsCardHeader">
                <div className="ibDetailsCardIcon ibDetailsCardIconPop">
                  <FontAwesomeIcon icon={faMountain} />
                </div>
                <span className="ibDetailsCardTitle">Elevation</span>
              </div>
              <div className="ibDetailsCardBody">
                <div className="ibDetailsGrid">
                  <div className="ibDetailsGridItem ibDetailsGridItemFull">
                    <span className="ibDetailsGridLabel">Ground Elevation</span>
                    <span className="ibDetailsGridValue">{featureDetails.elevationInfo.groundElevation} m ({featureDetails.elevationInfo.elevationFeet} ft)</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderDetailsTab = () => {
    if (activeContext === "risk") return renderRiskDetailsTab();
    if (activeContext === "feature") return renderFeatureDetailsTab();
    return renderEmpty("No selection active.");
  };

  const renderSourceBundleGroup = (label, items, keyFn) => {
    if (!items || items.length === 0) return null;
    return (
      <div className="ibSourceBundleGroup">
        <div className="ibSourceBundleGroupHeader">
          <span className="ibSourceBundleGroupTitle">{label}</span>
          <span className="ibSourceBundleGroupCount">{items.length}</span>
        </div>
        {items.slice(0, 8).map((item, idx) => (
          <div key={idx} className="ibSourceBundleItem">
            <div className="ibSourceBundleItemTitle">
              {item.url ? <a href={item.url} target="_blank" rel="noopener noreferrer">{truncate(item.title || item.url, 90)}</a> : truncate(item.title || "Untitled", 90)}
            </div>
            <div className="ibSourceBundleItemMeta">
              {keyFn(item)}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderSourceBundleCard = () => {
    if (!showSources) return null;
    if (loading.sources) {
      return (
        <div className="ibSummaryCard ibSummaryCardSources">
          <div className="ibSummaryCardHeader">
            <div className="ibSummaryCardIcon ibSummaryCardIconSources">
              <FontAwesomeIcon icon={faDatabase} />
            </div>
            <span className="ibSummaryCardTitle">Source Bundle</span>
          </div>
          <div className="ibSummaryCardScrollable">
            <div className="ibLoadingState"><FontAwesomeIcon icon={faSpinner} spin /><span>Loading sources…</span></div>
          </div>
        </div>
      );
    }
    if (!sourceBundle) {
      return (
        <div className="ibSummaryCard ibSummaryCardSources">
          <div className="ibSummaryCardHeader">
            <div className="ibSummaryCardIcon ibSummaryCardIconSources">
              <FontAwesomeIcon icon={faDatabase} />
            </div>
            <span className="ibSummaryCardTitle">Source Bundle</span>
          </div>
          <div className="ibSummaryCardScrollable">
            <span className="ibSummaryText">Source bundle not yet available. Generate a full briefing to capture sources.</span>
          </div>
        </div>
      );
    }
    return (
      <div className="ibSummaryCard ibSummaryCardSources">
        <div className="ibSummaryCardHeader">
          <div className="ibSummaryCardIcon ibSummaryCardIconSources">
            <FontAwesomeIcon icon={faDatabase} />
          </div>
          <span className="ibSummaryCardTitle">Source Bundle</span>
          <div className="ibSummaryCardHeaderRight">
            <button className="ibIconButton" onClick={() => setShowSources(false)} title="Hide sources">
              <FontAwesomeIcon icon={faTimes} />
            </button>
          </div>
        </div>
        <div className="ibSummaryCardScrollable">
          <div className="ibSourceBundleSubtitle">
            Items that informed the AI summary. Each shows provider and per-source relevance.
          </div>
          {renderSourceBundleGroup("News Articles", sourceBundle.articles, item => (
            <>
              {item.source && <span>{truncate(item.source, 24)}</span>}
              {item.provider && <span>· {item.provider}</span>}
              {item.publishedAt && <span>· {formatRelativeTime(item.publishedAt)}</span>}
              {typeof item.relevance_score === "number" && (
                <span className={`ibSourceBundleScore ${getRelevanceColor(item.relevance_score).class}`}>
                  {item.relevance_score}/10
                </span>
              )}
            </>
          ))}
          {renderSourceBundleGroup("Videos", sourceBundle.videos, item => (
            <>
              {item.channelTitle && <span>{truncate(item.channelTitle, 24)}</span>}
              {item.publishedAt && <span>· {formatRelativeTime(item.publishedAt)}</span>}
              {item.viewCount > 0 && <span>· {formatNumber(item.viewCount)} views</span>}
              {typeof item.relevance_score === "number" && (
                <span className={`ibSourceBundleScore ${getRelevanceColor(item.relevance_score).class}`}>
                  {item.relevance_score}/10
                </span>
              )}
            </>
          ))}
          {renderSourceBundleGroup("Academic", sourceBundle.academic, item => (
            <>
              {item.year && <span>{item.year}</span>}
              {item.citationCount > 0 && <span>· {item.citationCount} cit.</span>}
              {item.provider && <span>· {item.provider}</span>}
            </>
          ))}
          {renderSourceBundleGroup("Reddit", sourceBundle.reddit, item => (
            <>
              {item.subreddit && <span>{item.subreddit}</span>}
              {item.score > 0 && <span>· ↑ {formatNumber(item.score)}</span>}
              {typeof item.relevance_score === "number" && (
                <span className={`ibSourceBundleScore ${getRelevanceColor(item.relevance_score).class}`}>
                  {item.relevance_score}/10
                </span>
              )}
            </>
          ))}
          {renderSourceBundleGroup("ReliefWeb", sourceBundle.reliefweb, item => (
            <>
              {item.source && <span>{truncate(item.source, 24)}</span>}
              {item.country && <span>· {item.country}</span>}
              {item.date && <span>· {formatRelativeTime(item.date)}</span>}
            </>
          ))}
          {renderSourceBundleGroup("Wikipedia", sourceBundle.wikipedia, item => (
            <>
              <span>encyclopedia</span>
              {item.provider && <span>· {item.provider}</span>}
            </>
          ))}
          {renderSourceBundleGroup("Google", sourceBundle.google_results, item => (
            <>
              {item.source && <span>{truncate(item.source, 24)}</span>}
              {item.provider && <span>· {item.provider}</span>}
            </>
          ))}
        </div>
      </div>
    );
  };

  const renderConfidenceCard = () => {
    const conf = summaryData?.source_confidence;
    const level = summaryData?.confidence_level || conf?.level || "LOW";
    const rationale = summaryData?.confidence_rationale;
    return (
      <div className="ibSummaryCard ibSummaryCardConfidence">
        <div className="ibSummaryCardHeader">
          <div className="ibSummaryCardIcon ibSummaryCardIconConfidence">
            <FontAwesomeIcon icon={faShieldAlt} />
          </div>
          <span className="ibSummaryCardTitle">Confidence</span>
        </div>
        <div className="ibSummaryCardScrollable">
          <div className="ibConfidenceHeadline">
            <span className={`ibConfidenceLevel ${getConfidenceClass(level)}`} style={{ color: level === "HIGH" ? "#4ECDC4" : level === "MEDIUM" ? "#FFE66D" : "#FF6B6B" }}>{level}</span>
            {conf?.score !== undefined && <span className="ibConfidenceScore">Score: {conf.score}</span>}
          </div>
          {rationale && (
            <div className="ibConfidenceRationale">{rationale}</div>
          )}
          {conf && conf.indicators && conf.indicators.length > 0 && (
            <div className="ibConfidenceIndicators">
              {conf.indicators.map((ind, i) => (
                <div key={i} className="ibConfidenceIndicator">
                  <FontAwesomeIcon icon={faCircleCheck} />
                  <span>{ind}</span>
                </div>
              ))}
            </div>
          )}
          {conf && (
            <div className="ibConfidenceMetricsGrid">
              <div className="ibConfidenceMetric">
                <span className="ibConfidenceMetricLabel">Tier 1</span>
                <span className="ibConfidenceMetricValue">{conf.tier_one_count}</span>
              </div>
              <div className="ibConfidenceMetric">
                <span className="ibConfidenceMetricLabel">Tier 2</span>
                <span className="ibConfidenceMetricValue">{conf.tier_two_count}</span>
              </div>
              <div className="ibConfidenceMetric">
                <span className="ibConfidenceMetricLabel">Distinct Sources</span>
                <span className="ibConfidenceMetricValue">{conf.distinct_source_count}</span>
              </div>
              <div className="ibConfidenceMetric">
                <span className="ibConfidenceMetricLabel">Academic</span>
                <span className="ibConfidenceMetricValue">{conf.academic_count}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderAssetContextCard = () => {
    if (scope !== "assets") return null;
    if (!assetContext || assetContext.count === 0) {
      return (
        <div className="ibSummaryCard ibSummaryCardAssets">
          <div className="ibSummaryCardHeader">
            <div className="ibSummaryCardIcon ibSummaryCardIconAssets">
              <FontAwesomeIcon icon={faBuilding} />
            </div>
            <span className="ibSummaryCardTitle">Org Assets</span>
          </div>
          <div className="ibSummaryCardScrollable">
            <span className="ibSummaryText">No registered assets within this risk's impact radius. Asset-scoped briefings cross-reference the risk against your org's asset registry to highlight operational exposure. Register assets in the Assets panel to see tailored impact analysis here.</span>
          </div>
        </div>
      );
    }
    return (
      <div className="ibSummaryCard ibSummaryCardAssets">
        <div className="ibSummaryCardHeader">
          <div className="ibSummaryCardIcon ibSummaryCardIconAssets">
            <FontAwesomeIcon icon={faBuilding} />
          </div>
          <span className="ibSummaryCardTitle">Org Assets ({assetContext.count})</span>
        </div>
        <div className="ibSummaryCardScrollable">
          <span className="ibSummaryText">Assets within the impact radius. Summary is biased toward these.</span>
          {assetContext.items.slice(0, 10).map((asset, i) => (
            <div key={i} className="ibAssetItem">
              <span className="ibAssetItemName">{asset.asset_name}</span>
              <div className="ibAssetItemMeta">
                {asset.asset_type && <span>{asset.asset_type}</span>}
                {asset.distance_km !== null && asset.distance_km !== undefined && <span>· {asset.distance_km} km</span>}
                {asset.criticality && <span className="ibAssetCriticality">{asset.criticality}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderSummaryTab = () => {
    if (loading.summary || loading.full) return renderLoading("Generating AI intelligence summary…");
    if (errors.summary) return renderError(errors.summary);
    if (!summaryData) return renderEmpty("No summary available.");

    return (
      <div className="ibContentPanel">
        <div className="ibSummaryScroll" ref={scrollRefs.summary}>
          <div className="ibSummaryGrid">
            <div className="ibSummaryCard ibSummaryCardMain">
              <div className="ibSummaryCardHeader">
                <div className="ibSummaryCardIcon" style={{ backgroundColor: SEVERITY_COLORS[selectedRisk?.severity] || "#FFE66D" }}>
                  <FontAwesomeIcon icon={faBrain} />
                </div>
                <span className="ibSummaryCardTitle">Intelligence Summary</span>
                <div className="ibSummaryCardHeaderRight">
                  <button className="ibIconButton" onClick={() => setSettingsModalOpen(true)} title="Source settings">
                    <FontAwesomeIcon icon={faSliders} />
                  </button>
                  <button className="ibIconButton" onClick={() => setShowSources(prev => !prev)} title="Show sources">
                    <FontAwesomeIcon icon={faDatabase} />
                  </button>
                  <button className="ibIconButton ibIconButtonWarn" onClick={() => setFeedbackModalOpen(true)} title="Flag this briefing">
                    <FontAwesomeIcon icon={faFlag} />
                  </button>
                </div>
              </div>
              <div className="ibSummaryCardScrollable">
                <div className="ibSummaryText">{summaryData.executive_summary}</div>
                {summaryData.key_findings && summaryData.key_findings.length > 0 && (
                  <div className="ibSummaryFindings">
                    <span className="ibSummarySubheading">Key Findings</span>
                    {summaryData.key_findings.map((finding, idx) => (
                      <div key={idx} className="ibSummaryFinding">
                        <FontAwesomeIcon icon={faCheckCircle} className="ibSummaryFindingIcon" />
                        <span>{finding}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {renderConfidenceCard()}
            {renderSourceBundleCard()}
            <div className="ibSummaryCard ibSummaryCardStats">
              <div className="ibSummaryCardHeader">
                <div className="ibSummaryCardIcon ibSummaryCardIconStats">
                  <FontAwesomeIcon icon={faChartBar} />
                </div>
                <span className="ibSummaryCardTitle">Risk Statistics</span>
              </div>
              <div className="ibSummaryCardScrollable">
                <div className="ibSummaryStatsGrid">
                  {summaryData.statistics && summaryData.statistics.map((stat, idx) => (
                    <div key={idx} className="ibSummaryStat">
                      <span className="ibSummaryStatValue">{stat.value}</span>
                      <span className="ibSummaryStatLabel">{stat.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="ibSummaryCard ibSummaryCardImpact">
              <div className="ibSummaryCardHeader">
                <div className="ibSummaryCardIcon ibSummaryCardIconImpact">
                  <FontAwesomeIcon icon={faShieldAlt} />
                </div>
                <span className="ibSummaryCardTitle">Impact Assessment</span>
              </div>
              <div className="ibSummaryCardScrollable">
                <div className="ibSummaryText">{summaryData.impact_assessment}</div>
                {summaryData.affected_areas && summaryData.affected_areas.length > 0 && (
                  <div className="ibSummaryAreas">
                    <span className="ibSummarySubheading">Affected Areas</span>
                    <div className="ibSummaryAreaTags">
                      {summaryData.affected_areas.map((area, idx) => (
                        <span key={idx} className="ibSummaryAreaTag">
                          <FontAwesomeIcon icon={faMapMarkerAlt} />
                          {area}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="ibSummaryCard ibSummaryCardRecommendations">
              <div className="ibSummaryCardHeader">
                <div className="ibSummaryCardIcon ibSummaryCardIconRec">
                  <FontAwesomeIcon icon={faInfoCircle} />
                </div>
                <span className="ibSummaryCardTitle">Recommendations</span>
              </div>
              <div className="ibSummaryCardScrollable">
                {summaryData.recommendations && summaryData.recommendations.length > 0 && (
                  <div className="ibSummaryRecList">
                    {summaryData.recommendations.map((rec, idx) => (
                      <div key={idx} className="ibSummaryRec">
                        <span className="ibSummaryRecNum">{String(idx + 1).padStart(2, "0")}</span>
                        <span>{rec}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {summaryData.timeline && summaryData.timeline.length > 0 && (
              <div className="ibSummaryCard ibSummaryCardTimeline">
                <div className="ibSummaryCardHeader">
                  <div className="ibSummaryCardIcon ibSummaryCardIconTimeline">
                    <FontAwesomeIcon icon={faClock} />
                  </div>
                  <span className="ibSummaryCardTitle">Event Timeline</span>
                </div>
                <div className="ibSummaryCardScrollable">
                  <div className="ibSummaryTimeline">
                    {summaryData.timeline.map((entry, idx) => (
                      <div key={idx} className="ibSummaryTimelineEntry">
                        <div className="ibSummaryTimelineDot" />
                        <div className="ibSummaryTimelineContent">
                          <span className="ibSummaryTimelineTime">{entry.time}</span>
                          <span className="ibSummaryTimelineDesc">{entry.description}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderArticlesTab = () => {
    if (loading.articles) return renderLoading("Loading news articles…");
    if (errors.articles) return renderError(errors.articles);
    if (!articlesData?.items?.length) return renderEmpty("No articles found for this risk event.");

    return (
      <div className="ibContentPanel">
        <div className="ibGalleryScroll" ref={scrollRefs.articles}>
          {articlesData.items.map((a, i) => (
            <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className="ibCard ibCardArticle">
              {a.image_url && (
                <div className="ibCardImage">
                  <img src={a.image_url} alt="" loading="lazy" onError={error => { error.target.parentElement.style.display = "none"; }} />
                </div>
              )}
              <div className="ibCardBody">
                <div className="ibCardTitle">{truncate(a.title, 90)}</div>
                <div className="ibCardChannel">{a.source?.name || "Unknown"}{a.publishedAt ? ` • ${formatRelativeTime(a.publishedAt)}` : ""}</div>
                <div className="ibCardMetaTags">
                  {a._relevance_score !== undefined && (
                    <span className={`ibCardRelevanceBadge ${getRelevanceColor(a._relevance_score).class}`}>
                      {a._relevance_score >= 7 ? "High" : a._relevance_score >= 4 ? "Med" : "Low"}
                    </span>
                  )}
                  {a.provider && <span className="ibCardTag">{a.provider}</span>}
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>
    );
  };

  const renderVideosTab = () => {
    if (loading.videos) return renderLoading("Loading videos…");
    if (errors.videos) return renderError(errors.videos);
    if (!videosData?.items?.length) return renderEmpty("No videos found for this risk event.");

    return (
      <div className="ibContentPanel">
        <div className="ibGalleryScroll" ref={scrollRefs.videos}>
          {videosData.items.map((v, i) => (
            <a key={i} href={v.url} target="_blank" rel="noopener noreferrer" className="ibCard ibCardVideo">
              <div className="ibCardThumb">
                {v.thumbnail_url && <img src={v.thumbnail_url} alt="" loading="lazy" />}
                <div className="ibCardPlayOverlay"><FontAwesomeIcon icon={faPlay} /></div>
                {v.duration && <span className="ibCardDuration">{v.duration}</span>}
              </div>
              <div className="ibCardBody">
                <div className="ibCardTitle">{truncate(v.title, 80)}</div>
                <div className="ibCardChannel">{v.channelTitle}</div>
                <div className="ibCardStats">
                  <span><FontAwesomeIcon icon={faEye} /> {formatNumber(v.viewCount)}</span>
                  {v.publishedAt && <span>{formatRelativeTime(v.publishedAt)}</span>}
                  {v._relevance_score !== undefined && (
                    <span className={`ibCardRelevanceBadge ${getRelevanceColor(v._relevance_score).class}`}>
                      {v._relevance_score >= 7 ? "Verified" : v._relevance_score >= 4 ? "Likely" : "Unverified"}
                    </span>
                  )}
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>
    );
  };

  const renderImagesTab = () => {
    if (loading.images) return renderLoading("Loading images…");
    if (errors.images) return renderError(errors.images);
    if (!imagesData?.items?.length) return renderEmpty("No images found for this risk event.");

    return (
      <div className="ibContentPanel">
        <div className="ibImageGrid" ref={scrollRefs.images}>
          {imagesData.items.map((img, i) => (
            <div key={i} className="ibImageCard" onClick={() => setImageViewerIdx(i)}>
              <img src={img.thumbnail_url || img.url} alt={img.title || ""} loading="lazy" onError={error => { error.target.src = ""; error.target.parentElement.style.display = "none"; }} />
              <div className="ibImageOverlay">
                <span className="ibImageTitle">{truncate(img.title, 60)}</span>
                {img.source && <span className="ibImageSource">{img.source}</span>}
              </div>
            </div>
          ))}
        </div>
        {imageViewerIdx !== null && imagesData.items[imageViewerIdx] && (
          <div className="ibImageViewer" onClick={() => setImageViewerIdx(null)}>
            <div className="ibImageViewerContent" onClick={error => error.stopPropagation()}>
              <button className="ibImageViewerClose" onClick={() => setImageViewerIdx(null)}><FontAwesomeIcon icon={faTimes} /></button>
              <button className="ibImageViewerPrev" onClick={() => setImageViewerIdx(Math.max(0, imageViewerIdx - 1))} disabled={imageViewerIdx === 0}><FontAwesomeIcon icon={faChevronLeft} /></button>
              <img src={imagesData.items[imageViewerIdx].url} alt="" />
              <button className="ibImageViewerNext" onClick={() => setImageViewerIdx(Math.min(imagesData.items.length - 1, imageViewerIdx + 1))} disabled={imageViewerIdx === imagesData.items.length - 1}><FontAwesomeIcon icon={faChevronRight} /></button>
              <div className="ibImageViewerCaption">
                <span>{imagesData.items[imageViewerIdx].title}</span>
                {imagesData.items[imageViewerIdx].context_url && (
                  <a href={imagesData.items[imageViewerIdx].context_url} target="_blank" rel="noopener noreferrer"><FontAwesomeIcon icon={faExternalLinkAlt} /> Source</a>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderAcademicTab = () => {
    if (loading.academic) return renderLoading("Loading academic papers…");
    if (errors.academic) return renderError(errors.academic);
    if (!academicData?.items?.length) return renderEmpty("No academic papers found for this risk event.");

    return (
      <div className="ibContentPanel">
        <div className="ibGalleryScroll" ref={scrollRefs.academic}>
          {academicData.items.map((p, i) => (
            <div key={i} className="ibCard ibCardAcademic">
              <div className="ibCardTitle">{truncate(p.title, 120)}</div>
              {p.authors?.length > 0 && <div className="ibCardAuthors">{truncate(p.authors.join(", "), 80)}</div>}
              {p.abstract && <div className="ibCardDesc">{truncate(p.abstract, 150)}</div>}
              <div className="ibCardMetaTags">
                {p.year && <span className="ibCardTag">{p.year}</span>}
                {p.citationCount > 0 && <span className="ibCardTag ibCardTagHighlight">{formatNumber(p.citationCount)} cit.</span>}
                {p.doi && <span className="ibCardTag">DOI</span>}
                {p.url && <a href={p.url} target="_blank" rel="noopener noreferrer" className="ibCardTag ibCardTagLink" onClick={error => error.stopPropagation()}><FontAwesomeIcon icon={faExternalLinkAlt} /> View Paper</a>}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderSocialTab = () => {
    if (loading.social) return renderLoading("Loading social media…");
    if (errors.social) return renderError(errors.social);
    if (!socialData?.items?.length) return renderEmpty("No social media posts found for this risk event.");

    return (
      <div className="ibContentPanel">
        <div className="ibGalleryScroll" ref={scrollRefs.social}>
          {socialData.items.map((p, i) => (
            <a key={i} href={p.url} target="_blank" rel="noopener noreferrer" className="ibCard ibCardSocial">
              <div className="ibCardBody">
                <div className="ibCardMetaRow">
                  <span className="ibCardSource">{p.subreddit}</span>
                  <span className="ibCardTime">u/{p.author}</span>
                </div>
                <div className="ibCardTitle">{truncate(p.title, 100)}</div>
                {p.selftext_excerpt && <div className="ibCardDesc">{truncate(p.selftext_excerpt, 140)}</div>}
                <div className="ibCardMetaTags">
                  <span className="ibCardTag ibCardTagHighlight">↑ {formatNumber(p.score)}</span>
                  <span className="ibCardTag"><FontAwesomeIcon icon={faComment} /> {formatNumber(p.num_comments)}</span>
                  {p.created_utc && <span className="ibCardTag">{formatRelativeTime(p.created_utc)}</span>}
                  {p._relevance_score !== undefined && (
                    <span className={`ibCardRelevanceBadge ${getRelevanceColor(p._relevance_score).class}`}>
                      {p._relevance_score >= 7 ? "Relevant" : p._relevance_score >= 4 ? "Maybe" : "Off-topic"}
                    </span>
                  )}
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>
    );
  };

  const renderRelatedTab = () => {
    if (loading.related) return renderLoading("Loading related risks…");
    if (errors.related) return renderError(errors.related);
    if (!relatedData?.items?.length) return renderEmpty("No related risks found in the vicinity.");

    return (
      <div className="ibContentPanel">
        <div className="ibGalleryScroll" ref={scrollRefs.related}>
          {relatedData.items.map((r, i) => (
            <div key={i} className="ibCard ibCardRelated" onClick={() => onNavigateToRisk?.(r)}>
              <div className="ibRelatedHeader">
                <div className="ibRelatedIconBadge" style={{ color: SEVERITY_COLORS[r.severity] || "#FFE66D" }}>
                  <FontAwesomeIcon icon={getRiskIcon(r.risk_category)} />
                </div>
                <div className="ibRelatedHeaderRight">
                  <span className="ibRelatedSeverityBadge" style={{ color: SEVERITY_COLORS[r.severity] || "#FFE66D" }}>{r.severity}</span>
                  {r.event_time && <span className="ibCardTime">{formatRelativeTime(r.event_time)}</span>}
                </div>
              </div>
              <div className="ibCardTitle">{truncate(r.title, 90)}</div>
              <div className="ibCardMetaTags">
                <span className="ibCardTag">{r.risk_category}</span>
                <span className="ibCardTag">{r.source}</span>
                {r.distance_km !== undefined && r.distance_km !== null && <span className="ibCardTag ibCardTagHighlight">{r.distance_km} km</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const TAB_RENDERERS = {
    details: renderDetailsTab,
    summary: renderSummaryTab,
    articles: renderArticlesTab,
    videos: renderVideosTab,
    images: renderImagesTab,
    academic: renderAcademicTab,
    social: renderSocialTab,
    related: renderRelatedTab
  };

  const getHandleTitle = () => {
    if (activeContext === "risk" && selectedRisk) return truncate(selectedRisk.title, 80);
    if (activeContext === "feature" && selectedFeature) return selectedFeature.name;
    return "Selection";
  };

  const getHandleMeta = () => {
    if (activeContext === "risk" && selectedRisk) {
      return (
        <span className="ibRiskMeta">
          <span className="ibRiskSeverity" style={{ color: SEVERITY_COLORS[selectedRisk.severity] || "#FFE66D" }}>{selectedRisk.severity}</span>
          <span className="ibRiskSep">•</span>
          <span>{selectedRisk.risk_category}</span>
          <span className="ibRiskSep">•</span>
          <span>{selectedRisk.source}</span>
          {selectedRisk.event_time && (
            <>
              <span className="ibRiskSep">•</span>
              <span>{formatRelativeTime(selectedRisk.event_time)}</span>
            </>
          )}
        </span>
      );
    }
    if (activeContext === "feature" && selectedFeature) {
      return (
        <span className="ibRiskMeta">
          <span>{selectedFeature.type}</span>
          <span className="ibRiskSep">•</span>
          <span>OSM {selectedFeature.osmType}/{selectedFeature.id}</span>
        </span>
      );
    }
    return null;
  };

  const getHandleIcon = () => {
    if (activeContext === "risk" && selectedRisk) return getRiskIcon(selectedRisk.risk_category);
    if (activeContext === "feature") return faObjectGroup;
    return faInfoCircle;
  };

  const getHandleBadgeColor = () => {
    if (activeContext === "risk" && selectedRisk) return SEVERITY_COLORS[selectedRisk.severity] || "#FFE66D";
    if (activeContext === "feature") return "#00FFFF";
    return "#607D8B";
  };

  if (!hasContent) return null;

  return (
    <div className={`ibWrapper ${expanded ? "ibExpanded" : "ibCollapsed"}`}>
      <div className="ibHandle" onClick={() => setExpanded(!expanded)}>
        <div className="ibHandleLeft">
          <div className="ibRiskBadge" style={{ backgroundColor: getHandleBadgeColor() }}>
            <FontAwesomeIcon icon={getHandleIcon()} />
          </div>
          <div className="ibRiskInfo">
            <span className="ibRiskTitle">{getHandleTitle()}</span>
            {getHandleMeta()}
          </div>
        </div>
        <div className="ibHandleRight">
          {activeContext === "risk" && confidenceLevel && (
            <span className={`ibHandleConfidence ${getConfidenceClass(confidenceLevel)}`} title="AI confidence level">
              <FontAwesomeIcon icon={faShieldAlt} />
              {confidenceLevel}
            </span>
          )}
          {activeContext === "risk" && (
            <button className="ibIconButton" onClick={error => { error.stopPropagation(); refreshTab(); }} title="Refresh current tab">
              <FontAwesomeIcon icon={faSyncAlt} spin={!!loading[activeTab]} />
            </button>
          )}
          <FontAwesomeIcon icon={expanded ? faChevronDown : faChevronUp} className="ibToggleIcon" />
          <button className="ibIconButton ibIconButtonDanger" onClick={handleCloseContext} title="Close">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="ibBody">
          <div className="ibTabBar">
            {visibleTabs.map(tab => (
              <button
                key={tab.id}
                className={`ibTab ${activeTab === tab.id ? "ibTabActive" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <FontAwesomeIcon icon={tab.icon} />
                <span className="ibTabLabel">{tab.label}</span>
                {tab.id !== "details" && tabCounts[tab.id] > 0 && <span className="ibTabCount">{tabCounts[tab.id]}</span>}
                {loading[tab.id] && <FontAwesomeIcon icon={faSpinner} spin className="ibTabSpinner" />}
              </button>
            ))}
          </div>
          <div className="ibContentArea">
            {TAB_RENDERERS[activeTab]?.()}
          </div>
        </div>
      )}
      {settingsModalOpen && (
        <div className="ibModalOverlay" onClick={() => setSettingsModalOpen(false)}>
          <div className="ibModal" onClick={error => error.stopPropagation()}>
            <div className="ibModalHeader">
              <span className="ibModalTitle">
                <FontAwesomeIcon icon={faSliders} />
                Source Toggles & Defaults
              </span>
              <button className="ibIconButton ibIconButtonDanger" onClick={() => setSettingsModalOpen(false)}>
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            <div className="ibModalBody">
              <div>
                <span className="ibModalLabel">Default Scope</span>
                <select className="ibModalSelect" value={scope} onChange={error => setScope(error.target.value)}>
                  <option value="viewport">Viewport (everything happening here)</option>
                  <option value="assets">My Assets (bias toward our operations)</option>
                </select>
              </div>
              <div>
                <span className="ibModalLabel">Source Providers</span>
                <div className="ibModalSettingsList">
                  {Object.keys(SOURCE_LABELS).map(key => {
                    const enabled = userSettings?.sources_enabled?.[key] !== false;
                    return (
                      <div key={key} className="ibSettingsRow">
                        <div className="ibSettingsRowInfo">
                          <span className="ibSettingsRowName">{SOURCE_LABELS[key].name}</span>
                          <span className="ibSettingsRowDesc">{SOURCE_LABELS[key].description}</span>
                        </div>
                        <div
                          className={`ibToggleSwitch ${enabled ? "ibToggleSwitchOn" : ""}`}
                          onClick={() => handleToggleSource(key)}
                          role="switch"
                          aria-checked={enabled}
                        >
                          <div className="ibToggleKnob" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="ibModalFooter">
              <button className="ibActionBtn" onClick={() => setSettingsModalOpen(false)}>
                <FontAwesomeIcon icon={faTimes} /> Cancel
              </button>
              <button className="ibActionBtn ibActionBtnPrimary" onClick={handleSaveSettings}>
                <FontAwesomeIcon icon={faSave} /> Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
      {feedbackModalOpen && (
        <div className="ibModalOverlay" onClick={() => setFeedbackModalOpen(false)}>
          <div className="ibModal" onClick={error => error.stopPropagation()}>
            <div className="ibModalHeader">
              <span className="ibModalTitle">
                <FontAwesomeIcon icon={faFlag} />
                Flag This Briefing
              </span>
              <button className="ibIconButton ibIconButtonDanger" onClick={() => setFeedbackModalOpen(false)}>
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            <div className="ibModalBody">
              <div>
                <span className="ibModalLabel">Category</span>
                <select className="ibModalSelect" value={feedbackCategory} onChange={error => setFeedbackCategory(error.target.value)}>
                  {FLAG_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <span className="ibModalLabel">Reason</span>
                <input className="ibModalInput" placeholder="One-line summary" value={feedbackReason} onChange={error => setFeedbackReason(error.target.value)} />
              </div>
              <div>
                <span className="ibModalLabel">Details</span>
                <textarea className="ibModalTextarea" placeholder="What went wrong? The source bundle is captured automatically for audit." value={feedbackComments} onChange={error => setFeedbackComments(error.target.value)} />
              </div>
              {feedbackResult && (
                <div className={feedbackResult.success ? "ibConfidenceIndicator" : "ibErrorState"}>
                  <FontAwesomeIcon icon={feedbackResult.success ? faCircleCheck : faExclamationTriangle} />
                  <span>{feedbackResult.message}</span>
                </div>
              )}
            </div>
            <div className="ibModalFooter">
              <button className="ibActionBtn" onClick={() => setFeedbackModalOpen(false)} disabled={feedbackSubmitting}>
                <FontAwesomeIcon icon={faTimes} /> Cancel
              </button>
              <button className="ibActionBtn ibActionBtnPrimary" onClick={handleSubmitFeedback} disabled={feedbackSubmitting || (!feedbackReason && !feedbackComments)}>
                <FontAwesomeIcon icon={feedbackSubmitting ? faSpinner : faPaperPlane} spin={feedbackSubmitting} />
                Submit Feedback
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}