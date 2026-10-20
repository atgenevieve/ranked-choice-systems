#!/usr/bin/env python3
"""Convert the PrefLib zips in raw/ into .ballots + .json files in ballots/.

See docs/ballot-format.md for the output format and README.md (next to this
script) for the cleanup rules. Standard library only. The zips are read as
data; nothing inside them is executed.

Run:  python3 data/preflib/convert.py
"""
import collections
import json
import pathlib
import re
import zipfile

HERE = pathlib.Path(__file__).resolve().parent
RAW = HERE / "raw"
OUT = HERE / "ballots"

# Short name (as in Tomlinson, Ugander, and Kleinberg 2023, Table 2) by dataset.
SHORT = {
    "00001": "irish", "00002": "debian", "00005": "burlington", "00007": "ers",
    "00008": "glasgow", "00016": "aspen", "00017": "berkley",
    "00018": "minneapolis", "00019": "oakland", "00020": "pierce", "00021": "sf",
    "00022": "sl", "00023": "takomapark", "00028": "apa", "00030": "uklabor",
}

# Files left out on purpose. The Minneapolis "Full" files keep every write-in
# name as its own candidate (379 and 477 candidates, most with one or two
# votes). Tomlinson et al. used the "No Write In" versions, which we keep.
SKIP = {"00018-00000001", "00018-00000003"}

# Seats filled, where the real election was multi-winner. Everything not
# listed here is single-winner or, for the ERS files, unknown (see SEATS_NOTE).
SEATS = {
    # Irish general election 2002 (Dail constituencies).
    "00001-00000001": 4,  # Dublin North
    "00001-00000002": 3,  # Dublin West
    "00001-00000003": 5,  # Meath
    # Aspen, CO 2009 city council: two seats.
    "00016-00000001": 2,
    # Minneapolis 2009: Park Board at-large (3 seats), Board of Estimate and Taxation (2).
    "00018-00000002": 3,
    "00018-00000004": 2,
}
# Glasgow City Council 2007, seats per ward (Wikipedia, "2007 Glasgow City
# Council election"; the 21 wards sum to the council's 79 seats).
GLASGOW_SEATS = {
    "Anderston": 4, "Baillieston": 4, "Calton": 3, "Canal": 4, "Craigton": 4,
    "Drumchapel": 4, "EastCentre": 4, "Garscadden": 4, "Govan": 4,
    "GreaterPollok": 4, "Hillhead": 4, "Langside": 3, "Linn": 4, "Maryhill": 4,
    "Newlands": 3, "NorthEast": 4, "Partick": 4, "Pollokshields": 3,
    "Shettleston": 4, "SouthsideCentral": 4, "Springburn": 3,
}

# Counting rules, where known. PrefLib itself does not record them, so the
# metadata "system" is always "unknown"; this note says what we believe.
RULES = {
    "irish": "Irish STV (Dail), multi-winner.",
    "debian": "Debian uses a Condorcet method (Schulze), single-winner.",
    "burlington": "Instant runoff, single-winner.",
    "ers": "Various rules used by the organizations; seats and rules not recorded by PrefLib.",
    "glasgow": "Scottish STV, multi-winner.",
    "aspen": "Aspen's 2009 instant-runoff rules (the council race used a two-seat variant).",
    "berkley": "Instant runoff, single-winner.",
    "minneapolis": "Minneapolis STV for multi-seat races.",
    "oakland": "Instant runoff, single-winner.",
    "pierce": "Instant runoff, single-winner.",
    "sf": "Instant runoff, single-winner.",
    "sl": "Instant runoff, single-winner.",
    "takomapark": "Instant runoff, single-winner.",
    "apa": "Hare (instant runoff), single-winner.",
    "uklabor": "Alternative vote (instant runoff) by electoral college; these are only the 266 MPs' ballots.",
}
# ers_tideman.py later replaces the ERS files' ballots, seats, and notes with
# Tideman's originals (PrefLib lacks seats and padded some ballots).
SEATS_NOTE = ("Number of seats is not recorded by PrefLib for the ERS files; "
              "set to 1, which is how Tomlinson et al. counted every PrefLib election.")

YEAR = re.compile(r"(19|20)\d\d")


def parse(text):
    """Return (header dict, alternative names, list of (count, ranking string))."""
    header, names, rows = {}, {}, []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith("#"):
            m = re.match(r"#\s*ALTERNATIVE NAME (\d+):\s*(.*)", line)
            if m:
                names[int(m.group(1))] = m.group(2).replace("''", "'").strip()
            else:
                m = re.match(r"#\s*([A-Z ]+):\s*(.*)", line)
                if m:
                    header[m.group(1)] = m.group(2).strip()
            continue
        count, _, ranking = line.partition(":")
        rows.append((int(count), ranking.strip()))
    return header, names, rows


def clean(ranking, n):
    """Turn '3,1,{2,4},5' into a tuple of 0-based candidates.

    Returns (ballot, problem) where problem is None, 'tie', or 'blank'.
    Rule: a ballot with two or more candidates tied at one rank is dropped
    whole, as Tomlinson et al. did. A repeated candidate keeps only its first
    (highest) position.
    """
    if not ranking:
        return (), "blank"
    if "{" in ranking:
        return None, "tie"
    seen, out = set(), []
    for tok in ranking.split(","):
        c = int(tok) - 1
        if not 0 <= c < n:
            raise ValueError(f"candidate {tok} out of range")
        if c not in seen:
            seen.add(c)
            out.append(c)
    return tuple(out), None


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    total_files = total_voters = 0
    for zp in sorted(RAW.glob("*.zip")):
        num = zp.name[:5]
        short = SHORT.get(num)
        if short is None:
            continue
        z = zipfile.ZipFile(zp)
        names_in_zip = set(z.namelist())
        stems = sorted({n.rsplit(".", 1)[0] for n in names_in_zip if n.endswith((".soi", ".toi"))})
        for stem in stems:
            if stem in SKIP:
                continue
            # Prefer the strict file (.soi); otherwise the one that allows ties (.toi).
            fname = stem + (".soi" if stem + ".soi" in names_in_zip else ".toi")
            header, names, rows = parse(z.read(fname).decode("utf-8"))
            n = int(header["NUMBER ALTERNATIVES"])
            cands = [names.get(i + 1, f"Alternative {i + 1}") for i in range(n)]
            agg = collections.Counter()
            blank = tied = 0
            for count, ranking in rows:
                ballot, problem = clean(ranking, n)
                if problem == "blank":
                    blank += count
                elif problem == "tie":
                    tied += count
                else:
                    agg[ballot] += count
            title = header.get("TITLE", stem)
            seats = SEATS.get(stem, 1)
            notes = [f"PrefLib file {fname} (dataset {num}, '{short}'). "
                     f"Counting rule, as far as we know: {RULES[short]}"]
            if short == "glasgow":
                ward = re.search(r"Scotland (\w+) Ward", title).group(1)
                seats = GLASGOW_SEATS[ward]
            if short == "ers":
                notes.append(SEATS_NOTE)
            if tied:
                notes.append(f"{tied} ballots with two or more candidates tied at one rank were left out "
                             "(not counted as blank).")
            if any("write" in c.lower() for c in cands):
                notes.append("A 'Write-In' candidate stands for all write-in votes combined.")
            m = YEAR.search(title)
            meta = {
                "source": "preflib",
                "election": title,
                "date": m.group(0) if m else None,
                "system": "unknown",
                "candidates": cands,
                "parties": None,
                "official_winners": None,
                "blank_ballots": blank,
                "tied_ballots_dropped": tied,
                "preflib_file": fname,
                "preflib_dataset": short,
                "notes": " ".join(notes),
            }
            base = f"{short}-{stem}-{slug(title)}"[:120]
            lines = [f"# PrefLib {fname}: {title}", f"candidates {n}", f"seats {seats}"]
            for ballot, count in sorted(agg.items(), key=lambda kv: (-kv[1], kv[0])):
                lines.append(f"{count} " + " ".join(map(str, ballot)))
            (OUT / f"{base}.ballots").write_text("\n".join(lines) + "\n")
            (OUT / f"{base}.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n")
            total_files += 1
            total_voters += sum(agg.values())
    print(f"wrote {total_files} elections, {total_voters:,} ballots")


if __name__ == "__main__":
    main()
