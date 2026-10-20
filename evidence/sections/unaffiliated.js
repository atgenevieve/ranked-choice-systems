// Number of slates, and candidates outside any slate.
window.SECTIONS.unaffiliated = () => {
  decisionBox(DECISIONS.unaffiliated);
  const D = DATA;
  const toBins = obj => Object.entries(obj).map(([k, v]) => ({ label: k, count: v }));
  {
    const f = figure("Scotland: parties standing in each ward",
      "A typical Scottish ward has 4 to 6 parties standing, plus independents. Earlier runs found the number of slates barely changed results, so the default of 4 stays.",
      "Each bar is the share of Scottish wards (with 3 or more seats) that had that many parties standing. Independents aren't counted as a party.");
    columns(f, toBins(D.parties_per_ward), { xTitle: "Parties standing in the ward", yTitle: "Share of wards", title: "Scottish wards", aria: "Parties standing per Scottish ward" });
  }
  {
    const k = D.candidate_kinds, total = k.running_mate + k.only + k.independent, share = v => pct(v / total);
    const f = figure("Scotland: what kind of candidate is on the ballot",
      `About ${share(k.independent)} of candidates are independents, with no party label. But most party candidates are their party's only candidate in the ward (${share(k.only)} of all candidates). Only ${share(k.running_mate)} have a running mate: another candidate from their own party on the same ballot. That matters for the model, because party loyalty works through running mates: when a voter's first choice is out, a loyal voter moves on to the same party's other candidate. A party's only candidate has no one to pass votes to, so in the model they behave like an independent.`,
      `All ${total.toLocaleString()} candidates in Scottish wards with 3 or more seats, from every election in the data.`);
    stackedBars(f, [{ label: "Scottish candidates", sub: `${total.toLocaleString()} candidates`, values: [k.running_mate, k.only, k.independent] }],
      [{ name: "Has a running mate from the same party", color: "--public" }, { name: "Their party's only candidate in the ward", color: "--c7" }, { name: "Independent (no party)", color: "--ers" }],
      { labelW: 160, aria: "Scottish candidates by kind: with a running mate, a party's only candidate, or independent" });
  }
  {
    const n = Object.values(D.independents_per_ward).reduce((a, b) => a + b, 0), none = D.independents_per_ward["0"];
    const f = figure("Scotland: independents in each ward",
      `${pct(none / n)} of wards have no independents at all. Most of the rest have 1 or 2. So the share of independents varies a lot from ward to ward, even though it averages about 1 in 6 candidates.`,
      `Each bar is the share of Scottish wards (with 3 or more seats) that had that many independent candidates on the ballot.`);
    columns(f, Object.entries(D.independents_per_ward).map(([c, v]) => ({ label: c === "4" ? "4 or more" : c, count: v })),
      { xTitle: "Independent candidates in the ward", yTitle: "Share of wards", title: "Scottish wards", aria: "Number of independent candidates per Scottish ward" });
  }
  {
    const name = u => u.name.includes("Portland") ? (u.name.includes("Mayor") ? "Portland mayor, 2024" : "Portland council, 2024")
      : !u.name.includes("Council") ? "NYC citywide and borough primaries" : `NYC council primaries, ${u.name.slice(4, 8)}`;
    const groups = {};
    for (const u of D.us) { const g = groups[name(u)] ||= { endorsed: 0, all: 0, contests: 0 }; g.endorsed += u.endorsed; g.all += u.candidates; g.contests++; }
    const order = ["NYC council primaries, 2021", "NYC council primaries, 2025", "NYC citywide and borough primaries", "Portland council, 2024", "Portland mayor, 2024"];
    const tot = Object.values(groups).reduce((a, g) => [a[0] + g.endorsed, a[1] + g.all], [0, 0]);
    const f = figure("NYC and Portland: candidates with an organizational endorsement",
      `In nonpartisan US races, most candidates had no endorsement from the organizations we tracked: only ${pct(tot[0] / tot[1])} of candidates had one. Our endorsement lists aren't complete, so this overstates how many candidates truly stood alone.`,
      `Every candidate in contests with 4 or more candidates and at least one tracked endorsement (${D.us.length} contests). Newspaper endorsements don't count here.`);
    stackedBars(f, order.filter(k => groups[k]).map(k => ({ label: k, sub: `${groups[k].all} candidates, ${groups[k].contests} contest${groups[k].contests > 1 ? "s" : ""}`, values: [groups[k].endorsed, groups[k].all - groups[k].endorsed] })),
      [{ name: "Endorsed by a tracked organization", color: "--public" }, { name: "No tracked endorsement", color: "--axis" }],
      { labelW: 260, aria: "Candidates with and without a tracked organizational endorsement, by race type" });
  }
};
