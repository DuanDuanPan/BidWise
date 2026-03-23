#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP_DIR="$(mktemp -d)"
PROJECT_ROOT="$TMP_DIR/project"
ARTIFACTS_DIR="$PROJECT_ROOT/_bmad-output/implementation-artifacts"
SESSION="mc-inspector-health-$$"

cleanup_test() {
  tmux kill-session -t "$SESSION" 2>/dev/null || true
  rm -rf "$TMP_DIR"
}

trap cleanup_test EXIT

mkdir -p "$ARTIFACTS_DIR"
printf '0\n' > "$ARTIFACTS_DIR/generation.lock"

tmux new-session -d -s "$SESSION" "python3 -c 'import time; time.sleep(30)'"
INSPECTOR_PANE="$(tmux list-panes -t "$SESSION" -F '#{pane_id}' | head -1)"
INSPECTOR_PID="$(tmux display-message -p -t "$INSPECTOR_PANE" '#{pane_pid}')"
tmux select-pane -t "$INSPECTOR_PANE" -T "mc-inspector"

RUNTIME_DIR="$ARTIFACTS_DIR/runtime/${SESSION}-g0"
LOG_DIR="$RUNTIME_DIR/mc-logs"
mkdir -p "$LOG_DIR"
cat > "$RUNTIME_DIR/inspector-boot.token" <<EOF
wrapper_pid=$INSPECTOR_PID
boot_id=test-boot
started=2026-03-23T00:00:00Z
mode=legacy
EOF
cat > "$LOG_DIR/pane-${INSPECTOR_PANE#%}.log" <<'EOF'
INSPECTOR READY
EOF

cat > "$ARTIFACTS_DIR/gate-state.yaml" <<EOF
session_name: "$SESSION"
EOF

OUTPUT="$TMP_DIR/health.json"
bash "$ROOT/.claude/skills/bmad-master-control/command-gateway.sh" \
  "$PROJECT_ROOT" \
  0 \
  HEALTH check_inspector --proactive > "$OUTPUT"

grep -q '"result":"ready"' "$OUTPUT" || {
  echo "wrapper inspector health check did not report ready" >&2
  cat "$OUTPUT" >&2
  exit 1
}

echo "command-gateway inspector wrapper health: PASS"
