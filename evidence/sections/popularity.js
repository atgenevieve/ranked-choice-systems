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
    const share = g => med(E.filter(e => e.group === g).map(e => e.top_share));
    const f = figure("The top candidate's share of first choices",
      `In a typical Scottish ward, the most popular candidate gets about ${pct(share("scotland"))} of first choices; in union and society elections, about ${pct(share("ers"))}. Single-seat races concentrate support more: about ${pct(share("nyc"))} in NYC primaries. This share depends on how many candidates are running and how many seats there are, so it compares groups less fairly than the multiple above.`,
      "Share of each election's first choices going to its most popular candidate. Each row shows how its elections are spread: taller bars where more elections fall, scaled to each row's tallest bar; hover for counts.");
    const order = ["scotland", "ers", "org", "public", "nyc", "act", "portland"];
    strips(f, order.filter(g => E.some(e => e.group === g)).map(g => {
      const v = E.filter(e => e.group === g).map(e => e.top_share);
      return { label: NAMES[g], sub: `${v.length} elections`, values: v, color: g === "scotland" ? "--scotland" : "--bar" };
    }), { min: 0, max: 1, bin: 0.025, ticks: [0, 0.2, 0.4, 0.6, 0.8, 1], fmt: v => pct(v), xTitle: "Top candidate's share of first choices", aria: "Top candidate's share of first choices, by group" });
  }
};
