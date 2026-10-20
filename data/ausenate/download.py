#!/usr/bin/env python3
"""Download Australian Senate formal preference files and official results.

For each election in ELECTIONS and each state or territory in STATES, saves into
raw/<event id>/:
  - aec-senate-formalpreferences-<event>-<STATE>.zip: one row per formal ballot,
  - SenateFirstPrefsByStateByVoteTypeDownload-<event>.csv: the official
    candidate list in ballot order, with first-preference totals,
  - SenateSenatorsElectedDownload-<event>.csv: the senators elected, in order,
  - SenateInformalByStateDownload-<event>.csv: informal ballot counts.

Only Tasmania, the ACT, and the Northern Territory are fetched by default (the
smallest files). Pass state codes to fetch others, for example
  python3 data/ausenate/download.py SA WA

Run:  python3 data/ausenate/download.py
Standard library only. Nothing downloaded is executed.
"""
import datetime
import hashlib
import json
import pathlib
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = pathlib.Path(__file__).resolve().parent
RAW = HERE / "raw"
SITE = "https://results.aec.gov.au/{ev}/Website/"
# AEC event ids: 2016 (double dissolution, 12 seats per state), 2019, 2022, 2025.
ELECTIONS = {"20499": "2016-07-02", "24310": "2019-05-18", "27966": "2022-05-21", "31496": "2025-05-03"}
STATES = sys.argv[1:] or ["TAS", "ACT", "NT"]
RESULT_FILES = ["SenateFirstPrefsByStateByVoteTypeDownload", "SenateSenatorsElectedDownload",
                "SenateInformalByStateDownload"]


def jobs():
    for ev in ELECTIONS:
        for st in STATES:
            name = f"aec-senate-formalpreferences-{ev}-{st}.zip"
            yield ev, name, SITE.format(ev=ev) + "External/" + name
        for f in RESULT_FILES:
            yield ev, f"{f}-{ev}.csv", SITE.format(ev=ev) + f"Downloads/{f}-{ev}.csv"


def fetch(job):
    ev, name, url = job
    out = RAW / ev / name
    out.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "rank-depth-research/1.0"})
    with urllib.request.urlopen(req, timeout=1800) as r:
        data = r.read()
    out.write_bytes(data)
    print(f"{ev}/{name}: {len(data):,} bytes", flush=True)
    return f"{ev}/{name}", {"url": url, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def main():
    path = HERE / "MANIFEST.json"
    manifest = json.loads(path.read_text()) if path.exists() else {"files": {}}
    manifest["downloaded"] = datetime.date.today().isoformat()
    with ThreadPoolExecutor(4) as pool:
        for name, info in pool.map(fetch, list(jobs())):
            manifest["files"][name] = info
    path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")


if __name__ == "__main__":
    main()
