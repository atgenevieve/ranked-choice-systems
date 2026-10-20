# Clustering strength of every grouping found, October 20, 2026

Every candidate grouping found in the research, ranked by **clustering strength**: how much more often voters ranked the group's candidates together than popularity alone predicts. This is for reading and for the endorsement research (`docs/endorsement-cohesion.md`), not for tuning the model.

**Files:**
- `table.md`: all 127 groupings, strongest first.
- `associations.csv`: the same, for a spreadsheet.

**Built by:** `data/slate_review.py`, then `data/clustering_table.py`, at the commit that added this folder.

## How to read it

- **Observed:** of voters whose first choice is in the group and who ranked a second, the share whose second choice is also in the group.
- **Popularity alone:** the share expected if second choices followed each candidate's share of first choices and ignored the group.
- **Strength:** observed minus popularity alone, in percentage points. 0 means the group adds nothing beyond its members being popular. A negative number means its voters ranked each other *less* than popularity predicts.

Identical groupings in the same race are merged into one row. For example, UAW Region 9A and Citizen Action of New York endorsed the same five 2025 mayoral candidates, so they share a row. A pair found in the ballots that a slate or pact also names appears as that slate's row.

These are associations, not effects. A strong grouping shows that voters treated the candidates as belonging together, not that an endorsement caused it.

## By type

| Type | Groupings | Typical strength | Range |
|---|---|---|---|
| Party on the ballot (Scotland, pooled by party) | 4 | +59 | +54 to +63 |
| Endorsing organization | 50 | +9 | −15 to +46 |
| Pair found only in ballots | 44 | +14 | +10 to +45 |
| Newspaper | 16 | +5 | −12 to +26 |
| Candidate pact | 13 | +4 | −1 to +39 |

## Cautions

- **Pairs found only in ballots were picked for being strong:** the 5 strongest per race, and only those at least 10 points above popularity. Their typical strength overstates how strongly voters cluster in general.
- **Small races are noisy.** Some of the strongest pairs come from council races with about 1,000 voters (for example, Badrun Khan and Sultan Al Maruf, NYC 2021 District 26, +45). Check the voter count before reading much into a row.
- **Scottish parties are pooled** over every ward where the party ran 2 or more candidates. The Greens rarely did, so they don't appear.
- **Slates of one candidate can't be measured,** so most NYC council endorsements are missing.
- **NYC slates in 2021 are a January 2021 snapshot,** and several come from news trackers, not the endorser's own page (`data/nyc/README.md`).

## Charts

The charts page (https://claude.ai/artifact/HXybC2mYLTUz4QsWoLtpvJ) shows the types side by side, every grouping within each type, New York City endorsing organizations by organization, the Working Families Party in New York City, and unions in New York City. Each chart has a table view. Its data comes from `data/clustering_charts.py`, and its page template is `data/clustering_charts_page.html`.
