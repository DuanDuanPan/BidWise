#!/usr/bin/env bash
# tmux-layout.sh - safe layout helpers for the master-control mixed window
# Usage:
#   tmux-layout.sh set-top-titles <commander_pane> <inspector_pane> <utility_pane>
#   tmux-layout.sh dump-geometry <session>
#   tmux-layout.sh validate-init <session> <bottom_anchor>
#   tmux-layout.sh validate-work <session>
#   tmux-layout.sh rebalance-bottom <session> <commander_pane>
#   tmux-layout.sh open-worker <session> <commander_pane> <bottom_anchor> <pane_title> <workdir> <command_string>

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

set_top_titles() {
  local commander="${1:?commander pane required}"
  local inspector="${2:?inspector pane required}"
  local utility="${3:?utility pane required}"

  tmux select-pane -t "$commander" -T "mc-commander"
  tmux select-pane -t "$inspector" -T "mc-inspector"
  tmux select-pane -t "$utility" -T "mc-util"
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
  local safe_workdir run_cmd pane_id rightmost_bottom
  local bottom_anchor_title bottom_anchor_command
  local -a bottom_panes=()

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
  rebalance_bottom "$session" "$commander_pane"
  validate_work "$session"
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
