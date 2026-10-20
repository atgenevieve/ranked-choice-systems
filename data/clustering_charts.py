"""Builds the data for the clustering-strength charts (results/2026-10-20-clustering-strength/).

Usage (from the repository root, after clustering_table.py):
    python3 -I data/clustering_charts.py data/slate-review.json results/2026-10-20-clustering-strength/associations.csv <out.json>
"""
import csv
import json
import re
import sys

UNIONS_NYC = ["District Council 37", "New York State Nurses Association", "UAW Region 9A", "UNITE HERE Local 100"]


def place_key(place):
    return {"New York City": "nyc", "Portland, OR": "portland", "Scotland": "scotland"}.get(place, "other")


def office(race):
    """Short office name from an election title."""
    r = re.sub(r"^NYC \d{4} primary, (DEM|REP) ", "", race)
    r = re.sub(r"^Portland, OR \d{4} general, ", "", r)
    r = r.replace("Council Member ", "Council ").replace(" Council District", "")
    r = re.sub(r"(\d+)(st|nd|rd|th)\b", r"District \1", r)
    r = r.replace("Borough President Kings", "Brooklyn Borough President").replace("Borough President New York", "Manhattan Borough President")
    r = re.sub(r"^\d{4} ", "", r)
    r = r.replace("Mayor Citywide", "Mayor").replace("Comptroller Citywide", "Comptroller").replace("Councilor, District", "Council District")
    return r


def main():
    review, assoc, out = sys.argv[1:4]
    rows = list(csv.DictReader(open(assoc, encoding="utf-8")))
    items = []
    for r in rows:
        race = r["race"]
        if r["place"] == "Scotland":
            label, sub = r["named_by"], "Scotland 2007–2022 · all wards with 2+ candidates"
        else:
            named = r["named_by"]
            label = r["members"].replace(" · ", " & ") if named.startswith("(") or r["type"] == "Candidate pact" else named
            sub = f"{r['place'].replace(', OR', '')} {r['year']} · {office(race)}"
        items.append({"type": r["type"], "label": label, "sub": sub, "place": place_key(r["place"]),
                      "x": float(r["excess_points"]), "observed": float(r["observed"]),
                      "popularity": float(r["popularity_alone"]), "voters": int(r["voters"]),
                      "members": r["members"], "named_by": r["named_by"]})
    # NYC endorsing organizations, one entry per organization's slate (not merged).
    d = json.load(open(review, encoding="utf-8"))
    orgs = []
    for e in d["elections"]:
        if e["place"] != "New York City":
            continue
        for g in e["groupings"]:
            if g["kind"] != "endorsement":
                continue
            org = re.sub(r" \(.*\)$", "", g["name"])
            orgs.append({"org": org, "label": g["name"], "sub": f"NYC {e['year']} · {office(e['election'])}",
                         "place": "nyc", "x": round(100 * (g["observed"] - g["popularity"]), 1),
                         "observed": g["observed"], "popularity": g["popularity"], "voters": g["voters"],
                         "members": " · ".join(g["members"]), "named_by": g["name"], "type": "Endorsing organization"})
    json.dump({"items": items, "nyc_orgs": orgs, "unions_nyc": UNIONS_NYC}, open(out, "w", encoding="utf-8"), ensure_ascii=False)
    print(len(items), "groupings,", len(orgs), "NYC organization slates")


if __name__ == "__main__":
    main()
