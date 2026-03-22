#!/usr/bin/env bash
# monitor-control.sh — lifecycle management for task-monitor daemon
# Usage:
#   monitor-control.sh start <project_root> <session_name> [check_interval] [session_generation]
#   monitor-control.sh status <project_root> <session_name> [session_generation]
#   monitor-control.sh stop <project_root>
#   monitor-control.sh verify-start <project_root> <session_name> [check_interval] [session_generation]
#   monitor-control.sh ensure-running <project_root> <session_name> [check_interval] [session_generation]
#   monitor-control.sh restart-detached <project_root> <session_name> [check_interval] [session_generation]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TASK_MONITOR="$SCRIPT_DIR/task-monitor.sh"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/runtime-paths.sh"

pid_file() {
  local project_root="${1:?project_root required}"
  local session_name="${2:?session_name required}"
  local generation="${3:?generation required}"
  printf '%s\n' "$(runtime_dir_for "$project_root" "$session_name" "$generation")/task-monitor.pid"
}

heartbeat_file() {
  local project_root="${1:?project_root required}"
  local session_name="${2:?session_name required}"
  local generation="${3:?generation required}"
  printf '%s\n' "$(runtime_dir_for "$project_root" "$session_name" "$generation")/task-monitor-heartbeat.yaml"
}

log_file() {
  local project_root="${1:?project_root required}"
  local session_name="${2:?session_name required}"
  local generation="${3:?generation required}"
  printf '%s\n' "$(runtime_dir_for "$project_root" "$session_name" "$generation")/task-monitor.log"
}

is_running() {
  local project_root="${1:?project_root required}"
  local session_name="${2:?session_name required}"
  local generation="${3:?generation required}"
  local pf pid
  pf="$(pid_file "$project_root" "$session_name" "$generation")"
  if [[ -f "$pf" ]]; then
    pid=$(tr -d '[:space:]' < "$pf" 2>/dev/null || true)
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      echo "$pid"
      return 0
    fi
  fi
  return 1
}

find_project_monitors() {
  local project_root="${1:?project_root required}"
  ps -axo pid=,command= | while IFS= read -r line; do
    [[ "$line" == *"task-monitor.sh ${project_root}"* ]] || continue
    set -- $line
    [[ $# -ge 5 ]] || continue
    printf '%s %s\n' "$1" "$5"
  done
}

kill_project_monitors() {
  local project_root="${1:?project_root required}"
  local killed=0
  local pid _session
  while read -r pid _session; do
    [[ -n "${pid:-}" ]] || continue
    kill "$pid" 2>/dev/null || true
    killed=1
  done < <(find_project_monitors "$project_root")

  if [[ "$killed" == "1" ]]; then
    sleep 1
  fi
}

cmd_start() {
  local project_root="${1:?start requires <project_root>}"
  local session_name="${2:?start requires <session_name>}"
  local interval="${3:-}"
  local generation
  generation="$(read_generation_for_project "$project_root" "${4:-}")"
  ensure_runtime_dir "$project_root" "$session_name" "$generation" >/dev/null

  kill_project_monitors "$project_root"

  local pf hf log
  pf="$(pid_file "$project_root" "$session_name" "$generation")"
  hf="$(heartbeat_file "$project_root" "$session_name" "$generation")"
  log="$(log_file "$project_root" "$session_name" "$generation")"
  rm -f "$pf" "$hf"

  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] Starting task-monitor daemon..." >> "$log"
  MC_RUNTIME_DIR="$(runtime_dir_for "$project_root" "$session_name" "$generation")" \
  MC_SESSION_GENERATION="$generation" \
  nohup "$TASK_MONITOR" "$project_root" "$session_name" "$interval" "$generation" >> "$log" 2>&1 &

  local bg_pid=$!
  disown "$bg_pid" 2>/dev/null || true
  echo "task-monitor started (PID $bg_pid)"
}

cmd_status() {
  local project_root="${1:?status requires <project_root>}"
  local session_name="${2:?status requires <session_name>}"
  local generation
  generation="$(read_generation_for_project "$project_root" "${3:-}")"

  if pid=$(is_running "$project_root" "$session_name" "$generation"); then
    echo "task-monitor is running (PID $pid)"
    local hb
    hb="$(heartbeat_file "$project_root" "$session_name" "$generation")"
    if [[ -f "$hb" ]]; then
      echo "--- heartbeat ---"
      cat "$hb"
    fi
    return 0
  fi

  echo "task-monitor is NOT running"
  return 1
}

cmd_stop() {
  local project_root="${1:?stop requires <project_root>}"
  kill_project_monitors "$project_root"
  echo "task-monitor stopped"
}

cmd_verify_start() {
  local project_root="${1:?verify-start requires <project_root>}"
  local session_name="${2:?verify-start requires <session_name>}"
  local interval="${3:-}"
  local generation
  generation="$(read_generation_for_project "$project_root" "${4:-}")"

  local hb
  hb="$(heartbeat_file "$project_root" "$session_name" "$generation")"
  rm -f "$hb"

  cmd_start "$project_root" "$session_name" "$interval" "$generation"

  local waited=0
  while [[ ! -f "$hb" ]] && (( waited < 10 )); do
    sleep 1
    waited=$((waited + 1))
  done

  if [[ -f "$hb" ]]; then
    echo "task-monitor verified: first heartbeat received after ${waited}s"
    return 0
  fi

  echo "WARNING: no heartbeat after ${waited}s — check logs at $(log_file "$project_root" "$session_name" "$generation")"
  return 1
}

cmd_ensure_running() {
  local project_root="${1:?ensure-running requires <project_root>}"
  local session_name="${2:?ensure-running requires <session_name>}"
  local interval="${3:-}"
  local generation
  generation="$(read_generation_for_project "$project_root" "${4:-}")"

  if pid=$(is_running "$project_root" "$session_name" "$generation"); then
    echo "task-monitor already running (PID $pid)"
    return 0
  fi

  echo "task-monitor not running, starting..."
  cmd_start "$project_root" "$session_name" "$interval" "$generation"
}

cmd_restart_detached() {
  local project_root="${1:?restart-detached requires <project_root>}"
  local session_name="${2:?restart-detached requires <session_name>}"
  local interval="${3:-}"
  local generation
  generation="$(read_generation_for_project "$project_root" "${4:-}")"

  cmd_stop "$project_root"
  sleep 1
  cmd_start "$project_root" "$session_name" "$interval" "$generation"
}

action="${1:-}"
shift || true

case "$action" in
  start)            cmd_start "$@" ;;
  status)           cmd_status "$@" ;;
  stop)             cmd_stop "$@" ;;
  verify-start)     cmd_verify_start "$@" ;;
  ensure-running)   cmd_ensure_running "$@" ;;
  restart-detached) cmd_restart_detached "$@" ;;
  *)
    echo "Usage: monitor-control.sh {start|status|stop|verify-start|ensure-running|restart-detached} <args...>"
    exit 1
    ;;
esac
