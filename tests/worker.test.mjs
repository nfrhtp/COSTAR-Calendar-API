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
