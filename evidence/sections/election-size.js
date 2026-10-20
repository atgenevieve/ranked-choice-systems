// Election size: candidates, seats, and voters in the real data, next to large organizational elections.
window.SECTIONS["election-size"] = () => {
  decisionBox(DECISIONS["election-size"]);
  const E = DATA.elections, R = DATA.reference;
  const NAMES = { scotland: "Scotland", public: "Other public elections", org: "Other organizational", ers: "Union and society (ERS)", nyc: "NYC primaries", portland: "Portland", act: "Canberra" };
  const ORG = new Set(["ers", "org"]);
  const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  {
    const f = figure("Seats and candidates: the real data next to a 46-seat election",
      "Every election in the data sits in the corner: at most 12 seats and 34 candidates. Metro DC DSA's 46-seat delegate count, with 75 candidates, is far outside it. Results for elections that size are projections, whichever way the model is tuned.",
      "Each dot is one election in this project's data. The black markers are reference elections: Metro DC DSA and Western Australia from the research write-up (docs/large-elections.md), and the 2016 Tasmanian Senate count from this project's Senate data, which isn't otherwise on this chart.");
    legend(f, [["dot", "--public", "Public elections"], ["dot", "--ers", "Organizational elections"], ["dot", "--ink", "Reference elections"]]);
    scatter(f, {
      aria: "Candidates against seats for every election, with large reference elections",
      xMin: 0, xMax: 50, xTicks: [0, 10, 20, 30, 40, 50], yMax: 150, yStep: 25,
      xTitle: "Seats", yTitle: "Candidates", lines: [],
      points: [
        ...E.map(e => ({ x: e.seats, y: e.candidates, color: ORG.has(e.group) ? "--ers" : "--public", name: e.name,
          lines: [NAMES[e.group], `${e.seats} seat${e.seats > 1 ? "s" : ""} · ${e.candidates} candidates · ${e.voters.toLocaleString()} voters`] })),
        ...R.map(r => ({ x: r.seats, y: r.candidates, color: "--ink", name: r.name, label: r.name.replace(/ \(in this project's data\)/, ""),
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
