"""Build Datawrapper-ready CSVs for the blog post from finished results.

Reads the real-election counts in ../2026-10-20-real-data-counts/ and the simulated runs in
raw/ (made with `stvsim run settings/<file>.toml > raw/<file>.jsonl`), and writes one CSV per
chart into charts/. Run from this folder: python3 make_charts.py
"""
import csv
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
REAL = os.path.join(HERE, "..", "2026-10-20-real-data-counts")
OUT = os.path.join(HERE, "charts")


def load(path):
    with open(path) as f:
        return [json.loads(line) for line in f if line.strip()]


def write(name, header, rows):
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, name), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)


def changed_at(r, k):
    """Whether cutting every ballot after rank k changes this real election's winners."""
    return k <= len(r["changed"]) and r["changed"][k - 1]


def pct(n, d):
    return round(100 * n / d, 1)


# ---------------------------------------------------------------- real elections

nyc = load(os.path.join(REAL, "nyc-v2.jsonl"))
scot = [r for r in load(os.path.join(REAL, "scotland.jsonl")) if r["seats"] >= 2]
org = [r for r in load(os.path.join(REAL, "preflib-v2.jsonl")) if "/ers-" in r["file"]]
SOURCES = [
    (f"NYC primaries (1 seat, {len(nyc)} races)", nyc),
    (f"Scottish council wards (2 to 5 seats, {len(scot)} wards)", scot),
    (f"Organization elections (1 to 12 seats, {len(org)} elections)", org),
]

# Chart 1: how often the winners change when every ballot stops after rank k.
write("01-real-winners-change.csv",
      ["Ballots stop after rank"] + [name for name, _ in SOURCES],
      [[k] + [pct(sum(changed_at(r, k) for r in rs), len(rs)) for _, rs in SOURCES] for k in range(1, 7)])

# Chart 2: each election's cutoff rank, grouped.
bands = [("Rank 1 is enough", 1, 1), ("2 ranks", 2, 2), ("3 ranks", 3, 3), ("4 or more ranks", 4, 999)]
write("02-real-cutoff-rank.csv",
      ["Election type"] + [b[0] for b in bands],
      [[name] + [pct(sum(lo <= r["cutoff_rank"] <= hi for r in rs), len(rs)) for _, lo, hi in bands]
       for name, rs in SOURCES])

# Chart 3: activity (votes that reach a rank) against consequence (winners change without it).
def reach(rs, k):
    return sum(r["reach_pct"][k - 1] if k <= len(r["reach_pct"]) else 0 for r in rs) / len(rs)

for slug, (name, rs) in zip(["nyc", "scotland", "organizations"], SOURCES):
    write(f"03-real-reach-vs-change-{slug}.csv",
          ["Rank", "Votes that reached this rank (%)", "Elections whose winners change without this rank and below (%)"],
          [[k, round(reach(rs, k), 1), pct(sum(changed_at(r, k - 1) for r in rs), len(rs))] for k in range(2, 7)])

# Chart 4: how many seats move in Scottish wards when only first choices count.
most = max(r["seats_changed"][0] for r in scot)
write("04-real-scotland-seats-moved-first-choices.csv",
      ["Seats that go to someone else", "Wards (%)", "Wards"],
      [[n, pct(sum(r["seats_changed"][0] == n for r in scot), len(scot)),
        sum(r["seats_changed"][0] == n for r in scot)] for n in range(0, most + 1)])


# ---------------------------------------------------------------- simulated elections

def holds_from(xs, ok):
    """The smallest rank k such that ok(x) holds at k and every deeper rank (as on the branch page)."""
    k = len(xs) + 1
    for i in range(len(xs) - 1, -1, -1):
        if not ok(xs[i]):
            break
        k = i + 1
    return k


def figures(r):
    """The branch page's figures for one engine result line."""
    t, sims = r["truncation"], r["settings"]["run"]["sims"]
    same, acc = [], 0
    for n in t["cutoff_rank"]["counts"]:
        acc += n
        same.append(acc / sims)
    at = lambda level: next(i + 1 for i, x in enumerate(same) if x >= level - 1e-9)
    mean = t["seats_changed"]["mean"]
    return {"k50": at(0.5), "k80": at(0.8), "k95": at(0.95),
            "k_one": holds_from(mean, lambda x: x <= 1), "k_zero": holds_from(mean, lambda x: x == 0)}


BRANCHES = [
    ("Bronx/Upper Manhattan", "bronx-upper-manhattan"),
    ("Central Brooklyn", "central-brooklyn"),
    ("Flatbush", "flatbush"),
    ("Lower Manhattan", "lower-manhattan"),
    ("North Brooklyn", "north-brooklyn"),
    ("Queens", "queens"),
    ("South Brooklyn + Staten Island", "south-brooklyn-staten-island"),
    ("Metro DC DSA (2025)", "metro-dc-2025"),
]
rows = []
for name, slug in BRANCHES:
    r = load(os.path.join(HERE, "raw", f"branch-{slug}.jsonl"))[0]
    e, f = r["settings"]["election"], figures(r)
    rows.append([name, e["candidates"], r["seats"], e["voters"], round(100 * r["seats"] / e["candidates"]),
                 f["k_one"], f["k50"], f["k95"]])
write("05-sim-dsa-branches.csv",
      ["Branch", "Candidates", "Seats", "Expected ballots", "Candidates who win (%)",
       "Rank after which under 1 seat changes on average", "Half of elections decided within rank",
       "95 of 100 elections decided within rank"],
      rows)

# Chart 6: the truncation curve and seats changed, for one election.
r = load(os.path.join(HERE, "raw", "branch-metro-dc-2025.jsonl"))[0]
t = r["truncation"]
last = holds_from(t["p_changed"], lambda x: x == 0)
write("06-sim-metro-dc-curve.csv",
      ["Ballots stop after rank", "Elections whose winners change (%)", "Seats that go to someone else, on average",
       "Seats that go to someone else, most in any election"],
      [[k, round(100 * t["p_changed"][k - 1], 1), round(t["seats_changed"]["mean"][k - 1], 2),
        t["seats_changed"]["max"][k - 1]] for k in range(1, min(last, len(t["p_changed"])) + 1)])

# Chart 7: how the share of candidates who win changes the answer.
rows = []
for r in load(os.path.join(HERE, "raw", "seat-share-org-50.jsonl")):
    f = figures(r)
    rows.append([round(100 * r["seats"] / r["settings"]["election"]["candidates"]), r["seats"],
                 f["k_one"], f["k50"], f["k95"]])
write("07-sim-seat-share.csv",
      ["Candidates who win (%)", "Seats (of 50 candidates)", "Rank after which under 1 seat changes on average",
       "Half of elections decided within rank", "95 of 100 elections decided within rank"],
      rows)

print("wrote", sorted(os.listdir(OUT)))
