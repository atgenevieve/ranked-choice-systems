# Simulation engine

A fast simulator for Scottish-style STV, written in Rust. For each simulated election it measures **reach**: for every rank on the ballot, the share of all votes that traveled that far down.

## Build

Install Rust from https://rustup.rs, then from this folder:

```
cargo build --release
```

The program is created at `target/release/stvsim`.

## Run

```
target/release/stvsim --cands 1000 --seats 100,500 --sims 100 --curve 60
```

| Flag | Meaning | Default |
|---|---|---|
| `--cands` | Number of candidates | 100 |
| `--seats` | Seat counts to test, comma-separated | 10 |
| `--sims` | Simulated elections per seat count | 100 |
| `--voters` | Ballots per election | 10 × candidates, at least 1,000 |
| `--ranks` | Ballot length cap | 100 |
| `--factions` | Number of slates | 4 |
| `--rho` | Slate loyalty (see model spec) | 0.15 |
| `--pop` | Popularity spread (see model spec) | 1.0 |
| `--seed` | Starting value for random numbers | 1 |
| `--threads` | Processor cores to use | all |
| `--curve` | How many ranks of the average reach curve to print | 0 |
| `--fifo` | Move surpluses in order of election instead of largest first. Only for validation | off |
| `--ballots-file` | Count ballots from a file instead of simulating. Used by validation | — |

Output is one line of JSON per seat count. For each threshold (20, 10, 5, 2, and 1 in 100 votes), it gives the rank where reach drops below the threshold:

- `avg`: read from the average curve across all simulated elections.
- `p10`, `p50`, `p90`: the 10th, 50th, and 90th percentile across elections, so 8 in 10 elections fall between `p10` and `p90`.
- `censored`: how many elections never dropped below the threshold within the ballot cap. If this isn't 0, the true answer is deeper than `--ranks`.

## Sweeps

`sweep.py` runs groups of settings and appends results to a file. It skips settings already in the file, so you can stop and restart it.

```
python3 sweep.py sens sens.jsonl     # sensitivity test at 1,000 candidates
python3 sweep.py sweep sweep.jsonl   # 10 to 100,000 candidates
python3 sweep.py huge huge.jsonl     # 1,000,000 candidates (slow: about 8 minutes per run on one core)
```

Milestone 1 replaces this with settings files.

## Speed and memory

Measured on a 2-core cloud machine:

| Candidates | Voters | Seconds per election | Peak memory |
|---|---|---|---|
| 1,000 | 10,000 | 0.3 | small |
| 10,000 | 100,000 | 2 | small |
| 100,000 | 1,000,000 | 23 | about 450 MB |
| 1,000,000 | 10,000,000 | about 450 | several GB |

Elections run in parallel, one per core, so a laptop with 8 to 12 cores runs sweeps 4 to 6 times faster.
