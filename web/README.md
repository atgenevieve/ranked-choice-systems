# Public simulator

The engine and saved results behind the ranked choice simulator on Genevieve's website, at genevieverand.com/projects/ranked-choice-simulator (the page itself lives in the website's repository, `atgenevieve/genevieverand.com`).

A visitor picks an election (candidates, seats, ballot slots, and expected voters) and the model settings, one tab per group. The page shows how many ranks affect who wins, how many winners change, and what each ballot position is worth to a candidate, the same three charts as the tuner's branch page. The charts fill in one simulated election at a time, as each one finishes.

## Saved results

Simulating a large election 1,000 times takes about a minute and a half on one processor core. So the results for the public preset elections (hundreds of thousands of voters) with the default settings are worked out once, from a fixed seed, and saved in `dist/`, one file per preset. The DSA branch elections are small enough to run in the browser in under a minute, so they have no saved file. For anything without one, the page downloads the engine (`stvsim.wasm`, the same file as the tuner's) and run it in their browser.

The engine's `stream` task returns one small record per simulated election: its cutoff rank, the seats changed at each shallower cut, its voter count, and what each ballot position was worth to 4 candidates drawn at random. The page adds records up as they arrive (the charts' ranges come from the running totals), so a saved file and a fresh run give identical charts. Each saved file is stored under the settings' key, built by the same code the page uses (`settings.js`), so when a visitor's settings match a preset, they get exactly what their browser would have computed.

`dist/meta.json` records the git commit, the engine file's checksum, the model version, the number of simulations, the default settings, and which file holds each preset.

## Files

- `settings.js`: the presets, the model defaults (the branch page's), and how a visitor's choices become engine settings and requests. Shared by the page and the precompute.
- `client.js`: the page's engine: saved replies first, then a pool of workers, one per spare processor core.
- `worker.js`: runs `stvsim.wasm` off the page's main thread.
- `precompute.mjs`: runs every public preset's requests on every core, in Node, and saves one file per preset in `dist/`, plus `dist/meta.json`.
- `build.sh`: runs the precompute.
- `sync-site.sh`: copies the engine, worker, saved results, and shared code into the website.

## Updating the website

After any change to the engine, the model defaults, or the presets:

```
sh tuner/build.sh                        # rebuild stvsim.wasm, if the engine changed
sh web/build.sh                          # about 3 minutes on 3 cores
sh web/sync-site.sh ../genevieverand.com
```

Then commit the copied files in the website. Don't edit the copies there.
