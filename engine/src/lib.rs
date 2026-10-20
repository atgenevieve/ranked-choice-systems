//! The rank-depth simulation engine as a library: the voter model, the Scottish STV count, and
//! the reach and truncation measures. `src/main.rs` is the command-line program, and
//! `src/wasm.rs` exposes the same code to the model tuner's web page.

pub mod ballots;
pub mod count;
pub mod model;
pub mod rng;
pub mod settings;
pub mod sim;
pub mod stats;
#[cfg(target_arch = "wasm32")]
mod wasm;
