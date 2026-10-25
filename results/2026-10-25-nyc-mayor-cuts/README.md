# NYC mayoral primaries with ballots cut short, October 25, 2026

The 2025 and 2021 Democratic mayoral primaries, recounted with every ballot cut after rank 1, 2, 3, 4, and 5 (NYC's limit).

**Command:** `python3 data/nyc/mayor_cuts.py results/2026-10-25-nyc-mayor-cuts`
**Data:** `data/nyc/ballots/2025-dem-mayor-citywide.ballots` and `2021-dem-mayor-citywide.ballots` (Board of Elections cast vote records; see `data/nyc/README.md`).
**Counting:** instant runoff. Write-ins go first, then the last-place candidate, one at a time, until two remain. NYC drops several hopeless candidates at once, which gives the same final round.
**Resampling:** 1,000 redraws of the ballots with replacement, seed 1.

## Check

With full ballots, the final rounds match the official counts: 2025 Mamdani 573,169, Cuomo 443,229, 55,332 ballots out of choices; 2021 Adams 404,513, Garcia 397,316.

## Results

| Cut after rank | 2025 winner's lead (points) | 2025 ran out of choices | 2021 winner's lead (points) | 2021 runner-up | 2021 ran out of choices |
|---:|---:|---:|---:|---|---:|
| 1 | 9.6 | 20.1% | 18.0 | Wiley | 47.9% |
| 2 | 12.0 | 11.6% | 8.8 | Garcia | 29.1% |
| 3 | 12.5 | 8.5% | 3.9 | Garcia | 20.7% |
| 4 | 12.7 | 6.8% | 1.8 | Garcia | 16.8% |
| 5 | 12.8 | 5.2% | 0.9 | Garcia | 14.9% |

The winner (Mamdani in 2025, Adams in 2021) is the same at every cutoff, and in all 1,000 redraws at every cutoff. The redraws move the lead by less than 0.2 points. Percentages are of ballots with at least one ranking.
