# Roadmap

Each milestone ends with a check. Don't start the next one until its check passes.

**Status:** milestones 0 to 2 are done. Milestone 3 (owner review) is waiting on the owner: see `docs/model-review.md`.

## Milestone 0: Set up

- Initialize a git repository, so every change to code and model is recorded.
- Build the engine: `cd engine && cargo build --release`. Requires Rust, which you install from rustup.rs.
- Run the validation check in `engine/README.md`.

**Done when:** the engine builds, and the validation check shows 24 of 24 elections matching.

## Milestone 1: Fix and extend the engine

1. Match Scottish rules exactly: cut transfer values to 5 decimal places, and break ties by looking back at earlier rounds, then by lot (random draw with a fixed seed).
2. Add **whole-electorate truncation**: for each simulated election and each cutoff rank *k*, recount with every ballot cut at *k*, and record whether the winners match the full-ballot winners. Also record the cutoff rank as defined in `CLAUDE.md`.
3. Speed up truncation. Ideas: skip cutoffs deeper than the deepest rank any vote actually reached, since nothing changes there; reuse the full-ballot count's early rounds when a cutoff can't affect them.
4. Move all settings into a settings file instead of command-line flags. Write the settings and engine version into every results file.

**Done when:** the engine passes validation, truncation results exist for a small test sweep, and a hand-checked example (like the 100-voter example in `reference/README.md`) gives the expected answer at every cutoff.

## Milestone 2: Gather real data

Real data comes before any change to the model, so the model is shaped by what real voters do rather than by guesses.

1. Download real ranked ballots. Starting points (confirm current locations and terms of use):
   - **PrefLib** (preflib.org): a public library of real ranked ballots, used by the Cornell study.
   - **Scottish council elections:** full ballot preference data, used by the McCune studies.
   - **NYC ranked-choice primaries:** cast vote records (ballot-level data) published by the NYC Board of Elections.
   - **Cambridge, MA and Portland, OR:** cast vote records for multi-winner races.
2. Record each source's location, date downloaded, and terms of use next to the data.
3. Compute the calibration statistics in `docs/model-spec.md` for each real election. Calibration statistics are measurements that describe an election in a way that can be compared between real and simulated elections, such as how many candidates a typical voter ranks.
4. Note anything in the real data that the current model can't produce, such as a pattern of ballot lengths or a way votes transfer.

**Done when:** a table of calibration statistics exists for at least one real data source, ideally Scotland, since it's multi-winner STV.

## Milestone 3: Review the model assumptions with the owner

This is a human review step. The owner defends the model in public, so the owner approves every assumption before it goes into the code.

1. Using the real data from milestone 2, draft changes to `docs/model-spec.md`: for each assumption, the proposed setting, the real-data evidence for it, and the alternatives considered.
2. Add any new assumptions the real data calls for, such as ballot length, and list factors still left out of the model and why.
3. Review the draft with the owner, one assumption at a time. Record each decision, and the reason for it, in the model spec.

**Done when:** the owner has approved every assumption in the model spec, and the change log records the approved version.

## Milestone 4: Improve the model

Build the model the owner approved in milestone 3. Don't add or change assumptions here without going back to the owner.

1. Add a **ballot length** setting: how many ranks each voter fills in, drawn from a distribution (a spread of possible values with set likelihoods) instead of everyone ranking the maximum.
2. Make every model setting a named field in the settings file, and document each one in `docs/model-spec.md`.
3. Compute the same calibration statistics for generated elections that milestone 2 computes for real ones, using shared code where possible.

**Done when:** every setting in the code appears in the approved model spec, and the calibration statistics can be computed for any generated election.

## Milestone 5: Build the model tuner

A local web page with a control for each model setting. For the chosen settings, it generates sample elections and shows their calibration statistics next to the real-data values, with clear labels for which are close and which are off.

**Done when:** the owner can tune the model to match a real data source without editing code, and save the tuning as a named settings file.

## Milestone 6: Reproduce published findings

Using real ballots where the study did, and the tuned model where it simulated:

- **Dickerson, Martin, and McCune:** in real single-winner elections, truncating at 3 or more ranks rarely changes the winner.
- **Tomlinson, Ugander, and Kleinberg:** with voters on a left–right spectrum, ballots longer than about half the number of candidates almost always give the full-ballot winner. In their 168 real elections, about 1 in 4 had more than one winner across ballot lengths.
- **McCune and Naber:** in Scottish elections, about 28% of ballots run out of names by the final round, but only about 7% of voting weight is lost.

**Done when:** each finding is reproduced, or any difference is explained in `docs/literature.md`.

## Milestone 7: Add voting systems

Each system needs hand-checked test elections before use.

- Single-winner ranked choice (instant runoff), as used in NYC primaries.
- Other STV versions: Meek, Cambridge-style random whole ballots, and Irish-style proportional whole ballots.
- Point-based ranked systems, such as Borda count. Here every rank always counts, with less weight lower down, so the measure becomes how much each rank can sway the result.
- Head-to-head (Condorcet) systems, such as ranked pairs.
- Later: approval and score voting, where the question becomes how many candidates to mark.

**Done when:** each system passes its test elections, and the report has a plain-language explanation of what makes a vote "move down" under that system.

## Milestone 8: Run sweeps

Settings-file-driven runs across candidates, seats, voters, voting systems, and model tunings, on all cores, resumable.

**Done when:** the sweeps in the report's outline are complete, with results files recording full settings and versions.

## Milestone 9: Build the results explorer

A local dashboard for browsing results, comparing systems and tunings, and exporting charts for the report.

## Milestone 10: Write the report

Suggested outline:

1. The question, and what "matters" means (truncation, with reach as the explanation).
2. What's guaranteed by proof, for each system.
3. What typically happens: truncation curves by system, seat share, and size.
4. What drives the answer: the sensitivity results, especially popularity concentration.
5. Rules of thumb and the formula, with their error ranges.
6. Comparison with published research.
7. Limits and open questions.
8. Methods appendix: the model spec, the validation checks, and how to reproduce every result.
