// NYC DSA branch page (branches.html): plays out every branch's delegate election with the
// model settings from the shared tabs (app.js), and shows, for each branch, how many ranks affect
// the results and how many winners change. Uses app.js's engine, chart, and settings code.
"use strict";

// Candidates and seats from the branches' candidate counts; expected ballots from the 2026
// turnout projections (expected members × projected turnout).
const BRANCH_DEFAULTS = [
  { name: "Bronx/Upper Manhattan", candidates: 120, seats: 65, voters: 626 },
  { name: "Central Brooklyn", candidates: 132, seats: 83, voters: 838 },
  { name: "Flatbush", candidates: 55, seats: 32, voters: 477 },
  { name: "Lower Manhattan", candidates: 87, seats: 61, voters: 437 },
  { name: "North Brooklyn", candidates: 105, seats: 76, voters: 731 },
  { name: "Queens", candidates: 113, seats: 67, voters: 706 },
  { name: "South Brooklyn + Staten Island", candidates: 78, seats: 51, voters: 461 },
];
const BRANCH_KEY = "rank-depth-branches-list-v1";
let branchList = BRANCH_DEFAULTS.map(b => ({ ...b }));
try { const saved = JSON.parse(localStorage.getItem(BRANCH_KEY) || "null"); if (Array.isArray(saved) && saved.length) branchList = saved; } catch { /* storage may be blocked */ }
const branchResults = new Map();  // name -> {b, r}
const branchWorth = new Map();    // name -> {any, edge (summed WorthSums), done, total (elections)}
const WORTH_CHUNK = 50;           // simulated elections per worth request, so the pool can share them out

function drawBranchTable() {
  const body = $("branch-table").tBodies[0];
  body.replaceChildren();
  branchList.forEach((b, i) => {
    const tr = document.createElement("tr");
    const cell = (key, type) => {
      const td = document.createElement("td"); if (type === "number") td.className = "num";
      const input = document.createElement("input"); input.type = type; input.value = b[key];
      input.setAttribute("aria-label", `${b.name}: ${key === "voters" ? "expected ballots" : key}`);
      if (type === "number") input.min = key === "voters" ? 10 : 1;
      input.addEventListener("input", () => {
        branchList[i][key] = type === "number" ? Number(input.value) : input.value;
        try { localStorage.setItem(BRANCH_KEY, JSON.stringify(branchList)); } catch { /* storage may be blocked */ }
      });
      td.append(input); tr.append(td);
    };
    cell("name", "text"); cell("candidates", "number"); cell("seats", "number"); cell("voters", "number");
    body.append(tr);
  });
}
drawBranchTable();
$("branch-reset").addEventListener("click", () => {
  branchList = BRANCH_DEFAULTS.map(b => ({ ...b }));
  try { localStorage.removeItem(BRANCH_KEY); } catch { /* storage may be blocked */ }
  drawBranchTable();
  schedule();
});

/** The ranks and seat counts the page reports, from one engine result line. */
function branchFigures(r) {
  const t = r.truncation, sims = r.settings.run.sims;
  const same = [];
  t.cutoff_rank.counts.reduce((acc, n, i) => { same[i] = (acc + n) / sims; return acc + n; }, 0);
  const at = level => same.findIndex(x => x >= level - 1e-9) + 1;
  const mean = t.seats_changed.mean, most = t.seats_changed.max;
  return { same, mean, most, k50: at(0.5), k80: at(0.8), k95: at(0.95), kAll: at(1),
    kOne: holdsFrom(mean, x => x <= 1), kZero: holdsFrom(mean, x => x === 0) };
}

function drawSummary() {
  const body = $("summary").tBodies[0];
  body.replaceChildren();
  for (const b of branchList) {
    const got = branchResults.get(b.name);
    const f = got && branchFigures(got.r);
    const tr = document.createElement("tr");
    const cells = [b.name, b.candidates, b.seats, Number(b.voters).toLocaleString(), ...(f ? [f.k95, f.kOne] : ["…", "…"])];
    cells.forEach((v, i) => {
      const td = document.createElement("td"); td.textContent = v;
      if (i > 0) td.className = i === 4 ? "n k95" : "n";
      tr.append(td);
    });
    body.append(tr);
  }
}

/** Every branch's two charts, on the same rank axis so the branches can be compared. */
function drawBranches() {
  worthCharts = [];
  drawSummary();
  const box = $("branches");
  box.replaceChildren();
  const done = branchList.map(b => branchResults.get(b.name)).filter(Boolean);
  if (!done.length) return;
  const xMax = Math.max(8, ...done.map(({ r }) => Math.min(branchFigures(r).kAll + 3, r.truncation.p_changed.length)));
  const xTicks = rankTicks(xMax);
  const topSeats = Math.max(1, ...done.map(({ r }) => Math.max(...branchFigures(r).most.slice(0, xMax))));
  const seatStep = niceStep(topSeats);
  for (const b of branchList) {
    const got = branchResults.get(b.name);
    if (!got) continue;
    const r = got.r, f = branchFigures(r), seats = r.seats, len = r.truncation.p_changed.length, x = Math.min(xMax, len);
    const sec = document.createElement("section"); sec.className = "branch";
    const h = document.createElement("h3"); h.textContent = b.name;
    const stats = document.createElement("div"); stats.className = "stats";
    for (const line of [`Candidates: ${b.candidates}`, `Seats: ${seats} (${Math.round(100 * seats / b.candidates)}% win)`, `Voters: ${Number(b.voters).toLocaleString()} (±${Math.round((r.settings.election.turnout_spread || 0) * 100)}%)`]) {
      const p = document.createElement("p"); p.className = "says"; p.textContent = line; stats.append(p);
    }
    const says = document.createElement("p"); says.className = "says";
    says.textContent = `95% of elections are decided within the first ${f.k95} ranks; 50% within ${f.k50}. Below rank ${f.kOne}, 1 or fewer winners change on average.`;
    const ran = r.settings.run.sims, wanted = got.total || ran;
    if (ran < wanted) says.textContent += ` Still running: these are from the first ${ran.toLocaleString()} of ${wanted.toLocaleString()} simulated elections so far.`;
    const pair = document.createElement("div"); pair.className = "pair";
    const half = (title, legendHtml) => {
      const d = document.createElement("div");
      const t = document.createElement("h4"); t.textContent = title; d.append(t);
      if (legendHtml) { const l = document.createElement("div"); l.className = "legend"; l.innerHTML = legendHtml; d.append(l); }
      const c = document.createElement("div"); c.className = "chart"; d.append(c);
      pair.append(d);
      return c;
    };
    const c1 = half("How many ranks affect election results");
    const c2 = half("How many winners change", '<span><i class="swatch line" style="background:var(--model)"></i>Average</span><span><i class="swatch line" style="background:var(--model-soft)"></i>Most in any simulated election</span>');
    sec.append(h, stats, says, pair);
    const worth = branchWorth.get(b.name);
    if (worth && worth.done) {
      const card = document.createElement("div"); card.className = "worthcard";
      const t = document.createElement("h4"); t.textContent = "What each ballot position is worth to a candidate";
      const m = worthMeans(worth);
      const edgeTimes = m.anyTop > 0 ? Math.round(m.edgeTop / m.anyTop) : null;
      const read = document.createElement("p"); read.className = "read";
      read.textContent = `How many percentage points more likely a candidate is to win when one more voter ranks them at this position instead of leaving them off.` +
        (edgeTimes ? ` In a close race, every position is worth about ${edgeTimes} times more.` : "") +
        ` Error bars: the range the average could fall in by chance (95%).` +
        (worth.done < worth.total ? ` Still running: ${worth.done.toLocaleString()} of ${worth.total.toLocaleString()} simulated elections so far.` : "");
      const c3 = document.createElement("div"); c3.className = "chart";
      card.append(t, read, c3);
      sec.append(card);
      worthCharts.push({ box: c3, m, name: b.name });
    }
    box.append(sec);
    chart(c1, [{ points: f.same.slice(0, x).map((y, i) => [i + 1, y]), color: "--model", dots: x <= 40 }], {
      xMin: 1, xMax, xTicks, yMax: 1, yStep: 0.25, yFmt: pctAxis, xTitle: "Ballots cut after this rank",
      marks: [[f.k50, "50%"], [f.k80, "80%"], [f.k95, "95%"], [f.kAll, "100%"]].filter(([k], i, a) => a.findIndex(o => o[0] === k) === i)
        .map(([k, l]) => ({ x: k, y: f.same[k - 1], label: `${l}: rank ${k}`, below: true })),
      aria: `${b.name}: share of simulated elections with the same results when ballots are cut after each rank`,
    });
    chart(c2, [
      { points: f.most.slice(0, x).map((y, i) => [i + 1, y]), color: "--model-soft", width: 1.8 },
      { points: f.mean.slice(0, x).map((y, i) => [i + 1, y]), color: "--model", dots: x <= 40 },
    ], {
      xMin: 1, xMax, xTicks, yMax: Math.ceil(topSeats / seatStep) * seatStep, yStep: seatStep, yFmt: v => (seatStep < 1 ? v.toFixed(1) : String(Math.round(v))), xTitle: "Ballots cut after this rank",
      marks: [...(f.kOne <= xMax ? [{ x: f.kOne, y: f.mean[f.kOne - 1] ?? 0, label: `1 seat: rank ${f.kOne}` }] : []),
        ...(f.kZero <= xMax && f.kZero !== f.kOne ? [{ x: f.kZero, y: 0, label: `0 seats: rank ${f.kZero}` }] : [])],
      aria: `${b.name}: winners who change when every ballot stops at each rank`,
    });
  }
}
window.redrawBranches = () => { drawBranches(); drawWorthCharts(); };

/** Means and 95% ranges, in percentage points, from summed worth results. */
function worthMeans(w) {
  const stat = g => g.sum.map((x, k) => {
    const n = g.n[k];
    if (!n) return null;
    const mean = x / n, sd = Math.sqrt(Math.max(0, g.sq[k] / n - mean * mean));
    return { m: 100 * mean, lo: 100 * (mean - 1.96 * sd / Math.sqrt(n)), hi: 100 * (mean + 1.96 * sd / Math.sqrt(n)) };
  });
  const any = stat(w.any), edge = stat(w.edge);
  const top10 = a => a.slice(0, 10).reduce((t, v) => t + (v ? v.m : 0), 0);
  return { any, anyTop: top10(any), edgeTop: top10(edge) };
}

let worthCharts = [];
/** The worth bar charts, one bar per ballot position, on one scale across branches. */
function drawWorthCharts() {
  const peak = Math.max(1, ...worthCharts.flatMap(({ m }) => m.any.filter(Boolean).map(v => v.hi)));
  const step = niceStep(peak), yMax = Math.ceil(peak / step) * step;
  for (const { box, m, name } of worthCharts) barChart(box, m.any, { yMax, yStep: step, aria: `${name}: what each ballot position is worth to a candidate` });
}

/** Bars from 0, one per position, with error bars that stay visible over the bars. */
function barChart(box, vals, opts) {
  box.replaceChildren();
  const w = Math.max(280, box.clientWidth || 800), H = 240, L = 56, R = 10, T = 12, B = 38;
  const svg = el("svg", { viewBox: `0 0 ${w} ${H}`, height: H, role: "img", "aria-label": opts.aria || "" }, box);
  const n = vals.length, bw = (w - L - R) / n;
  const sx = i => L + i * bw + bw / 2, sy = v => T + (1 - Math.max(0, Math.min(v, opts.yMax)) / opts.yMax) * (H - T - B);
  for (let y = 0; y <= opts.yMax + 1e-9; y += opts.yStep) {
    el("line", { x1: L, x2: w - R, y1: sy(y), y2: sy(y), stroke: css(y === 0 ? "--rule" : "--grid"), "stroke-width": 1 }, svg);
    text(svg, L - 6, sy(y) + 4, y ? `+${+y.toFixed(2)} pts` : "0", { "text-anchor": "end" });
  }
  const every = n <= 20 ? 1 : n <= 50 ? 5 : 10;
  vals.forEach((v, i) => {
    if ((i + 1) % every === 0 || i === 0) text(svg, sx(i), H - B + 15, String(i + 1), { "text-anchor": "middle" });
    if (!v) return;
    el("rect", { x: sx(i) - bw * 0.36, y: sy(v.m), width: bw * 0.72, height: Math.max(0.5, sy(0) - sy(v.m)), fill: css("--model") }, svg);
    if (v.hi - v.lo < 1e-9) return;
    const tw = Math.max(2, bw * 0.22), lo = sy(v.lo), hi = sy(v.hi);
    for (const [stroke, width] of [[css("--surface"), 3.5], [css("--ink"), 1.3]]) {
      el("line", { x1: sx(i), x2: sx(i), y1: lo, y2: hi, stroke, "stroke-width": width, "stroke-linecap": "round" }, svg);
      for (const y of [lo, hi]) el("line", { x1: sx(i) - tw, x2: sx(i) + tw, y1: y, y2: y, stroke, "stroke-width": width, "stroke-linecap": "round" }, svg);
    }
  });
  text(svg, (L + w - R) / 2, H - 4, "Position on one voter's ballot", { "text-anchor": "middle", class: "title" });
}

/** Plays out every branch at once across the engine pool, so the charts fill in as it goes:
 *  each branch's election (the two line charts) first from its first 50, then 200, then all
 *  simulated elections (election i always gets the same seed, so a smaller run is exactly the
 *  start of the full one); then what each ballot position is worth, in chunks of elections taken
 *  in turn across the branches. Requests queued when the settings change are dropped unstarted. */
window.runBranches = async (c, alive) => {
  setText("sims-count", int(c.sims, 10, 1000).toLocaleString());
  setText("slates-count", String(int(c.slates, 1, 12)));
  setText("turnout-head", String(int(c.turnout, 0, 30)));
  branchResults.clear();
  branchWorth.clear();
  window.redrawBranches();
  let pendingDraw = false;
  const redraw = () => {
    if (pendingDraw) return;
    pendingDraw = true;
    requestAnimationFrame(() => { pendingDraw = false; if (alive()) window.redrawBranches(); });
  };
  const sims = int(c.sims, 10, 1000);
  // Two parts, reported separately: the branches' elections (the line charts) come back first;
  // what each position is worth takes about 12 times as long, since every simulated election
  // is recounted once per position for 8 candidates.
  let elections = 0, electionsDone = 0, chunks = 0, chunksDone = 0;
  const progress = () => {
    if (!alive()) return;
    if (electionsDone < elections) setStatus("branches-status", `Playing out the branches: ${electionsDone} of ${elections} done, on ${POOL_SIZE} processor cores…`, true);
    else if (chunksDone < chunks) setStatus("branches-status", `Line charts done. Working out what each ballot position is worth: ${Math.round(100 * chunksDone / chunks)}% done, on ${POOL_SIZE} processor cores…`, true);
    else setStatus("branches-status", "");
  };
  const all = [];
  const plans = branchList.map(b => {
    const cand = int(b.candidates, 2, 300), seats = int(b.seats, 1, cand - 1);
    return { b, settings: electionSettings({ ...c, candidates: cand, seats, voters: b.voters }) };
  });
  const stages = [...new Set([50, 200, sims].filter(n => n <= sims))];
  for (const n of stages) {
    for (const { b, settings } of plans) {
      if (n === sims) elections++;
      const staged = { ...settings, run: { ...settings.run, sims: n } };
      all.push(engine({ task: "election", settings: n === sims ? settings : staged }, alive).then(reply => {
        if (n === sims) { electionsDone++; progress(); }
        if (!alive() || reply.stale) return;
        if (reply.error || !reply.results?.length) {
          setStatus("branches-status", `The engine refused ${b.name}'s numbers: ${reply.error || "seats must be fewer than candidates"}.`, false, true);
          return;
        }
        // A bigger run can come back before a smaller one; keep whichever covers more elections.
        const had = branchResults.get(b.name);
        if (had && had.r.settings.run.sims >= n) return;
        branchResults.set(b.name, { b, r: reply.results[0], total: sims });
        redraw();
      }));
    }
  }
  const add = (into, from) => { for (const k of ["sum", "sq", "n"]) from[k].forEach((x, i) => { into[k][i] = (into[k][i] || 0) + x; }); };
  for (const { b } of plans) branchWorth.set(b.name, { any: { sum: [], sq: [], n: [] }, edge: { sum: [], sq: [], n: [] }, done: 0, total: sims });
  // A small first chunk, so every branch's bars show early; the sums add up exactly either way.
  for (let first = 0, count; first < sims; first += count) {
    count = Math.min(first === 0 ? 10 : WORTH_CHUNK, sims - first);
    for (const { b, settings } of plans) {
      chunks++;
      all.push(engine({ task: "worth", settings, first, count }, alive).then(reply => {
        chunksDone++; progress();
        if (!alive() || reply.stale || reply.error) return;
        const w = branchWorth.get(b.name);
        add(w.any, reply.any); add(w.edge, reply.edge);
        w.done += count;
        redraw();
      }));
    }
  }
  progress();
  await Promise.all(all);
  progress();
};
