#!/usr/bin/env python3
"""Convert the raw Scottish council election data to the project's ballot format.

Run from the repository root, after data/scotland/download.py:

    python3 -I data/scotland/convert.py

Reads data/scotland/raw/ and writes one .ballots file and one .json
metadata file per ward election to data/scotland/ballots/, in the format
described in docs/ballot-format.md. It also writes
data/scotland/ballots/_conversion-report.json, which lists every
election, where its official winners came from, and every check that
failed.

Treats every raw file as untrusted text: it parses numbers and names
and never evaluates anything.

Standard library only.
"""

import csv
import difflib
import glob
import json
import os
import re
import sys
import unicodedata
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")
OUT = os.path.join(HERE, "ballots")
SOURCE = "scotland"

# Polling day for each set of full council elections.
POLLING_DAY = {"2007": "2007-05-03", "2012": "2012-05-03",
               "2017": "2017-05-04", "2022": "2022-05-05"}

# File-name prefix in the scot-elex data -> council name.
COUNCILS = {
    "aberdeen": "Aberdeen City", "aberdeenshire": "Aberdeenshire",
    "angus": "Angus", "argyll_bute": "Argyll and Bute",
    "clackmannanshire": "Clackmannanshire",
    "dumgal": "Dumfries and Galloway", "dundee": "Dundee City",
    "east_ayrshire": "East Ayrshire",
    "east_dunbartonshire": "East Dunbartonshire",
    "east_lothian": "East Lothian", "east_renfrewshire": "East Renfrewshire",
    "edinburgh": "City of Edinburgh", "eilean_siar": "Comhairle nan Eilean Siar",
    "falkirk": "Falkirk", "fife": "Fife", "glasgow": "Glasgow City",
    "highland": "Highland", "inverclyde": "Inverclyde",
    "midlothian": "Midlothian", "moray": "Moray",
    "north_ayrshire": "North Ayrshire", "north_lanarkshire": "North Lanarkshire",
    "orkney": "Orkney Islands", "perth_kinross": "Perth and Kinross",
    "renfrewshire": "Renfrewshire", "sc_borders": "Scottish Borders",
    "shetland": "Shetland Islands", "south_ayrshire": "South Ayrshire",
    "south_lanarkshire": "South Lanarkshire", "stirling": "Stirling",
    "west_dunbartonshire": "West Dunbartonshire", "west_lothian": "West Lothian",
}

# By-election files carry the party description printed on the ballot
# paper, not a standardized label. These rules map the common ones onto
# the scot-elex short labels; anything else keeps its printed text.
BY_ELECTION_PARTY_RULES = [
    ("independence for scotland", "ISP"),
    ("freedom alliance", "FA"), ("alba", "API"),
    ("scottish national party", "SNP"), ("snp", "SNP"),
    ("liberal democrat", "LD"), ("conservative", "Con"),
    ("labour", "Lab"), ("green", "Gr"), ("independent", "Ind"),
    ("ukip", "UKIP"), ("uk independence", "UKIP"),
    ("socialist", "Soc"), ("family party", "SFP"), ("libertarian", "Libtn"),
    ("vanguard", "Van"), ("sovereignty", "Sov"), ("grn", "Gr"),
    ("for britain", "FBM"),
]


# Ward names damaged in the source files, corrected by hand from the
# council's ward list (checked against the matching Wikipedia page).
WARD_NAME_FIXES = {
    "aberdeenshire_2022_ward1": "Ward 1 - Banff and District",
    "midlothian_2012_ward1": "Penicuik",
}

# Party labels wrong in the source, corrected by hand. Found by comparing
# every 2017 and 2022 label with Democracy Club's (1 real disagreement in
# about 5,000 candidates; the rest were spelling differences).
PARTY_FIXES = {
    # Deselected by the SNP in 2022 and stood as an independent
    # (Democracy Club; Wikipedia's 2022 West Lothian Council election page).
    "west_lothian_2022_ward5": {"Frank Anderson": "Ind"},
}

# Elections whose official winners are in doubt. official_winners is set
# to null for these, with the reason in the notes, so the engine doesn't
# test itself against a result that may be wrong.
DISPUTED = {
    "falkirk_2017_ward6":
        "Democracy Club and Wikipedia name different winners (Democracy "
        "Club: Wendy Chandrachud; Wikipedia: Robert Bissett, for the fourth "
        "seat). Not yet checked against Falkirk Council's declaration.",
    "glasgow_2021_by_election_ward_23_partick_east-kelvindale":
        "Democracy Club marks Abdul Bostani (SNP) elected, but a quick "
        "count of these ballots elects Jill Brown (Labour). Either the "
        "Democracy Club flag or the ballot data is wrong. Not yet checked "
        "against Glasgow City Council's declaration.",
}


# ---------------------------------------------------------------------------
# Reading the scot-elex files


def numbers(line):
    return line.replace(",", " ").split()


def read_blt(path):
    """Return (n_candidates, n_seats, {ballot tuple: count}, raw names, title)."""
    with open(path, encoding="utf-8-sig") as f:
        lines = [l.rstrip("\r\n") for l in f]
    head = numbers(lines[0])
    nc, ns = int(head[0]), int(head[1])
    i = 1
    withdrawn = []
    if lines[i].strip().startswith("-"):
        withdrawn = [-int(x) for x in numbers(lines[i])]
        i += 1
    ballots = Counter()
    stats = Counter()
    while lines[i].strip(" ,") != "0":
        parts = numbers(lines[i])
        if parts[-1] != "0":
            raise ValueError(f"{path}: ballot line without closing 0: {lines[i]!r}")
        weight = int(parts[0])
        ranks = [int(x) for x in parts[1:-1]]
        # Clean-up rule (see README): drop out-of-range numbers and any
        # repeat of a candidate already ranked, keeping the first mention.
        seen, clean = set(), []
        for r in ranks:
            if r < 1 or r > nc or r in withdrawn:
                stats["out_of_range_marks"] += weight
                continue
            if r in seen:
                stats["repeated_marks"] += weight
                continue
            seen.add(r)
            clean.append(r - 1)
        if clean:
            ballots[tuple(clean)] += weight
        else:
            stats["blank"] += weight
        i += 1
    tail = [l for l in lines[i + 1:] if l.strip()]
    names = tail[:nc]
    title = tail[nc] if len(tail) > nc else ""
    return nc, ns, ballots, names, title, stats, withdrawn


def read_mggg_csv(path):
    """Return ([(name, party label)], ward name) from an MGGG CSV file."""
    with open(path, encoding="utf-8", newline="") as f:
        rows = list(csv.reader(f))
    cands = [(r[1], r[2]) for r in rows if len(r) >= 3 and r[0].startswith("Candidate ")]
    ward = rows[-1][0] if rows and rows[-1] else ""
    return cands, ward


def short_party(label):
    """'Scottish National Party (SNP)' -> 'SNP'."""
    m = re.search(r"\(([^()]+)\)\s*$", label)
    return m.group(1) if m else label


def parse_by_election_name(raw):
    """Split a by-election BLT candidate line into (name, party label)."""
    raw = raw.strip()
    if raw.startswith('"'):
        parts = [p.strip() for p in raw.split('"') if p.strip()]
        name = parts[0]
        party_text = parts[1] if len(parts) > 1 else ""
    else:
        m = re.match(r"(.*?)\s*\(([^()]*)\)\s*$", raw)
        name, party_text = (m.group(1), m.group(2)) if m else (raw, "")
    return tidy_name(name), by_election_party(party_text)


def by_election_party(party_text):
    """Map a printed party description onto a scot-elex short label."""
    low = party_text.lower()
    for key, label in BY_ELECTION_PARTY_RULES:
        if key in low:
            return label
    party_text = party_text.strip(" .")
    return party_text or None


def tidy_name(name):
    """'Derek DAVIDSON' -> 'Derek Davidson'; leaves mixed-case names alone."""
    name = " ".join(name.replace(",", " ").split())
    words = []
    for w in name.split(" "):
        if w.isupper() and len(w) > 1:
            w = w.title()
            w = re.sub(r"\bMc([a-z])", lambda m: "Mc" + m.group(1).upper(), w)
        words.append(w)
    return " ".join(words)


# ---------------------------------------------------------------------------
# Matching names across sources


def norm(s):
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    s = re.sub(r"\([^)]*\)", " ", s)        # drop "(incumbent)" and similar
    s = re.sub(r"[^a-z\s-]", "", s).replace("-", " ")
    toks = [re.sub(r"^mac", "mc", t) for t in s.split()]
    return toks


def name_sim(a, b):
    ta, tb = norm(a), norm(b)
    if not ta or not tb:
        return 0.0
    sa, sb = "".join(ta), "".join(tb)
    # Same letters with different spacing (one source file has names
    # split mid-word, such as "St Ew Ar T Ad Am S"), with or without
    # middle names.
    if sa == sb or sa == tb[0] + tb[-1] or sb == ta[0] + ta[-1]:
        return 1.0
    if ta[-1] == tb[-1]:
        if ta[0] == tb[0]:
            return 1.0
        if ta[0][:1] == tb[0][:1]:
            return 0.9
        return 0.8
    # Surnames cut short in the source ("Gary Bel" for "Gary Bell").
    if (len(ta[-1]) >= 3 and len(tb[-1]) >= 3 and ta[0][:1] == tb[0][:1]
            and (tb[-1].startswith(ta[-1]) or ta[-1].startswith(tb[-1]))):
        return 0.85
    # Double-barrelled or joined surnames: "Smith Jones" vs "Smithjones".
    if "".join(ta[1:]) == "".join(tb[1:]) and ta[0][:1] == tb[0][:1]:
        return 0.95
    if ta[-1] in tb or tb[-1] in ta:
        return 0.7 + (0.1 if ta[0][:1] == tb[0][:1] else 0.0)
    return 0.8 * difflib.SequenceMatcher(None, sa, sb).ratio()


def assign(names, other):
    """Match each of names to a distinct entry of other (list of names).

    Returns (list of indexes into other or None, worst similarity)."""
    pairs = sorted(((name_sim(a, b), i, j) for i, a in enumerate(names)
                    for j, b in enumerate(other)), reverse=True)
    out = [None] * len(names)
    used = set()
    worst = 1.0
    for s, i, j in pairs:
        if out[i] is None and j not in used and s >= 0.6:
            out[i] = j
            used.add(j)
    # If exactly one candidate is left over on each side, and every other
    # candidate matched, treat the two as the same person under different
    # names (for example a married name). The caller records this.
    left = [i for i in range(len(names)) if out[i] is None]
    right = [j for j in range(len(other)) if j not in used]
    if len(left) == 1 and len(right) == 1 and len(names) >= 3:
        out[left[0]] = right[0]
        return out, 0.6
    for i in range(len(names)):
        if out[i] is None:
            worst = 0.0
        else:
            worst = min(worst, name_sim(names[i], other[out[i]]))
    return out, worst


def looks_garbled(name):
    """True for names split mid-word, such as 'St Ew Ar T Ad Am S'."""
    toks = name.split()
    return len(toks) >= 4 and sum(len(t) for t in toks) / len(toks) < 2.6


def surname_key(name):
    t = norm(name)
    return t[-1][:4] if t else ""  # first 4 letters, robust to cut-short names


def best_contest(names, contests):
    """Pick the contest whose candidate list best matches names.

    contests: list of dicts with key 'names'. Returns (contest, mapping)
    or (None, None) when no contest matches every candidate."""
    keys = Counter(surname_key(n) for n in names)
    scored = []
    for c in contests:
        ck = Counter(surname_key(n) for n in c["names"])
        scored.append((sum((keys & ck).values()), id(c), c))
    scored.sort(key=lambda x: -x[0])
    # Check the 4 contests sharing the most surnames, plus (for names the
    # surname test can't see, such as garbled ones) every contest with the
    # same number of candidates.
    shortlist = [c for _, _, c in scored[:4] if _ > 0]
    if any(looks_garbled(n) for n in names):
        shortlist += [c for c in contests if len(c["names"]) == len(names)]
    best = None
    for c in shortlist:
        mapping, worst = assign(names, c["names"])
        if worst >= 0.6:
            score = sum(name_sim(n, c["names"][j]) for n, j in zip(names, mapping))
            if best is None or score > best[0]:
                best = (score, c, mapping)
    if best is None:
        return None, None
    return best[1], best[2]


# ---------------------------------------------------------------------------
# Official winners: Democracy Club


def load_democracy_club():
    """Return {year or 'by': [contest]} where each contest has names and elected flags."""
    out = defaultdict(list)
    for path in sorted(glob.glob(os.path.join(RAW, "democracyclub", "*.csv"))):
        with open(path, encoding="utf-8", newline="") as f:
            rows = list(csv.DictReader(f))
        groups = defaultdict(list)
        for r in rows:
            if not r["election_id"].startswith("local."):
                continue
            if r.get("cancelled_poll") == "t":
                continue
            groups[r["ballot_paper_id"]].append(r)
        for bp, rs in groups.items():
            key = "by" if rs[0]["by_election"] == "t" else rs[0]["election_date"][:4]
            out[key].append({
                "id": bp,
                "names": [r["person_name"] for r in rs],
                "elected": [r["elected"] == "t" for r in rs],
                "parties": [r["party_name"] for r in rs],
                "elected_blank": sum(1 for r in rs if r["elected"] == ""),
                "seats": int(rs[0]["seats_contested"] or 0),
                "date": rs[0]["election_date"],
                "council": rs[0]["organisation_name"],
                "ward": rs[0]["post_label"],
                "url": "https://candidates.democracyclub.org.uk/elections/" + bp + "/",
            })
    return out


# ---------------------------------------------------------------------------
# Official winners: Wikipedia election pages


def strip_wiki(s):
    s = re.sub(r"<ref[^>]*/>", "", s)
    s = re.sub(r"<ref[^>]*>.*?</ref>", "", s, flags=re.S)
    s = re.sub(r"<!--.*?-->", "", s, flags=re.S)
    while True:  # remove templates, innermost first
        s2 = re.sub(r"\{\{[^{}]*\}\}", "", s)
        if s2 == s:
            break
        s = s2
    # A field cut off inside a footnote template leaves "{{refn" behind.
    s = re.sub(r"\{\{.*$", "", s, flags=re.S)
    s = re.sub(r"<ref.*$", "", s, flags=re.S)
    s = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", s)
    return s


def wiki_field(block, field):
    m = re.search(r"\|\s*" + field + r"\s*=\s*(.*?)(?=\n\s*\||\|\s*[a-z_0-9]+\s*=|\}\}\s*$)",
                  block, flags=re.S | re.I)
    return m.group(1).strip() if m else None


def split_templates(text, prefix):
    """Yield the full text of each {{prefix...}} template, honoring nesting."""
    pos = 0
    pat = re.compile(r"\{\{\s*" + prefix, re.I)
    while True:
        m = pat.search(text, pos)
        if not m:
            return
        depth, i = 0, m.start()
        while i < len(text) - 1:
            two = text[i:i + 2]
            if two == "{{":
                depth += 1
                i += 2
                continue
            if two == "}}":
                depth -= 1
                i += 2
                if depth == 0:
                    break
                continue
            i += 1
        yield m.start(), text[m.start():i]
        pos = i


def parse_wiki_page(title, text):
    """Return a list of contests (one per ward box) from a council page."""
    contests = []
    begins = [s for s, _ in split_templates(text, r"STV Election box begin")]
    if not begins:
        return contests
    begins.append(len(text))
    for k in range(len(begins) - 1):
        seg = text[begins[k]:begins[k + 1]]
        names, elected = [], []
        for _, tpl in split_templates(seg, r"STV Election box candidate"):
            cand = wiki_field(tpl, "candidate")
            if cand is None:
                continue
            bold = "'''" in cand
            name = strip_wiki(cand).replace("'''", "").replace("''", "")
            name = re.sub(r"\(.*?\)", "", name).strip(" *")
            if name:
                names.append(name)
                elected.append(bold)
        if names:
            contests.append({"id": f"{title} / box {k + 1}", "names": names,
                             "elected": elected, "page": title})
    return contests


def load_wikipedia():
    out = defaultdict(list)
    mpath = os.path.join(RAW, "MANIFEST.json")
    manifest = {}
    if os.path.exists(mpath):
        with open(mpath, encoding="utf-8") as f:
            manifest = json.load(f)
    for path in sorted(glob.glob(os.path.join(RAW, "wikipedia", "*", "*.wiki"))):
        year = os.path.basename(os.path.dirname(path))
        entry = manifest.get(os.path.relpath(path, RAW), {})
        title = entry.get("title") or os.path.basename(path)[:-5]
        with open(path, encoding="utf-8") as f:
            text = f.read()
        for c in parse_wiki_page(title, text):
            c["url"] = "https://en.wikipedia.org/wiki/" + title.replace(" ", "_")
            c["downloaded"] = entry.get("downloaded")
            out[year].append(c)
    return out


# ---------------------------------------------------------------------------
# Main conversion


def first_pref_quota_check(ballots, seats, winners):
    """Every candidate whose first choices alone reach the quota must have won."""
    total = sum(ballots.values())
    quota = total // (seats + 1) + 1
    fp = Counter()
    for b, w in ballots.items():
        fp[b[0]] += w
    must = {c for c, v in fp.items() if v >= quota}
    return must <= set(winners)


def reconcile_names(names, contest, mapping, src, notes):
    """Repair damaged source names from the matched contest, and note
    every candidate matched under a different name."""
    def cut_short(i, j):
        ta, tb = norm(names[i]), norm(contest["names"][j])
        return bool(ta and tb and ta[-1] != tb[-1] and tb[-1].startswith(ta[-1]))
    # Treat names as cut short only when it happens to 2 or more
    # candidates in the ward, the sign of a damaged file; a single
    # difference may just be another spelling.
    truncated = sum(cut_short(i, j) for i, j in enumerate(mapping)) >= 2
    for i, j in enumerate(mapping):
        other = re.sub(r"[^\w\s'.-]", "", contest["names"][j]).strip()
        if looks_garbled(names[i]):
            notes.append(f"Source name '{names[i]}' is garbled; replaced with {src}'s '{other}'.")
            names[i] = other
        elif truncated and cut_short(i, j):
            notes.append(f"Source name '{names[i]}' is cut short; replaced with {src}'s '{other}'.")
            names[i] = other
        elif cut_short(i, j):
            notes.append(f"Candidate '{names[i]}' is spelled '{other}' by {src}.")
        elif name_sim(names[i], other) < 0.6:
            notes.append(f"Candidate '{names[i]}' is listed as '{other}' by {src} "
                         "(matched as the only unmatched name).")


def winners_from(contest, mapping, names):
    """Translate a matched contest's elected flags into our numbering."""
    return sorted(i for i, j in enumerate(mapping) if contest["elected"][j])


def write_ballots(path, nc, ns, ballots, header_lines):
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        for h in header_lines:
            f.write(f"# {h}\n")
        f.write(f"candidates {nc}\nseats {ns}\n")
        for b, w in sorted(ballots.items(), key=lambda x: (-x[1], x[0])):
            f.write(str(w) + " " + " ".join(map(str, b)) + "\n")


def main():
    blt_files = sorted(glob.glob(os.path.join(RAW, "scot-elex", "blt_files", "*", "*.blt")))
    if not blt_files:
        sys.exit("No raw data. Run data/scotland/download.py first.")
    csv_index = {os.path.basename(p)[:-4]: p
                 for p in glob.glob(os.path.join(RAW, "scot-elex", "*_cands", "*.csv"))}
    dc = load_democracy_club()
    wiki = load_wikipedia()
    os.makedirs(OUT, exist_ok=True)
    for old in glob.glob(os.path.join(OUT, "*")):
        os.remove(old)

    report = []
    for path in blt_files:
        stem = os.path.basename(path)[:-4]
        m = re.match(r"(.+?)_+(\d{4})_(.*)$", stem)
        slug, year, rest = m.group(1), m.group(2), m.group(3)
        by = "by_election" in rest
        out_stem = re.sub(r"_+", "_", stem)
        nc, ns, ballots, raw_names, title, stats, withdrawn = read_blt(path)
        notes = []

        if stem in csv_index:
            cands, ward = read_mggg_csv(csv_index[stem])
            if len(cands) != nc:
                raise ValueError(f"{stem}: CSV has {len(cands)} candidates, BLT {nc}")
            names = [c[0] for c in cands]
            parties = [short_party(c[1]) for c in cands]
            party_src = "scot-elex CSV (standardized by MGGG)"
        else:
            pairs = [parse_by_election_name(n) for n in raw_names]
            names = [p[0] for p in pairs]
            parties = [p[1] for p in pairs]
            ward = title.strip().strip('"').rstrip(",")
            party_src = "by-election ballot-paper descriptions, mapped by convert.py rules"
            if any(p is None for p in parties):
                notes.append("Some party descriptions were blank.")  # may be filled below
        for name, label in PARTY_FIXES.get(stem, {}).items():
            i = names.index(name)
            notes.append(f"Source labels {name} '{parties[i]}'; corrected to '{label}'.")
            parties[i] = label
        if withdrawn:
            notes.append(f"Source lists withdrawn candidates {withdrawn}; "
                         "their marks were removed.")

        council = COUNCILS[slug]
        ward = re.sub(r"\s+", " ", ward).strip()
        if stem in WARD_NAME_FIXES:
            notes.append(f"Source ward name '{ward}' is damaged; corrected by hand.")
            ward = WARD_NAME_FIXES[stem]
        election = f"{council} {year}, {ward}" + (" (by-election)" if by else "")
        date = None if by else POLLING_DAY.get(year)

        # Official winners: Democracy Club first, Wikipedia second.
        winners, winner_src, winner_url = None, None, None
        dc_winners = wiki_winners = None
        pool = dc.get("by" if by else year, [])
        contest, mapping = best_contest(names, pool) if pool else (None, None)
        if contest is not None:
            if by:
                date = contest["date"]
            reconcile_names(names, contest, mapping, "Democracy Club", notes)
            if by and all(p is None for p in parties):
                parties = [by_election_party(contest["parties"][j]) for j in mapping]
                party_src = "Democracy Club party names, mapped by convert.py rules"
                notes = [n for n in notes if n != "Some party descriptions were blank."]
            w = winners_from(contest, mapping, names)
            extra = sum(contest["elected"]) - len(w)
            if len(w) == ns and extra == 0:
                dc_winners = w
                dc_url = contest["url"]
            else:
                notes.append(f"Democracy Club lists {sum(contest['elected'])} elected "
                             f"for {ns} seats in {contest['id']}; not used.")
        if not by and wiki.get(year):
            wc, wm = best_contest(names, wiki[year])
            if wc is not None:
                if dc_winners is None:
                    reconcile_names(names, wc, wm, "Wikipedia", notes)
                w = winners_from(wc, wm, names)
                if len(w) == ns and sum(wc["elected"]) == ns:
                    wiki_winners = w
                    wiki_url = wc["url"]
                    wiki_page = wc["page"]
        if dc_winners is not None:
            winners, winner_src, winner_url = dc_winners, "Democracy Club", dc_url
            if wiki_winners is not None and wiki_winners != dc_winners:
                notes.append(f"Wikipedia ({wiki_page}) gives different winners "
                             f"{wiki_winners}; Democracy Club used.")
        elif wiki_winners is not None:
            winners, winner_src, winner_url = wiki_winners, "Wikipedia", wiki_url
            notes.append(f"Winners from Wikipedia page '{wiki_page}'.")
        checks = {"dc_matches_wikipedia": (None if dc_winners is None or wiki_winners is None
                                           else dc_winners == wiki_winners)}
        if winners is not None and not first_pref_quota_check(ballots, ns, winners):
            notes.append("Check failed: a candidate reached the quota on first "
                         "choices but is not listed as a winner. Winners set to null.")
            checks["quota_check_failed"] = winners
            winners, winner_src = None, None
        if out_stem in DISPUTED or stem in DISPUTED:
            notes.append("Official winners withheld: " + DISPUTED.get(out_stem, DISPUTED.get(stem)))
            checks["disputed"] = True
            winners, winner_src = None, None
        elif winners is None and not any("Winners" in n for n in notes):
            notes.append("Official winners not found in any source.")

        meta = {
            "source": SOURCE,
            "election": election,
            "date": date,
            "system": "scottish-stv",
            "candidates": names,
            "parties": parties,
            "official_winners": winners,
            "blank_ballots": stats["blank"],
            "notes": " ".join(notes) if notes else "",
            # Extra fields, beyond the required ones, for tracing.
            "raw_file": os.path.relpath(path, HERE),
            "council": council,
            "year": int(year),
            "by_election": by,
            # For grouping summaries: each full set of council elections,
            # with all by-elections together.
            "group": "by-elections" if by else f"{year} council elections",
            "seats": ns,
            "ballots_counted": sum(ballots.values()),
            "party_labels_from": party_src,
            "official_winners_from": winner_src,
            "official_winners_url": winner_url if winners is not None else None,
        }
        header = [f"{election}",
                  f"Source: scot-elex {os.path.relpath(path, os.path.join(RAW, 'scot-elex'))}",
                  "Converted by data/scotland/convert.py; see data/scotland/README.md"]
        write_ballots(os.path.join(OUT, out_stem + ".ballots"), nc, ns, ballots, header)
        with open(os.path.join(OUT, out_stem + ".json"), "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=1, ensure_ascii=False)
            f.write("\n")
        report.append({"file": out_stem, "year": int(year), "by_election": by,
                       "candidates": nc, "seats": ns,
                       "ballots": meta["ballots_counted"],
                       "winners_from": winner_src, "checks": checks,
                       "cleanup": dict(stats), "notes": meta["notes"]})

    with open(os.path.join(OUT, "_conversion-report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, indent=1, ensure_ascii=False)
        f.write("\n")

    # Short summary.
    by_year = defaultdict(Counter)
    for r in report:
        k = "by-elections" if r["by_election"] else str(r["year"])
        by_year[k]["elections"] += 1
        by_year[k]["ballots"] += r["ballots"]
        by_year[k]["winners: " + str(r["winners_from"])] += 1
        c = r["checks"].get("dc_matches_wikipedia")
        if c is not None:
            by_year[k]["dc vs wikipedia " + ("agree" if c else "DISAGREE")] += 1
        if "quota_check_failed" in r["checks"]:
            by_year[k]["quota check failed"] += 1
    for k in sorted(by_year):
        print(k, dict(by_year[k]))


if __name__ == "__main__":
    main()
