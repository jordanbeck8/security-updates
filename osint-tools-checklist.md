# OSINT Tools Enrichment Checklist

Manual enrichment pass for the daily security briefing. The automated cron
(`generate_briefing.ts`) does RSS + LLM synthesis only. These tools are
target-driven lookups — run them by hand (or via a future agent step) to add
technical depth the RSS pipeline cannot produce.

Source board: OSINT4ALL — https://start.me/p/L1rEYQ/osint4all
Run this after the 06:00 ET briefing lands, or on demand for a named target.
Last reviewed: 2026-08-19.

---

## 1. Vulnerability / Exploit Watch

For any CVE, product, or vendor named in the day's news, or any tech in a JBeck
client's stack (G0/G1), check for fresh public exploits.

- [ ] **sploitus** — https://sploitus.com — exploit + tool search by CVE/keyword
- [ ] **Vulmon** — https://vulmon.com — CVE detail + exploit availability
- [ ] **Vulnerability & Exploit Database (Rapid7)** — https://www.rapid7.com/db/
- [ ] **CISA KEV** (already in RSS) — cross-check any exploited-in-wild flag

Output: note new PoC/exploit code, affected versions, and whether a client is exposed.

## 2. Email / Breach Exposure

For named entities in the briefing, or JBeck prospect/client domains, check
credential and breach exposure. Needs a target (email or domain).

- [ ] **holehe** — https://github.com/megadose/holehe — account existence by email
- [ ] **h8mail** — https://github.com/khast3x/h8mail — breach/password lookup
- [ ] **WhatBreach** — https://github.com/Ekultek/WhatBreach — breach mapping by email
- [ ] **Intelligence X** — https://intelx.io — leaks, pastes, breach data by selector
- [ ] **Have I Been Pwned** — https://haveibeenpwned.com — quick breach confirm

Output: exposed accounts/breaches per target. Handle any real client data locally
only — never paste selectors or results into cloud chat.

## 3. IP / Indicator Intel

For IPs, domains, or hashes surfaced in the briefing (C2, malicious infra, threat actor infra).

- [ ] **Criminal IP** — https://www.criminalip.io — IP/domain risk + attack surface
- [ ] **Unified Search (IntelTechniques / SynapsInt)** — pivot across selectors
- [ ] cross-reference with the board's Unified Search + Search Engines sections

Output: reputation, open ports/services, associated malicious activity per indicator.

---

## Notes

- Full tool index by category: PAI memory `reference-osint4all-index`.
- Sensitive lookups (client domains, real breach data) run on the local stack
  (mac-studio LM Studio, tailnet) — never cloud. See PAI feedback
  `feedback-us-origin-llms-only` and the no-secrets-in-chat rule.
- This is an operator checklist, not an automated feed. A future tool-calling
  step in the pulsar listener could run tiers 1 and 3 headless against a fixed
  CVE/IP watchlist; tier 2 stays manual (needs a target list).
