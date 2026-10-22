# COSTAR Calendar API — Changelog

Consumers: watch this file (and `meta.datasetVersion`) to learn when the
published data changes. The calendar's data changes only by **adjudication** —
a ruling on the calendar's rules by its keeper — never silently.

Format per entry: API changes (endpoints/payloads, additive-only within v1)
and dataset changes (golden CSV regenerations) listed separately.

## 2026-10-22 — public day-signature kit files · dataset 2026-07-05 (unchanged)

- **Static**: `/kit/moon/00.jpg` … `/kit/moon/30.jpg` (the 31 lunar-phase photographs) and
  `/kit/costar.date-logo.png` are served publicly beside `/moon-phase.js` and
  `/moon-palette.js`, so docs and other sites outside the Access gate can carry the day
  (approved by Kevin 2026-10-22). No endpoint or payload changes.

## 2026-10-20 — `/v1/next/{kind}` · dataset 2026-07-05 (unchanged)

- **API** (later the same day): `/v1/next/{kind}` treats an empty `from=` or `count=` as
  absent (defaults apply) instead of answering 400 — chatbot tools send every declared
  parameter and leave unused ones blank.

- **API**: Added `/v1/next/{kind}` (additive; approved by Kevin 2026-10-20) —
  the next `count` (1–10, default 1) days of a kind on or after `from`
  (default: today in Pacific Time), each returned as the full day object
  that `/v1/day/{date}` gives. Kinds: `triple-luma`, `full-moon`, `new-moon`,
  `shen-week`, `shen-lunation`, `solar-event`, `spiral-year`; the selection
  rules are on the reference page. Each kind is a pregenerated sorted date
  index (`build/build_api_data.py`); the Worker only searches it and
  assembles existing day records. Unknown kind → 404; bad `from`/`count` →
  400. Also fixed: an unparsable month or day in any date segment
  (e.g. `/v1/day/2026-13-01`) now answers 400 instead of 500.
- **Dataset**: unchanged (golden CSV generated 2026-07-05).

## 2026-07-21 — v1 launch · dataset 2026-07-05

- **API**: initial public release at https://api.costar.date/ — day/range/
  month/year lookups, `/v1/today` (Pacific Time), event indexes
  (phases, solar terms, lunations, Shen), reverse lookup on resolved CD
  values, bulk `dataset.csv` (verbatim golden CSV) + `dataset.json`,
  `/v1/meta`, OpenAPI spec at `/v1/openapi.json`.
- **Dataset**: golden CSV generated 2026-07-05, covering 2000-11-18 through
  2051-01-12 (18,318 days). Reflects the 2026-07-03 adjudications: solar-term
  Shen lunation rule (2033 Shen new moon = 23 Oct), phase-anchored Shen week
  rule, Solar Term column for all 12 annual terms.
