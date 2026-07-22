# CLAUDE.md

Guidance for AI assistants working on this repository.

## Project Summary

Read-only public JSON API for the COSTAR calendar, served by a Cloudflare
Worker at **https://api.costar.date/** (that URL must never change). The data
is pregenerated from the golden CSV produced by the sibling
`COSTAR-Calendar-Generator` repo; the Worker never computes calendar values.

Authoritative conventions and adjudicated rulings:
`specifications/API conventions - 2026-0721v1.md`. Do not change anything it
covers without a new ruling from Kevin; do not reintroduce its rejected
options. Calendar semantics (columns, CD resolution, Shen rules) are governed
by the generator repo's `CLAUDE.md` and specifications.

## Layout

- `source/costar_calendar_*.csv` — verbatim copy of the golden CSV (single
  source of truth; the `generated_` date in its filename is the
  `datasetVersion`). Replace only with a golden CSV that passed all five
  generator test suites.
- `build/build_api_data.py` — golden CSV → `public/` static assets
  (per-year structured + raw day trees, event indexes, reverse index, bulk
  datasets, meta). `public/` is generated and gitignored; never hand-edit it.
- `static/` — docs landing page and `_headers`, copied into `public/` by the
  build.
- `worker/index.js` — the Worker: routing, slicing, response framing only.
- `.github/workflows/deploy.yml` — build, test, `wrangler deploy` on push to
  `main` (needs `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` secrets).

## Working on This Project

```
python3 build/build_api_data.py source/costar_calendar_*.csv --out public
python3 tests/test_build.py          # data invariants + adjudicated spot checks
node --test tests/worker.test.mjs    # Worker route tests against public/
npx wrangler dev                     # local server on http://localhost:8787
```

Run both test suites after any change to the build script, Worker, or source
CSV. The build refuses a CSV whose header deviates from the 41-column spec.

## Rules

- **v1 response shapes are frozen** — additive changes only; breaking changes
  mean a new `/v2` with `/v1` kept alive.
- Preserve "/" characters exactly in all values; never sanitize.
- Reverse lookup matches resolved CD values only (no slashes in URLs).
- No authentication — do not add API keys or gates.
- To update data after an adjudication: regenerate the golden CSV in the
  generator repo (tests green), copy it into `source/` (keeping its filename),
  delete the old copy, run the build + tests, commit. CI deploys.
- Documentation must move with the code, in the same commit: any endpoint or
  payload change updates `static/openapi.json`, `static/index.html`, and
  `static/reference.html`; any deploy that changes endpoints, payloads, or the
  dataset gets a `CHANGELOG.md` entry (consumers are told to watch that file).
