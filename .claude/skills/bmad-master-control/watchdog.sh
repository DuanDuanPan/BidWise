#!/usr/bin/env bash
# watchdog.sh — 自主监控脚本（不依赖 LLM，纯结构化数据检查）
# 用法: watchdog.sh <commander_pane> <inspector_pane> <project_root> <session_name> [session_generation]
# 在 utility pane 中以后台进程启动
#
# 只做高确定性检查（结构化数据比较），不做自然语言匹配。
# 自然语言层面的违规（如不必要提问）由 inspector 审计 event-log 发现。

set -euo pipefail

COMMANDER_PANE="${1:?Usage: watchdog.sh <commander_pane> <inspector_pane> <project_root> <session_name>}"
INSPECTOR_PANE="${2:?}"
PROJECT_ROOT="${3:?}"
SESSION_NAME="${4:?}"
SESSION_GENERATION="${5:-0}"
ALERT_FILE="${PROJECT_ROOT}/_bmad-output/implementation-artifacts/watchdog-alerts.yaml"
ALERT_CACHE_FILE="${PROJECT_ROOT}/_bmad-output/implementation-artifacts/watchdog-alert-cache.txt"
EVENT_LOG_FILE="${PROJECT_ROOT}/_bmad-output/implementation-artifacts/event-log.yaml"
GATE_STATE_FILE="${PROJECT_ROOT}/_bmad-output/implementation-artifacts/gate-state.yaml"
PID_FILE="${PROJECT_ROOT}/_bmad-output/implementation-artifacts/watchdog.pid"
HEARTBEAT_FILE="${PROJECT_ROOT}/_bmad-output/implementation-artifacts/watchdog-heartbeat.yaml"
CHECK_INTERVAL="${WATCHDOG_CHECK_INTERVAL:-60}"

ensure_alert_file() {
  mkdir -p "$(dirname "$ALERT_FILE")"

  if [ ! -f "$ALERT_FILE" ]; then
    printf 'alerts:\n' > "$ALERT_FILE"
    return
  fi

  if [ "$(head -n 1 "$ALERT_FILE" 2>/dev/null || true)" = "alerts: []" ]; then
    local tmp_file
    tmp_file="$(mktemp)"
    {
      printf 'alerts:\n'
      tail -n +2 "$ALERT_FILE"
    } > "$tmp_file"
    mv "$tmp_file" "$ALERT_FILE"
  fi
}

count_existing_alerts() {
  awk 'BEGIN { count = 0 } /^  - timestamp:/ { count++ } END { print count }' "$ALERT_FILE" 2>/dev/null
}

ALERT_COUNT=0

ensure_alert_file
mkdir -p "$(dirname "$ALERT_CACHE_FILE")"
: > "$ALERT_CACHE_FILE"
ALERT_COUNT="$(count_existing_alerts)"

cleanup() {
  rm -f "$PID_FILE"
}

trap cleanup EXIT

current_generation() {
  local generation="$SESSION_GENERATION"
  if [ -f "$GATE_STATE_FILE" ]; then
    local parsed
    parsed=$(sed -n 's/^session_generation:[[:space:]]*//p' "$GATE_STATE_FILE" | head -n 1 | tr -d '" ')
    if [ -n "$parsed" ]; then
      generation="$parsed"
    fi
  fi
  printf '%s\n' "$generation"
}

alert_cache_key() {
  local alert_type="$1"
  local evidence="$2"
  local generation
  generation="$(current_generation)"

  printf '%s' "${generation}|${alert_type}|${evidence}" | shasum -a 256 | awk '{print $1}'
}

alert_seen() {
  local key
  key="$(alert_cache_key "$1" "$2")"
  grep -Fxq "$key" "$ALERT_CACHE_FILE" 2>/dev/null
}

remember_alert() {
  local key
  key="$(alert_cache_key "$1" "$2")"
  printf '%s\n' "$key" >> "$ALERT_CACHE_FILE"
}

notify_inspector() {
  local message="$1"

  if tmux list-panes -a -F '#{pane_id}' 2>/dev/null | grep -Fxq "$INSPECTOR_PANE"; then
    tmux send-keys -t "$INSPECTOR_PANE" "$message" Enter || true
    sleep 1
    tmux send-keys -t "$INSPECTOR_PANE" Enter || true
  else
    echo "[watchdog] inspector pane '${INSPECTOR_PANE}' missing; alert recorded without notify."
  fi
}

write_heartbeat() {
  local ts generation
  ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  generation=$(current_generation)

  printf '%s\n' "$$" > "$PID_FILE"
  cat > "$HEARTBEAT_FILE" <<EOF
pid: $$
session_name: "${SESSION_NAME}"
commander_pane: "${COMMANDER_PANE}"
inspector_pane: "${INSPECTOR_PANE}"
session_generation: ${generation}
last_check: "${ts}"
alerts_count: ${ALERT_COUNT}
EOF
}

log_alert() {
  local alert_type="$1"
  local evidence="$2"
  local ts

  [ -n "$evidence" ] || return 0

  if alert_seen "$alert_type" "$evidence"; then
    return 0
  fi

  ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  ALERT_COUNT=$((ALERT_COUNT + 1))

  cat >> "$ALERT_FILE" <<EOF
  - timestamp: "${ts}"
    type: "${alert_type}"
    evidence: "${evidence}"
EOF

  remember_alert "$alert_type" "$evidence"
  notify_inspector "WATCHDOG ALERT [${alert_type}]: ${evidence}. 请读取 ${ALERT_FILE} 和 ${EVENT_LOG_FILE} 验证。"
  write_heartbeat
}

# ─── Check 1: LLM-Phase 不匹配（高确定性 — 纯数据比较）───
check_llm_phase_mismatch() {
  [ -f "$GATE_STATE_FILE" ] || return 0

  while IFS= read -r line; do
    [ -n "$line" ] || continue
    log_alert "llm_mismatch" "$line"
  done < <(ruby - "$GATE_STATE_FILE" "$EVENT_LOG_FILE" <<'RUBY'
require "yaml"
begin
  state = YAML.load_file(ARGV[0]) || {}
  event_log = File.exist?(ARGV[1]) ? (YAML.load_file(ARGV[1]) || {}) : {}
  story_states = state.fetch("story_states", {})
  events = Array(event_log.fetch("events", []))
  latest_dispatch = {}

  events.each do |event|
    next unless event.fetch("type", "") == "TASK_DISPATCHED"
    payload = event.fetch("payload", {}) || {}
    latest_dispatch[payload.fetch("story_id", "")] = payload
  end

  override_user = lambda do |payload, llm, phase|
    next false unless payload.is_a?(Hash)

    constitution_check = payload.fetch("constitution_check", "")
    constitution_detail = payload.fetch("constitution_detail", "").to_s
    constitution_check == "PASS" && constitution_detail.include?("C2:#{llm}/#{phase}=OVERRIDE-USER")
  end

  story_states.each do |sid, ss|
    phase = ss.fetch("phase", "")
    llm = ss.fetch("current_llm", "")
    rc = Integer(ss.fetch("review_cycle", 0)) rescue 0
    dispatch_payload = latest_dispatch[sid]

    if phase == "fixing" && llm == "codex" && rc < 2 && !override_user.call(dispatch_payload, llm, phase)
      puts "story #{sid}: phase=#{phase} llm=#{llm} review_cycle=#{rc} (should be claude per C2)"
    end
    if phase == "review" && llm == "claude" && !override_user.call(dispatch_payload, llm, phase)
      puts "story #{sid}: phase=#{phase} llm=#{llm} (should be codex per C2)"
    end
  end
rescue StandardError => e
  puts "watchdog_parse_error: #{e.class}: #{e.message}"
end
RUBY
)
}

# ─── Check 1b: TASK_DISPATCHED 中的固定 phase/LLM 契约 ───
check_dispatch_contract_mismatch() {
  [ -f "$EVENT_LOG_FILE" ] || return 0

  while IFS= read -r line; do
    [ -n "$line" ] || continue
    log_alert "dispatch_contract_mismatch" "$line"
  done < <(ruby - "$EVENT_LOG_FILE" <<'RUBY'
require "yaml"
begin
  data = YAML.load_file(ARGV[0]) || {}
  events = Array(data.fetch("events", []))
  seen = {}

  override_user = lambda do |payload, llm, phase|
    constitution_check = payload.fetch("constitution_check", "")
    constitution_detail = payload.fetch("constitution_detail", "").to_s
    constitution_check == "PASS" && constitution_detail.include?("C2:#{llm}/#{phase}=OVERRIDE-USER")
  end

  dispatches = events.select { |e| e.fetch("type", "") == "TASK_DISPATCHED" }
  dispatches.last(20).each do |event|
    payload = event.fetch("payload", {}) || {}
    phase = payload.fetch("phase", "")
    llm = payload.fetch("llm", "")
    story_id = payload.fetch("story_id", "")
    seq = payload.fetch("trigger_seq", "")
    key = [seq, story_id, phase, llm]
    next if seen[key]
    seen[key] = true
    if ["validate", "review", "qa", "regression"].include?(phase) && llm != "codex" && !override_user.call(payload, llm, phase)
      puts "seq #{seq} story #{story_id}: phase=#{phase} llm=#{llm} (should be codex)"
    end
    if ["create", "prototype", "dev"].include?(phase) && llm != "claude" && !override_user.call(payload, llm, phase)
      puts "seq #{seq} story #{story_id}: phase=#{phase} llm=#{llm} (should be claude)"
    end
  end
rescue StandardError => e
  puts "watchdog_parse_error: #{e.class}: #{e.message}"
end
RUBY
)
}

# ─── Check 2: Pre-dispatch 审计缺口（感知当前阶段，避免长任务误报）───
check_predispatch_gap() {
  [ -f "$EVENT_LOG_FILE" ] || return 0
  [ -f "$GATE_STATE_FILE" ] || return 0

  while IFS= read -r line; do
    if [ -n "$line" ]; then
      log_alert "predispatch_gap" "$line"
    fi
  done < <(ruby - "$GATE_STATE_FILE" "$EVENT_LOG_FILE" <<'RUBY'
require "yaml"
require "time"
begin
  state = YAML.load_file(ARGV[0]) || {}
  story_states = state.fetch("story_states", {})
  phases = story_states.values.map { |s| s.fetch("phase", "") }

  has_pending = phases.include?("pending_review")
  all_past_dev = phases.all? { |phase| ["auto_qa_pending", "qa_running", "uat_waiting", "done"].include?(phase) }
  has_qa_pending = phases.include?("auto_qa_pending")
  batch_stalled = all_past_dev && has_qa_pending

  exit 0 unless has_pending || batch_stalled

  data = YAML.load_file(ARGV[1]) || {}
  events = Array(data.fetch("events", []))
  recent_activity = events.select do |event|
    ["TASK_DISPATCHED", "CORRECTION"].include?(event.fetch("type", ""))
  end

  if recent_activity.empty?
    puts "no_dispatch_or_correction_found" if events.length > 2
    exit 0
  end

  last = recent_activity.last
  ts_str = last.fetch("timestamp", "")
  unless ts_str.empty?
    gap = Time.now.utc - Time.parse(ts_str)
    puts "last_activity_#{gap.to_i}s_ago" if gap > 600
  end
rescue StandardError => e
  puts "watchdog_parse_error: #{e.class}: #{e.message}"
end
RUBY
)
}

# ─── 主循环 ───
write_heartbeat

while true; do
  sleep "$CHECK_INTERVAL"

  # 检查 tmux session 是否还存在（不绑定单个 pane）
  if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo "[watchdog] Session '$SESSION_NAME' no longer exists. Exiting."
    exit 0
  fi

  # 确定性检查（结构化数据）
  check_llm_phase_mismatch
  check_dispatch_contract_mismatch
  check_predispatch_gap
  write_heartbeat
done
