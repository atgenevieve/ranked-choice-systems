// The public simulator's settings: what a visitor chooses, turned into the engine's settings
// (a settings file as JSON, as in engine/README.md), and the engine requests that answer them.
// Shared by the precompute script (precompute.mjs, in Node) and the web page, so a request the
// page makes for the default settings is exactly the request that was precomputed.
// The model defaults are the tuner's branch page defaults (tuner/branches.html).

/** Model settings a visitor can change, with the defaults the owner uses on the branch page. */
export const MODEL_DEFAULTS = {
  electorate: "organization",
  turnout: 10,          // turnout uncertainty, ± percent
  wording: "up_to",     // "up_to", "at_least", "exactly", or "none"
  n: null,              // N in "rank up to N"; null means N is the number of seats
  pull: 0.1,            // share of "up to N" voters drawn toward exactly N
  slates: 4,
  sizing: "expected_seats",
  unaff: 0.15,          // share of voters on no slate, at least
  loyalty: 11,          // slate loyalty, in points above popularity
  evenness: 0.785,
  spread: "auto",       // popularity spread, or "auto" for the value fitted to real elections
  longshot: "auto",     // long shot share, or "auto"
  gap: 2,               // how far long shots trail
};

/** Simulated elections per setting, and the seed every run starts from. */
export const RUN = { sims: 1000, seed: 1 };

/** Simulated elections per "worth" request, so a pool of workers can share them out. */
export const WORTH_CHUNK = 50;

/** Elections a visitor can start from. Candidates and seats for the NYC DSA branches come from
 *  the branches' candidate counts; voters from the 2026 turnout projections (tuner/branches.js). */
export const PRESETS = [
  { id: "bronx-upper-manhattan", group: "NYC DSA branch delegate elections", name: "Bronx/Upper Manhattan", candidates: 120, seats: 65, voters: 626 },
  { id: "central-brooklyn", group: "NYC DSA branch delegate elections", name: "Central Brooklyn", candidates: 132, seats: 83, voters: 838 },
  { id: "flatbush", group: "NYC DSA branch delegate elections", name: "Flatbush", candidates: 55, seats: 32, voters: 477 },
  { id: "lower-manhattan", group: "NYC DSA branch delegate elections", name: "Lower Manhattan", candidates: 87, seats: 61, voters: 437 },
  { id: "north-brooklyn", group: "NYC DSA branch delegate elections", name: "North Brooklyn", candidates: 105, seats: 76, voters: 731 },
  { id: "queens", group: "NYC DSA branch delegate elections", name: "Queens", candidates: 113, seats: 67, voters: 706 },
  { id: "south-brooklyn-staten-island", group: "NYC DSA branch delegate elections", name: "South Brooklyn + Staten Island", candidates: 78, seats: 51, voters: 461 },
  { id: "metro-dc-2025", group: "Other elections", name: "Metro DC DSA delegates, 2025", candidates: 75, seats: 46, voters: 432 },
];
export const DEFAULT_PRESET = "queens";

// ---------------------------------------------------------------- slate curves
// Slate loyalty in points <-> the engine's own-slate multiplier, and evenness <-> spread to other
// slates, from what each setting produced on twins of Scottish wards (data/model_check.py --curves,
// saved in tuner/reference.json as slate_curves). The page and the precompute both read them from
// the precomputed file, so they always agree.

function interp(points, x) {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    if (x <= points[i][0]) {
      const [x0, y0] = points[i - 1], [x1, y1] = points[i];
      return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
    }
  }
  return points[points.length - 1][1];
}
const strengthFor = (curves, points) => Math.exp(interp(curves.strength.map(d => [d.clustering * 100, Math.log(d.setting)]), points));
const spreadFor = (curves, evenness) =>
  interp(curves.spread.filter(d => d.setting >= 0.3).map(d => [d.evenness, d.setting]).sort((a, b) => a[0] - b[0]), evenness);

const int = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || lo)));

/** Limits on what a visitor can enter. */
export const LIMITS = { candidates: [2, 300], voters: [10, 50000], turnout: [0, 30] };

/** The engine's settings for one election: `election` is {candidates, seats, voters}; `model`
 *  is MODEL_DEFAULTS with any changes. */
export function engineSettings(election, model, curves) {
  const m = { ...MODEL_DEFAULTS, ...model };
  const cand = int(election.candidates, ...LIMITS.candidates);
  const seats = int(election.seats, 1, cand - 1);
  const ballot = { wording: m.wording };
  if (m.wording !== "none") ballot.n = m.n == null ? "seats" : int(m.n, 1, cand);
  if (m.wording === "up_to" || m.wording === "at_least") ballot.pull = Number(m.pull);
  return {
    run: { name: "simulator", seed: RUN.seed, sims: RUN.sims, truncation: true, curve_ranks: 0 },
    election: { candidates: cand, seats: [seats], voters: int(election.voters, ...LIMITS.voters), turnout_spread: int(m.turnout, ...LIMITS.turnout) / 100, ranks: cand },
    electorate: { type: m.electorate },
    ballot,
    model: {
      version: "0.2",
      slates: int(m.slates, 1, 12),
      slate_candidates: m.sizing,
      slate_strength: Number(strengthFor(curves, Number(m.loyalty)).toFixed(2)),
      unaffiliated_share: Number(m.unaff),
      other_slate_spread: Number(spreadFor(curves, Number(m.evenness)).toFixed(3)),
      popularity_spread: m.spread === "auto" ? "auto" : Number(m.spread),
      long_shot_share: m.longshot === "auto" ? "auto" : Number(m.longshot),
      long_shot_gap: Number(m.gap),
    },
  };
}

/** Every engine request one election needs: the election itself (truncation curve and winners
 *  changed), then what each ballot position is worth, in chunks. */
export function requestsFor(settings) {
  const out = [{ task: "election", settings }];
  for (let first = 0; first < settings.run.sims; first += WORTH_CHUNK)
    out.push({ task: "worth", settings, first, count: Math.min(WORTH_CHUNK, settings.run.sims - first) });
  return out;
}

/** A request as text with its keys sorted, so the same request always gives the same key. */
export function requestKey(request) {
  const canon = v => Array.isArray(v) ? v.map(canon)
    : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
  return JSON.stringify(canon(request));
}
