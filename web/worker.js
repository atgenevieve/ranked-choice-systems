// Runs the engine (stvsim.wasm, from the same folder) off the page's main thread, for client.js.
// The page posts {id, request}; the worker replies {id, reply}. Requests and replies are the JSON
// described in engine/src/wasm.rs. The same as tuner/worker.js.
let engine = null;

const ready = fetch(new URL("stvsim.wasm", self.location.href))
  .then(r => {
    if (!r.ok) throw new Error(`stvsim.wasm: ${r.status}`);
    return r.arrayBuffer();
  })
  .then(bytes => WebAssembly.instantiate(bytes, {}))
  .then(({ instance }) => { engine = instance.exports; });

function call(request) {
  const text = new TextEncoder().encode(JSON.stringify(request));
  const ptr = engine.alloc(text.length);
  new Uint8Array(engine.memory.buffer, ptr, text.length).set(text);
  const out = engine.call(ptr, text.length);
  engine.dealloc(ptr, text.length);
  const n = new DataView(engine.memory.buffer).getUint32(out, true);
  return JSON.parse(new TextDecoder().decode(new Uint8Array(engine.memory.buffer, out + 4, n)));
}

self.onmessage = async e => {
  const { id, request } = e.data;
  try {
    await ready;
    self.postMessage({ id, reply: call(request) });
  } catch (err) {
    self.postMessage({ id, reply: { error: String(err && err.message || err) } });
  }
};
