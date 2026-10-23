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
    let count = |limit: usize| match system {
        System::CambridgeStv => cambridge(bal, seats, &lots, limit),
        System::Borda | System::Approval => scores(bal, seats, &lots, limit, system),
        System::ScottishStv => unreachable!("Scottish STV is counted in count.rs"),
    };
    let full = count(bal.len);
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
}
