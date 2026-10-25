"""Recount NYC Democratic mayoral primaries with every ballot cut after rank k.

For each cutoff rank k (1 to 5, NYC's ballot limit) this keeps only each
voter's first k choices and reruns the instant-runoff count. It records the
winner, the two finalists, the final-round margin, and how many ballots ran
out of candidates (exhausted) before the final round.

Resampling: the count is repeated on 1,000 resamples of the ballots (each
resample draws as many ballots as were cast, with replacement), to show how
much the results could move from chance alone.

Usage:
    python3 data/nyc/mayor_cuts.py [out_dir]

Standard library plus numpy. Seed fixed at 1.
"""

import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
CONTESTS = ["2025-dem-mayor-citywide", "2021-dem-mayor-citywide"]
MAX_RANK = 5
RESAMPLES = 1000
SEED = 1


def read_ballots(name):
    rankings, counts = [], []
    with open(os.path.join(HERE, "ballots", name + ".ballots")) as f:
        for line in f:
            if line.startswith("#") or not line.strip():
                continue
            parts = line.split()
            if parts[0] in ("candidates", "seats"):
                continue
            counts.append(int(parts[0]))
            r = [int(c) for c in parts[1:]][:MAX_RANK]
            rankings.append(r + [-1] * (MAX_RANK - len(r)))
    with open(os.path.join(HERE, "ballots", name + ".json")) as f:
        meta = json.load(f)
    return np.array(rankings), np.array(counts, dtype=np.int64), meta


def irv(ranks, weights, n_cand, k, write_in):
    """Instant runoff on rankings cut after rank k.

    ranks is a ballots-by-5 array of candidate numbers, padded with -1.
    Eliminates write-ins first, then the lowest candidate one at a time,
    until two remain. (NYC eliminates several hopeless candidates at once,
    which gives the same final round.) Returns the final-round tallies and
    the number of ballots exhausted by then.
    """
    cut = ranks[:, :k]
    alive = np.ones(n_cand + 1, dtype=bool)
    alive[n_cand] = False  # the padding slot, -1

    def tally():
        ok = alive[cut]
        has = ok.any(axis=1)
        first = cut[np.arange(len(cut)), ok.argmax(axis=1)]
        return np.bincount(first[has], weights=weights[has], minlength=n_cand + 1)[:n_cand].astype(np.int64)

    rounds = []
    if write_in is not None:
        rounds.append(tally())
        alive[write_in] = False
    while True:
        t = tally()
        rounds.append(t)
        live = np.flatnonzero(alive[:n_cand])
        if len(live) <= 2:
            break
        alive[min(live, key=lambda c: (t[c], -c))] = False
    final = rounds[-1]
    return final, int(weights.sum() - final.sum()), rounds


def summarize(final, exhausted, total, names):
    order = np.argsort(-final)
    w, r = int(order[0]), int(order[1])
    active = int(final.sum())
    return {
        "winner": names[w],
        "runner_up": names[r],
        "winner_votes": int(final[w]),
        "runner_up_votes": int(final[r]),
        "winner_share": 100 * final[w] / active,
        "margin_points": 100 * (final[w] - final[r]) / active,
        "margin_votes": int(final[w] - final[r]),
        "exhausted": exhausted,
        "exhausted_share": 100 * exhausted / total,
    }


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    os.makedirs(out_dir, exist_ok=True)
    rng = np.random.default_rng(SEED)
    for name in CONTESTS:
        rankings, counts, meta = read_ballots(name)
        names = meta["candidates"]
        n = len(names)
        write_in = n - 1 if names[-1].startswith("Write-in") else None
        total = int(counts.sum())
        result = {
            "contest": name,
            "election": meta["election"],
            "ballots_with_a_ranking": total,
            "blank_ballots": meta.get("blank_ballots"),
            "official_winners": [names[i] for i in meta.get("official_winners") or []],
            "seed": SEED,
            "resamples": RESAMPLES,
            "cutoffs": [],
        }
        full_final, full_exh, full_rounds = irv(rankings, counts, n, MAX_RANK, write_in)
        full = summarize(full_final, full_exh, total, names)
        result["full_ballots"] = full
        result["full_final_round"] = {names[i]: int(v) for i, v in enumerate(full_final) if v}
        boot = [rng.multinomial(total, counts / total) for _ in range(RESAMPLES)]
        for k in range(1, MAX_RANK + 1):
            final, exh, _ = irv(rankings, counts, n, k, write_in)
            row = summarize(final, exh, total, names)
            row["rank"] = k
            row["winner_changes"] = row["winner"] != full["winner"]
            flips, margins, exhs = 0, [], []
            for b in boot:
                bf, be, _ = irv(rankings, b, n, k, write_in)
                bs = summarize(bf, be, total, names)
                flips += bs["winner"] != full["winner"]
                margins.append(bs["margin_points"])
                exhs.append(bs["exhausted_share"])
            row["resample_winner_changes"] = flips
            row["resample_margin_points_p5_p95"] = [float(np.percentile(margins, 5)), float(np.percentile(margins, 95))]
            row["resample_exhausted_share_p5_p95"] = [float(np.percentile(exhs, 5)), float(np.percentile(exhs, 95))]
            result["cutoffs"].append(row)
            print(name, k, row["winner"], round(row["margin_points"], 2), row["exhausted"], flips, file=sys.stderr)
        with open(os.path.join(out_dir, name + ".json"), "w") as f:
            json.dump(result, f, indent=2, default=float)


if __name__ == "__main__":
    main()
