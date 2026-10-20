#!/usr/bin/env python3
"""Download Portland, OR ranked-choice data for the November 5, 2024 general election.

Saves into raw/:
  - one cast vote record (CVR) CSV per contest, from the Google Drive links on
    Multnomah County's "Turnout and statistics" page,
  - for each contest, the official final round-by-round results from
    rcvresults.multco.us: the RCTab summary JSON and the detailed CSV report.

Run:  python3 data/portland/download.py
Standard library only. Nothing downloaded is executed.
"""
import datetime
import hashlib
import html
import json
import pathlib
import re
import urllib.parse
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
RAW = HERE / "raw"
TURNOUT = "https://multco.us/info/turnout-and-statistics-november-2024-general-election"
RESULTS = "https://rcvresults.multco.us/"
DRIVE = "https://drive.usercontent.google.com/download?id={id}&export=download&confirm=t"


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "rank-depth-research/1.0"})
    with urllib.request.urlopen(req, timeout=1800) as r:
        return r.read()


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def main():
    (RAW / "official").mkdir(parents=True, exist_ok=True)
    manifest = {"downloaded": datetime.date.today().isoformat(), "turnout_page": TURNOUT,
                "results_site": RESULTS, "files": {}}

    # 1. Cast vote records.
    page = fetch(TURNOUT).decode("utf-8", "replace")
    (RAW / "turnout-page.html").write_text(page, encoding="utf-8")
    for href, text in re.findall(r'<a [^>]*href="([^"]+)"[^>]*>(.*?)</a>', page, re.S):
        text = html.unescape(re.sub(r"<[^>]+>", "", text)).strip()
        m = re.search(r"/file/d/([\w-]+)", href)
        if not m or "Cast Vote Record" not in text:
            continue
        data = fetch(DRIVE.format(id=m.group(1)))
        if data[:1] == b"<":
            raise SystemExit(f"Google Drive returned a web page instead of {text}; download it by hand.")
        name = "cvr-" + slug(text.replace("Cast Vote Record Data", "")) + ".csv"
        (RAW / name).write_bytes(data)
        manifest["files"][name] = {"title": text, "url": href, "bytes": len(data),
                                   "sha256": hashlib.sha256(data).hexdigest()}
        print(f"{name}: {len(data):,} bytes")

    # 2. Official final results. The index lists each contest, then its
    #    "Final Results" link first and preliminary results after.
    index = fetch(RESULTS).decode("utf-8", "replace")
    finals = {}
    for href, text in re.findall(r'<a [^>]*href="(/Reports/[^"]+)"[^>]*>(.*?)</a>', index, re.S):
        if "Final Results" in html.unescape(re.sub(r"<[^>]+>", "", text)):
            contest = urllib.parse.unquote(href.rsplit("/", 1)[1]).replace("_", " ")
            finals[contest] = RESULTS.rstrip("/") + href
    for contest, url in finals.items():
        report = fetch(url).decode("utf-8", "replace")
        base = slug(contest)
        (RAW / "official" / f"{base}.html").write_text(report, encoding="utf-8")
        links = [html.unescape(h) for h in re.findall(r'href="(https://[^"]+)"', report)]
        for kind in (".json", "_report_official.csv"):
            link = next((h for h in links if urllib.parse.urlsplit(h).path.endswith(kind)
                         or (kind == ".json" and ".json" in urllib.parse.urlsplit(h).path)), None)
            if link is None:
                print(f"{contest}: no {kind} link")
                continue
            data = fetch(link.replace(" ", "%20"))
            out = RAW / "official" / f"{base}{'.json' if kind == '.json' else '.csv'}"
            out.write_bytes(data)
            manifest["files"][f"official/{out.name}"] = {"url": urllib.parse.urlsplit(link)._replace(query="").geturl(),
                                                         "bytes": len(data),
                                                         "sha256": hashlib.sha256(data).hexdigest()}
        print(f"{contest}: official results saved")
    (RAW / "MANIFEST.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
