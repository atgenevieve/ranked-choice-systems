// Builds branches-defaults.json: the engine's replies to every request the branch page makes
// with its default settings and branch numbers, so the published page opens with results
// instead of simulating for minutes. It opens the page in a headless browser, lets the page's
// own engine pool run every request, and saves each request with its reply. Rerun after any
// change to the engine, the model, the page's defaults, or the branch numbers:
//     cd tuner && npm install --no-save playwright && node precompute.mjs
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const dir = fileURLToPath(new URL(".", import.meta.url));
const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".wasm": "application/wasm" };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "");
  // The page must compute everything itself, so the old saved replies are hidden from it.
  if (path === "branches-defaults.json" || path.includes("..")) { res.writeHead(404).end(); return; }
  try {
    const body = await readFile(join(dir, path));
    res.writeHead(200, { "content-type": types[extname(path)] || "application/octet-stream" }).end(body);
  } catch { res.writeHead(404).end(); }
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage();
await page.addInitScript(() => {
  window.__saved = {};
  const sent = new Map();
  const Base = window.Worker;
  window.Worker = class extends Base {
    constructor(...args) {
      super(...args);
      this.addEventListener("message", e => {
        const request = sent.get(e.data.id);
        if (request && !e.data.reply.error) window.__saved[JSON.stringify(request)] = e.data.reply;
      });
    }
    postMessage(m) { sent.set(m.id, m.request); return super.postMessage(m); }
  };
});
await page.goto(`http://localhost:${port}/branches.html`);
const started = Date.now();
await page.waitForFunction(() => {
  const s = document.getElementById("branches-status");
  return document.querySelectorAll(".worthcard").length && !s.textContent && !s.classList.contains("busy");
}, null, { timeout: 0, polling: 2000 });
const saved = await page.evaluate(() => window.__saved);
await writeFile(join(dir, "branches-defaults.json"), JSON.stringify(saved));
console.log(`Saved ${Object.keys(saved).length} replies in ${Math.round((Date.now() - started) / 1000)}s.`);
await browser.close();
server.close();
