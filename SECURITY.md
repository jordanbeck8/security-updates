# Security Policy

## Reporting a Vulnerability

If you discover a security issue in this repository — whether in the briefing
generation script, the published briefings themselves, or the disclosure of any
sensitive information committed by accident — please report it privately rather
than opening a public issue.

**Contact:** jordantb08@gmail.com

Please include:
- A description of the issue
- Steps to reproduce (if applicable)
- The commit SHA you observed it on
- Whether you would like public credit on resolution

I aim to acknowledge reports within 5 business days. There is no bug bounty.

## Scope

This repository contains:
- A single Bun/TypeScript script (`generate_briefing.ts`) that generates daily
  open-source intelligence briefings using LLM agents and public web sources
- Daily briefing markdown files under `briefings/`
- Configuration and a curated source list (`osint-sources.md`)

In-scope concerns include: secret leakage, prompt-injection routes that affect
published content, supply-chain risks in the script's runtime, and any
disclosure of personally identifiable information.

Out of scope: opinions or factual disagreements about the briefing content itself.

## Supported Versions

Only the `main` branch is supported. Older briefings are archival and will not
receive retroactive content edits except for serious factual or PII issues.
