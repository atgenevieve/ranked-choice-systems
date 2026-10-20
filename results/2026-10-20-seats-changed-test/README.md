# Seats-changed test sweep, October 20, 2026

The same settings as `../2026-10-20-truncation-test/`, rerun after adding the **seats changed** measure: how many seats go to a different candidate when every ballot is cut after rank *k*. This is a **test of the engine, not a finding.** The model still has every voter rank every candidate, which real voters don't do, so don't quote these numbers.

**Rules:** Scottish. **Engine:** version 0.2.0, commit `083c0e0`. **Model:** draft 0.1 (4 slates, slate loyalty 0.15, popularity spread 1.0, everyone ranks every candidate).

## Files

- `test-30.jsonl`, settings `test-truncation.toml`: 30 candidates, 200 elections per seat count.
- `test-100.jsonl`, settings `test-truncation-100.toml`: 100 candidates, 100 elections per seat count.

## Average seats changed

Average number of seats, across simulated elections, that go to a different candidate when only the first *k* ranks count:

| Candidates | Seats | Keep 1 rank | Keep 3 | Keep 5 | Keep 10 | Keep 20 |
|---|---|---|---|---|---|---|
| 30 | 1 | 0.35 | 0.26 | 0.17 | 0.06 | 0.00 |
| 30 | 3 | 0.69 | 0.39 | 0.24 | 0.09 | 0.01 |
| 30 | 6 | 0.85 | 0.49 | 0.29 | 0.10 | 0.01 |
| 30 | 10 | 0.98 | 0.65 | 0.44 | 0.17 | 0.01 |
| 30 | 15 | 1.30 | 0.69 | 0.53 | 0.20 | 0.04 |
| 30 | 20 | 1.41 | 0.83 | 0.56 | 0.26 | 0.04 |
| 30 | 27 | 1.06 | 0.78 | 0.57 | 0.33 | 0.08 |
| 100 | 1 | 0.41 | 0.38 | 0.31 | 0.18 | 0.09 |
| 100 | 3 | 0.74 | 0.57 | 0.42 | 0.29 | 0.16 |
| 100 | 5 | 1.01 | 0.62 | 0.53 | 0.32 | 0.19 |
| 100 | 10 | 1.60 | 1.03 | 0.73 | 0.48 | 0.20 |
| 100 | 20 | 2.68 | 1.63 | 1.13 | 0.58 | 0.28 |
| 100 | 30 | 3.32 | 1.86 | 1.36 | 0.66 | 0.10 |
| 100 | 50 | 4.47 | 2.57 | 1.88 | 0.78 | 0.22 |
| 100 | 70 | 4.90 | 2.88 | 1.87 | 0.98 | 0.13 |
| 100 | 90 | 4.28 | 2.94 | 2.43 | 1.80 | 1.03 |

## What it suggests, for discussion only

In large multi-seat elections, deep ranks often change *some* seat, but usually only one or two. With 100 candidates and 50 seats, keeping 10 ranks changes the winners in many elections, but on average fewer than 1 seat out of 50 moves. The report should show both: how often the result changes, and how much.
