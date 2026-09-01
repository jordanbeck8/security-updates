#!/usr/bin/env bun
/**
 * Daily Security Briefing generator — runs on pulsar.
 *   RSS gather (pulsar has internet) → direct OpenAI-compatible call to the mac-studio
 *   LLM over the tailnet (LM Studio) → assemble markdown → commit & push to GitHub.
 *
 * No `claude`, no vault-assistant Slack bridge. Pulsar talks straight to the LLM.
 * Delivery to Slack is handled separately by deliver.ts (pulsar-runner bot).
 *
 * Config (./.env, all optional):
 *   LLM_BASE   default http://mac-studio:1234/v1      (LM Studio server over the tailnet)
 *   LLM_MODEL  default = whatever /v1/models reports is loaded
 *
 * Usage: bun generate_briefing.ts [--date YYYY-MM-DD] [--dry]
 *   --dry : gather RSS + call LLM, print markdown, no git.
 */
import { existsSync, writeFileSync, appendFileSync, readFileSync } from "fs";
import { spawnSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const REPO_DIR = dirname(fileURLToPath(import.meta.url));
const BRIEFINGS_DIR = join(REPO_DIR, "briefings");
const LOG_FILE = join(BRIEFINGS_DIR, ".log");
const MAX_ITEMS = 12;       // final cap per section, after LLM relevance triage
const MIN_ITEMS = 6;        // below this, widen the gather window rather than ship an empty section
const MAX_CANDIDATES = 28;  // keyword-matched pool handed to the triage pass
const DRY = process.argv.includes("--dry");

// ── env ───────────────────────────────────────────────────────────────────────
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
const LLM_BASE = envVal("LLM_BASE", "http://mac-studio:1234/v1").replace(/\/$/, "");
// gemma-4-26b-a4b: reasoning runs away (3500+ tokens, never answers) on analytic prompts.
// gemma-4-31b-qat: reasons briefly, terminates cleanly. no-OpenAI policy (2026-08-18) bans gpt-oss.
let LLM_MODEL = envVal("LLM_MODEL", "google/gemma-4-31b-qat");
const LLM_TOKEN = envVal("LLM_TOKEN", "");                 // LM Studio server API key (from .env, gitignored)
function llmHeaders(json = false): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h["Content-Type"] = "application/json";
  if (LLM_TOKEN) h["Authorization"] = `Bearer ${LLM_TOKEN}`;
  return h;
}

// ── sections ────────────────────────────────────────────────────────────────────
const SECTIONS = [
  { key: "domestic", label: "Domestic US Security",
    xAccounts: ["@CISAgov", "@CISACyber", "@DHSgov", "@sentdefender", "@FBI", "@CYBERCOM_DIRNSA"],
    keywords: ["CISA", "DHS", "homeland", "critical infrastructure", "cyber", "FBI", "NSA", "Pentagon", "TSA", "border"],
    feeds: ["https://www.cisa.gov/cybersecurity-advisories/all.xml", "https://www.defenseone.com/rss/all/", "https://www.fdd.org/feed/", "https://www.longwarjournal.org/feed", "https://warontherocks.com/feed/", "https://www.bleepingcomputer.com/feed/", "https://therecord.media/feed", "https://www.nextgov.com/rss/all/", "https://breakingdefense.com/feed/", "https://www.militarytimes.com/arc/outboundfeeds/rss/?outputType=xml"] },
  { key: "chinaTaiwan", label: "China / Taiwan",
    xAccounts: ["@PLATracker", "@IndoPac_Info", "@TaiwansDefense", "@EBKania", "@BonnieGlaser", "@AsianOSINT"],
    keywords: ["China", "Taiwan", "PLA", "Beijing", "Taipei", "Strait", "Indo-Pacific", "PLAN", "ADIZ", "Xi"],
    feeds: ["https://www.taipeitimes.com/xml/index.rss", "https://www.scmp.com/rss/4/feed", "https://asiatimes.com/feed/", "https://www.lowyinstitute.org/the-interpreter/rss.xml", "https://www.aei.org/feed/", "https://jamestown.org/feed/", "https://warontherocks.com/feed/", "https://breakingdefense.com/feed/"] },
  { key: "russiaUkraine", label: "Russia / Ukraine",
    xAccounts: ["@RALee85", "@oryxspioenkop", "@GeoConfirmed", "@OSINTtechnical", "@WarMonitor3"],
    keywords: ["Ukraine", "Russia", "Russian", "Kyiv", "Moscow", "Zelensky", "Putin", "drone", "front line", "NATO"],
    feeds: ["https://kyivindependent.com/feed/rss/", "https://www.pravda.com.ua/eng/rss/", "https://www.ukrinform.net/rss/block-lastnews", "https://euromaidanpress.com/feed/", "https://meduza.io/rss/en/all", "https://www.themoscowtimes.com/rss/news", "https://www.bellingcat.com/feed/", "https://www.atlanticcouncil.org/feed/", "https://feeds.bbci.co.uk/news/world/europe/rss.xml", "https://warontherocks.com/feed/", "https://breakingdefense.com/feed/"] },
  { key: "usIran", label: "US / Iran",
    xAccounts: ["@CENTCOM", "@sentdefender", "@ArmsControlWonk", "@Osint613", "@OSINTWarfare", "@KyleWOrton"],
    keywords: ["Iran", "Iranian", "IRGC", "Tehran", "CENTCOM", "Houthi", "nuclear", "Hormuz", "proxy", "Middle East"],
    feeds: ["https://www.timesofisrael.com/feed/", "https://www.longwarjournal.org/feed", "https://www.fdd.org/feed/", "https://warontherocks.com/feed/", "https://www.al-monitor.com/rss", "https://www.jpost.com/rss/rssfeedsmiddleeastnews.aspx", "https://www.aljazeera.com/xml/rss/all.xml", "https://feeds.bbci.co.uk/news/world/middle_east/rss.xml"] },
];

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { appendFileSync(LOG_FILE, line + "\n"); } catch { /* dir may not exist on --dry */ }
}

function targetDate(): string {
  const i = process.argv.indexOf("--date");
  if (i !== -1 && process.argv[i + 1]) {
    const d = process.argv[i + 1];
    // Strict format: this value is later passed to git as an argument, so
    // reject anything that isn't a plain ISO date (blocks argument injection).
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      throw new Error(`--date must be YYYY-MM-DD, got: ${d}`);
    }
    return d;
  }
  const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  et.setDate(et.getDate() - 1);
  return et.toISOString().slice(0, 10);
}

// ── RSS ───────────────────────────────────────────────────────────────────────
type Item = { title: string; url: string; when: number; blurb: string };
function decode(s: string): string {
  return (s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/\s+/g, " ").trim();
}
function parseFeed(xml: string): Item[] {
  const blocks = xml.match(/<(item|entry)[\s\S]*?<\/(item|entry)>/gi) || [];
  const out: Item[] = [];
  for (const b of blocks) {
    const title = decode((b.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "");
    let url = decode((b.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1] || "");
    if (!url) url = (b.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || "";
    const dateRaw = (b.match(/<(pubDate|published|updated|dc:date)[^>]*>([\s\S]*?)<\/\1>/i) || [])[2] || "";
    const blurb = decode((b.match(/<(description|summary|content)[^>]*>([\s\S]*?)<\/\1>/i) || [])[2] || "").slice(0, 400);
    const when = dateRaw ? Date.parse(dateRaw) : NaN;
    if (title && url) out.push({ title, url, when: isNaN(when) ? 0 : when, blurb });
  }
  return out;
}
async function fetchFeed(url: string): Promise<Item[]> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20_000);
    const r = await fetch(url, { headers: { "User-Agent": "pulsar-briefing/1.0" }, signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) { log(`  feed ${r.status}: ${url}`); return []; }
    return parseFeed(await r.text());
  } catch (e: any) { log(`  feed error ${url}: ${e?.message || e}`); return []; }
}
// The briefing is for ONE day. Window = target date 00:00–24:00 ET (feeds publish in UTC;
// ET is UTC-4/-5 — use -4 during DST season, close enough for daily news granularity).
// Undated items are DROPPED: a daily brief cannot include items it can't place in time.
function dayWindow(date: string): { start: number; end: number } {
  const start = Date.parse(`${date}T00:00:00-04:00`);
  return { start, end: start + 24 * 3600_000 };
}
async function gather(s: typeof SECTIONS[number], date: string): Promise<Item[]> {
  const all = (await Promise.all(s.feeds.map(fetchFeed))).flat();
  const pick = (start: number, end: number): Item[] => {
    // word-boundary match so "Xi" doesn't hit "Mexico", "PLA" doesn't hit "display", etc.
    const kwre = s.keywords.map((k) => new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"));
    const NOISE = /\b(world cup|soccer|olympic|MRT|metro line|credit card|box office|celebrity|recipe)\b/i;
    const seen = new Set<string>(); const picked: Item[] = [];
    for (const it of all.sort((a, b) => b.when - a.when)) {
      if (!it.when || it.when < start || it.when >= end) continue; // undated dropped
      const hay = it.title + " " + it.blurb;
      if (NOISE.test(hay)) continue;
      if (!kwre.some((re) => re.test(hay))) continue;
      const d = it.title.toLowerCase().slice(0, 60);
      if (seen.has(d)) continue; seen.add(d);
      picked.push(it);
      if (picked.length >= MAX_CANDIDATES) break;
    }
    return picked;
  };
  const { start, end } = dayWindow(date);
  let picked = pick(start, end);
  if (picked.length < MIN_ITEMS) {
    const widened = pick(start - 24 * 3600_000, end);
    if (widened.length > picked.length) {
      log(`  ${s.label}: only ${picked.length} items on ${date} — widening to 48h (${widened.length})`);
      picked = widened;
    }
  }
  return picked;
}

// Remove reasoning blocks entirely (content included), plus stray tags.
function stripThink(s: string): string {
  return s.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<\/?think>/gi, "").trim();
}

// ── LLM relevance triage ─────────────────────────────────────────────────────
// Keyword matching alone lets country-name noise through (Taipei Times lifestyle/biz
// items match "Taiwan", etc.). Ask the model which candidates are genuinely
// security/defense/geopolitics relevant BEFORE synthesis, so junk never reaches the
// briefing prose or its Sources list. Fail open: on any error, keep the first MAX_ITEMS.
async function triage(s: typeof SECTIONS[number], items: Item[]): Promise<Item[]> {
  if (items.length <= 1) return items;
  const listing = items.map((it, i) => `${i + 1}. ${it.title} — ${it.blurb.slice(0, 200)}`).join("\n");
  const prompt =
    `You are screening news items for the "${s.label}" section of a security intelligence briefing. `
    + `Keep ONLY items reporting security, defense, military, cyber, intelligence/espionage, or geopolitical DEVELOPMENTS — things that happened. `
    + `Discard business, markets, lifestyle, culture, sports, human-interest, and transit items even if they mention relevant countries. `
    + `Also discard event announcements, podcasts, webinars, and undated opinion/overview essays — they are not developments. `
    + `Reply with ONLY the numbers of the items to keep, comma-separated (e.g. 1,3,4). If none qualify, reply NONE.\n\n${listing}`;
  try {
    const model = await llmModel();
    const r = await fetch(`${LLM_BASE}/chat/completions`, {
      method: "POST",
      headers: llmHeaders(true),
      // reasoning lands in reasoning_content but still burns completion tokens — budget for it
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0, max_tokens: 2000 }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!r.ok) throw new Error(`LLM ${r.status}`);
    const j: any = await r.json();
    const text = stripThink(j?.choices?.[0]?.message?.content || "");
    if (/\bNONE\b/i.test(text)) return [];
    const idx = [...new Set((text.match(/\d+/g) || []).map(Number))].filter((n) => n >= 1 && n <= items.length);
    if (!idx.length) throw new Error("no indices parsed");
    return idx.map((n) => items[n - 1]).slice(0, MAX_ITEMS);
  } catch (e: any) {
    log(`  ${s.label}: triage failed (${e?.message || e}) — keeping first ${MAX_ITEMS} keyword matches`);
    return items.slice(0, MAX_ITEMS);
  }
}

// ── LLM (OpenAI-compatible, direct over tailnet) ─────────────────────────────────
async function llmModel(): Promise<string> {
  if (LLM_MODEL) return LLM_MODEL;
  const r = await fetch(`${LLM_BASE}/models`, { headers: llmHeaders(), signal: AbortSignal.timeout(15_000) });
  const j: any = await r.json();
  const id = j?.data?.[0]?.id;
  if (!id) throw new Error("no model loaded on LLM server");
  LLM_MODEL = id;
  return id;
}
async function synthesize(s: typeof SECTIONS[number], date: string, items: Item[], maxTokens = 4000): Promise<string> {
  const articles = items.map((it, i) => `[${i + 1}] ${it.title}\n${it.blurb}`).join("\n\n");
  const prompt =
    `You are a security intelligence analyst writing the "${s.label}" section of a daily briefing for ${date}. `
    + `Below are real news items published on ${date}. `
    + `Write a detailed 10-14 sentence account of the most significant SECURITY developments FROM THAT DAY \u2014 military, cyber, intelligence, defense policy, geopolitical risk. `
    + `Preserve specific details (places, units, numbers, names, dates) when present; do not invent facts. `
    + `Ignore any item that is not security-relevant. `
    + `If the items are thin, say so plainly rather than padding. Output prose only.\n\n`
    + `News items:\n${articles}`;
  const model = await llmModel();
  const r = await fetch(`${LLM_BASE}/chat/completions`, {
    method: "POST",
    headers: llmHeaders(true),
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      reasoning_effort: "low", // 31b will otherwise spend the whole budget reasoning and return empty
      max_tokens: maxTokens, // gemma reasoning (reasoning_content) burns completion tokens before the visible answer
    }),
    // 31B on the Studio does ~15-20 tok/s; scale the deadline with the budget
    signal: AbortSignal.timeout(maxTokens > 5000 ? 900_000 : 600_000),
  });
  if (!r.ok) throw new Error(`LLM ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j: any = await r.json();
  const out = (j?.choices?.[0]?.message?.content || "").trim();
  const cleaned = stripThink(out);
  if (!cleaned) {
    const fr = j?.choices?.[0]?.finish_reason;
    const usage = JSON.stringify(j?.usage || {});
    throw new Error(`empty LLM response (finish_reason=${fr} usage=${usage})`);
  }
  return cleaned;
}
// LM Studio can still be waking up (mac-studio not logged in / server not bound yet) when the
// 06:00 ET cron fires first — one retry after a short backoff absorbs that without losing the
// whole day's briefing to a single not-yet-warm connection.
function isConnFailure(e: any): boolean {
  return /unable to connect|econnrefused|fetch failed/i.test(String(e?.message || e || ""));
}
async function synthesizeWithRetry(s: typeof SECTIONS[number], date: string, items: Item[]): Promise<string> {
  try {
    return await synthesize(s, date, items);
  } catch (e: any) {
    if (/finish_reason=length/.test(String(e?.message || ""))) {
      log(`  ${s.label}: reasoning ate the token budget — retrying with 8000`);
      try {
        return await synthesize(s, date, items, 8000);
      } catch (e2: any) {
        // Last chance: a smaller budget on fewer items usually terminates where 8000 stalls.
        log(`  ${s.label}: 8000 retry failed (${e2?.message || e2}) — final short attempt`);
        return await synthesize(s, date, items.slice(0, 6), 2500);
      }
    }
    if (!isConnFailure(e)) throw e;
    log(`  ${s.label}: connect failed (${e?.message || e}) — retrying in 30s`);
    await new Promise((r) => setTimeout(r, 30_000));
    return await synthesize(s, date, items);
  }
}

// ── assemble + git ──────────────────────────────────────────────────────────────
// Readable outlet name for the Sources list, derived from the article URL. The March-era
// briefings listed "Outlet - Headline: URL" so a reader can see WHO reported something
// before clicking; bare headlines lose that at a glance.
const OUTLETS: Record<string, string> = {
  "cisa.gov": "CISA", "defenseone.com": "Defense One", "fdd.org": "FDD",
  "longwarjournal.org": "Long War Journal", "warontherocks.com": "War on the Rocks",
  "bleepingcomputer.com": "BleepingComputer", "therecord.media": "The Record",
  "nextgov.com": "Nextgov", "breakingdefense.com": "Breaking Defense",
  "militarytimes.com": "Military Times",
  "taipeitimes.com": "Taipei Times", "scmp.com": "South China Morning Post",
  "asiatimes.com": "Asia Times", "lowyinstitute.org": "Lowy Institute",
  "aei.org": "AEI", "jamestown.org": "Jamestown Foundation",
  "kyivindependent.com": "Kyiv Independent", "pravda.com.ua": "Ukrainska Pravda",
  "ukrinform.net": "Ukrinform", "euromaidanpress.com": "Euromaidan Press",
  "meduza.io": "Meduza", "themoscowtimes.com": "The Moscow Times",
  "bellingcat.com": "Bellingcat", "atlanticcouncil.org": "Atlantic Council",
  "bbc.co.uk": "BBC News", "bbc.com": "BBC News",
  "timesofisrael.com": "Times of Israel", "al-monitor.com": "Al-Monitor",
  "jpost.com": "Jerusalem Post", "aljazeera.com": "Al Jazeera",
};
function outlet(url: string): string {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    for (const [d, n] of Object.entries(OUTLETS)) if (h === d || h.endsWith("." + d)) return n;
    return h;
  } catch { return "source"; }
}
function assemble(date: string, res: Record<string, { prose: string; items: Item[] }>): string {
  const secs = SECTIONS.map((s) => {
    const r = res[s.key];
    const sources = r.items.length ? r.items.map((it) => `- ${outlet(it.url)} \u2014 ${it.title}: ${it.url}`).join("\n") : "_No fresh sources found for this section._";
    return `## ${s.label}\n\n${r.prose}\n\n**Sources:**\n${sources}\n\n**OSINT X Accounts:** ${s.xAccounts.join(", ")}`;
  });
  return `# Daily Security Briefing — ${date}\n\n${secs.join("\n\n---\n\n")}\n\n---\n\n_Generated: ${new Date().toUTCString()} | pulsar + mac-studio LLM | JBeck Cyber_\n`;
}
function gitPush(file: string, date: string) {
  const run = (args: string[]) => { const r = spawnSync("git", args, { cwd: REPO_DIR, stdio: "inherit" }); if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed`); };
  run(["add", file]); run(["commit", "-m", `briefing: ${date} daily security update`]); run(["push", "origin", "main"]);
}

// ── main ────────────────────────────────────────────────────────────────────────
const date = targetDate();
const outPath = join(BRIEFINGS_DIR, `${date}.md`);
if (existsSync(outPath) && !DRY) { log(`briefing ${date} already exists — skipping`); process.exit(0); }
log(`generating ${date}${DRY ? " (dry)" : ""} via ${LLM_BASE}`);

const res: Record<string, { prose: string; items: Item[] }> = {};
for (const s of SECTIONS) {
  const candidates = await gather(s, date);
  const items = await triage(s, candidates);
  if (candidates.length !== items.length) log(`  ${s.label}: triage kept ${items.length}/${candidates.length}`);
  let prose: string;
  try {
    prose = items.length ? await synthesizeWithRetry(s, date, items)
      : "Limited developments were reported in the sources monitored for this area over the past day.";
  } catch (e: any) { log(`FATAL ${s.label}: ${e?.message || e}`); process.exit(1); }
  log(`  ${s.label}: ${items.length} items, ${prose.length} chars`);
  res[s.key] = { prose, items };
}

const md = assemble(date, res);
if (DRY) { console.log("\n===== DRY OUTPUT =====\n" + md); process.exit(0); }

writeFileSync(outPath, md, { flag: "wx" });
log(`wrote ${outPath}`);
try { gitPush(outPath, date); log(`pushed ${date}`); }
catch (e: any) { log(`git push FAILED: ${e?.message || e}`); process.exit(1); }
log("done");
