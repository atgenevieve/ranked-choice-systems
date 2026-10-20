#!/usr/bin/env python3
"""Convert NYC Board of Elections cast vote records (CVRs) into .ballots files.

Reads raw/<year>/*.zip (from download.py), which hold one .xlsx file per batch
of ballots, and writes one .ballots + .json pair per ranked-choice contest into
ballots/ (format: docs/ballot-format.md). Cleanup rules are in README.md.

It also reads the official round-by-round pages in raw/<year>/official/ to get
the certified winner and to check our first-choice totals against the
official first round. The check results go into each contest's metadata and
into ballots/<year>-checks.json.

Run:  python3 data/nyc/convert.py [year ...]     (default: every year in YEARS)
Every ranked-choice contest in the CVR is written (citywide, borough, and
council district).

Standard library only. The .xlsx files are read as XML text; nothing in them
is executed.
"""
import collections
import html
import io
import json
import multiprocessing
import pathlib
import re
import sys
import zipfile

HERE = pathlib.Path(__file__).resolve().parent
RAW = HERE / "raw"
OUT = HERE / "ballots"

YEARS = {
    2021: {"date": "2021-06-22"},
    2023: {"date": "2023-06-27"},
    2025: {"date": "2025-06-24"},
}

# Official results that aren't on a round-by-round page in raw/<year>/official/.
# Keyed by year, then contest code. Each needs a public source.
MANUAL_OFFICIAL = {
    2025: {
        # Hand recount, certified July 25, 2025, after the CVR was posted (July 17).
        27074: {
            "winner": "George Sarantopoulos",
            "round1": {"George Sarantopoulos": 1120, "Richie Barsamian": 1104, "Write-ins": 41},
            "page": "https://vote.nyc/sites/default/files/pdf/election_results/2025/20250624Primary%20Election/"
                    "Manual/REP_Council_Member_47th_Council_District_Manual_Count.pdf",
        },
    },
}

# Extra notes for contests whose official record needs explaining. Keyed by year, then contest code.
CONTEST_NOTES = {
    2021: {
        24549: "The BOE posted no count for this contest. Ballotpedia lists the 2021 Republican primary for "
               "Queens Borough President as canceled, with Thomas Zmich advancing to the general election "
               "and Danniel Maio withdrawn or disqualified; the contest was still printed on ballots, which "
               "is why the CVR has marks for it. The CVR's two candidate IDs are missing from the BOE's name "
               "list, and no public source we found ties either ID to a name.",
        24347: "Decided by a hand recount, certified August 17, 2021 (other contests were certified July 20). "
               "The CVR records the scanners' reading of each ballot, so the small first-round differences "
               "likely come from the hand count.",
        24367: "Decided by a hand recount, certified August 24, 2021 (other contests were certified July 20). "
               "The CVR records the scanners' reading of each ballot, so the small first-round differences "
               "likely come from the hand count.",
        24496: "Recertified August 24, 2021, the same day as the District 50 Republican hand recount, which "
               "covered ballots that also carry this contest. The 2-vote first-round difference likely comes "
               "from that recount.",
        24425: "Recertified August 24, 2021, the same day as the District 50 Republican hand recount, which "
               "covered ballots that also carry this contest. The 2-vote first-round difference likely comes "
               "from that recount.",
    },
    2025: {
        27074: "Official winner and first round from the BOE's certified hand recount (July 25, 2025), which "
               "came after this CVR (July 17, 2025); the CVR's first round differs from it by 3 votes.",
    },
}

HEADER = re.compile(r"^(?P<office>.*?) Choice (?P<rank>\d+) of (?P<max>\d+) (?P<district>.*?) \((?P<code>\d+)\)$")
CELL = re.compile(r'<c r="([A-Z]+)\d+"([^>]*?)(?:/>|>(.*?)</c>)', re.S)
VALUE = re.compile(r"<v>(.*?)</v>|<t[^>]*>(.*?)</t>", re.S)
WRITE_IN = "WRITE-IN"


# ---------------------------------------------------------------- xlsx reading

def shared_strings(x):
    try:
        data = x.read("xl/sharedStrings.xml").decode("utf-8")
    except KeyError:
        return []
    out = []
    for si in re.findall(r"<si>(.*?)</si>", data, re.S):
        out.append(html.unescape("".join(re.findall(r"<t[^>]*>(.*?)</t>", si, re.S))))
    return out


def sheet_rows(x):
    """Yield each row of the first worksheet as {column letters: text}."""
    ss = shared_strings(x)
    sheet = sorted(n for n in x.namelist() if re.match(r"xl/worksheets/sheet\d+\.xml$", n))[0]
    buf = ""
    with x.open(sheet) as f:
        reader = io.TextIOWrapper(f, encoding="utf-8")
        while True:
            chunk = reader.read(1 << 22)
            if not chunk:
                break
            buf += chunk
            parts = buf.split("</row>")
            buf = parts.pop()
            for part in parts:
                yield parse_row(part, ss)
    if "<c " in buf:
        yield parse_row(buf, ss)


def parse_row(text, ss):
    row = {}
    for col, attrs, inner in CELL.findall(text):
        if not inner:
            continue
        m = VALUE.search(inner)
        if not m:
            continue
        v = m.group(1) if m.group(1) is not None else m.group(2)
        if 't="s"' in attrs:
            v = ss[int(v)]
        else:
            v = html.unescape(v)
        row[col] = v.strip()
    return row


# ---------------------------------------------------------------- one CVR file

def clean(tokens):
    """Apply the NYC BOE rules to one voter's marks in one contest.

    tokens: list of raw cell values in rank order ('' if the cell is missing).
    Returns (ballot tuple, flags set).
    """
    ballot, flags = [], set()
    seen_skip = False
    for t in tokens:
        low = t.lower()
        if low in ("", "undervote"):
            seen_skip = True
            continue
        if low == "overvote":
            flags.add("overvote")
            break  # the ballot is exhausted when it reaches an overvoted rank
        cand = WRITE_IN if "write" in low else t
        if seen_skip:
            flags.add("skipped")  # a mark after a blank rank (including a blank first rank)
        seen_skip = False
        if cand in ballot:
            flags.add("duplicate")  # a repeated candidate is passed over
            continue
        ballot.append(cand)
    return tuple(ballot), flags


def process_file(args):
    zip_path, inner = args
    outer = zipfile.ZipFile(zip_path)
    x = zipfile.ZipFile(io.BytesIO(outer.read(inner)))
    rows = sheet_rows(x)
    header = next(rows)
    contests = {}  # code -> {"name", "max", "cols": [col by rank]}
    for col, text in header.items():
        m = HEADER.match(text)
        if not m:
            continue
        code1 = m.group("code")
        rank = int(m.group("rank"))
        cid = int(code1[1:]) if len(code1) == 6 else int(code1)  # first digit is the rank
        name = f"{m.group('office')} {m.group('district')}"
        c = contests.setdefault(cid, {"name": name, "max": int(m.group("max")), "cols": {}})
        c["cols"][rank] = col
    style_col = next((col for col, t in header.items() if t == "Ballot Style"), None)
    result = {cid: {"name": c["name"], "max": c["max"], "ballots": collections.Counter(),
                    "stats": collections.Counter()} for cid, c in contests.items()}
    tokens_seen = collections.Counter()
    # Every row has 'undervote' in every contest of its file, even contests that
    # were not on that voter's ballot. So a ballot with no marks in a contest is
    # only counted as blank if its ballot style carried the contest, which we
    # infer from other ballots of that style having marks in it (see main).
    unmarked = collections.Counter()   # (cid, style) -> ballots with no marks at all
    marked_styles = collections.defaultdict(set)  # cid -> styles with any mark
    precinct_col = next((col for col, t in header.items() if t == "Precinct"), None)
    party = {cid: c["name"].split()[0] for cid, c in contests.items()}
    records = 0
    for row in rows:
        records += 1
        all_toks = {cid: [row.get(c["cols"].get(r, ""), "") for r in range(1, c["max"] + 1)]
                    for cid, c in contests.items()}
        has_mark = {cid: not all(t.lower() in ("", "undervote") for t in toks) for cid, toks in all_toks.items()}
        if style_col:
            style = row.get(style_col, "")
        else:
            # No ballot style column (2023): use precinct plus the party whose
            # contests this ballot marked. Ballots with no marks anywhere, or
            # marks for two parties, get no style and are never counted blank.
            parties = {party[cid] for cid, hm in has_mark.items() if hm}
            style = f"{row.get(precinct_col, '')}|{parties.pop()}" if len(parties) == 1 else None
        for cid, toks in all_toks.items():
            if not has_mark[cid]:
                if style is not None:
                    unmarked[(cid, style)] += 1
                continue
            marked_styles[cid].add(style)
            for t in toks:
                if t and not t.isdigit():
                    tokens_seen[t] += 1
            ballot, flags = clean(toks)
            st = result[cid]["stats"]
            st["records_with_marks"] += 1
            for fl in flags:
                st[fl] += 1
            if ballot:
                result[cid]["ballots"][ballot] += 1
            else:
                st["blank_overvote_first"] += 1
    return inner, result, tokens_seen, records, unmarked, marked_styles


# ---------------------------------------------------------------- names, official results

def candidate_names(zip_path):
    outer = zipfile.ZipFile(zip_path)
    inner = next(n for n in outer.namelist() if "CandidacyID_To_Name" in n)
    x = zipfile.ZipFile(io.BytesIO(outer.read(inner)))
    names = {}
    for row in sheet_rows(x):
        a, b = row.get("A", ""), row.get("B", "")
        if a.isdigit():
            names[a] = norm(b)
        elif a.replace(".0", "").isdigit():
            names[a.replace(".0", "")] = norm(b)
    return names


def norm(s):
    return re.sub(r"\s+", " ", s).strip()


def name_key(s):
    """Loose key for matching a name across BOE files: lower case, no
    punctuation, no single-letter middle initials."""
    words = re.sub(r"[^a-z ]", "", s.lower().replace("-", "")).split()
    return " ".join(w for w in words if len(w) > 1)


def official_results(year):
    """contest id -> {"title", "winner", "round1": {name: votes}, "url"}"""
    out = {}
    for p in sorted((RAW / str(year) / "official").glob("*_1.html")):
        cid = int(p.name.split("_")[0])
        h = p.read_text(encoding="utf-8", errors="replace")
        text = norm(html.unescape(re.sub(r"<[^>]+>", " ", h)))
        m = re.search(r"Election results\s*(.+?) won the ", text)
        winner = norm(m.group(1)) if m else None
        t = re.search(r"Contest:\s*(.+?)\s*Election Date", text)
        round1 = {}
        started = False
        for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", h, re.S | re.I):
            cells = [norm(html.unescape(re.sub(r"<[^>]+>", " ", c)))
                     for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", tr, re.S | re.I)]
            if cells and cells[0].startswith("Votes in this round"):
                started = True
                continue
            if started and len(cells) > 1 and re.fullmatch(r"[\d,]+", cells[1] or ""):
                round1[cells[0]] = int(cells[1].replace(",", ""))
        out[cid] = {"title": t.group(1) if t else None, "winner": winner, "round1": round1,
                    "page": p.name}
    return out


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


# ---------------------------------------------------------------- main

def convert_year(year, pool):
    ydir = RAW / str(year)
    zip_path = next(ydir.glob("*.zip"))
    inners = [n for n in zipfile.ZipFile(zip_path).namelist()
              if n.lower().endswith(".xlsx") and "CandidacyID" not in n]
    merged = {}
    tokens = collections.Counter()
    records = 0
    unmarked = collections.Counter()
    marked_styles = collections.defaultdict(set)
    for inner, result, toks, n, unm, mks in pool.imap_unordered(process_file, [(zip_path, n) for n in inners]):
        print(f"  {year} {inner}: {n:,} records", flush=True)
        records += n
        tokens.update(toks)
        unmarked.update(unm)
        for cid, styles in mks.items():
            marked_styles[cid] |= styles
        for cid, r in result.items():
            m = merged.setdefault(cid, {"name": r["name"], "max": r["max"],
                                        "ballots": collections.Counter(), "stats": collections.Counter()})
            m["ballots"].update(r["ballots"])
            m["stats"].update(r["stats"])
    # Unmarked ballots count as blank only when their ballot style carried the contest.
    for (cid, style), n in unmarked.items():
        if cid in merged and style in marked_styles[cid]:
            merged[cid]["stats"]["blank_no_marks"] += n
    names = candidate_names(zip_path)
    official = official_results(year)
    for cid, v in MANUAL_OFFICIAL.get(year, {}).items():
        official.setdefault(cid, {"title": None, **v})
    checks = {"year": year, "cvr_zip": zip_path.name, "records": records,
              "non_numeric_cell_values": dict(tokens), "contests": {}}
    written = 0
    for cid, m in sorted(merged.items(), key=lambda kv: kv[1]["name"]):
        first = collections.Counter()
        for b, n in m["ballots"].items():
            first[b[0]] += n
        order = sorted(first, key=lambda c: (c == WRITE_IN, -first[c], c))
        # Candidates ranked only below first place still need a number.
        extra = sorted({c for b in m["ballots"] for c in b} - set(order), key=lambda c: (c == WRITE_IN, c))
        order += extra
        index = {c: i for i, c in enumerate(order)}
        cand_names = ["Write-in (all write-ins combined)" if c == WRITE_IN else names.get(c, f"Candidate ID {c}")
                      for c in order]
        st = m["stats"]
        blank = st["blank_no_marks"] + st["blank_overvote_first"]
        off = official.get(cid)
        winners, check = None, {"official_page": None}
        if off:
            check["official_page"] = off["page"]
            by_name = {name_key(n): i for i, n in enumerate(cand_names)}
            w = by_name.get(name_key(off["winner"] or ""))
            winners = [w] if w is not None else None
            check["official_winner"] = off["winner"]
            diffs, unmatched, official_total = {}, [], 0
            for nm, votes in off["round1"].items():
                if "write" in nm.lower():
                    ours = first.get(WRITE_IN, 0)
                elif name_key(nm) in by_name:
                    ours = first.get(order[by_name[name_key(nm)]], 0)
                else:
                    unmatched.append(nm)
                    continue
                official_total += votes
                if ours != votes:
                    diffs[nm] = {"official": votes, "ours": ours}
            check["round1_rows_compared"] = len(off["round1"]) - len(unmatched)
            check["round1_rows_not_matched"] = unmatched
            check["round1_mismatches"] = diffs
            check["official_round1_total"] = official_total
            check["our_round1_total"] = sum(first.values())
        name = m["name"]
        notes = [f"NYC Board of Elections cast vote record ({zip_path.name}), contest code {cid:05d}. "
                 f"Ballot allowed {m['max']} ranks. Cleanup follows the BOE rules (see data/nyc/README.md). "
                 f"Records with any mark in this contest: {st['records_with_marks']}; with an overvote: "
                 f"{st['overvote']}; with a skipped rank: {st['skipped']}; with a repeated candidate: "
                 f"{st['duplicate']}. Blank ballots: {st['blank_no_marks']} with no marks (estimated from "
                 f"ballot styles), {st['blank_overvote_first']} whose first marked rank was an overvote."]
        if winners is None:
            notes.append("No certified round-by-round page found (or winner name not matched), so "
                         "official_winners is null." if not off else
                         f"Official winner '{off['winner']}' could not be matched to a candidate name.")
        else:
            notes.append(f"Official winner from the BOE certified round-by-round page {off['page']}.")
        if off and check["round1_mismatches"]:
            notes.append(f"First-choice totals differ from the official first round for "
                         f"{len(check['round1_mismatches'])} candidates; see {year}-checks.json.")
        if cid in CONTEST_NOTES.get(year, {}):
            notes.append(CONTEST_NOTES[year][cid])
            check["note"] = CONTEST_NOTES[year][cid]
        meta = {
            "source": "nyc",
            "election": f"NYC {year} primary, {name}",
            "date": YEARS[year]["date"],
            "system": "irv",
            "candidates": cand_names,
            "parties": None,
            "official_winners": winners,
            "blank_ballots": blank,
            "max_ranks": m["max"],
            "notes": " ".join(notes),
        }
        base = f"{year}-{slug(name)}"
        lines = [f"# NYC {year} primary: {name}", f"candidates {len(order)}", "seats 1"]
        for b, n in sorted(m["ballots"].items(), key=lambda kv: (-kv[1], [index[c] for c in kv[0]])):
            lines.append(f"{n} " + " ".join(str(index[c]) for c in b))
        (OUT / f"{base}.ballots").write_text("\n".join(lines) + "\n")
        (OUT / f"{base}.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n")
        checks["contests"][name] = check | {"ballots": sum(m["ballots"].values()), "blank": blank,
                                            "unique_ballots": len(m["ballots"])}
        written += 1
    (OUT / f"{year}-checks.json").write_text(json.dumps(checks, indent=2, ensure_ascii=False) + "\n")
    print(f"{year}: wrote {written} contests ({len(merged)} in the CVR)")


def main():
    args = sys.argv[1:]
    years = [int(a) for a in args if a.isdigit()] or sorted(YEARS)
    OUT.mkdir(parents=True, exist_ok=True)
    with multiprocessing.Pool() as pool:
        for y in years:
            convert_year(y, pool)


if __name__ == "__main__":
    main()
