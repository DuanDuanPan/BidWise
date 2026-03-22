# Pre-Dispatch Protocol

**定位：审计 trail 生成器，不是防线。** 每次向 sub-pane 派发任务前，写一条 dispatch_audit entry 到 session-journal。watchdog 和 inspector 通过审计 trail 发现违规。

**重要：** `dispatch_audit` 只表示“准备用这个参数派发”，不表示 worker 已经收到任务。真正的提交状态必须额外写入 `story_states[*].dispatch_state`。

## 步骤

1. 确认 dispatch 参数（内部决策，不需要打印 checklist）：
   - LLM: claude or codex — 符合 C2?（修复=claude，审查=codex，升级例外 cycle>=2）
   - AUTH: step 标注的 level
   - PANE: 新建 or 复用 — 如 review→fix 转换，必须新 pane（C2 不变量）

2. 确认本次 dispatch 的**实际目标 pane_id**：
   - `PANE = new` 时：先创建 pane，拿到 `work_pane_id`，但**还不要发送任务包**
   - `PANE = reuse` 时：直接使用现有 pane_id

3. 通过 utility_pane 写入 dispatch_audit entry（必须走 generation-guarded helper，且 `pane` 必须是真实 pane ID）：

```bash
current_generation="$("${STATE_CONTROL_HELPER}" get-generation "{project_root}")"
tmux send-keys -t {utility_pane} "\"${STATE_CONTROL_HELPER}\" append-dispatch-audit \"{project_root}\" \"${current_generation}\" \"{story_id}\" \"{phase}\" \"{llm}\" \"{auth}\" \"{actual_pane_id}\" \"{pane_reuse_reason}\" \"{PASS|FAIL}\" \"C2:{llm}/{phase}={OK|FAIL}, AUTH:{level}={OK|FAIL}, PANE:{new|reuse}={OK|FAIL}\"" Enter
```

4. 执行 dispatch
   - 多行任务包发给 Claude 时，先 paste，再单独发送 `Enter`
   - Paste 后立即记录 `dispatch_state = packet_pasted`
   - 只有在 pane 不再显示 `❯ [Pasted text #…]` 后，才记录 `dispatch_state = packet_submitted`

**FAIL 处理：** 如果 constitution_check 任一子项为 FAIL，不执行 dispatch，改为通过 helper 写 correction entry：

```bash
current_generation="$("${STATE_CONTROL_HELPER}" get-generation "{project_root}")"
tmux send-keys -t {utility_pane} "\"${STATE_CONTROL_HELPER}\" append-correction \"{project_root}\" \"${current_generation}\" \"self\" \"predispatch blocked\" \"C2\" \"rewrite dispatch with correct llm/auth/pane\" \"pre-dispatch\" \"{story_id}\"" Enter
```

Watchdog 和 inspector 将 correction 视为合法活动（不触发 predispatch_gap 告警）。

**注意：** 如果 session-journal 中存在与当前 story/phase 相关的 correction entry，应在决策时考虑。但不要求每次都物理 Read journal（step 转换时 GUARDS 已经 Read 过）。
