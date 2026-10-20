# New York City ranked-choice primaries

New York City uses ranked-choice voting (single-winner instant runoff, up to 5 ranks) in its party primaries for mayor, public advocate, comptroller, borough president, and city council. This folder holds every ranked-choice contest from the 2021, 2023, and 2025 primaries, converted to the project's ballot format (`docs/ballot-format.md`).

## Source

- **Publisher:** NYC Board of Elections (BOE), results pages at https://www.vote.nyc/page/election-results-summary-2021, `-2023`, and `-2025`.
- **Ballot data:** the cast vote record (CVR), a file listing every ballot's marks with no voter information:
  - 2021: https://www.vote.nyc/sites/default/files/pdf/election_results/2021/20210622Primary%20Election/cvr/PE2021_CVR_Final.zip (109 MB)
  - 2023: https://www.vote.nyc/sites/default/files/pdf/election_results/2023/20230627Primary%20Election/cvr/2023P_CVR_Final.zip (12 MB)
  - 2025: https://www.vote.nyc/sites/default/files/pdf/election_results/2025/20250624Primary%20Election/rcv/2025_Primary_CVR_2025-07-17.zip (90 MB)
- **Official results:** the BOE's certified round-by-round page for each contest (for example `.../2021/20210622Primary Election/rcv/024306_1.html` for the 2021 Democratic mayoral primary). `download.py` saves all of them.
- **Downloaded:** 2026-10-20. `raw/<year>/MANIFEST.json` records URLs, sizes, and SHA-256 checksums.
- **Terms of use:** these are public records that the BOE publishes for anyone to download. We found no license or usage terms on the site. Cite the NYC Board of Elections as the source.

## Contents

126 contests and 8.8 million ballots in all (counting each voter once per contest), 4.3 MB. All of it is committed.

| Year | Contests | Ballots (all contests) | Blank | Official winner known | 
| --- | ---: | ---: | ---: | ---: |
| 2021 | 64 | 4,386,900 | 427,911 | 63 |
| 2023 | 24 | 113,470 | 772 | 24 |
| 2025 | 38 | 4,329,800 | 421,635 | 37 |

"Ballots" counts each voter once per contest. The 2021 Democratic mayoral primary (`ballots/2021-dem-mayor-citywide.ballots`) has 942,031 ballots and 61,830 distinct rankings. Each year also has a `ballots/<year>-checks.json` with the checks described below.

Each contest's metadata has `system: "irv"`, `seats 1`, `parties: null` (every candidate in a primary belongs to the same party, which is in the contest name), and an extra field `max_ranks`: the number of rank columns on the ballot. It is 5 for 63 contests, and 3 or 4 for the other 63, because NYC prints fewer rank columns when fewer candidates run.

## How to rebuild

```
python3 data/nyc/download.py            # all years, into data/nyc/raw/<year>/
python3 data/nyc/convert.py             # all years, into data/nyc/ballots/
python3 data/nyc/convert.py 2021        # one year
```

Standard library only. The CVR comes as Excel files, which `convert.py` reads as XML text with `zipfile`; it never opens them in Excel or runs anything from them. Converting all three years takes about 2 minutes on 4 cores.

## Cleanup rules

These follow the BOE's own rules, from its *Rank Choice Voting Manual Canvass Procedures* (2021): https://www.vote.nyc/sites/default/files/pdf/evs/5a_RCV_Manual_Canvass_Procedures_2021_02-09.pdf.

- **Overvote** (two or more candidates marked at the same rank): the ballot is exhausted when counting reaches that rank. We keep the ranks above the overvote and cut everything from the overvote down. The BOE manual says an overvoted ballot is set aside as exhausted "when the next voter choice is over-voted", not because there's an overvote anywhere on it, which gives the same result.
- **Skipped rank** (a blank rank followed by a marked one): passed over. The next marked rank counts.
- **Repeated candidate** (the same candidate at two ranks): not an overvote. The candidate counts at the highest rank, and later repeats are passed over.
- **Write-ins:** the CVR records only that a write-in was marked, not the name. All write-ins become one candidate, "Write-in (all write-ins combined)", placed last in the candidate list. Two write-ins on one ballot look like a repeated candidate. The official count also groups write-ins together and drops them in the first elimination round.
- **Blank ballots:** a ballot with no valid ranking. That's either no marks at all in the contest, or an overvote at the first marked rank. See "Known problems" for how we count the first kind.

Candidates are numbered by first-round votes, highest first, with write-ins last.

## Checks against official results

`convert.py` compares our first-choice totals with the first round of each certified round-by-round page, and reads the winner from the page.

- **122 of 124 contests with a certified page match the official first round exactly**, for every candidate, including the 2021 and 2025 Democratic mayoral primaries.
- **Four 2021 contests differ slightly:** Democratic Council District 9 (14 votes net, spread across 12 candidates), Republican Council District 50 (14), Republican Staten Island Borough President (2), and the Republican mayoral primary (2). The BOE's 2021 CVR was posted after certification and may differ by a few late adjustments; we haven't found the cause.
- **Winners:** a plain instant-runoff count of our files picks the official winner in all 124 contests where the BOE posted one.
- **Two contests have no certified page,** so `official_winners` is `null`: 2021 Republican Queens Borough President and 2025 Republican Council District 47. Both had two candidates plus write-ins.

## Slates

In a party primary every candidate is in the same party, so `parties` stays `null`. Voters still get help sorting candidates: unions, the Working Families Party (WFP), the Democratic Socialists of America (DSA), civic groups, and newspapers publish endorsements, sometimes as ranked lists, and some candidates ask their voters to rank a rival second (a *cross-endorsement*). The metadata records these groups in a `slates` field (format in `docs/ballot-format.md`). The project uses slates to measure **slate cohesion**: do voters who rank one slate member first also rank a fellow member second?

- **Where the data lives:** `slates.json` holds every slate by candidate name, with its source, for review by hand. `add_slates.py` copies it into `ballots/<contest>.json`, turning names into candidate numbers. Run it after `convert.py`, which rewrites the metadata files without slates:

  ```
  python3 data/nyc/add_slates.py --check   # report only
  python3 data/nyc/add_slates.py           # write
  ```

  The script stops without writing if any name doesn't match a candidate exactly. Sources rarely use the ballot's full names (the ballot has "Kathryn A. Garcia", the press "Kathryn Garcia"), so `slates.json` lists each source spelling under `aliases` for its contest, and the script prints every alias it used. All aliases are a dropped middle initial or suffix, or a dropped accent (the BOE prints "Tiffany Caban", "Alexa Aviles"), except one: the UFT's "Tyrell Hankerson" is matched to the ballot's "Ty Hankerson" in the 2025 District 28 primary, the only Hankerson running.
- **Extra fields:** besides `name`, `kind`, `members`, and `source`, each slate has `date` (when the source published it, or when the endorsement was made, if the source says), and some have `ordered: true` (members listed in the order the endorser asked voters to rank them) and a `note`.
- **One-member slates:** most council endorsements name a single candidate. They're kept, because they show which candidates an organization backed, but they can't measure cohesion on their own.

### Coverage

188 slates in 56 contests. We didn't attempt all 126 contests; Republican primaries and the 2023 primaries have none.

**2021 Democratic mayor (17 slates).** Campaigns: Andrew Yang and Kathryn Garcia (joint campaigning the weekend before the primary; Yang asked his voters to rank Garcia second, while Garcia said she was "not co-endorsing"), and Art Chang and Joycelyn Taylor (cross-endorsed, May 25). Ranked endorsements: WFP's April ranking (Stringer, Morales, Wiley; withdrawn after the allegations against Stringer) and its final pick (Wiley alone, from June 4), the *Daily News* (Garcia, Adams, McGuire), Citizens Union (Garcia, Adams, Stringer), New York State Nurses Association (Wiley, Adams), UAW Region 9A (Stringer, Morales), Community Voices Heard Power (Wiley, Morales), Planned Parenthood of Greater NY Votes PAC (Garcia, Stringer, Wiley, McGuire). Single picks: the *New York Times* (Garcia), 1199SEIU (Wiley), UFT (Stringer), Hotel Trades Council, 32BJ, DC37, and the Bronx Democratic Party (Adams). NYC-DSA didn't endorse for mayor in 2021.

**2025 Democratic mayor (17 slates).** Campaigns: Zohran Mamdani and Brad Lander (cross-endorsed June 13, one day before early voting), Mamdani and Michael Blake (June 16, during early voting), and two one-way pledges: Jessica Ramos for Andrew Cuomo (June 6) and Whitney Tilson for Cuomo. Ranked endorsements: WFP (Mamdani, Lander, Adams, Myrie; Ramos was fifth until WFP dropped her after she endorsed Cuomo), DC37 (Adams, Mamdani, Myrie), UNITE HERE Local 100 (Adams, Mamdani, Lander, Ramos), UAW Region 9A, Citizen Action of New York, Representatives Ocasio-Cortez and Velázquez (the same ranking), and the *Daily News* (Cuomo, Adams, Lander). Unranked groups: Citizens Union (Cuomo, Lander, Myrie) and the League of Conservation Voters (Cuomo, Lander). Single picks: NYC-DSA (Mamdani), 1199SEIU, the Hotel and Gaming Trades Council, and 32BJ (Cuomo). The *New York Times* no longer endorses in local races, so it has no slate.

**2021 comptroller and borough presidents.** Citizens Union's ranked picks for comptroller (Benjamin, Johnson, Lander), Brooklyn (Simon, Reynoso, Edwards), and Manhattan (Hoylman, Levine), plus single picks by WFP, the *Times*, the *Daily News*, and major unions.

**2021 Democratic council primaries (40 districts: 1–3, 5–8, 10–16, 18–39, 41, 45, 47, 49).** From one snapshot of endorsement lists in late January 2021 (Gotham Gazette): WFP, NYC-DSA, UFT, the NYC Central Labor Council, LaborStrong2021 (a union coalition including DC37, 32BJ, and the Hotel Trades Council), RWDSU, NYIC Action, and Road to Justice NYC. On top of that:
- Ranked slates: WFP's first ranked endorsement (District 26: Bagga, then Laymon, February 25), Road to Justice NYC's first and second choices in Districts 20, 25, and 26 (February 23), and Citizens Union's ranked picks in District 26 (Won, Bagga, O'Leary) plus single picks in Districts 7, 33, 35, and 39.
- Cross-endorsements: Nabaraj KC and Austin Shafran (District 19) and Debra Markell and Harpreet Toor (District 23), each pair naming the other as second choice about two weeks before the primary.

**2025 Democratic council primaries (11 districts: 1, 2, 4, 8, 13, 17, 19, 21, 28, 41, 47).** WFP's open-seat endorsements (March 13, 2025), with ranked first choices and unranked additional picks in Districts 2, 13, 17, and 21; the UFT's endorsements (May 14, 2025); and the Bronx Democratic Party's endorsements in Districts 8, 13, and 17.

Contests with at least one slate of two or more candidates, the ones that can measure cohesion directly: the 2021 and 2025 mayoral primaries, the 2021 comptroller and Brooklyn and Manhattan borough president primaries, 2021 Districts 19, 20, 23, 25, and 26, and 2025 Districts 2, 13, 17, and 21.

### Uncertain

- **The 2021 council lists are a January snapshot,** five months before the primary. Some endorsements changed later (WFP dropped Stringer and Morales for mayor, for example), and later council endorsements, including ranked ones, aren't captured. Each such slate's `note` says so.
- **Several slates come from news summaries, not the endorser's own page:** City & State's and FOX 5's endorsement trackers for the mayoral races, Ballotpedia News for the *Times* and union picks, and Gotham Gazette for the council lists. Where FOX 5 and City & State differ (UAW Region 9A's order after Ramos was dropped), the slate's `note` says so.
- **Late changes in 2025.** Progressive groups dropped Jessica Ramos from their ranked slates after she endorsed Cuomo on June 6, after some voters had already seen the earlier lists. WFP's slate is recorded without Ramos.
- **Yang–Garcia wasn't mutual.** Yang asked voters to rank Garcia second; Garcia campaigned with him but didn't ask her voters to rank him. It's recorded as a `campaign` slate with a note. The Ramos and Tilson pledges to Cuomo are one-way too.
- **Not covered:** 2021 Districts 9, 40, and 46 and other crowded races where we found no organizational list beyond single endorsements; borough president races other than Brooklyn and Manhattan in 2021; 2025 borough president and comptroller races; Republican primaries; and all 2023 contests.

## Known problems

- **Blank ballots are estimates.** In the CVR, every ballot shows "undervote" in every contest in its file, including contests that weren't on that voter's ballot (for example, other council districts). So we count an unmarked ballot as blank only if its ballot style carried the contest, judged by whether any other ballot of the same style marked it. 2021 and 2025 have a "Ballot Style" column. 2023 doesn't, so we use precinct plus party, where the party comes from the other contests the voter marked. A 2023 ballot with no marks in any contest can't be assigned a party and isn't counted, so 2023 blank counts are too low.
- **Missing candidate names.** In 2021 Republican Queens Borough President, neither candidate ID (219566, 217580) is in the BOE's name list, so they appear as "Candidate ID 219566" and "Candidate ID 217580".
- **Not every NYC primary contest is here.** Judicial delegates, district leaders, and other contests that aren't ranked-choice are left out. The 2026 primary CVR is posted but not yet included; add `2026: {"date": "2026-06-23"}` to `YEARS` in `convert.py` to include it.
- **The 2021 count had a public error.** On June 29, 2021 the BOE released preliminary results that included 135,000 test ballots. The CVR here is the final version (August 2021) and doesn't have that problem, as the exact first-round match shows.
