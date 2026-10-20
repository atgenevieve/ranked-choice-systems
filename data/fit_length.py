"""Fits the ballot-length settings of the voter model (docs/model-spec.md, assumption 5).

A voter's natural ballot length is 1 plus a Conway-Maxwell-Poisson count, capped at the number
of candidates. That count is like a Poisson count, with one more setting, "bunching", that lets
lengths cluster more tightly around their typical value (above 1) or spread out more (below 1).
Its rate is

    scale x candidates^candidates_power x seats^seats_power

Separately, a share of voters rank every candidate; it shrinks as fields grow. This script fits those six numbers by maximum likelihood (the values that make the real ballot lengths most
likely), separately for:

- public voters: Scottish council elections, which have no rank limit;
- organization members: union and society elections from the Electoral Reform Society (ERS),
  which have no rank limit.

Each election counts equally, whatever its size.

It then fits how strongly a ballot's rules pull voters up to them:

- "up to N": NYC, Portland, and the PrefLib elections with a rank limit. For each, the share
  of voters who rank exactly N is compared with the share whose natural length (public voters'
  fit) is N or more; the rest is the pull. Reported by N.
- "at least N": Canberra 2024, where ballots said "Number five boxes from 1 to 5".

Usage (from the repository root, after calibration.py has run for every source):
    python3 -I data/fit_length.py data/fits/ballot-length.json
"""
import json
import math
import os
import sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(ROOT)


def rows(source):
    for line in open(os.path.join(ROOT, source, "calibration.jsonl"), encoding="utf-8"):
        d = json.loads(line)
        meta = json.load(open(os.path.join(REPO, d["file"])[: -len(".ballots")] + ".json", encoding="utf-8"))
        counts = {int(k): v for k, v in d["ballot_length"]["counts_by_length"].items()}
        yield {"name": d["election"], "file": os.path.basename(d["file"]), "candidates": d["candidates"],
               "seats": d["seats"], "counts": counts, "max_ranks": meta.get("max_ranks"),
               "min_ranks": meta.get("min_ranks_instructed")}


def length_probs(c, s, p):
    """Chance of each natural length 1..c (the last includes every longer draw).

    A share of voters rank every candidate: complete x exp(-fade x (candidates - 4)), so it
    shrinks as fields grow, as in Scotland (about 21% with 4 candidates, 3% with 13). The rest
    rank 1 plus a
    Conway-Maxwell-Poisson count: the chance of x extra ranks is proportional to
    rate^x / (x!)^bunching. With bunching 1 this is an ordinary Poisson count; above 1,
    lengths bunch more tightly around their typical value; below 1, they spread out more.
    The rate is scale x candidates^candidates_power x seats^seats_power."""
    scale, bc, bs, nu, complete0, fade = p
    complete = min(1.0, complete0 * math.exp(-fade * (c - 4)))
    rate = scale * c ** bc * s ** bs
    top = max(c + 60, int(3 * rate) + 60)
    logw = [x * math.log(rate) - nu * math.lgamma(x + 1) for x in range(top)]
    m = max(logw)
    w = [math.exp(v - m) for v in logw]
    total = sum(w)
    probs = [(1 - complete) * w[x] / total for x in range(c - 1)]
    probs.append(max(0.0, 1.0 - sum(probs)))
    return probs  # probs[l - 1] is the chance of length l


def loglik(elections, p, merge_last=False):
    """Average log likelihood per voter, each election counted equally. With merge_last,
    ranking all but one and ranking all count as one outcome (see main)."""
    total = 0.0
    for e in elections:
        n = sum(e["counts"].values())
        c = e["candidates"]
        probs = length_probs(c, e["seats"], p)
        if merge_last and c >= 2:
            probs = probs[:-2] + [0.0, probs[-2] + probs[-1]]
        for length, count in e["counts"].items():
            length = min(length, c)
            if merge_last and length == c - 1:
                length = c
            total += count / n * math.log(max(probs[length - 1], 1e-300))
    return total / len(elections)


def nelder_mead(f, x0, step, iters=600):
    """Minimizes f, starting from x0 (a small standard method; no outside libraries needed)."""
    pts = [list(x0)] + [[x + (step[i] if j == i else 0) for j, x in enumerate(x0)] for i in range(len(x0))]
    vals = [f(p) for p in pts]
    for _ in range(iters):
        order = sorted(range(len(pts)), key=lambda i: vals[i])
        pts, vals = [pts[i] for i in order], [vals[i] for i in order]
        centre = [sum(p[j] for p in pts[:-1]) / (len(pts) - 1) for j in range(len(x0))]
        refl = [c + (c - w) for c, w in zip(centre, pts[-1])]
        fr = f(refl)
        if fr < vals[0]:
            exp = [c + 2 * (c - w) for c, w in zip(centre, pts[-1])]
            fe = f(exp)
            pts[-1], vals[-1] = (exp, fe) if fe < fr else (refl, fr)
        elif fr < vals[-2]:
            pts[-1], vals[-1] = refl, fr
        else:
            con = [c + 0.5 * (w - c) for c, w in zip(centre, pts[-1])]
            fc = f(con)
            if fc < vals[-1]:
                pts[-1], vals[-1] = con, fc
            else:
                pts = [pts[0]] + [[b + 0.5 * (x - b) for b, x in zip(pts[0], p)] for p in pts[1:]]
                vals = [vals[0]] + [f(p) for p in pts[1:]]
    i = min(range(len(pts)), key=lambda i: vals[i])
    return pts[i], vals[i]


def fit(elections, merge_last=False):
    # Search on log scale for the positive numbers, so they stay positive. The share who rank
    # everyone is searched on the logit scale, so it stays between 0 and 1.
    unpack = lambda x: (math.exp(x[0]), x[1], x[2], math.exp(x[3]), 1 / (1 + math.exp(-x[4])), math.exp(x[5]))
    def f(x):
        return -loglik(elections, unpack(x), merge_last)
    best, _ = nelder_mead(f, [-0.5, 0.4, 0.3, 0.3, -1.5, -1.5], [0.5, 0.2, 0.2, 0.5, 1.0, 0.5], iters=1500)
    best, val = nelder_mead(f, best, [0.1, 0.05, 0.05, 0.2, 0.3, 0.2], iters=1500)
    return unpack(best), -val


def real_counts(e, merge_last):
    """An election's ballot-length counts; with merge_last, ranking all but one counts as all."""
    c = e["candidates"]
    out = defaultdict(int)
    for length, count in e["counts"].items():
        length = min(length, c)
        out[c if merge_last and length == c - 1 else length] += count
    return out


def compare(elections, p, merge_last=False):
    """Real and fitted ballot-length statistics, pooled with each election counted equally."""
    real = defaultdict(float)
    model = defaultdict(float)
    for e in elections:
        n = sum(e["counts"].values())
        c = e["candidates"]
        probs = length_probs(c, e["seats"], p)
        rc = real_counts(e, merge_last)
        rl = {l: rc.get(l, 0) / n for l in range(1, c + 1)}
        for name, dist in (("real", rl), ("model", {l: probs[l - 1] for l in range(1, c + 1)})):
            acc = real if name == "real" else model
            acc["mean"] += sum(l * x for l, x in dist.items())
            acc["share_1"] += dist[1]
            acc["share_2"] += dist.get(2, 0)
            acc["share_3"] += dist.get(3, 0)
            acc["share_4_to_5"] += dist.get(4, 0) + dist.get(5, 0)
            acc["share_complete"] += dist[c]
    m = len(elections)
    return {k: {"real": round(real[k] / m, 4), "model": round(model[k] / m, 4)} for k in real}


def by_size(elections, p, key, merge_last=False):
    """Typical number ranked, real against fitted, by number of candidates or seats."""
    bands = defaultdict(list)
    for e in elections:
        x = e[key]
        band = "1" if x <= 1 else "2 to 4" if x <= 4 else "5 to 8" if x <= 8 else "9 to 12" if x <= 12 else "13 or more"
        n = sum(e["counts"].values())
        probs = length_probs(e["candidates"], e["seats"], p)
        bands[band].append((sum(l * c for l, c in real_counts(e, merge_last).items()) / n, sum((l + 1) * q for l, q in enumerate(probs))))
    return {b: {"elections": len(v), "real_mean": round(sum(a for a, _ in v) / len(v), 2), "model_mean": round(sum(b for _, b in v) / len(v), 2)}
            for b, v in sorted(bands.items())}


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    public = list(rows("scotland"))
    org = [e for e in rows("preflib") if e["file"].startswith("ers-") and e["max_ranks"] is None]
    out = {"method": __doc__.strip().split("\n\n")[1], "fits": {}}
    params = {}
    # In the ERS files, ranking every candidate never appears: voters who ranked all but one
    # had the last place implied, so the files leave it out. Treat the two as one outcome.
    for name, els, merge in (("public", public, False), ("organization", org, True)):
        p, ll = fit(els, merge)
        params[name] = p
        out["fits"][name] = {
            "elections": len(els),
            "scale": round(p[0], 4), "candidates_power": round(p[1], 4), "seats_power": round(p[2], 4), "bunching": round(p[3], 4),
            "complete_share_at_4": round(p[4], 4), "complete_fade": round(p[5], 4),
            "projected_mean_75_candidates_46_seats": round(sum((l + 1) * q for l, q in enumerate(length_probs(75, 46, p))), 2),
            "mean_log_likelihood": round(ll, 4),
            "check": compare(els, p, merge),
            "by_candidates": by_size(els, p, "candidates", merge),
            "by_seats": by_size(els, p, "seats", merge),
        }
    # Pull toward a limit ("up to N"), using public voters' natural length.
    limited = [e for src in ("nyc", "portland", "preflib") for e in rows(src) if e["max_ranks"] and e["max_ranks"] < e["candidates"]]
    pulls = defaultdict(list)
    for e in limited:
        n_lim = e["max_ranks"]
        n = sum(e["counts"].values())
        probs = length_probs(e["candidates"], e["seats"], params["public"])
        natural = sum(probs[n_lim - 1:])
        filled = e["counts"].get(n_lim, 0) / n
        pulls[n_lim].append({"election": e["name"], "filled": round(filled, 4), "natural": round(natural, 4),
                             "pull": round((filled - natural) / (1 - natural), 4) if natural < 1 else None})
    out["pull_up_to"] = {}
    for n_lim, v in sorted(pulls.items()):
        ps = sorted(x["pull"] for x in v if x["pull"] is not None)
        out["pull_up_to"][str(n_lim)] = {"elections": len(v), "median_pull": round(ps[len(ps) // 2], 4),
                                         "median_filled": round(sorted(x["filled"] for x in v)[len(v) // 2], 4),
                                         "median_natural": round(sorted(x["natural"] for x in v)[len(v) // 2], 4)}
    every = sorted(x["pull"] for v in pulls.values() for x in v if x["pull"] is not None)
    out["pull_up_to_all"] = {"elections": len(every), "median_pull": round(every[len(every) // 2], 4),
                             "middle_half": [round(every[len(every) // 4], 4), round(every[3 * len(every) // 4], 4)]}
    # Pull toward an instruction ("at least N"): Canberra.
    act = []
    for e in rows("act"):
        n_min = e["min_ranks"]
        n = sum(e["counts"].values())
        probs = length_probs(e["candidates"], e["seats"], params["public"])
        natural = sum(probs[n_min - 1:])
        reached = sum(c for l, c in e["counts"].items() if l >= n_min) / n
        act.append({"election": e["name"], "reached": round(reached, 4), "natural": round(natural, 4),
                    "pull": round((reached - natural) / (1 - natural), 4)})
    ps = sorted(x["pull"] for x in act)
    out["pull_at_least"] = {"elections": act, "median_pull": ps[len(ps) // 2]}
    os.makedirs(os.path.dirname(os.path.abspath(sys.argv[1])), exist_ok=True)
    with open(sys.argv[1], "w", encoding="utf-8") as f:
        json.dump(out, f, indent=1, ensure_ascii=False)
        f.write("\n")
    print(json.dumps({k: {kk: vv for kk, vv in v.items() if kk not in ("check", "by_candidates", "by_seats")} for k, v in out["fits"].items()}, indent=1))
    for k, v in out["fits"].items():
        print(k, json.dumps(v["check"]))
        print(k, "by candidates", json.dumps(v["by_candidates"]))
        print(k, "by seats", json.dumps(v["by_seats"]))
    print("up to:", json.dumps(out["pull_up_to"]), json.dumps(out["pull_up_to_all"]))
    print("at least:", out["pull_at_least"]["median_pull"], [x["pull"] for x in act])


if __name__ == "__main__":
    main()
