// Election size: candidates, seats, and voters in the real data, next to large organizational elections.
window.SECTIONS["election-size"] = () => {
  decisionBox(DECISIONS["election-size"]);
  const E = DATA.elections, R = DATA.reference;
  const NAMES = { scotland: "Scotland", public: "Other public elections", org: "Other organizational", ers: "Union and society (ERS)", nyc: "NYC primaries", portland: "Portland", act: "Canberra" };
  const ORG = new Set(["ers", "org"]);
  const SHORT = { "Metro DC DSA convention delegates, 2025": "Metro DC DSA, 2025", "Western Australia Legislative Council, 2025": "Western Australia, 2025", "Australian Senate, Tasmania 2016": "Tasmanian Senate, 2016" };
  const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  // Straight-line trend of candidates against seats (least squares), for one group of elections.
  const fit = v => {
    const n = v.length, mx = v.reduce((a, e) => a + e.seats, 0) / n, my = v.reduce((a, e) => a + e.candidates, 0) / n;
    const b = v.reduce((a, e) => a + (e.seats - mx) * (e.candidates - my), 0) / v.reduce((a, e) => a + (e.seats - mx) ** 2, 0);
    return { f: x => my + b * (x - mx), slope: b, max: Math.max(...v.map(e => e.seats)), n };
  };
  const pub = fit(E.filter(e => !ORG.has(e.group))), org = fit(E.filter(e => ORG.has(e.group)));
  const dsa = R.find(r => r.name.startsWith("Metro DC DSA"));
  const dot = e => ({ x: e.seats, y: e.candidates, color: ORG.has(e.group) ? "--ers" : "--public", name: e.name,
    lines: [NAMES[e.group], `${e.seats} seat${e.seats > 1 ? "s" : ""} · ${e.candidates} candidates · ${e.voters.toLocaleString()} voters`] });
  {
    const f = figure("A 46-seat election is far outside the real data",
      `Every election in the data has at most ${Math.max(...E.map(e => e.seats))} seats and ${Math.max(...E.map(e => e.candidates))} candidates, so they all sit in the bottom-left corner. Metro DC DSA's delegate election, with ${dsa.seats} seats and ${dsa.candidates} candidates, is far beyond them. Results for elections that size are projections, whichever way the model is tuned.`,
      "Each small dot is one election in this project's data. The purple dots are large reference elections: Metro DC DSA and Western Australia from the research write-up (docs/large-elections.md), and the 2016 Tasmanian Senate count from this project's Senate data.");
    legend(f, [["dot", "--public", "Public elections"], ["dot", "--ers", "Organizational elections"], ["dot", "--c7", "Large reference elections"]]);
    scatter(f, {
      aria: "Candidates against seats for every election, with large reference elections",
      xMin: 0, xMax: 50, xTicks: [0, 10, 20, 30, 40, 50], yMax: 150, yStep: 25, xTitle: "Seats", yTitle: "Candidates", lines: [],
      points: [...E.map(dot), ...R.map(r => ({ x: r.seats, y: r.candidates, color: "--c7", name: r.name, label: SHORT[r.name] || r.name,
        lines: [`${r.seats} seats · ${r.candidates} candidates${r.voters ? ` · ${r.voters.toLocaleString()} ballots` : ""}`] }))],
    });
  }
  {
    const per = g => g.slope.toFixed(1);
    const f = figure("Within the real data: more seats, somewhat more candidates",
      `On average, each extra seat brings about ${per(org)} more candidates, in public and organizational elections alike: the two trend lines nearly overlap. But the link is loose. Elections with the same number of seats vary a lot, from a few candidates to over 30, so the dots scatter widely around the lines. If you stretched these lines out to ${dsa.seats} seats, they'd predict only about ${Math.round(org.f(dsa.seats))} candidates, fewer than there are seats. Metro DC DSA had ${dsa.candidates}, so a straight line is the wrong rule for large elections.`,
      `The same elections as above, zoomed in to 0 to ${org.max} seats. Each trend line is the straight line that best fits its group's dots, drawn across only the seats that group covers: public elections up to ${pub.max} seats, organizational up to ${org.max}.`);
    legend(f, [["line", "--public", `Public trend: about ${per(pub)} more candidates per extra seat (${pub.n.toLocaleString()} elections)`], ["line", "--ers", `Organizational trend: about ${per(org)} more candidates per extra seat (${org.n} elections)`]]);
    scatter(f, {
      aria: "Candidates against seats in the real data, with a trend line for public and for organizational elections",
      xMin: 0, xMax: org.max, xTicks: Array.from({ length: org.max + 1 }, (_, i) => i).filter(i => i % 2 === 0), yMax: 35, yStep: 5,
      xTitle: "Seats", yTitle: "Candidates",
      lines: [{ from: 1, to: pub.max, f: pub.f, color: "--public" }, { from: 1, to: org.max, f: org.f, color: "--ers" }],
      points: E.map(dot),
    });
  }
  {
    const els = (lo, hi) => E.filter(e => ORG.has(e.group) && e.seats >= lo && e.seats <= hi);
    const row = (label, v) => ({ label: `${label} (${v.length})`, values: [med(v.map(e => e.candidates / e.seats))] });
    const rows = [row("1 seat", els(1, 1)), row("2 to 4 seats", els(2, 4)), row("5 to 12 seats", els(5, 99)),
      { label: `Metro DC DSA, ${dsa.seats} seats`, values: [dsa.candidates / dsa.seats] }];
    const big = rows[2].values[0];
    const f = figure("A better rule for large elections: candidates per seat",
      `In organizational elections, the number of candidates for each seat falls as seats grow: about ${rows[0].values[0].toFixed(1)} with one seat, ${rows[1].values[0].toFixed(1)} with 2 to 4 seats, and ${big.toFixed(2)} with 5 to 12. Metro DC DSA's ${dsa.seats}-seat election had ${(dsa.candidates / dsa.seats).toFixed(2)}, almost exactly the same as the largest elections in the data. At ${big.toFixed(2)} candidates per seat, a ${dsa.seats}-seat election would have about ${Math.round(big * dsa.seats)} candidates; Metro DC DSA had ${dsa.candidates}.`,
      "Candidates divided by seats, typical (median) election in each group of organizational elections in the data, with the number of elections in brackets. All the elections with 5 or more seats are union and society elections.");
    hbars(f, rows, [{ name: "Candidates per seat", color: "--ers" }], { max: 6, step: 1, labelW: 200, fmt: v => String(+(+v).toFixed(2)), aria: "Candidates per seat in organizational elections, by number of seats, with Metro DC DSA" });
  }
  // Ratio charts: one row per group, plus Metro DC DSA's 46-seat count as its own row.
  const order = ["scotland", "act", "ers", "org", "public", "portland", "nyc"].filter(g => E.some(e => e.group === g));
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
    const perSeat = e => e.voters / e.seats, perCand = e => e.voters / e.candidates;
    const rows = order.map(g => { const v = E.filter(e => e.group === g); return { label: NAMES[g], values: [med(v.map(perSeat)), med(v.map(perCand))] }; })
      .sort((a, b) => b.values[0] - a.values[0]);
    rows.push({ label: "Metro DC DSA, 2025", values: [perSeat(dsa), perCand(dsa)] });
    const g = k => rows.find(r => r.label === NAMES[k]).values;
    const f = figure("Voters per seat and per candidate",
      `Organizational elections have far fewer voters behind each seat and each candidate. Metro DC DSA had about ${num(perSeat(dsa))} voters per seat and ${num(perCand(dsa))} per candidate. Union and society elections typically have about ${num(g("ers")[0])} per seat, Scottish wards about ${num(g("scotland")[0])}, and big-city races tens of thousands. With so few voters per seat, a handful of ballots can decide a seat, and many candidates start with only a few first choices.`,
      "The typical (median) election in each group: voters divided by seats, and voters divided by candidates. The organizational bars are too short to see next to the big public elections; the numbers beside them give the values.");
    hbars(f, rows, [{ name: "Voters per seat", color: "--public" }, { name: "Voters per candidate", color: "--ers" }],
      { max: 30000, step: 10000, labelW: 200, fmt: num, aria: "Typical voters per seat and per candidate, by group" });
  }
  {
    const f = figure("Typical size of each group", "Organizational elections are far smaller in voters, which makes each ballot count for more. With 432 ballots for 46 seats, Metro DC DSA's quota was about 10 votes.");
    cards(f, [
      ...order.map(g => {
        const v = E.filter(e => e.group === g);
        const voters = med(v.map(e => e.voters));
        return [NAMES[g], `${med(v.map(e => e.seats))} seat${med(v.map(e => e.seats)) > 1 ? "s" : ""}, ${med(v.map(e => e.candidates))} candidates`,
          `${v.length} elections. Typical voters: ${voters.toLocaleString()}.`];
      }),
      ["Metro DC DSA delegates, 2025", "46 seats, 75 candidates", "432 ballots. Quota about 10 votes."],
    ], "compact");
  }
};
