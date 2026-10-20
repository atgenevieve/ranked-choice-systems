"""Checks that the engine's statistics (engine/src/stats.rs, used by the model tuner) match this
project's Python definitions (data/calibration.py and data/model_check.py) on the same ballot
files, so the tuner's numbers for simulated elections and the real-data numbers can't drift apart.

It compares them on Scottish wards (with parties), union and society elections (with ranking
all but one counted as all), and freshly simulated elections, and reports the largest
difference for each statistic. Python rounds some intermediate values to 4 decimal places, so
differences up to about 0.001 are expected.

Usage (from the repository root, with the engine built):
    python3 -I data/check_stats.py
"""
import glob
import json
import os
import random
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(ROOT)
sys.path.insert(0, ROOT)
import calibration  # noqa: E402  (this project's own scripts)
import model_check  # noqa: E402

ENGINE = os.path.join(REPO, "engine", "target", "release", "stvsim")
KEYS = ["quota", "even_top", "even_last", "length_mean", "complete", "fills_limit", "clustering", "evenness",
        "running_mate", "only_candidate", "no_slate"]
TOLERANCE = 0.002


def rust(files, merge):
    args = [ENGINE, "stats"] + (["--merge-last"] if merge else []) + files
    out = subprocess.run(args, check=True, capture_output=True, text=True).stdout
    return {json.loads(l)["file"]: json.loads(l)["stats"] for l in out.splitlines()}


def python(path, merge):
    res = calibration.analyze(path)
    meta = json.load(open(path[: -len(".ballots")] + ".json", encoding="utf-8"))
    return model_check.stats(res, meta, merge)


def compare(name, files, merge, worst):
    r = rust(files, merge)
    for f in files:
        p = python(f, merge)
        for k in KEYS:
            a, b = p.get(k), r[f].get(k)
            if a is None and b is None:
                continue
            if a is None or b is None:
                worst[k] = max(worst.get(k, 0), float("inf"))
                print(f"  {name}: {os.path.basename(f)} {k}: Python {a}, engine {b}")
                continue
            worst[k] = max(worst.get(k, 0), abs(a - b))


def main():
    rng = random.Random(3)
    worst = {}
    scot = sorted(glob.glob(os.path.join(ROOT, "scotland", "ballots", "*.ballots")))
    # Python merges one party alias (LabCo into Lab); leave those wards out.
    scot = [f for f in scot if "LabCo" not in json.load(open(f[: -len(".ballots")] + ".json", encoding="utf-8")).get("parties", [])]
    compare("Scotland", rng.sample(scot, 60), False, worst)
    ers = sorted(glob.glob(os.path.join(ROOT, "preflib", "ballots", "ers-*.ballots")))
    compare("ERS", rng.sample(ers, 30), True, worst)
    with tempfile.TemporaryDirectory() as folder:
        for c, s, kind in [(7, 3, "public"), (12, 5, "organization"), (30, 10, "organization"), (75, 46, "organization")]:
            path = os.path.join(folder, f"x{c}.toml")
            with open(path, "w", encoding="utf-8") as f:
                f.write(f'[run]\nname = "x{c}"\nseed = 5\nsims = 5\n\n[election]\ncandidates = {c}\nseats = [{s}]\nvoters = 800\nranks = {c}\n\n'
                        f'[electorate]\ntype = "{kind}"\n\n[ballot]\nwording = "up_to"\nn = {max(2, c // 2)}\n')
            subprocess.run([ENGINE, "generate", path, folder], check=True)
        compare("Simulated", sorted(glob.glob(os.path.join(folder, "*.ballots"))), False, worst)
    bad = {k: v for k, v in worst.items() if v > TOLERANCE}
    for k in KEYS:
        if k in worst:
            print(f"{k:16} largest difference {worst[k]:.6f}")
    if bad:
        sys.exit(f"MISMATCH: {sorted(bad)}")
    print("engine and Python statistics agree")


if __name__ == "__main__":
    main()
