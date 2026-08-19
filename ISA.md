---
project: security-updates-site
task: Build a GitHub Pages site that shows all daily briefings and lets a user run through them
effort: E3
phase: execute
progress: 0/34
mode: algorithm
started: 2026-08-19T00:00:00Z
updated: 2026-08-19T00:00:00Z
---

# ISA — Daily Security Briefing Reader Site

## Problem

The briefings live only as raw markdown files in `briefings/`. There is no way to browse them, read them comfortably, or step through the backlog. A reader must open GitHub file-by-file.

## Vision

Open one URL and see the full archive at a glance. Click any date, or press "Start reading" and flow through every briefing with arrow keys, watching a progress bar fill as read dates accumulate. New briefings appear the morning they publish, with zero rebuild.

## Out of Scope

No server, no build step, no accounts, no comments, no search index service, no analytics, no editing of briefing content, no RSS generation.

## Constraints

- Single self-contained `docs/index.html` — inline CSS/JS, no external libraries or CDNs.
- Data comes live from the public repo: GitHub contents API for the list (1 call), raw.githubusercontent.com for bodies (no rate limit).
- Read state is client-side localStorage only.
- Served by GitHub Pages from `docs/` on `main`.

## Goal

A live GitHub Pages URL that lists all briefings in the repo, renders any briefing readably, and supports a sequential read-through flow with next/prev navigation, keyboard arrows, and persistent read tracking.

## Criteria

- [ ] ISC-1: `docs/index.html` exists in the repo
- [ ] ISC-2: File contains zero external `<script src>` / `<link href>` to third-party hosts
- [ ] ISC-3: Page fetches briefing list from `api.github.com/repos/jordanbeck8/security-updates/contents/briefings`
- [ ] ISC-4: Briefing bodies fetched from `raw.githubusercontent.com` (not the API)
- [ ] ISC-5: Archive view renders one entry per briefing file
- [ ] ISC-6: Entries sorted newest-first in archive view
- [ ] ISC-7: Each entry shows a human-readable date (weekday, month, day, year)
- [ ] ISC-8: Clicking an entry opens that briefing rendered as HTML
- [ ] ISC-9: Renderer converts `#`/`##` headings to h1/h2
- [ ] ISC-10: Renderer converts `**bold**` spans
- [ ] ISC-11: Renderer converts `- item` lines to `<ul><li>`
- [ ] ISC-12: Bare URLs and `label: url` source lines become clickable links opening in a new tab
- [ ] ISC-13: `---` lines render as section dividers
- [ ] ISC-14: Renderer HTML-escapes content before transforming (no raw HTML injection from briefing text)
- [ ] ISC-15: Reader view has a Next button that advances to the next (newer) briefing
- [ ] ISC-16: Reader view has a Previous button that goes to the older briefing
- [ ] ISC-17: ArrowRight / ArrowLeft keys navigate next/previous in reader view
- [ ] ISC-18: Escape key returns to the archive view
- [ ] ISC-19: Opening a briefing marks it read in localStorage
- [ ] ISC-20: Read dates show a visual read indicator in the archive list
- [ ] ISC-21: A progress bar / counter shows "N of TOTAL read"
- [ ] ISC-22: "Start reading" control opens the oldest unread briefing
- [ ] ISC-23: "Mark all unread" reset control exists
- [ ] ISC-24: Reader shows position context ("X / TOTAL") while running through
- [ ] ISC-25: Deep-linkable — URL hash `#YYYY-MM-DD` opens that briefing on load
- [ ] ISC-26: Fetch failure shows a readable error message, not a blank page
- [ ] ISC-27: Layout usable at 375px width (no horizontal page scroll)
- [ ] ISC-28: Dark theme (site is a security briefing reader; matches OSINT tooling aesthetic)
- [ ] ISC-29: Site pushed to `main` on GitHub
- [ ] ISC-30: GitHub Pages enabled, building from `main` `/docs`
- [ ] ISC-31: Live URL returns HTTP 200
- [ ] ISC-32: Live page loads briefing list (verified in real browser, console clean of errors)
- [ ] ISC-33: Anti: no briefing content is modified, no files under `briefings/` touched
- [ ] ISC-34: Anti: page makes at most one github API call per load (rate-limit safety)

## Test Strategy

isc | type | check | tool
1-2 | file | read file, grep externals | Read/Grep
3-4,34 | code | grep fetch targets | Grep
5-28 | ui | live browser probe + DOM reads | Browser preview
29-31 | deploy | git log origin, gh api pages, curl -I | Bash
32 | live | browser console + rendered list | Browser preview
33 | anti | git status shows briefings/ untouched | Bash

## Features

name | satisfies | depends_on | parallelizable
archive-list | ISC-5..8,20..21 | data-fetch | no
markdown-renderer | ISC-9..14 | none | yes
reader-flow | ISC-15..19,22..25 | archive-list | no
deploy-pages | ISC-29..32 | all | no

## Decisions

- 2026-08-19: Single-file static page over Astro/Next — repo already has a daily publish pipeline; site must never need a rebuild. Live API list + raw bodies means new briefings appear automatically.
- 2026-08-19: Delegation floor relaxed (show-your-math): one self-contained HTML file, single-author; spawning Forge/agents adds coordination cost with no correctness gain on a ~600-line artifact.
- 2026-08-19: Custom ~60-line renderer over marked.js — external CDN violates self-containment; briefing markdown uses only 6 constructs.

## Verification

(populated at VERIFY)
