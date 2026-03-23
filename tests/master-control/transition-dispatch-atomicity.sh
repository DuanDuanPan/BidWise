#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP_DIR="$(mktemp -d)"

cleanup_test() {
  if [[ -n "${FAIL_SESSION:-}" ]]; then
    tmux kill-session -t "$FAIL_SESSION" 2>/dev/null || true
  fi
  rm -rf "$TMP_DIR"
}

trap cleanup_test EXIT

create_fake_worker() {
  local path="$1"
  local mode="$2"
  cat > "$path" <<'PY'
#!/usr/bin/env python3
import re
import select
import os
import sys
import time

MODE = sys.argv[1]

sys.stdout.write("\x1b[?2004h")
sys.stdout.flush()
time.sleep(0.05)
sys.stdout.write("╭─────────────────────────────────────────────╮\r\n")
sys.stdout.write("│ Claude Code (v2.1.81)                      │\r\n")
sys.stdout.write("╰─────────────────────────────────────────────╯\r\n")
sys.stdout.write("\r\n")
sys.stdout.write("❯ \r\n")
sys.stdout.flush()

buffer = ""
ready_emitted = False
task_started_emitted = False

while True:
    rlist, _, _ = select.select([sys.stdin], [], [], 0.2)
    if sys.stdin not in rlist:
        continue

    chunk = os.read(sys.stdin.fileno(), 4096).decode("utf-8", errors="ignore")
    if not chunk:
        break

    buffer += chunk
    if not ready_emitted and buffer:
        if MODE == "ready":
            sys.stdout.write("MC_WORKER_READY 2-6:create\r\n")
            sys.stdout.flush()
        ready_emitted = True

    if MODE != "ready":
        continue

    if not task_started_emitted and ready_emitted:
        time.sleep(1.0)
        sys.stdout.write("MC_ACK 2-6-create-1\r\n")
        sys.stdout.write("MC_BEGIN 2-6-create-1\r\n")
        sys.stdout.flush()
        task_started_emitted = True

    if task_started_emitted:
        while True:
            time.sleep(1)
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

assert_failure_case() {
  local project_root="$1"
  local session_name="$2"
  local _expected_bottom_anchor="$3"

  ruby -ryaml -e '
    gs = YAML.load_file(ARGV[0])
    phase = gs.dig("story_states", "2-6", "phase").to_s
    abort("phase advanced despite failed dispatch: #{phase}") unless phase.empty?
    panes = gs.dig("panes", "stories", "2-6") || {}
    abort("worker pane registered on failed dispatch") unless panes.empty?
    anchor = gs["bottom_anchor"].to_s
    abort("bottom anchor missing after failed dispatch") if anchor.empty?
    puts anchor
  ' "$project_root/_bmad-output/implementation-artifacts/gate-state.yaml" > "$TMP_DIR/failure-anchor.txt"

  ruby -ryaml -e '
    events = (YAML.load_file(ARGV[0]) || {})["events"] || []
    task_events = events.select { |e| ["TASK_DISPATCHED", "PANE_REGISTERED", "STORY_PHASE_CHANGED"].include?(e["type"]) }
    abort("dispatch committed despite worker boot failure") unless task_events.empty?
  ' "$project_root/_bmad-output/implementation-artifacts/event-log.yaml"

  local actual_anchor
  actual_anchor="$(cat "$TMP_DIR/failure-anchor.txt")"
  [[ "$actual_anchor" == "$_expected_bottom_anchor" ]] || {
    echo "bottom anchor drifted on failed dispatch: expected $_expected_bottom_anchor got $actual_anchor" >&2
    exit 1
  }
  local anchor_geometry
  anchor_geometry="$(tmux list-panes -t "$session_name" -F '#{pane_id} #{pane_left} #{pane_top}' | awk -v pane="$actual_anchor" '$1 == pane {print $2 " " $3}')"
  [[ -n "$anchor_geometry" ]] || {
    echo "bottom anchor pane disappeared during failed dispatch" >&2
    exit 1
  }
  local anchor_left anchor_top
  read -r anchor_left anchor_top <<<"$anchor_geometry"
  [[ "$anchor_left" == "0" ]] || {
    echo "bottom anchor no longer starts at left edge after failed dispatch" >&2
    exit 1
  }
  [[ "$anchor_top" -gt 0 ]] || {
    echo "bottom anchor no longer sits on the bottom work layer after failed dispatch" >&2
    exit 1
  }
}

STUCK_AGENT="$TMP_DIR/fake-stuck-worker.py"
create_fake_worker "$STUCK_AGENT" "stuck"

FAIL_PROJECT="$TMP_DIR/project-fail"
IFS='|' read -r FAIL_SESSION FAIL_COMMANDER FAIL_INSPECTOR FAIL_UTILITY FAIL_BOTTOM < <(setup_tmux_session "mc-fail-$$")
init_project_state "$FAIL_PROJECT" "$FAIL_SESSION" "$FAIL_COMMANDER" "$FAIL_INSPECTOR" "$FAIL_UTILITY" "$FAIL_BOTTOM"
FAIL_OUTPUT="$TMP_DIR/fail-dispatch.json"
set +e
MC_CLAUDE_AGENT_COMMAND="python3 $STUCK_AGENT stuck" \
MC_WORKER_READY_TIMEOUT=2 \
MC_WORKER_REUSE_READY_TIMEOUT=1 \
MC_WORKER_BOOTSTRAP_TIMEOUT=1 \
MC_WORKER_BOOTSTRAP_RETRIES=1 \
  bash "$ROOT/.claude/skills/bmad-master-control/transition-engine.sh" \
  dispatch "$FAIL_PROJECT" 0 2-6 create --trigger-seq 1 > "$FAIL_OUTPUT"
STATUS=$?
set -e
[[ "$STATUS" -ne 0 ]] || {
  echo "failed dispatch unexpectedly succeeded" >&2
  cat "$FAIL_OUTPUT" >&2
  exit 1
}
grep -q 'WORKER_BOOT_TIMEOUT' "$FAIL_OUTPUT" || {
  echo "failed dispatch did not report worker boot timeout" >&2
  cat "$FAIL_OUTPUT" >&2
  exit 1
}
assert_failure_case "$FAIL_PROJECT" "$FAIL_SESSION" "$FAIL_BOTTOM"

echo "transition dispatch atomicity: PASS"
