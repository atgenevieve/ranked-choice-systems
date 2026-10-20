"""Run simulator configurations in order, appending one JSON line per result.

Resumable: configurations already present in the output file are skipped.
Usage: python3 sweep.py <plan: sens|sweep|huge> <out.jsonl>
"""
import json
import os
import subprocess
import sys

BIN = os.path.join(os.path.dirname(os.path.abspath(__file__)), "target", "release", "stvsim")
plan, out = sys.argv[1], sys.argv[2]


def key(d):
    return (d["cands"], d["seats"], d.get("voters"), d.get("ranks"), d.get("factions", 4), d.get("rho", 0.15), d.get("pop", 1.0))


done = set()
if os.path.exists(out):
    for line in open(out):
        try:
            done.add(key(json.loads(line)))
        except Exception:
            pass


def run(cands, seats_list, sims, voters=None, ranks=100, factions=4, rho=0.15, pop=1.0, threads=2, curve=0):
    voters = voters or max(1000, 10 * cands)
    todo = [s for s in seats_list if 0 < s < cands and (cands, s, voters, min(ranks, cands), factions, rho, pop) not in done]
    if not todo:
        return
    cmd = [BIN, "--cands", str(cands), "--seats", ",".join(map(str, todo)), "--sims", str(sims), "--voters", str(voters),
           "--ranks", str(ranks), "--factions", str(factions), "--rho", str(rho), "--pop", str(pop), "--threads", str(threads),
           "--curve", str(curve)]
    with subprocess.Popen(cmd, stdout=subprocess.PIPE, text=True) as p:
        for line in p.stdout:
            d = json.loads(line)
            d.update(factions=factions, rho=rho, pop=pop)
            with open(out, "a") as f:
                f.write(json.dumps(d) + "\n")
            print(f"{d['cands']} cands, {d['seats']} seats, f={factions} rho={rho} pop={pop} v={voters}: 5%={d['t5']['avg']} ({d['secs']:.0f}s)", flush=True)
    if p.returncode != 0:
        print(f"FAILED: {' '.join(cmd)} exit {p.returncode}", flush=True)


SHARES = [0.01, 0.02, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99]


def seats_for(c):
    s = {1, 2, 3}
    for f in SHARES:
        s.add(max(1, round(c * f)))
    return sorted(x for x in s if x < c)


if plan == "sens":
    C, seats = 1000, [100, 500]
    run(C, seats, 100, curve=60)                      # baseline: 4 slates, rho .15, pop 1
    for rho in [0.0, 0.05, 0.4, 1.0]:                 # slate loyalty (1.0 = slates mean nothing)
        run(C, seats, 100, rho=rho, curve=60)
    for f in [1, 2, 8, 16]:                           # number of slates
        run(C, seats, 100, factions=f, curve=60)
    for pop in [0.0, 0.5, 2.0]:                       # popularity spread (0 = all equally popular)
        run(C, seats, 100, pop=pop, curve=60)
    for v in [3000, 30000]:                           # voters per candidate
        run(C, seats, 100, voters=v, curve=60)
elif plan == "sweep":
    for c, sims in [(10, 1000), (30, 1000), (100, 1000), (300, 400), (1000, 100), (3000, 30), (10000, 10), (30000, 4), (100000, 2)]:
        run(c, seats_for(c), sims, curve=100)
elif plan == "huge":
    c = 1_000_000
    for s in [10_000, 100_000, 300_000, 500_000, 700_000, 900_000]:
        run(c, [s], 1, threads=1, curve=100)
