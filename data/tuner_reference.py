"""Builds the real-election reference for the model tuner (tuner/reference.json).

For each type of election (data/model_check.py's CELLS), it takes a fixed sample of real
elections and records, for each, what the tuner needs to simulate its twin: candidates (not
counting write-in slots), seats, voters (at most 3,000, to keep the page quick), the ballot's
rule, and a seed. It also records the real elections' typical (median) statistics, measured
by data/model_check.py, and their average ballot-length distribution.

Usage (from the repository root, after calibration.py has run for every source):
    python3 -I data/tuner_reference.py tuner/reference.json
"""
import hashlib
import json
import os
import random
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)
import model_check  # noqa: E402  (this project's own script)

SAMPLE = 80
VOTER_CAP = 3000
LENGTHS = 15  # ballot-length shares for 1 to 15 ranks, then 16 or more


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    elections = list(model_check.real_elections())
    rng = random.Random(11)
    out = {"made_by": "data/tuner_reference.py", "cells": []}
    for name, electorate, test in model_check.CELLS:
        chosen = [e for e in elections if test(e[0], e[1], e[2]["seats"])]
        if len(chosen) > SAMPLE:
            chosen = rng.sample(chosen, SAMPLE)
        merge = electorate == "organization"
        real, twins = [], []
        dist = [0.0] * (LENGTHS + 1)
        sources = {}
        for src, g, d, meta in chosen:
            st = model_check.stats(d, meta, merge)
            real.append(st)
            c = sum(1 for k in range(d["candidates"]) if not model_check.write_in(meta, k))
            twin = {"c": c, "s": d["seats"], "v": min(d["voters"], VOTER_CAP),
                    "seed": int(hashlib.sha256(d["file"].encode()).hexdigest()[:12], 16), "name": d["election"]}
            if meta.get("max_ranks") and meta["max_ranks"] < c:
                twin.update(wording="up_to", n=meta["max_ranks"])
            elif meta.get("min_ranks_instructed"):
                twin.update(wording="at_least", n=meta["min_ranks_instructed"])
            twins.append(twin)
            sources[g] = sources.get(g, 0) + 1
            # Average ballot-length distribution, each election counted equally.
            counts = {}
            for k, v in d["ballot_length"]["counts_by_length"].items():
                length = min(int(k), c)
                if merge and length == d["candidates"] - 1:
                    length = c
                counts[length] = counts.get(length, 0) + v
            n = sum(counts.values())
            for length, v in counts.items():
                dist[min(length, LENGTHS + 1) - 1] += v / n / len(chosen)
        out["cells"].append({
            "cell": name, "electorate": electorate, "merge_last": merge, "elections": len(chosen),
            "sources": sources, "real": model_check.summarize(real),
            "length_shares": [round(x, 4) for x in dist], "twins": twins,
        })
    with open(sys.argv[1], "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(sys.argv[1], os.path.getsize(sys.argv[1]), "bytes")


if __name__ == "__main__":
    main()
