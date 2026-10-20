"""Lists every candidate grouping found in the research, with its clustering
strength, for reading (not for tuning; see docs/model-review.md).

Clustering strength is the excess over popularity: of voters whose first
choice is in the group and who ranked a second, the share whose second choice
is also in the group, minus the share expected if second choices followed
popularity alone. Groupings with the same members in the same race are merged
into one row that lists every source naming them.

Scottish parties are pooled across all wards where the party ran 2 or more
candidates. NYC, Portland, and PrefLib groupings come from data/slate-review.json.

Usage (from the repository root):
    python3 -I data/slate_review.py data/slate-review.json
    python3 -I data/clustering_table.py data/slate-review.json <output folder>
"""
import csv
import glob
import json
import os
import sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.abspath(__file__))
PARTY_ALIASES = {"LabCo": "Lab"}
NO_PARTY = {None, "Ind", "Independent", "None", ""}
PARTY_NAMES = {"SNP": "SNP", "Lab": "Labour", "Con": "Conservative", "LD": "Liberal Democrats",
               "Gr": "Scottish Greens"}


def read_ballots(path):
    nc = None
    ballots = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            p = line.split()
            if not p or p[0].startswith("#"):
                continue
            if p[0] == "candidates":
                nc = int(p[1])
            elif p[0] != "seats":
                ballots.append((int(p[0]), [int(x) for x in p[1:]]))
    return nc, ballots


def scottish_parties():
    """Pooled cohesion and popularity baseline for each Scottish party."""
    acc = defaultdict(lambda: [0, 0, 0.0, 0])  # voters ranked 2+, same party second, popularity, wards
    for path in sorted(glob.glob(os.path.join(ROOT, "scotland", "ballots", "*.ballots"))):
        meta = json.load(open(path[:-8] + ".json", encoding="utf-8"))
        parties = meta.get("parties")
        if not parties:
            continue
        labels = [PARTY_ALIASES.get(p, p) for p in parties]
        nc, ballots = read_ballots(path)
        total = sum(w for w, _ in ballots)
        fp = [0] * nc
        for w, b in ballots:
            fp[b[0]] += w
        share = [x / total for x in fp]
        members = defaultdict(list)
        for i, p in enumerate(labels):
            if p not in NO_PARTY:
                members[p].append(i)
        for p, ms in members.items():
            if len(ms) < 2:
                continue
            a = acc[p]
            a[3] += 1
            mset = set(ms)
            for w, b in ballots:
                if b[0] in mset and len(b) >= 2:
                    a[0] += w
                    a[1] += w * (b[1] in mset)
                    rest = 1 - share[b[0]]
                    if rest > 0:
                        a[2] += w * sum(share[m] for m in ms if m != b[0]) / rest
    rows = []
    for p, (n, same, pop, wards) in acc.items():
        if p not in PARTY_NAMES or not n:
            continue
        rows.append({"place": "Scotland", "year": "2007-2022", "race": f"All wards where it ran 2+ candidates ({wards})",
                     "type": "Party (on the ballot)", "members": f"{PARTY_NAMES[p]} candidates",
                     "named_by": PARTY_NAMES[p], "voters": n, "observed": same / n, "popularity": pop / n})
    return rows


def type_of(kind):
    return {"campaign": "Candidate pact", "media": "Newspaper", "found-in-ballots": "Found only in ballots"}.get(kind, "Endorsing organization")


def slate_rows(review_path):
    d = json.load(open(review_path, encoding="utf-8"))
    rows = []
    for e in d["elections"]:
        merged = {}
        for g in e["groupings"]:
            key = frozenset(g["members"])
            name = g["name"].replace(" (media)", "")
            r = merged.get(key)
            if r is None:
                merged[key] = r = {"place": e["place"], "year": e["year"], "race": e["election"],
                                   "types": [], "named_by": [], "members": " · ".join(g["members"]),
                                   "voters": g["voters"], "observed": g["observed"], "popularity": g["popularity"]}
            t = type_of(g["kind"])
            if t not in r["types"]:
                r["types"].append(t)
            if g["kind"] != "found-in-ballots":
                r["named_by"].append(name)
        for r in merged.values():
            # A found pair that a slate or pact also names is that slate's row.
            types = [t for t in r["types"] if t != "Found only in ballots"] or r["types"]
            r["type"] = " + ".join(types)
            r["named_by"] = ", ".join(r["named_by"]) or "(no slate names this pair)"
            del r["types"]
            rows.append(r)
    return rows


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    out = sys.argv[2]
    os.makedirs(out, exist_ok=True)
    rows = scottish_parties() + slate_rows(sys.argv[1])
    for r in rows:
        r["excess"] = r["observed"] - r["popularity"]
    rows.sort(key=lambda r: -r["excess"])
    with open(os.path.join(out, "associations.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["place", "year", "race", "type", "named_by", "members", "voters",
                    "observed", "popularity_alone", "excess_points"])
        for r in rows:
            w.writerow([r["place"], r["year"], r["race"], r["type"], r["named_by"], r["members"], r["voters"],
                        round(r["observed"], 4), round(r["popularity"], 4), round(100 * r["excess"], 1)])
    pct = lambda x: f"{100 * x:.0f}%"
    with open(os.path.join(out, "table.md"), "w", encoding="utf-8") as f:
        f.write("| Strength (points over popularity) | Observed | Popularity alone | Type | Grouping | Members | Race | Voters |\n")
        f.write("|---:|---:|---:|---|---|---|---|---:|\n")
        for r in rows:
            f.write(f"| {100 * r['excess']:+.0f} | {pct(r['observed'])} | {pct(r['popularity'])} | {r['type']} | "
                    f"{r['named_by']} | {r['members']} | {r['place']} {r['year']}: {r['race']} | {r['voters']:,} |\n")
    print(f"{len(rows)} groupings written to {out}")


if __name__ == "__main__":
    main()
