"""Builds the data for the ballot-length charts (docs/model-review.md, assumption 5).

Reads each source's calibration.jsonl and metadata, and the Scottish ballots
(for the "rank my party's candidates, then stop" pattern). Writes one JSON file.

Usage (from the repository root):
    python3 -I data/ballot_length_charts.py <out.json>
"""
import glob
import json
import math
import os
import sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.abspath(__file__))
PARTY_ALIASES = {"LabCo": "Lab"}
NO_PARTY = {None, "Ind", "Independent", "None", ""}
PARTY_NAMES = {"SNP": "SNP", "Lab": "Labour", "Con": "Conservative", "LD": "Liberal Democrats", "Gr": "Greens"}
MAX_LEN = 12  # pooled distributions show 1..11 and "12 or more"


def meta_for(path):
    return json.load(open(path[: -len(".ballots")] + ".json", encoding="utf-8"))


def group_of(src, file):
    """Groups for the charts. PrefLib splits into union and society elections
    (ERS), other organizational elections (Debian, APA, UK Labour MPs), and
    public elections. PrefLib's Glasgow 2007 wards are also in the Scottish
    data, so they're left out here to avoid counting them twice."""
    if src == "preflib":
        name = os.path.basename(file)
        if name.startswith("ers-"):
            return "ers"
        if name.startswith(("debian-", "apa-", "uklabor-")):
            return "org"
        if name.startswith("glasgow-"):
            return None
        return "public"
    return src


def elections():
    out = []
    for src in ["scotland", "preflib", "nyc", "portland"]:
        for line in open(os.path.join(ROOT, src, "calibration.jsonl"), encoding="utf-8"):
            d = json.loads(line)
            meta = meta_for(os.path.join(os.path.dirname(ROOT), d["file"]))
            bl = d["ballot_length"]
            if group_of(src, d["file"]) is None:
                continue
            out.append({
                "group": group_of(src, d["file"]),
                "name": d["election"],
                "candidates": d["candidates"],
                "seats": d["seats"],
                "max_ranks": meta.get("max_ranks"),
                "voters": d["voters"],
                "mean": bl["mean"],
                "counts": {int(k): v for k, v in bl["counts_by_length"].items()},
            })
    return out


def pooled(rows):
    tot = defaultdict(int)
    for r in rows:
        for k, v in r["counts"].items():
            tot[min(k, MAX_LEN)] += v
    n = sum(tot.values())
    return [round(tot[k] / n, 4) for k in range(1, MAX_LEN + 1)], n


def party_then_stop():
    """Among Scottish voters whose first choice has running mates, the share
    who rank exactly that party's candidates and nothing else, by party."""
    acc = defaultdict(lambda: [0, 0])
    for path in glob.glob(os.path.join(ROOT, "scotland", "ballots", "*.ballots")):
        parties = meta_for(path).get("parties")
        if not parties:
            continue
        labels = [PARTY_ALIASES.get(p, p) for p in parties]
        members = defaultdict(set)
        for i, p in enumerate(labels):
            if p not in NO_PARTY:
                members[p].add(i)
        with open(path, encoding="utf-8") as f:
            for line in f:
                p = line.split()
                if not p or p[0] in ("candidates", "seats") or p[0].startswith("#"):
                    continue
                w, b = int(p[0]), [int(x) for x in p[1:]]
                party = labels[b[0]]
                ms = members.get(party)
                if not ms or len(ms) < 2:
                    continue
                acc[party][0] += w
                if set(b) == ms:
                    acc[party][1] += w
    rows = [{"party": PARTY_NAMES[p], "voters": n, "share": round(s / n, 4)}
            for p, (n, s) in acc.items() if p in PARTY_NAMES and n]
    total_n = sum(n for n, _ in acc.values())
    total_s = sum(s for _, s in acc.values())
    return sorted(rows, key=lambda r: -r["share"]), round(total_s / total_n, 4)


def fit_power(points):
    """Least-squares fit of log(mean) = log(a) + b log(x)."""
    xs = [math.log(x) for x, _ in points]
    ys = [math.log(y) for _, y in points]
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    b = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sum((x - mx) ** 2 for x in xs)
    return math.exp(my - b * mx), b


def fit_line(points):
    n = len(points)
    mx = sum(x for x, _ in points) / n
    my = sum(y for _, y in points) / n
    b = sum((x - mx) * (y - my) for x, y in points) / sum((x - mx) ** 2 for x, _ in points)
    return my - b * mx, b


def ols(X, y):
    """Least squares by the normal equations (small, well-conditioned problems only)."""
    k = len(X[0])
    M = [[sum(r[a] * r[b] for r in X) for b in range(k)] + [sum(r[a] * v for r, v in zip(X, y))] for a in range(k)]
    for c in range(k):
        for r in range(k):
            if r != c:
                f = M[r][c] / M[c][c]
                M[r] = [x - f * z for x, z in zip(M[r], M[c])]
    return [M[i][k] / M[i][i] for i in range(k)]


def main():
    rows = elections()
    uncapped = lambda r: r["max_ranks"] is None or r["max_ranks"] >= r["candidates"]
    public = [r for r in rows if r["group"] in ("scotland", "public") and uncapped(r)]
    ers = [r for r in rows if r["group"] == "ers"]
    a_c, b_c = fit_power([(r["candidates"], r["mean"]) for r in public])
    a_s, b_s = fit_line([(r["seats"], r["mean"]) for r in ers])
    a_ec, b_ec = fit_power([(r["candidates"], r["mean"]) for r in ers])
    scot = [r for r in rows if r["group"] == "scotland"]
    portland_council = [r for r in rows if r["group"] == "portland" and r["seats"] == 3]
    nyc5 = [r for r in rows if r["group"] == "nyc" and r["max_ranks"] == 5 and r["candidates"] >= 6]
    dists = {}
    for key, rs, label in [("scotland", scot, "Scotland: no rank limit"),
                           ("ers", ers, "Union and society elections (ERS): no rank limit"),
                           ("portland", portland_council, "Portland council districts: limit of 6"),
                           ("nyc", nyc5, "NYC contests with 6+ candidates: limit of 5")]:
        shares, n = pooled(rs)
        dists[key] = {"label": label, "shares": shares, "ballots": n, "elections": len(rs),
                      "limit": rs[0]["max_ranks"] if key in ("portland", "nyc") else None}
    stop_rows, stop_all = party_then_stop()
    # One fit per group, over that group's own range, for the charts.
    groups = {"scotland": [r for r in rows if r["group"] == "scotland"],
              "public": [r for r in rows if r["group"] == "public" and uncapped(r)],
              "org": [r for r in rows if r["group"] == "org" and uncapped(r)],
              "ers": ers}
    by_group = {}
    for g, rs in groups.items():
        ac, bc = fit_power([(r["candidates"], r["mean"]) for r in rs])
        seats = sorted({r["seats"] for r in rs})
        fit_s = fit_line([(r["seats"], r["mean"]) for r in rs]) if len(seats) > 1 else (None, None)
        by_group[g] = {"cand": {"a": ac, "b": bc, "min": min(r["candidates"] for r in rs), "max": max(r["candidates"] for r in rs)},
                       "seats": {"a": fit_s[0], "b": fit_s[1], "min": seats[0], "max": seats[-1]}, "n": len(rs)}
        print(g, len(rs), "cand fit", round(ac, 2), round(bc, 2), "range", by_group[g]["cand"]["min"], by_group[g]["cand"]["max"],
              "seats fit", fit_s, "seats", seats)
    # Elections with a rank limit below the number of candidates: how many fill it.
    limited = []
    for r in rows:
        lim = r["max_ranks"]
        if lim and lim < r["candidates"]:
            n = sum(r["counts"].values())
            limited.append({"name": r["name"], "group": r["group"], "limit": lim, "seats": r["seats"],
                            "candidates": r["candidates"], "fill": round(r["counts"].get(lim, 0) / n, 4), "mean": r["mean"]})
    # Limit effect: for each limited election, the share that filled the limit against the share
    # of comparable unlimited public elections (within 2 candidates) that ranked that many or more.
    # Equal means the limit only cuts ballots short; higher means it pulls voters up to it.
    unl = [r for r in rows if r["group"] in ("scotland", "public", "nyc", "portland") and uncapped(r)]
    for e, r in zip(limited, [r for r in rows if r["max_ranks"] and r["max_ranks"] < r["candidates"]]):
        peers = [u for u in unl if abs(u["candidates"] - r["candidates"]) <= 2]
        if len(peers) < 5:
            peers = sorted(unl, key=lambda u: abs(u["candidates"] - r["candidates"]))[:30]
        shares = sorted(sum(v for k, v in u["counts"].items() if k >= r["max_ranks"]) / sum(u["counts"].values()) for u in peers)
        e["unlimited_share"] = round(shares[len(shares) // 2], 4)
        e["peer_candidates"] = [min(u["candidates"] for u in peers), max(u["candidates"] for u in peers)]
    # Recount real multi-seat elections with every ballot cut after rank = seats.
    cut_at_seats = {}
    for key, fname, keep in [("scotland", "scotland.jsonl", lambda r: r["seats"] >= 3),
                             ("ers", "preflib-v2.jsonl", lambda r: "/ers-" in r["file"] and r["seats"] >= 2)]:
        n = changed = 0
        cut = 0
        for line in open(os.path.join(os.path.dirname(ROOT), "results", "2026-10-20-real-data-counts", fname), encoding="utf-8"):
            r = json.loads(line)
            if not keep(r):
                continue
            n += 1
            ch = r["changed"]
            changed += bool(r["seats"] <= len(ch) and ch[r["seats"] - 1])
        cut_at_seats[key] = {"elections": n, "changed": changed}
    # Share of ballots that rank more candidates than there are seats (what a limit equal to seats would cut).
    for key, rs in (("scotland", [r for r in rows if r["group"] == "scotland" and r["seats"] >= 3]),
                    ("ers", [r for r in rows if r["group"] == "ers" and r["seats"] >= 2])):
        tot = sum(sum(r["counts"].values()) for r in rs)
        over = sum(v for r in rs for k, v in r["counts"].items() if k > r["seats"])
        cut_at_seats[key]["ballots_cut"] = round(over / tot, 4)
    # Same seats, more candidates: one panel per (group, seats) with enough elections.
    same_seats = []
    for g in ("scotland", "ers"):
        by_s = defaultdict(list)
        for r in groups[g]:
            by_s[r["seats"]].append(r)
        for seats_n, rs in sorted(by_s.items()):
            if len(rs) < 15 or len({r["candidates"] for r in rs}) < 3:
                continue
            ac, bc = fit_power([(r["candidates"], r["mean"]) for r in rs])
            same_seats.append({"group": g, "seats": seats_n, "n": len(rs), "a": ac, "b": bc,
                               "min": min(r["candidates"] for r in rs), "max": max(r["candidates"] for r in rs)})
    # Both at once: log(mean) = c0 + c1 log(candidates) + c2 log(seats), per group.
    both = {}
    for g in ("scotland", "ers"):
        rs = groups[g]
        both[g] = dict(zip(("c0", "c1", "c2"), ols([[1, math.log(r["candidates"]), math.log(r["seats"])] for r in rs],
                                                     [math.log(r["mean"]) for r in rs])))
    out = {
        "limited": limited,
        "cut_at_seats": cut_at_seats,
        "same_seats": same_seats,
        "both": both,
        "by_group": by_group,
        "elections": [{k: r[k] for k in ("group", "name", "candidates", "seats", "max_ranks", "voters", "mean")} for r in rows],
        "distributions": dists,
        "party_then_stop": {"by_party": stop_rows, "all": stop_all},
        "fits": {
            "public_vs_candidates": {"a": a_c, "b": b_c, "n": len(public)},
            "ers_vs_seats": {"a": a_s, "b": b_s, "n": len(ers)},
            "ers_vs_candidates": {"a": a_ec, "b": b_ec, "n": len(ers)},
        },
    }
    json.dump(out, open(sys.argv[1], "w", encoding="utf-8"), ensure_ascii=False)
    print(f"public fit: mean = {a_c:.2f} x C^{b_c:.2f} (n={len(public)}); at C=75: {a_c * 75 ** b_c:.1f}, C=100: {a_c * 100 ** b_c:.1f}")
    print(f"ERS seats fit: mean = {a_s:.2f} + {b_s:.2f} x S (n={len(ers)}); at S=50: {a_s + 50 * b_s:.1f}")
    print(f"ERS candidates fit: mean = {a_ec:.2f} x C^{b_ec:.2f}; at C=75: {a_ec * 75 ** b_ec:.1f}")
    print("party then stop:", stop_all, stop_rows)
    for k, v in dists.items():
        print(k, v["elections"], v["ballots"], v["shares"][:8])


if __name__ == "__main__":
    main()
