#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP_DIR="$(mktemp -d)"
PROJECT_ROOT="$TMP_DIR/project"
ARTIFACTS_DIR="$PROJECT_ROOT/_bmad-output/implementation-artifacts"
SESSION="mc-watchdog-$$"

cleanup_test() {
  if [[ -n "${WATCHDOG_PID:-}" ]]; then
    kill "$WATCHDOG_PID" 2>/dev/null || true
    wait "$WATCHDOG_PID" 2>/dev/null || true
  fi
  tmux kill-session -t "$SESSION" 2>/dev/null || true
  rm -rf "$TMP_DIR"
}

trap cleanup_test EXIT

mkdir -p "$ARTIFACTS_DIR"
printf '0\n' > "$ARTIFACTS_DIR/generation.lock"
cat > "$ARTIFACTS_DIR/gate-state.yaml" <<EOF
session_name: "$SESSION"
session_generation: 0
EOF
cat > "$ARTIFACTS_DIR/event-log.yaml" <<'EOF'
schema_version: 2
events: []
EOF
cat > "$ARTIFACTS_DIR/watchdog-alerts.yaml" <<'EOF'
alerts:
EOF

tmux new-session -d -s "$SESSION" "exec zsh -il"
PANE_ID="$(tmux list-panes -t "$SESSION" -F '#{pane_id}' | head -1)"

RUNTIME_DIR="$ARTIFACTS_DIR/runtime/${SESSION}-g0"
mkdir -p "$RUNTIME_DIR"
MC_RUNTIME_DIR="$RUNTIME_DIR" WATCHDOG_CHECK_INTERVAL=1 \
  bash "$ROOT/.claude/skills/bmad-master-control/watchdog.sh" \
  "$PANE_ID" \
  "$PANE_ID" \
  "$PROJECT_ROOT" \
  "$SESSION" \
  0 > "$RUNTIME_DIR/watchdog-runtime.log" 2>&1 &
WATCHDOG_PID=$!

sleep 2

[[ -f "$RUNTIME_DIR/watchdog-heartbeat.yaml" ]] || {
  echo "watchdog heartbeat file was not created" >&2
  cat "$RUNTIME_DIR/watchdog-runtime.log" >&2 || true
  exit 1
}

if grep -q 'ModuleNotFoundError: No module named '\''yaml'\''' "$RUNTIME_DIR/watchdog-runtime.log"; then
  echo "watchdog still depends on PyYAML at runtime" >&2
  cat "$RUNTIME_DIR/watchdog-runtime.log" >&2
  exit 1
fi

echo "watchdog heartbeat without PyYAML: PASS"
