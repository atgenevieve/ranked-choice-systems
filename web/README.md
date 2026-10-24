# Public simulator

The engine and saved results behind the ranked choice simulator on Genevieve's website, at genevieverand.com/projects/ranked-choice-simulator (the page itself lives in the website's repository, `atgenevieve/genevieverand.com`).

A visitor picks an election (candidates, seats, and expected voters) and a few model settings. The page shows how many ranks affect who wins, how many winners change, and what each ballot position is worth to a candidate, the same three charts as the tuner's branch page.

## Saved results

Simulating one election 1,000 times takes about a minute and a half on one processor core. So the results for the preset elections with the default settings are worked out once, from a fixed seed, and saved in `dist/defaults.json`. The page shows saved results as soon as it loads, without downloading the engine. Only when a visitor changes a setting does the page download the engine (`stvsim.wasm`, the same file as the tuner's) and run it in their browser.

Every saved result is the engine's reply to one request, stored under the request's text. The page builds its requests with the same code (`settings.js`), so when a visitor's settings match a saved request, they get exactly the reply their browser would have computed. If they change a setting and change it back, the saved result comes back too.

`defaults.json` also records the git commit, the engine file's checksum, the model version, the seed, and the default settings it was made from.

## Files

- `settings.js`: the presets, the model defaults (the branch page's), and how a visitor's choices become engine settings and requests. Shared by the page and the precompute.
- `client.js`: the page's engine: saved replies first, then a pool of workers, one per spare processor core.
- `worker.js`: runs `stvsim.wasm` off the page's main thread.
- `precompute.mjs`: runs every preset's requests on every core, in Node, and saves `dist/defaults.json`.
- `build.sh`: runs the precompute.
- `sync-site.sh`: copies the engine, worker, saved results, and shared code into the website.

## Updating the website

After any change to the engine, the model defaults, or the presets:

```
sh tuner/build.sh                        # rebuild stvsim.wasm, if the engine changed
sh web/build.sh                          # about 4 minutes on 4 cores
sh web/sync-site.sh ../genevieverand.com
```

Then commit the copied files in the website. Don't edit the copies there.
