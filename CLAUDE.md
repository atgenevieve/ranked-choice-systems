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

## Rules for this project

- **Reproducibility.** Every run uses fixed random seeds, a starting value that makes "random" results repeatable. Every results file records the full settings, the engine version (git commit), and the model version. Never edit a finished results file; rerun instead.
- **Validation before trust.** Any new or changed counting code must match the reference implementation on shared test elections (see `engine/README.md`). Any new voting system needs hand-checked test elections with known answers.
- **Reproduce published findings.** Before reporting new results, the simulation should reproduce what published studies found (see `docs/literature.md`). If it doesn't, find out why before going further.
- **Real data over assumptions.** Where real ballot data can set a model setting, use it, and record the source in the model spec.
- **The owner approves the model.** Gather real data before changing the model. Propose every new or changed assumption in `docs/model-spec.md` with its evidence, and wait for the owner's approval before building it into the engine.
- **Say what's uncertain.** Report ranges (for example, "in 8 of 10 elections"), not single numbers alone. Flag results that depend heavily on one model setting.

## Known issues in the current engine

Fixed in milestone 1: Scottish rounding (5 decimal places), Scottish tie-breaking (look back, then lot), and truncation. See `engine/README.md` for the counting rules as built.

Still open:

- **Everyone ranks to the maximum.** Every simulated voter fills every rank up to the ballot cap (default 100). Real voters stop early. This needs a ballot-length setting in the model, set from real data and approved by the owner (milestones 2 to 4).
- **One voting system.** Only Scottish STV (milestone 7).

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
- `docs/large-elections.md`: how common elections with many seats are, and how voters behave on long ballots.
- `docs/ballot-format.md`: the `.ballots` file format shared by the engine and the real-data scripts.
- `data/`: real ballot data, one folder per source. `data/README.md` sums up each dataset's details, adjustments, and shortcomings.
- `docs/literature.md`: published research, and the findings this project should reproduce.
- `engine/`: Rust simulator. See `engine/README.md`.
- `reference/`: the original JavaScript counter, used as the validation reference.
- `results/`: results from exploratory runs, each folder with a README describing settings.
