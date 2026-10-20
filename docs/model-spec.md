# Voter model specification

**Status:** draft 0.1. Describes the model as implemented in `engine/src/main.rs`, plus known gaps.

A **model** is the set of assumptions the simulation makes about how voters fill in their ballots. The simulation can only be as realistic as these assumptions. This document lists each one so it can be explained, questioned, and checked against real data.

Each assumption lists:

- **What it means** in plain language.
- **Current setting**, and the command-line flag that controls it.
- **Why:** the reason for the current setting.
- **Evidence:** one of *assumed* (chosen by judgment), *tested* (sensitivity measured), or *calibrated* (set from real data). Nothing is calibrated yet.
- **Sensitivity:** how much changing it moved the results.

## How a simulated election is built

In plain terms:

1. Divide voters and candidates into **slates**, groups that tend to vote together.
2. Give each candidate a **popularity** score.
3. For each voter, pick a home slate, then fill their ballot one rank at a time. At each rank, draw one of the candidates not yet ranked, like drawing names from a hat where each candidate has a number of tickets. Candidates on the voter's own slate, and more popular candidates, have more tickets.

This drawing method is a standard one in voting research, called the **Plackett–Luce model**. Using a standard, named model makes the approach easier to defend and compare with other studies.

## Assumptions

### 1. Number of slates

- **What it means:** how many groups voters and candidates split into.
- **Current setting:** 4 (`--factions`).
- **Why:** a typical number of organized tendencies in a membership organization.
- **Evidence:** tested.
- **Sensitivity:** low. Results with 1, 2, 8, and 16 slates were within one rank of each other at 1,000 candidates.

### 2. Slate sizes

- **What it means:** what share of voters and candidates belongs to each slate.
- **Current setting:** each slate gets a random weight between 0.5 and 1.5, so the largest slate can be up to 3 times the smallest. Voters and candidates use the same weights.
- **Why:** to avoid unrealistically equal slates.
- **Evidence:** assumed.
- **Sensitivity:** not tested.
- **Question for calibration:** do candidates split across slates in the same proportions as voters? In real organizations, a large slate may run fewer candidates per voter, or more.

### 3. Candidate popularity

- **What it means:** how unequal support is among candidates. With high spread, a few stars attract most first choices. With zero spread, every candidate is equally popular.
- **Current setting:** each candidate's popularity is drawn from a lognormal distribution (a common pattern where most values are moderate and a few are very large) with spread 1.0 (`--pop`). At this spread, the most popular candidate in a field of 100 is typically around 10 to 20 times more popular than the median candidate.
- **Why:** a moderate middle value.
- **Evidence:** tested.
- **Sensitivity:** **high. This is the most important setting.** At 1,000 candidates:

  | Popularity spread | 10% of candidates win | 50% of candidates win |
  |---|---|---|
  | 0 (all equal) | rank 29 | rank 7 |
  | 0.5 | rank 19 | rank 8 |
  | 1.0 (current) | rank 16 | rank 12 |
  | 2.0 | rank 17 | rank 33 |

  (Rank where reach drops below 5 in 100 votes.)
- **Top calibration priority.** Set this from real first-round vote shares.

### 4. Slate loyalty

- **What it means:** how strongly voters prefer their own slate. A candidate on a slate one step away gets their tickets multiplied by this number, two steps away by its square, and so on. At 0, voters rank only their own slate until it runs out. At 1, slates don't matter.
- **Current setting:** 0.15 (`--rho`).
- **Why:** strong but not total loyalty.
- **Evidence:** tested.
- **Sensitivity:** low. Results from 0 to 1 were within one rank of each other.
- **Note:** slates are arranged in a line, so "steps away" assumes a left-to-right ordering of tendencies. That may not fit every organization.

### 5. Ballot length

- **What it means:** how many ranks each voter fills in.
- **Current setting:** everyone fills in every rank up to the cap (`--ranks`, default 100).
- **Why:** a simplification during exploration, and needed to measure how deep votes could travel.
- **Evidence:** assumed. **Known to be unrealistic.**
- **Sensitivity:** not yet tested, but likely high. Real voters often rank only a few candidates. A vote can't travel past a voter's last rank.
- **Needed:** a distribution of ballot lengths, set from real data (milestone 2).

### 6. Number of voters

- **What it means:** how many ballots are cast.
- **Current setting:** 10 per candidate, at least 1,000 (`--voters`).
- **Why:** enough ballots that each candidate gets a meaningful number of first choices.
- **Evidence:** tested.
- **Sensitivity:** low. 3, 10, and 30 voters per candidate gave results within one rank.

## Factors the model leaves out

Each is a possible extension. List the reason for including or excluding each in the report.

- **Individual taste beyond slates and popularity:** two voters on the same slate may like quite different candidates. The current model gives every voter the same preferences within a slate, apart from randomness in the drawing.
- **Ideological distance between candidates:** the first exploratory model placed candidates and voters on a left–right line and ranked by distance. The current model replaced that for speed. Comparing the two would show whether this matters.
- **Strategic voting:** voters ranking differently from their true preferences to help or hurt a candidate. Assumed absent. Research suggests ranked ballots offer few practical strategic openings, but this is worth a sentence in the report.
- **Mistakes and random ranking:** voters who rank lower positions carelessly, for example in ballot order. Possibly relevant for long ballots.
- **Ballot position effects:** candidates listed first on the ballot getting extra votes.
- **Differences in turnout between slates.**

## Calibration statistics

To check the model against real elections, describe both in the same terms. Proposed statistics, all computable from ballot data:

1. **First-choice concentration:** what share of first choices goes to the top 10% of candidates. Sets **popularity spread**.
2. **Ballot length distribution:** what share of voters rank exactly 1, 2, 3, ... candidates. Sets **ballot length**.
3. **Slate cohesion:** among voters whose first choice is on slate X, what share rank another slate-X candidate second. Sets **slate loyalty**. Requires knowing slates, so use party labels in Scottish data, or endorsement slates in organizational data.
4. **Transfer spread:** when a candidate is eliminated, how many different candidates receive their votes, and how evenly.
5. **Exhaustion:** what share of ballots and voting weight run out of names by the final round. Directly comparable with McCune and Naber's Scottish results.

## Change log

- **0.1:** first written description of the exploratory model.
