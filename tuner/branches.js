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
const branchResults = new Map();  // "name|system" -> {b, r, total}
const branchWorth = new Map();    // "name|system" -> {any, edge (summed WorthSums), done, total (elections)}
const key = (b, sys) => `${b.name}|${sys}`;

// The voting systems the page can compare, each with its own color (from the research charts'
// palette). Scottish STV is the organization's own system.
const SYSTEMS = [
  { id: "scottish_stv", name: "Scottish STV", color: "--sys-scottish" },
  { id: "cambridge_stv", name: "Cambridge STV", color: "--sys-cambridge" },
  { id: "borda", name: "Borda count", color: "--sys-borda" },
  { id: "approval", name: "Approval", color: "--sys-approval" },
];
let shown = [SYSTEMS[0]];
// "mean" or "median": how "how many winners change" sums up the simulated elections.
const SEAT_STAT_KEY = "rank-depth-branches-seat-stat";
let seatStat = "mean";
try { if (localStorage.getItem(SEAT_STAT_KEY) === "median") seatStat = "median"; } catch { /* storage may be blocked */ }
const statWord = () => seatStat === "median" ? "Median" : "Average";
const seatHead = () => seatStat === "median" ? "Under 1 seat after rank" : "1 seat or less";
const seatMark = k => seatStat === "median" ? `under 1 after rank ${k}` : `1 seat: rank ${k}`;
for (const input of document.querySelectorAll('input[name="seat-stat"]')) {
  input.checked = input.value === seatStat;
  input.addEventListener("change", () => {
    seatStat = input.value;
    try { localStorage.setItem(SEAT_STAT_KEY, seatStat); } catch { /* storage may be blocked */ }
    window.redrawBranches();
  });
}  // the systems ticked when the results were asked for
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
  // Seats changed at each cutoff: in the middle (median) election, or on average, by the
  // switch above the table. The engine sends both.
  const mid = seatStat === "median" && t.seats_changed.median ? t.seats_changed.median : t.seats_changed.mean, most = t.seats_changed.max;
  return { same, mid, most, k50: at(0.5), k80: at(0.8), k95: at(0.95), kAll: at(1),
    kOne: holdsFrom(mid, x => x <= 1), kZero: holdsFrom(mid, x => x === 0),
    // The rank the page reports for winners changed. Average: the first rank from which 1 or
    // fewer change. Median (whole seats): the last rank where 1 still changes, so the page can
    // say "after rank N, under 1" (owner's request).
    get kSeat() { return seatStat === "median" ? Math.max(1, this.kZero - 1) : this.kOne; } };
}

function drawSummary() {
  const table = $("summary");
  // Two header rows: the branch's numbers, then each system's two figures.
  const head = table.tHead;
  head.replaceChildren();
  const r1 = document.createElement("tr"), r2 = document.createElement("tr");
  const th = (row, txt, cls, span) => { const t = document.createElement("th"); t.textContent = txt; if (cls) t.className = cls; if (span) t.colSpan = span; row.append(t); return t; };
  for (const [txt, cls] of [["Branch", ""], ["Candidates", "n"], ["Seats", "n"], [`Voters (±${$("turnout").value}%)`, "n"]]) { th(r1, txt, cls).rowSpan = shown.length > 1 ? 2 : 1; }
  if (shown.length > 1) {
    for (const sys of shown) {
      const t = th(r1, "", "n sys", 2);
      t.innerHTML = `<span class="legend"><span><i class="swatch line" style="background:var(${sys.color})"></i>${sys.name}</span></span>`;
      th(r2, "95% threshold", "n"); th(r2, seatHead(), "n");
    }
    head.append(r1, r2);
  } else {
    th(r1, "95% threshold", "n k95"); th(r1, seatHead(), "n");
    head.append(r1);
  }
  const body = table.tBodies[0];
  body.replaceChildren();
  for (const b of branchList) {
    const tr = document.createElement("tr");
    const cells = [b.name, b.candidates, b.seats, Number(b.voters).toLocaleString()];
    for (const sys of shown) {
      const got = branchResults.get(key(b, sys.id));
      const f = got && branchFigures(got.r);
      cells.push(...(f ? [f.k95, f.kSeat] : ["…", "…"]));
    }
    cells.forEach((v, i) => {
      const td = document.createElement("td"); td.textContent = v;
      if (i > 0) td.className = "n";
      tr.append(td);
    });
    body.append(tr);
  }
}

/** Every branch's two charts, on the same rank axis so the branches can be compared, with one
 *  line per voting system. */
function drawBranches() {
  worthCharts = [];
  drawSummary();
  const box = $("branches");
  box.replaceChildren();
  const all = branchList.flatMap(b => shown.map(sys => branchResults.get(key(b, sys.id)))).filter(Boolean);
  if (!all.length) return;
  const many = shown.length > 1;
  const xMax = Math.max(8, ...all.map(({ r }) => Math.min(branchFigures(r).kAll + 3, r.truncation.p_changed.length)));
  const xTicks = rankTicks(xMax);
  const topSeats = Math.max(1, ...all.map(({ r }) => Math.max(...branchFigures(r).most.slice(0, xMax))));
  const seatStep = niceStep(topSeats);
  for (const b of branchList) {
    const got = shown.map(sys => ({ sys, g: branchResults.get(key(b, sys.id)) })).filter(x => x.g);
    if (!got.length) continue;
    const seats = got[0].g.r.seats;
    const sec = document.createElement("section"); sec.className = "branch";
    const h = document.createElement("h3"); h.textContent = b.name;
    const stats = document.createElement("div"); stats.className = "stats";
    for (const line of [`Candidates: ${b.candidates}`, `Seats: ${seats} (${Math.round(100 * seats / b.candidates)}% win)`, `Voters: ${Number(b.voters).toLocaleString()} (±${Math.round((got[0].g.r.settings.election.turnout_spread || 0) * 100)}%)`]) {
      const p = document.createElement("p"); p.className = "says"; p.textContent = line; stats.append(p);
    }
    sec.append(h, stats);
    for (const { sys, g } of got) {
      const f = branchFigures(g.r);
      const says = document.createElement("p"); says.className = "says";
      says.textContent = `${many ? `${sys.name}: ` : ""}95% of elections are decided within the first ${f.k95} ranks; 50% within ${f.k50}. ${seatStat === "median" ? `After rank ${f.kSeat}, under 1 winner changes in the median election.` : `Below rank ${f.kOne}, 1 or fewer winners change on average.`}`;
      const ran = g.r.settings.run.sims, wanted = g.total || ran;
      if (ran < wanted) says.textContent += ` Still running: these are from the first ${ran.toLocaleString()} of ${wanted.toLocaleString()} simulated elections so far.`;
      sec.append(says);
    }
    const pair = document.createElement("div"); pair.className = "pair";
    const half = (title, legendHtml) => {
      const d = document.createElement("div");
      const t = document.createElement("h4"); t.textContent = title; d.append(t);
      if (legendHtml) { const l = document.createElement("div"); l.className = "legend"; l.innerHTML = legendHtml; d.append(l); }
      const c = document.createElement("div"); c.className = "chart"; d.append(c);
      pair.append(d);
      return c;
    };
    const sysLegend = many ? got.map(({ sys }) => `<span><i class="swatch line" style="background:var(${sys.color})"></i>${sys.name}</span>`).join("") : "";
    const c1 = half("How many ranks affect election results", sysLegend);
    const c2 = half("How many winners change", many
      ? `${sysLegend}<span><i class="swatch line" style="background:var(--ink-2)"></i>${statWord()}</span><span><i class="swatch line dashed"></i>Most in any simulated election</span>`
      : `<span><i class="swatch line" style="background:var(--model)"></i>${statWord()}</span><span><i class="swatch line" style="background:var(--model-soft)"></i>Most in any simulated election</span>`);
    sec.append(pair);
    const worths = got.map(({ sys }) => ({ sys, w: branchWorth.get(key(b, sys.id)) })).filter(x => x.w && x.w.done);
    if (worths.length) {
      const card = document.createElement("div"); card.className = "worthcard";
      const t = document.createElement("h4"); t.textContent = "What each ballot position is worth to a candidate";
      const ms = worths.map(({ sys, w }) => ({ sys, w, m: worthMeans(w) }));
      const left = ms.filter(({ w }) => w.done < w.total);
      const read = document.createElement("p"); read.className = "read";
      read.textContent = `How much each vote at this rank increases a candidate's chance of winning, on average.` +
        (left.length ? ` Still running: ${Math.min(...left.map(({ w }) => w.done)).toLocaleString()} of ${left[0].w.total.toLocaleString()} simulated elections so far.` : "");
      const c3 = document.createElement("div"); c3.className = "chart";
      card.append(t);
      if (many) { const l = document.createElement("div"); l.className = "legend"; l.innerHTML = ms.map(({ sys }) => `<span><i class="swatch line" style="background:var(${sys.color})"></i>${sys.name}</span>`).join(""); card.append(l); }
      card.append(read, c3);
      sec.append(card);
      worthCharts.push({ box: c3, ms, name: b.name });
    }
    box.append(sec);
    const one = !many && got[0];
    const f0 = one && branchFigures(one.g.r);
    chart(c1, got.map(({ sys, g }) => {
      const f = branchFigures(g.r), x = Math.min(xMax, g.r.truncation.p_changed.length);
      return { points: f.same.slice(0, x).map((y, i) => [i + 1, y]), color: many ? sys.color : "--model", dots: !many && x <= 40 };
    }), {
      xMin: 1, xMax, xTicks, yMax: 1, yStep: 0.25, yFmt: pctAxis, xTitle: "Ballots cut after this rank",
      // One system: its 50, 80, 95, and 100% ranks. Several: each system's 95% rank, in its color.
      marks: !one
        ? got.map(({ sys, g }) => { const f = branchFigures(g.r); return { x: f.k95, y: f.same[f.k95 - 1], label: `95%: rank ${f.k95}`, color: sys.color, below: true }; })
        : [[f0.k50, "50%"], [f0.k80, "80%"], [f0.k95, "95%"], [f0.kAll, "100%"]].filter(([k], i, a) => a.findIndex(o => o[0] === k) === i)
          .map(([k, l]) => ({ x: k, y: f0.same[k - 1], label: `${l}: rank ${k}`, below: true })),
      aria: `${b.name}: share of simulated elections with the same results when ballots are cut after each rank`,
    });
    chart(c2, got.flatMap(({ sys, g }) => {
      const f = branchFigures(g.r), x = Math.min(xMax, g.r.truncation.p_changed.length);
      return many
        ? [{ points: f.most.slice(0, x).map((y, i) => [i + 1, y]), color: sys.color, width: 1.2, dash: "4 3" },
           { points: f.mid.slice(0, x).map((y, i) => [i + 1, y]), color: sys.color }]
        : [{ points: f.most.slice(0, x).map((y, i) => [i + 1, y]), color: "--model-soft", width: 1.8 },
           { points: f.mid.slice(0, x).map((y, i) => [i + 1, y]), color: "--model", dots: x <= 40 }];
    }), {
      xMin: 1, xMax, xTicks, yMax: Math.ceil(topSeats / seatStep) * seatStep, yStep: seatStep, yFmt: v => (seatStep < 1 ? v.toFixed(1) : String(Math.round(v))), xTitle: "Ballots cut after this rank",
      // Several systems: where each gets down to 1 seat changing (median or average), in its color.
      marks: !one
        ? got.map(({ sys, g }) => { const f = branchFigures(g.r); return f.kSeat <= xMax && { x: f.kSeat, y: f.mid[f.kSeat - 1] ?? 0, label: seatMark(f.kSeat), color: sys.color }; }).filter(Boolean)
        : [...(f0.kSeat <= xMax ? [{ x: f0.kSeat, y: f0.mid[f0.kSeat - 1] ?? 0, label: seatMark(f0.kSeat) }] : []),
        ...(seatStat !== "median" && f0.kZero <= xMax && f0.kZero !== f0.kOne ? [{ x: f0.kZero, y: 0, label: `0 seats: rank ${f0.kZero}` }] : [])],
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
/** The worth charts, on one scale across branches: bars for one system, lines when
 *  comparing systems. */
function drawWorthCharts() {
  const peak = Math.max(1, ...worthCharts.flatMap(({ ms }) => ms.flatMap(({ m }) => m.any.filter(Boolean).map(v => v.m))));
  const step = niceStep(peak), yMax = Math.ceil(peak / step) * step;
  for (const { box, ms, name } of worthCharts) {
    const aria = `${name}: what each ballot position is worth to a candidate`;
    if (ms.length === 1 && shown.length === 1) { barChart(box, ms[0].m.any, { yMax, yStep: step, aria }); continue; }
    const n = Math.max(...ms.map(({ m }) => m.any.length));
    // Below 0 only if some average is (a band dipping under 0 is cut off at the axis).
    const yMin = Math.min(0, ...ms.flatMap(({ m }) => m.any.filter(Boolean).map(v => v.m)));
    const lo = Math.floor(yMin / step) * step;
    // chart() draws from 0 up; shift everything by -lo so negative values fit.
    chart(box, ms.map(({ sys, m }) => ({ points: m.any.map((v, i) => v && [i + 1, v.m - lo]).filter(Boolean), color: sys.color, width: 2 })), {
      xMin: 1, xMax: Math.max(2, n), xTicks: rankTicks(n), yMax: yMax - lo, yStep: step, yFmt: v => { const y = +(v + lo).toFixed(2); return y ? `${y > 0 ? "+" : "−"}${Math.abs(y)}%` : "0%"; },
      xTitle: "Position on one voter's ballot", aria,
    });
  }
}

/** Bars from 0, one per position. */
function barChart(box, vals, opts) {
  box.replaceChildren();
  const w = Math.max(280, box.clientWidth || 800), H = 240, L = 56, R = 10, T = 12, B = 38;
  const svg = el("svg", { viewBox: `0 0 ${w} ${H}`, height: H, role: "img", "aria-label": opts.aria || "" }, box);
  const n = vals.length, bw = (w - L - R) / n;
  const sx = i => L + i * bw + bw / 2, sy = v => T + (1 - Math.max(0, Math.min(v, opts.yMax)) / opts.yMax) * (H - T - B);
  for (let y = 0; y <= opts.yMax + 1e-9; y += opts.yStep) {
    el("line", { x1: L, x2: w - R, y1: sy(y), y2: sy(y), stroke: css(y === 0 ? "--rule" : "--grid"), "stroke-width": 1 }, svg);
    text(svg, L - 6, sy(y) + 4, y ? `+${+y.toFixed(2)}%` : "0%", { "text-anchor": "end" });
  }
  const every = n <= 20 ? 1 : n <= 50 ? 5 : 10;
  vals.forEach((v, i) => {
    if ((i + 1) % every === 0 || i === 0) text(svg, sx(i), H - B + 15, String(i + 1), { "text-anchor": "middle" });
    if (!v) return;
    el("rect", { x: sx(i) - bw * 0.36, y: sy(v.m), width: bw * 0.72, height: Math.max(0.5, sy(0) - sy(v.m)), fill: css("--model") }, svg);
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
  shown = SYSTEMS.filter(sys => c[`sys-${sys.id}`]);
  if (!shown.length) shown = [SYSTEMS[0]];
  setText("systems-named", shown.length > 1 ? `${shown.slice(0, -1).map(x => x.name).join(", ")} and ${shown[shown.length - 1].name}` : shown[0].name);
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
  // what each position is worth takes longer, since every simulated election is recounted once
  // per position for 8 candidates.
  let elections = 0, electionsDone = 0, chunks = 0, chunksDone = 0;
  const progress = () => {
    if (!alive()) return;
    if (electionsDone < elections) setStatus("branches-status", `Playing out the branches: ${electionsDone} of ${elections} done, on ${POOL_SIZE} processor cores…`, true);
    else if (chunksDone < chunks) setStatus("branches-status", `Line charts done. Working out what each ballot position is worth: ${Math.round(100 * chunksDone / chunks)}% done, on ${POOL_SIZE} processor cores…`, true);
    else setStatus("branches-status", "");
  };
  const all = [];
  const plans = branchList.flatMap(b => {
    const cand = int(b.candidates, 2, 300), seats = int(b.seats, 1, cand - 1);
    const base = electionSettings({ ...c, candidates: cand, seats, voters: b.voters });
    return shown.map(sys => ({ b, sys, settings: { ...base, run: { ...base.run, system: sys.id } } }));
  });
  const stages = [...new Set([50, 200, sims].filter(n => n <= sims))];
  for (const n of stages) {
    for (const { b, sys, settings } of plans) {
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
        const had = branchResults.get(key(b, sys.id));
        if (had && had.r.settings.run.sims >= n) return;
        branchResults.set(key(b, sys.id), { b, r: reply.results[0], total: sims });
        redraw();
      }));
    }
  }
  const add = (into, from) => { for (const k of ["sum", "sq", "n"]) from[k].forEach((x, i) => { into[k][i] = (into[k][i] || 0) + x; }); };
  for (const { b, sys } of plans) branchWorth.set(key(b, sys.id), { any: { sum: [], sq: [], n: [] }, edge: { sum: [], sq: [], n: [] }, done: 0, total: sims });
  // A small first chunk, so every branch's chart shows early; the sums add up exactly either way.
  for (let first = 0, count; first < sims; first += count) {
    count = Math.min(first === 0 ? 10 : WORTH_CHUNK, sims - first);
    for (const { b, sys, settings } of plans) {
      chunks++;
      all.push(engine({ task: "worth", settings, first, count }, alive).then(reply => {
        chunksDone++; progress();
        if (!alive() || reply.stale || reply.error) return;
        const w = branchWorth.get(key(b, sys.id));
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
