// Static server for the briefing reader site (docs/).
// Run: bun scripts/serve.ts  (port 8901; fronted by tailscale funnel :10000)
import { join, normalize } from "path";

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
    if (!full.startsWith(ROOT)) return new Response("Forbidden", { status: 403 });
    const file = Bun.file(full);
    if (!(await file.exists())) return new Response("Not found", { status: 404 });
    const ext = full.slice(full.lastIndexOf("."));
    return new Response(file, {
      headers: {
        "content-type": TYPES[ext] ?? "application/octet-stream",
        "cache-control": "no-cache",
      },
    });
  },
});

console.log(`briefing site: http://127.0.0.1:${PORT} (root ${ROOT})`);
