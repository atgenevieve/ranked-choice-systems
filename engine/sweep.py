"""Run simulator configurations in order, appending one JSON line per result.

Resumable: configurations already present in the output file are skipped.
Usage: python3 sweep.py <plan: sens|sweep|huge> <out.jsonl>
"""
import json
import os
import subprocess
import sys
import tempfile

BIN = os.path.join(os.path.dirname(os.path.abspath(__file__)), "target", "release", "stvsim")
plan, out = sys.argv[1], sys.argv[2]


def key(cands, seats, voters, ranks, slates, loyalty, spread):
    return (cands, seats, voters, min(ranks, cands), slates, loyalty, spread)


done = set()
if os.path.exists(out):
    for line in open(out):
        try:
            d = json.loads(line)
            e, m = d["settings"]["election"], d["settings"]["model"]
            done.add(key(e["candidates"], d["seats"], e["voters"], e["ranks"], m["slates"], m["slate_loyalty"], m["popularity_spread"]))
        except Exception:
            pass


def run(cands, seats_list, sims, voters=None, ranks=100, factions=4, rho=0.15, pop=1.0, threads=2, curve=0, truncation=False):
    voters = voters or max(1000, 10 * cands)
    todo = [s for s in seats_list if 0 < s < cands and key(cands, s, voters, ranks, factions, rho, pop) not in done]
    if not todo:
        return
    settings = f"""[run]
name = "{plan}"
sims = {sims}
threads = {threads}
truncation = {str(truncation).lower()}
curve_ranks = {curve}

[election]
candidates = {cands}
seats = {todo}
voters = {voters}
ranks = {ranks}

[model]
slates = {factions}
slate_loyalty = {rho}
popularity_spread = {pop}
"""
    with tempfile.NamedTemporaryFile("w", suffix=".toml", delete=False) as f:
        f.write(settings)
    cmd = [BIN, "run", f.name]
    with subprocess.Popen(cmd, stdout=subprocess.PIPE, text=True) as p:
        for line in p.stdout:
            d = json.loads(line)
            with open(out, "a") as fo:
                fo.write(line)
            print(f"{cands} cands, {d['seats']} seats, f={factions} rho={rho} pop={pop} v={voters}: 5%={d['reach']['t5']['avg']} ({d['secs']:.0f}s)", flush=True)
    os.unlink(f.name)
    if p.returncode != 0:
        print(f"FAILED: {settings} exit {p.returncode}", flush=True)


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
