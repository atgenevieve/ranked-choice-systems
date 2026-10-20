# Model review: decisions for the owner

**Status:** draft for milestone 3. Nothing here is built. For each assumption in the voter model, this page gives what the model does now, what the real ballots show, a proposed setting, and the alternatives. You decide; each decision and its reason then go into `docs/model-spec.md`, and only then into the engine (milestone 4).

**Evidence used:** 1,100 Scottish council elections, 168 PrefLib elections (including 87 organizational elections from the Electoral Reform Society, ERS), 126 NYC primary contests, and 6 Portland contests. That's about 18 million ballots in all. `data/README.md` describes each dataset and its weaknesses, and `docs/real-data-findings.md` has the full Scottish findings.

**How to read the numbers.** "3.1 (2.7 to 3.5)" means a typical election has 3.1, and 8 in 10 elections fall between 2.7 and 3.5.

## Summary of decisions

| # | Assumption | Now | Proposal | Decision needed |
|---|---|---|---|---|
| 5 | Ballot length | Everyone ranks everyone | A new setting, tied to slates, that grows with seats; three variants tested side by side | **Biggest decision.** How length grows in a 50-seat election |
| 4 | Slate loyalty and layout | One loyalty number; slates in a line | Two numbers: loyalty to your own slate, and how evenly you spread to the rest. Drop the line. Tune to overall clustering in real ballots | Replace the line? Are your slates loose (like Portland endorsements) or tight (like Scottish parties)? |
| 3 | Candidate popularity | Lognormal, spread 1.0 | Keep the lognormal, add a separate tail of long-shot candidates | Add the tail? |
| 2 | Slate sizes | Candidates split like voters | Set candidates and voters per slate separately | Separate them? |
| 1 | Number of slates | 4 | Keep 4 as a default, and add candidates outside any slate | Allow candidates outside slates? |
| 6 | Number of voters | 10 per candidate | Set from your organization's real numbers | What are they? |
| – | Which real data to tune against | – | Scotland and ERS first, Portland for large fields, your organization's data if available | Can you get past ballots? |

## 5. Ballot length: how many candidates each voter ranks

**Now:** every simulated voter ranks every candidate, up to a cap of 100. The model spec already flags this as unrealistic.

**What the real ballots show** (charts: https://claude.ai/artifact/5BnZ8BNRE4tYPiwmsUS9op, built by `data/ballot_length_charts.py`):

- **Where the ballot has a limit, the most common choice is to fill it.** 47% of Portland council ballots rank exactly the 6 allowed; 37% of NYC ballots in contests with 6 or more candidates rank exactly the 5 allowed.
- **Most voters rank a few candidates, and few rank everyone.** In Scotland the typical voter ranks 3 of about 7 candidates, and only 11% rank them all. Pooled over all Scottish ballots: 14% rank 1, 26% rank 2, 33% rank 3, then it falls off fast (11% rank 4, 5% rank 5).
- **Length grows slowly with the number of candidates** in public elections, where ballots allow ranking every candidate. Union and society elections (ERS) climb faster. Typical number ranked, with the share of candidates in brackets:

  | Candidates | Public elections | Union and society elections |
  |---|---|---|
  | 3 to 5 | 2.6 (56%), 163 elections | 2.3 (58%), 33 elections |
  | 6 to 8 | 3.1 (45%), 710 elections | 3.6 (51%), 17 elections |
  | 9 to 12 | 3.4 (36%), 227 elections | 5.2 (52%), 17 elections |
  | 13 to 20 | 3.3 (25%), 8 elections | 5.5 (37%), 17 elections |
  | 21 or more | none | 5.9 (23%), 3 elections |

  Public elections with no rank limit only go up to 14 candidates. Other organizational elections (Debian, the American Psychological Association, UK Labour MPs) are left out of both columns, and so is PrefLib's copy of Glasgow 2007, which is already in the Scottish data. (Correction: an earlier draft of this table mixed the two groups, which made public elections look like they ranked about 5 or 6 in large fields. That came from the union and society elections.)

- **In organizational elections, length grows with the number of seats.** The ERS elections (British trade unions and similar bodies, 1987 to 1988):

  | Seats | Elections | Typical candidates | Typical number ranked |
  |---|---|---|---|
  | 1 | 20 | 4 | 2.3 |
  | 2 | 25 | 7 | 3.5 |
  | 3 to 4 | 24 | 7 | 3.9 |
  | 5 to 9 | 14 | 10 to 15 | about 6 |
  | 10 to 12 | 4 | 12 to 17 | 5.5 to 9.5 |

  Members seem to rank roughly "enough to fill the seats", plus a few. With 12 seats, they rank about 9.
- **Rank limits and instructions matter.** Where ballots allow only 3 to 6 ranks (NYC, Portland, San Francisco, Oakland), most voters stop at or before the limit. Research on the Australian Senate found that 82% of voters numbered exactly the 6 boxes the instructions asked for (`docs/large-elections.md`).
- **Length is tied to slates.** A third of Scottish voters whose first choice has running mates (other candidates from the same party) rank exactly their party's candidates and then stop. Conservative voters rank only one candidate far more often than SNP voters (23% against 9%).

- **More candidates means more ranks, even with the number of seats held the same** (owner's question, October 20, 2026). Within Scottish wards of the same size, doubling the candidates adds about 20 to 27% more ranks; within union and society elections of the same size, about 43 to 62%. Taking both together, seats matter much less: with the candidates held the same, doubling the seats adds about 10% more ranks in Scotland and 20% in union and society elections. So the biggest divide isn't seats. It's whether an electorate behaves like public voters or like union members.

**The key unknown:** no dataset has a 50-seat election. Extending the patterns above to 50 seats gives very different answers:

- (a) If members behave like **public voters** (the Scottish rule, using candidates and seats together), a 50-seat, 75-candidate election projects to about 9 ranks.
- (b) If they behave like **union members** (the ERS rule, same method), about 26.
- (c) If they follow **the ballot instructions**, they'd rank whatever the instructions ask for.

(An earlier draft framed (a) and (b) as "follows candidates" against "follows seats". Holding seats fixed shows that candidates drive most of the effect in both groups; the difference between (a) and (b) is the kind of electorate.)

These would give very different truncation results, so this is the decision that matters most.

**Proposal:**

1. Add a ballot-length setting in which each voter first ranks their own slate's candidates (in popularity order, as now), then decides at each further rank whether to keep going. That reproduces "my slate's list, then stop."
2. Build three variants, as named options in the settings file: length grows with **candidates**, length grows with **seats**, and a **fixed target** (for instructions such as "rank at least 10").
3. Tune each to the real data, and run every headline result under all three. Report the range across them, in line with the project rule "say what's uncertain."
4. If your organization can share past ballots, even anonymized, use them to choose among the variants.

**Alternatives:**

- Pick one variant now. Simpler, but the answer for 50 seats would then rest on a guess.
- Draw each voter's length from a fixed distribution, separately from the ranking. Simpler, but it loses the "rank my slate, then stop" link, which the Scottish data shows clearly.

**Your decision:**

## 4. Slate loyalty, and slates arranged in a line

**Now:** one setting, slate loyalty (0.15), controls how much voters prefer their own slate. Slates sit in a line, and a slate two steps away gets 0.15 × 0.15 of the weight. Exploratory runs found this setting barely changed the results.

**What the real ballots show:**

- **Party loyalty is very strong.** Among Scottish voters whose first choice has a running mate, 84% rank a running mate second. If voters ignored party, it would be about 17%.
- **Endorsement slates are much looser, and mostly explained by popularity.** Compare each grouping with what you'd see if second choices followed each candidate's first-choice share and ignored the grouping ("popularity alone"). This is what the model produces with no slates, so the gap above it is what slate settings must explain:

  | Grouping | Observed | Popularity alone | Random |
  |---|---|---|---|
  | Scottish parties (typical ward) | 84% | 21% | 17% |
  | Portland endorsement slates (typical race) | 45% | 31% | 13% |
  | NYC endorsement slates (typical contest) | 38% | 29% | 17% |
  | Mamdani and Lander, NYC 2025 | 66% | 26% | 9% |

  An earlier draft compared only with random second choices, which made endorsement slates look far stronger than they are.
- **Votes that leave a slate spread widely,** not mainly to one neighboring slate. Scottish transfers between parties have an evenness of 0.85, where 1 means a perfectly even spread. Even distant pairs see real traffic.
- **Some flows are lopsided:** 42% of Scottish Green voters rank the SNP second, but only 8% of SNP voters rank a Green second. Scotland has at least two divides (left against right, independence against the union), which no single line can hold.

**Why it matters:** with the current setting, a slate three steps along the line gets about 1/300 of the weight. That can't produce strong loyalty *and* a wide spread at the same time. Slate behavior shapes how votes move once a candidate wins or is excluded, which is what truncation measures.

**Correlation, not cause (owner's point, October 20, 2026).** A pairing on ballots doesn't show that an endorsement or pact changed votes. Mamdani and Lander were the two democratic socialist candidates, so their voters would likely have ranked each other often without any pact. The excess above popularity mixes at least three things that ballot data can't separate:

1. Voters already saw the candidates as similar (shared politics, identity, or style).
2. The endorsement or pact itself moved votes.
3. Endorsers followed voters, picking candidates whose supporters already overlapped.

Endorsements also differ in how many voters even knew about them, which ballots can't measure directly.

**What's defensible, given that:**

- **The model needs patterns, not causes.** Truncation and reach depend on which candidates get ranked together, not on why. So a "slate" in the model means a group of candidates whose voters tend to rank each other, for whatever reason. It does not mean "an endorsement and its effect."
- **Strength comes from the ballots, not from the endorsement.** Each grouping's strength is tuned to how much it actually shows up above popularity on real ballots. An endorsement few people knew about, or one that changed nothing, shows little excess and gets little weight. This handles awareness imperfectly but honestly, without guessing reach.
- **The owner chooses which groupings count.** Endorsement lists overlap, many have one member, and some are media endorsements that may mean little. None is used for tuning automatically. The owner marks each grouping on the slate review page, and only groupings marked "counts" are used. The page also lists pairs found directly in the ballots, which voters rank together far more than popularity predicts, whether or not any slate names them (for example, Cuomo and Stringer in 2025: 18% against 5% from popularity, with no shared endorsement in our data).
- **How the review is organized (owner's decisions, October 20, 2026).** Groupings are reviewed separately for each place and year, so experts on each city's politics can mark them. Within each place and year there is one rule per type of grouping, and any row can be overridden. There are four types:
  - **Endorsing organization:** parties, unions, and political, advocacy, good-government, and business groups, as one type. Splitting them further drew arbitrary lines that nothing in the data depends on.
  - **Newspaper editorial board:** kept separate, because a newspaper's endorsement comes with free communication to voters, which other endorsers have to pay or organize for.
  - **Candidate pact:** candidates who asked voters to rank each other.
  - **Found only in ballots:** pairs voters ranked together with no slate naming them.
- **The report makes no causal claims.** It describes how voters group candidates. It must not claim what endorsements or slates do, such as "formal slates make members rank deeper."
- **Test whether it matters.** Run the headline results across the full plausible range of slate strength. If they hold, the causal question doesn't change the answer. If they don't, the report says so.
- **For the organization itself,** model slates should be its real groupings (caucuses, tendencies), which the owner knows better than any endorsement list.

**Revised approach: tune to the ballots as a whole (owner's decision, October 20, 2026).** For the model, the association is what matters: truncation depends on which candidates voters rank together, not why. So the model doesn't need anyone to judge which groupings are real. Instead:

- Slate strength is tuned so that simulated ballots show the same overall clustering as real ones. Clustering is measured from all ballots, not by averaging labeled lists, which would count overlapping endorsements several times and overweight the pairs picked for being strongest.
- Real data gives two reference points: **loose** clustering, like Portland's endorsement slates (about 10 to 15 points above popularity), and **tight** clustering, like Scottish parties (about 60 above).
- **The owner's one decision:** whether the organization's slates are closer to loose or tight. Past ballots from the organization would settle it directly.
- Every headline result is also run across the whole loose-to-tight range. If the results hold, the report says so.
- Marking groupings on the review page is optional research for the endorsement work, not an input to the model.

The method has uses beyond this project, so it's written up on its own in `docs/endorsement-cohesion.md`.

The review page is at https://claude.ai/artifact/3UBqtyAtQWBAPLH9LUQDGy. Its data comes from `data/slate_review.py` (output `data/slate-review.json`; page template `data/slate_review_page.html`). Marks are read back and recorded in the repository before any are used.

**Proposal:** replace the line with two settings:

- **Own-slate loyalty:** how strongly voters prefer their own slate, beyond popularity. Tune it to the gap above popularity: large for parties (84% against 21%), small for endorsement slates, using only the groupings the owner marked.
- **Spread to other slates:** how evenly voters spread to everyone else. Tune it to the evenness of 0.85.

Keep an optional table of closeness between slates for later, if real data from your organization shows strong pairings.

**Alternatives:**

- Keep the line and tune loyalty only. Simplest, but it likely can't match both the loyalty and the spread.
- Give each voter their own taste on top of slates (the "individual taste" factor the spec leaves out). More realistic, slower, and harder to explain.

**Your decision:** also, are your organization's slates more like parties (tight) or endorsement lists (loose)?

## 3. Candidate popularity

**Now:** each candidate's popularity is drawn from a lognormal distribution, a common pattern where most values are moderate and a few are very large, with spread 1.0. Exploratory runs found this the most important setting: it changed answers by 2 to 3 times.

**What the real ballots show:**

- **The overall spread is close to 1.0** in multi-seat elections: about 0.95 in Scotland, 0.75 to 1.0 in the larger ERS elections, and 1.1 to 1.6 in Portland's council races. Single-seat US races are more lopsided (1.5 to 1.8), because a few leading candidates dominate.
- **But the shape is wrong.** In real elections the leading candidates sit close together, and a tail of long shots trails far below. In Scotland the top looks like a spread of about 0.7, and the bottom like about 1.3. Parties run as many candidates as they expect to elect, and those candidates finish close together.
- **Larger fields tend to have more long shots:** Portland's 31-candidate districts have spreads of 1.4 to 1.6.

**Proposal:** keep the lognormal for serious candidates, with a spread of about 0.7. Add a second setting: the **share of long-shot candidates**, whose popularity comes from a much lower range. Tune both to Scotland, ERS, and Portland. Because this setting matters most, report every headline result across the real range, from about 0.6 to 1.6.

**Alternatives:**

- Keep a single spread of 1.0. It matches the average, but not the shape.
- Set popularity directly from your organization's past first-choice counts, if available. That is the best option for your elections.

**Your decision:**

## 2. Slate sizes: candidates and voters per slate

**Now:** each slate gets the same share of candidates as of voters.

**What the real ballots show:** big parties run fewer candidates than their support would suggest, and small parties and independents run more. The SNP has 33% of Scottish first choices but 23% of candidates. Independents have 10% of first choices but 17% of candidates.

**Proposal:** set candidate shares and voter shares separately. By default, big slates run fewer candidates per voter, tuned to Scotland.

**Alternative:** keep them equal. Simpler, but known to be wrong for parties. Organizational slates may differ.

**Your decision:** also, do your organization's big slates run full lists or short ones?

## 1. Number of slates, and candidates outside slates

**Now:** 4 slates, and every candidate belongs to one. Exploratory runs found the number of slates barely mattered.

**What the real ballots show:** a typical Scottish ward has 5 parties (3 to 7), and about 1 in 6 candidates is an independent. In Portland, many candidates had no major endorsement.

**Proposal:** keep 4 slates as the default. Add a setting for the **share of candidates outside any slate**, who get no loyalty boost from anyone. Tune it to about 15%.

**Your decision:** also, how many organized slates does your organization usually have?

## 6. Number of voters

**Now:** 10 voters per candidate, at least 1,000. Exploratory runs found this barely mattered.

**What the real data shows:** Scottish wards have about 700 voters per candidate. Organizational elections can be much thinner: Metro DC DSA's 46-seat count had 432 ballots for 75 candidates, about 6 per candidate, so the winning threshold was about 10 votes (`docs/large-elections.md`). With so few votes per seat, single ballots matter more, and truncation may behave differently.

**Proposal:** set candidates, seats, and voters from your organization's real elections, and test a range around them.

**Your decision:** typical numbers of candidates, seats, and voters in your organization's elections.

## Factors still left out

These stay out of the model unless you decide otherwise. The report should say why.

- **Ballot order.** About 2 in 100 longer Scottish ballots follow the printed order (twice chance). That's small, but it could grow on very long ballots. Proposal: leave it out for now, and revisit if your organization's data shows more.
- **Strategic voting:** ranking differently from your true preferences to help or hurt a candidate. Proposal: leave it out.
- **Differences in turnout between slates.** Proposal: leave it out, and cover it with the separate voter-share setting.

## Which real data to tune against

Proposal, in order:

1. **Scotland:** multi-seat STV with the same counting rules, and the most data.
2. **ERS:** organizational elections with up to 12 seats, the closest to yours.
3. **Portland:** the largest fields of candidates (up to 31).
4. **NYC and US single-winner races:** checks only, since they fill one seat and cap ranks at 3 to 5.

**Best of all would be your organization's own past ballots.** Every proposal above would then be tuned to them first.

## After your decisions

1. Record each decision, with its reason, in `docs/model-spec.md` (version 0.2).
2. Build the approved model (milestone 4), and compute the same statistics for simulated elections to check the fit.
3. Build the tuner (milestone 5), so you can adjust settings against real data yourself.
