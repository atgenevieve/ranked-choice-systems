//! Simulator for "how many ranks matter" in ranked voting.
//!
//! `stvsim run <settings.toml>` simulates elections and measures reach and truncation.
//! `stvsim count <file.ballots>...` counts real or test ballots.
//! `stvsim generate <settings.toml> <folder>` writes simulated elections as ballot files.
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
        "usage:\n  stvsim run <settings.toml>\n  stvsim generate <settings.toml> <folder>\n  stvsim count [--rules scottish|reference] [--surplus-order largest|election] [--seed N] [--no-truncation] <file.ballots>...\n  stvsim version"
    );
    std::process::exit(2)
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("run") if args.len() == 2 => run(&args[1]),
        Some("count") => count_files(&args[1..]),
        Some("generate") if args.len() == 3 => generate(&args[1], &args[2]),
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
fn election_seed(seed: u64, c: usize, seats: usize, i: usize) -> u64 {
    seed ^ (c as u64).wrapping_mul(0x9E3779B97F4A7C15) ^ (seats as u64).wrapping_mul(0xC2B2AE3D27D4EB4F) ^ (i as u64).wrapping_mul(0x165667B19E3779F9)
}

fn load_settings(path: &str) -> settings::Settings {
    settings::Settings::load(path).unwrap_or_else(|e| {
        eprintln!("{e}");
        std::process::exit(1)
    })
}

// ---------------------------------------------------------------- write simulated elections

/// Writes each simulated election (every seat count, `run.sims` each) to `folder` as a
/// `.ballots` file and a `.json` metadata file, in the format of docs/ballot-format.md, so the
/// same scripts can measure simulated and real elections. Slates are written as parties
/// ("Slate 1", ...), and candidates in no slate get `null`.
fn generate(path: &str, folder: &str) {
    let s = load_settings(path);
    let c = s.election.candidates;
    let v = s.election.voters.unwrap();
    std::fs::create_dir_all(folder).unwrap_or_else(|e| {
        eprintln!("{folder}: {e}");
        std::process::exit(1)
    });
    for &seats in s.election.seats.iter() {
        if seats == 0 || seats > c {
            eprintln!("skipping {seats} seats: must be between 1 and the number of candidates");
            continue;
        }
        for i in 0..s.run.sims {
            let es = election_seed(s.run.seed, c, seats, i);
            let g = model::generate(c, seats, v, s.election.ranks, &s.electorate, &s.ballot, &s.model, es);
            // Count identical ballots once, in first-seen order, so files stay small.
            let mut counts: std::collections::HashMap<&[u32], usize> = std::collections::HashMap::new();
            let mut order: Vec<&[u32]> = Vec::new();
            for row in 0..g.ballots.rows() {
                let b = g.ballots.row(row);
                let b = &b[..b.iter().position(|&x| x == ballots::NONE).unwrap_or(b.len())];
                let n = counts.entry(b).or_insert(0);
                if *n == 0 {
                    order.push(b);
                }
                *n += 1;
            }
            let mut text = format!("candidates {c}\nseats {seats}\n");
            for b in order {
                text.push_str(&counts[b].to_string());
                for x in b {
                    text.push(' ');
                    text.push_str(&x.to_string());
                }
                text.push('\n');
            }
            let stem = format!("{folder}/{}-c{c}-s{seats}-{i:04}", s.run.name);
            let meta = json!({
                "source": "simulated",
                "election": format!("{} (simulated), {c} candidates, {seats} seats, number {i}", s.run.name),
                "system": "scottish-stv",
                "candidates": (0..c).map(|k| format!("Candidate {}", k + 1)).collect::<Vec<_>>(),
                "parties": g.slate_of.iter().map(|x| x.map(|k| format!("Slate {}", k + 1))).collect::<Vec<_>>(),
                "long_shots": g.long_shot,
                "official_winners": Value::Null,
                "max_ranks": s.ballot.max_ranks(seats),
                "min_ranks_instructed": s.ballot.min_ranks(seats),
                "electorate": s.electorate.kind,
                "seed": es,
                "engine": engine_info(),
                "model_version": s.model.version,
                "settings": s,
            });
            let write = |p: String, t: String| std::fs::write(&p, t).unwrap_or_else(|e| {
                eprintln!("{p}: {e}");
                std::process::exit(1)
            });
            write(format!("{stem}.ballots"), text);
            write(format!("{stem}.json"), serde_json::to_string_pretty(&meta).unwrap() + "\n");
        }
    }
}

fn run(path: &str) {
    let s = load_settings(path);
    let c = s.election.candidates;
    let v = s.election.voters.unwrap();
    let len = s.election.ranks;
    let sims = s.run.sims;
    let opt = Options { rules: s.run.rules, surplus: s.run.surplus_order, lot_seed: 0 };
    let trunc = if s.run.truncation { Truncation::Winners } else { Truncation::Off };
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
            "model_version": s.model.version,
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
        println!("{line}");
        std::io::stdout().flush().ok();
    }
}
