# COSTAR Calendar API

Read-only public JSON API for the [COSTAR calendar](https://api.costar.date/) —
daily COSTAR date strings, lumas, chromas, lunations, lunar phases, and solar
events for 2000–2051, served from pregenerated static data by a Cloudflare
Worker at **https://api.costar.date/**.

```
curl https://api.costar.date/v1/today
curl https://api.costar.date/v1/day/2026-07-21
curl https://api.costar.date/v1/costar/R1/SY1/Red/Gamma/Yellow
```

Documentation (all served by the API itself, sources in `static/`):

- Endpoints: https://api.costar.date/
- Field reference & calendar concepts: https://api.costar.date/reference.html
- OpenAPI 3.1 spec: https://api.costar.date/v1/openapi.json
- Change history: [CHANGELOG.md](CHANGELOG.md)

- No authentication. CORS `*`. Free, best-effort service.
- Data license: CC BY 4.0 — attribute “COSTAR Calendar”, link to
  `https://api.costar.date/`.
- The dataset is generated from the golden CSV of the COSTAR-Calendar-Generator
  project; data changes only via adjudicated rulings there. Every response
  carries `meta.datasetVersion`.
- The companion calendar subscription feed lives at
  https://ics.costar.date/costar-calendar.ics.

## Development

```
python3 build/build_api_data.py source/costar_calendar_*.csv --out public
python3 tests/test_build.py
node --test tests/worker.test.mjs
npx wrangler dev
```

Deployment: GitHub Actions runs the build + tests and `wrangler deploy` on
every push to `main`. Conventions and settled design rulings:
`specifications/API conventions - 2026-0721v1.md`.
