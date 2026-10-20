# Real-data findings

What real ranked ballots show about how voters behave, measured with the calibration statistics in `docs/model-spec.md`. Calibration statistics are measurements that describe an election in a way you can compare between real and simulated elections, such as how many candidates a typical voter ranks.

**Status:** observations for the owner's review, not decisions. Nothing here changes the model. Milestone 3 is where the owner decides which assumptions to change, using this evidence.

**How to read the numbers.** Most numbers come as a typical value and a range, like "3 (2 to 4)". The first number is the median: half the elections are above it and half below. The range runs from the 10th to the 90th percentile, so 8 in 10 elections fall inside it.

## Scotland

### The data in brief

- **What:** 1,100 Scottish council ward elections from 2007 (Glasgow only), 2012, 2017, and 2022, plus 30 by-elections. That's 5.6 million real ballots. Where the data came from, and how it was cleaned, is in `data/scotland/README.md`.
- **What a typical election looks like:** 7 candidates (5 to 10) for 3 or 4 seats, so about 4 in 10 candidates win. About 4,900 voters (3,000 to 7,600).
- **The voting system:** single transferable vote (STV). Voters number the candidates 1, 2, 3, and so on, as far as they like.
- **Full numbers:** `data/scotland/calibration-summary.md` (tables) and `data/scotland/calibration.jsonl` (every election).

The four full sets of council elections look much alike. Unless a section says otherwise, the numbers below cover all 1,070 regular ward elections and leave out the by-elections, which fill only one seat.

### 1. First-choice concentration: how unequal support is

A candidate's **first-choice share** is the share of voters who ranked them first. The model gives each candidate a **popularity** score, and the **popularity spread** setting (currently 1.0) controls how unequal those scores are. The model spec names this the most important setting.

What the Scottish data shows:

- **The top candidate gets about 3 in 10 first choices:** 29% (23% to 39%). The share going to the top 10% of candidates is 21% (16% to 28%). In wards this small, the top 10% of candidates is less than one candidate, so this statistic mostly repeats the top candidate's share.
- **The top candidate gets about twice the median candidate's first choices:** 2.3 times (1.4 to 4.4).
- **A single fitted spread comes out near the current setting.** Fitting a popularity spread to each ward's first-choice shares gives 0.95 (0.54 to 1.38). The fit measures how widely the shares scatter, on a scale where doubling and halving count as equal steps (a logarithmic scale). The method is explained in a comment in `data/calibration.py`.
- **But the shape doesn't match the model's.** The model's popularity scores scatter evenly above and below the middle candidate. Real wards don't. Their leading candidates sit close together, and a tail of candidates far below the middle trails behind. To see this, compare how far the top candidate sits above the middle one with how far the bottom candidate sits below it, using the same logarithmic scale:

  | Measure | Real Scottish wards | Model, popularity alone, spread 1.0, 7 candidates |
  |---|---|---|
  | Gap from top candidate to middle candidate | 0.81 (0.33 to 1.47) | 1.27 |
  | Gap from middle candidate to bottom candidate | 1.68 (0.70 to 2.78) | 1.28 |
  | Top candidate's share | 29% | 36% |

  The model column comes from `python3 -I data/calibration.py --lognormal-reference 7`, which draws popularity scores the way the model does and ignores slates. Read on that table, the top of real wards looks like a spread of about 0.6 to 0.75, and the bottom looks like a spread of about 1.3. No single spread matches both ends.

- **Why the shape looks like this:** parties choose how many candidates to run. A party expecting to win two seats runs two candidates and asks its voters to split their first choices between them, so its candidates finish close together near the top. Small parties and independents with little support fill the bottom. A ward of 7 typically has 4 or 5 serious contenders and 2 or 3 long shots.

**Bears on:** assumption 3, candidate popularity. The current spread of 1.0 roughly matches the overall scatter, but not the shape. Note that every Scottish ward is small (3 to 14 candidates), so this data can't show how popularity behaves in fields of hundreds or thousands of candidates.

### 2. Ballot length: how many candidates voters rank

**Ballot length** is how many candidates a voter ranks. In the model, every voter ranks every candidate.

What the Scottish data shows:

- **The typical voter ranks 3 candidates.** The median ballot length is 3 in almost every ward, and the average is 3.1 (2.7 to 3.5). On average, voters rank 44% of the candidates.
- **Few voters rank everyone.** In a typical ward, 11% (7% to 18%) rank every candidate.
- **About 1 in 7 voters rank only one candidate.** This is called a **bullet vote**. The share is 13% (8% to 23%).
- **Lengths bunch at 2 and 3, then fall off a cliff.** Pooled over all 5.6 million ballots (by-elections included; they're 2% of ballots):

  | Candidates ranked | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 or more |
  |---|---|---|---|---|---|---|---|---|
  | Share of ballots | 14% | 26% | 33% | 11% | 5% | 4% | 3% | 4% |

  Ranking 3 is the most common choice in 766 of 1,070 wards (72%). The peak stays at 3 in both 3-seat and 4-seat wards, so it doesn't simply follow the number of seats. Past 4, each extra rank is used by only a few percent of voters.

- **Many voters rank exactly their own party's candidates, then stop.** Take the voters whose first choice has **running mates** (other candidates from the same party in the same ward). A third of them, 33% (22% to 46%), rank exactly that party's candidates and no one else. Ballot length often isn't a separate decision; it's "my party's list, and done."
- **Bullet voting depends on the party.** Of voters whose first choice is a Conservative, 23% rank no one else. For SNP voters, it's 9%. (From the second-choice table in `calibration-summary.md`.)
- **By-elections, which fill one seat, have shorter ballots:** median 2, and 37% (26% to 46%) bullet votes.

**Bears on:** assumption 5, ballot length, which the model spec already flags as unrealistic. The data supplies a target distribution, and shows that length is tied to party.

### 3. Slate cohesion: how strongly voters stick to their party

A **slate** is a group of candidates who tend to get votes from the same voters. In Scotland, the natural slates are parties. **Slate cohesion** is the share of voters who rank a candidate of the same party second, counting only voters whose first choice has a running mate and who ranked at least 2 candidates.

How the statistic handles special cases (details in `data/calibration.py`):

- Wards where the first choice's party runs only one candidate are left out, because those voters can't rank a running mate second.
- Independents aren't a party, so each independent counts as a slate of one.
- Labour and Labour Co-operative candidates count as one party.

What the Scottish data shows:

- **Party loyalty is very strong.** In a typical ward, 84% (75% to 89%) of these voters rank a running mate second.
- **That's about 5 times what chance would give.** If voters ignored party when picking a second choice, about 17% (12% to 25%) would pick a running mate.
- **The big parties are alike:** SNP 85%, Conservative 84%, Labour 81%, Liberal Democrat 77%, pooled over all wards where each ran more than one candidate.
- **Only about half of voters can show cohesion at all.** In a typical ward, 49% of voters have a first choice with a running mate. In 2017 and 2022, many wards had no party with more than one candidate.
- **Independents vote a little like a loose slate.** Of voters who rank an independent first, 31% rank another independent second, even though independents have no shared platform.

**Bears on:** assumption 4, slate loyalty (current setting 0.15), and the note that slates sit in a line. Also assumption 1, number of slates: A typical Scottish ward has 5 parties standing (3 to 7), plus independents.

### 4. Transfer spread: where votes go next

When a candidate is eliminated or has more votes than they need, their ballots **transfer** to each voter's next choice. This statistic reads the ballots directly, without running a count. For each candidate, it looks at their first-choice voters who ranked a second choice, and asks how spread out those second choices are. (The real first transfer from a candidate matches this. Later transfers mix in ballots that arrived from other candidates, which only a full count can trace.)

Terms used below:

- **Top recipient's share:** the share of a candidate's transferring voters whose next choice is the single most popular one.
- **Evenness:** 1 means next choices split equally across every other candidate; 0 means they all go to one candidate. (Technically, normalized entropy.)
- **Effective number of recipients:** the votes spread as if split equally among this many candidates.

What the Scottish data shows:

- **Transfers are concentrated, mostly because of running mates.** The top recipient gets 62% (39% to 78%) of a candidate's transfers. Evenness is 0.59 (0.41 to 0.85). The votes spread as if among about 3 candidates (2.2 to 4.7), out of the 6 available in a typical ward.
- **Every candidate receives something.** In almost every ward, every other candidate gets at least a few transfers from every candidate. With thousands of voters, someone always ranks an unlikely pairing, so the count of distinct recipients doesn't tell elections apart.
- **Once votes leave the party, they spread widely.** Leaving out running mates, evenness among the other candidates is 0.85 (0.77 to 0.91). Votes that leave a party go to many other parties, not just to one neighbor.
- **But cross-party transfers still follow patterns.** Pooled over all voters (by-elections included), here's where second choices went (rows are the first choice's party):

  | First choice | Same party | SNP | Lab | Con | LD | Gr | Ind | Ranked no one else |
  |---|---|---|---|---|---|---|---|---|
  | SNP | 62% | – | 9% | 2% | 4% | 8% | 5% | 9% |
  | Lab | 51% | 10% | – | 6% | 7% | 4% | 5% | 14% |
  | Con | 24% | 4% | 16% | – | 16% | 2% | 12% | 23% |
  | LD | 14% | 12% | 18% | 21% | – | 9% | 10% | 14% |
  | Gr | 0% | 42% | 19% | 4% | 14% | – | 6% | 10% |

  "Same party" is lower here than in the cohesion statistic because this table includes wards where the party had only one candidate. Green voters, for example, almost never had a Green running mate.

- **The pattern isn't symmetric.** 42% of Green voters rank the SNP second, but only 8% of SNP voters rank a Green second. Part of that is size: there are far more SNP candidates and voters to receive votes. Conservative voters rarely move to the SNP (4%) but often to Labour and the Liberal Democrats (16% each).

**Bears on:** assumption 4, slate loyalty, and especially the note that slates sit in a line. See the list below.

### Other patterns

- **Candidates per party don't follow votes per party.** The model gives each slate the same share of candidates as of voters. In Scotland, the big parties run fewer candidates than their support would suggest, and small parties and independents run more:

  | Party | Share of candidates | Share of first choices |
  |---|---|---|
  | SNP | 23% | 33% |
  | Labour | 18% | 24% |
  | Conservative | 15% | 19% |
  | Independents | 17% | 10% |
  | Liberal Democrat | 10% | 8% |
  | Green | 7% | 4% |

  This answers the model spec's open question under assumption 2: in Scotland, candidates don't split across slates in the same proportions as voters.

- **A small ballot-order effect.** Scottish ballot papers list candidates alphabetically. Of ballots ranking 4 or more candidates, about 3.8% rank them exactly in the order printed, top to bottom. If order were random, you'd expect about 1.9%. So about 2 in 100 longer ballots seem to follow the printed order rather than preference. Reverse order is at chance level.
- **Behavior is stable across years.** 2012, 2017, and 2022 give nearly the same numbers on every statistic. 2007 (Glasgow only, with bigger fields of 9 to 13 candidates) has more bullet votes (24%) and less cohesion (77%).

### What the real data shows that the current model can't produce

These are patterns in the Scottish ballots that the model, as described in `docs/model-spec.md`, has no way to make. Some are certain from how the model works. Others are likely but should be confirmed by computing the same statistics on simulated elections, which milestone 4 plans for.

1. **Short ballots.** Every simulated voter ranks every candidate. Real voters rank 3 (median), and only about 1 in 9 ranks everyone. *Certain. Bears on assumption 5, ballot length.*
2. **A peaked length distribution.** Real lengths aren't a smooth decline: few voters rank 1 (14%), most rank 2 or 3 (59%), and few go past 4. Any new ballot-length setting needs to be able to produce a peak like this, not only a steady fall-off. *Bears on assumption 5.*
3. **Ballots that stop when the party runs out.** A third of voters with running mates rank exactly their party's candidates and stop. If ballot length were drawn separately from the ranking, as milestone 4 currently plans, this link would be lost. *Bears on assumption 5 and assumption 4.*
4. **Different behavior by slate.** Conservative voters bullet-vote far more often than SNP voters (23% against 9%). In the model, every slate's voters behave alike apart from size. *Bears on assumptions 4 and 5.*
5. **Uneven popularity shapes.** The model's popularity scores spread evenly above and below the middle candidate. Real wards have bunched leaders and a long tail of weak candidates, so no single popularity spread matches both. *Bears on assumption 3, the top calibration priority.*
6. **Candidate numbers that don't follow support.** The model gives slates the same share of candidates as voters. Real parties don't: the SNP has a third of first choices but under a quarter of candidates. *Bears on assumption 2, slate sizes.*
7. **Candidates who belong to no slate.** About 1 in 6 Scottish candidates is an independent. In the model, every candidate belongs to a slate. *Bears on assumption 1, number of slates.*
8. **Strong loyalty and wide cross-party spread at the same time.** In the model, one setting (slate loyalty) controls both how strongly voters stick to their slate and how quickly support falls off for slates further along the line. With the current setting of 0.15, a slate three steps away gets 0.15 × 0.15 × 0.15, about 1/300, of the weight. Real voters show 84% loyalty, yet when they leave their party they spread evenly (evenness 0.85), and even distant pairs see real traffic: for example, 9% of Liberal Democrat voters rank a Green second. A single line of slates with one loyalty setting probably can't produce both. *Likely; confirm by simulation. Bears on assumption 4 and the "slates in a line" note.*
9. **Lopsided transfers between parties.** Real flows have structure: Greens to the SNP (42%) far exceeds the reverse (8%), and Conservatives move to Labour 4 times as often as to the SNP. Some of this comes from party size, which the model can produce. Whether the rest fits any arrangement of slates in a line is an open question. Scottish politics has at least two divides, left against right and independence against the union, which one line can't hold. *Possible; confirm by simulation. Bears on the "slates in a line" note.*
10. **Ranking in printed order.** About 2 in 100 longer ballots seem to follow the order printed on the ballot paper. The model has no ballot-position effect; the spec lists it under factors left out. *Small. Bears on "Mistakes and random ranking" and "Ballot position effects."*

### Limits of this evidence

- **Small fields only.** Every Scottish ward has 3 to 14 candidates and about 4 in 10 candidates win. The project's exploratory results cover fields up to a million candidates. Scotland can't say how voters behave in fields of hundreds, such as a large membership organization's elections.
- **Parties, not organizational slates.** Scottish slates are national political parties with long histories. Slates in a membership organization may be looser or tighter.
- **Ballots only.** Statistic 4 here describes the first transfer from each candidate. How votes move later in a count, and statistic 5 (exhaustion, how many ballots run out of choices), need the engine.
- **Data quality.** The ballot data matches the official winners in all 1,093 elections that have them (see `data/scotland/README.md`), which suggests the ballots are sound. Party labels for 30 by-elections are less reliable than the rest.
