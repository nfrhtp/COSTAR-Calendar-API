/**
 * COSTAR Calendar API — read-only Worker over pregenerated static data.
 *
 * All calendar data is built from the golden CSV by build/build_api_data.py
 * and shipped as static assets; this Worker only routes, slices, and frames
 * responses. It never computes calendar values.
 *
 * v1 response shapes are frozen: additive changes only.
 */

const DOCS = "https://api.costar.date/";
const MAX_RANGE_DAYS = 400;
const MAX_NEXT_COUNT = 10;
// Kinds of /v1/next/{kind}; each has a pregenerated sorted date index at
// /v1/data/next/{kind}.json (see build/build_api_data.py NEXT_KINDS).
const NEXT_KINDS = ["triple-luma", "full-moon", "new-moon", "shen-week",
  "shen-lunation", "solar-event", "spiral-year"];
const DAY_MS = 86400000;

let cachedMeta = null;

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return err(405, "This API is read-only; only GET is supported.");
    }
    const url = new URL(request.url);
    const seg = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
    try {
      if (seg[0] !== "v1") {
        return err(404, `Unknown path. All endpoints live under /v1/.`);
      }
      const meta = await getMeta(env, request);
      const rest = seg.slice(1);
      const raw = url.searchParams.get("raw") === "1";

      if (rest[0] === "meta" && rest.length === 1) return json(meta, 3600, meta);
      if (rest[0] === "today" && rest.length === 1) {
        return day(env, request, meta, todayPT(), raw, 300);
      }
      if (rest[0] === "day" && rest.length === 2) {
        return day(env, request, meta, rest[1], raw, 3600);
      }
      if (rest[0] === "range" && rest.length === 3) {
        return range(env, request, meta, rest[1], rest[2], raw);
      }
      if (rest[0] === "month" && rest.length === 2) {
        const m = /^(\d{4})-(\d{2})$/.exec(rest[1]);
        if (!m) return err(400, "Month must look like /v1/month/2026-07.");
        const first = `${rest[1]}-01`;
        const last = isoShift(`${rest[1]}-28`, 4).slice(0, 8) + "01"; // into next month
        return range(env, request, meta, first, isoShift(last, -1), raw);
      }
      if (rest[0] === "year" && rest.length === 2) {
        if (!/^\d{4}$/.test(rest[1])) return err(400, "Year must look like /v1/year/2026.");
        return range(env, request, meta, `${rest[1]}-01-01`, `${rest[1]}-12-31`, raw);
      }
      if (rest[0] === "events") return events(env, request, meta, rest.slice(1));
      if (rest[0] === "next" && rest.length === 2) {
        return next(env, request, meta, rest[1], url.searchParams);
      }
      if (rest[0] === "costar") return costarLookup(env, request, meta, rest.slice(1));
      return err(404, "Unknown endpoint.", endpointHint());
    } catch (e) {
      return err(500, `Internal error: ${e.message}`);
    }
  },
};

/* ---------- endpoints ---------- */

async function day(env, request, meta, date, raw, maxAge) {
  const d = validDate(date);
  if (!d) return err(400, `Not a valid ISO date: "${date}". Use YYYY-MM-DD.`);
  if (d < meta.coverage.start || d > meta.coverage.end) {
    return err(404, `${d} is outside dataset coverage ` +
      `(${meta.coverage.start} to ${meta.coverage.end}).`);
  }
  const tree = raw ? "raw" : "years";
  const file = await loadJSON(env, request, `/v1/data/${tree}/${d.slice(0, 4)}.json`);
  const obj = file?.days?.[d];
  if (!obj) return err(404, `No data for ${d}.`);
  const body = raw
    ? { date: d, columns: obj, meta: metaStamp(meta) }
    : { ...obj, meta: metaStamp(meta) };
  return json(body, maxAge, meta);
}

async function range(env, request, meta, start, end, raw) {
  const s = validDate(start), e = validDate(end);
  if (!s || !e) return err(400, "Range dates must be valid ISO dates (YYYY-MM-DD).");
  if (s > e) return err(400, "Range start must not be after its end.");
  const cs = s < meta.coverage.start ? meta.coverage.start : s;
  const ce = e > meta.coverage.end ? meta.coverage.end : e;
  if (cs > ce) {
    return err(404, `Range is entirely outside dataset coverage ` +
      `(${meta.coverage.start} to ${meta.coverage.end}).`);
  }
  if (spanDays(cs, ce) > MAX_RANGE_DAYS) {
    return err(400, `Range too large: max ${MAX_RANGE_DAYS} days per request.`);
  }
  const tree = raw ? "raw" : "years";
  const files = {};
  const days = [];
  for (let d = cs; d <= ce; d = isoShift(d, 1)) {
    const y = d.slice(0, 4);
    files[y] ??= await loadJSON(env, request, `/v1/data/${tree}/${y}.json`);
    const obj = files[y]?.days?.[d];
    if (obj) days.push(raw ? { date: d, columns: obj } : obj);
  }
  const body = {
    start: cs, end: ce, count: days.length,
    clipped: cs !== s || ce !== e || undefined,
    days, meta: metaStamp(meta),
  };
  return json(body, 3600, meta);
}

async function events(env, request, meta, rest) {
  if (rest[0] === "shen" && rest.length === 1) {
    const data = await loadJSON(env, request, "/v1/data/events/shen.json");
    return json({ ...data, meta: metaStamp(meta) }, 3600, meta);
  }
  const kinds = ["phases", "solar-terms", "lunations"];
  if (rest.length === 2 && kinds.includes(rest[0]) && /^\d{4}$/.test(rest[1])) {
    const data = await loadJSON(env, request, `/v1/data/events/${rest[0]}/${rest[1]}.json`);
    if (!data) {
      return err(404, `No ${rest[0]} index for ${rest[1]} (coverage ` +
        `${meta.coverage.start} to ${meta.coverage.end}).`);
    }
    return json({ kind: rest[0], ...data, meta: metaStamp(meta) }, 3600, meta);
  }
  return err(404, "Events endpoints: /v1/events/{phases|solar-terms|lunations}/{year} " +
    "and /v1/events/shen.");
}

async function next(env, request, meta, kind, params) {
  if (!NEXT_KINDS.includes(kind)) {
    return err(404, `Unknown kind "${kind}".`,
      `Kinds: ${NEXT_KINDS.join(", ")} — e.g. /v1/next/full-moon?from=2026-10-19&count=3.`);
  }
  // An empty from= or count= counts as absent: chatbot tools send every
  // declared parameter and leave the unused ones blank (Chatbase, 2026-10-20).
  const blank = (v) => v === null || v.trim() === "";
  const fromParam = blank(params.get("from")) ? null : params.get("from");
  const from = fromParam === null ? todayPT() : validDate(fromParam);
  if (!from) return err(400, `Not a valid ISO date: "${fromParam}". Use from=YYYY-MM-DD.`);
  const countParam = blank(params.get("count")) ? null : params.get("count");
  const count = countParam === null ? 1 : Number(countParam);
  if (!/^\d+$/.test(countParam ?? "1") || count < 1 || count > MAX_NEXT_COUNT) {
    return err(400, `count must be an integer from 1 to ${MAX_NEXT_COUNT} (got "${countParam}").`);
  }
  if (from > meta.coverage.end) {
    return err(404, `${from} is outside dataset coverage ` +
      `(${meta.coverage.start} to ${meta.coverage.end}).`);
  }
  const index = await loadJSON(env, request, `/v1/data/next/${kind}.json`);
  const dates = index.dates;
  // Binary search: first index date >= from.
  let lo = 0, hi = dates.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (dates[mid] < from) lo = mid + 1; else hi = mid;
  }
  const picked = dates.slice(lo, lo + count);
  const files = {};
  const results = [];
  for (const d of picked) {
    const y = d.slice(0, 4);
    files[y] ??= await loadJSON(env, request, `/v1/data/years/${y}.json`);
    const obj = files[y]?.days?.[d];
    if (obj) results.push(obj);
  }
  const body = {
    kind, from, count: results.length,
    clipped: results.length < count || undefined,
    results, meta: metaStamp(meta),
  };
  return json(body, fromParam === null ? 300 : 3600, meta);
}

async function costarLookup(env, request, meta, rest) {
  if (rest.length !== 5) {
    return err(400, "Reverse lookup takes 5 segments: " +
      "/v1/costar/{R#}/{SY#}/{lunation}/{weekLuma}/{dayChroma}, " +
      "e.g. /v1/costar/R1/SY1/Red/Gamma/Yellow (resolved CD values, no slashes).");
  }
  const [rSeg, sySeg, ...names] = rest;
  const r = /^r(-?\d+)$/i.exec(rSeg);
  const sy = /^sy(\d+)$/i.exec(sySeg);
  if (!r || !sy) {
    return err(400, `First segments must look like R1 and SY7 (got "${rSeg}", "${sySeg}").`);
  }
  const words = names.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  const key = `R${r[1]} SY${parseInt(sy[1], 10)} ${words.join(" ")}`;
  const index = await loadJSON(env, request, "/v1/data/costar-index.json");
  const dates = index[key];
  if (!dates) {
    return err(404, `No day matches COSTAR date "${key}".`,
      "Reverse lookup uses the resolved CD values: lunation White or Black " +
      "(never White/Black), weekLuma Epsilon or Alpha (never Epsilon/Alpha), " +
      "dayChroma Black on Sundays.");
  }
  return json({ costarDate: key, count: dates.length, dates, meta: metaStamp(meta) }, 3600, meta);
}

/* ---------- helpers ---------- */

async function getMeta(env, request) {
  if (!cachedMeta) {
    cachedMeta = await loadJSON(env, request, "/v1/meta.json");
  }
  return cachedMeta;
}

async function loadJSON(env, request, path) {
  const res = await env.ASSETS.fetch(new URL(path, request.url));
  if (!res.ok) return null;
  return res.json();
}

function metaStamp(meta) {
  return { apiVersion: meta.apiVersion, datasetVersion: meta.datasetVersion, docs: DOCS };
}

function todayPT() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10) === s ? s : null;
}

function isoShift(date, days) {
  return new Date(Date.parse(date + "T00:00:00Z") + days * DAY_MS)
    .toISOString().slice(0, 10);
}

function spanDays(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS) + 1;
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Max-Age": "86400",
  };
}

function json(body, maxAge, meta) {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${maxAge}`,
      "X-Dataset-Version": meta?.datasetVersion ?? "unknown",
      ...corsHeaders(),
    },
  });
}

function err(status, message, hint) {
  return new Response(JSON.stringify({ error: message, hint, docs: DOCS }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders() },
  });
}

function endpointHint() {
  return "Endpoints: /v1/today, /v1/day/{date}, /v1/range/{start}/{end}, " +
    "/v1/month/{yyyy-mm}, /v1/year/{yyyy}, /v1/events/…, /v1/next/{kind}, " +
    "/v1/costar/…, " +
    "/v1/dataset.csv, /v1/dataset.json, /v1/meta.";
}
