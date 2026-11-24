#!/bin/bash
# Stops the interview platform, the exercise apps started from the terminal and the tunnel.
# Only touches processes that belong to this repository (by port or by working directory).

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
killed=0

kill_pid() {
  kill -9 "$1" 2>/dev/null && killed=$((killed + 1))
}

for port in 3000 3001 3099 3002 5173 5174; do
  for pid in $(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null); do
    cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')
    case "$cwd" in "$ROOT"*) kill_pid "$pid" ;; esac
  done
done

for pid in $(pgrep -f "tsx|next|vite|nodemon|node " 2>/dev/null); do
  [ "$pid" = "$$" ] && continue
  cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')
  case "$cwd" in "$ROOT"*) kill_pid "$pid" ;; esac
done

if [ -f "$ROOT/.logs/terminal-pids.txt" ]; then
  while IFS= read -r pid; do
    [ -n "$pid" ] && kill_pid "$pid"
  done < "$ROOT/.logs/terminal-pids.txt"
  rm -f "$ROOT/.logs/terminal-pids.txt"
fi

pkill -f "ngrok http 3000" 2>/dev/null
pkill -f "cloudflared tunnel --url http://127.0.0.1:3000" 2>/dev/null

if [ "$killed" -gt 0 ]; then
  echo "Stopped $killed process(es)."
else
  echo "Nothing was running."
fi

if [ -t 1 ] && [ -z "$TRIO_QUIET_STOP" ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; GREEN=$'\033[32m'; CYAN=$'\033[36m'; NC=$'\033[0m'
  echo ""
  echo "${BOLD}Keep the candidate's work${NC}"
  echo "  ${CYAN}make export${NC}   zip with the code, every chat and a viewer ${DIM}(exports/)${NC}"
  echo "  ${DIM}Non interactive:${NC} make export CANDIDATE=<name> EXERCISE=<id>"
  echo ""
  echo "${BOLD}Then evaluate it${NC}"
  echo "  Ask your agent (Claude Code, OpenCode, ...) to run the ${GREEN}evaluate-candidate${NC} skill on the export:"
  echo "  what was built, how far they got and how they used the AI assistant."
  echo ""
fi
