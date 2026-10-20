#!/usr/bin/env python3
"""Download NYC Board of Elections ranked-choice primary data.

For each year, this saves into raw/<year>/:
  - the cast vote record (CVR) zip linked from the BOE results summary page,
  - every official round-by-round results page (rcv/*.html) linked from it,
    which give the certified winners and first-round totals,
  - the summary page itself.

Run:  python3 data/nyc/download.py [year ...]     (default: 2021 2023 2025)
Standard library only. Nothing downloaded is executed.
"""
import datetime
import hashlib
import json
import pathlib
import re
import sys
import urllib.parse
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
RAW = HERE / "raw"
BASE = "https://www.vote.nyc"
SUMMARY = BASE + "/page/election-results-summary-{year}"


def fetch(url):
    url = urllib.parse.quote(url, safe=":/?=&%")
    req = urllib.request.Request(url, headers={"User-Agent": "rank-depth-research/1.0"})
    with urllib.request.urlopen(req, timeout=1800) as r:
        return r.read()


def absolute(href):
    href = href.replace("&amp;", "&")
    return href if href.startswith("http") else BASE + href


def main(years):
    for year in years:
        out = RAW / str(year)
        (out / "official").mkdir(parents=True, exist_ok=True)
        page = fetch(SUMMARY.format(year=year)).decode("utf-8", "replace")
        (out / "summary.html").write_text(page, encoding="utf-8")
        hrefs = re.findall(r'href="([^"]+)"', page)
        prefix = f"/election_results/{year}/"
        # Keep only this year's primary files (the summary page also lists general elections).
        zips = [absolute(h) for h in hrefs if h.lower().endswith(".zip") and prefix in h and "Primary" in h]
        pages = sorted({absolute(h) for h in hrefs
                        if re.search(r"/rcv/\d+_1\.html$", h) and prefix in h and "Primary" in h})
        manifest = {"downloaded": datetime.date.today().isoformat(), "summary": SUMMARY.format(year=year),
                    "cvr": {}, "official_pages": len(pages)}
        for z in zips:
            data = fetch(z)
            name = urllib.parse.unquote(z.rsplit("/", 1)[1])
            (out / name).write_bytes(data)
            manifest["cvr"][name] = {"url": z, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
            print(f"{year}: {name} {len(data):,} bytes")
        for p in pages:
            (out / "official" / p.rsplit("/", 1)[1]).write_bytes(fetch(p))
        print(f"{year}: {len(pages)} official round-by-round pages")
        (out / "MANIFEST.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main([int(y) for y in sys.argv[1:]] or [2021, 2023, 2025])
