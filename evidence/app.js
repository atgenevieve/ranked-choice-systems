// Tabs: each tab has a script in sections/ and, except the overview, a data file in data/.
const SECTIONS = window.SECTIONS;
const TABS = [
  ["overview", "Overview"],
  ["ballot-length", "Ballot length"],
  ["slate-loyalty", "Slate loyalty"],
  ["popularity", "Candidate popularity"],
  ["slate-sizes", "Slate sizes"],
  ["unaffiliated", "Slates and unaffiliated candidates"],
  ["election-size", "Election size"],
];
const cache = {};
let current = null;

async function showTab(id, focus) {
  if (!SECTIONS[id]) id = "overview";
  current = id;
  for (const b of document.querySelectorAll(".tabs button")) b.setAttribute("aria-selected", String(b.dataset.id === id));
  const main = document.getElementById("figs");
  main.replaceChildren();
  const loading = document.createElement("p"); loading.className = "loading"; loading.textContent = "Loading…"; main.append(loading);
  draws = [];
  DATA = null;
  if (id !== "overview") {
    try {
      if (!cache[id]) cache[id] = await (await fetch(`data/${id}.json`)).text();
      DATA = JSON.parse(cache[id]);   // a fresh copy each time, since tabs may reshape their data
    } catch (e) {
      loading.textContent = "Couldn't load this tab's data. Reload the page to try again.";
      return;
    }
  }
  if (current !== id) return;
  main.replaceChildren();
  SECTIONS[id]();
  drawAll();
  if (focus) document.querySelector(`.tabs button[data-id="${id}"]`).focus();
  window.scrollTo({ top: 0 });
}

const drawAll = () => { hideTip(); for (const d of draws) d(); };

(function init() {
  const nav = document.getElementById("tablist");
  for (const [id, label] of TABS) {
    const b = document.createElement("button");
    b.type = "button"; b.role = "tab"; b.dataset.id = id; b.textContent = label;
    b.addEventListener("click", () => showTab(id));
    nav.append(b);
  }
  nav.addEventListener("keydown", e => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = TABS.findIndex(t => t[0] === current), j = (i + (e.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length;
    showTab(TABS[j][0], true);
  });
  const fromHash = (location.hash || "").slice(1);
  showTab(TABS.some(t => t[0] === fromHash) ? fromHash : "overview");
  let rt = null;
  new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(drawAll, 60); }).observe(document.getElementById("figs"));
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", drawAll);
  new MutationObserver(drawAll).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
})();
