# TMUX Commands Reference

## 标准布局

```
┌──────────────────────┬─────────────┐
│   Commander (指挥官)  │  Inspector  │
│                      │  (监察官)    │
├──────┬───────┬───────┴──────┬──────┤
│ Util │ Dev-1 │    Dev-2     │Dev-3 │
└──────┴───────┴──────────────┴──────┘
```

**创建顺序（F12 强制）：**
1. 先 Inspector: `-t {commander_pane} -h -l 30%`（commander 右侧）
2. 再 Utility: `-t {commander_pane} -v -l 40%`（commander 下方）
3. Dev panes: `-t {utility_pane} -h`（底部行横向扩展）

**关键：所有 split 的 `-t` 目标必须是具体 pane ID（如 `%74`），禁止用 session 名。**
用 session 名时 tmux 会 split 当前活跃 pane，一旦焦点变化布局就错。

按需查阅。指挥官在需要具体 tmux 命令语法时 Read 此文件。

## Sub-Pane 创建

```bash
# Claude pane (Create Story, Prototype, Dev, Fix)
tmux split-window -t {utility_pane} -h "cd {path} && claude --dangerously-skip-permissions"

# Codex pane (Validate, Code Review, 顽固 bug 修复, Regression)
tmux split-window -t {utility_pane} -h "cd {path} && codex -c model_reasoning_summary_format=experimental --search --dangerously-bypass-approvals-and-sandbox"
```

## 消息发送

```bash
# 发送任务到 pane
tmux send-keys -t {pane_id} '命令内容' Enter

# Codex 额外 Enter（确保提交）
sleep 1
tmux send-keys -t {pane_id} Enter
```

## 输出捕获

```bash
# 最后一屏
tmux capture-pane -t {pane_id} -p

# 带滚动历史
tmux capture-pane -t {pane_id} -p -S -50

# Strip ANSI codes
tmux capture-pane -t {pane_id} -p | sed 's/\x1b\[[0-9;]*m//g'
```

## Pane 管理

```bash
# 列出所有 pane
tmux list-panes -t {current_session} -F '#{pane_id} #{pane_current_command} #{pane_width}x#{pane_height}'

# 关闭 pane
tmux kill-pane -t {pane_id}
```

## Gate State 写入（通过 utility pane）

```bash
# 创建初始 gate-state.yaml
tmux send-keys -t {utility_pane} "cat > _bmad-output/implementation-artifacts/gate-state.yaml << 'GATE_EOF'
last_updated: \"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\"
batch_id: \"batch-$(date +%Y-%m-%d)-1\"
batch_stories: [\"{{story_id_1}}\", \"{{story_id_2}}\"]
gates:
  G1: { status: PASS, timestamp: \"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\", verified_by: commander, details: \"{{details}}\" }
story_gates: {}
story_states: {}
panes:
  utility: \"{{utility_pane}}\"
  inspector: \"{{inspector_pane}}\"
  inspector_state: idle
GATE_EOF" Enter

# 更新单个 gate（python YAML 安全写入）
tmux send-keys -t {utility_pane} "python3 -c \"
import yaml, datetime
path = '_bmad-output/implementation-artifacts/gate-state.yaml'
with open(path) as f: state = yaml.safe_load(f)
state['last_updated'] = datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S.000Z')
state['gates']['G{{N}}'] = {'status': 'PASS', 'timestamp': state['last_updated'], 'verified_by': '{{commander_or_inspector}}', 'details': '{{details}}'}
with open(path, 'w') as f: yaml.dump(state, f, default_flow_style=False, allow_unicode=True)
print('Gate G{{N}} recorded as PASS')
\"" Enter

# 写入 gate-report
tmux send-keys -t {utility_pane} "cat > _bmad-output/implementation-artifacts/gate-report-G{{N}}.md << 'REPORT_EOF'
# Gate Report G{{N}}
- Gate: G{{N}} ({{label}})
- Batch: {{batch_stories}}
- 提交时间: $(date -u +%Y-%m-%dT%H:%M:%S.000Z)

## 指挥官执行摘要
{{summary}}

## 磁盘状态断言
{{assertions}}
REPORT_EOF" Enter
```

## Session Journal 写入（通过 utility pane）

```bash
# 追加 dispatch_audit 条目
tmux send-keys -t {utility_pane} "python3 -c \"
import yaml, datetime
path = '_bmad-output/implementation-artifacts/session-journal.yaml'
try:
    with open(path) as f: data = yaml.safe_load(f) or {}
except FileNotFoundError:
    data = {'batch_id': '{{batch_id}}', 'entries': []}
entries = data.setdefault('entries', [])
seq = max((e.get('seq', 0) for e in entries), default=0) + 1
entries.append({
    'seq': seq,
    'timestamp': datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
    'type': '{{type}}',
    'story_id': '{{story_id}}',
    'phase': '{{phase}}',
    'llm': '{{llm}}',
    'auth': '{{auth}}',
    'constitution_check': 'PASS'
})
with open(path, 'w') as f: yaml.dump(data, f, default_flow_style=False, allow_unicode=True)
print(f'Journal entry #{seq} recorded')
\"" Enter
```
