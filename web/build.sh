#!/bin/sh
# Precomputes the simulator's default results (web/dist/defaults.json) from the engine the tuner
# runs (tuner/stvsim.wasm; rebuild it first with tuner/build.sh after any engine change).
#     sh web/build.sh
set -e
cd "$(dirname "$0")/.."
mkdir -p web/dist
node web/precompute.mjs tuner/stvsim.wasm tuner/reference.json web/dist/defaults.json
