#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP_DIR="$(mktemp -d)"
PROJECT_ROOT="$TMP_DIR/project"
ARTIFACTS_DIR="$PROJECT_ROOT/_bmad-output/implementation-artifacts"
EVENTS_LOG="$TMP_DIR/events.log"
FAKE_EVENT_BUS="$TMP_DIR/event-bus.sh"

cleanup_test() {
  rm -rf "$TMP_DIR"
}

trap cleanup_test EXIT

mkdir -p "$ARTIFACTS_DIR"
printf '0\n' > "$ARTIFACTS_DIR/generation.lock"

cat > "$FAKE_EVENT_BUS" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$EVENTS_LOG"
EOF
chmod +x "$FAKE_EVENT_BUS"

export TASK_MONITOR_LIB_ONLY=1
# shellcheck source=/dev/null
source "$ROOT/.claude/skills/bmad-master-control/task-monitor.sh" "$PROJECT_ROOT" "tmux-test" 1 0
trap cleanup_test EXIT

EVENT_BUS="$FAKE_EVENT_BUS"

pane_alive() {
  return 0
}

capture_pane_tail() {
  printf 'worker still running\n'
}

PANE_ID="%1"
SCOPE_KEY="3-2|${PANE_ID}|creating"
LOG_FILE_PATH="$MC_LOG_DIR/pane-1.log"
mkdir -p "$MC_LOG_DIR"

printf 'When done, print exactly this as the final line with nothing after it:\nMC_DONE CREATE 3-2 CREATED\n' > "$LOG_FILE_PATH"
CURSOR_VALUE="$(wc -c < "$LOG_FILE_PATH" | tr -d '[:space:]')"
write_log_cursor "$PANE_ID" "$CURSOR_VALUE"

EMITTED="$(analyze_pane "3-2" "$PANE_ID" "creating" "0")"
[[ "$EMITTED" == "0" ]] || {
  echo "expected pre-worker sentinel to be ignored, got: $EMITTED" >&2
  exit 1
}

is_new_signal "$SCOPE_KEY" "STATE:WORKER_RUNNING" >/dev/null

printf 'noise\nMC_DONE\x1b[1CCREATE\x1b[1C3-2\x1b[1CCREATED\r\n' >> "$LOG_FILE_PATH"
CURSOR_VALUE="$(wc -c < "$LOG_FILE_PATH" | tr -d '[:space:]')"
write_log_cursor "$PANE_ID" "$CURSOR_VALUE"

EMITTED="$(analyze_pane "3-2" "$PANE_ID" "creating" "0")"
[[ "$EMITTED" == "1" ]] || {
  echo "expected ANSI-split sentinel to be recovered, got: $EMITTED" >&2
  exit 1
}

grep -q 'PANE_SIGNAL_DETECTED' "$EVENTS_LOG" || {
  echo "expected PANE_SIGNAL_DETECTED event" >&2
  exit 1
}

grep -q 'MC_DONE_CREATE' "$EVENTS_LOG" || {
  echo "expected MC_DONE_CREATE signal payload" >&2
  exit 1
}

echo "task-monitor ansi sentinel recovery: PASS"
