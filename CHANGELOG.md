# COSTAR Calendar API — Changelog

Consumers: watch this file (and `meta.datasetVersion`) to learn when the
published data changes. The calendar's data changes only by **adjudication** —
a ruling on the calendar's rules by its keeper — never silently.

Format per entry: API changes (endpoints/payloads, additive-only within v1)
and dataset changes (golden CSV regenerations) listed separately.

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
