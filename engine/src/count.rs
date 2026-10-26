//! The STV count, and the two measures built on it: reach and truncation.
//!
//! Counting rules: Droop quota, weighted inclusive Gregory surplus transfers
//! (every ballot of a winner moves on at a fraction of its value), one
//! exclusion per stage, lowest total first.
//!
//! Two rule sets:
//! - `Scottish` follows the Scottish Local Government Elections Order 2011:
//!   transfer values are cut (not rounded) to 5 decimal places, and ties are
//!   broken by looking back at earlier stages, then by lot.
//! - `Reference` matches `reference/decay.js`: full precision, and ties go to
//!   the lowest-numbered candidate. Used only to validate the counting code.

use crate::ballots::{Ballots, NONE};
use crate::rng::Rng;
use serde::{Deserialize, Serialize};
use std::cmp::{Ordering, Reverse};
use std::collections::{BinaryHeap, VecDeque};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Rules {
    #[default]
    Scottish,
    Reference,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum SurplusOrder {
    /// Largest surplus first, as Scottish rules require.
    #[default]
    Largest,
    /// Order of election. Only for matching the reference counter.
    Election,
}

/// How the quota is set from the number of ballots.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Quota {
    /// Ballots ÷ (seats + 1), any fraction dropped, plus 1: a whole number of votes, as
    /// Scottish rules require.
    #[default]
    Whole,
    /// Ballots ÷ (seats + 1) with no rounding: a candidate is elected on any total above it
    /// (in practice, 0.00001 votes above it, the smallest step the count uses).
    Exact,
}

#[derive(Clone, Copy, Debug)]
pub struct Options {
    pub rules: Rules,
    pub surplus: SurplusOrder,
    pub quota: Quota,
    /// Seed for decisions by lot.
    pub lot_seed: u64,
}

// ---------------------------------------------------------------- vote arithmetic

/// Vote values. `f64` for the reference rules, `Fixed` for Scottish rules.
pub trait Num: Copy + PartialEq + std::fmt::Debug {
    fn votes(n: u64) -> Self;
    fn plus(self, o: Self) -> Self;
    fn minus(self, o: Self) -> Self;
    fn times(self, n: u64) -> Self;
    /// The value one ballot paper of value `value` carries on when a surplus moves.
    fn transfer(value: Self, surplus: Self, total: Self) -> Self;
    fn reaches(total: Self, quota: Self) -> bool;
    fn is_positive(self) -> bool;
    fn is_zero(self) -> bool;
    fn order(a: Self, b: Self) -> Ordering;
    fn to_votes(self) -> f64;
    /// A value given in whole units of 0.00001 votes.
    fn from_units(x: u64) -> Self;
}

impl Num for f64 {
    fn from_units(x: u64) -> Self {
        x as f64 / FIXED_UNIT as f64
    }
    fn votes(n: u64) -> Self {
        n as f64
    }
    fn plus(self, o: Self) -> Self {
        self + o
    }
    fn minus(self, o: Self) -> Self {
        self - o
    }
    fn times(self, n: u64) -> Self {
        self * n as f64
    }
    fn transfer(value: Self, surplus: Self, total: Self) -> Self {
        value * (surplus / total)
    }
    fn reaches(total: Self, quota: Self) -> bool {
        total >= quota - 1e-9
    }
    fn is_positive(self) -> bool {
        self > 1e-9
    }
    fn is_zero(self) -> bool {
        self == 0.0
    }
    fn order(a: Self, b: Self) -> Ordering {
        a.total_cmp(&b)
    }
    fn to_votes(self) -> f64 {
        self
    }
}

/// Votes counted in whole units of 0.00001, so 5-decimal arithmetic is exact.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Fixed(pub u64);
pub const FIXED_UNIT: u64 = 100_000;

impl Num for Fixed {
    fn from_units(x: u64) -> Self {
        Fixed(x)
    }
    fn votes(n: u64) -> Self {
        Fixed(n * FIXED_UNIT)
    }
    fn plus(self, o: Self) -> Self {
        Fixed(self.0 + o.0)
    }
    fn minus(self, o: Self) -> Self {
        Fixed(self.0 - o.0)
    }
    fn times(self, n: u64) -> Self {
        Fixed(self.0 * n)
    }
    fn transfer(value: Self, surplus: Self, total: Self) -> Self {
        // value × surplus ÷ total, with any remainder past 5 decimal places ignored
        Fixed((value.0 as u128 * surplus.0 as u128 / total.0 as u128) as u64)
    }
    fn reaches(total: Self, quota: Self) -> bool {
        total.0 >= quota.0
    }
    fn is_positive(self) -> bool {
        self.0 > 0
    }
    fn is_zero(self) -> bool {
        self.0 == 0
    }
    fn order(a: Self, b: Self) -> Ordering {
        a.0.cmp(&b.0)
    }
    fn to_votes(self) -> f64 {
        self.0 as f64 / FIXED_UNIT as f64
    }
}

// ---------------------------------------------------------------- the count

#[derive(Clone, Copy)]
struct Piece<N> {
    b: u32,
    i: u32,
    v: N,
}

/// Orders candidates for exclusion (lowest first) and surpluses (highest first).
/// Order: total, then the stage the total last changed (a more recent change
/// counts as lower: the candidate was lower just before it), then lot.
/// Under reference rules `stage` is always 0 and `lot` is the candidate number.
#[derive(Clone, Copy)]
struct Key<N> {
    total: N,
    stage: u32,
    lot: u64,
    cand: u32,
    ver: u32,
}
impl<N: Num> Ord for Key<N> {
    fn cmp(&self, o: &Self) -> Ordering {
        N::order(self.total, o.total).then(o.stage.cmp(&self.stage)).then(self.lot.cmp(&o.lot)).then(self.cand.cmp(&o.cand))
    }
}
impl<N: Num> PartialOrd for Key<N> {
    fn partial_cmp(&self, o: &Self) -> Option<Ordering> {
        Some(self.cmp(o))
    }
}
impl<N: Num> PartialEq for Key<N> {
    fn eq(&self, o: &Self) -> bool {
        self.cmp(o) == Ordering::Equal
    }
}
impl<N: Num> Eq for Key<N> {}

const HOPEFUL: u8 = 0;
const ELECTED: u8 = 1;
const OUT: u8 = 2;

/// A count in progress. Cloning it mid-count lets a truncated recount pick up
/// from the point where it first differs from the full count.
#[derive(Clone)]
pub struct Counter<'a, N: Num> {
    bal: &'a Ballots,
    lot: &'a [u64],
    opt: Options,
    seats: usize,
    /// Ranks read from each ballot. Ranks past this are ignored (truncation).
    limit: usize,
    quota: N,
    st: Vec<u8>,
    tot: Vec<N>,
    ver: Vec<u32>,
    pile: Vec<Vec<Piece<N>>>,
    /// Scottish rules only: (stage, total) each time a candidate's total changed.
    hist: Vec<Vec<(u32, N)>>,
    low: BinaryHeap<Reverse<Key<N>>>,
    surplus_heap: BinaryHeap<Key<N>>,
    surplus_fifo: VecDeque<u32>,
    pending: Vec<u32>,
    is_pending: Vec<bool>,
    hopeful_n: usize,
    elected: Vec<u32>,
    excluded: Vec<u32>,
    stage: u32,
    track_reach: bool,
    /// reach[d] = vote weight that traveled to rank index d or deeper.
    reach: Vec<f64>,
    exhausted_votes: f64,
    exhausted_papers: u64,
    /// first_landing[j] = first stage at which any vote landed at rank index j.
    first_landing: Vec<u32>,
    /// When set, the count stops as soon as it elects a candidate outside this
    /// set or excludes one inside it.
    target: Vec<bool>,
    diverged: bool,
    touched: Vec<u32>,
    mark: Vec<u32>,
    stamp: u32,
    /// Set only by `trace`: a record of every stage.
    log: Option<Box<Trace>>,
}

/// One stage of a traced count: the first preferences, one surplus transfer, one exclusion,
/// or the last hopefuls elected without reaching the quota.
#[derive(Clone, Debug, Serialize)]
pub struct Stage {
    /// "first", "surplus", "exclusion", or "remaining".
    pub kind: &'static str,
    /// The candidate whose ballots moved (surplus or exclusion).
    pub from: Option<u32>,
    /// The share of each ballot's value that moved on (surplus only).
    pub transfer_value: Option<f64>,
    /// Candidates elected at the end of this stage, in the order they were elected.
    pub elected: Vec<u32>,
    /// Where the ballots went: (candidate, or `None` when the ballot ran out; rank, from 1,
    /// the ballot was read at; votes; ballot papers), one entry per candidate and rank.
    pub moves: Vec<(Option<u32>, Option<u32>, f64, u64)>,
    /// Every candidate's total at the end of this stage. A winner whose surplus has moved on
    /// shows the quota, and an excluded candidate shows 0.
    pub totals: Vec<f64>,
}

/// A full record of a count, for explaining it: what moved at each stage, and the votes each
/// winner held when elected, split by the rank they were read at.
#[derive(Clone, Debug, Default, Serialize)]
pub struct Trace {
    pub quota: f64,
    pub stages: Vec<Stage>,
    /// (candidate, votes[rank index]) for each winner, in the order they were elected.
    pub held_at_election: Vec<(u32, Vec<f64>)>,
    #[serde(skip)]
    surplus_moved: Vec<bool>,
}

impl<'a, N: Num> Counter<'a, N> {
    pub fn new(bal: &'a Ballots, seats: usize, opt: Options, lot: &'a [u64], track_reach: bool) -> Self {
        let (c, len) = (bal.c, bal.len);
        let v = bal.voters();
        let scottish = opt.rules == Rules::Scottish;
        let mut me = Counter {
            bal,
            lot,
            opt,
            seats,
            limit: len,
            quota: match opt.quota {
                Quota::Whole => N::votes(v / (seats as u64 + 1) + 1),
                Quota::Exact => N::from_units(v * FIXED_UNIT / (seats as u64 + 1) + 1),
            },
            st: vec![HOPEFUL; c],
            tot: vec![N::votes(0); c],
            ver: vec![0; c],
            pile: vec![Vec::new(); c],
            hist: Vec::new(),
            low: BinaryHeap::with_capacity(2 * c),
            surplus_heap: BinaryHeap::new(),
            surplus_fifo: VecDeque::new(),
            pending: Vec::new(),
            is_pending: vec![false; c],
            hopeful_n: c,
            elected: Vec::new(),
            excluded: Vec::new(),
            stage: 0,
            track_reach,
            reach: if track_reach { vec![0.0; len] } else { Vec::new() },
            exhausted_votes: 0.0,
            exhausted_papers: 0,
            first_landing: vec![u32::MAX; len],
            target: Vec::new(),
            diverged: false,
            touched: Vec::new(),
            mark: vec![0; c],
            stamp: 0,
            log: None,
        };
        for b in 0..bal.rows() {
            let cand = bal.prefs[b * len] as usize;
            me.pile[cand].push(Piece { b: b as u32, i: 0, v: N::votes(1) });
            me.tot[cand] = me.tot[cand].plus(N::votes(bal.mult(b)));
        }
        if track_reach {
            me.reach[0] = v as f64;
        }
        me.first_landing[0] = 0;
        if scottish {
            me.hist = me.tot.iter().map(|&t| vec![(0, t)]).collect();
        }
        for cand in 0..c {
            let k = me.key(cand);
            me.low.push(Reverse(k));
            if N::reaches(me.tot[cand], me.quota) {
                me.pending.push(cand as u32);
                me.is_pending[cand] = true;
            }
        }
        me
    }

    fn scottish(&self) -> bool {
        self.opt.rules == Rules::Scottish
    }

    fn key(&self, c: usize) -> Key<N> {
        let (stage, lot) = if self.scottish() { (self.hist[c].last().unwrap().0, self.lot[c]) } else { (0, c as u64) };
        Key { total: self.tot[c], stage, lot, cand: c as u32, ver: self.ver[c] }
    }

    /// Full Scottish comparison of two candidates with equal totals: compare
    /// their totals at the most recent stage where they differed, then by lot.
    fn cmp_history(&self, a: usize, b: usize) -> Ordering {
        let (ha, hb) = (&self.hist[a], &self.hist[b]);
        let (mut i, mut j) = (ha.len(), hb.len());
        while i > 0 && j > 0 {
            let ((sa, va), (sb, vb)) = (ha[i - 1], hb[j - 1]);
            let o = N::order(va, vb).then(sb.cmp(&sa));
            if o != Ordering::Equal {
                return o;
            }
            i -= 1;
            j -= 1;
        }
        self.lot[a].cmp(&self.lot[b])
    }

    /// Picks the lowest hopeful candidate for exclusion.
    fn pop_lowest(&mut self) -> usize {
        let first = loop {
            let Reverse(k) = self.low.pop().expect("no hopeful candidate left");
            if self.st[k.cand as usize] == HOPEFUL && k.ver == self.ver[k.cand as usize] {
                break k;
            }
        };
        // Equal totals that last changed at the same stage (after the first
        // preferences) need a deeper look back.
        if !self.scottish() || first.stage == 0 {
            return first.cand as usize;
        }
        let mut group = vec![first];
        while let Some(Reverse(k)) = self.low.peek().copied() {
            let cu = k.cand as usize;
            if self.st[cu] != HOPEFUL || k.ver != self.ver[cu] {
                self.low.pop();
                continue;
            }
            if N::order(k.total, first.total) != Ordering::Equal || k.stage != first.stage {
                break;
            }
            group.push(k);
            self.low.pop();
        }
        let best = (0..group.len()).min_by(|&x, &y| self.cmp_history(group[x].cand as usize, group[y].cand as usize)).unwrap();
        let chosen = group.swap_remove(best);
        for k in group {
            self.low.push(Reverse(k));
        }
        chosen.cand as usize
    }

    /// Picks the next surplus to transfer.
    fn next_surplus(&mut self) -> Option<usize> {
        if self.opt.surplus == SurplusOrder::Election {
            return self.surplus_fifo.pop_front().map(|c| c as usize);
        }
        let first = self.surplus_heap.pop()?;
        if !self.scottish() || first.stage == 0 {
            return Some(first.cand as usize);
        }
        let mut group = vec![first];
        while let Some(k) = self.surplus_heap.peek().copied() {
            if N::order(k.total, first.total) != Ordering::Equal || k.stage != first.stage {
                break;
            }
            group.push(k);
            self.surplus_heap.pop();
        }
        let best = (0..group.len()).max_by(|&x, &y| self.cmp_history(group[x].cand as usize, group[y].cand as usize)).unwrap();
        let chosen = group.swap_remove(best);
        for k in group {
            self.surplus_heap.push(k);
        }
        Some(chosen.cand as usize)
    }

    fn elect(&mut self, c: usize) {
        if let Some(t) = self.log.as_mut() {
            let mut held = vec![0.0; self.bal.len];
            for p in self.pile[c].iter() {
                held[p.i as usize] += p.v.times(self.bal.mult(p.b as usize)).to_votes();
            }
            t.held_at_election.push((c as u32, held));
            t.stages.last_mut().unwrap().elected.push(c as u32);
        }
        self.st[c] = ELECTED;
        self.hopeful_n -= 1;
        self.elected.push(c as u32);
        if !self.target.is_empty() && !self.target[c] {
            self.diverged = true;
        }
        match self.opt.surplus {
            SurplusOrder::Election => self.surplus_fifo.push_back(c as u32),
            SurplusOrder::Largest => {
                let k = self.key(c);
                self.surplus_heap.push(k);
            }
        }
    }

    fn elect_pending(&mut self) {
        let mut pending = std::mem::take(&mut self.pending);
        // several candidates reached quota at once: highest total first
        pending.sort_by(|&a, &b| {
            let (a, b) = (a as usize, b as usize);
            let o = N::order(self.tot[b], self.tot[a]);
            if o == Ordering::Equal && self.scottish() {
                self.cmp_history(b, a)
            } else {
                o
            }
        });
        for &c in pending.iter() {
            self.is_pending[c as usize] = false;
            self.elect(c as usize);
        }
    }

    /// Moves one ballot paper's piece on from rank index `from` to the next hopeful.
    fn place(&mut self, b: usize, value: N, from: usize) {
        let bal = self.bal;
        let row = bal.row(b);
        let lim = self.limit.min(bal.len);
        let mut j = from + 1;
        while j < lim {
            let c = row[j];
            if c == NONE {
                j = lim;
                break;
            }
            if self.st[c as usize] == HOPEFUL {
                break;
            }
            j += 1;
        }
        let m = bal.mult(b);
        let w = value.times(m);
        if let Some(t) = self.log.as_mut() {
            let to = (j < lim).then(|| row[j]);
            let rank = (j < lim).then_some(j as u32 + 1);
            let moves = &mut t.stages.last_mut().unwrap().moves;
            match moves.iter_mut().find(|x| x.0 == to && x.1 == rank) {
                Some(x) => {
                    x.2 += w.to_votes();
                    x.3 += m;
                }
                None => moves.push((to, rank, w.to_votes(), m)),
            }
        }
        if j >= lim {
            self.exhausted_votes += w.to_votes();
            self.exhausted_papers += m;
            return;
        }
        if self.track_reach {
            let wv = w.to_votes();
            for d in (from + 1)..=j {
                self.reach[d] += wv;
            }
        }
        if self.stage < self.first_landing[j] {
            self.first_landing[j] = self.stage;
        }
        let c = row[j] as usize;
        self.pile[c].push(Piece { b: b as u32, i: j as u32, v: value });
        self.tot[c] = self.tot[c].plus(w);
        if self.mark[c] != self.stamp {
            self.mark[c] = self.stamp;
            self.touched.push(c as u32);
        }
    }

    fn begin_transfer(&mut self) {
        self.stage += 1;
        self.stamp = self.stamp.wrapping_add(1);
        self.touched.clear();
    }

    fn end_transfer(&mut self) {
        if let Some(mut t) = self.log.take() {
            t.stages.last_mut().unwrap().totals = self.shown_totals(&t);
            self.log = Some(t);
        }
        let touched = std::mem::take(&mut self.touched);
        for &t in touched.iter() {
            let tu = t as usize;
            self.ver[tu] += 1;
            if self.scottish() {
                let (s, v) = (self.stage, self.tot[tu]);
                self.hist[tu].push((s, v));
            }
            let k = self.key(tu);
            self.low.push(Reverse(k));
            if N::reaches(self.tot[tu], self.quota) && !self.is_pending[tu] {
                self.is_pending[tu] = true;
                self.pending.push(t);
            }
        }
        self.touched = touched;
    }

    fn done(&self) -> bool {
        self.diverged || self.elected.len() >= self.seats
    }

    /// Runs one step of the count. Returns false once the count is over.
    pub fn step(&mut self) -> bool {
        if self.done() {
            return false;
        }
        if !self.pending.is_empty() {
            self.elect_pending();
            if self.done() {
                return false;
            }
        }
        if let Some(c) = self.next_surplus() {
            let total = self.tot[c];
            let surplus = total.minus(self.quota);
            let pieces = std::mem::take(&mut self.pile[c]);
            if surplus.is_positive() {
                self.log_stage("surplus", c, Some(surplus.to_votes() / total.to_votes()));
                self.begin_transfer();
                for p in pieces.iter() {
                    let mv = N::transfer(p.v, surplus, total);
                    if !mv.is_zero() {
                        self.place(p.b as usize, mv, p.i as usize);
                    }
                }
                self.end_transfer();
            }
            return true;
        }
        if self.hopeful_n <= self.seats - self.elected.len() {
            if let Some(mut t) = self.log.take() {
                let totals = self.shown_totals(&t);
                t.stages.push(Stage { kind: "remaining", from: None, transfer_value: None, elected: Vec::new(), moves: Vec::new(), totals });
                self.log = Some(t);
            }
            for c in 0..self.bal.c {
                if self.st[c] == HOPEFUL {
                    self.elect(c);
                }
            }
            return false;
        }
        let lo = self.pop_lowest();
        self.st[lo] = OUT;
        self.hopeful_n -= 1;
        self.excluded.push(lo as u32);
        if !self.target.is_empty() && self.target[lo] {
            self.diverged = true;
            return false;
        }
        let pieces = std::mem::take(&mut self.pile[lo]);
        self.log_stage("exclusion", lo, None);
        self.begin_transfer();
        for p in pieces.iter() {
            self.place(p.b as usize, p.v, p.i as usize);
        }
        self.end_transfer();
        true
    }

    pub fn run(&mut self) {
        while self.step() {}
    }

    fn shown_totals(&self, t: &Trace) -> Vec<f64> {
        (0..self.bal.c)
            .map(|c| match self.st[c] {
                OUT => 0.0,
                ELECTED if t.surplus_moved[c] => self.quota.to_votes(),
                _ => self.tot[c].to_votes(),
            })
            .collect()
    }

    fn log_stage(&mut self, kind: &'static str, from: usize, transfer_value: Option<f64>) {
        if let Some(t) = self.log.as_mut() {
            if kind == "surplus" {
                t.surplus_moved[from] = true;
            }
            t.stages.push(Stage { kind, from: Some(from as u32), transfer_value, elected: Vec::new(), moves: Vec::new(), totals: Vec::new() });
        }
    }
}

/// Counts the ballots once, recording every stage (`Trace`). The count itself is the same as
/// `analyze`'s full count.
pub fn trace(bal: &Ballots, seats: usize, opt: Options) -> Trace {
    match opt.rules {
        Rules::Scottish => trace_with::<Fixed>(bal, seats, opt),
        Rules::Reference => trace_with::<f64>(bal, seats, opt),
    }
}

fn trace_with<N: Num>(bal: &Ballots, seats: usize, opt: Options) -> Trace {
    let lot = lot_draw(bal.c, opt);
    let mut c = Counter::<N>::new(bal, seats, opt, &lot, false);
    let first = bal.prefs.chunks(bal.len).enumerate().fold(Vec::<(Option<u32>, Option<u32>, f64, u64)>::new(), |mut acc, (b, row)| {
        let m = bal.mult(b);
        match acc.iter_mut().find(|x| x.0 == Some(row[0])) {
            Some(x) => {
                x.2 += m as f64;
                x.3 += m;
            }
            None => acc.push((Some(row[0]), Some(1), m as f64, m)),
        }
        acc
    });
    let totals = c.tot.iter().map(|x| x.to_votes()).collect();
    c.log = Some(Box::new(Trace {
        quota: c.quota.to_votes(),
        stages: vec![Stage { kind: "first", from: None, transfer_value: None, elected: Vec::new(), moves: first, totals }],
        held_at_election: Vec::new(),
        surplus_moved: vec![false; bal.c],
    }));
    c.run();
    *c.log.take().unwrap()
}

fn lot_draw(c: usize, opt: Options) -> Vec<u64> {
    if opt.rules == Rules::Scottish {
        let mut r = Rng::new(opt.lot_seed);
        (0..c).map(|_| r.next_u64()).collect()
    } else {
        Vec::new()
    }
}

// ---------------------------------------------------------------- analysis

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Truncation {
    Off,
    /// Only record whether winners change. Truncated counts stop as soon as they differ.
    Changes,
    /// Also record the winners, and how many seats change, at every cutoff.
    Winners,
}

#[derive(Debug, Serialize)]
pub struct Analysis {
    /// Winners, sorted by candidate number.
    pub winners: Vec<u32>,
    /// Candidates in the order they were elected.
    pub elected_order: Vec<u32>,
    /// Candidates in the order they were excluded.
    pub excluded_order: Vec<u32>,
    /// reach_pct[d] = share of all votes (out of 100) that traveled to rank d+1 or deeper.
    pub reach_pct: Vec<f64>,
    /// Deepest rank any vote landed on.
    pub deepest_rank: usize,
    /// Share of voting weight (out of 100) lost because ballots ran out of hopeful candidates.
    pub exhausted_votes_pct: f64,
    /// Share of ballots (out of 100) that ran out of hopeful candidates at some point.
    pub exhausted_ballots_pct: f64,
    /// changed[k-1] = whether keeping only the first k ranks changes the winners.
    pub changed: Option<Vec<bool>>,
    /// Smallest k such that keeping k or more ranks always gives the full-ballot winners.
    pub cutoff_rank: Option<usize>,
    /// winners_at[k-1] = winners when keeping only the first k ranks.
    pub winners_at: Option<Vec<Vec<u32>>>,
    /// seats_changed[k-1] = how many seats go to a different candidate when keeping only the first k ranks.
    pub seats_changed: Option<Vec<u32>>,
}

fn sorted(v: &[u32]) -> Vec<u32> {
    let mut v = v.to_vec();
    v.sort_unstable();
    v
}

pub fn analyze(bal: &Ballots, seats: usize, opt: Options, trunc: Truncation) -> Analysis {
    match opt.rules {
        Rules::Scottish => analyze_with::<Fixed>(bal, seats, opt, trunc),
        Rules::Reference => analyze_with::<f64>(bal, seats, opt, trunc),
    }
}

fn analyze_with<N: Num>(bal: &Ballots, seats: usize, opt: Options, trunc: Truncation) -> Analysis {
    let lot = lot_draw(bal.c, opt);
    let mut full = Counter::<N>::new(bal, seats, opt, &lot, true);
    full.run();
    let v = bal.voters() as f64;
    let winners = sorted(&full.elected);
    let deepest = full.first_landing.iter().rposition(|&s| s != u32::MAX).unwrap_or(0);
    let mut out = Analysis {
        winners: winners.clone(),
        elected_order: full.elected.clone(),
        excluded_order: full.excluded.clone(),
        reach_pct: full.reach.iter().map(|x| 100.0 * x / v).collect(),
        deepest_rank: deepest + 1,
        exhausted_votes_pct: 100.0 * full.exhausted_votes / v,
        exhausted_ballots_pct: 100.0 * full.exhausted_papers as f64 / v,
        changed: None,
        cutoff_rank: None,
        winners_at: None,
        seats_changed: None,
    };
    if trunc == Truncation::Off {
        return out;
    }

    // Keeping k ranks can only matter if some vote landed at rank index k or
    // deeper. The truncated count matches the full count up to the first stage
    // where that happened, so it starts from a copy of the full count there.
    let len = bal.len;
    let mut changed = vec![false; len];
    let mut winners_at = vec![winners.clone(); len];
    let mut start = vec![u32::MAX; deepest + 1];
    for k in (1..=deepest).rev() {
        start[k] = full.first_landing[k].min(if k < deepest { start[k + 1] } else { u32::MAX });
    }
    let mut ks: Vec<usize> = (1..=deepest).collect();
    ks.sort_by_key(|&k| start[k]);
    let mut mask = vec![false; bal.c];
    for &w in winners.iter() {
        mask[w as usize] = true;
    }
    drop(full);
    let mut base = Counter::<N>::new(bal, seats, opt, &lot, false);
    let mut next = 0;
    loop {
        while next < ks.len() && start[ks[next]] <= base.stage + 1 {
            let k = ks[next];
            let mut t = base.clone();
            t.limit = k;
            if trunc == Truncation::Changes {
                t.target = mask.clone();
            }
            t.run();
            let w = sorted(&t.elected);
            changed[k - 1] = t.diverged || w != winners;
            winners_at[k - 1] = w;
            next += 1;
        }
        if next >= ks.len() || !base.step() {
            break;
        }
    }
    out.cutoff_rank = Some(changed.iter().rposition(|&c| c).map_or(1, |k| k + 2));
    out.changed = Some(changed);
    if trunc == Truncation::Winners {
        out.seats_changed = Some(winners_at.iter().map(|w| w.iter().filter(|c| !mask[**c as usize]).count() as u32).collect());
        out.winners_at = Some(winners_at);
    }
    out
}

// ---------------------------------------------------------------- tests

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{generate, Auto, BallotRules, Electorate, SlateParams};

    fn ballots(c: usize, rows: &[(u64, &[u32])]) -> Ballots {
        let len = rows.iter().map(|r| r.1.len()).max().unwrap();
        let mut prefs = vec![NONE; rows.len() * len];
        for (i, r) in rows.iter().enumerate() {
            prefs[i * len..i * len + r.1.len()].copy_from_slice(r.1);
        }
        Ballots { c, len, prefs, mult: Some(rows.iter().map(|r| r.0).collect()) }
    }

    fn opt(rules: Rules) -> Options {
        Options { rules, surplus: SurplusOrder::Largest, quota: Quota::Whole, lot_seed: 1 }
    }

    /// The hand-checked example in reference/README.md.
    #[test]
    fn hundred_voter_example() {
        // Ana 0, Ben 1, Cy 2, Dee 3
        let b = ballots(4, &[(40, &[0, 1, 2]), (35, &[1, 0, 3]), (15, &[2, 1, 0]), (10, &[3, 2, 1])]);
        for rules in [Rules::Scottish, Rules::Reference] {
            let a = analyze(&b, 1, opt(rules), Truncation::Winners);
            assert_eq!(a.winners, vec![1]);
            assert_eq!(a.reach_pct, vec![100.0, 25.0, 10.0]);
            assert_eq!(a.changed, Some(vec![true, false, false]));
            assert_eq!(a.winners_at, Some(vec![vec![0], vec![1], vec![1]]));
            assert_eq!(a.cutoff_rank, Some(2));
            assert_eq!(a.seats_changed, Some(vec![1, 0, 0]));
            let fast = analyze(&b, 1, opt(rules), Truncation::Changes);
            assert_eq!(fast.changed, a.changed);
        }
    }

    /// 11 voters, 2 seats, quota 4. A has 9 votes, a surplus of 5, so each of A's
    /// ballots moves on at 5/9 = 0.555555..., cut to 0.55555. B gets
    /// 1 + 6 × 0.55555 = 4.33330 votes, not 4.33333.
    #[test]
    fn scottish_cuts_transfer_values_to_five_places() {
        let b = ballots(3, &[(6, &[0, 1]), (3, &[0, 2]), (1, &[1]), (1, &[2])]);
        let lot = vec![0; 3];
        let mut c = Counter::<Fixed>::new(&b, 2, opt(Rules::Scottish), &lot, true);
        c.run();
        assert_eq!(sorted(&c.elected), vec![0, 1]);
        assert_eq!(c.tot[1], Fixed(433_330));
        assert_eq!(c.tot[2], Fixed(100_000 + 3 * 55_555));
        let mut r = Counter::<f64>::new(&b, 2, opt(Rules::Reference), &[], true);
        r.run();
        assert!((r.tot[1] - (1.0 + 6.0 * 5.0 / 9.0)).abs() < 1e-12);
    }

    /// 4 voters, 2 seats: three rank C then A, one ranks B, A, C.
    /// Whole quota: 4 ÷ 3 = 1.33, fraction dropped, plus 1 = 2. C is elected with 3; the
    /// surplus of 1 moves on at 1/3, cut to 0.33333, so A gets 0.99999. B has 1, so A is
    /// excluded and B wins the last seat.
    /// Exact quota: 1.33333..., so elected at 1.33334. C's surplus of 1.66666 moves on at
    /// 0.55555, so A gets 1.66665, reaches the quota, and wins.
    #[test]
    fn exact_quota_is_not_rounded() {
        let b = ballots(3, &[(3, &[2, 0]), (1, &[1, 0, 2])]);
        let whole = analyze(&b, 2, opt(Rules::Scottish), Truncation::Off);
        assert_eq!(whole.winners, vec![1, 2]);
        assert_eq!(whole.excluded_order, vec![0]);
        let lot = vec![0; 3];
        let o = Options { quota: Quota::Exact, ..opt(Rules::Scottish) };
        let mut c = Counter::<Fixed>::new(&b, 2, o, &lot, true);
        assert_eq!(c.quota, Fixed(133_334));
        c.run();
        assert_eq!(c.tot[0], Fixed(3 * 55_555));
        let exact = analyze(&b, 2, o, Truncation::Off);
        assert_eq!(exact.winners, vec![0, 2]);
        assert!(exact.excluded_order.is_empty());
    }

    /// First preferences: A 8, B 4, C 3, D 1. Quota 9.
    /// D is excluded and their vote goes to C, so B and C are tied at 4.
    /// Scottish rules look back: C had fewer (3) at the first stage, so C goes.
    /// Then A and B tie at 8, and B had fewer before, so B goes and A wins.
    /// The reference rule (lowest number goes) excludes B, then A, and C wins.
    #[test]
    fn scottish_ties_look_back() {
        let b = ballots(4, &[(8, &[0]), (4, &[1, 2]), (3, &[2, 1]), (1, &[3, 2, 1])]);
        let s = analyze(&b, 1, opt(Rules::Scottish), Truncation::Off);
        assert_eq!(s.excluded_order, vec![3, 2, 1]);
        assert_eq!(s.winners, vec![0]);
        let r = analyze(&b, 1, opt(Rules::Reference), Truncation::Off);
        assert_eq!(r.excluded_order, vec![3, 1, 0]);
        assert_eq!(r.winners, vec![2]);
    }

    /// First preferences: A 10, B 5, C 4, D 3. D's votes give B one and C two,
    /// so both reach 6 at the same stage. Looking back, C had fewer (4 vs 5), so C goes,
    /// even though B has the lower number.
    #[test]
    fn scottish_ties_look_back_past_shared_stage() {
        let b = ballots(4, &[(10, &[0]), (5, &[1]), (4, &[2]), (1, &[3, 1]), (2, &[3, 2])]);
        let s = analyze(&b, 1, opt(Rules::Scottish), Truncation::Off);
        assert_eq!(s.excluded_order, vec![3, 2, 1]);
        let r = analyze(&b, 1, opt(Rules::Reference), Truncation::Off);
        assert_eq!(r.excluded_order, vec![3, 1, 2]);
    }

    /// A and B tie at 3 votes at every stage, so lot decides. The draw must be
    /// repeatable for a given seed, and different seeds must reach both outcomes.
    #[test]
    fn scottish_lot_is_seeded() {
        let b = ballots(3, &[(5, &[2]), (3, &[0]), (3, &[1])]);
        let mut seen = std::collections::HashSet::new();
        for seed in 0..32 {
            let o = Options { lot_seed: seed, ..opt(Rules::Scottish) };
            let a = analyze(&b, 1, o, Truncation::Off);
            assert_eq!(a.excluded_order, analyze(&b, 1, o, Truncation::Off).excluded_order);
            seen.insert(a.excluded_order[0]);
        }
        assert_eq!(seen.len(), 2);
    }

    /// The traced count elects the same candidates as the full count, keeps every vote
    /// accounted for at each stage, and records the hand-checked example's stages.
    #[test]
    fn trace_matches_count() {
        // Ana 0, Ben 1, Cy 2, Dee 3: Dee goes (10 votes to Cy), then Cy (25 to Ben), and Ben wins.
        let b = ballots(4, &[(40, &[0, 1, 2]), (35, &[1, 0, 3]), (15, &[2, 1, 0]), (10, &[3, 2, 1])]);
        let t = trace(&b, 1, opt(Rules::Scottish));
        let kinds: Vec<_> = t.stages.iter().map(|s| (s.kind, s.from)).collect();
        assert_eq!(kinds, vec![("first", None), ("exclusion", Some(3)), ("exclusion", Some(2))]);
        assert_eq!(t.stages[1].moves, vec![(Some(2), Some(2), 10.0, 10)]);
        assert_eq!(t.stages[2].moves, vec![(Some(1), Some(2), 15.0, 15), (Some(1), Some(3), 10.0, 10)]);
        assert_eq!(t.stages[2].elected, vec![1]);
        assert_eq!(t.held_at_election, vec![(1, vec![35.0, 15.0, 10.0])]);

        let v02 = SlateParams::default();
        for (c, seats, v, seed) in [(8, 3, 200, 5), (15, 5, 300, 6), (30, 10, 600, 7), (40, 20, 400, 8)] {
            let b = generate(c, 3, v, c, &Electorate::default(), &BallotRules::default(), &v02, seed).ballots;
            for rules in [Rules::Scottish, Rules::Reference] {
                let a = analyze(&b, seats, opt(rules), Truncation::Off);
                let t = trace(&b, seats, opt(rules));
                let order: Vec<u32> = t.stages.iter().flat_map(|s| s.elected.clone()).collect();
                assert_eq!(order, a.elected_order);
                let out: Vec<u32> = t.stages.iter().filter(|s| s.kind == "exclusion").map(|s| s.from.unwrap()).collect();
                assert_eq!(out, a.excluded_order);
                let mut lost = 0.0;
                for s in t.stages.iter() {
                    lost += s.moves.iter().filter(|m| m.0.is_none()).map(|m| m.2).sum::<f64>();
                    // Every vote is held by a candidate or lost, except the fractions of a vote
                    // that Scottish rules drop when cutting transfer values to 5 decimal places.
                    let held: f64 = s.totals.iter().sum();
                    let gap = v as f64 - held - lost;
                    assert!(gap > -1e-6 && (gap < 1e-6 || rules == Rules::Scottish && gap < 0.01 * v as f64), "{rules:?} {} {gap}", s.kind);
                }
            }
        }
    }

    /// The shortcut (start each truncated count from a copy of the full count)
    /// must agree with recounting from scratch at every cutoff.
    #[test]
    fn truncation_shortcut_matches_recount() {
        // Version 0.1 fills every rank; version 0.2 gives voters ballots of different lengths.
        let v01 = SlateParams { version: "0.1".into(), popularity_spread: Auto::Value(1.0), ..SlateParams::default() };
        let v02 = SlateParams::default();
        for (p, c, v, seed) in [(&v01, 8, 200, 1), (&v01, 15, 300, 2), (&v01, 30, 600, 3), (&v01, 40, 400, 4), (&v02, 8, 200, 5), (&v02, 15, 300, 6), (&v02, 30, 600, 7)] {
            let b = generate(c, 3, v, c, &Electorate::default(), &BallotRules::default(), p, seed).ballots;
            for seats in [1, 2, 3, c / 3, c / 2, c - 2] {
                for (rules, quota) in [(Rules::Scottish, Quota::Whole), (Rules::Scottish, Quota::Exact), (Rules::Reference, Quota::Whole)] {
                    let o = Options { quota, ..opt(rules) };
                    let a = analyze(&b, seats, o, Truncation::Winners);
                    let f = analyze(&b, seats, o, Truncation::Changes);
                    assert_eq!(a.changed, f.changed);
                    let lot: Vec<u64> = {
                        let mut r = Rng::new(o.lot_seed);
                        (0..c).map(|_| r.next_u64()).collect()
                    };
                    for k in 1..=b.len {
                        let w = match rules {
                            Rules::Scottish => {
                                let mut t = Counter::<Fixed>::new(&b, seats, o, &lot, false);
                                t.limit = k;
                                t.run();
                                sorted(&t.elected)
                            }
                            Rules::Reference => {
                                let mut t = Counter::<f64>::new(&b, seats, o, &lot, false);
                                t.limit = k;
                                t.run();
                                sorted(&t.elected)
                            }
                        };
                        assert_eq!(w, a.winners_at.as_ref().unwrap()[k - 1], "c={c} seats={seats} k={k} {rules:?}");
                    }
                }
            }
        }
    }
}
