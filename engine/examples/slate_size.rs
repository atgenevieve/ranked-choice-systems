//! Slate-size experiment: how many seats a faction wins as it runs more candidates, under
//! Scottish STV, Borda, and approval. An illustration of how each counting method reacts to
//! the number of candidates, not a finding about real elections. The voters here are simpler
//! than the project's model (see the page this feeds): two factions, a fixed electorate, and
//! only faction A's slate size changes.
//!
//! Run: cargo run --release --example slate_size -- [seats voters sims] > slate_size.jsonl
//! (defaults 5 seats, 1,000 voters, 1,000 elections per point). Slate B runs as many candidates
//! as there are seats; slate A runs 1/5 to 12/5 of that; short ballots rank as many as the seats.

use stvsim::ballots::{Ballots, NONE};
use stvsim::count::{analyze, Options, Quota, Rules, SurplusOrder, System, Truncation};
use stvsim::rng::Rng;

const SEED: u64 = 1;
const SHARE_A: f64 = 0.4;
/// Spread of candidate popularity (log scale), so voters roughly agree on who's strongest.
const POPULARITY_SPREAD: f64 = 0.5;

/// One election: faction A runs `na` candidates (numbered first), faction B runs `nb`.
/// Each voter fills ranks one at a time, picking among unranked candidates in proportion to
/// popularity × (`own_slate` if own faction), where each faction's popularities add up to 1. `ranks` = 0 means rank every candidate.
fn election(na: usize, nb: usize, voters: usize, ranks: usize, own_slate: f64, seed: u64) -> Ballots {
    let mut r = Rng::new(seed);
    let c = na + nb;
    let mut pop: Vec<f64> = (0..c).map(|_| (POPULARITY_SPREAD * r.gauss()).exp()).collect();
    // A faction's pull doesn't grow with the number of candidates it runs: its candidates
    // share it, the way similar candidates split a faction's support.
    let (sa, sb): (f64, f64) = (pop[..na].iter().sum(), pop[na..].iter().sum());
    for (x, p) in pop.iter_mut().enumerate() {
        *p /= if x < na { sa } else { sb };
    }
    let len = if ranks == 0 { c } else { ranks.min(c) };
    let mut prefs = vec![NONE; voters * len];
    let mut w = vec![0.0; c];
    for v in 0..voters {
        let in_a = (v as f64) < SHARE_A * voters as f64;
        for (x, wx) in w.iter_mut().enumerate() {
            let own = (x < na) == in_a;
            *wx = pop[x] * if own { own_slate } else { 1.0 };
        }
        let mut total: f64 = w.iter().sum();
        for k in 0..len {
            let mut t = r.f64() * total;
            let mut pick = c - 1;
            for (x, &wx) in w.iter().enumerate() {
                if wx > 0.0 && t < wx {
                    pick = x;
                    break;
                }
                t -= wx;
            }
            prefs[v * len + k] = pick as u32;
            total -= w[pick];
            w[pick] = 0.0;
        }
    }
    Ballots { c, len, prefs, mult: None }
}

fn main() {
    let arg = |i: usize, d: usize| std::env::args().nth(i).map_or(d, |a| a.parse().expect("whole number"));
    let (seats, voters, sims) = (arg(1, 5), arg(2, 1000), arg(3, 1000));
    let systems = [("scottish_stv", System::ScottishStv), ("borda", System::Borda), ("approval", System::Approval)];
    let threads = std::thread::available_parallelism().map_or(1, |n| n.get());
    // How much more likely a voter is to pick their own faction's candidate at each rank:
    // the model's "loose" (4) and "tight" (100) slate strengths.
    for &(slates, own_slate) in &[("loose", 4.0), ("tight", 100.0)] {
        for &(ballot, ranks) in &[("up_to_seats", seats), ("all", 0usize)] {
            for step in 1..=12 {
                let na = seats * step / 5;
                let next = std::sync::atomic::AtomicUsize::new(0);
                let mut seats_a: Vec<Vec<usize>> = vec![vec![0; sims]; systems.len()];
                let found = std::sync::Mutex::new(Vec::new());
                std::thread::scope(|sc| {
                    for _ in 0..threads {
                        sc.spawn(|| loop {
                            let sim = next.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                            if sim >= sims {
                                break;
                            }
                            let es = SEED.wrapping_mul(1_000_003) ^ ((na as u64) << 32) ^ sim as u64 ^ ((ranks as u64) << 48);
                            let b = election(na, seats, voters, ranks, own_slate, es);
                            let won: Vec<usize> = systems
                                .iter()
                                .map(|&(_, sys)| {
                                    let opt = Options { system: sys, rules: Rules::Scottish, surplus: SurplusOrder::Largest, quota: Quota::Whole, lot_seed: es ^ 0x5851F42D4C957F2D };
                                    analyze(&b, seats, opt, Truncation::Off).winners.iter().filter(|&&x| (x as usize) < na).count()
                                })
                                .collect();
                            found.lock().unwrap().push((sim, won));
                        });
                    }
                });
                for (sim, won) in found.into_inner().unwrap() {
                    for (i, w) in won.into_iter().enumerate() {
                        seats_a[i][sim] = w;
                    }
                }
                for (i, &(name, _)) in systems.iter().enumerate() {
                    let mut dist = vec![0usize; seats + 1];
                    for &s in &seats_a[i] {
                        dist[s] += 1;
                    }
                    let mean = seats_a[i].iter().sum::<usize>() as f64 / sims as f64;
                    println!(
                        "{{\"seats\":{seats},\"voters\":{voters},\"slates\":\"{slates}\",\"ballot\":\"{ballot}\",\"system\":\"{name}\",\"slate_a\":{na},\"mean_seats_a\":{mean:.3},\"seats_a_dist\":{dist:?}}}"
                    );
                }
            }
        }
    }
}
