# Australian Senate: Tasmania, ACT, and Northern Territory, 2016 to 2025

The Australian Senate is elected by single transferable vote (STV), a multi-winner ranked system, one contest per state or territory. Since 2016 the ballot tells voters how many boxes to number:

> You may vote in one of two ways. Either: **Above the line**, by numbering at least 6 of these boxes in the order of your choice (with number 1 as your first choice). Or: **Below the line**, by numbering at least 12 of these boxes in the order of your choice (with number 1 as your first choice).

- **Above the line (ATL):** one box per party or group. A voter ranks parties, and each party's vote passes to its candidates in the order the party listed them.
- **Below the line (BTL):** one box per candidate. A voter ranks people.

A normal election fills 6 seats per state and 2 per territory. The 2016 election was a double dissolution (the whole Senate was elected at once), so each state filled 12 seats. **Tasmania 2016 is the one contest where the below-the-line instruction (at least 12) equals the number of seats (12).**

This folder holds 12 contests: Tasmania, the ACT, and the Northern Territory at the 2016, 2019, 2022, and 2025 elections, converted to the project's ballot format (`docs/ballot-format.md`). These are the three smallest of the eight contests. The five large states (about 0.9 to 4.8 million ballots each) aren't included; `download.py NSW VIC QLD WA SA` fetches them and `convert.py` converts whatever is in `raw/`.

## Source

- **Ballot data:** the AEC (Australian Electoral Commission) "formal preferences" files, one per state or territory and election: every formal ballot paper, with the number written in each box. Linked from the Senate downloads page of each election's Tally Room, for example https://results.aec.gov.au/27966/Website/SenateDownloadsMenu-27966-Csv.htm. AEC event ids: 20499 (2016), 24310 (2019), 27966 (2022), 31496 (2025).
- **Official results:** from the same pages: `SenateFirstPrefsByStateByVoteTypeDownload` (the candidate list in ballot order, party labels, and first-preference totals), `SenateSenatorsElectedDownload` (the senators elected, in order), and `SenateInformalByStateDownload` (formal and informal counts).
- **Ballot instruction:** quoted from the AEC's sample Senate ballot in "How to make your vote count", https://www.aec.gov.au/Voting/How_to_vote/files/how-to-make-your-vote-count.pdf (read October 20, 2026). The ballot form is set by the Commonwealth Electoral Act 1918, Schedule 1, Form E. We assume the territories' ballots carry the same words; the AEC's guidance makes no territory exception, but we didn't see a territory ballot.
- **Rules:** Commonwealth Electoral Act 1918, sections 239 (how to vote), 268A and 269 (formality and savings), and 272 to 273A (the count).
- **Downloaded:** 2026-10-20. `MANIFEST.json` records each file's URL, size, and SHA-256 checksum.
- **Terms of use:** the AEC publishes its election results under the Creative Commons Attribution 4.0 International license (see https://www.aec.gov.au/footer/Copyright.htm). Cite the Australian Electoral Commission.

## Contents

12 contests, 2,945,152 formal ballot papers.

| Election | Seats | Candidates | Groups above the line | Formal ballots | Below the line | Above the line | Informal | Senators elected, in order |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 2016 Tasmania | 12 | 58 | 21 | 339,159 | 95,385 | 243,774 | 12,221 | Abetz, Urquhart, Whish-Wilson, Lambie, Parry, Polley, Duniam, Brown, Bushby, Singh, Bilyk, McKim |
| 2016 ACT | 2 | 22 | 10 | 254,767 | 38,681 | 216,086 | 5,754 | Gallagher, Seselja |
| 2016 NT | 2 | 19 | 7 | 102,027 | 8,750 | 93,277 | 3,512 | McCarthy, Scullion |
| 2019 Tasmania | 6 | 44 | 16 | 351,988 | 95,543 | 256,445 | 13,284 | Colbeck, Brown, Chandler, McKim, Bilyk, Lambie |
| 2019 ACT | 2 | 17 | 7 | 270,231 | 60,027 | 210,204 | 6,420 | Gallagher, Seselja |
| 2019 NT | 2 | 18 | 9 | 105,027 | 8,731 | 96,296 | 3,967 | McCarthy, McMahon |
| 2022 Tasmania | 6 | 39 | 14 | 361,048 | 81,863 | 279,185 | 11,925 | Duniam, Urquhart, Whish-Wilson, Polley, Askew, Tyrrell |
| 2022 ACT | 2 | 23 | 11 | 285,217 | 54,003 | 231,214 | 5,091 | Gallagher, Pocock |
| 2022 NT | 2 | 17 | 8 | 103,617 | 10,748 | 92,869 | 3,290 | McCarthy, Price |
| 2025 Tasmania | 6 | 33 | 12 | 371,790 | 68,451 | 303,339 | 12,670 | Brown, Chandler, McKim, Dowling, Lambie, Colbeck |
| 2025 ACT | 2 | 14 | 7 | 293,474 | 49,310 | 244,164 | 5,263 | Pocock, Gallagher |
| 2025 NT | 2 | 17 | 8 | 106,807 | 10,457 | 96,350 | 3,586 | McCarthy, Price |

### Three files per contest

Each contest has three `.ballots` + `.json` pairs. The `ballot_set` field in the metadata says which is which.

| File | What it holds | `min_ranks_instructed` | Use it for |
| --- | --- | ---: | --- |
| `<year>-<state>.ballots` | Every formal ballot, as the official count uses it. **Above-the-line votes are expanded** into candidates (see below). | `null` | Counting the election. **Not** for ballot length. |
| `<year>-<state>-btl.ballots` | Below-the-line ballots only, as marked. | 12 | How many candidates voters ranked. |
| `<year>-<state>-atl.ballots` | Above-the-line ballots only, as rankings of the party and group boxes. Each "candidate" is a box, named `A: <party>`. | 6 | How many boxes voters numbered above the line. |

The `-btl` and `-atl` files aren't whole elections: each leaves out the other kind of vote, so don't count them to find winners. Their `official_winners` is `null`, and `seats_in_election` gives the real seat count. If a script reads every `.ballots` file in `ballots/`, filter by `ballot_set` so each voter is counted once.

**How above-the-line votes are expanded.** Section 272 of the Act counts an above-the-line vote as a vote for the first group's candidates in the order the group listed them on the ballot, then the second group's candidates, and so on. `convert.py` writes the full-count file that way. So an above-the-line ballot numbering 6 boxes appears there as a ranking of every candidate in those 6 groups, perhaps 15 or more names. That is what the count uses, but it isn't what the voter wrote. The voter's own marks are in the `-atl` file.

Other metadata: `system` is `senate-stv`; `parties` is the party name printed on the ballot (from the AEC candidate list), with "Independent" and blank as `null`; `max_ranks` is `null` (voters may number every box); `blank_ballots` holds all informal ballots, not only blank ones (the AEC files contain formal ballots only). Candidates are numbered in ballot order: group A's candidates in ballot order, then group B's, and so on, with ungrouped candidates last.

### What's committed

The `-btl` and `-atl` files and all metadata are committed (37 MB). The full-count files (63 MB) are left out by `data/ausenate/.gitignore`; rebuild them with the commands below (about a minute). They're derived entirely from the same raw files.

## How to rebuild

```
python3 data/ausenate/download.py    # about 27 MB into data/ausenate/raw/ (4 downloads at a time)
python3 data/ausenate/convert.py     # writes data/ausenate/ballots/ (contests in parallel)
```

Standard library only. Nothing downloaded is executed.

## Cleanup rules

The AEC files contain only ballots the AEC accepted as formal, with each box's mark as written. `convert.py` applies the Act's rules for reading a formal ballot:

- **Below the line first.** If the below-the-line boxes contain the numbers 1 to at least 6, each used once, the ballot is a below-the-line vote, even if it also has marks above the line (s 269(2)). This happened on 1% to 3% of papers.
- **Then above the line.** Otherwise, the above-the-line boxes are used. A single "1" is enough for a formal above-the-line vote (s 269(1)).
- **Where preferences stop:** at the first missing or repeated number, on either side (savings rules, s 268A and 269). Numbers after a gap are ignored.
- **Ticks and crosses:** the 2016 files record a tick as `/` and a cross as `*`. The AEC counted either as a "1", above or below the line, so `convert.py` does too for 2016. About 0.2% of 2016 papers have a tick or cross above the line. The 2019 to 2025 files contain only numbers.

These rules turn every paper in all 12 files into a formal vote.

## Checks against official results

- **Ballot counts:** every contest's paper count equals the AEC's formal vote count exactly.
- **First preferences:** every group's above-the-line total and every candidate's below-the-line total equals the AEC's official first preferences exactly, in all 12 contests (`ballots/checks.json`).
- **Winners:** the engine (`stvsim count`, Scottish STV rules) elects the official senators in all 12 contests from the full-count files. Senate rules differ in detail (bulk exclusions, rounding), so this wasn't guaranteed.

## How many boxes voters numbered

`ballots/checks.json` has the full counts (`btl_boxes_numbered`, `atl_boxes_numbered`) for each contest.

| Group of contests | Below the line: fewer than 12 | exactly 12 | more than 12 | Above the line: fewer than 6 | exactly 6 | more than 6 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Tasmania 2016 (12 seats) | 5.1% | **67.3%** | 27.6% | 4.5% | 85.0% | 10.4% |
| Tasmania 2019 to 2025 (6 seats) | 5.0% | 58.5% | 36.5% | 4.4% | 79.1% | 16.5% |
| ACT and NT, all years (2 seats) | 4.2% | 58.2% | 37.6% | 4.1% | 71.1% | 24.8% |
| All 12 contests | 4.7% | 59.8% | 35.5% | 4.3% | 75.4% | 20.4% |

About 1 in 5 voters voted below the line (16% in the territories, 23% to 28% in Tasmania).

- **The instructed number is the most common answer by far,** whether it's 6 boxes above the line or 12 below.
- **In territories with few groups, many voters number every box.** With 7 or 8 groups above the line, "more than 6" usually means all of them: 35% to 40% numbered every box in the NT, and in the ACT in 2025.
- **"Fewer" is undercounted below the line.** A below-the-line vote with fewer than 6 numbers isn't formal there, so it either counts above the line (if it has above-the-line marks) or is informal and absent. The "fewer than 12" column only holds ballots that numbered 6 to 11.

## Known problems

- **Only the three smallest contests.** The five states aren't included (see above).
- **Elections before 2016** used group voting tickets, a different system in which one "1" above the line adopted a party's registered ticket. They aren't included.
- **Territory ballot wording** is assumed, not seen (see "Source").
- **The full-count files aren't committed,** so the engine check needs a rebuild first.
