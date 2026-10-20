// Slate sizes: how many candidates each group runs, against how much support it has.
window.SECTIONS["slate-sizes"] = () => {
  decisionBox(DECISIONS["slate-sizes"]);
  const D = DATA;
  {
    const f = figure("Scotland: share of candidates against share of first choices",
      "Big parties run fewer candidates than their support would suggest, and small parties and independents run more. The SNP has about a third of first choices but under a quarter of candidates.",
      `Pooled over ${D.wards.toLocaleString()} Scottish wards with 3 or more seats. Share of candidates is each party's share of all candidates; share of first choices is its average share of each ward's first choices.`);
    hbars(f, D.pooled.map(p => ({ label: p.party, values: [p.cand_share, p.vote_share] })),
      [{ name: "Share of candidates", color: "--public" }, { name: "Share of first choices", color: "--ers" }],
      { labelW: 150, max: 0.4, step: 0.1, aria: "Share of candidates against share of first choices, by party" });
  }
  {
    const f = figure("Ward by ward",
      "Ward by ward, the same pattern: where a big party has a large share of first choices, its share of candidates stays lower. Points below the line run fewer candidates than their support; points above run more.",
      "Each dot is one party in one ward. Across: the party's share of the ward's first choices. Up: its share of the ward's candidates. The diagonal is proportional: candidates in the same share as support.");
    const box = document.createElement("div"); box.className = "multiples"; f.append(box);
    for (const [party, rows] of Object.entries(D.per_ward)) {
      const panel = document.createElement("div"); panel.className = "panel";
      const h = document.createElement("h3"); h.textContent = party;
      const m = document.createElement("div"); m.className = "meta"; m.textContent = `${rows.length} wards`;
      panel.append(h, m); box.append(panel);
      scatter(panel, {
        aria: `${party}: share of candidates against share of first choices, by ward`,
        height: 230, xMin: 0, xMax: 0.7, xTicks: [0, 0.2, 0.4, 0.6], xFmt: pct, yMax: 0.7, yStep: 0.2, yFmt: pct,
        xTitle: "Share of first choices", yTitle: "Share of candidates",
        lines: [{ from: 0, to: 0.7, f: x => x, color: "--axis" }],
        points: rows.map(r => ({ x: r.vote_share, y: r.cand_share, color: "--bar", name: r.name,
          lines: [`${party}: ${r.candidates} of ${r.ward_candidates} candidates (${pct(r.cand_share)})`, `${pct(r.vote_share)} of first choices`] })),
      });
    }
  }
};
