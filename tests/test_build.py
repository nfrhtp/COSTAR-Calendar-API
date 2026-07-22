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
          "/v1/costar/{rotundum}/{spiralYear}/{lunation}/{weekLuma}/{dayChroma}",
          "/v1/dataset.csv", "/v1/dataset.json", "/v1/meta"]:
    check(f"openapi covers {p}", p in spec["paths"])
check("reference page shipped", (PUB / "reference.html").exists())
check("landing page links reference + openapi",
      all(s in (PUB / "index.html").read_text(encoding="utf-8")
          for s in ["reference.html", "/v1/openapi.json", "CHANGELOG.md"]))

print()
if failures:
    sys.exit(f"{len(failures)} check(s) failed")
print(f"All checks passed ({total} days).")
