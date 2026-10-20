# Engine counts of real elections, October 20, 2026

The engine's `count` command run on every real election in `data/` with ballots: whole-electorate truncation at every cutoff rank, reach, and exhaustion.

**Rules:** Scottish (5 decimal places, look-back tie-breaking, lot, seed 1), for every source. NYC and Portland's single-seat races officially use instant runoff (IRV), which picks the same winner as one-seat STV except in rare tie cases. Portland's 3-seat races use Portland's own STV rules, which differ from Scottish rules in rounding details.
**Engine:** version 0.2.0, commit `083c0e0`.
**Command:** `engine/target/release/stvsim count data/<source>/ballots/*.ballots > <source>.jsonl`

## Files

- `nyc.jsonl`: 126 NYC primary contests, 2021, 2023, and 2025.
- `portland.jsonl`: 6 Portland 2024 contests (four 3-seat council districts, mayor, and auditor).
- `preflib.jsonl`: 168 PrefLib elections, the set studied by Tomlinson, Ugander, and Kleinberg. **Superseded by `preflib-v2.jsonl`:** this first run counted the 87 ERS elections as 1 seat and used PrefLib's padded ballots.
- `preflib-v2.jsonl`: the same 168 elections after the metadata update: real ERS seat counts (1 to 12) and original ERS ballots from Tideman's files. Same engine commit.
- `nyc-v2.jsonl`, `portland-v2.jsonl`: rerun after the metadata update (NYC: one more official winner; Portland: corrected write-in rule, which renumbered two candidates in Districts 3 and 4). These supersede `nyc.jsonl` and `portland.jsonl`. Same engine commit. Official winners match in 125 of 125 NYC contests and 6 of 6 Portland contests.
- `scotland.jsonl`: 1,100 Scottish council ward elections, 2007 to 2022, including by-elections.

`engine/README.md` explains the fields.

## Check against official results

The engine picked the officially declared winners in **all 1,223 elections that have them**: 1,093 Scottish wards, 124 NYC contests, and 6 Portland contests. Scottish wards are the strongest check, because they use the same Scottish rules the engine follows, with multiple seats and surplus transfers. PrefLib: the engine picks the official winner in 65 of the 68 elections that have one (`preflib-v2.jsonl`). The 3 misses are expected, because those elections used different rules: Aspen's 2009 council race used Aspen's own two-seat rules, and Debian's 2003 and 2006 leader votes used a Condorcet method (head-to-head comparisons).

Two Scottish elections have disputed official winners and are left out of the check: Falkirk 2017 Ward 6 (Democracy Club and Wikipedia disagree) and the Glasgow 2021 Partick East–Kelvindale by-election (Democracy Club names the SNP candidate, but the engine and the Scotland agent's separate count both elect Labour's Jill Brown). The councils' own declarations would settle them.

## Truncation, first look

How many elections had a cutoff rank above 1, meaning cutting ballots after rank 1 changed the winners:

| Source | Elections | Cutoff rank 1 | Cutoff rank 2 or more | Deepest cutoff rank |
|---|---|---|---|---|
| NYC | 126 | 123 | 3 | 4 |
| Portland | 6 | 5 | 1 (District 4, 3 seats, 31 candidates) | 3 |
| PrefLib (v2) | 168 | 130 | 38 | 14 |
| Scotland | 1,100 | 810 | 290 | 7 |

Cautions:

- **Most NYC contests are lopsided or uncontested,** so the first-choice leader wins and cutoff rank 1 is common.
- **The 87 PrefLib ERS elections** are organizational elections with 1 to 12 seats. They hold the deepest PrefLib cutoffs (14, 9, 7, 6).
- These numbers feed milestone 6 (reproducing published findings), not the report.

## Exhaustion in Scotland, and an open question

Median across Scottish wards: 46% of ballots ran out of candidates still in the race at some point, and 15.8% of voting weight was lost that way (10th to 90th percentile: 3.7% to 23.3%).

McCune and Naber report about 28% of ballots and 7% of voting weight. The engine's measure is wider: it counts a ballot as run out even when only the fraction left over from a surplus transfer had nowhere to go, and it stops counting when the last seat fills. Matching their definition exactly is part of milestone 6.
