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
    const f = figure("How much more the top candidate gets than the middle one",
      `In a typical Scottish ward, the most popular candidate gets about ${times(med(E.filter(e => e.group === "scotland").map(e => e.top_ratio)))} as many first choices as the middle candidate. Union and society elections look much the same. Single-seat US races and large fields are more lopsided: Canberra about ${times(med(E.filter(e => e.group === "act").map(e => e.top_ratio)))}, Portland about ${times(med(E.filter(e => e.group === "portland").map(e => e.top_ratio)))}.`,
      `Top candidate's first choices divided by the middle candidate's (the median candidate), for each election. 1× means they got the same. Each row shows how its elections are spread: taller bars where more elections fall, scaled to each row's tallest bar; hover for counts. Elections above 16× are counted in the last bar. The model sets this with one "popularity spread" number; in a 7-candidate field, its current setting (1.0) gives about ${times(model(1))}, and the proposed 0.7 gives about ${times(model(0.7))}.`);
    const order = ["scotland", "ers", "org", "public", "nyc", "act", "portland"];
    strips(f, order.filter(g => E.some(e => e.group === g)).map(g => {
      const all = E.filter(e => e.group === g).map(e => e.top_ratio), v = all.map(x => Math.min(x, 15.99));
      return { label: NAMES[g], sub: `${v.length} elections`, values: v, median: med(all), color: g === "scotland" ? "--scotland" : "--bar" };
    }), { min: 0, max: 16, bin: 0.5, ticks: [0, 2, 4, 6, 8, 10, 12, 14, 16], fmt: v => `${v}×`, xTitle: "Top candidate's first choices, as a multiple of the middle candidate's", aria: "Top candidate against middle candidate, by group" });
  }

  {
    const Lad = DATA.ladder_7, ord = ["Top", "2nd", "3rd", "4th", "5th", "6th", "Last"];
    const P = Lad.model["0.7"], C = Lad.model["1.0"], R = Lad.real;
    const f = figure("Candidate by candidate: close, except at the bottom",
      `The proposed setting (0.7) tracks real Scottish wards closely for the top five candidates. The gap is at the bottom: real support holds up through the 4th candidate, then drops faster, so the last candidate typically gets about ${pct(R[6].median)}, against ${pct(P[6].median)} in the model. The current setting (1.0) gets the bottom right but gives the leader too much (${pct(C[0].median)} against a real ${pct(R[0].median)}). No single setting fits both ends, which is why the proposal adds a separate share of long-shot candidates.`,
      `Each candidate's share of first choices, from the most popular to the least, in Scottish wards with exactly 7 candidates (${Lad.wards} wards). The green line is the typical (median) ward at each position; the shaded band holds the middle half of wards. The model lines use popularity alone, with no party loyalty. Hover a position for values.`);
    ladder(f, [
      { name: "Real Scottish wards", color: "--scotland", values: Lad.real, band: true },
      { name: "Model, proposed setting (0.7)", color: "--public", values: Lad.model["0.7"] },
      { name: "Model, current setting (1.0)", color: "--ers", values: Lad.model["1.0"], dash: "6 4" },
    ], { yMax: 0.4, yStep: 0.1, xLabels: ord, xTitle: "Candidates, from most to least popular", yTitle: "Share of first choices", aria: "Share of first choices by candidate position: real Scottish wards against the model" });
  }

  {
    const BB = DATA.ladder_7.bottom_bigger, A = DATA.ladder_7.all, Lad = DATA.ladder_7;
    const under = l => pct(l.filter(e => e.shares[6] < 0.03).length / l.length);
    const quarter = l => pct(l.filter(e => e.shares[6] < e.shares[3] / 4).length / l.length);
    const f = figure("Every election at once: real fields drop off a cliff at the bottom",
      `Each thin line is one election, tracing each candidate's share of first choices from the most popular to the least. Look at the right-hand end. In real wards, the lines dive toward zero between the middle candidate and the last: the last candidate gets under 3% of first choices in ${under(A.real)} of real wards, against ${under(A.model)} of model elections, and less than a quarter of the middle candidate's first choices in ${quarter(A.real)}, against ${quarter(A.model)}. In the model, the lines slope down more evenly and end higher. Changing the popularity setting can't fix this: it stretches or squeezes the whole line, top and bottom alike. That's why the proposal adds a separate share of long-shot candidates.`,
      `All ${A.real.length} real Scottish wards with exactly 7 candidates, next to ${A.model.length} model elections at the proposed setting (0.7), with popularity alone and no party loyalty. The bold line is the typical election: the median share at each position. Hover a panel to pick out one election and see its drops.`);
    ladderPanels(f, [
      { name: "Real Scottish wards", color: "--scotland", items: A.real, median: Lad.real.map(q => q.median) },
      { name: "Model, proposed setting (0.7)", color: "--public", items: A.model, median: Lad.model["0.7"].map(q => q.median) },
    ], { yMax: 0.7, yStep: 0.1, xLabels: ["Top", "2nd", "3rd", "Mid", "5th", "6th", "Last"], xTitle: "Candidates, from most to least popular", yTitle: "Share of first choices", aria: "Each election's first-choice shares by candidate position, real Scottish wards beside model elections" });
  }

  {
    const capY = 20, over = E.filter(e => e.top_ratio > capY).length;
    const f = figure("By number of candidates",
      "Bigger fields tend to be more lopsided: with more long-shot candidates, the middle candidate is weaker, so the top candidate is further ahead of it.",
      `Each dot is one election, from 2 to 34 candidates. ${over} elections above ${capY}× are drawn at the top edge; hover for their values.`);
    legend(f, [["dot", "--scotland", "Scotland"], ["dot", "--public", "US and other public elections"], ["dot", "--ers", "Union, society, and other organizational elections"]]);
    const color = g => g === "scotland" ? "--scotland" : (g === "ers" || g === "org") ? "--ers" : "--public";
    scatter(f, {
      aria: "Top-to-middle multiple against number of candidates",
      xMin: 0, xMax: 35, xTicks: [0, 5, 10, 15, 20, 25, 30, 35], yMax: capY, yStep: 5, yFmt: v => `${v}×`,
      xTitle: "Candidates in the election", yTitle: "Top candidate ÷ middle candidate", lines: [],
      points: E.map(e => ({ x: e.candidates, y: e.top_ratio, color: color(e.group), name: e.name,
        lines: [NAMES[e.group], `${e.candidates} candidates · ${e.seats} seat${e.seats > 1 ? "s" : ""}`, `top candidate ${times(e.top_ratio)} the middle one · top share ${pct(e.top_share)}`] })),
    });
  }

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
      `With one seat, the top candidate rarely has enough first choices to win outright: ${reach(row("Scotland, 1 seat"))} of Scottish by-elections, ${reach(row("NYC primaries, 1 seat"))} of NYC primaries. With several seats, it depends on how crowded the field is. When there are about 2 candidates or fewer per seat, the leader almost always passes the quota: ${reach(row("Scotland, 2 to 5 seats"))} of Scottish wards and ${reach(row("Union and society (ERS), 5 to 12 seats"))} of union and society elections with 5 or more seats, often by 2 to 3 times. In crowded fields, first choices split further and the leader often falls short: Canberra (about 6 candidates per seat) and Portland's 3-seat races (about 9). Votes beyond the quota (the surplus) pass to voters' next choices. An election with 75 candidates for 50 seats has 1.5 candidates per seat, like the larger union and society elections, so expect leaders well past the quota. Only ${row("Union and society (ERS), 5 to 12 seats").els.length} elections here have 5 or more seats, so this is a projection.`,
      "The quota is the share of first choices that guarantees a seat: 1 ÷ (seats + 1). That's 50% with one seat, 25% with three, and about 2% with 50. 1× (the heavier line) means the top candidate has exactly the quota; 2× means twice what they need. Elections above 4× are counted in the last bar. Each row is scaled to its own tallest bar; hover for counts.");
    strips(f, ROWS.map(r => {
      const all = r.els.map(quotas);
      return { label: r.label, sub: `${all.length} election${all.length > 1 ? "s" : ""}`, values: all.map(v => Math.min(v, 3.99)), median: med(all),
        color: r.label.startsWith("Scotland") ? "--scotland" : "--bar" };
    }), { min: 0, max: 4, bin: 0.1, ticks: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4], mark: 1, fmt: v => `${v}×`, labelW: 260,
      xTitle: "Top candidate's first choices, as a multiple of the quota", aria: "Top candidate's first choices as a multiple of the quota, by group and number of seats" });
  }
};
