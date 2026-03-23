#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP_DIR="$(mktemp -d)"

cleanup_test() {
  if [[ -n "${SESSION_NAME:-}" ]]; then
    tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true
  fi
  rm -rf "$TMP_DIR"
}

trap cleanup_test EXIT

create_fake_agent() {
  local path="$1"
  cat > "$path" <<'PY'
#!/usr/bin/env python3
import os
import re
import select
import sys
import time

sys.stdout.write("╭─────────────────────────────────────────────╮\r\n")
sys.stdout.write("│ Claude Code (fake worker)                  │\r\n")
sys.stdout.write("╰─────────────────────────────────────────────╯\r\n")
sys.stdout.write("\r\n")
sys.stdout.write("❯ \r\n")
sys.stdout.flush()

buffer = ""
ready_sent = False

while True:
    rlist, _, _ = select.select([sys.stdin], [], [], 0.2)
    if sys.stdin not in rlist:
        continue

    chunk = os.read(sys.stdin.fileno(), 4096).decode("utf-8", errors="ignore")
    if not chunk:
        break

    buffer += chunk

    if not ready_sent:
        ready_match = re.search(r"Worker id:\s*(\S+)", buffer)
        if ready_match:
            sys.stdout.write(f"MC_WORKER_READY {ready_match.group(1)}\r\n")
            sys.stdout.flush()
            ready_sent = True

    while True:
        task_match = re.search(r"TASK\s+(\S+)\s+(\S+)\s+(\S+)\n.*?\nEND_TASK(?:\n|$)", buffer, re.S)
        if not task_match:
            break

        task_id = task_match.group(1)
        sys.stdout.write(f"MC_ACK {task_id}\r\n")
        sys.stdout.write(f"MC_BEGIN {task_id}\r\n")
        sys.stdout.flush()
        buffer = buffer[task_match.end():]
        time.sleep(0.05)
PY
  chmod +x "$path"
}

setup_tmux_session() {
  local session_name="$1"
  tmux new-session -d -s "$session_name" "exec zsh -il"
  local commander inspector utility bottom
  commander="$(tmux list-panes -t "$session_name" -F '#{pane_id}' | head -1)"
  bottom="$(tmux split-window -t "$commander" -v -l 40% -P -F '#{pane_id}' "exec zsh -il")"
  inspector="$(tmux split-window -t "$commander" -h -l 55% -P -F '#{pane_id}' "exec zsh -il")"
  utility="$(tmux split-window -t "$inspector" -h -l 45% -P -F '#{pane_id}' "exec zsh -il")"
  "$ROOT/.claude/skills/bmad-master-control/tmux-layout.sh" set-top-titles "$commander" "$inspector" "$utility" >/dev/null
  tmux select-pane -t "$bottom" -T "mc-bottom-anchor"
  tmux set-option -p -t "$bottom" allow-rename off
  printf '%s|%s|%s|%s|%s\n' "$session_name" "$commander" "$inspector" "$utility" "$bottom"
}

init_project_state() {
  local project_root="$1"
  local session_name="$2"
  local commander="$3"
  local inspector="$4"
  local utility="$5"
  local bottom="$6"
  local artifacts="$project_root/_bmad-output/implementation-artifacts"

  mkdir -p "$artifacts"
  bash "$ROOT/.claude/skills/bmad-master-control/event-bus.sh" init "$project_root" 0 >/dev/null

  local batch_payload
  batch_payload="$(ruby -rjson -e 'puts JSON.generate({
    batch_id: "batch-test",
    stories: ["2-6"],
    config: {
      max_review_cycles: 3,
      max_regression_cycles: 3,
      max_validation_cycles: 3
    },
    session_name: ARGV[0],
    commander_pane: ARGV[1],
    inspector_pane: ARGV[2],
    utility_pane: ARGV[3],
    bottom_anchor: ARGV[4]
  })' "$session_name" "$commander" "$inspector" "$utility" "$bottom")"
  local g1_payload
  g1_payload='{"gate":"G1","verified_by":"commander","details":"test batch"}'

  bash "$ROOT/.claude/skills/bmad-master-control/event-bus.sh" append "$project_root" 0 BATCH_SELECTED commander null "$batch_payload" >/dev/null
  bash "$ROOT/.claude/skills/bmad-master-control/event-bus.sh" append "$project_root" 0 GATE_PASSED commander null "$g1_payload" >/dev/null
  bash "$ROOT/.claude/skills/bmad-master-control/event-bus.sh" materialize "$project_root" >/dev/null
}

wait_for_boot_token_status() {
  local token_file="$1"
  local expected_status="$2"
  local timeout="${3:-10}"
  local start
  start="$(date +%s)"
  while (( "$(date +%s)" - start < timeout )); do
    if [[ -f "$token_file" ]] && grep -Fq "status=$expected_status" "$token_file"; then
      return 0
    fi
    sleep 0.2
  done
  return 1
}

PROJECT_ROOT="$TMP_DIR/project"
FAKE_AGENT="$TMP_DIR/fake-ready-agent.py"
create_fake_agent "$FAKE_AGENT"

IFS='|' read -r SESSION_NAME COMMANDER INSPECTOR UTILITY BOTTOM < <(setup_tmux_session "mc-reuse-$$")
init_project_state "$PROJECT_ROOT" "$SESSION_NAME" "$COMMANDER" "$INSPECTOR" "$UTILITY" "$BOTTOM"

RUNTIME_ROOT="$PROJECT_ROOT/_bmad-output/implementation-artifacts/runtime/${SESSION_NAME}-g0"
WORKER_DIR="$RUNTIME_ROOT/workers/2-6-dev"
BOOTSTRAP_FILE="$WORKER_DIR/bootstrap.txt"
CONTROL_FIFO="$WORKER_DIR/control.fifo"
BOOT_TOKEN_FILE="$WORKER_DIR/worker-boot.token"
LAUNCHER="$TMP_DIR/run-dev-worker.sh"

mkdir -p "$WORKER_DIR"
cat > "$BOOTSTRAP_FILE" <<'EOF'
You are entering BidWise master-control worker protocol mode.
Worker id: 2-6:dev
Worker role: dev for story 2-6.
EOF
mkfifo "$CONTROL_FIFO"
cat > "$LAUNCHER" <<EOF
#!/usr/bin/env bash
set -euo pipefail
python3 "$ROOT/.claude/skills/bmad-master-control/agent-wrapper.py" \
  --agent-command "python3 $FAKE_AGENT" \
  --packet-file "$BOOTSTRAP_FILE" \
  --ready-timeout 30 \
  --control-fifo "$CONTROL_FIFO" \
  --boot-token-file "$BOOT_TOKEN_FILE" \
  --protocol-worker \
  --worker-id 2-6:dev \
  --bootstrap-timeout 10 \
  --bootstrap-retries 2 \
  --ack-timeout 20 \
  --begin-timeout 30 \
  --long-lived
EOF
chmod +x "$LAUNCHER"

tmux respawn-pane -k -t "$BOTTOM" "cd $(printf '%q' "$PROJECT_ROOT") && bash $(printf '%q' "$LAUNCHER")" >/dev/null
tmux select-pane -t "$BOTTOM" -T "mc-story-2-6-dev"
tmux set-option -p -t "$BOTTOM" allow-rename off
DEV_PANE="$BOTTOM"

wait_for_boot_token_status "$BOOT_TOKEN_FILE" "worker_ready" 15 || {
  echo "dev worker never reached worker_ready" >&2
  [[ -f "$BOOT_TOKEN_FILE" ]] && cat "$BOOT_TOKEN_FILE" >&2
  exit 1
}

bash "$ROOT/.claude/skills/bmad-master-control/state-control.sh" sync-runtime-panes \
  "$PROJECT_ROOT" 0 "$UTILITY" "$INSPECTOR" "$DEV_PANE" >/dev/null
DEV_PANE_PAYLOAD="$(ruby -rjson -e 'puts JSON.generate({
  story_id: "2-6",
  role: "dev",
  pane_id: ARGV[0],
  title: "mc-story-2-6-dev"
})' "$DEV_PANE")"
bash "$ROOT/.claude/skills/bmad-master-control/event-bus.sh" append \
  "$PROJECT_ROOT" 0 PANE_REGISTERED transition_engine 1 "$DEV_PANE_PAYLOAD" >/dev/null
FIXING_PHASE_PAYLOAD='{"story_id":"2-6","from_phase":"review","to_phase":"fixing","current_llm":"claude","dispatch_state":null,"c2_override":false}'
bash "$ROOT/.claude/skills/bmad-master-control/event-bus.sh" append \
  "$PROJECT_ROOT" 0 STORY_PHASE_CHANGED transition_engine 1 "$FIXING_PHASE_PAYLOAD" >/dev/null
bash "$ROOT/.claude/skills/bmad-master-control/event-bus.sh" materialize "$PROJECT_ROOT" >/dev/null
bash "$ROOT/.claude/skills/bmad-master-control/state-control.sh" upsert-story-state \
  "$PROJECT_ROOT" 0 2-6 \
  "current_llm=claude" \
  "worktree_path=$PROJECT_ROOT" \
  "pane.dev=$DEV_PANE" >/dev/null

FIX_OUTPUT="$TMP_DIR/fixing-dispatch.json"
set +e
MC_CLAUDE_AGENT_COMMAND="python3 $FAKE_AGENT" \
  bash "$ROOT/.claude/skills/bmad-master-control/transition-engine.sh" \
  dispatch "$PROJECT_ROOT" 0 2-6 fixing --trigger-seq 2 > "$FIX_OUTPUT" 2>&1
FIX_STATUS=$?
set -e
[[ "$FIX_STATUS" -eq 0 ]] || {
  echo "fixing dispatch failed" >&2
  cat "$FIX_OUTPUT" >&2
  echo "tmux panes before cleanup:" >&2
  tmux list-panes -t "$SESSION_NAME" -F '#{pane_id} #{pane_title} #{pane_current_command} #{pane_top} #{pane_left}' >&2 || true
  echo "gate-state before cleanup:" >&2
  ruby -ryaml -e 'pp YAML.load_file(ARGV[0])' "$PROJECT_ROOT/_bmad-output/implementation-artifacts/gate-state.yaml" >&2 || true
  exit 1
}

FIX_PANE="$(ruby -rjson -e 'puts JSON.parse(File.read(ARGV[0])).fetch("pane_id")' "$FIX_OUTPUT")"
[[ "$FIX_PANE" == "$DEV_PANE" ]] || {
  echo "fixing dispatch did not reuse dev pane" >&2
  cat "$FIX_OUTPUT" >&2
  exit 1
}

ruby -ryaml -e '
  gs = YAML.load_file(ARGV[0])
  story_panes = gs.dig("panes", "stories", "2-6") || {}
  abort("dev pane not preserved in gate-state") unless story_panes["dev"].to_s == ARGV[1]
  abort("fixing role should not be materialized when reusing dev lane") if story_panes.key?("fixing")
' "$PROJECT_ROOT/_bmad-output/implementation-artifacts/gate-state.yaml" "$DEV_PANE"

echo "transition dispatch fixing reuses dev pane: PASS"
