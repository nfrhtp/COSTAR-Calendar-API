# API Conventions — 2026-07-21 v1

Rulings adjudicated by Kevin 2026-07-21 governing the COSTAR Calendar API
(`api.costar.date`). Do not change any of these without a new ruling.
Rejected options are recorded so they are not reintroduced.

## Architecture (ruled 2026-07-21)

- **Cloudflare Worker + pregenerated static data** at **https://api.costar.date/**.
  The Worker (`worker/index.js`) only routes and frames responses; it never
  computes calendar values.
- The **golden CSV is the single source of truth**. `build/build_api_data.py`
  converts a verbatim copy in `source/` into the `public/` assets. The API repo
  never contains hand-edited data; a new golden CSV may be copied in only after
  it passes the generator repo's five test suites.
- Deployed by GitHub Actions (`wrangler deploy`) on push to `main`; build and
  both test suites must pass first.
- **No authentication, no API keys.** Abuse is handled by cache headers and
  Cloudflare rate limiting, not by gatekeeping. The point of the API is that
  strangers can build on it casually.

## Endpoints (v1)

`/v1/today` (Pacific Time — the calendar's native zone), `/v1/day/{date}`,
`/v1/range/{start}/{end}` (max 400 days), `/v1/month/{yyyy-mm}`,
`/v1/year/{yyyy}`, `/v1/events/{phases|solar-terms|lunations}/{year}`,
`/v1/events/shen`, `/v1/costar/{R}/{SY}/{lunation}/{weekLuma}/{dayChroma}`,
`/v1/dataset.csv`, `/v1/dataset.json`, `/v1/meta`.

- Ranges partially outside coverage are clipped and flagged `"clipped": true`;
  ranges fully outside are 404.
- `?raw=1` on day/range/month/year returns the 41 golden-CSV columns verbatim
  under `"columns"` instead of the structured object.

## Payload rules

- **camelCase keys** (`weekLuma`, `spiralYear`, `dayChroma`) — ruled 2026-07-21.
- Structured day object groups: `costar` (resolved CD values, typed —
  ints for rotundum/spiralYear/weekNumber/weekdayNumber, null for blank
  nightLuma), `transitions` (slash-notation strings verbatim), `specials`,
  `lunationStarting`, `phase`, `solar`, `gregorian`.
- **"/" characters are preserved exactly** in all string values (project-wide
  rule inherited from the generator).
- Dates in structured payloads are ISO (`2026-07-21`); the display form
  (`21 Jul 2026`) survives as `gregorian.displayDate`.
- Every response carries `meta.apiVersion` + `meta.datasetVersion` and an
  `X-Dataset-Version` header, so consumers can detect adjudication-driven
  data changes.

## Reverse lookup (ruled 2026-07-21)

Matches on the **resolved CD columns**, which are single-valued every day, so
URL segments never contain slashes: lunation is `White` or `Black` (never
`White/Black`), week luma `Epsilon` or `Alpha`, Sunday chroma `Black`.
Rotundum may be negative (`R-1` covers the pre-R0 warm-up days). Input is
case-insensitive; responses return the canonical string and all matching dates.

## Stability policy

- **`/v1` response shapes are frozen; changes are additive only.** Breaking
  changes require a `/v2`, with `/v1` kept alive.
- The URL `https://api.costar.date/` must never change (same rule as the ICS
  feed URL).
- Data changes only via adjudication → regenerated golden CSV → new
  `datasetVersion`. The dataset version is the `generated_` date embedded in
  the golden CSV filename.
- Caching: `/v1/today` max-age 300; all other API responses max-age 3600;
  bulk datasets max-age 86400. CORS `*` on everything.

## Bulk dataset (ruled 2026-07-21)

Published **verbatim** — full golden CSV byte-for-byte at `/v1/dataset.csv`
(including the pre-R0 warm-up days from 2000-11-18), plus all structured day
objects at `/v1/dataset.json`. No trimming to a "clean" boundary.

## License and canonical-source policy

Data: **CC BY 4.0**, attribution "COSTAR Calendar" with a link to
`https://api.costar.date/` as the canonical source. Docs state the service is
free and best-effort, no SLA. Support via GitHub issues on
`nfrhtp/COSTAR-Calendar-API`.

## Rejected options (do not reintroduce)

- **Lifetime-deal backends (Teable / NoCodeBackend / Twidget) as the public
  API**: rejected 2026-07-21 — secret-key auth model unsuited to public
  read-only access, vendor-longevity risk, rate limits outside our control.
  Teable remains fine as a *private* internal layer.
- **Static-only GitHub Pages hosting**: rejected in favor of the Worker — no
  `/today`, no ranges, and it would stack a second service on the ICS feed's
  GitHub Pages goodwill.
- **API keys / authentication**: rejected — kills casual third-party building;
  requests cost nothing to serve.
- **Trimming the bulk dataset to the R0 solstice**: rejected — publish verbatim.
- **Slash-notation values in reverse-lookup URLs**: rejected — CD values only.
