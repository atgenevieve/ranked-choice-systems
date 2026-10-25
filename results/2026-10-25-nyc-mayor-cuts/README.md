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

## Simulated mayoral races

`mayor2025.toml` and `mayor2021.toml`: 1,000 simulated races each, shaped like the real ones (11 or 13 candidates, 1 seat, the real turnout give or take 10%, a ballot that allows up to 5 ranks, public voters, model version 0.2, seed 1). Engine commit `4f67a02` (branch `claude/project-thread-r2ofxj`). Command: `stvsim run mayor2025.toml > mayor2025.jsonl`. One seat counted with Scottish rules picks the same winner as instant runoff.

| Cut after rank | 2025-shaped races where the winner changes | 2021-shaped |
|---:|---:|---:|
| 1 | 5.2% | 5.5% |
| 2 | 2.5% | 2.4% |
| 3 | 1.6% | 1.3% |
| 4 | 0.7% | 0.6% |
| 5 | 0% | 0% |

95 of 100 simulated races are decided within the first 2 ranks. Caution: about 25% of simulated ballots run out of choices by the final round, against 5.2% (2025) and 14.9% (2021) in the real races, so the public-voter model ranks fewer candidates than NYC mayoral voters.

## Page

`page.html` is the source of the "NYC Mayoral Rank Depth" page (https://claude.ai/artifact/Hmfqf5qbAwJgXE7ePpzPt5), styled like the NYC DSA Branches page, with "Copy data" and "Copy as image" on every chart.
