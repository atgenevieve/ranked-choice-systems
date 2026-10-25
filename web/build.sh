#!/bin/sh
# Precomputes the simulator's preset elections (web/dist/) from the engine the tuner runs
# (tuner/stvsim.wasm; rebuild it first with tuner/build.sh after any engine change).
#     sh web/build.sh
set -e
cd "$(dirname "$0")/.."
rm -rf web/dist
node web/precompute.mjs tuner/stvsim.wasm tuner/reference.json web/dist
