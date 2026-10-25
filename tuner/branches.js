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
  { id: "expanding_approvals", name: "Expanding approvals", color: "--sys-expanding" },
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
const seatMark = k => seatStat === "median" ? `under 1 seat after rank ${k}` : `1 seat: rank ${k}`;
for (const input of document.querySelectorAll('input[name="seat-stat"]')) {
  input.checked = input.value === seatStat;
  input.addEventListener("change", () => {
    seatStat = input.value;
    try { localStorage.setItem(SEAT_STAT_KEY, seatStat); } catch { /* storage may be blocked */ }
    window.redrawBranches();
  });
}  // the systems ticked when the results were asked for
const WORTH_CHUNK = 50;           // simulated elections per worth request, so the pool can share them out
// Simulated elections for a system's worth line, where fewer than all (a slow system). None now:
// Meek STV used 200 until the owner took it off the page (October 25, 2026).
const WORTH_SIMS = {};

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

/** A "Copy data" button: copies a chart's numbers as tab-separated rows, which paste straight
 *  into Datawrapper's data table (or a spreadsheet). rows() is called on click, so the button
 *  copies whatever the chart shows at that moment. If the browser blocks the clipboard, the
 *  numbers appear in a box, selected, to copy by hand. */
function copyButton(rows, chartNode) {
  const wrap = document.createElement("span"); wrap.className = "copywrap";
  const btn = document.createElement("button"); btn.type = "button"; btn.className = "quiet copy"; btn.textContent = "Copy data";
  wrap.append(btn);
  if (chartNode) wrap.append(imageButton(chartNode));
  btn.addEventListener("click", async () => {
    const tsv = rows().map(r => r.join("\t")).join("\n");
    let ok = false;
    try { await navigator.clipboard.writeText(tsv); ok = true; } catch { /* clipboard may be blocked in the frame */ }
    if (!ok) {
      const ta = document.createElement("textarea"); ta.value = tsv; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.append(ta); ta.select();
      try { ok = document.execCommand("copy"); } catch { /* fall through to the box */ }
      ta.remove();
    }
    if (ok) { btn.textContent = "Copied"; setTimeout(() => { btn.textContent = "Copy data"; }, 1500); return; }
    let box = wrap.parentElement.parentElement.querySelector("textarea.copybox");
    if (!box) { box = document.createElement("textarea"); box.className = "copybox"; box.readOnly = true; box.rows = 6; wrap.parentElement.after(box); }
    box.value = tsv; box.select();
    btn.textContent = "Select all and copy below";
  });
  return wrap;
}
/** A chart drawn as a PNG for pasting into a post: the chart's title, key, and chart on a card
 *  like the ones on genevieverand.com (the jobs page): 12px corners and a 1px edge of ink at 10%,
 *  here in a light bone a shade lighter than the Substack page (#fff8ec), with 28px of padding, at twice screen resolution. Outside the corners is
 *  transparent. The buttons are left out. Uses html-to-image (loaded by the page), which copies
 *  the page's fonts and styles. */
const CARD = "#fffcf6";  // the card: a lighter bone than the Substack page
const EXPORT_WIDTH = 760;  // px, before the 2x scale
// Cuts empty rows (all card color) off the bottom of a canvas, up to `most` rows.
function trimBottom(canvas, most) {
  const { width: w, height: h } = canvas;
  const px = canvas.getContext("2d").getImageData(0, h - most, w, most).data;
  const bg = [parseInt(CARD.slice(1, 3), 16), parseInt(CARD.slice(3, 5), 16), parseInt(CARD.slice(5, 7), 16)];
  let keep = most;
  rows: for (; keep > 0; keep--) {
    for (let i = (keep - 1) * w * 4; i < keep * w * 4; i += 4) {
      if (Math.abs(px[i] - bg[0]) > 3 || Math.abs(px[i + 1] - bg[1]) > 3 || Math.abs(px[i + 2] - bg[2]) > 3) break rows;
    }
  }
  const out = document.createElement("canvas");
  out.width = w; out.height = h - most + keep;
  out.getContext("2d").drawImage(canvas, 0, 0);
  return out;
}

async function chartPng(node) {
  const pad = 28, radius = 12, scale = 2;
  // Draw an off-screen copy without the buttons, so the page itself doesn't change. The copy
  // sits in a box with the same class as the chart's parent, so rules like ".pair h4" still apply.
  const box = document.createElement("div");
  box.className = node.parentElement.className;
  // Images are at least EXPORT_WIDTH wide, so a chart from a narrow column still comes out as
  // a wide rectangle: each chart is drawn again at the copy's width.
  box.style.cssText = `position: fixed; left: -10000px; top: 0; display: block; width: ${Math.max(node.offsetWidth, EXPORT_WIDTH)}px;`;
  const copy = node.cloneNode(true);
  copy.querySelectorAll(".copywrap, .copybox, .copyimg").forEach(e => e.remove());
  box.append(copy); document.body.append(box);
  const charts = node.querySelectorAll(".chart");
  copy.querySelectorAll(".chart").forEach((c, i) => charts[i] && charts[i]._draw && charts[i]._draw(c));
  // Text can come out a little taller in the image than on the page, which would cut off the
  // bottom of the chart. Render with room to spare, then trim the empty rows at the bottom.
  const spare = 40;
  copy.style.paddingBottom = `${spare}px`;
  let shot;
  try { shot = await htmlToImage.toCanvas(copy, { backgroundColor: CARD, pixelRatio: scale }); }
  finally { box.remove(); }
  shot = trimBottom(shot, spare * scale);
  const c = document.createElement("canvas");
  c.width = shot.width + 2 * pad * scale; c.height = shot.height + 2 * pad * scale;
  const g = c.getContext("2d");
  g.beginPath(); g.roundRect(0, 0, c.width, c.height, radius * scale); g.fillStyle = CARD; g.fill();
  const e = scale / 2;  // the 1px edge, drawn just inside the card
  g.beginPath(); g.roundRect(e, e, c.width - 2 * e, c.height - 2 * e, radius * scale - e);
  g.strokeStyle = "rgba(18, 16, 17, 0.1)"; g.lineWidth = scale; g.stroke();
  g.drawImage(shot, pad * scale, pad * scale);
  return new Promise(res => c.toBlob(res, "image/png"));
}

/** "Copy as image": puts the chart on the clipboard as a PNG. If the browser won't allow that,
 *  downloads the PNG instead. */
function imageButton(chartNode) {
  const btn = document.createElement("button"); btn.type = "button"; btn.className = "quiet copy"; btn.textContent = "Copy as image";
  const flash = t => { btn.textContent = t; setTimeout(() => { btn.textContent = "Copy as image"; }, 1800); };
  btn.addEventListener("click", async () => {
    btn.textContent = "Copying…";
    // The clipboard write has to start during the click, with the image still being drawn.
    const png = chartPng(chartNode());
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      flash("Copied");
    } catch {
      // The clipboard is blocked: show the image under the chart to copy by hand (right-click or
      // long-press, then Copy image).
      try {
        const node = chartNode();
        let shown = node.querySelector("img.copyimg");
        if (!shown) { shown = document.createElement("img"); shown.className = "copyimg"; shown.alt = "The chart as an image"; node.append(shown); }
        shown.src = URL.createObjectURL(await png);
        btn.textContent = "Right-click the image below to copy";
      } catch { flash("Couldn't copy"); }
    }
  });
  return btn;
}
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;

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
    // The line under each chart title: what the chart is made of.
    // Turnout varies from election to election, so the voter count is rounded (to the nearest 100, or 10 below 100).
    const v = Number(b.voters), about = v >= 100 ? Math.round(v / 100) * 100 : Math.round(v / 10) * 10;
    const across = n => `Across ${Number(n).toLocaleString()} simulated elections with ${seats} seats, ${b.candidates} candidates, and ~${about.toLocaleString()} voters.`;
    const subtitle = n => { const p = document.createElement("p"); p.className = "chartsub"; p.textContent = across(n); return p; };
    const sims = got[0].g.total || got[0].g.r.settings.run.sims;
    const half = (title, legendHtml, rows) => {
      const d = document.createElement("div");
      const head = document.createElement("div"); head.className = "charthead";
      const t = document.createElement("h4"); t.textContent = title; head.append(t, copyButton(rows, () => d)); d.append(head, subtitle(sims));
      if (legendHtml) { const l = document.createElement("div"); l.className = "legend"; l.innerHTML = legendHtml; d.append(l); }
      const c = document.createElement("div"); c.className = "chart"; d.append(c);
      pair.append(d);
      return c;
    };
    const sysLegend = many ? got.map(({ sys }) => `<span><i class="swatch line" style="background:var(${sys.color})"></i>${sys.name}</span>`).join("") : "";
    // What each chart's "Copy data" button copies: the ranks drawn, one column per line.
    const xOf = g => Math.min(xMax, g.r.truncation.p_changed.length);
    const ranks = () => Array.from({ length: Math.max(...got.map(({ g }) => xOf(g))) }, (_, i) => i + 1);
    const undecidedRows = () => [
      ["Ballots cut after rank", ...got.map(({ sys }) => many ? sys.name : "Elections still undecided (%)")],
      ...ranks().map(k => [k, ...got.map(({ g }) => { const f = branchFigures(g.r); return k <= xOf(g) ? r1(100 * (1 - f.same[k - 1])) : ""; })]),
    ];
    const changeRows = () => [
      ["Ballots cut after rank", ...got.map(({ sys }) => many ? `${sys.name}: ${statWord().toLowerCase()}` : `${statWord()} winners changed`),
        ...got.map(({ sys }) => many ? `${sys.name}: most in any election` : "Most in any simulated election")],
      ...ranks().map(k => {
        const fs = got.map(({ g }) => ({ f: branchFigures(g.r), x: xOf(g) }));
        return [k, ...fs.map(({ f, x }) => k <= x ? r2(f.mid[k - 1]) : ""), ...fs.map(({ f, x }) => k <= x ? f.most[k - 1] : "")];
      }),
    ];
    const c1 = half("How many elections remain undecided at each rank position?", sysLegend, undecidedRows);
    // The chart's title states its finding (owner's wording): the rank beyond which cutting
    // ballots changes under 1 winner on average (none, in the median election).
    const beyond = ({ g }) => { const f = branchFigures(g.r); return seatStat === "median" ? f.kSeat : holdsFrom(f.mid, x => x < 1); };
    const lower = n => n.replace(/^(Expanding|Approval)/, w => w.toLowerCase());
    const ranksSaid = many
      ? `Beyond rank ${got.map((x, i) => `${i && i === got.length - 1 ? "and " : ""}${beyond(x)} for ${lower(x.sys.name)}`).join(got.length > 2 ? ", " : " ")}`
      : `Beyond rank ${beyond(got[0])}`;
    const changeTitle = `${ranksSaid}, ${seatStat === "median" ? `no winners change in the median ${seats}-seat election` : `less than 1 winner changes in the average ${seats}-seat election`}.`;
    const c2 = half(changeTitle, many
      ? `${sysLegend}<span><i class="swatch line" style="background:var(--ink-2)"></i>${statWord()}</span><span><i class="swatch line dashed"></i>Most in any simulated election</span>`
      : `<span><i class="swatch line" style="background:var(--model)"></i>${statWord()}</span><span><i class="swatch line" style="background:var(--model-soft)"></i>Most in any simulated election</span>`,
      changeRows);
    sec.append(pair);
    const worths = got.map(({ sys }) => ({ sys, w: branchWorth.get(key(b, sys.id)) })).filter(x => x.w && x.w.done);
    if (worths.length) {
      const card = document.createElement("div"); card.className = "worthcard";
      const t = document.createElement("h4"); t.textContent = "What each ballot position is worth to a candidate";
      const ms = worths.map(({ sys, w }) => ({ sys, w, m: worthMeans(w) }));
      const left = ms.filter(({ w }) => w.done < w.total);
      const read = document.createElement("p"); read.className = "read";
      const slow = left.reduce((a, x) => (!a || x.w.done / x.w.total < a.w.done / a.w.total ? x : a), null);
      const fewer = ms.filter(({ w }) => w.total < Math.max(...ms.map(x => x.w.total)));
      read.textContent = `How much each vote at this rank increases a candidate's average chance of winning, ${across(Math.max(...ms.map(({ w }) => w.total))).replace(/^A/, "a")}` +
        fewer.map(({ sys, w }) => ` ${sys.name}: from ${w.total.toLocaleString()} simulated elections, because it takes far longer to count.`).join("") +
        (slow ? ` Still running: ${slow.w.done.toLocaleString()} of ${slow.w.total.toLocaleString()} simulated elections so far${ms.length > 1 ? ` for ${slow.sys.name}` : ""}.` : "");
      const c3 = document.createElement("div"); c3.className = "chart";
      const worthRows = () => {
        const n = Math.max(...ms.map(({ m }) => m.any.length));
        return [["Position on one voter's ballot", ...ms.map(({ sys }) => many ? sys.name : "Added chance of winning (percentage points)")],
          ...Array.from({ length: n }, (_, i) => [i + 1, ...ms.map(({ m }) => m.any[i] ? r2(m.any[i].m) : "")])];
      };
      const head = document.createElement("div"); head.className = "charthead"; head.append(t, copyButton(worthRows, () => card));
      card.append(head);
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
      return { points: f.same.slice(0, x).map((y, i) => [i + 1, 1 - y]), color: many ? sys.color : "--model", dots: !many && x <= 40 };
    }), {
      xMin: 1, xMax, xTicks, yMax: 1, yStep: 0.25, yFmt: pctAxis, xTitle: "Ballots cut after this rank",
      // The share still undecided (cutting at this rank or a deeper one can still change the winners).
      // One system: where 50, 20, 5, and 0% are left. Several: each system's 5% rank, in its color.
      marks: !one
        ? got.map(({ sys, g }) => { const f = branchFigures(g.r); return { x: f.k95, y: 1 - f.same[f.k95 - 1], label: `5% undecided: rank ${f.k95}`, color: sys.color }; })
        : [[f0.k50, "50%"], [f0.k80, "80%"], [f0.k95, "95%"], [f0.kAll, "100%"]].filter(([k], i, a) => a.findIndex(o => o[0] === k) === i)
          .map(([k, l]) => ({ x: k, y: 1 - f0.same[k - 1], label: `${100 - parseInt(l)}% undecided: rank ${k}` })),
      aria: `${b.name}: share of simulated elections still undecided when ballots are cut after each rank`,
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
        : f0.kSeat <= xMax ? [{ x: f0.kSeat, y: f0.mid[f0.kSeat - 1] ?? 0, label: seatMark(f0.kSeat) }] : [],
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
  box._draw = to => barChart(to, vals, opts);  // to draw the same chart again at another width (image export)
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
  const worthSims = sys => Math.min(sims, WORTH_SIMS[sys.id] || sims);
  for (const { b, sys } of plans) branchWorth.set(key(b, sys.id), { any: { sum: [], sq: [], n: [] }, edge: { sum: [], sq: [], n: [] }, done: 0, total: worthSims(sys) });
  // A small first chunk, so every branch's chart shows early; the sums add up exactly either way.
  for (let first = 0, step; first < sims; first += step) {
    step = Math.min(first === 0 ? 10 : WORTH_CHUNK, sims - first);
    for (const { b, sys, settings } of plans) {
      const count = Math.min(step, worthSims(sys) - first);
      if (count <= 0) continue;
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
