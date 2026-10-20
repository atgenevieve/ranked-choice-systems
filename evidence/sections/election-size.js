// Election size: candidates, seats, and voters in the real data, next to large organizational elections.
window.SECTIONS["election-size"] = () => {
  decisionBox(DECISIONS["election-size"]);
  const E = DATA.elections, R = DATA.reference;
  const NAMES = { scotland: "Scotland", public: "Other public elections", org: "Other organizational", ers: "Union and society (ERS)", nyc: "NYC primaries", portland: "Portland", act: "Canberra" };
  const ORG = new Set(["ers", "org"]);
  const SHORT = { "Metro DC DSA convention delegates, 2025": "Metro DC DSA, 2025", "Western Australia Legislative Council, 2025": "Western Australia, 2025", "Australian Senate, Tasmania 2016": "Tasmanian Senate, 2016" };
  const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  {
    // Straight-line trend of candidates against seats (least squares), for one group of elections.
    const fit = v => {
      const n = v.length, mx = v.reduce((a, e) => a + e.seats, 0) / n, my = v.reduce((a, e) => a + e.candidates, 0) / n;
      const b = v.reduce((a, e) => a + (e.seats - mx) * (e.candidates - my), 0) / v.reduce((a, e) => a + (e.seats - mx) ** 2, 0);
      return { f: x => my + b * (x - mx), max: Math.max(...v.map(e => e.seats)) };
    };
    const pub = fit(E.filter(e => !ORG.has(e.group))), org = fit(E.filter(e => ORG.has(e.group)));
    const perSeat = (lo, hi) => med(E.filter(e => ORG.has(e.group) && e.seats >= lo && e.seats <= hi).map(e => e.candidates / e.seats));
    const big = perSeat(5, 99), dsa = R.find(r => r.name.startsWith("Metro DC DSA"));
    const f = figure("Seats and candidates: the real data next to a 46-seat election",
      `More seats come with more candidates, but loosely: elections with the same number of seats vary a lot, so the dots scatter widely around the trend lines (which nearly overlap: public and organizational elections grow at about the same rate). Extended out to ${dsa.seats} seats, those trend lines would predict only about ${Math.round(org.f(dsa.seats))} candidates, fewer than there are seats, and far below Metro DC DSA's ${dsa.candidates}. Candidates per seat is a steadier rule. In organizational elections it falls as seats grow: about ${perSeat(1, 1).toFixed(1)} candidates per seat with one seat, ${perSeat(2, 4).toFixed(1)} with 2 to 4 seats, and ${big.toFixed(2)} with 5 or more. At ${big.toFixed(2)} per seat, a ${dsa.seats}-seat election would have about ${Math.round(big * dsa.seats)} candidates; Metro DC DSA had ${dsa.candidates}.`,
      `Each dot is one election in this project's data; every one sits in the bottom-left corner, at most 12 seats and 34 candidates. Each trend line spans only the seats its own elections cover. The black dotted line is ${big.toFixed(2)} candidates per seat, the typical ratio in organizational elections with 5 or more seats (all of them union and society elections). The black markers are reference elections: Metro DC DSA and Western Australia from the research write-up (docs/large-elections.md), and the 2016 Tasmanian Senate count from this project's Senate data, which isn't otherwise on this chart.`);
    legend(f, [["dot", "--public", "Public elections"], ["dot", "--ers", "Organizational elections"], ["dot", "--ink", "Reference elections"],
      ["line", "--public", "Trend, public elections"], ["line", "--ers", "Trend, organizational elections"], ["line", "--ink", `${big.toFixed(2)} candidates per seat`]]);
    scatter(f, {
      aria: "Candidates against seats for every election, with trend lines and large reference elections",
      xMin: 0, xMax: 50, xTicks: [0, 10, 20, 30, 40, 50], yMax: 150, yStep: 25, height: 380,
      xTitle: "Seats", yTitle: "Candidates",
      lines: [
        { from: 1, to: pub.max, f: pub.f, color: "--public" },
        { from: 1, to: org.max, f: org.f, color: "--ers" },
        { from: 0, to: 50, f: x => big * x, color: "--ink", dash: "2 5" },
      ],
      points: [
        ...E.map(e => ({ x: e.seats, y: e.candidates, color: ORG.has(e.group) ? "--ers" : "--public", name: e.name,
          lines: [NAMES[e.group], `${e.seats} seat${e.seats > 1 ? "s" : ""} · ${e.candidates} candidates · ${e.voters.toLocaleString()} voters`] })),
        ...R.map(r => ({ x: r.seats, y: r.candidates, color: "--ink", name: r.name, label: SHORT[r.name] || r.name,
          lines: [`${r.seats} seats · ${r.candidates} candidates${r.voters ? ` · ${r.voters.toLocaleString()} ballots` : ""}`] })),
      ],
    });
  }

  // Ratio charts: one row per group, plus Metro DC DSA's 46-seat count as its own row.
  const order = ["scotland", "act", "ers", "org", "public", "portland", "nyc"].filter(g => E.some(e => e.group === g));
  const dsa = R.find(r => r.name.startsWith("Metro DC DSA"));
  const ratioRows = (fn, cap) => [
    ...order.map(g => {
      const all = E.filter(e => e.group === g).map(fn);
      return { label: NAMES[g], sub: `${all.length} elections`, values: all.map(v => Math.min(v, cap)), median: med(all), color: ORG.has(g) ? "--ers" : "--public" };
    }),
    { label: "Metro DC DSA, 2025", sub: "46 seats", values: [Math.min(fn(dsa), cap)], median: fn(dsa), color: "--ink" },
  ];
  const num = v => Math.round(v).toLocaleString();
  {
    const f = figure("Share of candidates who win",
      "Earlier simulations found the answer depends mostly on the share of candidates who win, once fields are large. Metro DC DSA's count elected 61% of its candidates; Scottish wards elect about half; single-seat races far less.",
      "Seats divided by candidates, for every election in the data. Each row shows how its elections are spread: taller bars where more elections fall, scaled to each row\'s tallest bar; hover for counts. The black line is the median.");
    strips(f, ratioRows(e => e.seats / e.candidates, 1), { min: 0, max: 1, bin: 0.05, ticks: [0, 0.25, 0.5, 0.75, 1], fmt: pct, labelW: 210, xTitle: "Share of candidates who win", aria: "Share of candidates who win, by group" });
  }
  {
    const cap = 1000, perSeat = e => e.voters / e.seats;
    const g = k => med(E.filter(e => e.group === k).map(perSeat));
    const f = figure("Voters per seat",
      `Organizational elections have far fewer voters behind each seat. Metro DC DSA had about ${num(perSeat(dsa))} voters per seat, and union and society elections typically about ${num(g("ers"))}. Scottish wards have about ${num(g("scotland"))}, and big-city races tens of thousands or more. With few voters per seat, a handful of ballots can decide a seat.`,
      `Voters divided by seats. Voters per seat runs from 3 to over a million, so this chart shows 0 to ${cap.toLocaleString()}, where organizational elections sit; elections above that are counted in the last bar. Each row's median is the true one, labeled even when it's off the chart. Each row is scaled to its own tallest bar; hover for counts.`);
    strips(f, ratioRows(perSeat, cap - 0.01), { min: 0, max: cap, bin: 25, ticks: [0, 200, 400, 600, 800, 1000], fmt: num, labelW: 210, xTitle: "Voters per seat", aria: "Voters per seat, by group" });
  }
  {
    const cap = 500, perCand = e => e.voters / e.candidates;
    const g = k => med(E.filter(e => e.group === k).map(perCand));
    const f = figure("Voters per candidate",
      `The same pattern holds per candidate. Metro DC DSA had about ${num(perCand(dsa))} voters for each candidate, union and society elections typically about ${num(g("ers"))}, and Scottish wards about ${num(g("scotland"))}. With so few voters per candidate, many candidates start with only a few first choices.`,
      `Voters divided by candidates. This chart shows 0 to ${cap}; elections above that are counted in the last bar, and each row's median is the true one. Each row is scaled to its own tallest bar; hover for counts.`);
    strips(f, ratioRows(perCand, cap - 0.01), { min: 0, max: cap, bin: 12.5, ticks: [0, 100, 200, 300, 400, 500], fmt: num, labelW: 210, xTitle: "Voters per candidate", aria: "Voters per candidate, by group" });
  }
  {
    const f = figure("Typical size of each group", "Organizational elections are far smaller in voters, which makes each ballot count for more. With 432 ballots for 46 seats, Metro DC DSA's quota was about 10 votes.");
    cards(f, [
      ...order.map(g => {
        const v = E.filter(e => e.group === g);
        const voters = med(v.map(e => e.voters));
        return [NAMES[g], `${med(v.map(e => e.seats))} seat${med(v.map(e => e.seats)) > 1 ? "s" : ""}, ${med(v.map(e => e.candidates))} candidates`,
          `${v.length} elections. Typical voters: ${voters.toLocaleString()}; about ${Math.round(voters / med(v.map(e => e.candidates))).toLocaleString()} per candidate.`];
      }),
      ["Metro DC DSA delegates, 2025", "46 seats, 75 candidates", "432 ballots; about 6 per candidate. Quota about 10 votes."],
    ], "compact");
  }
};
