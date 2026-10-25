//! Simulates elections and measures reach and truncation: the shared core of `stvsim run`
//! and the model tuner (which runs it in a web page, on one thread).

use crate::count::{analyze, Options, Truncation};
use crate::model;
use crate::rng::Rng;
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
    /// Rank worth: for each rank k, the winners that rank decides in one election, d_k =
    /// (winners wrong when ballots stop one rank earlier) − (winners wrong when they stop at k),
    /// with rank 1 deciding seats − (winners wrong at rank 1). Sums, sums of squares, and sums
    /// of d_k × d_(k+1), for the mean, spread, and ratio to the next rank.
    worth_sum: Vec<f64>,
    worth_sq: Vec<f64>,
    worth_next: Vec<f64>,
    cutoffs: Vec<usize>,
    voters: Vec<usize>,
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
            worth_sum: vec![0.0; len],
            worth_sq: vec![0.0; len],
            worth_next: vec![0.0; len],
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
        for (a, b) in self.worth_sum.iter_mut().zip(o.worth_sum) {
            *a += b;
        }
        for (a, b) in self.worth_sq.iter_mut().zip(o.worth_sq) {
            *a += b;
        }
        for (a, b) in self.worth_next.iter_mut().zip(o.worth_next) {
            *a += b;
        }
        for (a, b) in self.seats_changed_max.iter_mut().zip(o.seats_changed_max) {
            *a = (*a).max(b);
        }
        self.cutoffs.extend(o.cutoffs);
        self.voters.extend(o.voters);
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


/// The number of voters in one simulated election: `v` when `spread` is 0; otherwise drawn
/// from a bell curve centered on `v` with standard deviation `spread` × `v`, cut off at 3
/// standard deviations, and at least 2.
pub fn draw_voters(v: usize, spread: f64, es: u64) -> usize {
    if spread <= 0.0 {
        return v;
    }
    let g = Rng::new(es ^ 0x7475_726E_6F75_7421).gauss().clamp(-3.0, 3.0);
    ((v as f64 * (1.0 + spread * g)).round() as usize).max(2)
}

/// Simulates `s.run.sims` elections with the given number of seats and summarizes them as one
/// line of results (see engine/README.md). `threads` above 1 splits the work across cores.
pub fn simulate(s: &Settings, seats: usize, threads: usize) -> Value {
    let c = s.election.candidates;
    let v = s.election.voters.unwrap();
    let spread = s.election.turnout_spread.unwrap_or(0.0);
    let len = s.election.ranks;
    let sims = s.run.sims;
    let opt = Options { rules: s.run.rules, surplus: s.run.surplus_order, quota: s.run.quota, lot_seed: 0 };
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
                    let voters = draw_voters(v, spread, es);
                    local.voters.push(voters);
                    let b = model::generate(c, seats, voters, len, &s.electorate, &s.ballot, &s.model, es).ballots;
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
                        let sc = a.seats_changed.as_ref().unwrap();
                        for (k, &x) in sc.iter().enumerate() {
                            local.seats_changed[k] += x as u64;
                            local.seats_changed_max[k] = local.seats_changed_max[k].max(x);
                        }
                        let worth = |k: usize| if k == 0 { seats as f64 - sc[0] as f64 } else { sc[k - 1] as f64 - sc[k] as f64 };
                        for k in 0..sc.len() {
                            let d = worth(k);
                            local.worth_sum[k] += d;
                            local.worth_sq[k] += d * d;
                            if k + 1 < sc.len() {
                                local.worth_next[k] += d * worth(k + 1);
                            }
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
        "voters": {
            "mean": (t.voters.iter().sum::<usize>() as f64 / n * 10.0).round() / 10.0,
            "min": t.voters.iter().min(),
            "p10": quantile(&mut t.voters, 0.1),
            "p50": quantile(&mut t.voters, 0.5),
            "p90": quantile(&mut t.voters, 0.9),
            "max": t.voters.iter().max(),
        },
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
            "rank_worth": {
                "mean": round4(&t.worth_sum.iter().map(|x| x / n).collect::<Vec<_>>()[..show]),
                "sd": round4(&t.worth_sum.iter().zip(&t.worth_sq).map(|(s, q)| (q / n - (s / n).powi(2)).max(0.0).sqrt()).collect::<Vec<_>>()[..show]),
                "cov_next": round4(&(0..len).map(|k| if k + 1 < len { t.worth_next[k] / n - t.worth_sum[k] / n * t.worth_sum[k + 1] / n } else { 0.0 }).collect::<Vec<_>>()[..show]),
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

#[cfg(test)]
mod tests {
    use super::draw_voters;

    #[test]
    fn position_worth_is_repeatable_and_sensible() {
        let mut s: crate::settings::Settings = toml::from_str(
            "[run]\nname = \"t\"\nsims = 20\n[election]\ncandidates = 12\nseats = [4]\nvoters = 200\n[ballot]\nwording = \"up_to\"\nn = \"seats\"\n",
        ).unwrap();
        s.finish().unwrap();
        let (a, e) = super::position_worth(&s, 4, 0, 20);
        let (a2, _) = super::position_worth(&s, 4, 0, 20);
        assert_eq!(a.sum, a2.sum);
        // Split into two chunks, the sums add up to the whole.
        let (x, _) = super::position_worth(&s, 4, 0, 8);
        let (y, _) = super::position_worth(&s, 4, 8, 12);
        for k in 0..4 {
            assert_eq!(x.sum[k] + y.sum[k], a.sum[k]);
            assert_eq!(x.n[k] + y.n[k], a.n[k]);
        }
        // Four positions (the ballot's limit); 80 comparisons per group at position 1.
        assert_eq!(a.n.len(), 4);
        assert_eq!(a.n[0], 80.0);
        assert_eq!(e.n[0], 80.0);
        // Being ranked first helps a candidate on the edge more than being left off.
        assert!(e.sum[0] > 0.0);
    }

    #[test]
    fn position_worth_skips_voters_who_ranked_only_the_candidate() {
        // Short "up to 5" ballots: some voters rank only one candidate. Without that candidate
        // their ballot would be blank, which once crashed the count.
        let mut s: crate::settings::Settings = serde_json::from_str(r#"{"run":{"name":"t","seed":1,"sims":100},
            "election":{"candidates":12,"seats":[5],"voters":200,"turnout_spread":0.1,"ranks":12},
            "electorate":{"type":"organization"},"ballot":{"wording":"up_to","n":"seats","pull":0.1}}"#).unwrap();
        s.finish().unwrap();
        let (a, e) = super::position_worth(&s, 5, 50, 50);
        assert_eq!(a.n[0], 200.0);
        assert_eq!(e.n[0], 200.0);
    }

    #[test]
    fn election_records_add_up_to_simulate_and_position_worth() {
        let mut s: crate::settings::Settings = toml::from_str(
            "[run]\nname = \"t\"\nsims = 30\n[election]\ncandidates = 14\nseats = [5]\nvoters = 150\nturnout_spread = 0.1\n[ballot]\nwording = \"up_to\"\nn = \"seats\"\n",
        ).unwrap();
        s.finish().unwrap();
        let line = super::simulate(&s, 5, 1);
        let (any, _) = super::position_worth(&s, 5, 0, 30);
        let recs: Vec<_> = (0..30).map(|i| super::election_record(&s, 5, i, true)).collect();
        // Seats changed, summed over elections, match simulate's average at every rank.
        let mean = line["truncation"]["seats_changed"]["mean"].as_array().unwrap();
        for (k, m) in mean.iter().enumerate() {
            let total: u64 = recs.iter().map(|r| r["sc"].as_array().unwrap().get(k).map_or(0, |x| x.as_u64().unwrap())).sum();
            assert!((total as f64 / 30.0 - m.as_f64().unwrap()).abs() < 1e-3, "rank {}", k + 1);
        }
        // Worth sums and comparison counts match position_worth's.
        for k in 0..any.sum.len() {
            let sum: i64 = recs.iter().map(|r| r["w"].as_array().unwrap().get(k).map_or(0, |x| x.as_i64().unwrap())).sum();
            let n = recs.iter().flat_map(|r| r["wd"].as_array().unwrap().iter().map(|d| d.as_u64().unwrap() as usize)).filter(|&d| d > k).count();
            assert_eq!(sum as f64, any.sum[k], "position {}", k + 1);
            assert_eq!(n as f64, any.n[k], "position {}", k + 1);
        }
    }

    #[test]
    fn turnout_draw() {
        // No spread: always the expected number.
        assert!((0..50).all(|i| draw_voters(432, 0.0, i) == 432));
        // A 10% spread: repeatable, centered on the expected number, within 3 standard
        // deviations, and about two-thirds of draws within 1.
        let d: Vec<usize> = (0..4000).map(|i| draw_voters(432, 0.1, i * 7919)).collect();
        assert_eq!(d[17], draw_voters(432, 0.1, 17 * 7919));
        let mean = d.iter().sum::<usize>() as f64 / d.len() as f64;
        assert!((mean - 432.0).abs() < 3.0, "mean {mean}");
        assert!(d.iter().all(|&x| (302..=562).contains(&x)));
        let within = d.iter().filter(|&&x| (389..=475).contains(&x)).count() as f64 / d.len() as f64;
        assert!((0.64..0.72).contains(&within), "within one standard deviation: {within}");
    }
}

/// Sums for what each ballot position is worth to a candidate, so chunks of elections run
/// separately can be added together. For each position k: `sum`, `sq` (sum of squares), and `n`
/// (how many comparisons) of the change in whether the candidate wins.
#[derive(Clone, Default)]
pub struct WorthSums {
    pub sum: Vec<f64>,
    pub sq: Vec<f64>,
    pub n: Vec<f64>,
}

impl WorthSums {
    fn new(k: usize) -> Self {
        WorthSums { sum: vec![0.0; k], sq: vec![0.0; k], n: vec![0.0; k] }
    }
    fn add(&mut self, k: usize, d: f64) {
        self.sum[k] += d;
        self.sq[k] += d * d;
        self.n[k] += 1.0;
    }
    pub fn to_json(&self) -> Value {
        json!({ "sum": self.sum, "sq": self.sq, "n": self.n })
    }
}

/// What each ballot position is worth to a candidate: in simulated elections `first` to
/// `first + count - 1` (the same elections `simulate` plays out), how much more often a candidate
/// wins when one voter ranks them at position k instead of leaving them off. For each election
/// and each studied candidate, one random voter's ballot is counted without the candidate, then
/// with the candidate at position 1, 2, … (the voter's other choices keep their order; the ballot
/// is cut to its limit). Editing an existing ballot keeps turnout, and so the quota, fixed.
/// Two groups of candidates: `any`, 4 drawn at random; `edge`, the last 2 elected and the 2
/// strongest losers, whose races came down to a vote or two.
pub fn position_worth(s: &Settings, seats: usize, first: usize, count: usize) -> (WorthSums, WorthSums) {
    let c = s.election.candidates;
    let len = s.election.ranks;
    let limit = s.ballot.max_ranks(seats).unwrap_or(len).min(len);
    let opt = Options { rules: s.run.rules, surplus: s.run.surplus_order, quota: s.run.quota, lot_seed: 0 };
    let (mut any, mut edge) = (WorthSums::new(limit), WorthSums::new(limit));
    for i in first..first + count {
        let es = election_seed(s.run.seed, c, seats, i);
        let v = draw_voters(s.election.voters.unwrap(), s.election.turnout_spread.unwrap_or(0.0), es);
        let mut b = model::generate(c, seats, v, len, &s.electorate, &s.ballot, &s.model, es).ballots;
        let o = Options { lot_seed: es ^ 0x5851F42D4C957F2D, ..opt };
        let full = analyze(&b, seats, o, Truncation::Off);
        worth_in_election(&mut b, seats, es, o, limit, &full.elected_order, &full.excluded_order, |is_edge, k, d| {
            if is_edge { edge.add(k, d) } else { any.add(k, d) }
        });
    }
    (any, edge)
}

/// What each ballot position is worth in one election (see `position_worth`): calls
/// `add(is_edge, position index, change in winning)` for each comparison. `b` is the election's
/// ballots, edited and then restored; `elected` and `excluded` come from its full count.
/// Returns, for each of the 4 candidates drawn at random, the deepest position studied (0 when
/// the candidate was skipped), so a page can tell how many comparisons each position has.
#[allow(clippy::too_many_arguments)]
pub fn worth_in_election(
    b: &mut crate::ballots::Ballots,
    seats: usize,
    es: u64,
    o: Options,
    limit: usize,
    elected: &[u32],
    excluded: &[u32],
    mut add: impl FnMut(bool, usize, f64),
) -> [usize; 4] {
    use crate::ballots::{Ballots, NONE};
    let c = b.c;
    let mut depth = [0usize; 4];
    let mut r = Rng::new(es ^ 0x776F_7274_6821);
    let mut studied: Vec<(u32, bool)> = (0..4).map(|_| ((r.next_u64() % c as u64) as u32, false)).collect();
    studied.extend(elected.iter().rev().take(2).map(|&x| (x, true)));
    studied.extend(excluded.iter().rev().take(2).map(|&x| (x, true)));
    for (j, (cand, is_edge)) in studied.into_iter().enumerate() {
        // A voter who ranked only this candidate would cast a blank ballot without them,
        // which the count can't take, so draw another voter. Elections where no voter
        // ranked only this candidate draw exactly as before.
        let mut tries = 0;
        let (row, orig, others) = loop {
            let row = (r.next_u64() % b.rows() as u64) as usize;
            let orig: Vec<u32> = b.row(row).to_vec();
            let others: Vec<u32> = orig.iter().copied().filter(|&x| x != NONE && x != cand).collect();
            tries += 1;
            if !others.is_empty() || tries == 100 {
                break (row, orig, others);
            }
        };
        if others.is_empty() {
            continue;
        }
        let set = |b: &mut Ballots, vals: &[u32]| {
            let w = b.len;
            for (j, x) in b.prefs[row * w..(row + 1) * w].iter_mut().enumerate() {
                *x = *vals.get(j).unwrap_or(&NONE);
            }
        };
        let wins = |b: &Ballots| analyze(b, seats, o, Truncation::Off).winners.contains(&cand) as i32 as f64;
        set(b, &others);
        let base = wins(b);
        let deepest = limit.min(others.len() + 1);
        for k in 1..=deepest {
            let mut vals: Vec<u32> = others[..k - 1].to_vec();
            vals.push(cand);
            vals.extend(&others[k - 1..]);
            vals.truncate(limit);
            set(b, &vals);
            add(is_edge, k - 1, wins(b) - base);
        }
        if !is_edge {
            depth[j] = deepest;
        }
        set(b, &orig);
    }
    depth
}

/// One simulated election, `i`, as a compact record for a page that shows elections as they
/// finish (the public simulator): `cut`, its cutoff rank; `sc`, the seats that change when
/// ballots are cut after rank 1, 2, … (up to the cutoff rank, after which none do); `v`, its
/// voters; `u` and `m`, for each rank, the votes there that ended up counting toward a winner
/// and the ballots that rank anyone there; and, when `worth` is set, `w`, the summed change in winning for the 4 candidates drawn
/// at random at each position (trailing zeros left off), and `wd`, how deep each was studied.
/// The same numbers `simulate` and `position_worth` add up, election by election.
pub fn election_record(s: &Settings, seats: usize, i: usize, worth: bool) -> Value {
    let c = s.election.candidates;
    let len = s.election.ranks;
    let opt = Options { rules: s.run.rules, surplus: s.run.surplus_order, quota: s.run.quota, lot_seed: 0 };
    let es = election_seed(s.run.seed, c, seats, i);
    let v = draw_voters(s.election.voters.unwrap(), s.election.turnout_spread.unwrap_or(0.0), es);
    let mut b = model::generate(c, seats, v, len, &s.electorate, &s.ballot, &s.model, es).ballots;
    let o = Options { lot_seed: es ^ 0x5851F42D4C957F2D, ..opt };
    let a = analyze(&b, seats, o, Truncation::Winners);
    let cut = a.cutoff_rank.unwrap_or(1);
    let sc: Vec<u32> = a.seats_changed.as_deref().unwrap_or(&[]).iter().take(cut.saturating_sub(1)).copied().collect();
    // Share of the win: votes at each rank that ended up counting toward a winner, and ballots
    // that rank anyone there (both trailing zeros left off).
    let trim = |x: &[f64], round: f64| {
        let mut x: Vec<f64> = x.iter().map(|y| (y * round).round() / round).collect();
        x.truncate(x.iter().rposition(|&y| y != 0.0).map_or(0, |p| p + 1));
        x
    };
    let mut rec = json!({ "cut": cut, "sc": sc, "v": v, "u": trim(&a.used_votes, 100.0), "m": trim(&a.marked, 1.0) });
    if worth {
        let limit = s.ballot.max_ranks(seats).unwrap_or(len).min(len);
        let mut w = vec![0i32; limit];
        let wd = worth_in_election(&mut b, seats, es, o, limit, &a.elected_order, &a.excluded_order, |is_edge, k, d| {
            if !is_edge {
                w[k] += d as i32;
            }
        });
        let keep = w.iter().rposition(|&x| x != 0).map_or(0, |p| p + 1);
        w.truncate(keep);
        rec["w"] = json!(w);
        rec["wd"] = json!(wd);
    }
    rec
}
