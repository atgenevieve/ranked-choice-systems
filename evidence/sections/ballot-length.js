// Ballot length: how many candidates voters rank, and how limits and instructions change it.
window.SECTIONS["ballot-length"] = () => {
// ---------- 1. Small multiples: share of ballots by number ranked ----------
{
  const f = figure("How many candidates voters rank",
    "Where the ballot has a limit, the most common choice is to fill it. Where it has none, most voters stop at 2 to 4.",
    "Share of all ballots that rank exactly this many candidates. The darker bar marks the ballot's limit.");
  const box = document.createElement("div"); box.className = "multiples"; f.append(box);
  const keys = ["scotland", "ers", "portland", "nyc"];
  const panels = keys.map(k => {
    const d = DATA.distributions[k];
    const p = document.createElement("div"); p.className = "panel";
    const h = document.createElement("h3"); h.textContent = d.label;
    const m = document.createElement("div"); m.className = "meta"; m.textContent = `${d.elections.toLocaleString()} elections · ${d.ballots.toLocaleString()} ballots`;
    const plot = document.createElement("div"); plot.className = "plot";
    p.append(h, m, plot); box.append(p);
    return { d, plot };
  });
  draws.push(() => {
    for (const { d, plot } of panels) {
      const w = plot.clientWidth || 400, H = 190, L = 34, R = 6, T = 14, B = 26;
      plot.replaceChildren();
      const svg = el("svg", { height: H, viewBox: `0 0 ${w} ${H}`, role: "img", "aria-label": `${d.label}: share of ballots by number of candidates ranked` }, plot);
      const sh = d.shares.slice(0, 10), maxY = 0.5;
      const sy = v => T + (1 - v / maxY) * (H - T - B);
      const bw = (w - L - R) / sh.length;
      for (const t of niceTicks(maxY, 0.1)) {
        el("line", { x1: L, x2: w - R, y1: sy(t), y2: sy(t), stroke: css(t === 0 ? "--axis" : "--grid"), "stroke-width": 1 }, svg);
        txt(svg, L - 6, sy(t) + 4, pct(t), { "text-anchor": "end" });
      }
      sh.forEach((v, i) => {
        const len = i + 1, x = L + i * bw + 2, bwi = Math.min(24, bw - 4), x0 = x + (bw - 4 - bwi) / 2;
        const isLimit = d.limit && len === d.limit;
        const y = sy(v), h = sy(0) - y;
        if (h > 0) {
          const r = Math.min(4, h);
          el("path", { d: `M${x0},${sy(0)} V${y + r} Q${x0},${y} ${x0 + r},${y} H${x0 + bwi - r} Q${x0 + bwi},${y} ${x0 + bwi},${y + r} V${sy(0)} Z`, fill: css(isLimit ? "--limit" : "--bar") }, svg);
        }
        txt(svg, x0 + bwi / 2, H - B + 14, len === 10 ? "10+" : String(len), { "text-anchor": "middle" });
        if (isLimit || v === Math.max(...sh)) txt(svg, x0 + bwi / 2, y - 4, pct(v), { "text-anchor": "middle", class: "val" });
        hitArea(svg, { tag: "rect", attrs: { x: L + i * bw, y: T, width: bw, height: H - T - B } }, d.label,
          [`Ranked ${len}${len === 10 ? " or more" : ""}: ${pct(v)} of ballots${isLimit ? " (the ballot's limit)" : ""}`], `Ranked ${len}: ${pct(v)}`);
      });
      txt(svg, (L + w - R) / 2, H - 2, "Candidates ranked", { "text-anchor": "middle", class: "title" });
    }
  });
  // Fold the "10 or more" tail into the 10th bar for the charts and table.
  for (const k of keys) { const s = DATA.distributions[k].shares; const tail = s.slice(9).reduce((a, b) => a + b, 0); DATA.distributions[k].shares = [...s.slice(0, 9), +tail.toFixed(4)]; }
  tableView(f, ["Source", ...Array.from({ length: 10 }, (_, i) => i === 9 ? "10+" : String(i + 1))],
    keys.map(k => [DATA.distributions[k].label, ...DATA.distributions[k].shares.map(pct)]), [false, ...Array(10).fill(true)]);
}

// ---------- 2. Ranks versus candidates ----------
{
  const G = DATA.by_group, pts = chartPts();
  const dbl = g => Math.round((2 ** G[g].cand.b - 1) * 100);
  const f = figure("Candidates ranked, by number of candidates",
    `Every group ranks more as the field grows. In Scotland, doubling the candidates adds about ${dbl("scotland")}% more ranks; in union and society elections, about ${dbl("ers")}%.`,
    "Each dot is one election with no limit on how many candidates voters could rank (elections with a limit are left out). Each group has its own trend line, drawn only over the range its data covers. The two smaller groups have few elections, so their lines are rough. Projections to a larger election are at the bottom of the page.");
  groupLegend(f);
  scatter(f, {
    aria: "Scatter of average candidates ranked against number of candidates, with a trend line for each group",
    xMin: 0, xMax: 30, xTicks: [0, 5, 10, 15, 20, 25, 30], yMax: 12, yStep: 2,
    xTitle: "Candidates in the election", yTitle: "Average candidates ranked",
    lines: GROUP_ORDER.map(g => ({ from: G[g].cand.min, to: G[g].cand.max, f: x => G[g].cand.a * x ** G[g].cand.b, color: GROUP[g].v })),
    points: pts.map(e => ({ x: e.candidates, y: e.mean, color: GROUP[e.group].v, name: e.name,
      lines: [GROUP[e.group].name, `${e.candidates} candidates · ${e.seats} seat${e.seats > 1 ? "s" : ""}`, `ranked ${e.mean.toFixed(1)} on average`] })),
  });
  tableView(f, ["Election", "Group", "Candidates", "Seats", "Average ranked"],
    pts.map(e => [e.name, GROUP[e.group].name, e.candidates, e.seats, e.mean.toFixed(2)]), [false, false, true, true, true]);
}

// ---------- 3. Ranks versus seats ----------
{
  const G = DATA.by_group, pts = chartPts();
  const f = figure("Candidates ranked, by number of seats",
    `Union and society elections cover the widest range, 1 to 12 seats, and there members rank about ${G.ers.seats.b.toFixed(1)} more candidates for each extra seat. Public elections only cover 1 to 5 seats; in Scotland, each extra seat adds about ${G.scotland.seats.b.toFixed(1)}.`,
    "Each dot is one election with no limit on how many candidates voters could rank. Each group's line covers only its own range of seats. The other organizational elections all fill 1 seat, so they have no line. More seats also mean more candidates, so seats and candidates can't be fully separated. Projections to a larger election are at the bottom of the page.");
  groupLegend(f);
  scatter(f, {
    aria: "Scatter of average candidates ranked against number of seats, with a trend line for each group",
    xMin: 0, xMax: 13, xTicks: [0, 2, 4, 6, 8, 10, 12], yMax: 12, yStep: 2,
    xTitle: "Seats in the election", yTitle: "Average candidates ranked",
    lines: GROUP_ORDER.filter(g => G[g].seats.b != null).map(g => ({ from: G[g].seats.min, to: G[g].seats.max, f: x => G[g].seats.a + G[g].seats.b * x, color: GROUP[g].v })),
    points: pts.map(e => ({ x: e.seats, y: e.mean, color: GROUP[e.group].v, name: e.name,
      lines: [GROUP[e.group].name, `${e.seats} seat${e.seats > 1 ? "s" : ""} · ${e.candidates} candidates`, `ranked ${e.mean.toFixed(1)} on average`] })),
  });
  tableView(f, ["Election", "Group", "Seats", "Candidates", "Average ranked"],
    [...pts].sort((a, b) => a.seats - b.seats).map(e => [e.name, GROUP[e.group].name, e.seats, e.candidates, e.mean.toFixed(2)]), [false, false, true, true, true]);
}

// ---------- 3b. Same seats, more candidates ----------
{
  const f = figure("More candidates means more ranks, even with the same number of seats", null,
    "Within Scottish wards of the same size, doubling the candidates adds about 20 to 27% more ranks; within union and society elections of the same size, about 43 to 62%.");
  const pts = chartPts();
  // One row per group, under the group's name; each panel is titled by its seats.
  const boxes = {};
  for (const p of DATA.same_seats) {
    const group = p.group === "scotland" ? "Scotland" : "Union and society elections";
    if (!boxes[group]) {
      const gh = document.createElement("h3"); gh.className = "group"; gh.textContent = group;
      boxes[group] = document.createElement("div"); boxes[group].className = "multiples three";
      f.append(gh, boxes[group]);
    }
    const box = boxes[group];
    const panel = document.createElement("div"); panel.className = "panel";
    const h = document.createElement("h4"); h.textContent = `${p.seats} seat${p.seats > 1 ? "s" : ""}`;
    const m = document.createElement("div"); m.className = "meta";
    m.textContent = `${p.n} elections, ${p.min}–${p.max} candidates. Doubling candidates adds ~${Math.round((2 ** p.b - 1) * 100)}% more ranks.`;
    panel.append(h, m); box.append(panel);
    const mine = pts.filter(e => e.group === p.group && e.seats === p.seats);
    scatter(panel, {
      aria: `${group}, ${h.textContent}: average candidates ranked against number of candidates`,
      height: 220, xMin: 0, xMax: 30, xTicks: [0, 10, 20, 30], yMax: 12, yStep: 4,
      xTitle: "Candidates", yTitle: "Average ranked",
      lines: [{ from: p.min, to: p.max, f: x => p.a * x ** p.b, color: GROUP[p.group].v }],
      points: mine.map(e => ({ x: e.candidates, y: e.mean, color: GROUP[p.group].v, name: e.name,
        lines: [`${e.candidates} candidates · ${e.seats} seat${e.seats > 1 ? "s" : ""}`, `ranked ${e.mean.toFixed(1)} on average`] })),
    });
  }
}

// ---------- 3c. Elections with a rank limit ----------
{
  const L = DATA.limited;
  const f = figure("Elections with a rank limit: how many voters fill it",
    "The smaller the limit, the more voters fill it: about half to three quarters fill a limit of 3, and a quarter to a half fill a limit of 5 or 6. With a limit of 5, more candidates means more voters fill it.",
    "Each dot is one election where voters could rank fewer candidates than were running. The share is of all ballots in the election that ranked exactly as many as the limit allowed. Lines are straight-line fits over each panel's range.");
  const box = document.createElement("div"); box.className = "multiples"; f.append(box);
  const places = { nyc: "NYC", portland: "Portland", public: "San Francisco, Oakland, Minneapolis, and others" };
  for (const lim of [3, 5, 6]) {
    const mine = L.filter(e => e.limit === lim);
    const panel = document.createElement("div"); panel.className = "panel";
    const h = document.createElement("h3"); h.textContent = `Limit of ${lim}`;
    const m = document.createElement("div"); m.className = "meta";
    m.textContent = `${mine.length} elections · ${[...new Set(mine.map(e => places[e.group] || e.group))].join(", ")}`;
    panel.append(h, m); box.append(panel);
    const xs = mine.map(e => e.candidates), ys = mine.map(e => e.fill), n = xs.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
    const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
    const slope = sxx ? xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / sxx : 0;
    scatter(panel, {
      aria: `Limit of ${lim}: share of ballots that fill the limit, by number of candidates`,
      height: 220, xMin: 0, xMax: 35, xTicks: [0, 10, 20, 30], yMax: 1, yStep: 0.25, yFmt: pct,
      xTitle: "Candidates", yTitle: "Share filling the limit",
      lines: n > 2 && sxx ? [{ from: Math.min(...xs), to: Math.max(...xs), f: x => my + slope * (x - mx), color: "--bar" }] : [],
      points: mine.map(e => ({ x: e.candidates, y: e.fill, color: "--bar", name: e.name,
        lines: [`${e.candidates} candidates · ${e.seats} seat${e.seats > 1 ? "s" : ""} · limit ${e.limit}`, `${pct(e.fill)} filled the limit · ranked ${e.mean.toFixed(1)} on average`] })),
    });
  }
  tableView(f, ["Election", "Limit", "Seats", "Candidates", "Filled the limit", "Average ranked"],
    [...L].sort((a, b) => a.limit - b.limit || b.fill - a.fill).map(e => [e.name, e.limit, e.seats, e.candidates, pct(e.fill), e.mean.toFixed(2)]),
    [false, true, true, true, true, true]);
}

// ---------- 3c2. Does a limit change behavior? ----------
{
  const L = DATA.limited;
  const f = figure("Does a limit change how far people rank?",
    "A limit of 3 mostly just cuts ballots short: about as many voters fill it as would rank 3 or more with no limit. Limits of 5 and 6 act as a target: 2 to 5 times as many voters rank exactly that many as would rank that far with no limit.",
    "Each dot is one election with a limit. Across: the share of voters in comparable elections with no limit (within 2 candidates) who ranked that many or more. Up: the share who ranked exactly up to the limit in this election. The diagonal line is no effect: dots on it mean the limit only cut ballots short; dots above it mean the limit pulled voters up to it. Comparisons are across places (mostly US elections against Scottish ones), so other differences, like NYC's \"rank up to 5\" campaign, are mixed in. Portland's comparison elections have far fewer candidates than Portland's, so its dots are rough.");
  const box = document.createElement("div"); box.className = "multiples"; f.append(box);
  for (const lim of [3, 5, 6]) {
    const mine = L.filter(e => e.limit === lim);
    const panel = document.createElement("div"); panel.className = "panel";
    const ratio = mine.map(e => e.fill / e.unlimited_share).sort((a, b) => a - b);
    const med = ratio[Math.floor(ratio.length / 2)];
    const h = document.createElement("h3"); h.textContent = `Limit of ${lim}`;
    const m = document.createElement("div"); m.className = "meta"; m.textContent = `${mine.length} elections · typically ${med.toFixed(1)} times the no-limit share`;
    panel.append(h, m); box.append(panel);
    scatter(panel, {
      aria: `Limit of ${lim}: share filling the limit against the share of comparable unlimited voters ranking that far`,
      height: 240, xMin: 0, xMax: 1, xTicks: [0, 0.25, 0.5, 0.75, 1], xFmt: pct, yMax: 1, yStep: 0.25, yFmt: pct,
      xTitle: "With no limit: share ranking that many or more", yTitle: "With the limit: share filling it",
      lines: [{ from: 0, to: 1, f: x => x, color: "--axis" }],
      points: mine.map(e => ({ x: e.unlimited_share, y: e.fill, color: "--bar", name: e.name,
        lines: [`${e.candidates} candidates · ${e.seats} seat${e.seats > 1 ? "s" : ""} · limit ${e.limit}`, `${pct(e.fill)} filled the limit`,
          `${pct(e.unlimited_share)} of comparable no-limit voters (${e.peer_candidates[0]} to ${e.peer_candidates[1]} candidates) ranked ${e.limit} or more`] })),
    });
  }
  tableView(f, ["Election", "Limit", "Candidates", "Filled the limit", "No-limit share ranking that far"],
    [...L].sort((a, b) => a.limit - b.limit || b.fill - a.fill).map(e => [e.name, e.limit, e.candidates, pct(e.fill), pct(e.unlimited_share)]),
    [false, true, true, true, true]);
}

// ---------- 3d. A limit equal to the number of seats ----------
{
  const C = DATA.cut_at_seats;
  const f = figure("A limit equal to the number of seats",
    "Where voters are told to rank as many as there are seats, most do exactly that. And cutting real ballots at that rank rarely changes who wins.",
    "The first four boxes are what voters did under a limit or instruction equal to the seats. Minneapolis had a maximum (\"up to 3\"); Canberra and the Senate set a minimum (\"at least\"), with no maximum. The 2016 Australian Senate figure for above-the-line party boxes comes from the research write-up (docs/large-elections.md). The last two boxes recount this project's real ballots with every ballot cut after rank = seats. That only shortens ballots; a real limit would also change how far people rank.");
  const box = document.createElement("div"); box.className = "predict";
  const cards = [
    ["Minneapolis Park Board, 2009", "54%", "3 seats, 3 ranks allowed: share of ballots that ranked all 3. The only election in this project's data with a limit equal to the seats."],
    ["Australian Senate, 2016", "82%", "6 seats per state, told to number at least 6 party boxes: share who numbered exactly 6."],
    ["Canberra (ACT) 2024, 5-seat electorates", "69%", "Told to number at least 5, with 24 to 34 candidates: share who numbered exactly 5. 98% numbered at least 5, against 16% ranking 5 or more in large Scottish wards with no instruction. From this project's ballots."],
    ["Tasmania Senate 2016, below the line", "67%", "12 seats, told to number at least 12: share who numbered exactly 12. From this project's ballots."],
    ["Recount: Scottish wards", `${C.scotland.changed} of ${C.scotland.elections.toLocaleString()}`, `Wards where the winners change when ballots are cut after rank = seats (3 or 4). The cut shortens ${pct(C.scotland.ballots_cut)} of ballots.`],
    ["Recount: union and society elections", `${C.ers.changed} of ${C.ers.elections}`, `Elections with 2 or more seats where the winners change when ballots are cut after rank = seats. The cut shortens ${pct(C.ers.ballots_cut)} of ballots.`],
  ];
  for (const [h, v, t] of cards) {
    const d = document.createElement("div");
    const hh = document.createElement("div"); hh.className = "h"; hh.textContent = h;
    const vv = document.createElement("div"); vv.className = "v"; vv.textContent = v;
    const ss = document.createElement("div"); ss.className = "s"; ss.textContent = t;
    d.append(hh, vv, ss); box.append(d);
  }
  f.append(box);
}

// ---------- 4. Rank my party, then stop ----------
{
  const d = DATA.party_then_stop;
  const f = figure("Scotland: voters who rank their party's candidates, then stop", null,
    `About ${pct(d.all)} of Scottish voters whose first choice's party ran 2 or more candidates ranked exactly that party's candidates and no one else.`);
  const plot = document.createElement("div"); plot.className = "plot"; f.append(plot);
  draws.push(() => {
    const w = plot.clientWidth || 600, rows = d.by_party, rowH = 34, L = 140, R = 48, T = 4, B = 24, H = T + rows.length * rowH + B;
    plot.replaceChildren();
    const svg = el("svg", { height: H, viewBox: `0 0 ${w} ${H}`, role: "img", "aria-label": "Share of voters who rank only their party's candidates, by party" }, plot);
    const sx = v => L + v / 0.5 * (w - L - R);
    for (const t of [0, 0.1, 0.2, 0.3, 0.4, 0.5]) {
      el("line", { x1: sx(t), x2: sx(t), y1: T, y2: H - B, stroke: css(t === 0 ? "--axis" : "--grid"), "stroke-width": 1 }, svg);
      txt(svg, sx(t), H - B + 15, pct(t), { "text-anchor": "middle" });
    }
    rows.forEach((r, i) => {
      const y = T + i * rowH + (rowH - 20) / 2, x1 = sx(r.share);
      txt(svg, L - 10, y + 14, r.party, { "text-anchor": "end", class: "lab" });
      el("path", { d: `M${sx(0)},${y} H${x1 - 4} Q${x1},${y} ${x1},${y + 4} V${y + 16} Q${x1},${y + 20} ${x1 - 4},${y + 20} H${sx(0)} Z`, fill: css("--scotland") }, svg);
      txt(svg, x1 + 6, y + 14, pct(r.share), { class: "val" });
      hitArea(svg, { tag: "rect", attrs: { x: L, y: T + i * rowH, width: w - L - R, height: rowH } }, r.party, [`${pct(r.share)} of ${r.voters.toLocaleString()} voters`], `${r.party}: ${pct(r.share)}`);
    });
  });
  tableView(f, ["Party", "Voters considered", "Ranked only their party"], d.by_party.map(r => [r.party, r.voters.toLocaleString(), pct(r.share)]), [false, true, true]);
}

// ---------- 5. What each version predicts ----------
{
  const B2 = DATA.both, proj = b => Math.exp(b.c0 + b.c1 * Math.log(75) + b.c2 * Math.log(50)), dbl = c => Math.round((2 ** c - 1) * 100);
  const pubMax = DATA.elections.filter(e => ["scotland", "public"].includes(e.group) && (e.max_ranks == null || e.max_ranks >= e.candidates)).reduce((m, e) => Math.max(m, e.candidates), 0);
  const f = figure("Projection: a 50-seat election with 75 candidates",
    "Each rule uses candidates and seats together, carried out to an election far larger than any in the data. The readings disagree by a factor of about 3, which is why the proposal builds all three and reports results under each. The biggest divide isn't seats; it's whether members behave like public voters or like union members.",
    `These are projections, not evidence. The public-election rule comes from elections of up to ${pubMax} candidates, and the union and society rules from elections of up to 29 candidates and 12 seats. 75 candidates is the size of Metro DC DSA's 46-seat delegate count.`);
  const box = document.createElement("div"); box.className = "predict";
  const cards = [
    ["(a) Behaves like public voters (Scotland)", `≈ ${proj(B2.scotland).toFixed(0)}`, `Rule from 1,100 Scottish elections: doubling the candidates adds about ${dbl(B2.scotland.c1)}% more ranks, and doubling the seats adds about ${dbl(B2.scotland.c2)}%.`],
    ["(b) Behaves like union members (ERS)", `≈ ${proj(B2.ers).toFixed(0)}`, `Rule from 87 union and society elections: doubling the candidates adds about ${dbl(B2.ers.c1)}% more ranks, and doubling the seats adds about ${dbl(B2.ers.c2)}%.`],
    ["(c) Follows the instructions", "As asked", "Where ballots have a limit, about 4 in 10 voters fill it exactly (NYC 37%, Portland 47%)."],
  ];
  for (const [h, v, s] of cards) {
    const d = document.createElement("div");
    const hh = document.createElement("div"); hh.className = "h"; hh.textContent = h;
    const vv = document.createElement("div"); vv.className = "v"; vv.textContent = v;
    const ss = document.createElement("div"); ss.className = "s"; ss.textContent = s;
    d.append(hh, vv, ss); box.append(d);
  }
  f.append(box);
}

};
