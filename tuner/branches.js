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
function redrawBranches() {
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
    for (const line of [`Candidates: ${b.candidates}`, `Seats: ${seats}`, `Voters: ${Number(b.voters).toLocaleString()} (±${Math.round((r.settings.election.turnout_spread || 0) * 100)}%)`]) {
      const p = document.createElement("p"); p.className = "says"; p.textContent = line; stats.append(p);
    }
    const says = document.createElement("p"); says.className = "says";
    says.textContent = `95% of elections are decided within the first ${f.k95} ranks; 50% within ${f.k50}. Below rank ${f.kOne}, 1 or fewer winners change on average.`;
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
window.redrawBranches = redrawBranches;

/** Plays out every branch in turn; stops if the settings change while it runs. */
window.runBranches = async (c, alive) => {
  setText("sims-count", int(c.sims, 10, 1000).toLocaleString());
  setText("slates-count", String(int(c.slates, 1, 12)));
  branchResults.clear();
  redrawBranches();
  for (let i = 0; i < branchList.length; i++) {
    const b = branchList[i];
    setStatus("branches-status", `Playing out ${b.name} (${i + 1} of ${branchList.length})…`, true);
    const cand = int(b.candidates, 2, 300), seats = int(b.seats, 1, cand - 1);
    const reply = await engine({ task: "election", settings: electionSettings({ ...c, candidates: cand, seats, voters: b.voters }) });
    if (!alive()) return;
    if (reply.error || !reply.results?.length) {
      setStatus("branches-status", `The engine refused ${b.name}'s numbers: ${reply.error || "seats must be fewer than candidates"}.`, false, true);
      continue;
    }
    branchResults.set(b.name, { b, r: reply.results[0] });
    redrawBranches();
  }
  if (alive()) setStatus("branches-status", "");
};
