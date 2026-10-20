//! Settings files for simulation runs. See `engine/settings/` for examples.

use crate::count::{Rules, SurplusOrder};
use crate::model::SlateParams;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Settings {
    pub run: Run,
    pub election: Election,
    #[serde(default)]
    pub model: SlateParams,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Run {
    /// A short name for the run.
    pub name: String,
    /// Starting value for random numbers.
    #[serde(default = "one")]
    pub seed: u64,
    /// Simulated elections per seat count.
    pub sims: usize,
    /// Processor cores to use. 0 means all.
    #[serde(default)]
    pub threads: usize,
    #[serde(default)]
    pub rules: Rules,
    #[serde(default)]
    pub surplus_order: SurplusOrder,
    /// Whether to measure truncation as well as reach.
    #[serde(default = "yes")]
    pub truncation: bool,
    /// How many ranks of the average reach curve and truncation curve to write. 0 means all.
    #[serde(default)]
    pub curve_ranks: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Election {
    pub candidates: usize,
    /// Seat counts to test.
    pub seats: Vec<usize>,
    /// Ballots per election. Default: 10 per candidate, at least 1,000.
    pub voters: Option<usize>,
    /// Ballot length cap.
    #[serde(default = "hundred")]
    pub ranks: usize,
}

fn one() -> u64 {
    1
}
fn yes() -> bool {
    true
}
fn hundred() -> usize {
    100
}

impl Settings {
    pub fn load(path: &str) -> Result<Settings, String> {
        let text = std::fs::read_to_string(path).map_err(|e| format!("{path}: {e}"))?;
        let mut s: Settings = toml::from_str(&text).map_err(|e| format!("{path}: {e}"))?;
        s.election.voters.get_or_insert((10 * s.election.candidates).max(1000));
        s.election.ranks = s.election.ranks.min(s.election.candidates);
        if s.run.threads == 0 {
            s.run.threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1);
        }
        Ok(s)
    }
}
