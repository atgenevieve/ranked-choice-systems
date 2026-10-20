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
      `More seats come with more candidates, but loosely: elections with the same number of seats vary a lot, so the dots scatter widely around the trend lines (which nearly overlap: public and organizational elections grow at about the same rate). Extended to ${dsa.seats} seats, the straight trend lines predict only about ${Math.round(org.f(dsa.seats))} candidates, fewer than there are seats, and far below Metro DC DSA's ${dsa.candidates}. Candidates per seat is a steadier rule. In organizational elections it falls as seats grow: about ${perSeat(1, 1).toFixed(1)} candidates per seat with one seat, ${perSeat(2, 4).toFixed(1)} with 2 to 4 seats, and ${big.toFixed(2)} with 5 or more. At ${big.toFixed(2)} per seat, a ${dsa.seats}-seat election would have about ${Math.round(big * dsa.seats)} candidates; Metro DC DSA had ${dsa.candidates}.`,
      `Each dot is one election in this project's data; every one sits in the bottom-left corner, at most 12 seats and 34 candidates. Trend lines are solid across the seats the data covers and dashed beyond it, where they're projections. The black dotted line is ${big.toFixed(2)} candidates per seat, the typical ratio in organizational elections with 5 or more seats (all of them union and society elections). The black markers are reference elections: Metro DC DSA and Western Australia from the research write-up (docs/large-elections.md), and the 2016 Tasmanian Senate count from this project's Senate data, which isn't otherwise on this chart.`);
    legend(f, [["dot", "--public", "Public elections"], ["dot", "--ers", "Organizational elections"], ["dot", "--ink", "Reference elections"],
      ["line", "--public", "Trend, public elections"], ["line", "--ers", "Trend, organizational elections"], ["line", "--ink", `${big.toFixed(2)} candidates per seat`]]);
    scatter(f, {
      aria: "Candidates against seats for every election, with trend lines and large reference elections",
      xMin: 0, xMax: 50, xTicks: [0, 10, 20, 30, 40, 50], yMax: 150, yStep: 25, height: 380,
      xTitle: "Seats", yTitle: "Candidates",
      lines: [
        { from: 1, to: pub.max, f: pub.f, color: "--public" }, { from: pub.max, to: 50, f: pub.f, color: "--public", dash: "7 6" },
        { from: 1, to: org.max, f: org.f, color: "--ers" }, { from: org.max, to: 50, f: org.f, color: "--ers", dash: "7 6" },
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

  {
    const f = figure("Share of candidates who win",
      "Earlier simulations found the answer depends mostly on the share of candidates who win, once fields are large. Metro DC DSA's count elected 61% of its candidates; Scottish wards elect about half; single-seat races far less.",
      "Seats divided by candidates, for every election in the data. Each row shows how its elections are spread: taller bars where more elections fall, scaled to each row\'s tallest bar; hover for counts. The black line is the median.");
    const order = ["scotland", "act", "ers", "org", "public", "portland", "nyc"];
    strips(f, order.filter(g => E.some(e => e.group === g)).map(g => {
      const v = E.filter(e => e.group === g).map(e => e.seats / e.candidates);
      return { label: NAMES[g], sub: `${v.length} elections`, values: v, color: ORG.has(g) ? "--ers" : "--public" };
    }), { min: 0, max: 1, bin: 0.05, ticks: [0, 0.25, 0.5, 0.75, 1], fmt: pct, xTitle: "Share of candidates who win", aria: "Share of candidates who win, by group" });
  }
  {
    const f = figure("Typical size of each group", "Organizational elections are far smaller in voters, which makes each ballot count for more. With 432 ballots for 46 seats, Metro DC DSA's quota was about 10 votes.");
    const order = ["scotland", "act", "ers", "org", "public", "portland", "nyc"].filter(g => E.some(e => e.group === g));
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
