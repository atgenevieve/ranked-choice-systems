"""Checks the engine's Meek STV against a plain, independent Meek count.

The engine's Meek count stops adjusting keep shares as soon as the rest can't change the next
step, and starts recounts from an earlier count's keep shares. This script's count does neither:
it adjusts until every winner is within a hundred-billionth of a vote per voter of the quota,
then decides. Decisions that fall within a millionth of a vote would go to lot, which the two
counts draw differently, so they are skipped.

Usage, from the project folder:
    python3 reference/validate_meek.py

Requires a release build of the engine. Simulates 240 small elections (8 to 20 candidates)
and compares the winners with full ballots and with ballots cut after every rank.
"""
import glob
import json
import os
import subprocess
import sys
import tempfile

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
engine = os.path.join(root, "engine", "target", "release", "stvsim" + (".exe" if os.name == "nt" else ""))
if not os.path.exists(engine):
    sys.exit("Build the engine first: cd engine && cargo build --release")


def read(path):
    c = s = None
    ballots = []
    for line in open(path):
        p = line.split()
        if not p or p[0].startswith("#"):
            continue
        if p[0] == "candidates":
            c = int(p[1])
        elif p[0] == "seats":
            s = int(p[1])
        else:
            ballots.append((int(p[0]), [int(x) for x in p[1:]]))
    return c, s, ballots


def meek(c, seats, ballots, limit):
    """Winners (sorted), reading only the first `limit` ranks, or None if lot would decide."""
    v = sum(m for m, _ in ballots)
    near = 1e-6
    hopeful, keep, elected = set(range(c)), [1.0] * c, []
    while True:
        for _ in range(100000):
            votes, gone = [0.0] * c, 0.0
            for m, b in ballots:
                left = 1.0
                for x in b[:limit]:
                    votes[x] += m * left * keep[x]
                    left *= 1 - keep[x]
                gone += m * left
            q = (v - gone) / (seats + 1)
            if sum(abs(votes[e] - q) for e in elected) < 1e-11 * v:
                break
            for e in elected:
                keep[e] = min(1.0, keep[e] * q / votes[e])
        if len(elected) >= seats:
            return sorted(elected)
        if any(abs(votes[x] - q) < near for x in hopeful):
            return None
        over = sorted((x for x in hopeful if votes[x] > q), key=lambda x: -votes[x])
        left = seats - len(elected)
        if over:
            if len(over) > left and votes[over[left - 1]] - votes[over[left]] < near:
                return None
            for x in over[:left]:
                hopeful.remove(x)
                elected.append(x)
            continue
        if len(hopeful) + len(elected) <= seats:
            return sorted(elected + list(hopeful))
        low = sorted(hopeful, key=lambda x: votes[x])
        if votes[low[1]] - votes[low[0]] < near:
            return None
        hopeful.remove(low[0])
        keep[low[0]] = 0.0


with tempfile.TemporaryDirectory() as run:
    files = []
    for c, seats, voters in [(8, "2, 3, 4", 60), (12, "3, 5, 8", 150), (20, "6, 10, 14", 120)]:
        settings = os.path.join(run, f"meek-{c}.toml")
        with open(settings, "w") as f:
            f.write(f'[run]\nname = "meek{c}"\nseed = 7\nsims = 40\n[election]\ncandidates = {c}\n'
                    f'seats = [{seats}]\nvoters = {voters}\n[electorate]\ntype = "organization"\n'
                    '[ballot]\nwording = "up_to"\nn = "seats"\npull = 0.1\n')
        subprocess.run([engine, "generate", settings, os.path.join(run, f"e{c}")], check=True, capture_output=True)
        files += sorted(glob.glob(os.path.join(run, f"e{c}", "*.ballots")))
    out = subprocess.run([engine, "count", "--system", "meek_stv", *files], check=True, capture_output=True, text=True).stdout
    same = differ = skipped = 0
    for path, line in zip(files, out.splitlines()):
        got = json.loads(line)
        c, seats, ballots = read(path)
        longest = max(len(b) for _, b in ballots)
        pairs = [(meek(c, seats, ballots, longest), got["winners"])]
        pairs += [(meek(c, seats, ballots, k), got["winners_at"][k - 1]) for k in range(1, longest + 1)]
        for want, have in pairs:
            if want is None:
                skipped += 1
            elif want == sorted(have):
                same += 1
            else:
                differ += 1
                print(f"MISMATCH {os.path.basename(path)}: expected {want}, engine {sorted(have)}")

print(f"{same} of {same + differ} counts match ({skipped} skipped: lot would decide).")
sys.exit(1 if differ else 0)
