# Cambridge, Massachusetts

Cambridge has elected its 9-member City Council and 6-member School Committee by single transferable vote (STV), a multi-winner ranked system, since 1941. It would be valuable here because it's the longest-running multi-winner ranked election in the United States.

**We could not get ballot data for Cambridge.** The city does not publish its ballots (cast vote records) online. This folder has no `.ballots` files. It holds the official count results instead, which can check a Cambridge-rules count once ballots are available, and which give first-choice totals for every candidate.

## What we searched

On 2026-10-20 we checked:

- The Election Commission's results page, https://www.cambridgema.gov/Departments/electioncommission/electionresults, and each municipal election's results news page. These link to count-by-count reports (made with ChoicePlus Pro, the city's counting software), first-choice totals by ward and precinct (PDF), and turnout. None link to ballot files.
- The folders that hold the count reports (for example `https://www.cambridgema.gov/Election2023/Official/`). These don't allow browsing.
- Web searches for Cambridge ballot images, cast vote records, and research datasets.

Leads for getting the ballots:

- **Ask the Cambridge Election Commission,** through a public records request if needed. This is the most direct route.
- **Researchers who already have them.** MGGG (the MIT/Tufts Data and Democracy Lab) says its report "Comparing Electoral Systems for the Massachusetts Legislature" (https://mggg.org/MA-report) used historical Cambridge STV ballot records. FairVote's 2026 report on ranking limits (Hutchinson; see `docs/literature.md`) recounted Cambridge races with shorter ballots, so it had ballot data too. MGGG's VoteKit software includes Cambridge ballot summaries, but only as Python "pickle" files, which can run code when opened, so we did not download them.
- **A small sample.** The R package `rcv` (on CRAN) includes ballot data from a 2005 Cambridge City Council election. We didn't use it: it's one old election, in R's own data format, and its documentation doesn't say whether it's complete.

## What's here

- `download.py` saves every round page of each official count report into `raw/<year>/<race>/` and writes `official-results.json`.
- `official-results.json` (committed, about 20 KB) has, for each race: the counting rules as the report states them, valid and invalid ballots, seats, quota, the first-count total for every candidate, and the winners in the order they were elected.

| Year | Race | Valid ballots | Seats | Quota | Rounds |
| --- | --- | ---: | ---: | ---: | ---: |
| 2017 | City Council | 22,524 | 9 | 2,253 | 19 |
| 2017 | School Committee | 20,708 | 6 | 2,959 | 9 |
| 2019 | City Council | 21,239 | 9 | 2,124 | 15 |
| 2019 | School Committee | 19,425 | 6 | 2,776 | 10 |
| 2021 | City Council | 21,814 | 9 | 2,182 | 13 |
| 2021 | School Committee | 20,017 | 6 | 2,860 | 9 |
| 2023 | City Council | 23,339 | 9 | 2,334 | 17 |
| 2023 | School Committee | 21,255 | 6 | 3,037 | 9 |
| 2025 | City Council | 25,366 | 9 | 2,537 | 14 |
| 2025 | School Committee | 23,115 | 6 | 3,303 | 15 |

The first-count totals add up exactly to the valid ballots in all ten races. The script found no official count-by-count pages for 2015 or earlier. Those years are linked differently (2009 and 2011 results are PDFs), and we haven't added them.

Run `python3 data/cambridge/download.py`. Standard library only; nothing downloaded is executed.

## How Cambridge counts (`cambridge-stv`)

Each report states the rules as: "System: Proportional Representation. Quota Type: Droop. Surplus Transfers: Random, every nth ballot (Cambridge style). Avoid exhausted ballots if possible. Elected immediately (after the 1st count). Simultaneous Drop: Those with less than 50 votes. Ties: 1) Previous Count method 2) By election official 3) Random (by computer)." In plain terms:

- **Whole ballots move, not fractions.** When a candidate has more votes than the quota, the surplus is passed on as whole ballots, taken at regular intervals ("every nth ballot") from that candidate's pile. Which ballots move depends on the order in which ballots were counted, so a recount in a different order can give a different result.
- **Skip ballots that would run out.** When picking surplus ballots, the count avoids ballots with no further usable choices.
- **Drop all small candidates at once.** After the first count, every candidate with fewer than 50 votes is eliminated together, along with write-ins.
- **Ties:** decided by who had more votes in earlier counts, then by the election official, then at random.

When ballot data becomes available, `convert.py` should write `system: "cambridge-stv"`, keep the city's ballot order if the data has it (the random surplus transfers depend on it), and take `official_winners` from `official-results.json`.

## Known problems

- No ballot data, as explained above.
- Candidate names are written differently across years ("Siddiqui, Sumbul" in 2017 and 2021, "Sumbul Siddiqui" from 2023), and ChoicePlus Pro shortens long names (for example "Jivan G. Sobrinho-Whee.").
