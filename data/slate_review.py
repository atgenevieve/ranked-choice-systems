"""Builds the slate review table: candidate groupings the owner marks as
meaningful (or not) before any are used to tune the model.

For every election with slates in its metadata, this lists:
- each slate with 2 or more members (endorsement, campaign, or media), and
- pairs of candidates whose voters rank each other second unusually often,
  found directly from the ballots, whether or not any slate names them.

For each grouping it reports how often a voter whose first choice is in the
grouping ranks another member second, next to two comparisons: random
second choices, and second choices that follow popularity (first-choice
shares) alone. These are associations, not effects: a pairing can come from
shared politics, from the endorsement itself, or from endorsers following
voters. See docs/model-review.md.

Usage (from the repository root):
    python3 -I data/slate_review.py data/slate-review.json
"""
import glob
import json
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SOURCES = ["nyc", "portland", "preflib"]

# A pair found in the ballots is listed when enough voters back it and it
# clearly beats popularity alone.
MIN_VOTERS = 100
MIN_VOTER_SHARE = 0.01
MIN_EXCESS = 0.10
FOUND_PER_ELECTION = 5


def read_ballots(path):
    nc = ns = None
    ballots = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            parts = line.split()
            if not parts or parts[0].startswith("#"):
                continue
            if parts[0] == "candidates":
                nc = int(parts[1])
            elif parts[0] == "seats":
                ns = int(parts[1])
            else:
                ballots.append((int(parts[0]), [int(x) for x in parts[1:]]))
    return nc, ns, ballots


def measure(members, ballots, shares, nc):
    members = set(members)
    voters = same = 0
    pop = 0.0
    for w, b in ballots:
        if b[0] in members and len(b) >= 2:
            voters += w
            rest = 1 - shares[b[0]]
            if rest > 0:
                pop += w * sum(shares[m] for m in members if m != b[0]) / rest
            if b[1] in members:
                same += w
    if not voters:
        return None
    return {
        "voters": voters,
        "observed": round(same / voters, 4),
        "random": round((len(members) - 1) / (nc - 1), 4),
        "popularity": round(pop / voters, 4),
    }


def review(path):
    meta = json.load(open(path[: -len(".ballots")] + ".json", encoding="utf-8"))
    slates = [s for s in meta.get("slates") or [] if len(set(s["members"])) >= 2]
    if not slates:
        return None
    nc, ns, ballots = read_ballots(path)
    total = sum(w for w, _ in ballots)
    fp = [0] * nc
    for w, b in ballots:
        fp[b[0]] += w
    shares = [x / total for x in fp]
    names = meta["candidates"]
    groups = []
    for i, s in enumerate(slates):
        m = measure(s["members"], ballots, shares, nc)
        if m is None:
            continue
        kind = "media" if "(media)" in s["name"] else s.get("kind", "endorsement")
        groups.append({
            "id": f"slate-{i}",
            "kind": kind,
            "name": s["name"],
            "members": [names[c] for c in s["members"]],
            "source": s.get("source"),
            "date": s.get("date"),
            "note": s.get("note"),
            **m,
        })
    # Pairs found in the ballots. Pair counts come from one pass: for each
    # ordered (first, second), how many voters ranked them 1 and 2.
    pair = {}
    ranked2 = [0] * nc
    for w, b in ballots:
        if len(b) >= 2:
            ranked2[b[0]] += w
            k = (b[0], b[1])
            pair[k] = pair.get(k, 0) + w
    min_voters = max(MIN_VOTERS, MIN_VOTER_SHARE * total)
    slate_sets = [set(s["members"]) for s in slates]
    found = []
    for a in range(nc):
        for b in range(a + 1, nc):
            voters = ranked2[a] + ranked2[b]
            if voters < min_voters or "write-in" in (names[a] + names[b]).lower():
                continue
            same = pair.get((a, b), 0) + pair.get((b, a), 0)
            pop = 0.0
            for x, y in ((a, b), (b, a)):
                if shares[x] < 1:
                    pop += ranked2[x] * shares[y] / (1 - shares[x])
            obs, pop = same / voters, pop / voters
            if obs - pop < MIN_EXCESS:
                continue
            found.append({
                "kind": "found-in-ballots",
                "name": f"{names[a]} and {names[b]}",
                "members": [names[a], names[b]],
                "in_slates": [s["name"] for s, ss in zip(slates, slate_sets) if {a, b} <= ss],
                "voters": voters,
                "observed": round(obs, 4),
                "random": round(1 / (nc - 1), 4),
                "popularity": round(pop, 4),
            })
    found.sort(key=lambda g: g["observed"] - g["popularity"], reverse=True)
    for i, g in enumerate(found[:FOUND_PER_ELECTION]):
        groups.append({"id": f"found-{i}", **g})
    return {
        "election": meta.get("election"),
        "file": os.path.relpath(path, os.path.dirname(ROOT)),
        "source": meta.get("source"),
        "date": meta.get("date"),
        "candidates": nc,
        "seats": ns,
        "voters": total,
        "groupings": groups,
    }


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    out = []
    for src in SOURCES:
        for path in sorted(glob.glob(os.path.join(ROOT, src, "ballots", "*.ballots"))):
            r = review(path)
            if r:
                out.append(r)
    with open(sys.argv[1], "w", encoding="utf-8") as f:
        json.dump({
            "about": "Candidate groupings for the owner to mark. Built by data/slate_review.py.",
            "thresholds": {"min_voters": MIN_VOTERS, "min_voter_share": MIN_VOTER_SHARE,
                           "min_excess_over_popularity": MIN_EXCESS},
            "elections": out,
        }, f, indent=1, ensure_ascii=False)
    n = sum(len(e["groupings"]) for e in out)
    print(f"{len(out)} elections, {n} groupings written to {sys.argv[1]}")


if __name__ == "__main__":
    main()
