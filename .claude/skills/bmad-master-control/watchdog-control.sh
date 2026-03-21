#!/usr/bin/env bash
# watchdog-control.sh - lifecycle helpers for master-control watchdog
# Usage:
#   watchdog-control.sh status <project_root> <session_name> [max_stale_seconds]
#   watchdog-control.sh verify-start <project_root> <session_name> [timeout_seconds] [max_stale_seconds]
#   watchdog-control.sh restart-detached <skill_dir> <commander_pane> <inspector_pane> <project_root> <session_name> [session_generation]
#   watchdog-control.sh ensure-running <skill_dir> <commander_pane> <inspector_pane> <project_root> <session_name> [session_generation] [timeout_seconds] [max_stale_seconds]

set -euo pipefail

die() {
  echo "watchdog-control.sh: $*" >&2
  exit 1
}

pid_file_for() {
  printf '%s\n' "${1}/_bmad-output/implementation-artifacts/watchdog.pid"
}

heartbeat_file_for() {
  printf '%s\n' "${1}/_bmad-output/implementation-artifacts/watchdog-heartbeat.yaml"
}

heartbeat_value() {
  local file="${1:?file required}"
  local key="${2:?key required}"
  sed -n "s/^${key}:[[:space:]]*//p" "$file" | head -n 1 | sed 's/^"//; s/"$//'
}

is_pid_alive() {
  local pid="${1:-}"
  [ -n "$pid" ] || return 1
  kill -0 "$pid" 2>/dev/null
}

heartbeat_age_seconds() {
  local heartbeat_file="${1:?heartbeat file required}"
  local last_check
  last_check="$(heartbeat_value "$heartbeat_file" "last_check")"
  [ -n "$last_check" ] || die "missing last_check in ${heartbeat_file}"

  python3 - <<PY
from datetime import datetime, timezone
last_check = "${last_check}"
dt = datetime.fromisoformat(last_check.replace("Z", "+00:00"))
now = datetime.now(timezone.utc)
print(int((now - dt).total_seconds()))
PY
}

status_cmd() {
  local project_root="${1:?project_root required}"
  local expected_session="${2:?session_name required}"
  local max_stale_seconds="${3:-120}"
  local pid_file heartbeat_file pid heartbeat_session age

  pid_file="$(pid_file_for "$project_root")"
  heartbeat_file="$(heartbeat_file_for "$project_root")"

  [ -f "$pid_file" ] || { echo "status=missing-pid"; return 1; }
  [ -f "$heartbeat_file" ] || { echo "status=missing-heartbeat"; return 1; }

  pid="$(tr -d '[:space:]' < "$pid_file")"
  heartbeat_session="$(heartbeat_value "$heartbeat_file" "session_name")"
  age="$(heartbeat_age_seconds "$heartbeat_file")"

  echo "pid=${pid}"
  echo "heartbeat_session=${heartbeat_session}"
  echo "heartbeat_age_seconds=${age}"

  if ! is_pid_alive "$pid"; then
    echo "status=dead-pid"
    return 1
  fi

  if [ "$heartbeat_session" != "$expected_session" ]; then
    echo "status=session-mismatch"
    return 1
  fi

  if [ "$age" -gt "$max_stale_seconds" ]; then
    echo "status=stale-heartbeat"
    return 1
  fi

  echo "status=healthy"
}

status_quiet() {
  local project_root="${1:?project_root required}"
  local expected_session="${2:?session_name required}"
  local max_stale_seconds="${3:-120}"
  local pid_file heartbeat_file pid heartbeat_session age

  pid_file="$(pid_file_for "$project_root")"
  heartbeat_file="$(heartbeat_file_for "$project_root")"

  [ -f "$pid_file" ] || return 1
  [ -f "$heartbeat_file" ] || return 1

  pid="$(tr -d '[:space:]' < "$pid_file")"
  heartbeat_session="$(heartbeat_value "$heartbeat_file" "session_name")"
  age="$(heartbeat_age_seconds "$heartbeat_file")"

  is_pid_alive "$pid" || return 1
  [ "$heartbeat_session" = "$expected_session" ] || return 1
  [ "$age" -le "$max_stale_seconds" ] || return 1
}

verify_start_cmd() {
  local project_root="${1:?project_root required}"
  local expected_session="${2:?session_name required}"
  local timeout_seconds="${3:-8}"
  local max_stale_seconds="${4:-120}"
  local deadline now

  deadline=$(( $(date +%s) + timeout_seconds ))
  while true; do
    if status_quiet "$project_root" "$expected_session" "$max_stale_seconds"; then
      status_cmd "$project_root" "$expected_session" "$max_stale_seconds"
      return 0
    fi

    now=$(date +%s)
    if [ "$now" -ge "$deadline" ]; then
      status_cmd "$project_root" "$expected_session" "$max_stale_seconds" || true
      return 1
    fi

    sleep 1
  done
}

restart_detached_cmd() {
  local skill_dir="${1:?skill_dir required}"
  local commander_pane="${2:?commander_pane required}"
  local inspector_pane="${3:?inspector_pane required}"
  local project_root="${4:?project_root required}"
  local session_name="${5:?session_name required}"
  local session_generation="${6:-0}"
  local pid_file heartbeat_file current_pid log_file

  pid_file="$(pid_file_for "$project_root")"
  heartbeat_file="$(heartbeat_file_for "$project_root")"
  log_file="${project_root}/_bmad-output/implementation-artifacts/watchdog-runtime.log"

  if [ -f "$pid_file" ]; then
    current_pid="$(tr -d '[:space:]' < "$pid_file")"
    if is_pid_alive "$current_pid"; then
      kill "$current_pid" 2>/dev/null || true
      sleep 1
    fi
  fi

  rm -f "$pid_file" "$heartbeat_file"

  nohup bash "${skill_dir}/watchdog.sh" \
    "$commander_pane" \
    "$inspector_pane" \
    "$project_root" \
    "$session_name" \
    "$session_generation" \
    >>"$log_file" 2>&1 &

  echo "$!"
}

ensure_running_cmd() {
  local skill_dir="${1:?skill_dir required}"
  local commander_pane="${2:?commander_pane required}"
  local inspector_pane="${3:?inspector_pane required}"
  local project_root="${4:?project_root required}"
  local session_name="${5:?session_name required}"
  local session_generation="${6:-0}"
  local timeout_seconds="${7:-8}"
  local max_stale_seconds="${8:-120}"

  if status_quiet "$project_root" "$session_name" "$max_stale_seconds"; then
    status_cmd "$project_root" "$session_name" "$max_stale_seconds"
    return 0
  fi

  restart_detached_cmd \
    "$skill_dir" \
    "$commander_pane" \
    "$inspector_pane" \
    "$project_root" \
    "$session_name" \
    "$session_generation" >/dev/null

  verify_start_cmd "$project_root" "$session_name" "$timeout_seconds" "$max_stale_seconds"
}

main() {
  local cmd="${1:-}"
  shift || true

  case "$cmd" in
    status) status_cmd "$@" ;;
    verify-start) verify_start_cmd "$@" ;;
    restart-detached) restart_detached_cmd "$@" ;;
    ensure-running) ensure_running_cmd "$@" ;;
    *) die "unknown command: ${cmd:-<empty>}" ;;
  esac
}

main "$@"
