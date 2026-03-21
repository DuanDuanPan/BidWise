#!/usr/bin/env bash
# watchdog.sh — 自主监控脚本（不依赖 LLM，纯结构化数据检查）
# 用法: watchdog.sh <commander_pane> <inspector_pane> <project_root> <session_name> [session_generation]
# 在 utility pane 中以后台进程启动
#
# 只做高确定性检查（结构化数据比较），不做自然语言匹配。
# 自然语言层面的违规（如不必要提问）由 inspector 审计 session-journal 发现。

set -euo pipefail

COMMANDER_PANE="${1:?Usage: watchdog.sh <commander_pane> <inspector_pane> <project_root> <session_name>}"
INSPECTOR_PANE="${2:?}"
PROJECT_ROOT="${3:?}"
SESSION_NAME="${4:?}"
SESSION_GENERATION="${5:-0}"
ALERT_FILE="${PROJECT_ROOT}/_bmad-output/implementation-artifacts/watchdog-alerts.yaml"
JOURNAL_FILE="${PROJECT_ROOT}/_bmad-output/implementation-artifacts/session-journal.yaml"
GATE_STATE_FILE="${PROJECT_ROOT}/_bmad-output/implementation-artifacts/gate-state.yaml"
SENTINEL_FILE="${PROJECT_ROOT}/_bmad-output/implementation-artifacts/restart-eligible.yaml"
PID_FILE="${PROJECT_ROOT}/_bmad-output/implementation-artifacts/watchdog.pid"
HEARTBEAT_FILE="${PROJECT_ROOT}/_bmad-output/implementation-artifacts/watchdog-heartbeat.yaml"
CHECK_INTERVAL=60
SESSION_MAX_SECONDS=3600  # 1 小时

# 确保 alert 文件存在
mkdir -p "$(dirname "$ALERT_FILE")"
[ -f "$ALERT_FILE" ] || echo "alerts: []" > "$ALERT_FILE"

# 会话计时器
SESSION_START=$(date +%s)
sentinel_written=false
ALERT_COUNT=0

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
sentinel_written: ${sentinel_written}
alerts_count: ${ALERT_COUNT}
EOF
}

log_alert() {
  local alert_type="$1"
  local evidence="$2"
  local ts
  ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  ALERT_COUNT=$((ALERT_COUNT + 1))

  cat >> "$ALERT_FILE" <<EOF
  - timestamp: "${ts}"
    type: "${alert_type}"
    evidence: "${evidence}"
EOF

  # 通知监察官
  tmux send-keys -t "$INSPECTOR_PANE" \
    "WATCHDOG ALERT [${alert_type}]: ${evidence}. 请读取 ${ALERT_FILE} 和 ${JOURNAL_FILE} 验证。" Enter
  sleep 1
  tmux send-keys -t "$INSPECTOR_PANE" Enter
  write_heartbeat
}

# ─── Check 1: LLM-Phase 不匹配（高确定性 — 纯数据比较）───
check_llm_phase_mismatch() {
  [ -f "$GATE_STATE_FILE" ] || return 0

  ruby - "$GATE_STATE_FILE" <<'RUBY' | while IFS= read -r line; do
require "yaml"
begin
  state = YAML.load_file(ARGV[0]) || {}
  story_states = state.fetch("story_states", {})
  story_states.each do |sid, ss|
    phase = ss.fetch("phase", "")
    llm = ss.fetch("current_llm", "")
    rc = Integer(ss.fetch("review_cycle", 0)) rescue 0
    if phase == "fixing" && llm == "codex" && rc < 2
      puts "story #{sid}: phase=#{phase} llm=#{llm} review_cycle=#{rc} (should be claude per C2)"
    end
    if phase == "review" && llm == "claude"
      puts "story #{sid}: phase=#{phase} llm=#{llm} (should be codex per C2)"
    end
  end
rescue StandardError => e
  puts "watchdog_parse_error: #{e.class}: #{e.message}"
end
RUBY
    log_alert "llm_mismatch" "$line"
  done
}

# ─── Check 1b: dispatch_audit 中的固定 phase/LLM 契约 ───
check_dispatch_contract_mismatch() {
  [ -f "$JOURNAL_FILE" ] || return 0

  ruby - "$JOURNAL_FILE" <<'RUBY' | while IFS= read -r line; do
require "yaml"
begin
  data = YAML.load_file(ARGV[0]) || {}
  entries = Array(data.fetch("entries", []))
  seen = {}
  entries.last(20).each do |entry|
    next unless entry.fetch("type", "") == "dispatch_audit"
    phase = entry.fetch("phase", "")
    llm = entry.fetch("llm", "")
    story_id = entry.fetch("story_id", "")
    seq = entry.fetch("seq", "")
    key = [seq, story_id, phase, llm]
    next if seen[key]
    seen[key] = true
    if ["validate", "review", "qa", "regression"].include?(phase) && llm != "codex"
      puts "seq #{seq} story #{story_id}: phase=#{phase} llm=#{llm} (should be codex)"
    end
    if ["create", "prototype", "dev"].include?(phase) && llm != "claude"
      puts "seq #{seq} story #{story_id}: phase=#{phase} llm=#{llm} (should be claude)"
    end
  end
rescue StandardError => e
  puts "watchdog_parse_error: #{e.class}: #{e.message}"
end
RUBY
    log_alert "dispatch_contract_mismatch" "$line"
  done
}

# ─── Check 2: Pre-dispatch 审计缺口（感知当前阶段，避免长任务误报）───
check_predispatch_gap() {
  [ -f "$JOURNAL_FILE" ] || return 0
  [ -f "$GATE_STATE_FILE" ] || return 0

  ruby - "$GATE_STATE_FILE" "$JOURNAL_FILE" <<'RUBY' | while IFS= read -r line; do
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
  entries = Array(data.fetch("entries", []))
  recent_activity = entries.select do |entry|
    ["dispatch_audit", "correction"].include?(entry.fetch("type", ""))
  end

  if recent_activity.empty?
    puts "no_dispatch_or_correction_found" if entries.length > 2
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
    if [ -n "$line" ]; then
      log_alert "predispatch_gap" "$line"
    fi
  done
}

# ─── Check 3: 会话超时 → 写入 restart-eligible 标记 ───
check_session_timeout() {
  local now
  now=$(date +%s)
  local elapsed=$(( now - SESSION_START ))

  if [ "$elapsed" -ge "$SESSION_MAX_SECONDS" ] && [ "$sentinel_written" = false ]; then
    local ts
    ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    cat > "$SENTINEL_FILE" <<EOF
reason: "session_timeout"
elapsed_seconds: ${elapsed}
timestamp: "${ts}"
commander_pane: "${COMMANDER_PANE}"
session_name: "${SESSION_NAME}"
session_generation: $(current_generation)
EOF
    sentinel_written=true
    write_heartbeat
    echo "[watchdog] Session exceeded ${SESSION_MAX_SECONDS}s. Wrote restart-eligible sentinel."
  fi
}

# ─── Check 4: restart-eligible 被消费 → 重置计时器 ───
check_sentinel_consumed() {
  if [ "$sentinel_written" = true ] && [ ! -f "$SENTINEL_FILE" ]; then
    SESSION_START=$(date +%s)
    sentinel_written=false
    write_heartbeat
    echo "[watchdog] Sentinel consumed. Timer reset."
  fi
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
  check_session_timeout
  check_sentinel_consumed
  write_heartbeat
done
