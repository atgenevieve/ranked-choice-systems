#!/usr/bin/env python3
"""Convert Portland, OR 2024 cast vote records into .ballots + .json files.

Reads raw/cvr-*.csv (from download.py) and the official RCTab summaries in
raw/official/*.json, and writes one .ballots + .json pair per contest into
ballots/ (format: docs/ballot-format.md). Cleanup rules are in README.md.
It also writes ballots/checks.json, comparing our first-choice totals with
the official first round.

Run:  python3 data/portland/convert.py
Standard library only. The CSV files are read as data; nothing is executed.
"""
import collections
import csv
import json
import pathlib
import re

HERE = pathlib.Path(__file__).resolve().parent
RAW = HERE / "raw"
OUT = HERE / "ballots"
UNCERTIFIED = "Uncertified Write In"

SYSTEMS = {1: "irv", 3: "portland-stv"}
DATE = "2024-11-05"


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def convert(path):
    f = open(path, newline="", encoding="utf-8-sig")
    reader = csv.reader(f)
    header = next(reader)
    style_col = header.index("PrecinctStyleName")
    cols, contest, seats, parties = [], None, None, {}
    ignored_writein_cols = 0
    for i, h in enumerate(header):
        if not h.startswith("Choice_"):
            continue
        # Choice_<id>_1:<contest>:<rank>:Number of Winners <n>:<candidate>:<party>
        p = h.split(":")
        contest, rank = p[1], int(p[2])
        seats = int(p[3].rsplit(" ", 1)[1])
        cand, party = ":".join(p[4:-1]), p[-1]
        if re.fullmatch(r"Write-in-\d+", cand):
            # Raw write-in bubble positions. The adjudicated result of each
            # write-in is marked separately (in a candidate's column or in
            # "Uncertified Write In"), so these are left out; counting both
            # would turn every write-in into an overvote.
            ignored_writein_cols += 1
            continue
        parties[cand] = party
        cols.append((i, rank, cand))
    max_rank = max(r for _, r, _ in cols)

    ballots = collections.Counter()
    stats = collections.Counter()
    unmarked_by_style = collections.Counter()
    marked_styles = set()
    for row in reader:
        stats["rows"] += 1
        marks = collections.defaultdict(list)
        for i, rank, cand in cols:
            if row[i] == "1":
                marks[rank].append(cand)
        style = row[style_col]
        if not marks:
            unmarked_by_style[style] += 1
            continue
        marked_styles.add(style)
        stats["remade"] += row[header.index("Remade")] == "1"
        ballot, skipped = [], False
        flags = set()
        for rank in range(1, max_rank + 1):
            m = marks.get(rank, [])
            if not m:
                skipped = True
                continue
            if skipped:
                flags.add("skipped")
            skipped = False
            if len(m) > 1:
                flags.add("overvote")  # City Code 2.08: skip the overvoted rank, go on to the next
                continue
            if m[0] in ballot:
                flags.add("duplicate")  # counted at its highest rank only
                continue
            ballot.append(m[0])
        for fl in flags:
            stats[fl] += 1
        if ballot:
            ballots[tuple(ballot)] += 1
        else:
            stats["blank_only_overvotes"] += 1
    # A ballot with no marks counts as blank only if its precinct style carried
    # this contest; the file also holds every other ballot in the county.
    stats["blank_no_marks"] = sum(n for s, n in unmarked_by_style.items() if s in marked_styles)
    stats["rows_outside_contest"] = sum(n for s, n in unmarked_by_style.items() if s not in marked_styles)
    return contest, seats, parties, ballots, stats, ignored_writein_cols, max_rank


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    checks = {}
    for path in sorted(RAW.glob("cvr-*.csv")):
        contest, seats, parties, ballots, st, ignored, max_rank = convert(path)
        first = collections.Counter()
        for b, n in ballots.items():
            first[b[0]] += n
        everyone = {c for b in ballots for c in b}
        order = sorted(everyone, key=lambda c: (c == UNCERTIFIED, -first[c], c))
        index = {c: i for i, c in enumerate(order)}

        off_path = RAW / "official" / (slug(contest.replace(",", " -", 1)) + ".json")
        if not off_path.exists():
            off_path = next((p for p in (RAW / "official").glob("*.json")
                             if json.loads(p.read_text())["config"]["office"] == contest), None)
        winners, check = None, {"official_file": None}
        if off_path:
            off = json.loads(off_path.read_text())
            elected = [t["elected"] for r in off["results"] for t in r["tallyResults"] if "elected" in t]
            winners = [index[w] for w in elected]
            r1 = {k: int(float(v)) for k, v in off["results"][0]["tally"].items()}
            check = {"official_file": f"official/{off_path.name}", "official_winners": elected,
                     "official_threshold": off["config"].get("threshold"),
                     "official_round1_total": sum(r1.values()), "our_round1_total": sum(first.values()),
                     "round1_differences": {c: {"official": v, "ours": first.get(c, 0)}
                                            for c, v in r1.items() if v != first.get(c, 0)},
                     "candidates_missing_from_official": sorted(set(order) - set(r1))}
        blank = st["blank_no_marks"] + st["blank_only_overvotes"]
        name = contest.replace("City of Portland, ", "")
        notes = [
            f"Multnomah County cast vote record {path.name}. Ballot allowed {max_rank} ranks. Cleanup follows Portland City Code 2.08 "
            f"(see data/portland/README.md). Ballots with an overvote: {st['overvote']}; with a skipped rank: "
            f"{st['skipped']}; with a repeated candidate: {st['duplicate']}; remade ballots: {st['remade']}. "
            f"Blank: {st['blank_no_marks']} with no marks (estimated from precinct styles), "
            f"{st['blank_only_overvotes']} with only overvoted ranks.",
            "'Uncertified Write In' stands for all write-ins for people not on the City's certified "
            "write-in list, combined; the official count treats it as one candidate.",
        ]
        if winners is not None:
            notes.append(f"Official winners from the final RCTab summary {check['official_file']} "
                         "(Multnomah County Elections, certified December 2, 2024).")
        if check.get("round1_differences"):
            d = sum(abs(v["official"] - v["ours"]) for v in check["round1_differences"].values())
            notes.append(f"Our first-choice totals differ from the official first round by {d} votes in all; "
                         "see checks.json.")
        meta = {
            "source": "portland",
            "election": f"Portland, OR 2024 general, {name}",
            "date": DATE,
            "system": SYSTEMS.get(seats, "portland-stv"),
            "candidates": order,
            # Every candidate is listed as "NON" (nonpartisan office), which says nothing about slates.
            "parties": None if all(parties.get(c) in ("NON", "", None) for c in order)
            else [parties.get(c) or None for c in order],
            "official_winners": winners,
            "blank_ballots": blank,
            "max_ranks": max_rank,
            "notes": " ".join(notes),
        }
        base = f"2024-{slug(name)}"
        lines = [f"# Portland, OR 2024 general: {contest}", f"candidates {len(order)}", f"seats {seats}"]
        for b, n in sorted(ballots.items(), key=lambda kv: (-kv[1], [index[c] for c in kv[0]])):
            lines.append(f"{n} " + " ".join(str(index[c]) for c in b))
        (OUT / f"{base}.ballots").write_text("\n".join(lines) + "\n")
        (OUT / f"{base}.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n")
        checks[contest] = check | {"ballots": sum(ballots.values()), "unique_ballots": len(ballots),
                                   "blank": blank, "stats": dict(st), "ignored_writein_columns": ignored}
        print(f"{contest}: {sum(ballots.values()):,} ballots, {len(ballots):,} distinct")
    (OUT / "checks.json").write_text(json.dumps(checks, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
