"""Measures the pull toward an "at least N" instruction in Australian Senate ballots, the same
way data/fit_length.py does for Canberra: the share of voters who number N or more, against the
share whose natural length (public voters' fit) is N or more.

    python3 -I data/pull_at_least_senate.py
"""
import json, os, sys
ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)
import fit_length as F
f = json.load(open(os.path.join(ROOT, "fits", "ballot-length.json")))["fits"]["public"]
p = (f["scale"], f["candidates_power"], f["seats_power"], f["bunching"], f["complete_share_at_4"], f["complete_fade"])
out = []
for e in F.rows("ausenate"):
    if not e["min_ranks"]: continue
    n_min = e["min_ranks"]; n = sum(e["counts"].values())
    if n_min > e["candidates"]: continue
    probs = F.length_probs(e["candidates"], e["seats"], p)
    natural = sum(probs[n_min - 1:])
    reached = sum(c for l, c in e["counts"].items() if l >= n_min) / n
    exact = e["counts"].get(n_min, 0) / n
    pull = (reached - natural) / (1 - natural) if natural < 1 else None
    kind = "ATL" if "above" in e["name"] else "BTL"
    out.append((kind, e["name"].split(",")[0][-4:], e["name"].split(",")[1].split("(")[0].strip(), n_min, e["candidates"], n, round(reached,3), round(exact,3), round(natural,3), None if pull is None else round(pull,3)))
for o in out: print(o)
for k in ("ATL","BTL"):
    ps = sorted(o[-1] for o in out if o[0]==k and o[-1] is not None)
    rs = sorted(o[6] for o in out if o[0]==k)
    print(k, "median pull", ps[len(ps)//2], "range", ps[0], ps[-1], "median reached", rs[len(rs)//2])
