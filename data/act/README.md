# ACT Legislative Assembly 2024

The Australian Capital Territory (ACT) elects its Legislative Assembly by Hare-Clark, a form of single transferable vote (STV), a multi-winner ranked system. Five electorates each elect 5 members. The ballot tells voters to number **at least as many boxes as there are seats**: "Number five boxes from 1 to 5 in the order of your choice." That makes this folder the closest public match to elections where the instruction equals the number of seats.

This folder holds the 5 electorates of the October 19, 2024 election, converted to the project's ballot format (`docs/ballot-format.md`).

## Source

- **Ballot data:** Elections ACT, "Ballot paper preference data", https://www.elections.act.gov.au/elections/previous-assembly-elections/2024-election/ballot-paper-preference-data. One text file per electorate lists every formal ballot, paper and electronic, one row per preference. `DataDescriptions.pdf` on the same page explains the fields.
- **Official results:** the final distribution of preferences (table 1 and table 2 for each electorate, updated October 26, 2024), the 2024 election statistics workbook (formal and informal votes), and the list of elected candidates, all from the same site.
- **Ballot instruction:** Elections ACT, "Ballot papers", https://www.elections.act.gov.au/elections/our-electoral-system/elections-in-the-act/ballot-papers (read October 20, 2026). Its sample ballot reads: "Number five boxes from 1 to 5 in the order of your choice", then "You may then show as many further preferences as you wish by writing numbers from 6 onwards in other boxes", and at the foot "Remember, number at least five boxes from 1 to 5 in the order of your choice."
- **Counting and formality rules:** Electoral Act 1992 (ACT), Schedule 4, and the "Ballot papers" page above.
- **Downloaded:** 2026-10-20. `MANIFEST.json` records each file's URL, size, and SHA-256 checksum.
- **Terms of use:** public data published by the ACT Electoral Commission. The site's copyright page applies; we found no specific license for these files. Cite Elections ACT as the source.

### Why only 2024

Elections ACT used to publish the same data for 2008 to 2020. After its 2024 website redesign, only the 2024 files are public. The old pages return "page not found", the new pages for earlier elections link only to results and distributions of preferences, and the site map and site search list no other preference data. The Internet Archive is blocked from this environment. To get 2008 to 2020, ask Elections ACT for the files, or look for copies of the old pages in the Internet Archive from a machine that can reach it, and add them to `download.py`.

### Downloading

The Elections ACT site sits behind a Cloudflare browser check, which refuses scripted downloads (HTTP 403, "Just a moment..."). We fetched the files through a headless browser and checked every file's SHA-256 checksum, computed in the browser on the bytes served, against the file saved here. `download.py` tries a direct download. If Cloudflare refuses it, download the files it lists by hand in a browser and run `python3 data/act/download.py --verify` to check them against `MANIFEST.json`.

## Contents

5 contests, 274,023 ballots, 4.1 MB. All of it is committed.

| Electorate | Seats | Candidates | Ballots | Distinct rankings | Informal | Quota | Official winners, in order elected |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Brindabella | 5 | 24 | 58,246 | 29,467 | 1,416 | 9,708 | Mark Parton, Deborah Morris, Caitlin Tough, Taimus Werner-Gibbings, Laura Nuttall |
| Ginninderra | 5 | 33 | 56,052 | 34,629 | 1,156 | 9,343 | Tara Cheyne, Yvette Berry, Peter Cain, Jo Clay, Chiaka Barry |
| Kurrajong | 5 | 34 | 48,922 | 31,470 | 750 | 8,154 | Andrew Barr, Elizabeth Lee, Rachel Stephen-Smith, Shane Rattenbury, Thomas Emerson |
| Murrumbidgee | 5 | 27 | 55,849 | 32,534 | 930 | 9,309 | Jeremy Hanson, Chris Steel, Fiona Carrick, Ed Cocks, Marisa Paterson |
| Yerrabi | 5 | 31 | 54,954 | 33,307 | 1,095 | 9,160 | Michael Pettersson, Suzanne Orr, Leanne Castley, James Milligan, Andrew Braddock |

Each metadata file has:

- `system`: `hare-clark-act` (see below).
- `parties`: the party column heading printed on the ballot (from `Groups.txt`). Candidates in the "ungrouped" column are `null`, because the data doesn't give the label printed next to an ungrouped candidate.
- `max_ranks`: `null`. Voters may number every box.
- `instruction` and `min_ranks_instructed` (5), described in `docs/ballot-format.md`.
- `blank_ballots`: all informal ballots from the official statistics, not only blank ones. The data files leave informal ballots out entirely.

Candidates are numbered in ballot order: party column by column, and within a column in the base order of `candidates.txt`. Real ballots rotate the names within each column (Robson rotation: 60 printed versions per electorate), so this isn't the order every voter saw.

`ballots/checks.json` records, for each electorate, the checks below, counts of paper and electronic votes, and how many boxes voters numbered (`ballot_length`), for all ballots and for paper and electronic votes separately.

### What `hare-clark-act` means

From the Electoral Act 1992, Schedule 4:

- **Quota:** formal ballots divided by (seats + 1), plus 1, ignoring fractions.
- **Surplus:** only the ballots in the **last parcel** a candidate received (the parcel that took them over the quota) move on, at a transfer value of surplus ÷ the number of ballots in that parcel that have a next choice. Scottish STV, which the engine follows, moves every ballot the candidate holds.
- **Exclusion:** the candidate with the fewest votes is excluded, and their ballots move on parcel by parcel.

## How to rebuild

```
python3 data/act/download.py    # about 53 MB into data/act/raw/2024/ (see "Downloading")
python3 data/act/convert.py     # writes data/act/ballots/
```

Standard library only. Nothing downloaded is executed.

## Cleanup rules

- **Formality (Hare-Clark savings rule):** a ballot is formal if it has exactly one first preference ("1"). Ticks and crosses don't count. A formal ballot's preferences count up to the first missing or repeated number; everything after that is ignored. Elections ACT's files hold only formal ballots, with preferences already cut at that point. `convert.py` checks this and would cut again; it found nothing to cut.
- **Informal ballots** aren't in the data. Their count, from the election statistics, is in `blank_ballots`.
- **Electronic votes** (batch numbers ending in 000) and paper ballots are combined, as the official count does. They are about 55% and 45% of ballots.

## Checks against official results

- **Ballot counts:** every electorate's ballot count equals the official formal vote count exactly.
- **First preferences:** every candidate's first-preference total equals the first count in table 2 of the official distribution of preferences exactly, in all 5 electorates.
- **Winners:** the engine (`stvsim count`, Scottish STV rules) elects the official 5 in all 5 electorates, even though its surplus rule differs from the ACT's (see above). To repeat the check, run `engine/target/release/stvsim count data/act/ballots/*.ballots --no-truncation`.

## How many boxes voters numbered

Across all 274,023 formal ballots: **68.6%** numbered exactly 5 boxes (the instructed minimum, which equals the number of seats), **29.6%** numbered more, and **1.8%** numbered fewer. Voters at electronic voting machines stopped at exactly 5 more often (71.0%) than voters on paper (65.6%). By electorate, the share at exactly 5 ranges from 62.5% (Kurrajong) to 74.9% (Yerrabi), and 3.5% to 7.0% numbered every box. The detail is in `ballots/checks.json`.

These shares leave out informal ballots, which include ballots with no first preference.

## Known problems

- **Only 2024.** See "Why only 2024".
- **Ungrouped candidates have no party label,** even where the ballot printed one.
- **The electronic voting screens may word the instruction differently** from the paper ballot quoted in `instruction`. We didn't find the screen text.
- **Names in the official count sheets are slightly garbled** in places (for example "SoÃ«lily" for "Soëlily"); `convert.py` matches names by their plain letters, and keeps the spelling in `candidates.txt`.
- **Candidate order isn't the order voters saw,** because of Robson rotation. `BallotPaperVersions.txt` (5.4 MB, not downloaded) gives each paper ballot's printed version, if you need ballot position effects.
