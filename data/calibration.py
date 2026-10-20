#!/usr/bin/env python3
"""Compute calibration statistics for real (or simulated) elections.

Calibration statistics describe an election in a way you can compare
between real and simulated elections. This script computes statistics
1 to 4 from the "Calibration statistics" section of docs/model-spec.md.
Statistic 5 (exhaustion) needs a full count, so the engine computes it.

Usage:

    python3 -I data/calibration.py OUTPUT.jsonl INPUT [INPUT ...]
        [--group-by FIELD] [--title TEXT]
    python3 -I data/calibration.py --lognormal-reference N

Each INPUT is a .ballots file or a folder of them. Each .ballots file
needs a matching .json metadata file (see docs/ballot-format.md).

Writes one JSON object per election to OUTPUT.jsonl, and prints a
summary table in Markdown to standard output: the median and the 10th
to 90th percentile range across elections for each statistic.
--group-by adds one column per value of a metadata field, such as year.

Standard library only.
"""

import argparse
import glob
import json
import math
import os
import sys
from collections import Counter, defaultdict

# Party labels that mean "no party". Candidates with these labels are
# each treated as their own one-person group, because two independents
# in the same ward are not a slate.
NO_PARTY = {None, "", "Ind", "Independent", "None", "Non-partisan"}

# Labels that name the same party. Labour and Co-operative candidates
# stand for the Labour Party in Scotland, so a voter moving between
# them stays within one slate.
PARTY_ALIASES = {"LabCo": "Lab"}


# ---------------------------------------------------------------------------
# Reading


def read_ballots(path):
    """Return (candidates, seats, [(count, [ranking])])."""
    nc = ns = None
    ballots = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split()
            if parts[0] == "candidates":
                nc = int(parts[1])
            elif parts[0] == "seats":
                ns = int(parts[1])
            else:
                ballots.append((int(parts[0]), [int(x) for x in parts[1:]]))
    if nc is None or ns is None:
        raise ValueError(f"{path}: missing 'candidates' or 'seats' line")
    return nc, ns, ballots


def find_inputs(inputs):
    files = []
    for p in inputs:
        if os.path.isdir(p):
            files += sorted(glob.glob(os.path.join(p, "*.ballots")))
        else:
            files.append(p)
    return files


# ---------------------------------------------------------------------------
# Small helpers


def quantile(xs, q):
    """Linear-interpolation quantile of a list of numbers (q from 0 to 1)."""
    xs = sorted(xs)
    if not xs:
        return None
    pos = q * (len(xs) - 1)
    lo = int(math.floor(pos))
    hi = min(lo + 1, len(xs) - 1)
    return xs[lo] + (xs[hi] - xs[lo]) * (pos - lo)


def weighted_median(pairs):
    """Median of values given as (value, weight) pairs."""
    pairs = sorted(pairs)
    total = sum(w for _, w in pairs)
    run = 0
    for v, w in pairs:
        run += w
        if run >= total / 2:
            return v
    return None


def entropy(counts):
    total = sum(counts)
    return -sum(c / total * math.log(c / total) for c in counts if c > 0)


def r(x, nd=4):
    return None if x is None else round(x, nd)


# ---------------------------------------------------------------------------
# Statistic 1: first-choice concentration


def first_choice_stats(nc, ballots):
    fp = [0] * nc
    for w, b in ballots:
        fp[b[0]] += w
    total = sum(fp)
    shares = sorted((x / total for x in fp), reverse=True)

    # Share of first choices going to the top 10% of candidates. With
    # fewer than 10 candidates, 10% is a fraction of one candidate, so
    # the top candidate's share is counted in proportion: with 7
    # candidates, the top 10% is 0.7 candidates, so this is 0.7 times
    # the top share. This keeps the statistic comparable across field
    # sizes. (Expect it to track the top share closely in small fields.)
    k = 0.1 * nc
    full = int(math.floor(k))
    top10 = sum(shares[:full]) + (k - full) * (shares[full] if full < nc else 0)

    # Lognormal spread fit. The model gives each candidate a popularity
    # drawn from a lognormal distribution: log(popularity) is a bell
    # curve whose width is the "spread" setting (sigma). Ignoring slates,
    # a candidate's chance of being someone's first choice is their
    # popularity divided by the total, so log(first-choice share) equals
    # log(popularity) minus a constant that is the same for every
    # candidate. The spread of log(popularity) can therefore be estimated
    # as the standard deviation of log(first-choice share) across the
    # candidates in the ward (using n - 1, the usual sample formula).
    # Cautions: with 5 to 10 candidates the estimate is rough; slates
    # also shape first choices, which this ignores; a candidate with no
    # first choices would have log(0), so zero shares are skipped and
    # counted in "zero_first_choice_candidates". The standard deviation of
    # a handful of draws runs slightly low: for 7 candidates drawn with a
    # true spread of 1.0, the typical estimate is about 0.94.
    logs = [math.log(s) for s in shares if s > 0]
    if len(logs) >= 2:
        mean = sum(logs) / len(logs)
        sigma = math.sqrt(sum((x - mean) ** 2 for x in logs) / (len(logs) - 1))
    else:
        sigma = None
    # Shape check. A lognormal is symmetric on the log scale, so the gap
    # from the top candidate to the median candidate (in log terms) should
    # be about the same as the gap from the median to the bottom. These
    # two numbers show whether real fields have that shape.
    pos = [s for s in shares if s > 0]
    med = quantile(pos, 0.5)
    gap_top = math.log(pos[0] / med) if len(pos) >= 2 else None
    gap_bottom = math.log(med / pos[-1]) if len(pos) >= 2 else None
    return {
        "shares_by_candidate": [r(x / total, 6) for x in fp],
        "top10pct_share": r(top10),
        "log_gap_top_to_median": r(gap_top),
        "log_gap_median_to_bottom": r(gap_bottom),
        "top_share": r(shares[0]),
        "top_to_median_ratio": r(shares[0] / quantile(shares, 0.5)) if quantile(shares, 0.5) else None,
        "lognormal_spread": r(sigma),
        "zero_first_choice_candidates": sum(1 for s in shares if s == 0),
        "shares_sorted": [r(s) for s in shares],
    }


# ---------------------------------------------------------------------------
# Statistic 2: ballot length


def length_stats(nc, ballots, seats):
    counts = Counter()
    for w, b in ballots:
        counts[len(b)] += w
    total = sum(counts.values())
    dist = [counts.get(k, 0) / total for k in range(1, nc + 1)]
    mean = sum(k * counts[k] for k in counts) / total
    # Listed-order check: among ballots ranking 4 or more, the share whose
    # ranks run in the order the candidates are numbered (0, then a higher
    # number, then higher still). If candidate numbers follow the order on
    # the ballot paper, as in the Scottish data (alphabetical by surname),
    # this hints at voters numbering down the paper. A random order of k
    # candidates is increasing with chance 1/k!, given for comparison.
    long_n = sum(w for w, b in ballots if len(b) >= 4)
    in_order = sum(w for w, b in ballots
                   if len(b) >= 4 and all(b[i] < b[i + 1] for i in range(len(b) - 1)))
    chance = sum(w / math.factorial(len(b)) for w, b in ballots if len(b) >= 4)
    return {
        "share_4plus_in_listed_order": r(in_order / long_n) if long_n else None,
        "share_4plus_in_listed_order_by_chance": r(chance / long_n) if long_n else None,
        "share_by_length": [r(x) for x in dist],
        "mean": r(mean, 3),
        "median": weighted_median(list(counts.items())),
        "mean_as_share_of_candidates": r(mean / nc),
        "share_length_1": r(dist[0]),
        "share_length_equals_seats": r(dist[seats - 1]) if seats <= nc else None,
        "share_complete": r(dist[-1]),
        # Ranking all but one candidate is as informative as ranking all.
        "share_complete_or_all_but_one": r(dist[-1] + (dist[-2] if nc >= 2 else 0)),
        "counts_by_length": {str(k): counts[k] for k in sorted(counts)},
    }


# ---------------------------------------------------------------------------
# Statistic 3: slate cohesion


def first_shares(nc, ballots):
    fp = [0] * nc
    for w, b in ballots:
        fp[b[0]] += w
    total = sum(fp)
    return [x / total for x in fp]


def popularity_baseline(shares, first, members):
    """Chance a voter whose first choice is `first` ranks a member of `members`
    second, if second choices followed popularity alone (first-choice shares)
    and ignored slates. This is what the model produces with no slates, so
    cohesion above it is what slate settings have to explain."""
    rest = 1 - shares[first]
    if rest <= 0:
        return 0.0
    return sum(shares[m] for m in members if m != first) / rest


def group_labels(parties):
    """Turn party labels into group ids; no-party candidates get their own."""
    out = []
    for i, p in enumerate(parties):
        p = PARTY_ALIASES.get(p, p)
        out.append(f"__solo{i}" if p in NO_PARTY else p)
    return out


def cohesion_stats(nc, ballots, parties):
    if parties is None or all(p is None for p in parties):
        return None
    groups = group_labels(parties)
    size = Counter(groups)
    # Only parties with 2 or more candidates in the ward can be cohesive:
    # a voter whose first choice is a party's only candidate has no
    # same-party candidate to rank second.
    multi = {g for g, n in size.items() if n >= 2 and not g.startswith("__solo")}
    shares = first_shares(nc, ballots)
    members_of = defaultdict(list)
    for i, g in enumerate(groups):
        members_of[g].append(i)
    pop_base = 0.0
    per = defaultdict(lambda: [0, 0, 0])  # [first-choice voters, ranked 2+, second same]
    party_only = 0
    # Pooled flows: first-choice party -> second-choice party (or "(none)"
    # when the voter ranked only one), with aliases merged and every
    # independent shown as "Ind".
    labels = [PARTY_ALIASES.get(p, p) if p not in NO_PARTY else "Ind" for p in parties]
    flows = defaultdict(Counter)
    for w, b in ballots:
        flows[labels[b[0]]][labels[b[1]] if len(b) >= 2 else "(none)"] += w
        g = groups[b[0]]
        if g not in multi:
            continue
        # Voters who ranked exactly their party's candidates and stopped.
        if len(b) == size[g] and all(groups[c] == g for c in b):
            party_only += w
        per[g][0] += w
        if len(b) >= 2:
            per[g][1] += w
            pop_base += w * popularity_baseline(shares, b[0], members_of[g])
            if groups[b[1]] == g:
                per[g][2] += w
    total_first = sum(w for w, _ in ballots)
    eligible = sum(v[1] for v in per.values())
    same = sum(v[2] for v in per.values())
    # Baseline: the share you'd see if second choices ignored party and
    # went to a random remaining candidate. For party X with n_X
    # candidates, that's (n_X - 1) / (candidates - 1). Weighted by the
    # same voters, so cohesion can be compared with it.
    base = sum(v[1] * (size[g] - 1) / (nc - 1) for g, v in per.items()) if nc > 1 else 0
    return {
        "cohesion": r(same / eligible) if eligible else None,
        "random_baseline": r(base / eligible) if eligible else None,
        "popularity_baseline": r(pop_base / eligible) if eligible else None,
        "voters_considered": eligible,
        "share_of_voters_first_choice_in_multi_candidate_party":
            r(sum(v[0] for v in per.values()) / total_first) if total_first else None,
        "multi_candidate_parties": len(multi),
        # Among voters whose first choice has running mates: the share who
        # ranked exactly that party's candidates and nothing else.
        "share_party_only_ballots":
            r(party_only / sum(v[0] for v in per.values())) if per else None,
        "second_choice_party_counts": {k: dict(v) for k, v in sorted(flows.items())},
        "by_party": {g: {"candidates": size[g],
                         "first_choice_voters": v[0],
                         "ranked_2_plus": v[1],
                         "cohesion": r(v[2] / v[1]) if v[1] else None}
                     for g, v in sorted(per.items())},
    }


def slate_stats(nc, ballots, slates):
    """Cohesion for endorsement and campaign slates (`slates` in the metadata).

    Slates can overlap, so each slate is measured on its own: among voters
    whose first choice is on the slate and who ranked 2 or more, the share
    whose second choice is also on the slate. The baseline is the share
    you'd see if second choices ignored the slate: (members - 1) / (candidates - 1).
    Only slates with 2 or more members can be cohesive. The election-level
    summary pools every non-media slate, weighting each by its voters.
    """
    if not slates or nc < 2:
        return None
    shares = first_shares(nc, ballots)
    rows = []
    for sl in slates:
        members = set(sl["members"])
        if len(members) < 2:
            continue
        first = ranked2 = same = 0
        pop = 0.0
        for w, b in ballots:
            if b[0] not in members:
                continue
            first += w
            if len(b) >= 2:
                ranked2 += w
                pop += w * popularity_baseline(shares, b[0], members)
                if b[1] in members:
                    same += w
        rows.append({
            "name": sl["name"],
            "kind": sl.get("kind"),
            "media": "(media)" in sl["name"],
            "members": len(members),
            "first_choice_voters": first,
            "ranked_2_plus": ranked2,
            "cohesion": r(same / ranked2) if ranked2 else None,
            "random_baseline": r((len(members) - 1) / (nc - 1)),
            "popularity_baseline": r(pop / ranked2) if ranked2 else None,
            "_same": same,
            "_pop": pop,
        })
    pooled = [x for x in rows if not x["media"] and x["ranked_2_plus"]]
    n = sum(x["ranked_2_plus"] for x in pooled)
    out = {
        "slates_with_2_plus_members": len(rows),
        "cohesion": r(sum(x["_same"] for x in pooled) / n) if n else None,
        "random_baseline": r(sum(x["ranked_2_plus"] * x["random_baseline"] for x in pooled) / n) if n else None,
        "popularity_baseline": r(sum(x["_pop"] for x in pooled) / n) if n else None,
        "by_slate": rows,
    }
    for x in rows:
        del x["_same"], x["_pop"]
    return out


# ---------------------------------------------------------------------------
# Statistic 4: transfer spread


def transfer_stats(nc, ballots, parties=None):
    """For each candidate, where their first-choice voters' second choices go.

    This reads ballots only, without a count. It describes the first
    transfer each candidate would hand on if they were eliminated (or
    elected) first. Later transfers in a real count mix voters whose
    ballots arrived from other candidates, which needs the engine.
    """
    nxt = [Counter() for _ in range(nc)]
    stopped = [0] * nc
    for w, b in ballots:
        if len(b) >= 2:
            nxt[b[0]][b[1]] += w
        else:
            stopped[b[0]] += w
    per = []
    for c in range(nc):
        n = sum(nxt[c].values())
        if n == 0:
            per.append({"candidate": c, "voters_with_next": 0, "stopped": stopped[c]})
            continue
        h = entropy(list(nxt[c].values()))
        # Evenness: entropy divided by its largest possible value,
        # log(candidates - 1). 1 means the next choices split evenly
        # across every other candidate; 0 means they all went to one.
        even = h / math.log(nc - 1) if nc > 2 else None
        per.append({
            "candidate": c,
            "voters_with_next": n,
            "stopped": stopped[c],
            "distinct_recipients": len(nxt[c]),
            "distinct_recipients_share": r(len(nxt[c]) / (nc - 1)),
            "evenness": r(even),
            "top_recipient_share": r(max(nxt[c].values()) / n),
            # Effective number of recipients: exp(entropy). Reads as "the
            # votes spread as if split evenly among this many candidates."
            "effective_recipients": r(math.exp(h), 3),
            "cross_party_evenness": cross_party_evenness(c, nxt[c], nc, parties),
        })
    with_next = [p for p in per if p["voters_with_next"] > 0]
    wsum = sum(p["voters_with_next"] for p in with_next)

    def wavg(key):
        vals = [(p[key], p["voters_with_next"]) for p in with_next if p.get(key) is not None]
        tot = sum(w for _, w in vals)
        return r(sum(v * w for v, w in vals) / tot) if tot else None

    return {
        "evenness_weighted_mean": wavg("evenness"),
        "top_recipient_share_weighted_mean": wavg("top_recipient_share"),
        "effective_recipients_weighted_mean": wavg("effective_recipients"),
        "distinct_recipients_share_weighted_mean": wavg("distinct_recipients_share"),
        "cross_party_evenness_weighted_mean": wavg("cross_party_evenness"),
        "voters_with_next": wsum,
        "by_candidate": per,
    }


def cross_party_evenness(c, counts, nc, parties):
    """Evenness of next choices that leave candidate c's party.

    Same-party transfers dominate many candidates' next choices, which
    hides how evenly the rest spread. This drops recipients in c's own
    party (when c has running mates) and measures evenness among the
    others, divided by log(number of other-party candidates)."""
    if parties is None:
        return None
    groups = group_labels(parties)
    others = [d for d in range(nc) if d != c and groups[d] != groups[c]]
    if len(others) < 2:
        return None
    vals = [counts.get(d, 0) for d in others]
    if sum(vals) == 0:
        return None
    return r(entropy(vals) / math.log(len(others)))


# ---------------------------------------------------------------------------
# Putting it together


def analyze(path):
    nc, ns, ballots = read_ballots(path)
    meta_path = path[: -len(".ballots")] + ".json"
    meta = {}
    if os.path.exists(meta_path):
        with open(meta_path, encoding="utf-8") as f:
            meta = json.load(f)
    voters = sum(w for w, _ in ballots)
    return {
        "file": os.path.relpath(path),
        "source": meta.get("source"),
        "election": meta.get("election"),
        "date": meta.get("date"),
        "year": meta.get("year"),
        "group": meta.get("group"),
        "by_election": meta.get("by_election"),
        "candidates": nc,
        "seats": ns,
        "seat_share": r(ns / nc),
        "parties": meta.get("parties"),
        "voters": voters,
        "first_choice": first_choice_stats(nc, ballots),
        "ballot_length": length_stats(nc, ballots, ns),
        "slate_cohesion": cohesion_stats(nc, ballots, meta.get("parties")),
        "endorsement_slate_cohesion": slate_stats(nc, ballots, meta.get("slates")),
        "transfer_spread": transfer_stats(nc, ballots, meta.get("parties")),
    }


# Scalar statistics shown in the summary: (label, path into the result).
SUMMARY_ROWS = [
    ("Candidates", ("candidates",)),
    ("Seats", ("seats",)),
    ("Voters", ("voters",)),
    ("1. Top 10% of candidates' share of first choices", ("first_choice", "top10pct_share")),
    ("1. Top candidate's share of first choices", ("first_choice", "top_share")),
    ("1. Top candidate / median candidate (first choices)", ("first_choice", "top_to_median_ratio")),
    ("1. Fitted lognormal popularity spread", ("first_choice", "lognormal_spread")),
    ("1. Log gap, top candidate to median", ("first_choice", "log_gap_top_to_median")),
    ("1. Log gap, median candidate to bottom", ("first_choice", "log_gap_median_to_bottom")),
    ("2. Mean ballot length (ranks filled)", ("ballot_length", "mean")),
    ("2. Median ballot length", ("ballot_length", "median")),
    ("2. Mean length / candidates", ("ballot_length", "mean_as_share_of_candidates")),
    ("2. Share ranking exactly 1", ("ballot_length", "share_length_1")),
    ("2. Share ranking exactly as many as there are seats", ("ballot_length", "share_length_equals_seats")),
    ("2. Share ranking every candidate", ("ballot_length", "share_complete")),
    ("2. Share ranking all, or all but one", ("ballot_length", "share_complete_or_all_but_one")),
    ("2. Of ballots ranking 4+, share in listed (ballot-paper) order", ("ballot_length", "share_4plus_in_listed_order")),
    ("2. ... expected if order were random", ("ballot_length", "share_4plus_in_listed_order_by_chance")),
    ("3. Slate cohesion (second choice same party)", ("slate_cohesion", "cohesion")),
    ("3. Cohesion if second choices ignored party", ("slate_cohesion", "random_baseline")),
    ("3. Cohesion if second choices followed popularity alone", ("slate_cohesion", "popularity_baseline")),
    ("3. Share of voters whose first choice has a running mate", ("slate_cohesion", "share_of_voters_first_choice_in_multi_candidate_party")),
    ("3. Of those, share ranking only that party, then stopping", ("slate_cohesion", "share_party_only_ballots")),
    ("3b. Endorsement-slate cohesion (second choice same slate; non-media slates of 2+)", ("endorsement_slate_cohesion", "cohesion")),
    ("3b. ... if second choices ignored the slate", ("endorsement_slate_cohesion", "random_baseline")),
    ("3b. ... if second choices followed popularity alone", ("endorsement_slate_cohesion", "popularity_baseline")),
    ("4. Transfer evenness (0 = all to one, 1 = even)", ("transfer_spread", "evenness_weighted_mean")),
    ("4. Share of transfer going to top recipient", ("transfer_spread", "top_recipient_share_weighted_mean")),
    ("4. Effective number of recipients", ("transfer_spread", "effective_recipients_weighted_mean")),
    ("4. Share of other candidates receiving any transfer", ("transfer_spread", "distinct_recipients_share_weighted_mean")),
    ("4. Evenness of transfers that leave the party", ("transfer_spread", "cross_party_evenness_weighted_mean")),
]


def get(res, path):
    for k in path:
        if res is None:
            return None
        res = res.get(k)
    return res


def fmt(x):
    if x is None:
        return "–"
    if abs(x) >= 100:
        return f"{x:,.0f}"
    if float(x).is_integer():
        return f"{x:.0f}"
    return f"{x:.2f}"


def cell(vals):
    vals = [v for v in vals if v is not None]
    if not vals:
        return "–"
    return f"{fmt(quantile(vals, 0.5))} ({fmt(quantile(vals, 0.1))}–{fmt(quantile(vals, 0.9))})"


def summary(results, group_by=None, title=None):
    groups = [("All", results)]
    if group_by:
        keys = sorted({str(x.get(group_by)) for x in results})
        groups += [(k if group_by == "group" else f"{group_by} {k}",
                    [x for x in results if str(x.get(group_by)) == k])
                   for k in keys]
    out = []
    if title:
        out.append(f"## {title}\n")
    out.append("Each cell: median across elections, with the 10th to 90th "
               "percentile range in brackets (8 in 10 elections fall in that range).\n")
    out.append("| Statistic | " + " | ".join(f"{g} (n={len(rs)})" for g, rs in groups) + " |")
    out.append("|---|" + "---|" * len(groups))
    for label, path in SUMMARY_ROWS:
        out.append(f"| {label} | " + " | ".join(cell([get(x, path) for x in rs])
                                                  for _, rs in groups) + " |")
    # Ballot lengths pooled over every voter, not per election.
    out.append("")
    out.append("### Ballot length, pooled over all voters\n")
    out.append("Share of all ballots that rank exactly this many candidates.\n")
    maxlen = 8
    out.append("| Group | " + " | ".join(str(k) for k in range(1, maxlen)) + f" | {maxlen}+ |")
    out.append("|---|" + "---|" * maxlen)
    for g, rs in groups:
        c = Counter()
        for x in rs:
            for k, v in x["ballot_length"]["counts_by_length"].items():
                c[min(int(k), maxlen)] += v
        tot = sum(c.values())
        out.append(f"| {g} | " + " | ".join(f"{100 * c[k] / tot:.1f}%" for k in range(1, maxlen + 1)) + " |")
    out += party_flow_table(results)
    out += cohesion_by_party_table(results)
    out += candidates_by_party_table(results)
    return "\n".join(out) + "\n"


def candidates_by_party_table(results, top=8):
    """Each party's share of all candidacies and of all first choices."""
    cands, firsts = Counter(), Counter()
    for x in results:
        parties = x.get("parties")
        if not parties:
            continue
        labels = [PARTY_ALIASES.get(p, p) if p not in NO_PARTY else "Ind" for p in parties]
        shares = x["first_choice"]["shares_by_candidate"]
        for i, p in enumerate(labels):
            cands[p] += 1
            firsts[p] += shares[i] * x["voters"]
    if not cands:
        return []
    tc, tf = sum(cands.values()), sum(firsts.values())
    out = ["", "### Candidates and first choices by party, pooled\n",
           "The model gives slates the same share of candidates as of voters. "
           "This compares each party's share of all candidacies with its share "
           "of all first choices.\n",
           "| Party | Candidacies | Share of candidacies | Share of first choices | First choices per candidate, relative to average |",
           "|---|---|---|---|---|"]
    for p, n in cands.most_common(top):
        sc, sf = n / tc, firsts[p] / tf
        out.append(f"| {p} | {n:,} | {100 * sc:.1f}% | {100 * sf:.1f}% | {sf / sc:.2f} |")
    return out


def cohesion_by_party_table(results, top=6):
    """Pooled slate cohesion for each party, in wards where it had running mates."""
    tot = defaultdict(lambda: [0, 0, 0])  # [ranked 2+, same party second, wards]
    for x in results:
        sc = x.get("slate_cohesion") or {}
        for p, d in (sc.get("by_party") or {}).items():
            if d["ranked_2_plus"]:
                tot[p][0] += d["ranked_2_plus"]
                tot[p][1] += d["cohesion"] * d["ranked_2_plus"]
                tot[p][2] += 1
    if not tot:
        return []
    rows = sorted(tot.items(), key=lambda kv: -kv[1][0])[:top]
    out = ["", "### Slate cohesion by party, pooled over all voters\n",
           "Only wards where the party ran 2 or more candidates. Voters whose "
           "first choice was that party and who ranked at least 2.\n",
           "| Party | Wards | Voters | Second choice same party |",
           "|---|---|---|---|"]
    for p, (n, same, wards) in rows:
        out.append(f"| {p} | {wards} | {n:,} | {100 * same / n:.0f}% |")
    return out


def party_flow_table(results, top=7):
    """Pooled second choices by first-choice party, for the largest parties."""
    flows = defaultdict(Counter)
    for x in results:
        sc = x.get("slate_cohesion") or {}
        for p, d in (sc.get("second_choice_party_counts") or {}).items():
            flows[p].update(d)
    if not flows:
        return []
    size = Counter({p: sum(d.values()) for p, d in flows.items()})
    parties = [p for p, _ in size.most_common(top)]
    cols = parties + ["other", "(none)"]
    out = ["", "### Second choices by first-choice party, pooled over all voters\n",
           "Each row: voters whose first choice was that party's candidate. "
           "Each column: the party of their second choice. \"(none)\" means "
           "they ranked only one candidate. Rows add to 100%. Includes wards "
           "where the party had only one candidate, so a second choice in the "
           "same party wasn't always possible.\n",
           "| First choice | Voters | " + " | ".join(cols) + " |",
           "|---|---|" + "---|" * len(cols)]
    for p in parties:
        d = flows[p]
        tot = sum(d.values())
        other = tot - sum(d.get(q, 0) for q in parties) - d.get("(none)", 0)
        cells = [d.get(q, 0) for q in parties] + [other, d.get("(none)", 0)]
        out.append(f"| {p} | {tot:,} | " + " | ".join(f"{100 * v / tot:.0f}%" for v in cells) + " |")
    return out


def lognormal_reference(n, draws=20000, seed=7):
    """What first-choice shares look like if they followed popularity alone.

    Draws n candidate popularities from a lognormal with each spread,
    treats the shares as popularity divided by the total (no slates, no
    voters), and prints the median of the statistic-1 measures. Compare
    these with real elections of n candidates."""
    import random
    import statistics
    rng = random.Random(seed)
    lines = [f"Popularity alone, {n} candidates, {draws:,} draws (seed {seed}).", "",
             "| Spread | Top share | Top / median | Log gap top to median | "
             "Log gap median to bottom | Fitted spread |", "|---|---|---|---|---|---|"]
    for sigma in (0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0):
        top, ratio, up, lo, sd = [], [], [], [], []
        for _ in range(draws):
            w = sorted((math.exp(rng.gauss(0, sigma)) for _ in range(n)), reverse=True)
            t = sum(w)
            w = [x / t for x in w]
            med = quantile(w, 0.5)
            logs = [math.log(x) for x in w]
            top.append(w[0])
            ratio.append(w[0] / med)
            up.append(math.log(w[0] / med))
            lo.append(math.log(med / w[-1]))
            sd.append(statistics.stdev(logs))
        lines.append(f"| {sigma} | " + " | ".join(
            f"{statistics.median(v):.2f}" for v in (top, ratio, up, lo, sd)) + " |")
    return "\n".join(lines) + "\n"


def main():
    if len(sys.argv) == 3 and sys.argv[1] == "--lognormal-reference":
        sys.stdout.write(lognormal_reference(int(sys.argv[2])))
        return
    ap = argparse.ArgumentParser(
        description="Compute calibration statistics 1-4. "
                    "Or run with --lognormal-reference N for a popularity-only "
                    "reference table for N candidates.")
    ap.add_argument("output", help="JSON Lines file to write")
    ap.add_argument("inputs", nargs="+", help=".ballots files or folders")
    ap.add_argument("--group-by", help="metadata field to split the summary by, such as year")
    ap.add_argument("--title", help="heading for the summary")
    args = ap.parse_args()
    files = find_inputs(args.inputs)
    if not files:
        sys.exit("no .ballots files found")
    results = []
    with open(args.output, "w", encoding="utf-8") as f:
        for p in files:
            res = analyze(p)
            results.append(res)
            f.write(json.dumps(res, ensure_ascii=False) + "\n")
    sys.stdout.write(summary(results, args.group_by, args.title))


if __name__ == "__main__":
    main()
