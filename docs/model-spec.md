# Voter model specification

**Status:** version 0.2, approved by the owner on October 20, 2026 (milestone 3), and built in the engine (milestone 4). Its settings are fitted to real ballots, and `docs/model-check.md` compares simulated and real elections. Settings can still ask for version 0.1, the exploratory model, so earlier runs can be repeated; "Version 0.1" in each assumption describes it. Candidate popularity is approved for now and may change later; two open questions from milestone 4 are listed at the end.

A **model** is the set of assumptions the simulation makes about how voters fill in their ballots. The simulation can only be as realistic as these assumptions. This document lists each one so it can be explained, questioned, and checked against real data. The evidence behind each decision is in `docs/model-review.md`, with charts on the evidence page (https://claude.ai/artifact/TpQZK1zPMreHsvqn7dkFX9, source in `evidence/`).

Each assumption lists:

- **What it means** in plain language.
- **Approved setting:** what version 0.2 does, and why.
- **Version 0.1:** what the exploratory model did.
- **Evidence:** one of *assumed* (chosen by judgment), *tested* (sensitivity measured), or *calibrated* (set from real data), with the data used.
- **Sensitivity:** how much changing it moved the results, where known.
- **Fitted values and checks:** the values fitted to real ballots in milestone 4, and how simulated elections compare with real ones (`docs/model-check.md`).

Settings are named as in the settings file (`engine/README.md`).

## How a simulated election is built

In plain terms:

1. Decide the **type of election:** public voters or organization members, and how many seats and candidates.
2. Divide voters and candidates into **slates**, groups that tend to vote together. Some candidates belong to no slate.
3. Give each candidate a **popularity** score.
4. For each voter, pick a home slate, then fill their ballot one rank at a time. At each rank, draw one of the candidates not yet ranked, like drawing names from a hat where each candidate has a number of tickets. Candidates on the voter's own slate, and more popular candidates, have more tickets.
5. Stop the ballot at the voter's **ballot length**, which depends on the type of electorate and the ballot's rules.

The drawing method in step 4 is a standard one in voting research, called the **Plackett–Luce model**. Using a standard, named model makes the approach easier to defend and compare with other studies.

## Assumptions

### 1. Number of slates, and candidates outside slates

- **What it means:** how many groups voters and candidates split into, and how many candidates belong to none.
- **Approved setting:** 4 slates by default (`model.slates`), plus a share of candidates who belong to no slate and get no loyalty boost from anyone, about 15% by default (`model.unaffiliated_share`).
- **Why:** a typical Scottish ward has 4 to 6 parties standing, and about 1 in 6 candidates is an independent. Earlier runs found the number of slates barely changed results.
- **Version 0.1:** 4 slates; every candidate belongs to one.
- **Evidence:** calibrated (Scotland, 1,065 wards with 3 or more seats; NYC and Portland endorsements as a check). Tested for the number of slates.
- **Sensitivity:** low for the number of slates (1, 2, 8, and 16 slates gave results within one rank at 1,000 candidates). Not yet tested for the unaffiliated share.
- **Fitted values and checks:** in Scotland, 33% of candidates in a typical ward have a running mate, 46% are their party's only candidate, and 14% are independents. Simulated twins of Scottish wards give 40%, 29%, and 20%: close on running mates, with somewhat fewer single-candidate parties and more candidates in no slate. Voters with no home slate default to 0.6 times the share of candidates in no slate, as in Scotland (`model.unaffiliated_voter_share`).

### 2. Slate sizes

- **What it means:** what share of voters, and what share of candidates, belongs to each slate.
- **Approved setting:** set a slate's share of candidates separately from its share of voters. By default, each slate runs about as many candidates as the seats its support could win, not a full list (`model.slate_candidates = "expected_seats"`).
- **Why:** the owner's organization works this way: slates run lists in proportion to the votes they expect, because they believe that helps them. Scottish parties do the same: the SNP has 33% of first choices but 23% of candidates, while independents have 10% of first choices and 17% of candidates.
- **Version 0.1:** each slate gets a random weight between 0.5 and 1.5, and voters and candidates use the same weights.
- **Evidence:** calibrated (Scotland), and the owner's knowledge of the organization.
- **Sensitivity:** not yet tested.
- **Rule as built:** a slate with share *x* of all voters runs *x* × (seats + 1) candidates, rounded up, and at least one; candidates left over belong to no slate. For a 46-seat, 75-candidate election with 4 slates, that leaves about a third of candidates in no slate.
- **Question to test (milestone 8):** is a slate sized to its expected seats actually better for the slate than a full list? The simulator can run the same election both ways.

### 3. Candidate popularity

- **What it means:** how unequal support is among candidates. Each candidate gets a popularity drawn at random; the **spread** sets how far apart those draws are. At a spread of 0, every candidate is equally popular. At 0.7, a typical candidate is about 2 times more, or 2 times less, popular than the average; at 1.0, about 2.7 times. In a 7-candidate field, a spread of 0.7 gives the top candidate about 29% of first choices and the last about 5%; a spread of 1.0 gives 36% and 3%.
- **Approved setting:** set by type of election, as with ballot length: public or organizational, and 1 seat, 2 to 4 seats, or 5 or more seats (`model.popularity_spread`, one value per type). Two parts:
  - **Leading candidates:** tuned to the **quota**, the share of first choices that guarantees a seat, 1 ÷ (seats + 1). Each type starts at the spread where the top candidate's first choices, as a multiple of the quota, match real elections of that type: about 0.85 for single-seat public races, 0.6 to 0.7 for most others, and about 0.8 for organizational elections with 5 or more seats.
  - **Long-shot candidates:** a separate share of candidates whose popularity comes from a much lower range (`model.long_shot_share`), tuned to the last candidate's share of first choices.
- **Why:**
  - Much of the quota pattern comes from the field itself: with few candidates per seat, the leader passes the quota whatever voters do. But single-seat public races and large organizational elections are more lopsided than one spread allows.
  - Tuning to the quota or to the **even split** (the share every candidate would get if all were equally popular) gives nearly the same spread, because both measure the top candidate's share. The quota is used because votes beyond it pass to voters' next choices, which is part of what this project measures.
  - One spread can't produce real fields: real elections have a weak last candidate together with a leader who isn't that dominant. With the leaders tuned, the model's last candidate is about twice as strong as the real one in multi-seat public elections. Hence the separate long-shot share.
  - Write-in slots on US ballots aren't counted as candidates: each pools every write-in vote.
- **Version 0.1:** one spread of 1.0 (`model.popularity_spread`) for every election.
- **Evidence:** calibrated (Scotland, 1,100 elections; union and society elections from the Electoral Reform Society, 87; other organizational, 21; NYC, Portland, Canberra, and other public elections). Only 18 organizational elections have 5 or more seats, so the setting closest to the owner's elections is the least certain. Fitted spreads move by about 0.1 between runs.
- **Sensitivity:** **high. This is the most important setting.** At 1,000 candidates:

  | Popularity spread | 10% of candidates win | 50% of candidates win |
  |---|---|---|
  | 0 (all equal) | rank 29 | rank 7 |
  | 0.5 | rank 19 | rank 8 |
  | 1.0 (built now) | rank 16 | rank 12 |
  | 2.0 | rank 17 | rank 33 |

  (Rank where reach drops below 5 in 100 votes.) Report every headline result across the real range, from about 1.5 to 3 times an even split.
- **Fitted values and checks:** tuned on simulated twins of real elections, with slates included (`data/model_check.py`, `data/fits/popularity-tuning.json`):

  | Type of election | Spread | Long-shot share | Top candidate vs quota (real, model) | Last candidate vs even split (real, model) |
  |---|---|---|---|---|
  | Public, 1 seat | 1.1 | 10% | 0.88, 0.90 | 0.25, 0.22 |
  | Public, 2 to 4 seats | 1.2 | 0% | 1.33, 1.31 | 0.16, **0.07** |
  | Public, 5 or more seats | 0.5 | 20% | 1.05, 0.96 | 0.07, 0.06 |
  | Organization, 1 seat | 0.8 | 0% | 0.76, 0.79 | 0.31, 0.34 |
  | Organization, 2 to 4 seats | 0.7 | 0% | 1.06, 1.02 | 0.28, 0.27 |
  | Organization, 5 or more seats | 1.0 | 0% | 2.11, 2.10 | 0.24, **0.08** |

  The long-shot gap is 2 (long shots about 7 times less popular). With slates included, the spreads differ from the popularity-only estimates in milestone 3, because slates also make first choices unequal. In two types, the model's last candidate is about a third as strong as the real one, even with no long shots; see "Open questions from milestone 4".

### 4. Slate loyalty

- **What it means:** how strongly voters prefer their own slate, and how they spread to other slates.
- **Approved setting:** two settings, with no line of slates:
  - **Own-slate loyalty** (`model.own_slate_loyalty`): how strongly voters prefer their own slate, beyond popularity.
  - **Spread to other slates** (`model.other_slate_evenness`): how evenly votes that leave a slate spread over everyone else.

  Both are tuned so simulated ballots show the same overall clustering as real ballots, measured from all ballots, not from labeled lists. Two reference points: **loose**, like Portland's endorsement slates (about 10 to 15 points above popularity alone), and **tight**, like Scottish parties (about 60 points above).
- **Why:** Scottish party loyalty is very strong (84% of voters whose first choice has a running mate rank one second, against 21% from popularity alone), yet votes that leave a party spread widely (evenness 0.85, where 1 is perfectly even). A line of slates, where loyalty falls with each step, can't produce both. The model needs patterns, not causes: truncation depends on which candidates voters rank together, not why, so the report makes no claims about what endorsements or slates do.
- **Version 0.1:** one loyalty number, 0.15 (`model.slate_loyalty`); slates sit in a line, and a slate two steps away gets 0.15 × 0.15 of the weight.
- **Evidence:** calibrated (Scotland; NYC and Portland endorsement slates). Tested for the built version.
- **Sensitivity:** low for the built version (0 to 1 gave results within one rank). Not yet tested for the approved version.
- **Adjustable in the tuner (milestone 5):** a slider from loose to tight, so the owner can explore it rather than decide it in advance. Default: loose. Every headline result is still run at both ends, and across the range between.
- **Fitted values and checks:** on simulated twins of Scottish wards, a multiplier of 4 gives about 12 points of clustering above popularity ("loose") and 100 gives about 62 ("tight"; real Scottish wards: 61). A spread of 1.2 for `model.other_slate_spread` gives an evenness of 0.84, as in real wards, at the milestone 3 popularity settings; with the tuned popularity settings it comes out at 0.78.

### 5. Ballot length

- **What it means:** how many ranks each voter fills in.
- **Approved setting:** two settings.
  - **Electorate type** (`electorate.type`): **public** voters, tuned to Scotland, or **organization** members, tuned to the union and society elections. This sets each voter's natural ballot length, which grows with the number of candidates and much less with seats.
  - **Ballot rules** (`ballot.max_ranks`, `ballot.min_instruction`): a maximum (none, equal to the seats, or another number), and an optional "rank at least N" instruction.

  A voter ranks their own slate's candidates first, then decides at each further rank whether to keep going, up to their natural length. A maximum cuts ballots at the limit. When a maximum or an instruction sits above a voter's natural length, some voters are pulled up to it, at the rate the real data shows (see the fitted values below).
- **Why:**
  - Most voters rank a few candidates, and few rank everyone: in Scotland the typical voter ranks 3 of about 7 candidates.
  - Union and society members rank more as fields grow (about 6 of 10 to 15 candidates with 5 to 9 seats). For a 50-seat, 75-candidate election, the public rule projects about 9 ranks and the union rule about 26, so the type of electorate matters most.
  - The owner's framing: a limit or instruction is a feature of the ballot that changes behavior, for public voters and members alike. An instruction equal to the seats is a strong anchor: in Canberra, told to number 5, 98% numbered at least 5 and 69% exactly 5.
- **Version 0.1:** everyone fills in every rank up to the cap (`election.ranks`, default 100). Known to be unrealistic.
- **Evidence:** calibrated (Scotland; union and society elections; NYC, Portland, San Francisco, Oakland, Minneapolis; Canberra 2024; Australian Senate, Tasmania 2016).
- **Sensitivity:** not yet tested, but likely high. A vote can't travel past a voter's last rank.
- **Adjustable in the tuner (milestone 5):** the ballot wording ("up to N", "at least N", or "exactly N") and N. Default: up to N, with N equal to the seats, as on the owner's organization's ballot. Still missing: organizational ballots with a limit to tune against. No dataset has a limit near 50.
- **Fitted values and checks** (`data/fit_length.py`, `data/fits/ballot-length.json`): a voter's natural length is 1 plus a Conway–Maxwell–Poisson count: like a Poisson count, with one more setting, "bunching", that lets lengths cluster tightly (above 1) or spread out (below 1). Its rate is scale × candidates^a × seats^b. Separately, a share of voters rank every candidate, which fades as fields grow.

  | | Scale | Candidates power *a* | Seats power *b* | Bunching | Share ranking everyone, 4 candidates | Fade per extra candidate |
  |---|---|---|---|---|---|---|
  | Public (1,100 Scottish elections) | 0.46 | 0.60 | 0.36 | 1.44 (bunched) | 17% | 0.14 |
  | Organization (87 ERS elections) | 0.67 | 0.21 | 0.31 | 0.51 (spread out) | 26% | 0.06 |

  These reproduce the typical length by number of candidates and seats within about 0.1 to 0.3 ranks, and the share ranking everyone. For 75 candidates and 46 seats they project about 10 ranks for public voters and 29 for organization members, close to milestone 3's projections (about 9 and 26).

  **Pull toward the ballot's number:** about 23% of voters whose natural length is below an "up to N" limit rank exactly N (the middle half of 82 US elections: 14% to 36%), for limits of 3, 5, and 6 alike. Milestone 3 read the data as "no pull at 3"; fitted properly, the pull is similar for every limit. For "at least N", 97% of those below N are pulled up to it (Canberra 2024). For "exactly N", everyone ranks N.

  Simulated twins match the average length within 0.1 to 0.3 ranks in most types of election, and the share who fill a limit (33% against 37%). Two gaps: Canberra voters go further past their instruction (6.7 ranks against the model's 5.4), and small organizational elections run 0.6 ranks short.

### 6. Election size: candidates, seats, and voters

- **What it means:** how many candidates run, how many seats there are, and how many ballots are cast.
- **Approved setting:** set candidates, seats, and voters from the owner's organization's real elections, and test a range around them (`election.candidates`, `election.seats`, `election.voters`). Lower the minimum number of voters, so electorates of a few hundred can be simulated.
- **Why:**
  - Candidates per seat falls as seats grow, then levels off: in organizational elections, about 5 with one seat, 2.5 with 2 to 4 seats, and 1.67 with 5 to 12. Metro DC DSA's 46-seat election had 1.63. A 46-seat election should have roughly 1.5 to 2 candidates per seat.
  - In organizational elections, the number of voters shows almost no link to seats or candidates. Organizational electorates are small: Metro DC DSA had 432 ballots, about 9 voters per seat.
- **Version 0.1:** 10 voters per candidate, at least 1,000 (`election.voters`); candidates and seats set per run.
- **Evidence:** calibrated (all real data; Metro DC DSA from `docs/large-elections.md`). Every election in the data has at most 12 seats, so 46-seat results are projections.
- **Sensitivity:** low for voters at 3, 10, and 30 per candidate. Not yet tested at a few hundred voters, where single ballots matter more.
- **As built:** the default number of voters is 10 per candidate, at least 100 (version 0.1 keeps its old minimum of 1,000). Any number can be set.
- **Adjustable in the tuner (milestone 5):** candidates, seats, and voters. Default: Metro DC DSA's 2025 delegate election (46 seats, 75 candidates, 432 voters), until the owner's organization's numbers replace it.

## Factors the model leaves out

Each is a possible extension. The report must give the reason for leaving each out.

- **Individual taste beyond slates and popularity:** two voters on the same slate may like quite different candidates. The model gives every voter the same preferences within a slate, apart from randomness in the drawing.
- **Ideological distance between candidates:** the first exploratory model placed candidates and voters on a left–right line and ranked by distance. The current model replaced that for speed. Comparing the two would show whether this matters.
- **Strategic voting:** voters ranking differently from their true preferences to help or hurt a candidate. Assumed absent. Research suggests ranked ballots offer few practical strategic openings, but this is worth a sentence in the report.
- **Ballot order:** voters ranking in the printed order. About 2 in 100 longer Scottish ballots do (twice chance). Left out for now; revisit if the organization's data shows more.
- **Ballot position effects:** candidates listed first on the ballot getting extra votes.
- **Differences in turnout between slates:** covered by the separate voter share for each slate (assumption 2).

## Calibration statistics

To check the model against real elections, describe both in the same terms. All are computable from ballot data, by `data/calibration.py` for real elections; milestone 4 computes the same statistics for simulated ones.

1. **First choices:** the top candidate's share as a multiple of the quota and of an even split; the last candidate's share; how these change with the number of candidates. Set **popularity** (assumption 3).
2. **Ballot length:** what share of voters rank exactly 1, 2, 3, ... candidates, and what share fill a limit or instruction. Sets **ballot length** (assumption 5).
3. **Clustering:** among voters whose first choice has running mates or slate-mates, what share rank one second, against what popularity alone predicts. Sets **own-slate loyalty** (assumption 4).
4. **Transfer spread:** when votes leave a slate, how evenly they spread over other slates. Sets **spread to other slates** (assumption 4).
5. **Candidates and slates:** candidates per seat, the share with no running mate, and the share in no slate. Checks **election size** and **slates** (assumptions 1, 2, and 6).
6. **Exhaustion:** what share of ballots and voting weight run out of names by the final round. Directly comparable with McCune and Naber's Scottish results.

## Open questions from milestone 4

These need the owner's decision before the model changes.

1. **The last candidate is too weak in two types of election:** Scottish multi-seat wards and organizational elections with 5 or more seats (the type closest to the owner's). With slates included, matching the top candidate against the quota leaves the last candidate with about a third of its real share. The approved long-shot setting can only weaken the bottom further, so it can't fix this. A tested option: a share of **standout candidates** far above the rest, the mirror image of long shots, with a lower spread for everyone else. For organizational elections with 5 or more seats, 10% standouts about 4.5 times as popular as the rest, with a spread of 0.5, gives 2.41 times the quota (real 2.11) and a last candidate at 0.225 of an even split (real 0.235). It doesn't fix Scottish wards, where the weak bottom comes from tight parties.
2. **The pull toward a limit** is about 23% for limits of 3, 5, and 6 alike, not none at 3 as milestone 3 described.

## Change log

- **0.1:** first written description of the exploratory model.
- **0.2 (October 20, 2026):** the owner approved six decisions from the milestone 3 review (`docs/model-review.md`): candidates outside slates; slate sizes set by expected seats; popularity set by type of election, tuned to the quota, with a separate long-shot share; two slate-loyalty settings with no line; ballot length from electorate type and ballot rules; election size from the organization's real numbers, with a lower voter minimum. Not built yet (milestone 4).
- **0.2, built (October 20, 2026):** milestone 4 built version 0.2 in the engine and fitted its settings: ballot length (a Conway–Maxwell–Poisson count plus a fading share who rank everyone, in place of the unspecified distribution), the pull toward a limit (about 23% for every limit), slate strength (loose 4, tight 100) and spread to other slates (1.2), and popularity by type of election. Version 0.1 stays available for repeating earlier runs.
