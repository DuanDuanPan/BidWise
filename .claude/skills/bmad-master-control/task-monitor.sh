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
SESSION_GENERATION="${4:-${MC_SESSION_GENERATION:-}}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/runtime-paths.sh"

ROOT_IMPL_DIR="$(artifacts_dir "$PROJECT_ROOT")"
SESSION_GENERATION="$(read_generation_for_project "$PROJECT_ROOT" "$SESSION_GENERATION")"
RUNTIME_DIR="${MC_RUNTIME_DIR:-$(ensure_runtime_dir "$PROJECT_ROOT" "$SESSION_NAME" "$SESSION_GENERATION")}"

PID_FILE="$RUNTIME_DIR/task-monitor.pid"
HEARTBEAT_FILE="$RUNTIME_DIR/task-monitor-heartbeat.yaml"
GATE_STATE="$ROOT_IMPL_DIR/gate-state.yaml"
GEN_LOCK="$ROOT_IMPL_DIR/generation.lock"
EVENT_BUS="$SCRIPT_DIR/event-bus.sh"

# Active phases — panes in these phases are monitored (includes pre-dev phases)
ACTIVE_PHASES="creating|prototyping|validating|dev|review|fixing|qa_running|regression"

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
LOG_FILE="$RUNTIME_DIR/task-monitor.log"

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
  if [[ -f "$PID_FILE" ]] && [[ "$(cat "$PID_FILE" 2>/dev/null)" == "$$" ]]; then
    rm -f "$PID_FILE"
  fi
  exit 0
}

trap cleanup SIGTERM SIGINT SIGHUP EXIT

# ---------------------------------------------------------------------------
# File-based dedup state (bash 3.x compatible — no associative arrays)
# ---------------------------------------------------------------------------
DEDUP_FILE="$RUNTIME_DIR/task-monitor-dedup.tmp"
[[ -f "$DEDUP_FILE" ]] || : > "$DEDUP_FILE"

# EXIT debounce counters
EXIT_COUNT_FILE="$RUNTIME_DIR/task-monitor-exit-counts.tmp"
[[ -f "$EXIT_COUNT_FILE" ]] || : > "$EXIT_COUNT_FILE"
EXIT_DEBOUNCE=3

# IDLE one-shot tracker
IDLE_FIRED_FILE="$RUNTIME_DIR/task-monitor-idle-fired.tmp"
[[ -f "$IDLE_FIRED_FILE" ]] || : > "$IDLE_FIRED_FILE"

# Per-pane log cursors for incremental signal scanning
LOG_CURSOR_FILE="$RUNTIME_DIR/task-monitor-log-cursors.tmp"
[[ -f "$LOG_CURSOR_FILE" ]] || : > "$LOG_CURSOR_FILE"

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

read_gate_state_runtime() {
  if [[ ! -f "$GATE_STATE" ]]; then
    printf '|\n'
    return
  fi

  ruby -ryaml -e '
    gs = YAML.safe_load(File.read(ARGV[0])) rescue {}
    session_name = gs["session_name"].to_s
    session_generation = gs["session_generation"].to_s
    puts "#{session_name}|#{session_generation}"
  ' "$GATE_STATE" 2>/dev/null || printf '|\n'
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

      # Map phase to the role we should monitor.
      # fixing prefers a dedicated fixing pane when present, otherwise it falls back to dev.
      active_role = case phase
                    when "creating" then "create"
                    when "prototyping" then "prototype"
                    when "validating" then "validate"
                    when "dev" then "dev"
                    when "fixing"
                      if story_panes["fixing"] && !story_panes["fixing"].to_s.empty?
                        "fixing"
                      elsif story_panes["dev"] && !story_panes["dev"].to_s.empty?
                        "dev"
                      else
                        nil
                      end
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
  local actual_session
  actual_session=$(tmux display-message -p -t "$pane_id" '#{session_name}' 2>/dev/null || true)
  [[ -n "$actual_session" && "$actual_session" == "$SESSION_NAME" ]]
}

# ---------------------------------------------------------------------------
# Capture last N lines from a pane
# ---------------------------------------------------------------------------
capture_pane_tail() {
  local pane_id="$1"
  local lines="${2:-15}"
  # Capture and strip ANSI/TUI escape sequences for reliable parsing
  tmux capture-pane -t "$pane_id" -p -S "-$lines" 2>/dev/null \
    | normalize_terminal_stream \
    || true
}

# ---------------------------------------------------------------------------
# Fallback: check mc-logs (Log layer) for sentinels missed by capture-pane
# ---------------------------------------------------------------------------
MC_LOG_DIR="$RUNTIME_DIR/mc-logs"
mkdir -p "$MC_LOG_DIR"

normalize_terminal_stream() {
  perl -0pe '
    s/\e\[[0-9;?]*[[:alpha:]]/ /g;
    s/\e\][^\a]*(?:\a|\e\\\\)/ /g;
    s/\r/\n/g;
  '
}

read_log_cursor() {
  local pane_id="$1"
  local esc
  esc=$(printf '%s' "$pane_id" | sed 's/[][\/.^$*]/\\&/g')
  grep "^${esc}=" "$LOG_CURSOR_FILE" 2>/dev/null | head -1 | sed "s/^${esc}=//" || echo "0"
}

write_log_cursor() {
  local pane_id="$1"
  local value="$2"
  local esc
  esc=$(printf '%s' "$pane_id" | sed 's/[][\/.^$*]/\\&/g')
  grep -v "^${esc}=" "$LOG_CURSOR_FILE" > "${LOG_CURSOR_FILE}.tmp" 2>/dev/null || true
  echo "${pane_id}=${value}" >> "${LOG_CURSOR_FILE}.tmp"
  mv "${LOG_CURSOR_FILE}.tmp" "$LOG_CURSOR_FILE"
}

read_new_log_chunk() {
  local pane_id="$1"
  local pane_num="${pane_id#%}"
  local logfile="$MC_LOG_DIR/pane-${pane_num}.log"
  [[ -f "$logfile" ]] || return 1

  local size prev start chunk
  size=$(wc -c < "$logfile" 2>/dev/null | tr -d '[:space:]')
  prev=$(read_log_cursor "$pane_id")
  [[ "$prev" =~ ^[0-9]+$ ]] || prev=0
  [[ "$size" =~ ^[0-9]+$ ]] || size=0

  if (( prev > size )); then
    prev=0
  fi
  if (( size <= prev )); then
    return 1
  fi

  start=$((prev + 1))
  chunk=$(tail -c +"$start" "$logfile" 2>/dev/null | normalize_terminal_stream)
  [[ -n "$chunk" ]] || return 1
  write_log_cursor "$pane_id" "$size"
  printf '%s' "$chunk"
}

check_log_for_sentinel() {
  local pane_id="$1"
  local pane_num="${pane_id#%}"
  local logfile="$MC_LOG_DIR/pane-${pane_num}.log"
  [[ -f "$logfile" ]] || return 1
  tail -400 "$logfile" 2>/dev/null \
    | normalize_terminal_stream \
    | grep -E '^[[:space:]]*MC_DONE[[:space:]]+|^[[:space:]]*HALT([[:space:]]|$)' \
    | sed 's/^[[:space:]]*//' \
    | tail -1
}

emit_dispatch_state_event() {
  local gen="$1"
  local story_id="$2"
  local pane_id="$3"
  local dispatch_state="$4"
  local payload
  payload=$(printf '{"story_id":"%s","pane_id":"%s","dispatch_state":"%s","_priority":"P3"}' \
    "$story_id" "$pane_id" "$dispatch_state")
  emit_event "$gen" "DISPATCH_STATE_CHANGED" "$payload"
}

process_log_chunk() {
  local gen="$1"
  local story_id="$2"
  local pane_id="$3"
  local scope_key="$4"
  local chunk
  chunk=$(read_new_log_chunk "$pane_id" || true)
  [[ -n "$chunk" ]] || { echo "0"; return; }

  # Terminal-state short-circuit: if dedup is already at MC_DONE/HALT,
  # skip all intermediate MC_STATE signals to prevent post-restart replay
  local current_dedup
  current_dedup="$(last_seen_signal "$scope_key")"
  local skip_intermediate=false
  case "$current_dedup" in
    LOG:MC_DONE*|LOG:HALT*) skip_intermediate=true ;;
  esac

  local count=0
  while IFS= read -r raw_line; do
    local line
    line="$(echo "$raw_line" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
    [[ -n "$line" ]] || continue

    if [[ "$line" =~ ^MC_STATE[[:space:]]+([A-Z_]+)$ ]]; then
      if "$skip_intermediate"; then
        continue
      fi
      local state_name="${BASH_REMATCH[1]}"
      local mapped_state=""
      case "$state_name" in
        WORKER_READY) mapped_state="worker_ready" ;;
        TASK_ACKED)   mapped_state="task_acked" ;;
        TASK_STARTED) mapped_state="task_started" ;;
        *)            mapped_state="" ;;
      esac
      [[ -n "$mapped_state" ]] || continue
      if dispatch_state_is_regression "$scope_key" "$mapped_state"; then
        continue
      fi
      if is_new_signal "$scope_key" "STATE:${state_name}"; then
        emit_dispatch_state_event "$gen" "$story_id" "$pane_id" "$mapped_state"
        ((count++))
      fi
      continue
    fi

    if [[ "$line" =~ ^MC_DONE[[:space:]] || "$line" =~ ^HALT([[:space:]]|$) ]]; then
      if [[ "$line" =~ ^MC_DONE[[:space:]] ]] && ! task_acked_seen "$scope_key"; then
        continue
      fi
      clear_idle_fired "$scope_key"
      if is_new_signal "$scope_key" "LOG:${line}"; then
        emit_signal_from_line "$gen" "$story_id" "$pane_id" "$line"
        ((count++))
        ACTIONABLE_THIS_CYCLE=$((ACTIONABLE_THIS_CYCLE + 1))
      fi
      continue
    fi
  done <<< "$chunk"

  echo "$count"
}

# ---------------------------------------------------------------------------
# Push notification to commander pane (reactive model)
# ---------------------------------------------------------------------------
LAST_NOTIFY_TS=0
NOTIFY_DEBOUNCE_SECS="${NOTIFY_DEBOUNCE_SECS:-10}"
NOTIFY_SENT_FILE="$RUNTIME_DIR/task-monitor-notify-sent.tmp"
ACTIONABLE_THIS_CYCLE="${ACTIONABLE_THIS_CYCLE:-0}"

resolve_commander_pane() {
  if [[ ! -f "$GATE_STATE" ]]; then
    return 1
  fi
  ruby -ryaml -e '
    gs = YAML.safe_load(File.read(ARGV[0])) rescue {}
    puts gs["commander_pane"].to_s
  ' "$GATE_STATE" 2>/dev/null
}

notify_commander() {
  local event_count="$1"
  local event_summary="${2:-}"
  local now
  now=$(date +%s)

  # Debounce: skip if last notification was recent
  if (( now - LAST_NOTIFY_TS < NOTIFY_DEBOUNCE_SECS )); then
    log_info "Skipping commander notification (debounce: ${NOTIFY_DEBOUNCE_SECS}s)"
    return
  fi

  local commander_pane
  commander_pane=$(resolve_commander_pane) || true
  if [[ -z "$commander_pane" ]]; then
    log_warn "Cannot resolve commander_pane from gate-state.yaml"
    return
  fi

  # Verify pane exists in our session
  if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    log_warn "Session $SESSION_NAME not found for notification"
    return
  fi

  # Build summary message for commander LLM
  local message="[MC-NOTIFY] ${event_count} new event(s) detected."
  if [[ -n "$event_summary" ]]; then
    message="${message} ${event_summary}"
  fi
  message="${message} Run PEEK_EVENTS to process."

  # Send as user input to commander pane
  tmux send-keys -t "$commander_pane" "$message" Enter 2>/dev/null || {
    log_error "Failed to send notification to commander pane $commander_pane"
    return
  }

  LAST_NOTIFY_TS=$now
  echo "$now|$event_count|$commander_pane" >> "$NOTIFY_SENT_FILE" 2>/dev/null || true
  log_info "Notified commander pane $commander_pane: $event_count event(s)"
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
  local scope_key="$1"
  local signal_key="$2"
  local escaped_scope_key
  escaped_scope_key=$(printf '%s' "$scope_key" | sed 's/[][\/.^$*]/\\&/g')

  local prev
  prev=$(grep "^${escaped_scope_key}=" "$DEDUP_FILE" 2>/dev/null | head -1 | sed "s/^${escaped_scope_key}=//" || true)
  if [[ "$prev" == "$signal_key" ]]; then
    return 1  # duplicate
  fi
  # Update dedup file: remove old entry, add new
  grep -v "^${escaped_scope_key}=" "$DEDUP_FILE" > "${DEDUP_FILE}.tmp" 2>/dev/null || true
  echo "${scope_key}=${signal_key}" >> "${DEDUP_FILE}.tmp"
  mv "${DEDUP_FILE}.tmp" "$DEDUP_FILE"
  return 0  # new signal
}

last_seen_signal() {
  local scope_key="$1"
  local escaped_scope_key
  escaped_scope_key=$(printf '%s' "$scope_key" | sed 's/[][\/.^$*]/\\&/g')
  grep "^${escaped_scope_key}=" "$DEDUP_FILE" 2>/dev/null | head -1 | sed "s/^${escaped_scope_key}=//" || true
}

dispatch_state_rank() {
  case "$1" in
    pane_opened)  echo 1 ;;
    worker_ready) echo 2 ;;
    task_acked)   echo 3 ;;
    task_started) echo 4 ;;
    *)            echo 0 ;;
  esac
}

materialized_dispatch_state() {
  local story_id="$1"
  [[ -f "$GATE_STATE" ]] || return 0
  ruby -ryaml -e '
    gs = YAML.safe_load(File.read(ARGV[0])) rescue {}
    puts gs.dig("story_states", ARGV[1], "dispatch_state").to_s
  ' "$GATE_STATE" "$story_id" 2>/dev/null || true
}

current_dispatch_state_for_scope() {
  local scope_key="$1"
  local prev
  prev="$(last_seen_signal "$scope_key")"
  case "$prev" in
    STATE:WORKER_READY) echo "worker_ready" ;;
    STATE:TASK_ACKED)   echo "task_acked" ;;
    STATE:TASK_STARTED) echo "task_started" ;;
    LOG:MC_DONE*|LOG:HALT*|MC_DONE*|HALT*) echo "terminal" ;;
    *)
      local story_id
      story_id="${scope_key%%|*}"
      materialized_dispatch_state "$story_id"
      ;;
  esac
}

dispatch_state_is_regression() {
  local scope_key="$1"
  local next_state="$2"
  local current_state
  current_state="$(current_dispatch_state_for_scope "$scope_key")"
  [[ "$current_state" == "terminal" ]] && return 0
  local current_rank next_rank
  current_rank=$(dispatch_state_rank "$current_state")
  next_rank=$(dispatch_state_rank "$next_state")
  (( next_rank > 0 && next_rank <= current_rank ))
}

task_acked_seen() {
  local scope_key="$1"
  local current_state
  current_state="$(current_dispatch_state_for_scope "$scope_key")"
  [[ "$current_state" == "task_acked" || "$current_state" == "task_started" || "$current_state" == "terminal" ]]
}

terminal_signal_seen() {
  local scope_key="$1"
  [[ "$(current_dispatch_state_for_scope "$scope_key")" == "terminal" ]]
}

read_exit_count() {
  local scope_key="$1"
  local esc
  esc=$(printf '%s' "$scope_key" | sed 's/[][\/.^$*]/\\&/g')
  grep "^${esc}=" "$EXIT_COUNT_FILE" 2>/dev/null | head -1 | sed "s/^${esc}=//" || echo "0"
}

incr_exit_count() {
  local scope_key="$1"
  local esc
  esc=$(printf '%s' "$scope_key" | sed 's/[][\/.^$*]/\\&/g')
  local cur
  cur=$(read_exit_count "$scope_key")
  local nxt=$((cur + 1))
  grep -v "^${esc}=" "$EXIT_COUNT_FILE" > "${EXIT_COUNT_FILE}.tmp" 2>/dev/null || true
  echo "${scope_key}=${nxt}" >> "${EXIT_COUNT_FILE}.tmp"
  mv "${EXIT_COUNT_FILE}.tmp" "$EXIT_COUNT_FILE"
  echo "$nxt"
}

reset_exit_count() {
  local scope_key="$1"
  local esc
  esc=$(printf '%s' "$scope_key" | sed 's/[][\/.^$*]/\\&/g')
  grep -v "^${esc}=" "$EXIT_COUNT_FILE" > "${EXIT_COUNT_FILE}.tmp" 2>/dev/null || true
  mv "${EXIT_COUNT_FILE}.tmp" "$EXIT_COUNT_FILE"
}

idle_already_fired() {
  grep -Fxq "$1" "$IDLE_FIRED_FILE" 2>/dev/null
}

mark_idle_fired() {
  idle_already_fired "$1" || echo "$1" >> "$IDLE_FIRED_FILE"
}

clear_idle_fired() {
  local scope_key="$1"
  local esc
  esc=$(printf '%s' "$scope_key" | sed 's/[][\/.^$*]/\\&/g')
  grep -v "^${esc}$" "$IDLE_FIRED_FILE" > "${IDLE_FIRED_FILE}.tmp" 2>/dev/null || true
  mv "${IDLE_FIRED_FILE}.tmp" "$IDLE_FIRED_FILE"
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
  if echo "$text" | grep -qE '^[[:space:]]*[$][[:space:]]*$|claude>|codex>|^[[:space:]]*[❯›➜].*$'; then
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
  elif echo "$text" | grep -qE '^[[:space:]]*[❯›➜].*$'; then
    echo "agent-prompt"
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

  # Priority 0: HALT sentinel — must be a standalone word at line start
  # (not substring match; "asphalt" or "→ HALT" in docs must not trigger)
  local halt_line
  halt_line=$(echo "$captured" | grep -E '^\s*HALT(\s|$)' | tail -1 || true)
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

emit_signal_event() {
  local gen="$1"
  local story_id="$2"
  local pane_id="$3"
  local signal="$4"
  local detail="${5:-}"
  local result="${6:-}"
  local priority="${7:-P1}"
  local payload

  if [[ "$signal" == "HALT" ]]; then
    payload=$(printf '{"story_id":"%s","pane_id":"%s","signal":"HALT","detail":"%s","_priority":"%s"}' \
      "$story_id" "$pane_id" "$(echo "$detail" | sed 's/"/\\"/g')" "$priority")
  elif [[ "$signal" == ERROR* ]]; then
    payload=$(printf '{"story_id":"%s","pane_id":"%s","signal":"ERROR","detail":"%s","_priority":"%s"}' \
      "$story_id" "$pane_id" "$(echo "$detail" | sed 's/"/\\"/g')" "$priority")
  elif [[ "$signal" == MC_DONE* ]]; then
    payload=$(printf '{"story_id":"%s","pane_id":"%s","signal":"%s","result":"%s","detail":"%s","_priority":"%s"}' \
      "$story_id" "$pane_id" "$signal" "$result" "$(echo "$detail" | sed 's/"/\\"/g')" "$priority")
  else
    payload=$(printf '{"story_id":"%s","pane_id":"%s","signal":"%s","detail":"%s","_priority":"%s"}' \
      "$story_id" "$pane_id" "$signal" "$(echo "$detail" | sed 's/"/\\"/g')" "$priority")
  fi

  emit_event "$gen" "PANE_SIGNAL_DETECTED" "$payload"
}

emit_signal_from_line() {
  local gen="$1"
  local story_id="$2"
  local pane_id="$3"
  local raw_line="$4"
  local signal detail result

  read -r signal detail <<< "$(parse_pane_output "$raw_line")"
  [[ "$signal" != "NONE" ]] || return 1

  if [[ "$signal" == MC_DONE* ]]; then
    result=$(echo "$detail" | awk '{print $4}')
  fi

  emit_signal_event "$gen" "$story_id" "$pane_id" "$signal" "$detail" "${result:-}" "P1"
  log_info "${signal} recovered from logs for $story_id (pane $pane_id)"
  return 0
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
  local scope_key="${story_id}|${pane_id}|${phase}"

  local log_events
  log_events=$(process_log_chunk "$gen" "$story_id" "$pane_id" "$scope_key")
  if [[ "$log_events" =~ ^[0-9]+$ ]] && (( log_events > 0 )); then
    clear_idle_fired "$scope_key"
    reset_exit_count "$scope_key"
    echo "$log_events"
    return
  fi

  # Defensive fallback: pipe-pane log writes are asynchronous, so a terminal
  # sentinel can exist in the log tail even if the per-pane cursor already
  # advanced past the last incremental chunk.
  local log_signal
  log_signal=$(check_log_for_sentinel "$pane_id" || true)
  if [[ -n "$log_signal" ]]; then
    if [[ "$log_signal" =~ ^MC_DONE[[:space:]] ]] && ! task_acked_seen "$scope_key"; then
      echo "0"
      return
    fi
    clear_idle_fired "$scope_key"
    reset_exit_count "$scope_key"
    if is_new_signal "$scope_key" "LOG:${log_signal}"; then
      emit_signal_from_line "$gen" "$story_id" "$pane_id" "$log_signal"
      ACTIONABLE_THIS_CYCLE=$((ACTIONABLE_THIS_CYCLE + 1))
      echo "1"
      return
    fi
    echo "0"
    return
  fi

  # Check pane liveness
  if ! pane_alive "$pane_id"; then
    local seen_count
    seen_count=$(incr_exit_count "$scope_key")
    if (( seen_count < EXIT_DEBOUNCE )); then
      echo "0"
      return
    fi

    if is_new_signal "$scope_key" "PANE_EXIT"; then
      clear_idle_fired "$scope_key"
      emit_signal_event "$gen" "$story_id" "$pane_id" "PANE_EXIT" "pane no longer alive after ${seen_count} consecutive checks" "" "P1"
      ACTIONABLE_THIS_CYCLE=$((ACTIONABLE_THIS_CYCLE + 1))
      log_info "PANE_EXIT detected for $story_id (pane $pane_id) after ${seen_count} checks"
      echo "1"
      return
    fi
    echo "0"
    return
  fi

  reset_exit_count "$scope_key"

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
      clear_idle_fired "$scope_key"
      if is_new_signal "$scope_key" "HALT:${detail}"; then
        emit_signal_event "$gen" "$story_id" "$pane_id" "HALT" "$detail" "" "P0"
        ACTIONABLE_THIS_CYCLE=$((ACTIONABLE_THIS_CYCLE + 1))
        log_warn "HALT detected for $story_id (pane $pane_id)"
        echo "1"
        return
      fi
      ;;

    MC_DONE_*)
      if ! task_acked_seen "$scope_key"; then
        echo "0"
        return
      fi
      clear_idle_fired "$scope_key"
      if is_new_signal "$scope_key" "${signal}:${detail}"; then
        local mc_result
        mc_result=$(echo "$detail" | awk '{print $4}')
        emit_signal_event "$gen" "$story_id" "$pane_id" "$signal" "$detail" "$mc_result" "P1"
        ACTIONABLE_THIS_CYCLE=$((ACTIONABLE_THIS_CYCLE + 1))
        log_info "$signal detected for $story_id (pane $pane_id)"
        echo "1"
        return
      fi
      ;;

    ERROR)
      clear_idle_fired "$scope_key"
      if is_new_signal "$scope_key" "ERROR:${detail}"; then
        emit_signal_event "$gen" "$story_id" "$pane_id" "ERROR" "$detail" "" "P2"
        ACTIONABLE_THIS_CYCLE=$((ACTIONABLE_THIS_CYCLE + 1))
        log_warn "ERROR detected for $story_id (pane $pane_id): $detail"
        echo "1"
        return
      fi
      ;;

    NONE)
      if terminal_signal_seen "$scope_key"; then
        echo "0"
        return
      fi
      if is_actively_working "$captured"; then
        clear_idle_fired "$scope_key"
        echo "0"
        return
      fi

      # Check for idle (prompt visible, no sentinel)
      if is_idle "$captured"; then
        if idle_already_fired "$scope_key"; then
          echo "0"
          return
        fi

        local idle_ind
        idle_ind=$(get_idle_indicator "$captured")
        if is_new_signal "$scope_key" "IDLE:${idle_ind}"; then
          local dispatch_state_at_detection
          dispatch_state_at_detection="$(current_dispatch_state_for_scope "$scope_key")"
          local payload
          payload=$(printf '{"story_id":"%s","pane_id":"%s","idle_indicator":"%s","dispatch_state_at_detection":"%s","_priority":"P2"}' \
            "$story_id" "$pane_id" "$idle_ind" "${dispatch_state_at_detection:-unknown}")
          emit_event "$gen" "PANE_IDLE_NO_SENTINEL" "$payload"
          ACTIONABLE_THIS_CYCLE=$((ACTIONABLE_THIS_CYCLE + 1))
          mark_idle_fired "$scope_key"
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

# ---------------------------------------------------------------------------
# Restart recovery: fast-forward dedup + cursor for panes with terminal signals
# ---------------------------------------------------------------------------
recover_terminal_signals() {
  local dominated=false
  for f in "$DEDUP_FILE" "$LOG_CURSOR_FILE" "$EXIT_COUNT_FILE" "$IDLE_FIRED_FILE"; do
    [[ -s "$f" ]] && { dominated=true; break; }
  done
  "$dominated" || return 0

  log_info "Restart detected — running terminal signal recovery"

  local gen
  gen=$(read_generation)

  local pane_list
  pane_list=$(get_active_panes)
  [[ -n "$pane_list" ]] || return 0

  while IFS=' ' read -r story_id pane_id phase role; do
    [[ -z "$story_id" || -z "$pane_id" ]] && continue
    local scope_key="${story_id}|${pane_id}|${phase}"

    local terminal_signal
    terminal_signal=$(check_log_for_sentinel "$pane_id" || true)
    [[ -n "$terminal_signal" ]] || continue

    # 1. Fast-forward dedup to terminal signal
    local escaped_scope
    escaped_scope=$(printf '%s' "$scope_key" | sed 's/[][\/.^$*]/\\&/g')
    local current_dedup
    current_dedup=$(grep "^${escaped_scope}=" "$DEDUP_FILE" 2>/dev/null \
      | head -1 | sed "s/^${escaped_scope}=//" || true)

    case "$current_dedup" in
      STATE:*|"")
        grep -v "^${escaped_scope}=" "$DEDUP_FILE" > "${DEDUP_FILE}.tmp" 2>/dev/null || true
        echo "${scope_key}=LOG:${terminal_signal}" >> "${DEDUP_FILE}.tmp"
        mv "${DEDUP_FILE}.tmp" "$DEDUP_FILE"
        log_info "Recovery: fast-forwarded dedup for $story_id to terminal signal"
        ;;
    esac

    # 2. Advance cursor to end of log to prevent rescan of intermediate states
    local pane_num="${pane_id#%}"
    local logfile="$MC_LOG_DIR/pane-${pane_num}.log"
    if [[ -f "$logfile" ]]; then
      local end_pos
      end_pos=$(wc -c < "$logfile" 2>/dev/null | tr -d '[:space:]')
      write_log_cursor "$pane_id" "$end_pos"
      log_info "Recovery: advanced cursor for $pane_id to byte $end_pos"
    fi
  done <<< "$pane_list"
}

# ===========================================================================
# Main loop
# ===========================================================================
main() {
  mkdir -p "$RUNTIME_DIR"

  local start_generation
  start_generation="$SESSION_GENERATION"

  # Write PID
  write_pid
  log_info "Task monitor started: PID=$$, session=$SESSION_NAME, generation=${start_generation}, interval=${CHECK_INTERVAL}s"
  log_info "Project root: $PROJECT_ROOT"

  # Restart recovery
  if [[ -s "$DEDUP_FILE" || -s "$LOG_CURSOR_FILE" || -s "$EXIT_COUNT_FILE" || -s "$IDLE_FIRED_FILE" ]]; then
    log_info "Resumed from existing state files (restart recovery active)"
  fi
  recover_terminal_signals

  local cycle_count=0

  while true; do
    cycle_count=$((cycle_count + 1))
    local events_this_cycle=0
    local monitored_count=0
    ACTIONABLE_THIS_CYCLE=0

    if (( cycle_count % 10 == 0 )); then
      if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        log_warn "Session '$SESSION_NAME' gone — session lease expired, self-terminating"
        exit 0
      fi

      local runtime_meta runtime_session runtime_generation current_generation
      runtime_meta=$(read_gate_state_runtime)
      IFS='|' read -r runtime_session runtime_generation <<< "$runtime_meta"
      current_generation=$(read_generation)

      if [[ -n "$runtime_session" && "$runtime_session" != "$SESSION_NAME" ]]; then
        log_warn "gate-state leased to session '$runtime_session' (ours: '$SESSION_NAME') — self-terminating"
        exit 0
      fi
      if [[ -n "$runtime_generation" && "$runtime_generation" != "$start_generation" ]]; then
        log_warn "gate-state generation changed to '$runtime_generation' (ours: '$start_generation') — self-terminating"
        exit 0
      fi
      if [[ "$current_generation" != "$start_generation" ]]; then
        log_warn "generation.lock changed to '$current_generation' (ours: '$start_generation') — self-terminating"
        exit 0
      fi
    fi

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

    # Push notification to commander only for actionable events
    # (MC_DONE, HALT, ERROR, PANE_EXIT, IDLE, TIMEOUT — not DISPATCH_STATE_CHANGED)
    if (( ACTIONABLE_THIS_CYCLE > 0 )); then
      notify_commander "$ACTIONABLE_THIS_CYCLE" "($events_this_cycle total)"
    fi

    if (( cycle_count % 20 == 0 )); then
      log_info "Heartbeat: cycle=$cycle_count, monitored=$monitored_count, events=$events_this_cycle"
    fi

    sleep "$CHECK_INTERVAL"
  done
}

if [[ "${TASK_MONITOR_LIB_ONLY:-0}" != "1" ]]; then
  main "$@"
fi
