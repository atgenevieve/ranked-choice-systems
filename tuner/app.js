// Rank Depth Tuner: controls -> settings -> the engine (worker.js runs stvsim.wasm) -> results.
// Two requests per change: twins of real elections (reference.json, built by
// data/tuner_reference.py), and the viewer's own election. See tuner/README.md.
"use strict";

const $ = id => document.getElementById(id);
const STORE_KEY = "rank-depth-tuner-controls";
const STRENGTH_MAX = 200; // the strength slider runs from 1 (no pull) to 200, on a log scale

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
const times = v => v == null ? "–" : `${v.toFixed(2)}×`;
const num1 = v => v == null ? "–" : v.toFixed(1);
const num2 = v => v == null ? "–" : v.toFixed(2);
const strengthOf = v => Math.pow(STRENGTH_MAX, v / 100);
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const NS = "http://www.w3.org/2000/svg";
const el = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent?.append(e); return e; };
const text = (parent, x, y, s, attrs = {}) => { const t = el("text", { x, y, ...attrs }, parent); t.textContent = s; return t; };

// ---------------------------------------------------------------- controls
const FIELDS = ["candidates", "seats", "voters", "sims", "seed", "wording", "n", "n-seats", "slates", "sizing", "strength", "unaff", "other",
  "spread-auto", "spread", "longshot-auto", "longshot", "gap", "pull-auto", "pull", "cell"];

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

const int = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || lo)));

/** The model settings (the [model] section) from the controls. */
function modelSettings(c) {
  return {
    version: "0.2",
    slates: int(c.slates, 1, 12),
    slate_candidates: c.sizing,
    slate_strength: Number(strengthOf(Number(c.strength)).toFixed(2)),
    unaffiliated_share: Number(c.unaff),
    other_slate_spread: Number(c.other),
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
  const lines = [`# ${name || "A tuning"}, saved from the Rank Depth Tuner.`, "# Run with: engine/target/release/stvsim run <this file>", ""];
  const section = (head, obj) => {
    lines.push(`[${head}]`);
    for (const [k, x] of Object.entries(obj)) lines.push(`${k} = ${Array.isArray(x) ? `[${x.join(", ")}]` : v(x)}`);
    lines.push("");
  };
  section("run", { ...s.run, name: (name || "tuning").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tuning" });
  section("election", s.election);
  section("electorate", s.electorate);
  section("ballot", s.ballot);
  section("model", s.model);
  return lines.join("\n");
}

// ---------------------------------------------------------------- labels next to sliders
let fitted = null; // what "auto" means for the viewer's election (from the engine)

function updateLabels(c) {
  const st = strengthOf(Number(c.strength));
  const word = Math.abs(st - 4) < 0.6 ? "loose" : Math.abs(st - 100) < 12 ? "tight" : st < 1.2 ? "no pull" : "";
  $("strength-v").textContent = `${word ? word + ", " : ""}${st < 10 ? st.toFixed(1) : Math.round(st)}× own slate`;
  $("unaff-v").textContent = pct(Number(c.unaff));
  $("other-v").textContent = num2(Number(c.other));
  $("spread").disabled = c["spread-auto"];
  $("longshot").disabled = c["longshot-auto"];
  $("pull").disabled = c["pull-auto"];
  $("n").disabled = c["n-seats"] || c.wording === "none";
  $("n-seats").disabled = c.wording === "none";
  if (c["n-seats"]) $("n").value = int(c.seats, 1, 999);
  $("spread-v").textContent = c["spread-auto"] ? (fitted ? `fitted, ${num2(fitted.popularity_spread)}` : "fitted") : num2(Number(c.spread));
  $("longshot-v").textContent = c["longshot-auto"] ? (fitted ? `fitted, ${pct(fitted.long_shot_share)}` : "fitted") : pct(Number(c.longshot));
  const g = Number(c.gap);
  $("gap-v").textContent = g >= 0 ? `${Math.exp(g).toFixed(1)}× less popular` : `standouts, ${Math.exp(-g).toFixed(1)}× more popular`;
  $("pull-v").textContent = c["pull-auto"] ? "fitted" : pct(Number(c.pull));
}

// ---------------------------------------------------------------- charts
/** A line chart on linear scales. series: [{points: [[x, y]], color, width, dash}];
 *  opts: {xMax, yMax, yStep, yFmt, xTitle, hline: {y, label}, bars: [{x, y}] (drawn behind)}. */
function lineChart(box, series, opts) {
  box.replaceChildren();
  const w = Math.max(260, box.clientWidth || 600), H = 230, L = 44, R = 12, T = 12, B = 36;
  const svg = el("svg", { viewBox: `0 0 ${w} ${H}`, height: H, role: "img", "aria-label": opts.aria || "" }, box);
  const sx = x => L + (x - opts.xMin) / (opts.xMax - opts.xMin) * (w - L - R);
  const sy = y => T + (1 - y / opts.yMax) * (H - T - B);
  for (let y = 0; y <= opts.yMax + 1e-9; y += opts.yStep) {
    el("line", { x1: L, x2: w - R, y1: sy(y), y2: sy(y), stroke: css(y === 0 ? "--rule" : "--grid"), "stroke-width": 1 }, svg);
    text(svg, L - 6, sy(y) + 4, opts.yFmt(y), { "text-anchor": "end" });
  }
  const xs = opts.xTicks;
  for (const x of xs) text(svg, sx(x), H - B + 15, String(opts.xLabel ? opts.xLabel(x) : x), { "text-anchor": "middle" });
  text(svg, (L + w - R) / 2, H - 4, opts.xTitle, { "text-anchor": "middle", class: "title" });
  if (opts.bars) {
    const bw = Math.max(2, (sx(opts.xMin + 1) - sx(opts.xMin)) * 0.7);
    for (const b of opts.bars) {
      const h = sy(0) - sy(b.y);
      if (h > 0) el("rect", { x: sx(b.x) - bw / 2, y: sy(b.y), width: bw, height: h, rx: 1.5, fill: css("--real") }, svg);
    }
  }
  if (opts.hline) {
    el("line", { x1: L, x2: w - R, y1: sy(opts.hline.y), y2: sy(opts.hline.y), stroke: css("--bad"), "stroke-width": 1.2, "stroke-dasharray": "5 4" }, svg);
    text(svg, w - R, sy(opts.hline.y) - 5, opts.hline.label, { "text-anchor": "end", class: "lab" });
  }
  for (const s of series) {
    const pts = s.points.map(([x, y]) => `${sx(x).toFixed(1)},${sy(Math.min(y, opts.yMax)).toFixed(1)}`).join(" ");
    el("polyline", { points: pts, fill: "none", stroke: css("--surface"), "stroke-width": (s.width || 2.5) + 3, "stroke-linejoin": "round" }, svg);
    el("polyline", { points: pts, fill: "none", stroke: css(s.color), "stroke-width": s.width || 2.5, "stroke-linejoin": "round", "stroke-dasharray": s.dash || "" }, svg);
    if (s.dots) for (const [x, y] of s.points) el("circle", { cx: sx(x), cy: sy(Math.min(y, opts.yMax)), r: 3, fill: css(s.color) }, svg);
  }
}

function niceStep(max) {
  const raw = max / 5, p = Math.pow(10, Math.floor(Math.log10(raw)));
  return [1, 2, 2.5, 5, 10].map(m => m * p).find(s => s >= raw) || raw;
}
/** Rank ticks: 1, then every 1, 5, 10, or 20 ranks, depending on how many are shown. */
function ticksUpTo(max) {
  const step = max <= 12 ? 1 : max <= 30 ? 5 : max <= 60 ? 10 : 20;
  const out = [1];
  for (let x = step; x <= max; x += step) if (x !== 1) out.push(x);
  return out;
}

// ---------------------------------------------------------------- your election
let lastElection = null;

function drawElection(r, c) {
  const t = r.truncation, seats = r.seats, ballotN = c.wording === "none" ? null : (c["n-seats"] ? seats : int(c.n, 1, 999));
  const p = t.p_changed, mean = t.seats_changed.mean;
  // Show the curve out to a few ranks past the last change.
  const last = Math.max(...p.map((x, i) => (x > 0 ? i + 1 : 0)), ...mean.map((x, i) => (x > 0 ? i + 1 : 0)), 3);
  const xMax = Math.min(p.length, Math.max(last + 3, ballotN ? Math.min(ballotN + 2, p.length) : 0, 8));
  const cut = t.cutoff_rank, t5 = t.threshold_rank.t5, sims = r.settings.run.sims;
  const atN = ballotN && ballotN <= p.length ? p[ballotN - 1] : null;
  const at10 = Math.min(10, mean.length);
  $("figures").replaceChildren(...[
    [String(t5), `ranks that matter: cutting ballots at rank ${t5} or deeper changes the winners in fewer than 5 of 100 elections`],
    [`${cut.p10} to ${cut.p90}`, `the cutoff rank in 8 of 10 elections (typical: ${cut.p50}). Cutting at it or deeper never changes the winners`],
    [num1(mean[at10 - 1]), `seats change hands, on average, out of ${seats}, when ballots are cut after rank ${at10}`],
    [pct(r.exhaustion.votes_pct_mean / 100), "of votes run out of ranked candidates before the count ends"],
  ].map(([n, t]) => { const d = document.createElement("div"); d.className = "figure"; d.innerHTML = `<span class="n"></span><span class="t"></span>`; d.children[0].textContent = n; d.children[1].textContent = t; return d; }));
  const xs = ticksUpTo(xMax);
  lineChart($("chart-changed"), [{ points: p.slice(0, xMax).map((y, i) => [i + 1, y]), color: "--model", dots: xMax <= 30 }], {
    xMin: 1, xMax, xTicks: xs, yMax: 1, yStep: 0.25, yFmt: v => `${Math.round(v * 100)}%`, xTitle: "Ballots cut after this rank",
    hline: { y: 0.05, label: "5 in 100" }, aria: "Share of elections where cutting ballots at each rank changes the winners",
  });
  const mMax = Math.max(1, ...mean.slice(0, xMax));
  const step = niceStep(mMax);
  lineChart($("chart-seats"), [{ points: mean.slice(0, xMax).map((y, i) => [i + 1, y]), color: "--model", dots: xMax <= 30 }], {
    xMin: 1, xMax, xTicks: xs, yMax: Math.ceil(mMax / step) * step, yStep: step, yFmt: v => (step < 1 ? v.toFixed(1) : String(Math.round(v))), xTitle: "Ballots cut after this rank",
    aria: "Average number of seats that change hands when ballots are cut at each rank",
  });
  const what = { up_to: `rank up to ${ballotN}`, at_least: `rank at least ${ballotN}`, exactly: `rank exactly ${ballotN}`, none: "rank as many as they like" }[c.wording];
  $("election-lede").textContent = `${sims} simulated elections: ${r.settings.election.candidates} candidates, ${seats} seats, ${r.settings.election.voters} voters (${c.electorate === "organization" ? "organization members" : "public voters"}), told to ${what}. Each is counted with full ballots, then with every ballot cut after rank 1, 2, 3, and so on.` +
    (atN != null && c.wording !== "none" ? ` Cutting at the ballot's own N (${ballotN}) changes the winners in ${pct(atN)} of elections.` : "");
}

async function runElection(c, seq) {
  $("election-status").className = "status busy";
  $("election-status").textContent = "Simulating your election…";
  const reply = await engine({ task: "election", settings: electionSettings(c) });
  if (seq !== runSeq) return;
  if (reply.error || !reply.results?.length) {
    $("election-status").className = "status error";
    $("election-status").textContent = reply.error ? `The engine refused these settings: ${reply.error}` : "Seats must be fewer than candidates.";
    return;
  }
  lastElection = reply.results[0];
  $("election-status").className = "status";
  $("election-status").textContent = "";
  drawElection(lastElection, c);
}

// ---------------------------------------------------------------- real elections
let reference = null;
let lastCompare = null;
const STATS = [
  ["quota", "Top candidate's first choices, as a multiple of the quota", times, "rel"],
  ["even_last", "Last candidate's first choices, as a multiple of an even split", times, "rel"],
  ["even_top", "Top candidate, as a multiple of an even split", times, "rel"],
  ["length_mean", "Average number of candidates ranked", num1, "rel"],
  ["complete", "Share ranking every candidate", pct, "pts"],
  ["fills_limit", "Share ranking exactly the ballot's limit", pct, "pts"],
  ["clustering", "Clustering above popularity (second choice on the same slate)", num2, "abs"],
  ["evenness", "Evenness of votes leaving a slate (1 = even)", num2, "abs"],
  ["running_mate", "Candidates with a running mate", pct, "pts"],
  ["no_slate", "Candidates in no slate", pct, "pts"],
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
  // Ballot-length distribution: real bars, model line (lengths 1 to 15, then 16 or more).
  const K = cell.length_shares.length;
  const model = new Array(K).fill(0);
  for (const t of reply.twins) {
    t.length_shares.forEach((x, i) => { model[Math.min(i, K - 1)] += x / reply.twins.length; });
  }
  const last = Math.max(3, ...cell.length_shares.map((x, i) => (x > 0.005 ? i + 1 : 0)), ...model.map((x, i) => (x > 0.005 ? i + 1 : 0)));
  const yTop = Math.max(...cell.length_shares, ...model);
  const step = yTop > 0.3 ? 0.1 : 0.05;
  lineChart($("chart-length"), [{ points: model.slice(0, last).map((y, i) => [i + 1, y]), color: "--model", dots: true }], {
    xMin: 0.5, xMax: last + 0.5, xTicks: Array.from({ length: last }, (_, i) => i + 1), xLabel: x => (x === K ? `${K}+` : x),
    yMax: Math.ceil(yTop / step) * step, yStep: step, yFmt: v => `${Math.round(v * 100)}%`, xTitle: "Candidates ranked",
    bars: cell.length_shares.slice(0, last).map((y, i) => ({ x: i + 1, y })), aria: "Share of voters ranking each number of candidates, real against model",
  });
}

async function runCompare(c, seq) {
  if (!reference) return;
  const cell = reference.cells.find(x => x.cell === c.cell) || reference.cells[0];
  const src = Object.entries(cell.sources).map(([k, n]) => `${n} ${{ scotland: "Scottish", ers: "union and society", org: "other organizational", public: "other public", nyc: "NYC", portland: "Portland", act: "Canberra" }[k] || k}`).join(", ");
  $("cell-note").textContent = `${cell.elections} real elections: ${src}. Twins use your slate and popularity settings with ${cell.electorate === "organization" ? "organization members" : "public voters"}' ballot lengths, whatever you chose for your own election.` +
    (cell.sources.scotland ? " Scottish parties are tight: set slates to tight to compare with them." : "");
  $("compare-status").className = "status busy";
  $("compare-status").textContent = "Simulating twins of real elections…";
  const twins = cell.twins.map(({ name, ...t }) => t);
  const reply = await engine({ task: "twins", electorate: { type: cell.electorate }, model: modelSettings(c), merge_last: cell.merge_last, twins });
  if (seq !== runSeq) return;
  if (reply.error) {
    $("compare-status").className = "status error";
    $("compare-status").textContent = `The engine refused these settings: ${reply.error}`;
    return;
  }
  lastCompare = { cell, reply };
  $("compare-status").className = "status";
  $("compare-status").textContent = "";
  drawCompare(cell, reply);
}

// ---------------------------------------------------------------- run on every change
let runSeq = 0;
let timer = null;

async function refresh() {
  const c = readControls();
  updateLabels(c);
  try { localStorage.setItem(STORE_KEY, JSON.stringify(c)); } catch { /* storage may be blocked */ }
  $("toml").textContent = toml(electionSettings(c), $("tuning-name").value.trim());
  const seats = int(c.seats, 1, 999);
  fitted = await engine({ task: "defaults", electorate: c.electorate, seats });
  updateLabels(c);
  const seq = ++runSeq;
  await Promise.all([runElection(c, seq), runCompare(c, seq)]);
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

function say(msg, error) {
  $("save-status").className = error ? "status error" : "status";
  $("save-status").textContent = msg;
}

$("copy").addEventListener("click", () => {
  const t = $("toml").textContent;
  navigator.clipboard.writeText(t).then(() => say("Copied. Paste it into a .toml file, or into a message to Claude."), () => {
    const r = document.createRange(); r.selectNodeContents($("toml"));
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    say("Your browser blocked copying. The settings are selected: copy them with your keyboard.");
  });
});

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "tuning";
}

$("save-shared").addEventListener("click", async () => {
  const name = $("tuning-name").value.trim();
  if (!name) { say("Give the tuning a name first.", true); $("tuning-name").focus(); return; }
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
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (saved) writeControls(saved);
  } catch { /* storage may be blocked */ }
  try {
    reference = await (await fetch("reference.json")).json();
    $("cell").replaceChildren(...reference.cells.map(x => { const o = document.createElement("option"); o.value = o.textContent = x.cell; return o; }));
    let wanted = "Organization, 5 or more seats";
    try { wanted = JSON.parse(localStorage.getItem(STORE_KEY) || "{}").cell || wanted; } catch { /* ignore */ }
    $("cell").value = wanted;
  } catch {
    $("compare-status").className = "status error";
    $("compare-status").textContent = "Couldn't load the real-election reference (reference.json).";
  }
  refresh();
})();
