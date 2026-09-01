#!/usr/bin/env bun
/**
 * Backfill a past day's security briefing using Google News RSS date-qualified search
 * (after:/before:) so we retrieve news actually published on that date, then synthesize
 * via LM Studio over the tailnet. Same output format + repo as generate_briefing.ts.
 *
 * Usage:
 *   bun backfill_briefing.ts --date 2026-06-19          # write + commit + push
 *   bun backfill_briefing.ts --date 2026-06-19 --dry    # print only, no commit (proof)
 */
import { existsSync, writeFileSync, readFileSync } from "fs";
import { spawnSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const REPO_DIR = dirname(fileURLToPath(import.meta.url));
const BRIEFINGS_DIR = join(REPO_DIR, "briefings");
const MAX_ITEMS = 12;
const DRY = process.argv.includes("--dry");

function envVal(key: string, dflt: string): string {
  if (process.env[key]) return process.env[key]!;
  try {
    for (const line of readFileSync(join(REPO_DIR, ".env"), "utf8").split("\n")) {
      const m = line.match(new RegExp(`^\\s*${key}\\s*=\\s*(.+?)\\s*$`));
      if (m) return m[1].replace(/^["']|["']$/g, "");
    }
  } catch { /* no .env */ }
  return dflt;
}
const LLM_BASE = envVal("LLM_BASE", "http://100.89.233.64:1234/v1").replace(/\/$/, "");
const LLM_MODEL = envVal("LLM_MODEL", "google/gemma-4-31b-qat");
const LLM_TOKEN = envVal("LLM_TOKEN", "");
function llmHeaders(json = false): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h["Content-Type"] = "application/json";
  if (LLM_TOKEN) h["Authorization"] = `Bearer ${LLM_TOKEN}`;
  return h;
}

// Google News treats spaces as AND, so use OR between core terms to guarantee hits.
const SECTIONS = [
  { key: "domestic", label: "Domestic US Security",
    xAccounts: ["@CISAgov", "@CISACyber", "@DHSgov", "@sentdefender", "@FBI", "@CYBERCOM_DIRNSA"],
    query: 'CISA OR "Homeland Security" OR DHS OR Pentagon OR "critical infrastructure" OR NORTHCOM' },
  { key: "chinaTaiwan", label: "China / Taiwan",
    xAccounts: ["@PLATracker", "@IndoPac_Info", "@TaiwansDefense", "@EBKania", "@BonnieGlaser", "@AsianOSINT"],
    query: 'Taiwan OR "Taiwan Strait" OR "People\'s Liberation Army" OR "PLA Navy" OR "cross-strait"' },
  { key: "russiaUkraine", label: "Russia / Ukraine",
    xAccounts: ["@RALee85", "@oryxspioenkop", "@GeoConfirmed", "@OSINTtechnical", "@WarMonitor3"],
    query: 'Ukraine OR "Russian forces" OR Kyiv OR Zelensky OR "Russian military"' },
  { key: "usIran", label: "US / Iran",
    xAccounts: ["@CENTCOM", "@sentdefender", "@ArmsControlWonk", "@Osint613", "@OSINTWarfare", "@KyleWOrton"],
    query: 'Iran OR IRGC OR Houthi OR "Strait of Hormuz" OR "Iran nuclear" OR CENTCOM' },
];
const NOISE = /\b(world cup|soccer|basketball|olympic|nba|box office|celebrity|recipe|horoscope)\b/i;

function log(m: string) { console.log(`[${new Date().toISOString()}] ${m}`); }

function reqDate(): string {
  const i = process.argv.indexOf("--date");
  if (i === -1 || !/^\d{4}-\d{2}-\d{2}$/.test(process.argv[i + 1] || "")) {
    console.error("need --date YYYY-MM-DD"); process.exit(1);
  }
  return process.argv[i + 1];
}

// ── Google News RSS (date-qualified) ──────────────────────────────────────────
type Item = { title: string; url: string; when: number; blurb: string; source: string };
function decode(s: string): string {
  return (s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/\s+/g, " ").trim();
}
function shift(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);
}
function newsUrl(query: string, date: string): string {
  const q = `${query} after:${shift(date, -1)} before:${shift(date, 2)}`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
}
async function gather(section: typeof SECTIONS[number], date: string): Promise<Item[]> {
  const url = newsUrl(section.query, date);
  let xml = "";
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 25_000);
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 pulsar-briefing/1.0" }, signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) { log(`  news ${r.status} for ${section.label}`); return []; }
    xml = await r.text();
  } catch (e: any) { log(`  news error ${section.label}: ${e?.message || e}`); return []; }
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  const lo = Date.parse(shift(date, -1)), hi = Date.parse(shift(date, 2));
  const seen = new Set<string>(); const items: Item[] = [];
  for (const b of blocks) {
    const rawTitle = decode((b.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "");
    const url = decode((b.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1] || "");
    const dateRaw = (b.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) || [])[1] || "";
    const source = decode((b.match(/<source[^>]*>([\s\S]*?)<\/source>/i) || [])[1] || "");
    const when = dateRaw ? Date.parse(dateRaw) : NaN;
    if (!rawTitle || !url) continue;
    if (NOISE.test(rawTitle)) continue;                    // drop sports/lifestyle cruft
    if (!isNaN(when) && (when < lo || when > hi)) continue; // enforce the date window
    // Google News titles are "Headline - Source"; strip the trailing source for the blurb
    const title = rawTitle.replace(/\s+-\s+[^-]+$/, "").trim() || rawTitle;
    const key = title.toLowerCase().slice(0, 60);
    if (seen.has(key)) continue; seen.add(key);
    items.push({ title, url, when: isNaN(when) ? 0 : when, blurb: rawTitle, source: source || (rawTitle.match(/-\s+([^-]+)$/) || [])[1]?.trim() || "" });
    if (items.length >= MAX_ITEMS) break;
  }
  // best-effort: resolve Google redirect links to the real article URL
  await Promise.all(items.map(async (it) => { it.url = await resolveUrl(it.url); }));
  return items;
}

async function resolveUrl(googleUrl: string): Promise<string> {
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(googleUrl, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0" }, signal: ctrl.signal });
    clearTimeout(t);
    const u = r.url || "";
    // Prefer a resolved publisher URL; otherwise keep the Google News link, which is live
    // and redirects in a browser. Returning "" here used to drop the citation entirely.
    return u && !u.includes("news.google.com") ? u : googleUrl;
  } catch { return googleUrl; }
}

// ── LLM synthesis (same as live generator) ────────────────────────────────────
// gemma-4-31b-qat emits reasoning tokens before its answer. At a small max_tokens the
// reasoning consumes the whole budget and `content` comes back EMPTY with
// finish_reason=length — which silently cost 2026-08-19/20/25/29/31 on the first
// backfill pass. The live generator already retries on this; mirror that here.
async function synthesize(section: typeof SECTIONS[number], date: string, items: Item[], maxTokens = 5000): Promise<string> {
  const articles = items.map((it, i) => `[${i + 1}] ${it.title}${it.source ? ` (${it.source})` : ""}`).join("\n");
  const prompt =
    `You are a security intelligence analyst writing the "${section.label}" section of a daily briefing for ${date}. `
    + `Below are real news headlines published around that date. `
    + `Write a detailed 10-14 sentence account of the most significant SECURITY developments FROM THAT DAY \u2014 military, cyber, intelligence, defense policy, geopolitical risk. `
    + `Preserve specific details (places, units, numbers, names) when present; do not invent facts. `
    + `If the headlines are thin, say so plainly rather than padding. Output prose only.\n\nHeadlines:\n${articles}`;
  const r = await fetch(`${LLM_BASE}/chat/completions`, {
    method: "POST", headers: llmHeaders(true),
    body: JSON.stringify({ model: LLM_MODEL, messages: [{ role: "user", content: prompt }], temperature: 0.3, max_tokens: maxTokens, reasoning_effort: "low" }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!r.ok) throw new Error(`LLM ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j: any = await r.json();
  const choice = j?.choices?.[0] ?? {};
  const out = (choice?.message?.content || "").replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<\/?think>/gi, "").trim();
  if (out) return out;
  // Empty content: the reasoning ate the budget. Escalate once, then give up honestly.
  if (maxTokens < 8000) {
    log(`  ${section.label}: empty content (finish_reason=${choice?.finish_reason}) — retrying with 8000`);
    return await synthesize(section, date, items, 8000);
  }
  throw new Error(`empty LLM response after 8000-token retry (finish_reason=${choice?.finish_reason})`);
}
function assemble(date: string, res: Record<string, { prose: string; items: Item[] }>): string {
  const secs = SECTIONS.map((s) => {
    const r = res[s.key];
    const sources = r.items.length
      ? r.items.map((it) => `- ${it.source || "source"} — ${it.title}: ${it.url}`).join("\n")
      : "_No sources recovered for this section._";
    return `## ${s.label}\n\n${r.prose}\n\n**Sources:**\n${sources}\n\n**OSINT X Accounts:** ${s.xAccounts.join(", ")}`;
  });
  return `# Daily Security Briefing — ${date}\n\n${secs.join("\n\n---\n\n")}\n\n---\n\n_Backfilled ${new Date().toUTCString()} via Google News archive + mac-studio LLM | JBeck Cyber_\n`;
}

// ── main ──────────────────────────────────────────────────────────────────────
const date = reqDate();
const outPath = join(BRIEFINGS_DIR, `${date}.md`);
if (existsSync(outPath) && !DRY) { log(`${date} already exists — skipping`); process.exit(0); }
log(`backfilling ${date}${DRY ? " (dry)" : ""}`);

const res: Record<string, { prose: string; items: Item[] }> = {};
let totalItems = 0;
for (const s of SECTIONS) {
  const items = await gather(s, date);
  totalItems += items.length;
  let prose: string;
  try {
    prose = items.length ? await synthesize(s, date, items)
      : "Limited archived coverage was recovered for this area on this date.";
  } catch (e: any) { log(`FATAL ${s.label}: ${e?.message || e}`); process.exit(1); }
  log(`  ${s.label}: ${items.length} items, ${prose.length} chars`);
  res[s.key] = { prose, items };
}

const md = assemble(date, res);
if (DRY) { console.log(`\n===== ${date} (items=${totalItems}) =====\n` + md); process.exit(0); }

writeFileSync(outPath, md, { flag: "wx" });
const run = (args: string[]) => { const r = spawnSync("git", args, { cwd: REPO_DIR, stdio: "inherit" }); if (r.status !== 0) throw new Error(`git ${args[0]} failed`); };
run(["add", outPath]); run(["commit", "-m", `briefing: ${date} daily security update (backfilled)`]); run(["push", "origin", "main"]);
log(`pushed ${date}`);
