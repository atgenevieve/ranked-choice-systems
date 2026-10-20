#!/usr/bin/env python3
"""Convert ACT Legislative Assembly 2024 ballot paper preference data into .ballots + .json files.

Reads raw/2024/ (from download.py) and writes one .ballots + .json pair per
electorate into ballots/ (format: docs/ballot-format.md). Also writes
ballots/checks.json, which compares our first-preference totals with the
official distribution of preferences, and our ballot count with the official
formal-vote count.

Run:  python3 data/act/convert.py
Standard library only. The downloaded files are read as data; nothing is executed.
"""
import collections
import csv
import json
import pathlib
import re
import unicodedata
import xml.etree.ElementTree as ET
import zipfile
from multiprocessing import Pool

HERE = pathlib.Path(__file__).resolve().parent
RAW = HERE / "raw" / "2024"
OUT = HERE / "ballots"
DATE = "2024-10-19"
SEATS = 5
INSTRUCTION = ("Number five boxes from 1 to 5 in the order of your choice. You may then show as many "
               "further preferences as you wish by writing numbers from 6 onwards in other boxes. "
               "[Footer:] Remember, number at least five boxes from 1 to 5 in the order of your choice.")
INSTRUCTION_SOURCE = ("Elections ACT, 'Ballot papers' page (sample Yerrabi ballot paper), "
                      "https://www.elections.act.gov.au/elections/our-electoral-system/elections-in-the-act/ballot-papers, "
                      "read 2026-10-20. Paper ballots; the electronic voting screens may word it differently.")
STATS_COLUMNS = {"Brindabella": "B", "Ginninderra": "D", "Kurrajong": "F", "Murrumbidgee": "H", "Yerrabi": "J"}

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def xlsx_rows(path, sheet_name=None):
    """Yield {column letter: text} for each row of one worksheet (standard library only)."""
    z = zipfile.ZipFile(path)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).iter(NS + "si"):
            shared.append("".join(t.text or "" for t in si.iter(NS + "t")))
    sheet = "xl/worksheets/sheet1.xml"
    if sheet_name:
        wb = ET.fromstring(z.read("xl/workbook.xml"))
        rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        target = {r.get("Id"): r.get("Target") for r in rels}
        rid = next(s.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
                   for s in wb.iter(NS + "sheet") if s.get("name") == sheet_name)
        sheet = "xl/" + target[rid].lstrip("/").removeprefix("xl/")
    for row in ET.fromstring(z.read(sheet)).iter(NS + "row"):
        out = {}
        for c in row.iter(NS + "c"):
            col = re.match(r"[A-Z]+", c.get("r")).group()
            v = c.find(NS + "v")
            if c.get("t") == "inlineStr":
                out[col] = "".join(t.text or "" for t in c.iter(NS + "t"))
            elif v is not None:
                out[col] = shared[int(v.text)] if c.get("t") == "s" else v.text
        yield out


def read_csv(name):
    with open(RAW / name, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def display_name(cname):
    """'PARTON, Mark' -> 'Mark PARTON', the form used in the official count sheets."""
    surname, _, given = cname.partition(", ")
    return f"{given} {surname}".strip()


def plain(name):
    """Letters only, without accents, upper case: for matching names across files."""
    try:
        name = name.encode("latin-1").decode("utf-8")  # undo UTF-8 read as Latin-1
    except (UnicodeEncodeError, UnicodeDecodeError):
        pass
    name = unicodedata.normalize("NFKD", name)
    return "".join(ch for ch in name if ch.isalpha() or ch == " ").upper().strip()


def party_name(group):
    """Ballot column heading in normal case: 'THE ACT GREENS' -> 'The ACT Greens'."""
    if group["pabbrev"] == "UNG":
        return None
    small = {"for", "of", "and"}
    words = []
    for i, w in enumerate(group["pname"].split()):
        if w in ("ACT", "DLP"):
            words.append(w)
        elif i and w.lower() in small:
            words.append(w.lower())
        else:
            words.append(w.capitalize())
    return " ".join(words)


def official(electorate):
    """First preferences and election order from the final distribution of preferences, table 2."""
    rows = list(xlsx_rows(RAW / "official" / f"{electorate}-table-2.xlsx"))
    header = next(r for r in rows if r.get("A") == "Count")
    names = {col: v.strip() for col, v in header.items() if col != "A"}
    quota = re.search(r"Quota\s*=\s*(\d+)", " ".join(r.get("A", "") for r in rows[:5])).group(1)
    first_row = next(r for r in rows if r.get("A") == "1")
    first = {names[c]: int(float(v)) for c, v in first_row.items() if c in names and v.strip()
             and not names[c].startswith(("Votes Exhausted", "Loss", "Total", "Remarks"))}
    elected = []
    for r in rows:
        for col, v in r.items():
            # Remarks look like "Merle GRAHAM fully excluded. Mark PARTON elected 1."
            for sentence in re.split(r"\.\s+", v):
                m = re.fullmatch(r"\s*(.+?)\s+elected\s+(\d)\.?\s*", sentence)
                if not m:
                    continue
                name, n = m.group(1).strip(), m.group(2)
                if name not in [e for e, _ in elected]:
                    elected.append((name, int(n)))
    elected.sort(key=lambda x: x[1])
    return {"quota": int(quota), "first": first, "elected": [e for e, _ in elected]}


def convert(electorate):
    ecode = {r["electorate"]: r["ecode"] for r in read_csv("Electorates.txt")}[electorate]
    groups = {r["pcode"]: r for r in read_csv("Groups.txt") if r["ecode"] == ecode}
    cands = [r for r in read_csv("candidates.txt") if r["ecode"] == ecode]
    # Candidates are numbered in ballot paper order: party column (pcode), then the
    # candidate's base position in the column (ccode). Each printed ballot rotates
    # names within a column (Robson rotation); `rcand` in the data gives that position.
    cands.sort(key=lambda r: (int(r["pcode"]), int(r["ccode"])))
    index = {(r["pcode"], r["ccode"]): i for i, r in enumerate(cands)}

    papers = collections.defaultdict(list)
    with open(RAW / f"{electorate}Total.txt", newline="", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            papers[(r["batch"], r["pindex"])].append((int(r["pref"]), index[(r["pcode"], r["ccode"])]))

    ballots = collections.Counter()
    stats = collections.Counter()
    lengths = {"all": collections.Counter(), "paper": collections.Counter(), "electronic": collections.Counter()}
    for (batch, _), prefs in papers.items():
        prefs.sort()
        # Hare-Clark savings rule (Electoral Act 1992, Schedule 4): a ballot with a single
        # first preference is formal, and preferences count only up to a missing or repeated
        # number. Elections ACT's files already stop there; we check and cut again anyway.
        ballot, seen = [], set()
        for want, (n, c) in enumerate(prefs, start=1):
            if n != want or c in seen:
                stats["cut_at_break_or_repeat"] += 1
                break
            ballot.append(c)
            seen.add(c)
        if not ballot:
            stats["no_first_preference"] += 1
            continue
        kind = "electronic" if batch.endswith("000") else "paper"
        stats[kind] += 1
        ballots[tuple(ballot)] += 1
        lengths["all"][len(ballot)] += 1
        lengths[kind][len(ballot)] += 1

    first = collections.Counter()
    for b, n in ballots.items():
        first[b[0]] += n
    off = official(electorate)
    shown = [display_name(r["cname"]) for r in cands]
    # The count sheets spell a few names with accents, some garbled (for example
    # "SoÃ«lily" for "Soëlily", which candidates.txt spells "Soelily"); compare plain letters.
    off["first"] = {plain(k): v for k, v in off["first"].items()}
    off["elected"] = [plain(n) for n in off["elected"]]
    shown_plain = [plain(n) for n in shown]
    missing = [n for n in off["elected"] if n not in shown_plain]
    if missing:
        raise RuntimeError(f"{electorate}: can't match elected names {missing}")
    winners = [shown_plain.index(n) for n in off["elected"]]
    off["elected"] = [shown[i] for i in winners]
    diffs = {shown[i]: {"official": off["first"].get(shown_plain[i]), "ours": first[i]}
             for i in range(len(cands)) if off["first"].get(shown_plain[i]) != first[i]}

    stats_rows = list(xlsx_rows(RAW / "official" / "Stats-Book-2024.xlsx", "Summary"))
    col = STATS_COLUMNS[electorate]
    formal = int(next(r for r in stats_rows if r.get("A") == "Formal")[col])
    informal = int(next(r for r in stats_rows if r.get("A") == "Informal")[col])

    total = sum(ballots.values())
    notes = (
        f"Elections ACT ballot paper preference data, {electorate}Total.txt (every formal ballot, "
        f"paper and electronic). {stats['electronic']:,} electronic votes and {stats['paper']:,} paper ballots. "
        "Preferences are already cut at the first missing or repeated number by Elections ACT; "
        f"our check cut {stats['cut_at_break_or_repeat']} more. "
        f"blank_ballots holds all {informal:,} informal ballots from the official statistics (not only blank ones); "
        "they aren't in the data file. "
        "Official winners in order of election, from the final distribution of preferences (table 2), "
        "Elections ACT, updated 26 October 2024. ACT counts surpluses with the last parcel of ballots "
        "received (Electoral Act 1992, Schedule 4), unlike Scottish STV."
    )
    meta = {
        "source": "act",
        "election": f"ACT Legislative Assembly 2024, {electorate}",
        "date": DATE,
        "system": "hare-clark-act",
        "candidates": [display_name(r["cname"]) for r in cands],
        "parties": [party_name(groups[r["pcode"]]) for r in cands],
        "party_source": "Groups.txt from Elections ACT (the ballot paper column headings, recased); "
                        "candidates in the ungrouped column are null, because the data files don't give their labels.",
        "official_winners": winners,
        "blank_ballots": informal,
        "max_ranks": None,
        "instruction": INSTRUCTION,
        "min_ranks_instructed": SEATS,
        "instruction_source": INSTRUCTION_SOURCE,
        "notes": notes,
    }
    base = f"2024-{electorate.lower()}"
    lines = [f"# ACT Legislative Assembly 2024: {electorate}. Source: Elections ACT ballot paper preference data.",
             f"candidates {len(cands)}", f"seats {SEATS}"]
    for b, n in sorted(ballots.items(), key=lambda kv: (-kv[1], kv[0])):
        lines.append(f"{n} " + " ".join(map(str, b)))
    (OUT / f"{base}.ballots").write_text("\n".join(lines) + "\n")
    (OUT / f"{base}.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n")
    check = {
        "ballots": total, "distinct_rankings": len(ballots), "official_formal": formal,
        "official_informal": informal, "official_quota": off["quota"],
        "first_preference_differences": diffs, "official_elected_in_order": off["elected"],
        "stats": dict(stats),
        "ballot_length": {k: dict(sorted(v.items())) for k, v in lengths.items()},
    }
    return electorate, check


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    electorates = [r["electorate"] for r in read_csv("Electorates.txt")]
    with Pool(len(electorates)) as pool:
        results = pool.map(convert, electorates)
    checks = dict(results)
    (OUT / "checks.json").write_text(json.dumps(checks, indent=2, ensure_ascii=False) + "\n")
    for e, c in checks.items():
        print(f"{e}: {c['ballots']:,} ballots (official formal {c['official_formal']:,}), "
              f"{c['distinct_rankings']:,} distinct, first-preference differences: {len(c['first_preference_differences'])}")


if __name__ == "__main__":
    main()
