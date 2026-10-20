# Truncation test sweep, October 20, 2026

The first truncation results. This is a **test of the engine, not a finding.** The model still has every voter rank every candidate, which real voters don't do, so don't quote these numbers.

**Measures:** reach and whole-electorate truncation.
**Rules:** Scottish (5 decimal places, look-back tie-breaking, lot).
**Engine:** version 0.2.0, commit `afedb05`.
**Model:** draft 0.1 of `docs/model-spec.md`. 4 slates, slate loyalty 0.15, popularity spread 1.0, everyone ranks every candidate.

## Files

- `test-30.jsonl`: 30 candidates, 1,000 voters, 200 elections per seat count, 7 seat counts. Settings: `test-truncation.toml`.
- `test-100.jsonl`: 100 candidates, 1,000 voters, 100 elections per seat count, 9 seat counts. Settings: `test-truncation-100.toml`.

`engine/README.md` explains the fields. To reproduce: `stvsim run <settings file>` with the engine at the commit above.

## What it shows about the engine

- Truncation runs fast: 900 elections of 100 candidates, each checked at every cutoff rank, took 5 seconds on 4 cores.
- Exhaustion is 0, as expected when every voter ranks every candidate.

## Early pattern, for discussion only

With this model, truncation reaches deeper than reach suggests, in a different way:

| Candidates | Seats | Reach drops below 5 in 100 votes | Truncation changes winners in under 5 in 100 elections | Typical cutoff rank (middle 8 in 10 elections) |
|---|---|---|---|---|
| 30 | 1 | rank 12 | rank 11 | 1 to 8 |
| 30 | 10 | rank 8 | rank 16 | 1 to 13 |
| 100 | 1 | rank 29 | rank 25 | 1 to 18 |
| 100 | 10 | rank 15 | rank 47 | 4 to 36 |
| 100 | 50 | rank 11 | rank 33 | 9 to 25 |

In multi-seat elections, a small share of votes reaching deep ranks can still swap one close seat. Truncation counts any change to the set of winners, however small, so it's sensitive to this. Two questions for later:

- Should the report also measure how many seats change, not only whether any seat changes? (Owner: yes. Added to the engine after this run; see `../2026-10-20-seats-changed-test/`.)
- How much of this goes away once voters rank only a few candidates, as real voters do?
