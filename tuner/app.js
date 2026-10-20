// Rank Depth Tuner: controls -> settings -> the engine (worker.js runs stvsim.wasm) -> results.
// Three requests per change: the viewer's election counted many times (how deep rankings
// matter), a sample of it measured (what each setting does), and twins of real elections
// (reference.json, built by data/tuner_reference.py). See tuner/README.md.
"use strict";

const $ = id => document.getElementById(id);
const STORE_KEY = "rank-depth-tuner-v2";

// ---------------------------------------------------------------- engine
const worker = new Worker("worker.js");
let nextId = 1;
const pending = new Map();
worker.onmessage = e => {
  const p = pending.get(e.data.id);
  if (p) { pending.delete(e.data.id); p(e.data.reply); }
};
const engine = request => new Promise(resolve => {
  const id = nextId++;
  pending.set(id, resolve);
  worker.postMessage({ id, request });
});

// ---------------------------------------------------------------- formatting
const pct = v => v == null ? "–" : v > 0 && v < 0.01 ? "under 1%" : `${(v * 100).toFixed(v < 0.1 && v > 0 ? 1 : 0)}%`;
const times = v => v == null ? "–" : `${v.toFixed(v >= 10 ? 0 : 1)}×`;
const num1 = v => v == null ? "–" : v.toFixed(1);
const num2 = v => v == null ? "–" : v.toFixed(2);
const pts = v => v == null ? "–" : `${v >= 0 ? "+" : "−"}${Math.abs(Math.round(v * 100))} points`;
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const NS = "http://www.w3.org/2000/svg";
const el = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent?.append(e); return e; };
const text = (parent, x, y, s, attrs = {}) => { const t = el("text", { x, y, ...attrs }, parent); t.textContent = s; return t; };
const int = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || lo)));
const setText = (id, s) => { $(id).textContent = s; };

// ---------------------------------------------------------------- reference data
let reference = null;  // tuner/reference.json
let fitted = null;     // what "auto" means for the viewer's election (from the engine)

/** Straight-line interpolation through [x, y] points sorted by x. */
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
// Slate loyalty in points <-> the engine's own-slate multiplier, and evenness <-> spread to other
// slates, from what each setting produced on twins of Scottish wards (data/model_check.py --curves).
function strengthFor(points) {
  const curve = reference.slate_curves.strength.map(d => [d.clustering * 100, Math.log(d.setting)]);
  return Math.exp(interp(curve, points));
}
function pointsFor(strength) {
  const curve = reference.slate_curves.strength.map(d => [Math.log(d.setting), d.clustering * 100]);
  return interp(curve, Math.log(strength));
}
function spreadFor(evenness) {
  // Evenness falls as the spread rises (from 0.3 on); interpolate on the falling part.
  const curve = reference.slate_curves.spread.filter(d => d.setting >= 0.3).map(d => [d.evenness, d.setting]).sort((a, b) => a[0] - b[0]);
  return interp(curve, evenness);
}
function evennessFor(spread) {
  return interp(reference.slate_curves.spread.filter(d => d.setting >= 0.3).map(d => [d.setting, d.evenness]), spread);
}
/** The real elections of the same type as the viewer's election. */
function cellLike(c) {
  const s = int(c.seats, 1, 999);
  const band = s === 1 ? "1 seat" : s <= 4 ? "2 to 4 seats" : "5 or more seats";
  return reference?.cells.find(x => x.cell === `${c.electorate === "organization" ? "Organization" : "Public"}, ${band}`);
}

// ---------------------------------------------------------------- controls
const FIELDS = ["candidates", "seats", "voters", "sims", "seed", "wording", "n", "n-seats", "pull-auto", "pull", "slates", "sizing", "unaff",
  "loyalty", "evenness", "spread-auto", "spread", "longshot-auto", "longshot", "gap", "cell"];

function readControls() {
  const c = {};
  for (const id of FIELDS) {
    const e = $(id);
    c[id] = e.type === "checkbox" ? e.checked : e.value;
  }
  c.electorate = document.querySelector('input[name="electorate"]:checked').value;
  return c;
}

function writeControls(c) {
  for (const id of FIELDS) {
    if (!(id in c)) continue;
    const e = $(id);
    if (e.type === "checkbox") e.checked = !!c[id]; else e.value = c[id];
  }
  if (c.electorate) document.querySelector(`input[name="electorate"][value="${c.electorate}"]`).checked = true;
}

/** The [model] section of a settings file, from the controls. */
function modelSettings(c) {
  return {
    version: "0.2",
    slates: int(c.slates, 1, 12),
    slate_candidates: c.sizing,
    slate_strength: Number(strengthFor(Number(c.loyalty)).toFixed(2)),
    unaffiliated_share: Number(c.unaff),
    other_slate_spread: Number(spreadFor(Number(c.evenness)).toFixed(3)),
    popularity_spread: c["spread-auto"] ? "auto" : Number(c.spread),
    long_shot_share: c["longshot-auto"] ? "auto" : Number(c.longshot),
    long_shot_gap: Number(c.gap),
  };
}

/** A full settings file, as JSON, for the viewer's own election. */
function electionSettings(c) {
  const cand = int(c.candidates, 2, 300);
  const seats = int(c.seats, 1, cand - 1);
  const ballot = { wording: c.wording };
  if (c.wording !== "none") ballot.n = c["n-seats"] ? "seats" : int(c.n, 1, cand);
  if (!c["pull-auto"] && (c.wording === "up_to" || c.wording === "at_least")) ballot.pull = Number(c.pull);
  return {
    run: { name: "tuner", seed: int(c.seed, 1, 1e9), sims: int(c.sims, 10, 1000), truncation: true, curve_ranks: 0 },
    election: { candidates: cand, seats: [seats], voters: int(c.voters, 10, 50000), ranks: cand },
    electorate: { type: c.electorate },
    ballot,
    model: modelSettings(c),
  };
}

function toml(s, name) {
  const v = x => typeof x === "string" ? `"${x}"` : String(x);
  const lines = [`# ${name || "Settings"}, saved from the Rank Depth Tuner.`, "# Run with: engine/target/release/stvsim run <this file>", ""];
  const section = (head, obj) => {
    lines.push(`[${head}]`);
    for (const [k, x] of Object.entries(obj)) lines.push(`${k} = ${Array.isArray(x) ? `[${x.join(", ")}]` : v(x)}`);
    lines.push("");
  };
  section("run", { ...s.run, name: slug(name || "tuning") });
  section("election", s.election);
  section("electorate", s.electorate);
  section("ballot", s.ballot);
  section("model", s.model);
  return lines.join("\n");
}

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "tuning";
}

// ---------------------------------------------------------------- reference marks on sliders
/** Marks real elections (and other landmarks) along a slider's scale: a short value at its true
 *  position, and one line underneath naming each. items: [{at, short, label}]. */
function marks(id, input, items) {
  const box = $(id);
  if (!box) return;
  const lo = Number(input.min), hi = Number(input.max);
  const shown = items.filter(m => m.at >= lo - 1e-9 && m.at <= hi + 1e-9).sort((a, b) => a.at - b.at);
  const track = document.createElement("div"); track.className = "track";
  for (const m of shown) {
    const d = document.createElement("span");
    const f = (m.at - lo) / (hi - lo);
    d.className = `tick${f < 0.04 ? " left" : f > 0.96 ? " right" : ""}`;
    d.style.left = `${f * 100}%`;
    d.textContent = m.short;
    track.append(d);
  }
  const key = document.createElement("p"); key.className = "key";
  key.textContent = shown.map(m => `${m.label} ${m.short}`).join(" · ");
  box.replaceChildren(track, key);
}

function updateLabels(c) {
  const cand = int(c.candidates, 2, 300), seats = int(c.seats, 1, cand - 1);
  const N = c.wording === "none" ? null : c["n-seats"] ? seats : int(c.n, 1, cand);
  if (c["n-seats"]) $("n").value = seats;
  $("n").disabled = c["n-seats"] || c.wording === "none";
  $("n-seats").disabled = c.wording === "none";
  // Pull toward N.
  const pulls = c.wording === "up_to" || c.wording === "at_least";
  $("pull-setting").hidden = !pulls;
  const pullFit = c.wording === "at_least" ? 0.97 : 0.23;
  if (c["pull-auto"]) $("pull").value = pullFit;
  $("pull").disabled = c["pull-auto"];
  setText("pull-v", `${pct(Number($("pull").value))}${c["pull-auto"] ? ", measured" : ""}`);
  marks("pull-scale", $("pull"), [{ at: 0.23, short: "23%", label: "US \"up to\" limits" }, { at: 0.97, short: "97%", label: "Canberra \"at least\"" }]);
  // Slates.
  setText("slates-v", `${int(c.slates, 1, 12)} slate${int(c.slates, 1, 12) === 1 ? "" : "s"}`);
  setText("unaff-v", `${pct(Number(c.unaff))} at least`);
  marks("unaff-scale", $("unaff"), [{ at: 0.17, short: "17%", label: "Scottish independents" }]);
  if (reference) {
    const looseP = pointsFor(4), tightP = pointsFor(100);
    const p = Number(c.loyalty);
    const word = Math.abs(p - looseP) < 1 ? " (loose)" : Math.abs(p - tightP) < 1.5 ? " (tight)" : "";
    setText("loyalty-v", `+${Math.round(p)} points${word}`);
    marks("loyalty-scale", $("loyalty"), [
      { at: 9, short: "9", label: "NYC endorsement slates" }, { at: 14, short: "14", label: "Portland endorsement slates" }, { at: 61, short: "61", label: "Scottish parties" },
    ]);
    setText("evenness-v", `${num2(Number(c.evenness))}${Math.abs(Number(c.evenness) - evennessFor(1.2)) < 0.004 ? " (default)" : ""}`);
    marks("evenness-scale", $("evenness"), [{ at: Number(evennessFor(1.2).toFixed(2)), short: num2(evennessFor(1.2)), label: "Model default" }, { at: 0.83, short: "0.83", label: "Most even the model makes" }]);
  }
  // Popularity.
  const type = cellLike(c);
  const typeName = type ? type.cell.toLowerCase().replace("public", "public elections").replace("organization", "organizational elections") : "elections like yours";
  setText("spread-auto-label", fitted ? `Use the value fitted to real ${typeName}: ${num2(fitted.popularity_spread)}` : "Use the value fitted to real elections like yours");
  if (c["spread-auto"] && fitted) $("spread").value = fitted.popularity_spread;
  $("spread").disabled = c["spread-auto"];
  setText("spread-v", `${num2(Number($("spread").value))}${c["spread-auto"] ? ", fitted" : ""}`);
  marks("spread-scale", $("spread"), [{ at: 0, short: "0", label: "All equal" }, { at: 0.7, short: "0.7", label: "Small organizational elections" }, { at: 1.0, short: "1.0", label: "Large organizational elections" }, { at: 1.2, short: "1.2", label: "Scottish wards" }]);
  setText("longshot-auto-label", fitted ? `Use the value fitted to real ${typeName}: ${pct(fitted.long_shot_share) === "0%" ? "none" : pct(fitted.long_shot_share)}` : "Use the value fitted to real elections like yours");
  if (c["longshot-auto"] && fitted) $("longshot").value = fitted.long_shot_share;
  $("longshot").disabled = c["longshot-auto"];
  const ls = Number($("longshot").value);
  setText("longshot-v", `${ls === 0 ? "none" : `${pct(ls)} of candidates`}${c["longshot-auto"] ? ", fitted" : ""}`);
  const g = Number(c.gap);
  setText("gap-v", Math.abs(g) < 0.05 ? "no different" : g > 0 ? `${times(Math.exp(g))} less support` : `standouts, ${times(Math.exp(-g))} more support`);
  marks("gap-scale", $("gap"), [{ at: -1.5, short: "−1.5", label: "Standouts, 4.5× more support (under review)" }, { at: 0, short: "0", label: "No different" }, { at: 2, short: "2", label: "Default, 7× less support" }]);
  // Simulations.
  setText("sims-v", `${int(c.sims, 10, 1000).toLocaleString()} runs`);
  return { cand, seats, N };
}

// ---------------------------------------------------------------- charts
/** A chart on linear scales. series: [{points: [[x, y]], color, width, dots}];
 *  opts: {xMin, xMax, xTicks, yMax, yStep, yFmt, xTitle, hlines: [{y, label}],
 *  marks: [{x, y, label}], bars: [{x, y}] (drawn behind the lines)}. */
function chart(box, series, opts) {
  box.replaceChildren();
  const w = Math.max(280, box.clientWidth || 600), H = 250, L = 46, R = 14, T = 16, B = 38;
  const svg = el("svg", { viewBox: `0 0 ${w} ${H}`, height: H, role: "img", "aria-label": opts.aria || "" }, box);
  const sx = x => L + (x - opts.xMin) / (opts.xMax - opts.xMin) * (w - L - R);
  const sy = y => T + (1 - y / opts.yMax) * (H - T - B);
  for (let y = 0; y <= opts.yMax + 1e-9; y += opts.yStep) {
    el("line", { x1: L, x2: w - R, y1: sy(y), y2: sy(y), stroke: css(y === 0 ? "--rule" : "--grid"), "stroke-width": 1 }, svg);
    text(svg, L - 6, sy(y) + 4, opts.yFmt(y), { "text-anchor": "end" });
  }
  for (const x of opts.xTicks) text(svg, sx(x), H - B + 15, String(opts.xLabel ? opts.xLabel(x) : x), { "text-anchor": "middle" });
  text(svg, (L + w - R) / 2, H - 4, opts.xTitle, { "text-anchor": "middle", class: "title" });
  if (opts.bars) {
    const bw = Math.max(2, (sx(opts.xMin + 1) - sx(opts.xMin)) * 0.7);
    for (const b of opts.bars) {
      const h = sy(0) - sy(b.y);
      if (h > 0) el("rect", { x: sx(b.x) - bw / 2, y: sy(b.y), width: bw, height: h, rx: 1.5, fill: css("--real") }, svg);
    }
  }
  for (const h of opts.hlines || []) {
    el("line", { x1: L, x2: w - R, y1: sy(h.y), y2: sy(h.y), stroke: css("--mark"), "stroke-width": 1, "stroke-dasharray": "5 4", opacity: 0.7 }, svg);
    text(svg, L + 4, sy(h.y) - 4, h.label, { class: "lab" });
  }
  for (const s of series) {
    const p = s.points.map(([x, y]) => `${sx(x).toFixed(1)},${sy(Math.min(y, opts.yMax)).toFixed(1)}`).join(" ");
    el("polyline", { points: p, fill: "none", stroke: css("--surface"), "stroke-width": (s.width || 2.5) + 3, "stroke-linejoin": "round" }, svg);
    el("polyline", { points: p, fill: "none", stroke: css(s.color), "stroke-width": s.width || 2.5, "stroke-linejoin": "round" }, svg);
    if (s.dots) for (const [x, y] of s.points) el("circle", { cx: sx(x), cy: sy(Math.min(y, opts.yMax)), r: 2.6, fill: css(s.color) }, svg);
  }
  // Crossing points: a ring on the curve, a dashed drop to the rank axis, and a label.
  for (const m of opts.marks || []) {
    const x = sx(m.x), y = sy(Math.min(m.y, opts.yMax));
    el("line", { x1: x, x2: x, y1: y, y2: sy(0), stroke: css("--mark"), "stroke-width": 1, "stroke-dasharray": "2 3" }, svg);
    el("circle", { cx: x, cy: y, r: 5, fill: css("--surface"), stroke: css("--mark"), "stroke-width": 2 }, svg);
    const right = x > w - 150;
    text(svg, x + (right ? -9 : 9), y + (m.below ? 16 : -8), m.label, { class: "marklab", "text-anchor": right ? "end" : "start" });
  }
}

function niceStep(max) {
  const raw = max / 5, p = Math.pow(10, Math.floor(Math.log10(raw)));
  return [1, 2, 2.5, 5, 10].map(m => m * p).find(s => s >= raw) || raw;
}
/** Rank ticks: 1, then every 1, 5, 10, or 20 ranks, depending on how many are shown. */
function rankTicks(max) {
  const step = max <= 12 ? 1 : max <= 30 ? 5 : max <= 60 ? 10 : 20;
  const out = [1];
  for (let x = step; x <= max; x += step) if (x !== 1) out.push(x);
  return out;
}
const pctAxis = v => `${Math.round(v * 100)}%`;
/** The first rank (1-based) from which the test holds for every rank after it too. */
function holdsFrom(values, test) {
  let k = values.length + 1;
  for (let i = values.length - 1; i >= 0 && test(values[i]); i--) k = i + 1;
  return k;
}

// ---------------------------------------------------------------- your election
let lastElection = null;

function drawElection(r, c) {
  const t = r.truncation, seats = r.seats, sims = r.settings.run.sims, cand = r.settings.election.candidates;
  const N = c.wording === "none" ? null : (c["n-seats"] ? seats : int(c.n, 1, cand));
  const p = t.p_changed, mean = t.seats_changed.mean, most = t.seats_changed.max;
  // Share of elections whose cutoff rank is at or below each rank: cutting there, or deeper, changes nothing.
  const same = [];
  t.cutoff_rank.counts.reduce((acc, n, i) => { same[i] = (acc + n) / sims; return acc + n; }, 0);
  const at = level => same.findIndex(x => x >= level - 1e-9) + 1;
  const k50 = at(0.5), k80 = at(0.8), k95 = at(0.95), kAll = at(1);
  const k5 = holdsFrom(p, x => x < 0.05);
  const kSeat = holdsFrom(mean, x => x < 1);
  const kNone = holdsFrom(most, x => x === 0);
  const xMax = Math.min(p.length, Math.max(kAll + 3, N ? Math.min(N + 2, p.length) : 0, 8));
  const xTicks = rankTicks(xMax);
  // Headline and figures.
  setText("headline", `Keep the first ${k95} ranks of every ballot, and 19 in 20 simulated elections elect exactly the same ${seats} people as full ballots. Half of elections need only ${k50}.`);
  const fig = (k, n, t) => { const d = document.createElement("div"); d.className = "figure"; d.innerHTML = '<span class="k"></span><span class="n"></span><span class="t"></span>'; d.children[0].textContent = k; d.children[1].textContent = n; d.children[2].textContent = t; return d; };
  $("figures").replaceChildren(
    fig("19 in 20 elections", `rank ${k95}`, `Cut ballots after this rank or any deeper rank, and 95% of elections come out the same. 8 in 10 need ${k80}; every election, ${kAll}.`),
    fig("One cut, 5 in 100", `rank ${k5}`, `From this rank on, cutting ballots at any single rank changes the winners in fewer than 5 of 100 elections.`),
    fig("Seats", `rank ${kSeat}`, `From this rank on, cutting ballots moves fewer than 1 of the ${seats} seats, on average. No election changes any seat from rank ${kNone}.`),
    fig("Votes that run out", pct(r.exhaustion.votes_pct_mean / 100), "of votes run out of ranked candidates still in the race before the count ends."),
  );
  // Chart 1: elections that come out the same.
  chart($("chart-same"), [{ points: same.slice(0, xMax).map((y, i) => [i + 1, y]), color: "--model", dots: xMax <= 40 }], {
    xMin: 1, xMax, xTicks, yMax: 1, yStep: 0.25, yFmt: pctAxis, xTitle: "Ballots cut after this rank",
    marks: [{ x: k50, y: same[k50 - 1], label: `half: rank ${k50}`, below: true }, { x: k80, y: same[k80 - 1], label: `8 in 10: rank ${k80}`, below: true }, { x: k95, y: same[k95 - 1], label: `19 in 20: rank ${k95}`, below: true }]
      .filter((m, i, a) => a.findIndex(o => o.x === m.x) === i),
    aria: "Share of simulated elections that elect the same people when ballots are cut after each rank",
  });
  // Chart 2: one cut changes the winners.
  chart($("chart-changed"), [{ points: p.slice(0, xMax).map((y, i) => [i + 1, y]), color: "--model", dots: xMax <= 40 }], {
    xMin: 1, xMax, xTicks, yMax: 1, yStep: 0.25, yFmt: pctAxis, xTitle: "Ballots cut after this rank",
    hlines: [{ y: 0.05, label: "5 in 100" }],
    marks: k5 <= xMax ? [{ x: k5, y: p[k5 - 1] ?? 0, label: `below 5 in 100 from rank ${k5}` }] : [],
    aria: "Share of elections where cutting ballots at each rank changes the winners",
  });
  // Chart 3: seats that change hands.
  const top = Math.max(1, ...most.slice(0, xMax));
  const step = niceStep(top);
  chart($("chart-seats"), [
    { points: most.slice(0, xMax).map((y, i) => [i + 1, y]), color: "--model-soft", width: 1.8 },
    { points: mean.slice(0, xMax).map((y, i) => [i + 1, y]), color: "--model", dots: xMax <= 40 },
  ], {
    xMin: 1, xMax, xTicks, yMax: Math.ceil(top / step) * step, yStep: step, yFmt: v => (step < 1 ? v.toFixed(1) : String(Math.round(v))), xTitle: "Ballots cut after this rank",
    hlines: [{ y: 1, label: "1 seat" }],
    marks: [{ x: kSeat, y: mean[kSeat - 1] ?? 0, label: `under 1 seat from rank ${kSeat}` }, ...(kNone <= xMax && kNone !== kSeat ? [{ x: kNone, y: 0, label: `none from rank ${kNone}`, below: false }] : [])],
    aria: "Seats that change hands when ballots are cut after each rank: average and most in any election",
  });
  const what = { up_to: `rank up to ${N}`, at_least: `rank at least ${N}`, exactly: `rank exactly ${N}`, none: "rank as many as they like" }[c.wording];
  setText("election-lede", `${sims.toLocaleString()} simulated elections: ${cand} candidates, ${seats} seats, ${r.settings.election.voters} voters (${c.electorate === "organization" ? "organization members" : "public voters"}), told to ${what}. Each is counted with full ballots, then again with every ballot cut short after rank 1, after rank 2, and so on. These depend on the model's settings, which are still being tuned: treat them as a way to compare settings, not as findings.`);
}

async function runElection(c, seq) {
  setStatus("election-status", "Playing out your election…", true);
  const reply = await engine({ task: "election", settings: electionSettings(c) });
  if (seq !== runSeq) return;
  if (reply.error || !reply.results?.length) {
    setStatus("election-status", reply.error ? `The engine refused these settings: ${reply.error}` : "Seats must be fewer than candidates.", false, true);
    return;
  }
  lastElection = reply.results[0];
  setStatus("election-status", "");
  drawElection(lastElection, c);
}

// ---------------------------------------------------------------- what each setting does
async function runDescribe(c, seq, dims) {
  const reply = await engine({ task: "describe", settings: electionSettings(c), count: 40 });
  if (seq !== runSeq || reply.error) return;
  const m = reply.median, { cand, seats, N } = dims;
  const shares = reply.length_shares;
  const exactlyN = N && N <= cand ? shares[N - 1] : null;
  const atLeastN = N && N <= cand ? shares.slice(N - 1).reduce((a, x) => a + x, 0) : null;
  setText("pull-yours", N ? `${pct(exactlyN)} of voters rank exactly ${N}${c.wording === "at_least" ? `, and ${pct(atLeastN)} rank ${N} or more` : ""}.` : "");
  setText("electorate-yours", `voters rank ${num1(m.length_mean)} candidates on average${exactlyN != null && c.wording !== "none" ? `; ${pct(exactlyN)} rank exactly ${N}` : ""}. The length chart under "Do the simulated elections look like real ones?" shows real elections.`);
  const sizes = reply.slate_sizes_example || [];
  setText("slates-yours", `${sizes.length ? `slates run ${sizes.join(", ")} candidates` : "no slate has candidates"}, and about ${Math.round(reply.candidates_no_slate)} of ${cand} candidates run on no slate (one example election).`);
  setText("loyalty-yours", m.clustering == null ? "no slate runs two or more candidates, so loyalty has nothing to act on." : `${pts(m.clustering)} above popularity, measured the same way as the reference elections.`);
  setText("evenness-yours", m.evenness == null ? "" : `${num2(m.evenness)}. Your election's own figure differs from the slider's scale because its slates and candidates on no slate differ from a Scottish ward's.`);
  const type = cellLike(c);
  setText("spread-yours", `the most popular candidate gets ${pct(reply.top_share)} of first choices: ${times(m.quota)} the quota of ${pct(1 / (seats + 1))}. The least popular gets ${pct(reply.last_share)}.` +
    (type ? ` In real ${type.cell.toLowerCase().replace("public", "public elections").replace("organization", "organizational elections")}, the top candidate gets ${times(type.real.quota)} the quota.` : ""));
  setText("longshot-yours", `${Math.round(reply.long_shots)} of ${cand} candidates are long shots.`);
}

// ---------------------------------------------------------------- real elections
let lastCompare = null;
const STATS = [
  ["quota", "Most popular candidate's first choices, as a multiple of the quota (the share that guarantees a seat)", times, "rel"],
  ["even_last", "Least popular candidate's first choices, as a multiple of an even split (every candidate equal)", times, "rel"],
  ["even_top", "Most popular candidate's first choices, as a multiple of an even split", times, "rel"],
  ["length_mean", "Average number of candidates ranked", num1, "rel"],
  ["complete", "Voters ranking every candidate", pct, "pts"],
  ["fills_limit", "Voters ranking exactly the ballot's limit", pct, "pts"],
  ["clustering", "Slate loyalty: second choices on the same slate, above popularity", pts, "abs"],
  ["evenness", "How evenly votes leave a slate (1 = evenly)", num2, "abs"],
  ["running_mate", "Candidates with a running mate on their slate", pct, "pts"],
  ["no_slate", "Candidates on no slate", pct, "pts"],
];

function match(kind, real, model) {
  if (real == null || model == null) return ["none", "No real data"];
  const d = kind === "rel" ? Math.abs(model - real) / Math.max(Math.abs(real), 1e-9) : Math.abs(model - real);
  const [close, near] = kind === "rel" ? [0.1, 0.25] : kind === "pts" ? [0.03, 0.08] : [0.05, 0.12];
  return d <= close ? ["close", "Close"] : d <= near ? ["near", "Near"] : ["off", "Off"];
}

function drawCompare(cell, reply) {
  const body = $("compare-table").tBodies[0];
  body.replaceChildren();
  for (const [key, label, fmt, kind] of STATS) {
    const real = cell.real[key], model = reply.median[key];
    if (real == null && model == null) continue;
    const tr = document.createElement("tr");
    const [cls, word] = match(kind, real, model);
    for (const [t, c] of [[label, ""], [fmt(real), "n"], [fmt(model), "n"]]) {
      const td = document.createElement("td"); td.textContent = t; if (c) td.className = c; tr.append(td);
    }
    const td = document.createElement("td"); const chip = document.createElement("span"); chip.className = `chip ${cls}`; chip.textContent = word; td.append(chip); tr.append(td);
    body.append(tr);
  }
  // Ballot length: real bars, model line (1 to 15 ranks, then 16 or more).
  const K = cell.length_shares.length;
  const model = new Array(K).fill(0);
  for (const t of reply.twins) t.length_shares.forEach((x, i) => { model[Math.min(i, K - 1)] += x / reply.twins.length; });
  const last = Math.max(3, ...cell.length_shares.map((x, i) => (x > 0.005 ? i + 1 : 0)), ...model.map((x, i) => (x > 0.005 ? i + 1 : 0)));
  const yTop = Math.max(...cell.length_shares, ...model);
  const step = yTop > 0.3 ? 0.1 : 0.05;
  chart($("chart-length"), [{ points: model.slice(0, last).map((y, i) => [i + 1, y]), color: "--model", dots: true }], {
    xMin: 0.5, xMax: last + 0.5, xTicks: Array.from({ length: last }, (_, i) => i + 1), xLabel: x => (x === K ? `${K}+` : x),
    yMax: Math.ceil(yTop / step) * step, yStep: step, yFmt: pctAxis, xTitle: "Candidates ranked",
    bars: cell.length_shares.slice(0, last).map((y, i) => ({ x: i + 1, y })), aria: "Share of voters ranking each number of candidates, real against model",
  });
}

async function runCompare(c, seq) {
  if (!reference) return;
  const cell = reference.cells.find(x => x.cell === c.cell) || reference.cells[0];
  const names = { scotland: "Scottish", ers: "union and society", org: "other organizational", public: "other public", nyc: "NYC", portland: "Portland", act: "Canberra" };
  const src = Object.entries(cell.sources).map(([k, n]) => `${n} ${names[k] || k}`).join(", ");
  setText("cell-note", `${cell.elections} real elections: ${src}. The twins use your slate and popularity settings, with ${cell.electorate === "organization" ? "organization members'" : "public voters'"} ballot lengths.` +
    (cell.sources.scotland ? " Scottish parties are tight: set slate loyalty near 61 to compare with them." : ""));
  setStatus("compare-status", "Playing out twins of real elections…", true);
  const twins = cell.twins.map(({ name, ...t }) => t);
  const reply = await engine({ task: "twins", electorate: { type: cell.electorate }, model: modelSettings(c), merge_last: cell.merge_last, twins });
  if (seq !== runSeq) return;
  if (reply.error) { setStatus("compare-status", `The engine refused these settings: ${reply.error}`, false, true); return; }
  lastCompare = { cell, reply };
  setStatus("compare-status", "");
  drawCompare(cell, reply);
}

// ---------------------------------------------------------------- run on every change
let runSeq = 0;
let timer = null;

function setStatus(id, msg, busy, error) {
  $(id).className = `status${busy ? " busy" : ""}${error ? " error" : ""}`;
  $(id).textContent = msg;
}

async function refresh() {
  if (!reference) return;
  let c = readControls();
  fitted = await engine({ task: "defaults", electorate: c.electorate, seats: int(c.seats, 1, 999) });
  const dims = updateLabels(c);
  c = readControls(); // sliders that follow "auto" may have moved
  try { localStorage.setItem(STORE_KEY, JSON.stringify(c)); } catch { /* storage may be blocked */ }
  $("toml").textContent = toml(electionSettings(c), $("tuning-name").value.trim());
  const seq = ++runSeq;
  // Quick answers first, then the slower count of your election.
  await Promise.all([runDescribe(c, seq, dims), runCompare(c, seq)]);
  if (seq === runSeq) await runElection(c, seq);
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(refresh, 250);
}

$("controls").addEventListener("input", schedule);
$("controls").addEventListener("change", schedule);
$("controls").addEventListener("submit", e => e.preventDefault());
$("cell").addEventListener("change", schedule);
$("tuning-name").addEventListener("input", () => { $("toml").textContent = toml(electionSettings(readControls()), $("tuning-name").value.trim()); });
let resizeTimer = null;
addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const c = readControls();
    if (lastElection) drawElection(lastElection, c);
    if (lastCompare) drawCompare(lastCompare.cell, lastCompare.reply);
  }, 150);
});

// ---------------------------------------------------------------- saving
const use = name => (window.claude?.use ? window.claude.use(name) : Promise.resolve(null));
let db = null;
const say = (msg, error) => setStatus("save-status", msg, false, error);

$("copy").addEventListener("click", () => {
  const t = $("toml").textContent;
  navigator.clipboard.writeText(t).then(() => say("Copied. Paste it into a .toml file, or into a message to Claude."), () => {
    const r = document.createRange(); r.selectNodeContents($("toml"));
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    say("Your browser blocked copying. The settings are selected: copy them with your keyboard.");
  });
});

$("save-shared").addEventListener("click", async () => {
  const name = $("tuning-name").value.trim();
  if (!name) { say("Give these settings a name first.", true); $("tuning-name").focus(); return; }
  if (!db) { say("Saving to the list works on the published page. Here, copy the settings instead.", true); return; }
  $("save-shared").disabled = true;
  try {
    const user = await use("user");
    const c = readControls();
    await db.collection("tunings").doc(slug(name)).set({
      name, saved_at: new Date().toISOString(), by: user ? await user.id() : null,
      controls: c, settings: electionSettings(c), toml: toml(electionSettings(c), name),
      checked_against: lastCompare ? { cell: lastCompare.cell.cell, real: lastCompare.cell.real, model: lastCompare.reply.median } : null,
    });
    say(`Saved "${name}".`);
  } catch (e) {
    say(e?.code === "permission_denied" ? "You can view this page but not save to its list. Copy the settings instead." : `Couldn't save: ${e?.message || e}`, true);
  } finally {
    $("save-shared").disabled = false;
  }
});

function showSaved(snap) {
  const list = $("saved");
  list.replaceChildren();
  $("saved-wrap").hidden = snap.empty;
  for (const d of snap.docs) {
    const t = d.data();
    const li = document.createElement("li");
    const left = document.createElement("span");
    const b = document.createElement("strong"); b.textContent = t.name;
    const when = document.createElement("span"); when.className = "when";
    when.textContent = ` saved ${new Date(t.saved_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`;
    left.append(b, when);
    const load = document.createElement("button"); load.type = "button"; load.className = "quiet"; load.textContent = "Load";
    load.addEventListener("click", () => { writeControls(t.controls); $("tuning-name").value = t.name; schedule(); say(`Loaded "${t.name}".`); });
    li.append(left, load);
    list.append(li);
  }
}

use("db").then(d => {
  db = d;
  if (!db) return;
  db.collection("tunings").orderBy("saved_at", "desc").limit(100).onSnapshot(showSaved, () => { $("saved-wrap").hidden = true; });
});
use("downloads").then(downloads => {
  if (!downloads) return;
  $("download").hidden = false;
  $("download").addEventListener("click", async () => {
    const name = $("tuning-name").value.trim() || "tuning";
    try {
      const r = await downloads.save({ filename: `${slug(name)}.toml`, data: $("toml").textContent });
      if (r?.status === "saved") say("Saved the settings file.");
    } catch (e) {
      say(`Couldn't save the file: ${e?.message || e}`, true);
    }
  });
});

// ---------------------------------------------------------------- start
(async () => {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch { /* storage may be blocked */ }
  try {
    reference = await (await fetch("reference.json")).json();
    $("cell").replaceChildren(...reference.cells.map(x => { const o = document.createElement("option"); o.value = o.textContent = x.cell; return o; }));
    $("cell").value = "Organization, 5 or more seats";
    $("loyalty").value = Math.round(pointsFor(4));
    $("evenness").value = evennessFor(1.2).toFixed(3);
  } catch {
    setStatus("compare-status", "Couldn't load the real-election reference (reference.json).", false, true);
    return;
  }
  if (saved) writeControls(saved);
  refresh();
})();
