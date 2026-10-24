// Runs the engine once for every preset election with the default model settings, from the fixed
// seed in settings.js, and saves every reply in one file the web page loads. When a visitor's
// settings match a saved request, the page shows the saved reply instead of running the engine.
//
//     node web/precompute.mjs <stvsim.wasm> <reference.json> <out.json>
//
// The engine is the same WebAssembly file the page runs, so a saved reply is exactly what the
// visitor's browser would compute. Runs on every processor core.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { availableParallelism } from "node:os";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { PRESETS, MODEL_DEFAULTS, RUN, engineSettings, requestsFor, requestKey } from "./settings.js";

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
  const [wasm, referencePath, outPath] = process.argv.slice(2);
  if (!outPath) {
    console.error("usage: node web/precompute.mjs <stvsim.wasm> <reference.json> <out.json>");
    process.exit(2);
  }
  const curves = JSON.parse(readFileSync(referencePath, "utf8")).slate_curves;
  const jobs = [];
  for (const p of PRESETS) for (const request of requestsFor(engineSettings(p, {}, curves))) jobs.push({ preset: p.id, request });

  const replies = new Array(jobs.length);
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
      if (reply.error) { reject(new Error(`${jobs[i].preset}: ${reply.error}`)); return; }
      replies[i] = reply;
      done++;
      process.stderr.write(`\r${done} of ${jobs.length} requests, ${Math.round((Date.now() - started) / 1000)} s`);
      send();
    });
    w.on("error", reject);
    send();
  })));
  process.stderr.write("\n");

  const git = cmd => { try { return execSync(cmd, { encoding: "utf8" }).trim(); } catch { return null; } };
  const out = {
    made_by: {
      script: "web/precompute.mjs",
      engine_commit: git("git rev-parse HEAD"),
      uncommitted_changes: git("git status --porcelain -- engine web tuner/reference.json") ? true : false,
      wasm_sha256: createHash("sha256").update(readFileSync(wasm)).digest("hex"),
      model_version: "0.2",
      seed: RUN.seed,
      sims: RUN.sims,
      model_defaults: MODEL_DEFAULTS,
      presets: PRESETS.map(p => p.id),
    },
    curves,
    replies: Object.fromEntries(jobs.map((j, i) => [requestKey(j.request), replies[i]])),
  };
  writeFileSync(outPath, JSON.stringify(out));
  console.error(`Saved ${jobs.length} replies to ${outPath}`);
}
