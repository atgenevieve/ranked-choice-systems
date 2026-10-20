"""Checks that the Rust engine counts exactly like the reference JavaScript counter.

Usage, from the project folder:
    python3 reference/validate.py

Requires Node.js and a release build of the engine.
"""
import glob
import json
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
    ballots = os.path.join(run, f"ballots_{key}.ballots")
    # The reference rules and surplus order (order of election) match decay.js.
    out = subprocess.run([engine, "count", "--rules", "reference", "--surplus-order", "election",
                          "--no-truncation", ballots], check=True, capture_output=True, text=True).stdout
    ref = list(map(float, open(ref_path).read().split()))
    got = json.loads(out)["reach_pct"]
    diff = max(abs(a - b) for a, b in zip(ref, got)) if len(ref) == len(got) else float("inf")
    worst = max(worst, diff)
    n += 1
    if diff > 1e-6:
        bad += 1
        print(f"MISMATCH {key}: largest difference {diff}")

print(f"{n - bad} of {n} elections match. Largest difference: {worst} percentage points.")
sys.exit(1 if bad else 0)
