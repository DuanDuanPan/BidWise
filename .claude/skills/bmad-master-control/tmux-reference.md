# TMUX Commands Reference

**MECHANISM-ONLY:** 本文件是 gateway/helper 的实现与审计参考，不是指挥官的执行清单。
指挥官不得直接执行本文中的 raw `tmux split-window` / `new-window` 命令。
Top-layer layout bootstrap（`mc-inspector` / `mc-util` / `mc-bottom-anchor`）只能通过
`command-gateway.sh <project_root> <gen> BATCH select <story_csv>` 触发。

## 标准布局（上下两区）

```
┌──────────────┬─────────────┬──────────┐
│  Commander   │  Inspector  │   Util   │  ← 上半区（指挥控制层）
├──────────────┴─────────────┴──────────┤
│      Dev / Review panes（按需开启）    │  ← 下半区（工作层，灵活创建）
└────────────────────────────────────────┘
```

**创建顺序（F12 强制 — 先纵后横）：**
1. 先 Bottom Anchor: `-t {commander_pane} -v -l 40%`（预留全宽底部区域）
2. 再 Inspector: `-t {commander_pane} -h -l 55%`（上半区 commander 右侧）
3. 再 Utility: `-t {inspector_pane} -h -l 45%`（上半区 inspector 右侧）
4. Dev/Review panes: 第一个任务复用 `bottom_anchor`；后续任务从当前最右侧 bottom pane `-h` 分裂（下半区横向扩展）

**关键：所有 split 的 `-t` 目标必须是具体 pane ID（如 `%74`），禁止用 session 名。**
用 session 名时 tmux 会 split 当前活跃 pane，一旦焦点变化布局就错。

按需查阅。仅在 helper 实现、几何审计、incident 复盘时参考本文；指挥官不得把本文命令逐条手工执行。

推荐统一通过 helper 执行工作层操作：

```bash
TMUX_LAYOUT_HELPER="{project_root}/.claude/skills/bmad-master-control/tmux-layout.sh"
STATE_CONTROL_HELPER="{project_root}/.claude/skills/bmad-master-control/state-control.sh"
```

## Top-Layer Pane Titles

初始化完成后立即设置固定标题，禁止依赖主机名或 CLI 标题判断布局：

```bash
"${TMUX_LAYOUT_HELPER}" set-top-titles "{commander_pane}" "{inspector_pane}" "{utility_pane}"
```

## Bottom Work Layer Rules

- `bottom_anchor` 是下半区的第一个 pane，也是第一个工作 pane 的默认承载位
- **第一个**工作任务优先复用 `bottom_anchor`，不要先多切一个空 pane
- **后续**工作 pane 只能从当前最右侧 bottom pane 继续 `split-window -h`
- **禁止**在该 mixed window 上调用 `tmux select-layout ... even-horizontal`
- 每次 split / kill / resize 后都要重新做几何校验，不能靠肉眼判断

### 获取当前 bottom panes（按 left 从左到右排序）

Helper 内部已实现，无需手写。

### 打开工作 pane（始终从最右侧 bottom pane 横向分裂）

```bash
raw_output="$("${TMUX_LAYOUT_HELPER}" open-worker "{current_session}" "{commander_pane}" "{bottom_anchor}" "{pane_title}" "{path}" "{command}")"
work_pane_id="${raw_output#*:}"  # Strip REUSED: or CREATED: prefix
```

`open-worker` 输出格式为 `CREATED:<pane_id>` 或 `REUSED:<pane_id>`。调用方必须解析前缀以区分新建与复用。首个 worker 会直接占用 `bottom_anchor`；之后 `bottom_anchor` 仍表示“左下工作层锚点”的 pane ID，不要求标题始终保持 `mc-bottom-anchor`。

`find_existing_worker` 会对已有 pane 进行健康检查：自动清除死亡 pane（`pane_dead=1`）和回退到 shell 的空闲 pane。

## Bottom-Only Width Balancing

**目标：** 只调整下半区宽度，不触碰上半区几何。

```bash
"${TMUX_LAYOUT_HELPER}" rebalance-bottom "{current_session}" "{commander_pane}"
```

## Geometry Validation

每次布局变更后必须运行一次。输出必须带字段名，禁止使用无分隔符格式。

```bash
"${TMUX_LAYOUT_HELPER}" validate-work "{current_session}"
"${TMUX_LAYOUT_HELPER}" dump-geometry "{current_session}"
```

**必须同时满足：**

- `mc-commander` / `mc-inspector` / `mc-util` 的 `top=0`
- 任一 `mc-story-*` pane 的 `top > 0`
- 不允许出现 `mc-story-*` pane 的 `top=0`

若任一断言失败：立即 HALT 或销毁工作 pane 后按 F12 顺序重建。

## Sub-Pane 创建（工作层）

```bash
# Claude pane — strip REUSED:/CREATED: prefix
raw="$("${TMUX_LAYOUT_HELPER}" open-worker "{current_session}" "{commander_pane}" "{bottom_anchor}" "{pane_title}" "{path}" "claude --dangerously-skip-permissions" "{project_root}" "${current_generation}" "{story_id}")"
work_pane_id="${raw#*:}"

# Codex pane
raw="$("${TMUX_LAYOUT_HELPER}" open-worker "{current_session}" "{commander_pane}" "{bottom_anchor}" "{pane_title}" "{path}" "codex -c model_reasoning_summary_format=experimental --search --dangerously-bypass-approvals-and-sandbox")"
work_pane_id="${raw#*:}"
```

`open-worker` 内部已经执行 bottom-only balancing + geometry validation，不要再额外调用 `select-layout`。

**每个新建 pane 创建后必须立即启用 pipe-pane 日志：**
```bash
tmux pipe-pane -t {work_pane_id} -o 'cat >> {mc_log_dir}/pane-{work_pane_id}.log'
```

**Top-layer pane 也必须启用 pipe-pane，尤其是 commander：**
```bash
tmux pipe-pane -t {commander_pane} -o 'cat >> {mc_log_dir}/pane-{commander_pane}.log'
tmux pipe-pane -t {inspector_pane} -o 'cat >> {mc_log_dir}/pane-{inspector_pane}.log'
tmux pipe-pane -t {utility_pane} -o 'cat >> {mc_log_dir}/pane-{utility_pane}.log'
```

**恢复后重挂 logging：**
```bash
for pane in "{commander_pane}" "{inspector_pane}" "{utility_pane}" "{bottom_anchor}" $(tmux list-panes -t "{current_session}" -F '#{pane_title} #{pane_id}' | awk '/^mc-story-/{print $2}'); do
  [ -n "${pane}" ] || continue
  pane_num="${pane#%}"
  tmux pipe-pane -t "${pane}" -o "cat >> ${mc_log_dir}/pane-${pane_num}.log"
done
```

## 消息发送

```bash
# 发送任务到 pane
tmux send-keys -t {pane_id} '命令内容' Enter

# 多行任务包发给 Claude：先拿到真实 pane_id，写 dispatch_audit，再 paste + Enter
current_generation="$("${STATE_CONTROL_HELPER}" get-generation "{project_root}")"
tmux send-keys -t {utility_pane} "\"${STATE_CONTROL_HELPER}\" append-dispatch-audit \"{project_root}\" \"${current_generation}\" \"{story_id}\" \"{phase}\" \"{llm}\" \"{auth}\" \"{pane_id}\" \"{pane_reuse_reason}\" \"PASS\" \"{constitution_detail}\"" Enter
tmux send-keys -t {utility_pane} "\"${STATE_CONTROL_HELPER}\" mark-dispatch-state \"{project_root}\" \"${current_generation}\" \"{story_id}\" \"packet_pasted\"" Enter
tmux send-keys -t {pane_id} Enter

# 若仍停在 [Pasted text]，1s 后补一个 Enter；仍未消失则禁止前进 gate
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
# 创建初始 gate-state.yaml（带 generation / failover_epoch）
tmux send-keys -t {utility_pane} "\"${STATE_CONTROL_HELPER}\" init-batch-state \"{project_root}\" \"batch-$(date +%Y-%m-%d)-1\" \"{{story_id_1}},{{story_id_2}}\" \"{{utility_pane}}\" \"{{inspector_pane}}\" \"{{bottom_anchor}}\" \"{{details}}\" 0" Enter

# 读取当前 generation
current_generation="$("${STATE_CONTROL_HELPER}" get-generation "{project_root}")"

# 更新 batch gate（带 generation fencing）
tmux send-keys -t {utility_pane} "\"${STATE_CONTROL_HELPER}\" record-batch-gate \"{project_root}\" \"${current_generation}\" \"G{{N}}\" \"{{commander_or_inspector}}\" \"{{details}}\"" Enter

# 更新 story gate（带 generation fencing）
tmux send-keys -t {utility_pane} "\"${STATE_CONTROL_HELPER}\" record-story-gate \"{project_root}\" \"${current_generation}\" \"{{story_id}}\" \"G{{N}}\" \"{{commander_or_inspector}}\" \"{{details}}\"" Enter

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
# 追加 dispatch_audit 条目（带 generation fencing；pane 必须是真实 pane ID）
current_generation="$("${STATE_CONTROL_HELPER}" get-generation "{project_root}")"
tmux send-keys -t {utility_pane} "\"${STATE_CONTROL_HELPER}\" append-dispatch-audit \"{project_root}\" \"${current_generation}\" \"{{story_id}}\" \"{{phase}}\" \"{{llm}}\" \"{{auth}}\" \"{{pane_id}}\" \"{{pane_reuse_reason}}\" \"PASS\" \"{{constitution_detail}}\"" Enter

# 追加 correction 条目（带 generation fencing）
tmux send-keys -t {utility_pane} "\"${STATE_CONTROL_HELPER}\" append-correction \"{project_root}\" \"${current_generation}\" \"{{trigger}}\" \"{{description}}\" \"{{violated_rule}}\" \"{{correct_action}}\" \"{{step}}\" \"{{story_id}}\"" Enter

# 更新 story runtime 状态 / pane registry
tmux send-keys -t {utility_pane} "\"${STATE_CONTROL_HELPER}\" upsert-story-state \"{project_root}\" \"${current_generation}\" \"{{story_id}}\" \"phase={{phase}}\" \"current_llm={{llm}}\" \"dispatch_state={{dispatch_state}}\" \"pane.{{role}}={{pane_id_or_null}}\"" Enter

# 更新 dispatch_state（Step 3 recovery-safe）
tmux send-keys -t {utility_pane} "\"${STATE_CONTROL_HELPER}\" mark-dispatch-state \"{project_root}\" \"${current_generation}\" \"{{story_id}}\" \"task_acked\"" Enter

# 更新 inspector_state
tmux send-keys -t {utility_pane} "\"${STATE_CONTROL_HELPER}\" set-inspector-state \"{project_root}\" \"${current_generation}\" \"busy_audit\"" Enter

# 同步当前 session 的 top-layer pane IDs
tmux send-keys -t {utility_pane} "\"${STATE_CONTROL_HELPER}\" sync-runtime-panes \"{project_root}\" \"${current_generation}\" \"{{utility_pane}}\" \"{{inspector_pane}}\" \"{{bottom_anchor}}\"" Enter

# 清理已关闭 pane 的残留引用
tmux send-keys -t {utility_pane} "\"${STATE_CONTROL_HELPER}\" cleanup-stale-panes \"{project_root}\" \"${current_generation}\" \"{{current_session}}\"" Enter

# 从 watchdog pid / heartbeat 文件同步可观测状态
tmux send-keys -t {utility_pane} "\"${STATE_CONTROL_HELPER}\" sync-watchdog-from-files \"{project_root}\" \"${current_generation}\"" Enter
```
