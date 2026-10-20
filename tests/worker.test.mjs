// Route tests for the Worker, run against the locally built public/ tree
// with a filesystem mock of the static assets binding.
//
//   python3 build/build_api_data.py source/costar_calendar_*.csv --out public
//   node --test tests/worker.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import worker from "../worker/index.js";

const PUBLIC = fileURLToPath(new URL("../public", import.meta.url));

const env = {
  ASSETS: {
    async fetch(urlOrRequest) {
      const url = new URL(urlOrRequest.url ?? urlOrRequest);
      try {
        const body = await readFile(PUBLIC + url.pathname);
        return new Response(body, { status: 200 });
      } catch {
        return new Response("not found", { status: 404 });
      }
    },
  },
};

async function get(path) {
  const res = await worker.fetch(new Request(`https://api.costar.date${path}`), env);
  let body = null;
  try { body = await res.json(); } catch {}
  return { res, body };
}

test("day lookup returns structured object with meta stamp", async () => {
  const { res, body } = await get("/v1/day/2026-07-21");
  assert.equal(res.status, 200);
  assert.equal(body.date, "2026-07-21");
  assert.match(body.costarDate, /^R1 SY1 /);
  assert.equal(body.costar.rotundum, 1);
  assert.equal(body.meta.apiVersion, "v1");
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), "*");
});

test("raw mode returns the 41 verbatim columns", async () => {
  const { res, body } = await get("/v1/day/2000-11-19?raw=1");
  assert.equal(res.status, 200);
  assert.equal(Object.keys(body.columns).length, 41);
  assert.equal(body.columns["Transitions Week Luma"], "Delta/Epsilon/Alpha");
});

test("invalid and out-of-coverage dates fail cleanly", async () => {
  assert.equal((await get("/v1/day/2026-02-30")).res.status, 400);
  assert.equal((await get("/v1/day/1999-01-01")).res.status, 404);
  assert.equal((await get("/v1/nope")).res.status, 404);
});

test("today resolves to a Pacific-Time date inside coverage", async () => {
  const { res, body } = await get("/v1/today");
  assert.equal(res.status, 200);
  assert.match(body.date, /^\d{4}-\d{2}-\d{2}$/);
});

test("range spans year files and counts correctly", async () => {
  const { res, body } = await get("/v1/range/2026-12-28/2027-01-03");
  assert.equal(res.status, 200);
  assert.equal(body.count, 7);
  assert.equal(body.days[0].date, "2026-12-28");
  assert.equal(body.days[6].date, "2027-01-03");
});

test("range is clipped to coverage and flagged", async () => {
  const { body } = await get("/v1/year/2000");
  assert.equal(body.clipped, true);
  assert.equal(body.start, "2000-11-18");
  assert.equal(body.count, 44); // 13 Nov days + 31 Dec days
});

test("oversized range is rejected", async () => {
  assert.equal((await get("/v1/range/2001-01-01/2003-01-01")).res.status, 400);
});

test("month endpoint handles leap February", async () => {
  assert.equal((await get("/v1/month/2024-02")).body.count, 29);
  assert.equal((await get("/v1/month/2026-02")).body.count, 28);
  assert.equal((await get("/v1/month/2026-07")).body.count, 31);
});

test("events: 2033 Shen lunation on 23 Oct (adjudicated)", async () => {
  const { body } = await get("/v1/events/lunations/2033");
  assert.ok(body.events.some(e => e.lunation === "Shen" && e.date === "2033-10-23"));
});

test("events: shen index includes the 2027-02-28 week", async () => {
  const { body } = await get("/v1/events/shen");
  assert.ok(body.weeks.some(w => w.startSunday === "2027-02-28"));
});

test("events: solar terms for 2026 has 12 entries", async () => {
  const { body } = await get("/v1/events/solar-terms/2026");
  assert.equal(body.events.length, 12);
});

function todayPT() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

test("next: default from is today (Pacific Time) and the result is a full day record", async () => {
  const { res, body } = await get("/v1/next/full-moon");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Cache-Control"), "public, max-age=300");
  assert.equal(body.kind, "full-moon");
  assert.equal(body.from, todayPT());
  assert.equal(body.count, 1);
  assert.equal(body.results.length, 1);
  assert.ok(body.results[0].date >= body.from);
  assert.equal(body.results[0].phase.event.name, "Full Moon");
  assert.equal(body.clipped, undefined);
  assert.equal(body.meta.apiVersion, "v1");
  const same = (await get(`/v1/day/${body.results[0].date}`)).body;
  delete same.meta;
  assert.deepEqual(body.results[0], same);
});

test("next: explicit from, on-or-after semantics, each kind's selection", async () => {
  const triple = (await get("/v1/next/triple-luma?from=2026-10-19")).body;
  assert.equal(triple.results[0].date, "2026-11-13");
  assert.equal(triple.results[0].specials.luma, "Triple Epsilon");
  const sy = (await get("/v1/next/spiral-year?from=2026-10-19")).body;
  assert.equal(sy.results[0].date, "2026-12-21");
  assert.equal(sy.results[0].costar.spiralYear, 2);
  assert.equal(sy.results[0].solar.event, "Southern Solstice");
  // on-or-after: a from that lands on the event returns that day itself
  assert.equal((await get("/v1/next/spiral-year?from=2026-12-21")).body.results[0].date, "2026-12-21");
  const solar = (await get("/v1/next/solar-event?from=2026-10-19")).body;
  assert.equal(solar.results[0].date, "2026-12-21"); // skips the 2026-11-21 cross-quarter term
  const nm = (await get("/v1/next/new-moon?from=2026-10-19")).body;
  assert.equal(nm.results[0].date, "2026-11-08");
  assert.equal(nm.results[0].lunationStarting, "Purple");
  const sl = (await get("/v1/next/shen-lunation?from=2026-10-19")).body;
  assert.equal(sl.results[0].date, "2028-06-22");
  assert.equal((await get("/v1/next/full-moon?from=2026-10-19")).body.results[0].date, "2026-10-25");
  assert.equal((await get("/v1/next/full-moon?from=2026-10-19")).res.headers.get("Cache-Control"),
    "public, max-age=3600");
});

test("next: count=3 returns three in order (Shen weeks of R1 SY1)", async () => {
  const { res, body } = await get("/v1/next/shen-week?from=2026-01-01&count=3");
  assert.equal(res.status, 200);
  assert.equal(body.count, 3);
  assert.deepEqual(body.results.map(d => d.date), ["2026-01-11", "2026-05-24", "2026-10-11"]);
  assert.ok(body.results.every(d => d.costar.weekLuma === "Shen" && d.costar.weekdayNumber === 1));
});

test("next: fewer than requested near the end of coverage is flagged clipped", async () => {
  const { res, body } = await get("/v1/next/spiral-year?from=2050-01-01&count=5");
  assert.equal(res.status, 200);
  assert.equal(body.count, 1);
  assert.equal(body.clipped, true);
  assert.equal(body.results[0].date, "2050-12-21");
});

test("next: bad kind is 404, bad from/count are 400, past coverage is 404", async () => {
  const bad = await get("/v1/next/blue-moon");
  assert.equal(bad.res.status, 404);
  assert.ok(bad.body.hint.includes("triple-luma"));
  assert.equal((await get("/v1/next/full-moon?from=2026-13-01")).res.status, 400);
  assert.equal((await get("/v1/next/full-moon?from=soon")).res.status, 400);
  assert.equal((await get("/v1/next/full-moon?count=0")).res.status, 400);
  assert.equal((await get("/v1/next/full-moon?count=11")).res.status, 400);
  assert.equal((await get("/v1/next/full-moon?count=2.5")).res.status, 400);
  assert.equal((await get("/v1/next/full-moon?count=three")).res.status, 400);
  assert.equal((await get("/v1/next/full-moon?from=2052-01-01")).res.status, 404);
  assert.equal((await get("/v1/next")).res.status, 404);
});

test("reverse lookup finds the R0 opening solstice, case-insensitively", async () => {
  const { body } = await get("/v1/costar/r0/sy1/black/delta/red");
  assert.equal(body.costarDate, "R0 SY1 Black Delta Red");
  assert.ok(body.dates.includes("2000-12-21"));
});

test("reverse lookup rejects malformed and unknown values helpfully", async () => {
  assert.equal((await get("/v1/costar/X1/SY1/Red/Gamma/Yellow")).res.status, 400);
  const { res, body } = await get("/v1/costar/R1/SY1/Plaid/Gamma/Yellow");
  assert.equal(res.status, 404);
  assert.ok(body.hint.includes("resolved CD values"));
});

test("OPTIONS preflight succeeds", async () => {
  const res = await worker.fetch(
    new Request("https://api.costar.date/v1/today", { method: "OPTIONS" }), env);
  assert.equal(res.status, 204);
});

test("/v1/next: empty from= and count= behave as absent", async () => {
  const a = await get("/v1/next/full-moon?from=&count=");
  const b = await get("/v1/next/full-moon");
  assert.equal(a.res.status, 200);
  assert.deepEqual(a.body.results, b.body.results);
  assert.equal(a.body.count, 1);
});
