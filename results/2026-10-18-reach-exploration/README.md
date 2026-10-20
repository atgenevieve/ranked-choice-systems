# Exploratory reach results, October 18–19, 2026

**Measure:** reach only. No truncation.
**Engine:** the version in `engine/` at the start of this project.
**Model:** draft 0.1 of `docs/model-spec.md`. 4 slates, slate loyalty 0.15, popularity spread 1.0, everyone ranks up to 100.

## Files

- `sweep.jsonl`: 10 to 100,000 candidates, 14 to 17 seat counts each. Elections per point: 1,000 (up to 100 candidates), 400 (300), 100 (1,000), 30 (3,000), 10 (10,000), 4 (30,000), 2 (100,000). Voters: 10 per candidate, at least 1,000.
- `huge.jsonl`: 1,000,000 candidates, 10,000,000 voters, 6 seat counts, 1 election each.
- `sens.jsonl`: sensitivity test at 1,000 candidates and 100 or 500 seats, 100 elections per point, changing one model setting at a time.

Each line holds the settings and, for thresholds of 20, 10, 5, 2, and 1 in 100 votes, the rank where reach drops below the threshold. See `engine/README.md` for field meanings. Some lines include `curve`, the average reach at each rank.

## Caution

With 1 to 3 seats and over 100 candidates, reach is still above most thresholds at rank 100, the ballot cap. Those results are cut off, not real answers.
