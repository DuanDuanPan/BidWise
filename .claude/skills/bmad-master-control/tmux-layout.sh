#!/usr/bin/env bash
# tmux-layout.sh - safe layout helpers for the master-control mixed window
# Usage:
#   tmux-layout.sh set-top-titles <commander_pane> <inspector_pane> <utility_pane>
#   tmux-layout.sh dump-geometry <session>
#   tmux-layout.sh validate-init <session> <bottom_anchor>
#   tmux-layout.sh validate-work <session>
#   tmux-layout.sh rebalance-bottom <session> <commander_pane>
#   tmux-layout.sh open-worker <session> <commander_pane> <bottom_anchor> <pane_title> <workdir> <command_string> [<project_root> <expected_generation> <story_id>]

set -euo pipefail

die() {
  echo "tmux-layout.sh: $*" >&2
  exit 1
}

require_tmux() {
  command -v tmux >/dev/null 2>&1 || die "tmux not found"
}

get_pane_field() {
  local pane_id="${1:?pane_id required}"
  local format="${2:?format required}"
  tmux display-message -p -t "$pane_id" "$format"
}

list_bottom_panes() {
  local session="${1:?session required}"
  tmux list-panes -t "$session" -F '#{pane_id} #{pane_top} #{pane_left}' |
    awk '$2 > 0 {print $1, $3}' |
    sort -k2n |
    awk '{print $1}'
}

dump_geometry() {
  local session="${1:?session required}"
  tmux list-panes -t "$session" -F 'pane=#{pane_id} title=#{pane_title} top=#{pane_top} left=#{pane_left} size=#{pane_width}x#{pane_height}'
}

is_shell_command() {
  case "${1:-}" in
    bash|zsh|sh|fish) return 0 ;;
    *) return 1 ;;
  esac
}

# Find an existing bottom-layer pane by title. Returns pane_id or empty.
find_existing_worker() {
  local session="${1:?session required}"
  local pane_title="${2:?pane title required}"
  local existing_id title
  while IFS= read -r existing_id; do
    [[ -n "$existing_id" ]] || continue
    title="$(get_pane_field "$existing_id" '#{pane_title}')"
    if [[ "$title" == "$pane_title" ]]; then
      printf '%s\n' "$existing_id"
      return 0
    fi
  done < <(list_bottom_panes "$session")
  return 1
}

set_top_titles() {
  local commander="${1:?commander pane required}"
  local inspector="${2:?inspector pane required}"
  local utility="${3:?utility pane required}"

  tmux select-pane -t "$commander" -T "mc-commander"
  tmux set-option -p -t "$commander" allow-rename off
  tmux select-pane -t "$inspector" -T "mc-inspector"
  tmux set-option -p -t "$inspector" allow-rename off
  tmux select-pane -t "$utility" -T "mc-util"
  tmux set-option -p -t "$utility" allow-rename off
}

validate_top_titles() {
  local session="${1:?session required}"
  local ok=0
  local found_commander=0
  local found_inspector=0
  local found_utility=0

  while IFS= read -r line; do
    local title top
    title="$(awk '{for(i=1;i<=NF;i++) if ($i ~ /^title=/) {sub(/^title=/,"",$i); print $i; break}}' <<<"$line")"
    top="$(awk '{for(i=1;i<=NF;i++) if ($i ~ /^top=/) {sub(/^top=/,"",$i); print $i; break}}' <<<"$line")"

    case "$title" in
      mc-commander)
        found_commander=1
        [[ "$top" == "0" ]] || { echo "mc-commander not on top row" >&2; ok=1; }
        ;;
      mc-inspector)
        found_inspector=1
        [[ "$top" == "0" ]] || { echo "mc-inspector not on top row" >&2; ok=1; }
        ;;
      mc-util)
        found_utility=1
        [[ "$top" == "0" ]] || { echo "mc-util not on top row" >&2; ok=1; }
        ;;
    esac
  done < <(dump_geometry "$session")

  [[ "$found_commander" == "1" ]] || { echo "missing mc-commander title" >&2; ok=1; }
  [[ "$found_inspector" == "1" ]] || { echo "missing mc-inspector title" >&2; ok=1; }
  [[ "$found_utility" == "1" ]] || { echo "missing mc-util title" >&2; ok=1; }

  return "$ok"
}

validate_init() {
  local session="${1:?session required}"
  local bottom_anchor="${2:?bottom_anchor required}"
  local top left

  validate_top_titles "$session" || {
    dump_geometry "$session" >&2
    return 1
  }

  top="$(get_pane_field "$bottom_anchor" '#{pane_top}')"
  left="$(get_pane_field "$bottom_anchor" '#{pane_left}')"

  [[ "$top" -gt 0 ]] || { echo "bottom_anchor is not below the top row" >&2; dump_geometry "$session" >&2; return 1; }
  [[ "$left" == "0" ]] || { echo "bottom_anchor does not start at left edge" >&2; dump_geometry "$session" >&2; return 1; }
}

validate_work() {
  local session="${1:?session required}"
  local ok=0

  validate_top_titles "$session" || ok=1

  while IFS= read -r line; do
    local title top
    title="$(awk '{for(i=1;i<=NF;i++) if ($i ~ /^title=/) {sub(/^title=/,"",$i); print $i; break}}' <<<"$line")"
    top="$(awk '{for(i=1;i<=NF;i++) if ($i ~ /^top=/) {sub(/^top=/,"",$i); print $i; break}}' <<<"$line")"

    if [[ "$title" == mc-story-* ]] && [[ "$top" == "0" ]]; then
      echo "story pane on top row: $title" >&2
      ok=1
    fi
  done < <(dump_geometry "$session")

  if [[ "$ok" -ne 0 ]]; then
    dump_geometry "$session" >&2
    return 1
  fi
}

rebalance_bottom() {
  local session="${1:?session required}"
  local commander_pane="${2:?commander pane required}"
  local window_width target_width
  local -a bottom_panes=()
  local listed_pane_id

  while IFS= read -r listed_pane_id; do
    [[ -n "$listed_pane_id" ]] && bottom_panes+=("$listed_pane_id")
  done < <(list_bottom_panes "$session")
  [[ "${#bottom_panes[@]}" -gt 0 ]] || die "no bottom panes found in session $session"
  [[ "${#bottom_panes[@]}" -gt 1 ]] || return 0

  window_width="$(tmux display-message -p -t "$commander_pane" '#{window_width}')"
  target_width=$(( window_width / ${#bottom_panes[@]} ))

  local i
  for ((i=0; i<${#bottom_panes[@]}-1; i++)); do
    tmux resize-pane -t "${bottom_panes[$i]}" -x "$target_width"
  done
}

open_worker() {
  local session="${1:?session required}"
  local commander_pane="${2:?commander pane required}"
  local bottom_anchor="${3:?bottom_anchor required}"
  local pane_title="${4:?pane title required}"
  local workdir="${5:?workdir required}"
  local command_string="${6:?command string required}"
  # Optional: pass project_root, expected_generation, story_id to auto-persist pane to gate-state
  local persist_project_root="${7:-}"
  local persist_generation="${8:-}"
  local persist_story_id="${9:-}"
  local safe_workdir run_cmd pane_id rightmost_bottom
  local bottom_anchor_title bottom_anchor_command
  local -a bottom_panes=()

  # --- Fix 4: Idempotency — if a pane with this title already exists, return it ---
  local existing_pane
  if existing_pane="$(find_existing_worker "$session" "$pane_title")"; then
    echo "tmux-layout.sh: reusing existing pane $existing_pane for $pane_title" >&2
    printf '%s\n' "$existing_pane"
    return 0
  fi

  safe_workdir="$(printf '%q' "$workdir")"
  run_cmd="cd ${safe_workdir} && ${command_string}"

  while IFS= read -r existing_pane_id; do
    [[ -n "$existing_pane_id" ]] && bottom_panes+=("$existing_pane_id")
  done < <(list_bottom_panes "$session")
  [[ "${#bottom_panes[@]}" -gt 0 ]] || die "no bottom panes found in session $session"

  bottom_anchor_title="$(get_pane_field "$bottom_anchor" '#{pane_title}')"
  bottom_anchor_command="$(get_pane_field "$bottom_anchor" '#{pane_current_command}')"

  if [[ "${#bottom_panes[@]}" -eq 1 ]] &&
     [[ "${bottom_panes[0]}" == "$bottom_anchor" ]] &&
     [[ ! "$bottom_anchor_title" == mc-story-* ]] &&
     is_shell_command "$bottom_anchor_command"; then
    pane_id="$bottom_anchor"
    tmux send-keys -t "$pane_id" "$run_cmd" Enter
  else
    rightmost_bottom="${bottom_panes[${#bottom_panes[@]}-1]}"
    pane_id="$(tmux split-window -t "$rightmost_bottom" -h -P -F '#{pane_id}' "$run_cmd")"
  fi

  tmux select-pane -t "$pane_id" -T "$pane_title"
  tmux set-option -p -t "$pane_id" allow-rename off
  rebalance_bottom "$session" "$commander_pane"

  # --- Fix 3: validate_work is non-fatal — warn but always output pane_id ---
  validate_work "$session" || echo "tmux-layout.sh: WARNING: validate_work failed after creating pane $pane_id" >&2

  # --- Fix 2: Auto-persist pane to gate-state if optional args provided ---
  if [[ -n "$persist_project_root" ]] && [[ -n "$persist_generation" ]] && [[ -n "$persist_story_id" ]]; then
    local script_dir
    script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    "${script_dir}/state-control.sh" register-worker-pane \
      "$persist_project_root" "$persist_generation" "$persist_story_id" "$pane_id" "$pane_title" \
      || echo "tmux-layout.sh: WARNING: failed to persist pane $pane_id to gate-state" >&2
  fi

  printf '%s\n' "$pane_id"
}

main() {
  require_tmux

  local cmd="${1:-}"
  shift || true

  case "$cmd" in
    set-top-titles) set_top_titles "$@" ;;
    dump-geometry) dump_geometry "$@" ;;
    validate-init) validate_init "$@" ;;
    validate-work) validate_work "$@" ;;
    rebalance-bottom) rebalance_bottom "$@" ;;
    open-worker) open_worker "$@" ;;
    *) die "unknown command: ${cmd:-<empty>}" ;;
  esac
}

main "$@"
