//! The statistics the model tuner compares between simulated and real elections. These are
//! the same definitions as `data/calibration.py` and `data/model_check.py` (which measure the
//! real elections); `data/check_stats.py` checks that both give the same numbers on the same
//! ballot files.

use crate::ballots::{Ballots, NONE};
use serde::Serialize;

#[derive(Clone, Debug, Default, Serialize)]
pub struct ElectionStats {
    /// Top candidate's first choices as a multiple of the quota, 1 / (seats + 1).
    pub quota: f64,
    /// Top and last candidates' first choices as multiples of an even split, 1 / candidates.
    pub even_top: f64,
    pub even_last: f64,
    /// Average ballot length.
    pub length_mean: f64,
    /// Share who rank every candidate.
    pub complete: f64,
    /// Share who rank exactly the limit, where the ballot sets one below the number of candidates.
    pub fills_limit: Option<f64>,
    /// Among voters whose first choice has a running mate, the share who rank one second, minus
    /// what popularity alone predicts.
    pub clustering: Option<f64>,
    /// How evenly next choices that leave a candidate's slate spread over other candidates.
    pub evenness: Option<f64>,
    /// Shares of candidates with a running mate, their slate's only candidate, or in no slate.
    pub running_mate: Option<f64>,
    pub only_candidate: Option<f64>,
    pub no_slate: Option<f64>,
    /// Share of voters ranking 1, 2, ... candidates.
    pub length_shares: Vec<f64>,
    /// First-choice shares, largest first.
    pub first_sorted: Vec<f64>,
}

fn entropy(counts: &[f64]) -> f64 {
    let total: f64 = counts.iter().sum();
    -counts.iter().filter(|&&c| c > 0.0).map(|&c| c / total * (c / total).ln()).sum::<f64>()
}

/// Measures one election. `slate_of` gives each candidate's slate (or party), or `None` for a
/// candidate in none; pass `None` for the whole list when the election has no party or slate
/// information, and the statistics that need it are left out (as data/calibration.py does). With `merge_last`, ranking all but one counts as ranking all (union and
/// society files leave out an implied last place).
pub fn measure(b: &Ballots, seats: usize, slates: Option<&[Option<usize>]>, max_ranks: Option<usize>, merge_last: bool) -> ElectionStats {
    let c = b.c;
    let known = slates.is_some();
    let none = vec![None; c];
    let slate_of = slates.unwrap_or(&none);
    let rows: Vec<(f64, &[u32])> = (0..b.rows())
        .map(|i| {
            let r = b.row(i);
            (b.mult(i) as f64, &r[..r.iter().position(|&x| x == NONE).unwrap_or(r.len())])
        })
        .filter(|(w, r)| *w > 0.0 && !r.is_empty())
        .collect();
    let total: f64 = rows.iter().map(|r| r.0).sum();
    // First choices.
    let mut first = vec![0.0; c];
    for (w, r) in &rows {
        first[r[0] as usize] += w;
    }
    let shares: Vec<f64> = first.iter().map(|x| x / total).collect();
    let mut sorted = shares.clone();
    sorted.sort_by(|a, b| b.partial_cmp(a).unwrap());
    // Ballot length.
    let mut by_len = vec![0.0; c + 1];
    for (w, r) in &rows {
        let mut l = r.len().min(c);
        if merge_last && c >= 2 && l == c - 1 {
            l = c;
        }
        by_len[l] += w;
    }
    let length_mean = (1..=c).map(|l| l as f64 * by_len[l]).sum::<f64>() / total;
    let full = if merge_last { c.saturating_sub(1).max(1) } else { c };
    let complete = (full..=c).map(|l| by_len[l]).sum::<f64>() / total;
    let fills_limit = max_ranks.filter(|&m| m >= 1 && m < c).map(|m| by_len[m] / total);
    // Groups: a slate, or a group of its own for a candidate in no slate.
    let groups: Vec<usize> = (0..c).map(|k| slate_of[k].unwrap_or(usize::MAX - k)).collect();
    let size = |g: usize| groups.iter().filter(|&&x| x == g).count();
    let any_slate = slate_of.iter().any(|s| s.is_some());
    // Clustering.
    let clustering = if any_slate {
        let (mut elig, mut same, mut pop) = (0.0, 0.0, 0.0);
        for (w, r) in &rows {
            let f = r[0] as usize;
            let g = groups[f];
            if slate_of[f].is_none() || size(g) < 2 || r.len() < 2 {
                continue;
            }
            elig += w;
            let rest = 1.0 - shares[f];
            if rest > 0.0 {
                pop += w * (0..c).filter(|&m| m != f && groups[m] == g).map(|m| shares[m]).sum::<f64>() / rest;
            }
            if groups[r[1] as usize] == g {
                same += w;
            }
        }
        (elig > 0.0).then(|| same / elig - pop / elig)
    } else {
        None
    };
    // Evenness of next choices that leave each candidate's slate, weighted by voters with a next choice.
    let mut next = vec![vec![0.0; c]; c];
    for (w, r) in &rows {
        if r.len() >= 2 {
            next[r[0] as usize][r[1] as usize] += w;
        }
    }
    let (mut num, mut den) = (0.0, 0.0);
    for k in 0..c {
        let n: f64 = next[k].iter().sum();
        if n == 0.0 {
            continue;
        }
        let others: Vec<f64> = (0..c).filter(|&d| d != k && groups[d] != groups[k]).map(|d| next[k][d]).collect();
        if others.len() < 2 || others.iter().sum::<f64>() == 0.0 {
            continue;
        }
        num += entropy(&others) / (others.len() as f64).ln() * n;
        den += n;
    }
    let evenness = (known && den > 0.0).then(|| num / den);
    // Candidate kinds.
    let (running_mate, only_candidate, no_slate) = if any_slate {
        let cf = c as f64;
        let rm = (0..c).filter(|&k| slate_of[k].is_some() && size(groups[k]) >= 2).count() as f64 / cf;
        let only = (0..c).filter(|&k| slate_of[k].is_some() && size(groups[k]) == 1).count() as f64 / cf;
        let none = (0..c).filter(|&k| slate_of[k].is_none()).count() as f64 / cf;
        (Some(rm), Some(only), Some(none))
    } else {
        (None, None, None)
    };
    ElectionStats {
        quota: sorted[0] * (seats + 1) as f64,
        even_top: sorted[0] * c as f64,
        even_last: sorted[c - 1] * c as f64,
        length_mean,
        complete,
        fills_limit,
        clustering,
        evenness,
        running_mate,
        only_candidate,
        no_slate,
        length_shares: (1..=c).map(|l| by_len[l] / total).collect(),
        first_sorted: sorted,
    }
}

/// The typical (median) value of each statistic across elections, as data/model_check.py
/// takes it: the middle value, or the upper middle of an even count.
pub fn medians(all: &[ElectionStats]) -> serde_json::Value {
    fn med(mut v: Vec<f64>) -> Option<f64> {
        v.sort_by(|a, b| a.partial_cmp(b).unwrap());
        (!v.is_empty()).then(|| v[v.len() / 2])
    }
    let pick = |f: &dyn Fn(&ElectionStats) -> Option<f64>| med(all.iter().filter_map(f).collect());
    serde_json::json!({
        "quota": pick(&|s| Some(s.quota)),
        "even_top": pick(&|s| Some(s.even_top)),
        "even_last": pick(&|s| Some(s.even_last)),
        "length_mean": pick(&|s| Some(s.length_mean)),
        "complete": pick(&|s| Some(s.complete)),
        "fills_limit": pick(&|s| s.fills_limit),
        "clustering": pick(&|s| s.clustering),
        "evenness": pick(&|s| s.evenness),
        "running_mate": pick(&|s| s.running_mate),
        "only_candidate": pick(&|s| s.only_candidate),
        "no_slate": pick(&|s| s.no_slate),
    })
}
