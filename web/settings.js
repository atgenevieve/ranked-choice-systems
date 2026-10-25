// The public simulator's settings: what a visitor chooses, turned into the engine's settings
// (a settings file as JSON, as in engine/README.md), and the engine requests that answer them.
// Shared by the precompute script (precompute.mjs, in Node) and the web page, so the settings
// the page builds for a preset are exactly the ones that were precomputed.
// The model defaults are the tuner's branch page defaults (tuner/branches.html).

/** How far behind long shots are, fitted on single-seat public races (the engine's default). */
export const GAP_FITTED = 2.5;

/** The engine's fitted popularity settings by type of voter (public, organization) and seats
 *  (1, 2 to 4, 5 or more), copied from engine/src/model.rs (POPULARITY_SPREAD, LONG_SHOT_SHARE,
 *  STANDOUT_SHARE). The page shows these on the sliders when "Use the value fitted" is ticked. */
const FITTED = {
  spread: { public: [1.1, 1.2, 1.2], organization: [0.8, 0.7, 0.5] },
  longshot: { public: [0.1, 0, 0], organization: [0, 0, 0] },
  standout: { public: [0, 0, 0], organization: [0, 0, 0.15] },
};
const seatBand = (seats) => (seats <= 1 ? 0 : seats <= 4 ? 1 : 2);

/** The fitted popularity settings for an election: spread, long-shot share, standout share, and gap. */
export const fitted = (c) => {
  const b = seatBand(c.seats);
  return { spread: FITTED.spread[c.electorate][b], longshot: FITTED.longshot[c.electorate][b], standout: FITTED.standout[c.electorate][b], gap: GAP_FITTED };
};

/** Whether the fitted model has long shots for this election: only single-seat public races. */
export const fittedLongShots = (c) => fitted(c).longshot > 0;

/** Whether the fitted model has standouts: only organizational elections with 5 or more seats. */
export const fittedStandouts = (c) => fitted(c).standout > 0;

/** Every setting a visitor can change, with its default. */
export const DEFAULTS = {
  // Election tab
  candidates: 113,
  seats: 67,
  slots: null,          // ballot slots: N in "rank up to N"; null means the number of seats
  voters: 706,
  turnout: 10,          // turnout uncertainty, ± percent
  // Ballot tab
  wording: "up_to",     // "up_to", "at_least", "exactly", or "none"
  pullAuto: false,      // use the share measured on real ballots
  pull: 0.23,           // share of voters who'd stop short of N but rank exactly N: measured for "up to"
  // Voters tab
  electorate: "organization",
  // Slates tab
  slates: 4,
  sizing: "expected_seats",
  unaff: 0.15,          // share of candidates on no slate, at least
  loyalty: 11,          // slate loyalty, in points above popularity
  evenness: 0.785,
  // Popularity tab
  spreadAuto: true,
  spread: 1,
  longshotAuto: true,
  longshot: 0,
  standoutAuto: true,
  standout: 0,
  gapAuto: true,
  gap: GAP_FITTED,
  // Seed tab
  seed: 1,
};

/** The election numbers, set on the first tab or by a preset. */
export const ELECTION_FIELDS = ["candidates", "seats", "slots", "voters"];

/** Simulated elections per setting. */
export const SIMS = 1000;

/** Simulated elections per engine request when the page runs the engine itself: small, so the
 *  charts fill in smoothly and a pool of workers can share them out. */
export const CHUNK = 5;

/** The share pulled up to N measured on real ballots, by ballot wording (docs/model-spec.md). */
export const PULL_MEASURED = { up_to: 0.23, at_least: 0.97, exactly: 1 };

/** Elections a visitor can start from, in the order the page lists them. Candidates and seats for
 *  the NYC DSA branches come from the branches' candidate counts; voters from the 2026 turnout
 *  projections (tuner/branches.js). The public elections are real contests in data/: candidates
 *  on the ballot (write-ins left out), seats, ballots that ranked anyone, and the rank limit. */
export const PRESETS = [
  { id: "bronx-upper-manhattan", group: "NYC DSA branch delegate elections, 2026", name: "Bronx/Upper Manhattan", candidates: 120, seats: 65, voters: 626 },
  { id: "central-brooklyn", group: "NYC DSA branch delegate elections, 2026", name: "Central Brooklyn", candidates: 132, seats: 83, voters: 838 },
  { id: "flatbush", group: "NYC DSA branch delegate elections, 2026", name: "Flatbush", candidates: 55, seats: 32, voters: 477 },
  { id: "lower-manhattan", group: "NYC DSA branch delegate elections, 2026", name: "Lower Manhattan", candidates: 87, seats: 61, voters: 437 },
  { id: "north-brooklyn", group: "NYC DSA branch delegate elections, 2026", name: "North Brooklyn", candidates: 105, seats: 76, voters: 731 },
  { id: "queens", group: "NYC DSA branch delegate elections, 2026", name: "Queens", candidates: 113, seats: 67, voters: 706 },
  { id: "south-brooklyn-staten-island", group: "NYC DSA branch delegate elections, 2026", name: "South Brooklyn + Staten Island", candidates: 78, seats: 51, voters: 461 },
  // data/nyc/ballots/2025-dem-mayor-citywide: 11 candidates and a write-in line, rank up to 5.
  { id: "nyc-mayor-2025", group: "Recent public elections", name: "NYC mayoral primary, 2025", candidates: 11, seats: 1, voters: 1071730, slots: 5, electorate: "public" },
  // data/portland/ballots/2024-mayor: 20 candidates and a write-in line, rank up to 6.
  { id: "portland-mayor-2024", group: "Recent public elections", name: "Portland mayor, 2024", candidates: 20, seats: 1, voters: 309963, slots: 6, electorate: "public" },
  // data/portland/ballots/2024-councilor-district-3: 30 candidates and a write-in line, 3 seats, rank up to 6.
  { id: "portland-council-3-2024", group: "Recent public elections", name: "Portland Council District 3, 2024", candidates: 30, seats: 3, voters: 84515, slots: 6, electorate: "public" },
  { id: "metro-dc-2025", group: "Other DSA elections", name: "Metro DC DSA delegates, 2025", candidates: 75, seats: 46, voters: 432 },
];
export const DEFAULT_PRESET = "queens";

/** A preset's settings: the defaults with the preset's election and, for public elections, its
 *  voters and rank limit. */
export const presetChoice = p => ({
  ...DEFAULTS, candidates: p.candidates, seats: p.seats, voters: p.voters, slots: p.slots ?? null,
  electorate: p.electorate ?? DEFAULTS.electorate,
});

/** The preset a visitor's settings match exactly, if any. */
export function matchingPreset(choice) {
  const c = clean(choice);
  return PRESETS.find(p => { const d = clean(presetChoice(p)); return Object.keys(DEFAULTS).every(k => k === "seed" || d[k] === c[k]); });
}

// ---------------------------------------------------------------- slate curves
// Slate loyalty in points <-> the engine's own-slate multiplier, and evenness <-> spread to other
// slates, from what each setting produced on twins of Scottish wards (data/model_check.py --curves,
// saved in tuner/reference.json as slate_curves). The page reads them from meta.json, which the
// precompute writes, so the page and the precompute always agree.

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
/** Evenness from the engine's spread to other slates: the inverse of spreadFor. */
export const evennessFor = (curves, spread) => interp(curves.spread.filter(d => d.setting >= 0.3).map(d => [d.setting, d.evenness]), spread);

const int = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || lo)));
const num = (v, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(Number(v)) ? Number(v) : lo));

/** Limits on what a visitor can enter. */
export const LIMITS = { candidates: [2, 300], voters: [10, 2000000], turnout: [0, 30], slates: [1, 12], seed: [1, 1e9] };

/** A visitor's choice with every value in range: whole numbers where needed, seats fewer than
 *  candidates, and ballot slots no more than candidates. */
export function clean(choice) {
  const c = { ...DEFAULTS, ...choice };
  c.candidates = int(c.candidates, ...LIMITS.candidates);
  c.seats = int(c.seats, 1, c.candidates - 1);
  c.slots = c.slots == null || c.slots === "" ? null : int(c.slots, 1, c.candidates);
  c.voters = int(c.voters, ...LIMITS.voters);
  c.turnout = int(c.turnout, ...LIMITS.turnout);
  if (!["up_to", "at_least", "exactly", "none"].includes(c.wording)) c.wording = DEFAULTS.wording;
  c.pull = num(c.pull, 0, 1);
  if (!["organization", "public"].includes(c.electorate)) c.electorate = DEFAULTS.electorate;
  c.slates = int(c.slates, ...LIMITS.slates);
  if (!["expected_seats", "same_as_voters"].includes(c.sizing)) c.sizing = DEFAULTS.sizing;
  c.unaff = num(c.unaff, 0, 0.5);
  c.loyalty = num(c.loyalty, 4, 66);
  c.evenness = num(c.evenness, 0.65, 0.83);
  c.spread = num(c.spread, 0, 2);
  c.longshot = num(c.longshot, 0, 0.4);
  c.standout = num(c.standout, 0, 0.4);
  c.gap = num(c.gap, -3, 4);
  c.seed = int(c.seed, ...LIMITS.seed);
  for (const k of ["pullAuto", "spreadAuto", "longshotAuto", "gapAuto", "standoutAuto"]) c[k] = !!c[k];
  return c;
}

/** The engine's settings for a visitor's choice. */
export function engineSettings(choice, curves) {
  const c = clean(choice);
  const ballot = { wording: c.wording };
  if (c.wording !== "none") ballot.n = c.slots == null ? "seats" : c.slots;
  if (!c.pullAuto && (c.wording === "up_to" || c.wording === "at_least")) ballot.pull = c.pull;
  return {
    run: { name: "simulator", seed: c.seed, sims: SIMS, truncation: true, curve_ranks: 0 },
    election: { candidates: c.candidates, seats: [c.seats], voters: c.voters, turnout_spread: c.turnout / 100, ranks: c.candidates },
    electorate: { type: c.electorate },
    ballot,
    model: {
      version: "0.2",
      slates: c.slates,
      slate_candidates: c.sizing,
      slate_strength: Number(strengthFor(curves, c.loyalty).toFixed(2)),
      unaffiliated_share: c.unaff,
      other_slate_spread: Number(spreadFor(curves, c.evenness).toFixed(3)),
      popularity_spread: c.spreadAuto ? "auto" : c.spread,
      long_shot_share: c.longshotAuto ? "auto" : c.longshot,
      long_shot_gap: c.gapAuto ? GAP_FITTED : c.gap,
      standout_share: c.standoutAuto ? "auto" : c.standout,
    },
  };
}

/** The engine request for simulated elections first to first + count − 1. */
export const streamRequest = (settings, first, count) => ({ task: "stream", settings, first, count, worth: true });

/** Settings as text with keys sorted, so the same settings always give the same key. */
export function settingsKey(settings) {
  const canon = v => Array.isArray(v) ? v.map(canon)
    : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
  return JSON.stringify(canon(settings));
}
