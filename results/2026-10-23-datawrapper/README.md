# Charts for the blog post, October 23, 2026

Chart-ready data for Datawrapper, one CSV per chart in `charts/`, with notes on how to set up each chart. To make a chart in Datawrapper, choose **Upload data**, pick the CSV, and follow the settings below.

**Real-election charts (1 to 4)** come from counts of real ballots and are solid enough to quote. **Simulated charts (5 to 7)** come from the voter model and are provisional (see [Cautions](#cautions)).

**Built by:** `python3 make_charts.py`, from `../2026-10-20-real-data-counts/` (engine commit `083c0e0`) and the simulated runs in `raw/` (engine version 0.2.0, commit `d9afd10`, model version 0.2, seed 1). To rerun the simulations: `stvsim run settings/<file>.toml > raw/<file>.jsonl`.

## Words used in the charts

- **Ballots stop after rank *k*:** recount the election as if every voter had ranked only their top *k* choices. If the same people win, ranks below *k* didn't change the result.
- **Decided within rank *k*:** cutting every ballot after rank *k*, or after any deeper rank, gives exactly the same winners as full ballots.
- **Seats that go to someone else:** how many winners differ from the full-ballot winners after cutting ballots short. In a 46-seat election, one seat changing and twenty seats changing both count as "the winners change," so this shows how big the change is.
- **Votes that reached this rank:** the share of all votes that traveled down to rank *k*, because every candidate the voter ranked higher had already won or been knocked out. This measures how much a rank gets *used*, not whether it changes who wins.

## Colors

Two palettes from the project's earlier charts, both used below. Charts use linear scales only, and no colored stripes on the side of boxes.

| Use | Color |
|---|---|
| NYC primaries (public, 1 seat) | `#2a78d6` blue |
| Scottish council wards | `#1baf7a` green |
| Organization elections | `#eb6834` orange |
| Anything secondary or "other" | `#8c8b85` warm gray |
| A single simulated series (main line or bar) | `#1f3b73` navy |
| A second simulated series | `#9aabcb` soft blue |
| Reference lines and labels | `#111111` near-black |

The first four are from the model evidence page and the clustering charts; the navy set is from the tuner and branch page, which use Public Sans. Datawrapper's custom fonts need a paid plan, so the free plan's default font is fine.

## The charts

### 1. How often the winners change when ballots stop early (real elections)

**File:** `01-real-winners-change.csv`
**Chart type:** Lines (or Grouped columns if you prefer bars).
**Settings:** X axis "Ballots stop after rank", 1 to 6. Y axis 0 to 30, suffix `%`. Colors from the table above. Label lines directly at their ends instead of a legend.
**Suggested title:** "Rankings past the first few rarely change who wins"
**What it shows:** if every ballot stopped after rank 1, the winners would change in about 26 of 100 Scottish wards and 23 of 100 organization elections, but only 2 of 100 NYC primaries. By rank 4, Scottish wards are down to about 1 in 100, while organization elections are still at about 7 in 100. Organization elections, with more seats and more candidates per seat, need deeper ballots.
**Source line:** NYC Board of Elections cast vote records (2021, 2023, 2025); Scottish council election preference data (2007 to 2022, multi-seat wards); PrefLib, Electoral Reform Society organization elections. Counted with Scottish STV rules.

### 2. How many ranks each election needed (real elections)

**File:** `02-real-cutoff-rank.csv`
**Chart type:** Stacked bars.
**Settings:** one bar per election type, segments add to 100%. Colors: a single-hue ramp from light to dark, for example `#c9d8f0`, `#7fa6dd`, `#2a78d6`, `#1f3b73` for "Rank 1 is enough" through "4 or more ranks". Show values inside the bars.
**Suggested title:** "Most elections are settled by first choices alone"
**What it shows:** in about 3 of 4 Scottish wards and organization elections, first choices alone elect the same people as full ballots. Organization elections have the longest tail: about 1 in 8 needed 4 or more ranks (the deepest needed 14).

### 3. Ranks that get used versus ranks that change the result (real elections)

**Files:** `03-real-reach-vs-change-scotland.csv` (main), `-organizations.csv`, `-nyc.csv`.
**Chart type:** Grouped columns (two bars per rank), or Lines.
**Settings:** X axis "Rank", 2 to 6. Y axis from 0, suffix `%`. "Votes that reached this rank" in `#9aabcb`, "Elections whose winners change" in `#1f3b73`.
**Suggested title:** "How often a rank gets used, and how often it matters"
**What it shows:** in Scottish wards, the two numbers track each other closely: about 1 in 5 votes reached rank 2, and dropping rank 2 and below changes about 1 in 4 wards. In organization elections, the change column stays high after the use column drops: only 6 in 100 votes reached rank 4, but dropping rank 4 and below still changes 13 in 100 elections. A small share of votes can still decide a close seat. Note the two bars measure different things (share of votes versus share of elections), so the chart compares their shapes, not their sizes.

### 4. When first choices alone get it wrong, by how much (real Scottish wards)

**File:** `04-real-scotland-seats-moved-first-choices.csv`
**Chart type:** Bar chart, or a sentence instead of a chart.
**What it shows:** when only first choices count, 74 in 100 Scottish wards elect the same people. In the other 26, exactly 1 seat goes to someone else (in 1 ward of 1,070, 2 seats). This may work better as a sentence in the text than as a chart.

### 5. How deep ballots need to go in NYC DSA branch elections (simulated)

**File:** `05-sim-dsa-branches.csv`
**Chart type:** Range plot (Datawrapper's "Range plot"), one row per branch.
**Settings:** Range from "Rank after which under 1 seat changes on average" to "95 of 100 elections decided within rank". Start dot `#9aabcb`, end dot `#1f3b73`, range bar light gray. Sort by the 95 column. Use the Candidates, Seats, and Expected ballots columns in the tooltip, or switch to a Table chart to show them all.
**Suggested title:** "To be sure the winners don't change, ballots need 20 to 40 ranks. To keep changes under one seat, 7 to 15."
**What it shows:** for each branch's delegate election, 2,000 simulated elections with that branch's candidates, seats, and expected ballots (give or take 10%). Two answers, depending on how strict you are: the rank after which, on average, less than one seat changes hands; and the rank that gives exactly the same winners in 95 of 100 elections. Central Brooklyn (132 candidates, 83 seats) needs the most; Flatbush (55 candidates) the least.

### 6. One election up close: Metro DC DSA's 2025 delegate election (simulated)

**File:** `06-sim-metro-dc-curve.csv`
**Chart type:** two Line charts, side by side or one after the other.
**Chart 6a:** "Elections whose winners change (%)" against "Ballots stop after rank". Y axis 0 to 100, suffix `%`. Line `#1f3b73`. Add a horizontal range highlight or line at 5% labeled "5 in 100 elections", and annotate rank 26, where it drops below 5%.
**Chart 6b:** "Seats that go to someone else, on average", same X axis. Line `#1f3b73`. Add a horizontal line at 1 seat, and annotate rank 9, where it drops below 1. Optionally add "most in any election" as a second line in `#9aabcb`.
**Suggested title:** "Deep ranks change the result often, but not by much"
**What it shows:** 75 candidates, 46 seats, about 432 voters. Cut ballots after rank 9, and the winners differ in 70 of 100 elections, but on average by less than one seat out of 46. To get exactly the same 46 winners in 95 of 100 elections, ballots need 26 ranks. Both lines are worth showing: "the winners change" and "how many change" tell different stories.

### 7. The share of candidates who win drives the answer (simulated)

**File:** `07-sim-seat-share.csv`
**Chart type:** Lines.
**Settings:** X axis "Candidates who win (%)", 0 to 100. Lines for "95 of 100 elections decided within rank" (`#1f3b73`), "Half of elections decided within rank" (`#9aabcb`), and optionally "Rank after which under 1 seat changes on average" (`#8c8b85`). Hide the "Seats" column, or use it in the tooltip.
**Suggested title:** "The more candidates win, the deeper rankings matter"
**What it shows:** 50 candidates, 500 voters, 1,000 simulated elections per seat count, with voters ranking as many as they naturally would. When 1 in 10 candidates wins, 10 ranks settle 95 of 100 elections; when 9 in 10 win, it takes 25. The "under 1 seat" line stays low throughout (6 ranks at most).

## Cautions

- **The simulated charts (5 to 7) are provisional.** The voter model hasn't yet been checked against published studies (milestone 6 in `docs/roadmap.md`), and in organization elections with 5 or more seats it makes the last winner weaker than in real elections (`docs/model-check.md`). The tuner and branch page say to treat these numbers as a way to compare settings, not as findings. If you publish them, say they come from simulated elections and give ranges, not single exact numbers.
- **Each simulated election draws its own turnout,** within about 10% of the expected ballots, because with few votes per seat the answer jumps around as turnout changes by a few voters (open question 3 in `docs/model-spec.md`).
- **Charts 5 and 6 assume a ballot that says "rank up to N" with N equal to the seats,** as on the branch page. Chart 7 has no limit, so the limit itself doesn't set the answer.
- **Most NYC primaries are lopsided,** so the first-choice leader usually wins. That's why NYC's numbers are so low, not that NYC voters rank less carefully.
- **Organization elections are 87 Electoral Reform Society elections** whose organizations, dates, and exact rules are unknown (`data/README.md`).
- **Left out:** Portland 2024 (only 6 contests) and the ACT (5 elections, with different counting rules). Exhaustion (votes that run out of candidates) is left out until it's measured the same way as the published Scottish study (milestone 6).
