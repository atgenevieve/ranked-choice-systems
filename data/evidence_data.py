"""Builds the data files for the model evidence artifact (one JSON file per tab).

The ballot-length tab's data comes from data/ballot_length_charts.py. This
script builds the other tabs: slate loyalty, candidate popularity, slate
sizes, slates and unaffiliated candidates, and election size.

Usage (from the repository root, after calibration.py has run for every source):
    python3 -I data/evidence_data.py <output folder>
"""
import csv
import glob
import json
import math
import os
import random
import sys
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(ROOT)
PARTY_ALIASES = {"LabCo": "Lab"}
NO_PARTY = {None, "Ind", "Independent", "None", ""}
MAIN_PARTIES = ["SNP", "Lab", "Con", "LD", "Gr"]
PARTY_NAMES = {"SNP": "SNP", "Lab": "Labour", "Con": "Conservative", "LD": "Liberal Democrats", "Gr": "Greens",
               "Ind": "Independents", "other": "Other parties", "(none)": "Ranked no one else"}


def group_of(src, file):
    """The same groups as the ballot-length charts."""
    name = os.path.basename(file)
    if src == "preflib":
        if name.startswith("ers-"):
            return "ers"
        if name.startswith(("debian-", "apa-", "uklabor-")):
            return "org"
        if name.startswith("glasgow-"):
            return None
        return "public"
    return src


def calibration_rows():
    for src in ["scotland", "preflib", "nyc", "portland", "act"]:
        path = os.path.join(ROOT, src, "calibration.jsonl")
        if not os.path.exists(path):
            continue
        for line in open(path, encoding="utf-8"):
            d = json.loads(line)
            g = group_of(src, d["file"])
            if g is None:
                continue
            meta = json.load(open(os.path.join(REPO, d["file"])[: -len(".ballots")] + ".json", encoding="utf-8"))
            yield src, g, d, meta


def r4(x):
    return None if x is None else round(x, 4)


# ---------------------------------------------------------------- slate loyalty

def slate_loyalty(rows):
    wards = []
    flows = defaultdict(Counter)
    evenness = []
    endorsement = []
    evenness_by_party = defaultdict(list)
    for src, g, d, meta in rows:
        sc = d.get("slate_cohesion")
        if src == "scotland" and sc and sc.get("cohesion") is not None:
            wards.append({"name": d["election"], "observed": sc["cohesion"], "popularity": sc.get("popularity_baseline"),
                          "random": sc["random_baseline"], "voters": sc["voters_considered"]})
            for first, seconds in sc["second_choice_party_counts"].items():
                for second, n in seconds.items():
                    flows[first][second] += n
            ev = d["transfer_spread"].get("cross_party_evenness_weighted_mean")
            if ev is not None:
                evenness.append(round(ev, 4))
        # Cross-party evenness per first-choice party, ward by ward: how evenly the second
        # choices that leave a party spread over other parties' candidates (voter-weighted
        # mean over that party's candidates in the ward).
        if src == "scotland" and d["seats"] >= 3 and meta.get("parties"):
            labels = [PARTY_ALIASES.get(p, p) for p in meta["parties"]]
            acc = defaultdict(lambda: [0.0, 0])
            for c in d["transfer_spread"]["by_candidate"]:
                ev = c.get("cross_party_evenness")
                party = labels[c["candidate"]]
                if ev is None or party not in MAIN_PARTIES or not c["voters_with_next"]:
                    continue
                acc[party][0] += ev * c["voters_with_next"]
                acc[party][1] += c["voters_with_next"]
            for party, (tot, n) in acc.items():
                evenness_by_party[party].append(round(tot / n, 4))
        es = d.get("endorsement_slate_cohesion")
        if es and es.get("cohesion") is not None and es.get("popularity_baseline") is not None:
            endorsement.append({"name": d["election"], "group": g, "observed": es["cohesion"],
                                "popularity": es["popularity_baseline"], "random": es["random_baseline"]})
    # First choice (rows) to second choice (columns), as shares of each row.
    cols = MAIN_PARTIES + ["Ind", "other", "(none)"]
    matrix = []
    for first in MAIN_PARTIES:
        c = flows.get(first, Counter())
        total = sum(c.values())
        if not total:
            continue
        row = {k: 0 for k in cols}
        for second, n in c.items():
            key = second if second in cols else "other"
            row[key] += n
        matrix.append({"first": first, "voters": total, "shares": [round(row[k] / total, 4) for k in cols]})
    types = defaultdict(list)
    with open(os.path.join(REPO, "results", "2026-10-20-clustering-strength", "associations.csv"), encoding="utf-8") as f:
        for r in csv.DictReader(f):
            types[r["type"]].append(float(r["excess_points"]))
    return {"wards": wards, "flow_columns": [PARTY_NAMES.get(c, c) for c in cols],
            "flows": [{**m, "first": PARTY_NAMES[m["first"]]} for m in matrix],
            "cross_party_evenness": evenness, "endorsement": endorsement,
            "evenness_by_party": {PARTY_NAMES[k]: v for k, v in evenness_by_party.items() if k in MAIN_PARTIES},
            "types": {k: v for k, v in types.items()}}


# ---------------------------------------------------------------- candidate popularity

def model_gaps(n, spread, trials=4000, seed=7):
    """What the current model's popularity draw gives for n candidates:
    median log gap from the top to the middle candidate, and from the middle to
    the bottom, of first-choice shares (popularity alone, no slates)."""
    rng = random.Random(seed)
    top, bottom = [], []
    for _ in range(trials):
        v = sorted((rng.gauss(0, spread) for _ in range(n)), reverse=True)
        mid = (v[(n - 1) // 2] + v[n // 2]) / 2
        top.append(v[0] - mid)
        bottom.append(mid - v[-1])
    top.sort()
    bottom.sort()
    return round(top[trials // 2], 4), round(bottom[trials // 2], 4)


def popularity(rows):
    out = []
    for src, g, d, meta in rows:
        fc = d["first_choice"]
        if fc.get("lognormal_spread") is None:
            continue
        out.append({"name": d["election"], "group": g, "candidates": d["candidates"], "seats": d["seats"],
                    "spread": r4(fc["lognormal_spread"]), "top_share": r4(fc["top_share"]),
                    "gap_top": r4(fc.get("log_gap_top_to_median")), "gap_bottom": r4(fc.get("log_gap_median_to_bottom")),
                    # The same gaps as plain ratios: how many times more first choices the top candidate
                    # gets than the middle one, and the middle one than the bottom one.
                    "top_ratio": r4(fc.get("top_to_median_ratio")),
                    "bottom_ratio": r4(math.exp(fc["log_gap_median_to_bottom"])) if fc.get("log_gap_median_to_bottom") is not None else None})
    model = [{"spread": s, "top": t, "bottom": b, "top_ratio": round(math.exp(t), 2)}
             for s in (0.5, 0.7, 1.0, 1.3, 1.6, 2.0) for t, b in [model_gaps(7, s)]]
    # The candidate ladder: each candidate's share of first choices, most to least popular,
    # in Scottish wards with exactly 7 candidates, next to what the model gives.
    ladders = [sorted(d["first_choice"]["shares_by_candidate"], reverse=True)
               for src, g, d, meta in rows if src == "scotland" and d["candidates"] == 7]
    return {"elections": out, "model_7": model, "quota_check": quota_check(out), "ladder_7": {
        "wards": len(ladders), "real": quantiles_by_position(ladders),
        "model": {str(s): quantiles_by_position(model_ladders(7, s)) for s in (0.7, 1.0)},
        # How often the drop from the middle candidate to the last is bigger than the drop from
        # the top candidate to the middle (comparing multiples: middle / last against top / middle).
        "all": all_7(rows),
        "bottom_bigger": {"real_7": bottom_bigger([e for e in out if e["group"] == "scotland" and e["candidates"] == 7]),
                          "real_all": bottom_bigger([e for e in out if e["group"] == "scotland"]),
                          "model": {str(s): model_bottom_bigger(7, s) for s in (0.7, 1.0)}}}}


def all_7(rows, seed=11):
    """Every real 7-candidate Scottish ward, and as many model elections at the proposed
    setting (0.7), each as first-choice shares from most to least popular."""
    real = sorted((d["election"], sorted(d["first_choice"]["shares_by_candidate"], reverse=True))
                  for src, g, d, meta in rows if src == "scotland" and d["candidates"] == 7)
    return {"real": [{"name": n, "shares": [round(x, 4) for x in v]} for n, v in real],
            "model": [{"shares": [round(x, 4) for x in v]} for v in model_ladders(7, 0.7, trials=len(real), seed=seed)]}


def bottom_bigger(elections):
    e = [x for x in elections if x["bottom_ratio"] is not None and x["top_ratio"] is not None]
    return {"share": round(sum(x["bottom_ratio"] > x["top_ratio"] for x in e) / len(e), 4), "n": len(e)}


def model_bottom_bigger(n, spread):
    ladders = model_ladders(n, spread)
    mid = lambda l: (l[(n - 1) // 2] * l[n // 2]) ** 0.5
    return round(sum(mid(l) / l[-1] > l[0] / mid(l) for l in ladders) / len(ladders), 4)


QUOTA_CELLS = [
    ("Public, 1 seat", lambda e: e["group"] in ("scotland", "public", "nyc", "portland") and e["seats"] == 1),
    ("Public, 2 to 5 seats", lambda e: e["group"] in ("scotland", "public", "portland", "act") and e["seats"] > 1),
    ("Organizational, 1 seat", lambda e: e["group"] in ("ers", "org") and e["seats"] == 1),
    ("Organizational, 2 to 4 seats", lambda e: e["group"] in ("ers", "org") and 1 < e["seats"] < 5),
    ("Organizational, 5 to 12 seats", lambda e: e["group"] in ("ers", "org") and e["seats"] >= 5),
]


def quota_check(elections, spreads=(0.5, 0.7, 0.85, 1.0, 1.3), draws=20, seed=5):
    """Does one popularity setting explain the quota pattern? For each type of election, the real
    median of the top candidate's first choices as a multiple of the quota, next to what the model's
    popularity draw alone gives with each real election's own candidates and seats."""
    rng = random.Random(seed)
    out = []
    for name, test in QUOTA_CELLS:
        els = [e for e in elections if test(e)]
        real = sorted(e["top_share"] * (e["seats"] + 1) for e in els)
        model = {}
        for sp in spreads:
            per = []
            for e in els:
                v = []
                for _ in range(draws):
                    w = [math.exp(rng.gauss(0, sp)) for _ in range(e["candidates"])]
                    v.append(max(w) / sum(w) * (e["seats"] + 1))
                per.append(sorted(v)[draws // 2])
            model[str(sp)] = round(sorted(per)[len(per) // 2], 3)
        out.append({"cell": name, "n": len(els), "real": round(real[len(real) // 2], 3), "model": model})
    return out


def quantiles_by_position(ladders):
    """Median and middle half (25th to 75th percentile) of the share at each position."""
    out = []
    for k in range(len(ladders[0])):
        v = sorted(l[k] for l in ladders)
        q = lambda p: round(v[min(len(v) - 1, int(p * len(v)))], 4)
        out.append({"median": q(0.5), "lo": q(0.25), "hi": q(0.75)})
    return out


def model_ladders(n, spread, trials=4000, seed=7):
    """First-choice shares from the model's popularity draw alone (no slates), sorted."""
    rng = random.Random(seed)
    out = []
    for _ in range(trials):
        w = [math.exp(rng.gauss(0, spread)) for _ in range(n)]
        t = sum(w)
        out.append(sorted((x / t for x in w), reverse=True))
    return out


# ---------------------------------------------------------------- slate sizes

def slate_sizes(rows):
    pooled = defaultdict(lambda: [0, 0, 0])  # candidates, first choices, wards
    total_c = total_v = 0
    per_ward = defaultdict(list)
    for src, g, d, meta in rows:
        if src != "scotland" or d["seats"] < 3 or not meta.get("parties"):
            continue
        labels = [PARTY_ALIASES.get(p, p) for p in meta["parties"]]
        labels = ["Ind" if p in NO_PARTY else p for p in labels]
        shares = d["first_choice"]["shares_by_candidate"]
        nc = d["candidates"]
        total_c += nc
        total_v += 1
        by = defaultdict(lambda: [0, 0.0])
        for p, s in zip(labels, shares):
            by[p][0] += 1
            by[p][1] += s
        for p, (n, s) in by.items():
            key = p if p in MAIN_PARTIES or p == "Ind" else "other"
            pooled[key][0] += n
            pooled[key][1] += s
            pooled[key][2] += 1
            if key in MAIN_PARTIES:
                per_ward[key].append({"cand_share": round(n / nc, 4), "vote_share": round(s, 4), "candidates": n,
                                      "ward_candidates": nc, "name": d["election"]})
    bars = [{"party": PARTY_NAMES[k], "cand_share": round(pooled[k][0] / total_c, 4),
             "vote_share": round(pooled[k][1] / total_v, 4)} for k in MAIN_PARTIES + ["Ind", "other"] if pooled[k][0]]
    return {"pooled": bars, "per_ward": {PARTY_NAMES[k]: v for k, v in per_ward.items()}, "wards": total_v}


# ---------------------------------------------------------------- slates and unaffiliated candidates

def unaffiliated(rows):
    parties_per_ward = Counter()
    ind_share = []
    multi = []
    us = []
    # Every candidate in a Scottish ward is one of three kinds: a party candidate with a running
    # mate (another candidate of the same party in the ward), a party's only candidate, or an
    # independent (no party label).
    kinds = Counter()
    independents_per_ward = Counter()
    for src, g, d, meta in rows:
        if src == "scotland" and d["seats"] >= 3 and meta.get("parties"):
            labels = [PARTY_ALIASES.get(p, p) for p in meta["parties"]]
            named = [p for p in labels if p not in NO_PARTY]
            parties_per_ward[len(set(named))] += 1
            ind_share.append(round(1 - len(named) / len(labels), 4))
            multi.append(sum(1 for p, n in Counter(named).items() if n >= 2))
            size = Counter(named)
            for p in labels:
                kinds["independent" if p in NO_PARTY else "running_mate" if size[p] >= 2 else "only"] += 1
            independents_per_ward[min(len(labels) - len(named), 4)] += 1
        if src in ("nyc", "portland") and meta.get("slates"):
            names = meta["candidates"]
            real = [i for i, nm in enumerate(names) if "write" not in nm.lower()]
            if len(real) < 4:
                continue
            org = set()
            for s in meta["slates"]:
                if s.get("kind") == "endorsement" and "(media)" not in s["name"]:
                    org.update(s["members"])
            us.append({"name": d["election"], "group": src, "candidates": len(real),
                       "endorsed": len(org & set(real)), "unendorsed_share": round(1 - len(org & set(real)) / len(real), 4)})
    return {"candidate_kinds": dict(kinds), "independents_per_ward": dict(sorted(independents_per_ward.items())),
            "parties_per_ward": dict(sorted(parties_per_ward.items())), "independent_share": ind_share,
            "parties_with_running_mates": dict(sorted(Counter(multi).items())), "us": us}


# ---------------------------------------------------------------- election size

# Large organizational and public elections from docs/large-elections.md, for reference.
REFERENCE = [
    {"name": "Metro DC DSA convention delegates, 2025", "kind": "organizational", "seats": 46, "candidates": 75, "voters": 432},
    {"name": "Western Australia Legislative Council, 2025", "kind": "public", "seats": 37, "candidates": 146, "voters": None},
    {"name": "Australian Senate, Tasmania 2016", "kind": "public", "seats": 12, "candidates": 58, "voters": None},
]


def election_size(rows):
    out = []
    for src, g, d, meta in rows:
        out.append({"name": d["election"], "group": g, "candidates": d["candidates"], "seats": d["seats"], "voters": d["voters"]})
    return {"elections": out, "reference": REFERENCE}


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    rows = list(calibration_rows())
    for name, fn in [("slate-loyalty", slate_loyalty), ("popularity", popularity), ("slate-sizes", slate_sizes),
                     ("unaffiliated", unaffiliated), ("election-size", election_size)]:
        with open(os.path.join(out, name + ".json"), "w", encoding="utf-8") as f:
            json.dump(fn(rows), f, ensure_ascii=False, separators=(",", ":"))
        print(name, os.path.getsize(os.path.join(out, name + ".json")), "bytes")


if __name__ == "__main__":
    main()
