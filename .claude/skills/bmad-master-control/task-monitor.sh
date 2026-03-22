#!/usr/bin/env bash
# task-monitor.sh — background daemon for pane signal detection
# Replaces commander polling. Emits events to event-bus.
# Usage: task-monitor.sh <project_root> <session_name> [check_interval]
#
# Runs in a loop, detects signals from worker panes, and emits events
# to the event bus. Deduplicates signals per pane to avoid noise.

set -euo pipefail

# ---------------------------------------------------------------------------
# Arguments & defaults
# ---------------------------------------------------------------------------
PROJECT_ROOT="${1:?Usage: task-monitor.sh <project_root> <session_name> [check_interval]}"
SESSION_NAME="${2:?Usage: task-monitor.sh <project_root> <session_name> [check_interval]}"
CHECK_INTERVAL="${3:-${TASK_MONITOR_CHECK_INTERVAL:-15}}"

IMPL_DIR="$PROJECT_ROOT/_bmad-output/implementation-artifacts"
PID_FILE="$IMPL_DIR/task-monitor.pid"
HEARTBEAT_FILE="$IMPL_DIR/task-monitor-heartbeat.yaml"
GATE_STATE="$IMPL_DIR/gate-state.yaml"
GEN_LOCK="$IMPL_DIR/generation.lock"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EVENT_BUS="$SCRIPT_DIR/event-bus.sh"

# Active phases — panes in these phases are monitored (includes pre-dev phases)
ACTIVE_PHASES="creating|prototyping|validating|dev|review|fixing|qa_running|regression"

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
LOG_FILE="$IMPL_DIR/task-monitor.log"

log() {
  local level="$1"; shift
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] [$level] $*" >> "$LOG_FILE"
}

log_info()  { log "INFO"  "$@"; }
log_warn()  { log "WARN"  "$@"; }
log_error() { log "ERROR" "$@"; }

# ---------------------------------------------------------------------------
# PID file management
# ---------------------------------------------------------------------------
write_pid() {
  echo $$ > "$PID_FILE"
  log_info "PID $$ written to $PID_FILE"
}

cleanup() {
  log_info "Task monitor shutting down (PID $$)"
  rm -f "$PID_FILE"
  exit 0
}

trap cleanup SIGTERM SIGINT SIGHUP EXIT

# ---------------------------------------------------------------------------
# File-based dedup state (bash 3.x compatible — no associative arrays)
# ---------------------------------------------------------------------------
DEDUP_FILE="$IMPL_DIR/task-monitor-dedup.tmp"
: > "$DEDUP_FILE"  # truncate on start

# ---------------------------------------------------------------------------
# Heartbeat
# ---------------------------------------------------------------------------
write_heartbeat() {
  local cycle_count="$1"
  local monitored_count="$2"
  local events_emitted="$3"
  cat > "$HEARTBEAT_FILE" <<EOF
# task-monitor heartbeat
pid: $$
timestamp: $(date -u '+%Y-%m-%dT%H:%M:%SZ')
cycle_count: $cycle_count
monitored_panes: $monitored_count
events_emitted_this_cycle: $events_emitted
check_interval_s: $CHECK_INTERVAL
status: alive
EOF
}

# ---------------------------------------------------------------------------
# Read generation from lock file
# ---------------------------------------------------------------------------
read_generation() {
  if [[ -f "$GEN_LOCK" ]]; then
    cat "$GEN_LOCK" | tr -d '[:space:]'
  else
    echo "0"
  fi
}

# ---------------------------------------------------------------------------
# Parse gate-state.yaml for active story panes
# Returns lines of: story_id pane_id phase role
# Uses embedded Ruby for reliable YAML parsing.
# ---------------------------------------------------------------------------
get_active_panes() {
  if [[ ! -f "$GATE_STATE" ]]; then
    log_warn "gate-state.yaml not found at $GATE_STATE"
    return
  fi

  # Use Ruby to parse YAML and extract active story panes
  ruby -ryaml -e '
    gs = YAML.safe_load(File.read(ARGV[0])) rescue nil
    exit 0 unless gs.is_a?(Hash)

    story_states = gs["story_states"] || {}
    panes = (gs.dig("panes", "stories") || {})

    active_re = /^('"$ACTIVE_PHASES"')$/

    story_states.each do |sid, info|
      next unless info.is_a?(Hash)
      phase = info["phase"].to_s
      next unless phase.match?(active_re)
      story_panes = panes[sid]
      next unless story_panes.is_a?(Hash)

      # Map phase to the role we should monitor
      active_role = case phase
                    when "creating" then "create"
                    when "prototyping" then "prototype"
                    when "validating" then "validate"
                    when "dev", "fixing" then nil  # monitor whatever role exists
                    when "review" then "review"
                    when "qa_running" then "qa"
                    when "regression" then "regression"
                    else nil
                    end

      story_panes.each do |role, pid|
        next unless pid && !pid.to_s.empty?
        # If we know the active role, only monitor that one
        next if active_role && role != active_role
        puts "#{sid} #{pid} #{phase} #{role}"
      end
    end
  ' "$GATE_STATE" 2>/dev/null
}

# ---------------------------------------------------------------------------
# Check if a tmux pane is alive
# ---------------------------------------------------------------------------
pane_alive() {
  local pane_id="$1"
  tmux list-panes -t "$SESSION_NAME" -F '#{pane_id}' 2>/dev/null | grep -qF "$pane_id"
}

# ---------------------------------------------------------------------------
# Capture last N lines from a pane
# ---------------------------------------------------------------------------
capture_pane_tail() {
  local pane_id="$1"
  local lines="${2:-15}"
  # Capture and strip ANSI/TUI escape sequences for reliable parsing
  tmux capture-pane -t "$pane_id" -p -S "-$lines" 2>/dev/null \
    | sed 's/\x1b\[[0-9;]*[a-zA-Z]//g; s/\x1b\][^\x07]*\x07//g' \
    || true
}

# ---------------------------------------------------------------------------
# Fallback: check mc-logs (Log layer) for sentinels missed by capture-pane
# ---------------------------------------------------------------------------
MC_LOG_DIR="$IMPL_DIR/mc-logs"

check_log_for_sentinel() {
  local pane_id="$1"
  local pane_num="${pane_id#%}"
  local logfile="$MC_LOG_DIR/pane-${pane_num}.log"
  [[ -f "$logfile" ]] || return 1
  # Search last 200 lines of log for MC_DONE or HALT (strip ANSI)
  tail -200 "$logfile" 2>/dev/null \
    | sed 's/\x1b\[[0-9;]*[a-zA-Z]//g' \
    | grep -E '^MC_DONE |HALT' \
    | tail -1
}

# ---------------------------------------------------------------------------
# Emit an event via event-bus.sh
# ---------------------------------------------------------------------------
emit_event() {
  local gen="$1"
  local event_type="$2"
  local payload_json="$3"

  if [[ -x "$EVENT_BUS" ]]; then
    "$EVENT_BUS" append "$PROJECT_ROOT" "$gen" "$event_type" "task_monitor" "null" "$payload_json" >/dev/null 2>/dev/null || {
      log_error "Failed to emit event: type=$event_type payload=$payload_json"
    }
  else
    log_error "event-bus.sh not found or not executable at $EVENT_BUS"
  fi
}

# ---------------------------------------------------------------------------
# Dedup check — returns 0 (true) if this signal is new, 1 if duplicate
# ---------------------------------------------------------------------------
is_new_signal() {
  local pane_id="$1"
  local signal_key="$2"
  local escaped_pane_id
  escaped_pane_id=$(printf '%s' "$pane_id" | sed 's/[%]/\\%/g')

  local prev
  prev=$(grep "^${escaped_pane_id}=" "$DEDUP_FILE" 2>/dev/null | head -1 | sed "s/^${escaped_pane_id}=//" || true)
  if [[ "$prev" == "$signal_key" ]]; then
    return 1  # duplicate
  fi
  # Update dedup file: remove old entry, add new
  grep -v "^${escaped_pane_id}=" "$DEDUP_FILE" > "${DEDUP_FILE}.tmp" 2>/dev/null || true
  echo "${pane_id}=${signal_key}" >> "${DEDUP_FILE}.tmp"
  mv "${DEDUP_FILE}.tmp" "$DEDUP_FILE"
  return 0  # new signal
}

# ---------------------------------------------------------------------------
# Detect if Claude Code / Codex is actively working (spinner, thinking, etc.)
# If active, we should NOT report idle even if a prompt char is visible.
# ---------------------------------------------------------------------------
is_actively_working() {
  local text="$1"
  # Claude Code spinner patterns: unicode spinners + status text
  if echo "$text" | grep -qE 'Drizzling|Quantumizing|Spiraling|Crystallizing|Vaporizing|Reflecting'; then
    return 0
  fi
  # Generic activity indicators
  if echo "$text" | grep -qE 'Running…|thinking|tool uses.*ctrl'; then
    return 0
  fi
  # Time-stamped progress: (3m 36s · ↓ 21.8k tokens)
  if echo "$text" | grep -qE '\([0-9]+[ms] [0-9]+s · ↓'; then
    return 0
  fi
  # Agent sub-tasks still in progress
  if echo "$text" | grep -qE 'agents? (started|running|finished)'; then
    return 0
  fi
  return 1
}

# ---------------------------------------------------------------------------
# Detect idle indicators in captured text
# ---------------------------------------------------------------------------
is_idle() {
  local text="$1"
  # First: if actively working, never report idle
  if is_actively_working "$text"; then
    return 1
  fi
  # Check for common prompt patterns: bare $, claude>, codex>
  if echo "$text" | grep -qE '^\s*\$\s*$|claude>|codex>|\❯\s*$|➜\s*$'; then
    return 0
  fi
  return 1
}

# ---------------------------------------------------------------------------
# Extract idle indicator string
# ---------------------------------------------------------------------------
get_idle_indicator() {
  local text="$1"
  if echo "$text" | grep -qE 'claude>'; then
    echo "claude>"
  elif echo "$text" | grep -qE 'codex>'; then
    echo "codex>"
  elif echo "$text" | grep -qE '^\s*\$\s*$'; then
    echo '$'
  else
    echo "prompt"
  fi
}

# ---------------------------------------------------------------------------
# Parse captured pane text for signals
# Returns: signal_type detail_line
# ---------------------------------------------------------------------------
parse_pane_output() {
  local captured="$1"

  # Priority 0: HALT sentinel
  local halt_line
  halt_line=$(echo "$captured" | grep -F "HALT" | tail -1 || true)
  if [[ -n "$halt_line" ]]; then
    echo "HALT" "$halt_line"
    return
  fi

  # Priority 1: MC_DONE sentinel
  # Format: MC_DONE {PHASE} {story_id} {RESULT}
  local done_line
  done_line=$(echo "$captured" | grep -E '^MC_DONE ' | tail -1 || true)
  if [[ -n "$done_line" ]]; then
    # Parse phase from the MC_DONE line
    local phase
    phase=$(echo "$done_line" | awk '{print $2}')
    local signal="MC_DONE"
    # Map phase to specific signal
    case "$phase" in
      DEV|dev)       signal="MC_DONE_DEV" ;;
      REVIEW|review) signal="MC_DONE_REVIEW" ;;
      *)             signal="MC_DONE_${phase}" ;;
    esac
    echo "$signal" "$done_line"
    return
  fi

  # Priority 2: Error patterns
  local error_line
  # Rate limit
  error_line=$(echo "$captured" | grep -iE 'rate.?limit|429|too many requests' | tail -1 || true)
  if [[ -n "$error_line" ]]; then
    echo "ERROR" "$error_line"
    return
  fi
  # Content filter
  error_line=$(echo "$captured" | grep -iE 'content.?filter|blocked|safety' | tail -1 || true)
  if [[ -n "$error_line" ]]; then
    echo "ERROR" "$error_line"
    return
  fi
  # Stack trace / exception
  error_line=$(echo "$captured" | grep -iE 'Traceback|Error:|FATAL|panic:|Unhandled' | tail -1 || true)
  if [[ -n "$error_line" ]]; then
    echo "ERROR" "$error_line"
    return
  fi

  # No signal detected
  echo "NONE" ""
}

# ---------------------------------------------------------------------------
# Analyze a single pane and emit events if warranted
# Returns the number of events emitted (0 or 1)
# ---------------------------------------------------------------------------
analyze_pane() {
  local story_id="$1"
  local pane_id="$2"
  local phase="$3"
  local gen="$4"

  # Check pane liveness
  if ! pane_alive "$pane_id"; then
    local sig_key="PANE_EXIT"
    if is_new_signal "$pane_id" "$sig_key"; then
      local payload
      payload=$(printf '{"story_id":"%s","pane_id":"%s","signal":"PANE_EXIT","detail":"pane no longer alive","_priority":"P1"}' \
        "$story_id" "$pane_id")
      emit_event "$gen" "PANE_SIGNAL_DETECTED" "$payload"
      log_info "PANE_EXIT detected for $story_id (pane $pane_id)"
      echo "1"
      return
    fi
    echo "0"
    return
  fi

  # Capture last 15 lines (enough to see spinner above prompt)
  local captured
  captured=$(capture_pane_tail "$pane_id" 15)

  if [[ -z "$captured" ]]; then
    echo "0"
    return
  fi

  # Parse output
  local signal detail
  read -r signal detail <<< "$(parse_pane_output "$captured")"

  case "$signal" in
    HALT)
      local sig_key="HALT:${detail}"
      if is_new_signal "$pane_id" "$sig_key"; then
        local payload
        payload=$(printf '{"story_id":"%s","pane_id":"%s","signal":"HALT","detail":"%s","_priority":"P0"}' \
          "$story_id" "$pane_id" "$(echo "$detail" | sed 's/"/\\"/g')")
        emit_event "$gen" "PANE_SIGNAL_DETECTED" "$payload"
        log_warn "HALT detected for $story_id (pane $pane_id)"
        echo "1"
        return
      fi
      ;;

    MC_DONE_*)
      local sig_key="${signal}:${detail}"
      if is_new_signal "$pane_id" "$sig_key"; then
        # Extract result (4th field) from MC_DONE line: MC_DONE {PHASE} {story_id} {RESULT}
        local mc_result
        mc_result=$(echo "$detail" | awk '{print $4}')
        local payload
        payload=$(printf '{"story_id":"%s","pane_id":"%s","signal":"%s","result":"%s","detail":"%s","_priority":"P1"}' \
          "$story_id" "$pane_id" "$signal" "$mc_result" "$(echo "$detail" | sed 's/"/\\"/g')")
        emit_event "$gen" "PANE_SIGNAL_DETECTED" "$payload"
        log_info "$signal detected for $story_id (pane $pane_id)"
        echo "1"
        return
      fi
      ;;

    ERROR)
      local sig_key="ERROR:${detail}"
      if is_new_signal "$pane_id" "$sig_key"; then
        local payload
        payload=$(printf '{"story_id":"%s","pane_id":"%s","signal":"ERROR","detail":"%s","_priority":"P2"}' \
          "$story_id" "$pane_id" "$(echo "$detail" | sed 's/"/\\"/g')")
        emit_event "$gen" "PANE_SIGNAL_DETECTED" "$payload"
        log_warn "ERROR detected for $story_id (pane $pane_id): $detail"
        echo "1"
        return
      fi
      ;;

    NONE)
      # Check for idle (prompt visible, no sentinel)
      if is_idle "$captured"; then
        local idle_ind
        idle_ind=$(get_idle_indicator "$captured")
        local sig_key="IDLE:${idle_ind}"
        if is_new_signal "$pane_id" "$sig_key"; then
          local payload
          payload=$(printf '{"story_id":"%s","pane_id":"%s","idle_indicator":"%s","dispatch_state_at_detection":"%s","_priority":"P2"}' \
            "$story_id" "$pane_id" "$idle_ind" "$phase")
          emit_event "$gen" "PANE_IDLE_NO_SENTINEL" "$payload"
          log_info "IDLE detected for $story_id (pane $pane_id), indicator=$idle_ind"
          echo "1"
          return
        fi
      fi
      # Running normally — P3, no event
      ;;
  esac

  echo "0"
}

# ===========================================================================
# Main loop
# ===========================================================================
main() {
  mkdir -p "$IMPL_DIR"

  # Write PID
  write_pid
  log_info "Task monitor started: PID=$$, session=$SESSION_NAME, interval=${CHECK_INTERVAL}s"
  log_info "Project root: $PROJECT_ROOT"

  local cycle_count=0

  while true; do
    cycle_count=$((cycle_count + 1))
    local events_this_cycle=0
    local monitored_count=0

    # Read current generation
    local gen
    gen=$(read_generation)

    # Get active panes from gate-state
    local pane_list
    pane_list=$(get_active_panes)

    if [[ -n "$pane_list" ]]; then
      while IFS=' ' read -r story_id pane_id phase role; do
        [[ -z "$story_id" || -z "$pane_id" ]] && continue
        monitored_count=$((monitored_count + 1))

        local emitted
        emitted=$(analyze_pane "$story_id" "$pane_id" "$phase" "$gen")
        events_this_cycle=$((events_this_cycle + emitted))
      done <<< "$pane_list"
    fi

    # Write heartbeat
    write_heartbeat "$cycle_count" "$monitored_count" "$events_this_cycle"

    if (( cycle_count % 20 == 0 )); then
      log_info "Heartbeat: cycle=$cycle_count, monitored=$monitored_count, events=$events_this_cycle"
    fi

    sleep "$CHECK_INTERVAL"
  done
}

main "$@"
