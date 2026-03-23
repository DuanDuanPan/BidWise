#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SESSION="mc-layout-$$"

cleanup_test() {
  tmux kill-session -t "$SESSION" 2>/dev/null || true
}

trap cleanup_test EXIT

tmux new-session -d -s "$SESSION" "exec zsh -il"
COMMANDER="$(tmux list-panes -t "$SESSION" -F '#{pane_id}' | head -1)"
BOTTOM="$(tmux split-window -t "$COMMANDER" -v -l 40% -P -F '#{pane_id}' "exec zsh -il")"
INSPECTOR="$(tmux split-window -t "$COMMANDER" -h -l 55% -P -F '#{pane_id}' "exec zsh -il")"
UTILITY="$(tmux split-window -t "$INSPECTOR" -h -l 45% -P -F '#{pane_id}' "exec zsh -il")"

"$ROOT/.claude/skills/bmad-master-control/tmux-layout.sh" set-top-titles "$COMMANDER" "$INSPECTOR" "$UTILITY" >/dev/null
tmux select-pane -t "$BOTTOM" -T "mc-bottom-anchor"
tmux set-option -p -t "$BOTTOM" allow-rename off

WORKER_RAW="$("$ROOT/.claude/skills/bmad-master-control/tmux-layout.sh" open-worker \
  "$SESSION" \
  "$COMMANDER" \
  "$BOTTOM" \
  "mc-story-2-6-create" \
  "$ROOT" \
  "sleep 30")"

# Strip REUSED: or CREATED: prefix from open-worker output
WORKER="${WORKER_RAW#*:}"

[[ "$WORKER_RAW" == CREATED:* ]] || {
  echo "expected CREATED prefix, got: $WORKER_RAW" >&2
  exit 1
}

[[ "$WORKER" == "$BOTTOM" ]] || {
  echo "worker pane did not reuse bottom anchor" >&2
  exit 1
}

tmux list-panes -t "$SESSION" -F '#{pane_id} #{pane_title}' | grep -Fq "$BOTTOM mc-story-2-6-create" || {
  echo "bottom anchor pane did not become the worker pane" >&2
  exit 1
}

PANE_COUNT="$(tmux list-panes -t "$SESSION" | wc -l | tr -d '[:space:]')"
[[ "$PANE_COUNT" == "4" ]] || {
  echo "expected no extra pane to be created, got $PANE_COUNT panes" >&2
  exit 1
}

echo "tmux layout bottom anchor reuse: PASS"
