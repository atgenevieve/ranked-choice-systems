// The simulator's engine in the visitor's browser, with the precomputed presets in front of it.
//
// `createEngine(base)` loads `${base}/meta.json` (made by precompute.mjs). `engine.run(settings,
// onRecords)` delivers simulated elections' records (see `sim::election_record` in the engine) as
// they become available, and returns a handle with `cancel()` and a `saved` flag:
// - When the settings match a preset's (same settings key), the preset's saved records are
//   fetched (`${base}/<preset>.json`) and delivered at once, without the engine.
// - Otherwise a pool of workers (`${base}/worker.js`, each running `${base}/stvsim.wasm`), one
//   per spare processor core, works through the elections in small chunks, and each chunk is
//   delivered as it finishes. The workers start the first time they're needed.
import { SIMS, CHUNK, streamRequest, settingsKey } from "./settings.js";

export async function createEngine(base) {
  const res = await fetch(`${base}/meta.json`);
  if (!res.ok) throw new Error(`meta.json: ${res.status}`);
  const meta = await res.json();
  const savedByKey = new Map(Object.values(meta.presets).map(p => [p.key, p.file]));

  const size = Math.max(2, Math.min(12, (navigator.hardwareConcurrency || 4) - 1));
  const queue = [];
  let workers = null;
  const start = () => {
    workers = Array.from({ length: size }, () => {
      const w = { worker: new Worker(`${base}/worker.js`), busy: null };
      w.worker.onmessage = e => {
        const job = w.busy; w.busy = null;
        if (job) job.done(e.data.reply);
        dispatch();
      };
      return w;
    });
  };
  function dispatch() {
    for (const w of workers) {
      if (w.busy) continue;
      let job;
      while ((job = queue.shift()) && job.run.cancelled) { /* dropped unstarted */ }
      if (!job) return;
      w.busy = job;
      w.worker.postMessage({ request: job.request });
    }
  }

  return {
    meta,
    curves: meta.curves,
    cores: size,
    /** Whether these settings are a precomputed preset's. */
    isSaved: settings => savedByKey.has(settingsKey(settings)),
    /** Delivers every simulated election's record for these settings to onRecords(records,
     *  first), then calls onDone(); onError(message) if the engine refuses them. */
    run(settings, { onRecords, onDone, onError }) {
      const run = { cancelled: false, saved: false, cancel() { run.cancelled = true; } };
      const file = savedByKey.get(settingsKey(settings));
      if (file) {
        run.saved = true;
        fetch(`${base}/${file}`).then(r => {
          if (!r.ok) throw new Error(`${file}: ${r.status}`);
          return r.json();
        }).then(d => {
          if (run.cancelled) return;
          onRecords(d.records, 0);
          onDone();
        }).catch(e => { if (!run.cancelled) onError(e.message); });
        return run;
      }
      if (!workers) start();
      let left = 0, failed = false;
      for (let first = 0; first < SIMS; first += CHUNK) {
        left++;
        queue.push({
          run,
          request: streamRequest(settings, first, Math.min(CHUNK, SIMS - first)),
          done(reply) {
            left--;
            if (run.cancelled || failed) return;
            if (reply.error) { failed = true; onError(reply.error); return; }
            onRecords(reply.records, first);
            if (left === 0) onDone();
          },
        });
      }
      dispatch();
      return run;
    },
  };
}
