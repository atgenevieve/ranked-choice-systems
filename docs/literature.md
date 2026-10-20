# Published research

Summaries of studies on how many ranks matter, gathered October 2026. Check each source directly before citing it in the report; these summaries come from abstracts and secondary pages, not full readings.

## Single-winner ranked choice

### Tomlinson, Ugander, and Kleinberg (2023). "Ballot Length in Instant Runoff Voting." AAAI.

- **Question:** with voters' preferences held fixed, how much does the number of allowed ranks change who wins?
- **Methods:** proofs, simulations, and 168 real elections from PrefLib, with ballots cut to shorter lengths.
- **Findings:**
  - In the worst case, with *n* candidates, up to *n* − 1 different winners are possible across ballot lengths.
  - When voters line up on a single left–right spectrum, ballots longer than about half the number of candidates almost always give the full-ballot winner.
  - In real elections, about 25% had more than one winner across ballot lengths. The most distinct winners in any one election was three.
- **Not covered:** multi-winner STV.
- **Reproduce:** the half-the-candidates result with a left–right voter model; the 25% figure using PrefLib data.
- **Links:** https://www.cs.cornell.edu/~kt/publication/2023-tomlinson-ballot-length, https://arxiv.org/abs/2207.08958

### Dickerson, Martin, and McCune (2023 to 2024). "An Empirical Analysis of the Effect of Ballot Truncation on Ranked-Choice Electoral Outcomes."

- **Methods:** about 1,180 real ranked-choice elections, with ballots cut to different lengths.
- **Finding:** with ballots cut to 3 or more ranks, the winner rarely changes.
- **Reproduce:** this finding on the same kind of data.
- **Links:** https://arxiv.org/abs/2306.05966, https://journals.calstate.edu/pump/article/view/3778

### Kilgour, Grégoire, and Foley (2020). "The prevalence and consequences of ballot truncation in ranked-choice elections." Public Choice 184(1).

- **Methods:** evidence from real elections, plus simulations of 4 to 6 candidate races with spatial and random voter models.
- **Findings:** voters choosing to rank fewer candidates is very common. Even small amounts can change outcomes, especially when the final margin is smaller than the number of ballots that ran out of names.
- **Link:** https://ideas.repec.org/a/kap/pubcho/v184y2020i1d10.1007_s11127-019-00723-2.html

## Multi-winner STV

### McCune and Naber (2026). "Ballot Exhaustion in Multiwinner Single Transferable Vote Elections." Preprint.

- **Data:** 1,070 Scottish local elections, 5.4 million ballots.
- **Findings:**
  - About 27.9% of ballots run out of names by the final round, but only about 7.1% of voting weight, because many of those ballots had already helped elect someone.
  - Most voters whose ballots ran out still had a first or top choice elected.
  - Filling in missing rankings with a realistic method changed about 3.5% of seats. Extreme methods changed many more.
- **Relevance:** the closest multi-winner study, and a source of real Scottish ballot data for calibration.
- **Reproduce:** the 28% versus 7% gap, with the model tuned to Scottish data.
- **Link:** https://arxiv.org/abs/2605.12676

### Hutchinson (2026). "Ranking limit recommendations for multi-winner ranked choice voting." FairVote.

- **Methods:** recounts of Cambridge, MA city races with limits of 3, 5, and the number of seats; review of ranking behavior in Cambridge, Eastpointe, Minneapolis, and Portland.
- **Findings:** a limit equal to the number of seats barely changed anything. Limits of 3 or 5 raised exhausted ballots by about 1 to 7 percentage points, and in one of four races would have changed a winner.
- **Recommendation:** allow at least 5 and up to 9 rankings, about the number of seats.
- **Note:** FairVote is an advocacy organization. Treat as useful evidence, not neutral research.
- **Links:** https://fairvote.org/report/ranking-limit-recommendations-for-multi-winner-ranked-choice-voting/, https://fairvote.org/report/ranking-limit-recommendations/

## Other related work to read

- McCune and others: studies of oddities and proportionality in Scottish STV elections, with links to the Scottish ballot data.
- Work on fairness criteria for shortened ballots in multi-winner elections (arXiv 2408.03926).

## Where this project adds something new

From the search so far:

- Systematic simulation of multi-winner STV across candidates, seats, and voters.
- Results at very large scale, and the finding that size stops mattering above about 1,000 candidates.
- A formula taking candidates, seats, and a threshold.
- One framework comparing transfer systems (ranked choice, STV) with point-based and head-to-head systems.
- Plain-language explanation for organizers and members.

**Limit of real-data studies:** they can only cut ballots shorter than voters actually ranked. Simulation can test deeper cutoffs, which is where this project complements them.

**Possible contact:** David McCune (William Jewell College), an author on several of these studies who works with the Scottish data.
