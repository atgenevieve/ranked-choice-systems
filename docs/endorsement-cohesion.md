# Measuring how voters follow endorsements and slates

A method, and early findings, for measuring how much voters rank candidates together beyond what popularity alone explains, using ranked ballots. It started as part of the rank-depth project (tuning the voter model's slate settings), but it's useful on its own: for judging endorsements, slates, and candidate pacts in any ranked-choice election with published ballots.

**Status:** working method, first findings, October 2026. The owner is marking which groupings reflect real political structure; see [What's next](#whats-next).

## What it measures

Take a group of candidates: an endorsement slate, a "rank us together" pact, a party's candidates, or any pair. Look at every voter whose **first choice** is in the group and who ranked a second choice. The **cohesion** of the group is the share of those voters whose **second choice** is also in the group.

Cohesion alone means little, because popular candidates get ranked second a lot no matter what. So compare it with two baselines:

- **Popularity alone:** the share you'd expect if each voter's second choice followed every other candidate's share of first choices and ignored the group. For a voter whose first choice is candidate *a*, the chance of picking group member *m* second is *m*'s first-choice share divided by (1 − *a*'s share). Average that over the group's voters.
- **Random:** the share you'd expect if second choices were spread evenly over the other candidates. For reference only; it overstates every group's strength.

The **excess over popularity** (cohesion minus the popularity baseline, in percentage points) is the headline number. It's what the group adds beyond its members being popular.

The method also searches the ballots for **pairs found only in ballots**: pairs of candidates whose voters rank each other far more than popularity predicts, whether or not any endorsement links them. These show groupings voters made on their own.

## What it can and can't tell you

**It measures association, not effect.** A high excess means voters treated the group's candidates as belonging together. It does *not* show that the endorsement or pact caused that. At least three things mix in the number:

1. Voters already saw the candidates as similar (shared politics, identity, base, or style).
2. The endorsement or pact itself moved votes.
3. Endorsers picked candidates whose voters already overlapped.

Ballots alone can't separate these. Example: Mamdani and Lander in the 2025 NYC mayoral primary had a cross-endorsement, but they were also the two democratic socialist candidates, so their voters would likely have ranked each other often without the pact.

**So don't say** "this endorsement moved X% of votes." **You can say** "voters who chose this slate's candidates first ranked another of its candidates second X points more often than popularity predicts," and compare that across endorsers, places, and years.

**Awareness isn't measured.** An endorsement few voters knew about shows little excess, which is honest, but the method can't tell "voters didn't know" from "voters knew and didn't care."

## Early findings

From NYC primaries (2021, 2025), Portland 2024, and Scottish council elections (2007 to 2022). Typical values across races:

| Grouping | Cohesion | Popularity alone | Random |
|---|---|---|---|
| Scottish parties | 84% | 21% | 17% |
| Portland endorsement slates | 45% | 31% | 13% |
| NYC endorsement slates | 38% | 29% | 17% |

Selected groupings:

| Grouping | Cohesion | Popularity alone | Excess |
|---|---|---|---|
| Mamdani and Lander (pact), NYC 2025 | 66% | 26% | +40 |
| Working Families Party ranked slate, NYC 2025 | 80% | 37% | +43 |
| Koyama Lane and Morillo (pact), Portland District 3 | 46% | 24% | +22 |
| Clark and Zimmerman (pact), Portland District 4 | 49% | 18% | +31 |
| Cuomo and Stringer (no shared endorsement found), NYC 2025 | 18% | 5% | +13 |
| Mamdani and Blake (cross-endorsement), NYC 2025 | 3% | 1% | +2 |
| Citizens Union guide, NYC 2025 | 23% | 28% | −5 |

Patterns worth following up:

- **Party labels on the ballot are far stronger than endorsement slates.** Scottish parties sit about 60 points above popularity; endorsement slates sit about 10 to 15.
- **Pacts vary hugely.** Some show strong excess (Mamdani and Lander); others show almost none (Mamdani and Blake). A pact with a minor candidate may simply not reach that candidate's voters.
- **Good-government voter guides show little or negative excess,** at least in NYC.
- **Voters make their own groupings.** Pairs like Cuomo and Stringer, with no shared endorsement in our data, show excess comparable to formal slates.

All of this is first-pass. Check any number against the files before using it in public.

## How to run it

Everything uses the project's ballot format (`docs/ballot-format.md`): a `.ballots` file of rankings and a `.json` metadata file listing candidates and, under `slates`, each endorsement or pact with its members and a source link.

1. **Get ballots** for the election (a cast vote record), and convert them to `.ballots` files. `data/nyc/convert.py` and `data/portland/convert.py` are working converters to copy from.
2. **List the slates** in a reviewable table (`data/nyc/slates.json`, `data/portland/slates.json`), with sources, and write them into the metadata (`add_slates.py` in each folder).
3. **Compute cohesion:**
   - `python3 -I data/calibration.py out.jsonl data/<source>/ballots` gives cohesion and both baselines for every slate (under `endorsement_slate_cohesion`).
   - `python3 -I data/slate_review.py data/slate-review.json` builds the review table, including the pairs found only in ballots.
4. **Review:** the slate review page (https://claude.ai/artifact/3UBqtyAtQWBAPLH9LUQDGy, template in `data/slate_review_page.html`) lets people who know each place mark which groupings reflect real political structure.

The code is in the `atgenevieve/ranked-choice-systems` repository: `data/calibration.py` (`slate_stats`, `popularity_baseline`), and `data/slate_review.py`.

## What's next

**For the rank-depth project:** the owner's marks decide which groupings tune the model's slate settings. Until enough are marked, the model uses a provisional range, so the project isn't blocked.

**To get closer to effects, not just associations:** the data allows some designs that ballots alone don't:

- **Timing.** Some endorsements and pacts came late (Mamdani and Lander, June 13, 2025). If early votes can be told apart from later ones, compare cohesion before and after. NYC's ballot files don't record when a ballot was cast; check whether early-voting ballots are reported separately.
- **Geography.** The raw NYC and Portland ballot files record each ballot's precinct (the converted files drop it). Comparing cohesion across precincts, against where an endorser actually campaigned (canvassing, mailers), would show whether cohesion follows the campaign or follows existing politics.
- **The same endorser across many races.** An endorser that picks very different candidates in different districts, yet shows the same excess everywhere, is more likely moving votes than reflecting them.
- **Withdrawn endorsements.** The Working Families Party's April 2021 ranking, later withdrawn, is a natural comparison with its final pick.
- **Surveys.** Asking voters why they ranked as they did is the most direct route, and could be paired with ballots.

**Other places to apply it:** any election with published ranked ballots and documented endorsements, such as Alaska, Maine, San Francisco, Minneapolis, or the 2026 NYC primary (posted but not yet converted).
