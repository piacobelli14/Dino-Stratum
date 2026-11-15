const os = require("os");
const zlib = require("zlib");
const crypto = require("crypto");
const { monitorEventLoopDelay } = require("perf_hooks");
const https = require("https");
const httpModule = require("http");
const { Readable } = require("stream");
const express = require("express");
const { pool } = require("../config/db");

const readInt = (name, fallback) => {
  const value = parseInt(process.env[name], 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const megabytes = (name, fallback) => readInt(name, fallback) * 1024 * 1024;

const config = {
  mode: String(process.env.HARVEST_MODE || "embedded").toLowerCase(),
  instanceId: process.env.HARVEST_INSTANCE_ID || `${os.hostname()}-${process.pid}`,
  concurrency: readInt("HARVEST_CONCURRENCY", 2),
  discoveryConcurrency: readInt("HARVEST_DISCOVERY_CONCURRENCY", 3),
  frontierConcurrency: readInt("HARVEST_FRONTIER_CONCURRENCY", 1),
  tickMs: readInt("HARVEST_TICK_MS", 3000),
  maxLagMs: readInt("HARVEST_MAX_LAG_MS", 150),
  priorityAgingSeconds: readInt("HARVEST_PRIORITY_AGING_SECONDS", 600),
  maxPriorityAging: readInt("HARVEST_MAX_PRIORITY_AGING", 4),
  leaseSeconds: readInt("HARVEST_LEASE_SECONDS", 300),
  maxObjectBytes: megabytes("HARVEST_MAX_OBJECT_MB", 20),
  maxRawBytes: megabytes("HARVEST_MAX_RAW_MB", 64),
  maxListingBytes: megabytes("HARVEST_MAX_LISTING_MB", 4),
  maxSectionChars: readInt("HARVEST_MAX_SECTION_KB", 512) * 1024,
  requestTimeoutMs: readInt("HARVEST_TIMEOUT_MS", 30000),
  storageBudgetBytes: megabytes("HARVEST_STORAGE_BUDGET_MB", 2048),
  productSeenRefreshSeconds: readInt("HARVEST_PRODUCT_SEEN_REFRESH_SECONDS", 3600),
  defaultHostIntervalMs: readInt("HARVEST_HOST_INTERVAL_MS", 1000),
  maxHostWaitMs: readInt("HARVEST_MAX_HOST_WAIT_MS", 15000),
  eventRetentionDays: readInt("HARVEST_EVENT_RETENTION_DAYS", 14),
  renderTargetPx: readInt("HARVEST_RENDER_TARGET_PX", 1024),
  batchSize: readInt("HARVEST_BATCH_SIZE", 250),
  userAgent: process.env.HARVEST_USER_AGENT || process.env.WEATHER_API_USER_AGENT || "DinoSat Harvester",
  adminToken: process.env.HARVEST_ADMIN_TOKEN || ""
};

class HarvestError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "HarvestError";
    this.details = details || {};
  }
}

class HttpStatusError extends HarvestError {
  constructor(url, status, retryAfterMs, headers) {
    super(`The host ${hostOf(url)} returned HTTP ${status} for ${(() => { try { return new URL(url).pathname; } catch { return "the request"; } })()}.`, { url, status });
    this.name = "HttpStatusError";
    this.status = status;
    this.retryAfterMs = retryAfterMs || null;
    this.headers = headers || {};
  }
}

class TooLargeError extends HarvestError {
  constructor(url, limitBytes) {
    super(`The response from ${hostOf(url)} exceeded the ${Math.round(limitBytes / 1048576)} MB limit.`, { url });
    this.name = "TooLargeError";
  }
}

class DeferError extends HarvestError {
  constructor(delayMs, message) {
    super(message || "The job was deferred until the host allows another request.");
    this.name = "DeferError";
    this.delayMs = delayMs;
  }
}

class PermanentError extends HarvestError {
  constructor(message, details) {
    super(message, details);
    this.name = "PermanentError";
  }
}

const isPermanent = (error) => {
  if (error instanceof PermanentError || error instanceof TooLargeError) return true;
  if (error instanceof HttpStatusError) return error.status >= 400 && error.status < 500 && ![408, 425, 429].includes(error.status);
  return false;
};

const SMALL_WORDS = new Set(["a", "an", "the", "and", "or", "of", "in", "on", "at", "to", "for", "by", "with", "via", "per", "from"]);

const ACRONYMS = new Set(["ABI", "AHI", "AMI", "AIA", "HMI", "EIT", "SUVI", "LASCO", "CCOR", "GLM", "GOES", "SDO", "SOHO", "STEREO", "COR", "EUVI", "NOAA", "NASA", "ESA", "JMA", "KMA", "MSG", "MTG", "IODC", "FES", "RSS", "RGB", "CONUS", "PACUS", "IR", "WV", "VIIRS", "MODIS", "SNPP", "NPP", "AMSR", "OLCI", "CMIP", "MCMIP", "LRPT", "NORAD", "UTC", "EPIC", "DSCOVR", "OVATION", "ENLIL", "GIBS", "TEC", "LST", "SST", "AOD", "UV", "L1B", "L2", "L1C", "L2A", "FD", "DNB"]);

const slug = (value) => String(value || "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 160);

const titleCase = (value) => {
  const words = String(value || "")
    .replace(/[_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/\s+/)
    .filter(Boolean);
  return words.map((word, index) => {
    const upper = word.toUpperCase();
    if (ACRONYMS.has(upper)) return upper;
    if (/^[A-Z0-9-]+$/.test(word) && word.length <= 5 && /[A-Z]/.test(word)) return word;
    const lower = word.toLowerCase();
    if (index > 0 && SMALL_WORDS.has(lower)) return lower;
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }).join(" ");
};

const cleanMessage = (error) => String(error && error.message ? error.message : error || "Unknown Error").replace(/\.$/, "").slice(0, 400);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

const hostOf = (url) => {
  try {
    return new URL(url).host;
  } catch (error) {
    return "an unknown host";
  }
};

const validDate = (date) => date instanceof Date && !Number.isNaN(date.getTime()) && date.getUTCFullYear() >= 1990 && date.getUTCFullYear() <= 2100;

const fromJulian = (year, doy, hour, minute, second) => {
  if (doy < 1 || doy > 366 || hour > 23 || minute > 59 || second > 60) return null;
  const date = new Date(Date.UTC(year, 0, 1, hour, minute, second));
  date.setUTCDate(date.getUTCDate() + doy - 1);
  return validDate(date) && date.getUTCFullYear() === year ? date : null;
};

const fromParts = (year, month, day, hour, minute, second) => {
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 60) return null;
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return validDate(date) && date.getUTCMonth() === month - 1 ? date : null;
};

const n = (value) => (value === undefined || value === null || value === "" ? 0 : parseInt(value, 10));

const PATTERNS = [
  { name: "goes-scan", re: /_s(\d{4})(\d{3})(\d{2})(\d{2})(\d{2})\d?(?=[_.])/, build: (m) => fromJulian(n(m[1]), n(m[2]), n(m[3]), n(m[4]), n(m[5])) },
  { name: "iso-compact", re: /(?<!\d)(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/, build: (m) => fromParts(n(m[1]), n(m[2]), n(m[3]), n(m[4]), n(m[5]), n(m[6])) },
  { name: "star-julian", re: /(?<![\d])(\d{4})(\d{3})(\d{2})(\d{2})(?=_)/, build: (m) => fromJulian(n(m[1]), n(m[2]), n(m[3]), n(m[4]), 0) },
  { name: "ymd-hms", re: /(?<!\d)(\d{4})(\d{2})(\d{2})[_-](\d{2})(\d{2})(\d{2})?(?!\d)/, build: (m) => fromParts(n(m[1]), n(m[2]), n(m[3]), n(m[4]), n(m[5]), n(m[6])) },
  { name: "ymdhm", re: /(?<!\d)(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(?!\d)/, build: (m) => fromParts(n(m[1]), n(m[2]), n(m[3]), n(m[4]), n(m[5]), n(m[6])) },
  { name: "iso", re: /(\d{4})-(\d{2})-(\d{2})[T _](\d{2}):?(\d{2})(?::?(\d{2}))?/, build: (m) => fromParts(n(m[1]), n(m[2]), n(m[3]), n(m[4]), n(m[5]), n(m[6])) },
  { name: "date-only", re: /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?![\d:T])/, build: (m) => fromParts(n(m[1]), n(m[2]), n(m[3]), 0, 0, 0) }
];

const DURATION_RE = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;

const expandPeriod = (range, count, limit = new Date()) => {
  const [startText, endText, period] = String(range || "").split("/");
  const match = (period || "").match(DURATION_RE);
  const start = parseAnyDate(startText);
  const end = parseAnyDate(endText);
  if (!match || !start || !end || count <= 0) return [];
  const [, y, mo, w, d, h, mi, s] = match.map((value) => Number(value) || 0);
  const calendar = y > 0 || mo > 0;
  const fixedMs = (((w * 7 + d) * 24 + h) * 3600 + mi * 60 + s) * 1000;
  if (!calendar && fixedMs <= 0) return [];
  const dateOnly = !/T/.test(endText);
  const format = (date) => (dateOnly ? date.toISOString().slice(0, 10) : date.toISOString().replace(/\.\d{3}Z$/, "Z"));
  const back = (date) => {
    const next = new Date(date.getTime());
    if (calendar) {
      next.setUTCFullYear(next.getUTCFullYear() - y);
      next.setUTCMonth(next.getUTCMonth() - mo);
    }
    return new Date(next.getTime() - fixedMs);
  };
  let cursor = end;
  if (cursor > limit) {
    if (!calendar) cursor = new Date(end.getTime() - Math.ceil((end.getTime() - limit.getTime()) / fixedMs) * fixedMs);
    let guard = 0;
    while (cursor > limit && guard < 1000) {
      cursor = back(cursor);
      guard += 1;
    }
  }
  const out = [];
  while (cursor >= start && out.length < count) {
    out.push(format(cursor));
    cursor = back(cursor);
  }
  return out.reverse();
};

const parseTimestamp = (text, names) => {
  const value = String(text || "");
  const patterns = names ? PATTERNS.filter((pattern) => names.includes(pattern.name)) : PATTERNS;
  for (const pattern of patterns) {
    const match = value.match(pattern.re);
    if (!match) continue;
    const date = pattern.build(match);
    if (date) return date;
  }
  return null;
};

const parseAnyDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return validDate(value) ? value : null;
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(text)) {
    const direct = new Date(/Z$|[+-]\d{2}:?\d{2}$/.test(text) ? text : `${text.replace(" ", "T")}Z`);
    if (validDate(direct)) return direct;
  }
  return parseTimestamp(text);
};

const pathTimeRange = (segments) => {
  const state = {};
  for (const segment of segments) {
    if (state.year === undefined && /^\d{6}$/.test(segment)) {
      const year = n(segment.slice(0, 4));
      const month = n(segment.slice(4));
      if (year >= 1990 && year <= 2100 && month >= 1 && month <= 12) {
        state.year = year;
        state.month = month;
        continue;
      }
    }
    if (state.year === undefined && /^\d{4}$/.test(segment)) {
      const year = n(segment);
      if (year >= 1990 && year <= 2100) {
        state.year = year;
        continue;
      }
    }
    if (state.year === undefined) continue;
    if (/^\d{3}$/.test(segment) && state.doy === undefined && state.month === undefined) {
      state.doy = n(segment);
      continue;
    }
    if (/^\d{2}$/.test(segment)) {
      if (state.doy === undefined && state.month === undefined) {
        state.month = n(segment);
        continue;
      }
      if (state.month !== undefined && state.day === undefined) {
        state.day = n(segment);
        continue;
      }
      if (state.hour === undefined) {
        state.hour = n(segment);
        continue;
      }
    }
    if (/^\d{4}$/.test(segment) && state.hour === undefined && (state.day !== undefined || state.doy !== undefined)) {
      state.hour = n(segment.slice(0, 2));
      state.minute = n(segment.slice(2));
    }
  }
  if (state.year === undefined) return null;
  const span = state.minute !== undefined ? 600000 : state.hour !== undefined ? 3600000 : 86400000;
  if (state.doy !== undefined) {
    const start = fromJulian(state.year, state.doy, state.hour || 0, state.minute || 0, 0);
    return start ? { start, end: new Date(start.getTime() + span) } : null;
  }
  if (state.day !== undefined) {
    const start = fromParts(state.year, state.month, state.day, state.hour || 0, state.minute || 0, 0);
    return start ? { start, end: new Date(start.getTime() + span) } : null;
  }
  if (state.month !== undefined) {
    const start = fromParts(state.year, state.month, 1, 0, 0, 0);
    return start ? { start, end: new Date(Date.UTC(state.year, state.month, 1)) } : null;
  }
  return { start: new Date(Date.UTC(state.year, 0, 1)), end: new Date(Date.UTC(state.year + 1, 0, 1)) };
};

const decodeXml = (value) => String(value || "")
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&quot;/g, "\"")
  .replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (m, code) => String.fromCharCode(parseInt(code, 10)))
  .replace(/&amp;/g, "&")
  .trim();

const tagPattern = (tag, flags) => new RegExp(`<(?:[\\w-]+:)?${tag}(\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tag}>`, flags);

const tagText = (xml, tag) => {
  const match = String(xml || "").match(tagPattern(tag, ""));
  return match ? decodeXml(match[2]) : null;
};

const tagTexts = (xml, tag) => {
  const values = [];
  const re = tagPattern(tag, "g");
  let match;
  while ((match = re.exec(String(xml || ""))) !== null) values.push(decodeXml(match[2]));
  return values;
};

const tagBlocks = (xml, tag) => {
  const blocks = [];
  const re = tagPattern(tag, "g");
  let match;
  while ((match = re.exec(String(xml || ""))) !== null) blocks.push({ attrs: match[1] || "", inner: match[2] });
  return blocks;
};

const attrValue = (attrs, name) => {
  const match = String(attrs || "").match(new RegExp(`(?:^|\\s)(?:[\\w-]+:)?${name}\\s*=\\s*"([^"]*)"`));
  return match ? decodeXml(match[1]) : null;
};

const selfClosingAttrs = (xml, tag) => {
  const values = [];
  const re = new RegExp(`<(?:[\\w-]+:)?${tag}(\\s[^>]*?)\\/?>`, "g");
  let match;
  while ((match = re.exec(String(xml || ""))) !== null) values.push(match[1] || "");
  return values;
};

const createLeafScanner = (tag, onLeaf, maxChars) => {
  const openRe = new RegExp(`<(?:[\\w-]+:)?${tag}[\\s>]`, "g");
  const closeRe = new RegExp(`<\\/(?:[\\w-]+:)?${tag}>`, "g");
  let buffer = "";
  let scanFrom = 0;
  let depth = 0;
  let leafStart = -1;
  let hasChild = false;
  let overflowed = 0;
  const process = () => {
    let cursor = scanFrom;
    while (true) {
      openRe.lastIndex = cursor;
      closeRe.lastIndex = cursor;
      const open = openRe.exec(buffer);
      const close = closeRe.exec(buffer);
      if (!open && !close) break;
      if (open && (!close || open.index < close.index)) {
        depth += 1;
        leafStart = open.index;
        hasChild = false;
        cursor = open.index + open[0].length;
        continue;
      }
      if (depth > 0) {
        if (!hasChild && leafStart >= 0) onLeaf(buffer.slice(leafStart, close.index + close[0].length));
        depth -= 1;
        hasChild = true;
        leafStart = -1;
      }
      cursor = close.index + close[0].length;
    }
    if (leafStart >= 0) {
      buffer = buffer.slice(leafStart);
      scanFrom = cursor - leafStart;
      leafStart = 0;
    } else {
      const keepFrom = Math.max(cursor, buffer.length - 128);
      buffer = buffer.slice(keepFrom);
      scanFrom = 0;
    }
    if (buffer.length > maxChars) {
      overflowed += 1;
      buffer = "";
      scanFrom = 0;
      leafStart = -1;
      hasChild = true;
    }
  };
  return {
    push: (text) => {
      buffer += text;
      process();
    },
    end: () => {
      process();
      buffer = "";
      return { overflowed };
    }
  };
};

const SIZE_UNITS = { K: 1024, M: 1024 * 1024, G: 1024 * 1024 * 1024 };

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

const decodeEntities = (value) => String(value)
  .replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&quot;/g, "\"")
  .replace(/&#39;/g, "'");

const parseSize = (token) => {
  if (!token || token === "-") return null;
  const match = String(token).trim().match(/^(\d+(?:\.\d+)?)\s*([KMG])?B?$/i);
  if (!match) return null;
  const multiplier = match[2] ? SIZE_UNITS[match[2].toUpperCase()] : 1;
  return Math.round(parseFloat(match[1]) * multiplier);
};

const parseModified = (text) => {
  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3], +iso[4], +iso[5], +(iso[6] || 0)));
  const nginx = text.match(/(\d{2})-([A-Za-z]{3})-(\d{4}) (\d{2}):(\d{2})(?::(\d{2}))?/);
  if (nginx && MONTHS[nginx[2].toLowerCase()] !== undefined) {
    return new Date(Date.UTC(+nginx[3], MONTHS[nginx[2].toLowerCase()], +nginx[1], +nginx[4], +nginx[5], +(nginx[6] || 0)));
  }
  return null;
};

const parseAutoindex = (html, baseUrl) => {
  const base = new URL(baseUrl);
  const entries = [];
  const seen = new Set();
  const anchor = /<a\s+[^>]*href\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/a>([^<]*(?:<\/td>\s*<td[^>]*>[^<]*){0,3})/gi;
  let match;
  while ((match = anchor.exec(html)) !== null) {
    const rawHref = decodeEntities(match[1]);
    if (!rawHref || rawHref.startsWith("?") || rawHref.startsWith("#") || rawHref.startsWith("mailto:")) continue;
    let resolved;
    try {
      resolved = new URL(rawHref, base);
    } catch (error) {
      continue;
    }
    if (resolved.host !== base.host) continue;
    if (!resolved.pathname.startsWith(base.pathname) || resolved.pathname === base.pathname) continue;
    const relative = resolved.pathname.slice(base.pathname.length);
    if (!relative || relative.includes("/") && !/^[^/]+\/$/.test(relative)) continue;
    const url = `${resolved.origin}${resolved.pathname}`;
    if (seen.has(url)) continue;
    seen.add(url);
    const trailing = match[3].replace(/<[^>]+>/g, " ");
    const modified = parseModified(trailing);
    const sizeMatch = trailing.replace(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?|\d{2}-[A-Za-z]{3}-\d{4} \d{2}:\d{2}(:\d{2})?/, " ").trim().split(/\s+/)[0];
    const isDir = relative.endsWith("/");
    entries.push({
      url,
      name: decodeURIComponent(isDir ? relative.slice(0, -1) : relative),
      isDir,
      modified,
      size: isDir ? null : parseSize(sizeMatch)
    });
  }
  return entries;
};

const listingUrl = (bucket, prefix, continuationToken) => {
  const params = new URLSearchParams({ "list-type": "2", delimiter: "/", "max-keys": "1000" });
  if (prefix) params.set("prefix", prefix);
  if (continuationToken) params.set("continuation-token", continuationToken);
  return `https://${bucket}.s3.amazonaws.com/?${params.toString()}`;
};

const objectUrl = (bucket, key) => `https://${bucket}.s3.amazonaws.com/${key.split("/").map(encodeURIComponent).join("/")}`;

const parseS3Listing = (xml, bucket) => {
  const prefixes = tagBlocks(xml, "CommonPrefixes").map((block) => tagText(block.inner, "Prefix")).filter(Boolean);
  const objects = tagBlocks(xml, "Contents").map((block) => {
    const key = tagText(block.inner, "Key");
    const modified = tagText(block.inner, "LastModified");
    const size = parseInt(tagText(block.inner, "Size"), 10);
    return {
      key,
      url: objectUrl(bucket, key),
      name: key.split("/").pop(),
      isDir: false,
      modified: modified ? new Date(modified) : null,
      size: Number.isFinite(size) ? size : null
    };
  }).filter((entry) => entry.key && !entry.key.endsWith("/"));
  const truncated = (tagText(xml, "IsTruncated") || "").toLowerCase() === "true";
  return {
    prefixes,
    objects,
    nextToken: truncated ? tagText(xml, "NextContinuationToken") : null
  };
};

const s3NodeUrl = (bucket, prefix) => `s3://${bucket}/${prefix || ""}`;

const parseS3NodeUrl = (url) => {
  const match = String(url).match(/^s3:\/\/([^/]+)\/(.*)$/);
  return match ? { bucket: match[1], prefix: match[2] } : null;
};

const nodeKeyFor = (sourceKey, url) => crypto.createHash("sha1").update(`${sourceKey}|${url}`).digest("hex");

const segmentsOf = (url) => {
  const s3 = parseS3NodeUrl(url);
  if (s3) return s3.prefix.split("/").filter(Boolean);
  try {
    return new URL(url).pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
  } catch (error) {
    return [];
  }
};

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp)$/i;

const probeImage = (buffer) => {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0x89 && buffer.toString("ascii", 1, 4) === "PNG" && buffer.length >= 24) {
    return { mime: "image/png", width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.toString("ascii", 0, 3) === "GIF" && buffer.length >= 10) {
    return { mime: "image/gif", width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP" && buffer.length >= 30) {
    const chunk = buffer.toString("ascii", 12, 16);
    if (chunk === "VP8X") return { mime: "image/webp", width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
    if (chunk === "VP8L") {
      const bits = buffer.readUInt32LE(21);
      return { mime: "image/webp", width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8 ") return { mime: "image/webp", width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
    return { mime: "image/webp", width: null, height: null };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      const length = buffer.readUInt16BE(offset + 2);
      if ((marker >= 0xc0 && marker <= 0xcf) && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { mime: "image/jpeg", width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
      }
      offset += 2 + length;
    }
    return { mime: "image/jpeg", width: null, height: null };
  }
  return null;
};

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (buffers) => {
  let crc = 0xffffffff;
  for (const buffer of buffers) {
    for (let i = 0; i < buffer.length; i += 1) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const crc32Update = (crc, buffer) => {
  let value = (crc ^ 0xffffffff) >>> 0;
  for (let i = 0; i < buffer.length; i += 1) value = CRC_TABLE[(value ^ buffer[i]) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32([typeBuffer, data]), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
};

const encodePng = (width, height, pixels, channels) => {
  const colorType = channels === 1 ? 0 : channels === 3 ? 2 : 6;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = colorType;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(pixels.buffer, pixels.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const compressed = zlib.deflateSync(raw, { level: 6 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0))
  ]);
};

const zipWriter = (res) => {
  const entries = [];
  let offset = 0;
  const drain = () => new Promise((resolve) => res.once("drain", resolve));
  const push = async (buffer) => {
    offset += buffer.length;
    if (!res.write(buffer)) await drain();
  };
  const dosTime = (date) => {
    const time = ((date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2)) & 0xffff;
    const day = (((Math.max(1980, date.getUTCFullYear()) - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate()) & 0xffff;
    return { time, day };
  };
  const open = async (name, date) => {
    const nameBytes = Buffer.from(name, "utf8");
    const stamp = dosTime(date || new Date());
    const entry = { name: nameBytes, stamp, offset, crc: 0, size: 0 };
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0808, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(stamp.time, 10);
    header.writeUInt16LE(stamp.day, 12);
    header.writeUInt16LE(nameBytes.length, 26);
    await push(header);
    await push(nameBytes);
    entries.push(entry);
    return entry;
  };
  const write = async (entry, buffer) => {
    entry.crc = crc32Update(entry.crc, buffer);
    entry.size += buffer.length;
    await push(buffer);
  };
  const close = async (entry) => {
    const descriptor = Buffer.alloc(16);
    descriptor.writeUInt32LE(0x08074b50, 0);
    descriptor.writeUInt32LE(entry.crc >>> 0, 4);
    descriptor.writeUInt32LE(entry.size, 8);
    descriptor.writeUInt32LE(entry.size, 12);
    await push(descriptor);
  };
  const finish = async () => {
    const start = offset;
    for (const entry of entries) {
      const record = Buffer.alloc(46);
      record.writeUInt32LE(0x02014b50, 0);
      record.writeUInt16LE(20, 4);
      record.writeUInt16LE(20, 6);
      record.writeUInt16LE(0x0808, 8);
      record.writeUInt16LE(0, 10);
      record.writeUInt16LE(entry.stamp.time, 12);
      record.writeUInt16LE(entry.stamp.day, 14);
      record.writeUInt32LE(entry.crc >>> 0, 16);
      record.writeUInt32LE(entry.size, 20);
      record.writeUInt32LE(entry.size, 24);
      record.writeUInt16LE(entry.name.length, 28);
      record.writeUInt32LE(entry.offset, 42);
      await push(record);
      await push(entry.name);
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(offset - start, 12);
    end.writeUInt32LE(start, 16);
    await push(end);
    res.end();
  };
  return { open, write, close, finish };
};

const db = (() => {
  const query = (text, params) => pool.query(text, params);

  const withTransaction = async (work) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => null);
      throw error;
    } finally {
      client.release();
    }
  };

  const REQUIRED_TABLES = ["harvest_sources", "harvest_products", "harvest_blobs", "harvest_frames", "harvest_queue", "harvest_schedules", "harvest_crawl_nodes", "harvest_hosts", "harvest_cursors", "harvest_events", "harvest_leads"];

  const missingTables = async () => {
    const result = await query("SELECT name FROM unnest($1::text[]) AS name WHERE to_regclass('public.' || name) IS NULL", [REQUIRED_TABLES]);
    return result.rows.map((row) => row.name);
  };

  return { pool, query, withTransaction, missingTables };
})();

const events = (() => {
  const recent = new Map();
  const THROTTLE_MS = 10 * 60 * 1000;

  const record = async (level, message, context = {}) => {
    const key = `${level}|${context.sourceKey || ""}|${context.productKey || ""}|${message}`;
    const now = Date.now();
    const last = recent.get(key);
    if (last && now - last < THROTTLE_MS) return;
    if (recent.size > 1000) recent.clear();
    recent.set(key, now);
    await db.query(
      "INSERT INTO harvest_events (source_key, product_key, level, message, details) VALUES ($1, $2, $3, $4, $5)",
      [context.sourceKey || null, context.productKey || null, level, message, JSON.stringify(context.details || {})]
    ).catch(() => null);
  };

  return {
    info: (message, context) => record("info", message, context),
    warn: (message, context) => record("warn", message, context),
    error: (message, context) => record("error", message, context)
  };
})();

const cursors = (() => {
  const get = async (cursorKey) => {
    const result = await db.query("SELECT value FROM harvest_cursors WHERE cursor_key = $1", [cursorKey]);
    return result.rows[0] ? result.rows[0].value : null;
  };

  const set = (cursorKey, value) => db.query(
    `INSERT INTO harvest_cursors (cursor_key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (cursor_key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [cursorKey, JSON.stringify(value)]
  );

  return { get, set };
})();

const store = (() => {
  const upsertSources = async (sources) => {
    if (!sources.length) return;
    await db.query(
      `INSERT INTO harvest_sources (source_key, domain, adapter, name)
       SELECT source_key, domain, adapter, name
       FROM jsonb_to_recordset($1::jsonb) AS x(source_key TEXT, domain TEXT, adapter TEXT, name TEXT)
       ON CONFLICT (source_key) DO UPDATE
         SET domain = EXCLUDED.domain, adapter = EXCLUDED.adapter, name = EXCLUDED.name, updated_at = NOW()`,
      [JSON.stringify(sources.map((source) => ({ source_key: source.sourceKey, domain: source.domain, adapter: source.adapter, name: source.name })))]
    );
  };

  const getSource = async (sourceKey) => {
    const result = await db.query("SELECT * FROM harvest_sources WHERE source_key = $1", [sourceKey]);
    return result.rows[0] || null;
  };

  const recordSourceRun = (sourceKey, error) => db.query(
    error
      ? "UPDATE harvest_sources SET last_run_at = NOW(), last_error = $2, error_streak = error_streak + 1, updated_at = NOW() WHERE source_key = $1"
      : "UPDATE harvest_sources SET last_run_at = NOW(), last_success_at = NOW(), last_error = NULL, error_streak = 0, updated_at = NOW() WHERE source_key = $1",
    error ? [sourceKey, error] : [sourceKey]
  );

  const upsertProducts = async (products) => {
    const modes = new Map();
    for (let i = 0; i < products.length; i += config.batchSize) {
      const batch = products.slice(i, i + config.batchSize);
      const result = await db.query(
        `WITH incoming AS (
           SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(product_key TEXT, source_key TEXT, domain TEXT, name TEXT, category TEXT, kind TEXT, mode TEXT, policy JSONB, metadata JSONB)
         ),
         written AS (
           INSERT INTO harvest_products (product_key, source_key, domain, name, category, kind, mode, policy, metadata, first_seen_at, last_seen_at)
           SELECT product_key, source_key, domain, name, category, kind, mode, COALESCE(policy, '{}'::jsonb), COALESCE(metadata, '{}'::jsonb), NOW(), NOW()
           FROM incoming
           ON CONFLICT (product_key) DO UPDATE
             SET name = EXCLUDED.name,
                 category = EXCLUDED.category,
                 kind = EXCLUDED.kind,
                 metadata = harvest_products.metadata || EXCLUDED.metadata,
                 last_seen_at = NOW(),
                 updated_at = NOW()
             WHERE harvest_products.name IS DISTINCT FROM EXCLUDED.name
                OR harvest_products.category IS DISTINCT FROM EXCLUDED.category
                OR harvest_products.kind IS DISTINCT FROM EXCLUDED.kind
                OR (harvest_products.metadata || EXCLUDED.metadata) IS DISTINCT FROM harvest_products.metadata
                OR harvest_products.last_seen_at < NOW() - make_interval(secs => $2)
           RETURNING product_key, mode, policy
         )
         SELECT product_key, mode, policy FROM written
         UNION ALL
         SELECT p.product_key, p.mode, p.policy
         FROM harvest_products p
         JOIN incoming i ON i.product_key = p.product_key
         WHERE NOT EXISTS (SELECT 1 FROM written w WHERE w.product_key = p.product_key)`,
        [JSON.stringify(batch.map((product) => ({
          product_key: product.productKey,
          source_key: product.sourceKey,
          domain: product.domain,
          name: product.name,
          category: product.category || null,
          kind: product.kind || "image",
          mode: product.mode || "index",
          policy: product.policy || {},
          metadata: product.metadata || {}
        }))), config.productSeenRefreshSeconds]
      );
      for (const row of result.rows) modes.set(row.product_key, { mode: row.mode, policy: row.policy || {} });
    }
    return modes;
  };

  const insertIndexFrames = async (frames) => {
    let inserted = 0;
    for (let i = 0; i < frames.length; i += config.batchSize) {
      const batch = frames.slice(i, i + config.batchSize);
      const result = await db.query(
        `WITH incoming AS (
           SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(product_key TEXT, observed_at TIMESTAMPTZ, origin_url TEXT, byte_size BIGINT, mime_type TEXT, width INTEGER, height INTEGER, metadata JSONB)
         ),
         inserted AS (
           INSERT INTO harvest_frames (product_key, observed_at, origin_url, byte_size, mime_type, width, height, metadata)
           SELECT product_key, observed_at, origin_url, byte_size, mime_type, width, height, COALESCE(metadata, '{}'::jsonb)
           FROM incoming
           ON CONFLICT (product_key, observed_at) DO NOTHING
           RETURNING product_key, observed_at
         ),
         refreshed AS (
           UPDATE harvest_frames f
           SET origin_url = i.origin_url
           FROM incoming i
           WHERE f.product_key = i.product_key
             AND f.observed_at = i.observed_at
             AND f.blob_hash IS NULL
             AND i.origin_url IS NOT NULL
             AND f.origin_url IS DISTINCT FROM i.origin_url
           RETURNING f.frame_id
         ),
         rollup AS (
           UPDATE harvest_products p
           SET last_frame_at = GREATEST(COALESCE(p.last_frame_at, r.max_at), r.max_at),
               frame_count = p.frame_count + r.total,
               updated_at = NOW()
           FROM (SELECT product_key, MAX(observed_at) AS max_at, COUNT(*)::int AS total FROM inserted GROUP BY product_key) r
           WHERE p.product_key = r.product_key
           RETURNING p.product_key
         )
         SELECT COUNT(*)::int AS total FROM inserted`,
        [JSON.stringify(batch.map((frame) => ({
          product_key: frame.productKey,
          observed_at: frame.observedAt.toISOString(),
          origin_url: frame.originUrl || null,
          byte_size: frame.byteSize || null,
          mime_type: frame.mimeType || null,
          width: frame.width || null,
          height: frame.height || null,
          metadata: frame.metadata || {}
        })))]
      );
      inserted += result.rows[0] ? result.rows[0].total : 0;
    }
    return inserted;
  };

  const storedFrames = async (productKey, observedAts) => {
    if (!observedAts.length) return new Map();
    const result = await db.query(
      `SELECT observed_at, blob_hash IS NOT NULL AS stored
       FROM harvest_frames
       WHERE product_key = $1 AND observed_at = ANY($2::timestamptz[])`,
      [productKey, observedAts.map((date) => date.toISOString())]
    );
    return new Map(result.rows.map((row) => [new Date(row.observed_at).getTime(), row.stored]));
  };

  const hashBuffer = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");

  const storeFrameContent = async ({ productKey, domain, observedAt, originUrl, buffer, mimeType, width, height, metadata }) => {
    const blobHash = hashBuffer(buffer);
    return db.withTransaction(async (client) => {
      await client.query(
        `INSERT INTO harvest_blobs (blob_hash, mime_type, byte_size, width, height, content)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (blob_hash) DO NOTHING`,
        [blobHash, mimeType, buffer.length, width || null, height || null, buffer]
      );
      const frame = await client.query(
        `INSERT INTO harvest_frames (product_key, observed_at, origin_url, blob_hash, byte_size, mime_type, width, height, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (product_key, observed_at) DO UPDATE
           SET blob_hash = EXCLUDED.blob_hash,
               byte_size = EXCLUDED.byte_size,
               mime_type = EXCLUDED.mime_type,
               width = EXCLUDED.width,
               height = EXCLUDED.height,
               origin_url = COALESCE(EXCLUDED.origin_url, harvest_frames.origin_url),
               metadata = harvest_frames.metadata || EXCLUDED.metadata,
               fetched_at = NOW()
           WHERE harvest_frames.blob_hash IS NULL
         RETURNING frame_id, (xmax = 0) AS inserted`,
        [productKey, observedAt.toISOString(), originUrl || null, blobHash, buffer.length, mimeType, width || null, height || null, JSON.stringify(metadata || {})]
      );
      if (!frame.rows.length) return { stored: false, blobHash };
      const row = frame.rows[0];
      await client.query(
        `UPDATE harvest_products
         SET last_frame_at = GREATEST(COALESCE(last_frame_at, $2::timestamptz), $2::timestamptz),
             frame_count = frame_count + $3,
             updated_at = NOW()
         WHERE product_key = $1`,
        [productKey, observedAt.toISOString(), row.inserted ? 1 : 0]
      );
      await client.query("SELECT pg_notify('harvest_frames', $1)", [JSON.stringify({
        frameId: String(row.frame_id),
        productKey,
        domain: domain || null,
        observedAt: observedAt.toISOString(),
        mimeType
      })]);
      return { stored: true, frameId: String(row.frame_id), blobHash };
    });
  };

  const listProducts = async ({ sourceKey, mode }) => {
    const result = await db.query(
      "SELECT * FROM harvest_products WHERE source_key = $1 AND ($2::text IS NULL OR mode = $2) ORDER BY product_key",
      [sourceKey, mode || null]
    );
    return result.rows;
  };

  const getProduct = async (productKey) => {
    const result = await db.query("SELECT * FROM harvest_products WHERE product_key = $1", [productKey]);
    return result.rows[0] || null;
  };

  const pruneForeignFrames = async (productKey, originPrefix) => {
    const removed = await db.query(
      "DELETE FROM harvest_frames WHERE product_key = $1 AND blob_hash IS NULL AND origin_url IS NOT NULL AND left(origin_url, length($2)) <> $2",
      [productKey, originPrefix]
    );
    const count = removed.rowCount || 0;
    if (count > 0) {
      await db.query(
        `UPDATE harvest_products
         SET frame_count = (SELECT COUNT(*) FROM harvest_frames WHERE product_key = $1),
             last_frame_at = (SELECT MAX(observed_at) FROM harvest_frames WHERE product_key = $1),
             updated_at = NOW()
         WHERE product_key = $1`,
        [productKey]
      );
    }
    return count;
  };

  return { upsertSources, getSource, recordSourceRun, upsertProducts, insertIndexFrames, storedFrames, storeFrameContent, getProduct, listProducts, hashBuffer, pruneForeignFrames };
})();

const hosts = (() => {
  const intervals = new Map();
  const known = new Set();

  const setHostInterval = (host, ms) => {
    intervals.set(host, ms);
    known.delete(host);
  };

  const intervalFor = (host) => intervals.get(host) || config.defaultHostIntervalMs;

  const ensureHost = async (host) => {
    if (known.has(host)) return;
    await db.query(
      `INSERT INTO harvest_hosts (host, min_interval_ms)
       VALUES ($1, $2)
       ON CONFLICT (host) DO UPDATE SET min_interval_ms = EXCLUDED.min_interval_ms, updated_at = NOW()`,
      [host, intervalFor(host)]
    );
    if (known.size > 500) known.clear();
    known.add(host);
  };

  const reserve = async (host) => {
    await ensureHost(host);
    const pending = await db.query(
      `SELECT EXTRACT(EPOCH FROM (GREATEST(next_allowed_at, COALESCE(backoff_until, NOW()), NOW()) - NOW())) * 1000 AS wait_ms
       FROM harvest_hosts WHERE host = $1`,
      [host]
    );
    const waitMs = Math.ceil(Number(pending.rows[0]?.wait_ms || 0));
    if (waitMs > config.maxHostWaitMs) throw new DeferError(waitMs, `The host ${host} is rate limited, so the request was deferred.`);
    const slot = await db.query(
      `UPDATE harvest_hosts
       SET next_allowed_at = GREATEST(next_allowed_at, COALESCE(backoff_until, NOW()), NOW()) + make_interval(secs => min_interval_ms / 1000.0),
           request_count = request_count + 1,
           updated_at = NOW()
       WHERE host = $1
       RETURNING EXTRACT(EPOCH FROM (next_allowed_at - make_interval(secs => min_interval_ms / 1000.0) - NOW())) * 1000 AS wait_ms`,
      [host]
    );
    return Math.max(0, Math.ceil(Number(slot.rows[0]?.wait_ms || 0)));
  };

  const report = async (host, { status, bytes, retryAfterMs }) => {
    const throttled = status === 429 || status === 503;
    const failed = status === 0 || status >= 500;
    if (throttled || failed) {
      await db.query(
        `UPDATE harvest_hosts
         SET error_streak = error_streak + 1,
             last_status = $2,
             backoff_until = NOW() + make_interval(secs => LEAST(3600, GREATEST($3::float8, 15 * POWER(2, LEAST(error_streak, 8))))),
             updated_at = NOW()
         WHERE host = $1`,
        [host, status, throttled && retryAfterMs ? retryAfterMs / 1000 : 0]
      );
      return;
    }
    await db.query(
      `UPDATE harvest_hosts
       SET error_streak = 0, backoff_until = NULL, last_status = $2, byte_count = byte_count + $3, updated_at = NOW()
       WHERE host = $1`,
      [host, status, bytes || 0]
    );
  };

  return { reserve, report, setHostInterval, intervalFor };
})();

const http = (() => {
  const parseRetryAfter = (value) => {
    if (!value) return null;
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return seconds * 1000;
    const date = Date.parse(value);
    return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
  };

  const readBounded = async (response, maxBytes, url) => {
    if (!response.body) return Buffer.alloc(0);
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => null);
        throw new TooLargeError(url, maxBytes);
      }
      chunks.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
    }
    return Buffer.concat(chunks, total);
  };

  const socketFetch = (url, init, redirects = 0) => new Promise((resolve, reject) => {
    const target = new URL(url);
    const lib = target.protocol === "http:" ? httpModule : https;
    const request = lib.request(target, { method: init.method, headers: init.headers, family: 4, signal: init.signal }, (response) => {
      const location = response.headers.location;
      if (location && [301, 302, 303, 307, 308].includes(response.statusCode) && redirects < 5) {
        response.resume();
        const nextMethod = response.statusCode === 303 ? "GET" : init.method;
        resolve(socketFetch(new URL(location, target).href, { ...init, method: nextMethod, body: nextMethod === "GET" ? undefined : init.body }, redirects + 1));
        return;
      }
      const headers = new Headers();
      for (let i = 0; i < response.rawHeaders.length; i += 2) headers.append(response.rawHeaders[i], response.rawHeaders[i + 1]);
      const empty = [204, 304].includes(response.statusCode) || init.method === "HEAD";
      if (empty) response.resume();
      resolve(new Response(empty ? null : Readable.toWeb(response), { status: response.statusCode, statusText: response.statusMessage, headers }));
    });
    request.on("error", reject);
    if (init.body !== undefined) request.write(init.body);
    request.end();
  });

  const describeNetworkError = (error) => {
    const cause = error && error.cause;
    const detail = cause ? cause.code || cause.message : null;
    return detail ? `${cleanMessage(error)} (${detail})` : cleanMessage(error);
  };

  const open = async (url, options = {}) => {
    const host = new URL(url).host;
    const waitMs = await hosts.reserve(host);
    if (waitMs > 0) await sleep(waitMs);
    const headers = { "User-Agent": config.userAgent, Accept: options.accept || "*/*", ...(options.headers || {}) };
    if (options.validators && options.validators.etag) headers["If-None-Match"] = options.validators.etag;
    if (options.validators && options.validators.lastModified) headers["If-Modified-Since"] = options.validators.lastModified;
    let response;
    const init = {
      method: options.method || "GET",
      headers,
      body: options.body === undefined ? undefined : options.body,
      redirect: "follow"
    };
    try {
      response = await fetch(url, { ...init, signal: AbortSignal.timeout(options.timeoutMs || config.requestTimeoutMs) });
    } catch (error) {
      try {
        response = await socketFetch(url, { ...init, signal: AbortSignal.timeout(options.timeoutMs || config.requestTimeoutMs) });
      } catch (fallbackError) {
        await hosts.report(host, { status: 0 });
        throw new HarvestError(`The request to ${host} failed because of the error "${describeNetworkError(error)}", and the IPv4 retry failed with "${describeNetworkError(fallbackError)}".`, { url });
      }
    }
    const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
    if (response.status === 304) {
      if (response.body) await response.body.cancel().catch(() => null);
      await hosts.report(host, { status: 304, bytes: 0 });
      return { host, response, notModified: true };
    }
    if (!response.ok && !(options.allowStatuses || []).includes(response.status)) {
      if (response.body) await response.body.cancel().catch(() => null);
      await hosts.report(host, { status: response.status, retryAfterMs });
      throw new HttpStatusError(url, response.status, retryAfterMs, {
        wwwAuthenticate: response.headers.get("www-authenticate") || null,
        server: response.headers.get("server") || null,
        rateLimit: response.headers.get("x-ratelimit-limit") || response.headers.get("ratelimit-limit") || null
      });
    }
    return { host, response, notModified: false };
  };

  const meta = (response) => ({
    status: response.status,
    url: response.url,
    contentType: response.headers.get("content-type") || "",
    etag: response.headers.get("etag"),
    lastModified: response.headers.get("last-modified"),
    headers: response.headers
  });

  const request = async (url, options = {}) => {
    const maxBytes = options.maxBytes || config.maxObjectBytes;
    const opened = await open(url, options);
    if (opened.notModified) return { ...meta(opened.response), notModified: true, body: null };
    const declared = parseInt(opened.response.headers.get("content-length"), 10);
    if (Number.isFinite(declared) && declared > maxBytes && !opened.response.headers.get("content-encoding")) {
      await opened.response.body.cancel().catch(() => null);
      await hosts.report(opened.host, { status: opened.response.status, bytes: 0 });
      throw new TooLargeError(url, maxBytes);
    }
    const body = await readBounded(opened.response, maxBytes, url);
    await hosts.report(opened.host, { status: opened.response.status, bytes: body.length });
    return { ...meta(opened.response), notModified: false, body };
  };

  const text = async (url, options = {}) => {
    const result = await request(url, { maxBytes: config.maxListingBytes, ...options });
    return { ...result, text: result.body ? result.body.toString("utf8") : null };
  };

  const probe = async (url, options = {}) => {
    const attempt = async (method) => {
      const opened = await open(url, { ...options, method, allowStatuses: [400, 401, 403, 404, 405, 410, 501] });
      const { response } = opened;
      if (response.body) await response.body.cancel().catch(() => null);
      await hosts.report(opened.host, { status: response.status, bytes: 0 });
      return { status: response.status, ok: response.ok, contentType: response.headers.get("content-type") || "", contentLength: Number(response.headers.get("content-length")) || null };
    };
    const head = await attempt("HEAD");
    if (head.status === 405 || head.status === 501) return attempt("GET");
    return head;
  };

  const json = async (url, options = {}) => {
    const result = await text(url, { accept: "application/json", ...options });
    if (result.notModified) return { ...result, data: null };
    try {
      return { ...result, data: JSON.parse(result.text) };
    } catch (error) {
      throw new HarvestError(`The response from ${hostOf(url)} was not valid JSON.`, { url });
    }
  };


  const stream = async (url, onText, options = {}) => {
    const maxBytes = options.maxBytes || config.maxObjectBytes * 4;
    const result = await open(url, options);
    if (result.notModified) return { ...meta(result.response), notModified: true, bytes: 0 };
    const reader = result.response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => null);
        throw new TooLargeError(url, maxBytes);
      }
      onText(decoder.decode(value, { stream: true }));
    }
    onText(decoder.decode());
    await hosts.report(result.host, { status: result.response.status, bytes: total });
    return { ...meta(result.response), notModified: false, bytes: total };
  };

  return { request, text, json, stream, probe, parseRetryAfter };
})();

const queue = (() => {
  const toRecords = (jobs) => JSON.stringify(jobs.map((job) => ({
    dedupe_key: job.dedupeKey || null,
    job_type: job.jobType,
    source_key: job.sourceKey || null,
    payload: job.payload || {},
    priority: job.priority === undefined ? 5 : job.priority,
    run_after: (job.runAfter || new Date()).toISOString(),
    max_attempts: job.maxAttempts || 5
  })));

  const CONFLICT = {
    keep: "ON CONFLICT (dedupe_key) DO NOTHING",
    earliest: `ON CONFLICT (dedupe_key) DO UPDATE
      SET run_after = LEAST(harvest_queue.run_after, EXCLUDED.run_after),
          payload = EXCLUDED.payload,
          priority = LEAST(harvest_queue.priority, EXCLUDED.priority)
      WHERE harvest_queue.locked_until IS NULL OR harvest_queue.locked_until < NOW()`,
    revive: `ON CONFLICT (dedupe_key) DO UPDATE
      SET run_after = EXCLUDED.run_after,
          payload = EXCLUDED.payload,
          priority = EXCLUDED.priority,
          attempts = 0,
          last_error = NULL,
          locked_by = NULL,
          locked_until = NULL
      WHERE harvest_queue.attempts >= harvest_queue.max_attempts
        AND (harvest_queue.locked_until IS NULL OR harvest_queue.locked_until < NOW())`
  };

  const enqueue = async (jobs, options = {}, client) => {
    if (!jobs || jobs.length === 0) return 0;
    const runner = client || db;
    let inserted = 0;
    for (let i = 0; i < jobs.length; i += config.batchSize) {
      const batch = jobs.slice(i, i + config.batchSize);
      const result = await runner.query(
        `INSERT INTO harvest_queue (dedupe_key, job_type, source_key, payload, priority, run_after, max_attempts)
         SELECT dedupe_key, job_type, source_key, payload, priority, run_after, max_attempts
         FROM jsonb_to_recordset($1::jsonb) AS x(dedupe_key TEXT, job_type TEXT, source_key TEXT, payload JSONB, priority SMALLINT, run_after TIMESTAMPTZ, max_attempts INTEGER)
         ${CONFLICT[options.onConflict || "keep"]}`,
        [toRecords(batch)]
      );
      inserted += result.rowCount;
    }
    return inserted;
  };

  const DOWNLOAD_TYPES = ["fetch", "process"];

  const LANE_FILTERS = {
    download: "job_type = ANY($4::text[])",
    frontier: "job_type LIKE 'frontier:%'",
    discovery: "NOT (job_type = ANY($4::text[])) AND job_type NOT LIKE 'frontier:%'"
  };

  const laneOf = (job) => (DOWNLOAD_TYPES.includes(job.job_type) ? "download" : String(job.job_type).startsWith("frontier:") ? "frontier" : "discovery");

  const claimLane = async (limit, lane, sourceKeys) => {
    if (limit <= 0) return [];
    const usesTypes = lane !== "frontier";
    const sourceFilter = sourceKeys ? `AND source_key = ANY($${usesTypes ? 5 : 4}::text[])` : "";
    const result = await db.query(
      `WITH picked AS (
         SELECT job_id FROM harvest_queue
         WHERE run_after <= NOW()
           AND (locked_until IS NULL OR locked_until < NOW())
           AND attempts < max_attempts
           AND ${LANE_FILTERS[lane]}
           ${sourceFilter}
         ORDER BY (priority - LEAST(${config.maxPriorityAging}, FLOOR(EXTRACT(EPOCH FROM (NOW() - run_after)) / ${config.priorityAgingSeconds}))) ASC, run_after ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       UPDATE harvest_queue q
       SET locked_by = $2, locked_until = NOW() + make_interval(secs => $3), attempts = q.attempts + 1
       FROM picked
       WHERE q.job_id = picked.job_id
       RETURNING q.job_id, q.dedupe_key, q.job_type, q.source_key, q.payload, q.priority, q.attempts, q.max_attempts`,
      (usesTypes ? [limit, config.instanceId, config.leaseSeconds, DOWNLOAD_TYPES] : [limit, config.instanceId, config.leaseSeconds]).concat(sourceKeys ? [sourceKeys] : [])
    );
    return result.rows;
  };

  let fairnessOffset = 0;

  const domainSourceKeys = () => {
    const byDomain = new Map();
    for (const source of registry.allSources()) {
      const list = byDomain.get(source.domain) || [];
      list.push(source.sourceKey);
      byDomain.set(source.domain, list);
    }
    return Array.from(byDomain.values());
  };

  const isDownload = (job) => laneOf(job) === "download";

  const claim = async (free) => {
    const claimed = [];
    let discovery = free.discovery || 0;
    const groups = discovery > 0 ? domainSourceKeys() : [];
    if (groups.length > 1) {
      fairnessOffset = (fairnessOffset + 1) % groups.length;
      for (let i = 0; i < groups.length && discovery > 0; i += 1) {
        const rows = await claimLane(1, "discovery", groups[(fairnessOffset + i) % groups.length]);
        claimed.push(...rows);
        discovery -= rows.length;
      }
    }
    claimed.push(...(await claimLane(discovery, "discovery")));
    for (const lane of ["download", "frontier"]) claimed.push(...(await claimLane(free[lane] || 0, lane)));
    return claimed;
  };

  const heartbeat = (job) => db.query(
    "UPDATE harvest_queue SET locked_until = NOW() + make_interval(secs => $3) WHERE job_id = $1 AND locked_by = $2",
    [job.job_id, config.instanceId, config.leaseSeconds]
  );

  const complete = (job) => db.query("DELETE FROM harvest_queue WHERE job_id = $1 AND locked_by = $2", [job.job_id, config.instanceId]);

  const completeAndRequeue = (job, next) => db.withTransaction(async (client) => {
    await client.query("DELETE FROM harvest_queue WHERE job_id = $1 AND locked_by = $2", [job.job_id, config.instanceId]);
    await enqueue([next], { onConflict: "earliest" }, client);
  });

  const defer = (job, delayMs) => db.query(
    `UPDATE harvest_queue
     SET locked_by = NULL, locked_until = NULL, attempts = GREATEST(0, attempts - 1), run_after = NOW() + make_interval(secs => $2)
     WHERE job_id = $1`,
    [job.job_id, Math.max(1, Math.ceil(delayMs / 1000))]
  );

  const fail = async (job, error, delayMs) => {
    if (job.attempts >= job.max_attempts) {
      await db.query("DELETE FROM harvest_queue WHERE job_id = $1", [job.job_id]);
      return { dropped: true };
    }
    const backoffSeconds = delayMs ? Math.ceil(delayMs / 1000) : Math.min(21600, 60 * Math.pow(2, job.attempts - 1)) + Math.floor(Math.random() * 30);
    await db.query(
      `UPDATE harvest_queue
       SET locked_by = NULL, locked_until = NULL, last_error = $2, run_after = NOW() + make_interval(secs => $3)
       WHERE job_id = $1`,
      [job.job_id, cleanMessage(error), backoffSeconds]
    );
    return { dropped: false };
  };

  const stats = async () => {
    const result = await db.query(
      `SELECT job_type,
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE run_after <= NOW() AND (locked_until IS NULL OR locked_until < NOW()))::int AS due,
              COUNT(*) FILTER (WHERE locked_until >= NOW())::int AS running,
              COUNT(*) FILTER (WHERE last_error IS NOT NULL)::int AS retrying,
              EXTRACT(EPOCH FROM (NOW() - MIN(run_after) FILTER (WHERE run_after <= NOW())))::int AS oldest_due_seconds
       FROM harvest_queue
       GROUP BY job_type
       ORDER BY job_type`
    );
    return result.rows;
  };

  return { enqueue, claim, isDownload, laneOf, heartbeat, complete, completeAndRequeue, defer, fail, stats };
})();

const schedules = (() => {
  const ensure = async (schedules) => {
    if (!schedules.length) return;
    await db.query(
      `INSERT INTO harvest_schedules (schedule_key, source_key, job_type, payload, interval_seconds, next_run_at)
       SELECT schedule_key, source_key, job_type, payload, interval_seconds, NOW()
       FROM jsonb_to_recordset($1::jsonb) AS x(schedule_key TEXT, source_key TEXT, job_type TEXT, payload JSONB, interval_seconds INTEGER)
       ON CONFLICT (schedule_key) DO UPDATE
         SET source_key = EXCLUDED.source_key,
             job_type = EXCLUDED.job_type,
             payload = EXCLUDED.payload,
             interval_seconds = EXCLUDED.interval_seconds,
             updated_at = NOW()`,
      [JSON.stringify(schedules.map((schedule) => ({
        schedule_key: schedule.scheduleKey,
        source_key: schedule.sourceKey,
        job_type: schedule.jobType,
        payload: schedule.payload || {},
        interval_seconds: schedule.intervalSeconds
      })))]
    );
  };

  const fireDue = async (limit) => {
    const result = await db.query(
      `UPDATE harvest_schedules s
       SET next_run_at = NOW() + make_interval(secs => s.interval_seconds), last_run_at = NOW(), updated_at = NOW()
       WHERE s.schedule_key IN (
         SELECT sc.schedule_key
         FROM harvest_schedules sc
         JOIN harvest_sources src ON src.source_key = sc.source_key
         WHERE sc.enabled AND src.enabled AND sc.next_run_at <= NOW()
         ORDER BY sc.next_run_at ASC
         LIMIT $1
         FOR UPDATE OF sc SKIP LOCKED
       )
       RETURNING s.schedule_key, s.source_key, s.job_type, s.payload, s.interval_seconds`,
      [limit]
    );
    if (!result.rows.length) return 0;
    await queue.enqueue(result.rows.map((row) => ({
      dedupeKey: `schedule:${row.schedule_key}`,
      jobType: row.job_type,
      sourceKey: row.source_key,
      payload: row.payload,
      priority: 4
    })), { onConflict: "revive" });
    return result.rows.length;
  };

  const runNow = (sourceKey) => db.query(
    "UPDATE harvest_schedules SET next_run_at = NOW(), updated_at = NOW() WHERE source_key = $1 AND enabled",
    [sourceKey]
  );

  return { ensure, fireDue, runNow };
})();

const jobs = (() => {
  const processors = new Map();

  const registerProcessor = (key, processor) => processors.set(key, processor);

  const runFetch = async (job) => {
    const payload = job.payload;
    const result = await http.request(payload.url, {
      maxBytes: payload.maxBytes || config.maxObjectBytes,
      headers: payload.headers || undefined,
      accept: payload.accept || "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.5"
    });
    const probe = probeImage(result.body);
    if (!probe) throw new PermanentError(`The content from ${hostOf(payload.url)} was not a recognized image.`, { url: payload.url });
    const stored = await store.storeFrameContent({
      productKey: payload.productKey,
      domain: payload.domain,
      observedAt: new Date(payload.observedAt),
      originUrl: payload.originUrl || payload.url,
      buffer: result.body,
      mimeType: probe.mime,
      width: probe.width,
      height: probe.height,
      metadata: { ...(payload.metadata || {}), contentType: result.contentType }
    });
    return { summary: { stored: stored.stored, bytes: result.body.length } };
  };

  const runProcess = async (job, context) => {
    const payload = job.payload;
    const processor = processors.get(payload.processor);
    if (!processor) throw new PermanentError(`The processor ${payload.processor} is not registered.`);
    const available = processor.available ? await processor.available() : true;
    if (available !== true) throw new PermanentError(typeof available === "string" ? available : `The processor ${payload.processor} is unavailable.`);
    const output = await processor.run({ payload, http, heartbeat: context.heartbeat, config });
    const stored = await store.storeFrameContent({
      productKey: payload.productKey,
      domain: payload.domain,
      observedAt: new Date(payload.observedAt),
      originUrl: payload.sourceUrl,
      buffer: output.buffer,
      mimeType: output.mimeType,
      width: output.width,
      height: output.height,
      metadata: { ...(output.metadata || {}), processor: payload.processor }
    });
    return { summary: { stored: stored.stored, bytes: output.buffer.length } };
  };

  return { runFetch, runProcess, registerProcessor, processors };
})();

const ingestion = (() => {
  const LIVE_WINDOW_MS = 2 * 60 * 60 * 1000;

  const frameKey = (productKey, observedAt) => `${productKey}|${observedAt.getTime()}`;

  const reduceCandidates = (candidates) => {
    const byKey = new Map();
    for (const candidate of candidates) {
      if (!candidate || !candidate.product || !candidate.frame || !(candidate.frame.observedAt instanceof Date)) continue;
      const key = frameKey(candidate.product.productKey, candidate.frame.observedAt);
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, candidate);
        continue;
      }
      const existingRank = existing.rank || 0;
      const candidateRank = candidate.rank || 0;
      const existingFiles = (existing.frame.metadata && existing.frame.metadata.files) || [];
      const candidateFiles = (candidate.frame.metadata && candidate.frame.metadata.files) || [];
      const winner = candidateRank > existingRank ? candidate : existing;
      if (existingFiles.length || candidateFiles.length) {
        const files = Array.from(new Set([...existingFiles, ...candidateFiles])).slice(0, 32);
        winner.frame = { ...winner.frame, metadata: { ...(winner.frame.metadata || {}), files } };
      }
      byKey.set(key, winner);
    }
    return Array.from(byKey.values());
  };

  const priorityFor = (observedAt) => (Date.now() - observedAt.getTime() < LIVE_WINDOW_MS ? 3 : 6);

  const ingest = async (context, rawCandidates, options = {}) => {
    const candidates = reduceCandidates(rawCandidates);
    const summary = { candidates: candidates.length, products: 0, indexed: 0, fetchQueued: 0, processQueued: 0 };
    const productDefs = new Map();
    const addProduct = (product) => {
      if (!productDefs.has(product.productKey)) productDefs.set(product.productKey, { ...product, sourceKey: context.sourceKey, domain: context.domain });
    };
    for (const candidate of rawCandidates) {
      if (!candidate || !candidate.product) continue;
      addProduct(candidate.product);
      if (candidate.process && candidate.process.targetProduct) addProduct(candidate.process.targetProduct);
    }
    if (!productDefs.size) return summary;
    const modes = await store.upsertProducts(Array.from(productDefs.values()));
    summary.products = productDefs.size;
    const modeOf = (productKey) => (modes.get(productKey) || { mode: "index" }).mode;
    const indexFrames = candidates
      .filter((candidate) => modeOf(candidate.product.productKey) !== "off")
      .map((candidate) => ({ productKey: candidate.product.productKey, ...candidate.frame }));
    summary.indexed = await store.insertIndexFrames(indexFrames);
    const maxArchive = options.maxArchivePerVisit === undefined ? 120 : options.maxArchivePerVisit;
    const maxProcess = options.maxProcessPerVisit || 12;
    const byProduct = new Map();
    for (const candidate of candidates) {
      const list = byProduct.get(candidate.product.productKey) || [];
      list.push(candidate);
      byProduct.set(candidate.product.productKey, list);
    }
    const fetchJobs = [];
    const processJobs = [];
    for (const [productKey, list] of byProduct.entries()) {
      list.sort((a, b) => b.frame.observedAt - a.frame.observedAt);
      if (modeOf(productKey) === "archive") {
        const stored = await store.storedFrames(productKey, list.map((candidate) => candidate.frame.observedAt));
        for (const candidate of list) {
          if (stored.get(candidate.frame.observedAt.getTime()) === true) continue;
          const fetchSpec = candidate.fetch || {};
          const url = fetchSpec.url || candidate.frame.originUrl;
          if (!url) continue;
          fetchJobs.push({
            dedupeKey: `fetch:${productKey}:${candidate.frame.observedAt.toISOString()}`,
            jobType: "fetch",
            sourceKey: context.sourceKey,
            priority: priorityFor(candidate.frame.observedAt),
            payload: {
              productKey,
              domain: context.domain,
              observedAt: candidate.frame.observedAt.toISOString(),
              url,
              originUrl: candidate.frame.originUrl || url,
              maxBytes: fetchSpec.maxBytes || null,
              headers: fetchSpec.headers || null,
              accept: fetchSpec.accept || null,
              metadata: candidate.frame.metadata || {}
            }
          });
        }
      }
      for (const candidate of list) {
        if (!candidate.process) continue;
        const target = candidate.process.targetProduct;
        if (!target || modeOf(target.productKey) === "off") continue;
        processJobs.push({ candidate, target });
      }
    }
    fetchJobs.sort((a, b) => a.priority - b.priority || b.payload.observedAt.localeCompare(a.payload.observedAt));
    summary.fetchQueued = await queue.enqueue(fetchJobs.slice(0, maxArchive), { onConflict: "keep" });
    const processByTarget = new Map();
    for (const item of processJobs) {
      const list = processByTarget.get(item.target.productKey) || [];
      list.push(item);
      processByTarget.set(item.target.productKey, list);
    }
    const queuedProcess = [];
    for (const [targetKey, list] of processByTarget.entries()) {
      list.sort((a, b) => b.candidate.frame.observedAt - a.candidate.frame.observedAt);
      const stored = await store.storedFrames(targetKey, list.map((item) => item.candidate.frame.observedAt));
      for (const item of list) {
        if (stored.get(item.candidate.frame.observedAt.getTime()) === true) continue;
        queuedProcess.push({
          dedupeKey: `process:${targetKey}:${item.candidate.frame.observedAt.toISOString()}`,
          jobType: "process",
          sourceKey: context.sourceKey,
          priority: priorityFor(item.candidate.frame.observedAt) + 1,
          maxAttempts: 3,
          payload: {
            processor: item.candidate.process.processor,
            productKey: targetKey,
            domain: context.domain,
            observedAt: item.candidate.frame.observedAt.toISOString(),
            sourceUrl: item.candidate.process.sourceUrl || item.candidate.frame.originUrl,
            options: item.candidate.process.options || {}
          }
        });
      }
    }
    queuedProcess.sort((a, b) => b.payload.observedAt.localeCompare(a.payload.observedAt));
    summary.processQueued = await queue.enqueue(queuedProcess.slice(0, maxProcess), { onConflict: "keep" });
    return summary;
  };

  return { ingest, reduceCandidates };
})();

const crawlPolicy = (() => {
  const DEFAULT_DENY = ["/(thumbs?|thumbnails?|icons?|css|js|javascript|fonts?|cgi-bin|login|search|wp-)/", "\\.(css|js|ico|woff2?|ttf|eot|svg|txt|pdf|zip|gz|tgz|tar|bz2|7z|nc|h5|he5|hdf|fits?|fts|grb2?|grib2?|bin|dat|csv|kml|kmz|mp4|mov|mp3|wav|doc|docx|xls|xlsx|ppt|pptx|exe|dmg|jar)$"];

  const patternOf = (value) => {
    if (value instanceof RegExp) return value;
    const text = String(value || "");
    if (/[\\^$*+?()[\]{}|]/.test(text)) return new RegExp(text, "i");
    return new RegExp(`(^|\\.)${text.replace(/\./g, "\\.")}$`, "i");
  };

  const hostAllowed = (config, host) => (config.allow || []).some((value) => patternOf(value).test(host));

  const denied = (config, url) => [...DEFAULT_DENY, ...(config.deny || [])].some((value) => new RegExp(value, "i").test(url));

  const allowed = (config, url) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (error) {
      return false;
    }
    if (!/^https?:$/.test(parsed.protocol)) return false;
    return hostAllowed(config, parsed.hostname) && !denied(config, url);
  };

  return { DEFAULT_DENY, patternOf, hostAllowed, denied, allowed };
})();

const leads = (() => {
  const { hostAllowed, patternOf } = crawlPolicy;

  const LEAD_RULES = [
    { kind: "key", title: "API Key Required", pattern: /\b(api[_\s-]?key|apikey|client[_\s-]?id|access[_\s-]?token|bearer token|register(ed)? (for|to get) (an? )?(key|token|account)|request (an? )?(api )?key|sign ?up for (an? )?(api|key|account)|earthdata login|urs\.earthdata|app[_\s-]?key)\b/i },
    { kind: "api", title: "API Endpoint", pattern: /\b(openapi|swagger|graphql|api documentation|rest api|api reference|api docs|\/api\/v\d|endpoint)\b/i },
    { kind: "feed", title: "Data Feed", pattern: /\b(atom feed|websocket|wss:\/\/|mqtt|event stream|kafka|geojson feed|kml feed|csv download|bulk download|ftp:\/\/)\b/i },
    { kind: "catalog", title: "Data Catalog", pattern: /\b(stac|thredds|opendap|erddap|geoserver|mapserver|arcgis\/rest|wcs|wfs|wmts|dataset catalog|data portal|data access)\b/i },
    { kind: "stream", title: "Live Stream", pattern: /\b(live stream|livestream|webcam|hls|m3u8|rtsp:\/\/|youtube\.com\/(live|channel|@)|twitch\.tv|ustream)\b/i }
  ];

  const LEAD_HOST_HINTS = /copernicus|sentinel|dataspace|planet\.com|maxar|umbra|capella|iceye|spire|blacksky|satellogic|airbus|earthdata|nasa|noaa|eumetsat|esa\.int|jaxa|isro|cnes|dlr|kma|cma\.gov|bom\.gov|metoffice|meteo|weather|space|satellite|orbit|celestrak|space-track|n2yo|heavens-above|swpc|geospace|helio|solar/i;

  const recordLeads = async (context, leads) => {
    const unique = new Map();
    for (const lead of leads) {
      if (!lead || !lead.url || unique.has(lead.url)) continue;
      unique.set(lead.url, lead);
    }
    const list = Array.from(unique.values()).slice(0, context.config.maxLeadsPerVisit || 20);
    if (!list.length) return 0;
    const countResult = await db.query("SELECT COUNT(*)::int AS total FROM harvest_leads WHERE source_key = $1", [context.sourceKey]);
    if (countResult.rows[0].total >= (context.config.maxLeads || 5000)) return 0;
    const result = await db.query(
      `INSERT INTO harvest_leads (source_key, domain, url, host, kind, title, evidence)
       SELECT source_key, domain, url, host, kind, title, COALESCE(evidence, '{}'::jsonb)
       FROM jsonb_to_recordset($1::jsonb) AS x(source_key TEXT, domain TEXT, url TEXT, host TEXT, kind TEXT, title TEXT, evidence JSONB)
       ON CONFLICT (source_key, url) DO UPDATE
         SET hits = harvest_leads.hits + 1,
             last_seen_at = NOW(),
             evidence = harvest_leads.evidence || EXCLUDED.evidence,
             updated_at = NOW()
       RETURNING (xmax = 0) AS inserted`,
      [JSON.stringify(list.map((lead) => ({
        source_key: context.sourceKey,
        domain: context.domain,
        url: lead.url.slice(0, 2000),
        host: (() => { try { return new URL(lead.url).hostname; } catch (error) { return null; } })(),
        kind: lead.kind,
        title: lead.title,
        evidence: lead.evidence || {}
      })))]
    );
    return result.rows.filter((row) => row.inserted).length;
  };

  const leadsFromPage = (html, url, entries, config) => {
    const leads = [];
    const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    for (const rule of LEAD_RULES) {
      const match = text.match(rule.pattern);
      if (!match) continue;
      const at = Math.max(0, match.index - 120);
      leads.push({ url, kind: rule.kind, title: rule.title, evidence: { excerpt: text.slice(at, match.index + 160).trim(), pageUrl: url } });
      break;
    }
    for (const entry of entries) {
      let host;
      try {
        host = new URL(entry.url).hostname;
      } catch (error) {
        continue;
      }
      if (hostAllowed(config, host)) {
        if (/openapi|swagger|\/api\/|api\.|graphql|\.m3u8$|wss?:\/\//i.test(entry.url)) leads.push({ url: entry.url, kind: "api", title: "API Endpoint", evidence: { linkedFrom: url, text: entry.name } });
        continue;
      }
      if ((config.leadIgnoreHosts || []).some((value) => patternOf(value).test(host))) continue;
      if (LEAD_HOST_HINTS.test(host)) {
        leads.push({ url: entry.url, kind: "host", title: "New Host", evidence: { linkedFrom: url, text: entry.name } });
      }
    }
    return leads;
  };

  return { recordLeads, leadsFromPage };
})();

const crawler = (() => {
  const { ingest } = ingestion;

  const crawlJob = (sourceKey, specKey, url, depth, runAfter) => ({
    dedupeKey: `crawl:${nodeKeyFor(sourceKey, url)}`,
    jobType: "crawl",
    sourceKey,
    priority: Math.min(9, 5 + depth),
    runAfter: runAfter || new Date(),
    payload: { specKey, url, depth }
  });

  const getNode = async (sourceKey, url) => {
    const result = await db.query("SELECT * FROM harvest_crawl_nodes WHERE node_key = $1", [nodeKeyFor(sourceKey, url)]);
    return result.rows[0] || null;
  };

  const registerChildren = async (sourceKey, specKey, spec, children, depth) => {
    if (!children.length) return 0;
    const countResult = await db.query("SELECT COUNT(*)::int AS total FROM harvest_crawl_nodes WHERE source_key = $1 AND status = 'active'", [sourceKey]);
    const room = Math.max(0, (spec.maxNodes || 2000) - countResult.rows[0].total);
    if (room === 0) return 0;
    const accepted = children.slice(0, room);
    const result = await db.query(
      `INSERT INTO harvest_crawl_nodes (node_key, source_key, spec_key, url, depth, revisit_seconds, next_visit_at)
       SELECT node_key, source_key, spec_key, url, depth, revisit_seconds, NOW()
       FROM jsonb_to_recordset($1::jsonb) AS x(node_key TEXT, source_key TEXT, spec_key TEXT, url TEXT, depth INTEGER, revisit_seconds INTEGER)
       ON CONFLICT (node_key) DO NOTHING
       RETURNING url, depth`,
      [JSON.stringify(accepted.map((child) => ({
        node_key: nodeKeyFor(sourceKey, child.url),
        source_key: sourceKey,
        spec_key: specKey,
        url: child.url,
        depth,
        revisit_seconds: (spec.revisit && spec.revisit.minSeconds) || 600
      })))]
    );
    await queue.enqueue(result.rows.map((row) => crawlJob(sourceKey, specKey, row.url, row.depth)), { onConflict: "keep" });
    return result.rows.length;
  };

  const listEntries = async (spec, url, node) => {
    const s3 = parseS3NodeUrl(url);
    if (s3) {
      const entries = [];
      let token = null;
      let pages = 0;
      do {
        const result = await http.text(listingUrl(s3.bucket, s3.prefix, token), { accept: "application/xml" });
        const page = parseS3Listing(result.text, s3.bucket);
        for (const prefix of page.prefixes) {
          entries.push({ url: s3NodeUrl(s3.bucket, prefix), name: prefix.slice(s3.prefix.length).replace(/\/$/, ""), isDir: true, modified: null, size: null });
        }
        for (const object of page.objects) entries.push(object);
        token = page.nextToken;
        pages += 1;
      } while (token && pages < (spec.pagesPerVisit || 5));
      return { entries, notModified: false, validators: {} };
    }
    const result = await http.text(url, {
      accept: "text/html,application/xhtml+xml",
      validators: node ? { etag: node.etag, lastModified: node.last_modified } : null
    });
    if (result.notModified) return { entries: [], notModified: true, validators: { etag: node.etag, lastModified: node.last_modified } };
    return { entries: parseAutoindex(result.text, url), notModified: false, validators: { etag: result.etag, lastModified: result.lastModified } };
  };

  const runCrawl = async (job, context) => {
    const { specKey, url } = job.payload;
    const depth = job.payload.depth || 0;
    const spec = context.crawlSpec(specKey);
    if (!spec) return null;
    const node = await getNode(context.sourceKey, url);
    const self = { url, name: segmentsOf(url).slice(-1)[0] || "", isDir: true, segments: segmentsOf(url) };
    if (depth > 0 && spec.follow && !spec.follow(self, depth)) {
      await db.query("UPDATE harvest_crawl_nodes SET status = 'dormant', updated_at = NOW() WHERE node_key = $1", [nodeKeyFor(context.sourceKey, url)]);
      return null;
    }
    let listing;
    try {
      listing = await listEntries(spec, url, node);
    } catch (error) {
      if (error instanceof HttpStatusError && [404, 410].includes(error.status)) {
        await db.query("UPDATE harvest_crawl_nodes SET status = 'gone', updated_at = NOW() WHERE node_key = $1", [nodeKeyFor(context.sourceKey, url)]);
        return null;
      }
      throw error;
    }
    const signature = listing.notModified
      ? node && node.content_hash
      : crypto.createHash("sha1").update(listing.entries.map((entry) => `${entry.name}|${entry.size || ""}|${entry.modified ? entry.modified.getTime() : ""}`).join("\n")).digest("hex");
    const changed = !listing.notModified && (!node || node.content_hash !== signature);
    let summary = null;
    let newNodes = 0;
    if (changed) {
      for (const entry of listing.entries) entry.segments = segmentsOf(entry.url);
      const dirs = depth < (spec.maxDepth || 4)
        ? listing.entries.filter((entry) => entry.isDir && (!spec.follow || spec.follow(entry, depth + 1)))
        : [];
      newNodes = await registerChildren(context.sourceKey, specKey, spec, dirs, depth + 1);
      const candidates = [];
      for (const entry of listing.entries) {
        if (entry.isDir) continue;
        const result = spec.classify(entry, { depth, parentUrl: url, sourceKey: context.sourceKey, config: context.config });
        if (Array.isArray(result)) candidates.push(...result);
        else if (result) candidates.push(result);
      }
      summary = await ingest(context, candidates, { maxArchivePerVisit: spec.maxArchivePerVisit, maxProcessPerVisit: spec.maxProcessPerVisit });
    }
    const minSeconds = (spec.revisit && spec.revisit.minSeconds) || 600;
    const maxSeconds = (spec.revisit && spec.revisit.maxSeconds) || 21600;
    const current = node ? node.revisit_seconds : minSeconds;
    const next = changed ? Math.max(minSeconds, Math.floor(current / 2)) : Math.min(maxSeconds, current * 2);
    const jittered = Math.round(next * (0.9 + Math.random() * 0.2));
    await db.query(
      `INSERT INTO harvest_crawl_nodes (node_key, source_key, spec_key, url, depth, etag, last_modified, content_hash, revisit_seconds, last_visit_at, next_visit_at, child_count, unchanged_streak, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::int, NOW(), NOW() + make_interval(secs => $9::int), $10, $11, 'active')
       ON CONFLICT (node_key) DO UPDATE
         SET etag = EXCLUDED.etag,
             last_modified = EXCLUDED.last_modified,
             content_hash = COALESCE(EXCLUDED.content_hash, harvest_crawl_nodes.content_hash),
             revisit_seconds = EXCLUDED.revisit_seconds,
             last_visit_at = NOW(),
             next_visit_at = EXCLUDED.next_visit_at,
             child_count = CASE WHEN $12::boolean THEN EXCLUDED.child_count ELSE harvest_crawl_nodes.child_count END,
             unchanged_streak = CASE WHEN $12::boolean THEN 0 ELSE harvest_crawl_nodes.unchanged_streak + 1 END,
             status = 'active',
             updated_at = NOW()`,
      [
        nodeKeyFor(context.sourceKey, url), context.sourceKey, specKey, url, depth,
        listing.validators.etag || null, listing.validators.lastModified || null, signature || null,
        next, listing.entries.length, changed ? 0 : (node ? node.unchanged_streak + 1 : 0), changed
      ]
    );
    return {
      requeue: crawlJob(context.sourceKey, specKey, url, depth, new Date(Date.now() + jittered * 1000)),
      summary: summary ? { ...summary, newNodes } : { unchanged: true }
    };
  };

  const runCrawlRoots = async (job, context) => {
    const spec = context.crawlSpec(job.payload.specKey);
    if (!spec) return null;
    const roots = typeof spec.roots === "function" ? spec.roots(new Date()) : spec.roots;
    await queue.enqueue(roots.map((url) => crawlJob(context.sourceKey, job.payload.specKey, url, 0)), { onConflict: "earliest" });
    return { summary: { roots: roots.length } };
  };

  return { runCrawl, runCrawlRoots, crawlJob, nodeKeyFor, segmentsOf };
})();

const frontier = (() => {
  const { DEFAULT_DENY, patternOf, hostAllowed, denied, allowed } = crawlPolicy;
  const { recordLeads, leadsFromPage } = leads;

  const { ingest } = ingestion;
  const interpreters = [];
  const STRUCTURED_RE = /stac|collections?|items?|catalog|search|GetCapabilities|\.json(\?|$)|\.xml(\?|$)/i;
  const DATE_NAME_RE = /^(\d{4}|\d{4}[-_]?\d{2}|\d{4}[-_]?\d{2}[-_]?\d{2}|\d{14}|\d{4}\d{3}|\d{2})$/;
  const CATEGORY_RULES = [
    [/lasco|cor[12]|coronagraph|ccor/i, "Coronagraph"],
    [/sdo|aia|hmi|euvi|suvi|swap|eit|solar|sun|halpha|h-alpha|magnetogram|callisto|radio/i, "Solar Imagery"],
    [/aurora|ovation|geospace|ionosph|tec|magnetom/i, "Space Weather Imagery"],
    [/enlil|wsa|model|forecast|gfs|nam|hrrr|ecmwf|gdps|rdps/i, "Space Weather Model"],
    [/radar|nexrad|mrms|precip|rain|qpe/i, "Precipitation"],
    [/lightning|glm|isatss/i, "Lightning"],
    [/fire|hotspot|frp|smoke/i, "Fires"],
    [/sst|ocean|coastwatch|sea_surface|altimet|chlor|wave/i, "Oceans"],
    [/snow|ice|cryo|glacier|sea_ice/i, "Cryosphere"],
    [/cloud|ctp|cth|fog/i, "Clouds"],
    [/dust|ash|aerosol|aod/i, "Aerosols"],
    [/trop|hurricane|typhoon|cyclone|storm/i, "Tropical Cyclones"],
    [/goes|himawari|meteosat|gk2a|geostationary|abi|ahi|fci|full_?disk|conus/i, "Geostationary Imagery"],
    [/landsat|sentinel|modis|viirs|jpss|polar|swath/i, "Earth Observation"]
  ];

  const hostLabel = (host) => {
    if (/^\d+(\.\d+)+$/.test(host)) return host;
    const parts = host.split(".").filter(Boolean);
    const core = parts.length > 2 ? parts.slice(-2, -1)[0] : parts[0];
    const known = { noaa: "NOAA", nasa: "NASA", usgs: "USGS", eumetsat: "EUMETSAT", esa: "ESA", nict: "NICT", jma: "JMA", colostate: "CIRA", stanford: "Stanford", sidc: "SIDC", wisc: "SSEC", nso: "NSO", i4ds: "FHNW" };
    return known[core] || titleCase(core);
  };

  const categoryFor = (url) => (CATEGORY_RULES.find(([pattern]) => pattern.test(url)) || [null, "Earth Observation"])[1];

  const visitJob = (sourceKey, url, depth, runAfter, priority) => ({
    dedupeKey: `frontier:${nodeKeyFor(sourceKey, url)}`,
    jobType: "frontier:visit",
    sourceKey,
    priority: priority === undefined ? Math.min(9, 6 + depth) : priority,
    runAfter: runAfter || new Date(),
    payload: { url, depth }
  });

  const getNode = async (sourceKey, url) => {
    const result = await db.query("SELECT * FROM harvest_crawl_nodes WHERE node_key = $1", [nodeKeyFor(sourceKey, url)]);
    return result.rows[0] || null;
  };

  const interpreterFor = (url) => interpreters.find((interpreter) => (typeof interpreter.match === "function" ? interpreter.match(url) : interpreter.match.test(url))) || null;

  const genericClassify = (entry, config) => {
    if (!IMAGE_EXTENSIONS.test(entry.name)) return null;
    if (/latest|current|thumb|icon|logo|banner|button/i.test(entry.name) && !parseTimestamp(entry.name)) return null;
    const observedAt = parseTimestamp(entry.name) || (entry.modified instanceof Date && !Number.isNaN(entry.modified.getTime()) ? entry.modified : null);
    if (!observedAt) return null;
    let parsed;
    try {
      parsed = new URL(entry.url);
    } catch (error) {
      return null;
    }
    const directorySegments = entry.segments.slice(0, -1);
    const directory = `${parsed.origin}/${directorySegments.map(encodeURIComponent).join("/")}${directorySegments.length ? "/" : ""}`;
    const productKey = `web-${slug(parsed.hostname)}-${slug(directorySegments.join("-")) || "root"}`.slice(0, 160);
    const nameSegments = directorySegments.filter((part) => !DATE_NAME_RE.test(part)).slice(-3);
    const sizeMatch = entry.name.match(/(\d{3,4})x(\d{3,4})/) || entry.name.match(/_(\d{3,4})\./);
    const size = sizeMatch ? parseInt(sizeMatch[1], 10) : null;
    return {
      rank: size ? (size <= (config.targetPx || 1024) ? size : (config.targetPx || 1024) - size) : 0,
      product: {
        productKey,
        name: `${hostLabel(parsed.hostname)} ${nameSegments.length ? titleCase(nameSegments.join(" ").replace(/[_-]+/g, " ")) : "Imagery"}`,
        category: categoryFor(entry.url),
        kind: "image",
        mode: "index",
        policy: { indexDays: config.indexDays || 3650 },
        metadata: { provider: hostLabel(parsed.hostname), host: parsed.hostname, directory, discovered: true }
      },
      frame: { observedAt, originUrl: entry.url, byteSize: entry.size, mimeType: /\.png$/i.test(entry.name) ? "image/png" : /\.gif$/i.test(entry.name) ? "image/gif" : "image/jpeg", width: size, height: size }
    };
  };

  const extractLinks = (html, baseUrl) => {
    const base = new URL(baseUrl);
    const entries = [];
    const seen = new Set();
    const anchor = /<a\s+[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>/gi;
    let match;
    while ((match = anchor.exec(html)) !== null) {
      const href = decodeXml(match[1].trim());
      if (!href || /^(mailto|javascript|tel|ftp):/i.test(href) || href.startsWith("?")) continue;
      let resolved;
      try {
        resolved = new URL(href, base);
      } catch (error) {
        continue;
      }
      resolved.hash = "";
      const url = resolved.toString();
      if (seen.has(url) || url === baseUrl) continue;
      seen.add(url);
      const path = resolved.pathname;
      const name = decodeURIComponent(path.split("/").filter(Boolean).pop() || resolved.hostname);
      const isImage = IMAGE_EXTENSIONS.test(name) && !resolved.search;
      const isDir = !isImage && (path.endsWith("/") || !/\.[a-z0-9]{2,5}$/i.test(name) || /\.(html?|php|asp|aspx|cgi|pl|shtml)$/i.test(name) || STRUCTURED_RE.test(url));
      entries.push({ url, name, isDir, modified: null, size: null, isImage });
    }
    return entries;
  };

  const stacCandidates = (data, url, config) => {
    const candidates = [];
    const children = [];
    const features = Array.isArray(data.features) ? data.features : data.type === "Feature" ? [data] : [];
    for (const feature of features) {
      const assets = feature.assets || {};
      const asset = assets.thumbnail || assets.overview || assets.rendered_preview || assets.visual || assets.browse || Object.values(assets).find((item) => /^image\/(png|jpe?g|gif|webp)/i.test(item && item.type));
      if (!asset || !asset.href || !/^https?:/.test(asset.href)) continue;
      const observedAt = parseAnyDate(feature.properties && (feature.properties.datetime || feature.properties.start_datetime || feature.properties.created));
      if (!observedAt) continue;
      const collection = feature.collection || (data.id || "items");
      const host = new URL(url).hostname;
      candidates.push({
        product: {
          productKey: `stac-${slug(host)}-${slug(collection)}`.slice(0, 160),
          name: `${hostLabel(host)} ${titleCase(String(collection).replace(/[_-]+/g, " "))}`,
          category: categoryFor(`${host} ${collection}`),
          kind: "image",
          mode: "index",
          policy: { indexDays: config.indexDays || 3650 },
          metadata: { provider: hostLabel(host), host, collection, stac: url.split("?")[0], discovered: true }
        },
        frame: { observedAt, originUrl: asset.href, mimeType: asset.type && /^image\//.test(asset.type) ? asset.type.split(";")[0] : "image/jpeg", metadata: { itemId: feature.id, bbox: feature.bbox || null } }
      });
    }
    for (const link of Array.isArray(data.links) ? data.links : []) {
      if (!link || !link.href || !["child", "items", "data", "next"].includes(link.rel)) continue;
      if (link.rel === "next" && features.length === 0) continue;
      let resolved;
      try {
        resolved = new URL(link.href, url).toString();
      } catch (error) {
        continue;
      }
      children.push({ url: resolved, name: link.title || link.rel, isDir: true, modified: null, size: null });
    }
    if (Array.isArray(data.collections)) {
      for (const collection of data.collections) {
        const items = (collection.links || []).find((link) => link.rel === "items");
        if (items && items.href) children.push({ url: new URL(items.href, url).toString(), name: collection.id || "items", isDir: true, modified: null, size: null });
      }
    }
    return { candidates, children };
  };

  const wmsCandidates = async (url, config, onHeartbeat) => {
    const base = url.split("?")[0];
    const host = new URL(url).hostname;
    const candidates = [];
    let layers = 0;
    const scanner = createLeafScanner("Layer", (section) => {
      const name = tagText(section, "Name");
      if (!name) return;
      layers += 1;
      const dimension = section.match(/<Dimension\b[^>]*name="time"[^>]*>([\s\S]*?)<\/Dimension>/i) || section.match(/<Dimension\b[^>]*name="time"[^>]*\/>/i);
      const dimensionTag = dimension ? dimension[0].match(/<Dimension\b[^>]*>/i)[0] : "";
      const defaultTime = attrValue(dimensionTag, "default");
      const values = dimension && dimension[1] ? dimension[1].split(",").map((value) => value.trim()).filter((value) => value && !value.includes("/")) : [];
      const west = parseFloat(tagText(section, "westBoundLongitude"));
      const east = parseFloat(tagText(section, "eastBoundLongitude"));
      const south = parseFloat(tagText(section, "southBoundLatitude"));
      const north = parseFloat(tagText(section, "northBoundLatitude"));
      const bbox = [west, east, south, north].every(Number.isFinite) ? { west, east, south, north } : { west: -180, east: 180, south: -90, north: 90 };
      const height = Math.max(256, Math.min(1024, Math.round(1024 * (bbox.north - bbox.south) / Math.max(1, bbox.east - bbox.west))));
      const mapUrl = (time) => {
        const params = new URLSearchParams({ service: "WMS", version: "1.3.0", request: "GetMap", layers: name, styles: "", crs: "EPSG:4326", bbox: `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`, width: "1024", height: String(height), format: "image/png" });
        if (time) params.set("time", time);
        return `${base}?${params.toString()}`;
      };
      const product = {
        productKey: `wms-${slug(host)}-${slug(name)}`.slice(0, 160),
        name: `${hostLabel(host)} ${tagText(section, "Title") || titleCase(name.split(":").pop())}`,
        category: categoryFor(`${name} ${tagText(section, "Title") || ""}`),
        kind: "image",
        mode: "index",
        policy: { indexDays: config.indexDays || 3650 },
        metadata: { provider: hostLabel(host), host, layer: name, wms: base, discovered: true }
      };
      const times = Array.from(new Set([...values.slice(-6), defaultTime].filter(Boolean)));
      let added = 0;
      for (const time of times) {
        const observedAt = parseAnyDate(time);
        if (!observedAt) continue;
        candidates.push({ product, frame: { observedAt, originUrl: mapUrl(time), mimeType: "image/png" } });
        added += 1;
      }
      if (!added) candidates.push({ product: { ...product, metadata: { ...product.metadata, static: true, snapshot: mapUrl(null) } } });
    }, 512 * 1024);
    let chunks = 0;
    await http.stream(url, (text) => {
      scanner.push(text);
      chunks += 1;
      if (chunks % 50 === 0 && onHeartbeat) onHeartbeat();
    }, { accept: "application/xml,text/xml" });
    scanner.end();
    return { candidates, layers };
  };

  const listS3 = async (url) => {
    const s3 = parseS3NodeUrl(url);
    const entries = [];
    let token = null;
    let pages = 0;
    do {
      const result = await http.text(listingUrl(s3.bucket, s3.prefix, token), { accept: "application/xml" });
      const page = parseS3Listing(result.text, s3.bucket);
      for (const prefix of page.prefixes) entries.push({ url: s3NodeUrl(s3.bucket, prefix), name: prefix.slice(s3.prefix.length).replace(/\/$/, ""), isDir: true, modified: null, size: null });
      for (const object of page.objects) entries.push(object);
      token = page.nextToken;
      pages += 1;
    } while (token && pages < 5);
    return entries;
  };

  const isDateLike = (name) => DATE_NAME_RE.test(name.replace(/\/$/, ""));

  const registerChildren = async (context, children, depth, deferred) => {
    if (!children.length) return 0;
    const countResult = await db.query("SELECT COUNT(*)::int AS total FROM harvest_crawl_nodes WHERE source_key = $1 AND spec_key = 'frontier'", [context.sourceKey]);
    const room = Math.max(0, (context.config.maxNodes || 50000) - countResult.rows[0].total);
    if (room === 0) return 0;
    const accepted = children.slice(0, room);
    const result = await db.query(
      `INSERT INTO harvest_crawl_nodes (node_key, source_key, spec_key, url, depth, revisit_seconds, next_visit_at, status, parent_key)
       SELECT node_key, source_key, 'frontier', url, depth, revisit_seconds, CASE WHEN $2::boolean THEN NULL ELSE NOW() END, CASE WHEN $2::boolean THEN 'deferred' ELSE 'active' END, parent_key
       FROM jsonb_to_recordset($1::jsonb) AS x(node_key TEXT, source_key TEXT, url TEXT, depth INTEGER, revisit_seconds INTEGER, parent_key TEXT)
       ON CONFLICT (node_key) DO NOTHING
       RETURNING url, depth`,
      [JSON.stringify(accepted.map((child) => ({
        node_key: nodeKeyFor(context.sourceKey, child.url),
        source_key: context.sourceKey,
        url: child.url,
        depth,
        revisit_seconds: context.config.minRevisitSeconds || 600,
        parent_key: child.parentKey || null
      }))), deferred]
    );
    if (!deferred) await queue.enqueue(result.rows.map((row) => visitJob(context.sourceKey, row.url, row.depth)), { onConflict: "keep" });
    return result.rows.length;
  };

  const markNode = (sourceKey, url, status) => db.query("UPDATE harvest_crawl_nodes SET status = $2, updated_at = NOW() WHERE node_key = $1", [nodeKeyFor(sourceKey, url), status]);

  const visit = async (job, context) => {
    const { url } = job.payload;
    const depth = job.payload.depth || 0;
    const config = context.config;
    if (!allowed(config, url)) {
      await markNode(context.sourceKey, url, "dormant");
      return null;
    }
    const node = await getNode(context.sourceKey, url);
    let entries = [];
    let candidates = [];
    let format = "html";
    let validators = {};
    let notModified = false;
    let leads = [];
    let externalLinks = [];
    try {
      if (parseS3NodeUrl(url)) {
        format = "s3";
        entries = await listS3(url);
      } else if (/GetCapabilities/i.test(url)) {
        format = "wms";
        const result = await wmsCandidates(url, config, () => context.heartbeat());
        candidates = result.candidates;
      } else {
        const result = await http.text(url, {
          accept: "text/html,application/xhtml+xml,application/json,application/geo+json,application/xml;q=0.9,*/*;q=0.5",
          validators: node ? { etag: node.etag, lastModified: node.last_modified } : null
        });
        if (result.notModified) {
          notModified = true;
          validators = { etag: node.etag, lastModified: node.last_modified };
        } else {
          validators = { etag: result.etag, lastModified: result.lastModified };
          const text = result.text || "";
          const trimmed = text.trimStart();
          if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
            format = "json";
            let data;
            try {
              data = JSON.parse(text);
            } catch (error) {
              data = null;
            }
            if (data && (data.stac_version || data.type === "FeatureCollection" || Array.isArray(data.collections) || Array.isArray(data.links))) {
              format = "stac";
              const result2 = stacCandidates(data, url, config);
              candidates = result2.candidates;
              entries = result2.children;
            }
          } else if (/<(WMS_Capabilities|WMT_MS_Capabilities)\b/i.test(trimmed.slice(0, 4000))) {
            format = "wms";
            const result2 = await wmsCandidates(url, config, () => context.heartbeat());
            candidates = result2.candidates;
          } else {
            const autoindex = parseAutoindex(text, url);
            if (autoindex.length && autoindex.some((entry) => entry.modified || entry.size !== null)) {
              format = "autoindex";
              entries = autoindex;
            } else {
              format = "html";
              const links = extractLinks(text, url);
              const follow = config.htmlFollow ? new RegExp(config.htmlFollow, "i") : null;
              entries = links.filter((entry) => allowed(config, entry.url) && (!entry.isDir || !follow || follow.test(new URL(entry.url).pathname))).slice(0, config.maxLinksPerPage || 80);
              externalLinks = links.slice(0, 400);
              leads = leadsFromPage(text, url, externalLinks, config);
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof HttpStatusError && [401, 403].includes(error.status)) {
        await recordLeads(context, [{ url, kind: "auth", title: "Requires Authentication", evidence: { status: error.status, wwwAuthenticate: error.headers.wwwAuthenticate, server: error.headers.server, rateLimit: error.headers.rateLimit } }]).catch(() => 0);
        await markNode(context.sourceKey, url, "gone");
        return null;
      }
      if (error instanceof HttpStatusError && [404, 410].includes(error.status)) {
        await markNode(context.sourceKey, url, "gone");
        return null;
      }
      if (error instanceof TooLargeError) {
        await markNode(context.sourceKey, url, "dormant");
        return null;
      }
      throw error;
    }
    const signature = notModified ? node && node.content_hash : crypto.createHash("sha1").update(entries.map((entry) => `${entry.url}|${entry.size || ""}|${entry.modified ? entry.modified.getTime() : ""}`).join("\n") + `|${candidates.length}`).digest("hex");
    const changed = !notModified && (!node || node.content_hash !== signature);
    let summary = { indexed: 0 };
    let newNodes = 0;
    let deferredNodes = 0;
    if (changed) {
      const interpreter = interpreterFor(url);
      for (const entry of entries) entry.segments = segmentsOf(entry.url);
      for (const entry of entries) {
        if (entry.isDir) continue;
        let result = null;
        if (interpreter && interpreter.classify) result = interpreter.classify(entry, { depth, parentUrl: url, sourceKey: context.sourceKey, config });
        if (!result) result = genericClassify(entry, config);
        if (Array.isArray(result)) candidates.push(...result);
        else if (result) candidates.push(result);
      }
      const maxDepth = config.maxDepth || 10;
      if (depth < maxDepth) {
        const dirs = entries.filter((entry) => entry.isDir && allowed(config, entry.url) && (!interpreter || !interpreter.follow || interpreter.follow(entry, depth + 1)));
        const dated = dirs.filter((entry) => isDateLike(entry.name)).sort((a, b) => b.name.localeCompare(a.name));
        const plain = dirs.filter((entry) => !isDateLike(entry.name));
        const window = config.dateWindow || 3;
        const parentKey = nodeKeyFor(context.sourceKey, url);
        const active = [...plain.slice(0, config.maxChildrenPerVisit || 100), ...dated.slice(0, window)].map((entry) => ({ ...entry, parentKey }));
        const deferred = dated.slice(window).map((entry) => ({ ...entry, parentKey }));
        newNodes = await registerChildren(context, active, depth + 1, false);
        deferredNodes = await registerChildren(context, deferred, depth + 1, true);
      }
      summary = await ingest(context, candidates, { maxArchivePerVisit: 24 });
      if (leads.length) summary.leads = await recordLeads(context, leads);
    }
    const yielded = summary.indexed || 0;
    const minSeconds = config.minRevisitSeconds || 600;
    const maxSeconds = config.maxRevisitSeconds || 86400;
    const current = node ? node.revisit_seconds : minSeconds;
    const next = yielded > 0 || (changed && !node) ? Math.max(minSeconds, Math.floor(current / 2)) : Math.min(maxSeconds, current * 2);
    const visits = (node ? node.visits || 0 : 0) + 1;
    const yieldTotal = (node ? node.yield_total || 0 : 0) + yielded;
    const dormant = depth > 0 && visits >= (config.dormantAfterVisits || 4) && yieldTotal === 0 && newNodes === 0 && deferredNodes === 0 && (node ? node.child_count || 0 : 0) === 0 && entries.filter((entry) => entry.isDir).length === 0;
    await db.query(
      `INSERT INTO harvest_crawl_nodes (node_key, source_key, spec_key, url, depth, etag, last_modified, content_hash, revisit_seconds, last_visit_at, next_visit_at, child_count, unchanged_streak, status, visits, yield_total, format)
       VALUES ($1, $2, 'frontier', $3, $4, $5, $6, $7, $8::int, NOW(), NOW() + make_interval(secs => $8::int), $9, $10, $11, $12, $13, $14)
       ON CONFLICT (node_key) DO UPDATE
         SET etag = EXCLUDED.etag,
             last_modified = EXCLUDED.last_modified,
             content_hash = COALESCE(EXCLUDED.content_hash, harvest_crawl_nodes.content_hash),
             revisit_seconds = EXCLUDED.revisit_seconds,
             last_visit_at = NOW(),
             next_visit_at = EXCLUDED.next_visit_at,
             child_count = CASE WHEN $15::boolean THEN EXCLUDED.child_count ELSE harvest_crawl_nodes.child_count END,
             unchanged_streak = CASE WHEN $15::boolean THEN 0 ELSE harvest_crawl_nodes.unchanged_streak + 1 END,
             status = EXCLUDED.status,
             visits = EXCLUDED.visits,
             yield_total = EXCLUDED.yield_total,
             format = EXCLUDED.format,
             updated_at = NOW()`,
      [
        nodeKeyFor(context.sourceKey, url), context.sourceKey, url, depth,
        validators.etag || null, validators.lastModified || null, signature || null,
        next, entries.length, changed ? 0 : (node ? node.unchanged_streak + 1 : 0), dormant ? "dormant" : "active", visits, yieldTotal, format, changed
      ]
    );
    if (dormant) return { summary: { dormant: true, format } };
    const jittered = Math.round(next * (0.9 + Math.random() * 0.2));
    return {
      requeue: visitJob(context.sourceKey, url, depth, new Date(Date.now() + jittered * 1000)),
      summary: { ...summary, format, newNodes, deferredNodes }
    };
  };

  const seed = async (job, context) => {
    const seeds = (context.config.seeds || []).filter((url) => allowed(context.config, url));
    await db.query(
      `INSERT INTO harvest_crawl_nodes (node_key, source_key, spec_key, url, depth, revisit_seconds, next_visit_at, status)
       SELECT node_key, source_key, 'frontier', url, 0, $2, NOW(), 'active'
       FROM jsonb_to_recordset($1::jsonb) AS x(node_key TEXT, source_key TEXT, url TEXT)
       ON CONFLICT (node_key) DO UPDATE SET status = 'active', next_visit_at = COALESCE(harvest_crawl_nodes.next_visit_at, NOW())`,
      [JSON.stringify(seeds.map((url) => ({ node_key: nodeKeyFor(context.sourceKey, url), source_key: context.sourceKey, url }))), context.config.minRevisitSeconds || 600]
    );
    await queue.enqueue(seeds.map((url) => visitJob(context.sourceKey, url, 0, new Date(), 5)), { onConflict: "keep" });
    return { summary: { seeds: seeds.length } };
  };

  const backfill = async (job, context) => {
    const stats = await queue.stats();
    const due = stats.reduce((sum, row) => sum + (row.due || 0), 0);
    if (due > (context.config.backfillThreshold || 50)) return { summary: { skipped: true, due } };
    const result = await db.query(
      `UPDATE harvest_crawl_nodes
       SET status = 'active', next_visit_at = NOW(), updated_at = NOW()
       WHERE node_key IN (
         SELECT node_key FROM harvest_crawl_nodes
         WHERE source_key = $1 AND spec_key = 'frontier' AND status = 'deferred'
         ORDER BY url DESC
         LIMIT $2
       )
       RETURNING url, depth`,
      [context.sourceKey, context.config.backfillBatch || 20]
    );
    await queue.enqueue(result.rows.map((row) => visitJob(context.sourceKey, row.url, row.depth, new Date(), 9)), { onConflict: "keep" });
    return { summary: { promoted: result.rows.length, due } };
  };

  const summarize = async (sourceKey) => {
    const [statuses, top, formats] = await Promise.all([
      db.query("SELECT status, COUNT(*)::int AS total FROM harvest_crawl_nodes WHERE source_key = $1 AND spec_key = 'frontier' GROUP BY status", [sourceKey]),
      db.query("SELECT url, depth, visits, yield_total, format, status, last_visit_at FROM harvest_crawl_nodes WHERE source_key = $1 AND spec_key = 'frontier' ORDER BY yield_total DESC, last_visit_at DESC NULLS LAST LIMIT 50", [sourceKey]),
      db.query("SELECT format, COUNT(*)::int AS total FROM harvest_crawl_nodes WHERE source_key = $1 AND spec_key = 'frontier' AND format IS NOT NULL GROUP BY format", [sourceKey])
    ]);
    return { statuses: statuses.rows, formats: formats.rows, topNodes: top.rows };
  };

  const adapter = {
    key: "frontier",
    domain: "core",
    hosts: {},
    sources: [],
    schedules: (source) => [
      { scheduleKey: `${source.sourceKey}:seed`, jobType: "frontier:seed", intervalSeconds: 3600 },
      { scheduleKey: `${source.sourceKey}:backfill`, jobType: "frontier:backfill", intervalSeconds: 600 }
    ],
    handlers: { visit, seed, backfill }
  };

  const registerInterpreter = (interpreter) => {
    if (interpreter && interpreter.match) interpreters.push(interpreter);
  };

  const addDomain = (domain, settings) => {
    const sourceKey = `${domain}-frontier`;
    if (!adapter.sources.some((source) => source.sourceKey === sourceKey)) {
      adapter.sources.push({ sourceKey, domain, name: `${titleCase(domain.replace(/-/g, " "))} Frontier`, config: { ...settings } });
    }
    registry.register(adapter);
  };

  return { adapter, registerInterpreter, addDomain, summarize, allowed, genericClassify, extractLinks, stacCandidates, isDateLike, leadsFromPage };
})();

const registry = (() => {
  const adapters = new Map();
  const sources = new Map();
  const handlers = new Map();
  const configCache = new Map();
  const CONFIG_TTL_MS = 60000;

  const register = (adapter) => {
    adapters.set(adapter.key, adapter);
    for (const source of adapter.sources || []) {
      sources.set(source.sourceKey, { ...source, adapter: adapter.key, domain: source.domain || adapter.domain });
    }
    for (const [name, handler] of Object.entries(adapter.handlers || {})) handlers.set(`${adapter.key}:${name}`, { adapter, handler });
  };

  const sourceDefinition = (sourceKey) => sources.get(sourceKey) || null;

  const adapterFor = (sourceKey) => {
    const source = sources.get(sourceKey);
    return source ? adapters.get(source.adapter) : null;
  };

  const sourceConfig = async (sourceKey) => {
    const cached = configCache.get(sourceKey);
    if (cached && Date.now() - cached.at < CONFIG_TTL_MS) return cached.value;
    const definition = sources.get(sourceKey);
    const result = await db.query("SELECT config FROM harvest_sources WHERE source_key = $1", [sourceKey]);
    const value = { ...((definition && definition.config) || {}), ...((result.rows[0] && result.rows[0].config) || {}) };
    configCache.set(sourceKey, { at: Date.now(), value });
    return value;
  };

  const crawlSpec = (sourceKey, specKey, config) => {
    const adapter = adapterFor(sourceKey);
    if (!adapter || !adapter.crawlSpecs || !adapter.crawlSpecs[specKey]) return null;
    return adapter.crawlSpecs[specKey](config, sourceDefinition(sourceKey));
  };

  const invalidateConfig = (sourceKey) => configCache.delete(sourceKey);

  const allSources = () => Array.from(sources.values());

  const allSchedules = () => {
    const list = [];
    for (const source of sources.values()) {
      const adapter = adapters.get(source.adapter);
      const schedules = adapter.schedules ? adapter.schedules(source) : [];
      for (const schedule of schedules) list.push({ ...schedule, sourceKey: source.sourceKey });
    }
    return list;
  };

  const allStartupJobs = () => {
    const list = [];
    for (const source of sources.values()) {
      const adapter = adapters.get(source.adapter);
      const jobs = adapter.startupJobs ? adapter.startupJobs(source) : [];
      for (const job of jobs) list.push({ priority: 2, ...job, sourceKey: source.sourceKey, dedupeKey: `startup:${source.sourceKey}:${job.jobType}` });
    }
    return list;
  };

  const allHosts = () => {
    const hosts = {};
    for (const adapter of adapters.values()) Object.assign(hosts, adapter.hosts || {});
    return hosts;
  };

  const handlerFor = (jobType) => handlers.get(jobType) || null;

  return { register, sourceDefinition, adapterFor, sourceConfig, invalidateConfig, crawlSpec, allSources, allSchedules, allStartupJobs, allHosts, handlerFor, adapters };
})();

const maintenance = (() => {
  const DEFAULT_ARCHIVE_POLICY = { hotHours: 48, warmDays: 30, coldDays: null };
  const DEFAULT_INDEX_DAYS = { image: 21, raw: 7, stream: 14, video: 60, tiled: 3650 };
  const DEFAULT_INDEX_FALLBACK_DAYS = 21;
  const BATCH = 2000;

  const policyFor = (product) => {
    const policy = product.policy || {};
    return {
      hotHours: Number.isFinite(policy.hotHours) ? policy.hotHours : DEFAULT_ARCHIVE_POLICY.hotHours,
      warmDays: Number.isFinite(policy.warmDays) ? policy.warmDays : DEFAULT_ARCHIVE_POLICY.warmDays,
      coldDays: Number.isFinite(policy.coldDays) ? policy.coldDays : DEFAULT_ARCHIVE_POLICY.coldDays,
      indexDays: policy.indexDays === null ? null : Number.isFinite(policy.indexDays) ? policy.indexDays : (DEFAULT_INDEX_DAYS[product.kind] || DEFAULT_INDEX_FALLBACK_DAYS)
    };
  };

  const adjustCount = (productKey, removed) => (removed > 0
    ? db.query("UPDATE harvest_products SET frame_count = GREATEST(0, frame_count - $2), updated_at = NOW() WHERE product_key = $1", [productKey, removed])
    : null);

  const adjustCounts = async (rows) => {
    const counts = new Map();
    for (const row of rows) counts.set(row.product_key, (counts.get(row.product_key) || 0) + 1);
    for (const [productKey, removed] of counts.entries()) await adjustCount(productKey, removed);
  };

  const thinArchive = async (product, policy) => {
    let removed = 0;
    for (let round = 0; round < 10; round += 1) {
      const result = await db.query(
        `WITH ranked AS (
           SELECT frame_id, observed_at,
                  ROW_NUMBER() OVER (PARTITION BY date_trunc('hour', observed_at) ORDER BY observed_at) AS hour_rank,
                  ROW_NUMBER() OVER (PARTITION BY date_trunc('day', observed_at) ORDER BY observed_at) AS day_rank
           FROM harvest_frames
           WHERE product_key = $1 AND observed_at < NOW() - make_interval(hours => $2)
         ),
         doomed AS (
           SELECT frame_id FROM ranked
           WHERE (observed_at >= NOW() - make_interval(days => $3) AND hour_rank > 1)
              OR (observed_at < NOW() - make_interval(days => $3) AND day_rank > 1)
              OR ($4::int IS NOT NULL AND observed_at < NOW() - make_interval(days => $4::int))
           LIMIT ${BATCH}
         )
         DELETE FROM harvest_frames f USING doomed WHERE f.frame_id = doomed.frame_id`,
        [product.product_key, policy.hotHours, policy.warmDays, policy.coldDays]
      );
      removed += result.rowCount;
      if (result.rowCount < BATCH) break;
    }
    return removed;
  };

  const expireIndex = async (heartbeat) => {
    let removed = 0;
    for (let round = 0; round < 50; round += 1) {
      await heartbeat();
      const result = await db.query(
        `WITH doomed AS (
           SELECT f.frame_id, f.product_key
           FROM harvest_frames f
           JOIN harvest_products p ON p.product_key = f.product_key
           WHERE f.blob_hash IS NULL
             AND (p.policy -> 'indexDays') IS DISTINCT FROM 'null'::jsonb
             AND f.observed_at < NOW() - make_interval(days => COALESCE(
               CASE WHEN jsonb_typeof(p.policy -> 'indexDays') = 'number' THEN round((p.policy ->> 'indexDays')::numeric)::int END,
               ($1::jsonb ->> p.kind)::int,
               $2::int
             ))
           LIMIT ${BATCH}
         )
         DELETE FROM harvest_frames f USING doomed WHERE f.frame_id = doomed.frame_id
         RETURNING doomed.product_key`,
        [JSON.stringify(DEFAULT_INDEX_DAYS), DEFAULT_INDEX_FALLBACK_DAYS]
      );
      removed += result.rowCount;
      await adjustCounts(result.rows);
      if (result.rowCount < BATCH) break;
    }
    return removed;
  };

  const deleteOrphanBlobs = async () => {
    let removed = 0;
    for (let round = 0; round < 20; round += 1) {
      const result = await db.query(
        `DELETE FROM harvest_blobs
         WHERE blob_hash IN (
           SELECT b.blob_hash FROM harvest_blobs b
           WHERE NOT EXISTS (SELECT 1 FROM harvest_frames f WHERE f.blob_hash = b.blob_hash)
           LIMIT 500
         )`
      );
      removed += result.rowCount;
      if (result.rowCount < 500) break;
    }
    return removed;
  };

  const storageBytes = async () => {
    const result = await db.query("SELECT COALESCE(SUM(byte_size), 0)::bigint AS total FROM harvest_blobs");
    return Number(result.rows[0].total);
  };

  const diskBytes = async () => {
    const result = await db.query(
      `SELECT COALESCE(SUM(pg_total_relation_size(c.oid)), 0)::bigint AS total
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE c.relkind = 'r' AND n.nspname = current_schema() AND c.relname LIKE 'harvest\\_%'`
    );
    return Number(result.rows[0].total);
  };

  const enforceBudget = async (heartbeat) => {
    let trimmed = 0;
    for (let round = 0; round < 20; round += 1) {
      await heartbeat();
      const total = await storageBytes();
      if (total <= config.storageBudgetBytes) break;
      const result = await db.query(
        `WITH latest AS (
           SELECT product_key, MAX(observed_at) AS observed_at FROM harvest_frames WHERE blob_hash IS NOT NULL GROUP BY product_key
         ),
         doomed AS (
           SELECT f.frame_id, f.product_key FROM harvest_frames f
           LEFT JOIN latest l ON l.product_key = f.product_key AND l.observed_at = f.observed_at
           WHERE f.blob_hash IS NOT NULL AND l.product_key IS NULL
           ORDER BY f.observed_at ASC
           LIMIT 500
         )
         DELETE FROM harvest_frames f USING doomed WHERE f.frame_id = doomed.frame_id
         RETURNING doomed.product_key`
      );
      if (!result.rowCount) break;
      trimmed += result.rowCount;
      await adjustCounts(result.rows);
      await deleteOrphanBlobs();
    }
    return trimmed;
  };

  const run = async (heartbeat = async () => null) => {
    const summary = { thinned: 0, expired: 0, orphanBlobs: 0, budgetTrimmed: 0, events: 0, nodes: 0 };
    const products = await db.query(
      "SELECT product_key, kind, mode, policy FROM harvest_products WHERE mode = 'archive' AND frame_count > 0 ORDER BY last_frame_at ASC NULLS FIRST"
    );
    for (const product of products.rows) {
      await heartbeat();
      const thinned = await thinArchive(product, policyFor(product));
      await adjustCount(product.product_key, thinned);
      summary.thinned += thinned;
    }
    summary.expired = await expireIndex(heartbeat);
    await heartbeat();
    summary.orphanBlobs = await deleteOrphanBlobs();
    summary.budgetTrimmed = await enforceBudget(heartbeat);
    await heartbeat();
    const events = await db.query("DELETE FROM harvest_events WHERE created_at < NOW() - make_interval(days => $1)", [config.eventRetentionDays]);
    summary.events = events.rowCount;
    const nodes = await db.query("DELETE FROM harvest_crawl_nodes WHERE status <> 'active' AND updated_at < NOW() - INTERVAL '7 days'");
    summary.nodes = nodes.rowCount;
    await db.query("DELETE FROM harvest_queue WHERE attempts >= max_attempts AND (locked_until IS NULL OR locked_until < NOW())");
    return { summary };
  };

  return { run, policyFor, storageBytes, diskBytes };
})();

const notify = (() => {
  const subscribers = new Set();
  let client = null;
  let connecting = null;
  let releaseTimer = null;
  let heartbeatTimer = null;

  const broadcast = (payload) => {
    let data;
    try {
      data = JSON.parse(payload);
    } catch (error) {
      return;
    }
    for (const subscriber of subscribers) {
      if (subscriber.domain && data.domain !== subscriber.domain) continue;
      if (subscriber.productKey && data.productKey !== subscriber.productKey) continue;
      subscriber.res.write(`event: frame\ndata: ${JSON.stringify(data)}\n\n`);
      if (typeof subscriber.res.flush === "function") subscriber.res.flush();
    }
  };

  const connect = async () => {
    if (client) return;
    if (connecting) return connecting;
    connecting = (async () => {
      const connection = await db.pool.connect();
      connection.on("notification", (message) => {
        if (message.channel === "harvest_frames") broadcast(message.payload);
      });
      connection.on("error", () => {
        client = null;
      });
      await connection.query("LISTEN harvest_frames");
      client = connection;
    })();
    try {
      await connecting;
    } finally {
      connecting = null;
    }
  };

  const release = async () => {
    if (subscribers.size > 0 || !client) return;
    const connection = client;
    client = null;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    await connection.query("UNLISTEN harvest_frames").catch(() => null);
    connection.release();
  };

  const subscribe = async (res, filter) => {
    if (releaseTimer) clearTimeout(releaseTimer);
    releaseTimer = null;
    await connect();
    const subscriber = { res, domain: filter.domain || null, productKey: filter.productKey || null };
    subscribers.add(subscriber);
    if (!heartbeatTimer) {
      heartbeatTimer = setInterval(() => {
        for (const entry of subscribers) {
          entry.res.write(": keep-alive\n\n");
          if (typeof entry.res.flush === "function") entry.res.flush();
        }
      }, 15000);
    }
    return () => {
      subscribers.delete(subscriber);
      if (subscribers.size === 0) releaseTimer = setTimeout(release, 60000);
    };
  };

  return { subscribe };
})();

const lifecycle = (() => {
  const { ingest } = ingestion;

  const CORE_SOURCE = { sourceKey: "harvester-core", domain: "core", adapter: "core", name: "Harvester Core" };

  const state = {
    started: false,
    ready: false,
    stopping: false,
    missingTables: [],
    active: 0,
    lanes: { discovery: 0, download: 0, frontier: 0 },
    ticking: false,
    lagMs: 0,
    throttle: "Normal",
    timer: null,
    lastTickAt: null,
    lastError: null,
    processed: 0,
    failed: 0
  };

  const CORE_HANDLERS = {
    crawl: crawler.runCrawl,
    "crawl-roots": crawler.runCrawlRoots,
    fetch: jobs.runFetch,
    process: jobs.runProcess,
    maintain: (job, context) => maintenance.run(context.heartbeat)
  };

  const buildContext = async (job) => {
    const definition = registry.sourceDefinition(job.source_key) || CORE_SOURCE;
    const sourceConfig = definition === CORE_SOURCE ? {} : await registry.sourceConfig(job.source_key);
    const context = {
      sourceKey: job.source_key,
      domain: definition.domain,
      source: definition,
      config: sourceConfig,
      http,
      store,
      queue,
      events,
      cursors,
      heartbeat: () => queue.heartbeat(job),
      crawlSpec: (specKey) => registry.crawlSpec(job.source_key, specKey, sourceConfig)
    };
    context.ingest = (candidates, options) => ingest(context, candidates, options);
    return context;
  };

  const lagMonitor = monitorEventLoopDelay({ resolution: 20 });

  const measureLag = () => {
    const p95 = lagMonitor.percentile(95) / 1e6;
    lagMonitor.reset();
    state.lagMs = Number.isFinite(p95) ? Math.round(Math.max(p95, state.lagMs * 0.6)) : state.lagMs;
    state.throttle = state.lagMs > config.maxLagMs * 3 ? "Paused" : state.lagMs > config.maxLagMs ? "Reduced" : "Normal";
  };

  const laneLimits = () => {
    if (state.throttle === "Paused") return { discovery: 0, download: 0, frontier: 0 };
    if (state.throttle === "Reduced") return { discovery: 1, download: 1, frontier: 0 };
    return { discovery: config.discoveryConcurrency, download: config.concurrency, frontier: config.frontierConcurrency };
  };

  const runJob = async (job) => {
    state.active += 1;
    const lane = queue.laneOf(job);
    state.lanes[lane] += 1;
    try {
      const entry = CORE_HANDLERS[job.job_type] ? { handler: CORE_HANDLERS[job.job_type] } : registry.handlerFor(job.job_type);
      if (!entry) {
        await queue.defer(job, 120000);
        if (job.source_key && job.source_key !== CORE_SOURCE.sourceKey) await store.recordSourceRun(job.source_key, `No handler is registered for the job type ${job.job_type} on this instance, so check that its module is listed in harvester/index.js.`).catch(() => null);
        await events.warn(`No handler is registered for the job type ${job.job_type} on this instance, so the job was deferred.`, { sourceKey: job.source_key });
        return;
      }
      const context = await buildContext(job);
      const outcome = await entry.handler(job, context);
      if (outcome && typeof outcome.requeue === "number") {
        await queue.completeAndRequeue(job, { dedupeKey: job.dedupe_key, jobType: job.job_type, sourceKey: job.source_key, payload: job.payload, priority: job.priority, runAfter: new Date(Date.now() + outcome.requeue * 1000) });
      } else if (outcome && outcome.requeue) await queue.completeAndRequeue(job, outcome.requeue);
      else await queue.complete(job);
      if (job.source_key && job.source_key !== CORE_SOURCE.sourceKey && queue.laneOf(job) !== "download") await store.recordSourceRun(job.source_key, null);
      state.processed += 1;
    } catch (error) {
      state.failed += 1;
      if (error instanceof DeferError) {
        await queue.defer(job, error.delayMs).catch(() => null);
        return;
      }
      const message = cleanMessage(error);
      if (job.source_key && job.source_key !== CORE_SOURCE.sourceKey && queue.laneOf(job) !== "download") await store.recordSourceRun(job.source_key, `The ${job.job_type} job failed because ${message.charAt(0).toLowerCase()}${message.slice(1)}.`).catch(() => null);
      if (isPermanent(error)) {
        await queue.complete(job).catch(() => null);
        await events.warn(`The ${job.job_type} job was dropped because ${message.charAt(0).toLowerCase()}${message.slice(1)}.`, { sourceKey: job.source_key, details: { payload: job.payload } });
        return;
      }
      const retryDelay = error instanceof HttpStatusError && error.retryAfterMs ? error.retryAfterMs : null;
      const outcome = await queue.fail(job, error, retryDelay).catch(() => ({ dropped: false }));
      if (outcome.dropped) {
        await events.error(`The ${job.job_type} job failed after ${job.attempts} attempts, and the last error was "${message}".`, { sourceKey: job.source_key, details: { payload: job.payload } });
      }
    } finally {
      state.active -= 1;
      state.lanes[lane] -= 1;
      if (!state.stopping && !state.ticking) {
        if (state.timer) clearTimeout(state.timer);
        state.timer = setTimeout(tick, 50);
      }
    }
  };

  let lastScheduleAt = 0;

  const tick = async () => {
    state.timer = null;
    if (state.stopping || state.ticking) return;
    state.ticking = true;
    let claimed = 0;
    let saturated = true;
    try {
      state.lastTickAt = new Date();
      measureLag();
      if (Date.now() - lastScheduleAt >= config.tickMs) {
        lastScheduleAt = Date.now();
        await schedules.fireDue(25);
      }
      const limits = laneLimits();
      const free = {};
      for (const lane of Object.keys(limits)) free[lane] = Math.max(0, limits[lane] - state.lanes[lane]);
      if (Object.values(free).some((value) => value > 0)) {
        const batch = await queue.claim(free);
        claimed = batch.length;
        for (const job of batch) runJob(job).catch(() => null);
        saturated = Object.keys(limits).every((lane) => state.lanes[lane] >= limits[lane]);
      }
      state.lastError = null;
    } catch (error) {
      state.lastError = `${cleanMessage(error)}.`;
    } finally {
      state.ticking = false;
      if (!state.stopping && !state.timer) state.timer = setTimeout(tick, claimed > 0 && !saturated ? 250 : config.tickMs);
    }
  };

  const initialize = async () => {
    state.missingTables = await db.missingTables();
    if (state.missingTables.length) return false;
    const sources = [CORE_SOURCE, ...registry.allSources()];
    await store.upsertSources(sources);
    for (const [host, ms] of Object.entries(registry.allHosts())) hosts.setHostInterval(host, ms);
    await schedules.ensure([
      { scheduleKey: "harvester-core:maintain", sourceKey: CORE_SOURCE.sourceKey, jobType: "maintain", intervalSeconds: 900 },
      ...registry.allSchedules()
    ]);
    await queue.enqueue(registry.allStartupJobs(), { onConflict: "earliest" });
    return true;
  };

  const start = async (options = {}) => {
    if (state.started) return status();
    const mode = options.mode || config.mode;
    if (mode === "off") return status();
    state.started = true;
    state.stopping = false;
    const attempt = async () => {
      if (state.stopping) return;
      try {
        state.ready = await initialize();
      } catch (error) {
        state.ready = false;
        state.lastError = `${cleanMessage(error)}.`;
      }
      if (state.ready) {
        lagMonitor.enable();
        state.timer = setTimeout(tick, 500);
        return;
      }
      state.timer = setTimeout(attempt, 5 * 60 * 1000);
    };
    await attempt();
    return status();
  };

  const stop = async () => {
    state.stopping = true;
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
    const deadline = Date.now() + 20000;
    while (state.active > 0 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 200));
    state.started = false;
    return status();
  };

  const status = () => ({
    mode: config.mode,
    instanceId: config.instanceId,
    started: state.started,
    ready: state.ready,
    missingTables: state.missingTables,
    concurrency: config.concurrency + config.discoveryConcurrency + config.frontierConcurrency,
    active: state.active,
    lanes: { ...state.lanes },
    lagMs: state.lagMs,
    throttle: state.throttle,
    processed: state.processed,
    failed: state.failed,
    lastTickAt: state.lastTickAt,
    lastError: state.lastError
  });

  return { start, stop, status, CORE_SOURCE };
})();

const router = (() => {
  const router = express.Router();
  const CHUNK_BYTES = 1024 * 1024;
  const MODES = ["off", "index", "archive"];

  const clampInt = (value, fallback, min, max) => {
    const number = parseInt(value, 10);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
  };

  const fail = (res, status, message) => res.status(status).json({ success: false, message });

  const guarded = (handler) => async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      if (res.headersSent) return res.end();
      const missing = /relation "harvest_/.test(String(error && error.message));
      return fail(res, missing ? 503 : 500, missing
        ? "The harvester tables are missing, so apply the harvester schema before using this endpoint."
        : `The harvester request failed because of the error "${cleanMessage(error)}".`);
    }
  };

  const requireAdmin = (req, res, next) => {
    if (!config.adminToken) return fail(res, 403, "Harvester admin actions are disabled because HARVEST_ADMIN_TOKEN is not set.");
    const bearer = String(req.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
    const provided = Buffer.from(String(req.get("x-harvest-token") || (bearer ? bearer[1] : "")));
    const expected = Buffer.from(config.adminToken);
    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) return fail(res, 401, "The harvester admin token is missing or incorrect.");
    return next();
  };

  const frameView = (row) => ({
    frameId: String(row.frame_id),
    productKey: row.product_key,
    observedAt: row.observed_at,
    fetchedAt: row.fetched_at,
    stored: Boolean(row.blob_hash),
    mimeType: row.mime_type,
    width: row.width,
    height: row.height,
    byteSize: row.byte_size === null ? null : Number(row.byte_size),
    originUrl: row.origin_url,
    contentUrl: row.blob_hash || row.origin_url ? `/harvest/frames/${row.frame_id}/content` : null,
    metadata: row.metadata || {}
  });

  const historySupported = (sourceKey) => {
    const definition = registry.sourceDefinition(sourceKey);
    return Boolean(definition && registry.handlerFor(`${definition.adapter}:history`));
  };

  const productView = (row) => ({
    productKey: row.product_key,
    sourceKey: row.source_key,
    domain: row.domain,
    name: row.name,
    category: row.category,
    kind: row.kind,
    mode: row.mode,
    policy: row.policy || {},
    metadata: row.metadata || {},
    frameCount: row.frame_count,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    lastFrameAt: row.last_frame_at,
    history: historySupported(row.source_key)
  });

  router.get("/harvest/health", guarded(async (req, res) => {
    const status = lifecycle.status();
    const missing = await db.missingTables();
    if (missing.length) {
      return res.json({ success: true, status: "Needs Schema", message: "The harvester tables are missing, so apply the harvester schema to start collecting.", engine: status, missingTables: missing });
    }
    const [sources, queueStats, storage, disk, events, hosts, leads] = await Promise.all([
      db.query(
        `SELECT s.source_key, s.domain, s.name, s.enabled, s.last_run_at, s.last_success_at, s.last_error, s.error_streak,
                COUNT(p.product_key)::int AS products,
                COALESCE(SUM(p.frame_count), 0)::bigint AS frames,
                MAX(p.last_frame_at) AS last_frame_at
         FROM harvest_sources s
         LEFT JOIN harvest_products p ON p.source_key = s.source_key
         GROUP BY s.source_key
         ORDER BY s.domain, s.name`
      ),
      queue.stats(),
      maintenance.storageBytes(),
      maintenance.diskBytes(),
      db.query("SELECT source_key, product_key, level, message, created_at FROM harvest_events ORDER BY created_at DESC LIMIT 50"),
      db.query("SELECT host, min_interval_ms, backoff_until, error_streak, last_status, request_count, byte_count, updated_at FROM harvest_hosts ORDER BY host"),
      db.query("SELECT COUNT(*) FILTER (WHERE status = 'new')::int AS new_leads, COUNT(*)::int AS total_leads FROM harvest_leads")
    ]);
    const failing = sources.rows.filter((row) => row.enabled && row.error_streak >= 3).length;
    res.json({
      success: true,
      status: !status.ready ? "Idle" : failing ? "Degraded" : "Healthy",
      engine: status,
      storage: { usedBytes: storage, diskBytes: disk, budgetBytes: config.storageBudgetBytes },
      queue: queueStats,
      sources: sources.rows.map((row) => ({ ...row, frames: Number(row.frames) })),
      hosts: hosts.rows.map((row) => ({ ...row, request_count: Number(row.request_count), byte_count: Number(row.byte_count) })),
      leads: leads.rows[0] || { new_leads: 0, total_leads: 0 },
      events: events.rows
    });
  }));

  router.get("/harvest/domains", guarded(async (req, res) => {
    const result = await db.query(
      `SELECT domain, COUNT(*)::int AS products, COALESCE(SUM(frame_count), 0)::bigint AS frames, MAX(last_frame_at) AS last_frame_at,
              COUNT(*) FILTER (WHERE mode = 'archive')::int AS archived_products
       FROM harvest_products
       GROUP BY domain
       ORDER BY domain`
    );
    res.json({ success: true, domains: result.rows.map((row) => ({ ...row, frames: Number(row.frames) })) });
  }));

  router.get("/harvest/products", guarded(async (req, res) => {
    const limit = clampInt(req.query.limit, 100, 1, 500);
    const offset = clampInt(req.query.offset, 0, 0, 1000000);
    const filters = [];
    const params = [];
    const add = (sql, value) => {
      params.push(value);
      filters.push(sql.split("?").join(`$${params.length}`));
    };
    if (req.query.domain) add("domain = ?", String(req.query.domain));
    if (req.query.source) add("source_key = ?", String(req.query.source));
    if (req.query.category) add("category = ?", String(req.query.category));
    if (req.query.kind) add("kind = ?", String(req.query.kind));
    if (req.query.mode) add("mode = ?", String(req.query.mode));
    if (req.query.q) add("(name ILIKE ? OR product_key ILIKE ?)", `%${String(req.query.q).slice(0, 80)}%`);
    if (req.query.active === "true") filters.push("last_frame_at > NOW() - INTERVAL '1 day'");
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const [rows, total] = await Promise.all([
      db.query(`SELECT * FROM harvest_products ${where} ORDER BY domain, category NULLS LAST, name LIMIT ${limit} OFFSET ${offset}`, params),
      db.query(`SELECT COUNT(*)::int AS total FROM harvest_products ${where}`, params)
    ]);
    res.json({ success: true, total: total.rows[0].total, limit, offset, products: rows.rows.map(productView) });
  }));

  router.get("/harvest/products/:productKey", guarded(async (req, res) => {
    const product = await db.query("SELECT * FROM harvest_products WHERE product_key = $1", [req.params.productKey]);
    if (!product.rows.length) return fail(res, 404, "The requested product does not exist.");
    const latest = await db.query(
      `SELECT frame_id, product_key, observed_at, fetched_at, blob_hash, mime_type, width, height, byte_size, origin_url, metadata
       FROM harvest_frames WHERE product_key = $1 ORDER BY observed_at DESC LIMIT 1`,
      [req.params.productKey]
    );
    res.json({ success: true, product: productView(product.rows[0]), latestFrame: latest.rows[0] ? frameView(latest.rows[0]) : null });
  }));

  router.post("/harvest/products/:productKey/history", guarded(async (req, res) => {
    const body = req.body || {};
    const product = await store.getProduct(req.params.productKey);
    if (!product) return fail(res, 404, "The requested product does not exist.");
    const definition = registry.sourceDefinition(product.source_key);
    const jobType = definition ? `${definition.adapter}:history` : null;
    if (!jobType || !registry.handlerFor(jobType)) return fail(res, 400, "This product's source does not keep an addressable deep archive.");
    const from = new Date(String(body.from || ""));
    const to = new Date(String(body.to || ""));
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) return fail(res, 400, "The from and to parameters must be valid dates with from before to.");
    if (to.getTime() - from.getTime() > 400 * 86400000) return fail(res, 400, "History requests are limited to 400 days at a time.");
    const fromDay = from.toISOString().slice(0, 10);
    const toDay = to.toISOString().slice(0, 10);
    if (body.auto) {
      const cooldownKey = `history:auto:${product.product_key}:${fromDay}`;
      const cooldown = await cursors.get(cooldownKey);
      if (cooldown && Date.now() - new Date(cooldown.requestedAt).getTime() < 6 * 3600000) {
        return res.json({ success: true, queued: false, message: "A matching backfill was already requested recently." });
      }
      await cursors.set(cooldownKey, { requestedAt: new Date().toISOString() });
    }
    const inserted = await queue.enqueue([{
      dedupeKey: `history:${product.product_key}:${fromDay}:${toDay}`,
      jobType,
      sourceKey: product.source_key,
      priority: 7,
      payload: { productKey: product.product_key, from: from.toISOString(), to: to.toISOString() }
    }], { onConflict: "keep" });
    res.json({ success: true, queued: inserted > 0, message: inserted > 0 ? "The backfill was queued, and frames will appear as they are indexed." : "A matching backfill is already queued." });
  }));

  router.get("/harvest/products/:productKey/export", guarded(async (req, res) => {
    const product = await store.getProduct(req.params.productKey);
    if (!product) return fail(res, 404, "The requested product does not exist.");
    const format = ["csv", "json", "zip"].includes(String(req.query.format)) ? String(req.query.format) : "csv";
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 86400000);
    const to = req.query.to ? new Date(String(req.query.to)) : new Date();
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return fail(res, 400, "The from and to parameters must be valid dates.");
    const limit = clampInt(req.query.limit, format === "zip" ? 500 : 5000, 1, format === "zip" ? 500 : 5000);
    const step = clampInt(req.query.step, 0, 0, 86400 * 31);
    const rows = await db.query(
      step > 0
        ? `SELECT DISTINCT ON (bucket) * FROM (
             SELECT *, to_timestamp(floor(extract(epoch FROM observed_at) / ${step}) * ${step}) AS bucket
             FROM harvest_frames WHERE product_key = $1 AND observed_at BETWEEN $2 AND $3
           ) x ORDER BY bucket ASC, observed_at ASC LIMIT ${limit}`
        : `SELECT * FROM harvest_frames WHERE product_key = $1 AND observed_at BETWEEN $2 AND $3 ORDER BY observed_at ASC LIMIT ${limit}`,
      [product.product_key, from, to]
    );
    const stem = `${product.product_key}_${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}`;
    const contentUrl = (row) => `/harvest/frames/${row.frame_id}/content`;
    if (format === "json") {
      res.setHeader("Content-Disposition", `attachment; filename="${stem}.json"`);
      return res.json({ product: productView(product), exportedAt: new Date().toISOString(), from, to, frames: rows.rows.map((row) => ({ ...frameView(row), contentPath: contentUrl(row) })) });
    }
    const quote = (value) => `"${String(value === null || value === undefined ? "" : value).replace(/"/g, '""')}"`;
    const metadataKeys = [];
    for (const row of rows.rows.slice(0, 200)) {
      for (const [key, value] of Object.entries(row.metadata || {})) {
        if (metadataKeys.length >= 32 || metadataKeys.includes(key)) continue;
        if (value === null || ["string", "number", "boolean"].includes(typeof value)) metadataKeys.push(key);
      }
    }
    const manifest = [["ObservedAt", "Archived", "OriginUrl", "ContentPath", "MimeType", "ByteSize", "Width", "Height", ...metadataKeys].join(",")]
      .concat(rows.rows.map((row) => [row.observed_at.toISOString(), row.blob_hash ? "yes" : "no", quote(row.origin_url), contentUrl(row), row.mime_type || "", row.byte_size || "", row.width || "", row.height || "", ...metadataKeys.map((key) => quote((row.metadata || {})[key]))].join(",")))
      .join("\n");
    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${stem}.csv"`);
      return res.send(manifest);
    }
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${stem}.zip"`);
    const zip = zipWriter(res);
    const manifestEntry = await zip.open(`${stem}/manifest.csv`, new Date());
    await zip.write(manifestEntry, Buffer.from(manifest, "utf8"));
    await zip.close(manifestEntry);
    let totalBytes = 0;
    for (const row of rows.rows) {
      if (!row.blob_hash || totalBytes > 200 * 1024 * 1024) continue;
      const extension = /png/.test(row.mime_type || "") ? "png" : /gif/.test(row.mime_type || "") ? "gif" : /webp/.test(row.mime_type || "") ? "webp" : "jpg";
      const entry = await zip.open(`${stem}/${row.observed_at.toISOString().replace(/:/g, "-")}.${extension}`, row.observed_at);
      let position = 1;
      for (;;) {
        const chunk = await db.query("SELECT substring(content FROM $2 FOR $3) AS part FROM harvest_blobs WHERE blob_hash = $1", [row.blob_hash, position, CHUNK_BYTES]);
        const part = chunk.rows[0] ? chunk.rows[0].part : null;
        if (!part || part.length === 0) break;
        await zip.write(entry, part);
        position += part.length;
        totalBytes += part.length;
      }
      await zip.close(entry);
    }
    await zip.finish();
  }));

  router.get("/harvest/products/:productKey/frames", guarded(async (req, res) => {
    const limit = clampInt(req.query.limit, 240, 1, 2000);
    const step = clampInt(req.query.step, 0, 0, 86400 * 31);
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 86400000);
    const to = req.query.to ? new Date(String(req.query.to)) : new Date();
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return fail(res, 400, "The from and to parameters must be valid dates.");
    const storedOnly = req.query.stored === "true";
    const params = [req.params.productKey, from.toISOString(), to.toISOString(), limit];
    const base = `FROM harvest_frames WHERE product_key = $1 AND observed_at BETWEEN $2 AND $3${storedOnly ? " AND blob_hash IS NOT NULL" : ""}`;
    const columns = "frame_id, product_key, observed_at, fetched_at, blob_hash, mime_type, width, height, byte_size, origin_url, metadata";
    const result = step > 0
      ? await db.query(
        `SELECT ${columns} FROM (
           SELECT DISTINCT ON (FLOOR(EXTRACT(EPOCH FROM observed_at) / ${step})) ${columns}
           ${base}
           ORDER BY FLOOR(EXTRACT(EPOCH FROM observed_at) / ${step}), (blob_hash IS NULL), observed_at DESC
         ) thinned
         ORDER BY observed_at DESC
         LIMIT $4`,
        params
      )
      : await db.query(`SELECT ${columns} ${base} ORDER BY observed_at DESC LIMIT $4`, params);
    const frames = result.rows.map(frameView).reverse();
    res.json({ success: true, productKey: req.params.productKey, from, to, step, count: frames.length, frames });
  }));

  const sendBlob = async (req, res, frame) => {
    const etag = `"${frame.blob_hash}"`;
    res.set("ETag", etag);
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    if (req.get("if-none-match") === etag) return res.status(304).end();
    const size = Number(frame.blob_size);
    res.set("Content-Type", frame.blob_mime || "application/octet-stream");
    res.set("Content-Length", String(size));
    let aborted = false;
    res.on("close", () => {
      if (!res.writableFinished) aborted = true;
    });
    for (let offset = 1; offset <= size && !aborted; offset += CHUNK_BYTES) {
      const chunk = await db.query("SELECT substring(content FROM $2 FOR $3) AS part FROM harvest_blobs WHERE blob_hash = $1", [frame.blob_hash, offset, CHUNK_BYTES]);
      if (!chunk.rows.length || aborted) break;
      if (!res.write(chunk.rows[0].part)) {
        await new Promise((resolve) => {
          res.once("drain", resolve);
          res.once("close", resolve);
        });
      }
    }
    return res.end();
  };

  router.get("/harvest/frames/:frameId/content", guarded(async (req, res) => {
    if (!/^\d+$/.test(req.params.frameId)) return fail(res, 400, "The frame ID must be numeric.");
    const result = await db.query(
      `SELECT f.frame_id, f.blob_hash, f.origin_url, b.byte_size AS blob_size, b.mime_type AS blob_mime
       FROM harvest_frames f
       LEFT JOIN harvest_blobs b ON b.blob_hash = f.blob_hash
       WHERE f.frame_id = $1`,
      [req.params.frameId]
    );
    const frame = result.rows[0];
    if (!frame) return fail(res, 404, "The requested frame does not exist.");
    if (frame.blob_hash && frame.blob_size !== null) return sendBlob(req, res, frame);
    if (frame.origin_url && /^https:\/\//.test(frame.origin_url)) return res.redirect(302, frame.origin_url);
    return fail(res, 404, "The requested frame has no stored content or origin.");
  }));

  router.get("/harvest/products/:productKey/latest/content", guarded(async (req, res) => {
    const result = await db.query(
      `SELECT frame_id FROM harvest_frames
       WHERE product_key = $1 AND (blob_hash IS NOT NULL OR origin_url IS NOT NULL)
       ORDER BY observed_at DESC LIMIT 1`,
      [req.params.productKey]
    );
    if (!result.rows.length) return fail(res, 404, "The requested product has no frames yet.");
    res.set("Cache-Control", "no-cache");
    return res.redirect(302, `${req.baseUrl}/harvest/frames/${result.rows[0].frame_id}/content`);
  }));

  router.get("/harvest/raw/:sourceKey", guarded(async (req, res) => {
    const source = registry.sourceDefinition(req.params.sourceKey);
    if (!source || source.adapter !== "noaa-open-data") return fail(res, 404, "Raw browsing is only available for NOAA open data sources.");
    const sourceConfig = await registry.sourceConfig(req.params.sourceKey);
    const prefix = String(req.query.prefix || "").replace(/^\/+/, "").slice(0, 300);
    if (prefix.includes("..")) return fail(res, 400, "The prefix is not valid.");
    const listing = await http.text(listingUrl(sourceConfig.bucket, prefix, req.query.token ? String(req.query.token) : null), { accept: "application/xml" });
    const parsed = parseS3Listing(listing.text, sourceConfig.bucket);
    res.set("Cache-Control", "public, max-age=60");
    res.json({ success: true, bucket: sourceConfig.bucket, prefix, prefixes: parsed.prefixes, objects: parsed.objects, nextToken: parsed.nextToken });
  }));

  router.get("/harvest/stream", guarded(async (req, res) => {
    res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no" });
    res.flushHeaders();
    res.write("retry: 5000\n\n");
    if (typeof res.flush === "function") res.flush();
    const unsubscribe = await notify.subscribe(res, { domain: req.query.domain ? String(req.query.domain) : null, productKey: req.query.product ? String(req.query.product) : null });
    res.on("close", unsubscribe);
  }));

  router.post("/harvest/sources/:sourceKey/run", requireAdmin, guarded(async (req, res) => {
    const result = await schedules.runNow(req.params.sourceKey);
    if (!result.rowCount) return fail(res, 404, "The requested source has no schedules.");
    res.json({ success: true, message: "The source was scheduled to run on the next engine tick." });
  }));

  router.patch("/harvest/sources/:sourceKey", requireAdmin, guarded(async (req, res) => {
    const body = req.body || {};
    const enabled = typeof body.enabled === "boolean" ? body.enabled : null;
    const sourceConfig = body.config && typeof body.config === "object" && !Array.isArray(body.config) ? JSON.stringify(body.config) : null;
    const result = await db.query(
      `UPDATE harvest_sources
       SET enabled = COALESCE($2, enabled), config = COALESCE($3::jsonb, config), updated_at = NOW()
       WHERE source_key = $1
       RETURNING source_key, enabled, config`,
      [req.params.sourceKey, enabled, sourceConfig]
    );
    if (!result.rows.length) return fail(res, 404, "The requested source does not exist.");
    registry.invalidateConfig(req.params.sourceKey);
    res.json({ success: true, message: "The source settings were updated.", source: result.rows[0] });
  }));

  const LEAD_STATUSES = ["new", "reviewing", "adopted", "dismissed"];

  router.get("/harvest/leads", guarded(async (req, res) => {
    const status = String(req.query.status || "new").trim();
    const domain = String(req.query.domain || "").trim();
    const kind = String(req.query.kind || "").trim();
    const limit = Math.max(1, Math.min(500, parseInt(req.query.limit, 10) || 100));
    const conditions = [];
    const params = [];
    if (status !== "all") {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }
    if (domain) {
      params.push(domain);
      conditions.push(`domain = $${params.length}`);
    }
    if (kind) {
      params.push(kind);
      conditions.push(`kind = $${params.length}`);
    }
    params.push(limit);
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const [rows, counts] = await Promise.all([
      db.query(`SELECT lead_id, source_key, domain, url, host, kind, title, evidence, status, note, hits, first_seen_at, last_seen_at FROM harvest_leads ${where} ORDER BY hits DESC, last_seen_at DESC LIMIT $${params.length}`, params),
      db.query("SELECT status, kind, COUNT(*)::int AS total FROM harvest_leads GROUP BY status, kind ORDER BY status, kind")
    ]);
    res.json({ success: true, leads: rows.rows.map((row) => ({ ...row, leadId: String(row.lead_id) })), counts: counts.rows });
  }));

  const updateLead = guarded(async (req, res) => {
    const body = req.body || {};
    if (!/^\d+$/.test(String(req.params.leadId))) return fail(res, 400, "The lead ID must be numeric.");
    if (body.status !== undefined && !LEAD_STATUSES.includes(body.status)) return fail(res, 400, "The status must be new, reviewing, adopted, or dismissed.");
    const note = typeof body.note === "string" ? body.note.slice(0, 2000) : null;
    const result = await db.query(
      "UPDATE harvest_leads SET status = COALESCE($2, status), note = COALESCE($3, note), updated_at = NOW() WHERE lead_id = $1 RETURNING lead_id, url, kind, status, note",
      [req.params.leadId, body.status || null, note]
    );
    if (!result.rows.length) return fail(res, 404, "The requested lead does not exist.");
    res.json({ success: true, message: "The lead was updated.", lead: { ...result.rows[0], leadId: String(result.rows[0].lead_id) } });
  });

  router.patch("/harvest/leads/:leadId", updateLead);
  router.post("/harvest/leads/:leadId", updateLead);

  router.get("/harvest/frontier", guarded(async (req, res) => {
    const domain = String(req.query.domain || "").trim();
    const sources = registry.allSources().filter((source) => source.adapter === "frontier" && (!domain || source.domain === domain));
    const result = [];
    for (const source of sources) {
      const summary = await frontier.summarize(source.sourceKey);
      const sourceConfig = await registry.sourceConfig(source.sourceKey);
      result.push({ sourceKey: source.sourceKey, domain: source.domain, seeds: sourceConfig.seeds || [], allow: sourceConfig.allow || [], deny: sourceConfig.deny || [], ...summary });
    }
    res.json({ success: true, frontiers: result });
  }));

  router.post("/harvest/frontier/seeds", requireAdmin, guarded(async (req, res) => {
    const body = req.body || {};
    const domain = String(body.domain || "").trim();
    const url = String(body.url || "").trim();
    const sourceKey = `${domain}-frontier`;
    const source = registry.sourceDefinition(sourceKey);
    if (!source) return fail(res, 404, "The requested domain has no frontier.");
    if (!/^https?:\/\//.test(url)) return fail(res, 400, "The seed must be an absolute HTTP or HTTPS URL.");
    const current = await registry.sourceConfig(sourceKey);
    const allow = Array.isArray(body.allow) ? Array.from(new Set([...(current.allow || []), ...body.allow.map(String)])) : current.allow || [];
    if (!frontier.allowed({ ...current, allow }, url)) return fail(res, 400, "The seed host is not on the allow list, so pass allow entries with it.");
    const seeds = Array.from(new Set([...(current.seeds || []), url]));
    const stored = await db.query("SELECT config FROM harvest_sources WHERE source_key = $1", [sourceKey]);
    const next = { ...((stored.rows[0] && stored.rows[0].config) || {}), seeds, allow };
    await db.query("UPDATE harvest_sources SET config = $2::jsonb, updated_at = NOW() WHERE source_key = $1", [sourceKey, JSON.stringify(next)]);
    registry.invalidateConfig(sourceKey);
    await queue.enqueue([{ dedupeKey: `frontier:seed-now:${sourceKey}:${Date.now()}`, jobType: "frontier:seed", sourceKey, priority: 1, payload: {} }], { onConflict: "keep" });
    res.json({ success: true, message: "The seed was added and will be visited on the next engine tick.", seeds, allow });
  }));

  router.patch("/harvest/products/:productKey", requireAdmin, guarded(async (req, res) => {
    const body = req.body || {};
    if (body.mode !== undefined && !MODES.includes(body.mode)) return fail(res, 400, "The mode must be off, index, or archive.");
    const policy = body.policy && typeof body.policy === "object" && !Array.isArray(body.policy) ? JSON.stringify(body.policy) : null;
    const result = await db.query(
      `UPDATE harvest_products
       SET mode = COALESCE($2, mode), policy = COALESCE($3::jsonb, policy), updated_at = NOW()
       WHERE product_key = $1
       RETURNING *`,
      [req.params.productKey, body.mode || null, policy]
    );
    if (!result.rows.length) return fail(res, 404, "The requested product does not exist.");
    res.json({ success: true, message: "The product settings were updated.", product: productView(result.rows[0]) });
  }));

  return router;
})();

const registeredDomains = new Set();

const registerDomains = (domainModules) => {
  const enabled = String(process.env.HARVEST_DOMAINS || "").split(",").map((value) => value.trim()).filter(Boolean);
  for (const domainModule of domainModules) {
    if (registeredDomains.has(domainModule.domain)) continue;
    if (enabled.length && !enabled.includes(domainModule.domain)) continue;
    registeredDomains.add(domainModule.domain);
    for (const adapter of domainModule.adapters || []) registry.register(adapter);
    for (const [key, processor] of Object.entries(domainModule.processors || {})) jobs.registerProcessor(key, processor);
    for (const interpreter of domainModule.interpreters || []) frontier.registerInterpreter(interpreter);
    if (domainModule.frontier) frontier.addDomain(domainModule.domain, domainModule.frontier);
  }
};

module.exports = {
  router,
  start: lifecycle.start,
  stop: lifecycle.stop,
  status: lifecycle.status,
  registerDomains,
  config,
  db,
  hosts,
  http,
  queue,
  store,
  events,
  cursors,
  crawler,
  ingestion,
  jobs,
  registry,
  frontier,
  slug,
  titleCase,
  cleanMessage,
  sleep,
  hostOf,
  parseTimestamp,
  parseAnyDate,
  pathTimeRange,
  expandPeriod,
  decodeXml,
  tagText,
  tagTexts,
  tagBlocks,
  attrValue,
  selfClosingAttrs,
  createLeafScanner,
  parseAutoindex,
  listingUrl,
  objectUrl,
  parseS3Listing,
  s3NodeUrl,
  parseS3NodeUrl,
  probeImage,
  IMAGE_EXTENSIONS,
  encodePng,
  HarvestError,
  HttpStatusError,
  TooLargeError,
  DeferError,
  PermanentError,
  isPermanent
};