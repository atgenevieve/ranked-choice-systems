# Model fits

Settings of the voter model (model version 0.2, `docs/model-spec.md`) fitted to real ballots in milestone 4. The engine's defaults (`engine/src/model.rs`) come from these files.

- `ballot-length.json`: natural ballot length for public voters (1,100 Scottish elections) and organization members (87 union and society elections), and the pull toward a ballot's limit or instruction. Made by `python3 -I data/fit_length.py data/fits/ballot-length.json`.
- `popularity-tuning.json`: a grid search of popularity spread and long-shot share for each type of election, scoring the top candidate against the quota and the last candidate against an even split. Made by `python3 -I data/model_check.py data/fits/popularity-tuning.json --sample 120 --tune-popularity`. The defaults follow the approved rule instead of the search's combined score: the spread matches the quota first, and long shots are added only where the last candidate would otherwise be too strong (see `docs/model-spec.md`, assumption 3).
- `model-check.json`: simulated twins of real elections against the real ones, with the engine's defaults. Made by `python3 -I data/model_check.py data/fits/model-check.json --sample 200`. Explained in `docs/model-check.md`.

Each fit is repeatable: the scripts use fixed random seeds, and the twins' seeds come from the real files' names.
- `slate-curves.json`: what the slate settings produce on twins of Scottish wards: slate loyalty (clustering above popularity) for each own-slate strength, and evenness for each spread to other slates. The tuner uses these to show both settings in the units real elections are measured in. Made by `python3 -I data/model_check.py data/fits/slate-curves.json --sample 150 --curves`.
