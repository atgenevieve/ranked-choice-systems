// Slate loyalty: how strongly voters rank their own group's candidates together, and where votes go when they leave it.
window.SECTIONS["slate-loyalty"] = () => {
  decisionBox(DECISIONS["slate-loyalty"]);
  const D = DATA, pts = x => +(x * 100).toFixed(1);
  const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const wardExcess = D.wards.filter(w => w.popularity != null).map(w => pts(w.observed - w.popularity));

  {
    const f = figure("How strongly voters stick to a group",
      `Parties printed on the ballot are in a different league: in a typical Scottish ward, voters' second choices go to a running mate about ${med(wardExcess).toFixed(0)} points more often than popularity alone predicts. Endorsement slates, candidate pacts, and newspaper picks typically add only 4 to 14 points, with wide ranges.`,
      "Clustering strength: of voters whose first choice is in the group and who ranked a second, the share whose second choice is also in the group, minus the share expected if second choices followed popularity alone, in percentage points. Each row shows how its values are spread: taller bars where more wards (Scottish parties) or groupings (the other rows) fall. Bars are 2 points wide and scaled to each row\'s tallest bar; hover for counts. Pairs found only in ballots were picked for being strong, so they start at +10.");
    const T = D.types;
    strips(f, [
      { label: "Scottish parties", sub: `${wardExcess.length} wards`, values: wardExcess, color: "--scotland" },
      { label: "Endorsing organizations", sub: `${T["Endorsing organization"].length} groupings`, values: T["Endorsing organization"] },
      { label: "Candidate pacts", sub: `${T["Candidate pact"].length} groupings`, values: T["Candidate pact"] },
      { label: "Newspapers", sub: `${T["Newspaper"].length} groupings`, values: T["Newspaper"] },
      { label: "Pairs found only in ballots", sub: `${T["Found only in ballots"].length} pairs`, values: T["Found only in ballots"] },
    ], { min: -20, max: 80, bin: 2, ticks: [-20, 0, 20, 40, 60, 80], fmt: v => (v > 0 ? "+" : "") + v, xTitle: "Points above popularity alone", aria: "Clustering strength by type of grouping" });
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
    const E = DATA.evenness_by_party;
    const order = ["SNP", "Labour", "Conservative", "Liberal Democrats", "Greens"].filter(k => E[k]);
    const colors = ["--public", "--ers", "--scotland", "--c4", "--c5"];
    const f = figure("How evenly each party's departing votes spread",
      "For every party, most wards score between 0.75 and 0.95: departing second choices spread across several parties. Conservative voters are the least even, leaning toward Labour and the Liberal Democrats; Labour and Liberal Democrat voters spread the most evenly.",
      "Evenness of second choices that leave the first choice's party, ward by ward, for each party's voters. 1 means the departing second choices split perfectly evenly over every other party's candidates; lower means they lean toward fewer candidates. Each line shows how that party's wards are spread, as the share of its wards per 0.01 of evenness, smoothed. Hover to read every party at one point.");
    densityLines(f, order.map((k, i) => ({ name: k, color: colors[i], values: E[k] })), {
      min: 0.2, max: 1, bw: 0.015, per: 0.01, xTicks: [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1], xFmt: v => v.toFixed(1),
      xTitle: "Evenness", yTitle: "Share of the party's wards, per 0.01", aria: "Distribution of cross-party evenness by party",
    });
  }
  {
    const cols = D.flow_columns, keep = cols.map((c, j) => j).filter(j => cols[j] !== "Ranked no one else");
    const colors = ["--public", "--ers", "--scotland", "--c4", "--c5", "--c6", "--c7"];
    const series = keep.map((j, k) => ({ name: cols[j], color: colors[k] }));
    const ev = [...D.cross_party_evenness].sort((a, b) => a - b), evMed = ev[Math.floor(ev.length / 2)];
    const f = figure("Where each party's departing votes go",
      "When a Scottish voter's second choice isn't a running mate, it usually spreads across several other parties, not mainly to one neighbor. The Greens are the exception: about half their departing second choices go to the SNP. One loyalty number on a line of slates can't produce strong loyalty and a wide spread at the same time, which is why the proposal uses two settings.",
      `Second choices that went to a different party, by the first choice's party, pooled over every Scottish ward where that party ran 2 or more candidates. Each bar adds to 100%. Voters who stayed with their own party, or ranked no one else, are left out (they're in the grid above). Measured ward by ward, these spreads score a typical ${evMed.toFixed(2)} for evenness, where 1 would be a perfectly even split across the other candidates.`);
    const rows = D.flows.map(r => {
      const own = cols.indexOf(r.first);
      return { label: r.first, values: keep.map(j => j === own ? 0 : r.shares[j]) };
    });
    stackedBars(f, rows, series, { labelW: 150, aria: "Where second choices go when they leave the first choice's party, by party" });
  }
};
