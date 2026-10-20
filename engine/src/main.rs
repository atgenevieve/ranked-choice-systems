//! Simulator for "how many ranks matter" in ranked voting.
//!
//! `stvsim run <settings.toml>` simulates elections and measures reach and truncation.
//! `stvsim count <file.ballots>...` counts real or test ballots.
//! See `engine/README.md`.

mod ballots;
mod count;
mod model;
mod rng;
mod settings;

use count::{analyze, Options, Rules, SurplusOrder, Truncation};
use serde_json::{json, Value};
use std::io::Write;
use std::sync::atomic::{AtomicUsize, Ordering as AO};
use std::sync::Mutex;

const THRESH: [f64; 5] = [20.0, 10.0, 5.0, 2.0, 1.0];

fn engine_info() -> Value {
    json!({
        "version": env!("CARGO_PKG_VERSION"),
        "commit": env!("STVSIM_COMMIT"),
        "dirty": env!("STVSIM_DIRTY") == "true",
    })
}

fn usage() -> ! {
    eprintln!(
        "usage:\n  stvsim run <settings.toml>\n  stvsim count [--rules scottish|reference] [--surplus-order largest|election] [--seed N] [--no-truncation] <file.ballots>...\n  stvsim version"
    );
    std::process::exit(2)
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("run") if args.len() == 2 => run(&args[1]),
        Some("count") => count_files(&args[1..]),
        Some("version") => println!("{}", engine_info()),
        _ => usage(),
    }
}

// ---------------------------------------------------------------- count real ballots

fn count_files(args: &[String]) {
    let mut opt = Options { rules: Rules::Scottish, surplus: SurplusOrder::Largest, lot_seed: 1 };
    let mut trunc = Truncation::Winners;
    let mut files = Vec::new();
    let mut i = 0;
    while i < args.len() {
        let val = || args.get(i + 1).map(String::as_str).unwrap_or_else(|| usage());
        match args[i].as_str() {
            "--rules" => {
                opt.rules = match val() {
                    "scottish" => Rules::Scottish,
                    "reference" => Rules::Reference,
                    _ => usage(),
                };
                i += 1;
            }
            "--surplus-order" => {
                opt.surplus = match val() {
                    "largest" => SurplusOrder::Largest,
                    "election" => SurplusOrder::Election,
                    _ => usage(),
                };
                i += 1;
            }
            "--seed" => {
                opt.lot_seed = val().parse().unwrap_or_else(|_| usage());
                i += 1;
            }
            "--no-truncation" => trunc = Truncation::Off,
            f if !f.starts_with("--") => files.push(f.to_string()),
            _ => usage(),
        }
        i += 1;
    }
    if files.is_empty() {
        usage();
    }
    let stdout = std::io::stdout();
    let mut out = stdout.lock();
    let mut failed = false;
    for f in files {
        let (bal, seats) = match ballots::read_file(&f) {
            Ok(x) => x,
            Err(e) => {
                eprintln!("{e}");
                failed = true;
                continue;
            }
        };
        let a = analyze(&bal, seats, opt, trunc);
        let official = official_winners(&f);
        let matches = official.as_ref().map(|o| {
            let mut o = o.clone();
            o.sort_unstable();
            o == a.winners
        });
        let mut line = json!({
            "file": f,
            "engine": engine_info(),
            "rules": opt.rules,
            "surplus_order": opt.surplus,
            "lot_seed": opt.lot_seed,
            "candidates": bal.c,
            "seats": seats,
            "voters": bal.voters(),
            "official_winners": official,
            "matches_official": matches,
        });
        if let (Value::Object(m), Value::Object(r)) = (&mut line, serde_json::to_value(&a).unwrap()) {
            m.extend(r);
        }
        writeln!(out, "{line}").unwrap();
    }
    if failed {
        std::process::exit(1);
    }
}

/// Reads `official_winners` from the metadata file next to a `.ballots` file, if there is one.
fn official_winners(path: &str) -> Option<Vec<u32>> {
    let meta = std::path::Path::new(path).with_extension("json");
    let v: Value = serde_json::from_str(&std::fs::read_to_string(meta).ok()?).ok()?;
    serde_json::from_value(v.get("official_winners")?.clone()).ok()
}

// ---------------------------------------------------------------- simulate

#[derive(Default)]
struct Totals {
    reach_sum: Vec<f64>,
    reach_cuts: Vec<Vec<usize>>,
    reach_censored: Vec<usize>,
    changed: Vec<usize>,
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

fn run(path: &str) {
    let s = settings::Settings::load(path).unwrap_or_else(|e| {
        eprintln!("{e}");
        std::process::exit(1)
    });
    let c = s.election.candidates;
    let v = s.election.voters.unwrap();
    let len = s.election.ranks;
    let sims = s.run.sims;
    let opt = Options { rules: s.run.rules, surplus: s.run.surplus_order, lot_seed: 0 };
    let trunc = if s.run.truncation { Truncation::Changes } else { Truncation::Off };
    let show = if s.run.curve_ranks == 0 { len } else { s.run.curve_ranks.min(len) };

    for &seats in s.election.seats.iter() {
        if seats == 0 || seats >= c {
            eprintln!("skipping {seats} seats: must be between 1 and candidates - 1");
            continue;
        }
        let t0 = std::time::Instant::now();
        let next = AtomicUsize::new(0);
        let acc = Mutex::new(Totals::new(len));
        std::thread::scope(|sc| {
            for _ in 0..s.run.threads.max(1) {
                sc.spawn(|| {
                    let mut local = Totals::new(len);
                    loop {
                        let i = next.fetch_add(1, AO::Relaxed);
                        if i >= sims {
                            break;
                        }
                        let es = s.run.seed
                            ^ (c as u64).wrapping_mul(0x9E3779B97F4A7C15)
                            ^ (seats as u64).wrapping_mul(0xC2B2AE3D27D4EB4F)
                            ^ (i as u64).wrapping_mul(0x165667B19E3779F9);
                        let b = model::slate_electorate(c, v, len, &s.model, es);
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
                            local.cutoffs.push(a.cutoff_rank.unwrap());
                        }
                        local.exhausted_votes += a.exhausted_votes_pct;
                        local.exhausted_ballots += a.exhausted_ballots_pct;
                    }
                    acc.lock().unwrap().merge(local);
                });
            }
        });
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
            "model_version": model::MODEL_VERSION,
            "settings": s,
            "seats": seats,
            "secs": (t0.elapsed().as_secs_f64() * 100.0).round() / 100.0,
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
            line["truncation"] = json!({
                "p_changed": round4(&p[..show]),
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
        println!("{line}");
        std::io::stdout().flush().ok();
    }
}
