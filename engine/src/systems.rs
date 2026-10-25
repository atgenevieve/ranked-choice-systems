//! Voting systems other than Scottish STV, measured the same way: who wins with full ballots,
//! and who wins when every ballot is cut after rank k (truncation). `count::analyze` sends each
//! system here.
//!
//! - `CambridgeStv`: STV as counted in Cambridge, Massachusetts. Whole ballots move, never
//!   fractions. Surpluses are moved only after the first count, by the Cincinnati method: of the
//!   winner's ballots, in the order they were counted, every n-th ballot that has a continuing
//!   choice moves on, where n is the winner's votes ÷ their surplus, rounded to the nearest whole
//!   number, until the surplus is gone. After that, a candidate who reaches the quota is elected
//!   and keeps exactly the ballots they have; later ballots skip them. Candidates are excluded one
//!   at a time, lowest first, ties by lot. Cambridge's rule that drops every candidate under 50
//!   votes at once is left out: these elections are far smaller than Cambridge's, and it would
//!   drop candidates who could win.
//! - `MeekStv`: STV by Meek's method, as New Zealand's rules for local elections count it.
//!   Every candidate has a keep share: hopefuls keep all of each vote that reaches them,
//!   excluded candidates keep none, and winners keep just enough to sit at the quota. A ballot
//!   gives each candidate in turn their keep share of what is left of it, and passes the rest
//!   on, so a winner's surplus moves on from every ballot that reached them, even ballots that
//!   reached them late. Whatever is left after the last continuing choice is exhausted. The
//!   quota is (votes − exhausted) ÷ (seats + 1), with no rounding, so it falls as ballots
//!   exhaust; a candidate is elected on any total above it. After every change, the winners'
//!   keep shares are adjusted until each sits at the quota (to within a billionth of the
//!   votes). Then everyone above the quota is elected; if no one is, the lowest hopeful is
//!   excluded, ties by lot. Exclusions undo themselves: an excluded candidate's ballots are
//!   counted again as if they had never been ranked.
//! - `ExpandingApprovals`: the expanding approvals rule (Aziz and Lee, 2020), a proportional
//!   method that reads ballots in layers. Every voter starts with 1 vote to spend. At layer j,
//!   each hopeful's support is the unspent votes of everyone who ranks them in their top j.
//!   While some hopeful's support reaches the quota (Scottish rules' whole-vote quota: votes
//!   ÷ (seats + 1), fraction dropped, plus 1), the one with the most is elected (ties by lot),
//!   and their supporters pay the quota between them, each the same share of what they have
//!   left. Then the next layer. If seats remain after the last rank, the hopeful with the most
//!   support is elected and their supporters spend everything, until the seats are filled.
//!   Unlike STV, a voter's lower ranks count while their higher choices are still hopeful, so
//!   ranking more candidates can cost a higher choice (it fails later-no-harm).
//! - `Borda`: a candidate at rank r on a ballot gets (candidates − r) points; candidates left
//!   off get none. The seats go to the highest totals, ties by lot. Cutting a ballot after rank
//!   k takes away the points below k.
//! - `Approval`: a voter approves every candidate they ranked (owner's decision, October 23,
//!   2026). The seats go to the most approved, ties by lot. Cutting after rank k means a voter
//!   approves only their first k.

use crate::ballots::{Ballots, NONE};
use crate::count::{Analysis, System, Truncation};
use crate::rng::Rng;

fn lot(seed: u64, c: usize) -> Vec<u64> {
    let mut r = Rng::new(seed);
    (0..c).map(|_| r.next_u64()).collect()
}

fn sorted(v: &[u32]) -> Vec<u32> {
    let mut v = v.to_vec();
    v.sort_unstable();
    v
}

/// What a system gives back from one count: winners in order of election, losers in order of
/// exclusion (weakest first), and for each ballot row the deepest rank index it was counted at.
struct Outcome {
    elected: Vec<u32>,
    excluded: Vec<u32>,
    deepest: Vec<usize>,
    exhausted_votes: f64,
    exhausted_papers: u64,
}

pub fn analyze_other(bal: &Ballots, seats: usize, system: System, lot_seed: u64, trunc: Truncation) -> Analysis {
    let lots = lot(lot_seed, bal.c);
    // Meek recounts start from the full count's keep shares, which are usually close.
    let mut trace = MeekTrace::new();
    let full = match system {
        System::MeekStv => meek(bal, seats, &lots, bal.len, None, Some(&mut trace)),
        _ => Outcome { elected: vec![], excluded: vec![], deepest: vec![], exhausted_votes: 0.0, exhausted_papers: 0 },
    };
    let count = |limit: usize| match system {
        System::CambridgeStv => cambridge(bal, seats, &lots, limit),
        System::MeekStv => meek(bal, seats, &lots, limit, Some(&trace), None),
        System::ExpandingApprovals => expanding(bal, seats, &lots, limit),
        System::Borda | System::Approval => scores(bal, seats, &lots, limit, system),
        System::ScottishStv => unreachable!("Scottish STV is counted in count.rs"),
    };
    let full = if system == System::MeekStv { full } else { count(bal.len) };
    let v = bal.voters() as f64;
    let winners = sorted(&full.elected);
    let mut reach = vec![0.0; bal.len];
    for (row, &d) in full.deepest.iter().enumerate() {
        for x in reach.iter_mut().take(d + 1) {
            *x += bal.mult(row) as f64;
        }
    }
    let deepest = full.deepest.iter().copied().max().unwrap_or(0);
    let mut out = Analysis {
        winners: winners.clone(),
        elected_order: full.elected.clone(),
        excluded_order: full.excluded.clone(),
        reach_pct: reach.iter().map(|x| 100.0 * x / v).collect(),
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
    // Cutting at k changes nothing if no ballot was counted past rank k.
    let len = bal.len;
    let mut winners_at = vec![winners.clone(); len];
    for k in 1..=deepest.min(len) {
        winners_at[k - 1] = sorted(&count(k).elected);
    }
    let changed: Vec<bool> = winners_at.iter().map(|w| *w != winners).collect();
    let mut mask = vec![false; bal.c];
    for &w in &winners {
        mask[w as usize] = true;
    }
    out.cutoff_rank = Some(changed.iter().rposition(|&c| c).map_or(1, |k| k + 2));
    out.changed = Some(changed);
    if trunc == Truncation::Winners {
        out.seats_changed = Some(winners_at.iter().map(|w| w.iter().filter(|c| !mask[**c as usize]).count() as u32).collect());
        out.winners_at = Some(winners_at);
    }
    out
}

/// Winners by Meek STV (in order of election), starting from the trace of a count of nearly
/// the same ballots if given, and recording this count's trace if asked.
pub fn meek_winners(bal: &Ballots, seats: usize, lot_seed: u64, start: Option<&MeekTrace>, trace: Option<&mut MeekTrace>) -> Vec<u32> {
    meek(bal, seats, &lot(lot_seed, bal.c), bal.len, start, trace).elected
}

/// The expanding approvals rule, reading only the first `limit` ranks of each ballot.
fn expanding(bal: &Ballots, seats: usize, lots: &[u64], limit: usize) -> Outcome {
    let (c, len) = (bal.c, bal.len);
    let limit = limit.min(len);
    let quota = (bal.voters() / (seats as u64 + 1) + 1) as f64;
    let eps = 1e-9 * quota;
    // Each candidate's ballots: (row, rank index).
    let mut on: Vec<Vec<(usize, usize)>> = vec![Vec::new(); c];
    for row in 0..bal.rows() {
        for (j, &x) in bal.row(row).iter().take(limit).enumerate() {
            if x == NONE {
                break;
            }
            on[x as usize].push((row, j));
        }
    }
    let mut left = vec![1.0f64; bal.rows()]; // unspent share of each voter's vote
    let mut support = vec![0.0f64; c];
    let mut hopeful = vec![true; c];
    let mut elected: Vec<u32> = Vec::new();
    let mut deepest = vec![0usize; bal.rows()];
    // Most support first; equal support, highest lot first.
    let strongest = |hopeful: &[bool], support: &[f64]| (0..c).filter(|&x| hopeful[x]).max_by_key(|&x| (OrdF(support[x]), lots[x]));
    // Elects x at layer `depth` (rank indexes up to it); x's supporters pay `pay` of their unspent votes in all.
    let elect = |x: usize, depth: usize, all: bool, left: &mut Vec<f64>, support: &mut Vec<f64>, hopeful: &mut Vec<bool>, elected: &mut Vec<u32>| {
        hopeful[x] = false;
        elected.push(x as u32);
        let share = if all || support[x] <= 0.0 { 1.0 } else { (quota / support[x]).min(1.0) };
        for &(row, j) in &on[x] {
            if j > depth || left[row] <= 0.0 {
                continue;
            }
            let paid = left[row] * share;
            left[row] -= paid;
            let m = bal.mult(row) as f64;
            for &y in bal.row(row).iter().take(depth + 1).take_while(|&&y| y != NONE) {
                support[y as usize] -= m * paid;
            }
        }
    };
    for depth in 0..limit {
        for row in 0..bal.rows() {
            let x = bal.prefs[row * len + depth];
            if x != NONE && left[row] > 0.0 {
                support[x as usize] += bal.mult(row) as f64 * left[row];
                deepest[row] = depth;
            }
        }
        while elected.len() < seats {
            match strongest(&hopeful, &support) {
                Some(x) if support[x] >= quota - eps => elect(x, depth, false, &mut left, &mut support, &mut hopeful, &mut elected),
                _ => break,
            }
        }
    }
    // Past the last rank: the most supported hopeful, whose supporters spend everything.
    while elected.len() < seats {
        let Some(x) = strongest(&hopeful, &support) else { break };
        elect(x, limit.saturating_sub(1), true, &mut left, &mut support, &mut hopeful, &mut elected);
    }
    // Losers, weakest first.
    let mut excluded: Vec<usize> = (0..c).filter(|&x| hopeful[x]).collect();
    excluded.sort_by_key(|&x| (OrdF(support[x]), lots[x]));
    let unspent: f64 = (0..bal.rows()).map(|r| bal.mult(r) as f64 * left[r]).sum();
    let untouched = (0..bal.rows()).filter(|&r| left[r] > 1.0 - 1e-9).map(|r| bal.mult(r)).sum();
    Outcome { elected, excluded: excluded.into_iter().map(|x| x as u32).collect(), deepest, exhausted_votes: unspent, exhausted_papers: untouched }
}

/// Borda or approval, reading only the first `limit` ranks of each ballot.
fn scores(bal: &Ballots, seats: usize, lots: &[u64], limit: usize, system: System) -> Outcome {
    let c = bal.c;
    let mut pts = vec![0u64; c];
    let mut deepest = vec![0; bal.rows()];
    for row in 0..bal.rows() {
        let m = bal.mult(row);
        for (r, &x) in bal.row(row).iter().take(limit).enumerate() {
            if x == NONE {
                break;
            }
            pts[x as usize] += m * if system == System::Borda { (c - 1 - r) as u64 } else { 1 };
            deepest[row] = r;
        }
    }
    // Highest points first; equal points by lot.
    let mut order: Vec<u32> = (0..c as u32).collect();
    order.sort_by(|&a, &b| pts[b as usize].cmp(&pts[a as usize]).then(lots[b as usize].cmp(&lots[a as usize])));
    let mut excluded = order[seats..].to_vec();
    excluded.reverse();
    Outcome { elected: order[..seats].to_vec(), excluded, deepest, exhausted_votes: 0.0, exhausted_papers: 0 }
}

/// Cambridge STV, reading only the first `limit` ranks of each ballot.
fn cambridge(bal: &Ballots, seats: usize, lots: &[u64], limit: usize) -> Outcome {
    const HOPEFUL: u8 = 0;
    const ELECTED: u8 = 1;
    const OUT: u8 = 2;
    let (c, len) = (bal.c, bal.len);
    let limit = limit.min(len);
    let v = bal.voters();
    let quota = v / (seats as u64 + 1) + 1;
    let mut st = vec![HOPEFUL; c];
    let mut tot = vec![0u64; c];
    // Each candidate's ballots, in the order counted: (row, rank index).
    let mut pile: Vec<Vec<(u32, usize)>> = vec![Vec::new(); c];
    let mut deepest = vec![0usize; bal.rows()];
    let mut elected = Vec::new();
    let mut excluded = Vec::new();
    let (mut exhausted_votes, mut exhausted_papers) = (0.0, 0u64);
    for row in 0..bal.rows() {
        let x = bal.prefs[row * len];
        if x != NONE {
            pile[x as usize].push((row as u32, 0));
            tot[x as usize] += bal.mult(row);
        }
    }
    // The next continuing choice on a ballot after rank index i, within the limit.
    let next = |st: &[u8], row: usize, i: usize| -> Option<usize> {
        (i + 1..limit).find(|&j| {
            let x = bal.prefs[row * len + j];
            x != NONE && st[x as usize] == HOPEFUL
        })
    };
    // Lowest total first; equal totals, lowest lot first.
    let lowest = |st: &[u8], tot: &[u64]| (0..c).filter(|&x| st[x] == HOPEFUL).min_by_key(|&x| (tot[x], lots[x]));

    // First count: everyone at the quota is elected, in order of votes.
    let mut first: Vec<usize> = (0..c).filter(|&x| tot[x] >= quota).collect();
    first.sort_by_key(|&x| (std::cmp::Reverse(tot[x]), std::cmp::Reverse(lots[x])));
    for &x in &first {
        st[x] = ELECTED;
        elected.push(x as u32);
    }
    // Moves one ballot on to its next continuing choice; elects anyone who reaches the quota.
    let mut give = |st: &mut Vec<u8>, tot: &mut Vec<u64>, pile: &mut Vec<Vec<(u32, usize)>>, elected: &mut Vec<u32>, row: usize, j: usize| {
        let x = bal.prefs[row * len + j] as usize;
        pile[x].push((row as u32, j));
        tot[x] += bal.mult(row);
        deepest[row] = deepest[row].max(j);
        if tot[x] >= quota && st[x] == HOPEFUL && elected.len() < seats {
            st[x] = ELECTED;
            elected.push(x as u32);
        }
    };
    // Surpluses from the first count, largest first, by the Cincinnati method.
    for &x in &first {
        if elected.len() >= seats {
            break;
        }
        let surplus = tot[x] - quota;
        if surplus == 0 {
            continue;
        }
        let n = ((tot[x] as f64 / surplus as f64).round() as usize).max(1);
        let papers = std::mem::take(&mut pile[x]);
        let mut taken = vec![false; papers.len()];
        let mut moved = 0u64;
        // Every n-th ballot with a continuing choice; skip ones without; go round again from
        // the start if the surplus isn't gone yet and there are ballots left to move.
        let movable = |st: &[u8], taken: &[bool], p: usize| !taken[p] && next(st, papers[p].0 as usize, papers[p].1).is_some();
        let mut pos = n - 1;
        while moved < surplus {
            // The first ballot that can move at or after `pos`; past the end, round again from
            // the n-th ballot, then from the first. None left anywhere: the rest of the surplus
            // stays with the winner.
            let len_p = papers.len();
            let Some(p) = (pos.min(len_p)..len_p).chain((n - 1).min(len_p)..len_p).chain(0..len_p).find(|&p| movable(&st, &taken, p)) else { break };
            let (row, i) = (papers[p].0 as usize, papers[p].1);
            let j = next(&st, row, i).unwrap();
            taken[p] = true;
            moved += bal.mult(row);
            tot[x] -= bal.mult(row);
            give(&mut st, &mut tot, &mut pile, &mut elected, row, j);
            pos = p + n;
        }
        pile[x] = papers.into_iter().zip(taken).filter(|(_, t)| !t).map(|(p, _)| p).collect();
    }
    // Exclusions, one at a time.
    while elected.len() < seats {
        let hopeful = (0..c).filter(|&x| st[x] == HOPEFUL).count();
        if hopeful + elected.len() <= seats {
            let mut rest: Vec<usize> = (0..c).filter(|&x| st[x] == HOPEFUL).collect();
            rest.sort_by_key(|&x| (std::cmp::Reverse(tot[x]), std::cmp::Reverse(lots[x])));
            for x in rest {
                st[x] = ELECTED;
                elected.push(x as u32);
            }
            break;
        }
        let x = lowest(&st, &tot).unwrap();
        st[x] = OUT;
        excluded.push(x as u32);
        for (row, i) in std::mem::take(&mut pile[x]) {
            let row = row as usize;
            match next(&st, row, i) {
                Some(j) if elected.len() < seats => give(&mut st, &mut tot, &mut pile, &mut elected, row, j),
                Some(_) => {}
                None => {
                    exhausted_votes += bal.mult(row) as f64;
                    exhausted_papers += bal.mult(row);
                }
            }
        }
        tot[x] = 0;
    }
    // Candidates never excluded or elected count as the strongest losers, strongest last.
    let mut rest: Vec<usize> = (0..c).filter(|&x| st[x] == HOPEFUL).collect();
    rest.sort_by_key(|&x| (tot[x], lots[x]));
    excluded.extend(rest.into_iter().map(|x| x as u32));
    Outcome { elected, excluded, deepest, exhausted_votes, exhausted_papers }
}

/// Each stage of a Meek count: who was elected or out, and the keep shares it settled on. A
/// recount of nearly the same ballots starts each matching stage from these keep shares.
pub type MeekTrace = Vec<(Vec<u8>, Vec<f64>)>;

/// Meek STV, reading only the first `limit` ranks of each ballot. `start` is the trace of a
/// count of nearly the same ballots, if any; `trace` records this count's.
fn meek(bal: &Ballots, seats: usize, lots: &[u64], limit: usize, start: Option<&MeekTrace>, mut trace: Option<&mut MeekTrace>) -> Outcome {
    const HOPEFUL: u8 = 0;
    const ELECTED: u8 = 1;
    const OUT: u8 = 2;
    let (c, len) = (bal.c, bal.len);
    let limit = limit.min(len);
    let v = bal.voters() as f64;
    let parts = seats as f64 + 1.0;
    // Convergence and election margin, in votes.
    let tol = 1e-9 * v.max(1.0);
    let mut st = vec![HOPEFUL; c];
    let mut keep = vec![1.0f64; c];
    let mut deepest = vec![0usize; bal.rows()];
    let mut elected: Vec<u32> = Vec::new();
    let mut excluded = Vec::new();
    // One pass over the ballots: each candidate's votes, the votes and ballots exhausted, and
    // which hopefuls could gain from a winner's surplus (those ranked after a winner, before
    // any other hopeful).
    let tally = |st: &[u8], keep: &[f64], deepest: &mut Vec<usize>| {
        let mut votes = vec![0.0; c];
        let mut exposed = vec![false; c];
        let (mut gone, mut gone_papers) = (0.0, 0u64);
        for row in 0..bal.rows() {
            let m = bal.mult(row) as f64;
            let mut left = 1.0;
            let mut via = false;
            for (j, &x) in bal.row(row).iter().take(limit).enumerate() {
                if x == NONE {
                    break;
                }
                let x = x as usize;
                if left <= 1e-12 {
                    // Nothing reaches x now, but would if a winner before x kept less.
                    if via && st[x] == HOPEFUL {
                        exposed[x] = true;
                    }
                    if !via || st[x] == HOPEFUL {
                        break;
                    }
                    continue;
                }
                let k = keep[x];
                if k > 0.0 {
                    votes[x] += m * left * k;
                    left *= 1.0 - k;
                    deepest[row] = deepest[row].max(j);
                }
                match st[x] {
                    ELECTED => via = true,
                    HOPEFUL => exposed[x] |= via,
                    _ => {}
                }
            }
            gone += m * left;
            if left > 1.0 - 1e-9 {
                gone_papers += bal.mult(row);
            }
        }
        (votes, gone, gone_papers, exposed)
    };
    let by_votes = |votes: &[f64], x: &usize| (std::cmp::Reverse(OrdF(votes[*x])), std::cmp::Reverse(lots[*x]));
    for stage in 0.. {
        if let Some((s, k)) = start.and_then(|t| t.get(stage)) {
            if *s == st {
                keep.clone_from(k);
            }
        }
        // Adjust the winners' keep shares until each sits at the quota, or until what is left
        // of their surpluses can no longer change the next step.
        let (mut votes, mut gone, mut gone_papers, mut exposed);
        let mut quota;
        let mut rounds = 0;
        loop {
            (votes, gone, gone_papers, exposed) = tally(&st, &keep, &mut deepest);
            quota = (v - gone) / parts;
            rounds += 1;
            if elected.len() >= seats || rounds > 1000 {
                break;
            }
            let (mut surplus, mut under) = (0.0, false);
            for &e in &elected {
                let d = votes[e as usize] - quota;
                surplus += d.abs();
                under |= d < -tol;
            }
            if surplus <= tol {
                break;
            }
            // With every winner at or over the quota, keep shares only come down from here,
            // so hopefuls only gain. The winners free at most `freed` votes in all: their
            // surplus, plus what the quota's fall takes off each of them; the quota falls by
            // at most freed ÷ (seats + 1).
            if !under {
                let freed = surplus * parts / (parts - elected.len() as f64);
                if next_step_is_certain(&st, &votes, &exposed, lots, quota, freed, quota - freed / parts - tol, tol, seats - elected.len()) {
                    break;
                }
            }
            for &e in &elected {
                let e = e as usize;
                if votes[e] > 0.0 {
                    keep[e] = (keep[e] * quota / votes[e]).min(1.0);
                }
            }
        }
        if let Some(t) = trace.as_deref_mut() {
            t.push((st.clone(), keep.clone()));
        }
        if elected.len() >= seats {
            return finish(st, votes, gone, gone_papers, elected, excluded, deepest, lots);
        }
        let mut over: Vec<usize> = (0..c).filter(|&x| st[x] == HOPEFUL && votes[x] > quota + tol).collect();
        if !over.is_empty() {
            over.sort_by_key(|x| by_votes(&votes, x));
            for x in over.into_iter().take(seats - elected.len()) {
                st[x] = ELECTED;
                elected.push(x as u32);
            }
            continue;
        }
        let mut rest: Vec<usize> = (0..c).filter(|&x| st[x] == HOPEFUL).collect();
        if rest.len() + elected.len() <= seats {
            rest.sort_by_key(|x| by_votes(&votes, x));
            for x in rest {
                st[x] = ELECTED;
                elected.push(x as u32);
            }
            return finish(st, votes, gone, gone_papers, elected, excluded, deepest, lots);
        }
        // Lowest total first; equal totals, lowest lot first.
        let x = *rest.iter().min_by_key(|&&x| (OrdF(votes[x]), lots[x])).unwrap();
        st[x] = OUT;
        keep[x] = 0.0;
        excluded.push(x as u32);
    }
    unreachable!();

    /// Whether the rest of the winners' surpluses can no longer change the next step. Hopefuls
    /// gain at most `freed` votes, and only those ranked after a winner (`exposed`) gain at
    /// all; the quota falls no lower than `floor`. Certain if everyone who could end up over
    /// the quota is over it already and fits in the seats left (they will be elected, now or a
    /// step later), or, if no one could end up over it, the lowest hopeful (lowest lot on equal
    /// votes) will stay lowest.
    #[allow(clippy::too_many_arguments)]
    fn next_step_is_certain(st: &[u8], votes: &[f64], exposed: &[bool], lots: &[u64], quota: f64, freed: f64, floor: f64, tol: f64, seats_left: usize) -> bool {
        let most = |x: usize| if exposed[x] { votes[x] + freed } else { votes[x] };
        let hopeful = || (0..st.len()).filter(|&x| st[x] == HOPEFUL);
        let over = hopeful().filter(|&x| votes[x] > quota + tol).count();
        let could = hopeful().filter(|&x| most(x) > floor).count();
        if over > 0 {
            return could <= seats_left;
        }
        if could > 0 {
            return false;
        }
        let Some(low) = hopeful().min_by_key(|&x| (OrdF(votes[x]), lots[x])) else { return true };
        hopeful().all(|y| y == low || most(low) < votes[y] - tol || (!exposed[low] && votes[y] == votes[low] && lots[low] < lots[y]))
    }

    #[allow(clippy::too_many_arguments)]
    fn finish(st: Vec<u8>, votes: Vec<f64>, gone: f64, gone_papers: u64, elected: Vec<u32>, mut excluded: Vec<u32>, deepest: Vec<usize>, lots: &[u64]) -> Outcome {
        // Candidates never excluded or elected count as the strongest losers, strongest last.
        let mut rest: Vec<usize> = (0..st.len()).filter(|&x| st[x] == HOPEFUL).collect();
        rest.sort_by_key(|&x| (OrdF(votes[x]), lots[x]));
        excluded.extend(rest.into_iter().map(|x| x as u32));
        Outcome { elected, excluded, deepest, exhausted_votes: gone, exhausted_papers: gone_papers }
    }
}

/// Orders vote totals, which are never NaN.
struct OrdF(f64);
impl PartialEq for OrdF {
    fn eq(&self, o: &Self) -> bool {
        self.cmp(o).is_eq()
    }
}
impl Eq for OrdF {}
impl PartialOrd for OrdF {
    fn partial_cmp(&self, o: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(o))
    }
}
impl Ord for OrdF {
    fn cmp(&self, o: &Self) -> std::cmp::Ordering {
        self.0.total_cmp(&o.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ballots(c: usize, rows: &[(u64, &[u32])]) -> Ballots {
        let len = rows.iter().map(|r| r.1.len()).max().unwrap();
        let mut prefs = vec![NONE; rows.len() * len];
        for (i, r) in rows.iter().enumerate() {
            prefs[i * len..i * len + r.1.len()].copy_from_slice(r.1);
        }
        Ballots { c, len, prefs, mult: Some(rows.iter().map(|r| r.0).collect()) }
    }

    fn one_each(c: usize, rows: &[(usize, &[u32])]) -> Ballots {
        let mut all: Vec<(u64, &[u32])> = Vec::new();
        for &(n, r) in rows {
            for _ in 0..n {
                all.push((1, r));
            }
        }
        ballots(c, &all)
    }

    /// Borda, 4 candidates, so rank 1 is worth 3 points, rank 2 is 2, rank 3 is 1.
    /// 5 voters rank A B C; 4 rank B C A; 2 rank C B.
    /// A: 5×3 + 4×1 = 19. B: 5×2 + 4×3 + 2×2 = 26. C: 5×1 + 4×2 + 2×3 = 19. D: 0.
    /// One seat: B. Cut after rank 1: A 15, B 12, C 6, so A.
    /// Two seats: B, then A and C tie at 19, decided by lot. Cut after rank 1: A and B.
    #[test]
    fn borda_by_hand() {
        let b = ballots(4, &[(5, &[0, 1, 2]), (4, &[1, 2, 0]), (2, &[2, 1])]);
        let a = analyze_other(&b, 1, System::Borda, 1, Truncation::Winners);
        assert_eq!(a.winners, vec![1]);
        assert_eq!(a.winners_at, Some(vec![vec![0], vec![1], vec![1]]));
        assert_eq!(a.cutoff_rank, Some(2));
        assert_eq!(a.excluded_order[0], 3);
        let two = analyze_other(&b, 2, System::Borda, 1, Truncation::Winners);
        assert!(two.winners == vec![0, 1] || two.winners == vec![1, 2]);
        assert_eq!(two.winners_at.as_ref().unwrap()[0], vec![0, 1]);
        // Every rank counts under Borda: reach is the share of ballots with a name at each rank.
        assert_eq!(a.reach_pct, vec![100.0, 100.0, 100.0 * 9.0 / 11.0]);
    }

    /// Approval: everyone a voter ranks is approved.
    /// 4 voters rank A B; 3 rank C B; 2 rank D. Approvals: A 4, B 7, C 3, D 2.
    /// Two seats: B and A. Cut after rank 1: A 4, C 3, D 2, B 0, so A and C.
    #[test]
    fn approval_by_hand() {
        let b = ballots(4, &[(4, &[0, 1]), (3, &[2, 1]), (2, &[3])]);
        let a = analyze_other(&b, 2, System::Approval, 1, Truncation::Winners);
        assert_eq!(a.winners, vec![0, 1]);
        assert_eq!(a.winners_at, Some(vec![vec![0, 2], vec![0, 1]]));
        assert_eq!(a.seats_changed, Some(vec![1, 0]));
        assert_eq!(a.cutoff_rank, Some(2));
        assert_eq!(a.elected_order, vec![1, 0]);
        assert_eq!(a.excluded_order, vec![3, 2]);
    }

    /// Cambridge STV, 2 seats, 12 voters, quota 12 ÷ 3 + 1 = 5.
    /// First count: A 8 (6 rank A B, 2 rank A C), B 1, C 2, D 1 (D then B).
    /// A's surplus is 3; n = 8 ÷ 3 = 2.67, rounded to 3. A's ballots in order: A B ×6, then A C ×2.
    /// Every 3rd: ballots 3, 6 (both A B), and then the count reaches the end, so it goes round
    /// again from ballot 3, which is taken, and moves on to 4 (A B). B gets 3 ballots: 4 votes.
    /// C 2, D 1, so D is excluded and D's ballot goes to B: 5, the quota. Winners A and B.
    /// Cut after rank 1: no ballot can move, so no one else reaches the quota. B and D (1 each)
    /// are excluded, and C (2) is the only one left for the last seat: winners A and C.
    #[test]
    fn cambridge_by_hand() {
        let b = one_each(4, &[(6, &[0, 1]), (2, &[0, 2]), (1, &[1]), (2, &[2]), (1, &[3, 1])]);
        let a = analyze_other(&b, 2, System::CambridgeStv, 1, Truncation::Winners);
        assert_eq!(a.winners, vec![0, 1]);
        assert_eq!(a.elected_order, vec![0, 1]);
        assert_eq!(a.excluded_order[0], 3);
        assert_eq!(a.winners_at.as_ref().unwrap()[0], vec![0, 2]);
        assert_eq!(a.cutoff_rank, Some(2));
    }

    /// Cambridge: whole ballots only. A candidate who reaches the quota after the first count
    /// keeps every ballot they have, and later ballots skip them.
    /// 3 seats, 15 voters, quota 15 ÷ 4 + 1 = 4.
    /// A 3 (A B), B 3 (B), C 3 (C), D 2 (D A), E 2 (E A C), F 2 (F C).
    /// No one has the quota. D, E, F tie at 2; by lot one goes. Whichever goes, A or C reaches 4
    /// or 5 and is elected; ballots arriving later skip them.
    #[test]
    fn cambridge_skips_elected() {
        let b = one_each(6, &[(3, &[0, 1]), (3, &[1]), (3, &[2]), (2, &[3, 0]), (2, &[4, 0, 2]), (2, &[5, 2])]);
        for seed in 1..20 {
            let a = analyze_other(&b, 3, System::CambridgeStv, seed, Truncation::Off);
            assert_eq!(a.winners.len(), 3);
            assert!(a.winners.contains(&0), "seed {seed}: {:?}", a.winners);
            assert!(a.winners.contains(&2), "seed {seed}: {:?}", a.winners);
        }
    }

    /// Meek STV, 3 seats, 24 voters: 12 rank A B C, 4 rank B, 3 rank C, 5 rank D.
    /// No ballots exhaust at first, so the quota is 24 ÷ 4 = 6. A (12) is elected and keeps
    /// half of each vote (6), passing 6 to B: 10, so B is elected too. B keeps 0.6 (6 of 10),
    /// passing 12 × 0.5 × 0.4 = 2.4 to C: 5.4. D has 5, so D is excluded, and C is the only
    /// hopeful left for the last seat. Winners A, B, C.
    /// Cut after rank 2: B's votes from A now stop at B, and whatever B doesn't keep exhausts.
    /// With A and B at the quota q, everyone else's votes are 3 + 5, so q = (2q + 8) ÷ 4 = 4.
    /// D (5) is over it and wins; C (3) is not. Winners A, B, D.
    /// Cut after rank 1: A's surplus exhausts. q = (q + 12) ÷ 4 = 4, so D (5) is elected, B (4)
    /// is not yet; then q = (2q + 7) ÷ 4 = 3.5, and B (4) is elected. Winners A, B, D.
    #[test]
    fn meek_by_hand() {
        let b = ballots(4, &[(12, &[0, 1, 2]), (4, &[1]), (3, &[2]), (5, &[3])]);
        let a = analyze_other(&b, 3, System::MeekStv, 1, Truncation::Winners);
        assert_eq!(a.winners, vec![0, 1, 2]);
        assert_eq!(a.elected_order, vec![0, 1, 2]);
        assert_eq!(a.excluded_order, vec![3]);
        assert_eq!(a.winners_at, Some(vec![vec![0, 1, 3], vec![0, 1, 3], vec![0, 1, 2]]));
        assert_eq!(a.seats_changed, Some(vec![1, 1, 0]));
        assert_eq!(a.cutoff_rank, Some(3));
        assert_eq!(a.reach_pct, vec![100.0, 50.0, 50.0]);
    }

    /// Meek and Cambridge agree where whole ballots can move exactly: the 2-seat election from
    /// `cambridge_by_hand`. Quota 12 ÷ 3 = 4. A (8) keeps half: B 1 + 3 = 4, C 2 + 1 = 3, D 1.
    /// B is at the quota, not over it, so D is excluded, and D's ballot takes B to 5. Winners
    /// A and B. Cut after rank 1: A's surplus exhausts, q = (q + 4) ÷ 3 = 2. C (2) is not over
    /// it; B and D tie at 1 and one goes by lot. Then q = (q + 3) ÷ 3 = 1.5 and C (2) wins.
    #[test]
    fn meek_matches_cambridge_by_hand() {
        let b = one_each(4, &[(6, &[0, 1]), (2, &[0, 2]), (1, &[1]), (2, &[2]), (1, &[3, 1])]);
        for seed in 1..10 {
            let a = analyze_other(&b, 2, System::MeekStv, seed, Truncation::Winners);
            assert_eq!(a.winners, vec![0, 1]);
            assert_eq!(a.excluded_order[0], 3);
            assert_eq!(a.winners_at.as_ref().unwrap()[0], vec![0, 2], "seed {seed}");
            assert_eq!(a.cutoff_rank, Some(2));
        }
    }

    /// Meek: a winner's surplus passes through another winner. 2 seats, 30 voters.
    /// 14 rank A B C, 10 rank B, 6 rank D. Quota 30 ÷ 3 = 10. A (14) keeps 10/14, passing 4
    /// to B, who is already at 10 and so elected with 14 too. Both winners are elected on the
    /// first count, so the count ends: A and B.
    /// With 3 seats, C gets what passes through both A and B: with A and B at the quota q,
    /// 14 × (1 − kA) × (1 − kB) reaches C. D (6) stays, so C and D compete for the last seat.
    /// A = 14 kA = q; B = (10 + 14 (1 − kA)) kB = q; C = 14 (1 − kA)(1 − kB); no votes exhaust,
    /// so q = 30 ÷ 4 = 7.5. kA = 15/28, B gets 10 + 6.5 = 16.5, kB = 15/33, and C gets
    /// 6.5 × 18/33 = 3.545. D (6) is over C, so C is excluded and D wins: A, B, D.
    #[test]
    fn meek_passes_through_winners() {
        let b = ballots(4, &[(14, &[0, 1, 2]), (10, &[1]), (6, &[3])]);
        let two = analyze_other(&b, 2, System::MeekStv, 1, Truncation::Off);
        assert_eq!(two.winners, vec![0, 1]);
        let three = analyze_other(&b, 3, System::MeekStv, 1, Truncation::Off);
        assert_eq!(three.winners, vec![0, 1, 3]);
        assert_eq!(three.excluded_order, vec![2]);
        assert_eq!(three.reach_pct[2], 100.0 * 14.0 / 30.0);
    }

    /// Expanding approvals, 1 seat, 100 voters, quota 100 ÷ 2 + 1 = 51 (the example for the
    /// owner). 40 rank A B, 35 rank B, 25 rank C A. First choices: A 40, B 35, C 25, nobody
    /// at 51. First two choices: B 75, A 65, so B wins. If A's voters rank only A, A has 65
    /// and B 35, so A wins: ranking B second cost A the seat. Cut after rank 1: nobody reaches
    /// the quota, so the most supported, A (40), wins.
    #[test]
    fn expanding_by_hand() {
        let b = ballots(3, &[(40, &[0, 1]), (35, &[1]), (25, &[2, 0])]);
        let a = analyze_other(&b, 1, System::ExpandingApprovals, 1, Truncation::Winners);
        assert_eq!(a.winners, vec![1]);
        assert_eq!(a.winners_at, Some(vec![vec![0], vec![1]]));
        assert_eq!(a.cutoff_rank, Some(2));
        let only_a = ballots(3, &[(40, &[0]), (35, &[1]), (25, &[2, 0])]);
        assert_eq!(analyze_other(&only_a, 1, System::ExpandingApprovals, 1, Truncation::Off).winners, vec![0]);
    }

    /// Expanding approvals is proportional: 5 seats, 60 voters rank A1 to A5, 40 rank B1 to B5.
    /// Quota 100 ÷ 6 + 1 = 17. First choices: A1 (60) is elected, and A's voters pay 17, leaving
    /// 43; then B1 (40), leaving B's voters 23. Second choices: A2 (43), leaving 26; B2 (23),
    /// leaving 6. Third choices: A3 (26). Winners A1, B1, A2, B2, A3: 3 seats to 2.
    #[test]
    fn expanding_is_proportional() {
        let b = ballots(10, &[(60, &[0, 1, 2, 3, 4]), (40, &[5, 6, 7, 8, 9])]);
        let a = analyze_other(&b, 5, System::ExpandingApprovals, 1, Truncation::Off);
        assert_eq!(a.elected_order, vec![0, 5, 1, 6, 2]);
        assert!((a.exhausted_votes_pct - 15.0).abs() < 1e-9, "{}", a.exhausted_votes_pct);
    }
}
