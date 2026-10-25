// Shared chart helpers for the model evidence page. Every tab uses these.
const NS = "http://www.w3.org/2000/svg";
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const el = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.append(e); return e; };
const txt = (parent, x, y, s, attrs = {}) => { const t = el("text", { x, y, ...attrs }, parent); t.textContent = s; return t; };
// The vertical axis's title, turned sideways and centered along the axis, at the chart's left edge.
const yTitle = (svg, top, bottom, s) => { if (!s) return; const y = (top + bottom) / 2; txt(svg, 11, y, s, { class: "title", "text-anchor": "middle", transform: `rotate(-90 11 ${y})` }); };
// Room left of a chart's plot: the sideways title (if any), then the widest tick label, then a 6px gap.
const yLeft = (labels, title) => {
  const g = (yLeft.ctx ||= document.createElement("canvas").getContext("2d"));
  g.font = `11px ${getComputedStyle(document.body).getPropertyValue("--font-data") || "monospace"}`;
  return Math.ceil((title ? 20 : 2) + Math.max(0, ...labels.map(t => g.measureText(t).width)) + 6);
};
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
  const head = document.createElement("div"); head.className = "fighead";
  const h = document.createElement("h2"); h.textContent = title;
  head.append(h, imageButton(f)); f.append(head);
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
    const w = plot.clientWidth || 800, H = opts.height || 340, R = 16, T = 16, B = 38;
    const L = yLeft(niceTicks(opts.yMax, opts.yStep).map(t => opts.yFmt ? opts.yFmt(t) : String(t)), opts.yTitle);
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
    yTitle(svg, T, H - B, opts.yTitle);
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
      el("polyline", { points: d, fill: "none", stroke: css(ln.color), "stroke-width": 2.5, "stroke-linecap": "round", "stroke-dasharray": ln.dash || "" }, svg);
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
    // On narrow screens each row's label sits above its bars instead of beside them.
    const w = plot.clientWidth || 600, narrow = w < 560, barH = 14, gap = 3, lab = narrow ? 18 : 0, rowH = series.length * (barH + gap) + 14 + lab, L = narrow ? 8 : (opts.labelW || 150), R = 52, T = 4, B = 24;
    const H = T + rows.length * rowH + B, max = opts.max || 1;
    plot.replaceChildren();
    const svg = el("svg", { height: H, viewBox: `0 0 ${w} ${H}`, role: "img", "aria-label": opts.aria || "" }, plot);
    const sx = v => L + v / max * (w - L - R);
    for (const t of niceTicks(max, opts.step || max / 4)) {
      el("line", { x1: sx(t), x2: sx(t), y1: T, y2: H - B, stroke: css(t === 0 ? "--axis" : "--grid"), "stroke-width": 1 }, svg);
      txt(svg, sx(t), H - B + 15, (opts.fmt || pct)(t), { "text-anchor": "middle" });
    }
    rows.forEach((r, i) => {
      const y0 = T + i * rowH + 7 + lab;
      if (narrow) txt(svg, L, y0 - 6, r.label, { class: "lab" });
      else txt(svg, L - 10, y0 + (series.length * (barH + gap)) / 2 + 4, r.label, { "text-anchor": "end", class: "lab" });
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
    const w = plot.clientWidth || 600, H = opts.height || 200, R = 8, T = 16, B = 34;
    plot.replaceChildren();
    const svg = el("svg", { height: H, viewBox: `0 0 ${w} ${H}`, role: "img", "aria-label": opts.aria || "" }, plot);
    const shares = bins.map(b => b.count / total), top = Math.max(...shares);
    const step = opts.step || (top <= 0.2 ? 0.05 : top <= 0.4 ? 0.1 : top <= 0.8 ? 0.2 : 0.25);
    const maxY = opts.maxY || Math.ceil(top / step - 1e-9) * step;
    const L = yLeft(niceTicks(maxY, step).map(pct), opts.yTitle);
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
    yTitle(svg, T, H - B, opts.yTitle);
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

// Distribution rows: one row per group, a small histogram showing where its values fall
// (taller bars where more values fall), with the median marked. Bars in each row are scaled
// to that row's tallest bar, so rows compare by shape; counts are in the hover text.
// groups: [{label, sub, values: [numbers], color, median}]; median overrides the computed one
// (for values capped at the chart edge). opts.mark draws a heavier line at one x value. opts.bin sets the bar width in x units.
function strips(f, groups, opts = {}) {
  const plot = document.createElement("div"); plot.className = "plot"; f.append(plot);
  const fmt = opts.fmt || String, bin = opts.bin;
  const binned = groups.map(g => {
    const n = Math.round((opts.max - opts.min) / bin), counts = new Array(n).fill(0);
    for (const v of g.values) counts[Math.min(n - 1, Math.max(0, Math.floor((v - opts.min) / bin + 1e-9)))]++;
    const xs = [...g.values].sort((a, b) => a - b);
    return { counts, median: g.median ?? xs[Math.floor(xs.length / 2)], n: xs.length };
  });
  draws.push(() => {
    // On narrow screens each row's label sits above its bars instead of beside them.
    const w = plot.clientWidth || 600, narrow = w < 560, rowH = narrow ? 86 : 62, L = narrow ? 8 : (opts.labelW || 190), R = narrow ? 10 : 16;
    const T = 18, B = 34, H = T + groups.length * rowH + B;
    plot.replaceChildren();
    const svg = el("svg", { height: H, viewBox: `0 0 ${w} ${H}`, role: "img", "aria-label": opts.aria || "" }, plot);
    const sx = v => L + (v - opts.min) / (opts.max - opts.min) * (w - L - R);
    for (const t of narrow ? opts.ticks.filter((_, k) => k % 2 === 0) : opts.ticks) {
      el("line", { x1: sx(t), x2: sx(t), y1: T - 12, y2: H - B, stroke: css(t === 0 || t === opts.mark ? "--axis" : "--grid"), "stroke-width": t === opts.mark ? 2 : 1 }, svg);
      txt(svg, sx(t), H - B + 15, fmt(t), { "text-anchor": "middle" });
    }
    txt(svg, (L + w - R) / 2, H - 4, opts.xTitle || "", { "text-anchor": "middle", class: "title" });
    groups.forEach((g, i) => {
      const { counts, median, n } = binned[i], base = T + (i + 1) * rowH - 10, barMax = narrow ? rowH - 52 : rowH - 30, top = Math.max(...counts);
      if (narrow) {
        txt(svg, L, base - rowH + 26, g.label + (g.sub ? ` · ${g.sub}` : ""), { class: "lab" });
      } else {
        txt(svg, L - 10, base - 18, g.label, { "text-anchor": "end", class: "lab" });
        if (g.sub) txt(svg, L - 10, base - 3, g.sub, { "text-anchor": "end" });
      }
      el("line", { x1: sx(opts.min), x2: sx(opts.max), y1: base, y2: base, stroke: css("--axis"), "stroke-width": 1 }, svg);
      const bw = sx(opts.min + bin) - sx(opts.min);
      counts.forEach((c, k) => {
        const lo = opts.min + k * bin, x = sx(lo) + 1, wd = Math.max(1, bw - 2);
        if (c) {
          const h = Math.max(2, c / top * barMax);
          el("rect", { x, y: base - h, width: wd, height: h, fill: css(g.color || "--bar"), rx: Math.min(2, wd / 2) }, svg);
        }
        const range = `${fmt(+lo.toFixed(2))} to ${fmt(+(lo + bin).toFixed(2))}`;
        hitArea(svg, { tag: "rect", attrs: { x: sx(lo), y: base - barMax, width: bw, height: barMax } }, g.label,
          [`${range}: ${c.toLocaleString()} of ${n.toLocaleString()} (${pct(c / n)})`], `${g.label}, ${range}: ${c}`);
      });
      const mx = sx(Math.min(median, opts.max));
      el("line", { x1: mx, x2: mx, y1: base - barMax - 6, y2: base + 3, stroke: css("--ink"), "stroke-width": 2 }, svg);
      const right = mx > w - R - 110;
      txt(svg, mx + (right ? -5 : 5), base - barMax - 1, `median ${fmt(+median.toFixed(2))}`, { class: "val halo", "text-anchor": right ? "end" : "start" });
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

// 100% stacked bars: one bar per row, split into series that add to 100%.
// rows: [{label, sub, values: [shares]}]; series: [{name, color}]. Segments wide enough get their share printed inside.
function stackedBars(f, rows, series, opts = {}) {
  legend(f, series.map(s => ["dot", s.color, s.name]));
  const plot = document.createElement("div"); plot.className = "plot"; f.append(plot);
  draws.push(() => {
    const w = plot.clientWidth || 600, narrow = w < 560, barH = 24, rowH = narrow ? 58 : 44, L = narrow ? 8 : (opts.labelW || 200), R = 8, T = 4, H = T + rows.length * rowH + 6;
    plot.replaceChildren();
    const svg = el("svg", { height: H, viewBox: `0 0 ${w} ${H}`, role: "img", "aria-label": opts.aria || "" }, plot);
    const span = w - L - R;
    rows.forEach((r, i) => {
      const y = T + i * rowH + (narrow ? 22 : (rowH - barH) / 2);
      if (narrow) txt(svg, L, y - 7, r.label + (r.sub ? ` · ${r.sub}` : ""), { class: "lab" });
      else { txt(svg, L - 10, y + 11, r.label, { "text-anchor": "end", class: "lab" }); if (r.sub) txt(svg, L - 10, y + 24, r.sub, { "text-anchor": "end" }); }
      const total = r.values.reduce((a, b) => a + b, 0);
      let x = L;
      r.values.forEach((v, k) => {
        const wd = v / total * span;
        if (wd > 0.5) {
          el("rect", { x: x + 1, y, width: Math.max(0.5, wd - 2), height: barH, fill: css(series[k].color), rx: 2 }, svg);
          const label = pct(v / total);
          if (wd > label.length * 7.5 + 8) {
            const dark = ["--c6", "--c7", "--public"].includes(series[k].color);
            txt(svg, x + wd / 2, y + 16, label, { "text-anchor": "middle", class: "val", style: `fill:${dark ? "#fff" : "#0b0b0b"}` });
          }
          hitArea(svg, { tag: "rect", attrs: { x, y, width: wd, height: barH } }, r.label, [`${series[k].name}: ${label}`], `${r.label}, ${series[k].name}: ${label}`);
        }
        x += wd;
      });
    });
  });
}

// Smoothed distribution lines: one line per series, showing where its values fall
// (a kernel density estimate: each value spreads a small bump of width `bw`, and the bumps add up).
// The y value is the share of values per `per` units of x, so 0.05 means 5% of values per step.
// series: [{name, color, values}]; hovering shows every series at that x.
function densityLines(f, series, opts) {
  const { min, max, bw = 0.015, per = 0.01 } = opts;
  const N = 160, xs = Array.from({ length: N + 1 }, (_, i) => min + (max - min) * i / N);
  const curves = series.map(s => {
    const k = 1 / (s.values.length * bw * Math.sqrt(2 * Math.PI));
    const ys = xs.map(x => s.values.reduce((a, v) => a + Math.exp(-0.5 * ((x - v) / bw) ** 2), 0) * k * per);
    const sorted = [...s.values].sort((a, b) => a - b);
    return { ...s, ys, median: sorted[Math.floor(sorted.length / 2)] };
  });
  legend(f, curves.map(c => ["dot", c.color, `${c.name} (median ${c.median.toFixed(2)})`]));
  const plot = document.createElement("div"); plot.className = "plot"; f.append(plot);
  draws.push(() => {
    const w = plot.clientWidth || 600, H = opts.height || 300, R = 12, T = 16, B = 38;
    plot.replaceChildren();
    const svg = el("svg", { height: H, viewBox: `0 0 ${w} ${H}`, role: "img", "aria-label": opts.aria || "" }, plot);
    const top = Math.max(...curves.flatMap(c => c.ys)), step = opts.yStep || (top <= 0.04 ? 0.01 : 0.02);
    const yMax = Math.ceil(top / step) * step;
    const L = yLeft(niceTicks(yMax, step).map(pct), opts.yTitle);
    const sx = v => L + (v - min) / (max - min) * (w - L - R), sy = v => T + (1 - v / yMax) * (H - T - B);
    for (const t of niceTicks(yMax, step)) {
      el("line", { x1: L, x2: w - R, y1: sy(t), y2: sy(t), stroke: css(t === 0 ? "--axis" : "--grid"), "stroke-width": 1 }, svg);
      txt(svg, L - 6, sy(t) + 4, pct(t), { "text-anchor": "end" });
    }
    for (const t of opts.xTicks) {
      el("line", { x1: sx(t), x2: sx(t), y1: T, y2: H - B, stroke: css("--grid"), "stroke-width": 1 }, svg);
      txt(svg, sx(t), H - B + 15, opts.xFmt ? opts.xFmt(t) : String(t), { "text-anchor": "middle" });
    }
    txt(svg, (L + w - R) / 2, H - 4, opts.xTitle || "", { "text-anchor": "middle", class: "title" });
    yTitle(svg, T, H - B, opts.yTitle);
    for (const c of curves) {
      const pts = xs.map((x, i) => `${sx(x).toFixed(1)},${sy(c.ys[i]).toFixed(1)}`);
      el("polygon", { points: `${sx(min)},${sy(0)} ${pts.join(" ")} ${sx(max)},${sy(0)}`, fill: css(c.color), opacity: 0.1 }, svg);
      el("polyline", { points: pts.join(" "), fill: "none", stroke: css(c.color), "stroke-width": 2, "stroke-linejoin": "round" }, svg);
    }
    // Hover: a vertical line, and every series' value at that point.
    const guide = el("line", { y1: T, y2: H - B, stroke: css("--ink"), "stroke-width": 1, visibility: "hidden" }, svg);
    const marker = el("circle", { r: 1, fill: "transparent" }, svg);
    const area = el("rect", { x: L, y: T, width: w - L - R, height: H - T - B, fill: "transparent" }, svg);
    area.addEventListener("pointermove", e => {
      const r = svg.getBoundingClientRect(), px = e.clientX - r.left;
      const i = Math.max(0, Math.min(N, Math.round((px - L) / (w - L - R) * N)));
      const x = sx(xs[i]);
      guide.setAttribute("x1", x); guide.setAttribute("x2", x); guide.setAttribute("visibility", "visible");
      marker.setAttribute("cx", x); marker.setAttribute("cy", T + 10);
      showTip(marker, `${opts.xTitle}: ${xs[i].toFixed(2)}`, curves.map(c => `${c.name}: ${pct(c.ys[i])}`));
    });
    area.addEventListener("pointerleave", () => { guide.setAttribute("visibility", "hidden"); hideTip(); });
  });
}

// Ladder: a value at each of a few ordered positions (for example, candidates from most to least
// popular), one line per series, with an optional shaded range (lo to hi) around a series, or
// one thin line per election behind it (items: [{shares}]).
// series: [{name, color, values: [{median, lo, hi}], band, items, itemsName, dash}]; hover shows every series at a position.
function ladder(f, series, opts) {
  // A series drawn over its own thin lines takes the ink color, so it stands out from them.
  const lc = s => s.items ? "--ink" : s.color;
  legend(f, series.flatMap(s => s.items ? [["line", "--ink", s.name], ["line", s.color, s.itemsName]] : [[s.band ? "dot" : "line", s.color, s.name]]));
  const plot = document.createElement("div"); plot.className = "plot"; f.append(plot);
  const n = series[0].values.length;
  draws.push(() => {
    const w = plot.clientWidth || 600, H = opts.height || 320, R = 16, T = 18, B = 38;
    const L = yLeft(niceTicks(opts.yMax, opts.yStep).map(pct), opts.yTitle);
    plot.replaceChildren();
    const svg = el("svg", { height: H, viewBox: `0 0 ${w} ${H}`, role: "img", "aria-label": opts.aria || "" }, plot);
    const sx = i => L + 14 + i / (n - 1) * (w - L - R - 28), sy = v => T + (1 - v / opts.yMax) * (H - T - B);
    for (const t of niceTicks(opts.yMax, opts.yStep)) {
      el("line", { x1: L, x2: w - R, y1: sy(t), y2: sy(t), stroke: css(t === 0 ? "--axis" : "--grid"), "stroke-width": 1 }, svg);
      txt(svg, L - 6, sy(t) + 4, pct(t), { "text-anchor": "end" });
    }
    for (let i = 0; i < n; i++) txt(svg, sx(i), H - B + 15, opts.xLabels[i], { "text-anchor": "middle" });
    txt(svg, (L + w - R) / 2, H - 4, opts.xTitle || "", { "text-anchor": "middle", class: "title" });
    yTitle(svg, T, H - B, opts.yTitle);
    for (const s of series.filter(s => s.items)) for (const it of s.items)
      el("polyline", { points: it.shares.map((v, i) => `${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(" "), fill: "none", stroke: css(s.color), "stroke-width": 1.2, opacity: 0.18, "stroke-linejoin": "round" }, svg);
    for (const s of series.filter(s => s.band)) {
      const up = s.values.map((v, i) => `${sx(i)},${sy(v.hi)}`), down = s.values.map((v, i) => `${sx(i)},${sy(v.lo)}`).reverse();
      el("polygon", { points: [...up, ...down].join(" "), fill: css(s.color), opacity: 0.15 }, svg);
    }
    for (const s of series) {
      const d = s.values.map((v, i) => `${sx(i)},${sy(v.median)}`).join(" ");
      el("polyline", { points: d, fill: "none", stroke: css("--surface"), "stroke-width": 6, "stroke-linejoin": "round" }, svg);
      el("polyline", { points: d, fill: "none", stroke: css(lc(s)), "stroke-width": s.band || s.items ? 3 : 2.5, "stroke-dasharray": s.dash || "", "stroke-linejoin": "round" }, svg);
      s.values.forEach((v, i) => el("circle", { cx: sx(i), cy: sy(v.median), r: s.band || s.items ? 4.5 : 3.5, fill: css(lc(s)), stroke: css("--surface"), "stroke-width": 1.5 }, svg));
    }
    for (let i = 0; i < n; i++) {
      const half = (sx(1) - sx(0)) / 2;
      hitArea(svg, { tag: "rect", attrs: { x: sx(i) - half, y: T, width: half * 2, height: H - T - B } }, opts.xLabels[i],
        series.map(s => `${s.name}: ${pct(s.values[i].median)}` + (s.band ? ` (middle half ${pct(s.values[i].lo)} to ${pct(s.values[i].hi)})` : "")),
        `${opts.xLabels[i]}: ` + series.map(s => `${s.name} ${pct(s.values[i].median)}`).join(", "));
    }
  });
}

// Lines on linear scales, for values measured at numbered points (such as voter counts).
// series: [{name, color, points: [[x, y]], dash, width, band: [[x, lo, hi]]}];
// opts: {xMin, xMax, xStep, yMax, yStep, xTitle, yTitle, vlines: [x], vlineName, height, aria, fmt}.
// Hover shows every series at the nearest x.
function lineChart(f, series, opts) {
  const plot = document.createElement("div"); plot.className = "plot"; f.append(plot);
  const fmt = opts.fmt || (v => String(v));
  draws.push(() => {
    const w = plot.clientWidth || 600, H = opts.height || 300, R = 14, T = 18, B = 38;
    const L = yLeft(niceTicks(opts.yMax, opts.yStep).map(String), opts.yTitle);
    plot.replaceChildren();
    const svg = el("svg", { height: H, viewBox: `0 0 ${w} ${H}`, role: "img", "aria-label": opts.aria || "" }, plot);
    const sx = x => L + (x - opts.xMin) / (opts.xMax - opts.xMin) * (w - L - R), sy = v => T + (1 - Math.min(v, opts.yMax) / opts.yMax) * (H - T - B);
    for (const t of niceTicks(opts.yMax, opts.yStep)) {
      el("line", { x1: L, x2: w - R, y1: sy(t), y2: sy(t), stroke: css(t === 0 ? "--axis" : "--grid"), "stroke-width": 1 }, svg);
      txt(svg, L - 6, sy(t) + 4, String(t), { "text-anchor": "end" });
    }
    const every = Math.max(1, Math.ceil(((opts.xMax - opts.xMin) / opts.xStep) / Math.max(2, Math.floor((w - L - R) / 60))));
    for (let x = Math.ceil(opts.xMin / opts.xStep) * opts.xStep, i = 0; x <= opts.xMax + 1e-9; x += opts.xStep, i++)
      if (i % every === 0) txt(svg, sx(x), H - B + 15, x.toLocaleString(), { "text-anchor": "middle" });
    txt(svg, (L + w - R) / 2, H - 4, opts.xTitle || "", { "text-anchor": "middle", class: "title" });
    yTitle(svg, T, H - B, opts.yTitle);
    for (const x of opts.vlines || []) el("line", { x1: sx(x), x2: sx(x), y1: T, y2: H - B, stroke: css("--axis"), "stroke-width": 1, "stroke-dasharray": "2 3" }, svg);
    for (const s of series.filter(s => s.band)) {
      const up = s.band.map(([x, , hi]) => `${sx(x)},${sy(hi)}`), down = s.band.map(([x, lo]) => `${sx(x)},${sy(lo)}`).reverse();
      el("polygon", { points: [...up, ...down].join(" "), fill: css(s.color), opacity: 0.18 }, svg);
    }
    for (const s of series) {
      const d = s.points.map(([x, y]) => `${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(" ");
      el("polyline", { points: d, fill: "none", stroke: css("--surface"), "stroke-width": (s.width || 2.5) + 3, "stroke-linejoin": "round" }, svg);
      el("polyline", { points: d, fill: "none", stroke: css(s.color), "stroke-width": s.width || 2.5, "stroke-dasharray": s.dash || "", "stroke-linejoin": "round" }, svg);
    }
    // Hover: a vertical guide and every series' value at the nearest x.
    const xs = [...new Set(series.flatMap(s => s.points.map(p => p[0])))].sort((a, b) => a - b);
    const guide = el("line", { y1: T, y2: H - B, stroke: css("--ink"), "stroke-width": 1, visibility: "hidden" }, svg);
    const marker = el("circle", { r: 1, fill: "transparent" }, svg);
    const area = el("rect", { x: L, y: T, width: w - L - R, height: H - T - B, fill: "transparent" }, svg);
    area.addEventListener("pointermove", e => {
      const r = svg.getBoundingClientRect(), px = e.clientX - r.left;
      const x = xs.reduce((a, b) => Math.abs(sx(b) - px) < Math.abs(sx(a) - px) ? b : a);
      guide.setAttribute("x1", sx(x)); guide.setAttribute("x2", sx(x)); guide.setAttribute("visibility", "visible");
      marker.setAttribute("cx", sx(x)); marker.setAttribute("cy", T + 10);
      showTip(marker, `${opts.xTitle}: ${x.toLocaleString()}`, series.map(s => { const p = s.points.find(p => p[0] === x); return p ? `${s.name}: ${fmt(p[1])}` : null; }).filter(Boolean));
    });
    area.addEventListener("pointerleave", () => { guide.setAttribute("visibility", "hidden"); hideTip(); });
  });
}


// ---------- "Copy as image" ----------
// The same picture as the NYC DSA branch page's button: the chart's title, takeaway, key, and
// chart on a light bone card (12px corners, a 1px edge of ink at 10%, 28px of padding) at twice
// screen resolution, outside the corners transparent. The button and the table view
// are left out. Uses html-to-image, loaded by the page.
const CARD = "#fffcf6";
// Cuts empty rows (all card color) off the bottom of a canvas, up to `most` rows.
function trimBottom(canvas, most) {
  const { width: w, height: h } = canvas;
  const px = canvas.getContext("2d").getImageData(0, h - most, w, most).data;
  const bg = [1, 3, 5].map(i => parseInt(CARD.slice(i, i + 2), 16));
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
  const pad = 28, radius = 12, scale = 2, spare = 40;
  // Draw an off-screen copy, so the page itself doesn't change.
  const box = document.createElement("div");
  box.style.cssText = `position: fixed; left: -10000px; top: 0; width: ${node.offsetWidth}px;`;
  const copy = node.cloneNode(true);
  copy.querySelectorAll(".copy, details, img.copyimg").forEach(e => e.remove());
  Object.assign(copy.style, { border: "0", borderRadius: "0", background: "transparent", padding: "0", paddingBottom: `${spare}px` });
  box.append(copy); document.body.append(box);
  // Text can come out a little taller in the image than on the page: render with room to
  // spare, then trim the empty rows at the bottom.
  let shot;
  try { shot = await htmlToImage.toCanvas(copy, { backgroundColor: CARD, pixelRatio: scale }); }
  finally { box.remove(); }
  shot = trimBottom(shot, spare * scale);
  const c = document.createElement("canvas");
  c.width = shot.width + 2 * pad * scale; c.height = shot.height + 2 * pad * scale;
  const g = c.getContext("2d");
  g.beginPath(); g.roundRect(0, 0, c.width, c.height, radius * scale); g.fillStyle = CARD; g.fill();
  const e = scale / 2;
  g.beginPath(); g.roundRect(e, e, c.width - 2 * e, c.height - 2 * e, radius * scale - e);
  g.strokeStyle = "rgba(18, 16, 17, 0.1)"; g.lineWidth = scale; g.stroke();
  g.drawImage(shot, pad * scale, pad * scale);
  return new Promise(res => c.toBlob(res, "image/png"));
}
// Puts the chart on the clipboard as a PNG. If the browser won't allow that, shows the image
// under the chart to copy by hand.
function imageButton(node) {
  const btn = document.createElement("button"); btn.type = "button"; btn.className = "copy"; btn.textContent = "Copy as image";
  const flash = t => { btn.textContent = t; setTimeout(() => { btn.textContent = "Copy as image"; }, 1800); };
  btn.addEventListener("click", async () => {
    btn.textContent = "Copying…";
    // The clipboard write has to start during the click, with the image still being drawn.
    const png = chartPng(node);
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      flash("Copied");
    } catch {
      try {
        let shown = node.querySelector("img.copyimg");
        if (!shown) { shown = document.createElement("img"); shown.className = "copyimg"; shown.alt = "The chart as an image"; node.append(shown); }
        shown.src = URL.createObjectURL(await png);
        btn.textContent = "Right-click the image below to copy";
      } catch { flash("Couldn't copy"); }
    }
  });
  return btn;
}
