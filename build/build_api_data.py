#!/usr/bin/env python3
"""Build the static data artifacts for the COSTAR Calendar API.

Reads the golden CSV (single source of truth, produced and tested in the
COSTAR-Calendar-Generator repo) and emits everything the Worker serves:

    public/v1/data/years/<year>.json      structured day objects, keyed by ISO date
    public/v1/data/raw/<year>.json        verbatim 41-column rows, keyed by ISO date
    public/v1/data/events/phases/<year>.json
    public/v1/data/events/solar-terms/<year>.json
    public/v1/data/events/lunations/<year>.json
    public/v1/data/events/shen.json
    public/v1/data/costar-index.json      COSTAR date string -> [ISO dates]
    public/v1/dataset.csv                 verbatim copy of the golden CSV
    public/v1/dataset.json                all structured day objects, in date order
    public/v1/meta.json
    public/index.html, public/_headers    copied from static/

Never edit the emitted files by hand; regenerate from a golden CSV that has
passed the generator repo's five test suites.

Usage: python3 build/build_api_data.py <golden.csv> [--out public]
"""

import csv
import hashlib
import json
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

API_VERSION = "v1"

EXPECTED_COLUMNS = [
    "Gregorian PT Date", "Weekday", "Phase Name", "Phase PT Time",
    "Lunation Starting", "COSTAR Date", "Solstice or Equinox", "Solar Term",
    "Solar Event PT Time", "PST/PDT", "Transitions Rotundum",
    "Transitions Q Luma", "Transitions SY", "Transitions SY Luma",
    "Transitions Lunation", "Transitions Week Luma", "Transitions Day Chroma",
    "Night Luma", "Chroma Special", "Luma Special", "CD Rotundum", "CD Q Luma",
    "CD SY", "CD SY Luma", "CD Lunation", "CD Week Luma", "CD Day Chroma",
    "Julian", "Gregorian Day Number", "Week Number", "Weekday Number",
    "Brown Lunation", "Lunation Number", "Phase Day Number", "Phase Number",
    "Phase UTC Weekday", "Phase UTC Date", "Phase UTC Time",
    "Solar UTC Weekday", "Solar UTC Date", "Solar UTC Time",
]


def iso(display_date):
    """'21 Dec 2023' -> '2023-12-21'."""
    return datetime.strptime(display_date, "%d %b %Y").date().isoformat()


def blank_to_none(value):
    return value if value != "" else None


def utc_block(row, prefix):
    if row[f"{prefix} UTC Date"] == "":
        return None
    return {
        "weekday": row[f"{prefix} UTC Weekday"],
        "date": iso(row[f"{prefix} UTC Date"]),
        "time": row[f"{prefix} UTC Time"],
    }


def structured_day(row):
    phase_event = None
    if row["Phase Name"] != "":
        phase_event = {
            "name": row["Phase Name"],
            "number": int(row["Phase Number"]),
            "timePT": row["Phase PT Time"],
            "utc": utc_block(row, "Phase"),
        }
    solar = None
    if row["Solar Term"] != "":
        solar = {
            "term": int(row["Solar Term"]),
            "event": blank_to_none(row["Solstice or Equinox"]),
            "timePT": row["Solar Event PT Time"],
            "utc": utc_block(row, "Solar"),
        }
    return {
        "date": iso(row["Gregorian PT Date"]),
        "costarDate": row["COSTAR Date"],
        "costar": {
            "rotundum": int(row["CD Rotundum"]),
            "qLuma": row["CD Q Luma"],
            "spiralYear": int(row["CD SY"]),
            "syLuma": row["CD SY Luma"],
            "lunation": row["CD Lunation"],
            "weekLuma": row["CD Week Luma"],
            "dayChroma": row["CD Day Chroma"],
            "nightLuma": blank_to_none(row["Night Luma"]),
            "weekNumber": int(row["Week Number"]),
            "weekdayNumber": int(row["Weekday Number"]),
        },
        "transitions": {
            "rotundum": row["Transitions Rotundum"],
            "qLuma": row["Transitions Q Luma"],
            "sy": row["Transitions SY"],
            "syLuma": row["Transitions SY Luma"],
            "lunation": row["Transitions Lunation"],
            "weekLuma": row["Transitions Week Luma"],
            "dayChroma": row["Transitions Day Chroma"],
        },
        "specials": {
            "chroma": blank_to_none(row["Chroma Special"]),
            "luma": blank_to_none(row["Luma Special"]),
        },
        "lunationStarting": blank_to_none(row["Lunation Starting"]),
        "phase": {
            "dayNumber": int(row["Phase Day Number"]),
            "brownLunation": int(row["Brown Lunation"]),
            "lunationNumber": int(row["Lunation Number"]),
            "event": phase_event,
        },
        "solar": solar,
        "gregorian": {
            "weekday": row["Weekday"],
            "displayDate": row["Gregorian PT Date"],
            "dayOfYear": int(row["Gregorian Day Number"]),
            "julian": float(row["Julian"]),
            "timezone": row["PST/PDT"],
        },
    }


def write_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        sys.exit(__doc__)
    csv_path = Path(args[0])
    out = Path("public")
    if "--out" in sys.argv:
        out = Path(sys.argv[sys.argv.index("--out") + 1])

    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames != EXPECTED_COLUMNS:
            sys.exit(f"FATAL: CSV columns do not match the 41-column spec.\n"
                     f"Got: {reader.fieldnames}")
        rows = list(reader)

    days = []          # (iso_date, structured, raw)
    for row in rows:
        days.append((iso(row["Gregorian PT Date"]), structured_day(row), dict(row)))
    days.sort(key=lambda d: d[0])

    dates = [d[0] for d in days]
    if len(set(dates)) != len(dates):
        sys.exit("FATAL: duplicate dates in golden CSV")

    if out.exists():
        shutil.rmtree(out)

    # Per-year structured + raw trees
    years = {}
    for date, obj, raw in days:
        years.setdefault(date[:4], []).append((date, obj, raw))
    for year, items in years.items():
        write_json(out / "v1/data/years" / f"{year}.json",
                   {"days": {d: o for d, o, _ in items}})
        write_json(out / "v1/data/raw" / f"{year}.json",
                   {"days": {d: r for d, _, r in items}})

    # Event indexes
    for year, items in years.items():
        phases, terms, lunations = [], [], []
        for date, obj, raw in items:
            ev = obj["phase"]["event"]
            if ev is not None:
                phases.append({"date": date, **ev,
                               "costarDate": obj["costarDate"],
                               "lunationNumber": obj["phase"]["lunationNumber"]})
            if obj["solar"] is not None:
                terms.append({"date": date, **obj["solar"],
                              "costarDate": obj["costarDate"]})
            if obj["lunationStarting"] is not None:
                lunations.append({"date": date,
                                  "lunation": obj["lunationStarting"],
                                  "timePT": ev["timePT"] if ev else None,
                                  "lunationNumber": obj["phase"]["lunationNumber"],
                                  "brownLunation": obj["phase"]["brownLunation"],
                                  "costarDate": obj["costarDate"]})
        write_json(out / "v1/data/events/phases" / f"{year}.json", {"year": int(year), "events": phases})
        write_json(out / "v1/data/events/solar-terms" / f"{year}.json", {"year": int(year), "events": terms})
        write_json(out / "v1/data/events/lunations" / f"{year}.json", {"year": int(year), "events": lunations})

    # Shen: every Shen lunation start, and every Shen week (CD Week Luma runs)
    shen_lunations = [{"date": d, "lunationNumber": o["phase"]["lunationNumber"],
                       "costarDate": o["costarDate"]}
                      for d, o, _ in days if o["lunationStarting"] == "Shen"]
    shen_weeks = []
    for date, obj, _ in days:
        if obj["costar"]["weekLuma"] == "Shen" and obj["costar"]["weekdayNumber"] == 1:
            shen_weeks.append({"startSunday": date, "costarDate": obj["costarDate"]})
    write_json(out / "v1/data/events/shen.json",
               {"lunations": shen_lunations, "weeks": shen_weeks})

    # Reverse index: canonical COSTAR date string -> ISO dates
    index = {}
    for date, obj, _ in days:
        index.setdefault(obj["costarDate"], []).append(date)
    write_json(out / "v1/data/costar-index.json", index)

    # Bulk dataset, verbatim CSV + structured JSON
    (out / "v1").mkdir(parents=True, exist_ok=True)
    shutil.copyfile(csv_path, out / "v1/dataset.csv")
    write_json(out / "v1/dataset.json", {"days": [o for _, o, _ in days]})

    # Meta
    sha = hashlib.sha256(csv_path.read_bytes()).hexdigest()
    m = re.search(r"generated_(\d{4}-\d{2}-\d{2})", csv_path.name)
    meta = {
        "apiVersion": API_VERSION,
        "datasetVersion": m.group(1) if m else "unknown",
        "sourceCsv": csv_path.name,
        "sourceSha256": sha,
        "coverage": {"start": dates[0], "end": dates[-1]},
        "dayCount": len(days),
        "builtAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "docs": "https://api.costar.date/",
        "license": "CC BY 4.0 — attribution: COSTAR Calendar, https://api.costar.date/",
    }
    write_json(out / "v1/meta.json", meta)

    # Static shell (docs pages, headers); openapi.json lives under /v1/
    static_dir = Path(__file__).resolve().parent.parent / "static"
    for item in static_dir.iterdir():
        if item.name == "openapi.json":
            shutil.copyfile(item, out / "v1/openapi.json")
        else:
            shutil.copyfile(item, out / item.name)

    print(f"Built {len(days)} days ({dates[0]} .. {dates[-1]}) into {out}/")
    print(f"datasetVersion={meta['datasetVersion']} sha256={sha[:12]}…")


if __name__ == "__main__":
    main()
