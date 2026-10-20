#!/usr/bin/env python3
"""Rebuild the 87 ERS elections from Nicolaus Tideman's original files.

Why: PrefLib's ERS files (dataset 00007) have two problems for this project.

1. They don't record how many seats each election filled, so convert.py sets
   every ERS election to 1 seat.
2. PrefLib "completed" every ballot that ranked all candidates but one, by
   adding the one missing candidate at the bottom. That makes ballots look
   longer than voters made them, and ballot length is a key statistic here.

The Center for Range Voting publishes the same 87 elections in Tideman's
original format (https://rangevoting.org/TidemanData.html, files
https://rangevoting.org/TiData/A1.HIL to A35.HIL and A48.HIL to A99.HIL).
Each file's first line gives the number of candidates and the number of seats.

This script downloads those files into raw/tideman/ (if they aren't there),
checks that each one is the same election as its PrefLib file, and then
rewrites the ERS .ballots files from the original ballot lengths, with the real
seat count. Candidate numbers stay the same (Tideman's candidate k is PrefLib's
candidate k, which is our candidate k-1).

How files are matched: PrefLib numbered the sets in the order of Tideman's
file names sorted as text (A1, A10, A11, ..., A19, A2, A20, ...). The script
checks every pair: after adding the missing last candidate to each ballot that
ranks all but one, the Tideman ballots must equal the PrefLib ballots exactly.
All 87 pass. If any check fails, the script stops without writing anything.

Format of a Tideman (.HIL) file, as described on the rangevoting.org page:
first line "candidates seats"; then one line per ballot, "1 c1 c2 ... 0"
(a count, then candidate numbers from first choice down, ended by 0); a line
"0" ends the ballots; then candidate names and the election name in quotes.

Run after convert.py:  python3 data/preflib/ers_tideman.py
Standard library only. The downloaded files are read as data, never executed.
"""
import collections
import datetime
import hashlib
import json
import pathlib
import re
import sys
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
RAW = HERE / "raw" / "tideman"
OUT = HERE / "ballots"
BASE = "https://rangevoting.org/TiData/"
NUMBERS = list(range(1, 36)) + list(range(48, 100))  # 87 files
SOURCE_PAGE = "https://rangevoting.org/TidemanData.html"


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "rank-depth-research/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def download():
    RAW.mkdir(parents=True, exist_ok=True)
    manifest_path = RAW / "MANIFEST.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {"files": {}}
    for k in NUMBERS:
        name = f"A{k}.HIL"
        path = RAW / name
        if not path.exists():
            data = fetch(BASE + name)
            path.write_bytes(data)
            manifest["files"][name] = {
                "url": BASE + name,
                "bytes": len(data),
                "sha256": hashlib.sha256(data).hexdigest(),
                "downloaded": datetime.date.today().isoformat(),
            }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")


def read_hil(path):
    """Return (candidates, seats, Counter of ballots, blank count, repeat count)."""
    lines = path.read_text(encoding="latin-1").splitlines()
    n, seats = map(int, lines[0].split()[:2])
    ballots = collections.Counter()
    blank = repeats = 0
    for line in lines[1:]:
        parts = line.split()
        if not parts:
            continue
        if parts[0] == "0":
            break
        count = int(parts[0])
        seen, ballot = set(), []
        for tok in parts[1:]:
            c = int(tok)
            if c == 0:
                break
            if not 1 <= c <= n:
                raise ValueError(f"{path.name}: candidate {c} out of range")
            if c - 1 in seen:  # keep a candidate's highest rank only
                repeats += count
                continue
            seen.add(c - 1)
            ballot.append(c - 1)
        if ballot:
            ballots[tuple(ballot)] += count
        else:
            blank += count
    return n, seats, ballots, blank, repeats


def read_ballots(path):
    n = seats = None
    ballots = collections.Counter()
    header = []
    for line in path.read_text().splitlines():
        if line.startswith("#"):
            header.append(line)
            continue
        parts = line.split()
        if parts[0] == "candidates":
            n = int(parts[1])
        elif parts[0] == "seats":
            seats = int(parts[1])
        else:
            ballots[tuple(map(int, parts[1:]))] += int(parts[0])
    return header, n, seats, ballots


def complete(ballots, n):
    """PrefLib's change: add the missing candidate to ballots ranking n-1."""
    out = collections.Counter()
    for b, c in ballots.items():
        if len(b) == n - 1:
            b = b + (next(x for x in range(n) if x not in b),)
        out[b] += c
    return out


def main():
    download()
    hil_names = sorted(f"A{k}.HIL" for k in NUMBERS)  # text order, as PrefLib numbered them
    pref = sorted(OUT.glob("ers-00007-*.ballots"))
    if len(pref) != 87:
        sys.exit(f"expected 87 ERS .ballots files from convert.py, found {len(pref)}")
    plan = []
    for i, (hil_name, bpath) in enumerate(zip(hil_names, pref), start=1):
        if f"ers-00007-{i:08d}-" not in bpath.name:
            sys.exit(f"unexpected file order at {bpath.name}")
        n, seats, hil, blank, repeats = read_hil(RAW / hil_name)
        header, pn, _, pb = read_ballots(bpath)
        if n != pn or complete(hil, n) != pb:
            sys.exit(f"{hil_name} does not match {bpath.name}; nothing written")
        plan.append((bpath, hil_name, n, seats, hil, blank, repeats, header, pb))
    changed_ballots = 0
    for bpath, hil_name, n, seats, hil, blank, repeats, header, pb in plan:
        lines = header + [f"candidates {n}", f"seats {seats}"]
        for ballot, count in sorted(hil.items(), key=lambda kv: (-kv[1], kv[0])):
            lines.append(f"{count} " + " ".join(map(str, ballot)))
        bpath.write_text("\n".join(lines) + "\n")
        shortened = sum(c for b, c in hil.items() if len(b) == n - 1)
        changed_ballots += shortened
        jpath = bpath.with_suffix(".json")
        meta = json.loads(jpath.read_text())
        meta["seats"] = seats
        meta["blank_ballots"] = blank
        meta["max_ranks"] = None
        meta["tideman_file"] = hil_name
        meta["notes"] = (
            f"PrefLib file {meta['preflib_file']} (dataset 00007, 'ers'). Ballots and seat count "
            f"({seats}) taken from Tideman's original file {hil_name} ({SOURCE_PAGE}), which holds "
            f"the same ballots: PrefLib had added the last candidate to the {shortened} ballots "
            f"that ranked all but one, and this file restores their original length. "
            f"{blank} blank ballots in the original are left out and counted in blank_ballots. "
            + (f"{repeats} repeated candidate marks were dropped. " if repeats else "")
            + "Counting rule unknown: Tideman describes these as British organizations, "
            "mostly trade unions, using STV or instant runoff."
        )
        jpath.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n")
    print(f"rewrote 87 ERS elections; {changed_ballots} ballots restored to their original length")


if __name__ == "__main__":
    main()
