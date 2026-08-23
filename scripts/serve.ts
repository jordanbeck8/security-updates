// Static server for the briefing reader site (docs/).
// Run: bun scripts/serve.ts  (port 8901; fronted by tailscale funnel :10000)
import { join, normalize, sep } from "path";

const ROOT = normalize(join(import.meta.dir, "..", "docs"));
const PORT = 8901;

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

Bun.serve({
  port: PORT,
  hostname: "127.0.0.1",
  async fetch(req) {
    const url = new URL(req.url);
    let path = decodeURIComponent(url.pathname);
    if (path === "/") path = "/index.html";
    const full = normalize(join(ROOT, path));
    // Boundary check with a trailing separator so a sibling dir whose name
    // merely starts with ROOT (e.g. docs-secret/) can't pass the prefix test.
    if (full !== ROOT && !full.startsWith(ROOT + sep)) return new Response("Forbidden", { status: 403 });
    const file = Bun.file(full);
    if (!(await file.exists())) return new Response("Not found", { status: 404 });
    const ext = full.slice(full.lastIndexOf("."));
    // Read into bytes and construct the Response body ourselves. Handing a raw
    // Bun.file() of an .html file to `new Response` lets Bun's HTML loader/bundler
    // special-case it, which can return a 500 "__bunfallback" shell instead of the
    // real file. Serving the bytes with an explicit content-type bypasses that path.
    const bytes = await file.bytes();
    return new Response(bytes, {
      headers: {
        "content-type": TYPES[ext] ?? "application/octet-stream",
        "cache-control": "no-cache",
      },
    });
  },
  error() {
    return new Response("Internal Server Error", {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  },
});

console.log(`briefing site: http://127.0.0.1:${PORT} (root ${ROOT})`);
