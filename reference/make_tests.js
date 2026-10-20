// Generates the shared test elections and the reference results.
// Usage: node make_tests.js <output folder>
const path = require("path");
const fs = require("fs");
const { electorate, decay } = require("./decay.js");

const out = process.argv[2] || path.join(__dirname, "..", "validation-run");
fs.mkdirSync(out, { recursive: true });

// [candidates, seats] pairs covering few seats, many seats, and nearly everyone winning
const cfgs = [[5, 1], [12, 4], [30, 1], [30, 10], [60, 24], [100, 70], [80, 76], [40, 2]];
for (const [C, S] of cfgs) {
  for (let s = 1; s <= 3; s++) {
    const B = electorate(300, C, 4, 0.08, s * 101 + C);
    const curve = decay(B, C, S);
    const key = `${C}_${S}_${s}`;
    // one voter per line, in the format of docs/ballot-format.md
    fs.writeFileSync(path.join(out, `ballots_${key}.ballots`), `candidates ${C}\nseats ${S}\n` + B.map(r => "1 " + r.join(" ")).join("\n") + "\n");
    fs.writeFileSync(path.join(out, `reference_${key}.txt`), curve.map(x => x.toFixed(9)).join(" "));
  }
}
console.log(`Wrote ${cfgs.length * 3} test elections to ${out}`);
