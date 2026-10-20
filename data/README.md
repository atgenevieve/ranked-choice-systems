# Real ballot data

Real ranked ballots, one folder per source, all converted to the project's `.ballots` format (`docs/ballot-format.md`). This page sums up each dataset: what it is, what was changed during conversion, and its known shortcomings. Each folder's own README has the full detail, sources, and rebuild steps.

| Source | Elections | Ballots | Seats per election | Official winners | Party or slate labels |
|---|---:|---:|---|---:|---|
| [Scotland](scotland/README.md) | 1,100 | 5.6 million | 3 or 4 (by-elections: 1) | 1,093 | Parties, nearly all |
| [PrefLib](preflib/README.md) | 168 | 2.7 million | 1 to 12 | 68 | Parties in 28, slates in 3 |
| [NYC](nyc/README.md) | 126 | 8.8 million | 1 | 125 | Endorsement slates in 56 contests |
| [Portland](portland/README.md) | 6 | 780,000 | 3 (mayor and auditor: 1) | 6 | Endorsement slates in 5 contests |
| [Cambridge](cambridge/README.md) | 10 races, no ballots | – | 9 or 6 | 10 | – |

**Engine check:** the engine picks the official winners in every election that has them and uses rules it can count: 1,093 Scottish wards, 125 NYC contests, 6 Portland contests, and 65 of 68 PrefLib elections. The 3 PrefLib misses used other counting rules. See `results/2026-10-20-real-data-counts/`.

**Statistics:** `calibration.py` computes the calibration statistics in `docs/model-spec.md` for any set of `.ballots` files. Each folder has a `calibration.jsonl` and a `calibration-summary.md`.

## Scotland

**Details**
- Scottish council ward elections: Glasgow 2007, all of Scotland in 2012, 2017, and 2022, and 30 by-elections from 2015 to 2022.
- Counted by Scottish STV, the same rules the engine follows, so this is the main source for the project.
- Ballots: David McCune's cleaned data, via MGGG's `scot-elex` repository (pinned to one commit).
- Winners: Democracy Club (2017, 2022, by-elections) and Wikipedia (2007, 2012, and a cross-check). The two agree on 688 of the 689 wards both cover.
- Typical ward: 7 candidates for 3 or 4 seats, 3,000 to 7,500 voters.
- Party labels from MGGG's standardized labels.

**Adjustments**
- No ballots needed cleaning: no skipped ranks, repeated candidates, or blank ballots.
- Damaged candidate names repaired from other sources: Midlothian 2012 (every surname missing its last letter) and Aberdeenshire 2022 ward 1 (names split into letter pairs).
- One wrong party label fixed by hand: Frank Anderson, West Lothian 2022 ward 5, stood as an independent, not SNP.
- Democracy Club's winners replaced by Wikipedia's in 3 wards from 2017 where Democracy Club listed the wrong number.
- By-election party labels mapped from party descriptions, which is less reliable.

**Shortcomings**
- **License not confirmed.** The repository has no license. Ask McCune or MGGG how to credit it before publishing.
- **2 elections have disputed winners** and are left out of checks: Falkirk 2017 ward 6, and the Glasgow 2021 Partick East–Kelvindale by-election (one source names the SNP candidate; counting the ballots elects Labour).
- **5 by-elections from 2015 and 2016 have no known winners,** and 4 have no party labels.
- **13 wards are missing:** 11 were uncontested, and 2 Renfrewshire 2022 wards are missing for no recorded reason.
- **Rejected ballots aren't published,** so blank-ballot counts are 0 everywhere.
- **Glasgow 2007 isn't typical of Scotland** (bigger wards, more one-candidate ballots), and it's also in PrefLib. Don't count it twice.

## PrefLib

**Details**
- The 168 elections studied by Tomlinson, Ugander, and Kleinberg (2023), from the public PrefLib library.
- Public elections: Ireland 2002, Glasgow 2007, Burlington, Minneapolis, Oakland, San Francisco, San Leandro, Berkeley, Aspen, Pierce County, Takoma Park.
- Organizational elections: 87 Electoral Reform Society (ERS) elections, mostly British trade unions in 1987 and 1988, plus Debian, the American Psychological Association (APA), and UK Labour MPs.
- Counting rules vary by election, and PrefLib doesn't record them; `notes` gives the likely rule.

**Adjustments**
- Ballots with tied ranks (two candidates at the same rank) dropped, as the paper did: 4,933 ballots (0.18%).
- Real seat counts for the ERS elections (1 to 12) taken from Tideman's original files, which match PrefLib ballot for ballot. They had been assumed to be 1.
- ERS ballots rebuilt from Tideman's originals, because PrefLib had padded 30% of them by one rank. No other dataset was padded.
- Party labels, slates, winners, dates, and rank limits added from public sources, in a hand-checked table (`labels.json`).
- Minneapolis uses the "no write-in" versions of its two races, as the paper did.

**Shortcomings**
- **Second-hand data.** Most political files came through OpenSTV.org, not election officials.
- **Rank limits differ:** 31 elections allowed only 3 ranks, which caps ballot length. Limits for Burlington, Aspen, and Takoma Park are unknown.
- **Skipped ranks can't be seen,** because PrefLib had already closed them up.
- **No winners** for ERS and APA (anonymized) or UK Labour (MPs only).
- **ERS organizations, dates, and exact rules are unknown.**
- **Weakly sourced labels:** some Pierce County party labels rest on search extracts, because the county site blocks automated access.
- **Tied-ballot share differs from the paper** (0.18% here, 0.5% reported), cause unknown.
- **The first results file** (`results/.../preflib.jsonl`) used the old seats and padded ballots; use `preflib-v2.jsonl`.

## NYC

**Details**
- Every ranked-choice primary contest in 2021, 2023, and 2025: mayor, public advocate, comptroller, borough president, and city council.
- Single-winner instant runoff, up to 5 ranks (3 or 4 when fewer candidates run).
- Ballots from the Board of Elections' cast vote records; winners from its certified round-by-round pages.
- Includes the 2021 Democratic mayoral primary (942,031 ballots), whose first round matches the official count exactly.

**Adjustments**
- Cleanup follows the Board of Elections' rules: an overvote (two candidates at one rank) ends the ballot there, skipped ranks are passed over, a repeated candidate counts at its highest rank.
- All write-ins combined into one candidate, as the official count does.
- 2025 Republican Council District 47's winner taken from the Board of Elections' certified hand recount, which came after the ballot file.
- Endorsement slates (WFP, DSA, unions, Citizens Union, editorial boards marked as media, cross-endorsement pacts) added from public sources, in a reviewable table (`slates.json`).
- Blank ballots estimated from ballot styles (see shortcomings).

**Shortcomings**
- **Single-seat only,** and many contests are lopsided or have few candidates.
- **No party labels,** because everyone in a primary is in the same party.
- **Endorsement slates are uneven:** 188 slates in 56 contests, deepest for the 2021 and 2025 mayoral primaries. The 2021 council slates are a January 2021 snapshot, and several come from news trackers rather than the endorser's own page. Most council slates have one member, so they can't measure cohesion.
- **Blank-ballot counts are estimates,** and too low for 2023 (no public source for the real figure).
- **4 contests from 2021 differ slightly** from the official first round (2 to 14 votes). These are exactly the 4 contests that were hand-recounted or recertified after the ballot file was made, so the ballot file can't show the hand-count changes.
- **The 2021 Republican Queens Borough President contest has no official winner** (no count was posted; the primary was reportedly canceled), and its candidates appear only as ID numbers.
- **The 2026 primary** is posted but not yet included.

## Portland

**Details**
- Portland's first ranked-choice elections, November 2024: four 3-seat council districts by STV, plus mayor and auditor by instant runoff. Up to 6 ranks.
- The closest public match to large multi-seat ballots: 9 to 31 candidates per council district.
- Ballots from Multnomah County's cast vote records, covering all three counties Portland spans. Winners from the certified results.

**Adjustments**
- Cleanup follows City Code 2.08: an overvoted rank is skipped and the ballot goes on (unlike NYC). Skipped ranks are passed over.
- Uncertified write-ins kept as one candidate; raw write-in bubble columns ignored, which brought totals closer to the official count.
- Ballots remade by election workers kept, which matches the official count better than leaving them out.
- A raw write-in mark at the same rank as a candidate is treated as an overvote. This makes the first round match the official count exactly in all six contests. The rule is inferred from the match, not from county documentation.
- 55 endorsement slates added from public sources (`slates.json`): WFP, labor councils, firefighters, police union (partly), DSA, United for Portland, the Chamber, Sierra Club, three newspapers marked as media, and one "rank us together" pair per district.

**Shortcomings**
- **Portland's own STV rules** differ slightly from Scottish rules (values cut to 4 decimal places, simultaneous surpluses). The engine still picks the official winners.
- **No party labels** (all candidates nonpartisan), and no public source for party registration.
- **Some slates are secondhand:** the Sierra Club and Oregonian lists come from a reform-group tracker, because their pages couldn't be fetched. The police union's District 2 and 3 lists may be incomplete. Several groups with only partial public lists are left out.
- **Blank-ballot counts are estimates.**
- **The auditor race had one candidate,** so it says nothing about ranking.

## Cambridge

**Details**
- 9-seat City Council and 6-seat School Committee, by STV since 1941: the longest-running multi-winner ranked elections in the US.
- Official count results for 10 races from 2017 to 2025: winners, quota, ballots, and first-choice totals (`official-results.json`).

**Adjustments**
- None. There are no ballots to convert.

**Shortcomings**
- **No ballots.** Cambridge doesn't publish them. Options: a public records request to the Cambridge Election Commission, or researchers who have them (MGGG, FairVote).
- **Cambridge moves whole ballots chosen at intervals** instead of fractions of every ballot, so results depend on counting order. The engine doesn't model this yet.
- **No results before 2017** in this folder.

## Across all datasets

- **Ballot rank limits shape ballot length.** NYC allows 5 ranks, Portland 6, and many PrefLib cities 3. Scotland and the ERS elections allow ranking every candidate. Compare ballot lengths only alongside the limit (`max_ranks`).
- **Party labels and slates mean different things.** `parties` holds real party labels; `slates` holds endorsement groups in nonpartisan races (`docs/ballot-format.md`).
- **None of these is a large organizational election.** The largest public ballot here is about 31 candidates for 3 seats. Past ballots from the organization this study is for would be the closest match.
