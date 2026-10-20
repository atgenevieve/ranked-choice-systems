"""Copy the slates in slates.json into the metadata files in ballots/.

Usage:
    python3 data/nyc/add_slates.py           # write slates into ballots/*.json
    python3 data/nyc/add_slates.py --check   # only report, write nothing

slates.json lists members by name, as the source wrote them. Each name must
match a name in the contest's `candidates` list exactly, or be listed in the
contest's `aliases` map, which points a source spelling at the exact name.
Any other name stops the script before it writes anything. Names reached
through an alias are printed so a reviewer can check them.

Run this after convert.py, because convert.py rewrites the metadata files
without slates. Standard library only.
"""

import json
import sys
import unicodedata
from pathlib import Path

HERE = Path(__file__).resolve().parent
BALLOTS = HERE / "ballots"
OPTIONAL = ("ordered", "note")


def fold(name):
    """Lowercase, strip accents and punctuation. Used only to suggest fixes."""
    s = unicodedata.normalize("NFKD", name)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return "".join(c for c in s.lower() if c.isalnum())


def build(contest, spec, sources, problems, notes):
    meta_path = BALLOTS / f"{contest}.json"
    if not meta_path.exists():
        problems.append(f"{contest}: no metadata file {meta_path.name}")
        return None
    meta = json.loads(meta_path.read_text())
    cands = meta["candidates"]
    index = {c: i for i, c in enumerate(cands)}
    aliases = spec.get("aliases", {})
    for src, target in aliases.items():
        if target not in index:
            problems.append(f"{contest}: alias {src!r} points at {target!r}, which is not a candidate")
    slates = []
    for slate in spec["slates"]:
        members = []
        for name in slate["members"]:
            if name in index:
                members.append(index[name])
            elif name in aliases and aliases[name] in index:
                members.append(index[aliases[name]])
                notes.append(f"{contest}: {slate['name']}: {name!r} -> {aliases[name]!r} (alias)")
            else:
                f = fold(name)
                close = [c for c in cands if f and (fold(c) == f or f in fold(c) or fold(c) in f)]
                hint = f" (close: {close})" if close else ""
                problems.append(f"{contest}: {slate['name']}: no candidate named {name!r}{hint}")
        if len(set(members)) != len(members):
            problems.append(f"{contest}: {slate['name']}: a candidate is listed twice")
        if slate["kind"] not in ("endorsement", "party", "campaign"):
            problems.append(f"{contest}: {slate['name']}: unknown kind {slate['kind']!r}")
        src = sources.get(slate["source"])
        if src is None:
            problems.append(f"{contest}: {slate['name']}: unknown source id {slate['source']!r}")
            continue
        out = {"name": slate["name"], "kind": slate["kind"], "members": members, "source": src["url"]}
        if slate.get("date") or src.get("date"):
            out["date"] = slate.get("date") or src["date"]
        for key in OPTIONAL:
            if key in slate:
                out[key] = slate[key]
        slates.append(out)
    return meta_path, meta, slates


def insert_slates(meta, slates):
    """Return a copy of meta with `slates` placed right after `party_source` or `parties`."""
    meta = {k: v for k, v in meta.items() if k != "slates"}
    after = "party_source" if "party_source" in meta else "parties"
    out = {}
    for k, v in meta.items():
        out[k] = v
        if k == after:
            out["slates"] = slates
    out.setdefault("slates", slates)
    return out


def main():
    check = "--check" in sys.argv[1:]
    data = json.loads((HERE / "slates.json").read_text())
    problems, notes, writes = [], [], []
    for contest, spec in data["contests"].items():
        built = build(contest, spec, data["sources"], problems, notes)
        if built is not None:
            writes.append(built)
    for n in notes:
        print("alias:", n)
    if problems:
        for p in problems:
            print("PROBLEM:", p)
        print(f"{len(problems)} problem(s); nothing written.")
        sys.exit(1)
    total = 0
    for path, meta, slates in writes:
        total += len(slates)
        if not check:
            path.write_text(json.dumps(insert_slates(meta, slates), indent=2, ensure_ascii=False) + "\n")
    verb = "Checked" if check else "Wrote"
    print(f"{verb} {total} slates in {len(writes)} contests. Every name matched exactly or through a listed alias.")


if __name__ == "__main__":
    main()
