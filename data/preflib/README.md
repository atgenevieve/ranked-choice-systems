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
| Electoral Reform Society, anonymous organizations | 00007 | 87 | 35,610 | unknown, set to 1 | various |
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
- `seats`: the real number of seats where we know it (sources: PrefLib descriptions; Glasgow from Wikipedia's "2007 Glasgow City Council election", whose 21 wards add up to the council's 79 seats). Tomlinson et al. counted every election as single-winner instant runoff, whatever its real seat count.
- `official_winners`: always `null`. PrefLib doesn't include results.
- `parties`: always `null`. Irish candidate names end with a party abbreviation (for example "Joan Burton Lab"), which a later script could split out.
- `date`: the year only, taken from the election title, because PrefLib gives no exact dates. 89 titles have no year and get `null`: all 87 ERS elections, the Debian logo vote, and San Francisco Board of Supervisors District 7 (PrefLib's neighbors suggest 2012).
- Two extra fields: `tied_ballots_dropped` (see below) and `preflib_file`.

## How to rebuild

```
python3 data/preflib/download.py   # saves zips and dataset pages into data/preflib/raw/
python3 data/preflib/convert.py    # writes data/preflib/ballots/
```

Both use only the Python standard library. Neither runs anything from the downloaded files.

## Cleanup rules

PrefLib has already cleaned these ballots. Its notes say blank ranks were removed and only the order of the ranked candidates was kept. That means skipped ranks are already closed up, and we can't tell where voters skipped. On top of that:

- **Tied ranks (overvotes).** PrefLib's `.toi` files show two or more candidates marked at the same rank as a tie, like `{1,2}`. We drop these ballots completely, as Tomlinson et al. did, and record how many in `tied_ballots_dropped`. This removed 4,933 ballots in all (0.18% of ballots). They are not counted as blank. The paper reports 0.5% of ballots; we haven't found the reason for the difference.
- **Repeated candidates.** None occur in these files. The script would keep a candidate's highest rank and drop later repeats.
- **Write-ins.** Where a file has a "Write-In" candidate, it stands for all write-in votes combined, and we keep it as one candidate.
- **Blank ballots.** None occur in these files (`blank_ballots` is 0).
- **Strict versus tied files.** We use the `.soi` file (strict orders) when one exists, and otherwise the `.toi` file (orders that allow ties). We never use `.toc` or `.soc` files, which PrefLib makes by adding every unranked candidate as tied at the bottom.

## Left out

- The two Minneapolis "Full" files (00018-00000001 and 00018-00000003) keep every write-in name as its own candidate: 379 and 477 candidates, most with one or two votes. We use the "No Write In" versions of the same races, as Tomlinson et al. did. That is how this folder gets the paper's 168 elections from PrefLib's 170 files.
- The `.dat` files in some zips, which PrefLib describes as the original data including invalid ballots, in a format we haven't checked.
- Other PrefLib election datasets that the paper didn't use, such as 00031 (Vermont district races). Add their numbers to `DATASETS` in `download.py` and `SHORT` in `convert.py` to include them.

## Known problems

- **Old, second-hand data.** Most political files came through OpenSTV.org, not directly from election officials. We can't check them against official results, because none are included.
- **Ballot length limits differ.** San Francisco, Oakland, Berkeley, San Leandro, Pierce County, and Minneapolis allowed only 3 ranks. APA allowed 5. The others allowed every candidate to be ranked. The file format doesn't record this limit; it matters when you compare ranking depth across elections.
- **Seats for ERS elections are unknown.** They are set to 1.
- **Glasgow 2007 overlaps the Scottish data** in `data/scotland/`, which may hold the same wards from a different copy. Don't count them twice.
- **Spelling.** PrefLib names the Berkeley dataset "berkley". We kept PrefLib's names so results can be matched to the paper.
