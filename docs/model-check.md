# Model check: simulated against real elections

**Status:** milestone 4, October 20, 2026. Model version 0.2 (`docs/model-spec.md`), with the fitted defaults built into the engine.

This page shows how well the voter model reproduces real elections. For each type of election, it takes a sample of real elections (up to 200) and simulates a **twin** of each one: an election with the same number of candidates, seats, and voters, the same ballot rules, and the same type of electorate (public voters or organization members). The engine writes the twins in the same format as the real ballots, and the same code measures both (`data/calibration.py`). The tables give the typical (median) value for real and simulated elections.

How the twins are set up:

- **Scottish wards** use tight slates, like parties. **Canberra** uses its real structure: parties that each run a full list, tightly. Every other election uses the model's defaults: 4 slates, each running about as many candidates as the seats it could win, and loose.
- **Write-in slots** on US ballots aren't counted as candidates.
- **Union and society (ERS) files** never show a ballot ranking every candidate: voters who ranked all but one had the last place implied, so the files leave it out. For organization elections, real and simulated ballots both count all but one as all.

To rerun: `python3 -I data/model_check.py data/fits/model-check.json --sample 200` (seconds to a minute). Results: `data/fits/model-check.json`.

## What matches

- **Ballot length:** the average number of ranks within about 0.1 to 0.3 in most types of election; the share ranking every candidate in Scotland (12% real, 12% model); the share who fill a limit (37% real, 33% model).
- **Slates in Scotland:** clustering above popularity (0.62 real, 0.61 model) and the share of candidates with a running mate.
- **The top candidate against the quota,** within about 10% in every type of election. This is what popularity is tuned to.
- **The last candidate** in four of six types.

## What doesn't, yet

- **The last candidate is too weak** in Scottish multi-seat wards (0.16 of an even split, model 0.07) and in organizational elections with 5 or more seats (0.24, model 0.08), the type closest to the owner's. The model spec lists an option for the owner: a share of standout candidates.
- **Evenness of votes leaving a party in Scotland** came out at 0.78 against a real 0.85 once popularity was tuned.
- **Canberra is a comparison only.** Only 9 public elections have 5 or more seats, mostly Canberra, where every party runs a full list. The owner judged these too unusual to tune to, so that type uses the 2-to-4-seat popularity settings, and its row shows how far Canberra sits from them. Canberra voters also go further past their instruction (6.7 ranks real, 5.4 model).
- **Organization, 1 seat** includes Debian, the American Psychological Association, and UK Labour, which the ballot-length fit doesn't use; their ballots run longer than the fit (3.6 real, 3.1 model).

## Tables

### Public, 1 seat (191 elections)

| Statistic | Real | Model |
|---|---|---|
| Top candidate's first choices, as a multiple of the quota | 0.88× | 0.90× |
| Top candidate, as a multiple of an even split | 1.94× | 1.86× |
| Last candidate, as a multiple of an even split | 0.25× | 0.22× |
| Average ballot length (ranks) | 2.28 | 2.25 |
| Share ranking every candidate | 22% | 16% |
| Share filling the ballot's limit | 36% | 33% |
| Clustering above popularity | 0.37 | – |
| Evenness of votes leaving a party or slate | 0.77 | 0.82 |
| Candidates with a running mate | 0% | 0% |
| Their party's or slate's only candidate | 86% | 75% |
| Candidates in no party or slate | 14% | 25% |

### Public, 2 to 4 seats (200 elections)

| Statistic | Real | Model |
|---|---|---|
| Top candidate's first choices, as a multiple of the quota | 1.33× | 1.31× |
| Top candidate, as a multiple of an even split | 2.07× | 2.09× |
| Last candidate, as a multiple of an even split | 0.16× | 0.07× |
| Average ballot length (ranks) | 3.08 | 3.14 |
| Share ranking every candidate | 11% | 12% |
| Clustering above popularity | 0.62 | 0.61 |
| Evenness of votes leaving a party or slate | 0.85 | 0.78 |
| Candidates with a running mate | 33% | 40% |
| Their party's or slate's only candidate | 45% | 29% |
| Candidates in no party or slate | 14% | 20% |

### Public, 5 or more seats (9 elections)

| Statistic | Real | Model |
|---|---|---|
| Top candidate's first choices, as a multiple of the quota | 1.05× | 0.95× |
| Top candidate, as a multiple of an even split | 3.57× | 4.19× |
| Last candidate, as a multiple of an even split | 0.07× | 0.04× |
| Average ballot length (ranks) | 6.68 | 5.41 |
| Share ranking every candidate | 6% | 1% |
| Clustering above popularity | 0.57 | 0.62 |
| Evenness of votes leaving a party or slate | 0.86 | 0.71 |
| Candidates with a running mate | 90% | 90% |
| Their party's or slate's only candidate | 0% | 4% |
| Candidates in no party or slate | 10% | 6% |

### Organization, 1 seat (41 elections)

| Statistic | Real | Model |
|---|---|---|
| Top candidate's first choices, as a multiple of the quota | 0.76× | 0.79× |
| Top candidate, as a multiple of an even split | 1.90× | 1.90× |
| Last candidate, as a multiple of an even split | 0.31× | 0.34× |
| Average ballot length (ranks) | 3.64 | 3.06 |
| Share ranking every candidate | 59% | 39% |
| Evenness of votes leaving a party or slate | – | 0.86 |
| Candidates with a running mate | – | 0% |
| Their party's or slate's only candidate | – | 80% |
| Candidates in no party or slate | – | 20% |

### Organization, 2 to 4 seats (49 elections)

| Statistic | Real | Model |
|---|---|---|
| Top candidate's first choices, as a multiple of the quota | 1.06× | 1.02× |
| Top candidate, as a multiple of an even split | 1.92× | 2.09× |
| Last candidate, as a multiple of an even split | 0.27× | 0.27× |
| Average ballot length (ranks) | 3.91 | 4.16 |
| Share ranking every candidate | 30% | 36% |
| Clustering above popularity | – | 0.14 |
| Evenness of votes leaving a party or slate | – | 0.85 |
| Candidates with a running mate | – | 0% |
| Their party's or slate's only candidate | – | 50% |
| Candidates in no party or slate | – | 25% |

### Organization, 5 or more seats (18 elections)

| Statistic | Real | Model |
|---|---|---|
| Top candidate's first choices, as a multiple of the quota | 2.11× | 2.10× |
| Top candidate, as a multiple of an even split | 3.05× | 3.12× |
| Last candidate, as a multiple of an even split | 0.23× | 0.08× |
| Average ballot length (ranks) | 6.77 | 6.87 |
| Share ranking every candidate | 22% | 26% |
| Clustering above popularity | – | 0.10 |
| Evenness of votes leaving a party or slate | – | 0.80 |
| Candidates with a running mate | – | 80% |
| Their party's or slate's only candidate | – | 0% |
| Candidates in no party or slate | – | 20% |
