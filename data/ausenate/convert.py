#!/usr/bin/env python3
"""Convert AEC Senate formal preference files into .ballots + .json files.

Reads raw/<event>/ (from download.py) and writes three .ballots + .json pairs
per state or territory and election into ballots/ (format: docs/ballot-format.md):

  <year>-<state>.ballots      every formal ballot, as the official count uses it:
                              above-the-line votes expanded into candidates
                              (see README.md). Use this one to count the election.
  <year>-<state>-btl.ballots  below-the-line ballots only, as the voter marked them.
  <year>-<state>-atl.ballots  above-the-line ballots only, as rankings of the
                              party or group boxes ("candidates" are the groups).

It also writes ballots/checks.json: our first-preference totals against the
official ones, ballot counts, and how many boxes voters numbered.

Run:  python3 data/ausenate/convert.py
Standard library only. The downloaded files are read as data; nothing is executed.
"""
import collections
import csv
import io
import json
import pathlib
import re
import zipfile
from multiprocessing import Pool

HERE = pathlib.Path(__file__).resolve().parent
RAW = HERE / "raw"
OUT = HERE / "ballots"
ELECTIONS = {"20499": ("2016", "2016-07-02"), "24310": ("2019", "2019-05-18"),
             "27966": ("2022", "2022-05-21"), "31496": ("2025", "2025-05-03")}
STATE_NAMES = {"TAS": "Tasmania", "ACT": "Australian Capital Territory", "NT": "Northern Territory",
               "NSW": "New South Wales", "VIC": "Victoria", "QLD": "Queensland", "WA": "Western Australia",
               "SA": "South Australia"}
# Printed on every Senate ballot paper since 2016 (Commonwealth Electoral Act 1918, Schedule 1, Form E).
INSTRUCTION_BOTH = ("You may vote in one of two ways. Either: Above the line, by numbering at least 6 of these "
                    "boxes in the order of your choice (with number 1 as your first choice). Or: Below the line, "
                    "by numbering at least 12 of these boxes in the order of your choice (with number 1 as your "
                    "first choice).")
INSTRUCTION_ATL = ("Above the line: By numbering at least 6 of these boxes in the order of your choice "
                   "(with number 1 as your first choice).")
INSTRUCTION_BTL = ("Below the line: By numbering at least 12 of these boxes in the order of your choice "
                   "(with number 1 as your first choice).")
INSTRUCTION_SOURCE = ("AEC, 'How to make your vote count' (sample Senate ballot paper), "
                      "https://www.aec.gov.au/Voting/How_to_vote/files/how-to-make-your-vote-count.pdf, read 2026-10-20.")
BTL_MIN_FORMAL = 6   # s 268A: a below-the-line vote is formal if it numbers at least 1 to 6
TICKS = {"/", "*"}   # in the 2016 files a tick is "/" and a cross "*"; the AEC counted either as a 1 (s 268A, s 269(1A))


def read_aec_csv(path):
    """AEC download CSVs have a title line, then a header line."""
    with open(path, newline="", encoding="utf-8-sig") as f:
        next(f)
        return list(csv.DictReader(f))


def group_key(g):
    return (g == "UG", len(g), g)


def candidate_list(ev, state):
    rows = [r for r in read_aec_csv(RAW / ev / f"SenateFirstPrefsByStateByVoteTypeDownload-{ev}.csv")
            if r["StateAb"] == state]
    for r in rows:  # 2016 and 2019 files call the group column "Ticket"
        r.setdefault("Group", r.get("Ticket"))
    groups = sorted({r["Group"] for r in rows if r["BallotPosition"] == "0"}, key=group_key)
    cands = sorted([r for r in rows if r["BallotPosition"] != "0"],
                   key=lambda r: (group_key(r["Group"]), int(r["BallotPosition"])))
    group_party = {r["Group"]: r["PartyName"] for r in rows if r["BallotPosition"] == "0"}
    return groups, cands, group_party, rows


def marks_to_ranking(marks, n, ticks_as_one):
    """Return the ranking (box indexes) implied by marks, cut at the first missing or repeated number."""
    pos = collections.defaultdict(list)
    for i, m in enumerate(marks[:n]):
        m = m.strip()
        if not m:
            continue
        if ticks_as_one and m in TICKS:
            m = "1"
        if m.isdigit():
            pos[int(m)].append(i)
    ranking = []
    k = 1
    while len(pos.get(k, [])) == 1:
        ranking.append(pos[k][0])
        k += 1
    return ranking


def read_ballots(ev, state, n_groups, n_cands):
    """Yield (atl_marks, btl_marks) for each formal ballot paper."""
    z = zipfile.ZipFile(RAW / ev / f"aec-senate-formalpreferences-{ev}-{state}.zip")
    with z.open(z.namelist()[0]) as f:
        reader = csv.reader(io.TextIOWrapper(f, encoding="utf-8-sig", newline=""))
        header = next(reader)
        if header[-1] == "Preferences":  # 2016 layout: one quoted column of all boxes
            next(reader)  # a line of dashes
            for row in reader:
                marks = row[-1].split(",")
                marks += [""] * (n_groups + n_cands - len(marks))
                yield marks[:n_groups], marks[n_groups:n_groups + n_cands]
        else:  # 2019 onward: one column per box, after "Paper No"
            start = 6
            boxes = header[start:]
            if len(boxes) != n_groups + n_cands:
                raise RuntimeError(f"{ev} {state}: {len(boxes)} box columns, expected {n_groups}+{n_cands}")
            for row in reader:
                marks = row[start:] + [""] * (start + len(boxes) - len(row))
                yield marks[:n_groups], marks[n_groups:]


def convert(job):
    ev, state = job
    year, date = ELECTIONS[ev]
    groups, cands, group_party, rows = candidate_list(ev, state)
    n_g, n_c = len(groups), len(cands)
    cand_index_by_group = collections.defaultdict(list)
    for i, r in enumerate(cands):
        cand_index_by_group[r["Group"]].append(i)

    full, btl, atl = collections.Counter(), collections.Counter(), collections.Counter()
    stats = collections.Counter()
    btl_len, atl_len = collections.Counter(), collections.Counter()
    for atl_marks, btl_marks in read_ballots(ev, state, n_g, n_c):
        stats["papers"] += 1
        b = marks_to_ranking(btl_marks, n_c, ticks_as_one=(ev == "20499"))
        if len(b) >= BTL_MIN_FORMAL:
            # s 269(2): a formal below-the-line vote takes precedence over marks above the line.
            if any(m.strip() for m in atl_marks):
                stats["btl_with_atl_marks_too"] += 1
            btl[tuple(b)] += 1
            full[tuple(b)] += 1
            btl_len[len(b)] += 1
            stats["btl"] += 1
            continue
        a = marks_to_ranking(atl_marks, n_g, ticks_as_one=(ev == "20499"))
        if not a:
            stats["not_formal_by_our_rules"] += 1
            continue
        if any(m.strip() in TICKS for m in atl_marks):
            stats["atl_tick_or_cross"] += 1
        atl[tuple(a)] += 1
        atl_len[len(a)] += 1
        stats["atl"] += 1
        # s 272: an above-the-line vote counts as a vote for the group's candidates
        # in ballot order, then the next group's, and so on.
        full[tuple(c for g in a for c in cand_index_by_group[groups[g]])] += 1

    # Checks against official first preferences.
    first = collections.Counter()
    for b, n in full.items():
        first[b[0]] += n
    official_first = {i: int(r["TotalVotes"]) for i, r in enumerate(cands)}
    atl_first = collections.Counter()
    for a, n in atl.items():
        atl_first[groups[a[0]]] += n
    official_atl = {r["Group"]: int(r["TotalVotes"]) for r in rows if r["BallotPosition"] == "0"}
    btl_first = collections.Counter()
    for b, n in btl.items():
        btl_first[b[0]] += n
    diffs_btl = {cands[i]["CandidateDetails"]: {"official": v, "ours": btl_first[i]}
                 for i, v in official_first.items() if v != btl_first[i]}
    diffs_atl = {g: {"official": v, "ours": atl_first[g]} for g, v in official_atl.items() if v != atl_first[g]}

    informal = next(int(r["InformalVotes"]) for r in read_aec_csv(RAW / ev / f"SenateInformalByStateDownload-{ev}.csv")
                    if r["StateAb"] == state)
    formal = next(int(r["FormalVotes"]) for r in read_aec_csv(RAW / ev / f"SenateInformalByStateDownload-{ev}.csv")
                  if r["StateAb"] == state)

    def name(r):
        surname, _, given = r["CandidateDetails"].partition(", ")
        return f"{given} {surname}".strip()

    names = [name(r) for r in cands]
    elected = [r for r in read_aec_csv(RAW / ev / f"SenateSenatorsElectedDownload-{ev}.csv") if r["StateAb"] == state]
    elected.sort(key=lambda r: int(r["ElectedOrder"]))
    winners = []
    for r in elected:
        hits = [i for i, c in enumerate(cands)
                if c["CandidateDetails"].upper() == f"{r['Surname']}, {r['GivenNm']}".upper()]
        if len(hits) != 1:
            raise RuntimeError(f"{ev} {state}: can't match elected senator {r['GivenNm']} {r['Surname']}")
        winners.append(hits[0])
    seats = len(winners)

    def party(p):
        return None if p in ("Independent", "", None) else p

    parties = [party(r["PartyName"]) for r in cands]
    group_labels = [f"{g}: {group_party.get(g) or 'unnamed group'}" for g in groups]
    election = f"Australian Senate {year}, {STATE_NAMES[state]}"
    common = {"source": "ausenate", "date": date, "system": "senate-stv",
              "party_source": "AEC SenateFirstPrefsByStateByVoteTypeDownload (the party name printed on the ballot); "
                              "'Independent' and blank are null.",
              "max_ranks": None, "instruction_source": INSTRUCTION_SOURCE}
    base_note = (f"AEC formal preferences file aec-senate-formalpreferences-{ev}-{state}.zip: "
                 f"{stats['papers']:,} formal ballot papers, {stats['btl']:,} below the line and "
                 f"{stats['atl']:,} above the line. Cleanup follows the Commonwealth Electoral Act 1918 "
                 "(see data/ausenate/README.md): a below-the-line vote numbering at least 1 to 6 is used as marked, "
                 "up to the first missing or repeated number; otherwise the above-the-line marks are used the same way. "
                 f"blank_ballots holds all {informal:,} informal ballots from the AEC (not only blank ones). "
                 "Official winners in order of election, from SenateSenatorsElectedDownload. "
                 "The Senate count uses the weighted inclusive Gregory method with bulk exclusions.")
    outputs = [
        ("", full, names, parties, None, INSTRUCTION_BOTH,
         "All formal ballots. ABOVE-THE-LINE VOTES ARE EXPANDED: a ballot numbering groups A, C is written as "
         "group A's candidates in ballot order, then group C's, as the official count treats it. So ballot lengths "
         "here are NOT what voters wrote; use the -btl and -atl files for that. ",
         winners),
        ("-btl", btl, names, parties, 12, INSTRUCTION_BTL,
         "Below-the-line ballots only, as marked. Not a full count of the election: above-the-line votes are left out. ",
         None),
        ("-atl", atl, group_labels, [party(group_party.get(g)) for g in groups], 6, INSTRUCTION_ATL,
         "Above-the-line ballots only. Each 'candidate' is a party or group box above the line, so a ranking "
         "lists boxes, not people. Not a full count of the election. ",
         None),
    ]
    year_state = f"{year}-{state.lower()}"
    for suffix, counter, cnames, cparties, min_ranks, instruction, note, ow in outputs:
        meta = dict(common)
        meta.update({
            "election": election + {"": "", "-btl": " (below-the-line ballots only)",
                                    "-atl": " (above-the-line ballots only, as group rankings)"}[suffix],
            "candidates": cnames, "parties": cparties,
            "official_winners": ow, "blank_ballots": informal,
            "instruction": instruction, "min_ranks_instructed": min_ranks,
            "ballot_set": {"": "all, above-the-line expanded", "-btl": "below the line", "-atl": "above the line"}[suffix],
            "notes": note + base_note,
        })
        if suffix:
            meta["seats_in_election"] = seats
        lines = [f"# {meta['election']}. Source: AEC formal preferences, event {ev}.",
                 f"candidates {len(cnames)}", f"seats {seats}"]
        for b, n in sorted(counter.items(), key=lambda kv: (-kv[1], kv[0])):
            lines.append(f"{n} " + " ".join(map(str, b)))
        (OUT / f"{year_state}{suffix}.ballots").write_text("\n".join(lines) + "\n")
        (OUT / f"{year_state}{suffix}.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n")

    check = {"papers": stats["papers"], "official_formal": formal, "official_informal": informal,
             "seats": seats, "candidates": n_c, "groups": n_g,
             "official_elected_in_order": [names[i] for i in winners],
             "atl_first_preference_differences": diffs_atl,
             "btl_first_preference_differences": diffs_btl,
             "distinct": {"all": len(full), "btl": len(btl), "atl": len(atl)},
             "stats": dict(stats),
             "btl_boxes_numbered": dict(sorted(btl_len.items())),
             "atl_boxes_numbered": dict(sorted(atl_len.items()))}
    print(f"{year} {state}: {stats['papers']:,} papers (official formal {formal:,}), "
          f"{stats['btl']:,} BTL, {stats['atl']:,} ATL; first-pref diffs ATL {len(diffs_atl)}, BTL {len(diffs_btl)}",
          flush=True)
    return f"{year}-{state}", check


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    jobs = sorted((p.parent.name, re.search(r"-([A-Z]+)\.zip$", p.name).group(1))
                  for p in RAW.glob("*/aec-senate-formalpreferences-*.zip"))
    with Pool(min(6, len(jobs))) as pool:
        results = pool.map(convert, jobs)
    (OUT / "checks.json").write_text(json.dumps(dict(results), indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
