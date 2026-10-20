// Shared chart helpers for the model evidence page. Every tab uses these.
const NS = "http://www.w3.org/2000/svg";
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const el = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.append(e); return e; };
const txt = (parent, x, y, s, attrs = {}) => { const t = el("text", { x, y, ...attrs }, parent); t.textContent = s; return t; };
const pct = x => (x * 100).toFixed(0) + "%";
let draws = [];
let DATA = null;
const GROUP = { scotland: { name: "Scotland", v: "--scotland" }, public: { name: "Other public elections", v: "--public" },
  org: { name: "Other organizational elections", v: "--org" }, ers: { name: "Union and society elections (ERS)", v: "--ers" } };
const GROUP_ORDER = ["scotland", "public", "org", "ers"];
const uncapped = e => e.max_ranks == null || e.max_ranks >= e.candidates;
const chartPts = () => DATA.elections.filter(e => GROUP_ORDER.includes(e.group) && uncapped(e));
const groupLegend = f => legend(f, GROUP_ORDER.map(g => ["dot", GROUP[g].v, `${GROUP[g].name} (${DATA.by_group[g].n})`]));

const tip = document.getElementById("tip");
function showTip(target, title, lines) {
  tip.replaceChildren();
  const b = document.createElement("b"); b.textContent = title; tip.append(b);
  for (const l of lines) { const d = document.createElement("div"); d.className = "k"; d.textContent = l; tip.append(d); }
  tip.hidden = false;
  const r = target.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
  let left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8)), top = r.top - h - 8;
  if (top < 8) top = r.bottom + 8;
  tip.style.left = left + "px"; tip.style.top = top + "px";
}
const hideTip = () => { tip.hidden = true; };
addEventListener("scroll", hideTip, { passive: true });
function hitArea(svg, shape, title, lines, label) {
  const h = el(shape.tag, { ...shape.attrs, class: "hit", tabindex: 0, role: "img", "aria-label": label }, svg);
  h.addEventListener("pointerenter", () => showTip(h, title, lines));
  h.addEventListener("pointerleave", hideTip);
  h.addEventListener("focus", () => showTip(h, title, lines));
  h.addEventListener("blur", hideTip);
}

function figure(title, takeaway, note) {
  const f = document.createElement("section"); f.className = "figure";
  const h = document.createElement("h2"); h.textContent = title; f.append(h);
  if (takeaway) { const p = document.createElement("p"); p.className = "takeaway"; p.textContent = takeaway; f.append(p); }
  if (note) { const p = document.createElement("p"); p.className = "note"; p.textContent = note; f.append(p); }
  document.getElementById("figs").append(f);
  return f;
}
function tableView(f, head, rows, numeric) {
  const d = document.createElement("details");
  const s = document.createElement("summary"); s.textContent = "Show as a table"; d.append(s);
  const w = document.createElement("div"); w.className = "tablewrap";
  const t = document.createElement("table"); const th = document.createElement("thead"); const tr = document.createElement("tr");
  head.forEach((h, i) => { const c = document.createElement("th"); c.textContent = h; if (numeric[i]) c.className = "n"; tr.append(c); });
  th.append(tr); t.append(th);
  const tb = document.createElement("tbody");
  for (const r of rows) { const tr = document.createElement("tr"); r.forEach((v, i) => { const c = document.createElement("td"); c.textContent = v; if (numeric[i]) c.className = "n"; tr.append(c); }); tb.append(tr); }
  t.append(tb); w.append(t); d.append(w); f.append(d);
}
function legend(f, items) {
  const ul = document.createElement("ul"); ul.className = "legend";
  for (const [kind, color, label] of items) {
    const li = document.createElement("li"); const k = document.createElement("span");
    k.className = kind === "line" ? "key-line" : "dot"; k.style.background = `var(${color})`;
    li.append(k, document.createTextNode(label)); ul.append(li);
  }
  f.append(ul);
}
function niceTicks(max, step) { const t = []; for (let v = 0; v <= max + 1e-9; v += step) t.push(+v.toFixed(4)); return t; }


// ---------- shared scatter ----------
function scatter(f, opts) {
  const plot = document.createElement("div"); plot.className = "plot"; f.append(plot);
  draws.push(() => {
    const w = plot.clientWidth || 800, H = opts.height || 340, L = 40, R = 16, T = 16, B = 38;
    plot.replaceChildren();
    const svg = el("svg", { height: H, viewBox: `0 0 ${w} ${H}`, role: "img", "aria-label": opts.aria }, plot);
    const sx = v => L + (v - opts.xMin) / (opts.xMax - opts.xMin) * (w - L - R);
    const sy = v => T + (1 - v / opts.yMax) * (H - T - B);
    for (const t of niceTicks(opts.yMax, opts.yStep)) {
      el("line", { x1: L, x2: w - R, y1: sy(t), y2: sy(t), stroke: css(t === 0 ? "--axis" : "--grid"), "stroke-width": 1 }, svg);
      txt(svg, L - 6, sy(t) + 4, opts.yFmt ? opts.yFmt(t) : String(t), { "text-anchor": "end" });
    }
    for (const t of opts.xTicks) {
      el("line", { x1: sx(t), x2: sx(t), y1: T, y2: H - B, stroke: css("--grid"), "stroke-width": 1 }, svg);
      txt(svg, sx(t), H - B + 15, opts.xFmt ? opts.xFmt(t) : String(t), { "text-anchor": "middle" });
    }
    txt(svg, (L + w - R) / 2, H - 4, opts.xTitle, { "text-anchor": "middle", class: "title" });
    txt(svg, L, T - 4, opts.yTitle, { class: "title" });
    if (opts.marker) {
      const mx = sx(opts.marker.x);
      el("line", { x1: mx, x2: mx, y1: T, y2: H - B, stroke: css("--axis"), "stroke-width": 1 }, svg);
      txt(svg, mx - 6, T + 12, opts.marker.label, { "text-anchor": "end", class: "lab" });
    }
    for (const p of opts.points) {
      const cx = sx(p.x), cy = sy(Math.min(p.y, opts.yMax));
      el("circle", { cx, cy, r: 4, fill: css(p.color), stroke: css("--surface"), "stroke-width": 1.5, opacity: 0.75 }, svg);
    }
    // Trend lines go on top of the dots, with a ring in the surface color so they stay visible.
    for (const ln of opts.lines) {
      const pts = [];
      for (let i = 0; i <= 60; i++) { const x = ln.from + (ln.to - ln.from) * i / 60; pts.push([sx(x), sy(ln.f(x))]); }
      const d = pts.map(p => p.join(",")).join(" ");
      el("polyline", { points: d, fill: "none", stroke: css("--surface"), "stroke-width": 6, "stroke-linecap": "round" }, svg);
      el("polyline", { points: d, fill: "none", stroke: css(ln.color), "stroke-width": 2.5, "stroke-linecap": "round" }, svg);
    }
    for (const p of opts.points) {
      if (!p.label) continue;
      const cx = sx(p.x), cy = sy(Math.min(p.y, opts.yMax)), right = cx > w * 0.6;
      txt(svg, cx + (right ? -9 : 9), cy + 4, p.label, { "text-anchor": right ? "end" : "start", class: "lab" });
    }
    for (const p of opts.points) {
      const cx = sx(p.x), cy = sy(Math.min(p.y, opts.yMax));
      hitArea(svg, { tag: "circle", attrs: { cx, cy, r: 7 } }, p.name, p.lines, `${p.name}: ${p.lines.join(", ")}`);
    }
  });
}


// ---------- more chart types ----------

// Horizontal bars, one or two per row (for example, share of candidates against share of votes).
// rows: [{label, values: [..]}]; series: [{name, color}] in the same order as values.
function hbars(f, rows, series, opts = {}) {
  if (series.length > 1) legend(f, series.map(s => ["dot", s.color, s.name]));
  const plot = document.createElement("div"); plot.className = "plot"; f.append(plot);
  draws.push(() => {
    const w = plot.clientWidth || 600, barH = 14, gap = 3, rowH = series.length * (barH + gap) + 14, L = opts.labelW || 150, R = 52, T = 4, B = 24;
    const H = T + rows.length * rowH + B, max = opts.max || 1;
    plot.replaceChildren();
    const svg = el("svg", { height: H, viewBox: `0 0 ${w} ${H}`, role: "img", "aria-label": opts.aria || "" }, plot);
    const sx = v => L + v / max * (w - L - R);
    for (const t of niceTicks(max, opts.step || max / 4)) {
      el("line", { x1: sx(t), x2: sx(t), y1: T, y2: H - B, stroke: css(t === 0 ? "--axis" : "--grid"), "stroke-width": 1 }, svg);
      txt(svg, sx(t), H - B + 15, (opts.fmt || pct)(t), { "text-anchor": "middle" });
    }
    rows.forEach((r, i) => {
      const y0 = T + i * rowH + 7;
      txt(svg, L - 10, y0 + (series.length * (barH + gap)) / 2 + 4, r.label, { "text-anchor": "end", class: "lab" });
      r.values.forEach((v, k) => {
        const y = y0 + k * (barH + gap), x1 = sx(Math.max(0, v)), rr = Math.min(4, Math.max(0, x1 - sx(0)));
        el("path", { d: `M${sx(0)},${y} H${x1 - rr} Q${x1},${y} ${x1},${y + rr} V${y + barH - rr} Q${x1},${y + barH} ${x1 - rr},${y + barH} H${sx(0)} Z`, fill: css(series[k].color) }, svg);
        txt(svg, x1 + 6, y + barH - 3, (opts.fmt || pct)(v), { class: "val" });
      });
      hitArea(svg, { tag: "rect", attrs: { x: L, y: T + i * rowH, width: w - L - R, height: rowH } }, r.label,
        r.values.map((v, k) => `${series[k].name}: ${(opts.fmt || pct)(v)}`), r.label);
    });
  });
}

// Column histogram of a list of values (or of preset counts), single series.
// bins: [{label, count}] in display order.
function columns(f, bins, opts = {}) {
  const plot = document.createElement("div"); plot.className = "plot"; f.append(plot);
  const total = bins.reduce((a, b) => a + b.count, 0);
  draws.push(() => {
    const w = plot.clientWidth || 600, H = opts.height || 200, L = 40, R = 8, T = 16, B = 34;
    plot.replaceChildren();
    const svg = el("svg", { height: H, viewBox: `0 0 ${w} ${H}`, role: "img", "aria-label": opts.aria || "" }, plot);
    const shares = bins.map(b => b.count / total), top = Math.max(...shares);
    const step = opts.step || (top <= 0.2 ? 0.05 : top <= 0.4 ? 0.1 : top <= 0.8 ? 0.2 : 0.25);
    const maxY = opts.maxY || Math.ceil(top / step - 1e-9) * step;
    const sy = v => T + (1 - v / maxY) * (H - T - B), bw = (w - L - R) / bins.length;
    for (const t of niceTicks(maxY, step)) {
      el("line", { x1: L, x2: w - R, y1: sy(t), y2: sy(t), stroke: css(t === 0 ? "--axis" : "--grid"), "stroke-width": 1 }, svg);
      txt(svg, L - 6, sy(t) + 4, pct(t), { "text-anchor": "end" });
    }
    bins.forEach((b, i) => {
      const v = shares[i], bwi = Math.min(24, bw - 4), x0 = L + i * bw + (bw - bwi) / 2, y = sy(v), h = sy(0) - y;
      if (h > 0) { const r = Math.min(4, h); el("path", { d: `M${x0},${sy(0)} V${y + r} Q${x0},${y} ${x0 + r},${y} H${x0 + bwi - r} Q${x0 + bwi},${y} ${x0 + bwi},${y + r} V${sy(0)} Z`, fill: css(opts.color || "--bar") }, svg); }
      if (bins.length <= 14 || i % 2 === 0) txt(svg, L + i * bw + bw / 2, H - B + 14, b.label, { "text-anchor": "middle" });
      hitArea(svg, { tag: "rect", attrs: { x: L + i * bw, y: T, width: bw, height: H - T - B } }, opts.title || "", [`${b.label}: ${pct(v)} (${b.count.toLocaleString()})`], `${b.label}: ${pct(v)}`);
    });
    txt(svg, (L + w - R) / 2, H - 4, opts.xTitle || "", { "text-anchor": "middle", class: "title" });
  });
}

// Bin a list of numbers into equal-width bins between lo and hi.
function binValues(values, lo, hi, step, fmt) {
  const bins = [];
  for (let a = lo; a < hi - 1e-9; a += step) bins.push({ label: fmt(a), lo: a, hi: a + step, count: 0 });
  for (const v of values) { const i = Math.min(bins.length - 1, Math.max(0, Math.floor((v - lo) / step))); bins[i].count++; }
  return bins;
}

// Grid of shares (rows by columns), shaded by size in one hue; the value printed in each cell.
function heatmap(f, rowLabels, colLabels, cells, opts = {}) {
  const wrap = document.createElement("div"); wrap.className = "tablewrap"; f.append(wrap);
  const t = document.createElement("table"); t.className = "heat";
  const head = document.createElement("tr");
  head.append(Object.assign(document.createElement("th"), { textContent: opts.corner || "" }));
  for (const c of colLabels) head.append(Object.assign(document.createElement("th"), { textContent: c, className: "n" }));
  const thead = document.createElement("thead"); thead.append(head); t.append(thead);
  const tb = document.createElement("tbody");
  rowLabels.forEach((rl, i) => {
    const tr = document.createElement("tr");
    tr.append(Object.assign(document.createElement("th"), { textContent: rl }));
    cells[i].forEach((v, j) => {
      const td = document.createElement("td"); td.className = "n heatcell"; td.textContent = pct(v);
      td.style.setProperty("--a", Math.min(1, v / (opts.max || 0.7)).toFixed(3));
      if (opts.highlight && opts.highlight(i, j)) td.classList.add("diag");
      tr.append(td);
    });
    tb.append(tr);
  });
  t.append(tb); wrap.append(t);
}

// Range strips: one row per group, a dot per value, the range as a line, the median as a tick.
// groups: [{label, sub, values: [numbers]}]
function strips(f, groups, opts = {}) {
  const plot = document.createElement("div"); plot.className = "plot"; f.append(plot);
  draws.push(() => {
    const w = plot.clientWidth || 600, rowH = 52, L = opts.labelW || 190, R = 16, T = 6, B = 34, H = T + groups.length * rowH + B;
    plot.replaceChildren();
    const svg = el("svg", { height: H, viewBox: `0 0 ${w} ${H}`, role: "img", "aria-label": opts.aria || "" }, plot);
    const sx = v => L + (v - opts.min) / (opts.max - opts.min) * (w - L - R);
    for (const t of opts.ticks) {
      el("line", { x1: sx(t), x2: sx(t), y1: T, y2: H - B, stroke: css(t === 0 ? "--axis" : "--grid"), "stroke-width": 1 }, svg);
      txt(svg, sx(t), H - B + 15, (opts.fmt || String)(t), { "text-anchor": "middle" });
    }
    txt(svg, (L + w - R) / 2, H - 4, opts.xTitle || "", { "text-anchor": "middle", class: "title" });
    groups.forEach((g, i) => {
      const mid = T + i * rowH + rowH / 2, xs = [...g.values].sort((a, b) => a - b);
      txt(svg, L - 10, mid - 2, g.label, { "text-anchor": "end", class: "lab" });
      if (g.sub) txt(svg, L - 10, mid + 13, g.sub, { "text-anchor": "end" });
      if (xs.length > 1) el("line", { x1: sx(xs[0]), x2: sx(xs[xs.length - 1]), y1: mid, y2: mid, stroke: css("--axis"), "stroke-width": 2, "stroke-linecap": "round" }, svg);
      for (const v of xs) el("circle", { cx: sx(v), cy: mid, r: 4, fill: css(g.color || "--bar"), opacity: 0.6, stroke: css("--surface"), "stroke-width": 1 }, svg);
      const med = xs[Math.floor(xs.length / 2)];
      el("line", { x1: sx(med), x2: sx(med), y1: mid - 14, y2: mid + 14, stroke: css("--ink"), "stroke-width": 2 }, svg);
      txt(svg, sx(med), mid - 17, (opts.fmt || String)(+med.toFixed(2)), { "text-anchor": "middle", class: "val" });
      hitArea(svg, { tag: "rect", attrs: { x: L, y: mid - rowH / 2, width: w - L - R, height: rowH } }, g.label,
        [`${xs.length.toLocaleString()} values`, `median ${(opts.fmt || String)(+med.toFixed(2))}`, `range ${(opts.fmt || String)(+xs[0].toFixed(2))} to ${(opts.fmt || String)(+xs[xs.length - 1].toFixed(2))}`], g.label);
    });
  });
}

// The decision box at the top of each tab.
function decisionBox(d) {
  const box = document.createElement("section"); box.className = "decision";
  const eb = document.createElement("div"); eb.className = "eyebrow"; eb.textContent = "Decision";
  const h = document.createElement("h2"); h.textContent = d.title; box.append(eb, h);
  const dl = document.createElement("dl");
  for (const [k, v] of [["Status", d.status], ["Model now", d.now], ["Proposal", d.proposal], ["Needed from you", d.needed]]) {
    if (!v) continue;
    const dt = document.createElement("dt"); dt.textContent = k;
    const dd = document.createElement("dd");
    if (k === "Status") { const s = document.createElement("span"); s.className = "status"; s.textContent = v; dd.append(s); } else dd.textContent = v;
    dl.append(dt, dd);
  }
  box.append(dl);
  document.getElementById("figs").append(box);
  return box;
}

function cards(f, items, cls) {
  const box = document.createElement("div"); box.className = "predict" + (cls ? " " + cls : "");
  for (const [h, v, s] of items) {
    const d = document.createElement("div");
    for (const [cls, text] of [["h", h], ["v", v], ["s", s]]) { const e = document.createElement("div"); e.className = cls; e.textContent = text; d.append(e); }
    box.append(d);
  }
  f.append(box);
}
