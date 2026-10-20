"""Checks that the Rust engine counts exactly like the reference JavaScript counter.

Usage, from the project folder:
    python3 reference/validate.py

Requires Node.js and a release build of the engine.
"""
import glob
import os
import subprocess
import sys

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
run = os.path.join(root, "validation-run")
engine = os.path.join(root, "engine", "target", "release", "stvsim" + (".exe" if os.name == "nt" else ""))

if not os.path.exists(engine):
    sys.exit("Build the engine first: cd engine && cargo build --release")

subprocess.run(["node", os.path.join(root, "reference", "make_tests.js"), run], check=True)

worst, n, bad = 0.0, 0, 0
for ref_path in sorted(glob.glob(os.path.join(run, "reference_*.txt"))):
    key = os.path.basename(ref_path)[len("reference_"):-4]
    seats = key.split("_")[1]
    ballots = os.path.join(run, f"ballots_{key}.txt")
    # --fifo matches the reference's surplus order (order of election)
    out = subprocess.run([engine, "--ballots-file", ballots, "--seats", seats, "--fifo"],
                         check=True, capture_output=True, text=True).stdout
    ref = list(map(float, open(ref_path).read().split()))
    got = list(map(float, out.split()))
    diff = max(abs(a - b) for a, b in zip(ref, got)) if len(ref) == len(got) else float("inf")
    worst = max(worst, diff)
    n += 1
    if diff > 1e-6:
        bad += 1
        print(f"MISMATCH {key}: largest difference {diff}")

print(f"{n - bad} of {n} elections match. Largest difference: {worst} percentage points.")
sys.exit(1 if bad else 0)
