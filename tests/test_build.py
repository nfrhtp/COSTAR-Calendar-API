#!/usr/bin/env python3
"""Validate the built public/ data against the golden CSV and known rulings.

Run after build/build_api_data.py. Exits non-zero on any failure.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / "public"

failures = []


def check(label, cond):
    if cond:
        print(f"  ok  {label}")
    else:
        failures.append(label)
        print(f"FAIL  {label}")


def load(rel):
    with open(PUB / rel, encoding="utf-8") as f:
        return json.load(f)


meta = load("v1/meta.json")
check("coverage starts 2000-11-18", meta["coverage"]["start"] == "2000-11-18")
check("coverage ends 2051-01-12", meta["coverage"]["end"] == "2051-01-12")

# Every day present exactly once across year files; reverse index round-trips.
index = load("v1/data/costar-index.json")
total = 0
round_trip_ok = True
for year_file in sorted((PUB / "v1/data/years").glob("*.json")):
    days = load(f"v1/data/years/{year_file.name}")["days"]
    total += len(days)
    for date, obj in days.items():
        if date not in index.get(obj["costarDate"], []):
            round_trip_ok = False
check("day count matches meta", total == meta["dayCount"])
check("every day's costarDate round-trips through the reverse index", round_trip_ok)
check("reverse index covers exactly all days",
      sum(len(v) for v in index.values()) == total)

# Raw tree is verbatim: 41 columns, slashes preserved.
raw2000 = load("v1/data/raw/2000.json")["days"]
d = raw2000["2000-11-19"]
check("raw rows carry all 41 columns", len(d) == 41)
check("raw slash preservation (Transitions Week Luma)",
      d["Transitions Week Luma"] == "Delta/Epsilon/Alpha")
check("raw slash preservation (Transitions Lunation)",
      d["Transitions Lunation"] == "Purple/White/Black")

# Structured spot checks against adjudicated facts.
y2000 = load("v1/data/years/2000.json")["days"]
solstice = y2000["2000-12-21"]
check("2000-12-21 is Southern Solstice, term 270",
      solstice["solar"]["event"] == "Southern Solstice"
      and solstice["solar"]["term"] == 270)
check("2000-12-21 costarDate is R0 SY1 Black Delta Red",
      solstice["costarDate"] == "R0 SY1 Black Delta Red")
check("2000-12-21 rotundum resolves to 0", solstice["costar"]["rotundum"] == 0)

y2051 = load("v1/data/years/2051.json")["days"]
last = y2051["2051-01-12"]
check("2051-01-12 starts Lunation Alpha", last["lunationStarting"] == "Alpha")
check("2051-01-12 is a New Moon (phase number 1)",
      last["phase"]["event"]["number"] == 1)

# Shen rulings: 2033 lunation new moon 23 Oct (adjudicated 2026-07-03);
# 28 Feb 2027 starts a Shen week (see generator CLAUDE.md).
shen = load("v1/data/events/shen.json")
check("2033 Shen lunation starts 2033-10-23",
      any(e["date"] == "2033-10-23" for e in shen["lunations"]))
check("no Shen lunation on 2033-09-23 (old map must stay dead)",
      not any(e["date"].startswith("2033-09") for e in shen["lunations"]))
check("Shen week starting 2027-02-28 present",
      any(w["startSunday"] == "2027-02-28" for w in shen["weeks"]))

lun2033 = load("v1/data/events/lunations/2033.json")["events"]
check("2033 lunation index includes Shen",
      any(e["lunation"] == "Shen" and e["date"] == "2033-10-23" for e in lun2033))

# "Next" indexes (/v1/next/{kind}): non-empty, sorted, every date is a day,
# and each matches its selection rule (mirrors static/answers.js in COSTAR-Date).
all_days = {}
for year_file in sorted((PUB / "v1/data/years").glob("*.json")):
    all_days.update(load(f"v1/data/years/{year_file.name}")["days"])
NEXT_KINDS = ["triple-luma", "full-moon", "new-moon", "shen-week",
              "shen-lunation", "solar-event", "spiral-year"]
next_idx = {}
for kind in NEXT_KINDS:
    idx = load(f"v1/data/next/{kind}.json")
    dates = idx["dates"]
    next_idx[kind] = dates
    check(f"next/{kind}: kind field and non-empty", idx["kind"] == kind and len(dates) > 0)
    check(f"next/{kind}: strictly sorted", all(a < b for a, b in zip(dates, dates[1:])))
    check(f"next/{kind}: every date is a day record", all(d in all_days for d in dates))


def first_on_or_after(kind, date):
    return next((d for d in next_idx[kind] if d >= date), None)


check("next/triple-luma: every entry is a Triple/Quadruple/Quintuple luma special",
      all((all_days[d]["specials"]["luma"] or "").split(" ")[0]
          in ("Triple", "Quadruple", "Quintuple") for d in next_idx["triple-luma"]))
check("next/full-moon: every entry is a Full Moon phase day",
      all((all_days[d]["phase"]["event"] or {}).get("name") == "Full Moon"
          for d in next_idx["full-moon"]))
check("next/new-moon: entries are exactly the lunation-start days",
      next_idx["new-moon"] == [d for d, o in all_days.items() if o["lunationStarting"]])
check("next/new-moon: entries are exactly the New Moon phase days",
      next_idx["new-moon"] == [d for d, o in all_days.items()
                               if o["phase"]["event"] and o["phase"]["event"]["number"] == 1])
check("next/shen-week: entries are exactly the Shen weeks' startSunday values",
      next_idx["shen-week"] == [w["startSunday"] for w in shen["weeks"]])
check("next/shen-lunation: entries are exactly the Shen lunation starts",
      next_idx["shen-lunation"] == [l["date"] for l in shen["lunations"]])
check("next/solar-event: every entry is a solstice or equinox day",
      all(all_days[d]["solar"] and all_days[d]["solar"]["event"]
          for d in next_idx["solar-event"]))
check("next/spiral-year: every entry is a Southern Solstice day",
      all(all_days[d]["solar"] and all_days[d]["solar"]["event"] == "Southern Solstice"
          for d in next_idx["spiral-year"]))
sorted_dates = sorted(all_days)
prev_of = {b: a for a, b in zip(sorted_dates, sorted_dates[1:])}
check("next/spiral-year: CD SY changes on every entry, and only there",
      [d for d in sorted_dates[1:]
       if all_days[d]["costar"]["spiralYear"] != all_days[prev_of[d]]["costar"]["spiralYear"]]
      == next_idx["spiral-year"])
# Spot checks (values confirmed via the live API by the costar.date site, 2026-10-20).
check("next Triple Luma on or after 2026-10-19 is 2026-11-13",
      first_on_or_after("triple-luma", "2026-10-19") == "2026-11-13")
check("Shen weeks of R1 SY1 start 2026-01-11, 2026-05-24, 2026-10-11",
      [d for d in next_idx["shen-week"] if all_days[d]["costarDate"].startswith("R1 SY1 ")]
      == ["2026-01-11", "2026-05-24", "2026-10-11"])
check("next spiral year on or after 2026-10-19 begins 2026-12-21",
      first_on_or_after("spiral-year", "2026-10-19") == "2026-12-21")
check("next full moon on or after 2026-10-19 is 2026-10-25",
      first_on_or_after("full-moon", "2026-10-19") == "2026-10-25")
check("next Shen lunation on or after 2026-10-19 begins 2028-06-22",
      first_on_or_after("shen-lunation", "2026-10-19") == "2028-06-22")

# Bulk artifacts.
dataset = load("v1/dataset.json")["days"]
check("dataset.json holds every day in order",
      len(dataset) == total and dataset[0]["date"] == "2000-11-18"
      and dataset[-1]["date"] == "2051-01-12")
[src] = list((ROOT / "source").glob("costar_calendar_*.csv"))
check("dataset.csv is byte-identical to the source golden CSV",
      (PUB / "v1/dataset.csv").read_bytes() == src.read_bytes())

# Documentation artifacts.
spec = load("v1/openapi.json")
check("openapi.json parses and declares 3.1", spec["openapi"].startswith("3.1"))
for p in ["/v1/today", "/v1/day/{date}", "/v1/range/{start}/{end}",
          "/v1/month/{month}", "/v1/year/{year}", "/v1/events/shen",
          "/v1/next/{kind}",
          "/v1/costar/{rotundum}/{spiralYear}/{lunation}/{weekLuma}/{dayChroma}",
          "/v1/dataset.csv", "/v1/dataset.json", "/v1/meta"]:
    check(f"openapi covers {p}", p in spec["paths"])
check("reference page shipped", (PUB / "reference.html").exists())
# The public day-signature kit (Kevin, 2026-10-22): the logo and the 31 moon frames.
check("kit: 31 moon frames 00..30", sorted(p.name for p in (PUB / "kit/moon").glob("*.jpg"))
      == [f"{i:02d}.jpg" for i in range(31)])
check("kit: costar.date logo", (PUB / "kit/costar.date-logo.png").exists())
check("landing page links reference + openapi",
      all(s in (PUB / "index.html").read_text(encoding="utf-8")
          for s in ["reference.html", "/v1/openapi.json", "CHANGELOG.md"]))

print()
if failures:
    sys.exit(f"{len(failures)} check(s) failed")
print(f"All checks passed ({total} days).")
