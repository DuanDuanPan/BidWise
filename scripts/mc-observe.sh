#!/usr/bin/env bash
# mc-observe.sh — spin up a dedicated tmux observation window for master-control
# Usage:
#   mc-observe.sh [session_name]
#
# Creates a new tmux window "mc-observe" with 4 panes:
#   ┌────────────────────┬────────────────────┐
#   │  1. event-log      │  2. daemon health  │
#   │  (truth source)    │  (monitor+watchdog)│
#   ├────────────────────┼────────────────────┤
#   │  3. gate-state +   │  4. deviation logs │
#   │     event stats    │  (alerts + runtime)│
#   └────────────────────┴────────────────────┘

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MC="$ROOT/.claude/skills/bmad-master-control"
ARTIFACTS="$ROOT/_bmad-output/implementation-artifacts"

resolve_runtime_dir() {
  local session_name generation runtime_dir
  session_name="$(ruby -ryaml -e 'gs = YAML.safe_load(File.read(ARGV[0])) rescue {}; puts gs["session_name"].to_s' "$ARTIFACTS/gate-state.yaml" 2>/dev/null || true)"
  generation="$(tr -d '[:space:]' < "$ARTIFACTS/generation.lock" 2>/dev/null || true)"
  if [[ -n "$session_name" && -n "$generation" ]]; then
    runtime_dir="$ARTIFACTS/runtime/${session_name}-g${generation}"
    if [[ -d "$runtime_dir" ]]; then
      printf '%s\n' "$runtime_dir"
      return
    fi
  fi
  printf '%s\n' "$ARTIFACTS"
}

# Resolve tmux session
if [[ -n "${1:-}" ]]; then
  SESSION="$1"
elif [[ -n "${TMUX:-}" ]]; then
  SESSION="$(tmux display-message -p '#{session_name}')"
else
  echo "mc-observe.sh: not in tmux and no session name given" >&2
  echo "Usage: mc-observe.sh [session_name]" >&2
  exit 1
fi

# Ensure artifacts dir exists (may not exist on cold start)
RUNTIME_DIR="$(resolve_runtime_dir)"
mkdir -p "$RUNTIME_DIR/mc-logs"

# Touch files so tail -F doesn't fail on first run
touch "$ARTIFACTS/event-log.yaml" \
      "$RUNTIME_DIR/task-monitor.log" \
      "$RUNTIME_DIR/watchdog-runtime.log" \
      "$ARTIFACTS/watchdog-alerts.yaml"

# ── Check for existing mc-observe window ──────────────────────────────────
if tmux list-windows -t "$SESSION" -F '#{window_name}' 2>/dev/null | grep -qx 'mc-observe'; then
  echo "mc-observe window already exists in session '$SESSION'. Selecting it."
  tmux select-window -t "$SESSION:mc-observe"
  exit 0
fi

# ── Create the window (pane 1: event log) ─────────────────────────────────
tmux new-window -t "$SESSION" -n "mc-observe" \
  "tail -F '$ARTIFACTS/event-log.yaml'"

# ── Pane 2 (right of pane 1): daemon health ──────────────────────────────
tmux split-window -t "$SESSION:mc-observe" -h \
  "bash -c 'while true; do
    clear
    echo \"=== DAEMON HEALTH ===\"
    echo
    echo \"--- task-monitor ---\"
    \"$MC/monitor-control.sh\" status \"$ROOT\" 2>&1 || true
    echo
    echo \"--- watchdog ---\"
    \"$MC/watchdog-control.sh\" status \"$ROOT\" \"$SESSION\" 2>&1 || true
    echo
    date \"+%H:%M:%S\"
    sleep 3
  done'"

# ── Pane 3 (below pane 1): gate-state + event stats ─────────────────────
tmux select-pane -t "$SESSION:mc-observe.0"
tmux split-window -t "$SESSION:mc-observe.0" -v \
  "bash -c 'while true; do
    clear
    echo \"=== GATE STATE (head 80) ===\"
    head -80 \"$ARTIFACTS/gate-state.yaml\" 2>/dev/null || echo \"(no gate-state.yaml)\"
    echo
    echo \"=== EVENT BUS STATS ===\"
    \"$MC/event-bus.sh\" stats \"$ROOT\" 2>&1 || true
    echo
    date \"+%H:%M:%S\"
    sleep 3
  done'"

# ── Pane 4 (below pane 2): deviation logs ───────────────────────────────
tmux select-pane -t "$SESSION:mc-observe.1"
tmux split-window -t "$SESSION:mc-observe.1" -v \
  "tail -F '$RUNTIME_DIR/task-monitor.log' \
          '$RUNTIME_DIR/watchdog-runtime.log' \
          '$ARTIFACTS/watchdog-alerts.yaml'"

# ── Set pane titles ──────────────────────────────────────────────────────
tmux select-pane -t "$SESSION:mc-observe.0" -T "event-log"
tmux select-pane -t "$SESSION:mc-observe.1" -T "daemon-health"
tmux select-pane -t "$SESSION:mc-observe.2" -T "gate-state"
tmux select-pane -t "$SESSION:mc-observe.3" -T "deviation-logs"

# Focus back to pane 0
tmux select-pane -t "$SESSION:mc-observe.0"

echo "mc-observe window created in session '$SESSION'"
