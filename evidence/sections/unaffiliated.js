// Number of slates, and candidates outside any slate.
window.SECTIONS.unaffiliated = () => {
  decisionBox(DECISIONS.unaffiliated);
  const D = DATA;
  const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const toBins = obj => Object.entries(obj).map(([k, v]) => ({ label: k, count: v }));
  {
    const f = figure("Scotland: parties standing in each ward",
      "A typical Scottish ward has 4 to 6 parties standing, plus independents. Earlier runs found the number of slates barely changed results, so the default of 4 stays.",
      "Scottish wards with 3 or more seats. Independents aren't counted as a party.");
    columns(f, toBins(D.parties_per_ward), { xTitle: "Parties standing", title: "Scottish wards", aria: "Parties standing per Scottish ward" });
  }
  {
    const f = figure("Scotland: parties running 2 or more candidates",
      "Only those parties can show loyalty between running mates. Many wards have one or two such parties; some have none.",
      "Scottish wards with 3 or more seats.");
    columns(f, toBins(D.parties_with_running_mates), { xTitle: "Parties with 2 or more candidates", title: "Scottish wards", aria: "Parties with running mates per Scottish ward" });
  }
  {
    const f = figure("Scotland: share of candidates who are independents",
      `In a typical ward, about ${pct(med(D.independent_share))} of candidates belong to no party. The proposal adds a share of candidates outside any slate, about 15% by default.`,
      "Share of each ward's candidates with no party label.");
    columns(f, binValues(D.independent_share, 0, 1, 0.1, v => pct(v)), { xTitle: "Share of candidates who are independents", title: "Scottish wards", aria: "Share of independent candidates per Scottish ward" });
  }
  {
    const f = figure("NYC and Portland: candidates with no organizational endorsement",
      "In nonpartisan US races, most candidates had no endorsement from the organizations we tracked. Our slate lists aren't complete, so this overstates how many candidates truly stood alone.",
      `Contests with 4 or more candidates and at least one tracked endorsement (${D.us.length} contests). Newspapers don't count as endorsements here.`);
    columns(f, binValues(D.us.map(u => u.unendorsed_share), 0, 1, 0.1, v => pct(v)), { xTitle: "Share of candidates with no tracked organizational endorsement", title: "NYC and Portland contests", aria: "Share of unendorsed candidates per contest" });
  }
};
