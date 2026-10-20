# Model evidence page

The published page for the milestone 3 model review: one tab per decision about the voter model, with the evidence from real ballots. Published at https://claude.ai/artifact/TpQZK1zPMreHsvqn7dkFX9.

## Files

- `index.html`: the page shell and tab bar.
- `style.css`, `charts.js`: shared styles and chart code (scatter plots, bars, histograms, range strips, share grids). Charts use linear scales only.
- `app.js`: switches tabs, loads each tab's data file.
- `sections/`: one script per tab, plus `decisions.js`, the decision text shown on the overview and at the top of each tab. Keep `decisions.js` in step with `docs/model-review.md`.
- `data/`: one data file per tab, built from the real-data statistics.

## Rebuilding the data

From the repository root, after `data/calibration.py` has run for every source:

```
python3 -I data/ballot_length_charts.py evidence/data/ballot-length.json
python3 -I data/evidence_data.py evidence/data
```

`docs/large-elections.md` supplies the reference elections on the election-size tab (Metro DC DSA, Western Australia).
