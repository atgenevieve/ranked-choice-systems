//! Ballots in memory, and the `.ballots` file format (see `docs/ballot-format.md`).

/// Marks an empty rank on a ballot that ranks fewer candidates than the row holds.
pub const NONE: u32 = u32::MAX;

pub struct Ballots {
    /// Number of candidates.
    pub c: usize,
    /// Row width: the most ranks any ballot holds.
    pub len: usize,
    /// One row of `len` candidate numbers per distinct ballot, padded with `NONE`.
    pub prefs: Vec<u32>,
    /// How many voters cast each row. `None` means one voter per row.
    pub mult: Option<Vec<u64>>,
}

impl Ballots {
    pub fn rows(&self) -> usize {
        self.prefs.len() / self.len
    }
    pub fn mult(&self, row: usize) -> u64 {
        self.mult.as_ref().map_or(1, |m| m[row])
    }
    pub fn voters(&self) -> u64 {
        self.mult.as_ref().map_or(self.rows() as u64, |m| m.iter().sum())
    }
    pub fn row(&self, row: usize) -> &[u32] {
        &self.prefs[row * self.len..(row + 1) * self.len]
    }
}

/// Reads one election from a `.ballots` file. Returns the ballots and the number of seats.
pub fn read_file(path: &str) -> Result<(Ballots, usize), String> {
    let text = std::fs::read_to_string(path).map_err(|e| format!("{path}: {e}"))?;
    let mut c = None;
    let mut seats = None;
    let mut rows: Vec<(u64, Vec<u32>)> = Vec::new();
    for (n, line) in text.lines().enumerate() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let err = |m: &str| format!("{path}, line {}: {m}", n + 1);
        let mut words = line.split_whitespace();
        let first = words.next().unwrap();
        if first == "candidates" || first == "seats" {
            let v: usize = words.next().and_then(|w| w.parse().ok()).ok_or_else(|| err("expected a number"))?;
            if first == "candidates" {
                c = Some(v);
            } else {
                seats = Some(v);
            }
            continue;
        }
        let c = c.ok_or_else(|| err("`candidates` must come before ballots"))?;
        let count: u64 = first.parse().map_err(|_| err("expected a ballot count"))?;
        let mut ranking = Vec::new();
        for w in words {
            let cand: u32 = w.parse().map_err(|_| err("expected a candidate number"))?;
            if cand as usize >= c {
                return Err(err("candidate number out of range"));
            }
            if ranking.contains(&cand) {
                return Err(err("candidate ranked twice"));
            }
            ranking.push(cand);
        }
        if ranking.is_empty() {
            return Err(err("blank ballot; leave blanks out of the file"));
        }
        if count > 0 {
            rows.push((count, ranking));
        }
    }
    let c = c.ok_or(format!("{path}: missing `candidates`"))?;
    let seats = seats.ok_or(format!("{path}: missing `seats`"))?;
    if seats == 0 || seats > c {
        return Err(format!("{path}: seats must be between 1 and the number of candidates"));
    }
    if rows.is_empty() {
        return Err(format!("{path}: no ballots"));
    }
    let len = rows.iter().map(|r| r.1.len()).max().unwrap();
    let mut prefs = vec![NONE; rows.len() * len];
    let mut mult = Vec::with_capacity(rows.len());
    for (i, (count, ranking)) in rows.into_iter().enumerate() {
        prefs[i * len..i * len + ranking.len()].copy_from_slice(&ranking);
        mult.push(count);
    }
    Ok((Ballots { c, len, prefs, mult: Some(mult) }, seats))
}
