// Candidate popularity: how unequal first choices are, and the shape of that inequality.
window.SECTIONS.popularity = () => {
  decisionBox(DECISIONS.popularity);
  const E = DATA.elections;
  const NAMES = { scotland: "Scotland", public: "Other public elections", org: "Other organizational", ers: "Union and society (ERS)", nyc: "NYC primaries", portland: "Portland", act: "Canberra" };
  const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

  {
    const f = figure("How unequal first choices are",
      `The current setting, a spread of 1.0, sits near the middle of real multi-seat elections (Scotland ${med(E.filter(e => e.group === "scotland").map(e => e.spread)).toFixed(2)}). Single-seat US races are more lopsided, because a few front-runners dominate.`,
      "Fitted popularity spread for each election: how widely first-choice shares scatter, on a scale where doubling and halving count as equal steps. 0 means every candidate equally popular. Each row shows how its elections are spread: taller bars where more elections fall, scaled to each row\'s tallest bar; hover for counts. The black line is the median. The method is in data/calibration.py.");
    const order = ["scotland", "act", "ers", "org", "public", "portland", "nyc"];
    strips(f, order.filter(g => E.some(e => e.group === g)).map(g => {
      const v = E.filter(e => e.group === g).map(e => e.spread);
      return { label: NAMES[g], sub: `${v.length} elections`, values: v, color: g === "scotland" ? "--scotland" : "--bar" };
    }), { min: 0, max: 3.5, bin: 0.1, ticks: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], fmt: v => v.toFixed(1), xTitle: "Fitted popularity spread", aria: "Fitted popularity spread by group" });
  }

  {
    const s7 = E.filter(e => e.group === "scotland" && e.candidates === 7 && e.gap_top != null && e.gap_bottom != null);
    const f = figure("The shape: bunched leaders, a long tail",
      "In the model, the top candidate sits as far above the middle candidate as the bottom one sits below. In real Scottish wards, the gap below the middle is usually bigger: leading candidates bunch together, and long shots trail far behind. That's why the proposal adds a separate share of long-shot candidates.",
      `Scottish wards with exactly 7 candidates (${s7.length} wards). Across: how far the top candidate's first choices sit above the middle candidate's. Up: how far the middle candidate's sit above the bottom one's. Both are on a scale where doubling counts as one step (natural log). The line is where the current model puts every election, whatever its spread; dots above it have a longer tail than the model can make.`);
    scatter(f, {
      aria: "Gap above the middle candidate against gap below it, Scottish 7-candidate wards, with the model's line",
      xMin: 0, xMax: 3, xTicks: [0, 0.5, 1, 1.5, 2, 2.5, 3], yMax: 4, yStep: 1,
      xTitle: "Top candidate above the middle", yTitle: "Middle candidate above the bottom",
      lines: [{ from: 0, to: 3, f: x => x, color: "--axis" }],
      points: s7.map(e => ({ x: e.gap_top, y: e.gap_bottom, color: "--scotland", name: e.name,
        lines: [`gap above the middle ${e.gap_top.toFixed(2)}`, `gap below the middle ${e.gap_bottom.toFixed(2)}`, `top candidate's share ${pct(e.top_share)}`] })),
    });
  }

  {
    const f = figure("Spread by number of candidates",
      "Bigger fields tend to be more unequal: more long-shot candidates widen the spread. Portland's 17- to 31-candidate districts reach 1.1 to 1.6.",
      "Each dot is one election. Range shown is the data's own: 2 to 34 candidates.");
    legend(f, [["dot", "--scotland", "Scotland"], ["dot", "--public", "US and other public elections"], ["dot", "--ers", "Union, society, and other organizational elections"]]);
    const color = g => g === "scotland" ? "--scotland" : (g === "ers" || g === "org") ? "--ers" : "--public";
    scatter(f, {
      aria: "Fitted spread against number of candidates",
      xMin: 0, xMax: 35, xTicks: [0, 5, 10, 15, 20, 25, 30, 35], yMax: 3.5, yStep: 0.5,
      xTitle: "Candidates in the election", yTitle: "Fitted popularity spread", lines: [],
      points: E.map(e => ({ x: e.candidates, y: e.spread, color: color(e.group), name: e.name,
        lines: [NAMES[e.group], `${e.candidates} candidates · ${e.seats} seat${e.seats > 1 ? "s" : ""}`, `spread ${e.spread.toFixed(2)} · top share ${pct(e.top_share)}`] })),
    });
  }

  {
    const sc = E.filter(e => e.group === "scotland").map(e => e.top_share);
    const f = figure("Scotland: the top candidate's share of first choices",
      `In a typical Scottish ward, the most popular candidate gets about ${pct(med(sc))} of first choices.`,
      "Share of each ward's first choices going to its most popular candidate.");
    columns(f, binValues(sc, 0, 0.7, 0.05, v => pct(v)), { xTitle: "Top candidate's share of first choices", title: "Scottish wards", aria: "Histogram of the top candidate's share in Scottish wards" });
  }
};
