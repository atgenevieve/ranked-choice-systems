#!/usr/bin/env python3
"""Download the PrefLib election datasets used by Tomlinson, Ugander, and
Kleinberg (2023), "Ballot Length in Instant Runoff Voting".

PrefLib (www.preflib.org) now redirects to preflib.github.io/PrefLib-Jekyll.
Each dataset page links to a zip of the whole dataset. This script reads each
dataset page, finds that zip link, and saves the zip into raw/.

Run from anywhere:  python3 data/preflib/download.py
Standard library only. Nothing downloaded is executed.
"""
import datetime
import hashlib
import json
import pathlib
import re
import sys
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
RAW = HERE / "raw"
SITE = "https://preflib.github.io/PrefLib-Jekyll/dataset/"

# PrefLib dataset number -> short name used in the paper's Table 2.
DATASETS = {
    "00001": "irish",        # Dublin North, Dublin West, Meath 2002 (STV)
    "00002": "debian",       # Debian Project leader / votes
    "00005": "burlington",   # Burlington, VT mayor 2006, 2009
    "00007": "ers",          # Electoral Reform Society, anonymous organizations
    "00008": "glasgow",      # Glasgow City Council 2007 wards
    "00016": "aspen",        # Aspen, CO 2009
    "00017": "berkley",      # Berkeley, CA 2010 (PrefLib's spelling)
    "00018": "minneapolis",  # Minneapolis, MN 2009
    "00019": "oakland",      # Oakland, CA 2010
    "00020": "pierce",       # Pierce County, WA 2008
    "00021": "sf",           # San Francisco, CA
    "00022": "sl",           # San Leandro, CA 2010
    "00023": "takomapark",   # Takoma Park, MD 2007
    "00028": "apa",          # American Psychological Association presidents
    "00030": "uklabor",      # UK Labour Party leadership 2010
}


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "rank-depth-research/1.0"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return r.read()


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    manifest = {"downloaded": datetime.date.today().isoformat(), "files": {}}
    for num, name in DATASETS.items():
        page = fetch(SITE + num).decode("utf-8", "replace")
        m = re.search(r'href="(https://[^"]+/releases/download/[^"]+\.zip)"', page)
        if not m:
            print(f"{num} {name}: no zip link found on dataset page", file=sys.stderr)
            continue
        url = m.group(1)
        data = fetch(url)
        out = RAW / url.rsplit("/", 1)[1]
        out.write_bytes(data)
        # Keep the dataset page too: it holds the description and required citations.
        (RAW / f"{num}_page.html").write_text(page, encoding="utf-8")
        manifest["files"][out.name] = {
            "url": url,
            "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
        }
        print(f"{num} {name}: {len(data):,} bytes from {url}")
    (RAW / "MANIFEST.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
