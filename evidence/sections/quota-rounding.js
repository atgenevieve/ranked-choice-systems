// Quota rounding: how the whole-vote quota makes the answer swing with the number of voters,
// next to the exact (unrounded) quota. Data from data/quota_rounding.py.
window.SECTIONS["quota-rounding"] = () => {
  decisionBox(DECISIONS["quota-rounding"]);
  const LEVELS = [[0.95, "95%", "", 2.6], [0.8, "80%", "7 4", 2], [0.5, "50%", "2 3", 1.8]];
  const RULE = { whole: { name: "Whole-vote quota (Scottish rules)", color: "--ers" }, exact: { name: "Exact quota (no rounding)", color: "--public" } };
  // The confidence rank: the smallest cutoff rank at or below which a share q of elections fall.
  const rankAt = (counts, q) => {
    const n = counts.reduce((a, b) => a + b, 0);
    let acc = 0;
    for (let i = 0; i < counts.length; i++) { acc += counts[i]; if (acc >= q * n - 1e-9) return i + 1; }
    return counts.length;
  };
  // Several voter counts' elections pooled together, as if turnout could be any of them.
  const pool = (pts, rule) => {
    const out = [];
    for (const p of pts) p[rule].forEach((n, i) => { out[i] = (out[i] || 0) + n; });
    return Array.from(out, x => x || 0);
  };
  const steps = (e, lo, hi) => { const per = e.seats + 1, s = []; for (let x = Math.ceil(lo / per) * per; x <= hi; x += per) s.push(x); return s; };
  const sub = (f, text) => { const h = document.createElement("h3"); h.textContent = text; f.append(h); };
  const levelLegend = (f, color) => legend(f, LEVELS.map(([, name, dash]) => ["line", color, `${name} confidence${dash ? (dash === "7 4" ? " (dashed)" : " (dotted)") : " (solid)"}`]));
  const E = DATA.elections;

  // ---- With and without rounding, for each election.
  for (const e of E) {
    const pts = e.points, xs = pts.map(p => p.v);
    const r95 = rule => pts.map(p => rankAt(p[rule], 0.95));
    const w = r95("whole"), x = r95("exact");
    const top = Math.max(...LEVELS.flatMap(([q]) => pts.flatMap(p => [rankAt(p.whole, q), rankAt(p.exact, q)])));
    const yStep = top > 40 ? 10 : 5, yMax = Math.ceil(top / yStep) * yStep;
    const f = figure(`${e.name}: the answer with and without rounding`,
      `With the whole-vote quota, the 95% confidence rank runs from ${Math.min(...w)} to ${Math.max(...w)} as voters go from ${xs[0].toLocaleString()} to ${xs[xs.length - 1].toLocaleString()}, rising between quota steps and dropping at each one. With the exact quota, the same elections give ${Math.min(...x)} to ${Math.max(...x)}: no sawtooth, at or a little above the peaks of the whole-vote sawtooth.`,
      `Each point is ${DATA.sims.toLocaleString()} simulated elections of organization members, with a ballot that says "rank up to ${e.seats}" and the model's default slates, played out with the same random voters under both quotas. The dotted vertical lines are where the whole-vote quota goes up by one vote: every ${e.seats + 1} voters (seats + 1). Hover for the numbers.`);
    for (const rule of ["whole", "exact"]) {
      sub(f, RULE[rule].name);
      levelLegend(f, RULE[rule].color);
      lineChart(f, LEVELS.map(([q, name, dash, width]) => ({ name: `${name} confidence`, color: RULE[rule].color, dash, width, points: pts.map(p => [p.v, rankAt(p[rule], q)]) })), {
        xMin: xs[0], xMax: xs[xs.length - 1], xStep: e.seats + 1 > 60 ? 50 : 20, yMax, yStep, xTitle: "Voters", yTitle: "Ranks needed", height: 260,
        vlines: rule === "whole" ? steps(e, xs[0], xs[xs.length - 1]) : [], fmt: v => `rank ${v}`,
        aria: `${RULE[rule].name}: the 95%, 80%, and 50% confidence ranks at each number of voters, ${e.name}`,
      });
    }
    tableView(f, ["Voters", "Quota (whole votes)", "Whole-vote: 95%", "80%", "50%", "Exact: 95%", "80%", "50%"],
      pts.map(p => [p.v.toLocaleString(), p.quota, ...["whole", "exact"].flatMap(r => LEVELS.map(([q]) => rankAt(p[r], q)))]), [1, 1, 1, 1, 1, 1, 1, 1]);
  }

  // ---- Why: just before and just after a quota step.
  {
    const e = E[0], per = e.seats + 1;
    const step = steps(e, e.points[0].v + 4, e.points[e.points.length - 1].v)[1];
    const before = e.points.filter(p => p.v < step).pop(), after = e.points.find(p => p.v >= step);
    const card = (label, p) => {
      const share = p.v / per, need = e.seats * p.quota, left = p.v - need;
      return [`${label}: ${p.v} voters`, `rank ${rankAt(p.whole, 0.95)}`,
        `Quota ${p.quota} votes; the exact share is ${share.toFixed(2)}. ${e.seats} winners at ${p.quota} votes each need ${need} votes: ` +
        (left >= 0 ? `${left} fewer than the ${p.v} cast. Every seat can be won by reaching the quota, but only by gathering nearly every vote.` :
          `${-left} more than the ${p.v} cast, so at least ${Math.ceil(-left / p.quota)} seats can't be won by reaching the quota.`)];
    };
    const f = figure("Why: the rounding is up to one vote per winner",
      `Scottish rules set the quota to ballots ÷ (seats + 1), drop any fraction, and add 1, so it's always a whole number of votes. That puts it anywhere from just above the exact share to almost a full vote above it. In a big public election one vote doesn't matter. Here the quota is about ${before.quota} votes, so one vote is about ${Math.round(100 / before.quota)}% of a quota, and it counts once for each of ${e.seats} winners.`,
      `Just before a step, the quota is nearly exact. To fill every seat by reaching the quota, the count has to gather nearly every vote for a winner, so it keeps passing votes far down ballots, and deep ranks decide the last seats. Just after a step, the quota is rounded up by almost a whole vote. The last few seats can't be won by reaching it, so they go to whoever is left once everyone else has been excluded, and the count ends before votes travel as far. This is the project's reading of why; the cause, the rounding, is confirmed by the exact-quota count above.`);
    cards(f, [card("Just before a step", before), card("Just after a step", after)]);
  }

  // ---- Size: where rounding stops mattering.
  {
    const S = DATA.size;
    const row = s => ({ m: s.votes_per_seat, before: rankAt(s.before_step.whole, 0.95), after: rankAt(s.after_step.whole, 0.95), exact: rankAt(s.after_step.exact, 0.95) });
    const rows = S.points.map(row);
    const at = m => rows.find(r => r.m === m) || rows[0];
    const small = at(10), big = rows[rows.length - 1];
    const f = figure("The swing shrinks as votes per seat grow",
      `With about ${small.m} votes per seat, the 95% confidence rank is ${small.before} just before a quota step and ${small.after} just after it. With ${big.m} votes per seat (${(big.m * (S.seats + 1)).toLocaleString()} voters), it's ${big.before} and ${big.after}. Rounding matters most when each seat takes only a handful of votes, which is exactly the case in large organizational elections. Public-sized electorates weren't run here; with thousands of votes per seat, one vote is a tiny fraction of the quota, so the swing should be small.`,
      `${S.candidates} candidates and ${S.seats} seats, with the same settings as above. For each number of votes per seat (the whole-vote quota just after a step), the election is played out just after that quota step and just before the next one. Votes per seat times ${S.seats + 1} is the number of voters.`);
    legend(f, [["line", "--ers", "Whole-vote quota, just before a step"], ["line", "--ers", "Whole-vote quota, just after a step (dashed)"], ["line", "--public", "Exact quota"]]);
    const top = Math.max(...rows.flatMap(r => [r.before, r.after, r.exact]));
    lineChart(f, [
      { name: "Whole-vote, just before a step", color: "--ers", points: rows.map(r => [r.m, r.before]) },
      { name: "Whole-vote, just after a step", color: "--ers", dash: "7 4", points: rows.map(r => [r.m, r.after]) },
      { name: "Exact quota", color: "--public", points: rows.map(r => [r.m, r.exact]) },
    ], { xMin: 0, xMax: rows[rows.length - 1].m, xStep: 10, yMax: Math.ceil(top / 10) * 10, yStep: 10, xTitle: "Votes per seat (the quota)", yTitle: "95% confidence rank", fmt: v => `rank ${v}`,
      aria: "The 95% confidence rank just before and just after a quota step, and with the exact quota, as votes per seat grow" });
    tableView(f, ["Votes per seat", "Voters", "Just before a step", "Just after a step", "Exact quota"],
      S.points.map(s => { const r = row(s); return [r.m, `${s.after_step.v.toLocaleString()} to ${s.before_step.v.toLocaleString()}`, r.before, r.after, r.exact]; }), [1, 1, 1, 1, 1]);
  }

  // ---- What to recommend: each simulated election draws its own turnout around the expected one.
  if (E.every(e => e.turnout)) {
    const f = figure("What to recommend: cover the turnouts you expect",
      "You can't know turnout to the voter, so the model doesn't use one exact number. Each simulated election draws its own number of voters around the expected one: with a 10% turnout range, about 2 in 3 elections land within 10% of the expected turnout, and 19 in 20 within 20%. That spans several quota steps, so the sawtooth averages out, and the answer barely depends on exactly where you center it. It reads: \"Across the turnouts you expect, 95 of 100 elections are decided within the first N ranks.\"",
      "The thin line is one exact voter count (the sawtooth above). The thick line is the same election with turnout spread around each expected number. The blue line is the exact quota with a 10% turnout range, for comparison: much higher, so the voting method's quota matters more than turnout does. The spread answer sits in the middle of the sawtooth, not at its peaks: the deep answers happen only in the narrow stretch just before each step, so they're a small share of the turnouts you might get. Ranking deeper never hurts a voter's earlier choices under these rules, so anyone who wants to be safe can rank further. Each point is 1,000 simulated elections.");
    const row = document.createElement("div"); row.className = "note"; row.style.display = "flex"; row.style.flexWrap = "wrap"; row.style.gap = "8px 16px";
    const select = (label, options, value) => {
      const l = document.createElement("label"); l.textContent = label + " ";
      const s = document.createElement("select");
      for (const [v, t] of options) { const o = document.createElement("option"); o.value = v; o.textContent = t; s.append(o); }
      s.value = value; l.append(s); row.append(l); return s;
    };
    const which = select("Election:", E.map((e, i) => [i, e.name]), 0);
    const spread = select("Turnout range:", [["0.05", "±5%"], ["0.1", "±10% (default)"], ["0.15", "±15%"]], "0.1");
    f.append(row);
    const out = document.createElement("div"); f.append(out);
    const draw = () => {
      const e = E[Number(which.value)], key = `whole_${spread.value}`, T = e.turnout;
      out.replaceChildren();
      const spreadLine = T.map(r => [r.v, rankAt(r[key], 0.95)]);
      const exactLine = T.map(r => [r.v, rankAt(r["exact_0.1"], 0.95)]);
      const raw = e.points.map(p => [p.v, rankAt(p.whole, 0.95)]);
      const ys = spreadLine.map(p => p[1]), rs = raw.map(p => p[1]);
      const near = T.reduce((a, r) => Math.abs(r.v - e.yours) < Math.abs(a.v - e.yours) ? r : a);
      const holder = document.createElement("section"); holder.style.display = "grid"; holder.style.gap = "10px"; out.append(holder);
      const pct = Math.round(Number(spread.value) * 100);
      cards(holder, [
        [`About ${near.v.toLocaleString()} expected voters, give or take ${pct}%`, `rank ${rankAt(near[key], 0.95)}`, `Across the turnouts you expect, 95 of 100 elections are decided within the first ${rankAt(near[key], 0.95)} ranks. Half are decided within the first ${rankAt(near[key], 0.5)}.`],
        ["Across the chart", `${Math.min(...ys)} to ${Math.max(...ys)}`, `With turnout spread, the answer stays in this range from ${T[0].v.toLocaleString()} to ${T[T.length - 1].v.toLocaleString()} expected voters. One exact voter count gives anything from ${Math.min(...rs)} to ${Math.max(...rs)}.`],
      ]);
      legend(holder, [["line", "--ers", `Turnout spread by ${pct}% (thick)`], ["line", "--ers", "One exact voter count (thin)"], ["line", "--public", "Exact quota, 10% spread"]]);
      const top = Math.max(...rs, ...ys, ...exactLine.map(p => p[1]));
      const before = draws.length;
      lineChart(holder, [
        { name: "One exact voter count", color: "--ers", width: 1.2, points: raw },
        { name: `Turnout spread by ${pct}%`, color: "--ers", width: 3.5, points: spreadLine },
        { name: "Exact quota, 10% spread", color: "--public", width: 2, points: exactLine },
      ], { xMin: e.from, xMax: e.to, xStep: e.seats + 1 > 60 ? 50 : 20, yMax: Math.ceil(top / 10) * 10, yStep: 10, xTitle: "Expected voters", yTitle: "95% confidence rank",
        fmt: v => `rank ${v}`, aria: "The 95% confidence rank with turnout spread around each expected number, next to one exact voter count and the exact quota" });
      draws.slice(before).forEach(d => d());
    };
    which.addEventListener("change", draw);
    spread.addEventListener("change", draw);
    draw();
  }
};
