#!/usr/bin/env python3
"""Add party labels, slates, official winners, dates, and ballot rank limits
to the PrefLib metadata files in ballots/, from the hand-checked table in
labels.json (next to this script).

labels.json lists, for each election (by PrefLib file number):
- parties: [candidate name, party] pairs in the metadata's candidate order,
  or null when no real party labels apply;
- party_source, and optional slates (members given by candidate name);
- official_winners by candidate name, with winners_source;
- date and max_ranks, each with a source.

Names, not numbers, are stored in labels.json so a reviewer can read it. This
script turns them into candidate numbers and stops with an error if any name
doesn't match the metadata exactly, or if the candidate order differs.

It also copies the seat count from each .ballots file into the metadata as
"seats", so every metadata file states it.

Run after convert.py and ers_tideman.py:  python3 data/preflib/add_parties.py
Standard library only. Running it twice gives the same result.
"""
import json
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / "ballots"
LABELS = json.loads((HERE / "labels.json").read_text())["elections"]


def main():
    used = set()
    counts = {"parties": 0, "slates": 0, "winners": 0, "date": 0, "max_ranks": 0}
    for jpath in sorted(OUT.glob("*.json")):
        meta = json.loads(jpath.read_text())
        stem = meta["preflib_file"].rsplit(".", 1)[0]
        bal = jpath.with_suffix(".ballots").read_text()
        meta["seats"] = int(re.search(r"^seats (\d+)$", bal, re.M).group(1))
        lab = LABELS.get(stem)
        if lab is None:
            if meta["preflib_dataset"] != "ers":
                sys.exit(f"{jpath.name}: no entry in labels.json")
        else:
            used.add(stem)
            cands = meta["candidates"]
            index = {c: i for i, c in enumerate(cands)}
            if lab["parties"] is not None:
                names = [c for c, _ in lab["parties"]]
                if names != cands:
                    sys.exit(f"{stem}: candidate order in labels.json differs from {jpath.name}")
                meta["parties"] = [p for _, p in lab["parties"]]
                meta["party_source"] = lab["party_source"]
                counts["parties"] += 1
            else:
                if lab.get("candidates", cands) != cands:
                    sys.exit(f"{stem}: candidate list in labels.json differs from {jpath.name}")
                meta["parties"] = None
                meta.pop("party_source", None)
            if lab.get("slates"):
                meta["slates"] = [dict(s, members=[index[m] for m in s["members"]]) for s in lab["slates"]]
                counts["slates"] += 1
            else:
                meta.pop("slates", None)
            if lab["official_winners"] is not None:
                meta["official_winners"] = sorted(index[w] for w in lab["official_winners"])
                if len(meta["official_winners"]) != meta["seats"]:
                    sys.exit(f"{stem}: {len(meta['official_winners'])} winners but {meta['seats']} seats")
                counts["winners"] += 1
            else:
                meta["official_winners"] = None
            meta["date"] = lab["date"]
            if lab["date"] and len(lab["date"]) == 10:
                counts["date"] += 1
            meta["max_ranks"] = lab["max_ranks"]
            if lab["max_ranks"] is not None:
                counts["max_ranks"] += 1
            meta["label_sources"] = {
                "official_winners": lab["winners_source"],
                "date": lab["date_source"],
                "max_ranks": lab["max_ranks_source"],
            }
            if lab.get("notes"):
                meta["label_notes"] = lab["notes"]
            else:
                meta.pop("label_notes", None)
        jpath.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n")
    missing = set(LABELS) - used
    if missing:
        sys.exit(f"labels.json entries with no metadata file: {sorted(missing)}")
    print(f"labelled {len(used)} elections: " + ", ".join(f"{k} {v}" for k, v in counts.items()))


if __name__ == "__main__":
    main()
