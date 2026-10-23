# Rank Depth Tuner

A web page for adjusting the voter model (`docs/model-spec.md`) and seeing, side by side:

- **Your election:** how deep rankings matter, from simulated elections with the settings you choose, with turnout spread around the expected number ("Turnout uncertainty", default 10%), so the headline reads "Across the turnouts you expect, 95 of 100 elections are decided within the first N ranks": the rank where cutting ballots stops changing the winners (in fewer than 5 of 100 elections), the cutoff rank across elections, how many seats change hands, and how many votes run out.
- **Real elections:** a sample of real elections of one type, next to a simulated twin of each (same candidates, seats, voters, and ballot rules) with your settings, measured the same way, and labeled close, near, or off.
- **Saving:** the settings as a settings file the engine runs (`stvsim run`), copied, saved as a file, or saved to the page's shared list, where Claude can read it back into the project.

Every simulation runs the project's own engine, compiled to WebAssembly (`stvsim.wasm`, a format that lets the Rust code run in a web page), so the tuner and `stvsim run` can't drift apart. The statistics compared with real elections are the engine's copy of `data/calibration.py`'s definitions; `data/check_stats.py` checks that the two agree.

The open questions from milestone 4 (standout candidates, and the pull toward a limit) can be tried here: set "How far long shots trail" below 0 for standouts, and the pull under "More settings".

## Files

- `index.html`, `app.js`: the page.
- `branches.html`, `branches.js`: the NYC DSA branch page, published separately. It compares voting systems (Scottish STV, Cambridge STV, Borda count, approval; all four ticked by default), drawing each on the same charts in its own color. It shares `app.js` (the model settings, engine calls, and charts) and plays out each branch's delegate election with its own candidates, seats, and expected ballots, which you can edit on the page. Under each branch's two charts, a bar chart shows what each ballot position is worth to a candidate: how many percentage points more likely a candidate is to win when one more voter ranks them at that position instead of leaving them off (`sim::position_worth` in the engine), for candidates drawn at random, with the close-race multiple (the last 2 winners and 2 strongest losers) in its subtitle.

The engine runs in a pool of workers, one per spare processor core (`app.js`), so both pages' requests run side by side. On the branch page, every branch and every chunk of 50 simulated elections for the bar chart is a separate request. The charts fill in as results arrive: each branch's line charts first from its first 50, then 200, then all simulated elections (election i always gets the same seed, so a smaller run is exactly the start of the full one), and the bar charts chunk by chunk, taken in turn across the branches.
- `branches-defaults.json`: the engine's replies for the branch page's default settings and branch numbers, so the page opens with results at once instead of simulating for minutes (the position-worth charts alone take about 12 times as long as the rest). Any request with other settings goes to the engine as before. Rebuild it with `precompute.mjs` (`npm install --no-save playwright && node precompute.mjs`) after any change to the engine, the model, the page's defaults, or the branch numbers; it runs the page itself, so the saved results match what the page would compute.
- `worker.js`: runs the engine off the page's main thread.
- `stvsim.wasm`: the engine, built from `engine/src` (requests and replies are described in `engine/src/wasm.rs`).
- `reference.json`: the real elections, built by `data/tuner_reference.py`.
- `build.sh`: rebuilds `stvsim.wasm` and `reference.json`, then checks the statistics.

## Run it locally

```
cd tuner && python3 -m http.server 8000
```

Then open http://localhost:8000. Saving to the shared list works only on the published page; copying the settings works anywhere.
