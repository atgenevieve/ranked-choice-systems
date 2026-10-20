// Overview: the decisions, each linking to its evidence tab.
window.SECTIONS.overview = () => {
  const main = document.getElementById("figs");
  const intro = document.createElement("section"); intro.className = "figure";
  const h = document.createElement("h2"); h.textContent = "Decisions for the voter model";
  const p = document.createElement("p"); p.className = "note";
  p.textContent = "The model decides how simulated voters fill in their ballots. Each decision below has a tab with the evidence from real ballots: about 21 million ballots from Scotland, Canberra, the Australian Senate, NYC, Portland, and PrefLib (including British union and society elections). Approved decisions go into docs/model-spec.md, and only then into the engine. The full write-up is docs/model-review.md.";
  intro.append(h, p); main.append(intro);
  const list = document.createElement("div"); list.className = "overview"; main.append(list);
  for (const [id, d] of Object.entries(DECISIONS)) {
    const box = decisionBox(d);
    const b = document.createElement("button"); b.type = "button"; b.className = "link"; b.textContent = "See the evidence";
    b.addEventListener("click", () => showTab(id));
    box.append(b);
    list.append(box);
  }
};
