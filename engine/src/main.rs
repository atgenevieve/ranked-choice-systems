//! Fast simulator for "how many ranks matter" in Scottish-rules STV.
//!
//! For each simulated election it measures, for every rank d on the ballot,
//! the share of all votes that had to travel to rank d or deeper (because every
//! candidate the voter ranked above had already won or been eliminated).
//!
//! Counting rules: Droop quota, weighted inclusive Gregory surplus transfers
//! (every ballot of a winner moves on at surplus / total), one elimination per
//! round, lowest total first.

use std::cmp::Ordering;
use std::collections::BinaryHeap;
use std::io::{BufRead, Write};
use std::sync::atomic::{AtomicUsize, Ordering as AO};
use std::sync::Mutex;

// ---------------------------------------------------------------- RNG
struct Rng(u64, u64, u64, u64);
fn splitmix(x: &mut u64) -> u64 {
    *x = x.wrapping_add(0x9E3779B97F4A7C15);
    let mut z = *x;
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58476D1CE4E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D049BB133111EB);
    z ^ (z >> 31)
}
impl Rng {
    fn new(seed: u64) -> Self {
        let mut s = seed;
        Rng(splitmix(&mut s), splitmix(&mut s), splitmix(&mut s), splitmix(&mut s))
    }
    fn next_u64(&mut self) -> u64 {
        let r = (self.1.wrapping_mul(5)).rotate_left(7).wrapping_mul(9);
        let t = self.1 << 17;
        self.2 ^= self.0;
        self.3 ^= self.1;
        self.1 ^= self.2;
        self.0 ^= self.3;
        self.2 ^= t;
        self.3 = self.3.rotate_left(45);
        r
    }
    fn f64(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 * (1.0 / (1u64 << 53) as f64)
    }
    fn gauss(&mut self) -> f64 {
        let mut u = self.f64();
        while u <= 0.0 {
            u = self.f64();
        }
        let v = self.f64();
        (-2.0 * u.ln()).sqrt() * (2.0 * std::f64::consts::PI * v).cos()
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

// ---------------------------------------------------------------- electorates
struct Ballots {
    c: usize,
    v: usize,
    len: usize,
    prefs: Vec<u32>, // v * len, row-major
}

struct SlateParams {
    factions: usize,
    rho: f64,       // pull toward neighbouring slates (0 = only own slate)
    pop_sigma: f64, // spread of candidate popularity (lognormal)
}

/// Scalable "slate" model: candidates belong to slates and have a popularity.
/// A voter fills their ballot one rank at a time, choosing among unranked
/// candidates with probability popularity * rho^(slate distance).
fn slate_electorate(c: usize, v: usize, k: usize, p: &SlateParams, seed: u64) -> Ballots {
    let mut r = Rng::new(seed);
    let f = p.factions;
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
        pops[g].push((p.pop_sigma * r.gauss()).exp());
    }
    let mut trees: Vec<Fenwick> = pops.iter().map(|w| Fenwick::new(if w.is_empty() { &[0.0][..] } else { w })).collect();
    let base_sum: Vec<f64> = pops.iter().map(|w| w.iter().sum()).collect();
    let len = k.min(c);
    let mut prefs = vec![0u32; v * len];
    let mut removed: Vec<(usize, usize, f64)> = Vec::with_capacity(len);
    for voter in 0..v {
        let home = pick(&mut r);
        let aff: Vec<f64> = (0..f).map(|g| p.rho.powi((g as i32 - home as i32).abs())).collect();
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
    Ballots { c, v, len, prefs }
}

fn read_ballots(path: &str) -> Vec<Ballots> {
    // file format: blocks of "C V" header line followed by V lines of space-separated 0-based candidate ids
    let f = std::fs::File::open(path).expect("open ballots file");
    let mut lines = std::io::BufReader::new(f).lines();
    let mut out = Vec::new();
    while let Some(Ok(h)) = lines.next() {
        if h.trim().is_empty() {
            continue;
        }
        let hv: Vec<usize> = h.split_whitespace().map(|x| x.parse().unwrap()).collect();
        let (c, v) = (hv[0], hv[1]);
        let mut prefs = Vec::with_capacity(c * v);
        for _ in 0..v {
            let l = lines.next().unwrap().unwrap();
            let row: Vec<u32> = l.split_whitespace().map(|x| x.parse().unwrap()).collect();
            assert_eq!(row.len(), c, "ballot files must be fully ranked");
            prefs.extend(row);
        }
        out.push(Ballots { c, v, len: c, prefs });
    }
    out
}

// ---------------------------------------------------------------- the count
#[derive(Clone, Copy)]
struct Piece {
    b: u32,
    i: u32,
    w: f64,
}

#[derive(PartialEq)]
struct MinEntry(f64, u32);
impl Eq for MinEntry {}
impl PartialOrd for MinEntry {
    fn partial_cmp(&self, o: &Self) -> Option<Ordering> {
        Some(self.cmp(o))
    }
}
impl Ord for MinEntry {
    // reversed so BinaryHeap (a max-heap) pops the lowest total, ties -> lowest index
    fn cmp(&self, o: &Self) -> Ordering {
        o.0.total_cmp(&self.0).then(o.1.cmp(&self.1))
    }
}

const HOPEFUL: u8 = 0;
const ELECTED: u8 = 1;
const OUT: u8 = 2;

/// Returns cross[d] = total vote weight that reached rank d+1 or deeper.
fn count(bal: &Ballots, seats: usize, fifo: bool) -> Vec<f64> {
    let (c, v, len) = (bal.c, bal.v, bal.len);
    let quota = (v / (seats + 1) + 1) as f64;
    let mut st = vec![HOPEFUL; c];
    let mut tot = vec![0.0f64; c];
    let mut pile: Vec<Vec<Piece>> = vec![Vec::new(); c];
    let mut cross = vec![0.0f64; len];
    let mut heap: BinaryHeap<MinEntry> = BinaryHeap::with_capacity(c * 2);
    let mut touched_mark = vec![0u32; c];
    let mut stamp: u32 = 0;
    let mut touched: Vec<u32> = Vec::new();
    let mut pending: Vec<u32> = Vec::new(); // reached quota, not yet elected
    let mut is_pending = vec![false; c];
    let mut hopeful_n = c;
    let mut elected_n = 0usize;
    // surplus queue: (surplus, total at election, candidate)
    let mut sq_fifo: std::collections::VecDeque<(f64, u32)> = std::collections::VecDeque::new();
    let mut sq_heap: BinaryHeap<(OrdF, u32)> = BinaryHeap::new();

    cross[0] = v as f64;
    for b in 0..v {
        let cand = bal.prefs[b * len] as usize;
        pile[cand].push(Piece { b: b as u32, i: 0, w: 1.0 });
        tot[cand] += 1.0;
    }
    for cand in 0..c {
        heap.push(MinEntry(tot[cand], cand as u32));
        if tot[cand] >= quota - 1e-9 {
            pending.push(cand as u32);
            is_pending[cand] = true;
        }
    }

    // move a piece onward from rank index `from`; returns nothing
    macro_rules! place {
        ($b:expr, $w:expr, $from:expr) => {{
            let b = $b as usize;
            let row = &bal.prefs[b * len..b * len + len];
            let mut j = $from + 1;
            while j < len && st[row[j] as usize] != HOPEFUL {
                j += 1;
            }
            if j < len {
                for d in ($from + 1)..=j {
                    cross[d] += $w;
                }
                let cand = row[j] as usize;
                pile[cand].push(Piece { b: b as u32, i: j as u32, w: $w });
                tot[cand] += $w;
                if touched_mark[cand] != stamp {
                    touched_mark[cand] = stamp;
                    touched.push(cand as u32);
                }
            }
        }};
    }

    let mut guard = 0usize;
    while elected_n < seats && guard < 4 * c + 10 {
        guard += 1;
        if !pending.is_empty() {
            // elect everyone who reached quota, largest first
            pending.sort_by(|a, b| tot[*b as usize].total_cmp(&tot[*a as usize]));
            for &cand in pending.iter() {
                let cu = cand as usize;
                is_pending[cu] = false;
                st[cu] = ELECTED;
                hopeful_n -= 1;
                elected_n += 1;
                let s = tot[cu] - quota;
                if fifo {
                    sq_fifo.push_back((tot[cu], cand));
                } else {
                    sq_heap.push((OrdF(s), cand));
                }
            }
            pending.clear();
            if elected_n >= seats {
                break;
            }
        }
        let next_surplus = if fifo { sq_fifo.pop_front().map(|(t, c)| (t, c)) } else { sq_heap.pop().map(|(_, c)| (tot[c as usize], c)) };
        if let Some((tc, cand)) = next_surplus {
            let cu = cand as usize;
            let s = tc - quota;
            let pieces = std::mem::take(&mut pile[cu]);
            if s > 1e-9 {
                let f = s / tc;
                stamp = stamp.wrapping_add(1);
                touched.clear();
                for p in pieces.iter() {
                    let mv = p.w * f;
                    place!(p.b, mv, p.i as usize);
                }
                for &t in touched.iter() {
                    let tu = t as usize;
                    heap.push(MinEntry(tot[tu], t));
                    if tot[tu] >= quota - 1e-9 && !is_pending[tu] {
                        is_pending[tu] = true;
                        pending.push(t);
                    }
                }
            }
            continue; // pieces at elected candidates are never needed again
        }
        if hopeful_n <= seats - elected_n {
            for cu in 0..c {
                if st[cu] == HOPEFUL {
                    st[cu] = ELECTED;
                    elected_n += 1;
                }
            }
            break;
        }
        // eliminate the lowest hopeful
        let lo = loop {
            let MinEntry(t, cand) = heap.pop().expect("heap empty");
            let cu = cand as usize;
            if st[cu] == HOPEFUL && t.to_bits() == tot[cu].to_bits() {
                break cu;
            }
        };
        st[lo] = OUT;
        hopeful_n -= 1;
        let pieces = std::mem::take(&mut pile[lo]);
        stamp = stamp.wrapping_add(1);
        touched.clear();
        for p in pieces.iter() {
            place!(p.b, p.w, p.i as usize);
        }
        for &t in touched.iter() {
            let tu = t as usize;
            heap.push(MinEntry(tot[tu], t));
            if tot[tu] >= quota - 1e-9 && !is_pending[tu] {
                is_pending[tu] = true;
                pending.push(t);
            }
        }
    }
    cross.iter().map(|x| 100.0 * x / v as f64).collect()
}

#[derive(PartialEq, PartialOrd)]
struct OrdF(f64);
impl Eq for OrdF {}
impl Ord for OrdF {
    fn cmp(&self, o: &Self) -> Ordering {
        self.0.total_cmp(&o.0)
    }
}

// ---------------------------------------------------------------- driver
const THRESH: [f64; 5] = [20.0, 10.0, 5.0, 2.0, 1.0];

fn cutoff(curve: &[f64], t: f64) -> Option<usize> {
    curve.iter().position(|&x| x < t).map(|i| i + 1)
}

fn arg<T: std::str::FromStr>(args: &[String], name: &str, def: T) -> T {
    args.iter().position(|a| a == name).and_then(|i| args.get(i + 1)).and_then(|s| s.parse().ok()).unwrap_or(def)
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let fifo = args.iter().any(|a| a == "--fifo");
    let threads: usize = arg(&args, "--threads", std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1));

    if let Some(i) = args.iter().position(|a| a == "--ballots-file") {
        // validation mode: count the given ballots and print the full curves
        let seats: usize = arg(&args, "--seats", 1);
        for b in read_ballots(&args[i + 1]) {
            let cur = count(&b, seats, fifo);
            println!("{}", cur.iter().map(|x| format!("{:.9}", x)).collect::<Vec<_>>().join(" "));
        }
        return;
    }

    let c: usize = arg(&args, "--cands", 100);
    let seats_list: Vec<usize> = arg::<String>(&args, "--seats", "10".into()).split(',').map(|s| s.parse().unwrap()).collect();
    let sims: usize = arg(&args, "--sims", 100);
    let v: usize = arg(&args, "--voters", (10 * c).max(1000));
    let k: usize = arg(&args, "--ranks", 100);
    let seed: u64 = arg(&args, "--seed", 1);
    let params = SlateParams { factions: arg(&args, "--factions", 4), rho: arg(&args, "--rho", 0.15), pop_sigma: arg(&args, "--pop", 1.0) };
    let curve_out: usize = arg(&args, "--curve", 0);

    for &s in seats_list.iter() {
        if s == 0 || s >= c {
            continue;
        }
        let len = k.min(c);
        let t0 = std::time::Instant::now();
        let next = AtomicUsize::new(0);
        let acc = Mutex::new((vec![0.0f64; len], vec![Vec::<usize>::new(); THRESH.len()], vec![0usize; THRESH.len()]));
        std::thread::scope(|sc| {
            for _ in 0..threads.max(1) {
                sc.spawn(|| {
                    let mut local = vec![0.0f64; len];
                    let mut cuts: Vec<Vec<usize>> = vec![Vec::new(); THRESH.len()];
                    let mut cens = vec![0usize; THRESH.len()];
                    loop {
                        let i = next.fetch_add(1, AO::Relaxed);
                        if i >= sims {
                            break;
                        }
                        let es = seed ^ (c as u64).wrapping_mul(0x9E3779B97F4A7C15) ^ (s as u64).wrapping_mul(0xC2B2AE3D27D4EB4F) ^ (i as u64).wrapping_mul(0x165667B19E3779F9);
                        let b = slate_electorate(c, v, k, &params, es);
                        let cur = count(&b, s, fifo);
                        for d in 0..len {
                            local[d] += cur[d];
                        }
                        for (ti, &t) in THRESH.iter().enumerate() {
                            match cutoff(&cur, t) {
                                Some(r) => cuts[ti].push(r),
                                None => {
                                    cens[ti] += 1;
                                    cuts[ti].push(len + 1)
                                }
                            }
                        }
                    }
                    let mut g = acc.lock().unwrap();
                    for d in 0..len {
                        g.0[d] += local[d];
                    }
                    for ti in 0..THRESH.len() {
                        g.1[ti].extend(cuts[ti].iter());
                        g.2[ti] += cens[ti];
                    }
                });
            }
        });
        let (sum, mut cuts, cens) = acc.into_inner().unwrap();
        let avg: Vec<f64> = sum.iter().map(|x| x / sims as f64).collect();
        let q = |a: &mut Vec<usize>, p: f64| {
            a.sort();
            a[((a.len() - 1) as f64 * p).round() as usize]
        };
        let mut parts = vec![format!("\"cands\":{},\"seats\":{},\"voters\":{},\"ranks\":{},\"sims\":{},\"secs\":{:.2}", c, s, v, len, sims, t0.elapsed().as_secs_f64())];
        for (ti, &t) in THRESH.iter().enumerate() {
            let avg_cut = cutoff(&avg, t).map(|r| r.to_string()).unwrap_or("null".into());
            let (p10, p50, p90) = (q(&mut cuts[ti], 0.1), q(&mut cuts[ti], 0.5), q(&mut cuts[ti], 0.9));
            parts.push(format!("\"t{}\":{{\"avg\":{},\"p10\":{},\"p50\":{},\"p90\":{},\"censored\":{}}}", t as u32, avg_cut, p10, p50, p90, cens[ti]));
        }
        if curve_out > 0 {
            parts.push(format!("\"curve\":[{}]", avg.iter().take(curve_out).map(|x| format!("{:.4}", x)).collect::<Vec<_>>().join(",")));
        }
        println!("{{{}}}", parts.join(","));
        std::io::stdout().flush().ok();
    }
}
