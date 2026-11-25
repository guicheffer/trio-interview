#!/bin/bash
# Starts the interview platform. Quiet by default (progress bar); pass --log to see all logs.

LOG_MODE=0
for arg in "$@"; do
  [ "$arg" = "--log" ] && LOG_MODE=1
done

GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
BLUE=$'\033[0;34m'
RED=$'\033[0;31m'
DIM=$'\033[2m'
BOLD=$'\033[1m'
NC=$'\033[0m'

TOTAL_STEPS=6
STEP=0
mkdir -p .logs

# How wide the progress line may be: the terminal's width, or 80 when it cannot be read. A line wider than the terminal wraps,
# and then each redraw with \r starts a new line instead of replacing the last one.
term_cols() {
  local c="${COLUMNS:-}"
  [ -z "$c" ] && c=$(tput cols 2>/dev/null)
  case "$c" in ''|*[!0-9]*) c=80 ;; esac
  echo "$c"
}

# bar <done> [width]: the bar is 24 wide when there is room and shrinks (never below 6) when there is not
bar() {
  local done=$1 width=${2:-24} filled i out=""
  filled=$(( done * width / TOTAL_STEPS ))
  for ((i = 0; i < width; i++)); do
    if [ $i -lt $filled ]; then out+="█"; else out+="░"; fi
  done
  printf '%s' "$out"
}

# progress_layout <label>: prints "<bar width> <label>" for the width of this terminal. The fixed parts of the line are
# 2 spaces, the spinner, 2 spaces, the bar, 2 spaces, "N/N" and 2 spaces: 12 columns plus the bar and the label.
progress_layout() {
  local label="$1" cols room width=24
  cols=$(term_cols)
  room=$(( cols - 14 ))                      # the 12 fixed columns and 2 spare, so the cursor never lands on the wrap
  if [ $(( width + ${#label} )) -gt $room ]; then width=$(( room - ${#label} )); fi
  [ $width -gt 24 ] && width=24
  if [ $width -lt 6 ]; then                  # no room for a useful bar: keep 6 and cut the label instead
    width=6
    local keep=$(( room - width ))
    [ $keep -lt 1 ] && keep=1
    label="${label:0:$keep}"
  fi
  printf '%s %s' "$width" "$label"
}

help_hint() {
  echo -e "${YELLOW}Still stuck? The logs are in .logs/, and SECURITY.md and docs/details.md cover the usual problems.${NC}"
}

TIMEOUT_FLAG=".logs/step-timeout.flag"

# Runs a command and stops it after STEP_LIMIT seconds (exit code 124), so a step can never hang the whole start
run_limited() {
  "$@" &
  local pid=$!
  ( sleep "${STEP_LIMIT:-120}"; kids=$(pgrep -P "$pid" 2>/dev/null); touch "$TIMEOUT_FLAG"; kill -TERM "$pid" $kids 2>/dev/null ) >/dev/null 2>&1 &
  local watchdog=$!
  wait "$pid"
  local code=$?
  kill "$watchdog" 2>/dev/null
  wait "$watchdog" 2>/dev/null
  if [ -f "$TIMEOUT_FLAG" ]; then rm -f "$TIMEOUT_FLAG"; code=124; fi
  return $code
}

# run_step "label" command [args...]   (set STEP_LIMIT=seconds before it; default 120)
# Quiet mode: one progress line that updates in place; the command output goes to .logs/step.log.
run_step() {
  local label="$1"; shift
  STEP=$((STEP + 1))
  local code
  if [ "$LOG_MODE" = "1" ]; then
    echo -e "${BLUE}[$STEP/$TOTAL_STEPS] $label${NC}"
    run_limited "$@"
    code=$?
    if [ $code -ne 0 ]; then
      [ $code -eq 124 ] && echo -e "${RED}Timed out after ${STEP_LIMIT:-120}s: $label${NC}"
      help_hint
    fi
    return $code
  fi
  run_limited "$@" > .logs/step.log 2>&1 &
  local pid=$! frames='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏' i=0
  printf '\033[?25l'
  while kill -0 "$pid" 2>/dev/null; do
    read -r bw shown <<< "$(progress_layout "$label")"
    printf '\r  %s%s%s  %s  %s/%s  %s\033[K' "$BLUE" "${frames:$((i % 10)):1}" "$NC" "$(bar $((STEP - 1)) "$bw")" "$STEP" "$TOTAL_STEPS" "$shown"
    i=$((i + 1))
    sleep 0.1
  done
  wait "$pid"
  code=$?
  printf '\033[?25h'
  if [ $code -ne 0 ]; then
    local reason="failed"
    [ $code -eq 124 ] && reason="timed out"
    printf '\r  %s%s%s  %s\033[K\n\n' "$RED" "$reason" "$NC" "$label"
    cat .logs/step.log
    help_hint
  fi
  return $code
}

finish_bar() {
  [ "$LOG_MODE" = "1" ] && return
  read -r bw shown <<< "$(progress_layout "Ready")"
  printf '\r  %sok%s  %s  %s/%s  %s\033[K\n' "$GREEN" "$NC" "$(bar $TOTAL_STEPS "$bw")" "$TOTAL_STEPS" "$TOTAL_STEPS" "$shown"
}

trap 'printf "\033[?25h"' EXIT

echo -e "${BOLD}Trio, live coding interviews${NC}"
[ "$LOG_MODE" = "0" ] && echo -e "${DIM}Quiet mode. Use --log (make start LOG=1) to see all logs.${NC}"
echo ""

# Newest exercises first (last commit touching the folder)
# interview.config.yaml (made by make config) can limit the list. No file, or no "exercises:" entries, offers all of them.
configured_exercises() {
  [ -f interview.config.yaml ] || return 0
  awk '/^exercises:/ {on=1; next} /^[^ #-]/ {on=0} on && /^[[:space:]]*-[[:space:]]/ {sub(/^[[:space:]]*-[[:space:]]*/, ""); gsub(/["'"'"']/, ""); print}' interview.config.yaml
}
CONFIGURED_EXERCISES=$(configured_exercises)

list_exercises() {
  for dir in exercises/*/; do
    id=$(basename "$dir")
    [ -f "$dir/description.md" ] || continue
    if [ -n "$CONFIGURED_EXERCISES" ] && ! echo "$CONFIGURED_EXERCISES" | grep -qx -- "$id"; then continue; fi
    ts=$(git log -1 --format=%ct -- "$dir" 2>/dev/null)
    title=$(grep -m1 '^# ' "$dir/description.md" | sed 's/^# *//')
    printf '%s\t%s\t%s\n' "${ts:-0}" "$id" "${title:-$id}"
  done | sort -rn
}

if [ -z "$EXERCISE_PATH" ]; then
    ALL_EXERCISES=$(list_exercises)
    FILTER=""
    while true; do
        if [ -n "$FILTER" ]; then
            MATCHES=$(echo "$ALL_EXERCISES" | grep -i -- "$FILTER")
        else
            MATCHES="$ALL_EXERCISES"
        fi
        TOTAL_MATCHES=$(echo "$MATCHES" | grep -c .)
        SHOWN=$(echo "$MATCHES" | head -10)
        EXERCISE_IDS=()
        echo ""
        echo -e "${BOLD}Exercises${NC} ${DIM}(newest first${FILTER:+, filter: $FILTER})${NC}"
        i=0
        while IFS=$'\t' read -r ts id title; do
            [ -z "$id" ] && continue
            i=$((i + 1))
            EXERCISE_IDS+=("$id")
            printf '  %d. %-22s %s\n' "$i" "$id" "$title"
        done <<< "$SHOWN"
        [ "$TOTAL_MATCHES" -gt 10 ] && echo -e "  ${DIM}+$((TOTAL_MATCHES - 10)) more, type text to filter${NC}"
        [ "$TOTAL_MATCHES" -eq 0 ] && echo -e "  ${YELLOW}No exercise matches \"$FILTER\"${NC}"
        echo ""
        read -p "Number, or text to filter [1]: " ANSWER
        ANSWER=${ANSWER:-1}
        if [[ "$ANSWER" =~ ^[0-9]+$ ]] && [ "$ANSWER" -ge 1 ] && [ "$ANSWER" -le "${#EXERCISE_IDS[@]}" ]; then
            EXERCISE_ID="${EXERCISE_IDS[$((ANSWER - 1))]}"
            break
        fi
        FILTER="$ANSWER"
    done

    export EXERCISE_PATH="$(pwd)/exercises/$EXERCISE_ID"
    export EXERCISE_ID
    echo -e "Selected ${BOLD}$EXERCISE_ID${NC}"
    echo ""
fi
EXERCISE_ID=${EXERCISE_ID:-$(basename "$EXERCISE_PATH")}
export EXERCISE_ID

step_preflight() { node scripts/preflight.mjs; }
STEP_LIMIT=90 run_step "Checking your setup" step_preflight || exit 1
# Reports whether the settings in interview.config.yaml match this machine. It only warns, it never stops an interview.
step_config() { npx tsx scripts/config.ts --check; }
if [ "$LOG_MODE" = "1" ]; then step_config || true; else step_config > .logs/config-check.log 2>&1 || echo -e "${YELLOW}Some interview settings need a look (run: make config CHECK=1)${NC}"; fi
export TRIO_PREFLIGHT_DONE=1

# A new secret for every interview. It lives only in the environment of the servers and in the link below, never on disk.
# The candidate link carries it after a #; the servers answer a candidate only when it is there, so an old link
# or a guessed address gets nothing (the tunnel address itself stays the same with a free ngrok account).
TRIO_ACCESS_TOKEN=$(node -e 'process.stdout.write(require("crypto").randomBytes(16).toString("hex"))')
export TRIO_ACCESS_TOKEN

step_cleanup() {
  for port in 3000 3001 3099; do lsof -ti:$port | xargs kill -9 2>/dev/null || true; done
  pkill -f "tsx cli/index.ts" 2>/dev/null || true
  pkill -f "next dev" 2>/dev/null || true
  sleep 1
  return 0
}
STEP_LIMIT=20 run_step "Cleaning up old processes" step_cleanup

# Install the exercise's dependencies now so Run is fast later (never fatal)
step_install() {
  local cfg="$EXERCISE_PATH/exercise.json"
  [ -f "$cfg" ] || return 0
  local cmd
  cmd=$(node -e 'try{const c=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write((c.run||{}).install||"")}catch{}' "$cfg")
  [ -z "$cmd" ] && return 0
  (cd "$EXERCISE_PATH" && bash -c "$cmd") > .logs/exercise-install.log 2>&1 || echo "Exercise install failed, see .logs/exercise-install.log"
  return 0
}
STEP_LIMIT=300 run_step "Installing the exercise" step_install

# interview.config.yaml (made by make config) says which tunnel to open: ngrok (the default), cloudflared or none
configured_tunnel() {
  local value=""
  [ -f interview.config.yaml ] && value=$(awk '/^tunnel:/ {sub(/^tunnel:[[:space:]]*/, ""); sub(/[[:space:]]*#.*$/, ""); gsub(/["'"'"']/, ""); print tolower($0); exit}' interview.config.yaml)
  case "$value" in ngrok|cloudflared|none) echo "$value" ;; *) echo "ngrok" ;; esac
}
WANTED_TUNNEL=$(configured_tunnel)
TUNNEL_TYPE="none"
if [ "$WANTED_TUNNEL" != "none" ] && command -v "$WANTED_TUNNEL" &> /dev/null; then
    TUNNEL_TYPE="$WANTED_TUNNEL"
fi

npm run interview > .logs/startup.log 2>&1 &
INTERVIEW_PID=$!
TAIL_PID=""
if [ "$LOG_MODE" = "1" ]; then
    tail -f .logs/startup.log &
    TAIL_PID=$!
fi

step_servers() {
  for i in $(seq 1 90); do
    kill -0 "$INTERVIEW_PID" 2>/dev/null || { echo "The interview process exited. See .logs/startup.log"; tail -40 .logs/startup.log; return 1; }
    if curl -s http://localhost:3001/health > /dev/null 2>&1 && curl -s http://localhost:3000 > /dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "Servers did not answer in time. See .logs/startup.log"
  tail -40 .logs/startup.log
  return 1
}
if ! STEP_LIMIT=110 run_step "Starting servers" step_servers; then
    [ -n "$TAIL_PID" ] && kill $TAIL_PID 2>/dev/null
    kill $INTERVIEW_PID 2>/dev/null
    exit 1
fi

AI_RESULT_FILE=.logs/ai-status.txt
rm -f "$AI_RESULT_FILE"
step_ai() {
  if [ "$TRIO_SKIP_HEALTHCHECK" = "1" ]; then echo "skipped" > "$AI_RESULT_FILE"; return 0; fi
  local status=""
  for i in $(seq 1 45); do
    status=$(curl -s http://localhost:3001/api/ai-status)
    case "$status" in *'"ok":true'*|*'"ok":false'*) break ;; esac
    sleep 2
  done
  echo "$status" > "$AI_RESULT_FILE"
  return 0
}
STEP_LIMIT=100 run_step "Checking the AI assistant" step_ai

TUNNEL_PID=""
TUNNEL_URL=""
TUNNEL_URL_FILE=.logs/tunnel-url.txt
rm -f "$TUNNEL_URL_FILE"

if [ "$TUNNEL_TYPE" = "ngrok" ]; then
    ngrok http 3000 --log=stdout > .logs/ngrok.log 2>&1 &
    TUNNEL_PID=$!
elif [ "$TUNNEL_TYPE" = "cloudflared" ]; then
    # A quick tunnel: no account. http2 because many networks block the UDP that QUIC needs, which delays the connection.
    cloudflared tunnel --url http://127.0.0.1:3000 --protocol http2 --no-autoupdate > .logs/cloudflared.log 2>&1 &
    TUNNEL_PID=$!
fi

step_tunnel() {
  [ "$TUNNEL_TYPE" = "none" ] && return 0
  local url=""
  for i in $(seq 1 15); do
    if [ "$TUNNEL_TYPE" = "cloudflared" ]; then
      url=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' .logs/cloudflared.log 2>/dev/null | head -1)
    else
      url=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | grep -o '"public_url":"https://[^"]*' | head -1 | cut -d'"' -f4)
    fi
    if [ -z "$url" ] && grep -q "ERR_NGROK_4018\|authentication failed" .logs/ngrok.log 2>/dev/null; then
      echo "auth" > "$TUNNEL_URL_FILE"; return 0
    fi
    [ -n "$url" ] && break
    sleep 2
  done
  [ -n "$url" ] && echo "$url" > "$TUNNEL_URL_FILE"
  return 0
}
STEP_LIMIT=60 run_step "Opening the tunnel" step_tunnel

[ -n "$TAIL_PID" ] && kill $TAIL_PID 2>/dev/null
finish_bar
echo ""

AI_STATUS=$(cat "$AI_RESULT_FILE" 2>/dev/null)
case "$AI_STATUS" in
    skipped) ;;
    *'"ok":true'*)
        echo -e "${GREEN}AI assistant works${NC}" ;;
    *'"ok":false'*)
        AI_MSG=$(echo "$AI_STATUS" | sed -n 's/.*"message":"\([^"]*\)".*/\1/p')
        echo -e "${RED}The AI assistant is NOT working: ${AI_MSG}${NC}"
        echo -e "${RED}Candidates will not be able to use the chat until this is fixed.${NC}"
        help_hint ;;
    *)
        echo -e "${YELLOW}No answer from the AI check yet, see .logs/backend.log${NC}"
        help_hint ;;
esac

# One line per terminal assistant, from the running server (the same words as make config CHECK=1): installed, version, login, sandbox.
# Only this machine can ask for the reasons, a candidate is only ever told "not available right now".
if [ "$TRIO_SKIP_HEALTHCHECK" != "1" ]; then
    for i in $(seq 1 20); do
        ASSISTANTS=$(curl -s http://localhost:3001/api/agent-mode 2>/dev/null)
        case "$ASSISTANTS" in *'"ok":null'*) sleep 1 ;; *) break ;; esac
    done
    echo "$ASSISTANTS" | node -e '
      let t = ""; process.stdin.on("data", d => t += d).on("end", () => {
        try {
          for (const a of JSON.parse(t).tools) {
            const green = "\x1b[32m", yellow = "\x1b[33m", dim = "\x1b[2m", off = "\x1b[0m";
            if (!a.allowed) console.log(dim + (a.line || a.tool) + "  [off in your settings]" + off);
            else console.log((a.ok ? green : yellow) + (a.line || a.tool + ": not checked") + off);
          }
          console.log("\x1b[2mCodex: coming soon (shown disabled in the picker)\x1b[0m");
        } catch { /* the server did not answer; the AI check above already said so */ }
      });' || true
fi

echo ""

TUNNEL_URL=$(cat "$TUNNEL_URL_FILE" 2>/dev/null)
if [ "$TUNNEL_URL" = "auth" ]; then
    TUNNEL_URL=""
    echo -e "${YELLOW}ngrok needs a free account: sign up with GitHub or Google at https://dashboard.ngrok.com/signup, copy your authtoken from https://dashboard.ngrok.com/get-started/your-authtoken and run:${NC}"
    echo -e "${YELLOW}  ngrok config add-authtoken <token>${NC}"
    kill $TUNNEL_PID 2>/dev/null
    TUNNEL_PID=""
    TUNNEL_TYPE="none"
fi

# A box around the one thing the interviewer has to send, so it is not mistaken for the other lines
print_box() {
    local title="$1" text="$2"
    local inner=${#text}
    [ $inner -lt $(( ${#title} + 4 )) ] && inner=$(( ${#title} + 4 ))
    local top_fill; top_fill=$(printf '%*s' $(( inner - ${#title} - 1 )) '' | tr ' ' '─')
    local bottom; bottom=$(printf '%*s' $(( inner + 2 )) '' | tr ' ' '─')
    local pad; pad=$(printf '%*s' $(( inner - ${#text} )) '')
    echo -e "  ${GREEN}${BOLD}┌─ ${title} ${top_fill}┐${NC}"
    echo -e "  ${GREEN}${BOLD}│${NC} ${YELLOW}${BOLD}${text}${NC}${pad} ${GREEN}${BOLD}│${NC}"
    echo -e "  ${GREEN}${BOLD}└${bottom}┘${NC}"
}

echo ""
echo -e "${BOLD}Interview platform is ready${NC}"
echo ""
echo -e "  You (interviewer)   ${GREEN}http://localhost:3000${NC}"
echo -e "  Dry run (candidate) ${YELLOW}http://candidate.localhost:3000/#k=${TRIO_ACCESS_TOKEN}${NC}  ${DIM}(this machine, no tunnel; Chrome or Firefox)${NC}"
if [ -n "$TUNNEL_URL" ]; then
    curl -s -X POST http://localhost:3001/api/platform-url \
        -H "Content-Type: application/json" \
        -d "{\"url\":\"$TUNNEL_URL\"}" > /dev/null 2>&1
    echo ""
    print_box "SEND THIS LINK TO THE CANDIDATE ($TUNNEL_TYPE)" "${TUNNEL_URL}/#k=${TRIO_ACCESS_TOKEN}"
    echo -e "  ${DIM}Send the whole link. It is new for every interview and the old ones stop working.${NC}"
    if [ "$TUNNEL_TYPE" = "cloudflared" ]; then
        echo -e "  ${YELLOW}A cloudflared quick tunnel holds back the chat's live stream (Agent mode). Claude Code, OpenCode and Pi in the terminal work. See SECURITY.md.${NC}"
    fi
elif [ "$TUNNEL_TYPE" != "none" ]; then
    echo -e "  Candidate           ${YELLOW}tunnel URL not detected, see .logs/${TUNNEL_TYPE}.log${NC}"
    help_hint
else
    if [ "$WANTED_TUNNEL" = "none" ]; then
        echo -e "  Candidate           ${DIM}no tunnel (tunnel: none in interview.config.yaml)${NC}"
    else
        echo -e "  Candidate           ${DIM}$WANTED_TUNNEL is not installed (brew install $WANTED_TUNNEL), or run make config to pick another${NC}"
    fi
fi
echo -e "${DIM}Tip: ask the candidate to share their screen too, it is more real time than Follow.${NC}"
echo -e "${DIM}The candidate picks the assistant (the chat, Claude Code or OpenCode) from what make config allows.${NC}"
echo ""

cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down...${NC}"
    [ -n "$INTERVIEW_PID" ] && kill $INTERVIEW_PID 2>/dev/null
    [ -n "$TUNNEL_PID" ] && kill $TUNNEL_PID 2>/dev/null
    TRIO_QUIET_STOP=1 ./scripts/stop.sh > /dev/null 2>&1
    echo -e "${GREEN}Done${NC}"
    echo ""
    echo -e "${BOLD}Keep the candidate's work${NC}"
    echo -e "  make export                 ${DIM}zip with the code, every chat and a viewer (exports/)${NC}"
    echo -e "  Then ask your agent (Claude Code, OpenCode, ...) to run the ${BOLD}evaluate-candidate${NC} skill on it,"
    echo -e "  or upload the zip wherever you keep interview material."
    echo ""
    exit 0
}
trap cleanup SIGINT SIGTERM

echo -e "${DIM}Press Ctrl+C to stop${NC}"
wait
