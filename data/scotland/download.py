#!/usr/bin/env python3
"""Download the raw Scottish council election data.

Run from the repository root:

    python3 data/scotland/download.py

Everything lands in data/scotland/raw/, which git ignores. The script
downloads three things:

1. Ballot data: the mggg/scot-elex repository (David McCune's cleaned
   cast vote records in BLT format, plus MGGG's CSV versions with
   standardized party labels), pinned to one commit.
2. Official winners for 2017, 2022, and by-elections from 2016 on:
   Democracy Club candidate exports, which record who was elected.
3. Official winners for 2007 and 2012, and a cross-check for 2017 and
   2022: the source text (wikitext) of each council's Wikipedia
   election page. These pages copy the councils' published counts and
   mark elected candidates in bold.

The script only saves files. It never runs anything it downloads.
It records each URL, the download time, and a SHA-256 checksum in
data/scotland/raw/MANIFEST.json.

Standard library only, plus the `git` command for step 1.
"""

import argparse
import datetime
import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")

SCOT_ELEX_REPO = "https://github.com/mggg/scot-elex"
# Pin the exact version used, so the converted data can be reproduced.
SCOT_ELEX_COMMIT = "de9f8e30c257fa85bfc3c9252e974a12e8faae7b"

DC_EXPORT = "https://candidates.democracyclub.org.uk/data/export_csv/"
DC_FIELDS = ["elected", "by_election", "organisation_name", "votes_cast",
             "results_source", "sopn_last_name", "sopn_first_names"]
# Scottish council election days that Democracy Club covers.
DC_DATES = ["2017-05-04", "2022-05-05"]

WIKI_API = "https://en.wikipedia.org/w/api.php"
WIKI_YEARS = ["2012", "2007", "2022", "2017"]
# The ballot data for 2007 covers Glasgow only.
WIKI_ONLY = {"2007": ["Glasgow City"]}
USER_AGENT = ("rank-depth-research/0.1 (study of ranked ballots; "
              "contact via project owner)")

manifest = {}


def log(msg):
    print(msg, file=sys.stderr)


def fetch(url, tries=6):
    """Fetch a URL politely, retrying with backoff on errors and rate limits."""
    delay = 20
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = resp.read()
            if b"too many requests" in data[:300].lower():
                raise IOError("rate limited")
            return data
        except Exception as e:  # noqa: BLE001 - report and retry any failure
            log(f"  attempt {attempt + 1} failed for {url}: {e}")
            time.sleep(delay)
            delay *= 2
    raise IOError(f"could not download {url}")


def save(path, data, url):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)
    manifest[os.path.relpath(path, RAW)] = {
        "url": url,
        "downloaded": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "sha256": hashlib.sha256(data).hexdigest(),
        "bytes": len(data),
    }


def get_scot_elex():
    dest = os.path.join(RAW, "scot-elex")
    if os.path.isdir(dest):
        log(f"{dest} exists; delete it to download again")
        return
    tmp = tempfile.mkdtemp()
    try:
        url = f"https://codeload.github.com/mggg/scot-elex/zip/{SCOT_ELEX_COMMIT}"
        try:
            log("downloading scot-elex zip")
            data = fetch(url, tries=2)
            # Extract data files only; nothing from the archive is executed.
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                z.extractall(tmp)
            src = os.path.join(tmp, f"scot-elex-{SCOT_ELEX_COMMIT}")
        except IOError:
            log("zip download failed; trying git")
            src = os.path.join(tmp, "scot-elex")
            env = dict(os.environ, GIT_LFS_SKIP_SMUDGE="1")
            subprocess.run(["git", "init", "-q", src], check=True)
            subprocess.run(["git", "-C", src, "fetch", "-q", "--depth", "1",
                            SCOT_ELEX_REPO, SCOT_ELEX_COMMIT], check=True, env=env)
            subprocess.run(["git", "-C", src, "checkout", "-q", "FETCH_HEAD"],
                           check=True, env=env)
            url = f"{SCOT_ELEX_REPO} @ {SCOT_ELEX_COMMIT}"
        os.makedirs(dest)
        # Keep only the data: the BLT originals, the CSVs, and the README.
        for name in sorted(os.listdir(src)):
            p = os.path.join(src, name)
            if name == "blt_files" or re.fullmatch(r"\d+_cands", name):
                shutil.copytree(p, os.path.join(dest, name))
            elif name == "README.md":
                shutil.copy(p, dest)
        for dirpath, _, filenames in os.walk(dest):
            for fn in filenames:
                path = os.path.join(dirpath, fn)
                with open(path, "rb") as f:
                    data = f.read()
                manifest[os.path.relpath(path, RAW)] = {
                    "url": url,
                    "downloaded": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
                    "sha256": hashlib.sha256(data).hexdigest(),
                    "bytes": len(data),
                }
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def dc_url(**params):
    q = [("filter_by_region", "UKM"), ("format", "csv")]
    q += [(k, v) for k, v in params.items()]
    q += [("extra_fields", f) for f in DC_FIELDS]
    return DC_EXPORT + "?" + urllib.parse.urlencode(q)


def get_democracy_club():
    for d in DC_DATES:
        url = dc_url(election_date=d)
        log(f"downloading Democracy Club {d}")
        save(os.path.join(RAW, "democracyclub", f"dc-scotland-{d}.csv"), fetch(url), url)
        time.sleep(2)
    url = dc_url(by_election="True")
    log("downloading Democracy Club by-elections")
    save(os.path.join(RAW, "democracyclub", "dc-scotland-by-elections.csv"), fetch(url), url)


# Words that pick out the 32 Scottish councils' election pages among the
# links on each year's "Scottish local elections" page.
SCOTTISH_COUNCILS = [
    "Aberdeen City", "Aberdeenshire", "Angus", "Argyll and Bute",
    "Clackmannanshire", "Dumfries and Galloway", "Dundee City",
    "East Ayrshire", "East Dunbartonshire", "East Lothian",
    "East Renfrewshire", "City of Edinburgh", "Comhairle nan Eilean Siar",
    "Falkirk", "Fife", "Glasgow City", "Highland", "Inverclyde",
    "Midlothian", "Moray", "North Ayrshire", "North Lanarkshire",
    "Orkney Islands", "Perth and Kinross", "Renfrewshire",
    "Scottish Borders", "Shetland Islands", "South Ayrshire",
    "South Lanarkshire", "Stirling", "West Dunbartonshire", "West Lothian",
]


def page_title(year, council):
    if council.startswith("Comhairle"):
        return f"{year} {council} election"
    return f"{year} {council} Council election"


def wiki_raw(title):
    """Fetch a page's wikitext, following one redirect. None if missing."""
    for _ in range(2):
        url = ("https://en.wikipedia.org/w/index.php?" +
               urllib.parse.urlencode({"title": title, "action": "raw"}))
        try:
            data = fetch(url, tries=4)
        except IOError:
            return None, None, title
        m = re.match(rb"\s*#REDIRECT\s*\[\[([^\]|#]+)", data, flags=re.I)
        if not m:
            return url, data, title
        title = m.group(1).decode("utf-8").strip()
        time.sleep(3)
    return None, None, title


def get_wikipedia():
    # Uses the plain page-source address (action=raw) rather than the
    # API, because the API rate limit refused repeated requests.
    for year in WIKI_YEARS:
        for council in WIKI_ONLY.get(year, SCOTTISH_COUNCILS):
            title = page_title(year, council)
            path = os.path.join(RAW, "wikipedia", year, title + ".wiki")
            if os.path.exists(path):
                continue
            url, data, final = wiki_raw(title)
            if data is None:
                log(f"  no page for {title}")
                continue
            save(path, data, url)
            manifest[os.path.relpath(path, RAW)]["title"] = final
            time.sleep(3)
        log(f"{year}: done")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--only", choices=["ballots", "dc", "wikipedia"],
                    help="download just one source")
    args = ap.parse_args()
    os.makedirs(RAW, exist_ok=True)
    mpath = os.path.join(RAW, "MANIFEST.json")
    if os.path.exists(mpath):
        with open(mpath) as f:
            manifest.update(json.load(f))
    try:
        if args.only in (None, "ballots"):
            get_scot_elex()
        if args.only in (None, "dc"):
            get_democracy_club()
        if args.only in (None, "wikipedia"):
            get_wikipedia()
    finally:
        with open(mpath, "w") as f:
            json.dump(manifest, f, indent=1, sort_keys=True)
    log("done")


if __name__ == "__main__":
    main()
