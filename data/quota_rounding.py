"""Builds the quota-rounding tab of the model evidence page (evidence/data/quota-rounding.json).

Scottish rules round the quota (the votes a candidate needs to win a seat) to a whole number:
ballots ÷ (seats + 1), fraction dropped, plus 1. This script plays out the same elections with
that whole-vote quota and with the exact quota (no rounding; the engine's `quota = "exact"`),
at a range of voter counts, and records each count's cutoff ranks: for each simulated election,
the smallest rank at which cutting every ballot, and cutting at any deeper rank, elects the same
people as full ballots. The page turns these into the 95%, 80%, and 50% confidence ranks.

Three sweeps:
- "elections": two organizational elections, voter by voter (in steps) across several quota steps.
- "size": one election shape at a growing number of voters, sampled just before and just after
  a quota step, to show where rounding stops mattering.

Usage (from the repository root, after building the engine with cargo build --release):
    python3 -I data/quota_rounding.py evidence/data/quota-rounding.json
"""
import json
import os
import subprocess
import sys
import tempfile

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BIN = os.path.join(REPO, "engine", "target", "release", "stvsim")
SIMS = 1000
SEED = 1

# The elections: candidates, seats, and the voter range to sweep. Organization members, a
# ballot that says "rank up to N" with N equal to the seats, and the model's default slates.
ELECTIONS = [
    {"id": "metro-dc", "name": "75 candidates, 46 seats (like Metro DC DSA's 2025 delegate election)",
     "candidates": 75, "seats": 46, "from": 380, "to": 520, "step": 2, "yours": 432},
    {"id": "wide", "name": "150 candidates, 75 seats", "candidates": 150, "seats": 75,
     "from": 500, "to": 800, "step": 5, "yours": 762},
]
# Votes per seat (the whole-vote quota just after a step) for the size sweep.
SIZE_QUOTAS = [3, 5, 7, 10, 15, 20, 30, 50, 75, 100]


def settings(c, seats, voters, quota):
    return f"""[run]
name = "quota-rounding"
seed = {SEED}
sims = {SIMS}
threads = 0
truncation = true
curve_ranks = 0
quota = "{quota}"

[election]
candidates = {c}
seats = [{seats}]
voters = {voters}
ranks = {c}

[electorate]
type = "organization"

[ballot]
wording = "up_to"
n = "seats"

[model]
version = "0.2"
"""


def run(c, seats, voters, quota, folder):
    path = os.path.join(folder, "s.toml")
    with open(path, "w") as f:
        f.write(settings(c, seats, voters, quota))
    out = subprocess.run([BIN, "run", path], capture_output=True, text=True, check=True).stdout
    r = json.loads(out.strip().splitlines()[-1])
    counts = r["truncation"]["cutoff_rank"]["counts"]
    while counts and counts[-1] == 0:
        counts.pop()
    return counts, r["engine"]


def point(c, seats, v, folder):
    whole, engine = run(c, seats, v, "whole", folder)
    exact, _ = run(c, seats, v, "exact", folder)
    print(f"{c} candidates, {seats} seats, {v} voters", file=sys.stderr, flush=True)
    return {"v": v, "quota": v // (seats + 1) + 1, "whole": whole, "exact": exact}, engine


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    out = {"made_by": "data/quota_rounding.py", "sims": SIMS, "seed": SEED, "elections": [], "size": None}
    with tempfile.TemporaryDirectory() as folder:
        for e in ELECTIONS:
            pts = []
            for v in range(e["from"], e["to"] + 1, e["step"]):
                p, engine = point(e["candidates"], e["seats"], v, folder)
                pts.append(p)
            if e["yours"] not in [p["v"] for p in pts]:
                pts.append(point(e["candidates"], e["seats"], e["yours"], folder)[0])
                pts.sort(key=lambda p: p["v"])
            out["elections"].append({**e, "points": pts})
            out["engine"] = engine
        # Size: the Metro DC shape, just after a quota step (quota rounded up by almost a whole
        # vote) and just before the next one (quota almost exact).
        c, seats = 75, 46
        size = []
        for m in SIZE_QUOTAS:
            after, _ = point(c, seats, m * (seats + 1), folder)
            before, _ = point(c, seats, (m + 1) * (seats + 1) - 1, folder)
            size.append({"votes_per_seat": m, "after_step": after, "before_step": before})
        out["size"] = {"candidates": c, "seats": seats, "points": size}
    with open(sys.argv[1], "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))
    print(sys.argv[1], os.path.getsize(sys.argv[1]), "bytes")


if __name__ == "__main__":
    main()
