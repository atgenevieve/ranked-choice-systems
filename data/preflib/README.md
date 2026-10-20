# PrefLib election data

PrefLib is a public library of real preference data, including ranked ballots from real elections. This folder holds the 168 elections that Tomlinson, Ugander, and Kleinberg (2023) used in "Ballot Length in Instant Runoff Voting" (see `docs/literature.md`), converted to the project's ballot format (`docs/ballot-format.md`).

## Source

- **Website:** https://www.preflib.org, which now redirects to https://preflib.github.io/PrefLib-Jekyll/.
- **Files:** one zip per dataset, linked from each dataset page, for example https://github.com/PrefLib/PrefLib-Data/releases/download/v1.0/00001_irish.zip. `raw/MANIFEST.json` records every URL, size, and SHA-256 checksum.
- **Downloaded:** 2026-10-20.
- **Terms of use:** PrefLib states no license. It asks you to cite PrefLib when you publish research that uses its data (Mattei and Walsh, "PrefLib: A Library for Preferences", ADT 2013), and to include each dataset's own required citation. Most of the political elections here were donated by Jeffrey O'Neill of OpenSTV.org, which PrefLib asks you to cite as "Jeffery O'Neill. Open STV. www.OpenSTV.org, 2013." The APA data comes from Regenwetter and Popova, and the ERS data from Nicolaus Tideman. The dataset pages saved in `raw/` list the exact citations.

## Contents

168 elections, 2,717,020 ballots, 3.2 MB.

| Dataset | PrefLib number | Elections | Ballots | Real seats | Counting rule, as far as we know |
| --- | --- | ---: | ---: | --- | --- |
| Irish general election 2002 (Dublin North, Dublin West, Meath) | 00001 | 3 | 138,011 | 4, 3, 5 | Irish STV |
| Debian Project leader and logo votes | 00002 | 8 | 3,352 | 1 | Condorcet (Schulze) |
| Burlington, VT mayor 2006 and 2009 | 00005 | 2 | 18,730 | 1 | Instant runoff |
| Electoral Reform Society, anonymous organizations | 00007 | 87 | 35,610 | 1 to 12 (from Tideman's original files) | STV or instant runoff, rules unknown |
| Glasgow City Council 2007, 21 wards | 00008 | 21 | 188,376 | 3 or 4 | Scottish STV |
| Aspen, CO 2009 mayor and council | 00016 | 2 | 4,988 | 1 and 2 | Aspen instant runoff |
| Berkeley, CA 2010 council district 7 | 00017 | 1 | 4,171 | 1 | Instant runoff |
| Minneapolis, MN 2009 Park Board at-large and Board of Estimate and Taxation | 00018 | 2 | 68,741 | 3 and 2 | Minneapolis STV |
| Oakland, CA 2010 and 2012 | 00019 | 7 | 366,122 | 1 | Instant runoff |
| Pierce County, WA 2008 and 2009 | 00020 | 4 | 753,752 | 1 | Instant runoff |
| San Francisco, CA 2008 to 2012 | 00021 | 14 | 859,951 | 1 | Instant runoff |
| San Leandro, CA 2010 and 2012 | 00022 | 3 | 70,852 | 1 | Instant runoff |
| Takoma Park, MD 2007 council ward 5 | 00023 | 1 | 202 | 1 | Instant runoff |
| American Psychological Association presidents, 1998 to 2009 | 00028 | 12 | 203,896 | 1 | Hare (instant runoff) |
| UK Labour Party leader 2010, MPs only | 00030 | 1 | 266 | 1 | Alternative vote |

Each election is a pair of files in `ballots/`, named `<dataset>-<PrefLib file>-<title>`. Each metadata file has:

- `system`: always `unknown`, because PrefLib doesn't record the counting rules. The `notes` field says what we believe the rule was.
- `seats`: the real number of seats, also written on the `.ballots` file's `seats` line, which is what the engine reads. Sources: PrefLib descriptions; Glasgow from Wikipedia's "2007 Glasgow City Council election", whose 21 wards add up to the council's 79 seats; ERS from Tideman's original files (see [ERS elections](#ers-elections-seats-and-original-ballots)). Tomlinson et al. counted every election as single-winner instant runoff, whatever its real seat count.
- `official_winners`, `parties`, `party_source`, `slates`, `max_ranks` (the most ranks the ballot allowed; `null` when voters could rank every candidate, or when we don't know), and an exact `date`: filled in from public sources where we could confirm them. See [Party and slate labels](#party-and-slate-labels). A `label_sources` field names the source for each, and `label_notes` records anything unusual.
- `date`: an exact date where known. The 12 APA elections keep only the year from their PrefLib titles, the Debian logo vote has only its year (1999), and the 87 ERS elections have no date.
- Extra fields: `tied_ballots_dropped` (see below), `preflib_file`, and for ERS, `tideman_file`.

## How to rebuild

```
python3 data/preflib/download.py   # saves zips and dataset pages into data/preflib/raw/
python3 data/preflib/convert.py    # writes data/preflib/ballots/
python3 data/preflib/ers_tideman.py   # downloads Tideman's ERS files into raw/tideman/, rewrites the 87 ERS elections
python3 data/preflib/add_parties.py   # adds parties, slates, winners, dates, and rank limits from labels.json
```

All four use only the Python standard library. None runs anything from the downloaded files. Run them in this order: each later script edits what the earlier ones wrote.

## Cleanup rules

PrefLib has already cleaned these ballots. Its notes say blank ranks were removed and only the order of the ranked candidates was kept. That means skipped ranks are already closed up, and we can't tell where voters skipped. On top of that:

- **Tied ranks (overvotes).** PrefLib's `.toi` files show two or more candidates marked at the same rank as a tie, like `{1,2}`. We drop these ballots completely, as Tomlinson et al. did, and record how many in `tied_ballots_dropped`. This removed 4,933 ballots in all (0.18% of ballots). They are not counted as blank. The paper reports 0.5% of ballots; we haven't found the reason for the difference.
- **Repeated candidates.** None occur in these files. The script would keep a candidate's highest rank and drop later repeats.
- **Write-ins.** Where a file has a "Write-In" candidate, it stands for all write-in votes combined, and we keep it as one candidate.
- **Blank ballots.** None occur in PrefLib's files. Tideman's original ERS files have 100 blank ballots across 25 elections, which PrefLib had left out. They stay out of the `.ballots` files, and each election's count is in `blank_ballots`.
- **Ballots that ranked all but one candidate (ERS only).** PrefLib "completed" every ERS ballot that ranked all candidates but one by adding the missing candidate at the bottom. The voter's order is unchanged, so this can't change who wins, but it makes 10,715 of the 35,610 ERS ballots (30%) look one rank longer than the voter made them, in 85 of the 87 elections (all except ERS Sets 27 and 52). Ballot length is a key statistic for this project, so `ers_tideman.py` rebuilds the ERS files from Tideman's originals, which keep the real lengths. No other dataset here was changed this way: every other election has ballots ranking exactly all but one candidate, in normal numbers, wherever voters could rank that many.
- **Strict versus tied files.** We use the `.soi` file (strict orders) when one exists, and otherwise the `.toi` file (orders that allow ties). We never use `.toc` or `.soc` files, which PrefLib makes by adding every unranked candidate as tied at the bottom.

## Left out

- The two Minneapolis "Full" files (00018-00000001 and 00018-00000003) keep every write-in name as its own candidate: 379 and 477 candidates, most with one or two votes. We use the "No Write In" versions of the same races, as Tomlinson et al. did. That is how this folder gets the paper's 168 elections from PrefLib's 170 files.
- The `.dat` files in some zips, which PrefLib describes as the original data including invalid ballots, in a format we haven't checked.
- Other PrefLib election datasets that the paper didn't use, such as 00031 (Vermont district races). Add their numbers to `DATASETS` in `download.py` and `SHORT` in `convert.py` to include them.

## Known problems

- **Old, second-hand data.** Most political files came through OpenSTV.org, not directly from election officials. We have now added official winners from public sources (see below). With Scottish STV rules, the engine picks those winners in every public election except Aspen's 2009 council race, which used Aspen's own two-seat runoff rules.
- **Ballot length limits differ.** San Francisco, Oakland, Berkeley, San Leandro, Pierce County, and Minneapolis allowed only 3 ranks (`max_ranks` 3). APA ballots had 5 candidates and allowed ranking all 5. The others allowed every candidate to be ranked, as far as we know. This matters when you compare ranking depth across elections.
- **Glasgow 2007 overlaps the Scottish data** in `data/scotland/`, which may hold the same wards from a different copy. Don't count them twice.
- **Spelling.** PrefLib names the Berkeley dataset "berkley". We kept PrefLib's names so results can be matched to the paper.
- **ERS ballot lengths in older copies.** Any copy of the ERS files made from PrefLib before `ers_tideman.py` ran shows ballots one rank too long (see Cleanup rules). Results computed from those copies, such as `results/2026-10-20-real-data-counts/preflib.jsonl`, also used 1 seat for every ERS election.

## ERS elections: seats and original ballots

PrefLib's ERS files don't say how many seats each election filled. The Center for Range Voting publishes the same 87 elections in Nicolaus Tideman's original format (https://rangevoting.org/TidemanData.html, files `A1.HIL` to `A35.HIL` and `A48.HIL` to `A99.HIL`). The first line of each file gives the number of candidates and the number of seats.

`ers_tideman.py` matches each Tideman file to its PrefLib file and checks that they hold the same ballots. PrefLib numbered the sets in the text order of Tideman's file names (A1, A10, A11, …, A19, A2, A20, …), so ERS Set 2 is `A10.HIL`. Once you add the missing last candidate to each Tideman ballot that ranks all but one (PrefLib's change), the ballots match exactly in all 87 elections. Candidate numbers are the same in both. The script then rewrites each ERS `.ballots` file from Tideman's ballots, with the real seat count, and records the source file in `tideman_file`.

Seats per election: 1 seat in 20 elections, 2 in 25, 3 in 18, 4 in 6, 5 in 4, 6 in 3, 7 in 3, 8 in 1, 9 in 3, 10 in 1, 11 in 1, and 12 in 2. On average, an election fills seats equal to 42% of its number of candidates.

What's still unknown: the organizations, the dates, and the exact counting rules. Tideman's page says only that these are British organizations, mostly trade unions, using STV or instant runoff, and collected in 1987 and 1988. PrefLib's description adds that some files are complete sets of ballots and some are random samples. `ers_tideman.py` downloads the Tideman files into `raw/tideman/`, with a manifest of checksums. The files state no license, so cite Tideman and the Center for Range Voting page.

## Party and slate labels

The metadata now holds party labels, slates, official winners, exact dates, and ballot rank limits wherever a public source confirms them. Every value comes from `labels.json`, a hand-checked table that lists candidates by name, so you can review it without counting positions. `add_parties.py` turns the names into candidate numbers. It stops if any name, or the candidate order, doesn't match the metadata. In each metadata file, `party_source` and `label_sources` say where its values came from, and `label_notes` records anything unusual.

The two kinds of labels follow `docs/ballot-format.md`:

- **`parties`** holds real party labels only: what the ballot printed, or the candidate's official party. Independents and non-party candidates are `null`, so they don't look like a party of their own. Write-in entries are also `null`.
- **`slates`** holds groups of candidates that a public source names, in races without real party labels. Two kinds appear here: party endorsements (`kind: "endorsement"`) and candidates who asked their voters to rank each other (`kind: "campaign"`).

### Coverage

| Group | Elections | Real party labels | Slates | Official winners | Exact date | `max_ranks` |
| --- | ---: | --- | --- | --- | --- | --- |
| Irish 2002 | 3 | 3 elections; 29 of 35 candidates | none | 3 | 3 | unlimited |
| Glasgow 2007 | 21 | 21 elections; 199 of 208 candidates | none | 21 (79 seats) | 21 | unlimited |
| Burlington | 2 | 2 elections; 8 of 12 entries | none | 2 | 2 | unknown |
| Pierce County | 4 | 2 elections (Executive, Council District 2); 7 of 9 entries | none | 4 | 4 | 3 |
| Minneapolis 2009 | 2 | none (not confirmed) | party endorsements, both races | 2 | 2 | 3 |
| Oakland | 7 | none (nonpartisan) | Quan–Kaplan pact, 2010 mayor | 7 | 7 | 3 |
| San Francisco | 14 | none (nonpartisan) | none | 14 | 14 | 3 |
| San Leandro | 3 | none (nonpartisan) | none | 3 | 3 | 3 |
| Aspen, Berkeley, Takoma Park | 4 | none (nonpartisan) | none | 4 | 4 | Berkeley 3; others unknown |
| Debian | 8 | doesn't apply | none | 8 | 7 (logo vote: year only) | unlimited |
| APA | 12 | doesn't apply | none | none (anonymized) | none (year only) | unlimited (5 candidates) |
| UK Labour 2010 | 1 | doesn't apply | none | none (see below) | 1 | unlimited |
| ERS | 87 | doesn't apply | none | none | none | unknown |

In all: 28 elections with real party labels (243 of 264 entries labelled), 3 with slates, 68 with official winners, and 68 with exact dates. With Scottish STV rules (engine version 0.2.0), the engine picks the official winners in 65 of the 68. The three exceptions are expected: Aspen's council race used Aspen's own two-seat rules, and Debian decided its 2003 and 2006 votes by a Condorcet rule.

### Sources by group

- **Irish 2002.** PrefLib's candidate names end with the party abbreviation printed on the ballot paper: F.F., F.G., Lab, G.P., S.F., S.P., P.D., "C.C. Csp" for the Christian Solidarity Party, and "Non-P" for non-party. We checked every candidate against the 2002 results on Wikipedia's pages for the Dublin North, Dublin West, and Meath constituencies, which also give the winners. Polling day was 17 May 2002.
- **Glasgow 2007.** Wikipedia's "2007 Glasgow City Council election" lists every ward's candidates with their parties and marks the winners. It cites Andrew Teale's *Local Election Results 3rd May 2007* and the council's candidate lists. The winners agree, ward by ward, with Denis Mollison's count of the same ballots (https://www.macs.hw.ac.uk/~denis/stv_elections/SC2007/Glasgow/index.html). The party totals of the 79 winners also match his: Labour 45, SNP 22, Green 5, Liberal Democrats 5, Conservative 1, Solidarity 1. Labels use short party names, such as "Labour" for the Scottish Labour Party.
- **Burlington.** Wikipedia's pages on the 2006 and 2009 Burlington, Vermont mayoral elections give the parties, the winners (Bob Kiss both times), and the dates.
- **Pierce County.** Washington ballots printed each candidate's party preference. For County Executive, Wikipedia's "2008 Pierce County Executive election" gives McCarthy and Goings as Democrats and Bunney as a Republican. The Federal Way Mirror (16 September 2008) gives Mike Lonergan's ballot label, the "Executive Excellence Party". Council District 2's labels come from the county's official November 2008 results. The Assessor-Treasurer and 2009 Auditor candidates appeared with no party (the Auditor race was officially nonpartisan), so their labels are `null`. Winners come from the county's ranked-choice results tables.
- **Minneapolis 2009.** Winners and the 3-rank limit come from the city's results pages (https://vote.minneapolismn.gov/results-data/election-results/2009/). We couldn't confirm the party labels printed on the ballot for these two races, so `parties` stays `null`. The DFL, Green, Independence, and Republican endorsements on Wikipedia's "2009 Minneapolis municipal election", which cites each party, are recorded as endorsement slates.
- **Oakland, San Francisco, San Leandro, Berkeley, Aspen, Takoma Park.** These races are nonpartisan, and the ballots printed no party. Winners come from Wikipedia's San Francisco election pages, Oakland North (Oakland 2012), Wikipedia (Oakland 2010), the City of San Leandro's resolution certifying the 2012 results, the Alameda County Registrar (Berkeley), FairVote (Aspen), and the City of Takoma Park's April 2012 newsletter (Takoma Park). The one slate is the 2010 Oakland mayoral pact. SFist (11 November 2010) reports that Jean Quan and Rebecca Kaplan told their supporters "to list each other as second or third choices."
- **Debian.** Each leader election's page on debian.org gives the winner and the voting period, and `date` is the last day of voting. The logo vote matches Debian's 1999 "New Logo" vote, whose options are the same, and its winner was the Swirl. Debian picks winners with a Condorcet rule, so the engine's STV count can disagree, and it does for 2003 and 2006.

### Why some groups have no party data

- **APA:** PrefLib replaced the candidates' names with "Candidate 1" to "Candidate 5", so we can't attach parties or official winners. These are professional-society elections with no parties.
- **Debian:** a project-leader election inside a software organization. There are no parties.
- **UK Labour 2010:** every candidate was a Labour MP, so a party label tells you nothing. The file holds only the 266 MPs' ballots, one-third of the electoral college. Ed Miliband won the full college, not necessarily this section, so `official_winners` is `null`.
- **ERS:** the organizations and candidates are anonymous ("Candidate 1" and so on). Neither Tideman's files nor PrefLib's page give groups, slates, or winners. They do give seat counts (see above).

### What's uncertain

- **Pierce County Council District 2 and the Assessor-Treasurer race.** The county's website blocks automated downloads, so these labels come from search-engine extracts of the county's official results, not from reading the PDFs directly. Joyce McDonald's Republican label is confirmed elsewhere. Al Rose's and Carolyn Merrival's Democratic labels, and the Assessor-Treasurer race's lack of labels, rest on the extracts alone. Check them against https://piercecountywa.gov/DocumentCenter/View/1422/nov2008results when it can be opened.
- **Name differences.** Three Glasgow candidates are spelled differently on Wikipedia, and we matched them by elimination within their ward. Linn's "Alan Stewart" is "Allan Stewart" (Labour). Craigton's "Scott R Coghill" is "Scott R Goghill" (Liberal Democrats), and its "Gordon Macdiarmid" is "Gordon McDiamid" (Labour).
- **Ciarán Goulding** (Dublin North) appears on Wikipedia as "Ind. Health Alliance", but his ballot label in PrefLib is "Non-P", so he is `null`.
- **San Francisco District 7.** PrefLib's title has no year. The candidates are the 2012 field, which Norman Yee won, so we date it 6 November 2012.
- **Takoma Park.** The date (30 January 2007) comes from FairVote's announcement of the vote. Takoma Park's 2012 newsletter says Reuben Snipper won the 2007 Ward 5 special election.
- **`max_ranks` for Burlington, Aspen, and Takoma Park** is unknown. No ballot in those files ranks more candidates than the number running, so the ballots may have allowed voters to rank every candidate.
- **Not added:** San Francisco candidates' party registrations and the San Francisco Democratic Party's slate cards. We didn't find a source that lists them for every race.
