# Simulation engine

A fast simulator for Scottish-style STV (single transferable vote), written in Rust. For each election it measures two things:

- **Reach:** for every rank on the ballot, the share of all votes that traveled that far down, because every candidate the voter ranked higher had already won or been excluded.
- **Truncation:** for every cutoff rank *k*, whether cutting every ballot after rank *k* and recounting changes who wins. From this it finds the election's **cutoff rank**: the smallest *k* where keeping *k* or more ranks always gives the full-ballot winners.

`CLAUDE.md` explains both measures and why truncation is the headline.

## Build and test

Install Rust from https://rustup.rs, then from this folder:

```
cargo build --release
cargo test --release
```

The program is created at `target/release/stvsim`. The tests are hand-checked elections with known answers (see [Tests](#tests)).

## Simulate elections

```
target/release/stvsim run settings/test-truncation.toml > results.jsonl
```

All settings live in a settings file in TOML, a simple text format of `name = value` lines grouped under headings. `settings/test-truncation.toml` is a commented example.

| Setting | Meaning | Default |
|---|---|---|
| `run.name` | A short name for the run | required |
| `run.seed` | Starting value for random numbers. The same seed gives the same results | 1 |
| `run.sims` | Simulated elections per seat count | required |
| `run.threads` | Processor cores to use. 0 means all | 0 |
| `run.rules` | `scottish`, or `reference` (validation only; see below) | `scottish` |
| `run.surplus_order` | `largest` (largest surplus first, as Scottish rules require), or `election` (order of election; validation only) | `largest` |
| `run.quota` | `whole` (Scottish rules: a whole number of votes), or `exact` (no rounding; see below) | `whole` |
| `run.truncation` | Whether to measure truncation as well as reach | `true` |
| `run.curve_ranks` | How many ranks of each curve to write. 0 means all | 0 |
| `election.candidates` | Number of candidates | required |
| `election.seats` | Seat counts to test, as a list such as `[1, 3, 10]` | required |
| `election.voters` | Expected ballots per election | 10 × candidates, at least 100 (at least 1,000 for model version 0.1) |
| `election.turnout_spread` | How uncertain turnout is: each simulated election draws its number of voters from a bell curve centered on `voters`, with this standard deviation as a share of `voters` (cut off at 3 standard deviations). 0 gives every election exactly `voters`. Each results line records the voters drawn (`voters`: mean, min, 10th, 50th, and 90th percentiles, max). | 0.1 (0 for model version 0.1) |
| `election.ranks` | The most ranks any ballot can hold | 100 |
| `electorate.type` | `public` (tuned to Scotland) or `organization` (tuned to union and society elections). Sets how far voters naturally rank | `public` |
| `electorate.length_scale`, `length_candidates_power`, `length_seats_power`, `length_bunching`, `length_complete_share`, `length_complete_fade` | Overrides for the natural ballot length | fitted for the electorate type |
| `ballot.wording` | `none`, `up_to` (a maximum), `at_least` (an instruction), or `exactly` | `none` |
| `ballot.n` | The number in the wording: a number, or `"seats"` | `"seats"` |
| `ballot.pull` | Override for the share of voters below N who are pulled up to N | fitted for the wording |
| `model.version` | `"0.2"` (approved October 20, 2026) or `"0.1"` (exploratory, for repeating earlier runs) | `"0.2"` |
| `model.slates` | Number of slates | 4 |
| `model.unaffiliated_share` | Share of candidates in no slate (at least) | 0.15 |
| `model.unaffiliated_voter_share` | Share of voters with no home slate | 0.6 × share of candidates in no slate |
| `model.slate_candidates` | `expected_seats` (each slate runs about as many candidates as the seats it could win) or `same_as_voters` | `expected_seats` |
| `model.popularity_spread` | Popularity spread, or `"auto"` for the fitted value for the type of election | `"auto"` |
| `model.long_shot_share` | Share of long-shot candidates, or `"auto"` | `"auto"` |
| `model.long_shot_gap` | How far below the rest long shots sit (2 is about 7 times less popular) | 2.0 |
| `model.slate_strength` | `"loose"`, `"tight"`, or a multiplier on own-slate candidates | `"loose"` |
| `model.other_slate_spread` | How unevenly votes that leave a slate spread over other slates (0 = evenly) | 1.2 |
| `model.slate_loyalty` | Version 0.1 only: loyalty along a line of slates | 0.15 |

`docs/model-spec.md` explains each setting and its evidence. Settings files written before model version 0.2 don't name a version; add `version = "0.1"` under `[model]` to repeat them, as in `settings/test-truncation.toml`.

## Measure ballot files

```
target/release/stvsim stats [--merge-last] data/scotland/ballots/*.ballots
```

Prints the statistics the model tuner compares with real elections (`src/stats.rs`): the top and last candidates against the quota and an even split, ballot length, clustering, evenness, and candidate kinds. `data/check_stats.py` checks they match the Python definitions in `data/calibration.py`.

## The engine in a web page

The engine is also a library (`src/lib.rs`) that compiles to WebAssembly for the model tuner (`tuner/`). `src/wasm.rs` describes the requests the page sends. Rebuild with `sh tuner/build.sh` (needs `rustup target add wasm32-unknown-unknown` once).

## Write simulated elections as ballot files

```
target/release/stvsim generate settings/my-run.toml folder/
```

This writes every simulated election (`run.sims` for each seat count) to the folder as a `.ballots` file and a `.json` metadata file, in the format of `docs/ballot-format.md`, so the scripts that measure real ballots can measure simulated ones the same way. Slates are written as parties ("Slate 1", ...), and candidates in no slate as `null`. The metadata also records the full settings, the seed, the engine version, and the model version. `data/model_check.py` uses this to compare the model with real elections (`docs/model-check.md`).

### Output

Each seat count writes one line of JSON. Every line records the full settings, the engine version and git commit (`engine.dirty` is `true` if the engine had uncommitted changes when it was built), and the model version. Fields:

- `reach`: for each threshold (`t20`, `t10`, `t5`, `t2`, `t1`: 20, 10, 5, 2, and 1 in 100 votes), the rank where reach drops below the threshold:
  - `avg`: read from the average curve across all simulated elections.
  - `p10`, `p50`, `p90`: the 10th, 50th, and 90th percentile across elections, so 8 in 10 elections fall between `p10` and `p90`.
  - `censored`: how many elections never dropped below the threshold within the ballot cap. If this isn't 0, the true answer is deeper than the cap.
  - `curve`: the average reach, in votes out of 100, at each rank.
- `truncation`:
  - `p_changed`: for each cutoff rank *k*, the share of elections where keeping only *k* ranks changes the set of winners. This is the **truncation curve**.
  - `seats_changed`: for each cutoff rank *k*, how many seats go to a different candidate when keeping only *k* ranks: `mean` (average across elections), `share_mean` (that average divided by the number of seats), and `max` (the most in any one election). This shows how big a change is, since `p_changed` counts swapping one seat out of 50 the same as swapping all of them.
  - `threshold_rank`: for each threshold (`t5` means 5 in 100 elections), the smallest rank *k* where the truncation curve stays below the threshold for *k* and every deeper rank.
  - `cutoff_rank`: the spread of cutoff ranks across elections: `mean`, `p10`, `p50`, `p90`, `max`, and `counts` (how many elections had each cutoff rank, starting at rank 1).
  - `rank_worth`: how many winners each rank decides. For rank 1, the seats minus the winners that would be different with first choices alone; for each later rank, the winners that would be different if ballots stopped one rank earlier, minus those different if they stop at this rank. Across ranks it adds up to the seats. `mean` and `sd` (spread across elections) for each rank, and `cov_next` (how it moves with the next rank's, for ratios between ranks).
- `exhaustion`: average share of voting weight (`votes_pct_mean`) and of ballots (`ballots_pct_mean`), out of 100, that ran out of candidates still in the race.

## Count real ballots

```
target/release/stvsim count data/scotland/ballots/*.ballots
```

This reads files in the format in `docs/ballot-format.md` and writes one line of JSON per election: the winners, the order candidates were elected and excluded, the reach curve, exhaustion, and truncation (`changed`, `winners_at`, and `seats_changed` for each cutoff rank, and `cutoff_rank`). If a metadata file lists the officially declared winners, `matches_official` says whether the engine agrees.

Options: `--rules scottish|reference`, `--surplus-order largest|election`, `--quota whole|exact`, `--seed N` (the seed for decisions by lot), and `--no-truncation`.

## Counting rules

Scottish rules, from the Scottish Local Government Elections Order 2011 (SSI 2011/399), Schedule 1, rules 47 to 53:

- **Quota:** valid ballots divided by (seats + 1), with any fraction dropped, plus 1. A candidate who reaches it is elected.
- **Surpluses:** every ballot of an elected candidate moves on to its next choice. It carries the candidate's surplus × the ballot's current value ÷ the candidate's total, **cut to 5 decimal places** (any remainder is dropped, not rounded). The engine counts in whole units of 0.00001 votes, so this is exact.
- **Surplus order:** largest surplus first. Equal surpluses: the candidate who had more votes at the most recent stage where their totals differed goes first. If they were equal at every stage, lot decides.
- **Exclusion:** when no surplus is left, the candidate with the fewest votes is excluded and their ballots move on at their current values. Ties: the candidate with fewer votes at the most recent stage where their totals differed goes first. If they were equal at every stage, lot decides.
- **End:** when the candidates still in the race equal the seats left, they're all elected.

A **stage** is one transfer: of a surplus, or of an excluded candidate's ballots. The first count of first choices is stage 0.

**Decisions by lot** use a random draw with a fixed seed, so they're repeatable. Truncated recounts of an election use the same draw as its full count.

**Interpretation for ties among three or more candidates.** The rules describe two candidates. With three or more, the engine compares them two at a time by the rule above, which puts them in a consistent order. When candidates' totals all differ at the same earlier stage, this gives the same answer as reading the rule literally.

The rule for manual counts that elects a leading candidate early (rule 53(1A)) is left out. It ends the count sooner but never changes who wins.

### Other voting systems

`run.system` picks the voting system: `scottish_stv` (the default, the rules above), `cambridge_stv`, `borda`, or `approval` (`src/systems.rs`). Each is measured the same way: winners with full ballots, and winners when every ballot is cut after rank *k*. Truncation for these systems is a full recount at every cutoff where some ballot was counted past rank *k*.

- **Cambridge STV**, as Cambridge, Massachusetts counts it: the same quota as Scottish rules, but whole ballots move, never fractions. Surpluses move only after the first count, largest first, by the Cincinnati method: of the winner's ballots, in the order counted, every n-th ballot with a continuing choice moves on, where n is the winner's votes ÷ surplus, rounded to the nearest whole number. Past the last ballot, the count goes round again from the n-th ballot. After the first count, a candidate who reaches the quota is elected and keeps exactly the ballots they have; ballots that would reach them later skip them. Exclusions are one at a time, lowest first, ties by lot. Left out: Cambridge's rule that drops every candidate under 50 votes at once, because simulated branch elections are far smaller than Cambridge's and it would drop candidates who could win.
- **Borda count:** a candidate at rank r gets (candidates − r) points; unranked candidates get none. The seats go to the highest totals, ties by lot. Every rank counts, so reach is the share of ballots with a name at each rank.
- **Approval:** each voter approves every candidate they ranked (model spec, assumption 7). The seats go to the most approved, ties by lot. Cutting after rank *k* means approving only the first *k*.

Borda and approval are block systems: the most broadly supported candidates take every seat, so a majority slate can win all of them. Hand-checked tests: `borda_by_hand`, `approval_by_hand`, `cambridge_by_hand`, and `cambridge_skips_elected` in `src/systems.rs`. Position worth (`sim::position_worth`) works for every system.

### Exact quota

`quota = "exact"` replaces the whole-vote quota with ballots ÷ (seats + 1), not rounded: a candidate is elected on any total above it (in practice, 0.00001 votes above it, the smallest step the count uses). Everything else follows Scottish rules. It isn't a voting system anyone uses as such; it shows how much the rounding of the quota alone changes results. With few votes per seat, the rounding changes how deep rankings matter by up to 2 times, in a sawtooth as the number of voters grows (see the quota-rounding tab of the model evidence page, `evidence/`). The test `exact_quota_is_not_rounded` is a hand-checked election where the two quotas elect different people.

### Reference rules

`rules = "reference"` matches the original JavaScript counter in `reference/decay.js`: full precision instead of 5 decimal places, and ties go to the lowest-numbered candidate. It exists only for the validation check below.

## Validation

From the project folder:

```
python3 reference/validate.py
```

This counts 24 test elections with both the engine (reference rules) and `reference/decay.js`, and compares the reach curves. Expected output: `24 of 24 elections match.`

## Tests

`cargo test --release` runs hand-checked elections in `src/count.rs`:

- The 100-voter example in `reference/README.md`: reach and truncation at every cutoff.
- A surplus transfer where cutting to 5 decimal places changes the totals.
- Two exclusion ties that Scottish rules settle by looking back, where the reference rule gives a different answer, including one where it changes the winner.
- Ties settled by lot: repeatable for a given seed, and different seeds reach both outcomes.
- The truncation shortcut (below) gives the same winners as a from-scratch recount at every cutoff, on 48 simulated elections under both rule sets.

## How truncation is made fast

A truncated count is identical to the full count until the first stage where some vote would have landed on a cut rank. So the engine:

1. Runs the full count once, and notes the first stage at which a vote landed on each rank.
2. Skips every cutoff deeper than the deepest rank any vote reached, since nothing changes there.
3. Runs the full count again, and at the stage where each cutoff first matters, copies the count and finishes the copy with the cut ballots.
4. When only asked whether the winners change (the `count` command never does this), stops a copy as soon as it elects someone who didn't win the full count, or excludes someone who did. Simulations run every copy to the end so they can count how many seats change.

## Sweeps

`sweep.py` runs groups of settings and appends results to a file. It skips settings already in the file, so you can stop and restart it.

```
python3 sweep.py sens sens.jsonl     # sensitivity test at 1,000 candidates
python3 sweep.py sweep sweep.jsonl   # 10 to 100,000 candidates
python3 sweep.py huge huge.jsonl     # 1,000,000 candidates (slow: about 8 minutes per run on one core)
```

These plans reproduce the exploratory reach runs, so truncation is off. Milestone 8 replaces this script with a settings-file-driven sweep runner.

## Speed and memory

Reach only, measured on a 2-core cloud machine:

| Candidates | Voters | Seconds per election | Peak memory |
|---|---|---|---|
| 1,000 | 10,000 | 0.3 | small |
| 10,000 | 100,000 | 2 | small |
| 100,000 | 1,000,000 | 23 | about 450 MB |
| 1,000,000 | 10,000,000 | about 450 | several GB |

With truncation, on a 4-core cloud machine: 200 elections of 30 candidates take about 0.1 seconds per seat count, and 8 elections of 1,000 candidates about 0.6 seconds per seat count.

Elections run in parallel, one per core, so a laptop with 8 to 12 cores runs sweeps 2 to 6 times faster.
