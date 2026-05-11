const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const { pool } = require("../../config/db");


const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const CURRENT_LOG_LEVEL = LOG_LEVELS[process.env.INTEL_LOG_LEVEL || "DEBUG"] ?? LOG_LEVELS.DEBUG;


const SEARCH_TIMEOUT_MS = 15000;
const CACHE_TTL_MS = 30 * 60 * 1000;
const RELEVANCE_THRESHOLD = 5;
const IMAGE_RELEVANCE_THRESHOLD = 3;


const MAX_ARTICLES = 20;
const MAX_VIDEOS = 15;
const MAX_IMAGES = 12;
const MAX_ACADEMIC = 10;
const MAX_SOCIAL = 10;


const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";


const BRIEFING_CACHE = new Map();
const SEARCH_CACHE = new Map();
const RISK_OBJECT_CACHE = new Map();


const TIER_ONE_SOURCES = ["reuters", "associated press", "ap news", "bbc", "nytimes", "washington post", "guardian", "al jazeera", "afp"];
const TIER_TWO_SOURCES = ["cnn", "nbc", "abc", "cbs", "npr", "pbs", "dw", "france24"];
const VERIFIED_VIDEO_CHANNELS = ["bbc", "cnn", "reuters", "al jazeera", "associated press", "guardian", "nbc", "abc", "cbs"];

const ACADEMIC_TERM_MAP = {
    "seismic": "seismology earthquake engineering",
    "earthquake": "seismology earthquake engineering",
    "wildfire": "wildfire fire science combustion",
    "flood": "hydrology flood risk fluvial",
    "weather": "meteorology atmospheric science",
    "tornado": "severe weather tornado mesocyclone",
    "hurricane": "tropical cyclone hurricane",
    "volcanic": "volcanology eruption",
    "air quality": "air pollution atmospheric particulate matter",
    "ground deformation": "ground deformation InSAR geodesy",
    "space": "space weather geomagnetic"
};


const generateId = (prefix) => `${prefix}_${crypto.randomBytes(12).toString("hex")}`;

const log = (level, context, message, meta = {}) => {
    if (LOG_LEVELS[level] < CURRENT_LOG_LEVEL) return;
    const prefix = `[INTEL ${level}]`;
    const metaOutput = Object.keys(meta).length ? meta : "";
    const formatted = `${prefix} [${context}] ${message}`;
    if (level === "ERROR") {
        process.stderr.write(formatted + (metaOutput ? " " + JSON.stringify(metaOutput) : "") + "\n");
    } else if (level === "WARN") {
        process.stderr.write(formatted + (metaOutput ? " " + JSON.stringify(metaOutput) : "") + "\n");
    } else {
        process.stdout.write(formatted + (metaOutput ? " " + JSON.stringify(metaOutput) : "") + "\n");
    }
};

const logError = (context, error) => {
    log("ERROR", context, error.message, {
        stack: error.stack?.split("\n").slice(0, 3).join(" | "),
        cause_code: error.cause?.code,
        cause_msg: error.cause?.message,
        name: error.name
    });
};

const timer = (label) => {
    const start = Date.now();
    return {
        elapsed: () => Date.now() - start,
        done: (meta = {}) => {
            const ms = Date.now() - start;
            log("DEBUG", "TIMER", `${label} completed in ${ms}ms.`, { duration_ms: ms, ...meta });
            return ms;
        },
        warn: (thresholdMs, meta = {}) => {
            const ms = Date.now() - start;
            if (ms > thresholdMs) {
                log("WARN", "SLOW", `${label} took ${ms}ms (threshold: ${thresholdMs}ms).`, { duration_ms: ms, threshold_ms: thresholdMs, ...meta });
            }
            return ms;
        }
    };
};

const sanitize = (s, maxLen) => {
    if (!s) return "";
    return s.replace(/[^\w\s.,!?;:'"()\-\/]/g, " ").trim().substring(0, maxLen || 500);
};

const cleanQueryText = (text) => {
    return text
        .replace(/[:;""''«»()\[\]{}<>,]/g, " ")
        .replace(/\bAT\b/gi, "")
        .replace(/\bNEAR\b/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();
};


const getCached = (store, key, ttl) => {
    const entry = store.get(key);
    if (!entry) {
        log("DEBUG", "CACHE", `Miss: ${key.substring(0, 80)}.`);
        return null;
    }
    const age = Date.now() - entry.ts;
    if (age < (ttl || CACHE_TTL_MS)) {
        log("DEBUG", "CACHE", `Hit: ${key.substring(0, 80)} (age: ${Math.round(age / 1000)}s).`);
        return entry.data;
    }
    log("DEBUG", "CACHE", `Expired: ${key.substring(0, 80)} (age: ${Math.round(age / 1000)}s, ttl: ${Math.round((ttl || CACHE_TTL_MS) / 1000)}s).`);
    store.delete(key);
    return null;
};

const setCache = (store, key, data) => {
    store.set(key, { data: data, ts: Date.now() });
    log("DEBUG", "CACHE", `Set: ${key.substring(0, 80)} (store size: ${store.size}).`);
};


const fetchWithTimeout = async (url, opts = {}, ms = SEARCH_TIMEOUT_MS) => {
    const startTime = Date.now();
    const parsedUrl = new URL(url);
    const host = parsedUrl.hostname;
    const path = parsedUrl.pathname.substring(0, 60);
    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => {
        log("WARN", "FETCH_TIMEOUT", `Request to ${host}${path} aborted after ${ms}ms.`, { url: url.substring(0, 200), timeout_ms: ms });
        abortController.abort();
    }, ms);
    try {
        log("DEBUG", "FETCH", `→ ${opts.method || "GET"} ${host}${path}.`, { timeout_ms: ms });
        const response = await fetch(url, { ...opts, signal: abortController.signal });
        clearTimeout(timeoutHandle);
        const elapsed = Date.now() - startTime;
        log("DEBUG", "FETCH", `← ${response.status} ${host}${path} in ${elapsed}ms.`, { status: response.status, duration_ms: elapsed });
        if (elapsed > 5000) {
            log("WARN", "SLOW_FETCH", `${host}${path} took ${elapsed}ms.`, { status: response.status, duration_ms: elapsed });
        }
        return response;
    } catch (error) {
        clearTimeout(timeoutHandle);
        const elapsed = Date.now() - startTime;
        log("ERROR", "FETCH_FAIL", `${host}${path} failed after ${elapsed}ms: ${error.name} - ${error.message}.`, {
            duration_ms: elapsed,
            error_name: error.name,
            is_abort: error.name === "AbortError",
            url: url.substring(0, 200)
        });
        throw error;
    }
};

const fetchWithRetry = async (url, opts = {}, timeoutMs = SEARCH_TIMEOUT_MS, maxRetries = 2) => {
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetchWithTimeout(url, opts, timeoutMs);
            if (response.status === 429 && attempt < maxRetries) {
                const retryAfter = parseInt(response.headers.get("retry-after") || "0", 10);
                const backoffMs = Math.max(retryAfter * 1000, (attempt + 1) * 1500);
                log("WARN", "RETRY", `Received 429 from ${new URL(url).hostname}, retrying in ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries}).`, { url: url.substring(0, 120) });
                await new Promise(resolve => setTimeout(resolve, backoffMs));
                continue;
            }
            return response;
        } catch (error) {
            lastError = error;
            if (error.name === "AbortError") {
                throw error;
            }
            if (attempt < maxRetries) {
                const backoffMs = (attempt + 1) * 2000;
                log("WARN", "RETRY", `Error from ${new URL(url).hostname}, retrying in ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries}).`, { url: url.substring(0, 120) });
                await new Promise(resolve => setTimeout(resolve, backoffMs));
                continue;
            }
            throw error;
        }
    }
    throw lastError;
};


const isDateRelevant = (itemDateStr, risk, maxDaysBefore = 14, maxDaysAfter = 7) => {
    if (!itemDateStr) return true;
    try {
        const itemDate = new Date(itemDateStr);
        if (isNaN(itemDate.getTime())) return true;
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        if (itemDate < sixMonthsAgo) return false;
        const eventDate = risk.event_time ? new Date(risk.event_time) : new Date();
        const diffMs = itemDate.getTime() - eventDate.getTime();
        const diffDays = diffMs / 864e5;
        return diffDays >= -maxDaysBefore && diffDays <= maxDaysAfter;
    } catch {
        return true;
    }
};

const extractDateRange = (risk) => {
    const eventTime = risk.event_time ? new Date(risk.event_time) : new Date();
    const from = new Date(eventTime);
    from.setDate(from.getDate() - 14);
    const to = new Date(eventTime);
    to.setDate(to.getDate() + 14);
    return {
        from: from.toISOString().split("T")[0],
        to: to.toISOString().split("T")[0],
        event_date: eventTime.toISOString().split("T")[0]
    };
};


const extractLocation = (risk) => {
    if (risk._resolved_location) return risk._resolved_location;

    const meta = risk.metadata || {};
    const explicit = meta.place || meta.region || meta.city || meta.country || meta.station_name || meta.basin || meta.location || meta.area || "";
    if (explicit) {
        const cleaned = explicit.split(/[;,]/).map(s => s.trim()).filter(Boolean)[0] || explicit;
        if (cleaned.length <= 60) return cleaned;
        return cleaned.substring(0, 60);
    }
    const affected = meta.affected_areas || "";
    if (affected) {
        const first = affected.split(/[;,]/).map(s => s.trim()).filter(Boolean)[0] || "";
        if (first.length >= 2 && first.length <= 60) return first;
    }

    const title = risk.title || "";
    const colonIdx = title.lastIndexOf(":");
    if (colonIdx > 0) {
        const afterColon = title.substring(colonIdx + 1).trim();
        if (afterColon.length >= 2 && afterColon.length <= 60) return afterColon;
    }
    const dashIdx = title.lastIndexOf(" - ");
    if (dashIdx > 0) {
        const afterDash = title.substring(dashIdx + 3).trim();
        if (afterDash.length >= 2 && afterDash.length <= 60) return afterDash;
    }

    return "";
};

const reverseGeocode = async (lat, lng) => {
    const cacheKey = `geocode_${lat.toFixed(3)}_${lng.toFixed(3)}`;
    const cached = getCached(SEARCH_CACHE, cacheKey, CACHE_TTL_MS * 48);
    if (cached) return cached;
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10&accept-language=en`;
        const response = await fetchWithTimeout(url, { headers: { "User-Agent": "RiskIntelligence/2.0" } }, 5000);
        if (!response.ok) return null;
        const data = await response.json();
        const addr = data.address || {};
        const city = addr.city || addr.town || addr.village || addr.hamlet || addr.county || "";
        const state = addr.state || "";
        const country = addr.country || "";
        const parts = [city, state, country].filter(Boolean);
        const location = parts.join(", ");
        if (location) setCache(SEARCH_CACHE, cacheKey, location);
        log("INFO", "GEOCODE", `Resolved ${lat},${lng} to "${location}".`);
        return location || null;
    } catch (error) {
        logError("GEOCODE", error);
        return null;
    }
};


const buildSearchQuery = (risk, variant) => {
    const cat = risk.risk_category || "";
    const loc = extractLocation(risk);
    const catLower = cat.toLowerCase();

    const academicSuffix = ACADEMIC_TERM_MAP[catLower] || `${cat} scientific study`;

    const queryVariants = {
        news: loc ? `${cat} ${loc}` : cat,
        news_broad: loc ? `${cat} ${loc.split(/[\s,]+/).pop()}` : cat,
        technical: loc ? `${cat} ${loc}` : cat,
        impact: loc ? `${cat} ${loc} impact damage` : `${cat} impact damage`,
        response: loc ? `${cat} ${loc} emergency response` : `${cat} emergency response`,
        video: loc ? `${cat} ${loc}` : cat,
        academic: loc ? `${cat} ${loc} ${academicSuffix}` : `${cat} ${academicSuffix}`,
        government: loc ? `${cat} ${loc} official report` : `${cat} official report`,
        historical: loc ? `${cat} ${loc} history` : `${cat} history previous events`,
        images: loc ? `${cat} ${loc}` : cat,
        images_broad: loc ? `${cat} ${loc.split(/[\s,]+/).pop()}` : cat
    };
    const query = queryVariants[variant] || queryVariants.news;
    const cleaned = cleanQueryText(query).substring(0, 60);
    log("DEBUG", "QUERY", `Built ${variant} query: "${cleaned}".`, { variant, category: cat, location: loc ? loc.substring(0, 40) : "" });
    return cleaned;
};


const scoreArticle = (article, risk) => {
    let score = 0;
    const text = `${article.title || ""} ${article.description || ""}`.toLowerCase();
    const cat = (risk.risk_category || "").toLowerCase();
    const title = (risk.title || "").toLowerCase();

    if (text.includes(cat)) score += 10;
    const titleWords = title.split(/\s+/).filter(w => w.length > 3);
    for (const w of titleWords) if (text.includes(w)) score += 5;

    if (risk.metadata?.place && text.includes(risk.metadata.place.toLowerCase())) score += 15;
    if (risk.metadata?.magnitude && text.includes(String(risk.metadata.magnitude))) score += 10;

    const loc = extractLocation(risk).toLowerCase();
    if (loc && text.includes(loc)) score += 15;

    const pubDate = article.publishedAt ? new Date(article.publishedAt) : null;
    const eventDate = risk.event_time ? new Date(risk.event_time) : null;
    if (pubDate && eventDate) {
        const diffDays = Math.abs((pubDate - eventDate) / 864e5);
        if (diffDays < 1) score += 20;
        else if (diffDays < 3) score += 15;
        else if (diffDays < 7) score += 10;
        else if (diffDays < 14) score += 5;
    }

    const source = (article.source?.name || article.source || "").toLowerCase();
    if (TIER_ONE_SOURCES.some(t => source.includes(t))) score += 15;
    else if (TIER_TWO_SOURCES.some(t => source.includes(t))) score += 10;

    return score;
};

const scoreVideo = (video, risk) => {
    let score = 0;
    const text = `${video.title || ""} ${video.description || ""}`.toLowerCase();
    const cat = (risk.risk_category || "").toLowerCase();
    if (text.includes(cat)) score += 10;
    if (risk.metadata?.place && text.includes(risk.metadata.place.toLowerCase())) score += 15;
    const loc = extractLocation(risk).toLowerCase();
    if (loc && text.includes(loc)) score += 15;
    if (video.viewCount > 1000000) score += 20;
    else if (video.viewCount > 100000) score += 15;
    else if (video.viewCount > 10000) score += 10;
    if (VERIFIED_VIDEO_CHANNELS.some(v => (video.channelTitle || "").toLowerCase().includes(v))) score += 15;
    return score;
};

const dedupeArticles = (articles) => {
    const before = articles.length;
    const seen = new Set();
    const result = articles.filter(a => {
        const key = (a.url || "").toLowerCase().replace(/[?#].*/, "");
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    const removed = before - result.length;
    if (removed > 0) log("DEBUG", "DEDUP", `Removed ${removed} duplicate articles (${before} → ${result.length}).`);
    return result;
};


const callGemini = async (prompt, opts = {}) => {
    const t = timer("Gemini API call");
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.trim() === "") {
        log("WARN", "GEMINI", "Skipped: GEMINI_API_KEY not configured or empty.");
        t.done({ skipped: true, reason: "no_api_key" });
        return null;
    }
    const model = opts.model || GEMINI_MODEL;
    const url = `${GEMINI_BASE_URL}/${model}:generateContent?key=${apiKey}`;
    log("INFO", "GEMINI", `Calling ${model}.`, { prompt_length: prompt.length, max_tokens: opts.maxTokens || 4096 });
    try {
        const body = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: opts.temperature || 0.3,
                maxOutputTokens: opts.maxTokens || 4096,
                responseMimeType: "application/json"
            }
        };
        const response = await fetchWithTimeout(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        }, opts.timeout || 30000);
        if (!response.ok) {
            const errorBody = await response.text().catch(() => "");
            log("ERROR", "GEMINI", `Non-OK response: ${response.status}.`, { status: response.status, body: errorBody.substring(0, 500) });
            t.done({ status: response.status, error: true });
            return null;
        }
        const data = await response.json();
        const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!textContent) {
            log("WARN", "GEMINI", "Received empty response from Gemini.", { candidates: data.candidates?.length || 0, finish_reason: data.candidates?.[0]?.finishReason });
            t.done({ error: "empty_response" });
            return null;
        }
        log("DEBUG", "GEMINI", `Raw response length: ${textContent.length} chars.`);
        let parsed;
        try {
            const cleaned = textContent.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
            parsed = JSON.parse(cleaned);
        } catch (parseError) {
            log("WARN", "GEMINI", "Failed to parse JSON response.", { preview: textContent.substring(0, 300), error: parseError.message });
            t.done({ error: "json_parse_fail" });
            return { _raw: textContent };
        }
        const ms = t.done({ success: true });
        log("INFO", "GEMINI", `Response parsed successfully in ${ms}ms.`);
        return parsed;
    } catch (error) {
        logError("GEMINI", error);
        t.done({ error: error.message });
        return null;
    }
};

const keywordFallbackFilter = (risk, items, itemType) => {
    const t = timer(`Keyword fallback filter (${itemType})`);
    const cat = (risk.risk_category || "").toLowerCase();
    const loc = extractLocation(risk).toLowerCase();
    const locWords = loc.split(/[\s,]+/).filter(w => w.length > 2);
    const scored = items.map(item => {
        const copy = { ...item };
        const text = `${item.title || ""} ${item.description || item.selftext_excerpt || item.abstract || ""}`.toLowerCase();
        let score = 0;
        const hasCat = cat && text.includes(cat);
        let hasLoc = false;
        if (loc) {
            for (const lw of locWords) {
                if (text.includes(lw)) { hasLoc = true; break; }
            }
        }
        if (hasCat && hasLoc) score += 8;
        else if (hasLoc) score += 5;
        else if (hasCat) score += 2;
        const pubDate = item.publishedAt || item.created_utc || item.publicationDate || "";
        if (pubDate) {
            try {
                const d = new Date(pubDate);
                const sixMonthsAgo = new Date();
                sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
                if (d < sixMonthsAgo) score -= 10;
            } catch {}
            if (!isDateRelevant(pubDate, risk)) score -= 5;
        }
        copy._relevance_score = score;
        return copy;
    });
    const filtered = scored
        .filter(item => item._relevance_score >= 5)
        .sort((a, b) => (b._relevance_score || 0) - (a._relevance_score || 0));
    const ms = t.done({ total: items.length, kept: filtered.length });
    log("INFO", "KEYWORD_FILTER", `${itemType}: ${filtered.length}/${items.length} kept by keyword fallback in ${ms}ms.`);
    return { items: filtered, checked: items.length, relevant: filtered.length };
};

const geminiFilterRelevance = async (risk, items, itemType) => {
    const t = timer(`Gemini relevance filter (${itemType})`);
    if (!items || items.length === 0) {
        t.done({ count: 0, skipped: true });
        return { items: [], checked: 0, relevant: 0 };
    }
    if (!process.env.GEMINI_API_KEY) {
        log("DEBUG", "GEMINI_FILTER", `Skipped ${itemType} AI filtering: no API key, using keyword fallback.`);
        t.done({ skipped: true, fallback: "keyword" });
        return keywordFallbackFilter(risk, items, itemType);
    }
    const maxCheck = Math.min(items.length, 30);
    const subset = items.slice(0, maxCheck);
    const itemSummaries = subset.map((item, idx) => {
        const title = item.title || "";
        const desc = item.description || item.selftext_excerpt || item.abstract || "";
        const channel = item.channelTitle || item.source?.name || item.subreddit || "";
        const pubDate = item.publishedAt || item.created_utc || item.publicationDate || "";
        return `[${idx}] Title: "${title.substring(0, 120)}" | Desc: "${desc.substring(0, 150)}" | Source: "${channel}" | Date: "${pubDate}"`;
    }).join("\n");
    const isForecast = /forecast|predict|warning|watch|alert|advisory|outlook/i.test(risk.title || "");
    const prompt = `You are a strict risk intelligence analyst. Evaluate if each item below is RELEVANT to this specific risk event. ${isForecast ? "This is a FORECAST/WARNING event, not a confirmed incident. Content about recent or historical events of the same type in the same region IS relevant as context. Content about current conditions, preparedness, or related hazards in the area IS relevant." : "Be very strict about relevance - items must be about the SAME specific event, location, and time period."}

RISK EVENT:
- Title: "${risk.title}"
- Category: "${risk.risk_category}"
- Severity: "${risk.severity}"
- Location: "${extractLocation(risk)}"
- Description: "${(risk.description || "").substring(0, 300)}"
- Event Time: "${risk.event_time || ""}"
- Type: ${isForecast ? "FORECAST/WARNING (not yet occurred)" : "ACTIVE/CONFIRMED EVENT"}

ITEMS TO EVALUATE (${itemType}):
${itemSummaries}

For each item, assign a relevance score from 0-10:
${isForecast ? `- 9-10: Directly about this forecast/warning or current conditions in this location
- 7-8: About recent flooding, water levels, or weather in the same region
- 5-6: About flood preparedness, infrastructure, or historical flooding in this area
- 3-4: About the same hazard type but a different region or clearly old event
- 0-2: Completely unrelated to flooding or this geographic area` : `- 9-10: Directly about this exact specific event at this location and time
- 7-8: Closely related to this event type at the same location or immediate region
- 5-6: Same type of event but different specific incident or nearby region
- 3-4: Same general topic but clearly different event, location, or time period
- 0-2: Unrelated, generic, or about a completely different event/location`}

STRICT RULES:
- Generic educational or compilation content about a hazard type score 2-3 max unless they specifically reference this event or location
- Content about a completely different geographic region scores 0-3 max
- Content from more than 30 days before the event scores 0-3 max unless it provides important historical context for THIS location
- News aggregation or listicle content not specifically about this event scores 0-3 max

Return JSON: {"scores": [{"index": 0, "score": 8, "reason": "brief reason"}, ...]}
Only include items you evaluated. Be strict but fair.`;

    try {
        const result = await callGemini(prompt, { temperature: 0.1, maxTokens: 2048, timeout: 20000 });
        if (!result || !result.scores) {
            log("WARN", "GEMINI_FILTER", `No valid scores returned for ${itemType}, using keyword fallback.`);
            t.done({ error: "no_scores", fallback: "keyword" });
            return keywordFallbackFilter(risk, items, itemType);
        }
        const scoreMap = {};
        for (const s of result.scores) {
            if (s.index !== undefined && s.score !== undefined) {
                scoreMap[s.index] = s.score;
            }
        }
        const scoredItems = [];
        for (let i = 0; i < items.length; i++) {
            const item = { ...items[i] };
            if (i < maxCheck && scoreMap[i] !== undefined) {
                item._relevance_score = scoreMap[i];
                item._relevance_reason = result.scores.find(s => s.index === i)?.reason || "";
            } else {
                item._relevance_score = 3;
            }
            scoredItems.push(item);
        }
        const filtered = scoredItems
            .filter(item => item._relevance_score >= RELEVANCE_THRESHOLD)
            .sort((a, b) => (b._relevance_score || 0) - (a._relevance_score || 0));
        const relevant = scoredItems.filter(item => item._relevance_score >= RELEVANCE_THRESHOLD).length;
        const ms = t.done({ checked: maxCheck, relevant, filtered: filtered.length, total: items.length });
        log("INFO", "GEMINI_FILTER", `${itemType}: ${relevant}/${maxCheck} relevant, ${items.length - filtered.length} removed in ${ms}ms.`);
        return { items: filtered, checked: maxCheck, relevant };
    } catch (error) {
        logError("GEMINI_FILTER", error);
        t.done({ error: error.message, fallback: "keyword" });
        return keywordFallbackFilter(risk, items, itemType);
    }
};

const geminiFilterImages = async (risk, images) => {
    const t = timer("Gemini image relevance filter");
    if (!images || images.length === 0) {
        t.done({ count: 0, skipped: true });
        return [];
    }
    if (!process.env.GEMINI_API_KEY) {
        t.done({ skipped: true });
        return images;
    }
    const maxCheck = Math.min(images.length, 20);
    const subset = images.slice(0, maxCheck);
    const imageSummaries = subset.map((img, idx) => {
        return `[${idx}] Title: "${(img.title || "").substring(0, 120)}" | Source: "${img.source || img.provider || ""}" | URL: "${(img.url || "").substring(0, 100)}"`;
    }).join("\n");
    const prompt = `You are a strict risk intelligence analyst. Evaluate if each image below is RELEVANT to this specific risk event. Only keep images that visually relate to this specific event or its location.

RISK EVENT:
- Title: "${risk.title}"
- Category: "${risk.risk_category}"
- Location: "${extractLocation(risk)}"
- Event Time: "${risk.event_time || ""}"

IMAGES TO EVALUATE:
${imageSummaries}

For each image, assign a relevance score from 0-10:
- 8-10: Directly depicts or relates to this specific event or its exact location
- 5-7: Shows the same type of hazard in the same region
- 3-4: Generic image of this hazard type but not location-specific
- 0-2: Unrelated, logos, diagrams of unrelated things, maps of wrong areas, or irrelevant content

STRICT RULES:
- Generic stock-like hazard images score 2-3 max
- Logos, icons, or UI screenshots score 0
- Maps or satellite images of the wrong area score 0-2
- Images clearly from a different event or location score 0-3

Return JSON: {"scores": [{"index": 0, "score": 8, "reason": "brief reason"}, ...]}`;

    try {
        const result = await callGemini(prompt, { temperature: 0.1, maxTokens: 1024, timeout: 15000 });
        if (!result || !result.scores) {
            t.done({ error: "no_scores" });
            return images;
        }
        const scoreMap = {};
        for (const s of result.scores) {
            if (s.index !== undefined && s.score !== undefined) {
                scoreMap[s.index] = s.score;
            }
        }
        const scored = images.map((img, i) => {
            const copy = { ...img };
            if (i < maxCheck && scoreMap[i] !== undefined) {
                copy._relevance_score = scoreMap[i];
            } else {
                copy._relevance_score = 3;
            }
            return copy;
        });
        const filtered = scored
            .filter(img => img._relevance_score >= IMAGE_RELEVANCE_THRESHOLD)
            .sort((a, b) => (b._relevance_score || 0) - (a._relevance_score || 0));
        const ms = t.done({ checked: maxCheck, kept: filtered.length, removed: images.length - filtered.length });
        log("INFO", "GEMINI_FILTER", `Images: ${filtered.length}/${maxCheck} relevant, ${images.length - filtered.length} removed in ${ms}ms.`);
        return filtered;
    } catch (error) {
        logError("GEMINI_FILTER_IMAGES", error);
        t.done({ error: error.message });
        return images;
    }
};


const generateAISummary = async (risk, collectedData) => {
    const t = timer("Gemini AI Summary");
    log("INFO", "GEMINI_SUMMARY", "Starting AI summary generation.", {
        has_api_key: !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()),
        articles: (collectedData.articles || []).length,
        reddit: (collectedData.reddit || []).length,
        academic: (collectedData.academic || []).length,
        related: (collectedData.related || []).length
    });
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.trim() === "") {
        log("WARN", "GEMINI_SUMMARY", "Skipped: GEMINI_API_KEY not configured or empty.");
        t.done({ skipped: true });
        return buildFallbackSummary(risk);
    }

    let resolvedLocation = extractLocation(risk);
    if (!resolvedLocation && risk.latitude && risk.longitude) {
        try {
            resolvedLocation = await reverseGeocode(risk.latitude, risk.longitude);
            if (resolvedLocation) {
                risk._resolved_location = resolvedLocation;
                log("INFO", "GEMINI_SUMMARY", `Resolved location via geocode: "${resolvedLocation}".`);
            }
        } catch (geoError) {
            log("WARN", "GEMINI_SUMMARY", `Geocode failed: ${geoError.message}.`);
        }
    }
    const locationStr = resolvedLocation || "Unknown — do NOT guess or invent a location";

    let articleSnippets = "";
    let socialSnippets = "";
    let academicSnippets = "";
    let relatedSnippets = "";
    let metaStr = "none";
    try {
        articleSnippets = (collectedData.articles || []).slice(0, 8).map(a =>
            `- "${(a.title || "").substring(0, 100)}" (${a.source?.name || "Unknown"}, ${a.publishedAt || "unknown date"}): ${(a.description || "").substring(0, 150)}`
        ).join("\n");
        socialSnippets = (collectedData.reddit || []).slice(0, 5).map(p =>
            `- "${(p.title || "").substring(0, 100)}" (${p.subreddit || ""}, score: ${p.score || 0})`
        ).join("\n");
        academicSnippets = (collectedData.academic || []).slice(0, 3).map(p =>
            `- "${(p.title || "").substring(0, 100)}" (${p.year || ""}, citations: ${p.citationCount || 0})`
        ).join("\n");
        relatedSnippets = (collectedData.related || []).slice(0, 5).map(r =>
            `- "${(r.title || "").substring(0, 80)}" (${r.severity || ""}, ${r.risk_category || ""}, ${r.distance_km ? r.distance_km + " km away" : ""})`
        ).join("\n");
        metaStr = risk.metadata ? JSON.stringify(risk.metadata).substring(0, 500) : "none";
    } catch (snippetError) {
        log("ERROR", "GEMINI_SUMMARY", `Error building snippets: ${snippetError.message}.`);
    }

    let populationStr = "N/A";
    if (risk.population_impact) {
        const pi = risk.population_impact;
        const parts = [];
        if (pi.density) parts.push(`Density: ${pi.density.replace("_", " ")}`);
        if (pi.estimated_population !== undefined) parts.push(`Est. population: ${pi.estimated_population}`);
        if (pi.nearest_city) parts.push(`Nearest city (from data): ${pi.nearest_city}`);
        if (pi.distance_km) parts.push(`Distance to nearest city: ${pi.distance_km} km`);
        populationStr = parts.length > 0 ? parts.join(", ") : "N/A";
    }

    const prompt = `You are an expert risk intelligence analyst. Generate a comprehensive intelligence briefing summary for the following risk event.

RISK EVENT:
- Title: "${risk.title}"
- Category: "${risk.risk_category}"
- Severity: "${risk.severity}" (Score: ${risk.severity_score || "N/A"})
- Source: "${risk.source}"
- Location: "${locationStr}"
- Coordinates: ${risk.latitude || "N/A"}, ${risk.longitude || "N/A"}
- Event Time: "${risk.event_time || ""}"
- Description: "${(risk.description || "").substring(0, 500)}"
- Impact Radius: ${risk.impact_radius_km || "N/A"} km
- Metadata: ${metaStr}
- Population Impact: ${populationStr}

COLLECTED INTELLIGENCE:
News Articles (${(collectedData.articles || []).length} found):
${articleSnippets || "None available"}

Social Media (${(collectedData.reddit || []).length} posts):
${socialSnippets || "None available"}

Academic Research (${(collectedData.academic || []).length} papers):
${academicSnippets || "None available"}

Related Risks Nearby (${(collectedData.related || []).length} found):
${relatedSnippets || "None found"}

CRITICAL LOCATION RULES:
- The event location is "${locationStr}" at coordinates ${risk.latitude || "N/A"}, ${risk.longitude || "N/A"}.
- ONLY reference cities, regions, and areas that are ACTUALLY near these coordinates.
- Do NOT mention or reference any city or metropolitan area unless it is within the impact radius or explicitly mentioned in the provided data.
- If you are unsure which cities are nearby, say "nearby populated areas" instead of naming specific cities.
- NEVER guess or assume which major city is closest. Only state city names if they appear in the Location, Population Impact, or Metadata fields above.

Generate a JSON response with this exact structure:
{
  "executive_summary": "2-4 paragraph comprehensive summary of the event, its current status, potential impacts, and what is known so far",
  "key_findings": ["finding 1", "finding 2", "finding 3", "finding 4", "finding 5"],
  "statistics": [
    {"label": "metric name", "value": "metric value"},
    {"label": "metric name", "value": "metric value"},
    {"label": "metric name", "value": "metric value"},
    {"label": "metric name", "value": "metric value"},
    {"label": "metric name", "value": "metric value"},
    {"label": "metric name", "value": "metric value"}
  ],
  "impact_assessment": "1-2 paragraph assessment of current and potential impacts on population, infrastructure, and environment. Only reference geographic areas confirmed in the data above.",
  "affected_areas": ["area1", "area2", "area3"],
  "recommendations": ["recommendation 1", "recommendation 2", "recommendation 3", "recommendation 4"],
  "timeline": [
    {"time": "time description", "description": "what happened"},
    {"time": "time description", "description": "what happened"}
  ],
  "confidence_level": "HIGH/MEDIUM/LOW",
  "data_quality_note": "brief note about the quality and completeness of available data"
}

For statistics, include relevant metrics like magnitude, affected population, distance from populated areas, number of related events, media coverage volume, etc. Use ONLY the actual data provided above. If specific data is unavailable, state "Data unavailable" — do NOT fabricate estimates for population counts or nearest cities.
For affected_areas, ONLY include areas explicitly mentioned in the Location, Metadata, Population Impact, or news article data above. Do NOT invent or guess area names.`;

    log("INFO", "GEMINI_SUMMARY", "Sending prompt to Gemini.", { prompt_length: prompt.length });
    try {
        const result = await callGemini(prompt, { temperature: 0.4, maxTokens: 4096, timeout: 45000 });
        if (!result || result._raw) {
            log("WARN", "GEMINI_SUMMARY", "Failed to get structured summary, using fallback.", { raw: !!result?._raw, null_result: !result });
            t.done({ fallback: true });
            return buildFallbackSummary(risk);
        }
        result.generated_at = new Date().toISOString();
        result.model = GEMINI_MODEL;
        result.ai_generated = true;
        const ms = t.done({ success: true });
        log("INFO", "GEMINI_SUMMARY", `AI summary generated in ${ms}ms.`);
        return result;
    } catch (error) {
        logError("GEMINI_SUMMARY", error);
        t.done({ error: error.message });
        return buildFallbackSummary(risk);
    }
};

const buildFallbackSummary = (risk) => {
    const loc = extractLocation(risk);
    const meta = risk.metadata || {};
    const stats = [];
    if (risk.severity) stats.push({ label: "Severity Level", value: risk.severity });
    if (risk.severity_score) stats.push({ label: "Severity Score", value: String(risk.severity_score) });
    if (meta.magnitude) stats.push({ label: "Magnitude", value: String(meta.magnitude) });
    if (meta.depth) stats.push({ label: "Depth", value: `${meta.depth} km` });
    if (risk.impact_radius_km) stats.push({ label: "Impact Radius", value: `${risk.impact_radius_km} km` });
    if (risk.source) stats.push({ label: "Data Source", value: risk.source });
    if (loc) stats.push({ label: "Location", value: loc });
    if (risk.event_time) stats.push({ label: "Event Time", value: new Date(risk.event_time).toLocaleString() });
    return {
        executive_summary: `${risk.title || "Risk event detected"}. This ${(risk.risk_category || "risk").toLowerCase()} event was reported by ${risk.source || "monitoring systems"} with a severity level of ${risk.severity || "Unknown"}${loc ? ` in the ${loc} area` : ""}. ${risk.description || "Further details are being gathered from multiple intelligence sources."}`,
        key_findings: [
            `Event classified as ${risk.severity || "Unknown"} severity ${(risk.risk_category || "risk").toLowerCase()} event.`,
            loc ? `Reported in the ${loc} region.` : "Location data available in event metadata.",
            `Monitored by ${risk.source || "multiple sources"}.`,
            risk.impact_radius_km ? `Estimated impact radius of ${risk.impact_radius_km} km.` : "Impact radius under assessment.",
            "AI-enhanced analysis unavailable - displaying raw intelligence data."
        ],
        statistics: stats.length > 0 ? stats : [{ label: "Status", value: "Monitoring" }],
        impact_assessment: risk.description || "Impact assessment requires additional data collection. Review the news, social, and academic tabs for the latest available information.",
        affected_areas: loc ? [loc] : [],
        recommendations: [
            "Monitor official sources for updates.",
            "Review related risks in the vicinity.",
            "Check news and social tabs for latest reports.",
            "Consult academic research for historical context."
        ],
        timeline: risk.event_time ? [{ time: new Date(risk.event_time).toLocaleString(), description: "Event initially reported." }] : [],
        generated_at: new Date().toISOString(),
        ai_generated: false,
        fallback: true,
        confidence_level: "LOW",
        data_quality_note: "AI summary generation unavailable. Displaying basic event metadata only."
    };
};


const fetchGDELT = async (query, dateRange, limit) => {
    const t = timer(`GDELT "${query.substring(0, 40)}"`);
    const cacheKey = `gdelt_${query}_${dateRange.from}`;
    const cached = getCached(SEARCH_CACHE, cacheKey);
    if (cached) { t.done({ source: "cache", count: cached.length }); return cached; }
    try {
        const fromDt = dateRange.from.replace(/-/g, "") + "000000";
        const toDt = dateRange.to.replace(/-/g, "") + "235959";
        const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=ArtList&maxrecords=${limit || MAX_ARTICLES}&format=json&startdatetime=${fromDt}&enddatetime=${toDt}&sort=DateDesc`;
        const response = await fetchWithRetry(url, {}, 15000, 1);
        if (!response.ok) {
            log("WARN", "GDELT", `Non-OK response: ${response.status}.`, { status: response.status, query: query.substring(0, 60) });
            t.done({ status: response.status, count: 0 });
            return [];
        }
        const text = await response.text();
        if (!text || !text.trim().startsWith("{") && !text.trim().startsWith("[")) {
            log("WARN", "GDELT", `Non-JSON response body received.`, { body_preview: text.substring(0, 120), query: query.substring(0, 60) });
            t.done({ error: "non_json_body", count: 0 });
            return [];
        }
        let data;
        try {
            data = JSON.parse(text);
        } catch (parseError) {
            log("WARN", "GDELT", `JSON parse error encountered.`, { body_preview: text.substring(0, 200) });
            t.done({ error: "json_parse", count: 0 });
            return [];
        }
        const articles = (data.articles || []).map(a => {
            let pubDate = null;
            if (a.seendate) {
                try {
                    const sd = a.seendate.trim();
                    if (/^\d{14}$/.test(sd.replace(/T|Z/g, ""))) {
                        const cleaned = sd.replace(/(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})(\d{2})Z?/, "$1-$2-$3T$4:$5:$6Z");
                        pubDate = new Date(cleaned).toISOString();
                    } else {
                        pubDate = new Date(sd).toISOString();
                    }
                } catch (error) {
                    pubDate = null;
                }
            }
            return {
                title: a.title,
                description: a.seendate ? `Published ${a.seendate}. Source: ${a.domain || "Unknown"}.` : null,
                content: null,
                url: a.url,
                image_url: a.socialimage || null,
                publishedAt: pubDate,
                source: { name: a.domain || "Unknown" },
                author: null,
                language: a.language,
                sentiment: a.tone ? parseFloat(a.tone) : null,
                provider: "gdelt"
            };
        });
        setCache(SEARCH_CACHE, cacheKey, articles);
        const ms = t.done({ count: articles.length });
        log("INFO", "GDELT", `Found ${articles.length} articles in ${ms}ms for "${query.substring(0, 50)}".`);
        t.warn(10000, { count: articles.length });
        return articles;
    } catch (error) {
        logError("GDELT", error);
        t.done({ error: error.message });
        return [];
    }
};

const fetchGNews = async (query, limit) => {
    const t = timer(`GNews "${query.substring(0, 40)}"`);
    const key = process.env.GNEWS_API_KEY;
    if (!key) {
        log("DEBUG", "GNEWS", "Skipped: API key not configured.");
        return [];
    }
    const cacheKey = `gnews_${query}`;
    const cached = getCached(SEARCH_CACHE, cacheKey);
    if (cached) { t.done({ source: "cache", count: cached.length }); return cached; }
    try {
        const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=en&max=${Math.min(limit || 10, 10)}&apikey=${key}`;
        const response = await fetchWithTimeout(url);
        if (!response.ok) {
            const body = await response.text().catch(() => "");
            log("WARN", "GNEWS", `Non-OK response: ${response.status}.`, { status: response.status, body: body.substring(0, 200), query: query.substring(0, 60) });
            t.done({ status: response.status, count: 0 });
            return [];
        }
        const data = await response.json();
        const articles = (data.articles || []).map(a => ({
            title: a.title,
            description: a.description,
            content: a.content,
            url: a.url,
            image_url: a.image,
            publishedAt: a.publishedAt,
            source: { name: a.source?.name || "Unknown" },
            author: null,
            provider: "gnews"
        }));
        setCache(SEARCH_CACHE, cacheKey, articles);
        const ms = t.done({ count: articles.length });
        log("INFO", "GNEWS", `Found ${articles.length} articles in ${ms}ms for "${query.substring(0, 50)}".`);
        t.warn(8000, { count: articles.length });
        return articles;
    } catch (error) {
        logError("GNEWS", error);
        t.done({ error: error.message });
        return [];
    }
};

const fetchGoogleSearch = async (query, limit) => {
    const t = timer(`GoogleCSE "${query.substring(0, 40)}"`);
    const key = process.env.GOOGLE_CUSTOM_SEARCH_KEY;
    const cx = process.env.GOOGLE_CUSTOM_SEARCH_CX;
    if (!key || !cx) {
        log("DEBUG", "GOOGLE_CSE", "Skipped: API key or CX not configured.");
        return [];
    }
    const cacheKey = `gcs_${query}`;
    const cached = getCached(SEARCH_CACHE, cacheKey);
    if (cached) { t.done({ source: "cache", count: cached.length }); return cached; }
    try {
        const url = `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&q=${encodeURIComponent(query)}&num=${Math.min(limit || 10, 10)}`;
        const response = await fetchWithTimeout(url);
        if (!response.ok) {
            const body = await response.text().catch(() => "");
            log("WARN", "GOOGLE_CSE", `Non-OK response: ${response.status}.`, { status: response.status, body: body.substring(0, 200) });
            t.done({ status: response.status, count: 0 });
            return [];
        }
        const data = await response.json();
        const results = (data.items || []).map(i => ({
            title: i.title,
            description: i.snippet,
            url: i.link,
            image_url: i.pagemap?.cse_image?.[0]?.src || null,
            source: { name: i.displayLink },
            provider: "google"
        }));
        setCache(SEARCH_CACHE, cacheKey, results);
        const ms = t.done({ count: results.length });
        log("INFO", "GOOGLE_CSE", `Found ${results.length} results in ${ms}ms for "${query.substring(0, 50)}".`);
        t.warn(8000, { count: results.length });
        return results;
    } catch (error) {
        logError("GOOGLE_CSE", error);
        t.done({ error: error.message });
        return [];
    }
};

const fetchReliefWebReport = async (query) => {
    const t = timer(`ReliefWeb "${query.substring(0, 40)}"`);
    const cacheKey = `reliefweb_report_${query}`;
    const cached = getCached(SEARCH_CACHE, cacheKey);
    if (cached) { t.done({ source: "cache", count: cached.length }); return cached; }
    try {
        const body = JSON.stringify({
            appname: "risk-intel",
            query: { value: query },
            limit: 10,
            fields: {
                include: ["title", "url", "date", "source", "primary_country", "disaster"]
            },
            sort: ["date:desc"]
        });
        const response = await fetchWithTimeout("https://api.reliefweb.int/v1/reports?appname=risk-intel", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "RiskIntelligence/2.0 (risk-intel)"
            },
            body
        }, 20000);
        if (!response.ok) {
            if (response.status === 403) {
                log("WARN", "RELIEFWEB", `Received 403 Forbidden, attempting GET fallback.`);
                const getUrl = `https://api.reliefweb.int/v1/reports?appname=risk-intel&query[value]=${encodeURIComponent(query)}&limit=10&sort[]=date:desc&fields[include][]=title&fields[include][]=url&fields[include][]=date&fields[include][]=source&fields[include][]=primary_country&fields[include][]=disaster`;
                const getResponse = await fetchWithTimeout(getUrl, {
                    method: "GET",
                    headers: {
                        "Accept": "application/json",
                        "User-Agent": "RiskIntelligence/2.0 (risk-intel)"
                    }
                }, 15000);
                if (!getResponse.ok) {
                    log("WARN", "RELIEFWEB", `GET fallback also failed: ${getResponse.status}.`);
                    t.done({ status: getResponse.status, count: 0 });
                    return [];
                }
                const getData = await getResponse.json();
                const getReports = (getData.data || []).map(item => {
                    const f = item.fields || {};
                    return {
                        title: f.title,
                        url: f.url,
                        date: f.date?.created,
                        source: f.source?.[0]?.name,
                        country: f.primary_country?.name,
                        disaster: f.disaster?.[0]?.name,
                        body_excerpt: null,
                        provider: "reliefweb"
                    };
                });
                setCache(SEARCH_CACHE, cacheKey, getReports);
                const ms = t.done({ count: getReports.length, method: "get_fallback" });
                log("INFO", "RELIEFWEB", `Found ${getReports.length} reports in ${ms}ms (GET fallback).`);
                return getReports;
            }
            log("WARN", "RELIEFWEB", `Non-OK response: ${response.status}.`);
            t.done({ status: response.status, count: 0 });
            return [];
        }
        const data = await response.json();
        const reports = (data.data || []).map(item => {
            const f = item.fields || {};
            return {
                title: f.title,
                url: f.url,
                date: f.date?.created,
                source: f.source?.[0]?.name,
                country: f.primary_country?.name,
                disaster: f.disaster?.[0]?.name,
                body_excerpt: null,
                provider: "reliefweb"
            };
        });
        setCache(SEARCH_CACHE, cacheKey, reports);
        const ms = t.done({ count: reports.length });
        log("INFO", "RELIEFWEB", `Found ${reports.length} reports in ${ms}ms.`);
        return reports;
    } catch (error) {
        logError("RELIEFWEB", error);
        t.done({ error: error.message });
        return [];
    }
};

const fetchWikipedia = async (query) => {
    const t = timer(`Wikipedia "${query.substring(0, 40)}"`);
    const cacheKey = `wiki_${query}`;
    const cached = getCached(SEARCH_CACHE, cacheKey);
    if (cached) { t.done({ source: "cache", count: cached.length }); return cached; }
    try {
        const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=5&format=json&origin=*`;
        const response = await fetchWithTimeout(url);
        if (!response.ok) {
            log("WARN", "WIKIPEDIA", `Non-OK response: ${response.status}.`);
            t.done({ status: response.status, count: 0 });
            return [];
        }
        const data = await response.json();
        const results = (data.query?.search || []).map(s => ({
            title: s.title,
            snippet: s.snippet?.replace(/<[^>]+>/g, ""),
            url: `https://en.wikipedia.org/wiki/${encodeURIComponent(s.title.replace(/ /g, "_"))}`,
            wordcount: s.wordcount,
            provider: "wikipedia"
        }));
        setCache(SEARCH_CACHE, cacheKey, results);
        const ms = t.done({ count: results.length });
        log("INFO", "WIKIPEDIA", `Found ${results.length} results in ${ms}ms.`);
        return results;
    } catch (error) {
        logError("WIKIPEDIA", error);
        t.done({ error: error.message });
        return [];
    }
};

const fetchSemanticScholar = async (query, limit) => {
    const t = timer(`SemanticScholar "${query.substring(0, 40)}"`);
    const cacheKey = `scholar_${query}`;
    const cached = getCached(SEARCH_CACHE, cacheKey);
    if (cached) { t.done({ source: "cache", count: cached.length }); return cached; }
    try {
        const headers = {};
        if (process.env.SEMANTIC_SCHOLAR_API_KEY) {
            headers["x-api-key"] = process.env.SEMANTIC_SCHOLAR_API_KEY;
        }
        const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${limit || MAX_ACADEMIC}&fields=title,abstract,url,year,citationCount,authors,externalIds,publicationDate`;
        const response = await fetchWithRetry(url, { headers }, 20000, 2);
        if (!response.ok) {
            const body = await response.text().catch(() => "");
            log("WARN", "SCHOLAR", `Non-OK response: ${response.status}.`, { status: response.status, body: body.substring(0, 200) });
            t.done({ status: response.status, count: 0 });
            return [];
        }
        const data = await response.json();
        const papers = (data.data || []).map(p => ({
            title: p.title,
            abstract: p.abstract,
            url: p.url || (p.externalIds?.DOI ? `https://doi.org/${p.externalIds.DOI}` : null),
            year: p.year,
            citationCount: p.citationCount,
            authors: p.authors?.map(a => a.name).slice(0, 5),
            doi: p.externalIds?.DOI || null,
            publicationDate: p.publicationDate,
            provider: "semantic_scholar"
        }));
        setCache(SEARCH_CACHE, cacheKey, papers);
        const ms = t.done({ count: papers.length });
        log("INFO", "SCHOLAR", `Found ${papers.length} papers in ${ms}ms for "${query.substring(0, 50)}".`);
        t.warn(15000, { count: papers.length });
        return papers;
    } catch (error) {
        logError("SCHOLAR", error);
        t.done({ error: error.message });
        return [];
    }
};


const fetchYouTube = async (query, dateRange, limit) => {
    const t = timer(`YouTube "${query.substring(0, 40)}"`);
    const key = process.env.YOUTUBE_DATA_API_KEY;
    if (!key) {
        log("DEBUG", "YOUTUBE", "Skipped: API key not configured.");
        return [];
    }
    const cacheKey = `yt_${query}_${dateRange.from}`;
    const cached = getCached(SEARCH_CACHE, cacheKey);
    if (cached) { t.done({ source: "cache", count: cached.length }); return cached; }
    try {
        const after = new Date(dateRange.from).toISOString();
        const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=${limit || MAX_VIDEOS}&order=relevance&publishedAfter=${after}&relevanceLanguage=en&key=${key}`;
        const tSearch = timer("YouTube search request");
        const response = await fetchWithTimeout(url);
        tSearch.done();
        if (!response.ok) {
            const body = await response.text().catch(() => "");
            log("WARN", "YOUTUBE", `Search non-OK: ${response.status}.`, { status: response.status, body: body.substring(0, 200) });
            t.done({ status: response.status, count: 0 });
            return [];
        }
        const data = await response.json();
        const videoIds = (data.items || []).map(i => i.id.videoId).filter(Boolean);
        log("DEBUG", "YOUTUBE", `Search returned ${videoIds.length} video IDs.`);
        if (!videoIds.length) { t.done({ count: 0 }); return []; }

        let stats = {};
        try {
            const tStats = timer("YouTube stats request");
            const statsResponse = await fetchWithTimeout(`https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails&id=${videoIds.join(",")}&key=${key}`);
            tStats.done();
            if (statsResponse.ok) {
                const statsData = await statsResponse.json();
                for (const item of (statsData.items || [])) {
                    stats[item.id] = {
                        viewCount: parseInt(item.statistics?.viewCount || "0", 10),
                        likeCount: parseInt(item.statistics?.likeCount || "0", 10),
                        commentCount: parseInt(item.statistics?.commentCount || "0", 10),
                        duration: item.contentDetails?.duration || null
                    };
                }
                log("DEBUG", "YOUTUBE", `Retrieved stats for ${Object.keys(stats).length} videos.`);
            } else {
                log("WARN", "YOUTUBE", `Stats request non-OK: ${statsResponse.status}.`);
            }
        } catch (error) {
            log("WARN", "YOUTUBE", `Stats fetch failed: ${error.message}.`);
        }
        const videos = (data.items || []).map(i => {
            const s = stats[i.id.videoId] || {};
            return {
                videoId: i.id.videoId,
                title: i.snippet.title,
                description: i.snippet.description,
                channelTitle: i.snippet.channelTitle,
                channelId: i.snippet.channelId,
                publishedAt: i.snippet.publishedAt,
                thumbnail_url: i.snippet.thumbnails?.high?.url || i.snippet.thumbnails?.medium?.url || i.snippet.thumbnails?.default?.url,
                url: `https://www.youtube.com/watch?v=${i.id.videoId}`,
                embed_url: `https://www.youtube.com/embed/${i.id.videoId}`,
                viewCount: s.viewCount || 0,
                likeCount: s.likeCount || 0,
                commentCount: s.commentCount || 0,
                duration: s.duration || null,
                provider: "youtube"
            };
        });
        setCache(SEARCH_CACHE, cacheKey, videos);
        const ms = t.done({ count: videos.length });
        log("INFO", "YOUTUBE", `Found ${videos.length} videos in ${ms}ms for "${query.substring(0, 50)}".`);
        t.warn(12000, { count: videos.length });
        return videos;
    } catch (error) {
        logError("YOUTUBE", error);
        t.done({ error: error.message });
        return [];
    }
};


const fetchGoogleImages = async (query, limit) => {
    const t = timer(`GoogleImages "${query.substring(0, 40)}"`);
    const key = process.env.GOOGLE_CUSTOM_SEARCH_KEY;
    const cx = process.env.GOOGLE_CUSTOM_SEARCH_CX;
    if (!key || !cx) {
        log("DEBUG", "GOOGLE_IMG", "Skipped: API key or CX not configured, using fallback image sources.");
        t.done({ status: "skipped_no_key", count: 0 });
        return [];
    }
    const cacheKey = `gimg_${query}`;
    const cached = getCached(SEARCH_CACHE, cacheKey);
    if (cached) { t.done({ source: "cache", count: cached.length }); return cached; }
    try {
        const url = `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&q=${encodeURIComponent(query)}&searchType=image&num=${Math.min(limit || MAX_IMAGES, 10)}&imgSize=large&safe=active`;
        const response = await fetchWithTimeout(url);
        if (!response.ok) {
            const body = await response.text().catch(() => "");
            log("WARN", "GOOGLE_IMG", `Non-OK response: ${response.status}.`, { status: response.status, body: body.substring(0, 200) });
            t.done({ status: response.status, count: 0 });
            return [];
        }
        const data = await response.json();
        const images = (data.items || []).map(i => ({
            title: i.title,
            url: i.link,
            thumbnail_url: i.image?.thumbnailLink || i.link,
            context_url: i.image?.contextLink,
            width: i.image?.width,
            height: i.image?.height,
            source: i.displayLink,
            provider: "google_images"
        }));
        setCache(SEARCH_CACHE, cacheKey, images);
        const ms = t.done({ count: images.length });
        log("INFO", "GOOGLE_IMG", `Found ${images.length} images in ${ms}ms for "${query.substring(0, 50)}".`);
        t.warn(8000, { count: images.length });
        return images;
    } catch (error) {
        logError("GOOGLE_IMG", error);
        t.done({ error: error.message });
        return [];
    }
};

const fetchWikimediaImages = async (query, limit) => {
    const t = timer(`WikimediaImages "${query.substring(0, 40)}"`);
    const cacheKey = `wimg_${query}`;
    const cached = getCached(SEARCH_CACHE, cacheKey);
    if (cached) { t.done({ source: "cache", count: cached.length }); return cached; }
    try {
        const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=${Math.min(limit || MAX_IMAGES, 20)}&gsrnamespace=6&prop=imageinfo&iiprop=url|extmetadata|size|mime&iiurlwidth=800&format=json&origin=*`;
        const response = await fetchWithTimeout(url, {}, 10000);
        if (!response.ok) {
            log("WARN", "WIKIMEDIA_IMG", `Non-OK response: ${response.status}.`);
            t.done({ status: response.status, count: 0 });
            return [];
        }
        const data = await response.json();
        const pages = data.query?.pages || {};
        const images = Object.values(pages)
            .filter(p => p.imageinfo && p.imageinfo.length > 0)
            .filter(p => {
                const mime = p.imageinfo[0].mime || "";
                return mime.startsWith("image/");
            })
            .map(p => {
                const info = p.imageinfo[0];
                const meta = info.extmetadata || {};
                return {
                    title: (meta.ObjectName?.value || p.title || "").replace(/^File:/, "").replace(/\.\w+$/, ""),
                    url: info.thumburl || info.url,
                    thumbnail_url: info.thumburl || info.url,
                    context_url: info.descriptionurl,
                    width: info.thumbwidth || info.width,
                    height: info.thumbheight || info.height,
                    source: "Wikimedia Commons",
                    provider: "wikimedia",
                    license: meta.LicenseShortName?.value || "Unknown"
                };
            })
            .slice(0, limit || MAX_IMAGES);
        setCache(SEARCH_CACHE, cacheKey, images);
        const ms = t.done({ count: images.length });
        log("INFO", "WIKIMEDIA_IMG", `Found ${images.length} images in ${ms}ms for "${query.substring(0, 50)}".`);
        return images;
    } catch (error) {
        logError("WIKIMEDIA_IMG", error);
        t.done({ error: error.message });
        return [];
    }
};

const extractImagesFromArticles = (articles) => {
    const images = [];
    const seen = new Set();
    for (const a of articles) {
        if (a.image_url && !seen.has(a.image_url)) {
            seen.add(a.image_url);
            images.push({
                title: a.title || "News Image",
                url: a.image_url,
                thumbnail_url: a.image_url,
                context_url: a.url,
                width: null,
                height: null,
                source: a.source?.name || a.provider || "News",
                provider: "article_image"
            });
        }
    }
    return images;
};

const fetchAllImages = async (risk, articles) => {
    const t = timer("fetchAllImages");
    const query = buildSearchQuery(risk, "images");
    const broadQuery = buildSearchQuery(risk, "images_broad");

    const allImages = [];

    const [googleResult, wikiResult, wikiBroadResult] = await Promise.allSettled([
        fetchGoogleImages(query, MAX_IMAGES),
        fetchWikimediaImages(query, MAX_IMAGES),
        fetchWikimediaImages(broadQuery, 6)
    ]);

    if (googleResult.status === "fulfilled") allImages.push(...googleResult.value);
    if (wikiResult.status === "fulfilled") allImages.push(...wikiResult.value);
    if (wikiBroadResult.status === "fulfilled") allImages.push(...wikiBroadResult.value);

    if (articles && articles.length > 0) {
        allImages.push(...extractImagesFromArticles(articles));
    }

    const seen = new Set();
    const deduped = allImages.filter(img => {
        const key = (img.url || "").toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    let filtered = deduped;
    if (deduped.length > 0) {
        filtered = await geminiFilterImages(risk, deduped);
    }

    const result = filtered.slice(0, MAX_IMAGES);
    const ms = t.done({
        count: result.length,
        pre_filter: deduped.length,
        post_filter: filtered.length,
        google: googleResult.status === "fulfilled" ? googleResult.value.length : 0,
        wikimedia: wikiResult.status === "fulfilled" ? wikiResult.value.length : 0,
        article_imgs: articles ? extractImagesFromArticles(articles).length : 0
    });
    log("INFO", "IMAGES", `Assembled ${result.length} total images in ${ms}ms (filtered from ${deduped.length}).`);
    return result;
};


const fetchRedditPosts = async (query, limit) => {
    const t = timer(`Reddit "${query.substring(0, 40)}"`);
    const cacheKey = `reddit_${query}`;
    const cached = getCached(SEARCH_CACHE, cacheKey);
    if (cached) { t.done({ source: "cache", count: cached.length }); return cached; }
    try {
        const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=relevance&t=month&limit=${limit || MAX_SOCIAL}&raw_json=1`;
        const response = await fetchWithTimeout(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (compatible; RiskIntelligence/2.0; +https://riskintel.app)",
                "Accept": "application/json"
            }
        }, 10000);
        if (!response.ok) {
            log("WARN", "REDDIT", `Non-OK response: ${response.status}.`);
            t.done({ status: response.status, count: 0 });
            return [];
        }
        const data = await response.json();
        const posts = (data.data?.children || []).filter(c => c.data && !c.data.over_18).map(c => {
            const p = c.data;
            return {
                title: p.title,
                url: `https://reddit.com${p.permalink}`,
                subreddit: p.subreddit_name_prefixed,
                score: p.score,
                num_comments: p.num_comments,
                author: p.author,
                created_utc: p.created_utc ? new Date(p.created_utc * 1000).toISOString() : null,
                selftext_excerpt: p.selftext ? p.selftext.substring(0, 300) : null,
                thumbnail: p.thumbnail && p.thumbnail.startsWith("http") ? p.thumbnail : null,
                provider: "reddit"
            };
        });
        setCache(SEARCH_CACHE, cacheKey, posts);
        const ms = t.done({ count: posts.length });
        log("INFO", "REDDIT", `Found ${posts.length} posts in ${ms}ms.`);
        t.warn(8000, { count: posts.length });
        return posts;
    } catch (error) {
        logError("REDDIT", error);
        t.done({ error: error.message });
        return [];
    }
};


const fetchGDACSReport = async (eventType, eventId) => {
    const t = timer(`GDACS ${eventType}/${eventId}`);
    if (!eventType || !eventId) {
        log("DEBUG", "GDACS", "Skipped: Missing eventType or eventId.");
        return null;
    }
    const cacheKey = `gdacs_${eventType}_${eventId}`;
    const cached = getCached(SEARCH_CACHE, cacheKey);
    if (cached) { t.done({ source: "cache" }); return cached; }
    try {
        const url = `https://www.gdacs.org/gdacsapi/api/events/geteventdata?eventtype=${eventType}&eventid=${eventId}`;
        const response = await fetchWithTimeout(url, { headers: { "Accept": "application/json" } }, 20000);
        if (!response.ok) {
            log("WARN", "GDACS", `Non-OK response: ${response.status}.`);
            t.done({ status: response.status });
            return null;
        }
        const data = await response.json();
        setCache(SEARCH_CACHE, cacheKey, data);
        t.done({ success: true });
        log("INFO", "GDACS", `Report fetched for ${eventType}/${eventId}.`);
        return data;
    } catch (error) {
        logError("GDACS", error);
        t.done({ error: error.message });
        return null;
    }
};

const fetchUSGSEventDetail = async (eventId) => {
    const t = timer(`USGS ${eventId}`);
    if (!eventId) {
        log("DEBUG", "USGS", "Skipped: Missing eventId.");
        return null;
    }
    const cacheKey = `usgs_detail_${eventId}`;
    const cached = getCached(SEARCH_CACHE, cacheKey);
    if (cached) { t.done({ source: "cache" }); return cached; }
    try {
        const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&eventid=${eventId}`;
        const response = await fetchWithTimeout(url, {}, 20000);
        if (!response.ok) {
            log("WARN", "USGS", `Non-OK response: ${response.status}.`);
            t.done({ status: response.status });
            return null;
        }
        const data = await response.json();
        setCache(SEARCH_CACHE, cacheKey, data);
        t.done({ success: true });
        log("INFO", "USGS", `Event detail fetched for ${eventId}.`);
        return data;
    } catch (error) {
        logError("USGS", error);
        t.done({ error: error.message });
        return null;
    }
};

const fetchNOAAEventDetail = async (alertId) => {
    const t = timer(`NOAA ${alertId}`);
    if (!alertId) {
        log("DEBUG", "NOAA", "Skipped: Missing alertId.");
        return null;
    }
    const cacheKey = `noaa_detail_${alertId}`;
    const cached = getCached(SEARCH_CACHE, cacheKey);
    if (cached) { t.done({ source: "cache" }); return cached; }
    try {
        const url = `https://api.weather.gov/alerts/${alertId}`;
        const response = await fetchWithTimeout(url, { headers: { "User-Agent": "RiskIntelligence/2.0", "Accept": "application/geo+json" } }, 15000);
        if (!response.ok) {
            log("WARN", "NOAA", `Non-OK response: ${response.status}.`);
            t.done({ status: response.status });
            return null;
        }
        const data = await response.json();
        setCache(SEARCH_CACHE, cacheKey, data);
        t.done({ success: true });
        log("INFO", "NOAA", `Alert detail fetched for ${alertId}.`);
        return data;
    } catch (error) {
        logError("NOAA", error);
        t.done({ error: error.message });
        return null;
    }
};


const hydrateRiskRow = (row) => {
    const parse = (v) => {
        if (!v) return v;
        if (typeof v === "string") {
            try { return JSON.parse(v); } catch { return v; }
        }
        return v;
    };
    return {
        ...row,
        recommendations: parse(row.recommendations),
        metadata: parse(row.metadata),
        properties: parse(row.properties),
        golden_mesh_detection: parse(row.golden_mesh_detection),
        population_impact: parse(row.population_impact),
        geometry_coordinates: parse(row.geometry_coordinates),
        coordinates: parse(row.coordinates)
    };
};

const getRiskById = async (riskId) => {
    const t = timer(`DB getRiskById ${riskId}`);
    try {
        const result = await pool.query(
            `SELECT id, source, source_id, risk_category, severity, severity_score, title, description, geometry_type, geometry_coordinates, latitude, longitude, impact_radius_km, event_time, updated_at, expires_at, url, recommendations, metadata, properties, golden_mesh_detection, population_impact, coordinates FROM risk_events_cache WHERE id = $1 LIMIT 1`,
            [riskId]
        );
        if (result.rows.length) {
            t.done({ found: true, by: "id" });
            log("DEBUG", "DB", `Risk found by id: ${riskId}.`);
            return hydrateRiskRow(result.rows[0]);
        }
        log("DEBUG", "DB", `Risk not found by id, trying source_id: ${riskId}.`);
        const fallback = await pool.query(
            `SELECT id, source, source_id, risk_category, severity, severity_score, title, description, geometry_type, geometry_coordinates, latitude, longitude, impact_radius_km, event_time, updated_at, expires_at, url, recommendations, metadata, properties, golden_mesh_detection, population_impact, coordinates FROM risk_events_cache WHERE source_id = $1 LIMIT 1`,
            [riskId]
        );
        if (fallback.rows.length) {
            t.done({ found: true, by: "source_id" });
            log("DEBUG", "DB", `Risk found by source_id: ${riskId}.`);
            return hydrateRiskRow(fallback.rows[0]);
        }
        t.done({ found: false });
        log("WARN", "DB", `Risk not found: ${riskId}.`);
        return null;
    } catch (error) {
        logError("DB_GET_RISK", error);
        t.done({ error: error.message });
        return null;
    }
};

const getRelatedRisks = async (risk, limit) => {
    const t = timer("DB getRelatedRisks");
    try {
        const lat = parseFloat(risk.latitude);
        const lng = parseFloat(risk.longitude);
        if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
            log("DEBUG", "DB", "Skipped related risks: No valid lat/lng.", { lat: risk.latitude, lng: risk.longitude });
            return [];
        }
        const riskId = risk.id || risk.risk_id || risk.event_id || risk.source_id || "none";
        const radiusMeters = Math.min((parseFloat(risk.impact_radius_km) || 100) * 1000, 500000);
        const client = await pool.connect();
        try {
            await client.query("SET statement_timeout = '15000'");
            const result = await client.query(
                `SELECT id, source, risk_category, severity, severity_score, title, description, latitude, longitude, event_time, metadata, ST_Distance(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS distance_meters FROM risk_events_cache WHERE id != $3 AND latitude IS NOT NULL AND longitude IS NOT NULL AND ST_DWithin(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $4) ORDER BY severity_score DESC, distance_meters ASC LIMIT $5`,
                [lng, lat, riskId, radiusMeters, limit || 20]
            );
            client.release();
            const ms = t.done({ count: result.rows.length });
            log("INFO", "DB", `Found ${result.rows.length} related risks in ${ms}ms.`);
            return result.rows.map(row => ({
                ...row,
                distance_km: row.distance_meters ? parseFloat((row.distance_meters / 1000).toFixed(2)) : null,
                metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata
            }));
        } catch (queryError) {
            client.release();
            throw queryError;
        }
    } catch (error) {
        logError("DB_RELATED", error);
        t.done({ error: error.message });
        return [];
    }
};

const saveBriefingToDb = async (briefing, orgid, username) => {
    const t = timer("DB saveBriefing");
    try {
        await pool.query(
            `INSERT INTO intel_briefings (briefing_id, risk_id, orgid, created_by, risk_category, severity, title, ai_briefing, media_counts, research_counts, generation_time_ms, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW()) ON CONFLICT (briefing_id) DO NOTHING`,
            [
                briefing.briefing_id,
                briefing.risk_id,
                orgid || "system",
                username || "system",
                briefing.risk_event.risk_category,
                briefing.risk_event.severity,
                briefing.risk_event.title,
                JSON.stringify({}),
                JSON.stringify({ articles: briefing.media.articles.count, videos: briefing.media.videos.count, images: briefing.media.images.count }),
                JSON.stringify({ academic: briefing.research.academic_papers.count, reliefweb: briefing.research.reliefweb_reports.count, wikipedia: briefing.research.wikipedia.count }),
                briefing.generation_time_ms
            ]
        );
        t.done({ success: true });
        log("INFO", "DB", `Briefing ${briefing.briefing_id} saved successfully.`);
    } catch (error) {
        logError("DB_SAVE", error);
        t.done({ error: error.message });
    }
};


const resolveRiskId = (risk) => {
    if (!risk) return null;
    return risk.id || risk.risk_id || risk.event_id || risk.source_id || null;
};

const cacheRiskObject = (risk) => {
    if (!risk) return;
    const id = resolveRiskId(risk);
    if (id) {
        setCache(RISK_OBJECT_CACHE, id, risk);
    }
    if (risk.source_id && risk.source_id !== id) {
        setCache(RISK_OBJECT_CACHE, risk.source_id, risk);
    }
};

const resolveRisk = async (riskId, bodyRisk) => {
    if (bodyRisk && typeof bodyRisk === "object" && (bodyRisk.title || bodyRisk.risk_category)) {
        log("DEBUG", "RESOLVE", `Using risk object from request body for ${riskId}.`);
        cacheRiskObject(bodyRisk);
        return bodyRisk;
    }

    const cachedRisk = getCached(RISK_OBJECT_CACHE, riskId, CACHE_TTL_MS);
    if (cachedRisk) {
        log("DEBUG", "RESOLVE", `Using cached risk object for ${riskId}.`);
        return cachedRisk;
    }

    log("DEBUG", "RESOLVE", `Attempting DB lookup for ${riskId}.`);
    const dbRisk = await getRiskById(riskId);
    if (dbRisk) {
        cacheRiskObject(dbRisk);
        return dbRisk;
    }

    log("WARN", "RESOLVE", `Could not resolve risk ${riskId} from any source.`);
    return null;
};


const buildFullBriefing = async (risk) => {
    const briefingId = generateId("brief");
    const tTotal = timer(`FULL BRIEFING ${briefingId}`);
    const startTime = Date.now();

    log("INFO", "BRIEFING", `Starting briefing ${briefingId} for "${risk.title}".`, {
        risk_id: risk.id,
        category: risk.risk_category,
        severity: risk.severity,
        source: risk.source
    });

    const dateRange = extractDateRange(risk);
    const queries = {
        news: buildSearchQuery(risk, "news"),
        news_broad: buildSearchQuery(risk, "news_broad"),
        technical: buildSearchQuery(risk, "technical"),
        impact: buildSearchQuery(risk, "impact"),
        response: buildSearchQuery(risk, "response"),
        video: buildSearchQuery(risk, "video"),
        academic: buildSearchQuery(risk, "academic"),
        historical: buildSearchQuery(risk, "historical")
    };

    log("DEBUG", "BRIEFING", `Search queries built.`, { date_range: dateRange, query_count: Object.keys(queries).length });

    const collected = {
        articles: [],
        videos: [],
        images: [],
        academic: [],
        reddit: [],
        reliefweb: [],
        wikipedia: [],
        google_results: [],
        source_details: null,
        related_risks: []
    };

    const tFetch = timer("Parallel data fetching");
    const fetchLabels = [];

    const fetches = [
        fetchGDELT(queries.news, dateRange, MAX_ARTICLES).then(r => { collected.articles.push(...r); fetchLabels.push(`gdelt_news:${r.length}`); }),
        fetchGDELT(queries.news_broad, dateRange, 10).then(r => { collected.articles.push(...r); fetchLabels.push(`gdelt_broad:${r.length}`); }),
        fetchGDELT(queries.impact, dateRange, 10).then(r => { collected.articles.push(...r); fetchLabels.push(`gdelt_impact:${r.length}`); }),
        fetchGNews(queries.news, 10).then(r => { collected.articles.push(...r); fetchLabels.push(`gnews_news:${r.length}`); }),
        fetchGNews(queries.news_broad, 10).then(r => { collected.articles.push(...r); fetchLabels.push(`gnews_broad:${r.length}`); }),
        fetchGNews(queries.response, 10).then(r => { collected.articles.push(...r); fetchLabels.push(`gnews_response:${r.length}`); }),
        fetchYouTube(queries.video, dateRange, MAX_VIDEOS).then(r => { collected.videos = r; fetchLabels.push(`youtube:${r.length}`); }),
        fetchSemanticScholar(queries.academic, MAX_ACADEMIC).then(r => { collected.academic = r; fetchLabels.push(`scholar:${r.length}`); }),
        fetchRedditPosts(queries.news, MAX_SOCIAL).then(r => { collected.reddit = r; fetchLabels.push(`reddit:${r.length}`); }),
        fetchReliefWebReport(queries.news).then(r => { collected.reliefweb = r; fetchLabels.push(`reliefweb:${r.length}`); }),
        fetchWikipedia(queries.historical).then(r => { collected.wikipedia = r; fetchLabels.push(`wiki:${r.length}`); }),
        fetchGoogleSearch(queries.technical, 10).then(r => { collected.google_results = r; fetchLabels.push(`google:${r.length}`); }),
        getRelatedRisks(risk, 20).then(r => { collected.related_risks = r; fetchLabels.push(`related:${r.length}`); })
    ];

    if (risk.source === "USGS" && risk.source_id) {
        fetches.push(fetchUSGSEventDetail(risk.source_id).then(r => { collected.source_details = r; fetchLabels.push(`usgs:${r ? 1 : 0}`); }));
    }
    if (risk.source === "GDACS" && risk.metadata?.event_type && risk.source_id) {
        fetches.push(fetchGDACSReport(risk.metadata.event_type, risk.source_id).then(r => { collected.source_details = r; fetchLabels.push(`gdacs:${r ? 1 : 0}`); }));
    }
    if (risk.source === "NOAA_NWS" && risk.source_id) {
        fetches.push(fetchNOAAEventDetail(risk.source_id).then(r => { collected.source_details = r; fetchLabels.push(`noaa:${r ? 1 : 0}`); }));
    }

    log("INFO", "BRIEFING", `Launching ${fetches.length} parallel fetches.`);
    const fetchResults = await Promise.allSettled(fetches);
    const fetchMs = tFetch.done({ fetch_count: fetches.length });

    const fulfilled = fetchResults.filter(r => r.status === "fulfilled").length;
    const rejected = fetchResults.filter(r => r.status === "rejected").length;
    log("INFO", "BRIEFING", `Parallel fetches completed in ${fetchMs}ms: ${fulfilled} ok, ${rejected} failed.`, {
        results: fetchLabels.join(", "),
        rejected_reasons: fetchResults.filter(r => r.status === "rejected").map(r => r.reason?.message || "unknown")
    });

    const tProcess = timer("Post-processing");
    collected.articles = dedupeArticles(collected.articles);
    collected.articles = collected.articles.filter(a => isDateRelevant(a.publishedAt, risk));
    collected.articles.forEach(a => { a._score = scoreArticle(a, risk); });
    collected.articles.sort((a, b) => b._score - a._score);
    collected.articles = collected.articles.slice(0, MAX_ARTICLES);

    collected.videos = collected.videos.filter(v => isDateRelevant(v.publishedAt, risk));
    collected.videos.forEach(v => { v._score = scoreVideo(v, risk); });
    collected.videos.sort((a, b) => b._score - a._score);
    collected.videos = collected.videos.slice(0, MAX_VIDEOS);

    collected.images = await fetchAllImages(risk, collected.articles);

    tProcess.done({ articles: collected.articles.length, videos: collected.videos.length, images: collected.images.length });

    const briefing = {
        briefing_id: briefingId,
        risk_id: risk.id,
        risk_event: {
            id: risk.id,
            source: risk.source,
            source_id: risk.source_id,
            risk_category: risk.risk_category,
            severity: risk.severity,
            severity_score: risk.severity_score,
            title: risk.title,
            description: risk.description,
            latitude: risk.latitude,
            longitude: risk.longitude,
            impact_radius_km: risk.impact_radius_km,
            event_time: risk.event_time,
            updated_at: risk.updated_at,
            url: risk.url,
            recommendations: risk.recommendations,
            metadata: risk.metadata,
            population_impact: risk.population_impact,
            golden_mesh_detection: risk.golden_mesh_detection
        },
        media: {
            articles: { count: collected.articles.length, items: collected.articles },
            videos: { count: collected.videos.length, items: collected.videos },
            images: { count: collected.images.length, items: collected.images }
        },
        research: {
            academic_papers: { count: collected.academic.length, items: collected.academic },
            wikipedia: { count: collected.wikipedia.length, items: collected.wikipedia },
            reliefweb_reports: { count: collected.reliefweb.length, items: collected.reliefweb },
            google_results: { count: collected.google_results.length, items: collected.google_results }
        },
        social: {
            reddit: { count: collected.reddit.length, items: collected.reddit }
        },
        source_detail: collected.source_details,
        related_risks: { count: collected.related_risks.length, items: collected.related_risks },
        search_queries_used: queries,
        date_range: dateRange,
        generation_time_ms: Date.now() - startTime,
        generated_at: new Date().toISOString()
    };

    const totalMs = tTotal.done({
        articles: collected.articles.length,
        videos: collected.videos.length,
        images: collected.images.length,
        academic: collected.academic.length
    });

    log("INFO", "BRIEFING", `Briefing ${briefingId} complete in ${totalMs}ms.`, {
        fetch_time_ms: fetchMs,
        total_articles: collected.articles.length,
        total_videos: collected.videos.length,
        total_images: collected.images.length,
        total_academic: collected.academic.length,
        total_reddit: collected.reddit.length,
        total_reliefweb: collected.reliefweb.length,
        related_risks: collected.related_risks.length
    });

    return briefing;
};


router.post("/risk/intel/briefing/summary", async (req, res) => {
    const { risk } = req.body;
    const tReq = timer("POST /briefing/summary");

    if (!risk || !risk.title) {
        tReq.done({ error: "missing_risk" });
        return res.status(400).json({ success: false, message: "A risk object is required." });
    }

    log("INFO", "REQ", `POST /risk/intel/briefing/summary.`, { title: risk.title, category: risk.risk_category });
    cacheRiskObject(risk);

    const riskId = resolveRiskId(risk);
    const summaryCacheKey = `summary_${riskId || risk.title}`;
    const cached = getCached(SEARCH_CACHE, summaryCacheKey);
    if (cached) {
        const ms = tReq.done({ source: "cache" });
        log("INFO", "REQ", `Summary served from cache in ${ms}ms.`);
        return res.status(200).json({ success: true, cached: true, summary: cached });
    }

    log("INFO", "SUMMARY", `Generating summary directly from risk object (no prefetch).`, { title: risk.title, category: risk.risk_category, severity: risk.severity });

    let summary;
    try {
        summary = await generateAISummary(risk, { articles: [], reddit: [], academic: [], related: [] });
    } catch (geminiError) {
        log("ERROR", "SUMMARY", `generateAISummary threw: ${geminiError.message}.`, { stack: geminiError.stack?.split("\n").slice(0, 3).join(" | ") });
        summary = null;
    }

    if (!summary) {
        log("WARN", "SUMMARY", "generateAISummary returned null, building fallback.");
        summary = buildFallbackSummary(risk);
    }

    log("INFO", "SUMMARY", `Summary ready.`, { ai_generated: summary?.ai_generated || false, fallback: summary?.fallback || false });

    try {
        setCache(SEARCH_CACHE, summaryCacheKey, summary);
    } catch (cacheError) {
        log("WARN", "SUMMARY", `Cache set failed: ${cacheError.message}.`);
    }

    const ms = tReq.done({ success: true, ai_generated: summary?.ai_generated || false });
    log("INFO", "REQ", `Summary response sent in ${ms}ms.`, { ai_generated: summary?.ai_generated });
    return res.status(200).json({ success: true, cached: false, summary });
});

router.get("/risk/intel/briefing/:riskId", async (req, res) => {
    const riskId = req.params.riskId;
    const skipCache = req.query.skip_cache === "true";
    const tReq = timer(`GET /briefing/${riskId}`);

    log("INFO", "REQ", `GET /risk/intel/briefing/${riskId}.`, { skip_cache: skipCache, orgid: req.query.orgid });

    if (!skipCache) {
        const cached = getCached(BRIEFING_CACHE, riskId);
        if (cached) {
            const ms = tReq.done({ source: "cache" });
            log("INFO", "REQ", `Briefing served from cache in ${ms}ms.`, { risk_id: riskId });
            return res.status(200).json({ success: true, message: "Intelligence briefing retrieved from cache.", cached: true, ...cached });
        }
    }

    const risk = await resolveRisk(riskId, null);
    if (!risk) {
        tReq.done({ error: "not_found" });
        log("WARN", "REQ", `Risk not found: ${riskId}.`);
        return res.status(404).json({ success: false, message: `Risk event with ID '${sanitize(riskId, 100)}' was not found in the events cache.` });
    }

    try {
        const briefing = await buildFullBriefing(risk);
        setCache(BRIEFING_CACHE, riskId, briefing);
        await saveBriefingToDb(briefing, req.query.orgid, req.query.username);
        const ms = tReq.done({ success: true, generation_time_ms: briefing.generation_time_ms });
        log("INFO", "REQ", `Briefing response sent in ${ms}ms (generation: ${briefing.generation_time_ms}ms).`, { briefing_id: briefing.briefing_id });
        return res.status(200).json({ success: true, message: "Intelligence briefing generated successfully.", cached: false, ...briefing });
    } catch (error) {
        logError("REQ_BRIEFING", error);
        tReq.done({ error: error.message });
        return res.status(500).json({ success: false, message: "Failed to generate intelligence briefing." });
    }
});

router.post("/risk/intel/briefing", async (req, res) => {
    const { risk } = req.body;
    const tReq = timer("POST /briefing (with risk object)");

    if (!risk || !risk.title) {
        tReq.done({ error: "missing_risk" });
        return res.status(400).json({ success: false, message: "A risk object with at least a title is required." });
    }

    log("INFO", "REQ", `POST /risk/intel/briefing.`, { title: risk.title, category: risk.risk_category, severity: risk.severity });

    cacheRiskObject(risk);

    const riskId = resolveRiskId(risk);
    if (riskId) {
        const cached = getCached(BRIEFING_CACHE, riskId);
        if (cached) {
            const ms = tReq.done({ source: "cache" });
            log("INFO", "REQ", `Briefing served from cache in ${ms}ms.`, { risk_id: riskId });
            return res.status(200).json({ success: true, message: "Intelligence briefing retrieved from cache.", cached: true, ...cached });
        }
    }

    try {
        const briefing = await buildFullBriefing(risk);
        if (riskId) {
            setCache(BRIEFING_CACHE, riskId, briefing);
        }
        await saveBriefingToDb(briefing, req.body.orgid, req.body.username);
        const ms = tReq.done({ success: true, generation_time_ms: briefing.generation_time_ms });
        log("INFO", "REQ", `Briefing response sent in ${ms}ms (generation: ${briefing.generation_time_ms}ms).`, { briefing_id: briefing.briefing_id });
        return res.status(200).json({ success: true, message: "Intelligence briefing generated successfully.", cached: false, ...briefing });
    } catch (error) {
        logError("REQ_BRIEFING_POST", error);
        tReq.done({ error: error.message });
        return res.status(500).json({ success: false, message: "Failed to generate intelligence briefing." });
    }
});


router.post("/risk/intel/briefing/articles", async (req, res) => {
    const { risk, variant, limit: reqLimit } = req.body;
    const tReq = timer("POST /briefing/articles");

    if (!risk || !risk.title) {
        tReq.done({ error: "missing_risk" });
        return res.status(400).json({ success: false, message: "A risk object is required." });
    }

    log("INFO", "REQ", `POST /risk/intel/briefing/articles.`, { title: risk.title, variant, limit: reqLimit });
    cacheRiskObject(risk);

    const dateRange = extractDateRange(risk);
    const query = buildSearchQuery(risk, variant || "news");
    const broadQuery = buildSearchQuery(risk, "news_broad");
    const limit = parseInt(reqLimit, 10) || MAX_ARTICLES;
    try {
        const [gdelt, gdeltBroad, gnews, gnewsBroad] = await Promise.allSettled([
            fetchGDELT(query, dateRange, limit),
            fetchGDELT(broadQuery, dateRange, 10),
            fetchGNews(query, Math.min(limit, 10)),
            fetchGNews(broadQuery, Math.min(limit, 10))
        ]);
        let articles = [
            ...(gdelt.status === "fulfilled" ? gdelt.value : []),
            ...(gdeltBroad.status === "fulfilled" ? gdeltBroad.value : []),
            ...(gnews.status === "fulfilled" ? gnews.value : []),
            ...(gnewsBroad.status === "fulfilled" ? gnewsBroad.value : [])
        ];
        articles = dedupeArticles(articles);
        articles = articles.filter(a => isDateRelevant(a.publishedAt, risk));
        articles.forEach(a => { a._score = scoreArticle(a, risk); });
        articles.sort((a, b) => b._score - a._score);
        articles = articles.slice(0, limit);
        const relevanceResult = await geminiFilterRelevance(risk, articles, "articles");
        articles = relevanceResult.items;
        const ms = tReq.done({ count: articles.length, ai_filtered: relevanceResult.checked > 0 });
        log("INFO", "REQ", `Articles response: ${articles.length} items in ${ms}ms (AI filtered: ${relevanceResult.checked > 0}).`);
        return res.status(200).json({
            success: true,
            count: articles.length,
            query,
            date_range: dateRange,
            articles,
            relevance: { checked: relevanceResult.checked, relevant: relevanceResult.relevant }
        });
    } catch (error) {
        logError("REQ_ARTICLES_POST", error);
        tReq.done({ error: error.message });
        return res.status(500).json({ success: false, message: "Failed to fetch articles." });
    }
});

router.get("/risk/intel/briefing/:riskId/articles", async (req, res) => {
    const tReq = timer(`GET /briefing/${req.params.riskId}/articles`);
    log("INFO", "REQ", `GET /risk/intel/briefing/${req.params.riskId}/articles.`, { variant: req.query.variant, limit: req.query.limit });

    const risk = await resolveRisk(req.params.riskId, null);
    if (!risk) { tReq.done({ error: "not_found" }); return res.status(404).json({ success: false, message: "Risk event not found." }); }
    const dateRange = extractDateRange(risk);
    const query = buildSearchQuery(risk, req.query.variant || "news");
    const broadQuery = buildSearchQuery(risk, "news_broad");
    const limit = parseInt(req.query.limit, 10) || MAX_ARTICLES;
    try {
        const [gdelt, gdeltBroad, gnews, gnewsBroad] = await Promise.allSettled([
            fetchGDELT(query, dateRange, limit),
            fetchGDELT(broadQuery, dateRange, 10),
            fetchGNews(query, Math.min(limit, 10)),
            fetchGNews(broadQuery, Math.min(limit, 10))
        ]);
        let articles = [
            ...(gdelt.status === "fulfilled" ? gdelt.value : []),
            ...(gdeltBroad.status === "fulfilled" ? gdeltBroad.value : []),
            ...(gnews.status === "fulfilled" ? gnews.value : []),
            ...(gnewsBroad.status === "fulfilled" ? gnewsBroad.value : [])
        ];
        articles = dedupeArticles(articles);
        articles = articles.filter(a => isDateRelevant(a.publishedAt, risk));
        articles.forEach(a => { a._score = scoreArticle(a, risk); });
        articles.sort((a, b) => b._score - a._score);
        articles = articles.slice(0, limit);
        const relevanceResult = await geminiFilterRelevance(risk, articles, "articles");
        articles = relevanceResult.items;
        const ms = tReq.done({ count: articles.length });
        log("INFO", "REQ", `Articles response: ${articles.length} items in ${ms}ms.`);
        return res.status(200).json({ success: true, count: articles.length, query, date_range: dateRange, articles });
    } catch (error) {
        logError("REQ_ARTICLES", error);
        tReq.done({ error: error.message });
        return res.status(500).json({ success: false, message: "Failed to fetch articles." });
    }
});


router.post("/risk/intel/briefing/videos", async (req, res) => {
    const { risk, limit: reqLimit } = req.body;
    const tReq = timer("POST /briefing/videos");

    if (!risk || !risk.title) {
        tReq.done({ error: "missing_risk" });
        return res.status(400).json({ success: false, message: "A risk object is required." });
    }

    log("INFO", "REQ", `POST /risk/intel/briefing/videos.`, { title: risk.title });
    cacheRiskObject(risk);

    const dateRange = extractDateRange(risk);
    const query = buildSearchQuery(risk, "video");
    const limit = parseInt(reqLimit, 10) || MAX_VIDEOS;
    try {
        let videos = await fetchYouTube(query, dateRange, limit);
        videos = videos.filter(v => isDateRelevant(v.publishedAt, risk));
        videos.forEach(v => { v._score = scoreVideo(v, risk); });
        videos.sort((a, b) => b._score - a._score);
        const relevanceResult = await geminiFilterRelevance(risk, videos, "videos");
        const filteredVideos = relevanceResult.items;
        const ms = tReq.done({ count: filteredVideos.length, ai_filtered: relevanceResult.checked > 0 });
        log("INFO", "REQ", `Videos response: ${filteredVideos.length} items in ${ms}ms.`);
        return res.status(200).json({
            success: true,
            count: filteredVideos.length,
            query,
            date_range: dateRange,
            videos: filteredVideos,
            relevance: { checked: relevanceResult.checked, relevant: relevanceResult.relevant }
        });
    } catch (error) {
        logError("REQ_VIDEOS_POST", error);
        tReq.done({ error: error.message });
        return res.status(500).json({ success: false, message: "Failed to fetch videos." });
    }
});

router.get("/risk/intel/briefing/:riskId/videos", async (req, res) => {
    const tReq = timer(`GET /briefing/${req.params.riskId}/videos`);
    log("INFO", "REQ", `GET /risk/intel/briefing/${req.params.riskId}/videos.`);

    const risk = await resolveRisk(req.params.riskId, null);
    if (!risk) { tReq.done({ error: "not_found" }); return res.status(404).json({ success: false, message: "Risk event not found." }); }
    const dateRange = extractDateRange(risk);
    const query = buildSearchQuery(risk, "video");
    const limit = parseInt(req.query.limit, 10) || MAX_VIDEOS;
    try {
        let videos = await fetchYouTube(query, dateRange, limit);
        videos = videos.filter(v => isDateRelevant(v.publishedAt, risk));
        videos.forEach(v => { v._score = scoreVideo(v, risk); });
        videos.sort((a, b) => b._score - a._score);
        const relevanceResult = await geminiFilterRelevance(risk, videos, "videos");
        const filteredVideos = relevanceResult.items;
        const ms = tReq.done({ count: filteredVideos.length });
        log("INFO", "REQ", `Videos response: ${filteredVideos.length} items in ${ms}ms.`);
        return res.status(200).json({ success: true, count: filteredVideos.length, query, date_range: dateRange, videos: filteredVideos });
    } catch (error) {
        logError("REQ_VIDEOS", error);
        tReq.done({ error: error.message });
        return res.status(500).json({ success: false, message: "Failed to fetch videos." });
    }
});


router.post("/risk/intel/briefing/images", async (req, res) => {
    const { risk, limit: reqLimit } = req.body;
    const tReq = timer("POST /briefing/images");

    if (!risk || !risk.title) {
        tReq.done({ error: "missing_risk" });
        return res.status(400).json({ success: false, message: "A risk object is required." });
    }

    log("INFO", "REQ", `POST /risk/intel/briefing/images.`, { title: risk.title });
    cacheRiskObject(risk);

    try {
        const images = await fetchAllImages(risk, []);
        const ms = tReq.done({ count: images.length });
        log("INFO", "REQ", `Images response: ${images.length} items in ${ms}ms.`);
        return res.status(200).json({ success: true, count: images.length, images });
    } catch (error) {
        logError("REQ_IMAGES_POST", error);
        tReq.done({ error: error.message });
        return res.status(500).json({ success: false, message: "Failed to fetch images." });
    }
});

router.get("/risk/intel/briefing/:riskId/images", async (req, res) => {
    const tReq = timer(`GET /briefing/${req.params.riskId}/images`);
    log("INFO", "REQ", `GET /risk/intel/briefing/${req.params.riskId}/images.`);

    const risk = await resolveRisk(req.params.riskId, null);
    if (!risk) { tReq.done({ error: "not_found" }); return res.status(404).json({ success: false, message: "Risk event not found." }); }
    try {
        const images = await fetchAllImages(risk, []);
        const ms = tReq.done({ count: images.length });
        log("INFO", "REQ", `Images response: ${images.length} items in ${ms}ms.`);
        return res.status(200).json({ success: true, count: images.length, images });
    } catch (error) {
        logError("REQ_IMAGES", error);
        tReq.done({ error: error.message });
        return res.status(500).json({ success: false, message: "Failed to fetch images." });
    }
});


router.post("/risk/intel/briefing/academic", async (req, res) => {
    const { risk, limit: reqLimit } = req.body;
    const tReq = timer("POST /briefing/academic");

    if (!risk || !risk.title) {
        tReq.done({ error: "missing_risk" });
        return res.status(400).json({ success: false, message: "A risk object is required." });
    }

    log("INFO", "REQ", `POST /risk/intel/briefing/academic.`, { title: risk.title });
    cacheRiskObject(risk);

    const query = buildSearchQuery(risk, "academic");
    const limit = parseInt(reqLimit, 10) || MAX_ACADEMIC;
    try {
        const papers = await fetchSemanticScholar(query, limit);
        const ms = tReq.done({ count: papers.length });
        log("INFO", "REQ", `Academic response: ${papers.length} items in ${ms}ms.`);
        return res.status(200).json({ success: true, count: papers.length, query, papers });
    } catch (error) {
        logError("REQ_ACADEMIC_POST", error);
        tReq.done({ error: error.message });
        return res.status(500).json({ success: false, message: "Failed to fetch academic papers." });
    }
});

router.get("/risk/intel/briefing/:riskId/academic", async (req, res) => {
    const tReq = timer(`GET /briefing/${req.params.riskId}/academic`);
    log("INFO", "REQ", `GET /risk/intel/briefing/${req.params.riskId}/academic.`);

    const risk = await resolveRisk(req.params.riskId, null);
    if (!risk) { tReq.done({ error: "not_found" }); return res.status(404).json({ success: false, message: "Risk event not found." }); }
    const query = buildSearchQuery(risk, "academic");
    const limit = parseInt(req.query.limit, 10) || MAX_ACADEMIC;
    try {
        const papers = await fetchSemanticScholar(query, limit);
        const ms = tReq.done({ count: papers.length });
        log("INFO", "REQ", `Academic response: ${papers.length} items in ${ms}ms.`);
        return res.status(200).json({ success: true, count: papers.length, query, papers });
    } catch (error) {
        logError("REQ_ACADEMIC", error);
        tReq.done({ error: error.message });
        return res.status(500).json({ success: false, message: "Failed to fetch academic papers." });
    }
});


router.post("/risk/intel/briefing/social", async (req, res) => {
    const { risk, limit: reqLimit } = req.body;
    const tReq = timer("POST /briefing/social");

    if (!risk || !risk.title) {
        tReq.done({ error: "missing_risk" });
        return res.status(400).json({ success: false, message: "A risk object is required." });
    }

    log("INFO", "REQ", `POST /risk/intel/briefing/social.`, { title: risk.title });
    cacheRiskObject(risk);

    const query = buildSearchQuery(risk, "news");
    const limit = parseInt(reqLimit, 10) || MAX_SOCIAL;
    try {
        const reddit = await fetchRedditPosts(query, limit);
        const relevanceResult = await geminiFilterRelevance(risk, reddit, "social");
        const filteredReddit = relevanceResult.items;
        const ms = tReq.done({ count: filteredReddit.length, ai_filtered: relevanceResult.checked > 0 });
        log("INFO", "REQ", `Social response: ${filteredReddit.length} items in ${ms}ms.`);
        return res.status(200).json({
            success: true,
            count: filteredReddit.length,
            query,
            reddit: filteredReddit,
            relevance: { checked: relevanceResult.checked, relevant: relevanceResult.relevant }
        });
    } catch (error) {
        logError("REQ_SOCIAL_POST", error);
        tReq.done({ error: error.message });
        return res.status(500).json({ success: false, message: "Failed to fetch social posts." });
    }
});

router.get("/risk/intel/briefing/:riskId/social", async (req, res) => {
    const tReq = timer(`GET /briefing/${req.params.riskId}/social`);
    log("INFO", "REQ", `GET /risk/intel/briefing/${req.params.riskId}/social.`);

    const risk = await resolveRisk(req.params.riskId, null);
    if (!risk) { tReq.done({ error: "not_found" }); return res.status(404).json({ success: false, message: "Risk event not found." }); }
    const query = buildSearchQuery(risk, "news");
    const limit = parseInt(req.query.limit, 10) || MAX_SOCIAL;
    try {
        const reddit = await fetchRedditPosts(query, limit);
        const relevanceResult = await geminiFilterRelevance(risk, reddit, "social");
        const filteredReddit = relevanceResult.items;
        const ms = tReq.done({ count: filteredReddit.length });
        log("INFO", "REQ", `Social response: ${filteredReddit.length} items in ${ms}ms.`);
        return res.status(200).json({ success: true, count: filteredReddit.length, query, reddit: filteredReddit });
    } catch (error) {
        logError("REQ_SOCIAL", error);
        tReq.done({ error: error.message });
        return res.status(500).json({ success: false, message: "Failed to fetch social posts." });
    }
});


router.post("/risk/intel/briefing/related", async (req, res) => {
    const { risk, limit: reqLimit } = req.body;
    const tReq = timer("POST /briefing/related");

    if (!risk || !risk.title) {
        tReq.done({ error: "missing_risk" });
        return res.status(400).json({ success: false, message: "A risk object is required." });
    }

    log("INFO", "REQ", `POST /risk/intel/briefing/related.`, { title: risk.title, lat: risk.latitude, lng: risk.longitude });
    cacheRiskObject(risk);

    const limit = parseInt(reqLimit, 10) || 20;

    let resolvedRisk = risk;
    if ((!risk.latitude || !risk.longitude) && (risk.id || risk.risk_id || risk.source_id)) {
        const dbRisk = await getRiskById(risk.id || risk.risk_id || risk.source_id);
        if (dbRisk && dbRisk.latitude && dbRisk.longitude) {
            resolvedRisk = { ...risk, latitude: dbRisk.latitude, longitude: dbRisk.longitude, impact_radius_km: dbRisk.impact_radius_km || risk.impact_radius_km };
            log("INFO", "REQ", `Resolved lat/lng from DB for related risks query.`, { lat: resolvedRisk.latitude, lng: resolvedRisk.longitude });
        }
    }

    if (!resolvedRisk.latitude || !resolvedRisk.longitude) {
        tReq.done({ error: "no_coordinates" });
        log("WARN", "REQ", `Cannot fetch related risks: No coordinates available.`, { title: risk.title });
        return res.status(200).json({ success: true, count: 0, radius_km: risk.impact_radius_km || 100, related: [], message: "No coordinates available for this risk event to find related risks." });
    }

    try {
        const related = await getRelatedRisks(resolvedRisk, limit);
        const ms = tReq.done({ count: related.length });
        log("INFO", "REQ", `Related response: ${related.length} items in ${ms}ms.`);
        return res.status(200).json({ success: true, count: related.length, radius_km: resolvedRisk.impact_radius_km || 100, related });
    } catch (error) {
        logError("REQ_RELATED_POST", error);
        tReq.done({ error: error.message });
        return res.status(500).json({ success: false, message: "Failed to fetch related risks." });
    }
});

router.get("/risk/intel/briefing/:riskId/related", async (req, res) => {
    const tReq = timer(`GET /briefing/${req.params.riskId}/related`);
    log("INFO", "REQ", `GET /risk/intel/briefing/${req.params.riskId}/related.`);
    const risk = await resolveRisk(req.params.riskId, null);
    if (!risk) { tReq.done({ error: "not_found" }); return res.status(404).json({ success: false, message: "Risk event not found." }); }
    const limit = parseInt(req.query.limit, 10) || 20;
    try {
        const related = await getRelatedRisks(risk, limit);
        const ms = tReq.done({ count: related.length });
        return res.status(200).json({ success: true, count: related.length, radius_km: risk.impact_radius_km || 100, related });
    } catch (error) {
        logError("REQ_RELATED", error);
        tReq.done({ error: error.message });
        return res.status(500).json({ success: false, message: "Failed to fetch related risks." });
    }
});


router.post("/risk/intel/search", async (req, res) => {
    const tReq = timer("POST /risk/intel/search");
    const { query, types, limit } = req.body;
    if (!query) { tReq.done({ error: "missing_query" }); return res.status(400).json({ success: false, message: "The query field is required." }); }
    const dateRange = { from: new Date(Date.now() - 30 * 864e5).toISOString().split("T")[0], to: new Date().toISOString().split("T")[0] };
    const maxItems = Math.min(limit || 20, 50);
    const requestedTypes = types || ["articles", "videos", "academic"];
    const results = {};
    const fetches = [];
    if (requestedTypes.includes("articles")) {
        fetches.push(Promise.allSettled([fetchGDELT(query, dateRange, maxItems), fetchGNews(query, Math.min(maxItems, 10))]).then(([g, n]) => {
            let articles = [...(g.status === "fulfilled" ? g.value : []), ...(n.status === "fulfilled" ? n.value : [])];
            results.articles = dedupeArticles(articles).slice(0, maxItems);
        }));
    }
    if (requestedTypes.includes("videos")) fetches.push(fetchYouTube(query, dateRange, maxItems).then(v => { results.videos = v; }));
    if (requestedTypes.includes("images")) fetches.push(fetchWikimediaImages(query, Math.min(maxItems, MAX_IMAGES)).then(i => { results.images = i; }));
    if (requestedTypes.includes("academic")) fetches.push(fetchSemanticScholar(query, maxItems).then(p => { results.academic = p; }));
    if (requestedTypes.includes("reddit")) fetches.push(fetchRedditPosts(query, maxItems).then(r => { results.reddit = r; }));
    if (requestedTypes.includes("reliefweb")) fetches.push(fetchReliefWebReport(query).then(r => { results.reliefweb = r; }));
    if (requestedTypes.includes("wikipedia")) fetches.push(fetchWikipedia(query).then(w => { results.wikipedia = w; }));
    if (requestedTypes.includes("google")) fetches.push(fetchGoogleSearch(query, maxItems).then(g => { results.google = g; }));
    await Promise.allSettled(fetches);
    const totalItems = Object.values(results).reduce((s, v) => s + (Array.isArray(v) ? v.length : 0), 0);
    tReq.done({ total: totalItems, types: Object.keys(results) });
    return res.status(200).json({ success: true, message: `Found ${totalItems} results across ${Object.keys(results).length} source types.`, query, total: totalItems, results });
});


router.get("/risk/intel/trending", async (req, res) => {
    const tReq = timer("GET /risk/intel/trending");
    const hours = parseInt(req.query.hours, 10) || 24;
    const limit = parseInt(req.query.limit, 10) || 20;
    try {
        const result = await pool.query(`SELECT risk_category, severity, COUNT(*) AS event_count, AVG(severity_score) AS avg_severity_score, MIN(event_time) AS earliest_event, MAX(event_time) AS latest_event FROM risk_events_cache WHERE event_time > NOW() - INTERVAL '1 hour' * $1 GROUP BY risk_category, severity ORDER BY avg_severity_score DESC, event_count DESC LIMIT $2`, [hours, limit]);
        const catResult = await pool.query(`SELECT risk_category, COUNT(*) AS count, AVG(severity_score) AS avg_score FROM risk_events_cache WHERE event_time > NOW() - INTERVAL '1 hour' * $1 GROUP BY risk_category ORDER BY avg_score DESC`, [hours]);
        const topEvents = await pool.query(`SELECT id, source, risk_category, severity, severity_score, title, latitude, longitude, event_time, metadata FROM risk_events_cache WHERE event_time > NOW() - INTERVAL '1 hour' * $1 ORDER BY severity_score DESC LIMIT $2`, [hours, limit]);
        tReq.done({ categories: catResult.rows.length, top_events: topEvents.rows.length });
        return res.status(200).json({ success: true, message: `Trending risk intelligence for the past ${hours} hours.`, time_window_hours: hours, category_trends: catResult.rows.map(r => ({ ...r, count: parseInt(r.count, 10), avg_score: parseFloat(r.avg_score) })), severity_breakdown: result.rows.map(r => ({ ...r, event_count: parseInt(r.event_count, 10), avg_severity_score: parseFloat(r.avg_severity_score) })), top_events: topEvents.rows.map(r => ({ ...r, metadata: typeof r.metadata === "string" ? JSON.parse(r.metadata) : r.metadata })) });
    } catch (error) {
        logError("REQ_TRENDING", error);
        tReq.done({ error: error.message });
        return res.status(500).json({ success: false, message: "Failed to retrieve trending intelligence." });
    }
});

router.get("/risk/intel/briefings/history", async (req, res) => {
    const tReq = timer("GET /risk/intel/briefings/history");
    const orgid = req.query.orgid;
    const limit = parseInt(req.query.limit, 10) || 50;
    try {
        const qp = [];
        let pi = 1;
        let whereClause = "";
        if (orgid) {
            whereClause = ` WHERE orgid = ${pi}`;
            qp.push(orgid);
            pi++;
        }
        const sql = `SELECT briefing_id, risk_id, orgid, created_by, risk_category, severity, title, media_counts, research_counts, generation_time_ms, created_at FROM intel_briefings${whereClause} ORDER BY created_at DESC LIMIT ${pi}`;
        qp.push(limit);
        const result = await pool.query(sql, qp);
        tReq.done({ count: result.rows.length });
        return res.status(200).json({ success: true, count: result.rows.length, briefings: result.rows.map(r => ({ ...r, media_counts: typeof r.media_counts === "string" ? JSON.parse(r.media_counts) : r.media_counts, research_counts: typeof r.research_counts === "string" ? JSON.parse(r.research_counts) : r.research_counts })) });
    } catch (error) {
        logError("REQ_HISTORY", error);
        tReq.done({ error: error.message });
        return res.status(500).json({ success: false, message: "Failed to retrieve briefing history." });
    }
});


router.get("/risk/intel/cache/clear", async (req, res) => {
    if (req.query.api_key !== process.env.ADMIN_API_KEY) { return res.status(401).json({ success: false, message: "Unauthorized." }); }
    const bSize = BRIEFING_CACHE.size;
    const sSize = SEARCH_CACHE.size;
    const rSize = RISK_OBJECT_CACHE.size;
    BRIEFING_CACHE.clear();
    SEARCH_CACHE.clear();
    RISK_OBJECT_CACHE.clear();
    return res.status(200).json({ success: true, message: "Intel caches cleared.", briefing_entries_cleared: bSize, search_entries_cleared: sSize, risk_object_entries_cleared: rSize });
});

router.get("/risk/intel/sources", async (req, res) => {
    const apiStatus = {
        gnews: !!process.env.GNEWS_API_KEY,
        youtube: !!process.env.YOUTUBE_DATA_API_KEY,
        google_cse: !!process.env.GOOGLE_CUSTOM_SEARCH_KEY && !!process.env.GOOGLE_CUSTOM_SEARCH_CX,
        gemini: !!process.env.GEMINI_API_KEY,
        semantic_scholar: !!process.env.SEMANTIC_SCHOLAR_API_KEY
    };
    const freeApis = { gdelt: true, wikipedia: true, wikimedia_images: true, reddit: true, reliefweb: true, usgs_detail: true, gdacs_detail: true, noaa_detail: true };
    return res.status(200).json({ success: true, message: "Intel source configuration status.", configured_apis: apiStatus, free_apis: freeApis, total_configured: Object.values(apiStatus).filter(Boolean).length + Object.keys(freeApis).length, capabilities: { news_search: true, news_search_enhanced: apiStatus.gnews, video_search: apiStatus.youtube, image_search: true, academic_search: true, social_search: true, humanitarian_reports: true, ai_summary: apiStatus.gemini, ai_relevance_filtering: apiStatus.gemini }, cache_status: { briefing_entries: BRIEFING_CACHE.size, search_entries: SEARCH_CACHE.size, risk_object_entries: RISK_OBJECT_CACHE.size, cache_ttl_minutes: CACHE_TTL_MS / 60000 } });
});

router.get("/risk/intel/health", async (req, res) => {
    const tReq = timer("GET /risk/intel/health");
    const checks = [];
    const testFns = [
        { name: "PostGIS Database", fn: async () => { await pool.query("SELECT 1"); return true; } },
        { name: "GDELT", fn: async () => { const r = await fetchWithTimeout("https://api.gdeltproject.org/api/v2/doc/doc?query=test&mode=ArtList&maxrecords=1&format=json", {}, 10000); return r.ok; } },
        { name: "GNews", fn: async () => { if (!process.env.GNEWS_API_KEY) return "not_configured"; const r = await fetchWithTimeout(`https://gnews.io/api/v4/search?q=test&lang=en&max=1&apikey=${process.env.GNEWS_API_KEY}`, {}, 5000); return r.ok; } },
        { name: "YouTube Data API", fn: async () => { if (!process.env.YOUTUBE_DATA_API_KEY) return "not_configured"; const r = await fetchWithTimeout(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=test&maxResults=1&key=${process.env.YOUTUBE_DATA_API_KEY}`, {}, 5000); return r.ok; } },
        { name: "Gemini AI", fn: async () => { if (!process.env.GEMINI_API_KEY) return "not_configured"; const r = await fetchWithTimeout(`${GEMINI_BASE_URL}/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: "ping" }] }], generationConfig: { maxOutputTokens: 10 } }) }, 10000); return r.ok; } },
        { name: "Wikimedia Commons", fn: async () => { const r = await fetchWithTimeout("https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=test&gsrlimit=1&gsrnamespace=6&prop=imageinfo&iiprop=url&format=json&origin=*", {}, 5000); return r.ok; } },
        { name: "Wikipedia", fn: async () => { const r = await fetchWithTimeout("https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=test&srlimit=1&format=json&origin=*", {}, 5000); return r.ok; } },
        { name: "Semantic Scholar", fn: async () => { const r = await fetchWithTimeout("https://api.semanticscholar.org/graph/v1/paper/search?query=test&limit=1", {}, 5000); return r.ok; } },
        { name: "ReliefWeb", fn: async () => { const r = await fetchWithTimeout("https://api.reliefweb.int/v1/reports?appname=risk-intel", { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json", "User-Agent": "RiskIntelligence/2.0 (risk-intel)" }, body: JSON.stringify({ appname: "risk-intel", limit: 1, fields: { include: ["title"] } }) }, 5000); if (r.ok) return true; const gr = await fetchWithTimeout("https://api.reliefweb.int/v1/reports?appname=risk-intel&limit=1", { method: "GET", headers: { "Accept": "application/json", "User-Agent": "RiskIntelligence/2.0 (risk-intel)" } }, 5000); return gr.ok; } },
        { name: "Reddit", fn: async () => { const r = await fetchWithTimeout("https://www.reddit.com/search.json?q=test&limit=1&raw_json=1", { headers: { "User-Agent": "Mozilla/5.0 (compatible; RiskIntelligence/2.0; +https://riskintel.app)", "Accept": "application/json" } }, 5000); return r.ok; } }
    ];
    for (const testItem of testFns) {
        const st = Date.now();
        try {
            const result = await testItem.fn();
            const elapsed = Date.now() - st;
            checks.push({ name: testItem.name, status: result === "not_configured" ? "NOT_CONFIGURED" : result ? "OK" : "ERROR", response_time_ms: elapsed });
        } catch (error) {
            checks.push({ name: testItem.name, status: "FAILED", error: error.message, response_time_ms: Date.now() - st });
        }
    }
    const healthy = checks.filter(c => c.status === "OK").length;
    const configured = checks.filter(c => c.status !== "NOT_CONFIGURED").length;
    tReq.done({ healthy, configured, total: checks.length });
    return res.status(healthy > 0 ? 200 : 503).json({ success: healthy > 0, message: `${healthy} of ${configured} configured services are healthy.`, timestamp: new Date().toISOString(), cache_status: { briefing_entries: BRIEFING_CACHE.size, search_entries: SEARCH_CACHE.size, risk_object_entries: RISK_OBJECT_CACHE.size }, checks });
});

module.exports = router;