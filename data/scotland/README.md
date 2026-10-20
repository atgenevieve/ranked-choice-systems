# Scottish council elections

Full ranked ballots from Scottish local council elections in 2007 (Glasgow only), 2012, 2017, and 2022, plus 30 by-elections from 2015 to 2022. Scottish councils elect 3 or 4 councillors per ward by single transferable vote (STV), the multi-winner ranked system this project studies first.

## What's here

| Path | What it is | In git? |
|---|---|---|
| `download.py` | Downloads the raw data into `raw/`. | Yes |
| `convert.py` | Converts `raw/` into `ballots/`. | Yes |
| `ballots/*.ballots`, `ballots/*.json` | One ballot file and one metadata file per ward election, in the format in `docs/ballot-format.md`. | Yes (19 MB in all) |
| `ballots/_conversion-report.json` | For every election: where its winners came from, the checks run, and any cleanup. | Yes |
| `calibration.jsonl` | Calibration statistics for every election, from `data/calibration.py`. | Yes |
| `calibration-summary.md` | Summary table of the calibration statistics. | Yes |
| `raw/` | Raw downloads, with `raw/MANIFEST.json` listing each file's URL, download time, and checksum. | No (ignored) |

To rebuild everything from scratch, run these from the repository root:

```
python3 data/scotland/download.py
python3 -I data/scotland/convert.py
python3 -I data/calibration.py data/scotland/calibration.jsonl data/scotland/ballots --group-by group
```

The `-I` flag runs Python in isolated mode, so it can't load code from the data folders by accident. `download.py` needs network access and the `git` command. It takes several minutes, because it waits between Wikipedia requests to respect Wikipedia's rate limit.

## Sources

All downloaded on 20 October 2026.

### Ballots: David McCune's cleaned cast vote records, via MGGG

- **Where:** https://github.com/mggg/scot-elex, pinned to commit `de9f8e30c257fa85bfc3c9252e974a12e8faae7b` (22 July 2026). `download.py` fetches that exact commit.
- **What:** 1,100 ward elections in BLT format (`blt_files/`), a standard text format for STV ballots. David McCune (William Jewell College) collected them from the councils' published ballot data and cleaned them. MGGG (the Data and Democracy Lab, formerly the Metric Geometry and Gerrymandering Group) added CSV copies of 1,070 of them with standardized party labels. These are the files behind the McCune studies listed in `docs/literature.md`, including McCune and Naber (2026).
- **Original source:** each council's returning officer publishes the full set of ballot preferences for every ward after the count, as Scottish election rules require.
- **Terms of use:** the repository has no license file and states no terms. The underlying ballot data are official public records published by the councils. Before publishing anything built on this data, ask the repository's maintainers or David McCune how they want it credited, and cite McCune's papers. Treat it as research use with attribution until confirmed.

### Official winners, 2017, 2022, and by-elections from 2016: Democracy Club

- **Where:** https://candidates.democracyclub.org.uk/data/, the CSV export filtered to Scotland, for 4 May 2017, 5 May 2022, and all by-elections, with the `elected` field. The exact URLs are in `raw/MANIFEST.json`.
- **What:** volunteer-maintained candidate lists with an "elected" flag for each candidate, taken from council results.
- **Terms of use:** Creative Commons Attribution 4.0 (CC BY 4.0). Credit "Democracy Club" and link to https://democracyclub.org.uk wherever you use the data.

### Official winners, 2007 and 2012, and a cross-check for 2017 and 2022: Wikipedia

- **Where:** the source text (wikitext) of each council's English Wikipedia election page, such as https://en.wikipedia.org/wiki/2012_Glasgow_City_Council_election, fetched with `action=raw`.
- **What:** these pages reproduce each ward's official count, citing the council's declaration, and show elected candidates in bold. `convert.py` reads only the candidate names and the bold marks.
- **Terms of use:** Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0). Who won an election is a fact, not a creative work, but credit Wikipedia as the source.

### Not used: PrefLib dataset 00008

PrefLib dataset 00008 (https://www.preflib.org/dataset/00008) holds the same 21 Glasgow 2007 wards, donated by Jeffrey O'Neill of OpenSTV. The McCune data already includes them, so this folder doesn't use PrefLib. PrefLib data lives in `data/preflib/`.

## What the data covers

| Elections | Wards | Ballots | Official winners from |
|---|---|---|---|
| 2007 (Glasgow only) | 21 | 188,376 | Wikipedia: 21 |
| 2012 | 353 | 1,556,473 | Wikipedia: 353 |
| 2017 | 351 | 1,889,658 | Democracy Club: 347; Wikipedia: 3; withheld: 1 |
| 2022 | 345 | 1,846,979 | Democracy Club: 345 |
| By-elections, 2015 to 2022 | 30 | 122,859 | Democracy Club: 24; not found: 5; withheld: 1 |
| **Total** | **1,100** | **5,604,345** | **1,093 of 1,100** |

Wards have 3 to 14 candidates (median 7) and 3 or 4 seats, except by-elections, which fill 1 seat (one filled 2). In 8 of 10 wards, between about 3,000 and 7,500 people voted.

Scotland had 353 wards in 2012, 354 in 2017, and 355 in 2022. The source has every 2012 ward. It leaves out 3 wards in 2017 and 10 in 2022. Of those, 11 were uncontested: only as many candidates stood as there were seats, so no votes were cast. The other 2 are Renfrewshire 2022 wards (Paisley Northeast and Ralston; Renfrew North and Braehead), which the source doesn't include. The reason isn't recorded.

## How the data was cleaned

The raw BLT files were already clean. `convert.py` checks for every problem below and found none, so it changed no ballots:

- **Skipped ranks:** none. The source lists each ballot as the candidates in order, so a gap (for example, a 1 and a 3 with no 2) can't appear. Under Scottish rules a ballot stops counting at a missing number, so the councils' data, and McCune's files, already stop each ballot there.
- **Repeated candidates:** none. If a ballot had listed a candidate twice, `convert.py` would keep the first mention and drop the rest.
- **Numbers outside the candidate list, or withdrawn candidates:** none. Such marks would be dropped.
- **Blank ballots:** none. Every ballot in the source ranks at least one candidate. Rejected ballot papers (blank or spoiled) aren't in the published data, so `blank_ballots` is 0 in every metadata file.

`convert.py` also combines identical ballots into one line with a count, and numbers candidates from 0 in the order the source lists them. That order is alphabetical by surname, the order printed on Scottish ballot papers.

### Names, wards, and party labels

- **Party labels** come from MGGG's CSV files, as the short labels MGGG defined (for example `SNP`, `Lab`, `Con`, `LD`, `Gr`, `Ind`; the full list is in `raw/scot-elex/README.md`). `Ind` means an independent candidate, not a party. `LabCo` (Labour and Co-operative) is a separate label from `Lab` in the data; `data/calibration.py` treats the two as one party.
- **By-elections** have no MGGG CSV. Their labels come from the party description printed in the BLT file, or, when that's blank, from Democracy Club's party name, mapped to the same short labels by rules in `convert.py`. These labels are less reliable. Four by-elections from 2015 and 2016 have no labels at all (`null`).
- **Candidate names** come from MGGG's CSV files. Where the source name was damaged, `convert.py` replaced it from the matching Democracy Club or Wikipedia entry and says so in the election's `notes`:
  - Midlothian 2012 (all 6 wards): every surname is missing its last letter in the source (for example "Gary Bel" for Gary Bell).
  - Aberdeenshire 2022, ward 1: every name is split into pairs of letters ("St Ew Ar T Ad Am S" for Stewart Adams).
- **Ward names** come from the source. Two damaged ward names are corrected by hand (Aberdeenshire 2022 ward 1, Midlothian 2012 ward 1).
- One party label was wrong in the source and is corrected by hand: Frank Anderson (West Lothian 2022, ward 5) is labeled SNP but stood as an independent after the SNP deselected him. A comparison of all 5,082 party labels for 2017 and 2022 against Democracy Club found no other real disagreement; the other 97 differences were spellings of the same party.

### How official winners were matched and checked

The engine will use `official_winners` to check its own counting, so `convert.py` cross-checks them several ways:

1. **Matching.** Each election is matched to a Democracy Club or Wikipedia ward by comparing candidate names, not ward names, so differences in ward naming don't matter. Every candidate must match. When exactly one name is left over on each side (usually a married name, such as "Louise Laing" and "Louise Nicol"), the two are paired, and the election's `notes` say so.
2. **Seat count.** A source's winners are used only if it lists exactly as many winners as there are seats.
3. **Two sources.** For 2017 and 2022, both Democracy Club and Wikipedia were matched. They agree on 688 of 689 wards that both cover.
4. **Quota check.** Every candidate whose first choices alone reach the quota must be among the winners. No election failed this.
5. **A rough independent count.** As a one-off check, not part of this folder, a short scratch script counted every election by Scottish STV rules. Its winners matched the official winners in all 1,093 elections that have them. This shows the ballots and the winner lists fit together. It isn't a substitute for the engine's validation.

## Known problems

- **Winners withheld in 2 elections.** `official_winners` is `null`, with the reason in `notes`, for:
  - Falkirk 2017, ward 6: Democracy Club and Wikipedia disagree on the fourth seat (Wendy Chandrachud or Robert Bissett). The rough count agrees with Wikipedia. Check Falkirk Council's declaration before using this election as a test.
  - Glasgow 2021 by-election, Partick East/Kelvindale: Democracy Club says Abdul Bostani (SNP) won, but the rough count of these ballots elects Jill Brown (Labour). Either the flag or the ballot file is wrong. Check Glasgow City Council's declaration.
- **Winners not found for 5 by-elections** (Edinburgh 2015, Aberdeenshire 2016 twice, Perth and Kinross 2015 and 2016). Democracy Club's records start in 2016 and don't include them.
- **Democracy Club errors.** In 3 wards from 2017, Democracy Club's elected flags are wrong (5 winners for 4 seats in Renfrewshire ward 4; 3 for 4 in Fife ward 7 and Aberdeenshire ward 7). Wikipedia's winners are used for these.
- **Spelling differences.** Several candidates are spelled differently across sources (for example "Ian Sloan" and "Ian Sloane"). Names that differ by more than spelling are listed in each election's `notes`. A few look like errors in one source rather than name changes (for example "Duncan Simpson", Shetland 2017 ward 1, appears as "Duncan Anderson" in Democracy Club). The ballots don't depend on names, so this doesn't affect any count.
- **The 2007 data is Glasgow only.** Glasgow's wards are larger than most (9 to 13 candidates, about 9,000 voters each) and its voters behave differently from the rest of Scotland's (more single-candidate ballots). Don't treat 2007 as a Scotland-wide year.
- **Ballot data accuracy.** The ballots are as published by councils and cleaned by McCune. This project hasn't compared them with the councils' original files, apart from the winner checks above.
