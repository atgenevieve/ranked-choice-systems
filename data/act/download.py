#!/usr/bin/env python3
"""Download ACT Legislative Assembly 2024 ballot paper preference data.

Saves into raw/2024/:
  - the five electorate preference files (<Electorate>Total.txt) and the
    lookup files (candidates, electorates, groups, polling place batches),
    plus the PDF that describes the fields,
  - into raw/2024/official/: the final distribution of preferences (table 1
    and table 2 for each electorate), the election statistics workbook, and
    the list of elected candidates.

Elections ACT's site sits behind a Cloudflare browser check, which blocks
scripted downloads (they get HTTP 403 and a "Just a moment..." page). If that
happens, this script stops and says so. Then download the files listed in
FILES by hand in a web browser, save them under raw/2024/ with the names
given, and run this script with --verify to check them against the SHA-256
checksums recorded in MANIFEST.json (the copies used for ballots/).

Run:  python3 data/act/download.py            # try to download
      python3 data/act/download.py --verify   # check files saved by hand
Standard library only. Nothing downloaded is executed.
"""
import hashlib
import json
import pathlib
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = pathlib.Path(__file__).resolve().parent
RAW = HERE / "raw" / "2024"
A = "https://www.elections.act.gov.au/__data/assets/"
DOP = "https://www.elections.act.gov.au/elections/previous-assembly-elections/2024-election/distribution-of-preferences-2024/"
ELECTORATES = ["Brindabella", "Ginninderra", "Kurrajong", "Murrumbidgee", "Yerrabi"]

# local name -> URL. Listed on
# https://www.elections.act.gov.au/elections/previous-assembly-elections/2024-election/ballot-paper-preference-data
FILES = {
    "BrindabellaTotal.txt": A + "text_file/0005/2603156/BrindabellaTotal.txt",
    "GinninderraTotal.txt": A + "text_file/0008/2603159/GinninderraTotal.txt",
    "KurrajongTotal.txt": A + "text_file/0019/2603161/KurrajongTotal.txt",
    "MurrumbidgeeTotal.txt": A + "text_file/0020/2603162/MurrumbidgeeTotal.txt",
    "YerrabiTotal.txt": A + "text_file/0020/2610704/YerrabiTotal.txt",
    "candidates.txt": A + "text_file/0006/2603157/candidates.txt",
    "Electorates.txt": A + "text_file/0007/2603158/Electorates.txt",
    "Groups.txt": A + "text_file/0018/2603160/Groups.txt",
    "PollingPlaceBatchNumbers.txt": A + "text_file/0004/2603164/PollingPlaceBatchNumbers.txt",
    "DataDescriptions.pdf": A + "pdf_file/0009/2603169/DataDescriptions.pdf",
    "official/Stats-Book-2024.xlsx": A + "excel_doc/0006/2799717/Stats-Book-2024.XLSX",
    "official/list-of-elected-candidates.html":
        "https://www.elections.act.gov.au/elections/previous-assembly-elections/2024-election/2020-list-of-elected-candidates",
}
for e in ELECTORATES:
    for t in (1, 2):
        # The site's own link for Murrumbidgee table 2 is lower case.
        name = e.lower() if (e == "Murrumbidgee" and t == 2) else e
        FILES[f"official/{e}-table-{t}.xlsx"] = DOP + f"table{t}_{name}-FINAL.xlsx"


def fetch(item):
    name, url = item
    req = urllib.request.Request(url, headers={"User-Agent": "rank-depth-research/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            data = r.read()
    except urllib.error.HTTPError as e:
        return name, None, f"HTTP {e.code}"
    if data[:200].lstrip().lower().startswith(b"<!doctype html") and not name.endswith(".html"):
        return name, None, "got a web page (browser check?)"
    out = RAW / name
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(data)
    return name, len(data), "ok"


def verify():
    manifest = json.loads((HERE / "MANIFEST.json").read_text())
    bad = 0
    for name, info in manifest["files"].items():
        p = RAW / name
        if not p.exists():
            print(f"missing  {name}")
            bad += 1
            continue
        h = hashlib.sha256(p.read_bytes()).hexdigest()
        ok = h == info["sha256"]
        bad += not ok
        print(f"{'ok      ' if ok else 'DIFFERS '} {name}")
    sys.exit(1 if bad else 0)


def main():
    if "--verify" in sys.argv:
        verify()
    # Two at a time: the site is behind Cloudflare.
    with ThreadPoolExecutor(2) as pool:
        results = list(pool.map(fetch, FILES.items()))
    failed = [r for r in results if r[1] is None]
    for name, n, status in results:
        print(f"{name}: {status}" + (f", {n:,} bytes" if n else ""))
    if failed:
        raise SystemExit(f"{len(failed)} files failed. Download them by hand (see the docstring), "
                         "then run with --verify.")
    verify()


if __name__ == "__main__":
    main()
