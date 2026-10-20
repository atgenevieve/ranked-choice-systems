"""Checks the voter model (docs/model-spec.md, version 0.2) against real elections.

For each type of election (public or organization members; 1 seat, 2 to 4 seats, or 5 or
more), it takes a sample of real elections and simulates a twin of each one, with the same
number of candidates, seats, and voters, the same ballot rules, and the same type of
electorate. Write-in slots on US ballots aren't counted as candidates. Scottish wards and
Canberra are simulated with their own party structure and tight slates (see STRUCTURE);
every other election with the model's default slates, loose.

The simulated twins are written by the engine (`stvsim generate`) in the same format as the
real ballots and measured by the same code (data/calibration.py). For each type of election,
the script compares the typical (median) value of each statistic in real and simulated
elections:

- top candidate's first choices as a multiple of the quota, 1 / (seats + 1);
- top and last candidates' first choices as multiples of an even split, 1 / candidates;
- ballot length: the average, and the share who rank every candidate;
- the share who rank exactly the limit, where the ballot has one;
- clustering: among voters whose first choice has a running mate (another candidate of the
  same party or slate), the share who rank one second, minus what popularity alone predicts;
- evenness: how evenly votes that leave a party or slate spread over the others (1 = evenly);
- candidates with a running mate, their slate's only candidate, or in no slate.

In union and society (ERS) files, ranking every candidate never appears: voters who ranked
all but one had the last place implied, so the files leave it out. For organization
elections, both real and simulated ballot lengths count all but one as all.

Usage (from the repository root, with the engine built and calibration.py run for every source):
    python3 -I data/model_check.py OUT.json [--sample N] [--cells "NAME|NAME"] [--set CELL:key=value ...]

`--set` overrides a model setting for one type of election, or for all with `*`, such as
`--set "*:slate_strength=5"` or `--set "Public, 2 to 4 seats:popularity_spread=0.8"`.
"""
import argparse
import hashlib
import json
import os
import random
import statistics
import subprocess
import sys
import tempfile
from concurrent.futures import ProcessPoolExecutor

ROOT = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(ROOT)
sys.path.insert(0, ROOT)
import calibration  # noqa: E402  (this project's own script)

ENGINE = os.path.join(REPO, "engine", "target", "release", "stvsim")
NO_PARTY = calibration.NO_PARTY
VOTER_CAP = 5000  # simulate at most this many voters per election, to keep runs quick

# Slate structure for twins of real elections whose parties differ from the model's defaults
# (4 slates, each sized to its expected seats), which are built for the owner's organization.
# These test the model's behavior on the structure the real elections had.
STRUCTURE = {
    # Scottish parties are tight.
    "scotland": {"slate_strength": "tight"},
    # Canberra's parties each run a full list of up to 5 candidates, and are tight.
    "act": {"slates": 7, "slate_candidates": "same_as_voters", "unaffiliated_share": 0.05, "slate_strength": "tight"},
}

CELLS = [
    ("Public, 1 seat", "public", lambda src, g, s: g in ("scotland", "public", "nyc", "portland", "act") and s == 1),
    ("Public, 2 to 4 seats", "public", lambda src, g, s: g in ("scotland", "public", "portland", "act") and 2 <= s <= 4),
    ("Public, 5 or more seats", "public", lambda src, g, s: g in ("scotland", "public", "portland", "act") and s >= 5),
    ("Organization, 1 seat", "organization", lambda src, g, s: g in ("ers", "org") and s == 1),
    ("Organization, 2 to 4 seats", "organization", lambda src, g, s: g in ("ers", "org") and 2 <= s <= 4),
    ("Organization, 5 or more seats", "organization", lambda src, g, s: g in ("ers", "org") and s >= 5),
]


def group_of(src, file):
    name = os.path.basename(file)
    if src == "preflib":
        if name.startswith("ers-"):
            return "ers"
        if name.startswith(("debian-", "apa-", "uklabor-")):
            return "org"
        if name.startswith("glasgow-"):
            return None  # already in the Scottish data
        return "public"
    return src


def real_elections():
    for src in ["scotland", "preflib", "nyc", "portland", "act"]:
        for line in open(os.path.join(ROOT, src, "calibration.jsonl"), encoding="utf-8"):
            d = json.loads(line)
            g = group_of(src, d["file"])
            if g is None:
                continue
            meta = json.load(open(os.path.join(REPO, d["file"])[: -len(".ballots")] + ".json", encoding="utf-8"))
            yield src, g, d, meta


def write_in(meta, k):
    names = meta.get("candidates") or []
    return k < len(names) and "write" in str(names[k]).lower()


def stats(res, meta, merge_last):
    """The compared statistics for one election (real or simulated)."""
    c_all = res["candidates"]
    seats = res["seats"]
    keep = [k for k in range(c_all) if not write_in(meta, k)]
    c = len(keep)
    shares = sorted((res["first_choice"]["shares_by_candidate"][k] for k in keep), reverse=True)
    bl = res["ballot_length"]
    # Ranking everyone means every real candidate: a US ballot's write-in slot doesn't count.
    full = c - 1 if merge_last else c
    counts = {}
    for k, v in bl["counts_by_length"].items():
        length = int(k)
        if merge_last and length == c_all - 1:
            length = c_all
        counts[length] = counts.get(length, 0) + v
    n = sum(counts.values())
    out = {
        "quota": shares[0] * (seats + 1),
        "even_top": shares[0] * c,
        "even_last": shares[-1] * c,
        "length_mean": sum(l * v for l, v in counts.items()) / n,
        "complete": sum(v for l, v in counts.items() if l >= full) / n,
    }
    lim = meta.get("max_ranks")
    if lim and lim < c_all:
        out["fills_limit"] = counts.get(lim, 0) / n
    sc = res.get("slate_cohesion") or {}
    if sc.get("cohesion") is not None and sc.get("popularity_baseline") is not None:
        out["clustering"] = sc["cohesion"] - sc["popularity_baseline"]
    ev = (res.get("transfer_spread") or {}).get("cross_party_evenness_weighted_mean")
    if ev is not None:
        out["evenness"] = ev
    parties = res.get("parties") or meta.get("parties")
    if parties and any(p not in NO_PARTY for p in parties):
        labels = [None if p in NO_PARTY else p for k, p in enumerate(parties) if k in keep]
        size = {}
        for p in labels:
            if p is not None:
                size[p] = size.get(p, 0) + 1
        out["running_mate"] = sum(1 for p in labels if p is not None and size[p] >= 2) / c
        out["only_candidate"] = sum(1 for p in labels if p is not None and size[p] == 1) / c
        out["no_slate"] = sum(1 for p in labels if p is None) / c
    return out


def settings_toml(name, seed, c, seats, voters, electorate, meta, model):
    lines = ["[run]", f'name = "{name}"', f"seed = {seed}", "sims = 1", "threads = 1", "",
             "[election]", f"candidates = {c}", f"seats = [{seats}]", f"voters = {voters}", f"ranks = {c}", "",
             "[electorate]", f'type = "{electorate}"', "", "[ballot]"]
    if meta.get("max_ranks") and meta["max_ranks"] < c:
        lines += ['wording = "up_to"', f"n = {meta['max_ranks']}"]
    elif meta.get("min_ranks_instructed"):
        lines += ['wording = "at_least"', f"n = {meta['min_ranks_instructed']}"]
    lines += ["", "[model]"]
    for k, v in model.items():
        lines.append(f'{k} = "{v}"' if isinstance(v, str) else f"{k} = {v}")
    return "\n".join(lines) + "\n"


def simulate_one(job):
    """Simulates one twin and returns its statistics."""
    name, seed, c, seats, voters, electorate, meta, model, merge_last, folder = job
    path = os.path.join(folder, name + ".toml")
    with open(path, "w", encoding="utf-8") as f:
        f.write(settings_toml(name, seed, c, seats, voters, electorate, meta, model))
    subprocess.run([ENGINE, "generate", path, folder], check=True)
    ballots = os.path.join(folder, f"{name}-c{c}-s{seats}-0000.ballots")
    res = calibration.analyze(ballots)
    sim_meta = json.load(open(ballots[: -len(".ballots")] + ".json", encoding="utf-8"))
    sim_meta["max_ranks"] = meta.get("max_ranks") if meta.get("max_ranks") and meta["max_ranks"] < c else None
    for ext in (".ballots", ".json", ".toml"):
        os.remove(ballots[: -len(".ballots")] + ext if ext != ".toml" else path)
    return stats(res, sim_meta, merge_last)


def median(values):
    v = sorted(x for x in values if x is not None)
    return v[len(v) // 2] if v else None


def summarize(per_election):
    keys = sorted({k for s in per_election for k in s})
    return {k: median([s.get(k) for s in per_election]) for k in keys}


def run(sample, cell_names, overrides, seed=11):
    elections = list(real_elections())
    rng = random.Random(seed)
    out = []
    with tempfile.TemporaryDirectory() as folder, ProcessPoolExecutor(os.cpu_count()) as pool:
        for name, electorate, test in CELLS:
            if cell_names and name not in cell_names:
                continue
            chosen = [e for e in elections if test(e[0], e[1], e[2]["seats"])]
            if len(chosen) > sample:
                chosen = rng.sample(chosen, sample)
            merge = electorate == "organization"
            real, jobs = [], []
            for i, (src, g, d, meta) in enumerate(chosen):
                real.append(stats(d, meta, merge))
                c = sum(1 for k in range(d["candidates"]) if not write_in(meta, k))
                model = {"slate_strength": "loose"}
                model.update(STRUCTURE.get(src, {}))
                model.update(overrides.get("*", {}))
                model.update(overrides.get(name, {}))
                job_seed = int(hashlib.sha256(d["file"].encode()).hexdigest()[:12], 16)
                jobs.append((f"twin{len(out)}x{i}", job_seed, c, d["seats"], min(d["voters"], VOTER_CAP), electorate, meta, model, merge, folder))
            sim = list(pool.map(simulate_one, jobs))
            out.append({"cell": name, "electorate": electorate, "elections": len(chosen),
                        "overrides": {k: v for k, v in jobs[0][7].items() if k != "slate_strength"} if jobs else {},
                        "real": summarize(real), "simulated": summarize(sim)})
    return out


def tune_popularity(sample, cells):
    """For each type of election, tries a grid of popularity spreads and long-shot shares and
    keeps the one closest to the real elections: mainly the top candidate's first choices
    against the quota, then the last candidate's against an even split."""
    import math
    best = []
    for name, _, _ in CELLS:
        if cells and name not in cells:
            continue
        scored = []
        for spread in (0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2):
            for share in (0.0, 0.05, 0.1, 0.15, 0.2, 0.3):
                r = run(sample, [name], {name: {"popularity_spread": spread, "long_shot_share": share}})[0]
                q = math.log(r["simulated"]["quota"] / r["real"]["quota"])
                l = math.log(r["simulated"]["even_last"] / r["real"]["even_last"])
                scored.append((q * q + 0.5 * l * l, spread, share, r))
        score, spread, share, r = min(scored, key=lambda x: x[0])
        print(f"{name}: spread {spread}, long shots {share}; quota real {r['real']['quota']:.3f} model {r['simulated']['quota']:.3f}; "
              f"last real {r['real']['even_last']:.3f} model {r['simulated']['even_last']:.3f}", flush=True)
        best.append({"cell": name, "popularity_spread": spread, "long_shot_share": share, "score": round(score, 5),
                     "real": r["real"], "simulated": r["simulated"]})
    return best


def curves(sample):
    """What the slate settings produce, in the units the tuner shows them in, measured on twins
    of Scottish multi-seat wards (the elections with real values for both): clustering above
    popularity for each slate strength, and evenness of votes leaving a slate for each spread."""
    cell = "Public, 2 to 4 seats"
    out = {"cell": cell, "strength": [], "spread": []}
    for st in (1, 1.5, 2, 3, 4, 6, 8, 12, 20, 30, 50, 80, 100, 150, 200):
        r = run(sample, [cell], {cell: {"slate_strength": st}})[0]
        out["strength"].append({"setting": st, "clustering": r["simulated"].get("clustering"), "evenness": r["simulated"].get("evenness")})
        print("strength", st, out["strength"][-1], flush=True)
    for sp in (0, 0.3, 0.6, 0.9, 1.2, 1.5, 2.0, 2.5, 3.0):
        r = run(sample, [cell], {cell: {"other_slate_spread": sp}})[0]
        out["spread"].append({"setting": sp, "evenness": r["simulated"].get("evenness"), "clustering": r["simulated"].get("clustering")})
        print("spread", sp, out["spread"][-1], flush=True)
    out["real"] = r["real"]
    return out


def table(results):
    names = {"quota": "Top candidate vs quota", "even_top": "Top candidate vs even split", "even_last": "Last candidate vs even split",
             "length_mean": "Average ballot length", "complete": "Share ranking everyone", "fills_limit": "Share filling the limit",
             "clustering": "Clustering above popularity", "evenness": "Evenness of votes leaving a slate",
             "running_mate": "Candidates with a running mate", "only_candidate": "Slate's only candidate", "no_slate": "Candidates in no slate"}
    lines = []
    for r in results:
        lines.append(f"\n{r['cell']} ({r['elections']} elections)")
        for k, label in names.items():
            a, b = r["real"].get(k), r["simulated"].get(k)
            if a is None and b is None:
                continue
            fa = "-" if a is None else f"{a:.3f}"
            fb = "-" if b is None else f"{b:.3f}"
            lines.append(f"  {label:36} real {fa:>7}   model {fb:>7}")
    return "\n".join(lines) + "\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("output")
    ap.add_argument("--sample", type=int, default=80)
    ap.add_argument("--cells", default="")
    ap.add_argument("--set", action="append", default=[])
    ap.add_argument("--tune-popularity", action="store_true", help="search popularity settings for each type of election")
    ap.add_argument("--curves", action="store_true", help="measure what the slate settings produce, for the tuner's sliders")
    args = ap.parse_args()
    if args.curves:
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump({"sample": args.sample, **curves(args.sample)}, f, indent=1)
            f.write("\n")
        return
    if args.tune_popularity:
        cells = [c for c in args.cells.split("|") if c] if args.cells else None
        best = tune_popularity(args.sample, cells)
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump({"sample": args.sample, "tuned": best}, f, indent=1)
            f.write("\n")
        return
    overrides = {}
    for s in args.set:
        cell, kv = s.split(":", 1) if ":" in s else ("*", s)
        k, v = kv.split("=", 1)
        try:
            v = float(v)
        except ValueError:
            pass
        overrides.setdefault(cell, {})[k] = v
    cells = [c for c in args.cells.split("|") if c] if args.cells else None
    results = run(args.sample, cells, overrides)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump({"sample": args.sample, "overrides": overrides, "cells": results}, f, indent=1)
        f.write("\n")
    sys.stdout.write(table(results))


if __name__ == "__main__":
    main()
