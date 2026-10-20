# Portland, Oregon 2024

In November 2024, Portland held its first ranked-choice elections. The new city council has four districts that each elect 3 members by single transferable vote (STV), a multi-winner ranked system. The mayor and auditor are elected by single-winner instant runoff. Voters could rank up to 6 candidates. This folder holds all six contests, converted to the project's ballot format (`docs/ballot-format.md`).

## Source

- **Ballot data:** Multnomah County Elections, which runs Portland's elections, posts one cast vote record (CVR) CSV per contest. A CVR lists every ballot's marks with no voter information. The links are on https://multco.us/info/turnout-and-statistics-november-2024-general-election and point to Google Drive files; `download.py` fetches them through Google Drive's direct-download address.
- **Official results:** https://rcvresults.multco.us/, the "Final Results" report for each contest (certified December 2, 2024). For each contest `download.py` saves the summary JSON written by RCTab, the counting software, and the detailed CSV report into `raw/official/`.
- **Counting rules:** Portland City Code chapter 2.08, https://www.portland.gov/code/2/08 (read October 2026).
- **Downloaded:** 2026-10-20. `raw/MANIFEST.json` records URLs, sizes, and SHA-256 checksums.
- **Terms of use:** public records published by Multnomah County for anyone to download. We found no license or usage terms. Cite Multnomah County Elections Division as the source.

Portland reaches into Washington and Clackamas counties. The official results are labeled "Consolidated Multnomah County, Washington County, and Clackamas County", and the CVR totals match them (see below), so the CVR covers all three counties.

## Contents

6 contests, 780,037 ballots (counting each voter once per contest), 2.7 MB. All of it is committed.

| Contest | Seats | `system` | Ballots | Distinct rankings | Blank | Official winners |
| --- | ---: | --- | ---: | ---: | ---: | --- |
| Council District 1 | 3 | `portland-stv` | 42,881 | 18,897 | 12,258 | Candace Avalos, Jamie Dunphy, Loretta Smith |
| Council District 2 | 3 | `portland-stv` | 77,163 | 41,109 | 10,916 | Sameer Kanal, Dan Ryan, Elana Pirtle-Guiney |
| Council District 3 | 3 | `portland-stv` | 84,520 | 40,704 | 13,434 | Steve Novick, Angelita Morillo, Tiffany Koyama Lane |
| Council District 4 | 3 | `portland-stv` | 76,720 | 38,257 | 15,077 | Olivia Clark, Mitch Green, Eric Zimmerman |
| Mayor | 1 | `irv` | 310,014 | 53,006 | 22,955 | Keith Wilson |
| Auditor | 1 | `irv` | 188,739 | 4 | 144,230 | Simone Rede (unopposed) |

`official_winners` lists winners in the order they were elected. `parties` is `null`, because the county lists every candidate as "NON" (nonpartisan). Each metadata file has an extra field `max_ranks` (6).

### What `portland-stv` means

From City Code 2.08.030:

- **Quota (threshold):** the active votes in round 1, divided by seats + 1, plus 1, ignoring fractions (the Droop quota). It is set once, in round 1.
- **Surplus:** when a candidate passes the threshold, every ballot counting for them moves on to its next active candidate at a reduced value: its current value times (votes − threshold) ÷ votes. Values are cut (not rounded) to 4 decimal places. If several candidates pass the threshold in the same round, their surpluses move at the same time.
- **Elimination:** one candidate at a time, the one with the fewest votes. Ties are broken by lot.
- **End:** when all seats are filled, or when the elected plus remaining candidates don't exceed the seats, in which case all remaining are elected.

## How to rebuild

```
python3 data/portland/download.py    # about 700 MB into data/portland/raw/
python3 data/portland/convert.py     # writes data/portland/ballots/
```

Standard library only. Nothing downloaded is executed.

## Cleanup rules

From City Code 2.08:

- **Overvote** (two or more candidates marked at the same rank): that rank is skipped and the ballot goes on to its next rank (2.08.030.A.4 and 2.08.010.G). This differs from NYC, where an overvote ends the ballot.
- **Skipped rank:** passed over; the next marked rank counts (2.08.030.A.3).
- **Repeated candidate:** the code doesn't address it. We count the candidate at their highest rank and pass over later repeats. This is the usual tabulator setting, but we haven't seen Portland's RCTab settings.
- **Write-ins:** only write-ins for people on the City's certified write-in list count for that person (2.08.080). The CVR records adjudicated write-ins in two ways: a vote for a certified write-in candidate is marked in that candidate's column, and every other write-in is marked in a column called "Uncertified Write In". We keep "Uncertified Write In" as one candidate, because the official count does the same (it is eliminated early). The CVR also has columns named "Write-in-120", "Write-in-121", and so on, which record the raw write-in bubble. We ignore those, because counting them too would turn every adjudicated write-in into an overvote. Ignoring them brought our first-round totals from 86 ballots off to 10 ballots off in District 1.
- **Blank ballots:** a ballot with no marks in the contest, or with only overvoted ranks. The code says a blank ballot (an "undervote") counts as neither active nor inactive.
- **Rows outside the contest:** each CVR file has a row for every ballot in the election (332,969 rows), including ballots from other districts. We count an unmarked row as blank only if its precinct style (`PrecinctStyleName`) carried the contest, judged by whether any other ballot of that style marked it.
- **Remade ballots:** the CVR has `Status` and `Remade` columns. 14,311 rows have `Status` -1 and `Remade` 1, which we take to be ballots that election workers remade (for example, damaged ballots copied onto a new ballot). We keep every row: leaving these out put District 1 about 2,000 ballots below the official first round, while keeping them matches it to within 10.

Candidates are numbered by first-round votes, highest first, with "Uncertified Write In" last.

## Checks against official results

`ballots/checks.json` compares our first-choice totals with round 1 of the official count:

| Contest | Official round 1 | Ours | Total of differences |
| --- | ---: | ---: | ---: |
| District 1 | 42,871 | 42,881 | 10 |
| District 2 | 77,157 | 77,163 | 26 |
| District 3 | 84,515 | 84,520 | 11 |
| District 4 | 76,717 | 76,720 | 3 |
| Mayor | 309,963 | 310,014 | 291 |
| Auditor | 188,630 | 188,739 | 109 |

The differences are under 0.1% everywhere. A plain instant-runoff count of our files picks the official mayor and auditor. We haven't checked the council winners, because that needs a Portland-rules STV count, which the engine doesn't have yet.

## Known problems

- **First-round totals are close but not exact,** as the table shows. Likely causes: the posted CVR may be from a slightly different point in the count than the certified results, or a few remade or adjudicated ballots are recorded differently. We haven't found the cause.
- **Blank ballots are estimates,** because of the rows-outside-the-contest problem above.
- **The Auditor race had one certified candidate,** so it isn't useful for studying rankings. It's included for completeness.
- **Google Drive links can change.** If `download.py` fails, download the six CVR files by hand from the county page and save them as `raw/cvr-<contest>.csv` (for example `raw/cvr-councilor-district-1.csv`).
