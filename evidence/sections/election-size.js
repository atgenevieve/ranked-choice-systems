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
    // Typical candidates per seat at each number of seats: a line through the medians, across only
    // the seats each group covers. Sparse seat counts are pooled so each point has a few elections.
    const BINS = { org: [[1, 1], [2, 2], [3, 3], [4, 4], [5, 6], [7, 9], [10, 12]], pub: [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5]] };
    const medLine = (els, bins) => {
      const pts = bins.map(([lo, hi]) => { const v = els.filter(e => e.seats >= lo && e.seats <= hi); return v.length ? [(lo + hi) / 2, med(v.map(e => e.candidates / e.seats))] : null; }).filter(Boolean);
      return { from: pts[0][0], to: pts[pts.length - 1][0], pts,
        f: x => { let k = 0; while (k < pts.length - 2 && x > pts[k + 1][0]) k++; const [x0, y0] = pts[k], [x1, y1] = pts[k + 1]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); } };
    };
    const orgL = medLine(E.filter(e => ORG.has(e.group)), BINS.org), pubL = medLine(E.filter(e => !ORG.has(e.group)), BINS.pub);
    const at = (L, x) => L.pts.find(p => p[0] === x)[1];
    const ratio = dsa.candidates / dsa.seats, capY = 12, over = E.filter(e => e.candidates / e.seats > capY).length, DSA_X = 13.5;
    const f = figure("Candidates per seat: the more seats, the fewer candidates for each",
      `This is the clearest pattern in the data. A typical single-seat election has ${at(orgL, 1).toFixed(0)} candidates (organizational) or ${at(pubL, 1).toFixed(0)} (public) for the one seat. As seats grow, candidates per seat falls fast, then levels off: about ${at(orgL, 2).toFixed(1)} with 2 seats, ${at(orgL, 4).toFixed(1)} with 4, and between 1 and 2 in organizational elections with 5 to 12 seats. Metro DC DSA's ${dsa.seats}-seat election had ${ratio.toFixed(2)} candidates per seat, in that same range. The public line rises at 5 seats because those are mostly Canberra's crowded fields. So for a ${dsa.seats}-seat election, expect roughly 1.5 to 2 candidates per seat: about ${Math.round(1.5 * dsa.seats)} to ${Math.round(2 * dsa.seats)} candidates.`,
      `Each dot is one election: its candidates divided by its seats. Dots are spread slightly sideways so they don't hide each other. The lines join the typical (median) election at each number of seats, across only the seats each group covers; organizational elections with 5 to 6, 7 to 9, and 10 to 12 seats are pooled. ${over} elections with more than ${capY} candidates per seat are drawn at the top edge. The axis skips from 12 seats to ${dsa.seats} for Metro DC DSA. Candidates per seat is the flip side of the share of candidates who win, charted further down: 2 candidates per seat means half the candidates win.`);
    legend(f, [["dot", "--public", "Public elections"], ["dot", "--ers", "Organizational elections"], ["dot", "--c7", `Metro DC DSA, ${dsa.seats} seats`],
      ["line", "--public", "Typical public election"], ["line", "--ers", "Typical organizational election"]]);
    const jitter = i => ((i * 0.618034) % 1 - 0.5) * 0.36;
    scatter(f, {
      aria: "Candidates per seat against number of seats, with typical lines and Metro DC DSA",
      xMin: 0, xMax: 14, xTicks: [0, 2, 4, 6, 8, 10, 12, DSA_X], xFmt: v => v === DSA_X ? `${dsa.seats}` : String(v), yMax: capY, yStep: 2,
      xTitle: "Seats", yTitle: "Candidates per seat",
      lines: [{ from: pubL.from, to: pubL.to, f: pubL.f, color: "--public" }, { from: orgL.from, to: orgL.to, f: orgL.f, color: "--ers" }],
      points: [
        ...E.map((e, i) => ({ x: e.seats + jitter(i), y: Math.min(e.candidates / e.seats, capY), color: ORG.has(e.group) ? "--ers" : "--public", name: e.name,
          lines: [NAMES[e.group], `${e.seats} seat${e.seats > 1 ? "s" : ""} · ${e.candidates} candidates · ${(e.candidates / e.seats).toFixed(2)} per seat`] })),
        { x: DSA_X, y: ratio, color: "--c7", name: dsa.name, lines: [`${dsa.seats} seats · ${dsa.candidates} candidates · ${ratio.toFixed(2)} per seat`] },
      ],
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
    const f = figure("Voters: no link to seats or candidates, but a very different scale",
      `The number of voters has almost nothing to do with the number of seats or candidates in organizational elections: big and small electorates run similar fields. What differs is scale. Organizational elections have far fewer voters behind each seat and each candidate. Metro DC DSA had about ${num(perSeat(dsa))} voters per seat and ${num(perCand(dsa))} per candidate. Union and society elections typically have about ${num(g("ers")[0])} per seat, Scottish wards about ${num(g("scotland")[0])}, and big-city races tens of thousands. With so few voters per seat, a handful of ballots can decide a seat, and many candidates start with only a few first choices.`,
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
          `${v.length} elections. About ${med(v.map(e => e.candidates / e.seats)).toFixed(1)} candidates per seat; typical voters ${voters.toLocaleString()}, about ${num(med(v.map(e => e.voters / e.seats)))} per seat.`];
      }),
      ["Metro DC DSA delegates, 2025", "46 seats, 75 candidates", "1.63 candidates per seat; 432 ballots, about 9 per seat. Quota about 10 votes."],
    ], "compact");
  }
};
