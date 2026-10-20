#!/usr/bin/env python3
"""Download Cambridge, MA official count reports (no ballot data is public).

Cambridge publishes count-by-count reports for its City Council and School
Committee elections, but not the ballots themselves (see README.md). This
script:
  1. reads the Election Commission's results page and each municipal
     election's news page,
  2. saves every round page of each official count report into
     raw/<year>/<race>/,
  3. writes official-results.json: for each race, the rules line, valid and
     invalid ballots, quota, seats, first-count totals, and winners in the
     order they were elected.

Run:  python3 data/cambridge/download.py
Standard library only. Nothing downloaded is executed.
"""
import datetime
import html
import json
import pathlib
import re
import time
import urllib.parse
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
RAW = HERE / "raw"
SITE = "https://www.cambridgema.gov"
INDEX = SITE + "/Departments/electioncommission/electionresults"


def fetch(url, tries=4):
    req = urllib.request.Request(url, headers={"User-Agent": "rank-depth-research/1.0"})
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                return r.read().decode("utf-8", "replace")
        except OSError:
            if attempt == tries - 1:
                raise
            time.sleep(5 * (attempt + 1))  # the city's server sometimes drops connections


def text_rows(page):
    """Table rows as lists of cell text."""
    rows = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", page, re.S | re.I):
        cells = [re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", c))).strip()
                 for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", tr, re.S | re.I)]
        if any(cells):
            rows.append(cells)
    return rows


def plain(page):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", page))).strip()


def official_reports():
    """Yield (year, race, url of the official 'Round' start page)."""
    index = fetch(INDEX)
    news = sorted(set(re.findall(r'href="(/Departments/electioncommission/news/(\d{4})/11/[^"]*municipal[^"]*)"',
                                 index, re.I)))
    for path, year in news:
        page = fetch(SITE + path)
        for href, label in re.findall(r'<a [^>]*href="([^"]+Round\.htm)"[^>]*>(.*?)</a>', page, re.S | re.I):
            label = plain(label)
            # Keep official counts only; the link text or the folder name says so.
            # (Unofficial folders are named "Unofficial", so check that first.)
            where = (label + " " + href).lower()
            if "unofficial" in where or "preliminary" in where or "official" not in where:
                continue
            race = "council" if "council" in where else "school" if "school" in where else None
            if race:
                yield int(year), race, urllib.parse.urljoin(SITE + path, href.replace(" ", "%20"))


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    results = {"downloaded": datetime.date.today().isoformat(), "index": INDEX, "races": []}
    for year, race, start in official_reports():
        out = RAW / str(year) / race
        out.mkdir(parents=True, exist_ok=True)
        first = fetch(start)
        (out / "start.htm").write_text(first, encoding="utf-8")
        rounds = sorted({h for h in re.findall(r"href='([^']*Round\d+\.htm)'", first)},
                        key=lambda h: int(re.search(r"Round(\d+)\.htm", h).group(1)))
        pages = {}
        for h in rounds:
            n = int(re.search(r"Round(\d+)\.htm", h).group(1))
            pages[n] = fetch(urllib.parse.urljoin(start, h))
            (out / f"round{n:02d}.htm").write_text(pages[n], encoding="utf-8")
        intro = plain(first)
        info = {"year": year, "race": race, "url": start}
        for key, pat in (("valid_ballots", r"([\d,]+) valid ballots"), ("seats", r"Electing (\d+) candidates"),
                         ("quota", r"Quota is ([\d,]+) votes"), ("invalid_ballots", r"There were ([\d,]+) invalid")):
            m = re.search(pat, intro)
            info[key] = int(m.group(1).replace(",", "")) if m else None
        m = re.search(r"ELECTION RULES (.*?) [\d,]+ valid ballots", intro)
        info["rules"] = m.group(1) if m else None
        # First count: the TOTAL column of round 1.
        info["first_count"] = {}
        if 1 in pages:
            for cells in text_rows(pages[1]):
                if len(cells) >= 3 and re.fullmatch(r"[\d,]+", cells[2]) and cells[0] not in ("TOTALS:", "EXHAUSTED PILE:", "Start"):
                    info["first_count"][cells[0]] = int(cells[2].replace(",", ""))
        # Winners, in order of election, from the last round's status column.
        last = pages[max(pages)] if pages else first
        elected = []
        for cells in text_rows(last):
            if len(cells) >= 4:
                m = re.search(r"ELECTED -- (\d+)", cells[3])
                if m:
                    elected.append((int(m.group(1)), cells[0]))
        info["winners_in_order"] = [name for _, name in sorted(elected, key=lambda e: e[0])]
        info["rounds"] = max(pages) if pages else 0
        results["races"].append(info)
        print(f"{year} {race}: {info['rounds']} rounds, {len(info['winners_in_order'])} elected")
    results["races"].sort(key=lambda r: (r["year"], r["race"]))
    (HERE / "official-results.json").write_text(json.dumps(results, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
