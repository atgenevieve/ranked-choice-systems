#!/bin/sh
# Copies the simulator's engine, precomputed results, and shared code into the website
# (atgenevieve/genevieverand.com), where /projects/ranked-choice-simulator uses them. The engine and results go in
# /assets/ranked-choice-simulator/: a folder named like the page would clash with it.
#     sh web/sync-site.sh ../genevieverand.com
# Run web/build.sh first. The copies in the website aren't edited there: change them here.
set -e
cd "$(dirname "$0")/.."
site="${1:?usage: sh web/sync-site.sh <website folder>}"
pub="$site/public/assets/ranked-choice-simulator"
lib="$site/src/lib/ranked-choice"
mkdir -p "$pub" "$lib"
cp tuner/stvsim.wasm web/worker.js web/dist/defaults.json "$pub/"
cp web/settings.js web/client.js "$lib/"
echo "Copied to $pub and $lib"
