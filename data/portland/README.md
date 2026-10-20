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

6 contests, 779,853 ballots (counting each voter once per contest), 2.7 MB. All of it is committed.

| Contest | Seats | `system` | Ballots | Distinct rankings | Blank | Official winners |
| --- | ---: | --- | ---: | ---: | ---: | --- |
| Council District 1 | 3 | `portland-stv` | 42,871 | 18,894 | 12,268 | Candace Avalos, Jamie Dunphy, Loretta Smith |
| Council District 2 | 3 | `portland-stv` | 77,157 | 41,108 | 10,922 | Sameer Kanal, Dan Ryan, Elana Pirtle-Guiney |
| Council District 3 | 3 | `portland-stv` | 84,515 | 40,703 | 13,439 | Steve Novick, Angelita Morillo, Tiffany Koyama Lane |
| Council District 4 | 3 | `portland-stv` | 76,717 | 38,257 | 15,080 | Olivia Clark, Mitch Green, Eric Zimmerman |
| Mayor | 1 | `irv` | 309,963 | 53,012 | 23,006 | Keith Wilson |
| Auditor | 1 | `irv` | 188,630 | 4 | 144,339 | Simone Rede (unopposed) |

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
- **Write-ins:** only write-ins for people on the City's certified write-in list count for that person (2.08.080). The CVR records adjudicated write-ins in two ways: a vote for a certified write-in candidate is marked in that candidate's column, and every other write-in is marked in a column called "Uncertified Write In". We keep "Uncertified Write In" as one candidate, because the official count does the same (it is eliminated early). The CVR also has columns named "Write-in-120", "Write-in-121", and so on, which record the raw write-in bubble. A raw bubble never counts as a vote by itself: when election workers adjudicate a write-in, they mark the result in a candidate's column or in "Uncertified Write In" and clear the raw bubble. But when a raw bubble is still marked at a rank where the voter also marked a candidate, that rank counts as an **overvote** and is skipped, as the official count does. This rule reproduces the official first round exactly in all six contests (see "Checks against official results"). It affects 6 to 41 ballots per council district, 386 for mayor, and 113 for auditor.
- **Blank ballots:** a ballot with no marks in the contest, or with only overvoted ranks. The code says a blank ballot (an "undervote") counts as neither active nor inactive.
- **Rows outside the contest:** each CVR file has a row for every ballot in the election (332,969 rows), including ballots from other districts. We count an unmarked row as blank only if its precinct style (`PrecinctStyleName`) carried the contest, judged by whether any other ballot of that style marked it.
- **Remade ballots:** the CVR has `Status` and `Remade` columns. 14,311 rows have `Status` -1 and `Remade` 1, which we take to be ballots that election workers remade (for example, damaged ballots copied onto a new ballot). We keep every row: leaving these out put District 1 about 2,000 ballots below the official first round, while keeping them (together with the write-in rule below) matches it exactly.

Candidates are numbered by first-round votes, highest first, with "Uncertified Write In" last.

## Checks against official results

`ballots/checks.json` compares our first-choice totals with round 1 of the official count:

| Contest | Official round 1 | Ours | Total of differences |
| --- | ---: | ---: | ---: |
| District 1 | 42,871 | 42,871 | 0 |
| District 2 | 77,157 | 77,157 | 0 |
| District 3 | 84,515 | 84,515 | 0 |
| District 4 | 76,717 | 76,717 | 0 |
| Mayor | 309,963 | 309,963 | 0 |
| Auditor | 188,630 | 188,630 | 0 |

Every candidate's first-round total matches the official count exactly. A plain instant-runoff count of our files picks the official mayor and auditor, and our mayor count's final round (Keith Wilson 153,522, Carmen Rubio 106,431) matches the official final round. We haven't checked the council winners, because that needs a Portland-rules STV count, which the engine doesn't have yet.

**How we got to an exact match (October 2026).** An earlier version of `convert.py` ignored the raw write-in columns completely, and our totals were 3 to 291 votes too high. We checked several possible causes:

- **Remade ballots** (`Status` −1, `Remade` 1): leaving them out puts every contest thousands of ballots short, so they belong in the count.
- **Duplicate ballots:** every `BallotID` in each file is unique.
- **Washington and Clackamas county ballots:** 1,178 rows have `WASH-` or `CLACK-` precinct styles. They're already in the CVR and in our count.
- **The raw write-in bubble.** The auditor race settled it: with one candidate, cleanup rules can't change who a vote counts for, yet we had exactly 109 too many votes for Simone Rede and exactly the right number of write-ins. Each of those 109 ballots marks Rede and a raw write-in bubble at the same rank, and has no other rank where Rede is marked alone. Treating such a rank as an overvote matched the auditor race, then all five other contests, to the vote.

We found no county documentation that states this rule; it's inferred from the exact match. It's what a counting program would do if it saw two marks at one rank, which is what the raw columns show.

**Candidate numbers changed slightly.** Candidates are numbered by first-round votes, so the fix swapped two neighbors near the bottom of the list in District 3 (Jaclyn Smith-Moore and Patrick Hilton) and District 4 (Lee Odell and Tony Schwartz). Earlier results that refer to those candidates by number used the old order.

## Slates

Portland's races are nonpartisan, so `parties` stays `null`. But voters had help sorting the long candidate lists: unions, parties, business groups, and newspapers published endorsement lists, and some candidates campaigned in pairs. The metadata records these groups in a `slates` field (format in `docs/ballot-format.md`). The project uses slates to measure **slate cohesion**: do voters who rank one slate member first also rank a fellow member second?

- **Where the data lives:** `slates.json` holds every slate by candidate name, with its source, so it can be reviewed by hand. `add_slates.py` copies it into `ballots/<contest>.json`, turning names into candidate numbers. Run it after `convert.py`, which rewrites the metadata files without slates:

  ```
  python3 data/portland/add_slates.py --check   # report only
  python3 data/portland/add_slates.py           # write
  ```

  The script stops without writing if any name doesn't match a candidate exactly. Where a source spells a name differently from the ballot, `slates.json` lists the spelling under `aliases`, and the script prints every alias it used. The aliases are: William Mespelt → Will Mespelt, Mike Marshall → Michael (Mike) Marshall, Stan Penkin → Stanley Penkin, and Liv Østhus → Liv (Viva) Osthus.
- **Extra fields:** besides `name`, `kind`, `members`, and `source`, each slate has `date` (when the source published it), and some have `ordered: true` (members are listed in the order the endorser asked voters to rank them) and a `note`.

### Coverage

55 slates in the four council districts and the mayor's race. The auditor race had one candidate and has no slates.

| Slate | Kind | D1 | D2 | D3 | D4 | Mayor |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Oregon Working Families Party | endorsement | 4 | 4 | 3 | 2 | 1 |
| Northwest Oregon Labor Council | endorsement | 3 | 3 | 3 | 3 | 1 |
| Portland Fire Fighters Association | endorsement | 3 | 2 | 3 | 3 | 1 |
| Portland Police Association | endorsement | 1 | 2* | 1* | 4 | 1 |
| Portland DSA | endorsement | | | 1 | 1 | |
| United for Portland, Spotlight tier | endorsement | 2 | 6 | 5 | 6 | |
| United for Portland, Green Light tier (includes Spotlight) | endorsement | 3 | 11 | | 8 | |
| Portland Metro Chamber (ranked) | endorsement | 3 | 5 | 5 | 6 | |
| Sierra Club Oregon Chapter | endorsement | 4 | 3 | 3 | 3 | |
| Willamette Week (media, ranked) | endorsement | 6 | 6 | 6 | 6 | 3 |
| Portland Mercury (media, ranked) | endorsement | 3 | 3 | 3 | 3 | 3 |
| The Oregonian editorial board (media) | endorsement | 3 | 3 | 3 | 3 | |
| Candidate pair | campaign | Avalos, Routh | Armstrong, Marshall | Koyama Lane, Morillo | Clark, Zimmerman | |

Numbers are slate members in that contest. \* may be incomplete (see below). In District 3, United for Portland's Green Light and Spotlight lists are the same, so only the Spotlight slate is recorded.

The campaign pairs: in District 3, Tiffany Koyama Lane and Angelita Morillo canvassed together, sent a joint mailer, and asked voters to "rank us first and second" (Rose City Reform, December 9, 2024; FairVote's cross-endorsement report). In Districts 1, 2, and 4, OPB (October 25, 2024) reports that Candace Avalos and Steph Routh held joint house parties and handed out each other's fliers, James Armstrong and Mike Marshall shared mailers, and Olivia Clark and Eric Zimmerman "joined forces" and urged voters to vote for each other.

### Sources

All URLs are in `slates.json`. The main ones:

- Oregon Working Families Party: its own posts of July 23 and September 25, 2024. The second round came late (about three weeks before ballots were mailed), and each slate's `note` says which members came in which round.
- Northwest Oregon Labor Council: the council's own page is behind a login, so we use Willamette Week, September 4, 2024, which lists all 12 council picks. (Willamette Week's June 30 report listed only Novick and Koyama Lane in District 3; Chris Flanary was added later.)
- Portland Fire Fighters Association: Willamette Week, July 25, 2024.
- Portland Police Association: the union never published its list. Willamette Week (July 8, 2024) reported its District 1 and District 4 picks. For Districts 2 and 3 we only have OPB's September 10 note that Dan Ryan, Tiffani Penson, and Steve Novick had its endorsement.
- Portland DSA: endorsed only two council candidates, Tiffany Koyama Lane (D3) and Mitch Green (D4) (*The Call*, November 13, 2024).
- United for Portland (the business-backed coalition the Portland Metro Chamber belongs to): its own November 2024 endorsement page, read October 2026.
- Portland Metro Chamber: its own October 2024 page, with ranking instructions.
- Willamette Week and Portland Mercury: their own October 16, 2024 endorsement pages.

### Uncertain

- **Sierra Club and The Oregonian come from a secondary source.** Their pages could not be fetched from here (the Sierra Club page returns a redirect loop and oregonlive.com is blocked), so their member lists come from the Rose City Reform candidate tracker (https://rosecityreform.substack.com/p/portland-candidate-tracker). Several Sierra Club picks match other aggregators (Blue Voter Guide), and the Oregonian list fits the Chamber's remark that 11 of the Oregonian's 12 picks were also United for Portland endorsees, the exception being in District 1. The source URLs point at the original pages; check them by hand before relying on these slates.
- **United for Portland's page may have changed since 2024.** In District 2 the current page has six Spotlight picks, including James Armstrong; Willamette Week's October 8, 2024 summary named fewer. The group also withdrew an earlier endorsement of Mike Marshall.
- **Police union slates in Districts 2 and 3 may be incomplete,** as described above.
- **Left out:** Portland for All, HOME PAC, Portland Neighbors Welcome, the Portland Association of Teachers, and the "Portland Voter Guide PAC" also endorsed council candidates, but we found only partial lists or only secondary reports, so they aren't included. "Don't Rank Rene" asked voters to leave Rene Gonzalez off the mayoral ballot; it's a negative campaign, not a slate.
- **Party registration (`kind: "party"`) isn't recorded.** We found no public source listing the council candidates' voter registration. Oregon voter registration records exist but aren't published per candidate, and we didn't guess.
- **Forum statements aren't recorded as campaigns.** At candidate forums, some candidates named rivals they would rank (for example, in District 2 Marnie Glickman, Sameer Kanal, and Jonathan Tasini named each other; in District 3 Steve Novick and Jesse Cornett named each other). These were reported by Rose City Reform but weren't joint campaigns, so they're left out.

## Known problems

- **The raw write-in rule is inferred, not documented.** First-round totals now match exactly (see "Checks against official results"), but the rule that made them match comes from the data, not from Multnomah County's RCTab settings, which we haven't seen.
- **Blank ballots are estimates,** because of the rows-outside-the-contest problem above.
- **The Auditor race had one certified candidate,** so it isn't useful for studying rankings. It's included for completeness.
- **Google Drive links can change.** If `download.py` fails, download the six CVR files by hand from the county page and save them as `raw/cvr-<contest>.csv` (for example `raw/cvr-councilor-district-1.csv`).
