"""Checks the engine's expanding approvals rule against a plain, independent version.

The engine keeps running totals of each candidate's support. This script recomputes every
total from scratch at every step, and breaks ties with the same random draw as the engine, so
every count must match exactly.

Usage, from the project folder:
    python3 reference/validate_expanding.py

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

M = (1 << 64) - 1


def lots(seed, c):
    """The engine's draw for ties (engine/src/rng.rs, seeded with the count's lot seed)."""
    rotl = lambda x, k: ((x << k) | (x >> (64 - k))) & M
    s, st = seed, []
    for _ in range(4):
        s = (s + 0x9E3779B97F4A7C15) & M
        z = ((s ^ (s >> 30)) * 0xBF58476D1CE4E5B9) & M
        z = ((z ^ (z >> 27)) * 0x94D049BB133111EB) & M
        st.append(z ^ (z >> 31))
    out = []
    for _ in range(c):
        out.append((rotl((st[1] * 5) & M, 7) * 9) & M)
        t = (st[1] << 17) & M
        st[2] ^= st[0]; st[3] ^= st[1]; st[1] ^= st[2]; st[0] ^= st[3]; st[2] ^= t
        st[3] = rotl(st[3], 45)
    return out


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


def expanding(c, seats, ballots, limit, lot):
    """Winners (sorted), reading only the first `limit` ranks."""
    v = sum(m for m, _ in ballots)
    quota = v // (seats + 1) + 1
    left = [1.0] * len(ballots)
    hopeful, elected = set(range(c)), []

    def support(x, depth):
        return sum(m * left[i] for i, (m, b) in enumerate(ballots) if x in b[:depth])

    def elect(x, depth, share):
        hopeful.remove(x)
        elected.append(x)
        for i, (m, b) in enumerate(ballots):
            if x in b[:depth]:
                left[i] -= left[i] * share

    depth = 0
    for depth in range(1, limit + 1):
        while len(elected) < seats and hopeful:
            best = max(hopeful, key=lambda x: (support(x, depth), lot[x]))
            s = support(best, depth)
            if s < quota - 1e-9 * quota:
                break
            elect(best, depth, min(1.0, quota / s))
    while len(elected) < seats and hopeful:
        best = max(hopeful, key=lambda x: (support(x, limit), lot[x]))
        elect(best, limit, 1.0)
    return sorted(elected)


with tempfile.TemporaryDirectory() as run:
    files = []
    for c, seats, voters in [(8, "2, 3, 4", 60), (12, "3, 5, 8", 150), (20, "6, 10, 14", 120)]:
        settings = os.path.join(run, f"ear-{c}.toml")
        with open(settings, "w") as f:
            f.write(f'[run]\nname = "ear{c}"\nseed = 7\nsims = 40\n[election]\ncandidates = {c}\n'
                    f'seats = [{seats}]\nvoters = {voters}\n[electorate]\ntype = "organization"\n'
                    '[ballot]\nwording = "up_to"\nn = "seats"\npull = 0.1\n')
        subprocess.run([engine, "generate", settings, os.path.join(run, f"e{c}")], check=True, capture_output=True)
        files += sorted(glob.glob(os.path.join(run, f"e{c}", "*.ballots")))
    out = subprocess.run([engine, "count", "--system", "expanding_approvals", *files], check=True, capture_output=True, text=True).stdout
    same = differ = 0
    for path, line in zip(files, out.splitlines()):
        got = json.loads(line)
        c, seats, ballots = read(path)
        lot = lots(got["lot_seed"], c)
        longest = max(len(b) for _, b in ballots)
        pairs = [(expanding(c, seats, ballots, longest, lot), got["winners"])]
        pairs += [(expanding(c, seats, ballots, k, lot), got["winners_at"][k - 1]) for k in range(1, longest + 1)]
        for want, have in pairs:
            if want == sorted(have):
                same += 1
            else:
                differ += 1
                print(f"MISMATCH {os.path.basename(path)}: expected {want}, engine {sorted(have)}")

print(f"{same} of {same + differ} counts match.")
sys.exit(1 if differ else 0)
