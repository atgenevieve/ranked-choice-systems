#!/bin/sh
# Rebuilds the tuner's engine (stvsim.wasm) and real-election reference (reference.json).
# Run from the repository root after any change to engine/src or the real data:
#     sh tuner/build.sh
# Needs Rust's WebAssembly target once: rustup target add wasm32-unknown-unknown
set -e
cd "$(dirname "$0")/.."
(cd engine && cargo build --release --lib --target wasm32-unknown-unknown)
cp engine/target/wasm32-unknown-unknown/release/stvsim.wasm tuner/stvsim.wasm
python3 -I data/tuner_reference.py tuner/reference.json
python3 -I data/check_stats.py
