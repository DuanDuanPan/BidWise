#!/usr/bin/env bash
# runtime-manager.sh — orchestrates master-control runtime actors as a single unit.
# Usage:
#   runtime-manager.sh ensure-running <project_root> <expected_generation> <session_name> <commander_pane> <inspector_pane> [session_generation]
#   runtime-manager.sh status <project_root> <expected_generation> <session_name>
#   runtime-manager.sh stop <project_root> <session_name> <generation>

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONITOR_CONTROL="${SCRIPT_DIR}/monitor-control.sh"
WATCHDOG_CONTROL="${SCRIPT_DIR}/watchdog-control.sh"
COMMAND_GATEWAY="${SCRIPT_DIR}/command-gateway.sh"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/runtime-paths.sh"

die() {
  echo "runtime-manager.sh: $*" >&2
  exit 1
}

stop_watchdog() {
  local project_root="${1:?project_root required}"
  local session_name="${2:?session_name required}"
  local generation="${3:?generation required}"
  local pid_file pid

  pid_file="$(runtime_dir_for "$project_root" "$session_name" "$generation")/watchdog.pid"
  [[ -f "$pid_file" ]] || return 0

  pid="$(tr -d '[:space:]' < "$pid_file" 2>/dev/null || true)"
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    sleep 1
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  fi
  rm -f "$pid_file"
}

status_cmd() {
  local project_root="${1:?project_root required}"
  local expected_generation="${2:?expected_generation required}"
  local session_name="${3:?session_name required}"

  echo "== monitor =="
  bash "$MONITOR_CONTROL" status "$project_root" "$session_name" "$expected_generation" || true
  echo
  echo "== watchdog =="
  bash "$WATCHDOG_CONTROL" status "$project_root" "$session_name" "$expected_generation" || true
  echo
  echo "== inspector =="
  bash "$COMMAND_GATEWAY" "$project_root" "$expected_generation" HEALTH check_inspector --proactive || true
}

ensure_running_cmd() {
  local project_root="${1:?project_root required}"
  local expected_generation="${2:?expected_generation required}"
  local session_name="${3:?session_name required}"
  local commander_pane="${4:?commander_pane required}"
  local inspector_pane="${5:?inspector_pane required}"
  local session_generation="${6:-$expected_generation}"
  local ok=0
  local i

  bash "$MONITOR_CONTROL" ensure-running "$project_root" "$session_name" "" "$session_generation" >/dev/null 2>&1 || true
  bash "$WATCHDOG_CONTROL" ensure-running \
    "$SCRIPT_DIR" \
    "$commander_pane" \
    "$inspector_pane" \
    "$project_root" \
    "$session_name" \
    "$session_generation" >/dev/null 2>&1 || true

  for i in 1 2 3 4 5 6 7 8 9 10; do
    if bash "$MONITOR_CONTROL" status "$project_root" "$session_name" "$expected_generation" >/dev/null 2>&1 && \
       bash "$WATCHDOG_CONTROL" status "$project_root" "$session_name" "$expected_generation" >/dev/null 2>&1; then
      ok=1
      break
    fi
    sleep 1
  done

  if [[ "$ok" != "1" ]]; then
    status_cmd "$project_root" "$expected_generation" "$session_name"
    die "runtime actors failed to reach healthy state"
  fi

  status_cmd "$project_root" "$expected_generation" "$session_name"
}

stop_cmd() {
  local project_root="${1:?project_root required}"
  local session_name="${2:?session_name required}"
  local generation="${3:?generation required}"

  bash "$MONITOR_CONTROL" stop "$project_root" >/dev/null || true
  stop_watchdog "$project_root" "$session_name" "$generation"
  echo "runtime stopped for ${project_root}"
}

cmd="${1:-}"
shift || true

case "$cmd" in
  ensure-running) ensure_running_cmd "$@" ;;
  status) status_cmd "$@" ;;
  stop) stop_cmd "$@" ;;
  *)
    die "unknown command: ${cmd:-<empty>}"
    ;;
esac
