//! Simulates elections and measures reach and truncation: the shared core of `stvsim run`
//! and the model tuner (which runs it in a web page, on one thread).

use crate::count::{analyze, Options, Truncation};
use crate::model;
use crate::settings::Settings;
use serde_json::{json, Value};
use std::sync::atomic::{AtomicUsize, Ordering as AO};
use std::sync::Mutex;

pub const THRESH: [f64; 5] = [20.0, 10.0, 5.0, 2.0, 1.0];

pub fn engine_info() -> Value {
    json!({
        "version": env!("CARGO_PKG_VERSION"),
        "commit": env!("STVSIM_COMMIT"),
        "dirty": env!("STVSIM_DIRTY") == "true",
    })
}


#[derive(Default)]
struct Totals {
    reach_sum: Vec<f64>,
    reach_cuts: Vec<Vec<usize>>,
    reach_censored: Vec<usize>,
    changed: Vec<usize>,
    seats_changed: Vec<u64>,
    seats_changed_max: Vec<u32>,
    cutoffs: Vec<usize>,
    exhausted_votes: f64,
    exhausted_ballots: f64,
}

impl Totals {
    fn new(len: usize) -> Self {
        Totals {
            reach_sum: vec![0.0; len],
            reach_cuts: vec![Vec::new(); THRESH.len()],
            reach_censored: vec![0; THRESH.len()],
            changed: vec![0; len],
            seats_changed: vec![0; len],
            seats_changed_max: vec![0; len],
            ..Default::default()
        }
    }
    fn merge(&mut self, o: Totals) {
        for (a, b) in self.reach_sum.iter_mut().zip(o.reach_sum) {
            *a += b;
        }
        for (a, b) in self.reach_cuts.iter_mut().zip(o.reach_cuts) {
            a.extend(b);
        }
        for (a, b) in self.reach_censored.iter_mut().zip(o.reach_censored) {
            *a += b;
        }
        for (a, b) in self.changed.iter_mut().zip(o.changed) {
            *a += b;
        }
        for (a, b) in self.seats_changed.iter_mut().zip(o.seats_changed) {
            *a += b;
        }
        for (a, b) in self.seats_changed_max.iter_mut().zip(o.seats_changed_max) {
            *a = (*a).max(b);
        }
        self.cutoffs.extend(o.cutoffs);
        self.exhausted_votes += o.exhausted_votes;
        self.exhausted_ballots += o.exhausted_ballots;
    }
}

/// The rank where a curve first drops below t, or None if it never does.
fn first_below(curve: &[f64], t: f64) -> Option<usize> {
    curve.iter().position(|&x| x < t).map(|i| i + 1)
}

/// The smallest rank k such that the curve stays below t from k on.
fn stays_below(curve: &[f64], t: f64) -> usize {
    curve.iter().rposition(|&x| x >= t).map_or(1, |i| i + 2)
}

fn quantile(a: &mut [usize], p: f64) -> usize {
    a.sort_unstable();
    a[((a.len() - 1) as f64 * p).round() as usize]
}

fn round4(v: &[f64]) -> Vec<f64> {
    v.iter().map(|x| (x * 1e4).round() / 1e4).collect()
}

/// The random seed for simulated election `i` with `c` candidates and `seats` seats.
pub fn election_seed(seed: u64, c: usize, seats: usize, i: usize) -> u64 {
    seed ^ (c as u64).wrapping_mul(0x9E3779B97F4A7C15) ^ (seats as u64).wrapping_mul(0xC2B2AE3D27D4EB4F) ^ (i as u64).wrapping_mul(0x165667B19E3779F9)
}


/// Simulates `s.run.sims` elections with the given number of seats and summarizes them as one
/// line of results (see engine/README.md). `threads` above 1 splits the work across cores.
pub fn simulate(s: &Settings, seats: usize, threads: usize) -> Value {
    let c = s.election.candidates;
    let v = s.election.voters.unwrap();
    let len = s.election.ranks;
    let sims = s.run.sims;
    let opt = Options { rules: s.run.rules, surplus: s.run.surplus_order, lot_seed: 0 };
    let trunc = if s.run.truncation { Truncation::Winners } else { Truncation::Off };
    let show = if s.run.curve_ranks == 0 { len } else { s.run.curve_ranks.min(len) };
    let next = AtomicUsize::new(0);
    let acc = Mutex::new(Totals::new(len));
    let work = || {
                let mut local = Totals::new(len);
                loop {
                    let i = next.fetch_add(1, AO::Relaxed);
                    if i >= sims {
                        break;
                    }
                    let es = election_seed(s.run.seed, c, seats, i);
                    let b = model::generate(c, seats, v, len, &s.electorate, &s.ballot, &s.model, es).ballots;
                    let a = analyze(&b, seats, Options { lot_seed: es ^ 0x5851F42D4C957F2D, ..opt }, trunc);
                    for d in 0..len {
                        local.reach_sum[d] += a.reach_pct[d];
                    }
                    for (ti, &t) in THRESH.iter().enumerate() {
                        match first_below(&a.reach_pct, t) {
                            Some(r) => local.reach_cuts[ti].push(r),
                            None => {
                                local.reach_censored[ti] += 1;
                                local.reach_cuts[ti].push(len + 1)
                            }
                        }
                    }
                    if let Some(ch) = &a.changed {
                        for (k, &x) in ch.iter().enumerate() {
                            local.changed[k] += x as usize;
                        }
                        for (k, &x) in a.seats_changed.as_ref().unwrap().iter().enumerate() {
                            local.seats_changed[k] += x as u64;
                            local.seats_changed_max[k] = local.seats_changed_max[k].max(x);
                        }
                        local.cutoffs.push(a.cutoff_rank.unwrap());
                    }
                    local.exhausted_votes += a.exhausted_votes_pct;
                    local.exhausted_ballots += a.exhausted_ballots_pct;
                }
                acc.lock().unwrap().merge(local);
    };
    if threads <= 1 {
        work();
    } else {
        std::thread::scope(|sc| {
            for _ in 0..threads {
                sc.spawn(work);
            }
        });
    }
    let mut t = acc.into_inner().unwrap();
    let n = sims as f64;
    let avg: Vec<f64> = t.reach_sum.iter().map(|x| x / n).collect();
    let mut reach = serde_json::Map::new();
    for (ti, &th) in THRESH.iter().enumerate() {
        let cuts = &mut t.reach_cuts[ti];
        reach.insert(
            format!("t{}", th as u32),
            json!({
                "avg": first_below(&avg, th),
                "p10": quantile(cuts, 0.1),
                "p50": quantile(cuts, 0.5),
                "p90": quantile(cuts, 0.9),
                "censored": t.reach_censored[ti],
            }),
        );
    }
    reach.insert("curve".into(), json!(round4(&avg[..show])));
    let mut line = json!({
        "engine": engine_info(),
        "model_version": s.model.version,
        "settings": s,
        "seats": seats,
        "reach": reach,
        "exhaustion": {
            "votes_pct_mean": t.exhausted_votes / n,
            "ballots_pct_mean": t.exhausted_ballots / n,
        },
    });
    if s.run.truncation {
        let p: Vec<f64> = t.changed.iter().map(|&x| x as f64 / n).collect();
        let mut by_threshold = serde_json::Map::new();
        for &th in THRESH.iter() {
            by_threshold.insert(format!("t{}", th as u32), json!(stays_below(&p, th / 100.0)));
        }
        let mut counts = vec![0usize; len];
        for &k in t.cutoffs.iter() {
            counts[k - 1] += 1;
        }
        let mean = t.cutoffs.iter().sum::<usize>() as f64 / n;
        let mean_seats: Vec<f64> = t.seats_changed.iter().map(|&x| x as f64 / n).collect();
        let share: Vec<f64> = mean_seats.iter().map(|x| x / seats as f64).collect();
        line["truncation"] = json!({
            "p_changed": round4(&p[..show]),
            "seats_changed": {
                "mean": round4(&mean_seats[..show]),
                "share_mean": round4(&share[..show]),
                "max": t.seats_changed_max[..show],
            },
            "threshold_rank": by_threshold,
            "cutoff_rank": {
                "mean": (mean * 100.0).round() / 100.0,
                "p10": quantile(&mut t.cutoffs, 0.1),
                "p50": quantile(&mut t.cutoffs, 0.5),
                "p90": quantile(&mut t.cutoffs, 0.9),
                "max": t.cutoffs.iter().max(),
                "counts": counts[..show],
            },
        });
    }
    line
}
