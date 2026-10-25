// Candidate popularity: how unequal first choices are, and the shape of that inequality.
// Shown as plain ratios (how many times more first choices one candidate gets than another),
// not as the model's spread setting, which only means something inside the model.
window.SECTIONS.popularity = () => {
  decisionBox(DECISIONS.popularity);
  const E = DATA.elections.filter(e => e.top_ratio != null);
  const M = DATA.model_7;
  const NAMES = { scotland: "Scotland", public: "Other public elections", org: "Other organizational", ers: "Union and society (ERS)", nyc: "NYC primaries", portland: "Portland", act: "Canberra" };
  const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const times = v => `${(+v).toFixed(v < 10 ? 1 : 0)}×`;
  const model = s => M.find(m => m.spread === s).top_ratio;

  {
    const quotas = e => e.top_share * (e.seats + 1);
    const ROWS = [
      ["Scotland, 1 seat", e => e.group === "scotland" && e.seats === 1],
      ["Scotland, 2 to 5 seats", e => e.group === "scotland" && e.seats > 1],
      ["Union and society (ERS), 1 seat", e => e.group === "ers" && e.seats === 1],
      ["Union and society (ERS), 2 to 4 seats", e => e.group === "ers" && e.seats > 1 && e.seats < 5],
      ["Union and society (ERS), 5 to 12 seats", e => e.group === "ers" && e.seats >= 5],
      ["Other organizational, 1 seat", e => e.group === "org"],
      ["Other public elections, 1 seat", e => e.group === "public" && e.seats === 1],
      ["Other public elections, 2 to 5 seats", e => e.group === "public" && e.seats > 1],
      ["NYC primaries, 1 seat", e => e.group === "nyc"],
      ["Portland, 1 seat", e => e.group === "portland" && e.seats === 1],
      ["Portland, 3 seats", e => e.group === "portland" && e.seats > 1],
      ["Canberra, 5 seats", e => e.group === "act"],
    ].map(([label, test]) => ({ label, els: E.filter(test) })).filter(r => r.els.length);
    const reach = r => pct(r.els.filter(e => quotas(e) >= 1).length / r.els.length);
    const row = l => ROWS.find(r => r.label === l);
    const f = figure("The top candidate's first choices, measured against the quota",
      `With one seat, the top candidate rarely has enough first choices to win outright: ${reach(row("Scotland, 1 seat"))} of Scottish by-elections, ${reach(row("NYC primaries, 1 seat"))} of NYC primaries. With several seats, it depends on how crowded the field is. When there are about 2 candidates or fewer per seat, the leader almost always passes the quota: ${reach(row("Scotland, 2 to 5 seats"))} of Scottish wards and ${reach(row("Union and society (ERS), 5 to 12 seats"))} of union and society elections with 5 or more seats, often by 2 to 3 times. In crowded fields, first choices split further and the leader often falls short: Canberra (about 6 candidates per seat) and Portland's 3-seat races (about 9). Votes beyond the quota (the surplus) pass to voters' next choices. Metro DC DSA's 75 candidates for 46 seats is 1.6 candidates per seat, like the larger union and society elections, so expect leaders well past the quota. Only ${row("Union and society (ERS), 5 to 12 seats").els.length} elections here have 5 or more seats, so this is a projection.`,
      "The quota is the share of first choices that guarantees a seat: 1 ÷ (seats + 1). That's 50% with one seat, 25% with three, and about 2% with 50. 1× (the heavier line) means the top candidate has exactly the quota; 2× means twice what they need. Elections above 4× are counted in the last bar. Each row is scaled to its own tallest bar; hover for counts.");
    strips(f, ROWS.map(r => {
      const all = r.els.map(quotas);
      return { label: r.label, sub: `${all.length} election${all.length > 1 ? "s" : ""}`, values: all.map(v => Math.min(v, 3.99)), median: med(all),
        color: r.label.startsWith("Scotland") ? "--scotland" : "--bar" };
    }), { min: 0, max: 4, bin: 0.1, ticks: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4], mark: 1, fmt: v => `${v}×`, labelW: 260,
      xTitle: "Top candidate's first choices, as a multiple of the quota", aria: "Top candidate's first choices as a multiple of the quota, by group and number of seats" });
  }

  {
    const capY = 20, over = E.filter(e => e.top_ratio > capY).length;
    // Typical (median) ratio in each band of field sizes, per group, joined by a line across the
    // bands that group covers (bands with at least 3 elections).
    const BANDS = [[2, 4], [5, 6], [7, 8], [9, 10], [11, 13], [14, 19], [20, 34]];
    const GROUPS = { "--scotland": g => g === "scotland", "--public": g => !["scotland", "ers", "org"].includes(g), "--ers": g => g === "ers" || g === "org" };
    const bandLine = (test, color) => {
      const pts = BANDS.map(([lo, hi]) => { const v = E.filter(e => test(e.group) && e.candidates >= lo && e.candidates <= hi).map(e => e.top_ratio); return v.length >= 3 ? [(lo + hi) / 2, med(v)] : null; }).filter(Boolean);
      return { from: pts[0][0], to: pts[pts.length - 1][0], color, pts,
        f: x => { let k = 0; while (k < pts.length - 2 && x > pts[k + 1][0]) k++; const [x0, y0] = pts[k], [x1, y1] = pts[k + 1]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); } };
    };
    const lines = Object.entries(GROUPS).map(([c, t]) => bandLine(t, c)), sc = lines[0].pts;
    const f = figure("Bigger fields are more lopsided",
      `In every group, the more candidates run, the further the top candidate pulls ahead of the middle one. In Scotland, the top candidate typically gets about ${times(sc[0][1])} the middle candidate's first choices with 2 to 4 candidates, and about ${times(sc[sc.length - 1][1])} with 11 to 13. Bigger fields add more long-shot candidates, so the middle candidate is weaker. For a large election like yours, expect a lopsided field.`,
      `Each dot is one election, from 2 to 34 candidates. Up the side: the top candidate's first choices divided by the middle candidate's. The middle candidate is the median one: line the candidates up from most to fewest first choices, and it's the one halfway down. ${over} elections above ${capY}× are drawn at the top edge; hover for their values. Each line, in its group's color, joins the typical (median) election in each band of field sizes (2 to 4 candidates, 5 to 6, 7 to 8, 9 to 10, 11 to 13, 14 to 19, and 20 or more), across the bands with at least 3 of that group's elections.`);
    legend(f, [["dot", "--scotland", "Scotland"], ["dot", "--public", "US and other public elections"], ["dot", "--ers", "Union, society, and other organizational elections"]]);
    const color = g => g === "scotland" ? "--scotland" : (g === "ers" || g === "org") ? "--ers" : "--public";
    scatter(f, {
      aria: "Top-to-middle multiple against number of candidates",
      xMin: 0, xMax: 35, xTicks: [0, 5, 10, 15, 20, 25, 30, 35], yMax: capY, yStep: 5, yFmt: v => `${v}×`,
      xTitle: "Candidates in the election", yTitle: "Top candidate ÷ middle candidate", lines,
      points: E.map(e => ({ x: e.candidates, y: e.top_ratio, color: color(e.group), name: e.name,
        lines: [NAMES[e.group], `${e.candidates} candidates · ${e.seats} seat${e.seats > 1 ? "s" : ""}`, `top candidate ${times(e.top_ratio)} the middle one · top share ${pct(e.top_share)}`] })),
    });
  }

  // Which popularity setting matches each type of election? The model's popularity draw alone, run
  // on each real election's own candidates and seats at a range of settings (data/evidence_data.py).
  const Q = DATA.quota_check, SP = ["0.4", "0.5", "0.6", "0.7", "0.8", "0.9", "1.0", "1.1", "1.2", "1.3", "1.5"];
  // The setting at which the model matches the real median, by straight-line interpolation.
  const fitSpread = (c, k) => {
    const m = SP.map(sp => c.model[sp][k]), x = SP.map(Number);
    for (let i = 0; i < x.length - 1; i++) if ((m[i] - c.real[k]) * (m[i + 1] - c.real[k]) <= 0) return x[i] + (x[i + 1] - x[i]) * (c.real[k] - m[i]) / (m[i + 1] - m[i]);
    return c.real[k] < m[0] ? x[0] : x[x.length - 1];
  };
  // The model's value at any setting, by the same interpolation.
  const modelAt = (c, k, sp) => {
    const x = SP.map(Number); let i = 0;
    while (i < x.length - 2 && sp > x[i + 1]) i++;
    return c.model[SP[i]][k] + (c.model[SP[i + 1]][k] - c.model[SP[i]][k]) * (sp - x[i]) / (x[i + 1] - x[i]);
  };
  const fitQ = Q.map(c => fitSpread(c, "quota")), fitE = Q.map(c => fitSpread(c, "even"));
  const r1 = v => (Math.round(v * 20) / 20).toFixed(2).replace(/0$/, "");
  const cellIdx = name => Q.findIndex(c => c.cell === name);
  const xfmt = v => `${(+v).toFixed(2).replace(/\.?0+$/, "")}×`;
  const big = Q[cellIdx("Organizational, 5 to 12 seats")];

  {
    const f = figure("Which popularity setting fits each type of election",
      `A setting of about 0.6 to 0.7 fits most types of election. Two need a more lopsided one: single-seat public races (about ${r1(fitQ[cellIdx("Public, 1 seat")])}) and organizational elections with 5 or more seats (about ${r1(fitQ[cellIdx("Organizational, 5 to 12 seats")])}), the type closest to yours.`,
      `Each bar is how far the typical election's top candidate passes the quota (1× is exactly the quota). The fitted settings are rough, give or take 0.1: some groups are small, like the ${big.n} organizational elections with 5 or more seats.`);
    hbars(f, Q.map(c => ({ label: `${c.cell} (${c.n.toLocaleString()})`, values: [c.real.quota, c.model["0.7"].quota, c.model["1.0"].quota] })),
      [{ name: "Real elections", color: "--scotland" }, { name: "Model, setting 0.7", color: "--public" }, { name: "Model, setting 1.0", color: "--ers" }],
      { max: 2.5, step: 0.5, labelW: 250, fmt: xfmt, aria: "Top candidate against the quota: real elections against the model at two settings, by type of election" });
    tableView(f, ["Type of election", "Elections", "Real", "Setting that fits"], Q.map((c, k) => [c.cell, c.n, `${c.real.quota.toFixed(2)}×`, `about ${r1(fitQ[k])}`]), [false, true, true, false]);
  }

  {
    const bk = cellIdx("Organizational, 5 to 12 seats"), gap = Math.max(...Q.map((c, k) => k === bk ? 0 : Math.abs(fitQ[k] - fitE[k])));
    const f = figure("The quota and the even split point to the same setting",
      `Tuning to the quota or to the even split gives nearly the same setting for most types of election: they differ by at most ${gap.toFixed(2)}, about the size of the random noise. That's because both measure the top candidate's share of first choices; they only divide it by something different (seats plus one, or the number of candidates). The exception is organizational elections with 5 or more seats (${r1(fitQ[bk])} against ${r1(fitE[bk])}), where only ${big.n} elections make both estimates rough. The quota is the one used for tuning, because it ties to what the project measures: votes beyond the quota pass to voters' next choices.`,
      "For each type of election, the popularity setting at which the model matches the real elections, found two ways: matching the top candidate's first choices as a multiple of the quota, and as a multiple of an even split (the share every candidate would get if all were equally popular).");
    hbars(f, Q.map((c, k) => ({ label: `${c.cell} (${c.n.toLocaleString()})`, values: [fitQ[k], fitE[k]] })),
      [{ name: "Setting that matches the quota", color: "--public" }, { name: "Setting that matches the even split", color: "--c7" }],
      { max: 1.2, step: 0.2, labelW: 250, fmt: v => (+v).toFixed(2).replace(/0$/, ""), aria: "Popularity setting fitted to the quota and to the even split, by type of election" });
  }

  {
    const atFit = Q.map((c, k) => modelAt(c, "last", fitQ[k]));
    const ratio = Q.map((c, k) => c.real.last / atFit[k]);
    const pub = cellIdx("Public, 2 to 5 seats"), bigK = cellIdx("Organizational, 5 to 12 seats");
    const f = figure("The bottom of the field: what the long-shot setting is for",
      `With the leading candidates tuned to the quota, the model still makes the last candidate too strong in most types of election. In multi-seat public elections (mostly Scotland), the real last candidate gets about ${pct(ratio[pub])} of what the model gives them. The gap is smaller in organizational elections with 1 to 4 seats. In organizational elections with 5 or more seats, the model already matches, so those may need few or no long shots, though that rests on only ${big.n} elections. The long-shot setting gets tuned to close each type's gap.`,
      `The last candidate's first choices as a multiple of an even split, in the typical (median) election of each type: 0.25× means a quarter of an even share. The model bars use each type's setting from the chart above, with popularity alone and no slates. Write-in slots on US ballots aren't counted as candidates.`);
    hbars(f, Q.map((c, k) => ({ label: `${c.cell} (${c.n.toLocaleString()})`, values: [c.real.last, atFit[k]] })),
      [{ name: "Real elections", color: "--scotland" }, { name: "Model, at the setting that fits the quota", color: "--public" }],
      { max: 0.5, step: 0.1, labelW: 250, fmt: xfmt, aria: "Last candidate's first choices against an even split: real elections against the model, by type of election" });
  }

  {
    const Lad = DATA.ladder_7, ord = ["Top", "2nd", "3rd", "4th", "5th", "6th", "Last"];
    const P = Lad.model["0.7"], C = Lad.model["1.0"], R = Lad.real;
    const f = figure("The typical ward, candidate by candidate",
      `Neither model setting matches the typical real ward from top to bottom. The proposed setting (0.7) matches the leader (${pct(P[0].median)} of first choices, against a real ${pct(R[0].median)}) but leaves the last candidate too strong (${pct(P[6].median)}, against a real ${pct(R[6].median)}). The current setting (1.0) gets the last candidate about right (${pct(C[6].median)}) but makes the leader too strong (${pct(C[0].median)}).`,
      `Each candidate's share of first choices, from the most popular to the least, in the ${Lad.wards} Scottish wards with exactly 7 candidates. The green line is the typical (median) ward at each position, and the shaded band holds the middle half of wards. Each model line is the typical election out of 4,000 simulated ones, using popularity alone, with no party loyalty. Hover a position for values.`);
    ladder(f, [
      { name: "Real Scottish wards", color: "--scotland", values: Lad.real, band: true },
      { name: "Model, proposed setting (0.7)", color: "--public", values: Lad.model["0.7"] },
      { name: "Model, current setting (1.0)", color: "--ers", values: Lad.model["1.0"], dash: "6 4" },
    ], { yMax: 0.4, yStep: 0.1, xLabels: ord, xTitle: "Candidates, from most to least popular", yTitle: "Share of first choices", aria: "Share of first choices by candidate position: real Scottish wards against the model" });
  }

  {
    const A = DATA.ladder_7.all, Lad = DATA.ladder_7;
    const under = l => pct(l.filter(e => e.shares[6] < 0.03).length / l.length);
    const f = figure("Every ward: most real fields have a near-empty last place",
      `The typical ward hides how often the last candidate gets almost nothing. In ${under(A.real)} of real wards, the last candidate gets under 3% of first choices. At the proposed setting, only ${under(A.model)} of model elections do. The popularity setting can't close this gap, because it stretches or squeezes the whole line at once: making the bottom weaker also makes the leader stronger, as the current setting shows. That's why the proposal adds a separate share of long-shot candidates, a few candidates far below the rest, alongside a popularity setting that fits the leaders.`,
      `Each thin green line is one of the ${A.real.length} real wards. The black line is the typical ward, the same as the green line in the chart above, and the model lines are the same as above. The model's percentage comes from ${A.model.length} simulated elections at the proposed setting. Hover a position for values.`);
    ladder(f, [
      { name: "Typical real ward", itemsName: "Each real ward", color: "--scotland", values: Lad.real, items: A.real },
      { name: "Model, proposed setting (0.7)", color: "--public", values: Lad.model["0.7"] },
      { name: "Model, current setting (1.0)", color: "--ers", values: Lad.model["1.0"], dash: "6 4" },
    ], { yMax: 0.6, yStep: 0.1, height: 380, xLabels: ["Top", "2nd", "3rd", "4th", "5th", "6th", "Last"], xTitle: "Candidates, from most to least popular", yTitle: "Share of first choices", aria: "Each real Scottish ward's first-choice shares by candidate position, with the typical real ward and the model" });
  }

  {
    const even = e => e.top_share * e.candidates, M7 = DATA.ladder_7.model;
    const g = k => med(E.filter(e => e.group === k).map(even));
    const f = figure("How far the top candidate is above an even split",
      `If every candidate were equally popular, each would get the same share of first choices: with 7 candidates, 1 in 7 (about 14%). In a typical Scottish ward, the top candidate gets about ${g("scotland").toFixed(1)} times that even share, and union and society elections look the same (${g("ers").toFixed(1)}×). NYC primaries are a little more lopsided (${g("nyc").toFixed(1)}×). Canberra (${g("act").toFixed(1)}×) and Portland (${g("portland").toFixed(1)}×) are higher mainly because they have long candidate lists, which make the even share tiny. The model gives about ${(M7["0.7"][0].median * 7).toFixed(1)}× at the proposed setting and ${(M7["1.0"][0].median * 7).toFixed(1)}× at the current one, in a 7-candidate field.`,
      "The top candidate's share of first choices divided by the even share (1 ÷ number of candidates), for each election. 1× means the top candidate got exactly an even share; 2× means twice as much. Each row shows how its elections are spread: taller bars where more elections fall, scaled to each row's tallest bar; hover for counts.");
    const order = ["scotland", "ers", "org", "public", "nyc", "act", "portland"];
    strips(f, order.filter(k => E.some(e => e.group === k)).map(k => {
      const v = E.filter(e => e.group === k).map(even);
      return { label: NAMES[k], sub: `${v.length} elections`, values: v, color: k === "scotland" ? "--scotland" : "--bar" };
    }), { min: 0, max: 8, bin: 0.25, ticks: [0, 1, 2, 3, 4, 5, 6, 7, 8], mark: 1, fmt: v => `${v}×`, xTitle: "Top candidate's share, as a multiple of an even split", aria: "Top candidate's share as a multiple of an even split, by group" });
  }

  {
    const f = figure("Background: how much more the top candidate gets than the middle one",
      `In a typical Scottish ward, the most popular candidate gets about ${times(med(E.filter(e => e.group === "scotland").map(e => e.top_ratio)))} as many first choices as the middle candidate. Union and society elections look much the same. Single-seat US races and large fields are more lopsided: Canberra about ${times(med(E.filter(e => e.group === "act").map(e => e.top_ratio)))}, Portland about ${times(med(E.filter(e => e.group === "portland").map(e => e.top_ratio)))}.`,
      `Top candidate's first choices divided by the middle candidate's, for each election. The middle candidate is the median one: line the candidates up from most to fewest first choices, and it's the one halfway down (the 4th of 7). 1× means they got the same. Each row shows how its elections are spread: taller bars where more elections fall, scaled to each row's tallest bar; hover for counts. Elections above 16× are counted in the last bar. The model sets this with one "popularity spread" number; in a 7-candidate field, its current setting (1.0) gives about ${times(model(1))}, and the proposed 0.7 gives about ${times(model(0.7))}.`);
    const order = ["scotland", "ers", "org", "public", "nyc", "act", "portland"];
    strips(f, order.filter(g => E.some(e => e.group === g)).map(g => {
      const all = E.filter(e => e.group === g).map(e => e.top_ratio), v = all.map(x => Math.min(x, 15.99));
      return { label: NAMES[g], sub: `${v.length} elections`, values: v, median: med(all), color: g === "scotland" ? "--scotland" : "--bar" };
    }), { min: 0, max: 16, bin: 0.5, ticks: [0, 2, 4, 6, 8, 10, 12, 14, 16], fmt: v => `${v}×`, xTitle: "Top candidate's first choices, as a multiple of the middle candidate's", aria: "Top candidate against middle candidate, by group" });
  }
};
