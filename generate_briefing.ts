#!/usr/bin/env bun
/**
 * Daily Security Briefing Generator
 * Spawns 4 parallel research agents, assembles markdown, commits & pushes to GitHub.
 * Usage: bun generate_briefing.ts [--date YYYY-MM-DD]
 */

import { execSync, spawn } from "child_process";
import { existsSync, mkdirSync, appendFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const REPO_DIR = dirname(fileURLToPath(import.meta.url));
const BRIEFINGS_DIR = join(REPO_DIR, "briefings");
const LOG_FILE = join(BRIEFINGS_DIR, ".log");
const INFERENCE_TOOL = "/Users/jordanbeck/.claude/PAI/Tools/Inference.ts";

// ── Date resolution ──────────────────────────────────────────────────────────

function getTargetDate(): string {
  const idx = process.argv.indexOf("--date");
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ── Logging ──────────────────────────────────────────────────────────────────

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  if (!existsSync(BRIEFINGS_DIR)) mkdirSync(BRIEFINGS_DIR, { recursive: true });
  appendFileSync(LOG_FILE, line + "\n");
}

// ── OSINT source lists ───────────────────────────────────────────────────────

const SOURCES = {
  domestic: {
    label: "Domestic US Security",
    xAccounts: ["@CISAgov", "@CISACyber", "@DHSgov", "@sentdefender", "@FBI", "@CYBERCOM_DIRNSA"],
    keywords: "homeland security, CISA, DHS, DoD, domestic threats, critical infrastructure, cybersecurity",
  },
  chinaTaiwan: {
    label: "China / Taiwan",
    xAccounts: ["@PLATracker", "@IndoPac_Info", "@TaiwansDefense", "@EBKania", "@BonnieGlaser", "@AsianOSINT"],
    keywords: "PLA, Taiwan Strait, CCP, PLAN, ADIZ incursion, Indo-Pacific, Taiwan defense",
  },
  russiaUkraine: {
    label: "Russia / Ukraine",
    xAccounts: ["@RALee85", "@oryxspioenkop", "@GeoConfirmed", "@OSINTtechnical", "@WarMonitor3"],
    keywords: "Ukraine front lines, Russian military, battlefield OSINT, weapons, escalation, NATO, Western aid",
  },
  usIran: {
    label: "US / Iran",
    xAccounts: ["@CENTCOM", "@sentdefender", "@ArmsControlWonk", "@Osint613", "@OSINTWarfare", "@KyleWOrton"],
    keywords: "CENTCOM, Iran, IRGC, nuclear talks, proxy forces, Houthi, Middle East operations",
  },
};

type FocusKey = keyof typeof SOURCES;

// ── Research agent via PAI Inference ────────────────────────────────────────

async function runAgent(key: FocusKey, date: string): Promise<string> {
  const src = SOURCES[key];
  const prompt = `You are a security intelligence analyst compiling a daily briefing.

Date to cover: ${date} (use news from this specific date or the 24 hours prior).

Focus area: ${src.label}
Keywords: ${src.keywords}
Key OSINT X accounts to reference for context: ${src.xAccounts.join(", ")}

Your task:
1. Research real news events from ${date} related to this focus area.
2. Draw on reporting from Reuters, AP, BBC, WSJ, NYT, Washington Post, Foreign Policy, Defense One, War on the Rocks, and similar reputable outlets.
3. Write a factual summary of 4-6 sentences covering the most significant developments.
4. Include at least 2 real, verifiable source URLs.
5. Do NOT invent facts, quotes, or URLs. If news is sparse, say so honestly.

Return ONLY the briefing text and source URLs. No preamble. Format:
<summary>
[4-6 sentence factual summary]
</summary>
<sources>
- [Source name]: [URL]
- [Source name]: [URL]
</sources>`;

  return new Promise((resolve, reject) => {
    const proc = spawn("bun", [INFERENCE_TOOL, "smart", prompt], {
      env: { ...process.env, PATH: `/Users/jordanbeck/.bun/bin:${process.env.PATH}` },
    });

    let output = "";
    let errOutput = "";

    proc.stdout.on("data", (d: Buffer) => { output += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { errOutput += d.toString(); });

    proc.on("close", (code) => {
      if (code !== 0 || !output.trim()) {
        reject(new Error(`Agent ${key} failed (exit ${code}): ${errOutput.slice(0, 200)}`));
      } else {
        resolve(output.trim());
      }
    });
  });
}

// ── Markdown assembly ────────────────────────────────────────────────────────

function parseAgentOutput(raw: string): { summary: string; sources: string } {
  const summaryMatch = raw.match(/<summary>([\s\S]*?)<\/summary>/);
  const sourcesMatch = raw.match(/<sources>([\s\S]*?)<\/sources>/);
  return {
    summary: summaryMatch ? summaryMatch[1].trim() : raw.trim(),
    sources: sourcesMatch ? sourcesMatch[1].trim() : "",
  };
}

function assembleBriefing(date: string, results: Record<FocusKey, string>): string {
  const sections = (Object.keys(SOURCES) as FocusKey[]).map((key) => {
    const { label, xAccounts } = SOURCES[key];
    const { summary, sources } = parseAgentOutput(results[key]);
    return `## ${label}

${summary}

**Sources:**
${sources || "_No sources returned._"}

**OSINT X Accounts:** ${xAccounts.join(", ")}`;
  });

  return `# Daily Security Briefing — ${date}

${sections.join("\n\n---\n\n")}

---

_Generated: ${new Date().toUTCString()} | JBeck Cyber automated briefing_
`;
}

// ── Git operations ───────────────────────────────────────────────────────────

function gitCommitAndPush(filePath: string, date: string) {
  execSync(`git -C "${REPO_DIR}" add "${filePath}"`, { stdio: "inherit" });
  execSync(`git -C "${REPO_DIR}" commit -m "briefing: ${date} daily security update"`, { stdio: "inherit" });
  execSync(`git -C "${REPO_DIR}" push origin main`, { stdio: "inherit" });
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const date = getTargetDate();
  log(`Starting briefing generation for ${date}`);

  if (!existsSync(BRIEFINGS_DIR)) mkdirSync(BRIEFINGS_DIR, { recursive: true });

  const outPath = join(BRIEFINGS_DIR, `${date}.md`);
  if (existsSync(outPath)) {
    log(`Briefing for ${date} already exists — skipping.`);
    process.exit(0);
  }

  // Parallel research agents
  log("Spawning 4 parallel research agents...");
  const keys = Object.keys(SOURCES) as FocusKey[];
  let results: Record<FocusKey, string>;

  try {
    const outputs = await Promise.all(keys.map((k) => runAgent(k, date)));
    results = Object.fromEntries(keys.map((k, i) => [k, outputs[i]])) as Record<FocusKey, string>;
  } catch (err) {
    log(`FATAL: Agent failure — ${err}`);
    process.exit(1);
  }

  // Validate — no empty results
  for (const key of keys) {
    if (!results[key]?.trim()) {
      log(`FATAL: Agent ${key} returned empty result — aborting commit`);
      process.exit(1);
    }
  }

  const markdown = assembleBriefing(date, results);

  // Validate — no unfilled placeholders
  if (markdown.includes("{{") || markdown.includes("TODO") || markdown.includes("[INSERT")) {
    log("FATAL: Briefing contains unfilled placeholder text — aborting commit");
    process.exit(1);
  }

  writeFileSync(outPath, markdown, "utf8");
  log(`Briefing written to ${outPath}`);

  try {
    gitCommitAndPush(outPath, date);
    log(`Successfully committed and pushed briefing for ${date}`);
  } catch (err) {
    log(`FATAL: Git push failed — ${err}`);
    process.exit(1);
  }
}

main();
