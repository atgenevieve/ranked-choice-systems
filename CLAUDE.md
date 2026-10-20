# Rank depth project

This project measures **how many ranks on a ballot actually matter** in ranked voting systems, and turns the answer into a report that organizers and members can understand.

The owner, Genevieve, is an electoral and housing organizer, not a mathematician. Write everything for a smart reader without a math background:

- Use plain words, second person, and active voice. Follow the Google developer documentation style guide.
- Define every technical term in plain language the first time you use it.
- Explain what you did and what it means. Skip narration of steps.

## The question

When voters rank candidates, how far down the ballot do rankings still change who wins?

### Two measures

- **Reach.** The share of all votes that traveled down to rank *k*, because every candidate the voter ranked higher had already won or been eliminated. Cheap: one count per election. Measures *activity*, not consequence.
- **Truncation.** Cut every ballot after rank *k*, recount, and check whether the set of winners changes. Expensive: one recount per cutoff. Measures *consequence*. **This is the headline measure for the report.**

How they relate: if reach at rank *k* is zero, truncating there can't change anything. High reach does not mean truncation changes the result.

### Two versions of truncation

- **Whole electorate (build first).** Cut everyone's ballots at rank *k*. Answers "how deep does ranking need to go for the election to come out the same?"
- **Single voter (later).** Could one voter's rank *k* decide a seat? Much rarer. Answers "is it worth my time to fill in rank *k*?"

### Key definitions

- **Cutoff rank** for one election: the smallest *k* such that truncating at *k* or at any deeper rank gives the same winners as full ballots. Truncation results aren't always orderly: cutting at 8 can flip a seat while cutting at 7 doesn't. So check every deeper cutoff, not only *k*.
- **Truncation curve** across many simulated elections: P(truncating at rank *k* changes the winners), for each *k*. This is the main chart.
- **Seats changed:** how many seats go to a different candidate when truncating at rank *k*. Reported alongside the truncation curve, because in a 50-seat election, swapping one seat and swapping twenty both count as "the winners changed."
- **Threshold:** a probability line drawn across the curve, such as "under 5 in 100 elections." The report must explain why each threshold was chosen.

## Architecture

Six parts. Build them in the order in `docs/roadmap.md`.

1. **Model spec** (`docs/model-spec.md`). Every assumption about voter behavior, in plain language, with its default value, why it was chosen, and the evidence for it. This is the document the owner defends in public. **Any change to the model must update this file in the same change.**
2. **Simulation engine** (`engine/`). Rust. Swappable voting systems and voter models. Records reach and truncation. Uses every processor core.
3. **Model tuner.** A local web page with a control for each model setting. Shows statistics of generated elections next to the same statistics from real elections, so the model can be tuned until fake elections look like real ones.
4. **Sweep runner.** Reads a settings file listing combinations of candidates, seats, voters, voting systems, and model tunings. Runs them all, can stop and resume, and saves results.
5. **Results explorer.** A local dashboard for browsing results as charts.
6. **Report.** Built from finished results.

### Technical defaults

These are defaults, not decisions. Raise alternatives if something works better.

- Engine in Rust (fast, and already written and validated).
- For the tuner, prefer compiling the engine's ballot generator to WebAssembly, a format that lets the Rust code run inside a web page. This keeps one copy of the model code, so the tuner and the simulations can't drift apart. If that's too much work, use a small local server that calls the engine.
- Settings files in TOML or JSON. Results as JSON Lines (one result per line).
- Charts with a standard JavaScript charting library.
- **Charts use linear scales, never log scales** (owner's preference).
- **No colored accent stripes** on the side of boxes, cards, or rows (owner's preference). Use a plain border, or nothing.

## Rules for this project

- **Reproducibility.** Every run uses fixed random seeds, a starting value that makes "random" results repeatable. Every results file records the full settings, the engine version (git commit), and the model version. Never edit a finished results file; rerun instead.
- **Validation before trust.** Any new or changed counting code must match the reference implementation on shared test elections (see `engine/README.md`). Any new voting system needs hand-checked test elections with known answers.
- **Reproduce published findings.** Before reporting new results, the simulation should reproduce what published studies found (see `docs/literature.md`). If it doesn't, find out why before going further.
- **Real data over assumptions.** Where real ballot data can set a model setting, use it, and record the source in the model spec.
- **The owner approves the model.** Gather real data before changing the model. Propose every new or changed assumption in `docs/model-spec.md` with its evidence, and wait for the owner's approval before building it into the engine.
- **Parallelize data work.** Split large data gathering across several agents (by source, or by year within a source) and have each fetch and convert files concurrently, unless a site's rate limits or bot protection call for going slowly. Never move project data through public paste or file-sharing sites.
- **Say what's uncertain.** Report ranges (for example, "in 8 of 10 elections"), not single numbers alone. Flag results that depend heavily on one model setting.

## Known issues in the current engine

Fixed in milestone 1: Scottish rounding (5 decimal places), Scottish tie-breaking (look back, then lot), and truncation. Fixed in milestone 4: every simulated voter ranking every candidate (model version 0.2 draws ballot lengths fitted to real ballots). See `engine/README.md` for the counting rules as built.

Still open:

- **Model version 0.2 gaps** (milestone 4, `docs/model-check.md`): the last candidate is too weak in Scottish multi-seat wards and organizational elections with 5 or more seats. An option (standout candidates) is waiting on the owner.
- **One voting system.** Only Scottish STV (milestone 7). An exact-quota option (`run.quota = "exact"`) exists for measuring quota rounding.
- **Quota rounding and turnout** (open question 3 in `docs/model-spec.md`): with few votes per seat, Scottish rules' whole-vote quota makes the answer swing by 2 to 3 times as voters change by a few (a sawtooth with a step every seats + 1 voters). Never report a result for one exact voter count in such elections. Decided: turnout is an expected number plus an uncertainty (`election.turnout_spread`, default 10%), and the headline reads "Across the turnouts you expect, 95 of 100 elections are decided within the first N ranks." The quota belongs to the voting method (Scottish STV for now), not the model.

## What's been learned so far

From exploratory runs of up to 1,000,000 candidates, using reach at thresholds of 20, 10, 5, 2, and 1 in 100 votes:

- **Size stops mattering.** Above about 1,000 candidates, the answer depends only on the share of candidates who win. Smaller elections sit at or below the large-election curve.
- **Shape.** Steep when under about 10% of candidates win, flat (around rank 10 to 13 at the 5-in-100 threshold) from 20% to 90%, and rising slightly above 95%.
- **Sensitivity.** Slates (number of slates, loyalty) barely mattered. **Popularity concentration mattered most,** changing answers by 2 to 3 times, in different directions depending on seat share. The model spec flags this as the top calibration priority.
- **Proven bound.** A voter never needs more than candidates − seats + 1 ranks to guarantee their vote helps elect someone (whole-vote transfers only; surplus fractions can reach deeper).
- **Fitted formula** for reach (an empirical summary of the simulations, not a law):
  `ranks ≈ min( max(1.25·L^1.47·(C/S)^0.44, 1.81·L^1.74), 0.49·L^0.81·C^0.69, C )`, where `L = ln(100/t)`, C = candidates, S = seats, t = threshold out of 100. Median error about 10%, 90th percentile about 30%. Weakest above 95% of candidates winning.

All of this was measured with **reach**. Truncation results will differ, and they replace these as the headline once built.

## Files

- `docs/roadmap.md`: milestones, in order, with how to tell each is done.
- `docs/model-spec.md`: the voter model, assumption by assumption.
- `evidence/`: the model evidence page (one tab per model decision), and how to rebuild its data.
- `docs/model-check.md`: how simulated elections compare with real ones (milestone 4).
- `tuner/`: the model tuner, a web page that runs the engine (compiled to WebAssembly) to adjust the model and compare it with real elections. See `tuner/README.md`.
- `docs/model-review.md`: the milestone 3 review: what real data shows for each model assumption, with proposals and decisions.
- `docs/real-data-findings.md`: detailed findings from real ballots.
- `docs/endorsement-cohesion.md`: a reusable method for measuring how voters follow endorsements, slates, and pacts on ranked ballots, with early findings. Keep it usable outside this project.
- `docs/large-elections.md`: how common elections with many seats are, and how voters behave on long ballots.
- `docs/ballot-format.md`: the `.ballots` file format shared by the engine and the real-data scripts.
- `data/`: real ballot data, one folder per source. `data/README.md` sums up each dataset's details, adjustments, and shortcomings.
- `docs/literature.md`: published research, and the findings this project should reproduce.
- `engine/`: Rust simulator. See `engine/README.md`.
- `reference/`: the original JavaScript counter, used as the validation reference.
- `results/`: results from exploratory runs, each folder with a README describing settings.
