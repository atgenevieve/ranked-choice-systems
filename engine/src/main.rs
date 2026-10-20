//! Simulator for "how many ranks matter" in ranked voting.
//!
//! `stvsim run <settings.toml>` simulates elections and measures reach and truncation.
//! `stvsim count <file.ballots>...` counts real or test ballots.
//! `stvsim generate <settings.toml> <folder>` writes simulated elections as ballot files.
//! `stvsim stats <file.ballots>...` prints the statistics the model tuner compares.
//! See `engine/README.md`.

use serde_json::{json, Value};
use std::io::Write;
use stvsim::count::{analyze, Options, Quota, Rules, SurplusOrder, Truncation};
use stvsim::sim::{election_seed, engine_info, simulate};
use stvsim::{ballots, model, settings};

fn usage() -> ! {
    eprintln!(
        "usage:\n  stvsim run <settings.toml>\n  stvsim generate <settings.toml> <folder>\n  stvsim stats [--merge-last] <file.ballots>...\n  stvsim count [--rules scottish|reference] [--surplus-order largest|election] [--quota whole|exact] [--seed N] [--no-truncation] <file.ballots>...\n  stvsim version"
    );
    std::process::exit(2)
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("run") if args.len() == 2 => run(&args[1]),
        Some("count") => count_files(&args[1..]),
        Some("generate") if args.len() == 3 => generate(&args[1], &args[2]),
        Some("stats") if args.len() >= 2 => stats_files(&args[1..]),
        Some("version") => println!("{}", engine_info()),
        _ => usage(),
    }
}

// ---------------------------------------------------------------- count real ballots

fn count_files(args: &[String]) {
    let mut opt = Options { rules: Rules::Scottish, surplus: SurplusOrder::Largest, quota: Quota::Whole, lot_seed: 1 };
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
            "--quota" => {
                opt.quota = match val() {
                    "whole" => Quota::Whole,
                    "exact" => Quota::Exact,
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

/// Prints the tuner's statistics (`stats.rs`) for each ballot file, using the parties in its
/// metadata file as slates. With `--merge-last`, ranking all but one counts as ranking all.
fn stats_files(args: &[String]) {
    let merge = args.iter().any(|a| a == "--merge-last");
    for f in args.iter().filter(|a| !a.starts_with("--")) {
        let (bal, seats) = ballots::read_file(f).unwrap_or_else(|e| {
            eprintln!("{e}");
            std::process::exit(1)
        });
        let meta: Value = std::fs::read_to_string(std::path::Path::new(f).with_extension("json"))
            .ok()
            .and_then(|t| serde_json::from_str(&t).ok())
            .unwrap_or(Value::Null);
        let mut labels: Vec<String> = Vec::new();
        let slate_of: Vec<Option<usize>> = (0..bal.c)
            .map(|k| {
                let p = meta["parties"][k].as_str()?;
                if ["", "Ind", "Independent", "None", "Non-partisan"].contains(&p) {
                    return None;
                }
                Some(labels.iter().position(|l| l == p).unwrap_or_else(|| {
                    labels.push(p.to_string());
                    labels.len() - 1
                }))
            })
            .collect();
        let max = meta["max_ranks"].as_u64().map(|m| m as usize);
        let known = meta["parties"].is_array();
        let st = stvsim::stats::measure(&bal, seats, known.then_some(&slate_of[..]), max, merge);
        println!("{}", json!({ "file": f, "stats": st }));
    }
}

/// Reads `official_winners` from the metadata file next to a `.ballots` file, if there is one.
fn official_winners(path: &str) -> Option<Vec<u32>> {
    let meta = std::path::Path::new(path).with_extension("json");
    let v: Value = serde_json::from_str(&std::fs::read_to_string(meta).ok()?).ok()?;
    serde_json::from_value(v.get("official_winners")?.clone()).ok()
}

// ---------------------------------------------------------------- simulate

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
    for &seats in s.election.seats.iter() {
        if seats == 0 || seats >= c {
            eprintln!("skipping {seats} seats: must be between 1 and candidates - 1");
            continue;
        }
        let t0 = std::time::Instant::now();
        let mut line = simulate(&s, seats, s.run.threads.max(1));
        line["secs"] = json!((t0.elapsed().as_secs_f64() * 100.0).round() / 100.0);
        println!("{line}");
        std::io::stdout().flush().ok();
    }
}
