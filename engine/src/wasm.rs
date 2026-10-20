//! The engine in a web page (WebAssembly), for the model tuner (`tuner/`). The page writes a
//! JSON request into memory from `alloc`, calls `call`, and reads the JSON reply: a 4-byte
//! little-endian length, then the text. The reply stays valid until the next call.
//!
//! Requests:
//! - `{"task": "twins", "electorate": {...}, "model": {...}, "merge_last": bool,
//!    "twins": [{"c", "s", "v", "wording", "n", "seed"}, ...]}`: simulates a twin of each real
//!   election (same candidates, seats, voters, and ballot rules) and measures it (`stats.rs`).
//! - `{"task": "election", "settings": {...}}`: a settings file as JSON; simulates it and returns
//!   one results line per seat count, as `stvsim run` does.
//! - `{"task": "describe", "settings": {...}, "count": n}`: simulates `count` elections from the
//!   settings and measures them: what each setting produces in the viewer's own election.
//! - `{"task": "worth", "settings": {...}, "first": i, "count": n}`: what each ballot position is
//!   worth to a candidate, in simulated elections i to i + n − 1 (`sim::position_worth`): sums
//!   for candidates drawn at random (`any`) and for candidates on the edge (`edge`), so a page
//!   can split the elections across several workers and add the sums.
//! - `{"task": "defaults", "electorate": "public" | "organization", "seats": n}`: what "auto"
//!   and the named settings mean for that type of election.

use crate::model::{self, BallotRules, Electorate, RankCount, SlateParams, Wording};
use crate::settings::Settings;
use crate::sim::{position_worth, simulate};
use crate::stats::{measure, medians};
use serde::Deserialize;
use serde_json::{json, Value};
use std::cell::RefCell;

thread_local! {
    static REPLY: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

#[no_mangle]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    let mut v = Vec::<u8>::with_capacity(len);
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}

/// # Safety
/// `ptr` and `len` must come from `alloc`.
#[no_mangle]
pub unsafe extern "C" fn dealloc(ptr: *mut u8, len: usize) {
    drop(Vec::from_raw_parts(ptr, 0, len));
}

/// # Safety
/// `ptr` must point to `len` bytes of UTF-8 written into memory from `alloc`.
#[no_mangle]
pub unsafe extern "C" fn call(ptr: *const u8, len: usize) -> *const u8 {
    let text = std::str::from_utf8(std::slice::from_raw_parts(ptr, len)).unwrap_or("");
    let reply = match handle(text) {
        Ok(v) => v,
        Err(e) => json!({ "error": e }),
    }
    .to_string();
    REPLY.with(|r| {
        let mut r = r.borrow_mut();
        r.clear();
        r.extend_from_slice(&(reply.len() as u32).to_le_bytes());
        r.extend_from_slice(reply.as_bytes());
        r.as_ptr()
    })
}

#[derive(Deserialize)]
struct Twin {
    c: usize,
    s: usize,
    v: usize,
    #[serde(default)]
    wording: Wording,
    #[serde(default)]
    n: Option<usize>,
    seed: u64,
}

fn handle(text: &str) -> Result<Value, String> {
    let req: Value = serde_json::from_str(text).map_err(|e| e.to_string())?;
    match req["task"].as_str() {
        Some("twins") => {
            let el: Electorate = serde_json::from_value(req["electorate"].clone()).map_err(|e| format!("electorate: {e}"))?;
            let p: SlateParams = serde_json::from_value(req["model"].clone()).map_err(|e| format!("model: {e}"))?;
            p.check()?;
            let merge = req["merge_last"].as_bool().unwrap_or(false);
            let twins: Vec<Twin> = serde_json::from_value(req["twins"].clone()).map_err(|e| format!("twins: {e}"))?;
            let mut all = Vec::with_capacity(twins.len());
            for t in &twins {
                let rules = BallotRules { wording: t.wording, n: t.n.map_or(RankCount::Number(t.c), RankCount::Number), pull: None };
                let g = model::generate(t.c, t.s, t.v, t.c, &el, &rules, &p, t.seed);
                all.push(measure(&g.ballots, t.s, Some(&g.slate_of), rules.max_ranks(t.s), merge));
            }
            Ok(json!({ "median": medians(&all), "twins": all }))
        }
        Some("election") => {
            let mut s: Settings = serde_json::from_value(req["settings"].clone()).map_err(|e| format!("settings: {e}"))?;
            s.finish()?;
            let lines: Vec<Value> = s.election.seats.iter().filter(|&&k| k >= 1 && k < s.election.candidates).map(|&k| simulate(&s, k, 1)).collect();
            Ok(json!({ "results": lines }))
        }
        Some("worth") => {
            let mut s: Settings = serde_json::from_value(req["settings"].clone()).map_err(|e| format!("settings: {e}"))?;
            s.finish()?;
            let c = s.election.candidates;
            let seats = s.election.seats.first().copied().unwrap_or(1).clamp(1, c.saturating_sub(1).max(1));
            let first = req["first"].as_u64().unwrap_or(0) as usize;
            let count = req["count"].as_u64().unwrap_or(s.run.sims as u64) as usize;
            let (any, edge) = position_worth(&s, seats, first, count);
            Ok(json!({ "any": any.to_json(), "edge": edge.to_json() }))
        }
        Some("describe") => {
            // A sample of the viewer's own election, measured: what each setting produces.
            let mut s: Settings = serde_json::from_value(req["settings"].clone()).map_err(|e| format!("settings: {e}"))?;
            s.finish()?;
            let count = req["count"].as_u64().unwrap_or(40) as usize;
            let c = s.election.candidates;
            let seats = s.election.seats.first().copied().unwrap_or(1).clamp(1, c.saturating_sub(1).max(1));
            let v = s.election.voters.unwrap();
            let max = s.ballot.max_ranks(seats);
            let (mut all, mut slates, mut unaff, mut longs, mut tops, mut lasts) = (Vec::new(), Vec::new(), Vec::new(), Vec::new(), Vec::new(), Vec::new());
            let mut lengths = vec![0.0; c];
            for i in 0..count {
                let g = model::generate(c, seats, v, s.election.ranks, &s.electorate, &s.ballot, &s.model, crate::sim::election_seed(s.run.seed, c, seats, i));
                let st = measure(&g.ballots, seats, Some(&g.slate_of), max, false);
                for (k, x) in st.length_shares.iter().enumerate() {
                    lengths[k] += x / count as f64;
                }
                let mut sizes: Vec<usize> = (0..s.model.slates).map(|k| g.slate_of.iter().filter(|x| **x == Some(k)).count()).filter(|&n| n > 0).collect();
                sizes.sort_unstable_by(|a, b| b.cmp(a));
                slates.push(sizes);
                unaff.push(g.slate_of.iter().filter(|x| x.is_none()).count() as f64);
                longs.push(g.long_shot.iter().filter(|&&x| x).count() as f64);
                tops.push(st.first_sorted[0]);
                lasts.push(st.first_sorted[c - 1]);
                all.push(st);
            }
            let med = |mut v: Vec<f64>| {
                v.sort_by(|a, b| a.partial_cmp(b).unwrap());
                v[v.len() / 2]
            };
            Ok(json!({
                "elections": count, "median": medians(&all),
                "top_share": med(tops), "last_share": med(lasts),
                "candidates_no_slate": med(unaff), "long_shots": med(longs),
                "slate_sizes_example": slates.first(), "length_shares": lengths,
            }))
        }
        Some("defaults") => {
            let kind = match req["electorate"].as_str() {
                Some("organization") => model::ElectorateType::Organization,
                _ => model::ElectorateType::Public,
            };
            Ok(model::auto_values(kind, req["seats"].as_u64().unwrap_or(1) as usize))
        }
        _ => Err("unknown task".into()),
    }
}
