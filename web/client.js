// The engine in the visitor's browser, with the precomputed replies in front of it.
// `createEngine(base)` loads `${base}/defaults.json` (made by precompute.mjs) and starts a pool of
// workers (`${base}/worker.js`, each running `${base}/stvsim.wasm`), one per spare processor core.
// `engine.run(request, alive)` answers from the precomputed replies when it can, and otherwise
// queues the request for the next free worker. A queued request whose `alive()` check fails by
// the time a worker is free (the visitor changed the settings) is dropped unstarted.
import { requestKey } from "./settings.js";

export async function createEngine(base) {
  const res = await fetch(`${base}/defaults.json`);
  if (!res.ok) throw new Error(`defaults.json: ${res.status}`);
  const saved = await res.json();
  const replies = new Map(Object.entries(saved.replies));

  const size = Math.max(2, Math.min(12, (navigator.hardwareConcurrency || 4) - 1));
  const queue = [];
  let workers = null;  // started the first time a request isn't precomputed
  let nextId = 1;
  const start = () => {
    workers = Array.from({ length: size }, () => {
      const w = { worker: new Worker(`${base}/worker.js`), busy: null };
      w.worker.onmessage = e => {
        const job = w.busy; w.busy = null;
        if (job) job.resolve(e.data.reply);
        dispatch();
      };
      return w;
    });
  };
  function dispatch() {
    for (const w of workers) {
      if (w.busy) continue;
      let job;
      while ((job = queue.shift()) && job.alive && !job.alive()) job.resolve({ error: "stale", stale: true });
      if (!job) return;
      w.busy = job;
      w.worker.postMessage({ id: nextId++, request: job.request });
    }
  }

  return {
    curves: saved.curves,
    madeBy: saved.made_by,
    cores: size,
    /** True when every request is precomputed, so the page can skip its "running" state. */
    saved: requests => requests.every(r => replies.has(requestKey(r))),
    run(request, alive) {
      const hit = replies.get(requestKey(request));
      if (hit) return Promise.resolve(hit);
      if (!workers) start();
      return new Promise(resolve => { queue.push({ request, resolve, alive }); dispatch(); });
    },
  };
}
