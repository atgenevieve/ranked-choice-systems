// Slate loyalty: how strongly voters rank their own group's candidates together, and where votes go when they leave it.
window.SECTIONS["slate-loyalty"] = () => {
  decisionBox(DECISIONS["slate-loyalty"]);
  const D = DATA, pts = x => +(x * 100).toFixed(1);
  const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const wardExcess = D.wards.filter(w => w.popularity != null).map(w => pts(w.observed - w.popularity));

  {
    const f = figure("How strongly voters stick to a group",
      `Parties printed on the ballot are in a different league: in a typical Scottish ward, voters' second choices go to a running mate about ${med(wardExcess).toFixed(0)} points more often than popularity alone predicts. Endorsement slates, candidate pacts, and newspaper picks typically add only 4 to 14 points, with wide ranges.`,
      "Clustering strength: of voters whose first choice is in the group and who ranked a second, the share whose second choice is also in the group, minus the share expected if second choices followed popularity alone, in percentage points. Each dot is one ward (Scottish parties) or one grouping in one race (the other rows). Pairs found only in ballots were picked for being strong, so they start at +10.");
    const T = D.types;
    strips(f, [
      { label: "Scottish parties", sub: `${wardExcess.length} wards`, values: wardExcess, color: "--scotland" },
      { label: "Endorsing organizations", sub: `${T["Endorsing organization"].length} groupings`, values: T["Endorsing organization"] },
      { label: "Candidate pacts", sub: `${T["Candidate pact"].length} groupings`, values: T["Candidate pact"] },
      { label: "Newspapers", sub: `${T["Newspaper"].length} groupings`, values: T["Newspaper"] },
      { label: "Pairs found only in ballots", sub: `${T["Found only in ballots"].length} pairs`, values: T["Found only in ballots"] },
    ], { min: -20, max: 80, ticks: [-20, 0, 20, 40, 60, 80], fmt: v => (v > 0 ? "+" : "") + v, xTitle: "Points above popularity alone", aria: "Clustering strength by type of grouping" });
    const p = document.createElement("p"); p.className = "note";
    p.textContent = "These are associations, not effects: a strong grouping shows voters treated the candidates as belonging together, not that an endorsement caused it. Every grouping, by name, is on the separate clustering-strength page.";
    f.append(p);
  }

  {
    const f = figure("Observed, against popularity alone and random",
      "Comparing with popularity alone matters: much of what looks like loyalty to an endorsement slate is just its candidates being popular. Scottish parties stay far above popularity; endorsement slates sit only a little above it.",
      "Typical election in each group. Random means second choices spread evenly over the other candidates. Popularity alone means second choices follow each candidate's share of first choices.");
    const byGroup = g => D.endorsement.filter(e => e.group === g);
    const row = (label, list) => ({ label, values: [med(list.map(x => x.observed)), med(list.map(x => x.popularity)), med(list.map(x => x.random))] });
    hbars(f, [row("Scottish parties", D.wards.filter(w => w.popularity != null)), row("Portland endorsement slates", byGroup("portland")), row("NYC endorsement slates", byGroup("nyc"))],
      [{ name: "Observed", color: "--public" }, { name: "Popularity alone", color: "--ers" }, { name: "Random", color: "--org" }],
      { labelW: 190, aria: "Observed cohesion against popularity alone and random, by group" });
  }

  {
    const f = figure("Scotland: where second choices go",
      "Voters mostly stay with their party, then spread across the others, with some lopsided pairs: Greens send far more to the SNP than the SNP sends back.",
      "Pooled over every Scottish ward where the first choice's party ran 2 or more candidates. Rows are the first choice's party; each row adds to 100%. The outlined cell is the same party.");
    const cols = D.flow_columns;
    heatmap(f, D.flows.map(r => `${r.first} (${r.voters.toLocaleString()} voters)`), cols, D.flows.map(r => r.shares),
      { corner: "First choice → second choice", highlight: (i, j) => cols[j] === D.flows[i].first });
  }

  {
    const f = figure("Once votes leave a party, they spread widely",
      "When a Scottish voter's second choice isn't a running mate, it spreads fairly evenly over the other parties' candidates, not mainly to one neighbor. One loyalty number on a line of slates can't produce strong loyalty and a wide spread at the same time, which is why the proposal uses two settings.",
      "Evenness of second choices that go outside the first choice's party, per ward: 1 means spread perfectly evenly over the other candidates, 0 means all to one. Weighted across each ward's candidates.");
    columns(f, binValues(D.cross_party_evenness, 0, 1, 0.1, v => v.toFixed(1)), { xTitle: "Evenness of second choices outside the party", title: "Scottish wards", aria: "Histogram of cross-party evenness in Scottish wards" });
  }
};
