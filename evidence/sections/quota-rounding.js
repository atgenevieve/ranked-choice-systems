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

  // ---- What to recommend: pool the elections across the turnout you can't rule out.
  {
    const e = E[1], pts = e.points, xs = pts.map(p => p.v);
    const f = figure("What to recommend when turnout is uncertain",
      "You can't know turnout to within a few voters, so a recommendation can't rest on one exact voter count. Instead, play out elections across the whole range of turnout you expect, pool them, and ask for the rank that 95% of them need. Once that range is wider than one quota step, the sawtooth averages out, and the answer barely depends on exactly where you center it. The pooled answer sits in the middle of the sawtooth, not at its peaks: the deep answers happen only in the narrow stretch just before each step, so they make up a small share of the turnouts you might get.",
      `${e.name}. The thin line is the whole-vote quota at each exact voter count (the sawtooth above). The thick line pools every voter count within the chosen range around each point: "if turnout could be anywhere from 50 below to 50 above this, what rank do 95% of elections need?" The blue line is the exact quota, pooled the same way: much higher, so which quota your organization's rules use matters more than turnout does. Ranking deeper never hurts a voter's earlier choices under these rules, so a recommendation can safely lean high.`);
    const pick = document.createElement("label"); pick.className = "note";
    pick.textContent = "Turnout uncertain by: ";
    const sel = document.createElement("select");
    for (const [v, t] of [[25, "25 voters either way"], [50, "50 voters either way"], [75, "75 voters either way"]]) { const o = document.createElement("option"); o.value = v; o.textContent = t; sel.append(o); }
    sel.value = 50; pick.append(sel); f.append(pick);
    const out = document.createElement("div"); f.append(out);
    const draw = () => {
      const W = Number(sel.value);
      out.replaceChildren();
      const centers = xs.filter(v => v - W >= xs[0] && v + W <= xs[xs.length - 1]);
      const pooled = centers.map(c => [c, rankAt(pool(pts.filter(p => Math.abs(p.v - c) <= W), "whole"), 0.95)]);
      const pooledExact = centers.map(c => [c, rankAt(pool(pts.filter(p => Math.abs(p.v - c) <= W), "exact"), 0.95)]);
      const raw = pts.filter(p => p.v >= centers[0] && p.v <= centers[centers.length - 1]).map(p => [p.v, rankAt(p.whole, 0.95)]);
      const ys = pooled.map(p => p[1]), rs = raw.map(p => p[1]);
      const yours = pooled.find(p => p[0] === e.yours);
      const holder = document.createElement("section"); out.append(holder);
      const t = document.createElement("p"); t.className = "takeaway";
      t.textContent = `Pooled over ${W} voters either way, the 95% confidence rank stays between ${Math.min(...ys)} and ${Math.max(...ys)} across the chart, where a single exact voter count gives anything from ${Math.min(...rs)} to ${Math.max(...rs)}.` +
        (yours ? ` For ${e.yours.toLocaleString()} expected voters, give or take ${W}: rank ${yours[1]} (exact quota: ${pooledExact.find(p => p[0] === e.yours)[1]}).` : "");
      holder.append(t);
      legend(holder, [["line", "--ers", "Whole-vote quota, pooled over the turnout range (thick)"], ["line", "--ers", "Whole-vote quota, one exact voter count (thin)"], ["line", "--public", "Exact quota, pooled"]]);
      const top = Math.max(...rs, ...pooledExact.map(p => p[1]));
      const before = draws.length;
      lineChart(holder, [
        { name: "One exact voter count", color: "--ers", width: 1.2, points: raw },
        { name: `Pooled, ±${W} voters`, color: "--ers", width: 3.5, points: pooled },
        { name: "Exact quota, pooled", color: "--public", width: 2, points: pooledExact },
      ], { xMin: centers[0], xMax: centers[centers.length - 1], xStep: 50, yMax: Math.ceil(top / 10) * 10, yStep: 10, xTitle: "Expected voters (center of the range)", yTitle: "95% confidence rank",
        fmt: v => `rank ${v}`, aria: "The 95% confidence rank pooled over a turnout range, next to single voter counts and the exact quota" });
      draws.slice(before).forEach(d => d());
    };
    sel.addEventListener("change", draw);
    draw();
  }
};
