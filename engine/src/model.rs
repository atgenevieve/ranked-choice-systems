//! The voter model: how simulated ballots are filled in. Every setting here is described,
//! with its evidence, in `docs/model-spec.md`.

use crate::ballots::Ballots;
use crate::rng::Rng;
use serde::{Deserialize, Serialize};

/// The version of `docs/model-spec.md` this code implements.
pub const MODEL_VERSION: &str = "0.1";

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SlateParams {
    /// Number of slates (groups of voters and candidates that tend to vote together).
    #[serde(default = "default_slates")]
    pub slates: usize,
    /// Pull toward neighbouring slates (0 = only own slate, 1 = slates don't matter).
    #[serde(default = "default_loyalty")]
    pub slate_loyalty: f64,
    /// Spread of candidate popularity (lognormal sigma; 0 = all equally popular).
    #[serde(default = "default_spread")]
    pub popularity_spread: f64,
}

fn default_slates() -> usize {
    4
}
fn default_loyalty() -> f64 {
    0.15
}
fn default_spread() -> f64 {
    1.0
}

impl Default for SlateParams {
    fn default() -> Self {
        SlateParams { slates: default_slates(), slate_loyalty: default_loyalty(), popularity_spread: default_spread() }
    }
}

// ---------------------------------------------------------------- Fenwick tree
struct Fenwick {
    t: Vec<f64>,
    w: Vec<f64>,
    log: usize,
}
impl Fenwick {
    fn new(w: &[f64]) -> Self {
        let n = w.len();
        let mut t = vec![0.0; n + 1];
        for i in 0..n {
            t[i + 1] += w[i];
            let j = (i + 1) + ((i + 1) & (!(i + 1) + 1));
            if j <= n {
                let v = t[i + 1];
                t[j] += v;
            }
        }
        let mut log = 1;
        while (1 << log) <= n {
            log += 1;
        }
        Fenwick { t, w: w.to_vec(), log }
    }
    fn add(&mut self, i: usize, d: f64) {
        self.w[i] += d;
        let mut k = i + 1;
        while k < self.t.len() {
            self.t[k] += d;
            k += k & (!k + 1);
        }
    }
    /// smallest index whose prefix sum exceeds u
    fn find(&self, mut u: f64) -> usize {
        let n = self.t.len() - 1;
        let mut pos = 0;
        for k in (0..self.log).rev() {
            let nxt = pos + (1 << k);
            if nxt <= n && self.t[nxt] <= u {
                pos = nxt;
                u -= self.t[nxt];
            }
        }
        pos.min(n - 1)
    }
}

/// Scalable "slate" model: candidates belong to slates and have a popularity.
/// A voter fills their ballot one rank at a time, choosing among unranked
/// candidates with probability popularity * loyalty^(slate distance).
pub fn slate_electorate(c: usize, v: usize, k: usize, p: &SlateParams, seed: u64) -> Ballots {
    let mut r = Rng::new(seed);
    let f = p.slates;
    let fw: Vec<f64> = (0..f).map(|_| 0.5 + r.f64()).collect();
    let fs: f64 = fw.iter().sum();
    let pick = |r: &mut Rng| {
        let mut x = r.f64() * fs;
        for (i, w) in fw.iter().enumerate() {
            x -= w;
            if x <= 0.0 {
                return i;
            }
        }
        f - 1
    };
    let mut members: Vec<Vec<u32>> = vec![Vec::new(); f];
    let mut pops: Vec<Vec<f64>> = vec![Vec::new(); f];
    for cand in 0..c {
        let g = pick(&mut r);
        members[g].push(cand as u32);
        pops[g].push((p.popularity_spread * r.gauss()).exp());
    }
    let mut trees: Vec<Fenwick> = pops.iter().map(|w| Fenwick::new(if w.is_empty() { &[0.0][..] } else { w })).collect();
    let base_sum: Vec<f64> = pops.iter().map(|w| w.iter().sum()).collect();
    let len = k.min(c);
    let mut prefs = vec![0u32; v * len];
    let mut removed: Vec<(usize, usize, f64)> = Vec::with_capacity(len);
    for voter in 0..v {
        let home = pick(&mut r);
        let aff: Vec<f64> = (0..f).map(|g| p.slate_loyalty.powi((g as i32 - home as i32).abs())).collect();
        let mut rem = base_sum.clone();
        removed.clear();
        let mut left: Vec<usize> = members.iter().map(|m| m.len()).collect();
        for slot in 0..len {
            // pick a slate among those with candidates left, weighted by affinity * remaining popularity
            let wsum = |g: usize, rem: &Vec<f64>, left: &Vec<usize>| if left[g] == 0 { 0.0 } else { aff[g] * rem[g].max(1e-300) };
            let tot: f64 = (0..f).map(|g| wsum(g, &rem, &left)).sum();
            let mut x = r.f64() * tot;
            let mut g = (0..f).rev().find(|&gg| left[gg] > 0).expect("no candidate left");
            for gg in 0..f {
                let w = wsum(gg, &rem, &left);
                if x < w {
                    g = gg;
                    break;
                }
                x -= w;
            }
            let mut idx = trees[g].find(r.f64() * rem[g].max(0.0) * (1.0 - 1e-12));
            let mut tries = 0;
            while trees[g].w[idx] <= 0.0 && tries < 64 {
                idx = trees[g].find(r.f64() * rem[g].max(0.0) * (1.0 - 1e-12));
                tries += 1;
            }
            if trees[g].w[idx] <= 0.0 {
                // numerical drift: fall back to the first unranked candidate in this slate
                idx = trees[g].w.iter().position(|&w| w > 0.0).expect("slate bookkeeping out of sync");
            }
            left[g] -= 1;
            let wv = trees[g].w[idx];
            trees[g].add(idx, -wv);
            rem[g] -= wv;
            removed.push((g, idx, wv));
            prefs[voter * len + slot] = members[g][idx];
        }
        for &(g, idx, wv) in removed.iter() {
            trees[g].add(idx, wv);
        }
    }
    Ballots { c, len, prefs, mult: None }
}
