#!/usr/bin/env bash
# watchdog.sh — 自主监控脚本（不依赖 LLM，纯结构化数据检查）
# 用法: watchdog.sh <commander_pane> <inspector_pane> <project_root>
# 在 utility pane 中以后台进程启动
#
# 只做高确定性检查（结构化数据比较），不做自然语言匹配。
# 自然语言层面的违规（如不必要提问）由 inspector 审计 session-journal 发现。

set -euo pipefail

COMMANDER_PANE="${1:?Usage: watchdog.sh <commander_pane> <inspector_pane> <project_root>}"
INSPECTOR_PANE="${2:?}"
PROJECT_ROOT="${3:?}"
ALERT_FILE="${PROJECT_ROOT}/_bmad-output/implementation-artifacts/watchdog-alerts.yaml"
JOURNAL_FILE="${PROJECT_ROOT}/_bmad-output/implementation-artifacts/session-journal.yaml"
GATE_STATE_FILE="${PROJECT_ROOT}/_bmad-output/implementation-artifacts/gate-state.yaml"
CHECK_INTERVAL=60

# 确保 alert 文件存在
mkdir -p "$(dirname "$ALERT_FILE")"
[ -f "$ALERT_FILE" ] || echo "alerts: []" > "$ALERT_FILE"

log_alert() {
  local alert_type="$1"
  local evidence="$2"
  local ts
  ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)

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
}

# ─── Check 1: LLM-Phase 不匹配（高确定性 — 纯数据比较）───
check_llm_phase_mismatch() {
  [ -f "$GATE_STATE_FILE" ] || return 0

  python3 -c "
import yaml, sys
try:
    with open('${GATE_STATE_FILE}') as f:
        state = yaml.safe_load(f) or {}
    for sid, ss in (state.get('story_states') or {}).items():
        phase = ss.get('phase', '')
        llm = ss.get('current_llm', '')
        rc = ss.get('review_cycle', 0)
        # 非升级修复阶段用了 codex = 违规 (C2)
        if phase == 'fixing' and llm == 'codex' and rc < 2:
            print(f'story {sid}: phase={phase} llm={llm} review_cycle={rc} (should be claude per C2)')
        # 审查阶段用了 claude = 违规 (C2)
        if phase == 'review' and llm == 'claude':
            print(f'story {sid}: phase={phase} llm={llm} (should be codex per C2)')
        # 验证阶段用了 claude = 违规 (C2)
        if phase == 'validating' and llm == 'claude':
            print(f'story {sid}: phase={phase} llm={llm} (should be codex per C2)')
except Exception as e:
    print(f'ERROR: {e}', file=sys.stderr)
" 2>/dev/null | while IFS= read -r line; do
    log_alert "llm_mismatch" "$line"
  done
}

# ─── Check 2: Pre-dispatch 审计缺口（高确定性 — 时间戳比较）───
check_predispatch_gap() {
  [ -f "$JOURNAL_FILE" ] || return 0

  python3 -c "
import yaml, sys
from datetime import datetime, timezone
try:
    with open('${JOURNAL_FILE}') as f:
        data = yaml.safe_load(f) or {}
    entries = data.get('entries', [])
    audits = [e for e in entries if e.get('type') == 'dispatch_audit']
    if not audits:
        # 没有任何 dispatch_audit 但已有其他条目 → 可能跳过了 pre-dispatch
        non_audits = [e for e in entries if e.get('type') != 'dispatch_audit']
        if len(non_audits) > 2:
            print('no_dispatch_audit_found')
        sys.exit(0)
    last = audits[-1]
    ts_str = last.get('timestamp', '')
    if ts_str:
        last_ts = datetime.fromisoformat(ts_str.replace('Z', '+00:00'))
        now = datetime.now(timezone.utc)
        gap = (now - last_ts).total_seconds()
        if gap > 600:  # 10 分钟无 dispatch_audit
            print(f'last_audit_{int(gap)}s_ago')
except Exception as e:
    print(f'ERROR: {e}', file=sys.stderr)
" 2>/dev/null | while IFS= read -r line; do
    if [ -n "$line" ]; then
      log_alert "predispatch_gap" "$line"
    fi
  done
}

# ─── 主循环 ───
while true; do
  sleep "$CHECK_INTERVAL"

  # 检查指挥官 pane 是否还存在
  if ! tmux list-panes -F '#{pane_id}' 2>/dev/null | grep -q "$COMMANDER_PANE"; then
    echo "[watchdog] Commander pane $COMMANDER_PANE no longer exists. Exiting."
    exit 0
  fi

  # 只执行高确定性检查（结构化数据），不做自然语言匹配
  check_llm_phase_mismatch
  check_predispatch_gap
done
