//! The voter model: how simulated ballots are filled in. Every setting here is described,
//! with its evidence, in `docs/model-spec.md`.

use crate::ballots::{Ballots, NONE};
use crate::rng::Rng;
use serde::{Deserialize, Serialize};

/// The newest version of `docs/model-spec.md` this code implements. Settings can still ask for
/// version 0.1, the exploratory model, so earlier runs can be repeated.
pub const MODEL_VERSION: &str = "0.2";

/// Settings in the `[model]` section. Version 0.2 uses all of them except `slate_loyalty`;
/// version 0.1 uses only `slates`, `slate_loyalty`, and `popularity_spread`.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SlateParams {
    /// Which model to use: "0.2" (approved October 20, 2026) or "0.1" (exploratory).
    #[serde(default = "default_version")]
    pub version: String,
    /// Number of slates (groups of voters and candidates that tend to vote together).
    #[serde(default = "default_slates")]
    pub slates: usize,
    /// Version 0.1 only: pull toward neighbouring slates in a line (0 = only own slate, 1 = slates don't matter).
    #[serde(default = "default_loyalty")]
    pub slate_loyalty: f64,
    /// Spread of candidate popularity (lognormal sigma; 0 = all equally popular).
    /// "auto" picks it by type of election (version 0.2; version 0.1 needs a number).
    #[serde(default = "auto")]
    pub popularity_spread: Auto,
    /// Version 0.2: share of candidates who belong to no slate (at least this many: candidates
    /// left over after slates are sized also belong to none).
    #[serde(default = "default_unaffiliated")]
    pub unaffiliated_share: f64,
    /// Version 0.2: share of voters with no home slate, who rank by popularity alone.
    /// Default: 0.6 times the share of candidates in no slate, as in Scotland.
    #[serde(default)]
    pub unaffiliated_voter_share: Option<f64>,
    /// Version 0.2: how many candidates each slate runs.
    #[serde(default)]
    pub slate_candidates: SlateSizing,
    /// Version 0.2: share of candidates who are long shots, far less popular than the rest.
    /// "auto" picks it by type of election.
    #[serde(default = "auto")]
    pub long_shot_share: Auto,
    /// Version 0.2: how far below the rest long shots sit, on the same scale as the spread
    /// (2 means about 7 times less popular).
    #[serde(default = "default_long_shot_gap")]
    pub long_shot_gap: f64,
    /// Version 0.2: how strongly voters prefer their own slate: "loose", "tight", or a
    /// multiplier on own-slate candidates' tickets.
    #[serde(default)]
    pub slate_strength: Strength,
    /// Version 0.2: how unevenly votes that leave a slate spread over other slates (0 = evenly).
    #[serde(default = "default_other_spread")]
    pub other_slate_spread: f64,
}

fn default_version() -> String {
    MODEL_VERSION.into()
}
fn default_slates() -> usize {
    4
}
fn default_loyalty() -> f64 {
    0.15
}
fn default_unaffiliated() -> f64 {
    0.15
}
fn default_long_shot_gap() -> f64 {
    // Fitted with the share on single-seat public races (data/fits/long-shot-tuning.json).
    2.5
}
fn default_other_spread() -> f64 {
    // Gives Scottish twins an evenness of 0.84 for votes leaving a party, as in real wards.
    1.2
}
fn auto() -> Auto {
    Auto::Word(AutoWord::Auto)
}

impl Default for SlateParams {
    fn default() -> Self {
        toml::from_str("").expect("model defaults")
    }
}

/// A number, or "auto" to use the default for the type of election.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum Auto {
    Value(f64),
    Word(AutoWord),
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AutoWord {
    Auto,
}
impl Auto {
    fn or(self, default: f64) -> f64 {
        match self {
            Auto::Value(x) => x,
            Auto::Word(_) => default,
        }
    }
}

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SlateSizing {
    /// Each slate runs about as many candidates as the seats its support could win.
    #[default]
    ExpectedSeats,
    /// Each slate's share of candidates matches its share of voters (version 0.1's rule).
    SameAsVoters,
}

/// "loose", "tight", or a multiplier.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum Strength {
    Value(f64),
    Word(StrengthWord),
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum StrengthWord {
    Loose,
    Tight,
}
impl Default for Strength {
    fn default() -> Self {
        Strength::Word(StrengthWord::Loose)
    }
}

/// Settings in the `[electorate]` section (version 0.2).
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Electorate {
    /// "public" (tuned to Scotland) or "organization" (tuned to union and society elections).
    #[serde(default, rename = "type")]
    pub kind: ElectorateType,
    /// Overrides for the natural ballot length (see `length_table`). Leave them out to use
    /// the fitted values for the electorate type.
    #[serde(default)]
    pub length_scale: Option<f64>,
    #[serde(default)]
    pub length_candidates_power: Option<f64>,
    #[serde(default)]
    pub length_seats_power: Option<f64>,
    #[serde(default)]
    pub length_bunching: Option<f64>,
    #[serde(default)]
    pub length_complete_share: Option<f64>,
    #[serde(default)]
    pub length_complete_fade: Option<f64>,
}

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ElectorateType {
    #[default]
    Public,
    Organization,
}

/// Settings in the `[ballot]` section (version 0.2): what the ballot lets or tells voters do.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BallotRules {
    /// "none" (rank as many as you like), "up_to" N, "at_least" N, or "exactly" N.
    #[serde(default)]
    pub wording: Wording,
    /// N: a number, or "seats" for the number of seats.
    #[serde(default)]
    pub n: RankCount,
    /// Override for the share of voters below N who are pulled up to N. Leave it out to use
    /// the fitted value for the wording.
    #[serde(default)]
    pub pull: Option<f64>,
}

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Wording {
    #[default]
    None,
    UpTo,
    AtLeast,
    Exactly,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum RankCount {
    Number(usize),
    Word(SeatsWord),
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SeatsWord {
    Seats,
}
impl Default for RankCount {
    fn default() -> Self {
        RankCount::Word(SeatsWord::Seats)
    }
}

// ---------------------------------------------------------------- fitted defaults
// Every value here is described, with its evidence, in docs/model-spec.md. Ballot length is
// fitted by data/fit_length.py, and the rest is checked by data/model_check.py.

/// Seat bands for settings that depend on the type of election: 1 seat, 2 to 4, 5 or more.
fn seat_band(seats: usize) -> usize {
    match seats {
        0 | 1 => 0,
        2..=4 => 1,
        _ => 2,
    }
}

/// Popularity spread and share of long-shot candidates by electorate type (public,
/// organization) and seat band (1, 2 to 4, 5 or more), tuned by data/model_check.py
/// (data/fits/popularity-tuning.json): the spread matches the top candidate's first choices
/// against the quota, and long shots are added only where the last candidate would otherwise
/// be too strong. Where the model's last candidate is too weak even with no long shots (public
/// 2 to 4 seats, organization 5 or more), the spread still follows the quota; see the model spec.
/// Public elections with 5 or more seats use the 2-to-4-seat values: the only real ones are
/// mostly Canberra, whose full party lists the owner judged too unusual to tune to.
const POPULARITY_SPREAD: [[f64; 3]; 2] = [[1.1, 1.2, 1.2], [0.8, 0.7, 1.0]];
const LONG_SHOT_SHARE: [[f64; 3]; 2] = [[0.1, 0.0, 0.0], [0.0, 0.0, 0.0]];
/// Own-slate multipliers for "loose" and "tight" slates, checked by data/model_check.py on
/// twins of Scottish wards: loose gives about 12 points of clustering above popularity (like
/// Portland's endorsement slates, 10 to 15), tight about 62 (like Scottish parties, 61).
const STRENGTH_LOOSE: f64 = 4.0;
const STRENGTH_TIGHT: f64 = 100.0;
/// Natural ballot length by electorate type (public, organization), fitted by
/// data/fit_length.py (data/fits/ballot-length.json): scale, candidates power, seats power,
/// bunching, share who rank everyone with 4 candidates, and how fast that share fades.
const LENGTH: [[f64; 6]; 2] = [[0.4641, 0.595, 0.3589, 1.4403, 0.1736, 0.1442], [0.6749, 0.2063, 0.3113, 0.5109, 0.2648, 0.061]];
/// Share of voters below N who are pulled up to N, fitted by data/fit_length.py: "up to" N
/// (NYC, Portland, and other US limits of 3 to 6), and "at least" N (Canberra 2024).
const PULL_UP_TO: f64 = 0.23;
const PULL_AT_LEAST: f64 = 0.97;

/// What "auto" and the named settings mean for one type of election (shown by the tuner).
pub fn auto_values(kind: ElectorateType, seats: usize) -> serde_json::Value {
    let k = kind as usize;
    let band = seat_band(seats);
    let d = LENGTH[k];
    serde_json::json!({
        "popularity_spread": POPULARITY_SPREAD[k][band],
        "long_shot_share": LONG_SHOT_SHARE[k][band],
        "long_shot_gap": default_long_shot_gap(),
        "slate_strength": { "loose": STRENGTH_LOOSE, "tight": STRENGTH_TIGHT },
        "other_slate_spread": default_other_spread(),
        "unaffiliated_share": default_unaffiliated(),
        "length": { "scale": d[0], "candidates_power": d[1], "seats_power": d[2], "bunching": d[3], "complete_share": d[4], "complete_fade": d[5] },
        "pull": { "up_to": PULL_UP_TO, "at_least": PULL_AT_LEAST },
    })
}

impl SlateParams {
    pub fn check(&self) -> Result<(), String> {
        match self.version.as_str() {
            "0.1" => {
                if let Auto::Word(_) = self.popularity_spread {
                    return Err("model version 0.1 needs a number for model.popularity_spread".into());
                }
            }
            "0.2" => {}
            v => return Err(format!("unknown model version {v:?}: use \"0.2\" or \"0.1\"")),
        }
        let share = |name: &str, x: f64| if (0.0..=1.0).contains(&x) { Ok(()) } else { Err(format!("model.{name} must be between 0 and 1")) };
        share("unaffiliated_share", self.unaffiliated_share)?;
        if let Some(x) = self.unaffiliated_voter_share {
            share("unaffiliated_voter_share", x)?;
        }
        if let Auto::Value(x) = self.long_shot_share {
            share("long_shot_share", x)?;
        }
        if self.slates == 0 {
            return Err("model.slates must be at least 1".into());
        }
        Ok(())
    }
    fn strength(&self) -> f64 {
        match self.slate_strength {
            Strength::Value(x) => x,
            Strength::Word(StrengthWord::Loose) => STRENGTH_LOOSE,
            Strength::Word(StrengthWord::Tight) => STRENGTH_TIGHT,
        }
    }
}

impl Electorate {
    /// The chance of each natural ballot length 1..=c, as running totals (the last is 1).
    ///
    /// A share of voters rank every candidate: complete_share × exp(-complete_fade × (c - 4)),
    /// which shrinks as fields grow. The rest rank 1 plus a Conway–Maxwell–Poisson count: the
    /// chance of x extra ranks is proportional to rate^x / (x!)^bunching, where
    /// rate = scale × c^candidates_power × s^seats_power. Bunching above 1 clusters lengths
    /// around their typical value; below 1 spreads them out. Lengths past c count as c.
    /// The same formula is fitted to real ballots by data/fit_length.py.
    pub fn length_table(&self, c: usize, s: usize) -> Vec<f64> {
        let d = LENGTH[self.kind as usize];
        let scale = self.length_scale.unwrap_or(d[0]);
        let bc = self.length_candidates_power.unwrap_or(d[1]);
        let bs = self.length_seats_power.unwrap_or(d[2]);
        let nu = self.length_bunching.unwrap_or(d[3]);
        let complete = (self.length_complete_share.unwrap_or(d[4]) * (-self.length_complete_fade.unwrap_or(d[5]) * (c as f64 - 4.0)).exp()).min(1.0);
        let rate = scale * (c as f64).powf(bc) * (s as f64).powf(bs);
        let top = (c + 60).max((3.0 * rate) as usize + 60);
        let logw: Vec<f64> = (0..top).map(|x| x as f64 * rate.ln() - nu * ln_factorial(x)).collect();
        let m = logw.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
        let w: Vec<f64> = logw.iter().map(|v| (v - m).exp()).collect();
        let total: f64 = w.iter().sum();
        let mut cum = Vec::with_capacity(c);
        let mut run = 0.0;
        for x in 0..c.saturating_sub(1) {
            run += (1.0 - complete) * w[x] / total;
            cum.push(run);
        }
        cum.push(1.0);
        cum
    }
}

/// ln(x!), summed directly (x stays small).
fn ln_factorial(x: usize) -> f64 {
    (2..=x).map(|k| (k as f64).ln()).sum()
}

/// Draws a length from a table of running totals.
fn draw_length(cum: &[f64], r: &mut Rng) -> usize {
    let u = r.f64();
    cum.iter().position(|&p| u < p).unwrap_or(cum.len() - 1) + 1
}

impl BallotRules {
    pub fn n(&self, seats: usize) -> usize {
        match self.n {
            RankCount::Number(n) => n,
            RankCount::Word(_) => seats,
        }
    }
    /// The most ranks this ballot allows, if it sets a maximum.
    pub fn max_ranks(&self, seats: usize) -> Option<usize> {
        match self.wording {
            Wording::UpTo | Wording::Exactly => Some(self.n(seats)),
            _ => None,
        }
    }
    /// The number of ranks the ballot tells voters to fill at least, if any.
    pub fn min_ranks(&self, seats: usize) -> Option<usize> {
        match self.wording {
            Wording::AtLeast | Wording::Exactly => Some(self.n(seats)),
            _ => None,
        }
    }
    /// Applies the ballot's rules to a voter's natural length.
    fn apply(&self, natural: usize, seats: usize, r: &mut Rng) -> usize {
        let n = self.n(seats).max(1);
        match self.wording {
            Wording::None => natural,
            Wording::Exactly => n,
            Wording::UpTo => {
                let pull = self.pull.unwrap_or(PULL_UP_TO);
                if natural >= n || r.f64() < pull {
                    n
                } else {
                    natural
                }
            }
            Wording::AtLeast => {
                let pull = self.pull.unwrap_or(PULL_AT_LEAST);
                if natural < n && r.f64() < pull {
                    n
                } else {
                    natural
                }
            }
        }
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

/// Draws one ballot of `length` ranks from candidate groups, each group weighted by the voter's
/// affinity `aff` for it. Within a group, each candidate's chance is its popularity. Writes the
/// ranking into `out` and leaves the trees as it found them.
fn draw_ballot(trees: &mut [Fenwick], members: &[Vec<u32>], base_sum: &[f64], aff: &[f64], length: usize, r: &mut Rng, out: &mut [u32], removed: &mut Vec<(usize, usize, f64)>) {
    let ng = trees.len();
    let mut rem = base_sum.to_vec();
    let mut left: Vec<usize> = members.iter().map(|m| m.len()).collect();
    removed.clear();
    for slot in out.iter_mut().take(length) {
        // pick a group among those with candidates left, weighted by affinity * remaining popularity
        let wsum = |g: usize, rem: &Vec<f64>, left: &Vec<usize>| if left[g] == 0 { 0.0 } else { aff[g] * rem[g].max(1e-300) };
        let tot: f64 = (0..ng).map(|g| wsum(g, &rem, &left)).sum();
        let mut x = r.f64() * tot;
        let mut g = (0..ng).rev().find(|&gg| left[gg] > 0).expect("no candidate left");
        for gg in 0..ng {
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
            // numerical drift: fall back to the first unranked candidate in this group
            idx = trees[g].w.iter().position(|&w| w > 0.0).expect("slate bookkeeping out of sync");
        }
        left[g] -= 1;
        let wv = trees[g].w[idx];
        trees[g].add(idx, -wv);
        rem[g] -= wv;
        removed.push((g, idx, wv));
        *slot = members[g][idx];
    }
    for &(g, idx, wv) in removed.iter() {
        trees[g].add(idx, wv);
    }
}

/// Picks an index in proportion to the weights.
fn pick(w: &[f64], total: f64, r: &mut Rng) -> usize {
    let mut x = r.f64() * total;
    for (i, wi) in w.iter().enumerate() {
        x -= wi;
        if x <= 0.0 {
            return i;
        }
    }
    w.len() - 1
}

/// Shuffles in place.
fn shuffle<T>(v: &mut [T], r: &mut Rng) {
    for i in (1..v.len()).rev() {
        let j = ((r.f64() * (i + 1) as f64) as usize).min(i);
        v.swap(i, j);
    }
}

/// One simulated election, with what the engine knows about its candidates.
pub struct Generated {
    pub ballots: Ballots,
    /// Each candidate's slate, or `None` for a candidate in no slate.
    pub slate_of: Vec<Option<usize>>,
    /// Whether each candidate is a long shot.
    pub long_shot: Vec<bool>,
}

/// Simulates one election: `c` candidates, `s` seats, `v` voters, ballots at most `row` ranks long.
/// Uses the model version the settings ask for.
pub fn generate(c: usize, s: usize, v: usize, row: usize, el: &Electorate, rules: &BallotRules, p: &SlateParams, seed: u64) -> Generated {
    if p.version == "0.1" {
        let (ballots, slate_of) = slate_electorate(c, v, row, p, seed);
        return Generated { ballots, slate_of: slate_of.into_iter().map(Some).collect(), long_shot: vec![false; c] };
    }
    let mut r = Rng::new(seed);
    let kind = el.kind as usize;
    let band = seat_band(s);
    let f = p.slates;
    // Slates' relative sizes among voters with a slate.
    let fw: Vec<f64> = (0..f).map(|_| 0.5 + r.f64()).collect();
    let fs: f64 = fw.iter().sum();
    let min_unaff = ((p.unaffiliated_share * c as f64).round() as usize).min(c);
    let slated = c - min_unaff;
    // Candidates per slate.
    let mut sizes = vec![0usize; f];
    match p.slate_candidates {
        SlateSizing::ExpectedSeats => {
            // A slate with share x of all voters can expect to win about x × (seats + 1) seats,
            // since a seat takes a quota of 1 / (seats + 1) of the votes. Round up, at least one.
            let u_v = p.unaffiliated_voter_share.unwrap_or(0.6 * min_unaff as f64 / c as f64);
            for g in 0..f {
                let share = (1.0 - u_v) * fw[g] / fs;
                sizes[g] = ((share * (s + 1) as f64).ceil() as usize).max(1);
            }
            // Too many for the field: trim the largest slates first, down to one candidate each,
            // then drop the smallest slates.
            while sizes.iter().sum::<usize>() > slated {
                let g = (0..f).max_by_key(|&g| (sizes[g], g)).unwrap();
                if sizes[g] > 1 {
                    sizes[g] -= 1;
                } else {
                    let g = (0..f).filter(|&g| sizes[g] > 0).min_by(|&a, &b| fw[a].partial_cmp(&fw[b]).unwrap()).unwrap();
                    sizes[g] = 0;
                }
            }
        }
        SlateSizing::SameAsVoters => {
            for _ in 0..slated {
                sizes[pick(&fw, fs, &mut r)] += 1;
            }
        }
    }
    // Candidates left over after slates are sized belong to no slate.
    let unaff = c - sizes.iter().sum::<usize>();
    let u_v = p.unaffiliated_voter_share.unwrap_or(0.6 * unaff as f64 / c as f64);
    let mut slate_of: Vec<Option<usize>> = Vec::with_capacity(c);
    for (g, &n) in sizes.iter().enumerate() {
        slate_of.extend(std::iter::repeat(Some(g)).take(n));
    }
    slate_of.extend(std::iter::repeat(None).take(unaff));
    shuffle(&mut slate_of, &mut r);
    // Popularity, with long shots far below the rest.
    let spread = p.popularity_spread.or(POPULARITY_SPREAD[kind][band]);
    let mut pop: Vec<f64> = (0..c).map(|_| (spread * r.gauss()).exp()).collect();
    let n_long = ((p.long_shot_share.or(LONG_SHOT_SHARE[kind][band]) * c as f64).round() as usize).min(c.saturating_sub(1));
    let mut order: Vec<usize> = (0..c).collect();
    shuffle(&mut order, &mut r);
    let mut long_shot = vec![false; c];
    for &cand in order.iter().take(n_long) {
        long_shot[cand] = true;
        pop[cand] *= (-p.long_shot_gap).exp();
    }
    // Groups for drawing: one per slate, and one (index f) for candidates in no slate.
    let ng = f + 1;
    let mut members: Vec<Vec<u32>> = vec![Vec::new(); ng];
    let mut pops: Vec<Vec<f64>> = vec![Vec::new(); ng];
    for cand in 0..c {
        let g = slate_of[cand].unwrap_or(f);
        members[g].push(cand as u32);
        pops[g].push(pop[cand]);
    }
    // How voters of each slate weigh each other slate: a random affinity with average 1.
    let os = p.other_slate_spread;
    let affinity: Vec<Vec<f64>> = (0..f).map(|_| (0..f).map(|_| (os * r.gauss() - os * os / 2.0).exp()).collect()).collect();
    let strength = p.strength();
    let mut trees: Vec<Fenwick> = pops.iter().map(|w| Fenwick::new(if w.is_empty() { &[0.0][..] } else { w })).collect();
    let base_sum: Vec<f64> = pops.iter().map(|w| w.iter().sum()).collect();
    let len = row.min(c);
    let mut prefs = vec![NONE; v * len];
    let mut removed = Vec::with_capacity(len);
    let mut aff = vec![1.0; ng];
    let lengths = el.length_table(c, s);
    for voter in 0..v {
        // Home slate: none with probability u_v; otherwise a slate, in proportion to its size.
        let home = if r.f64() < u_v { None } else { Some(pick(&fw, fs, &mut r)) };
        for (g, a) in aff.iter_mut().enumerate() {
            *a = match home {
                Some(h) if g == h => strength,
                Some(h) if g < f => affinity[h][g],
                _ => 1.0,
            };
        }
        let length = rules.apply(draw_length(&lengths, &mut r), s, &mut r).clamp(1, len);
        draw_ballot(&mut trees, &members, &base_sum, &aff, length, &mut r, &mut prefs[voter * len..(voter + 1) * len], &mut removed);
    }
    Generated { ballots: Ballots { c, len, prefs, mult: None }, slate_of, long_shot }
}

/// Version 0.1, the exploratory model. Candidates belong to slates and have a popularity.
/// A voter fills every rank, choosing among unranked candidates with probability
/// popularity * loyalty^(slate distance). Returns the ballots and each candidate's slate.
fn slate_electorate(c: usize, v: usize, k: usize, p: &SlateParams, seed: u64) -> (Ballots, Vec<usize>) {
    let mut r = Rng::new(seed);
    let f = p.slates;
    let fw: Vec<f64> = (0..f).map(|_| 0.5 + r.f64()).collect();
    let fs: f64 = fw.iter().sum();
    let mut members: Vec<Vec<u32>> = vec![Vec::new(); f];
    let mut pops: Vec<Vec<f64>> = vec![Vec::new(); f];
    let mut slate_of = vec![0; c];
    for (cand, slot) in slate_of.iter_mut().enumerate() {
        let g = pick(&fw, fs, &mut r);
        members[g].push(cand as u32);
        pops[g].push((p.popularity_spread.or(1.0) * r.gauss()).exp());
        *slot = g;
    }
    let mut trees: Vec<Fenwick> = pops.iter().map(|w| Fenwick::new(if w.is_empty() { &[0.0][..] } else { w })).collect();
    let base_sum: Vec<f64> = pops.iter().map(|w| w.iter().sum()).collect();
    let len = k.min(c);
    let mut prefs = vec![0u32; v * len];
    let mut removed = Vec::with_capacity(len);
    for voter in 0..v {
        let home = pick(&fw, fs, &mut r);
        let aff: Vec<f64> = (0..f).map(|g| p.slate_loyalty.powi((g as i32 - home as i32).abs())).collect();
        draw_ballot(&mut trees, &members, &base_sum, &aff, len, &mut r, &mut prefs[voter * len..(voter + 1) * len], &mut removed);
    }
    (Ballots { c, len, prefs, mult: None }, slate_of)
}
