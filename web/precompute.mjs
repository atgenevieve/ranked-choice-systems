// Runs the engine once for every public preset election with the default settings and saves each
// simulated election's record, so the web page can play the presets back (ballots flying into
// the charts) without running the engine. When a visitor's settings match a preset's, the page
// uses the saved records; otherwise it runs the engine in their browser.
//
//     node web/precompute.mjs <stvsim.wasm> <reference.json> <out folder>
//
// Writes <out>/meta.json (versions, the slate curves, and each preset's settings key) and
// <out>/<preset>.json (that preset's records, in election order). The engine is the same
// WebAssembly file the page runs, so a saved record is exactly what the visitor's browser would
// compute. Runs on every processor core.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { availableParallelism } from "node:os";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { PRESETS, SIMS, DEFAULTS, presetChoice, engineSettings, streamRequest, settingsKey } from "./settings.js";

const BATCH = 10;  // elections per worker request

function loadEngine(path) {
  const e = new WebAssembly.Instance(new WebAssembly.Module(readFileSync(path)), {}).exports;
  return request => {
    const text = new TextEncoder().encode(JSON.stringify(request));
    const ptr = e.alloc(text.length);
    new Uint8Array(e.memory.buffer, ptr, text.length).set(text);
    const out = e.call(ptr, text.length);
    e.dealloc(ptr, text.length);
    const n = new DataView(e.memory.buffer).getUint32(out, true);
    return JSON.parse(new TextDecoder().decode(new Uint8Array(e.memory.buffer, out + 4, n)));
  };
}

if (!isMainThread) {
  const call = loadEngine(workerData.wasm);
  parentPort.on("message", ({ i, request }) => parentPort.postMessage({ i, reply: call(request) }));
} else {
  const [wasm, referencePath, outDir] = process.argv.slice(2);
  if (!outDir) {
    console.error("usage: node web/precompute.mjs <stvsim.wasm> <reference.json> <out folder>");
    process.exit(2);
  }
  mkdirSync(outDir, { recursive: true });
  const curves = JSON.parse(readFileSync(referencePath, "utf8")).slate_curves;
  // Only the public elections: the DSA branch elections run in the browser in under a minute.
  const plans = PRESETS.filter(p => p.electorate === "public").map(p => ({ p, settings: engineSettings(presetChoice(p), curves) }));
  const jobs = [];
  for (const [pi, { settings }] of plans.entries())
    for (let first = 0; first < SIMS; first += BATCH) jobs.push({ pi, first, request: streamRequest(settings, first, Math.min(BATCH, SIMS - first)) });

  const records = plans.map(() => new Array(SIMS));
  let next = 0, done = 0;
  const started = Date.now();
  const size = Math.max(1, availableParallelism() - 1);
  await Promise.all(Array.from({ length: Math.min(size, jobs.length) }, () => new Promise((resolve, reject) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { wasm } });
    const send = () => {
      if (next >= jobs.length) { w.terminate(); resolve(); return; }
      const i = next++;
      w.postMessage({ i, request: jobs[i].request });
    };
    w.on("message", ({ i, reply }) => {
      const j = jobs[i];
      if (reply.error) { reject(new Error(`${plans[j.pi].p.id}: ${reply.error}`)); return; }
      reply.records.forEach((r, k) => { records[j.pi][j.first + k] = r; });
      done++;
      if (process.stderr.isTTY || done % 50 === 0 || done === jobs.length)
        process.stderr.write(`${done} of ${jobs.length} requests, ${Math.round((Date.now() - started) / 1000)} s\n`);
      send();
    });
    w.on("error", reject);
    send();
  })));

  const git = cmd => { try { return execSync(cmd, { encoding: "utf8" }).trim(); } catch { return null; } };
  const made_by = {
    script: "web/precompute.mjs",
    engine_commit: git("git rev-parse HEAD"),
    uncommitted_changes: !!git("git status --porcelain -- engine web tuner/reference.json"),
    wasm_sha256: createHash("sha256").update(readFileSync(wasm)).digest("hex"),
    model_version: "0.2",
    sims: SIMS,
    defaults: DEFAULTS,
  };
  const presets = {};
  for (const [pi, { p, settings }] of plans.entries()) {
    const key = settingsKey(settings);
    writeFileSync(`${outDir}/${p.id}.json`, JSON.stringify({ key, settings, records: records[pi] }));
    presets[p.id] = { key, file: `${p.id}.json` };
  }
  writeFileSync(`${outDir}/meta.json`, JSON.stringify({ made_by, curves, presets }));
  console.error(`Saved ${plans.length} presets to ${outDir}`);
}
