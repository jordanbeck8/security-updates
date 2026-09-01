#!/usr/bin/env bash
# Daily Security Briefing — generate (RSS + local LLM) → push to GitHub → deliver to Slack.
# Run by cron on pulsar (America/New_York). Idempotent. Logs to briefings/.log.
# Ends with a heartbeat DM to Jordan (dead-man's switch: no morning ping = something broke).
set -uo pipefail
export PATH="$HOME/.bun/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
cd "$HOME/security-updates" || exit 1
LOG="briefings/.log"
say() { echo "[$(date -Is)] $*" >> "$LOG"; }

# Slack heartbeat -> DM Jordan (U0BCREP6BU3) via the pulsarrunner bot token.
heartbeat() {
  local text="$1" tok ch
  tok=$(grep -E '^SLACK_BOT_TOKEN=' .env | cut -d= -f2- | tr -d '"')
  [ -z "$tok" ] && return
  ch=$(curl -s -m 10 -H "Authorization: Bearer $tok" -H 'Content-Type: application/json' \
        -d '{"users":"U0BCREP6BU3"}' https://slack.com/api/conversations.open \
        | python3 -c "import sys,json;print(json.load(sys.stdin).get('channel',{}).get('id',''))" 2>/dev/null)
  [ -z "$ch" ] && { say "heartbeat: could not open DM"; return; }
  curl -s -m 10 -o /dev/null -H "Authorization: Bearer $tok" -H 'Content-Type: application/json' \
        -d "$(python3 -c 'import json,sys;print(json.dumps({"channel":sys.argv[1],"text":sys.argv[2]}))' "$ch" "$text")" \
        https://slack.com/api/chat.postMessage
}

say "run-daily START"

# Sync with origin BEFORE generating. Without this, any push from another machine
# (e.g. mac-studio) leaves this clone permanently behind: generate_briefing.ts commits
# locally, the non-fast-forward push is rejected, and the briefing is stranded here
# forever because the next run sees the file on disk and skips. That silently cost
# 2026-08-21/24/26 until 2026-09-01. --autostash keeps local edits out of the way.
git pull --rebase --autostash origin main >> "$LOG" 2>&1 \
  && say "pull --rebase ok" \
  || say "WARN pull --rebase failed — push may be rejected below"

# ── LLM preflight ─────────────────────────────────────────────────────────────
# The briefing model lives on mac-studio behind LM Studio. Its JIT default context was
# 107776, which costs ~46 GB at parallel 4 and made every load 400 with "insufficient
# system resources" — that silently killed this job for 13 days (2026-08-19 → 09-01).
# The real fix is on mac-studio (per-model default contextLength = 16384, re-asserted at
# login by ~/.lmstudio/jbeck-autostart.sh). This end proves the lane serves BEFORE burning
# four sections, and on failure triggers that same script remotely (see self-heal below)
# via a key restricted to exactly that one command — no shell, no pty, no forwarding.
preflight() {
  local tok base model body
  tok=$(grep -E '^LLM_TOKEN=' .env | cut -d= -f2- | tr -d '"')
  base=$(grep -E '^LLM_BASE=' .env | cut -d= -f2- | tr -d '"')
  base=${base:-http://mac-studio:1234/v1}
  model=${LLM_MODEL:-google/gemma-4-31b-qat}
  body=$(curl -s -m 240 -X POST "$base/chat/completions" \
    -H "Authorization: Bearer $tok" -H 'Content-Type: application/json' \
    -d "{\"model\":\"$model\",\"messages\":[{\"role\":\"user\",\"content\":\"ok\"}],\"max_tokens\":1500,\"reasoning_effort\":\"low\"}")
  if printf '%s' "$body" | grep -q '"error"'; then
    PREFLIGHT_ERR=$(printf '%s' "$body" | python3 -c "import sys,json;print(json.load(sys.stdin).get('error',{}).get('message','')[:300])" 2>/dev/null)
    return 1
  fi
  return 0
}

PREFLIGHT_ERR=""
if ! preflight; then
  say "PREFLIGHT FAILED: $PREFLIGHT_ERR"
  # Self-heal: re-assert the JIT context default on mac-studio and re-pin the model.
  # The key is restricted (restrict,command=...) to jbeck-autostart.sh only — it cannot
  # obtain a shell, forward ports, or run anything else on the Mac Studio.
  say "attempting remote re-assert on mac-studio"
  if timeout 300 ssh -i "$HOME/.ssh/id_ed25519_macstudio" -o ConnectTimeout=10 -o BatchMode=yes \
       personal@mac-studio >>"$LOG" 2>&1; then
    say "remote re-assert ok — retrying preflight"
    if preflight; then
      say "preflight ok after self-heal"
    else
      say "PREFLIGHT STILL FAILING after self-heal: $PREFLIGHT_ERR"
      heartbeat ":rotating_light: Daily briefing ABORTED on pulsar — LLM lane unusable and self-heal did not fix it.
Cause: ${PREFLIGHT_ERR}
Remote re-assert ran on mac-studio but the lane still fails. Needs hands-on."
      say "run-daily END (preflight abort)"
      exit 1
    fi
  else
    say "remote re-assert FAILED (ssh)"
    heartbeat ":rotating_light: Daily briefing ABORTED on pulsar — LLM lane down and could not reach mac-studio to self-heal.
Cause: ${PREFLIGHT_ERR}"
    say "run-daily END (preflight abort)"
    exit 1
  fi
fi
say "preflight ok — LLM lane serving"

bun generate_briefing.ts >> "$LOG" 2>&1; gen=$?
say "generate exit=$gen"
bun deliver.ts >> "$LOG" 2>&1; del=$?
say "deliver exit=$del"

# Catch-up push: if an earlier run committed a briefing but could not push it, the
# generator will not retry (the file exists, so it exits 0 early). Push anything the
# local branch is still ahead by, every run.
push=0
if [ -n "$(git log --oneline origin/main..main 2>/dev/null)" ]; then
  n=$(git log --oneline origin/main..main | wc -l | tr -d ' ')
  say "catch-up: $n unpushed commit(s) — pushing"
  git push origin main >> "$LOG" 2>&1; push=$?
  say "catch-up push exit=$push"
fi

say "run-daily END (gen=$gen deliver=$del push=$push)"

D=$(TZ=America/New_York date -d 'yesterday' +%F 2>/dev/null || date +%F)
if [ "$gen" -eq 0 ] && [ "$del" -eq 0 ] && [ "$push" -eq 0 ]; then
  heartbeat ":white_check_mark: Daily briefing $D shipped (pulsar)."
else
  heartbeat ":warning: Daily briefing FAILED on pulsar (generate=$gen deliver=$del push=$push) — check briefings/.log"
fi
exit $(( gen != 0 ? gen : (del != 0 ? del : push) ))
