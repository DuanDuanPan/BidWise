#!/usr/bin/env bash
# monitor-control.sh — lifecycle management for task-monitor daemon
# Usage:
#   monitor-control.sh start <project_root> <session_name> [check_interval]
#   monitor-control.sh status <project_root>
#   monitor-control.sh stop <project_root>
#   monitor-control.sh verify-start <project_root> <session_name> [check_interval]
#   monitor-control.sh ensure-running <project_root> <session_name> [check_interval]
#   monitor-control.sh restart-detached <project_root> <session_name> [check_interval]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TASK_MONITOR="$SCRIPT_DIR/task-monitor.sh"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
pid_file() {
  echo "$1/_bmad-output/implementation-artifacts/task-monitor.pid"
}

heartbeat_file() {
  echo "$1/_bmad-output/implementation-artifacts/task-monitor-heartbeat.yaml"
}

log_file() {
  echo "$1/_bmad-output/implementation-artifacts/task-monitor.log"
}

is_running() {
  local pf
  pf=$(pid_file "$1")
  if [[ -f "$pf" ]]; then
    local pid
    pid=$(cat "$pf" 2>/dev/null | tr -d '[:space:]')
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      echo "$pid"
      return 0
    fi
  fi
  return 1
}

# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

cmd_start() {
  local project_root="${1:?start requires <project_root>}"
  local session_name="${2:?start requires <session_name>}"
  local interval="${3:-}"

  mkdir -p "$project_root/_bmad-output/implementation-artifacts"

  if pid=$(is_running "$project_root"); then
    echo "task-monitor already running (PID $pid)"
    return 0
  fi

  # Clean stale PID file
  rm -f "$(pid_file "$project_root")"

  local log
  log=$(log_file "$project_root")

  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] Starting task-monitor daemon..." >> "$log"

  if [[ -n "$interval" ]]; then
    nohup "$TASK_MONITOR" "$project_root" "$session_name" "$interval" >> "$log" 2>&1 &
  else
    nohup "$TASK_MONITOR" "$project_root" "$session_name" >> "$log" 2>&1 &
  fi

  local bg_pid=$!
  disown "$bg_pid" 2>/dev/null || true
  echo "task-monitor started (PID $bg_pid)"
}

cmd_status() {
  local project_root="${1:?status requires <project_root>}"

  if pid=$(is_running "$project_root"); then
    echo "task-monitor is running (PID $pid)"
    local hb
    hb=$(heartbeat_file "$project_root")
    if [[ -f "$hb" ]]; then
      echo "--- heartbeat ---"
      cat "$hb"
    fi
    return 0
  else
    echo "task-monitor is NOT running"
    # Check for stale PID file
    local pf
    pf=$(pid_file "$project_root")
    if [[ -f "$pf" ]]; then
      echo "(stale PID file found, cleaning up)"
      rm -f "$pf"
    fi
    return 1
  fi
}

cmd_stop() {
  local project_root="${1:?stop requires <project_root>}"

  if pid=$(is_running "$project_root"); then
    echo "Stopping task-monitor (PID $pid)..."
    kill "$pid" 2>/dev/null || true
    # Wait up to 5s for graceful shutdown
    local waited=0
    while kill -0 "$pid" 2>/dev/null && (( waited < 5 )); do
      sleep 1
      waited=$((waited + 1))
    done
    if kill -0 "$pid" 2>/dev/null; then
      echo "Force killing PID $pid"
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$(pid_file "$project_root")"
    echo "task-monitor stopped"
  else
    echo "task-monitor is not running"
    rm -f "$(pid_file "$project_root")"
  fi
}

cmd_verify_start() {
  local project_root="${1:?verify-start requires <project_root>}"
  local session_name="${2:?verify-start requires <session_name>}"
  local interval="${3:-}"

  # Remove stale heartbeat so we can detect a fresh one
  rm -f "$(heartbeat_file "$project_root")"

  cmd_start "$project_root" "$session_name" "$interval"

  # Wait up to 10s for first heartbeat
  local hb
  hb=$(heartbeat_file "$project_root")
  local waited=0
  while [[ ! -f "$hb" ]] && (( waited < 10 )); do
    sleep 1
    waited=$((waited + 1))
  done

  if [[ -f "$hb" ]]; then
    echo "task-monitor verified: first heartbeat received after ${waited}s"
    return 0
  else
    echo "WARNING: no heartbeat after ${waited}s — check logs at $(log_file "$project_root")"
    return 1
  fi
}

cmd_ensure_running() {
  local project_root="${1:?ensure-running requires <project_root>}"
  local session_name="${2:?ensure-running requires <session_name>}"
  local interval="${3:-}"

  if pid=$(is_running "$project_root"); then
    echo "task-monitor already running (PID $pid)"
    return 0
  fi

  echo "task-monitor not running, starting..."
  cmd_start "$project_root" "$session_name" "$interval"
}

cmd_restart_detached() {
  local project_root="${1:?restart-detached requires <project_root>}"
  local session_name="${2:?restart-detached requires <session_name>}"
  local interval="${3:-}"

  cmd_stop "$project_root"
  sleep 1
  cmd_start "$project_root" "$session_name" "$interval"
}

# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------
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
